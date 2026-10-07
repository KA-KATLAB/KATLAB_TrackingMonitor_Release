import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  HISTORY_STATION_SOURCES, HISTORY_STATION_SUITES, historyStationPreservation,
  restoreHistoryStationSource, restoreHistoryStationSuite,
} from "./helpers/historyReviewStation.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const frontend = resolve(root, "Frontend"), require = createRequire(resolve(frontend, "package.json"));
const ts = require("typescript"), React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const read = name => readFileSync(resolve(root, name));
const text = name => read(name).toString("utf8"), lf = value => value.replace(/\r\n/g, "\n");
const sha = value => createHash("sha256").update(value).digest("hex");
const APP = "Frontend/src/App.tsx", MODULE = "Frontend/src/HistoryReviewStation.tsx";
const MODULE_RAW = "5753480e9b5090f2f253d6100e86f83cb1d60a14fa66ca2804a1b5e55868280c";
const APP_RAW = "78301b274f2232953002a191ea2e8ff6afdb53f28e0daa6f1fea6846c57632a4";
const APP_LF = "f69bd31b8e8f1815205e9113cb44310f9fe42b7279d71de34974c82cee4d7949";
const HELPER_RAW = "eded5d91962854adca8e77528dc79fc8165d71cbc1bdeb4d69b8d390306c4fd4";
const TABLE_SHA = "5a04e84ed6c185ff0b98422fea5444d9ca70d94d52d2d7eb50d82392f0b2c2bb";
const CARD_LF = "91bba649cdc53959b589c91e268bfe856ff7624b5f086e4dbb7524e7bf63fe51";
const records = [...HISTORY_STATION_SOURCES, ...HISTORY_STATION_SUITES];
// Frozen published inputs, not a mutable ignored-plan oracle.
const PINS = [
  ["Frontend/src/ui.tsx", "b5650b9e2a3529ff1ca033ed077d7b806f0cc9341c9733b4b3a52c107ab99974", "e1c2ad05398cf771ee17ba576b7feecf03829459379b9e02e35c58aea5004c46"],
  ["Frontend/src/dialog.tsx", "aaeda6eec7080c96b4992d6944444d21ab518ba5987e8a5abd8100423dd136b0", "86f96a3c1454baf8337409995abb81f11ad57ce74d8f4288cbe5ac350991715a"],
  ["Frontend/src/historyCommitLedger.css", "ba899692d9937c52fe6194aa1704d725c954274737439b9901b14b69b833d7ab", "ba899692d9937c52fe6194aa1704d725c954274737439b9901b14b69b833d7ab"],
  ["Frontend/src/format.ts", "4c7f1cb040c38a5ef75787c6f7325db6fc162a6890df0fb693e916aa62d8c87f", "4c7f1cb040c38a5ef75787c6f7325db6fc162a6890df0fb693e916aa62d8c87f"],
  ["Frontend/src/api.ts", "b21da4367bb2c9007a62b9ed097fd943286ffb3c863de23ee565acd01b2323a0", "2bdccf5c79ccf5a72f9696df00a924ff918a82c6cf8e4f15ba2a69b39e7cd2b8"],
  ["Frontend/src/index.css", "9371bc04cba0b62e8a8e5e3b4a9251deea9273be58f4b9735982e0649527ba81", "788436e9def1e7109fe98d4bfa5e0add49a5f0ca301b17416279c03f18ede0f5"],
  ["Frontend/index.html", "6343d1cbd11dc51b748036743f659eff9898039de81010427928a3e7a56c22af", "6343d1cbd11dc51b748036743f659eff9898039de81010427928a3e7a56c22af"],
  ["Frontend/package.json", "b131be7e90ba2500b01371e594e10c482b94cf651ab425ddf7efaea76b759b9d", "541a787d69fa512a53de01b53240e2e94ac22f068da882e0c2496f68ee5bf1a1"],
  ["Frontend/package-lock.json", "0c39bf19779991e4565e00845a061fc954afdfe988d9026c6c356957e2b02258", "d5ccfda11d2d07b4a707b18aca87b866a135182a3bd33ce2380c21730809ce75"],
  ["Frontend/tsconfig.json", "97997252d286ecf7a8a4b12a51ac2fdd9199f3b9bf5e14e8d4f7d4e5e60d3f3f", "97997252d286ecf7a8a4b12a51ac2fdd9199f3b9bf5e14e8d4f7d4e5e60d3f3f"],
  ["Frontend/vite.config.ts", "6f25836874cc3ca4c97781dd0140ab1e7fee796b3b0c67a67ffdb8600e67cd6b", "4631f5c7380fa909b5b361bf8eb7fdac29a665144ca260f9ac30be30ce83f107"],
  ["Backend/requirements.txt", "f750d19859ca5621eea836592d2038857f73e8857bcace96752ce6dadf004ea3", "f24979c56dd6d095f18541462485fb62229cfddf0fa8784d7c7dd9fbb535d0b5"],
  ["Scripts/Chronicle/requirements.txt", "9d91436f670aac600f39beb184f7278774dc94e470dfca37f092bb0e3d461722", "562f66ed699de7d73e464c6be1a0938b6b19a8c2f69fe4b955209f0981986a2d"],
];
const moduleSource = text(MODULE), appSource = text(APP);
function parse(name, source) {
  const ast = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  assert.equal(ast.parseDiagnostics.length, 0, name + " parses"); return ast;
}
const appAst = parse(APP, appSource), moduleAst = parse(MODULE, moduleSource);
function nodes(node) {
  const out = []; const visit = item => { out.push(item); ts.forEachChild(item, visit); };
  visit(node); return out;
}
function one(items, predicate, label) {
  const matches = items.filter(predicate); assert.equal(matches.length, 1, label); return matches[0];
}
function declaration(ast, name) {
  return one(ast.statements, node => ts.isFunctionDeclaration(node) && node.name?.text === name, name);
}
function attrs(node, name) {
  return one([...node.attributes.properties], attr => ts.isJsxAttribute(attr)
    && attr.name.getText() === name, name).initializer;
}
const history = declaration(appAst, "HistoryView");
const card = declaration(appAst, "HistoryCommitCard");
const station = declaration(moduleAst, "HistoryReviewStation");
const expressionText = node => node.expression?.getText() ?? node.getText();
const elements = node => Array.isArray(node) ? node.flatMap(elements)
  : React.isValidElement(node) ? [node, ...elements(node.props.children)] : [];
