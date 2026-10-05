import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(resolve(root, "Frontend/package.json"));
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const source = readFileSync(resolve(root, "Frontend/src/App.tsx"), "utf8");
const tree = ts.createSourceFile("App.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const app = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "App");
const find = predicate => {
  const found = [];
  const visit = node => { if (predicate(node)) found.push(node); ts.forEachChild(node, visit); };
  visit(app);
  assert.equal(found.length, 1, "one actual source node");
  return found[0];
};
const compile = (parameters, code) => new Function(...parameters,
  ts.transpileModule(code, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React,
  } }).outputText);
const expression = (node, context) => compile(Object.keys(context), `return (${node.getText(tree)});`)
  (...Object.values(context));
const variable = name => find(node => ts.isVariableDeclaration(node) && node.name.getText(tree) === name);
const effect = text => find(node => ts.isCallExpression(node) && node.expression.getText(tree) === "useEffect"
  && node.arguments[0]?.getText(tree).includes(text)).arguments[0];
const context = (extra = {}) => ({ workspaceReady: false, membershipReady: true, error: "",
  scope: { kind: "all" }, scopeLabel: () => "All repos", ...extra });
const unwrap = node => ts.isParenthesizedExpression(node) ? unwrap(node.expression) : node;
const jsxName = node => ts.isJsxElement(node) ? node.openingElement.tagName.getText(tree)
  : ts.isJsxSelfClosingElement(node) ? node.tagName.getText(tree) : null;
const callerGate = name => find(node => ts.isBinaryExpression(node)
  && jsxName(unwrap(node.right)) === name).left;

test("actual workspace view callers reject bootstrap arrays but preserve accepted snapshots", () => {
  for (const [name, view] of [["ChangesView", "changes"], ["HistoryView", "history"]]) {
    const gate = callerGate(name);
    for (const error of ["", "first sync failed"]) {
      assert.equal(expression(gate, context({ view, error })), false, `${name} initial ${error}`);
      assert.equal(expression(gate, context({ view, error, workspaceReady: true })), true);
    }
    assert.equal(expression(gate, context({ view, workspaceReady: true, membershipReady: false })), false);
  }
  for (const view of ["mission", "overview"]) {
    const gate = find(node => ts.isBinaryExpression(node)
      && jsxName(unwrap(node.right)) === "LazyViewBoundary"
      && node.left.getText(tree).includes(`view === "${view}"`)).left;
    assert.equal(expression(gate, context({ view })), true, `${view} keeps independent owners`);
  }
});

test("actual hydration placeholder separates waiting and failure without empty success", () => {
  const node = find(node => ts.isBinaryExpression(node) && jsxName(unwrap(node.right)) === "section"
    && node.right.getText(tree).includes("Waiting for the latest complete repository snapshot"));
  for (const view of ["changes", "history"]) {
    for (const error of ["", "unavailable"]) {
      const output = expression(node, { React, ...context({ view, error }) });
      const html = renderToStaticMarkup(output);
      assert.match(html, error ? /Workspace snapshot unavailable/ : /Waiting for workspace snapshot/);
      assert.match(html, error ? /data-route-hydration-failure="true"/ : /data-route-hydration-ready="false"/);
      assert.doesNotMatch(html, /repo is clean|No online repositories/);
    }
  }
  assert.equal(expression(node, { React, ...context({ view: "changes", workspaceReady: true }) }), false);
});

test("actual Focus and Digest controls expose the workspace readiness reason", () => {
  for (const error of ["", "first sync failed"]) {
    const values = context({ error });
    values.scopeUnavailableReason = expression(variable("scopeUnavailableReason").initializer, values);
    // The implementation shares this reason between palette and Tools controls.
    const reason = variable("workspaceUnavailableReason");
    values.workspaceUnavailableReason = expression(reason.initializer, values);
    assert.match(values.workspaceUnavailableReason, error ? /unavailable/ : /Waiting/);
    for (const label of ["Enter focus mode", "digestActionLabel"]) {
      const entry = find(node => ts.isObjectLiteralExpression(node) && node.properties.some(property =>
        ts.isPropertyAssignment(property) && property.name.getText(tree) === "label"
        && property.initializer.getText(tree) === (label === "digestActionLabel" ? label : JSON.stringify(label))));
      const disabled = entry.properties.find(property => ts.isPropertyAssignment(property)
        && property.name.getText(tree) === "disabledReason").initializer;
      assert.equal(expression(disabled, { ...values, digestBusy: false }), values.workspaceUnavailableReason);
    }
    const controls = [];
    const visit = node => {
      if (ts.isJsxElement(node) && node.openingElement.tagName.getText(tree) === "ControlButton"
          && /^(Enter focus mode|\{digestActionLabel\})$/.test(node.children.map(child => child.getText(tree)).join("").trim())) {
        controls.push(node.openingElement);
      }
      ts.forEachChild(node, visit);
    };
    visit(app);
    assert.equal(controls.length, 2);
    for (const control of controls) {
      const disabled = control.attributes.properties.find(property => property.name?.getText(tree) === "disabled");
      assert.equal(expression(disabled.initializer.expression, { ...values, digestBusy: false }), true);
    }
  }
});

