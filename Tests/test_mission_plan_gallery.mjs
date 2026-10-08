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
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(resolve(root, "Frontend/package.json"));
const ts = require("typescript"), postcss = require("postcss"), React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const read = name => readFileSync(resolve(root, name), "utf8");
const sha = text => createHash("sha256").update(text).digest("hex");
const lf = text => text.replace(/\r\n/g, "\n");
const one = (nodes, predicate, label) => {
  const selected = nodes.filter(predicate);
  assert.equal(selected.length, 1, label);
  return selected[0];
};
const replaceOnce = (text, before, after) => {
  assert.equal(text.split(before).length - 1, 1, "one physical fixture window");
  return text.replace(before, after);
};
function ending (text) {
  assert.equal(typeof text, "string");
  assert.ok(!text.startsWith("\uFEFF") && !text.includes("\0"), "no BOM or NUL");
  const bare = text.replace(/\r\n/g, ""), eol = text.includes("\r\n") ? "\r\n" : "\n";
  assert.ok(!bare.includes("\r"), "no bare CR");
  if (eol === "\r\n") assert.ok(!bare.includes("\n"), "uniform EOL");
  return eol;
}
function parseTs (text, name) {
  const ast = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  assert.equal(ast.parseDiagnostics.length, 0, "valid complete actual TSX source");
  return ast;
}
const ORIGINAL_MAIN_RAW = "facfd6df44599c8b05c684fb788e1833df92f130be9b078d2863ec742d120512";
const ORIGINAL_MAIN_LF = "facfd6df44599c8b05c684fb788e1833df92f130be9b078d2863ec742d120512";
const INDEX_IMPORT = 'import "./index.css";';
const GALLERY_IMPORT = 'import "./missionPlanGallery.css";';

// Complete reviewed source, independent of the mutable gitignored plan.
const GALLERY_CSS = `/* Mission plan gallery: existing selection and readiness owners. */
#mission-plan-cards {
  grid-template-columns: minmax(0, 1fr);
  gap: 1rem;
  align-items: stretch;
}
#mission-plan-cards > button {
  padding: 1.25rem;
  gap: 1rem;
  border-radius: 0.75rem;
}
#mission-plan-cards > button > span:first-child > span:first-child > span:first-child {
  font-size: 1.125rem;
  line-height: 1.75rem;
}
#mission-plan-cards > button > span:last-child {
  width: 100%;
  margin-top: auto;
  padding-top: 0.75rem;
  border-top: 1px solid rgb(var(--ui-border));
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}
@media (min-width: 768px) {
  #mission-plan-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (min-width: 1280px) {
  #mission-plan-cards { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
`;
function inspectGalleryCss (text) {
  ending(text);
  const ast = postcss.parse(text);
  assert.equal(lf(text), GALLERY_CSS, "complete literal stylesheet, not a selector sample");
  assert.equal(ast.nodes.length, 7, "one comment, four base rules and two media owners");
  assert.deepEqual(ast.nodes.filter(node => node.type === "atrule").map(node => [node.name, node.params]),
    [["media", "(min-width: 768px)"], ["media", "(min-width: 1280px)"]]);
  const rules = []; ast.walkRules(rule => rules.push(rule));
  assert.equal(rules.length, 6);
  rules.forEach(rule => assert.ok(rule.selector.startsWith("#mission-plan-cards")));
  return { ast, rules };
}

