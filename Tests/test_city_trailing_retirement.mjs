import { cityBriefPreservation } from "./helpers/cityDistrictBrief.mjs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(resolve(root, "Frontend/package.json"));
const ts = require("typescript");
const cityPath = resolve(root, "Frontend/src/city.tsx");
const originalSource = readFileSync(cityPath, "utf8");
const apiSource = readFileSync(resolve(root, "Frontend/src/api.ts"), "utf8");
const themeSource = readFileSync(resolve(root, "Frontend/src/theme.ts"), "utf8");
const sha = value => createHash("sha256").update(value).digest("hex");
const lf = text => text.replace(/\r\n/g, "\n");
const parse = text => ts.createSourceFile("city.tsx", text, ts.ScriptTarget.Latest,
  true, ts.ScriptKind.TSX);
const compile = text => ts.transpileModule(text, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
} }).outputText;
function only(items, label) {
  assert.equal(items.length, 1, label);
  return items[0];
}
function ownerOf(ast) {
  return only(ast.statements.filter(node => ts.isFunctionDeclaration(node)
    && node.name?.text === "CityView"), "one actual City owner");
}
function createOwner(hooks, source) {
  const ast = parse(source), owner = ownerOf(ast);
  const finalReturn = owner.body.statements.at(-1);
  assert.ok(ts.isReturnStatement(finalReturn), "actual final JSX return boundary");
  const functions = ["fetchCityChurnPool", "weatherOf"].map(name => only(
    ast.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === name),
    `one actual ${name}`).getText(ast)).join("\n");
  const constants = ast.statements.filter(ts.isVariableStatement).filter(node =>
    node.declarationList.declarations.some(declaration =>
      ["PITCH", "HEIGHT", "SKY_H", "FETCH_WINDOW_MS", "WX_FORECAST_LEAD_H"]
        .includes(declaration.name.getText(ast)))).map(node => node.getText(ast)).join("\n");
  const threshold = themeSource.match(/export const UNCOMMITTED_AGE_H\s*=\s*\d+;/)?.[0];
  assert.ok(threshold, "actual shared weather threshold");
  const apiModule = {};
  new Function("exports", compile(apiSource))(apiModule);
  const module = {};
  const code = `${threshold}\n${constants}\n${functions}\n`
    + source.slice(owner.getStart(ast), finalReturn.getStart(ast))
    + `return {churn,acceptedKey,hydrating,hydrationNote,retryBusy,retryHydration,
      mountedRef,roundRef,retryActionRef,trailingRoundRef,autoTimerRef,
      acceptedKeyRef,repoKeyRef,roundGenerationRef};\n}`;
  new Function("exports", "env", `const {useRef,useState,useCallback,useEffect,
    usePrefersReducedMotion,useRememberedBoundedPage,api,abortError,isAbortError,
    createActionDeadline,raceWithSignal}=env;\n${compile(code)}`)(module, { ...hooks, ...apiModule });
  return module.CityView;
}
const repo = id => ({ id, status_valid: false, offline: false, count: 0 });
const abort = () => new DOMException("Controlled cancellation", "AbortError");
function deferred() {
  let resolvePromise, rejectPromise;
  const promise = new Promise((resolveValue, rejectValue) => {
    resolvePromise = resolveValue; rejectPromise = rejectValue;
  });
  // A fixture body can remain unused if the transport is canceled first.
  void promise.catch(() => {});
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}
function harness(source = originalSource, initial = {}) {
  const h = { slots: [], pending: [], index: 0, alive: true, dirty: false,
    now: 100_000, nextTimer: 0, timers: new Map(), microtasks: [], requests: [],
    lateWrites: [], statuses: [], value: null, props: null };
  const equal = (a, b) => a && b && a.length === b.length && a.every((x, i) => Object.is(x, b[i]));
  const hooks = {
    useRef(value) { return h.slots[h.index++] ??= { current: value }; },
    useState(value) {
      const index = h.index++;
      h.slots[index] ??= { value: typeof value === "function" ? value() : value };
      return [h.slots[index].value, update => {
        if (!h.alive) h.lateWrites.push(index);
        const next = typeof update === "function" ? update(h.slots[index].value) : update;
        if (!Object.is(next, h.slots[index].value)) h.dirty = true;
        h.slots[index].value = next;
      }];
    },
    useCallback(callback, deps) {
      const index = h.index++;
      if (!h.slots[index] || !equal(h.slots[index].deps, deps)) h.slots[index] = { callback, deps };
      return h.slots[index].callback;
    },
    useEffect(effect, deps) {
      const index = h.index++;
      if (!h.slots[index] || !equal(h.slots[index].deps, deps)) {
        h.slots[index] = { effect, deps, cleanup: h.slots[index]?.cleanup };
        h.pending.push(index);
      }
    },
    usePrefersReducedMotion: () => true,
    // Presentation pagination is not part of the request-owner simulation.
    useRememberedBoundedPage: (_key, options) => ({ page: 1, start: 0,
      end: Math.min(6, options.totalItems), totalItems: options.totalItems }),
  };
  const City = createOwner(hooks, source);
  h.props = { repos: [repo("A")], tasks: [], events: [], workspaceReady: true,
    mood: "uncertain", wardrobe: {}, refreshIdentity: 0, onOpenFileStory() {}, onGoRepo() {},
    onStatus(message) { h.statuses.push({ message, alive: h.alive }); }, ...initial };
  h.render = changes => {
    h.props = { ...h.props, ...changes }; h.index = 0; h.pending = []; h.dirty = false;
    h.value = City(h.props);
    for (const index of h.pending) h.slots[index].cleanup?.();
    for (const index of h.pending) h.slots[index].cleanup = h.slots[index].effect();
    return h.value;
  };
  h.unmount = () => {
    if (!h.alive) return;
    h.alive = false;
    for (const slot of h.slots) slot?.cleanup?.();
  };
  h.replay = () => {
    for (const slot of h.slots) slot?.cleanup?.();
    for (const slot of h.slots) if (slot?.effect) slot.cleanup = slot.effect();
  };
  h.drain = () => {
    let count = 0;
    while (h.microtasks.length) { assert.ok(++count <= 100, "bounded microtasks"); h.microtasks.shift()(); }
  };
  h.flush = async (drain = true) => {
    for (let i = 0; i < 30; i++) {
      await Promise.resolve();
      if (drain) h.drain();
      if (h.alive && h.dirty) h.render();
    }
  };
  h.advance = milliseconds => {
    h.now += milliseconds;
    let count = 0;
    for (;;) {
      const due = [...h.timers].find(([, timer]) => timer.at <= h.now);
      if (!due) break;
      assert.ok(++count <= 100, "bounded timer execution");
      h.timers.delete(due[0]); due[1].callback();
    }
  };
  h.fetch = (url, options = {}) => {
    const transport = deferred(), body = deferred();
    const request = { url, signal: options.signal, alive: h.alive, transport, body,
      active: true, ignoreAbort: false };
    const complete = () => { request.active = false; request.signal?.removeEventListener("abort", onAbort); };
    const onAbort = () => {
      if (request.ignoreAbort) return;
      transport.reject(abort()); body.reject(abort()); complete();
    };
    request.reject = error => { transport.reject(error); body.reject(error); complete(); };
    request.respond = (data = { file_churn: [] }, { status = 200, delayedBody = false } = {}) => {
      transport.resolve({ ok: status >= 200 && status < 300, status,
        json: () => body.promise.then(value => { complete(); return value; }) });
      if (!delayedBody) body.resolve({ success: status < 400, data, message: status < 400 ? "" : "Controlled failure" });
    };
    request.finishBody = data => body.resolve({ success: true, data });
    h.requests.push(request);
    request.signal?.addEventListener("abort", onAbort, { once: true });
    if (request.signal?.aborted) onAbort();
    return transport.promise;
  };
  h.window = {
    setTimeout(callback, delay) {
      const id = h.nextTimer++; h.timers.set(id, { callback, at: h.now + delay }); return id;
    },
    clearTimeout(id) { h.timers.delete(id); },
  };
  h.dispose = async () => {
    h.unmount();
    h.value?.roundRef.current?.controller.abort();
    h.value?.retryActionRef.current?.controller.abort();
    h.value?.retryActionRef.current?.clear();
    for (const request of h.requests) request.reject(abort());
    await h.flush();
    for (const timer of h.timers.keys()) h.window.clearTimeout(timer);
    h.microtasks.length = 0;
  };
  return h;
}
async function withCity(body, options = {}) {
  const names = ["window", "fetch", "clearTimeout", "queueMicrotask"];
  const saved = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const savedNow = Object.getOwnPropertyDescriptor(Date, "now");
  let h;
  try {
    h = harness(options.source, options.props);
    Object.defineProperty(globalThis, "window", { configurable: true, writable: true, value: h.window });
    Object.defineProperty(globalThis, "fetch", { configurable: true, writable: true, value: h.fetch });
    Object.defineProperty(globalThis, "clearTimeout", { configurable: true, writable: true, value: h.window.clearTimeout });
    Object.defineProperty(globalThis, "queueMicrotask", { configurable: true, writable: true,
      value: callback => h.microtasks.push(callback) });
    Object.defineProperty(Date, "now", { ...savedNow, value: () => h.now });
    options.setup?.(h);
    h.render(); await h.flush();
    return await body(h);
  } finally {
    try { await h?.dispose(); options.cleanup?.(); }
    finally {
      Object.defineProperty(Date, "now", savedNow);
      for (const [name, descriptor] of saved) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else delete globalThis[name];
      }
    }
  }
}
function assertRetired(h, count) {
  assert.equal(h.requests.length, count, "retired City must not start another stats request");
  assert.deepEqual(h.lateWrites, [], "retired City must not write state");
  assert.ok(h.statuses.every(status => status.alive), "retired City must not announce");
  assert.equal(h.timers.size, 0, "retired City must not own new timers");
}

