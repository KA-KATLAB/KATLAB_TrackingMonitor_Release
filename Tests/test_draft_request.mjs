import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const frontendRequire = createRequire(resolve(root, "Frontend/package.json"));
const ts = frontendRequire("typescript");
const source = (file) => readFileSync(resolve(root, "Frontend/src", file), "utf8");
const url = (text) => `data:text/javascript;base64,${Buffer.from(text).toString("base64")}`;
const transpile = (file) => ts.transpileModule(source(file), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const apiUrl = url(transpile("api.ts"));
const api = await import(apiUrl);
const draft = await import(url(transpile("draft.ts")));
const runner = transpile("draftRequest.ts");
assert.equal((runner.match(/from ["']\.\/api["']/g) ?? []).length, 1);
const { runDraftCopy, draftCopyMessage } = await import(url(
  runner.replace(/from ["']\.\/api["']/, `from "${apiUrl}"`),
));

const event = (id, repo_id = "Repo_A", task_ref = null) => ({ id, repo_id, task_ref });
const rows = [event(1)];

async function withGlobal (name, descriptor, run) {
  const original = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable: true, ...descriptor });
  try { return await run(); }
  finally {
    if (original) Object.defineProperty(globalThis, name, original);
    else delete globalThis[name];
  }
}

function deferred () {
  let resolvePromise, rejectPromise;
  const promise = new Promise((resolve, reject) => { resolvePromise = resolve; rejectPromise = reject; });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

async function withClock (run) {
  let now = 0, nextId = 0;
  const timers = new Map();
  const window = {
    setTimeout(callback, delay) { const id = ++nextId; timers.set(id, { callback, at: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
  };
  const advance = (milliseconds) => {
    now += milliseconds;
    for (const [id, timer] of [...timers]) {
      if (timer.at <= now) { timers.delete(id); timer.callback(); }
    }
  };
  return withGlobal("window", { value: window }, () => run({ timers, advance }));
}

test("draft composition preserves identity, chronology, placeholders and immutable inputs", () => {
  const events = Object.freeze([event(5, "Repo_A", "stale"), event(4),
    event(3, "Repo_B", "same"), event(2, "Repo_A", "same"), event(1, "Repo_A", "same")]);
  const tasks = Object.freeze([{ repo: "Repo_B", task_ref: "same", title: "Wrong repo" },
    { repo: "Repo_A", task_ref: "same", title: "First mission" }]);
  assert.equal(draft.buildCommitDraft("Repo_A", events, tasks),
    "KATLAB Repo_A: vX.Y.Z.W - First mission + stale (+1 unattributed) - vX.Y.Z.W");
  assert.deepEqual(events.map(row => row.id), [5, 4, 3, 2, 1]);
  assert.equal(draft.buildCommitDraft("EA_Dev", [event(1, "EA_Dev")], []),
    "KATLAB EA: vX.Y.Z.W - (+1 unattributed) - vX.Y.Z.W");
});

test("draft subjects collapse whitespace without rewriting Unicode or quoted punctuation", () => {
  for (const gap of ["\n", "\r\n", "\t", "   ", "\u2028", "\u2029", "\u00a0", "\u202f", "\u2003"]) {
    const rawTitle = `  Add${gap}可靠${gap}"two${gap}words" + O'Brien /path:v5.9.0.0  `;
    const captured = Object.freeze([Object.freeze(event(1, "EA_Dev", "A.1"))]);
    const tasks = Object.freeze([Object.freeze({ repo: "EA_Dev", task_ref: "A.1", title: rawTitle })]);
    const before = structuredClone({ captured, tasks });
    const result = draft.buildCommitDraft("EA_Dev", captured, tasks);
    assert.equal(result,
      'KATLAB EA: vX.Y.Z.W - Add 可靠 "two words" + O\'Brien /path:v5.9.0.0 - vX.Y.Z.W');
    assert.equal((result.match(/vX\.Y\.Z\.W/g) ?? []).length, 2);
    assert.deepEqual({ captured, tasks }, before);
    assert.equal(tasks[0].title, rawTitle);
  }
});

test("draft display collisions never change raw-ref lookup, deduplication or first-touch order", () => {
  const firstRef = "task\nA";
  const secondRef = "task A";
  const staleRef = "stale\r\n\tmission";
  const captured = Object.freeze([
    event(8, "Repo_A", secondRef), event(7), event(6, "Repo_B", firstRef),
    event(5, "Repo_A", staleRef), event(4, "Repo_A", secondRef), event(3),
    event(2, "Repo_A", firstRef), event(1, "Repo_A", firstRef),
  ].map(Object.freeze));
  const tasks = Object.freeze([
    { repo: "Repo_B", task_ref: firstRef, title: "Wrong repo" },
    { repo: "Repo_A", task_ref: firstRef, title: "First\nmission" },
    { repo: "Repo_A", task_ref: secondRef, title: "First mission" },
  ].map(Object.freeze));
  const before = structuredClone({ captured, tasks });
  assert.equal(draft.buildCommitDraft("Repo_A", captured, tasks),
    "KATLAB Repo_A: vX.Y.Z.W - First mission + First mission + stale mission (+2 unattributed) - vX.Y.Z.W");
  assert.deepEqual({ captured, tasks }, before);
  assert.deepEqual(captured.map((row) => row.id), [8, 7, 6, 5, 4, 3, 2, 1]);
  assert.equal(tasks[1].task_ref, firstRef);
  assert.equal(tasks[2].task_ref, secondRef);
  assert.equal(draft.buildCommitDraft("Repo_C", captured, tasks), "");
});

test("ordinary single-line, empty and all-unattributed draft cases stay exact", () => {
  const captured = Object.freeze([Object.freeze(event(1, "Repo_A", "A.1"))]);
  const tasks = Object.freeze([Object.freeze({ repo: "Repo_A", task_ref: "A.1", title: "Keep café + O'Brien: [x]" })]);
  assert.equal(draft.buildCommitDraft("Repo_A", captured, tasks),
    "KATLAB Repo_A: vX.Y.Z.W - Keep café + O'Brien: [x] - vX.Y.Z.W");
  assert.equal(draft.buildCommitDraft("Repo_A", Object.freeze([]), tasks), "");
  assert.equal(draft.buildCommitDraft("Repo_B", captured, tasks), "");
  const unattributed = Object.freeze([Object.freeze(event(2)), Object.freeze(event(1))]);
  assert.equal(draft.buildCommitDraft("Repo_A", unattributed, Object.freeze([])),
    "KATLAB Repo_A: vX.Y.Z.W - (+2 unattributed) - vX.Y.Z.W");
});

test("copy writes the normalized subject once in the same stack without fetching or reading", async () => {
  const captured = Object.freeze([Object.freeze(event(1, "EA_Dev", "A.1"))]);
  const tasks = Object.freeze([Object.freeze({ repo: "EA_Dev", task_ref: "A.1", title: "Keep\r\n  café\t'quoted  words'" })]);
  const before = structuredClone({ captured, tasks });
  const pending = deferred();
  const calls = [];
  let fetchCalls = 0, readCalls = 0;
  const clipboard = {
    writeText (text) { calls.push({ text, receiver: this }); return pending.promise; },
    readText () { readCalls += 1; throw new Error("must not read clipboard"); },
    read () { readCalls += 1; throw new Error("must not read clipboard"); },
  };
  await withGlobal("fetch", { value() { fetchCalls += 1; throw new Error("must not fetch"); } }, async () => {
    await withGlobal("navigator", { value: { clipboard } }, async () => {
      const running = draft.copyCommitDraft("EA_Dev", captured, tasks);
      assert.equal(calls.length, 1, "write invocation precedes returning to the click caller");
      assert.equal(calls[0].receiver, clipboard);
      pending.resolve();
      assert.equal(await running, "copied");
      assert.equal(calls[0].text, "KATLAB EA: vX.Y.Z.W - Keep café 'quoted words' - vX.Y.Z.W");
      assert.equal(calls.length, 1);
      assert.equal(fetchCalls, 0);
      assert.equal(readCalls, 0);
      assert.deepEqual({ captured, tasks }, before);
    });
  });
});

test("dirty repo absent from captured page is empty without touching clipboard", async () => {
  const captured = Array.from({ length: 500 }, (_, index) => event(501 - index));
  await withGlobal("navigator", { get() { throw new Error("must not inspect clipboard"); } }, async () => {
    assert.equal(await draft.copyCommitDraft("Repo_B", captured, []), "empty");
  });
});

test("missing capabilities and throwing getters have distinct truthful outcomes", async () => {
  for (const value of [undefined, {}, { clipboard: {} }, { clipboard: { writeText: false } }]) {
    await withGlobal("navigator", { value }, async () => {
      assert.equal(await draft.copyCommitDraft("Repo_A", rows, []), "unavailable");
    });
  }
  await withGlobal("navigator", { get() { throw new Error("denied"); } }, async () => {
    assert.equal(await draft.copyCommitDraft("Repo_A", rows, []), "failed");
  });
  await withGlobal("navigator", { value: { get clipboard() { throw new Error("denied"); } } }, async () => {
    assert.equal(await draft.copyCommitDraft("Repo_A", rows, []), "failed");
  });
  await withGlobal("navigator", { value: { clipboard: { get writeText() { throw new Error("denied"); } } } }, async () => {
    assert.equal(await draft.copyCommitDraft("Repo_A", rows, []), "failed");
  });
});

test("native write starts synchronously once with its receiver and captured text", async () => {
  let calls = 0;
  const pending = deferred();
  const clipboard = { writeText(text) {
    assert.equal(this, clipboard);
    assert.equal(text, draft.buildCommitDraft("Repo_A", rows, []));
    calls += 1;
    return pending.promise;
  } };
  await withGlobal("navigator", { value: { clipboard } }, async () => {
    const result = draft.copyCommitDraft("Repo_A", rows, []);
    assert.equal(calls, 1, "native invocation must precede return to the click caller");
    pending.resolve();
    assert.equal(await result, "copied");
    assert.equal(calls, 1);
  });
});

test("synchronous and asynchronous write failures never claim copied or denied", async () => {
  for (const writeText of [() => { throw new Error("private text"); }, () => Promise.reject(new Error("private text"))]) {
    await withGlobal("navigator", { value: { clipboard: { writeText } } }, async () => {
      assert.equal(await draft.copyCommitDraft("Repo_A", rows, []), "failed");
    });
  }
});

test("runner starts copy in the same stack and preserves each actual outcome", async () => {
  await withClock(async ({ timers }) => {
    for (const outcome of ["copied", "empty", "unavailable", "failed"]) {
      const events = [];
      const action = api.createActionDeadline();
      const result = runDraftCopy({ action, copy: () => { events.push("started"); return Promise.resolve(outcome); },
        isCurrent: () => true, onResult: value => events.push(value), onSettled: () => events.push("settled") });
      assert.deepEqual(events, ["started"]);
      await result;
      assert.deepEqual(events, ["started", outcome, "settled"]);
      assert.equal(timers.size, 0);
    }
  });
});

test("shared deadline releases observation once and ignores late native fulfillment", async () => {
  await withClock(async ({ timers, advance }) => {
    const pending = deferred();
    const events = [];
    const action = api.createActionDeadline();
    const running = runDraftCopy({ action, copy: () => pending.promise, isCurrent: () => true,
      onResult: value => events.push(value), onSettled: () => events.push("settled") });
    advance(9_999); await Promise.resolve(); assert.deepEqual(events, []);
    advance(1); await running;
    assert.deepEqual(events, ["timed-out", "settled"]);
    assert.equal(action.didTimeout(), true);
    assert.equal(timers.size, 0);
    pending.resolve("copied"); await Promise.resolve(); await Promise.resolve();
    assert.deepEqual(events, ["timed-out", "settled"]);
  });
});

test("late rejection after timeout is handled without a second outcome", async () => {
  await withClock(async ({ advance }) => {
    const pending = deferred();
    const events = [];
    const action = api.createActionDeadline();
    const running = runDraftCopy({ action, copy: () => pending.promise, isCurrent: () => true,
      onResult: value => events.push(value), onSettled() {} });
    advance(10_000); await running;
    pending.reject(new Error("late native rejection"));
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(events, ["timed-out"]);
  });
});

test("pre-aborted and stale owners never start copy or publish results", async () => {
  await withClock(async ({ timers }) => {
    for (const current of [false, true]) {
      const action = api.createActionDeadline();
      if (current) action.controller.abort();
      let calls = 0, settled = 0;
      await runDraftCopy({ action, copy: () => { calls += 1; return Promise.resolve("copied"); },
        isCurrent: () => current, onResult: () => { throw new Error("unexpected result"); },
        onSettled: () => { settled += 1; } });
      assert.equal(calls, 0);
      assert.equal(settled, current ? 1 : 0);
      assert.equal(timers.size, 0);
    }
  });
});

test("scope change, supersession and unmount silence old results and owner release", async () => {
  await withClock(async ({ timers }) => {
    for (const reason of ["scope", "supersede", "unmount"]) {
      const pending = deferred();
      const action = api.createActionDeadline();
      let current = true;
      const events = [];
      const running = runDraftCopy({ action, copy: () => pending.promise, isCurrent: () => current,
        onResult: value => events.push(value), onSettled: () => events.push("settled") });
      current = false; action.controller.abort(); await running;
      pending.resolve("copied"); await Promise.resolve();
      assert.deepEqual(events, [], reason);
      assert.equal(timers.size, 0);
    }
  });
});

test("handlers precede synchronous abort/rejection and copy throws map to failed", async () => {
  await withClock(async ({ timers }) => {
    const action = api.createActionDeadline();
    const events = [];
    await runDraftCopy({ action, copy: () => {
      action.controller.abort(); return Promise.reject(new Error("rejected during abort"));
    }, isCurrent: () => true, onResult: value => events.push(value), onSettled: () => events.push("settled") });
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(events, ["settled"]);
    await runDraftCopy({ action: api.createActionDeadline(), copy: () => { throw new Error("sync"); },
      isCurrent: () => true, onResult: value => events.push(value), onSettled() {} });
    assert.deepEqual(events, ["settled", "failed"]);
    assert.equal(timers.size, 0);
  });
});

test("callback defects are not relabeled as native copy failures", async () => {
  await withClock(async ({ timers }) => {
    let settled = 0;
    await assert.rejects(runDraftCopy({ action: api.createActionDeadline(), copy: () => Promise.resolve("copied"),
      isCurrent: () => true, onResult: () => { throw new Error("callback defect"); },
      onSettled: () => { settled += 1; } }), /callback defect/);
    assert.equal(settled, 1);
    assert.equal(timers.size, 0);
  });
});

test("SSR feedback is visible, specific, escaped and not a second live region", async () => {
  const { createServer } = await import(pathToFileURL(frontendRequire.resolve("vite")).href);
  const vite = await createServer({ root: resolve(root, "Frontend"),
    server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom",
    optimizeDeps: { noDiscovery: true, entries: [] } });
  try {
    const { DraftFeedback } = await vite.ssrLoadModule("/src/draftFeedback.tsx");
    const React = frontendRequire("react");
    const { renderToStaticMarkup } = frontendRequire("react-dom/server");
    for (const result of ["copied", "empty", "unavailable", "failed", "timed-out"]) {
      const html = renderToStaticMarkup(React.createElement(DraftFeedback, {
        repo: "Repo_<img src=x>", result, onDismiss() {},
      }));
      assert.match(html, /Repo_&lt;img src=x&gt;/);
      if (result === "copied") {
        assert.doesNotMatch(html, /<button|Dismiss|tabindex|role="region"/);
        assert.match(html, /line-clamp-2/);
        assert.ok(draftCopyMessage("Repo_A", result).startsWith("Commit draft copied"));
      } else {
        assert.match(html, /Dismiss commit draft feedback/);
        assert.match(html, /role="region" aria-label="Commit draft result details" tabindex="0"/);
        assert.match(html, /max-h-\[min\(8rem,25dvh\)\] overflow-y-auto/);
        assert.ok(draftCopyMessage("Repo_A", result).startsWith("Commit draft for Repo_A:"));
      }
      assert.match(html, /overflow-wrap:anywhere/);
      assert.doesNotMatch(html, /<img|aria-live|role="status"|hidden|clipboard blocked/);
      if (result === "empty") assert.match(html, /current fetched window/);
      if (result === "timed-out") assert.match(html, /browser may still finish/);
    }
  } finally { await vite.close(); }
});

test("App statically wires global ownership, scope identity and persistent feedback", () => {
  // Static wiring only; no browser clipboard, React effects or focus interaction executed.
  const app = source("App.tsx");
  assert.match(app, /draftScopeRef\.current = currentScopeKey;/);
  assert.match(app, /draftOwnerRef\.current === owner\s*&& draftScopeRef\.current === owner\.scopeKey/);
  assert.match(app, /draftOwnerRef\.current = null;\s*owner\?\.action\.controller\.abort\(\)/);
  assert.match(app, /owner && owner\.scopeKey !== currentScopeKey/);
  assert.match(app, /disabled=\{draftBusyRepo !== null\}/);
  assert.match(app, /draftBusyRepo === r\.id \? "copying…" : draftBusyRepo !== null \? "copying elsewhere" : "draft 📋"/);
  assert.match(app, /disabledReason: draftBusyRepo !== null/);
  assert.match(app, /if \(result === "copied"\) \{\s*draftNoteTimerRef\.current = window\.setTimeout/);
  assert.match(app, /current\?\.n === n \? null : current/);
  assert.match(app, /<DraftFeedback repo=\{draftNote\.repo\} result=\{draftNote\.result\}/);
  assert.match(app, /onDismiss=\{\(\) => \{\s*setDraftNote\(null\);\s*mainRef\.current\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(app, /announceStatus\(`Copying commit draft for \$\{repoId\}\.\`\)/);
  assert.doesNotMatch(app, /draftBusyRepos|clipboard blocked/);
});
