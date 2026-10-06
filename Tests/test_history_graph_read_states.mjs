import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { canonicalPrintedText } from "./helpers/printed_source.mjs";
import { restoreDiffDisclosureState } from "./helpers/diffDisclosureState.mjs";
import { restoreWarningTimestampOrder } from "./helpers/warningTimestampOrder.mjs";
import { restoreGitGraphBoundaryCopy } from "./helpers/gitGraphMergeSeed.mjs";
import { restoreChangesWorkbench } from "./helpers/changesWorkbench.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const frontend = resolve(root, "Frontend");
const require = createRequire(resolve(frontend, "package.json"));
const ts = require("typescript"), React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const source = readFileSync(resolve(frontend, "src/App.tsx"), "utf8");
const parse = (text) => ts.createSourceFile("App.tsx", text, ts.ScriptTarget.Latest, true);
const app = parse(source);
const all = (node) => {
  const found = [node];
  ts.forEachChild(node, (child) => { found.push(...all(child)); });
  return found;
};
const one = (nodes, predicate) => {
  const found = nodes.filter(predicate);
  assert.equal(found.length, 1, "one exact actual-source boundary");
  return found[0];
};
const history = one(app.statements, (node) => ts.isFunctionDeclaration(node)
  && node.name?.text === "HistoryView");
const declaration = (nodes, name, ast = app) => one(nodes, (node) =>
  ts.isFunctionDeclaration(node) ? node.name?.text === name : ts.isVariableStatement(node)
    && node.declarationList.declarations.some((item) => item.name.getText(ast) === name)).getText(ast);
const local = (name) => declaration(history.body.statements, name);
const graphNode = (ast) => one(all(ast), (node) => ts.isJsxExpression(node)
  && node.expression?.getText(ast).startsWith("showGraph &&"));
const graph = graphNode(app);
const jsxGate = (text) => one(all(history), (node) => ts.isJsxExpression(node)
  && node.expression && ts.isBinaryExpression(node.expression) && node.expression.getText(app).includes(text));
const errorPanel = jsxGate('id="history-load-failure"');
const bottom = jsxGate("No commits captured yet.");
const older = jsxGate("Load more (older)");
const toggle = one(all(history), (node) => ts.isJsxElement(node)
  && node.openingElement.tagName.getText(app) === "ControlButton"
  && node.getText(app).includes("onClick={toggleGraph}"));
const effect = (text) => one(all(history), (node) => ts.isCallExpression(node)
  && node.expression.getText(app) === "useEffect"
  && node.arguments[0]?.getText(app).includes(text)).arguments[0].getText(app);
const historyCall = one(all(app), (node) => ts.isJsxSelfClosingElement(node)
  && node.tagName.getText(app) === "HistoryView");
const reposAttribute = one(historyCall.attributes.properties, (node) =>
  ts.isJsxAttribute(node) && node.name.getText(app) === "repos");
let mount = historyCall.parent;
while (!ts.isJsxExpression(mount)) mount = mount.parent;
const compile = async (text) => import(`data:text/javascript;base64,${Buffer.from(
  ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React } }).outputText).toString("base64")}`);
const actualApi = await compile(readFileSync(resolve(frontend, "src/api.ts"), "utf8"));
const refNames = ["stateRef", "reposRef", "entriesRef", "exhaustedRef", "loadingRef", "loadErrorRef",
  "loadedRepoRef", "loadGenerationRef", "loadOwnerRef", "targetDepthRef", "showGraphRef",
  "graphGenerationRef", "graphOwnerRef", "graphRequestKeyRef", "graphRef"];
const stateNames = ["entries", "exhausted", "loading", "loadError", "showGraph", "graphSvg",
  "graphShown", "graphRows", "graphBusy", "graphFailure"];
const setters = stateNames.map((name) => `set${name[0].toUpperCase()}${name.slice(1)}`);
const ownerNames = ["disposeOwner", "cancelGraph", "cancelLoad", "runGraph", "runLoad",
  "clearRepoState", "toggleGraph", "retryGraph"];