test("retired City does not restart automatic trailing work", async () => withCity(async h => {
  h.render({ refreshIdentity: 1 });
  assert.equal(h.value.trailingRoundRef.current, true);
  h.unmount(); assert.equal(h.requests[0].signal.aborted, true);
  await h.flush(); h.advance(10_000); await h.flush();
  assertRetired(h, 1);
}));

test("retired City does not restart foreground trailing work", async () => withCity(async h => {
  h.requests[0].respond({}, { status: 503 }); await h.flush();
  assert.match(h.value.hydrationNote, /unavailable/);
  h.value.retryHydration(); await h.flush();
  assert.equal(h.requests.length, 2);
  h.render({ refreshIdentity: 1 }); h.unmount();
  await h.flush(); h.advance(10_000); await h.flush();
  assertRetired(h, 2);
}));

test("retired City does not restart an already queued continuation", async () => withCity(async h => {
  h.render({ refreshIdentity: 1 }); h.requests[0].respond(); await h.flush(false);
  assert.equal(h.microtasks.length, 1); assert.equal(h.timers.size, 0);
  h.unmount(); h.drain(); h.advance(10_000); await h.flush();
  assertRetired(h, 1);
}));

test("late response bodies cannot publish or dispatch after either owner retires", async () => {
  for (const foreground of [false, true]) for (const rejected of [false, true]) {
    await withCity(async h => {
      if (foreground) {
        h.requests[0].respond({}, { status: 503 }); await h.flush();
        h.value.retryHydration(); await h.flush();
      }
      const request = h.requests.at(-1), count = h.requests.length;
      request.ignoreAbort = true;
      request.respond(undefined, { delayedBody: true }); await h.flush();
      h.render({ refreshIdentity: 1 }); h.unmount();
      assert.equal(request.signal.aborted, true);
      await h.flush(); assert.equal(h.requests.length, count);
      if (rejected) request.body.reject(new TypeError("Controlled late body failure"));
      else request.finishBody({ file_churn: [{ repo: "A", file: "late.ts", events: 99 }] });
      await h.flush(); h.advance(20_000); await h.flush();
      assertRetired(h, count);
      assert.equal(h.value.acceptedKeyRef.current, "", "late data cannot become accepted");
    });
  }
});

