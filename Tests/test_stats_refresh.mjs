import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const frontendRoot = resolve(root, "Frontend");
const frontendRequire = createRequire(resolve(frontendRoot, "package.json"));
const ts = frontendRequire("typescript");
const source = (name) => readFileSync(resolve(frontendRoot, "src", name), "utf8");
const parse = (name) => ts.createSourceFile(name, source(name), ts.ScriptTarget.Latest, true);
const dataUrl = (text) => `data:text/javascript;base64,${Buffer.from(text).toString("base64")}`;
function emit (text) {
  return ts.transpileModule(text, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React,
  } }).outputText;
}
const apiUrl = dataUrl(emit(source("api.ts")));
const apiModule = await import(apiUrl);
const linkedRequest = emit(source("statsRequest.ts")).replace(/from ["']\.\/api["']/g, `from "${apiUrl}"`);
assert.ok(linkedRequest.includes(apiUrl), "actual request helper imports the shared API race");
const { runStatsRefresh } = await import(dataUrl(linkedRequest));
const navigation = await import(dataUrl(emit(source("navigation.ts"))));

function deferred () {
  let resolvePromise, rejectPromise;
  const promise = new Promise((resolveValue, rejectValue) => {
    resolvePromise = resolveValue; rejectPromise = rejectValue;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}
async function flush () { for (let i = 0; i < 10; i += 1) await Promise.resolve(); }
async function withGlobal (name, value, run) {
  const original = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  try { return await run(); } finally {
    if (original) Object.defineProperty(globalThis, name, original);
    else delete globalThis[name];
  }
}
async function withClock (run) {
  let now = 7_000, serial = 0;
  const timers = new Map();
  const clock = {
    timers, now: () => now,
    window: {
      setTimeout(callback, delay) { const id = serial++; timers.set(id, { at: now + delay, callback }); return id; },
      clearTimeout(id) { timers.delete(id); },
    },
    advance(ms) {
      const end = now + ms;
      for (;;) {
        const next = [...timers.entries()].filter(([, item]) => item.at <= end)
          .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!next) break;
        timers.delete(next[0]); now = next[1].at; next[1].callback();
      }
      now = end;
    },
  };
  const originalNow = Date.now;
  Date.now = clock.now;
  try { return await withGlobal("window", clock.window, () => run(clock)); }
  finally { Date.now = originalNow; }
}
function snapshot (marker = "snapshot") {
  return { mode_counts: { B: 0, A_SCOPED: 0, A_GLOBAL: 0, AMBIGUOUS: 0, UNKNOWN: 0, MANUAL: 0 },
    events_per_task: [], activity_daily: [], activity_calendar: [], effort_per_task: [],
    punch_card: Array.from({ length: 7 }, () => Array(24).fill(0)), file_coupling: [], file_churn: [],
    wrapped: { days: [], top_task: null, busiest_hour: null, files_touched: 0, commits: 0, top_pair: null },
    identity: { extensions: [], ext_total: 0, sessions: 0, first_event_ts: null, commits: 0 },
    provenance: { commits_observed: 0, commits_pre: 0, slots_total: 0, slots_ai: 0, top_files: [] }, marker };
}

test("manual helper accepts data once, releases its deadline and keeps consumer errors distinct", async () => {
  await withClock(async (clock) => {
    const action = apiModule.createActionDeadline(), pending = deferred(), results = [];
    let settled = 0, receivedSignal;
    const work = runStatsRefresh({ action, request(signal) { receivedSignal = signal; return pending.promise; },
      isCurrent: () => true, onResult: (result) => results.push(result), onSettled: () => { settled += 1; } });
    assert.equal(receivedSignal, action.signal);
    assert.equal(action.deadlineAt, clock.now() + 10_000);
    const data = snapshot(); pending.resolve(data); await work;
    assert.deepEqual(results, [{ ok: true, data }]);
    assert.equal(results[0].data, data); assert.equal(settled, 1); assert.equal(clock.timers.size, 0);
    const consumerError = new Error("consumer failure");
    await assert.rejects(runStatsRefresh({ action: apiModule.createActionDeadline(),
      request: async () => data, isCurrent: () => true, onResult() { throw consumerError; },
      onSettled() { settled += 1; } }), (error) => error === consumerError);
    assert.equal(settled, 2); assert.equal(clock.timers.size, 0);
  });
});

test("manual helper bounds HTTP, parse and synchronous failures using the real API", async () => {
  await withClock(async (clock) => {
    for (const kind of ["http", "parse", "throw"]) {
      const results = [], calls = [];
      await withGlobal("fetch", async (url, init) => {
        calls.push({ url, init });
        return kind === "http" ? { ok: false, status: 503, json: async () => ({ message: "x".repeat(400) }) }
          : { ok: true, json: async () => { throw new SyntaxError("malformed JSON"); } };
      }, async () => {
        const action = apiModule.createActionDeadline();
        await runStatsRefresh({ action,
          request: kind === "throw" ? () => { throw new Error("synchronous failure"); }
            : (signal) => apiModule.api.stats("all", signal),
          isCurrent: () => true, onResult: (result) => results.push(result), onSettled() {} });
        if (kind !== "throw") {
          assert.equal(calls.length, 1); assert.equal(calls[0].url, "/api/stats?repo=all");
          assert.equal(calls[0].init.signal, action.signal);
        }
      });
      assert.equal(results.length, 1); assert.equal(results[0].ok, false);
      assert.match(results[0].error, /failed:.*Retry stats/);
      assert.ok(results[0].error.length < 200); assert.equal(clock.timers.size, 0);
    }
  });
});

test("manual helper observes timeout and late rejection, while cancellation and preabort stay silent", async () => {
  await withClock(async (clock) => {
    for (const kind of ["preabort", "stale-start", "cancel", "timeout", "stale-finish"]) {
      const action = apiModule.createActionDeadline(), pending = deferred(), results = [];
      let current = kind !== "stale-start", calls = 0, settled = 0;
      if (kind === "preabort") action.controller.abort();
      const work = runStatsRefresh({ action, request() { calls += 1; return pending.promise; },
        isCurrent: () => current, onResult: (result) => results.push(result), onSettled() { settled += 1; } });
      if (kind === "cancel") action.controller.abort();
      if (kind === "timeout") { clock.advance(9_999); await flush(); assert.equal(results.length, 0); clock.advance(1); }
      if (kind === "stale-finish") { current = false; pending.resolve(snapshot()); }
      await work;
      assert.equal(calls, ["preabort", "stale-start"].includes(kind) ? 0 : 1);
      assert.equal(settled, 1); assert.equal(clock.timers.size, 0);
      if (kind === "timeout") { assert.equal(results.length, 1); assert.match(results[0].error, /timed out after 10 seconds/); }
      else assert.deepEqual(results, []);
      if (calls && kind !== "stale-finish") { pending.reject(new Error("late transport rejection")); await flush(); }
    }
    const action = apiModule.createActionDeadline(), results = [];
    await runStatsRefresh({ action, request() {
      action.controller.abort(); return Promise.reject(new Error("reentrant canceled rejection"));
    }, isCurrent: () => true, onResult: (result) => results.push(result), onSettled() {} });
    assert.deepEqual(results, []); assert.equal(clock.timers.size, 0);
  });
});

const appAst = parse("App.tsx");
const appBody = appAst.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "App")?.body;
assert.ok(appBody, "actual App body exists");
const declared = (node, name) => ts.isVariableStatement(node)
  && node.declarationList.declarations.some((item) => item.name.getText(appAst) === name
    || (ts.isArrayBindingPattern(item.name) && item.name.elements.some((element) => element.name?.getText(appAst) === name)));
const start = appBody.statements.findIndex((node) => declared(node, "statsState"));
const end = appBody.statements.findIndex((node) => declared(node, "statsError"));
assert.ok(start >= 0 && end > start, "complete actual App stats block exists");
const appStatsSource = appBody.statements.slice(start, end + 1).map((node) => node.getText(appAst)).join("\n");
const { createStatsSubject } = await import(dataUrl(emit(`
export function createStatsSubject(hooks, env, apiModule, navigation, runStatsRefresh) {
  const {useState,useRef,useCallback,useEffect,useLayoutEffect}=hooks;
  const {scopeKey,scopeApiId}=navigation;
  const {createActionDeadline}=apiModule;
  const api=env.api, announceStatus=env.announce;
  const currentRouteRef=env.routeRef, membershipReadyRef=env.membershipRef;
  return function Stats({scope,view,membershipReady,statsNonce}) {
    currentRouteRef.current={scope,view}; membershipReadyRef.current=membershipReady;
    const currentScopeKey=scopeKey(scope);
    ${appStatsSource}
    return {statsState,stats,statsError,statsRefreshBusy,cityRefreshIdentity,
      refreshStats,cancelStatsRefresh,releaseStatsRefresh,statsOwnerRef,statsRefreshOwnerRef,statsMountedRef};
  };
}`)));
const sameDeps = (left, right) => Array.isArray(left) && Array.isArray(right)
  && left.length === right.length && left.every((value, index) => Object.is(value, right[index]));

// Deterministic hook ordering and actual callbacks, not React DOM/history evidence.
function mountStats (initial = {}) {
  let props = { scope: { kind: "repo", id: "A" }, view: "overview", membershipReady: true, statsNonce: 0, ...initial };
  let cursor = 0, dirty = false, layouts = [], effects = [], value, stateWrites = 0;
  const slots = [], requests = [], announcements = [];
  const env = { routeRef: { current: { scope: props.scope, view: props.view } }, membershipRef: { current: props.membershipReady },
    api: { stats(repo, signal) { const request = { ...deferred(), repo, signal }; requests.push(request); return request.promise; } },
    announce: (message) => announcements.push(message) };
  const slot = (kind, init) => {
    const index = cursor++; slots[index] ??= { kind, ...init() };
    assert.equal(slots[index].kind, kind); return slots[index];
  };
  const effect = (kind, pending) => (callback, deps) => {
    const state = slot(kind, () => ({})); state.callback = callback;
    if (!sameDeps(state.deps, deps)) { state.deps = deps; pending.push(() => { state.cleanup?.(); state.cleanup = callback(); }); }
  };
  const hooks = {
    useState(initialValue) {
      const state = slot("state", () => ({ value: typeof initialValue === "function" ? initialValue() : initialValue }));
      state.set ??= (next) => { stateWrites += 1;
        const result = typeof next === "function" ? next(state.value) : next;
        if (!Object.is(result, state.value)) { state.value = result; dirty = true; } };
      return [state.value, state.set];
    },
    useRef(initialValue) { return slot("ref", () => ({ value: { current: initialValue } })).value; },
    useCallback(callback, deps) { const state = slot("callback", () => ({}));
      if (!sameDeps(state.deps, deps)) { state.deps = deps; state.callback = callback; } return state.callback; },
    useEffect(callback, deps) { effect("effect", effects)(callback, deps); },
    useLayoutEffect(callback, deps) { effect("layout", layouts)(callback, deps); },
  };
  const Subject = createStatsSubject(hooks, env, apiModule, navigation, runStatsRefresh);
  function render () {
    for (let pass = 0; pass < 12; pass += 1) {
      dirty = false; cursor = 0; layouts = []; effects = [];
      value = Subject(props); layouts.forEach((run) => run()); effects.forEach((run) => run());
      if (!dirty) return value;
    }
    assert.fail("actual stats block did not settle");
  }
  render();
  return {
    env, requests, announcements, render, get value() { return value; }, get nonce() { return props.statsNonce; },
    get stateWrites() { return stateWrites; },
    update(next) { props = { ...props, ...next }; return render(); },
    start() { value.refreshStats(); return render(); },
    async settle() { await flush(); return render(); },
    replay() { for (const state of slots) if (state.kind === "layout" || state.kind === "effect") {
      state.cleanup?.(); state.cleanup = undefined; state.deps = undefined;
    } return render(); },
    unmount() { for (const state of slots) state.cleanup?.(); },
  };
}

test("actual App prevents duplicate activation and obsolete automatic overwrites", async () => {
  await withClock(async (clock) => {
    const h = mountStats(), initial = h.requests[0], oldOwner = h.value.statsOwnerRef.current;
    const refresh = h.value.refreshStats, cancel = h.value.cancelStatsRefresh;
    refresh(); refresh(); h.render();
    assert.equal(h.requests.length, 2); assert.equal(h.value.statsRefreshBusy, true);
    assert.equal(h.nonce, 0); assert.equal(h.value.refreshStats, refresh); assert.equal(h.value.cancelStatsRefresh, cancel);
    const manual = h.requests[1]; assert.ok(manual.signal instanceof AbortSignal);
    assert.notEqual(h.value.statsOwnerRef.current, oldOwner);
    const data = snapshot("manual"); manual.resolve(data); await h.settle();
    assert.equal(h.value.stats, data); assert.equal(h.value.cityRefreshIdentity, 1);
    assert.equal(h.value.statsRefreshBusy, false); assert.equal(clock.timers.size, 0);
    initial.resolve(snapshot("obsolete auto")); await h.settle();
    assert.equal(h.value.stats, data); assert.equal(h.value.cityRefreshIdentity, 1);
    assert.deepEqual(h.announcements, ["Refreshing Overview stats.", "Overview stats refreshed."]);
    h.unmount();
  });
});

test("actual App retains cached data and hydration while retrying after failure or timeout", async () => {
  await withClock(async (clock) => {
    const h = mountStats(), data = snapshot("accepted");
    h.requests[0].resolve(data); await h.settle();
    h.start(); h.requests[1].reject(new Error("offline")); await h.settle();
    assert.equal(h.value.stats, data); assert.match(h.value.statsError, /offline/);
    const previous = h.value.statsState, firstError = h.value.statsError;
    clock.advance(500); h.start();
    const owner = h.value.statsRefreshOwnerRef.current;
    assert.equal(owner.action.deadlineAt, clock.now() + 10_000);
    assert.equal(h.value.statsState, previous); assert.equal(h.value.statsError, firstError);
    clock.advance(10_000); await h.settle();
    assert.equal(h.requests[2].signal.aborted, true); assert.equal(h.value.stats, data);
    assert.match(h.value.statsError, /timed out/); assert.equal(h.value.statsState.settled, true);
    assert.equal(h.value.statsRefreshBusy, false); assert.equal(h.value.cityRefreshIdentity, 1);
    h.requests[2].resolve(snapshot("late timeout")); await h.settle(); assert.equal(h.value.stats, data);
    h.start(); const newData = snapshot("recovered"); h.requests[3].resolve(newData); await h.settle();
    assert.equal(h.value.stats, newData); assert.equal(h.value.statsError, ""); assert.equal(h.value.cityRefreshIdentity, 2);
    h.unmount(); assert.equal(clock.timers.size, 0);
  });
});

test("actual App background supersession and stale finalization cannot release a newer manual owner", async () => {
  await withClock(async (clock) => {
    const h = mountStats(); h.start(); const old = h.value.statsRefreshOwnerRef.current;
    h.update({ statsNonce: 1 });
    assert.equal(h.requests[1].signal.aborted, true); assert.equal(h.value.statsRefreshBusy, false);
    const auto = h.requests[2]; assert.equal(auto.signal, undefined);
    h.start(); const newer = h.value.statsRefreshOwnerRef.current;
    h.value.releaseStatsRefresh(old); await h.settle();
    assert.equal(h.value.statsRefreshOwnerRef.current, newer); assert.equal(h.value.statsRefreshBusy, true);
    assert.equal(clock.timers.size, 1); assert.equal(h.nonce, 1);
    auto.reject(new Error("obsolete background failure")); h.requests[1].reject(new Error("late canceled manual"));
    await h.settle(); assert.equal(h.value.statsError, ""); assert.equal(h.value.statsRefreshBusy, true);
    const data = snapshot("newest"); h.requests[3].resolve(data); await h.settle();
    assert.equal(h.value.stats, data); assert.equal(clock.timers.size, 0); h.unmount();
  });
});

test("actual App settles canceled first loading on same-scope view exit without extra requests", async () => {
  await withClock(async (clock) => {
    const h = mountStats(); h.start(); h.update({ view: "changes" });
    h.start();
    assert.equal(h.requests.length, 2); assert.equal(h.requests[1].signal.aborted, true);
    assert.deepEqual(h.value.statsState, { key: "repo:A", data: null, error: "", settled: true });
    assert.equal(h.value.statsRefreshBusy, false); assert.equal(clock.timers.size, 0);
    h.requests[0].resolve(snapshot("old auto")); h.requests[1].resolve(snapshot("old manual")); await h.settle();
    h.update({ view: "overview" }); assert.equal(h.requests.length, 2); assert.equal(h.value.stats, null);
    assert.equal(h.value.statsState.settled, true); assert.deepEqual(h.announcements, ["Refreshing Overview stats."]);
    h.start(); h.requests[2].resolve(snapshot("return recovery")); await h.settle();
    assert.equal(h.value.stats.marker, "return recovery"); h.unmount();
  });
});

test("actual App preserves B cache across A cancellation and a failed return-to-B background round", async () => {
  await withClock(async () => {
    const scopeB = { kind: "repo", id: "B" }, scopeA = { kind: "repo", id: "A" };
    const h = mountStats({ scope: scopeB }), cachedB = snapshot("B cache");
    h.requests[0].resolve(cachedB); await h.settle();
    h.update({ scope: scopeA }); h.start(); h.update({ scope: scopeB });
    assert.equal(h.requests[2].signal.aborted, true); assert.equal(h.value.stats, cachedB);
    h.requests[3].reject(new Error("B unavailable")); await h.settle();
    assert.equal(h.value.stats, cachedB); assert.equal(h.value.statsError, "Error: B unavailable");
    h.requests[1].resolve(snapshot("obsolete A auto")); h.requests[2].resolve(snapshot("obsolete A manual"));
    await h.settle(); assert.equal(h.value.stats, cachedB); assert.equal(h.value.cityRefreshIdentity, 1); h.unmount();
  });
});

test("actual App guards membership, committed context, teardown and effect replay", async () => {
  await withClock(async (clock) => {
    const h = mountStats({ membershipReady: false }); h.start(); assert.equal(h.requests.length, 0);
    h.update({ membershipReady: true }); h.replay(); assert.equal(h.requests.length, 2);
    h.requests[0].resolve(snapshot("before replay")); await h.settle(); assert.equal(h.value.stats, null);
    h.start(); const active = h.value.statsRefreshOwnerRef.current;
    h.env.routeRef.current = { scope: { kind: "repo", id: "other" }, view: "overview" };
    h.requests[2].resolve(snapshot("wrong current scope")); await h.settle();
    assert.equal(h.value.stats, null); assert.equal(h.value.statsRefreshOwnerRef.current, null);
    assert.equal(h.value.statsRefreshBusy, false); assert.equal(active.action.signal.aborted, false);
    h.start(); h.update({ membershipReady: false });
    assert.equal(h.requests[3].signal.aborted, true); assert.equal(h.value.statsRefreshBusy, false);
    h.update({ membershipReady: true }); h.start(); const last = h.requests.at(-1), before = h.value.statsState;
    const writesBeforeUnmount = h.stateWrites;
    h.unmount(); assert.equal(last.signal.aborted, true); assert.equal(clock.timers.size, 0);
    assert.equal(h.stateWrites, writesBeforeUnmount, "unmount detaches without state writes");
    const requestCount = h.requests.length; h.value.refreshStats();
    assert.equal(h.requests.length, requestCount, "an unmounted callback cannot start transport");
    last.reject(new Error("late unmounted failure")); await flush();
    assert.equal(h.value.statsState, before); assert.equal(h.value.statsMountedRef.current, false);
    assert.equal(h.stateWrites, writesBeforeUnmount, "late cancellation and transport settlement cannot write state");
  });
});

test("actual App keeps manual work through same committed context regardless of route generation", async () => {
  await withClock(async () => {
    const h = mountStats({ scope: { kind: "all" } }); h.start();
    const owner = h.value.statsRefreshOwnerRef.current;
    h.env.routeGeneration = 99; h.env.historyEntry = "another-entry"; h.update({ view: "overview" });
    assert.equal(h.value.statsRefreshOwnerRef.current, owner); assert.equal(owner.action.signal.aborted, false);
    assert.equal(h.requests[1].repo, undefined);
    h.requests[1].resolve(snapshot("all scopes")); await h.settle(); assert.equal(h.value.stats.marker, "all scopes");
    h.update({ scope: { kind: "repo", id: "all" } }); h.start();
    assert.equal(h.requests.at(-1).repo, "all"); assert.equal(h.value.statsRefreshOwnerRef.current.key, "repo:all");
    h.unmount(); await flush();
  });
});

test("actual App preserves pending manual ownership across fresh equal scope objects", async (t) => {
  for (const scope of [{ kind: "repo", id: "A" }, { kind: "all" }]) {
    await t.test(scope.kind, async () => {
      await withClock(async (clock) => {
        const h = mountStats({ scope });
        try {
          h.start(); const owner = h.value.statsRefreshOwnerRef.current;
          h.update({ scope: { ...scope } });
          assert.equal(owner.action.signal.aborted, false, "equal effective scope must not cancel the manual request");
          assert.equal(h.requests.length, 2, "equal scope identity must not start an automatic replacement");
          assert.equal(h.value.statsRefreshOwnerRef.current, owner);
          assert.equal(h.value.statsRefreshBusy, true); assert.equal(clock.timers.size, 1);
          h.requests[1].resolve(snapshot("same-scope result")); await h.settle();
          assert.equal(h.value.stats.marker, "same-scope result");
          assert.equal(h.value.cityRefreshIdentity, 1); assert.equal(clock.timers.size, 0);
          h.update({ scope: { ...scope } });
          assert.equal(h.requests.length, 2, "equal scope also avoids redundant idle auto requests");
        } finally { h.unmount(); await flush(); }
      });
    });
  }
});

test("actual App pending-action replay clears busy and accepts a fresh manual retry", async () => {
  await withClock(async (clock) => {
    const h = mountStats(); h.start();
    const oldManual = h.requests[1], oldOwner = h.value.statsRefreshOwnerRef.current;
    assert.equal(h.value.statsRefreshBusy, true);
    h.replay();
    assert.equal(oldManual.signal.aborted, true); assert.equal(h.value.statsRefreshBusy, false);
    assert.equal(h.value.statsRefreshOwnerRef.current, null); assert.equal(clock.timers.size, 0);
    assert.equal(h.requests.length, 3, "replayed automatic effect owns its fresh request");
    h.start(); const currentOwner = h.value.statsRefreshOwnerRef.current;
    assert.notEqual(currentOwner, oldOwner); assert.equal(h.value.statsRefreshBusy, true);
    oldManual.reject(new Error("late pre-replay failure"));
    h.requests[0].resolve(snapshot("original auto")); h.requests[2].resolve(snapshot("replayed auto"));
    await h.settle();
    assert.equal(h.value.statsRefreshOwnerRef.current, currentOwner);
    assert.equal(h.value.statsRefreshBusy, true); assert.equal(h.value.stats, null);
    h.requests[3].resolve(snapshot("fresh retry")); await h.settle();
    assert.equal(h.value.stats.marker, "fresh retry"); assert.equal(h.value.cityRefreshIdentity, 1);
    assert.equal(h.value.statsRefreshBusy, false); assert.equal(clock.timers.size, 0); h.unmount();
  });
});

const overviewAst = parse("OverviewView.tsx");
const overviewBody = overviewAst.statements.find((node) => ts.isFunctionDeclaration(node)
  && node.name?.text === "OverviewView")?.body;
assert.ok(overviewBody);
const focusStatements = overviewBody.statements.filter((node) => {
  const text = node.getText(overviewAst);
  return text.startsWith("const statsRefreshButtonRef") || text.startsWith("const focusedStatsErrorRef")
    || (text.startsWith("useLayoutEffect(") && text.includes("focusedStatsErrorRef"));
});
assert.equal(focusStatements.length, 3, "both actual refs and the actual lost-node effect are extracted");
let errorElement;
function visitOverview (node) {
  if (ts.isJsxOpeningElement(node) && node.tagName.getText(overviewAst) === "p"
    && node.attributes.properties.some((attr) => attr.name?.getText(overviewAst) === "data-route-hydration-failure")) {
    assert.equal(errorElement, undefined); errorElement = node;
  }
  ts.forEachChild(node, visitOverview);
}
visitOverview(overviewAst); assert.ok(errorElement);
function errorHandler (name) {
  const attr = errorElement.attributes.properties.find((item) => item.name?.getText(overviewAst) === name);
  assert.ok(attr && ts.isJsxExpression(attr.initializer) && attr.initializer.expression);
  return attr.initializer.expression.getText(overviewAst);
}
const { createFocusSubject } = await import(dataUrl(emit(`
export function createFocusSubject(env) {
  const refs=[]; let cursor=0, effect;
  const document=env.document, hasOverlayLease=()=>env.overlay;
  const useRef=value=>{const index=cursor++; return refs[index] ??= {current:value};};
  const useLayoutEffect=callback=>{effect=callback;};
  return function render({onRefreshStats,statsError,statsRefreshBusy}) {
    cursor=0;
    ${focusStatements.map((node) => node.getText(overviewAst)).join("\n")}
    return {statsRefreshButtonRef,focusedStatsErrorRef,onFocus:${errorHandler("onFocus")},
      onBlur:${errorHandler("onBlur")},commit:()=>effect()};
  };
}`)));

function focusFixture () {
  const document = { body: {}, documentElement: {}, activeElement: null };
  document.activeElement = document.body;
  const env = { document, overlay: false }, focusCalls = [];
  const target = { isConnected: true, disabled: false, inert: false,
    closest(selector) { assert.equal(selector, "[inert]"); return this.inert ? {} : null; },
    focus(options) { focusCalls.push(options); document.activeElement = this; } };
  const previous = { isConnected: true };
  const render = createFocusSubject(env);
  let props = { onRefreshStats() {}, statsError: "failed", statsRefreshBusy: false }, subject = render(props);
  subject.statsRefreshButtonRef.current = target;
  return { env, document, previous, target, focusCalls,
    get value() { return subject; },
    update(next = {}) { props = { ...props, ...next }; subject = render(props); return subject; },
    focusError() { document.activeElement = previous; subject.onFocus({ currentTarget: previous }); },
    removeError() { previous.isConnected = false; document.activeElement = document.body; },
  };
}

test("actual Overview focus recovery waits through busy and focuses a removed error's stable control once", () => {
  const h = focusFixture(); h.focusError(); h.value.commit();
  assert.deepEqual(h.focusCalls, [], "a still-connected error keeps focus");
  h.removeError(); h.target.disabled = true; h.update({ statsError: "", statsRefreshBusy: true }).commit();
  assert.equal(h.value.focusedStatsErrorRef.current, h.previous); assert.deepEqual(h.focusCalls, []);
  h.target.disabled = false; h.update({ statsRefreshBusy: false }).commit();
  assert.deepEqual(h.focusCalls, [{ preventScroll: true }]);
  assert.equal(h.value.focusedStatsErrorRef.current, null);
  h.value.commit(); assert.equal(h.focusCalls.length, 1);
  for (const active of ["root", "removed"]) {
    const f = focusFixture(); f.focusError(); f.removeError();
    f.document.activeElement = active === "root" ? f.document.documentElement : f.previous;
    f.update({ statsError: "" }).commit(); assert.equal(f.focusCalls.length, 1);
  }
});

test("actual Overview focus recovery never steals focus or overrides an unavailable target or overlay", () => {
  for (const kind of ["unfocused", "elsewhere", "blur", "absent-callback", "missing", "disconnected", "disabled", "inert", "overlay"]) {
    const h = focusFixture();
    if (kind !== "unfocused") h.focusError();
    if (kind === "blur") h.value.onBlur({ currentTarget: h.previous, relatedTarget: {} });
    h.removeError();
    if (kind === "elsewhere") h.document.activeElement = {};
    if (kind === "missing") h.value.statsRefreshButtonRef.current = null;
    if (kind === "disconnected") h.target.isConnected = false;
    if (kind === "disabled") h.target.disabled = true;
    if (kind === "inert") h.target.inert = true;
    if (kind === "overlay") h.env.overlay = true;
    h.update({ statsError: "", ...(kind === "absent-callback" ? { onRefreshStats: undefined } : {}) }).commit();
    assert.deepEqual(h.focusCalls, [], kind);
    assert.equal(h.value.focusedStatsErrorRef.current, null, kind);
  }
  for (const target of [null, "self"]) {
    const h = focusFixture(); h.focusError();
    h.value.onBlur({ currentTarget: h.previous, relatedTarget: target === "self" ? h.previous : null });
    assert.equal(h.value.focusedStatsErrorRef.current, h.previous);
    h.removeError(); h.update({ statsError: "" }).commit(); assert.equal(h.focusCalls.length, 1);
  }
});

test("actual App wires Overview recovery without changing workspace or wardrobe invalidation", () => {
  const text = source("App.tsx");
  const call = text.match(/<LazyOverviewView\b[\s\S]*?\/>/)?.[0];
  assert.ok(call);
  assert.match(call, /statsRefreshBusy=\{statsRefreshBusy\}/);
  assert.match(call, /onRefreshStats=\{refreshStats\}/);
  assert.match(call, /statsSettled=\{statsEligible && statsState\.settled\}/);
  const manual = appBody.statements.find((node) => declared(node, "refreshStats"))?.getText(appAst);
  assert.ok(manual); assert.doesNotMatch(manual, /setStatsNonce|requestWardrobe|\bsync\(/);
  assert.match(manual, /api\.stats\(scopeApiId\(route\.scope\), signal\)/);
});

test("actual Overview exposes in-place statistics recovery", { timeout: 30_000 }, async () => {
  const React = frontendRequire("react");
  const { renderToStaticMarkup } = frontendRequire("react-dom/server");
  const { createServer } = await import(pathToFileURL(frontendRequire.resolve("vite")).href);
  const vite = await createServer({
    root: frontendRoot, server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom", optimizeDeps: { noDiscovery: true, entries: [] },
  });
  try {
    const { OverviewView } = await vite.ssrLoadModule("/src/OverviewView.tsx");
    const props = {
      scope: "Probe", tasks: [], uncommitted: [], repos: [], stats: null,
      statsError: "Controlled statistics failure", statsSettled: true,
      onRefreshStats() {}, onStatus() {},
      entryState: { relationship: null, day: "2026-10-01", speed: 1 },
      onEntryStateChange() {},
    };
    const render = (changes) => renderToStaticMarkup(React.createElement(OverviewView, { ...props, ...changes }));
    const refreshButton = (html) => {
      const buttons = [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].map(([button]) => button);
      const matches = buttons.filter((button) => />\s*(?:Retry stats|Refresh stats|Refreshing…)\s*<\/button>/.test(button));
      assert.equal(matches.length, 1, "one stable stats control remains outside the stats-only actions");
      assert.equal(buttons[0], matches[0], "refresh stays the first heading action");
      assert.match(matches[0], /type="button"/); return matches[0];
    };
    const failed = render({});
    assert.match(refreshButton(failed), />Retry stats<\/button>/);
    assert.doesNotMatch(refreshButton(failed), /\sdisabled=/);
    assert.match(failed, /data-route-hydration-failure="true"/);
    const loading = render({ statsError: "", statsSettled: false });
    assert.match(loading, /Loading overview data/); assert.match(refreshButton(loading), />Refresh stats<\/button>/);
    const busy = render({ statsRefreshBusy: true });
    assert.match(refreshButton(busy), /disabled=""/); assert.match(refreshButton(busy), /aria-busy="true"/);
    assert.match(busy, /data-route-hydration-failure="true"/); assert.match(busy, /Controlled statistics failure/);
    const data = snapshot();
    for (const changes of [{ statsError: "offline" }, { statsError: "", statsRefreshBusy: true }]) {
      const cached = render({ stats: data, ...changes });
      assert.match(cached, /Showing the last successful stats response/);
      assert.match(cached, /download this scope&#x27;s 7-day report/); refreshButton(cached);
    }
    const successful = render({ stats: data, statsError: "" });
    assert.match(refreshButton(successful), />Refresh stats<\/button>/);
    assert.doesNotMatch(successful, /data-route-hydration-failure|Showing the last successful stats response/);
    assert.match(successful, /download this scope&#x27;s 7-day report/);
    const unavailable = render({ statsError: "", statsSettled: true });
    assert.match(unavailable, /Overview stats are unavailable/); assert.doesNotMatch(unavailable, /Loading overview data/);
    const omitted = render({ statsError: "", statsSettled: undefined, onRefreshStats: undefined });
    assert.match(omitted, /Loading overview data/); assert.match(refreshButton(omitted), /disabled=""/);
    const escaped = render({ statsError: "<script>controlled error</script>" });
    assert.match(escaped, /&lt;script&gt;controlled error&lt;\/script&gt;/);
    assert.doesNotMatch(escaped, /<script>controlled error/);
    const longToken = "x".repeat(120);
    const longError = render({ statsError: `Overview stats refresh failed: ${longToken}. Retry stats.` });
    const errorParagraph = longError.match(/<p\b[^>]*data-route-hydration-failure="true"[^>]*>[\s\S]*?<\/p>/)?.[0];
    assert.ok(errorParagraph); assert.ok(errorParagraph.includes(longToken));
    assert.match(errorParagraph, /class="[^"]*\bbreak-words\b/);
    assert.match(errorParagraph, /class="[^"]*\[overflow-wrap:anywhere\]/);
  } finally {
    await vite.close();
  }
});