const derived = ["repoId", "shownEntries", "requiredDepth", "historyHydrating", "branch", "semanticGraphKey"];
const subject = await compile(`
  export function derive(env) {
    const {repos,state,${refNames.concat(stateNames).join(",")}}=env;
    ${declaration(app.statements, "PAGE")}
    ${declaration(app.statements, "historyGraphKey")}
    ${derived.map(local).join("\n")}
    return {${derived.join(",")}};
  }
  export function owners(env,helpers,deps) {
    const useCallback=fn=>fn;
    const {api,isAbortError,createActionDeadline}=helpers;
    const {buildGitGraph,renderGitGraph,MermaidModuleLoadError}=deps;
    const {repoId,onStatus,graphBusy,${refNames.concat(setters).join(",")}}=env;
    ${declaration(app.statements, "PAGE")}
    ${declaration(app.statements, "historyGraphKey")}
    ${ownerNames.map(local).join("\n")}
    return {${ownerNames.join(",")}};
  }
  export function elements(React,env,deps,helpers) {
    const {DisclosureTable,ControlButton,fmtTs}=deps;
    const {createActionDeadline}=helpers;
    const {scopeKeyValue,onStateChange,${[...new Set(refNames.concat(stateNames,setters,derived,ownerNames))].join(",")}}=env;
    ${declaration(app.statements, "PAGE")}
    return {graph:<>${graph.getText(app)}</>,controls:<>
      ${toggle.getText(app)}${errorPanel.getText(app)}${bottom.getText(app)}${older.getText(app)}
    </>};
  }
  export function repoEffect(env,owners) {
    const {state,repoId,onStateChange,${refNames.join(",")}}=env;
    const {clearRepoState,runLoad}=owners;
    ${declaration(app.statements, "PAGE")}
    return (${effect("const targetDepth =")})();
  }
  export function adoptEffect(graphRef,graphSvg) { return (${effect("host.replaceChildren")})(); }
  export const onlineRepos=visibleRepos=>(${reposAttribute.initializer.expression.getText(app)});
  export const canMount=(membershipReady,workspaceReady,view)=>(${mount.expression.left.getText(app)});
`);
let vite, deps;
before(async () => {
  const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
  vite = await createServer({ root: frontend, server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom", optimizeDeps: { noDiscovery: true, entries: [] } });
  deps = Object.assign({}, ...await Promise.all(["mermaidGraph.ts", "accessibleData.tsx", "format.ts", "ui.tsx"]
    .map((name) => vite.ssrLoadModule(`/src/${name}`))));
});
after(async () => { await vite?.close(); });
const flush = async () => { for (let index = 0; index < 20; index += 1) await Promise.resolve(); };
const nodes = (value) => Array.isArray(value) ? value.flatMap(nodes)
  : React.isValidElement(value) ? [value, ...nodes(value.props.children)] : [];
const noEmpty = (html) => assert.doesNotMatch(html,
  /No commits (?:are available|to graph|captured yet)|exact data \u00b7 0 rows/);
const entries = (count) => Array.from({ length: count }, (_, index) => ({ commit: {
  hash: index.toString(16).padStart(40, "0"), message: `Commit ${index}`,
  ts: "2026-10-06T00:00:00Z", parents: "", files_json: "[]" }, events: [] }));

// Actual owners and API envelopes, controlled boundary effects, not React DOM/native paint.
async function withWorld (body) {
  const keys = ["window", "fetch", "DOMParser", "document"];
  const originals = Object.fromEntries(keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const requests = [], timers = new Map(), worlds = [];
  let timerId = 0, reloads = 0;
  const replace = (key, value) => Object.defineProperty(globalThis, key, { configurable: true, value });
  replace("window", { setTimeout(fn, ms) { const id = timerId++; timers.set(id, { fn, ms }); return id; },
    clearTimeout(id) { timers.delete(id); }, location: { reload() { reloads += 1; } } });
  replace("fetch", (url, init) => new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException("Aborted", "AbortError"));
    init.signal.addEventListener("abort", abort, { once: true });
    const settle = (value) => { init.signal.removeEventListener("abort", abort); resolve(value); };
    requests.push({ url, signal: init.signal,
      ok(data) { settle({ ok: true, json: async () => ({ success: true, data }) }); },
      fail() { settle({ ok: false, status: 503, json: async () => ({ success: false, message: "Controlled unavailable" }) }); },
    });
  }));
  function harness () {
    const state = { entries: [], exhausted: false, loading: false, loadError: "", showGraph: false,
      graphSvg: "", graphShown: 0, graphRows: [], graphBusy: false, graphFailure: null };
    const refs = Object.fromEntries(Object.entries({ stateRef: { repoId: "A", fetchDepth: 500, page: 1 },
      reposRef: [{ id: "A", branch: "main" }], entriesRef: [], exhaustedRef: false, loadingRef: false,
      loadErrorRef: "", loadedRepoRef: "", loadGenerationRef: 0, loadOwnerRef: null, targetDepthRef: 500,
      showGraphRef: false, graphGenerationRef: 0, graphOwnerRef: null, graphRequestKeyRef: "", graphRef: null,
    }).map(([name, current]) => [name, { current }]));
    const env = { ...refs, scopeKeyValue: '["all"]', onStatus: () => {},
      onStateChange(next) { refs.stateRef.current = next; } };
    for (const name of stateNames) env[`set${name[0].toUpperCase()}${name.slice(1)}`] = (next) => {
      state[name] = typeof next === "function" ? next(state[name]) : next;
    };
    let renderer = async (_entries, _branch, _context, prepared) => ({ svg: "<svg/>", meta: prepared });
    const h = { state, refs, env,
      context() { const context = { ...env, ...state, state: refs.stateRef.current, repos: refs.reposRef.current };
        return { ...context, ...subject.derive(context) }; },
      owners() { return subject.owners(h.context(), actualApi, { ...deps, renderGitGraph: (...args) => renderer(...args) }); },
      elements() { return subject.elements(React, { ...h.context(), ...h.owners() }, deps, actualApi); },
      html(part = "graph") { return renderToStaticMarkup(h.elements()[part]); },
      effect() { return subject.repoEffect(h.context(), h.owners()); },
      renderer(next) { renderer = next; },
      click(label, part = "controls") { one(nodes(h.elements()[part]), (node) =>
        typeof node.props.onClick === "function" && nodesText(node.props.children) === label).props.onClick(); },
      dispose() { h.owners().cancelLoad(); h.owners().cancelGraph(); },
    };
    worlds.push(h); return h;
  }
  try { await body({ harness, requests, timers, replace, reloads: () => reloads }); }
  finally {
    try { for (const h of worlds) h.dispose(); }
    finally {
      await flush();
      for (const key of keys) {
        if (originals[key]) Object.defineProperty(globalThis, key, originals[key]);
        else delete globalThis[key];
      }
    }
  }
}
function nodesText (value) {
  return Array.isArray(value) ? value.map(nodesText).join("") : React.isValidElement(value)
    ? nodesText(value.props.children) : value == null || typeof value === "boolean" ? "" : String(value);
}