test("mounted trailing rounds retain throttle, accepted snapshots and current callbacks", async () => withCity(async h => {
  const first = [{ repo: "A", file: "first.ts", events: 1 }];
  h.requests[0].respond({ file_churn: first }); await h.flush();
  assert.equal(h.value.acceptedKey, '["A"]'); assert.equal(h.value.churn.get("A"), first);
  h.render({ refreshIdentity: 1 }); h.render({ refreshIdentity: 2 });
  assert.equal(h.timers.size, 1); h.advance(9_999); assert.equal(h.requests.length, 1);
  h.advance(1); assert.equal(h.requests.length, 2);
  h.render({ refreshIdentity: 3 }); h.render({ refreshIdentity: 4 });
  h.requests[1].respond({}, { status: 503 }); await h.flush();
  assert.equal(h.value.churn.get("A"), first, "refresh failure retains accepted data");
  assert.match(h.value.hydrationNote, /showing the last accepted snapshot/);
  assert.deepEqual(h.statuses, [], "background failure remains silent");
  const currentStatus = [];
  h.render({ onStatus: message => currentStatus.push(message) });
  assert.equal(h.timers.size, 1); h.advance(10_000);
  assert.equal(h.requests.length, 3);
  const next = [{ repo: "A", file: "next.ts", events: 2 }];
  h.requests[2].respond({ file_churn: next }); await h.flush();
  assert.equal(h.value.churn.get("A"), next); assert.equal(h.value.hydrationNote, "");
  assert.deepEqual(currentStatus, ["City data recovered."]);
  assert.equal(h.timers.size, 0);
}));

