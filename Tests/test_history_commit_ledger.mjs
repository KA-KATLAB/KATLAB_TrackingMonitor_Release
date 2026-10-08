import { changesBriefPreservation } from "./helpers/changesTaskReviewBrief.mjs";
import { historyStationPreservation } from "./helpers/historyReviewStation.mjs";
import { purposeNavigationPreservation } from "./helpers/purposeLedNavigation.mjs";
import { mastheadPreservation } from "./helpers/workspaceCommandMasthead.mjs";
import { deskPreservation } from "./helpers/changesReviewLanes.mjs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), ".."), frontend = resolve(root, "Frontend");
const require = createRequire(resolve(frontend, "package.json"));
const ts = require("typescript"), postcss = require("postcss"), React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const read = name => readFileSync(resolve(root, name), "utf8");
const lf = text => text.replace(/\r\n/g, "\n");
const sha = text => createHash("sha256").update(text).digest("hex");
const shellSource = mastheadPreservation("Frontend/src/AppShell.tsx", purposeNavigationPreservation("Frontend/src/AppShell.tsx", read("Frontend/src/AppShell.tsx"))), appSource = read("Frontend/src/App.tsx");
const ORIGINAL_RAW = "c38bc6ccaffc12398f29ee28cd481415a250ee5f3657b819b2e7e252662b67ec";
const ORIGINAL_LF = "06f05ef94591bbf4ec7ca0e42501f747acc85acb07fd0788bc63286d9c8f6462";
const REVIEWED_RAW = "8d36a4a928da4e6d7774cc112ab3cecfe8b5e654afe05de0480facc40f21eeee";
const REVIEWED_LF = "7a2ee984f185fbcc7ff0e5aa9017b2b1dd8e8e8667068ce2c371a5bf884448a9";
const CSS_HASH = "ba899692d9937c52fe6194aa1704d725c954274737439b9901b14b69b833d7ab";
const BRAND_IMPORT = 'import { ApplicationBrand } from "./ApplicationBrand";';
const LEDGER_IMPORT = 'import "./historyCommitLedger.css";';