test("initial pending History must not claim an empty graph", () => withWorld(async ({ harness, requests }) => {
  const h = harness(); h.effect(); h.click("Commit graph"); await flush();
  assert.equal(requests.length, 2);
  assert.equal(requests[0].signal.aborted, true);
  assert.match(requests[1].url, /\/api\/history\?repo=A&limit=500&offset=0/);
  assert.equal(h.state.loading, true);
  assert.match(h.html(), /Loading History for the commit graph/);
  noEmpty(h.html());
}));

test("initial HTTP failure must not claim an empty graph", () => withWorld(async ({ harness, requests }) => {
  const h = harness(); h.effect(); h.click("Commit graph"); await flush();
  requests.at(-1).fail(); await flush();
  assert.match(h.state.loadError, /History request failed/);
  assert.match(h.html(), /Commit graph unavailable until History recovers/);
  noEmpty(h.html());
}));

const graphHost = (h) => one(nodes(h.elements().graph), (node) => node.props.role === "img");
const disclosure = (h) => one(nodes(h.elements().graph), (node) => node.type === deps.DisclosureTable);

test("pre-effect hydration and closed graphs do not imply accepted emptiness", () => withWorld(async ({ harness, requests }) => {
  const h = harness();
  assert.equal(h.context().historyHydrating, true);
  assert.equal(h.state.loading, false);
  assert.equal(h.html(), ""); noEmpty(h.html("controls"));
  h.click("Commit graph");
  assert.equal(requests.length, 0);
  assert.match(h.html(), /Loading History for the commit graph/);
  assert.equal(graphHost(h).props.hidden, true);
  noEmpty(h.html()); noEmpty(h.html("controls"));
  h.click("Commit graph"); assert.equal(h.html(), "");
}));

