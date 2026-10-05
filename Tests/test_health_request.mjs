import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const frontendRequire = createRequire(resolve(root, "Frontend/package.json"));
const ts = frontendRequire("typescript");

async function loadTypeScript (name) {
  const source = readFileSync(resolve(root, "Frontend/src", name), "utf8");
  let emitted = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  if (name === "healthRequest.ts") {
    const model = ts.transpileModule(readFileSync(resolve(root, "Frontend/src/healthModel.ts"), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    emitted = emitted.replace('"./healthModel"',
      JSON.stringify(`data:text/javascript;base64,${Buffer.from(model).toString("base64")}`));
  }
  return import(`data:text/javascript;base64,${Buffer.from(emitted).toString("base64")}`);
}

const { startHealthRequest } = await loadTypeScript("healthRequest.ts");
const { api, createActionDeadline } = await loadTypeScript("api.ts");

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
  for (let index = 0; index < 6; index++) await Promise.resolve();
}

const payload = { server: { version: "0.3.1.6", started_ts: "2026-09-30T00:00:00Z",
  db_bytes: null, watchers_alive: 0, watchers_total: 0,
  hook_registered: false, hook_settings_path: "" }, repos: [] };

test("malformed success settles once with a static error; late malformed values are ignored", async () => {
  await withClock(async (clock) => {
    const results = [];
    const action = createActionDeadline();
    const stop = startHealthRequest({ action, request: async () => ({ server: null, secret: "do-not-echo" }),
      onResult: result => results.push(result) });
    await flush();
    assert.deepEqual(results, [{ ok: false,
      error: "System health response is invalid. Retry to request a new snapshot." }]);
    assert.equal(clock.timers.size, 0);
    stop();
    assert.equal(action.signal.aborted, false);
    for (const cancel of [false, true]) {
      const pending = deferred();
      const lateResults = [];
      const lateAction = createActionDeadline();
      const cleanup = startHealthRequest({ action: lateAction, request: () => pending.promise,
        onResult: result => lateResults.push(result) });
      if (cancel) cleanup();
      else clock.advance(10_000);
      pending.resolve(null);
      await flush();
      assert.equal(lateResults.length, cancel ? 0 : 1);
      if (!cancel) assert.match(lateResults[0].error, /timed out/);
      assert.equal(clock.timers.size, 0);
      cleanup();
    }
  });
});

test("one request forwards the exact signal, accepts once, and releases its timer", async () => {
  await withClock(async (clock) => {
    const pending = deferred();
    const results = [];
    const action = createActionDeadline();
    let receivedSignal;
    const stop = startHealthRequest({
      action,
      request(signal) { receivedSignal = signal; return pending.promise; },
      onResult(result) { results.push(result); },
    });
    assert.equal(receivedSignal, action.signal);
    assert.equal(clock.timers.size, 1);
    pending.resolve(payload);
    await flush();
    assert.deepEqual(results, [{ ok: true, data: payload }]);
    assert.equal(clock.timers.size, 0);
    stop();
    clock.advance(60_000);
    assert.equal(action.signal.aborted, false);
    assert.equal(results.length, 1);
  });
});

test("rejection and synchronous throw become bounded errors without a second result", async () => {
  await withClock(async (clock) => {
    for (const kind of ["reject", "throw"]) {
      const results = [];
      const action = createActionDeadline();
      const error = new Error("x".repeat(400));
      const request = kind === "throw"
        ? () => { throw error; }
        : () => Promise.reject(error);
      const stop = startHealthRequest({ action, request,
        onResult(result) { results.push(result); } });
      await flush();
      assert.equal(results.length, 1);
      assert.equal(results[0].ok, false);
      assert.match(results[0].error, /^System health failed: Error: x/);
      assert.ok(results[0].error.length <= "System health failed: ".length + 120);
      assert.equal(clock.timers.size, 0);
      stop();
    }
  });
});

test("the actual 10-second deadline settles an uncooperative transport", async () => {
  await withClock(async (clock) => {
    const pending = deferred();
    const results = [];
    const action = createActionDeadline();
    const stop = startHealthRequest({ action, request: () => pending.promise,
      onResult(result) { results.push(result); } });
    clock.advance(9_999);
    assert.deepEqual(results, []);
    assert.equal(action.signal.aborted, false);
    clock.advance(1);
    assert.equal(action.signal.aborted, true);
    assert.equal(action.didTimeout(), true);
    assert.deepEqual(results, [{
      ok: false, error: "System health timed out after 10 seconds.",
    }]);
    assert.equal(clock.timers.size, 0);
    pending.resolve(payload);
    await flush();
    assert.equal(results.length, 1);
    stop();
  });
});

test("cleanup is idempotent, silently aborts, and ignores late resolve/reject", async () => {
  await withClock(async (clock) => {
    for (const late of ["resolve", "reject"]) {
      const pending = deferred();
      const results = [];
      const action = createActionDeadline();
      const stop = startHealthRequest({ action, request: () => pending.promise,
        onResult(result) { results.push(result); } });
      stop();
      stop();
      assert.equal(action.signal.aborted, true);
      assert.equal(action.didTimeout(), false);
      assert.equal(clock.timers.size, 0);
      if (late === "resolve") pending.resolve(payload);
      else pending.reject(new Error("late failure"));
      await flush();
      clock.advance(30_000);
      assert.deepEqual(results, []);
    }
  });
});

test("a pre-aborted owner cannot start transport or publish", async () => {
  await withClock(async (clock) => {
    const action = createActionDeadline();
    action.controller.abort();
    let called = false;
    const results = [];
    const stop = startHealthRequest({ action,
      request() { called = true; return Promise.resolve(payload); },
      onResult(result) { results.push(result); },
    });
    stop();
    assert.equal(called, false);
    assert.deepEqual(results, []);
    assert.equal(clock.timers.size, 0);
  });
});

test("retry uses a new owner; the old timed-out response cannot affect it", async () => {
  await withClock(async (clock) => {
    const oldPending = deferred();
    const newPending = deferred();
    const oldResults = [];
    const newResults = [];
    const oldAction = createActionDeadline();
    const stopOld = startHealthRequest({ action: oldAction,
      request: () => oldPending.promise,
      onResult(result) { oldResults.push(result); },
    });
    clock.advance(10_000);
    assert.equal(oldResults[0].ok, false);
    const newAction = createActionDeadline();
    const stopNew = startHealthRequest({ action: newAction,
      request(signal) {
        assert.equal(signal, newAction.signal);
        assert.notEqual(signal, oldAction.signal);
        return newPending.promise;
      },
      onResult(result) { newResults.push(result); },
    });
    stopOld();
    oldPending.reject(new Error("old transport rejected"));
    await flush();
    assert.equal(oldResults.length, 1);
    assert.deepEqual(newResults, []);
    newPending.resolve(payload);
    await flush();
    assert.deepEqual(newResults, [{ ok: true, data: payload }]);
    assert.equal(clock.timers.size, 0);
    stopNew();
  });
});

test("health fetch alone uses no-store and preserves the API envelope", async () => {
  const calls = [];
  await withGlobal("fetch", { value: async (url, init) => {
    calls.push({ url, init });
    return { ok: true, json: async () => ({ success: true, data: payload }) };
  } }, async () => {
    const signal = new AbortController().signal;
    assert.equal(await api.health(signal), payload);
    assert.equal(calls[0].url, "/api/health");
    assert.equal(calls[0].init.signal, signal);
    assert.equal(calls[0].init.cache, "no-store");
    await api.repos(signal);
    assert.equal(calls[1].url, "/api/repos");
    assert.equal(calls[1].init.signal, signal);
    assert.equal(calls[1].init.cache, undefined);
  });
});

test("SSR covers loading, initial failure, accepted, refreshing, failed refresh, and recovery", {
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
    const { HealthSnapshotContent } = await vite.ssrLoadModule("/src/healthPanel.tsx");
    const oldPayload = {
      server: {
        version: "0.3.1.5", started_ts: "2026-09-30T00:00:00Z",
        db_bytes: 1024, watchers_alive: 6, watchers_total: 6,
        hook_registered: true, hook_settings_path: "C:\\Users\\Claude\\settings.json",
      },
      repos: [],
      activity: { pending: 0, rejected: 0, ignored_unscoped: 0,
        registry_revision_mismatch: 0 },
      providers: [], chronicle: { state: "running" },
    };
    const old = { data: oldPayload, receivedAt: "2026-09-30T00:45:00Z" };
    const updated = {
      data: { ...oldPayload, server: { ...oldPayload.server, version: "0.3.1.6" } },
      receivedAt: "2026-09-30T01:05:00Z",
    };
    const render = (snapshot, error, busy) => renderToStaticMarkup(
      React.createElement(HealthSnapshotContent, {
        snapshot, error, busy, onRefresh() {},
      }),
    );
    const error = "System health failed: <script>alert('x')</script>";
    const states = {
      loading: render(null, "", true),
      initialFailure: render(null, error, false),
      accepted: render(old, "", false),
      refreshing: render(old, "", true),
      failedRefresh: render(old, error, false),
      recovered: render(updated, "", false),
    };
    for (const html of Object.values(states)) {
      assert.match(html, /<p role="status" aria-live="polite" aria-atomic="true"/);
      assert.doesNotMatch(html, /<p role="status"[^>]*aria-busy/);
      assert.match(html, /<button[^>]*type="button"[^>]*aria-busy=/);
    }
    assert.match(states.loading, /Loading system health/);
    assert.match(states.loading, /disabled=""[^>]*aria-busy="true"/);
    assert.doesNotMatch(states.loading, /<h3[^>]*>Server<\/h3>/);
    assert.match(states.initialFailure, /Retry is available/);
    assert.match(states.initialFailure, /&lt;script&gt;/);
    assert.doesNotMatch(states.initialFailure, /<script>/);
    assert.match(states.initialFailure, />Retry<\/button>/);
    assert.doesNotMatch(states.initialFailure, /<h3[^>]*>Server<\/h3>/);
    assert.match(states.accepted, /Received locally:/);
    assert.match(states.accepted, /dateTime="2026-09-30T00:45:00Z"/i);
    assert.match(states.accepted, /0\.3\.1\.5/);
    assert.match(states.accepted, /45m/);
    assert.match(states.accepted, />Refresh<\/button>/);
    assert.doesNotMatch(states.accepted, /Showing the last successful response/);
    assert.match(states.refreshing, /Refreshing system health/);
    assert.match(states.refreshing, /Showing the last successful response/);
    assert.match(states.refreshing, /has not been updated/);
    assert.match(states.refreshing, /disabled=""[^>]*aria-busy="true"/);
    assert.match(states.refreshing, /0\.3\.1\.5/);
    assert.match(states.refreshing, /45m/);
    assert.match(states.failedRefresh, /Refresh failed/);
    assert.match(states.failedRefresh, /Showing the last successful response/);
    assert.match(states.failedRefresh, /&lt;script&gt;/);
    assert.match(states.failedRefresh, /dateTime="2026-09-30T00:45:00Z"/i);
    assert.match(states.failedRefresh, /0\.3\.1\.5/);
    assert.match(states.failedRefresh, /45m/);
    assert.match(states.failedRefresh, />Retry<\/button>/);
    assert.match(states.recovered, /System health updated/);
    assert.match(states.recovered, /dateTime="2026-09-30T01:05:00Z"/i);
    assert.match(states.recovered, /0\.3\.1\.6/);
    assert.doesNotMatch(states.recovered, /0\.3\.1\.5/);
    assert.match(states.recovered, /1h 5m/);
    assert.doesNotMatch(states.recovered, /Showing the last successful response/);
  } finally {
    await vite.close();
  }
});

