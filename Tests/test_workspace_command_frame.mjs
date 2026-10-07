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
import { readBuildVersion } from "../Frontend/buildVersion.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), ".."), frontend = resolve(root, "Frontend");
const require = createRequire(resolve(frontend, "package.json"));
const ts = require("typescript"), postcss = require("postcss"), React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const read = name => readFileSync(resolve(root, name), "utf8");
const sha = text => createHash("sha256").update(text).digest("hex"), lf = text => text.replace(/\r\n/g, "\n");
const source = read("Frontend/src/ApplicationBrand.tsx"), app = read("Frontend/src/App.tsx");
const ANCHOR = 'import { UI_BUILD_VERSION } from "./appVersion";', IMPORT = 'import "./workspaceCommandFrame.css";';
const ORIGINAL_RAW = "8d8ec460154e35ecdfb0e99f2505ce3db3a0923c825f372b5ef3fc4ba238933f";
const ORIGINAL_LF = "9e51c06534cecd92fdb8fa8db65b75d8a9888ffbb98bdd6098f61b18e2a2a2db";
const REVIEWED_RAW = "a7102795274f1ba784f486d1ed5bd9dbaa78d829005d60fbd0275d6a13a44026";
const REVIEWED_LF = "0e6d42ee96b7c0899e8b329b8d5e85d52c01cdc19591bbf5189da65daf266d22";
const CSS_HASH = "c1de68858cfd2c4a502ab02e8e0e8a7cefecb7931172ffd055feb8778b9f7592";
// Independent reviewed expectations, never loaded from the ignored plan.
const CSS = `/* Workspace presentation only; existing navigation and status owners stay. */
header.app-shell-header > .app-header-primary {
  padding: 1rem 0;
  align-items: flex-start;
}
header.app-shell-header > .app-header-primary > .app-header-actions {
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid rgb(var(--ui-border));
  border-radius: 8px;
  background: rgb(var(--ui-canvas));
}
header.app-shell-header > .app-workspace-context {
  gap: 0.5rem 1rem;
  padding: 0.75rem;
  border: 1px solid rgb(var(--ui-border));
  border-radius: 8px;
  background: rgb(var(--ui-canvas));
}
nav[aria-label="Primary views"] > div {
  gap: 0.5rem;
}
nav[aria-label="Primary views"] > div > button.ui-control {
  min-width: 0;
  min-height: 3rem;
  padding: 0.75rem 1rem;
  border: 1px solid transparent;
  border-left-width: 3px;
  border-radius: 8px;
  background-color: transparent;
  color: rgb(var(--ui-text-muted));
  font-size: 1rem;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
nav[aria-label="Primary views"] > div > button.ui-control:hover:not(:disabled):not([aria-current="page"]) {
  background-color: rgb(var(--ui-surface-raised));
  color: rgb(var(--ui-text));
}
nav[aria-label="Primary views"] > div > button.ui-control[aria-current="page"] {
  border-color: rgb(var(--ui-focus));
  background-color: rgb(var(--ui-surface-raised));
  color: rgb(var(--ui-text));
  font-weight: 600;
}
nav[aria-label="Primary views"] > div > button.ui-control[aria-current="page"]:hover:not(:disabled) {
  background-color: rgb(var(--ui-surface-raised));
}
`;
const nav = 'nav[aria-label="Primary views"] > div', button = nav + " > button.ui-control";
const RULES = [
  ["header.app-shell-header > .app-header-primary", [["padding", "1rem 0"], ["align-items", "flex-start"]]],
  ["header.app-shell-header > .app-header-primary > .app-header-actions", [["gap", "0.5rem"], ["padding", "0.5rem 0.75rem"], ["border", "1px solid rgb(var(--ui-border))"], ["border-radius", "8px"], ["background", "rgb(var(--ui-canvas))"]]],
  ["header.app-shell-header > .app-workspace-context", [["gap", "0.5rem 1rem"], ["padding", "0.75rem"], ["border", "1px solid rgb(var(--ui-border))"], ["border-radius", "8px"], ["background", "rgb(var(--ui-canvas))"]]],
  [nav, [["gap", "0.5rem"]]],
  [button, [["min-width", "0"], ["min-height", "3rem"], ["padding", "0.75rem 1rem"], ["border", "1px solid transparent"], ["border-left-width", "3px"], ["border-radius", "8px"], ["background-color", "transparent"], ["color", "rgb(var(--ui-text-muted))"], ["font-size", "1rem"], ["line-height", "1.5"], ["overflow-wrap", "anywhere"]]],
  [button + ':hover:not(:disabled):not([aria-current="page"])', [["background-color", "rgb(var(--ui-surface-raised))"], ["color", "rgb(var(--ui-text))"]]],
  [button + '[aria-current="page"]', [["border-color", "rgb(var(--ui-focus))"], ["background-color", "rgb(var(--ui-surface-raised))"], ["color", "rgb(var(--ui-text))"], ["font-weight", "600"]]],
  [button + '[aria-current="page"]:hover:not(:disabled)', [["background-color", "rgb(var(--ui-surface-raised))"]]],
];
const PINS = [
  ["Frontend/src/App.tsx", "945c8879e94b5d7a8410d2a143ed2e127e2653dd1a123d2d8b4cd306758a6f3e", "c7c568b346c7ddf00d86b93325b97854e59f3f625f6fd916b056e85ccf069b1a"],
  ["Frontend/src/AppShell.tsx", "8d36a4a928da4e6d7774cc112ab3cecfe8b5e654afe05de0480facc40f21eeee", "7a2ee984f185fbcc7ff0e5aa9017b2b1dd8e8e8667068ce2c371a5bf884448a9"],
  ["Frontend/src/main.tsx", "c0b126cdce533a00247006a8efbb72c51b073c638a5764e0cb54d180e5f3f588", "c0b126cdce533a00247006a8efbb72c51b073c638a5764e0cb54d180e5f3f588"],
  ["Frontend/src/index.css", "9371bc04cba0b62e8a8e5e3b4a9251deea9273be58f4b9735982e0649527ba81", "788436e9def1e7109fe98d4bfa5e0add49a5f0ca301b17416279c03f18ede0f5"],
  ["Frontend/src/healthPanel.tsx", "6cc894aa760ed66eada96511a3494f64f4b317cf15d74ad0a03ae7631d802173", "10a230292425ab64fc1fc378771026727138565f708b0b637345edaab870dbd5"],
  ["Frontend/src/missionPlanGallery.css", "4b125b0e8dd6d9004838d366ed3b19166b642d62437c44fec8d7153a74cd919f", "4b125b0e8dd6d9004838d366ed3b19166b642d62437c44fec8d7153a74cd919f"],
  ["Frontend/src/historyCommitLedger.css", "ba899692d9937c52fe6194aa1704d725c954274737439b9901b14b69b833d7ab", "ba899692d9937c52fe6194aa1704d725c954274737439b9901b14b69b833d7ab"],
  ["Tests/test_app_shell.mjs", "cfb3885d0035b91530fc6e397920036b0dc85e7b89876aaeb03029ddb47e40d0", "8d92c9461c4c164313c2f36a27381462a9ec47f907c7c050a2037c09cd388fd6"],
  ["Tests/test_app_version.mjs", "d86fa77843bdf4f552fc7e97bec8f5ecea839f98080451325bef4cd81674d6c3", "c5cc037e582d0ff5066d959b76ccb804e58c452cfcb1f92c23a0fba8786b15f5"],
  ["Tests/test_ui_foundations.mjs", "b3a7573802f06102be18bac0472dcfe5794b304aa3f99634d7acf1d6cc6080e6", "37197cef2e020275d25965112e90c030da40500a0451ee67c22bd559876055d6"],
  ["Tests/test_mission_control_workbench.mjs", "d92813b96ba0206202d0b40f77aa7e622be438c8e9a9a68bd26290b2ee0577d3", "d92813b96ba0206202d0b40f77aa7e622be438c8e9a9a68bd26290b2ee0577d3"],
  ["Tests/test_mission_plan_gallery.mjs", "6092dbb713be9151f8a80a567e09b09732ba96040336634cf659b5be80c94138", "6092dbb713be9151f8a80a567e09b09732ba96040336634cf659b5be80c94138"],
  ["Tests/test_system_snapshot_panels.mjs", "2d84f20f7194de62d0656b7220a37c367c37696a33a6a12d673bce0c55c25a65", "2d84f20f7194de62d0656b7220a37c367c37696a33a6a12d673bce0c55c25a65"],
  ["Tests/test_history_commit_ledger.mjs", "66944cd059bc1714d10aa377a5c372c7f47213a21acd7952ad14e75e476a8e75", "66944cd059bc1714d10aa377a5c372c7f47213a21acd7952ad14e75e476a8e75"],
  ["Tests/test_operational_views.mjs", "1dc324f2fba75698b916ce4f840adf97c3abddf78bf0d6b618b994f3baaef816", "0ffce73f13e7731b0ce18bf563a3273facf3aab4bfc027ab921f04cc5736c2b3"],
];
function ending (text) {
  assert.ok(!text.startsWith("\uFEFF") && !text.includes("\0"), "no BOM or NUL");
  const rest = text.replace(/\r\n/g, ""), eol = text.includes("\r\n") ? "\r\n" : "\n";
  assert.ok(!rest.includes("\r"), "no bare CR");
  if (eol === "\r\n") assert.ok(!rest.includes("\n"), "uniform EOL");
  return eol;
}
function parse (text) {
  const ast = ts.createSourceFile("actual.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  assert.equal(ast.parseDiagnostics.length, 0, "valid complete TSX"); return ast;
}
function one (items, predicate, label) {
  const found = items.filter(predicate); assert.equal(found.length, 1, label); return found[0];
}
function all (node) {
  const found = [node]; ts.forEachChild(node, child => { found.push(...all(child)); }); return found;
}
function replaceOnce (text, old, next) {
  assert.equal(text.split(old).length - 1, 1, "unique physical fixture window"); return text.replace(old, next);
}
function restoreImport (text) {
  const eol = ending(text), ast = parse(text), imports = ast.statements.filter(ts.isImportDeclaration);
  const added = one(imports, n => ts.isStringLiteral(n.moduleSpecifier)
    && n.moduleSpecifier.text === "./workspaceCommandFrame.css", "one top-level frame import");
  const anchor = one(imports, n => n.getText(ast) === ANCHOR, "exact version import anchor");
  assert.equal(ast.statements[0], anchor, "first actual statement remains version import");
  assert.equal(added.importClause, undefined, "side-effect only"); assert.equal(added.getText(ast), IMPORT);
  assert.equal(text.split(IMPORT).length - 1, 1, "one physical import, not a comment");
  assert.equal(text.split(ANCHOR).length - 1, 1, "one physical anchor");
  assert.equal(added.getStart(ast), anchor.end + eol.length, "immediately after actual anchor");
  assert.equal(text.slice(anchor.end, added.getStart(ast)), eol);
  assert.equal(text.slice(added.end, added.end + eol.length), eol, "complete physical import line");
  const restored = text.slice(0, added.getStart(ast)) + text.slice(added.end + eol.length);
  parse(restored); return restored; // Preservation-only data, never executed.
}
function checkCss (text) {
  ending(text); assert.doesNotMatch(text, /@import|url\s*\(|!\s*important/i);
  const ast = postcss.parse(text);
  assert.equal(ast.nodes.length, 9, "one comment and exactly eight root rules");
  assert.equal(ast.nodes[0].type, "comment");
  assert.equal(ast.nodes[0].text, "Workspace presentation only; existing navigation and status owners stay.");
  const rows = ast.nodes.slice(1).map(rule => {
    assert.equal(rule.type, "rule", "no root at-rule, declaration, global or extra node");
    assert.equal(rule.parent, ast); assert.ok(rule.nodes.every(n => n.type === "decl"), "no nested rule, at-rule or comment");
    return [rule.selector, rule.nodes.map(n => { assert.equal(!!n.important, false); return [n.prop, n.value]; })];
  });
  assert.deepEqual(rows, RULES, "complete scoped selector/declaration/value allowlist");
}

test("independent complete literal and eight-root-rule PostCSS contract match actual stylesheet", () => {
  const css = read("Frontend/src/workspaceCommandFrame.css");
  assert.equal(css, CSS); assert.equal(sha(css), CSS_HASH); assert.equal(ending(css), "\n");
  assert.equal(css.split("\n").length - 1, 48); assert.ok(css.endsWith("\n") && !css.endsWith("\n\n"));
  assert.doesNotMatch(css, /[ \t]+$/m); checkCss(css);
});
test("CSS allowlist rejects malformed, extra, relocated, nested, media and forbidden declarations", () => {
  for (const altered of [CSS.slice(0, -3), CSS + '@media (min-width: 640px) { body { color: red; } }\n',
    CSS + '@font-face { font-family: forbidden; src: local(x); }\n', CSS + 'color: red;\n',
    CSS + 'body { color: red; }\n', CSS + '/* Extra */\n', CSS + CSS.slice(CSS.indexOf("header.")),
    CSS.replace("  padding: 1rem 0;", "  padding: 1rem 0;\n  @supports (display: grid) { color: red; }"),
    CSS.replace("  padding: 1rem 0;", "  padding: 1rem 0;\n  .nested { color: red; }"),
    CSS.replace("  padding: 1rem 0;", "  padding: 1rem 0;\n  /* Nested */"),
    CSS.replace("padding: 1rem 0;", "padding: 1rem 0 !important;"),
    CSS.replace("padding: 1rem 0;", "height: 1rem;"), CSS.replace("padding: 1rem 0;", "overflow: hidden;"),
    CSS.replace("padding: 1rem 0;", "order: 1;"), CSS.replace("padding: 1rem 0;", "animation: none;"),
    CSS.replace("padding: 1rem 0;", "background: url(https://invalid.example/a);"),
    CSS.replace("padding: 1rem 0;", "padding: 1rem 0; padding: 1rem 0;"),
    CSS.replace("header.app-shell-header", "main.app-shell-header"),
    CSS.replace("align-items: flex-start;", "align-items: center;"), "\uFEFF" + CSS, CSS + "\0",
    CSS.replace("\n", "\r\n"), CSS.replace("\n", "\r")]) assert.throws(() => checkCss(altered));
});
test("strict actual one-import inverse preserves complete original RAW/LF bytes in both EOL forms", () => {
  assert.equal(ending(source), "\r\n"); assert.equal(sha(source), REVIEWED_RAW); assert.equal(sha(lf(source)), REVIEWED_LF);
  assert.ok(source.endsWith("\r\n") && !source.endsWith("\r\n\r\n")); assert.doesNotMatch(source, /[ \t]+$/m);
  assert.equal(sha(restoreImport(source)), ORIGINAL_RAW);
  for (const eol of ["\n", "\r\n"]) {
    const fixture = lf(source).replace(/\n/g, eol), restored = restoreImport(fixture);
    assert.equal(ending(restored), eol); assert.equal(sha(lf(restored)), ORIGINAL_LF);
    assert.equal(restored, fixture.replace(IMPORT + eol, ""));
  }
});
test("actual import site rejects missing, duplicate, commented, partial, nested, altered and relocated fixtures", () => {
  const text = lf(source);
  for (const altered of [text.replace(IMPORT + "\n", ""), text.replace(IMPORT, IMPORT + "\n" + IMPORT),
    text.replace(IMPORT, "/* " + IMPORT + " */"), text.replace(IMPORT, 'import frame from "./workspaceCommandFrame.css";'),
    text.replace(IMPORT, "import './workspaceCommandFrame.css';"), text.replace(IMPORT, IMPORT + " // Partial line"),
    text.replace(IMPORT, "\n" + IMPORT), text.replace(IMPORT + "\n", "") + IMPORT + "\n",
    text.replace(IMPORT, "function misplaced () { " + IMPORT + " }"), text + "// " + IMPORT + "\n",
    text.replace(ANCHOR, 'import { UI_BUILD_VERSION as version } from "./appVersion";'),
    "\uFEFF" + text, text + "\0", text.replace("\n", "\r\n"), text.replace("\n", "\r")]) {
    assert.throws(() => restoreImport(altered));
  }
});
test("unrelated valid edits survive inverse and cannot disappear behind immutable whole-byte pins", () => {
  const text = lf(source), original = restoreImport(text);
  for (const [old, next] of [["export function ApplicationBrand (", "// Outside import window.\nexport function ApplicationBrand ("],
    ["KATLAB Tracking Monitor", "Unrelated changed product title"]]) {
    const restored = restoreImport(replaceOnce(text, old, next));
    assert.equal(restored, replaceOnce(original, old, next)); assert.notEqual(sha(lf(restored)), ORIGINAL_LF);
  }
  for (const [name, rawPin, lfPin] of PINS) {
    const text = deskPreservation(name, mastheadPreservation(name, purposeNavigationPreservation(name, historyStationPreservation(name, read(name))))); ending(text); assert.equal(sha(text), rawPin, name); assert.equal(sha(lf(text)), lfPin, name);
    for (const eol of ["\n", "\r\n"]) assert.equal(sha(lf(lf(text).replace(/\n/g, eol))), lfPin, name);
  }
});

// Compile only the actual current pure navigation declarations, never an inverse fixture.
const appTree = parse(app), labels = one(all(appTree), n => ts.isVariableDeclaration(n)
  && n.name.getText(appTree) === "VIEW_LABELS", "actual labels declaration");
const navigation = one(appTree.statements, n => ts.isFunctionDeclaration(n)
  && n.name?.text === "ViewNavigation", "actual current navigation function");
const compiled = ts.transpileModule(labels.parent.parent.getText(appTree) + "\n" + navigation.getText(appTree), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const actual = new Function("require", "exports", compiled + "\nreturn { VIEW_LABELS, ViewNavigation };")(require, {});
const KEYS = ["changes", "mission", "overview", "history", "city", "chronicle"];
const LABELS = ["Changes", "Mission", "Overview", "History", "City", "Chronicle"];
function elements (element) {
  if (Array.isArray(element)) return element.flatMap(elements);
  return React.isValidElement(element) ? [element, ...elements(element.props.children)] : [];
}
const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));
test("actual six-view navigation preserves every ready/current/disabled/label/type/selection combination", () => {
  assert.deepEqual(Object.keys(actual.VIEW_LABELS), KEYS); assert.deepEqual(Object.values(actual.VIEW_LABELS), LABELS);
  for (const view of KEYS) for (const membershipReady of [false, true]) {
    const calls = [], tree = actual.ViewNavigation({ view, membershipReady, onSelect: choice => calls.push(choice) });
    assert.equal(tree.type, "nav"); assert.equal(tree.props["aria-label"], "Primary views");
    assert.equal(tree.props.children.type, "div");
    const buttons = elements(tree).filter(n => n.type === "button"); assert.equal(buttons.length, 6);
    for (const [index, node] of buttons.entries()) {
      assert.equal(node.key, KEYS[index]); assert.equal(node.props.type, "button"); assert.equal(node.props.children.props.className, "purpose-led-navigation-copy"); assert.equal(node.props.children.props.children[0].props.className, "purpose-led-navigation-label"); assert.equal(node.props.children.props.children[0].props.children, LABELS[index]); assert.equal(node.props.children.props.children[1], " "); assert.equal(node.props.children.props.children[2].props.className, "purpose-led-navigation-purpose"); assert.equal(node.props.children.props.children[2].props.children, ["Review captured file changes","Plans, checks and evidence","Activity and project summaries","Browse captured commits","Workspace-wide districts","Documentation and release notes"][index]); assert.equal(node.props["aria-label"], undefined); assert.equal(node.props.children.props.children[2].props["aria-hidden"], undefined);
      assert.equal(node.props["aria-current"], view === KEYS[index] ? "page" : undefined);
      assert.equal(node.props.disabled, !membershipReady && ["mission", "overview", "history"].includes(KEYS[index]));
      assert.match(node.props.className, /\bui-control\b/); node.props.onClick();
    }
    assert.deepEqual(calls, KEYS); // Direct handler contract, not activation of a disabled native button.
    const html = render(actual.ViewNavigation, { view, membershipReady, onSelect() {} });
    assert.equal((html.match(/aria-current="page"/g) ?? []).length, 1);
    assert.equal((html.match(/ disabled=""/g) ?? []).length, membershipReady ? 0 : 3);
  }
});

let vite, brand, shell, ui, buildVersion;
before(async () => {
  const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
  vite = await createServer({ root: frontend, server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom", optimizeDeps: { noDiscovery: true, entries: [] } });
  [brand, shell, ui, { UI_BUILD_VERSION: buildVersion }] = await Promise.all([
    vite.ssrLoadModule("/src/ApplicationBrand.tsx"), vite.ssrLoadModule("/src/AppShell.tsx"),
    vite.ssrLoadModule("/src/ui.tsx"), vite.ssrLoadModule("/src/appVersion.ts"),
  ]);
});
after(async () => { await vite?.close(); });
const repo = (id, extra = {}) => ({ id, offline: false, status_valid: true, clean: false,
  count: 2, branch: "develop", last_event_ts: null, ...extra });
const contextProps = (repos, extra = {}) => ({ scope: { kind: "all" }, repos, ready: true,
  error: "", violationOf: () => null, onDetails() {}, ...extra });
test("raw-current brand and shell keep visible build/System action, direct owners, slots and safe source order", () => {
  assert.equal(buildVersion, readBuildVersion()); let calls = 0; const onSystem = () => calls++;
  const actions = React.createElement("button", null, "Actions <safe>&"), context = React.createElement("span", null, "Context <safe>&"),
    feedback = React.createElement("p", null, "Feedback <safe>&"), tree = shell.AppShell({ actions, context, children: feedback, onSystem });
  const owner = one(elements(tree), n => n.type === brand.ApplicationBrand, "actual brand owner");
  assert.equal(owner.props.onSystem, onSystem); const current = brand.ApplicationBrand(owner.props);
  const [heading, badge] = current.props.children;
  assert.equal(heading.type, "h1"); assert.equal(heading.props.children[0].props["aria-hidden"], "true");
  assert.equal(heading.props.children[0].props.children, "K"); assert.equal(heading.props.children[1].props.children, "KATLAB Tracking Monitor");
  assert.equal(badge.type, "button"); assert.equal(badge.props.type, "button"); assert.equal(badge.props.onClick, onSystem);
  assert.equal(badge.props["aria-label"], `UI build v${buildVersion}. Open System health`);
  assert.equal(badge.props.title, "Loaded UI build version. Open System health for server details.");
  badge.props.onClick(); assert.equal(calls, 1);
  assert.equal(tree.props.children[0].props.className, "app-header-primary");
  assert.equal(tree.props.children[0].props.children[1].props.className, "app-header-actions");
  assert.equal(tree.props.children[0].props.children[1].props.children, actions);
  assert.equal(tree.props.children[1], context); assert.equal(tree.props.children[2], feedback);
  const html = render(shell.AppShell, { actions, context, children: feedback, onSystem });
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1); assert.ok(html.includes(`v${buildVersion}</button>`));
  for (const name of ["Actions", "Context", "Feedback"]) assert.ok(html.includes(name + " &lt;safe&gt;&amp;"));
  assert.ok(html.indexOf("Actions") < html.indexOf("Context") && html.indexOf("Context") < html.indexOf("Feedback"));
  assert.doesNotMatch(html, /<safe>/); assert.doesNotMatch(source, /fetch\(|api\.|useEffect|setInterval|setTimeout/);
  assert.ok(render(shell.AppShellNavigation, { children: "Views" }).includes('aria-label="Workspace navigation"'));
});
test("actual snapshot and connection context keep pending/error/empty/unknown/offline/accepted states honest", () => {
  for (const [input, expected, absent] of [
    [contextProps([], { ready: false }), "Waiting for workspace snapshot", /No repositories configured|known statuses clean/],
    [contextProps([], { ready: false, error: "Failed" }), "Workspace snapshot unavailable", /No repositories configured|known statuses clean/],
    [contextProps([]), "No repositories configured", /known statuses clean/],
    [contextProps([], { scope: { kind: "repo", id: "removed" } }), "Selected repository unavailable", /known statuses clean/],
    [contextProps([repo("Unknown", { status_valid: false, clean: true, count: 987 })]), "Git status unavailable", /987|known uncommitted/],
    [contextProps([repo("Offline", { offline: true, clean: true, count: 999 })]), "No online repositories", /999|known statuses clean/],
    [contextProps([repo("Offline", { offline: true })], { scope: { kind: "repo", id: "Offline" } }), "Repository unavailable", /known statuses clean/],
  ]) { const html = render(shell.WorkspaceContext, input); assert.ok(html.includes(expected)); assert.doesNotMatch(html, absent); }
  const html = render(shell.WorkspaceContext, contextProps([repo("Clean", { clean: true, count: 0 }), repo("Dirty"),
    repo("Unknown", { status_valid: false, count: 987 }), repo("Offline", { offline: true, count: 999 })]));
  for (const text of ["1/2 known statuses clean", "2 known uncommitted changes", "1 Git status unknown", "1 unavailable"]) assert.ok(html.includes(text));
  assert.doesNotMatch(html, /987|999/);
  for (const state of ["connecting", "connected", "reconnecting"]) {
    const text = render(shell.ConnectionStatus, { state }); assert.ok(text.includes(state[0].toUpperCase() + state.slice(1)));
    assert.ok(text.includes("not proof of fresh data or verification readiness"));
  }
});
test("retained current context preserves long escaped identities, unavailable counts and real status callback", () => {
  const id = '<script>Long & "repo"</script>'.repeat(15), selected = Object.freeze(repo(id, {
    status_valid: false, branch: '<branch>&"scope"'.repeat(20),
  }));
  let calls = 0; const onDetails = () => calls++, input = contextProps(Object.freeze([selected]), {
    scope: Object.freeze({ kind: "repo", id }), error: "Controlled refresh failure", violationOf: () => 2, onDetails,
  }), saved = JSON.stringify(input);
  const control = one(elements(shell.WorkspaceContext(input)), n => n.type === ui.ControlButton, "one actual status control");
  assert.equal(control.props.onClick, onDetails); const native = ui.ControlButton.render(control.props, null);
  assert.equal(native.props.onClick, onDetails); native.props.onClick(); assert.equal(calls, 1);
  const html = render(shell.WorkspaceContext, input);
  for (const text of ["Last-known branch", "No captures yet", "1 discipline warning", "Git status unavailable",
    "Refresh failed; showing the last workspace snapshot", "Repository status",
    "&lt;script&gt;Long &amp; &quot;repo&quot;&lt;/script&gt;", "&lt;branch&gt;&amp;&quot;scope&quot;"]) assert.ok(html.includes(text), text);
  assert.doesNotMatch(html, /<script>|<branch>|known uncommitted changes/); assert.ok(html.includes("[overflow-wrap:anywhere]"));
  assert.equal(JSON.stringify(input), saved);
  // Source and SSR are not native paint, geometry, focus, keyboard, zoom or AT acceptance.
});