test("repository replacement preserves key/generation ownership and the latest scheduler", async () => withCity(async h => {
  const oldGeneration = h.value.roundGenerationRef.current;
  h.requests[0].ignoreAbort = true;
  h.render({ repos: [repo("B")] });
  assert.equal(h.requests[0].signal.aborted, true);
  assert.ok(h.value.roundGenerationRef.current > oldGeneration);
  assert.equal(h.value.acceptedKeyRef.current, "");
  h.requests[0].respond({ file_churn: [{ repo: "A", file: "old.ts", events: 5 }] });
  await h.flush(); h.advance(10_000); await h.flush();
  assert.equal(h.requests.length, 2); assert.equal(h.requests[1].url, "/api/stats?repo=B");
  const current = [{ repo: "B", file: "current.ts", events: 2 }];
  h.requests[1].respond({ file_churn: current }); await h.flush();
  assert.equal(h.value.acceptedKey, '["B"]'); assert.equal(h.value.churn.has("A"), false);
  assert.equal(h.value.churn.get("B"), current);
}));

test("readiness and empty membership retain their existing no-request behavior", async () => withCity(async h => {
  assert.equal(h.requests.length, 0); assert.equal(h.value.acceptedKey, "");
  h.render({ repos: [], workspaceReady: true }); await h.flush();
  assert.equal(h.value.acceptedKey, "[]"); assert.equal(h.value.churn.size, 0);
  assert.equal(h.requests.length, 0);
  h.render({ repos: [repo("A")] }); await h.flush();
  assert.equal(h.requests.length, 1);
  h.render({ workspaceReady: false, refreshIdentity: 1 });
  h.requests[0].respond(); await h.flush();
  assert.equal(h.requests.length, 1); assert.equal(h.timers.size, 0);
}, { props: { workspaceReady: false } }));