// Independent frozen literal and allowlist, never loaded from the ignored plan.
const REVIEWED_CSS = [
  "/* History presentation only; data, controls and source order stay owned by App. */",
  '[data-history-ready] > [aria-label="Captured commits"] {',
  "  display: grid;",
  "  gap: 1rem;",
  "  border: 0;",
  "  background: transparent;",
  "}",
  '[data-history-ready] > [aria-label="Captured commits"] > article.ui-work-row {',
  "  display: grid;",
  "  grid-template-columns: minmax(0, 1fr);",
  "  gap: 1rem;",
  "  padding: 1.25rem;",
  "  border: 1px solid rgb(var(--ui-border));",
  "  border-radius: 8px;",
  "  background: rgb(var(--ui-surface));",
  "}",
  '[data-history-ready] > [aria-label="Captured commits"] > article.ui-work-row > div:first-child {',
  "  display: grid;",
  "  grid-template-columns: minmax(0, 1fr);",
  "  align-items: baseline;",
  "  gap: 0.5rem;",
  "}",
  '[data-history-ready] > [aria-label="Captured commits"] > article.ui-work-row > div:first-child > h3 {',
  "  line-height: 1.5;",
  "}",
  '[data-history-ready] > [aria-label="Captured commits"] > article.ui-work-row > div:first-child > span:first-child {',
  "  font-variant-numeric: tabular-nums;",
  "}",
  '[data-history-ready] > [aria-label="Captured commits"] > article.ui-work-row > div:first-child > span:last-child {',
  "  min-width: 0;",
  "  overflow-wrap: anywhere;",
  "  font-variant-numeric: tabular-nums;",
  "}",
  '[data-history-ready] > [aria-label="Captured commits"] > article.ui-work-row > details {',
  "  border-top: 1px solid rgb(var(--ui-border) / 0.6);",
  "  padding-top: 0.75rem;",
  "}",
  "@media (min-width: 640px) {",
  '  [data-history-ready] > [aria-label="Captured commits"] > article.ui-work-row > div:first-child {',
  "    grid-template-columns: max-content minmax(0, 1fr);",
  "    gap: 0.75rem;",
  "  }",
  '  [data-history-ready] > [aria-label="Captured commits"] > article.ui-work-row > div:first-child > span:last-child {',
  "    grid-column: 1 / -1;",
  "  }",
  "}",
  "@media (min-width: 1440px) {",
  '  [data-history-ready] > [aria-label="Captured commits"] > article.ui-work-row > div:first-child {',
  "    grid-template-columns: max-content minmax(0, 1fr) minmax(0, 12rem);",
  "  }",
  '  [data-history-ready] > [aria-label="Captured commits"] > article.ui-work-row > div:first-child > span:last-child {',
  "    grid-column: auto;",
  "  }",
  "}",
].join("\n") + "\n";
const REGION = '[data-history-ready] > [aria-label="Captured commits"]';
const CARD = REGION + " > article.ui-work-row", HEADER = CARD + " > div:first-child";
const RULES = [
  ["", REGION, [["display", "grid"], ["gap", "1rem"], ["border", "0"], ["background", "transparent"]]],
  ["", CARD, [["display", "grid"], ["grid-template-columns", "minmax(0, 1fr)"], ["gap", "1rem"],
    ["padding", "1.25rem"], ["border", "1px solid rgb(var(--ui-border))"], ["border-radius", "8px"], ["background", "rgb(var(--ui-surface))"]]],
  ["", HEADER, [["display", "grid"], ["grid-template-columns", "minmax(0, 1fr)"], ["align-items", "baseline"], ["gap", "0.5rem"]]],
  ["", HEADER + " > h3", [["line-height", "1.5"]]],
  ["", HEADER + " > span:first-child", [["font-variant-numeric", "tabular-nums"]]],
  ["", HEADER + " > span:last-child", [["min-width", "0"], ["overflow-wrap", "anywhere"], ["font-variant-numeric", "tabular-nums"]]],
  ["", CARD + " > details", [["border-top", "1px solid rgb(var(--ui-border) / 0.6)"], ["padding-top", "0.75rem"]]],
  ["(min-width: 640px)", HEADER, [["grid-template-columns", "max-content minmax(0, 1fr)"], ["gap", "0.75rem"]]],
  ["(min-width: 640px)", HEADER + " > span:last-child", [["grid-column", "1 / -1"]]],
  ["(min-width: 1440px)", HEADER, [["grid-template-columns", "max-content minmax(0, 1fr) minmax(0, 12rem)"]]],
  ["(min-width: 1440px)", HEADER + " > span:last-child", [["grid-column", "auto"]]],
];
const PINS = [
  ["Frontend/src/App.tsx", "945c8879e94b5d7a8410d2a143ed2e127e2653dd1a123d2d8b4cd306758a6f3e", "c7c568b346c7ddf00d86b93325b97854e59f3f625f6fd916b056e85ccf069b1a"],
  ["Frontend/src/main.tsx", "c0b126cdce533a00247006a8efbb72c51b073c638a5764e0cb54d180e5f3f588", "c0b126cdce533a00247006a8efbb72c51b073c638a5764e0cb54d180e5f3f588"],
  ["Frontend/src/index.css", "9371bc04cba0b62e8a8e5e3b4a9251deea9273be58f4b9735982e0649527ba81", "788436e9def1e7109fe98d4bfa5e0add49a5f0ca301b17416279c03f18ede0f5"],
  ["Frontend/src/missionPlanGallery.css", "4b125b0e8dd6d9004838d366ed3b19166b642d62437c44fec8d7153a74cd919f", "4b125b0e8dd6d9004838d366ed3b19166b642d62437c44fec8d7153a74cd919f"],
  ["Frontend/src/healthPanel.tsx", "6cc894aa760ed66eada96511a3494f64f4b317cf15d74ad0a03ae7631d802173", "10a230292425ab64fc1fc378771026727138565f708b0b637345edaab870dbd5"],
  ["Tests/test_app_shell.mjs", "cfb3885d0035b91530fc6e397920036b0dc85e7b89876aaeb03029ddb47e40d0", "8d92c9461c4c164313c2f36a27381462a9ec47f907c7c050a2037c09cd388fd6"],
  ["Tests/test_ui_foundations.mjs", "b3a7573802f06102be18bac0472dcfe5794b304aa3f99634d7acf1d6cc6080e6", "37197cef2e020275d25965112e90c030da40500a0451ee67c22bd559876055d6"],
  ["Tests/test_mission_control_workbench.mjs", "d92813b96ba0206202d0b40f77aa7e622be438c8e9a9a68bd26290b2ee0577d3", "d92813b96ba0206202d0b40f77aa7e622be438c8e9a9a68bd26290b2ee0577d3"],
  ["Tests/test_mission_plan_gallery.mjs", "6092dbb713be9151f8a80a567e09b09732ba96040336634cf659b5be80c94138", "6092dbb713be9151f8a80a567e09b09732ba96040336634cf659b5be80c94138"],
  ["Tests/test_system_snapshot_panels.mjs", "2d84f20f7194de62d0656b7220a37c367c37696a33a6a12d673bce0c55c25a65", "2d84f20f7194de62d0656b7220a37c367c37696a33a6a12d673bce0c55c25a65"],
  ["Tests/test_operational_views.mjs", "1dc324f2fba75698b916ce4f840adf97c3abddf78bf0d6b618b994f3baaef816", "0ffce73f13e7731b0ce18bf563a3273facf3aab4bfc027ab921f04cc5736c2b3"],
  ["Tests/test_history_graph_read_states.mjs", "07469e5b16d08c074500fa84b4f969d3fa77ac1b47f91c72e87162439021c4bb", "07469e5b16d08c074500fa84b4f969d3fa77ac1b47f91c72e87162439021c4bb"],
  ["Tests/test_git_graph_merge_seed.mjs", "b96152392094e68d39e35de42a8e968ba89e42ea7ca6ebf6f91e26d995c21f75", "b96152392094e68d39e35de42a8e968ba89e42ea7ca6ebf6f91e26d995c21f75"],
  ["Tests/test_git_graph.mjs", "f2b00e4dc1b85f8d382f451e04e34feaa2f54a336aec3c679a87d5f889f8f7ed", "f4940e4c42cdf26b60630a7e0ff28436108afaf85154361405988669df0b2bf1"],
];
function ending (text) {
  assert.ok(!text.startsWith("\uFEFF") && !text.includes("\0"), "no BOM or NUL");
  const rest = text.replace(/\r\n/g, ""), eol = text.includes("\r\n") ? "\r\n" : "\n";
  assert.ok(!rest.includes("\r"), "no bare CR");
  if (eol === "\r\n") assert.ok(!rest.includes("\n"), "uniform EOL");
  return eol;
}
function parse (text) {
  const ast = ts.createSourceFile("source.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  assert.equal(ast.parseDiagnostics.length, 0, "valid whole TSX"); return ast;
}
function one (nodes, predicate, label) {
  const found = nodes.filter(predicate); assert.equal(found.length, 1, label); return found[0];
}
function all (node) {
  const found = [node]; ts.forEachChild(node, child => { found.push(...all(child)); }); return found;
}
function replaceOnce (text, old, next) {
  assert.equal(text.split(old).length - 1, 1, "one physical fixture window"); return text.replace(old, next);
}
function restoreImport (text) {
  const eol = ending(text), ast = parse(text), imports = ast.statements.filter(ts.isImportDeclaration);
  const imported = one(imports, n => ts.isStringLiteral(n.moduleSpecifier)
    && n.moduleSpecifier.text === "./historyCommitLedger.css", "one top-level CSS import");
  const brand = one(imports, n => n.getText(ast) === BRAND_IMPORT, "one actual brand anchor");
  assert.equal(imported.importClause, undefined, "side-effect only"); assert.equal(imported.getText(ast), LEDGER_IMPORT);
  assert.equal(text.split(LEDGER_IMPORT).length - 1, 1, "unique physical literal, not a comment");
  assert.equal(imported.getStart(ast), brand.end + eol.length, "immediately following actual brand line");
  assert.equal(text.slice(brand.end, imported.getStart(ast)), eol);
  assert.equal(text.slice(imported.end, imported.end + eol.length), eol, "complete unaltered physical line");
  const restored = text.slice(0, imported.getStart(ast)) + text.slice(imported.end + eol.length);
  parse(restored); return restored;
}
function checkCss (text) {
  ending(text); assert.doesNotMatch(text, /@import|url\s*\(|!\s*important/i);
  const ast = postcss.parse(text), rows = [], media = [];
  for (const node of ast.nodes) {
    if (node.type === "comment") continue;
    if (node.type === "atrule") {
      assert.equal(node.name, "media"); media.push(node.params); assert.ok(node.nodes);
      assert.ok(node.nodes.every(child => child.type === "rule"), "only reviewed rules inside media");
    }
    else assert.equal(node.type, "rule");
  }
  assert.deepEqual(media, ["(min-width: 640px)", "(min-width: 1440px)"]);
  ast.walkRules(rule => {
    assert.ok(rule.parent.type === "root" || rule.parent.type === "atrule"
      && rule.parent.parent.type === "root" && rule.parent.name === "media", "only reviewed root/media owners");
    assert.ok(rule.nodes.every(n => n.type === "decl"));
    rows.push([rule.parent.type === "root" ? "" : rule.parent.params, rule.selector,
      rule.nodes.map(n => { assert.equal(!!n.important, false); return [n.prop, n.value]; })]);
  });
  assert.deepEqual(rows, RULES, "complete eleven-rule selector/declaration allowlist");
}

test("independent stylesheet literal and complete actual PostCSS allowlist preserve scoped media/layout", () => {
  const css = read("Frontend/src/historyCommitLedger.css");
  assert.equal(ending(css), "\n"); assert.equal(css, REVIEWED_CSS); assert.equal(sha(css), CSS_HASH);
  assert.ok(css.endsWith("\n") && !css.endsWith("\n\n")); assert.doesNotMatch(css, /[ \t]+$/m); checkCss(css);
  for (const [old, next] of [
    [REGION + " {", "body {"], ["  gap: 0.5rem;", "  gap: 0.5rem !important;"],
    ["  padding: 1.25rem;", "  padding: 2rem;"],
    ["  align-items: baseline;", "  align-items: baseline;\n  height: 20rem;"],
    ["  line-height: 1.5;", "  line-height: 1.5;\n  order: -1;"],
    ["  min-width: 0;", "  min-width: 0;\n  overflow: hidden;"],
    ["@media (min-width: 1440px)", "@media (min-width: 1280px)"], ["minmax(0, 12rem)", "max-content"],
  ]) assert.throws(() => checkCss(replaceOnce(css, old, next)));
  for (const bad of [css + "body { position: fixed; }\n", css + '@import "network.css";\n',
    css + "a { background: url(network.svg); }\n", css + "a { animation: move 1s; }\n",
    css.slice(0, -2), "\uFEFF" + css, css + "\0", css.replace("\n", "\r"), css.replace("\n", "\r\n")]) {
    assert.throws(() => checkCss(bad));
  }
  for (const media of ["640", "1440"]) {
    const anchor = "@media (min-width: " + media + "px) {\n";
    for (const injected of ['  @font-face { font-family: Unowned; }\n',
      '  @supports (display: grid) { @font-face { font-family: Unowned; } }\n',
      '  unowned: declaration;\n']) {
      assert.throws(() => checkCss(replaceOnce(css, anchor, anchor + injected)));
    }
  }
});

test("strict single-import inverse restores entire RAW/LF source without executing restored data", () => {
  assert.equal(ending(shellSource), "\r\n"); assert.equal(sha(shellSource), REVIEWED_RAW);
  assert.equal(sha(lf(shellSource)), REVIEWED_LF); assert.ok(!shellSource.endsWith("\r\n\r\n"));
  assert.doesNotMatch(shellSource, /[ \t]+\r?$/m);
  assert.equal(sha(restoreImport(shellSource)), ORIGINAL_RAW);
  for (const eol of ["\n", "\r\n"]) {
    const text = lf(shellSource).replace(/\n/g, eol), restored = restoreImport(text);
    assert.equal(sha(lf(restored)), ORIGINAL_LF); assert.equal(ending(restored), eol);
  }
  const current = lf(shellSource), removed = replaceOnce(current, LEDGER_IMPORT + "\n", "");
  for (const bad of [removed, current + LEDGER_IMPORT + "\n", current + "/* " + LEDGER_IMPORT + " */\n",
    replaceOnce(current, LEDGER_IMPORT, "/* " + LEDGER_IMPORT + " */"),
    replaceOnce(removed, BRAND_IMPORT, LEDGER_IMPORT + "\n" + BRAND_IMPORT), removed + LEDGER_IMPORT + "\n",
    replaceOnce(current, LEDGER_IMPORT, 'import styles from "./historyCommitLedger.css";'),
    replaceOnce(current, LEDGER_IMPORT, "import './historyCommitLedger.css';"),
    replaceOnce(current, LEDGER_IMPORT, 'import "./historyCommitLedger.css"'),
    replaceOnce(current, LEDGER_IMPORT, LEDGER_IMPORT + " // altered"),
    replaceOnce(current, LEDGER_IMPORT, 'import /* altered */ "./historyCommitLedger.css";'),
    replaceOnce(current, LEDGER_IMPORT, 'import "./otherLedger.css";'),
    replaceOnce(current, LEDGER_IMPORT, "  " + LEDGER_IMPORT),
    replaceOnce(current, BRAND_IMPORT + "\n" + LEDGER_IMPORT, BRAND_IMPORT + "\n\n" + LEDGER_IMPORT),
    removed + "\nfunction nested () {\n" + LEDGER_IMPORT + "\n}\n", current + "const broken = <div>;\n",
  ]) for (const eol of ["\n", "\r\n"]) assert.throws(() => restoreImport(bad.replace(/\n/g, eol)));
  for (const bad of ["\uFEFF" + current, current + "\0", current.replace("\n", "\r"), current.replace("\n", "\r\n")]) {
    assert.throws(() => restoreImport(bad));
  }
  // Original text is preservation data only; never transpiled/imported/executed.
});

test("valid outside mutations pass through the inverse and fail full original pins; old suites remain unchanged", () => {
  for (const [old, next] of [['from "./format"', 'from "./otherFormat"'], ["{actions}</div>", "{children}</div>"],
    ["Waiting for workspace snapshot", "Different waiting label"],
    ["export function AppShell (", "// Unrelated valid comment.\nexport function AppShell ("]]) {
    for (const eol of ["\n", "\r\n"]) {
      const text = lf(shellSource).replace(/\n/g, eol), a = old.replace(/\n/g, eol), b = next.replace(/\n/g, eol);
      const restored = restoreImport(replaceOnce(text, a, b));
      assert.equal(restored, replaceOnce(restoreImport(text), a, b)); assert.notEqual(sha(lf(restored)), ORIGINAL_LF);
    }
  }
  for (const [name, rawPin, lfPin] of PINS) {
    const text = deskPreservation(name, mastheadPreservation(name, purposeNavigationPreservation(name, historyStationPreservation(name, changesBriefPreservation(name, read(name)))))); ending(text); assert.equal(sha(text), rawPin, name); assert.equal(sha(lf(text)), lfPin, name);
    for (const eol of ["\n", "\r\n"]) assert.equal(sha(lf(lf(text).replace(/\n/g, eol))), lfPin);
  }
});

const app = parse(appSource);
const owner = name => one(app.statements, n => ts.isFunctionDeclaration(n) && n.name?.text === name, "one actual " + name);
const opening = n => ts.isJsxElement(n) ? n.openingElement : n;
const attr = (n, name) => one([...opening(n).attributes.properties], a => ts.isJsxAttribute(a)
  && a.name.getText(app) === name, "one actual attribute " + name);
const value = (n, name) => attr(n, name).initializer.getText(app);
const elements = n => all(n).filter(ts.isJsxElement);
const direct = n => n.children.filter(ts.isJsxElement);
test("actual private History AST keeps one station inspector, hash/title/time order, full identity and linked-event pagers", () => {
  const history = owner("HistoryView"), card = owner("HistoryCommitCard");
  const rootNode = one([...history.body.statements], ts.isReturnStatement, "one History return").expression.expression;
  assert.equal(rootNode.openingElement.tagName.getText(app), "section");
  assert.equal(value(rootNode, "data-history-ready"), '{historyReady ? "true" : "false"}');
  const region = one(elements(history), n => n.openingElement.attributes.properties.some(a => ts.isJsxAttribute(a)
    && a.name.getText(app) === "aria-label" && ts.isStringLiteral(a.initializer)
    && a.initializer.text === "Captured commits"), "one actual captured region");
  assert.equal(value(region, "role"), '"region"');
  let boundary = region;
  while (boundary.parent && !ts.isJsxExpression(boundary.parent)) boundary = boundary.parent;
  assert.ok(ts.isJsxExpression(boundary.parent)); assert.equal(boundary.parent.parent, rootNode);
  assert.ok(boundary.parent.getText(app).startsWith("{shownEntries.length > 0 &&"));
  const station = one(all(region), n => ts.isJsxSelfClosingElement(n) && n.tagName.getText(app) === "HistoryReviewStation", "one current station");
  for (const [name, expected] of [["entries", "{shownEntries.slice(pager.start, pager.end)}"],
    ["pageStart", "{pager.start}"], ["fetchedCount", "{shownEntries.length}"], ["hydrating", "{historyHydrating}"],
    ["onSelectionIntent", "{onSelectionIntent}"]]) assert.equal(value(station, name), expected);
  const call = one(all(region), n => ts.isJsxSelfClosingElement(n) && n.tagName.getText(app) === "HistoryCommitCard", "one unchanged card callback");
  for (const [name, expected] of [["key", "{occurrenceKey}"], ["entry", "{entry}"], ["repos", "{repos}"],
    ["scopeKeyValue", "{scopeKeyValue}"], ["repoId", "{repoId}"], ["onStatus", "{onStatus}"]]) assert.equal(value(call, name), expected);
  const article = one(elements(card), n => n.openingElement.tagName.getText(app) === "article", "one actual article");
  assert.equal(value(article, "className"), '"ui-work-row"');
  assert.deepEqual(direct(article).map(n => n.openingElement.tagName.getText(app)), ["div", "details", "div"]);
  const [header, details, events] = direct(article), [hash, title, time] = direct(header);
  assert.deepEqual(direct(header).map(n => n.openingElement.tagName.getText(app)), ["span", "h3", "span"]);
  assert.equal(value(hash, "title"), "{commit.hash}"); assert.ok(hash.getText(app).includes("{commit.hash.slice(0, 10)}"));
  assert.ok(value(hash, "className").includes("font-mono text-sm"));
  assert.ok(title.getText(app).includes("{commit.message}")); assert.ok(value(title, "className").includes("text-base"));
  assert.ok(value(title, "className").includes("[overflow-wrap:anywhere]"));
  assert.equal(value(time, "title"), "{commit.ts}"); assert.ok(time.getText(app).includes("{fmtTs(commit.ts)}"));
  assert.ok(value(time, "className").includes("text-xs"));
  assert.equal(value(details, "key"), '{JSON.stringify(["history-commit-id", scopeKeyValue, repoId, commit.hash])}');
  assert.ok(!details.openingElement.attributes.properties.some(a => a.name?.getText(app) === "open"));
  assert.equal(direct(details)[0].openingElement.tagName.getText(app), "summary");
  const input = one(all(details), n => ts.isJsxSelfClosingElement(n) && n.tagName.getText(app) === "input", "one native ID field");
  assert.equal(value(input, "value"), "{commit.hash}"); assert.equal(value(input, "type"), '"text"');
  assert.equal(attr(input, "readOnly").initializer, undefined); assert.ok(details.getText(app).includes("Commit ID in {repoId}"));
  assert.ok(events.getText(app).includes("events.slice(pager.start, pager.end).map"));
  const row = one(all(events), n => ts.isJsxSelfClosingElement(n) && n.tagName.getText(app) === "EventRow", "one event map");
  assert.equal(value(row, "key"), "{event.id}"); assert.equal(value(row, "event"), "{event}");
  assert.equal(value(row, "onStatus"), "{onStatus}"); attr(row, "showRef");
  assert.ok(card.getText(app).includes('JSON.stringify(["history-events", scopeKeyValue, repoId, commit.hash])'));
  assert.ok(card.getText(app).includes("pageSize: 50")); assert.ok(events.getText(app).includes("events.length > 50"));
  assert.ok(history.getText(app).includes("pageSize: 50")); assert.ok(history.getText(app).includes("!historyHydrating && shownEntries.length > 50"));
});

test("actual graph/request/retirement boundaries remain distinct from the scoped commit region", () => {
  const history = owner("HistoryView"), text = history.getText(app);
  for (const expected of ["loadedRepoRef.current === repoId ? entries : []",
    "const historyReady = !repoId || !!loadError || !historyHydrating;", "cancelLoad();", "cancelGraph();",
    "entriesRef.current = [];", "api.history(id, PAGE, offset, owner.controller.signal)",
    "loadGenerationRef.current !== generation", "graphGenerationRef.current !== generation",
    'recovery: moduleFailure ? "reload" : "retry"', 'graphFailure.recovery === "reload"',
    "() => window.location.reload()", "showGraph && (", 'aria-label="commit graph"']) assert.ok(text.includes(expected), expected);
  const host = one(all(history).filter(ts.isJsxSelfClosingElement), n => n.attributes.properties.some(a => ts.isJsxAttribute(a)
    && a.name.getText(app) === "ref" && a.initializer?.getText(app) === "{graphRef}"), "one imperative graph host");
  assert.equal(value(host, "hidden"), "{!repoId || loadedRepoRef.current !== repoId || !graphSvg}");
  assert.equal(value(host, "className"), '"ui-local-scroller"');
});

let vite, shell, brand, ui, buildVersion;
before(async () => {
  const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
  vite = await createServer({ root: frontend, server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom", optimizeDeps: { noDiscovery: true, entries: [] } });
  [shell, brand, ui, { UI_BUILD_VERSION: buildVersion }] = await Promise.all([
    vite.ssrLoadModule("/src/AppShell.tsx"), vite.ssrLoadModule("/src/ApplicationBrand.tsx"),
    vite.ssrLoadModule("/src/ui.tsx"), vite.ssrLoadModule("/src/appVersion.ts"),
  ]);
});
after(async () => { await vite?.close(); });
const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));
function nodes (element) {
  if (Array.isArray(element)) return element.flatMap(nodes);
  return React.isValidElement(element) ? [element, ...nodes(element.props.children)] : [];
}
const repo = (id, extra = {}) => ({ id, offline: false, status_valid: true, clean: false,
  count: 2, branch: "develop", last_event_ts: null, ...extra });
const props = (repos, extra = {}) => ({ scope: { kind: "all" }, repos, ready: true,
  error: "", violationOf: () => null, onDetails() {}, ...extra });
test("raw-current shell and brand retain exact slots, loaded build, safe text and callbacks", () => {
  const canonical = read("Backend/app/version.py").match(/^__version__ = "([^"]+)"$/m)[1];
  assert.equal(buildVersion, canonical);
  let calls = 0; const onSystem = () => calls++;
  const actions = React.createElement("button", { onClick() {} }, "Actions <safe>&"),
    context = React.createElement("span", null, "Context <safe>&"), feedback = React.createElement("p", null, "Feedback <safe>&");
  const tree = shell.AppShell({ actions, context, children: feedback, onSystem });
  const item = one(nodes(tree), n => n.type === brand.ApplicationBrand, "actual brand owner");
  assert.equal(item.props.onSystem, onSystem);
  const badge = one(nodes(brand.ApplicationBrand(item.props)), n => n.type === "button", "one actual build badge");
  assert.equal(badge.props.onClick, onSystem); assert.equal(badge.props.type, "button");
  badge.props.onClick(); assert.equal(calls, 1);
  assert.equal(tree.props.children[1], context); assert.equal(tree.props.children[2], feedback); assert.ok(nodes(tree).includes(actions));
  const html = render(shell.AppShell, { actions, context, children: feedback, onSystem });
  assert.equal((html.match(/<h1\b/g) || []).length, 1);
  assert.ok(html.includes("KATLAB Tracking Monitor")); assert.ok(html.includes("v" + canonical)); assert.ok(html.includes("Open System health"));
  for (const slot of ["Actions", "Context", "Feedback"]) assert.ok(html.includes(slot + " &lt;safe&gt;&amp;"));
  assert.ok(html.indexOf("Actions") < html.indexOf("Context") && html.indexOf("Context") < html.indexOf("Feedback"));
  assert.doesNotMatch(html, /<safe>/); assert.ok(render(shell.AppShellNavigation, { children: "Views" }).includes('aria-label="Workspace navigation"'));
});

test("current workspace and connection owners keep pending/error/empty/Unknown/offline/accepted states honest", () => {
  for (const [input, expected, absent] of [
    [props([], { ready: false }), "Waiting for workspace snapshot", /No repositories configured|known statuses clean/],
    [props([], { ready: false, error: "Failed" }), "Workspace snapshot unavailable", /No repositories configured|known statuses clean/],
    [props([]), "No repositories configured", /known statuses clean/],
    [props([], { scope: { kind: "repo", id: "removed" } }), "Selected repository unavailable", /known statuses clean/],
    [props([repo("Unknown", { status_valid: false, clean: true, count: 987 })]), "Git status unavailable", /987|known uncommitted/],
    [props([repo("Offline", { offline: true, clean: true, count: 999 })]), "No online repositories", /999|known statuses clean/],
    [props([repo("Offline", { offline: true })], { scope: { kind: "repo", id: "Offline" } }), "Repository unavailable", /known statuses clean/],
  ]) { const html = render(shell.WorkspaceContext, input); assert.ok(html.includes(expected)); assert.doesNotMatch(html, absent); }
  const html = render(shell.WorkspaceContext, props([repo("Clean", { clean: true, count: 0 }), repo("Dirty"),
    repo("Unknown", { status_valid: false, count: 987 }), repo("Offline", { offline: true, count: 999 })]));
  for (const text of ["1/2 known statuses clean", "2 known uncommitted changes", "1 Git status unknown", "1 unavailable"]) assert.ok(html.includes(text));
  assert.doesNotMatch(html, /987|999/);
  for (const state of ["connecting", "connected", "reconnecting"]) {
    const value = render(shell.ConnectionStatus, { state });
    assert.ok(value.includes(state[0].toUpperCase() + state.slice(1)));
    assert.ok(value.includes("not proof of fresh data or verification readiness"));
  }
});
test("retained current context escapes long identities and forwards the real status control without a portal", () => {
  const id = '<script>Long & "repo"</script>'.repeat(15), selected = repo(id, {
    status_valid: false, branch: '<branch>&"scope"'.repeat(20),
  });
  let calls = 0; const onDetails = () => calls++;
  const input = props([selected], { scope: { kind: "repo", id }, error: "Controlled refresh failure", violationOf: () => 2, onDetails });
  const control = one(nodes(shell.WorkspaceContext(input)), n => n.type === ui.ControlButton, "one actual status control");
  assert.equal(control.props.onClick, onDetails);
  const button = ui.ControlButton.render(control.props, null);
  assert.equal(button.props.onClick, onDetails); button.props.onClick(); assert.equal(calls, 1);
  const html = render(shell.WorkspaceContext, input);
  for (const text of ["Last-known branch", "No captures yet", "1 discipline warning",
    "Refresh failed; showing the last workspace snapshot", "Repository status",
    "&lt;script&gt;Long &amp; &quot;repo&quot;&lt;/script&gt;", "&lt;branch&gt;&amp;&quot;scope&quot;"]) assert.ok(html.includes(text), text);
  assert.doesNotMatch(html, /<script>|<branch>/); assert.ok(html.includes("[overflow-wrap:anywhere]"));
  // No document-dependent modal, native paint, geometry, keyboard, focus or AT claim.
});