// Preservation only. No restored bootstrap or copied component is executed.
function restoreGalleryImport (text) {
  const eol = ending(text), ast = parseTs(text, "main.tsx");
  const imports = ast.statements.filter(ts.isImportDeclaration);
  const matches = name => node => ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === name;
  const original = one(imports, matches("./index.css"), "one actual index import");
  const added = one(imports, matches("./missionPlanGallery.css"), "one actual gallery import");
  assert.equal(original.importClause, undefined, "actual index side-effect import");
  assert.equal(added.importClause, undefined, "actual gallery side-effect import");
  assert.equal(original.getText(ast), INDEX_IMPORT);
  assert.equal(added.getText(ast), GALLERY_IMPORT);
  assert.equal(ast.statements.indexOf(added), ast.statements.indexOf(original) + 1, "adjacent actual AST imports");
  const window = INDEX_IMPORT + eol + GALLERY_IMPORT + eol;
  assert.equal(text.split(window).length - 1, 1, "one complete physical insertion site");
  assert.equal(text.split(GALLERY_IMPORT + eol).length - 1, 1, "one unique physical added line");
  const start = text.indexOf(window) + INDEX_IMPORT.length + eol.length;
  assert.equal(added.getStart(ast), start, "actual import occupies its exact physical line");
  assert.equal(text.slice(start - INDEX_IMPORT.length - eol.length, start), INDEX_IMPORT + eol);
  const restored = text.slice(0, start) + text.slice(start + GALLERY_IMPORT.length + eol.length);
  parseTs(restored, "main.tsx");
  return restored;
}
const css = read("Frontend/src/missionPlanGallery.css"), main = read("Frontend/src/main.tsx");

test("actual whole gallery stylesheet has exactly six scoped rules and reviewed responsive/footer declarations", () => {
  assert.equal(ending(css), "\n", "new physical stylesheet remains LF");
  const { ast, rules } = inspectGalleryCss(css);
  const declarations = rule => Object.fromEntries(rule.nodes.filter(node => node.type === "decl").map(node => [node.prop, node.value]));
  assert.deepEqual(declarations(ast.nodes[1]), { "grid-template-columns": "minmax(0, 1fr)", gap: "1rem", "align-items": "stretch" });
  assert.deepEqual(declarations(ast.nodes[2]), { padding: "1.25rem", gap: "1rem", "border-radius": "0.75rem" });
  assert.deepEqual(declarations(ast.nodes[3]), { "font-size": "1.125rem", "line-height": "1.75rem" });
  assert.deepEqual(declarations(ast.nodes[4]), { width: "100%", "margin-top": "auto", "padding-top": "0.75rem",
    "border-top": "1px solid rgb(var(--ui-border))", "font-variant-numeric": "tabular-nums", "overflow-wrap": "anywhere" });
  assert.deepEqual(rules.slice(-2).map(rule => declarations(rule)["grid-template-columns"]),
    ["repeat(2, minmax(0, 1fr))", "repeat(3, minmax(0, 1fr))"]);
  rules.forEach(rule => rule.nodes.filter(node => node.type === "decl").forEach(node => {
    assert.ok(!["height", "min-height", "max-height", "color", "background", "background-color", "position", "order", "animation", "transform"].includes(node.prop));
    assert.ok(!node.prop.startsWith("overflow") || node.prop === "overflow-wrap");
  }));
  assert.ok(css.endsWith("\n") && !css.endsWith("\n\n"), "single final newline");
});

test("whole CSS contract rejects changed, global, nested, extra, malformed and partial style fixtures", () => {
  for (const value of [
    replaceOnce(css, "#mission-plan-cards {\n", "#other-plan-cards {\n"),
    replaceOnce(css, "padding: 1.25rem;", "padding: 1.5rem;"),
    replaceOnce(css, "(min-width: 768px)", "(min-width: 769px)"),
    replaceOnce(css, "  overflow-wrap: anywhere;\n", ""),
    "body { margin: 0; }\n" + css, ".wrong-owner {\n" + css + "}\n",
    css + "#mission-plan-cards > a { padding: 1rem; }\n",
    replaceOnce(css, "grid-template-columns: minmax(0, 1fr);", "grid-template-columns: minmax(0, 1fr); height: 8rem;"),
    css.replace("/* Mission plan gallery: existing selection and readiness owners. */\n", ""),
  ]) {
    assert.doesNotThrow(() => postcss.parse(value));
    assert.throws(() => inspectGalleryCss(value), assert.AssertionError);
  }
  for (const value of ["\uFEFF" + css, css + "\0", css.replace("\n", "\r"), css.replace("\n", "\r\n"), css + "a {\n"]) {
    assert.throws(() => inspectGalleryCss(value));
  }
});