function find(tree, predicate, label) { return one(elements(tree), predicate, label); }
const frozen = value => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(frozen); Object.freeze(value);
  }
  return value;
};
function entry(index, overrides = {}) {
  return frozen({ commit: { hash: ("h" + index).padEnd(40, "0"), message: "Captured work " + index,
    ts: "2026-10-08T04:00:00Z", files_json: "[]", parents: "", ...overrides },
    events: Array.from({ length: index % 4 }, (_, i) => ({ id: index * 10 + i, repo_id: "Repo_A",
      file: "path/" + i, ts: "2026-10-08T04:00:00Z" })) });
}
async function compile(source) {
  const result = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React,
  }, reportDiagnostics: true });
  assert.ok(!(result.diagnostics ?? []).some(item => item.category === ts.DiagnosticCategory.Error));
  return import("data:text/javascript;base64," + Buffer.from(result.outputText).toString("base64"));
}
let vite, ui, dialog, format, createStation, createCard;
before(async () => {
  // Middleware-only actual source loading: no listen, API, configured database or portal mount.
  const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
  vite = await createServer({ root: frontend, logLevel: "silent",
    server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom",
    optimizeDeps: { noDiscovery: true, entries: [] } });
  [ui, dialog, format] = await Promise.all([
    vite.ssrLoadModule("/src/ui.tsx"), vite.ssrLoadModule("/src/dialog.tsx"),
    vite.ssrLoadModule("/src/format.ts"),
  ]);
  ({ createStation } = await compile("export function createStation(React,hooks,dependencies){"
    + "const {useState}=hooks;const {BoundedChoiceDialog,ControlButton}=dependencies;\n"
    + station.getText(moduleAst).replace(/^export\s+/, "") + "\nreturn HistoryReviewStation;}"));
  ({ createCard } = await compile("export function createCard(React,dependencies){"
    + "const {useRememberedBoundedPage,CollectionPager,fmtTs,EventRow}=dependencies;\n"
    + card.getText(appAst) + "\nreturn HistoryCommitCard;}"));
});
after(async () => { await vite?.close(); });