test("cleanup/setup replay retains automatic and foreground recovery", async () => {
  for (const foreground of [false, true]) await withCity(async h => {
    if (foreground) {
      h.requests[0].respond({}, { status: 503 }); await h.flush();
      h.value.retryHydration(); await h.flush();
    }
    const count = h.requests.length, prior = h.requests.at(-1);
    h.replay(); assert.equal(prior.signal.aborted, true);
    await h.flush(); assert.equal(h.value.mountedRef.current, true);
    h.advance(10_000); await h.flush();
    assert.equal(h.requests.length, count + 1, "the remounted owner still refreshes");
    h.requests.at(-1).respond(); await h.flush();
    assert.equal(h.value.acceptedKey, '["A"]'); assert.equal(h.value.hydrating, false);
    assert.equal(h.value.retryBusy, false); assert.equal(h.timers.size, 0);
    assert.deepEqual(h.lateWrites, []);
  });
});

test("foreground retries retain duplicate admission, deadline and subsequent recovery", async () => withCity(async h => {
  h.requests[0].reject(new TypeError("Controlled transport failure")); await h.flush();
  h.value.retryHydration(); h.value.retryHydration(); await h.flush();
  assert.equal(h.requests.length, 2); assert.equal(h.timers.size, 1);
  h.advance(9_999); await h.flush(); assert.equal(h.value.retryBusy, true);
  h.advance(1); await h.flush();
  assert.equal(h.requests[1].signal.aborted, true);
  assert.match(h.value.hydrationNote, /retry timed out after 10 seconds/);
  assert.equal(h.value.retryBusy, false); assert.equal(h.timers.size, 0);
  assert.equal(h.statuses.length, 1); assert.match(h.statuses[0].message, /Retry is available/);
  h.value.retryHydration(); await h.flush();
  assert.equal(h.requests.length, 3); h.requests[2].respond(); await h.flush();
  assert.equal(h.value.acceptedKey, '["A"]'); assert.equal(h.value.hydrationNote, "");
  assert.equal(h.value.retryBusy, false); assert.equal(h.timers.size, 0);
}));

test("waiting for an uncooperative prior round retains its own retry deadline", async () => withCity(async h => {
  h.requests[0].ignoreAbort = true;
  h.value.retryHydration(); h.value.retryHydration(); await h.flush();
  assert.equal(h.requests.length, 1); h.advance(10_000); await h.flush();
  assert.match(h.value.hydrationNote, /timed out while stopping the prior refresh/);
  assert.equal(h.value.retryBusy, false); assert.equal(h.timers.size, 0);
  h.requests[0].respond(); await h.flush();
  assert.equal(h.value.acceptedKeyRef.current, "");
  h.value.retryHydration(); await h.flush(); assert.equal(h.requests.length, 2);
  h.requests[1].respond(); await h.flush(); assert.equal(h.value.acceptedKey, '["A"]');
}));

test("the actual pool retains six workers and stops unscheduled repositories on exit", async () => {
  const repos = Array.from({ length: 9 }, (_, index) => repo(`Repo_${index}`));
  await withCity(async h => {
    assert.equal(h.requests.length, 6);
    assert.equal(new Set(h.requests.map(request => request.signal)).size, 1);
    for (let index = 0; index < 9; index++) {
      assert.ok(h.requests.filter(request => request.active).length <= 6);
      h.requests[index].respond({ file_churn: [{ repo: repos[index].id, file: "a.ts", events: index }] });
      await h.flush();
    }
    assert.equal(h.requests.length, 9); assert.equal(h.value.churn.size, 9);
    assert.deepEqual(h.requests.map(request => request.url), repos.map(r => `/api/stats?repo=${r.id}`));
  }, { props: { repos } });
  await withCity(async h => {
    assert.equal(h.requests.length, 6);
    h.render({ refreshIdentity: 1 }); h.unmount(); await h.flush(); h.advance(20_000); await h.flush();
    assertRetired(h, 6); assert.ok(h.requests.every(request => request.signal.aborted));
  }, { props: { repos } });
});