test("strict actual TSX side-effect import inverse preserves every original bootstrap byte in LF and CRLF", () => {
  assert.equal(ending(main), "\n", "physical main remains LF");
  assert.equal(sha(restoreGalleryImport(main)), ORIGINAL_MAIN_RAW);
  for (const eol of ["\n", "\r\n"]) {
    const current = lf(main).replace(/\n/g, eol), restored = restoreGalleryImport(current);
    assert.equal(sha(lf(restored)), ORIGINAL_MAIN_LF);
    const at = current.indexOf(GALLERY_IMPORT);
    assert.equal(restored.slice(0, at), current.slice(0, at));
    assert.equal(restored.slice(at), current.slice(at + GALLERY_IMPORT.length + eol.length));
  }
});

test("bootstrap inverse rejects missing, duplicate, relocated, default, comment, partial and invalid imports", () => {
  const source = lf(main), original = restoreGalleryImport(source);
  const variants = [
    original, replaceOnce(source, GALLERY_IMPORT + "\n", GALLERY_IMPORT + "\n" + GALLERY_IMPORT + "\n"),
    original + GALLERY_IMPORT + "\n",
    replaceOnce(source, GALLERY_IMPORT, 'import gallery from "./missionPlanGallery.css";'),
    replaceOnce(source, GALLERY_IMPORT, "// " + GALLERY_IMPORT),
    replaceOnce(source, GALLERY_IMPORT, "/* " + GALLERY_IMPORT + " */"),
    replaceOnce(source, GALLERY_IMPORT, 'import "./missionPlanGallery.css"'),
    replaceOnce(source, GALLERY_IMPORT, "import './missionPlanGallery.css';"),
    replaceOnce(source, GALLERY_IMPORT, 'import "./missionPlanGallery.css?raw";'),
    replaceOnce(source, GALLERY_IMPORT, "  " + GALLERY_IMPORT),
    replaceOnce(source, GALLERY_IMPORT, GALLERY_IMPORT + " // altered site"),
    replaceOnce(source, INDEX_IMPORT + "\n", INDEX_IMPORT + "\n\n"),
    replaceOnce(source, INDEX_IMPORT + "\n" + GALLERY_IMPORT, GALLERY_IMPORT + "\n" + INDEX_IMPORT),
    replaceOnce(source, GALLERY_IMPORT, "const cssLiteral = '" + GALLERY_IMPORT + "';"),
  ];
  for (const value of variants) {
    parseTs(value, "valid-negative-main.tsx");
    for (const eol of ["\n", "\r\n"]) {
      assert.throws(() => restoreGalleryImport(value.replace(/\n/g, eol)), assert.AssertionError);
    }
  }
  for (const value of ["\uFEFF" + source, source + "\0", source.replace("\n", "\r"), source.replace("\n", "\r\n"),
    source + "const broken = <div>;\n"]) assert.throws(() => restoreGalleryImport(value));
});

test("bootstrap inverse leaves valid outside mutations visible to the complete immutable original hash", () => {
  for (const [before, after] of [
    ['import App from "./App";', 'import App from "./OtherApp";'],
    ['document.getElementById("root")', 'document.getElementById("other-root")'],
    ['register("/sw.js")', 'register("/other-sw.js")'],
  ]) for (const eol of ["\n", "\r\n"]) {
    const current = lf(main).replace(/\n/g, eol), changed = replaceOnce(current, before, after);
    parseTs(changed, "outside-mutation-main.tsx");
    const restored = restoreGalleryImport(changed);
    assert.equal(restored, replaceOnce(restoreGalleryImport(current), before, after));
    assert.notEqual(sha(lf(restored)), ORIGINAL_MAIN_LF);
  }
});