test("actual Digest callback refuses initial pending/error without starting requests or downloads", () => {
  const callback = variable("doDigest").initializer.arguments[0];
  for (const error of ["", "unavailable"]) {
    const notes = [], announcements = [];
    const run = expression(callback, { ...context({ error }), digestStateRef: { current: { kind: "idle" } },
      setDigestNote: value => notes.push(value), announceStatus: value => announcements.push(value),
      createActionDeadline: () => assert.fail("bootstrap data must not prepare a digest") });
    run();
    assert.equal(notes.length, 1);
    assert.deepEqual(notes, announcements);
    assert.match(notes[0], error ? /unavailable/i : /waiting/i);
  }
});

test("actual Focus dialog owner rejects bootstrap activation without disturbing other dialogs", () => {
  const callback = variable("openDialog").initializer.arguments[0];
  for (const ready of [false, true]) for (const member of [false, true]) {
    for (const kind of ["focus", "health", "wrapped"]) {
      const opened = [], ownership = [];
      const accept = kind !== "focus" || ready && member;
      expression(callback, {
        workspaceReadyRef: { current: ready }, membershipReadyRef: { current: member },
        suppressDisclosureFocusRestore: () => ownership.push("suppress"),
        setPanelOpen() {}, setMoreOpen() {}, setShowLegend() {}, setShellPanel() {}, setPaletteOpen() {},
        setActiveDialog: update => opened.push(update(null)),
      })({ kind });
      assert.equal(opened.length, Number(accept));
      assert.equal(ownership.length, Number(accept));
    }
  }
  assert.equal(variable("openDialog").initializer.arguments[1].getText(tree), "[]",
    "shared dialog callback identity remains stable");
});

test("actual Digest still prepares accepted empty and retained snapshots", async () => {
  const callback = variable("doDigest").initializer.arguments[0];
  for (const error of ["", "refresh failed"]) for (const repos of [[], [{ id: "EA" }]]) {
    const states = [], calls = [];
    const prepared = { filename: "fixture.html", blob: {} };
    const ref = { current: null };
    const run = expression(callback, { ...context({ workspaceReady: true, error }), repos, tasks: [], events: [],
      digestStateRef: { current: { kind: "idle" } }, currentScopeKey: "all", digestScopeKeyRef: { current: "all" },
      digestGenerationRef: { current: 0 }, digestControllerRef: ref,
      setDigestNote() {}, announceStatus() {}, setDigestStatus: value => states.push(value),
      scopeApiId: () => undefined, isAbortError: () => false,
      createActionDeadline: () => ({ controller: {}, signal: { aborted: false }, clear() {} }),
      prepareDigest: (...args) => { calls.push(args); return Promise.resolve(prepared); },
    });
    run();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls.length, 1);
    assert.equal(calls[0][1], repos);
    assert.deepEqual(states.map(value => value.kind), ["preparing", "ready"]);
    assert.equal(states[1].prepared, prepared);
    assert.equal(ref.current, null);
  }
});