test("actual health fetch and owned decoder keep malformed data out of System SSR", {
  timeout: 30_000,
}, async () => {
  const React = frontendRequire("react");
  const { renderToStaticMarkup } = frontendRequire("react-dom/server");
  const { createServer } = await import(pathToFileURL(frontendRequire.resolve("vite")).href);
  const vite = await createServer({ root: resolve(root, "Frontend"),
    server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom",
    optimizeDeps: { noDiscovery: true, entries: [] } });
  try {
    const { HealthSnapshotContent } = await vite.ssrLoadModule("/src/healthPanel.tsx");
    const { UI_BUILD_VERSION } = await vite.ssrLoadModule("/src/appVersion.ts");
    let response;
    const malformed = [null, {}, { ...payload, server: null }, { ...payload, repos: null },
      { ...payload, repos: [null] }, { ...payload, providers: [null] },
      { ...payload, providers: [{ provider: "claude", configuration_state: 42 }] },
      { ...payload, activity: { pending: { private: "do-not-echo" } } }];
    await withGlobal("fetch", { value: async () => ({ ok: true,
      json: async () => ({ success: true, data: response }) }) }, async () => withClock(async (clock) => {
      const receive = async (value) => {
        response = value;
        const results = [];
        const stop = startHealthRequest({ action: createActionDeadline(), request: api.health,
          onResult: result => results.push(result) });
        await flush();
        assert.equal(results.length, 1);
        assert.equal(clock.timers.size, 0);
        stop();
        return results[0];
      };
      const render = (snapshot, error) => renderToStaticMarkup(React.createElement(HealthSnapshotContent,
        { snapshot, error, busy: false, onRefresh() {} }));
      for (const value of malformed) {
        const result = await receive(value);
        assert.equal(result.ok, false);
        const html = render(null, result.error);
        assert.match(html, />Retry<\/button>/);
        assert.ok(html.includes(UI_BUILD_VERSION));
        assert.doesNotMatch(html, /<h3[^>]*>Server<\/h3>|do-not-echo/);
      }
      const first = await receive(payload);
      assert.equal(first.ok, true);
      const snapshot = { data: first.data, receivedAt: "2026-09-30T00:45:00Z" };
      const before = structuredClone(snapshot);
      for (const value of malformed) {
        const result = await receive(value);
        assert.equal(result.ok, false);
        const html = render(snapshot, result.error);
        assert.match(html, /Showing the last successful response/);
        assert.match(html, /has not been updated/);
        assert.match(html, /dateTime="2026-09-30T00:45:00Z"/i);
        assert.match(html, /0\.3\.1\.6/);
        assert.match(html, />Retry<\/button>/);
        assert.deepEqual(snapshot, before);
      }
      const recovery = { ...payload, server: { ...payload.server, version: null },
        activity: null, providers: [], chronicle: { state: "future-state" } };
      const result = await receive(recovery);
      assert.equal(result.ok, true);
      assert.equal(result.data, recovery);
      const html = render({ data: result.data, receivedAt: "2026-09-30T01:00:00Z" }, "");
      assert.match(html, /dateTime="2026-09-30T01:00:00Z"/i);
      assert.match(html, /Unknown|health data invalid/);
      assert.match(html, /Additional health data unavailable/);
      assert.match(html, />Refresh<\/button>/);
      assert.doesNotMatch(html, /Showing the last successful response/);
    }));
  } finally { await vite.close(); }
});