test("complete Mission, shared stylesheet and four old suites preserve distinct original RAW and LF pins", () => {
  for (const [name, rawPin, lfPin] of [
    ["Frontend/src/MissionView.tsx", "aa13ef82e543e58e2762568e0b1d430ef2622c0ab3f95aa5433edb5fb1a7bdab",
      "b2ebe76aa6ab6527dcf21bd90ad67d718f29ff8521a137262cfa4309c17be622"],
    ["Frontend/src/index.css", "9371bc04cba0b62e8a8e5e3b4a9251deea9273be58f4b9735982e0649527ba81",
      "788436e9def1e7109fe98d4bfa5e0add49a5f0ca301b17416279c03f18ede0f5"],
    ["Tests/test_overview_operations_deck.mjs", "4c4b2fb8ed83321a1c696e99b102b3611a5f81902967b070a934cd43126421b9",
      "4c4b2fb8ed83321a1c696e99b102b3611a5f81902967b070a934cd43126421b9"],
    ["Tests/test_mission_paging.mjs", "36ba19f99711a19f6534857c4be09fe28d9b8734df1a2113e78dc9e4cb8077b6",
      "1c111f8b2cef0c0b7a6e8870b4bcd791681e22bba77ab5bddb1f587c832851d7"],
    ["Tests/test_mission_plan_snapshot.mjs", "03c937081caaeb713761b9f643c59a41c8490c26beab26abde3234c69d8137a3",
      "03c937081caaeb713761b9f643c59a41c8490c26beab26abde3234c69d8137a3"],
    ["Tests/test_mission_owner_retirement.mjs", "9adaf72a29ba6e582d7a0fe0227863e4efbbb38d19ecdf8cc07293881231ca1f",
      "9adaf72a29ba6e582d7a0fe0227863e4efbbb38d19ecdf8cc07293881231ca1f"],
  ]) {
    const raw = deskPreservation(name, mastheadPreservation(name, purposeNavigationPreservation(name, historyStationPreservation(name, changesBriefPreservation(name, read(name)))))); ending(raw);
    assert.equal(sha(raw), rawPin, "whole actual physical bytes: " + name);
    assert.equal(sha(lf(raw)), lfPin, "whole original LF bytes: " + name);
    for (const eol of ["\n", "\r\n"]) assert.equal(sha(lf(lf(raw).replace(/\n/g, eol))), lfPin);
  }
});

const missionAst = parseTs(read("Frontend/src/MissionView.tsx"), "MissionView.tsx");
const modelAst = parseTs(read("Frontend/src/missionModel.ts"), "missionModel.ts");
const uiAst = parseTs(read("Frontend/src/ui.tsx"), "ui.tsx");
function owner (ast, name) {
  return one(ast.statements, node => (ts.isFunctionDeclaration(node) && node.name?.text === name)
    || (ts.isVariableStatement(node) && node.declarationList.declarations.some(item => item.name.getText(ast) === name)),
  "one raw actual owner: " + name).getText(ast).replace(/^export\s+/, "");
}
// Raw current native card and state owners, with no copied production behavior.
const moduleText = `export function makeSubjects(React) {
  ${owner(uiAst, "cx")}
  ${["MISSION_PRESENTATION", "missionPresentation", "planKey"].map(name => owner(modelAst, name)).join("\n")}
  ${["TONE_CLASS", "StateBadge", "PlanCard"].map(name => owner(missionAst, name)).join("\n")}
  return {PlanCard,StateBadge,missionPresentation,planKey};
}`;
const compiled = ts.transpileModule(moduleText, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React,
} }).outputText;
const { makeSubjects } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const subjects = makeSubjects(React);
const fixture = (extra = {}) => ({ repo: "Repo_A", plan_file: "temp/Plan/PLAN_test.txt", label: "Selected work",
  state: "blocked", task_counts: { total: 8, pending: 2, in_progress: 1, done: 5 }, ...extra });
const textOf = node => Array.isArray(node) ? node.map(textOf).join("") : React.isValidElement(node)
  ? textOf(node.props.children) : typeof node === "string" || typeof node === "number" ? String(node) : "";