function mount(overrides = {}) {
  // One controlled useState slot executes the actual function. This is NOT React DOM/native focus proof.
  let selection = "", tree, inspected = [];
  const log = [], status = [], stateWrites = [];
  const hooks = { useState: initial => [selection || initial, value => {
    log.push("state"); selection = typeof value === "function" ? value(selection) : value;
    stateWrites.push(selection);
  }] };
  let props = { entries: [entry(1), entry(2)], scopeKeyValue: "all", repoId: "Repo_A",
    pageStart: 0, fetchedCount: 2, hydrating: false,
    onSelectionIntent: () => log.push("intent"),
    onStatus: value => { log.push("status"); status.push(value); },
    renderInspected: (value, key) => {
      inspected.push({ value, key });
      return React.createElement("article", { "data-inspected": key }, value.commit.message);
    }, ...overrides };
  const ActualStation = createStation(React, hooks, {
    BoundedChoiceDialog: dialog.BoundedChoiceDialog, ControlButton: ui.ControlButton,
  });
  function render(next = {}) { props = { ...props, ...next }; inspected = []; tree = ActualStation(props); return tree; }
  render();
  return { render, get tree() { return tree; }, get props() { return props; },
    get inspected() { return inspected; }, get selection() { return selection; },
    get choice() { return find(tree, n => n.type === dialog.BoundedChoiceDialog, "one real chooser"); },
    previous() { find(tree, n => n.props["aria-label"] === "Previous commit on this History page", "previous").props.onClick(); },
    next() { find(tree, n => n.props["aria-label"] === "Next commit on this History page", "next").props.onClick(); },
    select(id) { this.choice.props.onChange(id); },
    capture(target, wrapper) {
      find(tree, n => typeof n.props.onClickCapture === "function", "capture wrapper")
        .props.onClickCapture({ target, currentTarget: wrapper });
    },
    log, status, stateWrites };
}

test("independent whole source/table identities and immutable existing styling/dependencies", () => {
  assert.equal(sha(read(MODULE)), MODULE_RAW); assert.equal(read(MODULE).length, 5826);
  assert.equal(sha(read(APP)), APP_RAW); assert.equal(sha(lf(appSource)), APP_LF);
  assert.equal(sha(read("Tests/helpers/historyReviewStation.mjs")), HELPER_RAW);
  assert.equal(sha(JSON.stringify([HISTORY_STATION_SOURCES, HISTORY_STATION_SUITES])), TABLE_SHA);
  assert.equal(HISTORY_STATION_SOURCES.length, 1); assert.equal(HISTORY_STATION_SUITES.length, 30);
  assert.equal(HISTORY_STATION_SUITES.reduce((sum, record) => sum + record.windows.length, 0), 102);
  assert.equal(HISTORY_STATION_SOURCES[0].windows.length, 5);
  assert.equal(sha(lf(card.getText(appAst))), CARD_LF);
  assert.ok(Object.isFrozen(HISTORY_STATION_SOURCES) && Object.isFrozen(HISTORY_STATION_SUITES));
  const purpose = one(HISTORY_STATION_SUITES, record => record.path === "Tests/test_purpose_led_navigation.mjs", "purpose preservation owner");
  const historicalInput = one(purpose.windows, window => window.name === "independent pre-navigation App input", "explicit independent inverse input");
  assert.equal(historicalInput.before, ' const original=independentInverse(EXPECTED.sources[0],appText),old=parse("App.tsx",original);\n');
  assert.equal(historicalInput.after, ' const original=independentInverse(EXPECTED.sources[0],historyStationPreservation("Frontend/src/App.tsx",appText)),old=parse("App.tsx",original);\n');
  const purposeCurrent = text(purpose.path);
  assert.ok(purposeCurrent.includes(historicalInput.after));
  assert.ok(purposeCurrent.includes('const appText=text("Frontend/src/App.tsx"),app=parse("App.tsx",appText);'), "actual runtime/AST input remains raw current App");
  assert.equal(sha(lf(historyStationPreservation(APP, appSource))), HISTORY_STATION_SOURCES[0].before.LF);
  assert.throws(() => restoreHistoryStationSuite(purpose.path, purposeCurrent.replace(historicalInput.after, historicalInput.before)), "missing historical-input wrapper rejects");
  for (const [name, raw, normalized] of PINS) {
    assert.equal(sha(read(name)), raw, name + " raw");
    assert.equal(sha(lf(text(name))), normalized, name + " LF");
  }
  assert.ok(!moduleSource.includes("\r") && !moduleSource.startsWith("\uFEFF"));
  assert.ok(moduleSource.endsWith("\n") && !moduleSource.endsWith("\n\n"));
  assert.doesNotMatch(moduleSource, /[ \t]+$/m);
  assert.doesNotMatch(station.getText(), /\b(?:useEffect|useLayoutEffect|setTimeout|setInterval|fetch|localStorage|sessionStorage|scrollIntoView)\b/);
});

