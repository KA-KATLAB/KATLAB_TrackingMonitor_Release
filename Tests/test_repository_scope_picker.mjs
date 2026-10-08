import { changesBriefPreservation } from "./helpers/changesTaskReviewBrief.mjs";
import { historyStationPreservation } from "./helpers/historyReviewStation.mjs";
import { activePlanDocketPreservation } from "./helpers/activePlanDocket.mjs";
import { purposeNavigationPreservation } from "./helpers/purposeLedNavigation.mjs";
import { cityBriefPreservation } from "./helpers/cityDistrictBrief.mjs";
import { mastheadPreservation } from "./helpers/workspaceCommandMasthead.mjs";
import { deskPreservation } from "./helpers/changesReviewLanes.mjs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(resolve(root, "Frontend/package.json"));
const ts = require("typescript"), postcss = require("postcss"), selectorParser = require("postcss-selector-parser");
const React = require("react"), { renderToStaticMarkup } = require("react-dom/server");
const read = path => readFileSync(resolve(root, path), "utf8");
const sha = text => createHash("sha256").update(text).digest("hex"), lf = text => text.replace(/\r\n/g, "\n");
const source = read("Frontend/src/RepositorySwitcher.tsx");
const ANCHOR = 'import { DialogShell } from "./dialog";', IMPORT = 'import "./repositoryScopePicker.css";';
const OLD_PANEL = 'panelClassName="max-w-lg"', NEW_PANEL = 'panelClassName="max-w-lg repository-scope-picker"';
const ORIGINAL_RAW = "4c0351122ab05d05e68919f8bdb65ab478faedd651853ea604fbed2d47562d5b";
const ORIGINAL_LF = "756f83cbce2c19ca89c8a5cc973d786065934dedab9eefc8a3400c458da0eb63";
const REVIEWED_RAW = "244fa8968a904c6a54c74e8c648e6e67711132906f775d4fbf88b960f48701c4";
const REVIEWED_LF = "1a9d6a73a3b10c7d1b8c33ce1fc1e010ecfc52e6f9533c617aa710a27b8f9110";
const CSS_HASH = "b0d8b480d115859437b10536b67c1880baaf10c36c9809baa62b382d4c5522ce";
// Independent reviewed expectations, never read from the ignored plan.
const CSS = [
  "/* Scoped repository picker; shared modal, focus and paging owners remain. */",
  ".repository-scope-picker > div:last-child > div > div:first-child {",
  "  flex-wrap: wrap;",
  "  align-items: flex-start;",
  "  gap: 8px;",
  "  margin-bottom: 16px;",
  "  padding: 12px;",
  "  border: 1px solid rgb(var(--ui-border));",
  "  border-radius: 8px;",
  "  background-color: rgb(var(--ui-canvas));",
  "}",
  "",
  ".repository-scope-picker > div:last-child > div > div:first-child > span:nth-child(2) {",
  "  flex-basis: 100%;",
  "  white-space: normal;",
  "  overflow: visible;",
  "  text-overflow: clip;",
  "  font-size: 16px;",
  "  line-height: 24px;",
  "  overflow-wrap: anywhere;",
  "}",
  "",
  ".repository-scope-picker > div:last-child > div > label {",
  "  margin-bottom: 16px;",
  "  font-size: 14px;",
  "  line-height: 21px;",
  "  color: rgb(var(--ui-text));",
  "}",
  "",
  '.repository-scope-picker input.ui-field[type="search"] {',
  "  min-height: 44px;",
  "  padding: 12px;",
  "  font-size: 16px;",
  "  line-height: 24px;",
  "}",
  "",
  '.repository-scope-picker [role="group"][aria-label="Repository scope"] {',
  "  gap: 8px;",
  "}",
  "",
  '.repository-scope-picker [role="group"][aria-label="Repository scope"] > button.ui-control[aria-pressed] {',
  "  min-height: 44px;",
  "  padding: 12px;",
  "  align-items: flex-start;",
  "  text-align: left;",
  "  font-size: 16px;",
  "  line-height: 24px;",
  "}",
  "",
  '.repository-scope-picker [role="group"][aria-label="Repository scope"] > button.ui-control[aria-pressed="true"] {',
  "  border-color: rgb(var(--ui-focus));",
  "}",
  "",
  '.repository-scope-picker [role="group"][aria-label="Repository scope"] > button.ui-control[aria-pressed="true"]:hover:not(:disabled):not([aria-disabled="true"]) {',
  "  background-color: rgb(var(--ui-primary-hover));",
  "}",
  "",
].join("\n");
const SUMMARY = ".repository-scope-picker > div:last-child > div > div:first-child";
const GROUP = '.repository-scope-picker [role="group"][aria-label="Repository scope"]';
const BUTTON = GROUP + " > button.ui-control";
const RULES = [
  [SUMMARY, [["flex-wrap", "wrap"], ["align-items", "flex-start"], ["gap", "8px"], ["margin-bottom", "16px"], ["padding", "12px"], ["border", "1px solid rgb(var(--ui-border))"], ["border-radius", "8px"], ["background-color", "rgb(var(--ui-canvas))"]]],
  [SUMMARY + " > span:nth-child(2)", [["flex-basis", "100%"], ["white-space", "normal"], ["overflow", "visible"], ["text-overflow", "clip"], ["font-size", "16px"], ["line-height", "24px"], ["overflow-wrap", "anywhere"]]],
  [".repository-scope-picker > div:last-child > div > label", [["margin-bottom", "16px"], ["font-size", "14px"], ["line-height", "21px"], ["color", "rgb(var(--ui-text))"]]],
  ['.repository-scope-picker input.ui-field[type="search"]', [["min-height", "44px"], ["padding", "12px"], ["font-size", "16px"], ["line-height", "24px"]]],
  [GROUP, [["gap", "8px"]]],
  [BUTTON + "[aria-pressed]", [["min-height", "44px"], ["padding", "12px"], ["align-items", "flex-start"], ["text-align", "left"], ["font-size", "16px"], ["line-height", "24px"]]],
  [BUTTON + '[aria-pressed="true"]', [["border-color", "rgb(var(--ui-focus))"]]],
  [BUTTON + '[aria-pressed="true"]:hover:not(:disabled):not([aria-disabled="true"])', [["background-color", "rgb(var(--ui-primary-hover))"]]],
];
const PINS = [
  ["Frontend/src/App.tsx", "945c8879e94b5d7a8410d2a143ed2e127e2653dd1a123d2d8b4cd306758a6f3e", "c7c568b346c7ddf00d86b93325b97854e59f3f625f6fd916b056e85ccf069b1a"],
  ["Frontend/src/dialog.tsx", "aaeda6eec7080c96b4992d6944444d21ab518ba5987e8a5abd8100423dd136b0", "86f96a3c1454baf8337409995abb81f11ad57ce74d8f4288cbe5ac350991715a"],
  ["Frontend/src/ui.tsx", "b5650b9e2a3529ff1ca033ed077d7b806f0cc9341c9733b4b3a52c107ab99974", "e1c2ad05398cf771ee17ba576b7feecf03829459379b9e02e35c58aea5004c46"],
  ["Frontend/src/navigation.ts", "f22476d82cccafa88477d82cad9b831c9457310ccb6a508cb12cd66bcd110ff1", "3a43b26da1c951e04049ce0336aeaa71c86ea99a04d4bc4a9b4775ddd4258e11"],
  ["Frontend/src/index.css", "9371bc04cba0b62e8a8e5e3b4a9251deea9273be58f4b9735982e0649527ba81", "788436e9def1e7109fe98d4bfa5e0add49a5f0ca301b17416279c03f18ede0f5"],
  ["Frontend/src/AppShell.tsx", "8d36a4a928da4e6d7774cc112ab3cecfe8b5e654afe05de0480facc40f21eeee", "7a2ee984f185fbcc7ff0e5aa9017b2b1dd8e8e8667068ce2c371a5bf884448a9"],
  ["Frontend/src/ApplicationBrand.tsx", "a7102795274f1ba784f486d1ed5bd9dbaa78d829005d60fbd0275d6a13a44026", "0e6d42ee96b7c0899e8b329b8d5e85d52c01cdc19591bbf5189da65daf266d22"],
  ["Frontend/src/OverviewView.tsx", "98f77fe8a3f97033f5a2084439f8da6dcb203547d7b1f8409aca11892598d214", "9d42a6c52828018f6bb0ab7f3f668e0040e0a190de144517715460f93b84410a"],
  ["Frontend/src/MissionView.tsx", "aa13ef82e543e58e2762568e0b1d430ef2622c0ab3f95aa5433edb5fb1a7bdab", "b2ebe76aa6ab6527dcf21bd90ad67d718f29ff8521a137262cfa4309c17be622"],
  ["Frontend/src/city.tsx", "1bdfcd61ada965c8428f5246d0512c8fc536111b9f4384c9eb3848647615a1a7", "3b49953bad776a93e311fc540f48ebe0989286837f5fca8d596036ca6dcca3f2"],
  ["Frontend/src/ChronicleView.tsx", "3130fff181f79401e7c90d486a48ba7a91a63c9dab80eaff990a587470aa75c5", "0ec47d759e070a566b13f868bcf10775fc89dfe478cda5eddd731d0f1550856b"],
  ["Frontend/src/main.tsx", "c0b126cdce533a00247006a8efbb72c51b073c638a5764e0cb54d180e5f3f588", "c0b126cdce533a00247006a8efbb72c51b073c638a5764e0cb54d180e5f3f588"],
  ["Frontend/src/planBoard.tsx", "1e3a6a74fc5c6ef038fde019e98afd2b5951cd0a75830d86e98acac52dfa0170", "ab494423ca66233ed6848392976b05a5d52ecb3797722477da921e133a651288"],
  ["Frontend/src/activePlanGallery.css", "12a7163ac9b28d2a251f9011889287f70b72f7aa1bc78624f587f24692100242", "12a7163ac9b28d2a251f9011889287f70b72f7aa1bc78624f587f24692100242"],
  ["Frontend/src/healthPanel.tsx", "6cc894aa760ed66eada96511a3494f64f4b317cf15d74ad0a03ae7631d802173", "10a230292425ab64fc1fc378771026727138565f708b0b637345edaab870dbd5"],
  ["Frontend/src/accessibleData.tsx", "be2f65e8d975184e504172f0b0e1044e6c3e3e07de10cbeace9910314ca9076c", "be2f65e8d975184e504172f0b0e1044e6c3e3e07de10cbeace9910314ca9076c"],
  ["Tests/test_repo_scope_paging.mjs", "74095d9f615a488e295d214087d00ee96f6c1049c62d387b5b79053e99ca243a", "5dd574a10c88d07a23d23895f5db3b0d6f67ceab179d72eb968a4e456bfeb468"],
  ["Tests/test_read_surfaces.mjs", "264aefcfbc7ff84d37c449c6c6817e8c1b86e5aa189d0e87075e897f25fc7cfa", "b270f7191446f0281040d53625e43603c25c566e5b67cc283d78914113d9574c"],
  ["Tests/test_app_shell.mjs", "cfb3885d0035b91530fc6e397920036b0dc85e7b89876aaeb03029ddb47e40d0", "8d92c9461c4c164313c2f36a27381462a9ec47f907c7c050a2037c09cd388fd6"],
  ["Tests/test_ui_foundations.mjs", "b3a7573802f06102be18bac0472dcfe5794b304aa3f99634d7acf1d6cc6080e6", "37197cef2e020275d25965112e90c030da40500a0451ee67c22bd559876055d6"],
  ["Tests/test_operational_views.mjs", "1dc324f2fba75698b916ce4f840adf97c3abddf78bf0d6b618b994f3baaef816", "0ffce73f13e7731b0ce18bf563a3273facf3aab4bfc027ab921f04cc5736c2b3"],
  ["Tests/test_session_full_identity.mjs", "2d134b1ba30c617236681925f8613ab7070710435bdd7634293226ea142545c8", "2d134b1ba30c617236681925f8613ab7070710435bdd7634293226ea142545c8"],
  ["Tests/test_disclosure_focus_return.mjs", "1868449de20731c49da56f3a33ab6253375f925946efd4468d1d549e0cd74d46", "1868449de20731c49da56f3a33ab6253375f925946efd4468d1d549e0cd74d46"],
  ["Tests/test_mission_control_workbench.mjs", "d92813b96ba0206202d0b40f77aa7e622be438c8e9a9a68bd26290b2ee0577d3", "d92813b96ba0206202d0b40f77aa7e622be438c8e9a9a68bd26290b2ee0577d3"],
  ["Tests/test_overview_operations_deck.mjs", "4c4b2fb8ed83321a1c696e99b102b3611a5f81902967b070a934cd43126421b9", "4c4b2fb8ed83321a1c696e99b102b3611a5f81902967b070a934cd43126421b9"],
  ["Tests/test_mission_plan_gallery.mjs", "6092dbb713be9151f8a80a567e09b09732ba96040336634cf659b5be80c94138", "6092dbb713be9151f8a80a567e09b09732ba96040336634cf659b5be80c94138"],
  ["Tests/test_system_snapshot_panels.mjs", "2d84f20f7194de62d0656b7220a37c367c37696a33a6a12d673bce0c55c25a65", "2d84f20f7194de62d0656b7220a37c367c37696a33a6a12d673bce0c55c25a65"],
  ["Tests/test_history_commit_ledger.mjs", "66944cd059bc1714d10aa377a5c372c7f47213a21acd7952ad14e75e476a8e75", "66944cd059bc1714d10aa377a5c372c7f47213a21acd7952ad14e75e476a8e75"],
  ["Tests/test_workspace_command_frame.mjs", "c46140e06176cc3781d8e1acf17c5e9eee11989524e6341a3d15d0f810e7c247", "c46140e06176cc3781d8e1acf17c5e9eee11989524e6341a3d15d0f810e7c247"],
  ["Tests/test_active_plan_gallery.mjs", "ffd3c9b18d1ad35ba7dd2875af404ab4ac9638e935c1027d9b5bf1f83ccbf260", "ffd3c9b18d1ad35ba7dd2875af404ab4ac9638e935c1027d9b5bf1f83ccbf260"],
];
function ending (text) {
  assert.ok(!text.startsWith("\uFEFF") && !text.includes("\0"), "no BOM/NUL");
  const rest = text.replace(/\r\n/g, ""), eol = text.includes("\r\n") ? "\r\n" : "\n";
  assert.ok(!rest.includes("\r"), "no bare CR");
  if (eol === "\r\n") assert.ok(!rest.includes("\n"), "uniform EOL");
  assert.ok(text.endsWith(eol) && !text.endsWith(eol + eol), "single EOF");
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
function restorePicker (text) {
  const eol = ending(text), ast = parse(text), imports = ast.statements.filter(ts.isImportDeclaration);
  const added = one(imports, n => n.moduleSpecifier.text === "./repositoryScopePicker.css", "one top-level picker import");
  const anchor = one(imports, n => n.getText(ast) === ANCHOR, "one exact dialog import anchor");
  assert.equal(added.importClause, undefined); assert.equal(added.getText(ast), IMPORT);
  assert.equal(text.split(IMPORT).length - 1, 1); assert.equal(text.split(ANCHOR).length - 1, 1);
  assert.equal(added.getStart(ast), anchor.end + eol.length, "immediate next physical line");
  assert.equal(text.slice(added.getStart(ast), added.end + eol.length), IMPORT + eol, "exact complete import line");
  const owner = one(ast.statements, n => ts.isFunctionDeclaration(n) && n.name?.text === "RepositorySwitcher", "actual top-level owner");
  const last = owner.body.statements.at(-1); assert.ok(ts.isReturnStatement(last), "actual final return");
  let expression = last.expression; while (ts.isParenthesizedExpression(expression)) expression = expression.expression;
  assert.ok(ts.isJsxElement(expression), "direct shell, not wrapper");
  assert.equal(expression.openingElement.tagName.getText(ast), "DialogShell");
  const panel = one(all(ast), n => ts.isJsxAttribute(n) && n.name.getText(ast) === "panelClassName", "unique actual panel attribute");
  assert.ok(expression.openingElement.attributes.properties.includes(panel), "attribute belongs to final-return shell");
  assert.equal(panel.getText(ast), NEW_PANEL); assert.equal(text.split(NEW_PANEL).length - 1, 1);
  const restoredPanel = text.slice(0, panel.getStart(ast)) + OLD_PANEL + text.slice(panel.end);
  const original = restoredPanel.slice(0, added.getStart(ast)) + restoredPanel.slice(added.end + eol.length);
  parse(original); assert.equal(ending(original), eol); return original;
}
function checkCss (text) {
  assert.equal(ending(text), "\n", "new stylesheet is LF only");
  const ast = postcss.parse(text); assert.equal(ast.nodes.length, 9, "one comment and eight direct root rules");
  assert.equal(ast.nodes[0].type, "comment");
  assert.equal(ast.nodes[0].text, "Scoped repository picker; shared modal, focus and paging owners remain.");
  RULES.forEach(([selector, declarations], index) => {
    const rule = ast.nodes[index + 1]; assert.equal(rule.type, "rule");
    const parsed = selectorParser().astSync(rule.selector), expected = selectorParser().astSync(selector);
    assert.equal(parsed.nodes.length, 1, "no selector-list escape");
    assert.equal(parsed.toString(), expected.toString(), "complete selector AST");
    assert.ok(rule.nodes.every(n => n.type === "decl"), "direct declarations only, no nested rule/at-rule/comment");
    assert.deepEqual(rule.nodes.map(n => [n.prop, n.value, Boolean(n.important)]),
      declarations.map(([key, value]) => [key, value, false]));
  });
}
test("independent 56-line CSS freezes all eight scoped selector ASTs and exact declaration priorities", () => {
  const current = read("Frontend/src/repositoryScopePicker.css");
  assert.equal(current, CSS); assert.equal(sha(current), CSS_HASH); assert.equal(Buffer.byteLength(current), 1583);
  assert.equal(current.split("\n").length - 1, 56); checkCss(current);
});
test("CSS rejects root/nested/selector/declaration escapes, altered feedback and physical-byte faults", () => {
  const variants = [CSS + "body { color: red; }\n", CSS + "/* Extra */\n", CSS + "@font-face { font-family: x; src: url(x); }\n",
    CSS + "@supports (display: grid) { body { display: none; } }\n", CSS + "@media (pointer: coarse) { body { color: red; } }\n",
    CSS.replace("  flex-wrap: wrap;", "  flex-wrap: wrap;\n  .nested { color: red; }"),
    CSS.replace("  flex-wrap: wrap;", "  flex-wrap: wrap;\n  @supports (display: grid) { color: red; }"),
    CSS.replace("  flex-wrap: wrap;", "  flex-wrap: wrap;\n  @font-face { font-family: x; }"),
    CSS.replace("  flex-wrap: wrap;", "  flex-wrap: wrap;\n  /* Nested */"),
    CSS.replace("flex-wrap: wrap;", "flex-wrap: wrap !important;"), CSS.replace("flex-wrap: wrap;", "flex-wrap: wrap; flex-wrap: wrap;"),
    CSS.replace("flex-wrap: wrap;", "height: 20px;"), CSS.replace("flex-wrap: wrap;", "overflow: hidden;"),
    CSS.replace("flex-wrap: wrap;", "order: 2;"), CSS.replace("flex-wrap: wrap;", "animation: none;"),
    CSS.replace("flex-wrap: wrap;", "background: url(https://invalid.example/a);"), CSS.replace("flex-wrap: wrap;", "flex-wrap: malformed;"),
    CSS.replace(SUMMARY, "body"), CSS.replace(SUMMARY, SUMMARY + ", body"), CSS.replace(SUMMARY, ".repository-scope-picker"),
    CSS.replace("nth-child(2)", "nth-child(3)"), CSS.replace(':not([aria-disabled="true"])', ""), CSS.replace("--ui-primary-hover", "--ui-primary"),
    CSS.replace("}", ""), CSS.replace("\n", "\r"), CSS.replace("\n", "\r\n"), CSS.replace(/\n/g, "\r\n"),
    "\uFEFF" + CSS, CSS + "\0", CSS + "\n", CSS.slice(0, -1)];
  variants.forEach(variant => assert.throws(() => checkCss(variant)));
});
test("actual two-window inverse preserves complete original RAW/LF and both structural EOL forms", () => {
  assert.equal(ending(source), "\r\n"); assert.equal(sha(source), REVIEWED_RAW); assert.equal(sha(lf(source)), REVIEWED_LF);
  assert.equal(sha(restorePicker(source)), ORIGINAL_RAW);
  for (const eol of ["\n", "\r\n"]) {
    const current = lf(source).replace(/\n/g, eol), original = restorePicker(current);
    assert.equal(sha(lf(original)), ORIGINAL_LF);
    assert.equal(original, current.replace(IMPORT + eol, "").replace(NEW_PANEL, OLD_PANEL));
  }
});
test("inverse rejects missing/duplicate/comment/moved/wrong-owner/wrapper/import/EOF fixtures", () => {
  const text = lf(source);
  const variants = [text.replace(IMPORT + "\n", ""), text.replace(IMPORT, IMPORT + "\n" + IMPORT),
    text.replace(IMPORT, "/* " + IMPORT + " */"), text.replace(IMPORT, 'import picker from "./repositoryScopePicker.css";'),
    text.replace(IMPORT, "import './repositoryScopePicker.css';"), text.replace(IMPORT, IMPORT + " // Partial"),
    text.replace(IMPORT, "\n" + IMPORT), text.replace(IMPORT + "\n", "") + IMPORT + "\n",
    text.replace(IMPORT, "function nested () { " + IMPORT + " }"), text + "// " + IMPORT + "\n",
    text.replace(ANCHOR, 'import { DialogShell as Other } from "./dialog";'), text.replace(NEW_PANEL, OLD_PANEL),
    text.replace(NEW_PANEL, NEW_PANEL + " " + NEW_PANEL), text.replace(NEW_PANEL, NEW_PANEL.replace("picker", "wrong")),
    text.replace(NEW_PANEL, 'panelClassName={"max-w-lg repository-scope-picker"}'),
    text.replace(NEW_PANEL, OLD_PANEL).replace("{children}", "<div " + NEW_PANEL + ">{children}</div>"),
    text.replace("<DialogShell title=", "<div><DialogShell title=").replace("</DialogShell>", "</DialogShell></div>"),
    text.replace("export function RepositorySwitcher (", "function Parent () {\nexport function RepositorySwitcher (") + "}\n",
    text.replace("{children}", "{children}{/* " + NEW_PANEL + " */}"), text.replace("</DialogShell>", ""),
    text.slice(0, -6), text + "\n", text.slice(0, -1), "\uFEFF" + text, text + "\0",
    text.replace("\n", "\r\n"), text.replace("\n", "\r")];
  variants.forEach(variant => assert.throws(() => restorePicker(variant)));
});
test("valid unrelated changes survive inverse and cannot evade original whole-module preservation", () => {
  const text = lf(source), original = restorePicker(text);
  for (const [old, next] of [["export function RepositorySwitcher (", "// Outside both windows.\nexport function RepositorySwitcher ("],
    ['title="Repository scope"', 'title="Unrelated changed title"']]) {
    const restored = restorePicker(replaceOnce(text, old, next));
    assert.equal(restored, replaceOnce(original, old, next)); assert.notEqual(sha(lf(restored)), ORIGINAL_LF);
  }
});
test("all thirty scope/shared/six-view owners and original executable regression suites remain whole-pinned", () => {
  for (const [path, rawPin, lfPin] of PINS) {
    const current = deskPreservation(path, mastheadPreservation(path, cityBriefPreservation(path, purposeNavigationPreservation(path, activePlanDocketPreservation(path, historyStationPreservation(path, changesBriefPreservation(path, read(path)))))))); ending(current); assert.equal(sha(current), rawPin, path); assert.equal(sha(lf(current)), lfPin, path);
    for (const eol of ["\n", "\r\n"]) assert.equal(sha(lf(lf(current).replace(/\n/g, eol))), lfPin, path);
  }
  assert.equal(PINS.length, 30);
  // The current DialogShell is preserved strictly. Its existing executable
  // structure/lease/focus tests and real scope-paging suite run separately.
  assert.ok(PINS.some(([path]) => path === "Frontend/src/dialog.tsx"));
  assert.ok(PINS.some(([path]) => path === "Tests/test_read_surfaces.mjs"));
  assert.ok(PINS.some(([path]) => path === "Tests/test_repo_scope_paging.mjs"));
});

// Compile only the CURRENT wrapper with a transparent cosmetic shell leaf.
// Historical inverse fixtures never transpile/import/execute. No document,
// portal, rail lifecycle, mounted focus or native acceptance is fabricated.
const ast = parse(source), statements = ast.statements.filter(n => !ts.isImportDeclaration(n));
const compiled = ts.transpileModule(statements.map(n => n.getText(ast)).join("\n"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const DialogShell = ({ children }) => React.createElement(React.Fragment, null, children);
const actual = new Function("require", "exports", "DialogShell", compiled + "\nreturn exports.RepositorySwitcher;")(require, {}, DialogShell);
test("current wrapper forwards every actual shell prop, child identity and close callback without new state", () => {
  const calls = [], onClose = () => calls.push("close"), child = React.createElement("p", null, "Current child");
  const node = actual({ children: child, onClose });
  assert.equal(node.type, DialogShell); assert.equal(node.props.children, child); assert.equal(node.props.onClose, onClose);
  assert.deepEqual(Object.keys(node.props).sort(), ["backdropClose", "children", "closeLabel", "description", "onClose", "panelClassName", "title"]);
  assert.equal(node.props.title, "Repository scope"); assert.equal(node.props.description, "Choose a repository or the whole workspace.");
  assert.equal(node.props.closeLabel, "Close repository scope"); assert.equal(node.props.backdropClose, true);
  assert.equal(node.props.panelClassName, "max-w-lg repository-scope-picker");
  node.props.onClose(); node.props.onClose(); assert.deepEqual(calls, ["close", "close"]);
  const owner = one(ast.statements, n => ts.isFunctionDeclaration(n) && n.name?.text === "RepositorySwitcher");
  assert.equal(owner.body.statements.length, 1); assert.ok(ts.isReturnStatement(owner.body.statements[0]), "no new wrapper state");
});
test("actual wrapper keeps empty/full long escaped child content and original child callbacks", () => {
  for (const children of [null, "", "Exact <&> child"]) {
    const shell = actual({ children, onClose: () => {} }); assert.equal(shell.props.children, children);
    assert.equal(renderToStaticMarkup(shell), renderToStaticMarkup(React.createElement(React.Fragment, null, children)));
  }
  const fullName = "LongRepository".repeat(30) + '<script>&"';
  const calls = [], child = React.createElement("button", { type: "button", "aria-label": fullName,
    onClick: () => calls.push(fullName) }, fullName);
  const node = actual({ children: child, onClose: () => {} }), html = renderToStaticMarkup(node);
  assert.equal(node.props.children, child); assert.equal(node.props.children.props.type, "button");
  assert.equal(node.props.children.props["aria-label"], fullName); node.props.children.props.onClick();
  assert.deepEqual(calls, [fullName]); assert.match(html, /&lt;script&gt;&amp;&quot;/); assert.doesNotMatch(html, /<script>/);
  assert.ok(html.includes("LongRepository".repeat(30)), "complete child text, no truncation or copied rail");
});
