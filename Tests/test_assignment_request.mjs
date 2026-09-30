import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const frontendRequire = createRequire(resolve(root, "Frontend/package.json"));
const ts = frontendRequire("typescript");

function transpile (name) {
  const source = readFileSync(resolve(root, "Frontend/src", name), "utf8");
  return ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}
function dataUrl (source) {
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}
const apiUrl = dataUrl(transpile("api.ts"));
const api = await import(apiUrl);
const runnerSource = transpile("assignmentRequest.ts");
const apiImports = runnerSource.match(/from ["']\.\/api["']/g) ?? [];
assert.equal(apiImports.length, 1, "runner must reuse the existing action helpers");
const { runAssignmentRequest, assignmentFailureMessage } = await import(dataUrl(
  runnerSource.replace(apiImports[0], `from "${apiUrl}"`),
));

function deferred () {
  let resolvePromise;
  let rejectPromise;
  const promise = new Promise((resolveValue, rejectValue) => {
    resolvePromise = resolveValue;
    rejectPromise = rejectValue;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

function fakeClock () {
  let now = 0;
  let nextHandle = 1;
  const timers = new Map();
  const window = {
    setTimeout(callback, delay) {
      const handle = nextHandle++;
      timers.set(handle, { at: now + delay, callback });
      return handle;
    },
    clearTimeout(handle) { timers.delete(handle); },
  };
  function advance (duration) {
    const end = now + duration;
    while (true) {
      const next = [...timers.entries()]
        .filter(([, timer]) => timer.at <= end)
        .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!next) break;
      now = next[1].at;
      timers.delete(next[0]);
      next[1].callback();
    }
    now = end;
  }
  return { window, timers, advance };
}

async function withGlobal (name, descriptor, run) {
  const original = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable: true, ...descriptor });
  try {
    return await run();
  } finally {
    if (original) Object.defineProperty(globalThis, name, original);
    else delete globalThis[name];
  }
}

async function withClock (run) {
  const clock = fakeClock();
  return withGlobal("window", { value: clock.window }, () => run(clock));
}

async function flush () {
  for (let index = 0; index < 8; index++) await Promise.resolve();
}

function callbacks (action, request, owner = () => true) {
  const events = [];
  const options = {
    action, request, isCurrent: owner,
    onSuccess() { events.push("success"); },
    onFailure(message) { events.push(["failure", message]); },
    onSettled() { events.push("settled"); },
  };
  return { options, events };
}

test("acknowledged PATCH accepts once, keeps signal identity and runner settlement order", async () => {
  await withClock(async (clock) => {
    const pending = deferred();
    const action = api.createActionDeadline();
    let requests = 0;
    const { options, events } = callbacks(action, (signal) => {
      requests++;
      assert.equal(signal, action.signal);
      return pending.promise;
    });
    const run = runAssignmentRequest(options);
    await flush();
    assert.equal(requests, 1);
    pending.resolve({ assignment_id: 7 });
    await run;
    assert.deepEqual(events, ["success", "settled"]);
    assert.equal(clock.timers.size, 0);
    clock.advance(30_000);
    assert.equal(requests, 1);
    assert.deepEqual(events, ["success", "settled"]);
  });
});

test("network rejection and synchronous throw report bounded unknown outcome", async () => {
  await withClock(async (clock) => {
    for (const kind of ["reject", "throw"]) {
      const action = api.createActionDeadline();
      const error = new Error("x".repeat(400));
      const request = kind === "throw"
        ? () => { throw error; }
        : () => Promise.reject(error);
      const { options, events } = callbacks(action, request);
      await runAssignmentRequest(options);
      assert.equal(events.length, 2);
      assert.equal(events[0][0], "failure");
      assert.match(events[0][1], /Evidence assignment could not be confirmed:/);
      assert.match(events[0][1], /server may have saved the change/i);
      assert.match(events[0][1], /Close and refresh Mission to verify before retrying/);
      assert.ok(!events[0][1].includes("x".repeat(121)));
      assert.equal(events[1], "settled");
      assert.equal(clock.timers.size, 0);
    }
  });
});

test("an AbortError without owner cancellation is an unconfirmed failure", async () => {
  await withClock(async (clock) => {
    const action = api.createActionDeadline();
    const { options, events } = callbacks(action, () => Promise.reject(api.abortError()));
    await runAssignmentRequest(options);
    assert.equal(action.signal.aborted, false);
    assert.equal(events[0][0], "failure");
    assert.match(events[0][1], /Evidence assignment could not be confirmed:/);
    assert.match(events[0][1], /server may have saved the change/i);
    assert.equal(events[1], "settled");
    assert.equal(clock.timers.size, 0);
  });
});

test("actual deadline settles an uncooperative PATCH without retrying it", async () => {
  await withClock(async (clock) => {
    const pending = deferred();
    const action = api.createActionDeadline();
    let requests = 0;
    const { options, events } = callbacks(action, () => {
      requests++;
      return pending.promise;
    });
    const run = runAssignmentRequest(options);
    await flush();
    assert.equal(requests, 1);
    clock.advance(9_999);
    assert.deepEqual(events, []);
    clock.advance(1);
    await run;
    assert.equal(action.didTimeout(), true);
    assert.equal(action.signal.aborted, true);
    assert.equal(events[0][0], "failure");
    assert.match(events[0][1], /timed out after 10 seconds/);
    assert.match(events[0][1], /server may have saved the change/i);
    assert.equal(events[1], "settled");
    assert.equal(clock.timers.size, 0);
    pending.resolve({ assignment_id: 7 });
    await flush();
    clock.advance(30_000);
    assert.equal(requests, 1);
    assert.equal(events.length, 2);
  });
});

test("late transport rejection after timeout cannot publish a second failure", async () => {
  await withClock(async (clock) => {
    const pending = deferred();
    const action = api.createActionDeadline();
    const { options, events } = callbacks(action, () => pending.promise);
    const run = runAssignmentRequest(options);
    await flush();
    clock.advance(10_000);
    await run;
    assert.equal(events[0][0], "failure");
    assert.equal(events[1], "settled");
    pending.reject(new Error("late transport failure"));
    await flush();
    assert.equal(events.length, 2);
    assert.equal(clock.timers.size, 0);
  });
});

test("close intent before deferred transport starts prevents any PATCH", async () => {
  await withClock(async (clock) => {
    const action = api.createActionDeadline();
    let current = true;
    let requests = 0;
    const { options, events } = callbacks(action, () => {
      requests++;
      return Promise.resolve({ assignment_id: 7 });
    }, () => current);
    const run = runAssignmentRequest(options);
    current = false; // close handler revokes ownership before passive unmount
    action.controller.abort();
    await run;
    assert.equal(requests, 0);
    assert.deepEqual(events, []);
    assert.equal(clock.timers.size, 0);
  });
});

test("close after transport starts silences late success and ordinary failure", async () => {
  await withClock(async (clock) => {
    for (const late of ["resolve", "reject"]) {
      const pending = deferred();
      const action = api.createActionDeadline();
      let current = true;
      const { options, events } = callbacks(action, () => pending.promise, () => current);
      const run = runAssignmentRequest(options);
      await flush();
      current = false; // close intent happens before effect cleanup
      action.controller.abort();
      if (late === "resolve") pending.resolve({ assignment_id: 7 });
      else pending.reject(new Error("late network error"));
      await run;
      assert.deepEqual(events, []);
      assert.equal(clock.timers.size, 0);
    }
  });
});

test("superseded old action cannot settle or unlock the new owner", async () => {
  await withClock(async (clock) => {
    const oldPending = deferred();
    const newPending = deferred();
    const oldAction = api.createActionDeadline();
    let activeAction = oldAction;
    const old = callbacks(oldAction, () => oldPending.promise,
      () => activeAction === oldAction);
    const oldRun = runAssignmentRequest(old.options);
    await flush();
    const newAction = api.createActionDeadline();
    activeAction = newAction;
    const current = callbacks(newAction, () => newPending.promise,
      () => activeAction === newAction);
    const newRun = runAssignmentRequest(current.options);
    await flush();
    oldPending.reject(new Error("old action failed"));
    await oldRun;
    assert.deepEqual(old.events, []);
    assert.equal(activeAction, newAction);
    assert.deepEqual(current.events, []);
    newPending.resolve({ assignment_id: 8 });
    await newRun;
    assert.deepEqual(current.events, ["success", "settled"]);
    assert.equal(clock.timers.size, 0);
  });
});

test("a success callback defect is not misreported as PATCH failure", async () => {
  await withClock(async (clock) => {
    const action = api.createActionDeadline();
    const events = [];
    const run = runAssignmentRequest({
      action, request: () => Promise.resolve({ assignment_id: 7 }),
      isCurrent: () => true,
      onSuccess() { throw new Error("refresh callback defect"); },
      onFailure(message) { events.push(["failure", message]); },
      onSettled() { events.push("settled"); },
    });
    await assert.rejects(run, /refresh callback defect/);
    assert.deepEqual(events, ["settled"]);
    assert.equal(clock.timers.size, 0);
  });
});

test("failure formatter is bounded and never claims rollback", () => {
  const error = assignmentFailureMessage(new Error("x".repeat(400)), false);
  const timeout = assignmentFailureMessage(new Error("ignored"), true);
  for (const message of [error, timeout]) {
    assert.match(message, /server may have saved the change/i);
    assert.match(message, /Close and refresh Mission to verify before retrying/);
    assert.doesNotMatch(message, /not saved|rolled back|safe to retry/i);
  }
  assert.ok(!error.includes("x".repeat(121)));
  assert.match(timeout, /timed out after 10 seconds/);
});

test("assign and clear API calls send only controlled payloads and preserve envelope", async () => {
  const calls = [];
  await withGlobal("fetch", { value: async (url, init) => {
    calls.push({ url, init });
    return { ok: true, json: async () => ({
      success: true, data: { assignment_id: calls.length },
    }) };
  } }, async () => {
    const signal = new AbortController().signal;
    assert.deepEqual(await api.api.assignEvidence(
      17, "EA_Dev", "temp/Main_EA/PLAN_X.txt", signal,
    ), { assignment_id: 1 });
    assert.deepEqual(await api.api.assignEvidence(17, "EA_Dev", null, signal),
      { assignment_id: 2 });
    assert.equal(calls.length, 2);
    for (const call of calls) {
      assert.equal(call.url, "/api/activity/17/plan");
      assert.equal(call.init.method, "PATCH");
      assert.equal(call.init.signal, signal);
      assert.equal(call.init.headers["Content-Type"], "application/json");
    }
    assert.deepEqual(JSON.parse(calls[0].init.body), {
      repo: "EA_Dev", plan_file: "temp/Main_EA/PLAN_X.txt",
    });
    assert.deepEqual(JSON.parse(calls[1].init.body), {
      repo: "EA_Dev", plan_file: null,
    });
  });
});

test("SSR feedback is local, honest while busy, visible on failure, and escaped", {
  timeout: 30_000,
}, async () => {
  const React = frontendRequire("react");
  const { renderToStaticMarkup } = frontendRequire("react-dom/server");
  const { createServer } = await import(pathToFileURL(frontendRequire.resolve("vite")).href);
  const vite = await createServer({
    root: resolve(root, "Frontend"),
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
    optimizeDeps: { noDiscovery: true, entries: [] },
  });
  try {
    const { AssignmentFeedback } = await vite.ssrLoadModule(
      "/src/assignmentFeedback.tsx",
    );
    const render = (busy, error) => renderToStaticMarkup(
      React.createElement(AssignmentFeedback, { busy, error }),
    );
    const initial = render(false, "");
    const busy = render(true, "");
    const retryPending = render(true, "Earlier error");
    const error = assignmentFailureMessage("<script>alert(1)</script>", false);
    const failed = render(false, error);
    for (const html of [initial, busy, retryPending, failed]) {
      assert.equal((html.match(/role="status"/g) ?? []).length, 1);
      assert.match(html, /role="status" aria-live="polite" aria-atomic="true"/);
      assert.doesNotMatch(html, /<p role="status"[^>]*aria-busy/);
    }
    const visibleParagraphs = (html) => [...html.matchAll(/<p([^>]*)>([\s\S]*?)<\/p>/g)]
      .filter(([, attributes]) => !attributes.includes('class="sr-only"'));
    assert.equal(visibleParagraphs(initial).length, 0);
    assert.equal(visibleParagraphs(busy).length, 1);
    assert.equal(visibleParagraphs(retryPending).length, 1);
    assert.equal(visibleParagraphs(failed).length, 1);
    assert.match(visibleParagraphs(busy)[0][2], /Closing may not cancel a submitted change/);
    assert.match(visibleParagraphs(failed)[0][2], /Close and refresh Mission/);
    assert.doesNotMatch(initial, /saved|succeeded|failed/i);
    assert.match(busy, /Closing may not cancel a submitted change/);
    assert.match(busy, /Refresh Mission to verify before retrying/);
    assert.doesNotMatch(busy, /saved|succeeded/i);
    assert.match(retryPending, /Closing may not cancel a submitted change/);
    assert.doesNotMatch(retryPending, /Earlier error|saved|succeeded/i);
    assert.match(failed, /server may have saved the change/i);
    assert.match(failed, /Close and refresh Mission to verify before retrying/);
    assert.match(failed, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.doesNotMatch(failed, /<script>/);
  } finally {
    await vite.close();
  }
});