test("all thirty-one strict current preservation inputs restore whole native and normalized originals", () => {
  for (const record of records) {
    const raw = read(record.path), current = lf(raw.toString("utf8"));
    assert.equal(raw.length, record.after.bytes, record.path);
    assert.equal(sha(raw), record.after.RAW, record.path);
    const restore = record.path === APP ? restoreHistoryStationSource : restoreHistoryStationSuite;
    for (const value of [current, current.replace(/\n/g, "\r\n"), Buffer.from(current),
      Buffer.from(current.replace(/\n/g, "\r\n"))]) {
      const restored = restore(record.path, value);
      assert.equal(Buffer.isBuffer(restored), Buffer.isBuffer(value));
      const normalized = lf(restored.toString()); assert.equal(sha(normalized), record.before.LF);
      const native = record.before.nativeEOL === "CRLF" ? normalized.replace(/\n/g, "\r\n") : normalized;
      assert.equal(Buffer.byteLength(native), record.before.bytes);
      assert.equal(sha(native), record.before.RAW);
      assert.deepEqual(historyStationPreservation(record.path, value), restored);
      let independently = current;
      for (const window of [...record.windows].reverse()) {
        assert.equal(independently.split(window.after).length - 1, window.count);
        independently = independently.split(window.after).join(window.before);
      }
      assert.equal(normalized, independently);
    }
  }
  // Restorations above are preservation DATA only. They are never compiled or executed.
});

test("whole-preservation rejection closes byte, outside-window, owner and cardinality loopholes", () => {
  for (const record of records) {
    const current = lf(text(record.path)), restore = record.path === APP
      ? restoreHistoryStationSource : restoreHistoryStationSuite;
    const bad = ["// unrelated valid edit\n" + current, current + "\n", current.slice(0, -1),
      "\uFEFF" + current, current + "\0", current.replace("\n", "\r"),
      current.replace("\n", "\r\n"), current.replace("\n", " \n"),
      Buffer.concat([Buffer.from(current), Buffer.from([0xff])])];
    for (const window of record.windows) {
      bad.push(current.replace(window.after, window.before),
        current.replace(window.after, window.after + window.after),
        current.replace(window.after, "// moved approved window\n" + window.after),
        current.replace(window.after, window.after.slice(0, -1)));
    }
    for (const value of bad) assert.throws(() => restore(record.path, value), record.path);
    assert.throws(() => restore(record.path, historyStationPreservation(record.path, current)),
      "published baseline is not accepted as current");
  }
  for (const name of ["", "../App.tsx", "/Frontend/App.tsx", "C:/App.tsx", "Frontend//App.tsx"]) {
    assert.throws(() => historyStationPreservation(name, "unchanged"));
  }
  const arbitrary = Buffer.from("same bytes\r\n");
  assert.ok(historyStationPreservation("Hook/provider_adapters.py", arbitrary) === arbitrary);
  assert.equal(historyStationPreservation("Frontend/index.html", "same text"), "same text");
  assert.throws(() => restoreHistoryStationSource("Frontend/index.html", "same text"));
  assert.throws(() => restoreHistoryStationSuite("Tests/not_owned.mjs", "same text"));
});