test("actual deadline callback and actual Retry recover into accepted empty", () => withWorld(async ({ harness, requests, timers }) => {
  const h = harness(); h.effect(); h.click("Commit graph"); await flush();
  assert.equal(timers.size, 1);
  const timer = [...timers.values()][0]; assert.equal(timer.ms, 10_000);
  timer.fn(); await flush();
  assert.equal(requests.at(-1).signal.aborted, true);
  assert.equal(h.state.loadError, "History request timed out after 10 seconds.");
  assert.equal(timers.size, 0); noEmpty(h.html());
  h.click("Retry"); assert.equal(timers.size, 1);
  requests.at(-1).ok([]); await flush();
  assert.equal(h.state.loadError, ""); assert.equal(timers.size, 0);
  assert.equal(h.context().historyHydrating, false);
  assert.match(h.html(), /No commits are available/);
  assert.match(h.html(), /No commits to graph/);
  assert.match(h.html(), /exact data \u00b7 0 rows/);
  assert.match(h.html("controls"), /No commits captured yet/);
  assert.equal(graphHost(h).props.hidden, true);
}));

test("actual older-page failure and Retry preserve the accepted graph", () => withWorld(async ({ harness, requests }) => {
  const h = harness(); h.effect(); requests.at(-1).ok(entries(500)); await flush();
  h.click("Commit graph"); await flush();
  const acceptedRows = h.state.graphRows, acceptedSvg = h.state.graphSvg;
  assert.equal(acceptedRows.length, 20);
  h.click("Load more (older)");
  assert.match(requests.at(-1).url, /offset=500$/);
  for (const finish of [() => {}, () => requests.at(-1).fail()]) {
    finish(); await flush();
    assert.equal(h.state.graphRows, acceptedRows); assert.equal(h.state.graphSvg, acceptedSvg);
    assert.equal(disclosure(h).props.rows, acceptedRows);
    assert.equal(graphHost(h).props.hidden, false); noEmpty(h.html());
  }
  assert.match(h.state.loadError, /History request failed/);
  h.click("Retry"); requests.at(-1).ok([]); await flush();
  assert.equal(h.state.loadError, ""); assert.equal(h.state.entries.length, 500);
  assert.equal(h.state.graphRows.length, 20); assert.equal(h.state.graphSvg, acceptedSvg);
}));

test("renderer pending, ordinary Retry and module Reload retain exact data", () => withWorld(async ({ harness, requests, reloads }) => {
  for (const failure of ["ordinary", "module"]) {
    const h = harness(); h.effect(); requests.at(-1).ok(entries(1)); await flush();
    let rejectRender;
    h.renderer((_entries, _branch, context) => new Promise((_resolve, reject) => {
      rejectRender = reject;
      context.signal.addEventListener("abort", () => reject(actualApi.abortError()), { once: true });
    }));
    h.click("Commit graph");
    assert.equal(h.state.graphBusy, true); assert.equal(disclosure(h).props.rows.length, 1);
    assert.equal(graphHost(h).props.hidden, true); noEmpty(h.html());
    rejectRender(failure === "module" ? new deps.MermaidModuleLoadError("controlled") : new Error("controlled"));
    await flush(); assert.equal(h.state.graphBusy, false); noEmpty(h.html());
    assert.equal(disclosure(h).props.rows.length, 1);
    if (failure === "module") {
      const before = reloads(); h.click("Reload page", "graph"); assert.equal(reloads(), before + 1);
      assert.doesNotMatch(h.html(), /Retry graph/);
    } else {
      h.renderer(async (_entries, _branch, _context, prepared) => ({ svg: "<svg/>", meta: prepared }));
      h.click("Retry graph", "graph"); await flush();
      assert.equal(h.state.graphFailure, null); assert.equal(graphHost(h).props.hidden, false);
    }
  }
}));