test("global descriptors restore after assertion, setup and cleanup failures", async () => {
  const names = ["window", "fetch", "clearTimeout", "queueMicrotask"];
  const saved = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  const savedNow = Object.getOwnPropertyDescriptor(Date, "now");
  for (const phase of ["body", "setup", "cleanup"]) {
    const fail = () => { throw new Error(`Controlled ${phase} failure`); };
    await assert.rejects(withCity(phase === "body" ? fail : async () => {},
      phase === "body" ? {} : { [phase]: fail }), new RegExp(`Controlled ${phase} failure`));
    assert.deepEqual(names.map(name => Object.getOwnPropertyDescriptor(globalThis, name)), saved);
    assert.deepEqual(Object.getOwnPropertyDescriptor(Date, "now"), savedNow);
  }
});

const OLD_WINDOW = "          queueMicrotask(() => scheduleAutomaticRef.current());\n";
const NEW_WINDOW = "          queueMicrotask(() => {\n"
  + "            if (mountedRef.current) scheduleAutomaticRef.current();\n          });\n";
const printer = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed });
const printed = (node, ast) => lf(printer.printNode(ts.EmitHint.Unspecified, node, ast));
function restore(source) {
  const text = lf(source), ast = parse(text), owner = ownerOf(ast);
  assert.equal(ast.parseDiagnostics.length, 0, "valid actual source syntax");
  assert.equal(text.split(NEW_WINDOW).length - 1, 2, "exact two reviewed windows");
  const declarations = owner.body.statements.filter(ts.isVariableStatement)
    .flatMap(node => [...node.declarationList.declarations]);
  for (const name of ["runRound", "retryHydration"]) {
    const declaration = only(declarations.filter(node => node.name.getText(ast) === name), `one ${name}`);
    const tries = [], queues = [];
    const visit = node => {
      if (ts.isTryStatement(node) && node.finallyBlock) tries.push(node);
      if (ts.isCallExpression(node) && node.expression.getText(ast) === "queueMicrotask") queues.push(node);
      ts.forEachChild(node, visit);
    };
    visit(declaration.initializer);
    const block = only(tries, "one owner finally").finallyBlock;
    const call = only(queues, "one owned queued callback");
    assert.equal(sha(printed(call, ast)), "482250cdd5a2e4418b915cbf241d2a8916edce004395e1d570a111cc9ede3199");
    const branch = block.statements.at(-1);
    assert.ok(ts.isIfStatement(branch) && ts.isBlock(branch.thenStatement) && !branch.elseStatement);
    assert.equal(branch.expression.getText(ast), name === "runRound"
      ? 'origin === "automatic" && trailingRoundRef.current' : "trailingRoundRef.current");
    assert.equal(branch.thenStatement.statements.length, 2);
    assert.equal(branch.thenStatement.statements[0].getText(ast), "trailingRoundRef.current = false;");
    assert.equal(branch.thenStatement.statements[1], call.parent, "callback remains at its original owned site");
  }
  return text.replaceAll(NEW_WINDOW, OLD_WINDOW);
}
function assertOriginal(source) {
  const text = lf(source), ast = parse(text), owner = ownerOf(ast);
  const finalReturn = owner.body.statements.at(-1);
  assert.equal(sha(text), "b549f820e4ddbc6d2ff9778b5b3ee25014140865df34786370cfcfbb075022f8");
  assert.equal(sha(text.replaceAll("\n", "\r\n")), "d1c29a668c8736825eafb87558d10535e582743acaae9cb5eb98d2c74fed94a0");
  assert.equal(sha(owner.getText(ast)), "3f233cbb6655cab671034f1e7c9615362d8f234672dc4923301fd4317a09972e");
  assert.equal(sha(owner.getText(ast).replaceAll("\n", "\r\n")), "e09a62966973e899cc082b807309c0931e9ac1380781b425170d8f6d00f4d68b");
  assert.equal(sha(text.slice(0, owner.getStart(ast)) + text.slice(owner.end)), "3e1e392a230552a57ccdc640fb0baac59eb56f64fb5424445aa7b079c5a00132");
  assert.equal(sha(text.slice(owner.getStart(ast), finalReturn.getStart(ast))), "4b754c0f53a21e4676c64b32a0c43b0ccb43760c0c6062d4f3552ccc25d780a1");
}