test("current App owns page slice, occurrence keys, original direct card and existing focus cancellation", () => {
  const call = one(nodes(history), node => ts.isJsxSelfClosingElement(node)
    && node.tagName.getText() === "HistoryReviewStation", "one current station");
  assert.equal(expressionText(attrs(call, "entries")), "shownEntries.slice(pager.start, pager.end)");
  assert.equal(expressionText(attrs(call, "fetchedCount")), "shownEntries.length");
  assert.equal(expressionText(attrs(call, "pageStart")), "pager.start");
  assert.equal(expressionText(attrs(call, "hydrating")), "historyHydrating");
  assert.equal(expressionText(attrs(call, "key")),
    'JSON.stringify(["history-review-page", scopeKeyValue, repoId, pager.start])');
  const render = attrs(call, "renderInspected").expression;
  assert.ok(ts.isArrowFunction(render)); assert.equal(render.parameters.length, 2);
  const original = one(nodes(render), n => ts.isJsxSelfClosingElement(n)
    && n.tagName.getText() === "HistoryCommitCard", "original card");
  assert.equal(expressionText(attrs(original, "entry")), "entry");
  assert.equal(expressionText(attrs(original, "key")), "occurrenceKey");
  const region = one(nodes(history), n => ts.isJsxElement(n)
    && n.openingElement.attributes.properties.some(a => ts.isJsxAttribute(a)
      && a.name.getText() === "data-history-review-station"), "preserved current region");
  assert.equal(attrs(region.openingElement, "role").text, "region");
  assert.equal(attrs(region.openingElement, "aria-label").text, "Captured commits");
  assert.ok(region.children.some(child => child === call), "station is direct region child");
  assert.match(history.getText(), /\{shownEntries\.length > 0 && \(/,
    "global empty History retains original mount gate");
  const parentCall = one(nodes(appAst), n => ts.isJsxSelfClosingElement(n)
    && n.tagName.getText() === "HistoryView", "History caller");
  assert.equal(expressionText(attrs(parentCall, "onSelectionIntent")), "cancelMissionRouteFocus");
  const cancel = one(nodes(appAst), n => ts.isVariableDeclaration(n)
    && n.name.getText() === "cancelMissionRouteFocus", "unchanged cancel callback");
  assert.match(cancel.getText(), /flushSync\(\(\) => setRouteFocusRequest\(null\)\)/);
  assert.match(moduleSource, /return \(\s*<>/); assert.doesNotMatch(moduleSource, /aria-current|aria-selected|role="tab/);
});

test("zero, single and full current-page SSR retain exact coverage, native controls and one inspected child", () => {
  for (const count of [0, 1, 2, 50]) {
    const entries = frozen(Array.from({ length: count }, (_, i) => entry(i)));
    const before = JSON.stringify(entries), view = mount({ entries, fetchedCount: count });
    assert.equal(view.choice.props.choices.length, count);
    assert.equal(view.choice.props.disabled, count === 0);
    assert.equal(view.choice.props.contextKey, '["history-review-page","all","Repo_A",0]');
    assert.equal(view.inspected.length, count ? 1 : 0);
    if (count) assert.ok(view.inspected[0].value === entries[0]);
    const html = renderToStaticMarkup(view.tree);
    assert.equal((html.match(/data-inspected=/g) ?? []).length, count ? 1 : 0);
    assert.match(html, /Review captured commits/);
    assert.match(html, new RegExp(count + "<\\/span> captured commits fetched\\."));
    assert.equal((html.match(/aria-haspopup="dialog"/g) ?? []).length, 1);
    assert.equal((html.match(/type="button"/g) ?? []).length, 3);
    assert.doesNotMatch(html, /<select|role="tab|aria-selected=|<iframe/);
    assert.equal(JSON.stringify(entries), before);
    assert.deepEqual(view.log, []); assert.deepEqual(view.status, []); assert.deepEqual(view.stateWrites, []);
  }
});

test("valid explicit choices cancel before state, exact duplicate-hash occurrences remain separate", () => {
  const first = entry(1, { hash: "a".repeat(40) }), second = entry(2, { hash: "a".repeat(40) });
  const view = mount({ entries: frozen([first, second]), pageStart: 50, fetchedCount: 52 });
  const choices = view.choice.props.choices;
  assert.notEqual(choices[0].id, choices[1].id);
  assert.deepEqual(JSON.parse(choices[1].id), ["history-review-commit", "all", "Repo_A", 51, "a".repeat(40)]);
  view.select("unknown"); assert.deepEqual(view.log, []);
  view.previous(); assert.deepEqual(view.log, []);
  view.select(choices[1].id);
  assert.deepEqual(view.log, ["intent", "state", "status"]);
  assert.equal(view.status[0], "Inspecting captured commit 2 of 2 on this History page in Repo_A.");
  view.render(); assert.ok(view.inspected[0].value === second);
  assert.equal(view.inspected[0].key, choices[1].id);
  view.log.length = 0; view.select(choices[1].id);
  assert.deepEqual(view.log, ["intent", "state"]); assert.equal(view.status.length, 1);
  view.log.length = 0; view.next(); assert.deepEqual(view.log, []);
  view.previous(); view.render(); assert.ok(view.inspected[0].value === first);
  const samePrefix = mount({ entries: [entry(1, { hash: "0123456789_A" }), entry(2, { hash: "0123456789_B" })] });
  assert.notEqual(samePrefix.choice.props.choices[0].id, samePrefix.choice.props.choices[1].id);
});

test("compact chooser labels keep full escaped searchable evidence and do not alter immutable input", () => {
  const message = "<>&\"" + "Very long captured work ".repeat(1000), hash = "0123456789" + "<>&\"".repeat(100);
  const rows = frozen([entry(1, { message, hash, ts: "Captured <>&\" timestamp" })]);
  const snapshot = JSON.stringify(rows), view = mount({ entries: rows, fetchedCount: 501, repoId: "Repo_<&>" });
  const choice = view.choice.props.choices[0];
  assert.equal(choice.label, "Commit 1: 0123456789"); assert.ok(choice.label.length < 40);
  assert.equal(choice.description, "Message: " + message + " | Full ID: " + hash + " | Captured: Captured <>&\" timestamp");
  assert.equal(JSON.parse(choice.id)[2], "Repo_<&>");
  const html = renderToStaticMarkup(view.tree); assert.ok(!html.includes("<>&\""));
  assert.ok(html.includes("&lt;&gt;&amp;&quot;")); assert.equal(JSON.stringify(rows), snapshot);
  const empty = mount({ entries: [entry(1, { hash: "", message: "" })] }).choice.props.choices[0];
  assert.equal(empty.label, "Commit 1: (empty ID)");
  assert.match(empty.description, /Message: \(empty captured message\) \| Full ID: \(empty captured ID\)/);
});

test("last explicit occurrence survives hydration, append and artificial same-context shrink/regrowth", () => {
  const rows = [entry(1), entry(2), entry(3)], view = mount({ entries: rows, fetchedCount: 3 });
  const selected = view.choice.props.choices[1].id;
  view.select(selected); view.render(); view.log.length = 0;
  view.render({ entries: [], hydrating: true, fetchedCount: 3 });
  assert.equal(view.selection, selected); assert.equal(view.inspected.length, 0);
  assert.equal(view.choice.props.disabledReason, "This History page is still loading.");
  assert.match(renderToStaticMarkup(view.tree), /No fetched commit is available on this page yet/);
  view.render({ entries: [...rows, entry(4)], hydrating: true, fetchedCount: 4 });
  assert.equal(view.choice.props.disabled, false); assert.ok(view.inspected[0].value === rows[1]);
  assert.match(renderToStaticMarkup(view.tree), /You can inspect the fetched commits on this page/);
  view.render({ entries: [rows[0]], hydrating: false });
  assert.ok(view.inspected[0].value === rows[0]); assert.equal(view.selection, selected);
  view.render({ entries: rows }); assert.ok(view.inspected[0].value === rows[1]);
  assert.deepEqual(view.log, []);
  // Explicit new controlled mount represents App's proven context-keyed React remount, not native timing.
  for (const overrides of [{ scopeKeyValue: "repo:Repo_A" }, { repoId: "Repo_B" }, { pageStart: 50 }]) {
    const reset = mount({ entries: rows, ...overrides });
    assert.ok(reset.inspected[0].value === rows[0]); assert.equal(reset.selection, "");
    assert.notEqual(reset.choice.props.contextKey, view.choice.props.contextKey);
  }
  const optional = mount({ onSelectionIntent: undefined }); optional.next(); optional.render();
  assert.ok(optional.inspected[0].value === optional.props.entries[1]);
});

class FakeElement {
  constructor(parent = null, attrs = {}) {
    this.parentElement = parent; this.attrs = attrs; this.isConnected = true;
    this.ownerDocument = parent?.ownerDocument ?? { defaultView: { Element: FakeElement, HTMLButtonElement: FakeButton } };
  }
  contains(child) { for (let node = child; node; node = node.parentElement) if (node === this) return true; return false; }
  getAttribute(name) { return this.attrs[name] ?? null; }
  closest(selector) {
    for (let node = this; node; node = node.parentElement) {
      if (selector === "button[aria-haspopup='dialog']"
        && node instanceof FakeButton && node.attrs["aria-haspopup"] === "dialog") return node;
      if (selector === "[inert], [hidden]" && ("inert" in node.attrs || "hidden" in node.attrs)) return node;
    }
    return null;
  }
}
class FakeButton extends FakeElement {
  constructor(parent, attrs = {}) { super(parent, { "aria-haspopup": "dialog", "aria-expanded": "false", ...attrs }); this.disabled = false; }
}
function containedTree() {
  const root = new FakeElement(), wrapper = new FakeElement(root), trigger = new FakeButton(wrapper);
  return { root, wrapper, trigger, label: new FakeElement(trigger) };
}
test("actual capture intent rejects portals and disabled/disconnected/inert controls with controlled DOM", () => {
  const view = mount(), dom = containedTree();
  view.capture(dom.label, dom.wrapper); assert.deepEqual(view.log, ["intent"]); view.log.length = 0;
  const cases = [
    () => ({ target: new FakeButton(new FakeElement()), wrapper: dom.wrapper }),
    () => ({ target: {}, wrapper: dom.wrapper }),
    () => { const d = containedTree(); d.wrapper.isConnected = false; return { target: d.label, wrapper: d.wrapper }; },
    () => { const d = containedTree(); d.trigger.disabled = true; return { target: d.label, wrapper: d.wrapper }; },
    () => { const d = containedTree(); d.trigger.attrs["aria-expanded"] = "true"; return { target: d.label, wrapper: d.wrapper }; },
    () => { const d = containedTree(); d.root.attrs.inert = ""; return { target: d.label, wrapper: d.wrapper }; },
    () => { const d = containedTree(); d.root.attrs.hidden = ""; return { target: d.label, wrapper: d.wrapper }; },
    () => { const d = containedTree(); d.wrapper.ownerDocument = { defaultView: null }; return { target: d.label, wrapper: d.wrapper }; },
    () => ({ target: new FakeElement(dom.wrapper), wrapper: dom.wrapper }),
  ];
  for (const fixture of cases) { const { target, wrapper } = fixture(); view.capture(target, wrapper); assert.deepEqual(view.log, []); }
  assert.deepEqual(view.status, []); assert.deepEqual(view.stateWrites, []);
  // Fake containment is honest controlled evidence, not native portal/focus or overlay certification.
});

test("actual outer manual page callback rejects no-ops and cancels intent before page mutation", async () => {
  const pagerNode = one(nodes(history), n => ts.isJsxSelfClosingElement(n)
    && n.tagName.getText() === "CollectionPager", "outer commit pager");
  const callback = attrs(pagerNode, "onPageChange").expression; assert.ok(ts.isArrowFunction(callback));
  const { create } = await compile("export function create(pager,onSelectionIntent){return " + callback.getText() + ";}");
  const actions = [], pager = { page: 2, pageCount: 4, setPage: value => actions.push(["page", value]) };
  const handler = create(pager, () => actions.push(["intent"]));
  for (const page of [NaN, Infinity, -1, 0, 1.5, 2, 5, "3"]) handler(page);
  assert.deepEqual(actions, []);
  handler(3); assert.deepEqual(actions, [["intent"], ["page", 3]]);
  const noIntent = create(pager, undefined); actions.length = 0; noIntent(1);
  assert.deepEqual(actions, [["page", 1]]);
  assert.match(history.getText(), /identity: \["history-commits", scopeKeyValue, repoId\]/);
  assert.match(history.getText(), /Math\.max\(shownEntries\.length, requiredDepth\)/);
});

test("original current card uses remembered bounded event pages and retains full escaped evidence", () => {
  const ActualCard = createCard(React, { ...ui, fmtTs: format.fmtTs,
    EventRow: ({ event, showRef }) => React.createElement("div",
      { "data-controlled-event": event.id, "data-show-ref": String(showRef) }, event.file) });
  for (const count of [0, 1, 50, 51, 103]) {
    const commit = { hash: "0123456789" + "<>&\"".repeat(20), message: "Captured <>&\" message", ts: "2026-10-08T04:00:00Z" };
    const events = frozen(Array.from({ length: count }, (_, id) => ({ id, file: "src/<>&\"_" + id })));
    const snapshot = JSON.stringify(events), memoryKey = JSON.stringify(["history-events", "all", "Repo_A", commit.hash]);
    for (const page of count > 50 ? [1, Math.ceil(count / 50)] : [1]) {
      const html = renderToStaticMarkup(React.createElement(ui.BoundedPageMemoryProvider, {
        pages: { [memoryKey]: page }, onPageChange: () => assert.fail("SSR must not mutate memory"),
      }, React.createElement(ActualCard, { entry: { commit, events }, repos: [], scopeKeyValue: "all", repoId: "Repo_A", onStatus: () => assert.fail("SSR must not announce") })));
      const window = ui.getBoundedPageWindow(count, page, 50);
      assert.equal((html.match(/data-controlled-event=/g) ?? []).length, window.end - window.start);
      assert.match(html, /^<article class="ui-work-row">/); assert.match(html, /Full commit ID/);
      assert.ok(html.includes("&lt;&gt;&amp;&quot;")); assert.match(html, /readonly=""/);
      assert.doesNotMatch(html, /<details[^>]*\bopen\b/);
      if (!count) assert.match(html, /No tracked events in this commit/);
      if (page > 1) assert.match(html, /Commit events .* continued/);
      if (count > 50) assert.match(html, new RegExp("Page " + window.page + " of " + window.pageCount));
      assert.equal(JSON.stringify(events), snapshot);
    }
  }
});

test("actual EventRow cleanup invalidates and aborts its diff owner when inspection unmounts", async () => {
  const owner = declaration(appAst, "EventRow");
  const cleanupEffect = one(nodes(owner), n => ts.isCallExpression(n)
    && n.expression.getText() === "useEffect" && n.arguments[0]?.getText().includes("diffGenerationRef.current += 1"),
  "existing diff cleanup effect");
  const { create } = await compile("export function create(diffGenerationRef,diffControllerRef){return "
    + cleanupEffect.arguments[0].getText() + ";}");
  const generation = { current: 7 }, calls = [], controller = { current: { abort: () => calls.push("abort") } };
  const cleanup = create(generation, controller)(); cleanup();
  assert.equal(generation.current, 8); assert.deepEqual(calls, ["abort"]);
  controller.current = null; cleanup(); assert.equal(generation.current, 9); assert.deepEqual(calls, ["abort"]);
  assert.match(owner.getText(), /diffGenerationRef\.current !== generation \|\| action\.signal\.aborted/);
  assert.match(owner.getText(), /api\.diff\(event\.repo_id, event\.file, event\.commit_hash, action\.signal\)/);
  // Current cleanup function is controlled; this does not simulate a network request or native React unmount.
});