test("controlled zero-row preparation and failure remain distinct from empty data", () => withWorld(async ({ harness, requests }) => {
  const h = harness(); h.effect(); requests.at(-1).ok(entries(1)); await flush();
  // Explicit source-state coverage, not a claim of an observable native React frame.
  h.state.showGraph = true;
  assert.equal(h.context().historyHydrating, false);
  assert.match(h.html(), /Preparing commit graph/); noEmpty(h.html());
  h.state.graphFailure = { message: "Controlled preparation failure", recovery: "retry" };
  assert.match(h.html(), /Exact graph data is unavailable/); noEmpty(h.html());
}));

test("actual A-to-B fallback hides prior empty, populated and failed graph states", () => withWorld(async ({ harness, requests }) => {
  for (const prior of ["empty", "populated", "history-failed", "graph-failed"]) {
    const h = harness(); h.effect();
    if (prior === "history-failed") requests.at(-1).fail();
    else requests.at(-1).ok(entries(prior === "empty" ? 0 : 1));
    await flush();
    if (prior === "graph-failed") h.renderer(async () => { throw new deps.MermaidModuleLoadError("old A"); });
    h.click("Commit graph"); await flush();
    h.refs.reposRef.current = [{ id: "B", branch: "develop" }];
    assert.equal(h.context().repoId, "B"); assert.equal(h.refs.loadedRepoRef.current, "A");
    assert.match(h.html(), /Loading History for the commit graph/);
    noEmpty(h.html()); noEmpty(h.html("controls"));
    assert.doesNotMatch(h.html(), /Latest|fetched commits|module could not load|Reload page|Show exact data/);
    assert.equal(graphHost(h).props.hidden, true);
    h.effect(); assert.equal(h.refs.loadedRepoRef.current, "B");
    assert.match(requests.at(-1).url, /repo=B&limit=500&offset=0/);
    requests.at(-1).fail(); await flush();
    h.click("Retry"); requests.at(-1).ok([]); await flush();
    assert.equal(disclosure(h).props.identity[2], "B");
    assert.match(h.html(), /No commits to graph/);
  }
}));

test("actual mount/filter/selection effect keeps an open all-offline graph unavailable", () => withWorld(async ({ harness, requests }) => {
  const h = harness(); h.effect(); requests.at(-1).ok(entries(1)); await flush();
  h.click("Commit graph"); await flush();
  assert.equal(subject.canMount(true, true, "history"), true);
  assert.equal(subject.canMount(true, false, "history"), false);
  h.refs.reposRef.current = subject.onlineRepos([{ id: "A", offline: true }]);
  const count = requests.length;
  assert.equal(h.context().repoId, ""); h.effect();
  assert.equal(requests.length, count); assert.equal(h.state.showGraph, true);
  assert.match(h.html(), /Commit graph unavailable: no online repository/); noEmpty(h.html());
  assert.match(h.html("controls"), /No online repositories are available/);
  assert.equal(graphHost(h).props.hidden, true);
}));