function focusHarness(extra={}) {
  const events=[], frames=new Map(), observers=[];
  const state={generation:1,request:{generation:1,scrollTop:0,targetId:"sec-pick"},
    failure:null,pending:false,history:null,overlay:false,...extra};
  let frameId=0;
  class Element {
    constructor(name){this.name=name;this.isConnected=true;this.inert=false;this.attributes=new Set();}
    hasAttribute(name){return this.attributes.has(name);}
    closest(){return this.inert?this:null;}
    focus(options){events.push(["focus",this.name,options]);}
    scrollIntoView(options){events.push(["scroll",this.name,options]);main.scrollTop=450;}
  }
  const main=new Element("main"),heading=new Element("heading"),pick=new Element("pick");
  main.scrollTop=17;main.scrollHeight=1000;main.clientHeight=400;
  state.heading=heading;state.pick=pick;
  main.contains=target=>target.isConnected && (target===state.heading || target===state.pick || target===state.failure);
  main.querySelector=selector=>{
    if(selector.includes("#lazy-view-failure")) return state.failure;
    if(selector.includes("data-route-hydration-ready")) return state.pending?{}:null;
    if(selector==="[data-history-ready]") return state.history;
    if(selector==="[data-view-heading]") return state.heading;
    return null;
  };
  const generationRef={get current(){return state.generation;}}, mainRef={current:main};
  const failureGenerationRef={current:null};
  const env={routeFocusRequest:state.request,mainRef,routeGenerationRef:generationRef,
    routeFocusFailureGenerationRef:failureGenerationRef,
    view:"changes",membershipReady:true,currentScopeKey:"all",statsState:{key:"all",settled:true},
    ...extra,
    HTMLElement:Element,document:{getElementById:id=>id==="sec-pick"?state.pick:null},
    hasOverlayLease:()=>state.overlay,prefersReducedMotion:()=>true,
    setRouteFocusRequest:update=>{state.request=typeof update==="function"?update(state.request):update;},
    window:{requestAnimationFrame:fn=>{frames.set(++frameId,fn);return frameId;},
      cancelAnimationFrame:id=>frames.delete(id)},
    MutationObserver:class {
      constructor(callback){this.callback=callback;this.active=false;observers.push(this);}
      observe(){this.active=true;}
      disconnect(){this.active=false;}
    },
  };
  const mount=()=>{
    env.routeFocusRequest=state.request;
    return expression(effect("const request = routeFocusRequest"),env)();
  };
  return {state,main,heading,pick,mainRef,failureGenerationRef,events,frames,observers,Element,mount,
    mutate(){for(const observer of observers)if(observer.active)observer.callback();},
    frame(){const next=frames.entries().next().value;assert.ok(next,"one queued focus frame");frames.delete(next[0]);next[1]();},
  };
}

