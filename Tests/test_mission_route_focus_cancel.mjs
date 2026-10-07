// Controlled synchronous-commit host, not native React/DOM/browser execution.
// Extract ACTUAL CURRENT callback/effect declarations; never restore historical
// runtime source or evaluate built JS. Intended owner: Tests/test_mission_route_focus_cancel.mjs.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(resolve(ROOT, "Frontend/package.json"));
const ts = require("typescript");
const sha = value => createHash("sha256").update(value).digest("hex");
const read = name => readFileSync(resolve(ROOT, name));
const lf = value => value.replace(/\r\n/g, "\n");
const appText = read("Frontend/src/App.tsx").toString("utf8");
const appAst = ts.createSourceFile("App.tsx", appText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
assert.equal(appAst.parseDiagnostics.length, 0, "valid ACTUAL CURRENT App");
const all = node => {
  const result = [];
  const visit = current => {
    result.push(current);
    ts.forEachChild(current, visit);
  };
  visit(node);
  return result;
};
const one = (nodes, predicate, label) => {
  const matches = nodes.filter(predicate);
  assert.equal(matches.length, 1, label);
  return matches[0];
};
const appOwner = one(appAst.statements,
  node => ts.isFunctionDeclaration(node) && node.name?.text === "App", "one CURRENT App owner");
const appNodes = all(appOwner);
const local = name => one(appOwner.body.statements,
  node => ts.isVariableStatement(node) && node.declarationList.declarations
    .some(item => item.name.getText(appAst) === name), "CURRENT App local " + name);
const effect = marker => one(appOwner.body.statements,
  node => ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)
    && node.expression.expression.getText(appAst) === "useEffect"
    && node.expression.arguments[0]?.getText(appAst).includes(marker), marker);

const focusEffect = effect("const request = routeFocusRequest;");
const popstateEffect = effect("const onPopState = () => {");
const preserved = [
  ["navigate", local("navigate"), "a601dd8e57734f95c61452ee22bc168fbd7eb9bbdd15b27bbb4aef2de66c687e"],
  ["popstate", popstateEffect, "c826c945497b8c2364cf21a2d6a937c3d09d5dc1ea8441334e37a3f53c87073e"],
  ["route focus effect", focusEffect, "b6f9831a321b5f283a982b2e7d1d60b898bbec11360d71d47e8a11d04f7df747"],
  ["consumeInitialDayScopeAction", local("consumeInitialDayScopeAction"),
    "507382f3b30b7257552209970b3bd0713e858db0ef3eca97d8a9e0e11a4339cc"],
];
for (const [name, node, hash] of preserved) {
  assert.equal(sha(lf(node.getText(appAst))), hash, "complete untouched CURRENT " + name);
}

// Deliberately fail until CURRENT source contains the reviewed additive callback.
const cancelStatement = local("cancelMissionRouteFocus");
const expectedCancel = `const cancelMissionRouteFocus = useCallback(() => {
    flushSync(() => setRouteFocusRequest(null));
  }, []);`;
assert.equal(lf(cancelStatement.getText(appAst)), expectedCancel,
  "EXACT reviewed CURRENT callback, no generation/snapshot/request side effects");
assert.equal(cancelStatement.end < local("consumeInitialDayScopeAction").getStart(appAst), true);
const cancelDeclaration = one(cancelStatement.declarationList.declarations,
  node => node.name.getText(appAst) === "cancelMissionRouteFocus", "one cancellation declaration");
const missionCall = one(appNodes, node => ts.isJsxSelfClosingElement(node)
  && node.tagName.getText(appAst) === "LazyMissionView", "one CURRENT Mission caller");
const wire = one(missionCall.attributes.properties, node => ts.isJsxAttribute(node)
  && node.name.getText(appAst) === "onSectionNavigation", "one optional callback wire");
assert.equal(wire.initializer.expression.getText(appAst), "cancelMissionRouteFocus");