test("actual adoption effect clears stale imperative children only after the host is hidden", () => withWorld(async ({ harness, requests, replace }) => {
  const h = harness(); h.effect(); requests.at(-1).ok(entries(1)); await flush();
  h.click("Commit graph"); await flush();
  const adopted = [], parsed = [];
  const host = { children: [], replaceChildren(...children) { this.children = children; } };
  h.refs.graphRef.current = host;
  replace("DOMParser", class { parseFromString(text, type) {
    assert.equal(type, "text/html"); const svg = { text }; parsed.push(svg);
    return { querySelector(selector) { assert.equal(selector, "svg"); return svg; } };
  } });
  replace("document", { adoptNode(node) { adopted.push(node); return node; } });
  subject.adoptEffect(h.refs.graphRef, h.state.graphSvg);
  const oldA = host.children[0]; assert.equal(oldA, adopted[0]);
  h.refs.reposRef.current = [{ id: "B", branch: "main" }];
  assert.equal(graphHost(h).props.hidden, true); h.effect();
  assert.equal(h.refs.loadedRepoRef.current, "B"); assert.equal(h.state.graphSvg, "");
  assert.equal(host.children[0], oldA); assert.equal(graphHost(h).props.hidden, true);
  subject.adoptEffect(h.refs.graphRef, h.state.graphSvg); assert.deepEqual(host.children, []);
  requests.at(-1).ok(entries(1)); await flush();
  subject.adoptEffect(h.refs.graphRef, h.state.graphSvg);
  assert.equal(parsed.length, 2); assert.equal(host.children[0], adopted[1]);
  assert.notEqual(host.children[0], oldA); assert.equal(graphHost(h).props.hidden, false);
}));

test("actual graph alternatives retain hash identity, columns, closure and bounded data", () => withWorld(async ({ harness, requests }) => {
  const h = harness(); h.effect(); requests.at(-1).ok(entries(500)); await flush();
  h.click("Commit graph"); await flush();
  const props = disclosure(h).props;
  assert.deepEqual(props.columns.map(({ key }) => key), ["hash", "message", "time", "parents", "events"]);
  assert.deepEqual(props.columns.map(({ label }) => label), ["Commit", "Message", "Timestamp", "Parents", "Tracked events"]);
  assert.equal(props.rows.length, 20); assert.equal(props.rowKey(props.rows[0]), props.rows[0].hash);
  assert.deepEqual(props.identity, ["history-graph-alternative", '["all"]', "A", h.context().semanticGraphKey]);
  assert.match(h.html(), /Latest 20 commits; 0 merge commits/);
  assert.match(h.html(), /aria-expanded="false"/); assert.doesNotMatch(h.html(), /<table/);
  const rows = Array.from({ length: 51 }, (_, index) => ({ ...props.rows[0], hash: String(index).padStart(40, "0") }));
  const html = renderToStaticMarkup(React.createElement(deps.DisclosureTable, { ...props, rows, initiallyOpen: true }));
  const body = html.split("<tbody>")[1].split("</tbody>")[0];
  assert.equal((body.match(/<tr /g) ?? []).length, 50);
  assert.match(html, /next page/);
}));

const PRE_RENDER_SHA = "318d6aa92b28eb86f146e1ed5727cd59aeab57ae7490385254d281c058eaf89c";
const OUTSIDE_GRAPH_SHA = "b2c30d891a5bc9d3a812925fcb9fac51988b6221374c0694afa4e8bb76be7247";
// New subtree independently reviewed against D1/D2; the two old baselines stay fixed.
const GRAPH_SHA = "079b3f41f7aaf9216c5345a764fdefd07a921a5b8d95c8ad70b73e64da6e98ca";
const printer = ts.createPrinter({ removeComments: true });
const printed = (node, ast) => canonicalPrintedText(printer.printNode(ts.EmitHint.Unspecified, node, ast));
const sha = (text) => createHash("sha256").update(text).digest("hex");
const bottomNode = (ast) => one(all(ast), (node) => ts.isJsxExpression(node)
  && node.expression && ts.isBinaryExpression(node.expression)
  && node.expression.getText(ast).includes("No commits captured yet."));