test("pick navigation has one generation-owned focus request instead of competing frame effects",()=>{
  assert.doesNotMatch(source,/const \[pendingScroll, setPendingScroll\]/);
  assert.doesNotMatch(source,/setPendingScroll\(/);
  const navigate=variable("navigate").initializer.arguments[0].getText(tree);
  assert.match(navigate,/targetId:/);
  assert.match(navigate,/options\.pendingScroll/);
  const setters=[];
  const visit=node=>{
    if(ts.isCallExpression(node)&&node.expression.getText(tree)==="setRouteFocusRequest")setters.push(node);
    ts.forEachChild(node,visit);
  };
  visit(variable("navigate").initializer.arguments[0]);
  assert.equal(setters.length,1,"navigation publishes one focus intent");
  const first=expression(setters[0].arguments[0],{options:{pendingScroll:"sec-pick"},generation:1,target:{view:"changes"}});
  const repeated=expression(setters[0].arguments[0],{options:{pendingScroll:"sec-pick"},generation:2,target:{view:"changes"}});
  assert.deepEqual(first,{generation:1,scrollTop:0,targetId:"sec-pick"});
  assert.deepEqual(repeated,{generation:2,scrollTop:0,targetId:"sec-pick"});
  assert.equal(expression(setters[0].arguments[0],{options:{},generation:3,target:{view:"changes"}}),null);
  const h=focusHarness();const cleanup=h.mount();
  assert.equal(h.frames.size,1);h.frame();
  assert.deepEqual(h.events.map(row=>row.slice(0,2)),[["focus","pick"],["scroll","pick"]]);
  assert.equal(h.main.scrollTop,450,"pick scroll must not be overwritten by the view heading");
  assert.equal(h.state.request,null);cleanup?.();
});

test("actual route focus waits for hydration and re-queries a live target inside its frame",()=>{
  const h=focusHarness({pending:true});const cleanup=h.mount();
  assert.equal(h.frames.size,0);
  h.state.pending=false;h.mutate();assert.equal(h.frames.size,1);
  const old=h.pick;old.isConnected=false;
  h.state.pick=new h.Element("replacement-pick");h.frame();
  assert.deepEqual(h.events.map(row=>row.slice(0,2)),[["focus","replacement-pick"],["scroll","replacement-pick"]]);
  assert.equal(h.state.request,null);cleanup?.();
});

test("accepted missing picks fall back to the view heading without a phantom later scroll",()=>{
  const h=focusHarness();h.state.pick=null;const cleanup=h.mount();h.frame();
  assert.deepEqual(h.events.map(row=>row.slice(0,2)),[["focus","heading"]]);
  assert.equal(h.main.scrollTop,0);assert.equal(h.state.request,null);
  h.state.pick=h.pick;h.mutate();assert.equal(h.frames.size,0);cleanup?.();
});

test("old navigation generations and cleaned effects cannot clear or focus a newer owner",()=>{
  for(const cleanFirst of [false,true]) {
    const h=focusHarness();const cleanup=h.mount();const saved=[...h.frames.values()][0];
    if(cleanFirst)cleanup?.();
    h.state.generation=2;const next={generation:2,scrollTop:0,targetId:"sec-pick"};h.state.request=next;
    saved();assert.equal(h.events.length,0);assert.equal(h.state.request,next);cleanup?.();
  }
  const h=focusHarness();const cleanup=h.mount();const saved=[...h.frames.values()][0];cleanup?.();saved();
  assert.equal(h.events.length,0,"same-generation unmount is also fenced");
});

test("overlay, inert and detached ownership suppress and consume a pending focus handoff",()=>{
  for(const block of ["overlay","main-inert","target-inert","main-detached"]) {
    const h=focusHarness();const cleanup=h.mount();
    if(block==="overlay")h.state.overlay=true;
    if(block==="main-inert")h.main.inert=true;
    if(block==="target-inert")h.pick.inert=true;
    if(block==="main-detached")h.main.isConnected=false;
    h.frame();assert.equal(h.events.length,0,block);assert.equal(h.state.request,null,block);
    h.state.overlay=false;h.main.inert=false;h.pick.inert=false;h.main.isConnected=true;
    h.mutate();assert.equal(h.frames.size,0,"released overlays must not resurrect navigation focus");cleanup?.();
  }
});

test("first hydration failure consumes pick navigation and retry cannot resurrect it",()=>{
  const h=focusHarness({pending:true});const cleanup=h.mount();
  const failure=new h.Element("failure");h.state.failure=failure;h.mutate();h.frame();
  assert.deepEqual(h.events.map(row=>row.slice(0,2)),[["focus","failure"]]);
  assert.equal(h.state.request,null);
  h.state.failure=null;h.state.pending=false;h.mutate();assert.equal(h.frames.size,0);cleanup?.();
});

test("frame-time hydration changes stay pending and removed errors do not revive the pick target",()=>{
  const h=focusHarness();const cleanup=h.mount();
  h.state.pending=true;h.frame();assert.equal(h.events.length,0);assert.notEqual(h.state.request,null);
  h.state.failure=new h.Element("failure");h.mutate();
  h.state.failure=null;h.state.pending=false;h.frame();
  assert.equal(h.state.request,null);assert.ok(h.events.every(row=>row[1]!=="pick"));cleanup?.();
});

test("first hydration failure survives effect cleanup and dependency replay before its frame",()=>{
  const h=focusHarness({pending:true});const cleanup=h.mount();
  h.state.failure=new h.Element("failure");h.mutate();assert.equal(h.frames.size,1);
  cleanup();
  h.state.failure=null;h.state.pending=false;
  const replayCleanup=h.mount();h.frame();
  assert.deepEqual(h.events.map(row=>row.slice(0,2)),[["focus","heading"]]);
  assert.equal(h.state.request,null,"a recovered render consumes the failed intent without reviving its anchor");
  replayCleanup();
});

test("a new navigation does not inherit the previous generation's hydration failure",()=>{
  const h=focusHarness({pending:true});const cleanup=h.mount();
  h.state.failure=new h.Element("failure");h.mutate();cleanup();
  h.state.failure=null;h.state.pending=false;h.state.generation=2;
  h.state.request={generation:2,scrollTop:0,targetId:"sec-pick"};
  const nextCleanup=h.mount();h.frame();
  assert.deepEqual(h.events.map(row=>row.slice(0,2)),[["focus","pick"],["scroll","pick"]]);
  assert.equal(h.state.request,null);nextCleanup();
});

test("obsolete effect callbacks cannot record failure against a newer request generation",()=>{
  for(const cleanupFirst of [false,true]) {
    const h=focusHarness({pending:true});const oldCleanup=h.mount();const obsolete=h.observers[0].callback;
    if(cleanupFirst)oldCleanup();
    h.state.generation=2;h.state.request={generation:2,scrollTop:0,targetId:"sec-pick"};h.state.pending=false;
    const currentCleanup=h.mount();
    h.state.failure=new h.Element("stale-callback-failure");obsolete();
    assert.equal(h.failureGenerationRef.current,null);
    h.state.failure=null;h.frame();
    assert.deepEqual(h.events.map(row=>row.slice(0,2)),[["focus","pick"],["scroll","pick"]]);
    oldCleanup();currentCleanup();
  }
});

test("Back restoration keeps saved scroll and History waits for its accepted render",()=>{
  const h=focusHarness({view:"history",request:{generation:1,scrollTop:800},history:{dataset:{historyReady:"false"}}});
  const cleanup=h.mount();assert.equal(h.frames.size,0);
  h.state.history.dataset.historyReady="true";h.mutate();h.frame();
  assert.deepEqual(h.events.map(row=>row.slice(0,2)),[["focus","main"]]);
  assert.equal(h.main.scrollTop,600);assert.equal(h.state.request,null);cleanup?.();
});
