import { deskPreservation } from "./helpers/changesReviewLanes.mjs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { canonicalPrintedText } from "./helpers/printed_source.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), ".."), frontend = resolve(root, "Frontend");
const require = createRequire(resolve(frontend, "package.json"));
const ts = require("typescript"), postcss = require("postcss"), React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const read = path => readFileSync(resolve(root, path), "utf8");
const sha = text => createHash("sha256").update(text).digest("hex"), lf = text => text.replace(/\r\n/g, "\n");
const source = read("Frontend/src/planBoard.tsx");
const ANCHOR = 'import { CollectionPager, SectionHeading, Surface, useBoundedPage } from "./ui";';
const IMPORT = 'import "./activePlanGallery.css";';
const OLD_TAG = '<Surface data-reveal tone="quiet">';
const NEW_TAG = '<Surface data-reveal tone="quiet" data-active-plan-board="true">';
const ORIGINAL_RAW = "0cb69b6c842d98c074b372b4c50f2d447c6b1a4a47e506ba557e6d8cedcde710";
const ORIGINAL_LF = "0c2ac0efaccff972201135aa996ba5f1f703fa88489fbc12c5c65a786625cfcc";
const REVIEWED_RAW = "1e3a6a74fc5c6ef038fde019e98afd2b5951cd0a75830d86e98acac52dfa0170";
const REVIEWED_LF = "ab494423ca66233ed6848392976b05a5d52ecb3797722477da921e133a651288";
const CSS_HASH = "12a7163ac9b28d2a251f9011889287f70b72f7aa1bc78624f587f24692100242";
// Independent reviewed literal and declarations, never read from the ignored plan.
const CSS = [
  "/* Active-plan presentation only; grouping, paging and actions stay. */",
  '.ui-surface[data-active-plan-board="true"] > .ui-work-list {',
  "  display: grid;",
  "  grid-template-columns: minmax(0, 1fr);",
  "  gap: 1rem;",
  "  border: 0;",
  "  border-radius: 0;",
  "  background: transparent;",
  "}",
  '.ui-surface[data-active-plan-board="true"] > .ui-work-list > div {',
  "  min-width: 0;",
  "  padding: 1.25rem;",
  "  border: 1px solid rgb(var(--ui-border));",
  "  border-radius: 8px;",
  "  background: rgb(var(--ui-surface));",
  "}",
  '.ui-surface[data-active-plan-board="true"] > .ui-work-list > div > div:first-child {',
  "  gap: 0.75rem;",
  "  align-items: flex-start;",
  "}",
  '.ui-surface[data-active-plan-board="true"] > .ui-work-list > div > div:first-child > span:first-child {',
  "  flex-basis: 100%;",
  "  font-size: 1.125rem;",
  "  line-height: 1.5;",
  "  overflow-wrap: anywhere;",
  "}",
  '.ui-surface[data-active-plan-board="true"] > .ui-work-list > div > div.mt-3 {',
  "  padding: 1rem;",
  "  border-left: 3px solid rgb(var(--ui-warning));",
  "  border-radius: 8px;",
  "  background: rgb(var(--ui-surface-raised));",
  "}",
  '.ui-surface[data-active-plan-board="true"] > .ui-work-list > div > p,',
  '.ui-surface[data-active-plan-board="true"] > .ui-work-list > div > div.mt-3 > p {',
  "  font-size: 0.875rem;",
  "  line-height: 1.5;",
  "  overflow-wrap: anywhere;",
  "}",
  "@media (min-width: 1024px) {",
  '  .ui-surface[data-active-plan-board="true"] > .ui-work-list {',
  "    grid-template-columns: repeat(2, minmax(0, 1fr));",
  "  }",
  "}",
  "",
].join("\n");
const LIST = '.ui-surface[data-active-plan-board="true"] > .ui-work-list', CARD = LIST + " > div";
const RULES = [
  [LIST, [["display", "grid"], ["grid-template-columns", "minmax(0, 1fr)"], ["gap", "1rem"], ["border", "0"], ["border-radius", "0"], ["background", "transparent"]]],
  [CARD, [["min-width", "0"], ["padding", "1.25rem"], ["border", "1px solid rgb(var(--ui-border))"], ["border-radius", "8px"], ["background", "rgb(var(--ui-surface))"]]],
  [CARD + " > div:first-child", [["gap", "0.75rem"], ["align-items", "flex-start"]]],
  [CARD + " > div:first-child > span:first-child", [["flex-basis", "100%"], ["font-size", "1.125rem"], ["line-height", "1.5"], ["overflow-wrap", "anywhere"]]],
  [CARD + " > div.mt-3", [["padding", "1rem"], ["border-left", "3px solid rgb(var(--ui-warning))"], ["border-radius", "8px"], ["background", "rgb(var(--ui-surface-raised))"]]],
  [CARD + " > p, " + CARD + " > div.mt-3 > p", [["font-size", "0.875rem"], ["line-height", "1.5"], ["overflow-wrap", "anywhere"]]],
];
const PINS = [
  ["Frontend/src/App.tsx", "945c8879e94b5d7a8410d2a143ed2e127e2653dd1a123d2d8b4cd306758a6f3e", "c7c568b346c7ddf00d86b93325b97854e59f3f625f6fd916b056e85ccf069b1a"],
  ["Frontend/src/OverviewView.tsx", "98f77fe8a3f97033f5a2084439f8da6dcb203547d7b1f8409aca11892598d214", "9d42a6c52828018f6bb0ab7f3f668e0040e0a190de144517715460f93b84410a"],
  ["Frontend/src/ApplicationBrand.tsx", "a7102795274f1ba784f486d1ed5bd9dbaa78d829005d60fbd0275d6a13a44026", "0e6d42ee96b7c0899e8b329b8d5e85d52c01cdc19591bbf5189da65daf266d22"],
  ["Frontend/src/AppShell.tsx", "8d36a4a928da4e6d7774cc112ab3cecfe8b5e654afe05de0480facc40f21eeee", "7a2ee984f185fbcc7ff0e5aa9017b2b1dd8e8e8667068ce2c371a5bf884448a9"],
  ["Frontend/src/ui.tsx", "b5650b9e2a3529ff1ca033ed077d7b806f0cc9341c9733b4b3a52c107ab99974", "e1c2ad05398cf771ee17ba576b7feecf03829459379b9e02e35c58aea5004c46"],
  ["Frontend/src/index.css", "9371bc04cba0b62e8a8e5e3b4a9251deea9273be58f4b9735982e0649527ba81", "788436e9def1e7109fe98d4bfa5e0add49a5f0ca301b17416279c03f18ede0f5"],
  ["Frontend/src/main.tsx", "c0b126cdce533a00247006a8efbb72c51b073c638a5764e0cb54d180e5f3f588", "c0b126cdce533a00247006a8efbb72c51b073c638a5764e0cb54d180e5f3f588"],
  ["Frontend/src/healthPanel.tsx", "6cc894aa760ed66eada96511a3494f64f4b317cf15d74ad0a03ae7631d802173", "10a230292425ab64fc1fc378771026727138565f708b0b637345edaab870dbd5"],
  ["Frontend/src/missionPlanGallery.css", "4b125b0e8dd6d9004838d366ed3b19166b642d62437c44fec8d7153a74cd919f", "4b125b0e8dd6d9004838d366ed3b19166b642d62437c44fec8d7153a74cd919f"],
  ["Frontend/src/workspaceCommandFrame.css", "c1de68858cfd2c4a502ab02e8e0e8a7cefecb7931172ffd055feb8778b9f7592", "c1de68858cfd2c4a502ab02e8e0e8a7cefecb7931172ffd055feb8778b9f7592"],
  ["Frontend/src/historyCommitLedger.css", "ba899692d9937c52fe6194aa1704d725c954274737439b9901b14b69b833d7ab", "ba899692d9937c52fe6194aa1704d725c954274737439b9901b14b69b833d7ab"],
  ["Tests/test_plan_file_declarations.mjs", "60270a88f0d82b9732bfba65c9bce017ff6896672e94ed1ce81f2676066313e5", "60270a88f0d82b9732bfba65c9bce017ff6896672e94ed1ce81f2676066313e5"],
  ["Tests/test_disclosure_focus_return.mjs", "1868449de20731c49da56f3a33ab6253375f925946efd4468d1d549e0cd74d46", "1868449de20731c49da56f3a33ab6253375f925946efd4468d1d549e0cd74d46"],
  ["Tests/test_operational_views.mjs", "1dc324f2fba75698b916ce4f840adf97c3abddf78bf0d6b618b994f3baaef816", "0ffce73f13e7731b0ce18bf563a3273facf3aab4bfc027ab921f04cc5736c2b3"],
  ["Tests/test_ui_foundations.mjs", "b3a7573802f06102be18bac0472dcfe5794b304aa3f99634d7acf1d6cc6080e6", "37197cef2e020275d25965112e90c030da40500a0451ee67c22bd559876055d6"],
  ["Tests/test_mission_control_workbench.mjs", "d92813b96ba0206202d0b40f77aa7e622be438c8e9a9a68bd26290b2ee0577d3", "d92813b96ba0206202d0b40f77aa7e622be438c8e9a9a68bd26290b2ee0577d3"],
  ["Tests/test_mission_plan_gallery.mjs", "6092dbb713be9151f8a80a567e09b09732ba96040336634cf659b5be80c94138", "6092dbb713be9151f8a80a567e09b09732ba96040336634cf659b5be80c94138"],
  ["Tests/test_system_snapshot_panels.mjs", "2d84f20f7194de62d0656b7220a37c367c37696a33a6a12d673bce0c55c25a65", "2d84f20f7194de62d0656b7220a37c367c37696a33a6a12d673bce0c55c25a65"],
  ["Tests/test_history_commit_ledger.mjs", "66944cd059bc1714d10aa377a5c372c7f47213a21acd7952ad14e75e476a8e75", "66944cd059bc1714d10aa377a5c372c7f47213a21acd7952ad14e75e476a8e75"],
  ["Tests/test_workspace_command_frame.mjs", "c46140e06176cc3781d8e1acf17c5e9eee11989524e6341a3d15d0f810e7c247", "c46140e06176cc3781d8e1acf17c5e9eee11989524e6341a3d15d0f810e7c247"],
  ["Tests/test_app_version.mjs", "d86fa77843bdf4f552fc7e97bec8f5ecea839f98080451325bef4cd81674d6c3", "c5cc037e582d0ff5066d959b76ccb804e58c452cfcb1f92c23a0fba8786b15f5"],
];
function ending (text) {
  assert.ok(!text.startsWith("\uFEFF") && !text.includes("\0"), "no BOM/NUL");
  const rest = text.replace(/\r\n/g, ""), eol = text.includes("\r\n") ? "\r\n" : "\n";
  assert.ok(!rest.includes("\r"), "no bare CR");
  if (eol === "\r\n") assert.ok(!rest.includes("\n"), "uniform EOL");
  assert.ok(text.endsWith(eol) && !text.endsWith(eol + eol), "single final newline");
  assert.doesNotMatch(text, /[ \t]+$/m, "no trailing whitespace"); return eol;
}
function parse (text) {
  const ast = ts.createSourceFile("actual.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  assert.equal(ast.parseDiagnostics.length, 0, "complete valid TSX"); return ast;
}
function all (node) {
  const nodes = [node]; ts.forEachChild(node, child => { nodes.push(...all(child)); }); return nodes;
}
function one (nodes, predicate, label) {
  const found = nodes.filter(predicate); assert.equal(found.length, 1, label); return found[0];
}
function replaceOnce (text, old, next) {
  assert.equal(text.split(old).length - 1, 1, "unique physical fixture window"); return text.replace(old, next);
}
function restoreBoard (text) {
  const eol = ending(text), ast = parse(text), imports = ast.statements.filter(ts.isImportDeclaration);
  const added = one(imports, n => n.moduleSpecifier.text === "./activePlanGallery.css", "one actual top-level CSS import");
  const anchor = one(imports, n => n.getText(ast) === ANCHOR, "exact actual UI anchor");
  assert.equal(added.importClause, undefined); assert.equal(added.getText(ast), IMPORT);
  assert.equal(text.split(IMPORT).length - 1, 1); assert.equal(text.split(ANCHOR).length - 1, 1);
  assert.equal(added.getStart(ast), anchor.end + eol.length, "immediate next physical line");
  assert.equal(text.slice(added.getStart(ast), added.end + eol.length), IMPORT + eol, "complete exact import line");
  const board = one(ast.statements, n => ts.isFunctionDeclaration(n) && n.name?.text === "PlanBoard", "actual top-level board owner");
  const last = board.body.statements.at(-1); assert.ok(ts.isReturnStatement(last), "final board return");
  let result = last.expression; while (ts.isParenthesizedExpression(result)) result = result.expression;
  assert.ok(ts.isJsxElement(result), "direct final-return JSX owner, no wrapper");
  const opening = result.openingElement;
  assert.equal(opening.tagName.getText(ast), "Surface"); assert.equal(opening.getText(ast), NEW_TAG);
  assert.equal(text.split(NEW_TAG).length - 1, 1, "one complete physical Surface opening");
  const marker = one(all(ast), n => ts.isJsxAttribute(n) && n.name.getText(ast) === "data-active-plan-board", "one actual marker");
  assert.ok(opening.attributes.properties.includes(marker), "marker belongs to final direct Surface");
  const restoredTag = text.slice(0, opening.getStart(ast)) + OLD_TAG + text.slice(opening.end);
  const restored = restoredTag.slice(0, added.getStart(ast)) + restoredTag.slice(added.end + eol.length);
  parse(restored); assert.equal(ending(restored), eol); return restored;
}
function checkRule (node, expected) {
  assert.equal(node.type, "rule");
  assert.equal(node.selector.replace(/\s+/g, " ").trim(), expected[0]);
  assert.ok(node.nodes.every(n => n.type === "decl"), "direct declarations only, no nested escape");
  assert.deepEqual(node.nodes.map(n => [n.prop, n.value, Boolean(n.important)]),
    expected[1].map(([key, value]) => [key, value, false]));
}
function checkCss (text) {
  ending(text); const ast = postcss.parse(text); assert.equal(ast.nodes.length, 8, "comment, six roots, one media");
  assert.equal(ast.nodes[0].type, "comment");
  assert.equal(ast.nodes[0].text, "Active-plan presentation only; grouping, paging and actions stay.");
  RULES.forEach((rule, index) => checkRule(ast.nodes[index + 1], rule));
  const media = ast.nodes[7]; assert.equal(media.type, "atrule"); assert.equal(media.name, "media");
  assert.equal(media.params, "(min-width: 1024px)"); assert.equal(media.nodes.length, 1);
  assert.ok(media.nodes.every(n => n.type === "rule"), "media DIRECT children must be rules");
  checkRule(media.nodes[0], [LIST, [["grid-template-columns", "repeat(2, minmax(0, 1fr))"]]]);
}
test("independent 43-line stylesheet fully allowlists root, paired selectors and direct media children", () => {
  const current = read("Frontend/src/activePlanGallery.css");
  assert.equal(current, CSS); assert.equal(sha(current), CSS_HASH); assert.equal(Buffer.byteLength(current), 1389);
  assert.equal(current.split("\n").length - 1, 43);
  for (const eol of ["\n", "\r\n"]) { const variant = CSS.replace(/\n/g, eol); checkCss(variant); assert.equal(sha(lf(variant)), CSS_HASH); }
});
test("stylesheet rejects global, nested, network, motion, media, declaration and physical-byte escapes", () => {
  const media = "@media (min-width: 1024px) {\n";
  const variants = [CSS + "body { color: red; }\n", CSS + "/* extra */\n", CSS + "\n", CSS.slice(0, -1),
    CSS.replace(media, "@media (min-width: 768px) {\n"),
    CSS.replace(media, media + "  @font-face { font-family: escaped; src: url(x); }\n"),
    CSS.replace(media, media + "  @supports (display: grid) { body { display: none; } }\n"),
    CSS.replace(media, media + "  color: red;\n"),
    CSS.replace("  display: grid;", "  display: grid;\n  @supports (display: grid) { color: red; }"),
    CSS.replace("  display: grid;", "  display: grid;\n  body { color: red; }"),
    CSS.replace("  display: grid;", "  display: grid;\n  /* escaped */"),
    CSS.replace("display: grid;", "display: grid !important;"), CSS.replace("display: grid;", "display: grid; display: grid;"),
    CSS.replace("display: grid;", "height: 20px;"), CSS.replace("display: grid;", "overflow: hidden;"),
    CSS.replace("display: grid;", "order: 2;"), CSS.replace("display: grid;", "animation: none;"),
    CSS.replace("display: grid;", "background: url(https://invalid.example/a);"),
    CSS.replace("display: grid;", "display: malformed;"), CSS.replace(CARD + " > p,", "body,"),
    CSS.replace("1.25rem", "1rem"), CSS.replace("}", ""), "\uFEFF" + CSS, CSS + "\0",
    CSS.replace("\n", "\r\n"), CSS.replace("\n", "\r")];
  variants.forEach(variant => assert.throws(() => checkCss(variant)));
});
test("two actual AST windows preserve complete original RAW/LF and both physical EOL forms", () => {
  assert.equal(ending(source), "\r\n"); assert.equal(sha(source), REVIEWED_RAW); assert.equal(sha(lf(source)), REVIEWED_LF);
  assert.equal(sha(restoreBoard(source)), ORIGINAL_RAW);
  for (const eol of ["\n", "\r\n"]) {
    const current = lf(source).replace(/\n/g, eol), original = restoreBoard(current);
    assert.equal(sha(lf(original)), ORIGINAL_LF);
    assert.equal(original, current.replace(IMPORT + eol, "").replace(NEW_TAG, OLD_TAG));
  }
});
test("AST sites reject missing, duplicate, commented, nested, moved, partial and wrapped owners", () => {
  const text = lf(source);
  const variants = [text.replace(IMPORT + "\n", ""), text.replace(IMPORT, IMPORT + "\n" + IMPORT),
    text.replace(IMPORT, "/* " + IMPORT + " */"), text.replace(IMPORT, 'import gallery from "./activePlanGallery.css";'),
    text.replace(IMPORT, "import './activePlanGallery.css';"), text.replace(IMPORT, IMPORT + " // partial"),
    text.replace(IMPORT, "\n" + IMPORT), text.replace(IMPORT + "\n", "") + IMPORT + "\n",
    text.replace(IMPORT, "function nested () { " + IMPORT + " }"), text + "// " + IMPORT + "\n",
    text.replace(NEW_TAG, OLD_TAG), text.replace(NEW_TAG, NEW_TAG + NEW_TAG),
    text.replace(NEW_TAG, '<Surface data-reveal data-active-plan-board="true" tone="quiet">'),
    text.replace(NEW_TAG, NEW_TAG.replace('"true"', '"false"')),
    text.replace(NEW_TAG, NEW_TAG + " {/* " + NEW_TAG + " */}"),
    text.replace(NEW_TAG, "<div>" + NEW_TAG).replace("</Surface>", "</Surface></div>"),
    text.replace(NEW_TAG, OLD_TAG).replace('<div className="ui-work-list">', '<div data-active-plan-board="true" className="ui-work-list">'),
    text.replace("export function PlanBoard (", "function Parent () {\nexport function PlanBoard (") + "}\n",
    text.replace(ANCHOR, ANCHOR.replace("Surface,", "Surface as Other,")), text.slice(0, -6),
    text + "\n", text.slice(0, -1), "\uFEFF" + text, text + "\0", text.replace("\n", "\r\n"), text.replace("\n", "\r")];
  variants.forEach(variant => assert.throws(() => restoreBoard(variant)));
});
test("unrelated valid edits remain visible through inverse; historical owners and guards stay whole-pinned", () => {
  const text = lf(source), original = restoreBoard(text);
  for (const [old, next] of [["export function groupActivePlans (", "// Outside both windows.\nexport function groupActivePlans ("],
    ['title="Active plans"', 'title="Unrelated changed title"']]) {
    const restored = restoreBoard(replaceOnce(text, old, next));
    assert.equal(restored, replaceOnce(original, old, next)); assert.notEqual(sha(lf(restored)), ORIGINAL_LF);
  }
  for (const [path, rawPin, lfPin] of PINS) {
    const current = deskPreservation(path, read(path)); ending(current); assert.equal(sha(current), rawPin, path); assert.equal(sha(lf(current)), lfPin, path);
    for (const eol of ["\n", "\r\n"]) assert.equal(sha(lf(lf(current).replace(/\n/g, eol))), lfPin, path);
  }
  const ast = parse(source), board = one(ast.statements, n => ts.isFunctionDeclaration(n) && n.name?.text === "PlanBoard");
  const group = one(ast.statements, n => ts.isFunctionDeclaration(n) && n.name?.text === "groupActivePlans");
  const printer = ts.createPrinter({ removeComments: true });
  assert.equal(sha(canonicalPrintedText(printer.printNode(ts.EmitHint.Unspecified, group, ast))),
    "01917b880b7a38b71cf13fcbce0b27e441c28ba390626a0aa938f5146d79492d");
  const preRender = board.body.statements.slice(0, -1).map(n => printer.printNode(ts.EmitHint.Unspecified, n, ast)).join("\n");
  assert.equal(sha(canonicalPrintedText(preRender)), "a40383225fd8e2a0093793fb211f69b79093e8581d753e1ca56adc872f4946e8");
});

let vite, currentBoard, ui, data;
before(async () => {
  const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
  vite = await createServer({ root: frontend, logLevel: "error",
    server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom",
    optimizeDeps: { noDiscovery: true, entries: [] } });
  currentBoard = await vite.ssrLoadModule("/src/planBoard.tsx");
  ui = await vite.ssrLoadModule("/src/ui.tsx"); data = await vite.ssrLoadModule("/src/accessibleData.tsx");
});
after(async () => { await vite?.close(); });
const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));
function task (repo, plan, id, status = "pending", extra = {}) {
  return { repo, plan_file: plan, task_ref: plan + " - " + id, title: "Title " + id, status,
    files: [], why: null, last_event_ts: null, ...extra };
}
function frozen (value) {
  if (value && typeof value === "object") { Object.values(value).forEach(frozen); Object.freeze(value); } return value;
}
function elements (value) {
  if (Array.isArray(value)) return value.flatMap(elements);
  return React.isValidElement(value) ? [value, ...elements(value.props.children)] : [];
}
// Only ACTUAL CURRENT source is compiled. Inverse fixtures above are preservation data, never executable.
function actualBoard (requestedPage = 1) {
  const ast = parse(source), statements = ast.statements.filter(n => !ts.isImportDeclaration(n)).map(n => n.getText(ast));
  const compiled = ts.transpileModule(statements.join("\n"), { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const windows = [], changes = [];
  const bounded = options => {
    windows.push(options); return { ...ui.getBoundedPageWindow(options.totalItems, requestedPage, options.pageSize),
      setPage: page => changes.push(page) };
  };
  const exports = new Function("require", "exports", "Surface", "SectionHeading", "CollectionPager", "DisclosureTable", "useBoundedPage",
    compiled + "\nreturn { PlanBoard, groupActivePlans, DeclaredFile, DeclaredFiles };")
    (require, {}, ui.Surface, ui.SectionHeading, ui.CollectionPager, data.DisclosureTable, bounded);
  return { ...exports, windows, changes };
}
function controlledTable (props, requestedPage) {
  const text = read("Frontend/src/accessibleData.tsx"), ast = parse(text);
  const names = ["compareValues", "identityKey", "DisclosureTable"];
  const declarations = names.map(name => one(ast.statements, n => ts.isFunctionDeclaration(n) && n.name?.text === name).getText(ast));
  const compiled = ts.transpileModule(declarations.join("\n"), { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  let ordinal = 0; const windows = [], changes = [];
  const bounded = options => {
    windows.push(options); return { ...ui.getBoundedPageWindow(options.totalItems, requestedPage, options.pageSize),
      setPage: page => changes.push(page) };
  };
  const hooks = {
    useId: () => "actual-table-fixture", useRef: value => ({ current: value }), useEffect: () => {},
    useMemo: callback => callback(), useState: initial => [ordinal++ === 0 ? true : initial, () => {}],
  };
  const actual = new Function("require", "exports", "useId", "useRef", "useEffect", "useMemo", "useState", "useBoundedPage", "ControlButton", "CollectionPager",
    compiled + "\nreturn DisclosureTable;")(require, {}, hooks.useId, hooks.useRef, hooks.useEffect,
      hooks.useMemo, hooks.useState, bounded, ui.ControlButton, ui.CollectionPager);
  return { tree: actual(props), windows, changes };
}
test("raw current Vite SSR hides zero/done-only and forwards the real native marker with pending semantics", () => {
  const callback = () => {};
  assert.equal(render(currentBoard.PlanBoard, { tasks: [], onOpenFileStory: callback }), "");
  assert.equal(render(currentBoard.PlanBoard, { tasks: [task("EA", "done.txt", "A", "done")], onOpenFileStory: callback }), "");
  const pending = render(currentBoard.PlanBoard, { tasks: [task("EA", "pending.txt", "P")], onOpenFileStory: callback });
  assert.match(pending, /^<div[^>]*class="[^"]*ui-surface/); assert.match(pending, /data-active-plan-board="true"/);
  assert.match(pending, /<h4[^>]*>Active plans<\/h4>/); assert.match(pending, /No task in progress/);
  assert.match(pending, /next up:/); assert.match(pending, /0\/1 done/); assert.match(pending, /Show.*exact data/);
  assert.match(pending, /1 active plan contain 1 task\./); assert.doesNotMatch(pending, /<table/);
});
test("actual current groups retain composites, served status order, multiple actives, escaped names and first pending", () => {
  const plan = "nested/" + "VeryLong".repeat(22) + "<&>.txt", repo = 'EA<&"';
  const tasks = frozen([
    task(repo, plan, "D", "done"), task(repo, plan, "I1", "in-progress", { title: 'Active <script>&"', why: "Why <&>",
      files: ["src/a<&>.mq5", "src/*.mqh", "src/b?.mqh", "src/a<&>.mq5", "src/fifth.mqh", "src/sixth.mqh"], last_event_ts: "2026-10-07T12:00:00Z" }),
    task(repo, plan, "I2", "in-progress", { title: "Second active" }), task(repo, plan, "P1"),
    task(repo, plan, "P2"), task("UM", plan, "P1"), task("EA", "done.txt", "D", "done"),
  ]);
  const before = JSON.stringify(tasks), controlled = actualBoard(), board = controlled.PlanBoard({ tasks, onOpenFileStory: () => {} });
  const groups = currentBoard.groupActivePlans(tasks);
  assert.equal(groups.length, 2); assert.equal(groups[0].repo, repo); assert.equal(groups[0].base, plan.split("/").at(-1));
  assert.equal(groups[0].done, 1); assert.equal(groups[0].inProgress.length, 2); assert.equal(groups[0].nextUp.task_ref, tasks[3].task_ref);
  const list = one(elements(board), n => n.type === "div" && n.props.className === "ui-work-list");
  const cards = elements(list.props.children).filter(n => n.type === "div" && n.props.className?.includes("last:border-b-0"));
  assert.deepEqual(cards.map(n => n.key), groups.map(p => JSON.stringify([p.repo, p.planFile])));
  const segments = elements(cards[0]).filter(n => n.type === "span" && n.props.style?.backgroundColor);
  assert.deepEqual(segments.map(n => n.key), tasks.slice(0, 5).map(t => t.task_ref));
  assert.deepEqual(segments.map(n => n.props.style.backgroundColor), ["#14b8a6", "#f59e0b", "#f59e0b", "#334155", "#334155"]);
  assert.deepEqual(segments.map(n => n.props.title), ["D \u2014 done", "I1 \u2014 in-progress", "I2 \u2014 in-progress", "P1 \u2014 pending", "P2 \u2014 pending"]);
  const previews = elements(cards[0]).filter(n => n.type === controlled.DeclaredFile);
  assert.equal(previews.length, 4); assert.deepEqual(previews.map(n => n.key), tasks[1].files.slice(0, 4).map((file, i) => JSON.stringify([file, i])));
  const html = render(currentBoard.PlanBoard, { tasks, onOpenFileStory: () => {} });
  assert.match(html, /1\/5 done/); assert.match(html, /0\/1 done/); assert.match(html, /\+2/);
  assert.ok(html.includes(plan.split("/").at(-1).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")));
  assert.match(html, /Active &lt;script&gt;&amp;&quot;/); assert.match(html, /Why &lt;&amp;&gt;/);
  assert.match(html, /Second active/); assert.doesNotMatch(html, /<script>/); assert.equal(JSON.stringify(tasks), before);
});
test("actual literal file buttons preserve full callbacks; globs stay noninteractive declarations", () => {
  const actual = actualBoard(), calls = [], repo = "EA<&>", file = "path/a<&>.mq5";
  for (const compact of [false, true]) {
    const node = actual.DeclaredFile({ repo, file, compact, onOpenFileStory: (...args) => calls.push(args) });
    assert.equal(node.type, "button"); assert.equal(node.props.type, "button");
    assert.equal(node.props["aria-label"], "Open file story for " + file + " in " + repo);
    assert.equal(node.props.title, node.props["aria-label"]); assert.equal(node.props.children, compact ? "a<&>.mq5" : file);
    node.props.onClick(); assert.deepEqual(calls.at(-1), [repo, file]);
  }
  for (const file of ["src/*.mqh", "a?.mq5", "combo/*?"]) {
    const node = actual.DeclaredFile({ repo, file, onOpenFileStory: () => assert.fail("glob action") });
    assert.equal(node.type, "span"); assert.equal(node.props.onClick, undefined); assert.equal(elements(node).filter(n => n.type === "button").length, 0);
    assert.match(render(() => node), /pattern/);
  }
});
test("controlled actual board and file owners use real first/last fifty-item windows without truncating table rows", () => {
  const tasks = Array.from({ length: 103 }, (_, i) => task("EA", "plan_" + String(i).padStart(3, "0") + ".txt", "P"));
  for (const page of [1, 99]) {
    const actual = actualBoard(page), board = actual.PlanBoard({ tasks, onOpenFileStory: () => {} });
    const expected = ui.getBoundedPageWindow(103, page, 50);
    const list = one(elements(board), n => n.type === "div" && n.props.className === "ui-work-list");
    const cards = elements(list.props.children).filter(n => n.type === "div" && n.props.className.includes("last:border-b-0"));
    const groups = actual.groupActivePlans(tasks);
    assert.deepEqual(cards.map(n => n.key), groups.slice(expected.start, expected.end).map(p => JSON.stringify([p.repo, p.planFile])));
    assert.equal(cards.length, page === 1 ? 50 : 3); assert.deepEqual(actual.windows[0],
      { identity: ["active-plan-board", ...groups.map(p => JSON.stringify([p.repo, p.planFile]))], totalItems: 103, pageSize: 50 });
    const pager = one(elements(board), n => n.type === ui.CollectionPager && n.props.collectionLabel === "Active plans");
    assert.equal(pager.props.page.page, expected.page); pager.props.onPageChange(2); assert.deepEqual(actual.changes, [2]);
    const table = one(elements(board), n => n.type === data.DisclosureTable); assert.equal(table.props.rows.length, 103);
    assert.deepEqual(table.props.rows, groups.flatMap(p => p.tasks));
  }
  for (const length of [0, 1, 50, 51, 103]) for (const page of [1, 99]) {
    const actual = actualBoard(page), t = task("EA", "files.txt", "F", "pending", { files: Array.from({ length }, (_, i) => i === 1 ? "src/*.mqh" : "src/f" + i + ".mqh") });
    const tree = actual.DeclaredFiles({ task: t, onOpenFileStory: () => {} }), expected = ui.getBoundedPageWindow(length, page, 50);
    const files = elements(tree).filter(n => n.type === actual.DeclaredFile);
    assert.deepEqual(files.map(n => n.props.file), t.files.slice(expected.start, expected.end));
    assert.deepEqual(files.map(n => n.key), t.files.slice(expected.start, expected.end).map((file, i) => JSON.stringify([file, expected.start + i])));
    assert.deepEqual(actual.windows[0], { identity: ["active-plan-declared-files", t.repo, t.plan_file, t.task_ref], totalItems: length, pageSize: 50 });
    const pagers = elements(tree).filter(n => n.type === ui.CollectionPager); assert.equal(pagers.length, length > 50 ? 1 : 0);
    if (length === 0) assert.equal(tree.props.children, "\u2014");
    if (pagers.length) { assert.equal(pagers[0].props.page.page, expected.page); pagers[0].props.onPageChange(2); assert.deepEqual(actual.changes, [2]); }
  }
});
test("actual exact-table props, columns, composite identities and first/last page semantics remain intact", () => {
  const tasks = Array.from({ length: 103 }, (_, i) => task(i % 2 ? "UM" : "EA", "shared.txt", String(i), "pending", { files: ["src/a.mq5"] }));
  const actual = actualBoard(), tree = actual.PlanBoard({ tasks, onOpenFileStory: () => {} });
  const table = one(elements(tree), n => n.type === data.DisclosureTable), groups = actual.groupActivePlans(tasks), props = table.props;
  assert.equal(props.label, "Active plan tasks"); assert.equal(props.summary, "2 active plans contain 103 tasks.");
  assert.deepEqual(props.identity, ["active-plan-tasks", ...groups.map(p => JSON.stringify([p.repo, p.planFile]))]);
  assert.deepEqual(props.columns.map(c => [c.key, c.label]), [["repo", "Repository"], ["plan", "Plan"], ["task", "Task"], ["title", "Title"], ["status", "Status"], ["files", "Declared files"]]);
  assert.deepEqual(props.columns.map(c => typeof c.sortValue), ["function", "function", "function", "function", "function", "undefined"]);
  for (const row of props.rows) {
    assert.equal(props.rowKey(row), JSON.stringify([row.repo, row.plan_file, row.task_ref]));
    assert.deepEqual(props.columns.slice(0, 5).map(c => c.sortValue(row)), [row.repo, row.plan_file, row.task_ref, row.title, row.status]);
    assert.equal(props.columns[5].render(row).type, actual.DeclaredFiles);
  }
  assert.equal(new Set(props.rows.map(props.rowKey)).size, 103);
  for (const page of [1, 99]) {
    const controlled = controlledTable(props, page), expected = ui.getBoundedPageWindow(103, page, 50);
    const tbody = one(elements(controlled.tree), n => n.type === "tbody"), rows = elements(tbody.props.children).filter(n => n.type === "tr");
    assert.deepEqual(rows.map(n => n.key), props.rows.slice(expected.start, expected.end).map(props.rowKey));
    assert.equal(rows.length, page === 1 ? 50 : 3);
    assert.deepEqual(controlled.windows[0], { identity: ["disclosure-table", ...props.identity, "source", "source"], totalItems: 103, pageSize: 50 });
    const region = one(elements(controlled.tree), n => n.props.role === "region");
    assert.equal(region.props["aria-label"], "Active plan tasks: exact data"); assert.equal(region.props.tabIndex, 0);
    assert.equal(one(elements(controlled.tree), n => n.type === "caption").props.children.join(""), "Active plan tasks: exact data");
    const pager = one(elements(controlled.tree), n => n.type === ui.CollectionPager);
    pager.props.onPageChange(2); assert.deepEqual(controlled.changes, [2]);
  }
});