function restoredOutsideGraph (ast) {
  const graph = graphNode(ast), bottom = bottomNode(ast);
  const terms = (node) => ts.isBinaryExpression(node)
    && node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
    ? [...terms(node.left), ...terms(node.right)] : [node];
  const gate = bottom.expression;
  assert.equal(gate.operatorToken.kind, ts.SyntaxKind.AmpersandAmpersandToken);
  const operands = terms(gate.left);
  assert.deepEqual(operands.map((node) => printed(node, ast)), [
    "!historyHydrating", "(!repoId || loadedRepoRef.current === repoId)",
    "!loading", "!loadError", "shownEntries.length === 0",
  ], "complete bottom gate contains exactly the two reviewed additions");
  const restored = operands.slice(2).reduce((left, right) =>
    ts.factory.createBinaryExpression(left, ts.SyntaxKind.AmpersandAmpersandToken, right));
  const changed = ts.transform(ast, [(context) => {
    const visit = (node) => {
      if (node === graph) return ts.factory.createJsxExpression(undefined,
        ts.factory.createStringLiteral("history-graph-render"));
      if (node === bottom) return ts.factory.updateJsxExpression(node,
        ts.factory.updateBinaryExpression(gate, restored, gate.operatorToken, gate.right));
      return ts.visitEachChild(node, visit, context);
    };
    return (node) => ts.visitNode(node, visit);
  }]);
  try { return canonicalPrintedText(printer.printFile(changed.transformed[0])); }
  finally { changed.dispose(); }
}
function checkPreservation (text) {
  const ast = parse(restoreDiffDisclosureState(restoreWarningTimestampOrder(restoreGitGraphBoundaryCopy(restoreChangesWorkbench(text)))));
  const fn = one(ast.statements, (node) => ts.isFunctionDeclaration(node) && node.name?.text === "HistoryView");
  const statements = [...fn.body.statements];
  assert.ok(ts.isReturnStatement(statements.pop()));
  assert.equal(sha(statements.map((node) => printed(node, ast)).join("\n")), PRE_RENDER_SHA);
  assert.equal(sha(restoredOutsideGraph(ast)), OUTSIDE_GRAPH_SHA);
  assert.equal(sha(printed(graphNode(ast), ast)), GRAPH_SHA);
}
const replaceOnce = (text, before, after) => {
  assert.equal(text.split(before).length, 2, "negative mutation hits exactly one location");
  return text.replace(before, after);
};
test("original whole pre-render/outside-graph hashes and reviewed graph survive LF/CRLF", () => {
  const lf = source.replace(/\r\n/g, "\n");
  checkPreservation(lf); checkPreservation(lf.replace(/\n/g, "\r\n"));
});

test("strict two-term reversal rejects missing, repeated, partial and unrelated gate changes", () => {
  const gate = bottom.getText(app);
  for (const [before, after] of [
    ["!historyHydrating && ", ""],
    ["!historyHydrating", "!historyHydrating && !historyHydrating"],
    ["(!repoId || loadedRepoRef.current === repoId)", "true"],
    ["(!repoId || loadedRepoRef.current === repoId)", "(!repoId)"],
    ["(!repoId || loadedRepoRef.current === repoId)", "(!repoId || loadedRepoRef.current === repoId) && (!repoId || loadedRepoRef.current === repoId)"],
    ["!repoId ||", "!repoId &&"], ["current === repoId", "current !== repoId"],
    ["!loading", "loading"],
  ]) {
    const modified = replaceOnce(gate, before, after);
    assert.throws(() => checkPreservation(replaceOnce(source, gate, modified)), /complete bottom gate/);
  }
});

test("preservation guards reject unrelated owners, other returns and partial graph edits", () => {
  const owner = local("runLoad");
  assert.throws(() => checkPreservation(replaceOnce(source, owner,
    replaceOnce(owner, "api.history(id, PAGE, offset", "api.history(id, PAGE - 1, offset"))));
  assert.throws(() => checkPreservation(replaceOnce(source,
    "Explore commit history and its linked captured events.", "Unrelated changed description.")));
  const oldGraph = graph.getText(app);
  for (const [before, after] of [["showGraph &&", "true &&"],
    ["graphRows.length > 0", "graphRows.length >= 0"],
    ["rows={graphRows}", "rows={graphRows.slice(1)}"],
    ["|| !graphSvg}", "}"],
  ]) assert.throws(() => checkPreservation(replaceOnce(source, oldGraph,
    replaceOnce(oldGraph, before, after))));
});