test("strict two-owner reversal preserves all original source and dependency fingerprints", () => {
  assert.equal(sha(OLD_WINDOW), "9aef07eff97dfc8e7b19db1e11630ac2b6a0a5405bb19fc9121f6ecc5f5370ec");
  assert.equal(sha(NEW_WINDOW), "f2b9615dce94ffb62da77fe06e5e9f13b37e290d74d91d435c75a537eebe883e");
  for (const newline of ["\n", "\r\n"]) assertOriginal(restore(lf(cityBriefPreservation("Frontend/src/city.tsx", originalSource)).replaceAll("\n", newline)));
  assert.equal(sha(lf(apiSource)), "2bdccf5c79ccf5a72f9696df00a924ff918a82c6cf8e4f15ba2a69b39e7cd2b8");
  const ast = parse(originalSource);
  const pool = only(ast.statements.filter(node => ts.isFunctionDeclaration(node)
    && node.name?.text === "fetchCityChurnPool"), "actual unchanged pool");
  assert.equal(sha(lf(pool.getText(ast))), "6603f4a9600b611d1023d62f6022c6062c145a48ec225824699c62d20f39bb2e");
  assert.equal(sha(themeSource.match(/export const UNCOMMITTED_AGE_H\s*=\s*\d+;/)[0]),
    "478ad974db6562a36e19b1b84b6fc505c5a9135026a6eb48bd8dd4a618b158c7");
});

test("strict reversal rejects partial, moved, duplicated and altered dispatch guards", () => {
  const source = lf(originalSource);
  const variants = [
    source.replaceAll(NEW_WINDOW, OLD_WINDOW), source.replace(NEW_WINDOW, OLD_WINDOW),
    source.replace(NEW_WINDOW, NEW_WINDOW + NEW_WINDOW),
    source.replace("const runRound = useCallback", "const anotherOwner = useCallback"),
    source.replace(NEW_WINDOW, "          if (mountedRef.current) {\n" + OLD_WINDOW + "          }\n"),
    source.replace(NEW_WINDOW, NEW_WINDOW.replace("mountedRef.current", "!mountedRef.current")),
    source.replace(NEW_WINDOW, NEW_WINDOW.replace("mountedRef.current", "capturedMounted")),
    source.replace(NEW_WINDOW, NEW_WINDOW.replace("scheduleAutomaticRef.current()", "scheduleAutomatic()")),
    source.replace(NEW_WINDOW, NEW_WINDOW.replace(";\n          });", "; else scheduleAutomaticRef.current();\n          });")),
    source.replace(NEW_WINDOW, NEW_WINDOW.replace("          });", "            unrelated();\n          });")),
    source.replace(NEW_WINDOW, "").replace("  const cityReady =", NEW_WINDOW + "  const cityReady ="),
  ];
  for (const variant of variants) {
    assert.notEqual(variant, source, "negative mutation actually applies");
    for (const newline of ["\n", "\r\n"]) assert.throws(() => restore(variant.replaceAll("\n", newline)));
  }
});

test("immutable original fingerprints detect unrelated owner, helper and presentation changes", () => {
  const source = lf(cityBriefPreservation("Frontend/src/city.tsx", originalSource));
  for (const [before, after] of [
    ["mountedRef.current = false;", "mountedRef.current = true;"],
    ['if (repo.offline) return "fog";', 'if (repo.offline) return "sun";'],
    ["Math.min(6, repoIds.length)", "Math.min(7, repoIds.length)"],
    ['title="City"', 'title="Different City"'],
    ['from "./api";', 'from "./different-api";'],
  ]) {
    const variant = source.replace(before, after); assert.notEqual(variant, source);
    for (const newline of ["\n", "\r\n"]) assert.throws(() =>
      assertOriginal(restore(variant.replaceAll("\n", newline))));
  }
  assert.notEqual(sha(lf(apiSource).replace("10_000", "11_000")),
    "2bdccf5c79ccf5a72f9696df00a924ff918a82c6cf8e4f15ba2a69b39e7cd2b8");
});