const sourcePins = [
  ["Frontend/src/main.tsx", "c0b126cdce533a00247006a8efbb72c51b073c638a5764e0cb54d180e5f3f588"],
  ["Frontend/src/navigation.ts", "f22476d82cccafa88477d82cad9b831c9457310ccb6a508cb12cd66bcd110ff1"],
  ["Frontend/package-lock.json", "0c39bf19779991e4565e00845a061fc954afdfe988d9026c6c356957e2b02258"],
  ["Tests/test_workspace_readiness.mjs", "2ff4659b237bbbe7272b9fe194a691f9774c4145cd5b307739c2ce4f1f34f8d5"],
  ["Frontend/node_modules/react-dom/package.json", "d2f29e31bd48b833e48cd7bbf41f192e8ee4ff8da249fdbe10d4ac4114b8b12e"],
  ["Frontend/node_modules/react-dom/cjs/react-dom.development.js",
    "1459b808bc6991de5a1ec3a86d8beee32dbb6c14282cf13f84e00dfebfbdc025"],
];
for (const [name, hash] of sourcePins) assert.equal(sha(read(name)), hash, "installed/source RAW " + name);
const reactDomPackage = JSON.parse(read("Frontend/node_modules/react-dom/package.json"));
assert.equal(reactDomPackage.version, "18.3.1");
const mainText = read("Frontend/src/main.tsx").toString("utf8");
assert.match(mainText, /ReactDOM\.createRoot\(document\.getElementById\("root"\)!\)\.render\(/);
assert.doesNotMatch(mainText, /ReactDOM\.render\(|hydrateRoot\(/);

const reactDomText = read("Frontend/node_modules/react-dom/cjs/react-dom.development.js").toString("utf8");
const reactDomAst = ts.createSourceFile("installed-react-dom.js", reactDomText,
  ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
assert.equal(reactDomAst.parseDiagnostics.length, 0);
// Installed development functions are nested in an env-guarded IIFE, not at
// SourceFile.statements. Walk actual syntax without spread-argument limits.
const reactDomNodes = all(reactDomAst);
const vendor = name => one(reactDomNodes, node => ts.isFunctionDeclaration(node)
  && node.name?.text === name, "one installed vendor function " + name);
const compact = value => value.replace(/\s+/g, "");
const sourceOfVendor = name => vendor(name).getText(reactDomAst);
const vendorFlush = sourceOfVendor("flushSync");
assert.match(vendorFlush, /setCurrentUpdatePriority\(DiscreteEventPriority\)/);
assert.match(vendorFlush, /finally\s*\{/);
assert.match(vendorFlush, /flushSyncCallbacks\(\)/);
assert.match(sourceOfVendor("performSyncWorkOnRoot"), /flushPassiveEffects\(\)/);
const syncPassive = one(all(vendor("commitRootImpl")), node => ts.isIfStatement(node)
  && compact(node.expression.getText(reactDomAst))
    === "includesSomeLane(pendingPassiveEffectsLanes,SyncLane)&&root.tag!==LegacyRoot",
  "actual non-Legacy SyncLane synchronous passive gate");
assert.equal(compact(syncPassive.thenStatement.getText(reactDomAst)), "{flushPassiveEffects();}");
const passive = sourceOfVendor("flushPassiveEffectsImpl");
assert.ok(passive.indexOf("commitPassiveUnmountEffects(root.current)")
  < passive.indexOf("commitPassiveMountEffects(root, root.current, lanes, transitions)"));

// Compile only declarations extracted from ACTUAL CURRENT source. This host
// explicitly models the pinned synchronous commit/cleanup ordering. It does not
// mount ReactDOM, provide a browser, execute built JS, or certify native timing.
async function factory(expression, names) {
  const source = `export function instantiate(environment) {
    const { ${names.join(",")} } = environment;
    return (${expression});
  }`;
  const result = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
  }, reportDiagnostics: true });
  assert.equal(result.diagnostics?.length ?? 0, 0);
  return (await import("data:text/javascript;base64," + Buffer.from(result.outputText).toString("base64"))).instantiate;
}
const createCancel = await factory(cancelDeclaration.initializer.getText(appAst),
  ["useCallback", "flushSync", "setRouteFocusRequest"]);
const createFocusEffect = await factory(focusEffect.expression.arguments[0].getText(appAst), [
  "routeFocusRequest", "mainRef", "routeGenerationRef", "view", "membershipReady",
  "statsState", "currentScopeKey", "routeFocusFailureGenerationRef", "document", "window",
  "MutationObserver", "hasOverlayLease", "prefersReducedMotion", "setRouteFocusRequest",
]);

function controlledHost(overrides = {}) {
  const events = [], frames = new Map(), observers = [];
  const state = { generation: 1, request: { generation: 1, scrollTop: 700 },
    pending: false, overlay: false, failure: null, ...overrides };
  let nextFrame = 0, cleanup, initialized = false, pendingUpdate, insideFlush = false;
  class Element {
    constructor(name) { this.name = name; this.isConnected = true; this.inert = false; this.attributes = new Set(); }
    hasAttribute(name) { return this.attributes.has(name); }
    closest() { return this.inert ? this : null; }
    focus(options) { events.push(["focus", this.name, options]); }
    scrollIntoView(options) { events.push(["scroll", this.name, options]); }
  }
  const main = new Element("main"), heading = new Element("Mission heading");
  main.scrollTop = 17; main.scrollHeight = 1500; main.clientHeight = 400;
  main.contains = target => target.isConnected && (target === heading || target === state.failure);
  main.querySelector = selector => selector.includes("#lazy-view-failure") ? state.failure
    : selector.includes("data-route-hydration-ready") ? (state.pending ? {} : null)
    : selector === "[data-view-heading]" ? heading : null;
  const environment = {
    routeFocusRequest: state.request, mainRef: { current: main },
    routeGenerationRef: { get current() { return state.generation; } },
    routeFocusFailureGenerationRef: { current: null }, view: "mission",
    membershipReady: true, statsState: { key: "all", settled: true }, currentScopeKey: "all",
    document: { getElementById() { return null; } },
    window: {
      requestAnimationFrame(fn) { frames.set(++nextFrame, fn); return nextFrame; },
      cancelAnimationFrame(id) { events.push(["cancel-frame", id]); frames.delete(id); },
    },
    MutationObserver: class {
      constructor(callback) { this.callback = callback; this.active = false; observers.push(this); }
      observe() { this.active = true; }
      disconnect() { this.active = false; events.push(["disconnect"]); }
    },
    hasOverlayLease: () => state.overlay, prefersReducedMotion: () => true,
    setRouteFocusRequest(update) {
      events.push(["set-request", typeof update === "function" ? "updater" : update]);
      if (insideFlush) pendingUpdate = update;
      else commit(update);
    },
  };
  const mount = () => {
    environment.routeFocusRequest = state.request;
    cleanup = createFocusEffect(environment)();
    initialized = true;
  };
  const commit = update => {
    const next = typeof update === "function" ? update(state.request) : update;
    if (Object.is(next, state.request)) return;
    state.request = next;
    events.push(["commit", next]);
    cleanup?.(); cleanup = undefined;
    mount();
  };
  const cancel = createCancel({
    useCallback(fn, deps) { assert.deepEqual(deps, []); return fn; },
    setRouteFocusRequest: environment.setRouteFocusRequest,
    flushSync(fn) {
      events.push(["flush-start"]); pendingUpdate = undefined;
      insideFlush = true;
      try { fn(); } finally { insideFlush = false; }
      assert.notEqual(pendingUpdate, undefined, "actual callback schedules its null update");
      commit(pendingUpdate); pendingUpdate = undefined;
      events.push(["flush-return"]);
    },
  });
  mount();
  return {
    state, main, heading, events, frames, observers, cancel,
    replay() { assert.ok(initialized); cleanup?.(); cleanup = undefined; mount(); },
    publish(request) { state.generation = request.generation; commit(request); },
    mutate() { for (const observer of observers) if (observer.active) observer.callback(); },
    frame() { const first = frames.entries().next().value; assert.ok(first); frames.delete(first[0]); first[1](); },
    cleanup() { cleanup?.(); cleanup = undefined; },
  };
}

test("CONTROLLED HOST: queued Back-focus frame is cancelled before callback returns", () => {
  const host = controlledHost(); const generation = host.state.generation;
  assert.equal(host.frames.size, 1);
  const obsoleteFrame = [...host.frames.values()][0], obsoleteObserver = host.observers[0].callback;
  host.cancel();
  assert.equal(host.state.request, null); assert.equal(host.state.generation, generation);
  assert.equal(host.frames.size, 0); assert.equal(host.observers[0].active, false);
  assert.ok(host.events.findIndex(row => row[0] === "cancel-frame")
    < host.events.findIndex(row => row[0] === "flush-return"));
  obsoleteFrame(); obsoleteObserver();
  assert.equal(host.frames.size, 0);
  assert.deepEqual(host.events.filter(row => row[0] === "focus" || row[0] === "scroll"), []);
  assert.equal(host.main.scrollTop, 17, "cancel itself does not perform the local jump");
  host.cleanup();
});

test("CONTROLLED HOST: waiting hydration observer cannot enqueue after cancellation or replay", () => {
  const host = controlledHost({ pending: true });
  assert.equal(host.frames.size, 0); const obsolete = host.observers[0].callback;
  host.cancel(); host.state.pending = false; host.mutate(); obsolete();
  host.replay(); host.mutate();
  assert.equal(host.state.request, null); assert.equal(host.frames.size, 0);
  assert.deepEqual(host.events.filter(row => row[0] === "focus" || row[0] === "scroll"), []);
  host.cleanup();
});

test("CONTROLLED HOST: repeated null cancellation stays inert and does not publish an intent", () => {
  const host = controlledHost(); host.cancel();
  const generation = host.state.generation, observers = host.observers.length;
  host.cancel(); host.cancel(); host.replay(); host.mutate();
  assert.equal(host.state.request, null); assert.equal(host.state.generation, generation);
  assert.equal(host.observers.length, observers); assert.equal(host.frames.size, 0);
  assert.deepEqual(host.events.filter(row => row[0] === "focus" || row[0] === "scroll"), []);
  host.cleanup();
});

test("CONTROLLED HOST: genuinely new navigation keeps independent focus ownership", () => {
  const host = controlledHost(); host.cancel();
  host.publish({ generation: 2, scrollTop: 0 });
  assert.equal(host.frames.size, 1); host.frame();
  assert.deepEqual(host.events.filter(row => row[0] === "focus")
    .map(row => row.slice(0, 2)), [["focus", "Mission heading"]]);
  assert.equal(host.main.scrollTop, 0); assert.equal(host.state.generation, 2);
  assert.equal(host.state.request, null, "actual fresh owner consumes its request");
  host.cleanup();
});

test("SOURCE PROOF ONLY: exact installed React18 createRoot synchronous cleanup predicates", () => {
  assert.equal(reactDomPackage.version, "18.3.1");
  assert.equal(sha(read("Frontend/node_modules/react-dom/cjs/react-dom.development.js")), sourcePins.at(-1)[1]);
  assert.equal(compact(syncPassive.thenStatement.getText(reactDomAst)), "{flushPassiveEffects();}");
});