function inspectCard (plan, selected) {
  const before = JSON.stringify(plan), calls = [], onSelect = () => calls.push(subjects.planKey(plan.repo, plan.plan_file));
  const tree = subjects.PlanCard({ plan, selected, onSelect });
  assert.equal(tree.type, "button"); assert.equal(tree.props.type, "button");
  assert.equal(tree.props["aria-pressed"], selected); assert.equal(tree.props.onClick, onSelect);
  const children = React.Children.toArray(tree.props.children);
  assert.equal(children.length, 2); children.forEach(node => assert.equal(node.type, "span"));
  const header = React.Children.toArray(children[0].props.children), labels = React.Children.toArray(header[0].props.children);
  assert.equal(header.length, 2); assert.equal(header[1].type, subjects.StateBadge);
  assert.equal(labels.length, 2); assert.equal(textOf(labels[0]), plan.label);
  assert.equal(textOf(labels[1]), plan.repo + " · " + plan.plan_file);
  assert.ok(labels[0].props.className.includes("break-words")); assert.ok(labels[1].props.className.includes("break-all"));
  assert.ok(children[1].props.className.includes("text-xs"));
  tree.props.onClick(); assert.deepEqual(calls, [subjects.planKey(plan.repo, plan.plan_file)]);
  const html = renderToStaticMarkup(React.createElement(subjects.PlanCard, { plan, selected, onSelect }));
  assert.equal((html.match(/<button\b/g) ?? []).length, 1, "one native interaction owner");
  assert.doesNotMatch(html, /<(?:a|input|select|textarea|summary|iframe)\b|role="(?:button|grid|gridcell)"|tabindex=/);
  assert.match(html, new RegExp(`aria-pressed="${selected}"`));
  assert.ok(tree.props.className.includes(selected ? "border-ui-focus bg-sky-950/40" : "border-ui-border bg-ui-surface hover:bg-ui-raised"));
  assert.equal(JSON.stringify(plan), before, "accepted plan data is never rewritten");
  return { html, footer: textOf(children[1]), badge: subjects.StateBadge(header[1].props) };
}

test("raw current native PlanCard preserves all seven backend states, selected styles, DOM order and exact callbacks", () => {
  for (const [state, label, tone] of [
    ["not_configured", "Not configured", "neutral"], ["planning", "Planning", "neutral"],
    ["implementation", "Implementation", "live"], ["verification", "Verification", "warning"],
    ["blocked", "Blocked", "danger"], ["ready_to_commit", "Ready to commit", "success"],
    ["verified_committed", "Verified + committed", "success"],
  ]) for (const selected of [false, true]) {
    const result = inspectCard(fixture({ state }), selected), presentation = subjects.missionPresentation(state);
    assert.equal(presentation.label, label); assert.equal(presentation.tone, tone);
    assert.equal(textOf(result.badge), presentation.marker + label);
    assert.ok(result.html.includes(label)); assert.equal(result.footer, "5/8 tasks · 63%");
    assert.ok(result.badge.props.className.includes({ neutral: "text-ui-muted", live: "text-teal-200",
      warning: "text-amber-200", danger: "text-rose-200", success: "text-emerald-200" }[tone]));
  }
});

test("raw current count arithmetic preserves zero, single, mixed and uninterrupted long values without scaling", () => {
  for (const [done, total, expected] of [[0, 0, "0/0 tasks · 0%"], [0, 1, "0/1 tasks · 0%"],
    [1, 1, "1/1 tasks · 100%"], [5, 8, "5/8 tasks · 63%"],
    [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, "9007199254740991/9007199254740991 tasks · 100%"]]) {
    const result = inspectCard(fixture({ task_counts: { done, total, pending: 0, in_progress: 0 } }), false);
    assert.equal(result.footer, expected); assert.ok(result.html.includes(expected));
    assert.doesNotMatch(result.html, /whitespace-nowrap|overflow-hidden|transform:|scale\(/);
  }
  assert.equal(inspectGalleryCss(css).ast.nodes[4].nodes.find(node => node.prop === "overflow-wrap").value, "anywhere");
});

test("raw current long and special plan identities retain exact text, escape markup and preserve the label/footer selector shape", () => {
  const token = '<script>Mission & "scope"</script>', plan = fixture({ label: token.repeat(40),
    repo: token.repeat(25), plan_file: "temp/" + token.repeat(35) + ".txt" });
  for (const selected of [false, true]) {
    const result = inspectCard(plan, selected);
    assert.match(result.html, /&lt;script&gt;Mission &amp; &quot;scope&quot;&lt;\/script&gt;/);
    assert.doesNotMatch(result.html, /<script>|<a\b|whitespace-nowrap|overflow-hidden|transform:|scale\(/);
    assert.equal(result.footer, "5/8 tasks · 63%");
  }
});
