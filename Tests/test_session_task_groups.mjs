import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { canonicalPrintedText } from "./helpers/printed_source.mjs";
import { restoreDialogChronology } from "./helpers/dialogChronology.mjs";
import { restoreSessionIdentity } from "./helpers/sessionIdentity.mjs";
import { OLD_TASK_EXPRESSION, NEW_TASK_EXPRESSION, OLD_TASK_LINE, NEW_TASK_LINE,
  restoreSessionTaskGroups, sessionTaskGroupsInitializer } from "./helpers/sessionTaskGroups.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), ".."), frontend = resolve(root, "Frontend");
const require = createRequire(resolve(frontend, "package.json"));
const ts = require("typescript"), React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const read = (file) => readFileSync(resolve(frontend, "src", file), "utf8");
const sha = (value) => createHash("sha256").update(value).digest("hex");
const lf = canonicalPrintedText;
const parse = (file, text = read(file)) => ts.createSourceFile(file, text,
  ts.ScriptTarget.Latest, true, file.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
const printer = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed });
const printed = (node, source) => lf(printer.printNode(ts.EmitHint.Unspecified, node, source));
function declaration (source, name) {
  assert.equal(source.parseDiagnostics.length, 0);
  const matches = source.statements.filter((node) =>
    ts.isFunctionDeclaration(node) && node.name?.text === name
    || ts.isVariableStatement(node) && node.declarationList.declarations
      .some((item) => ts.isIdentifier(item.name) && item.name.text === name));
  assert.equal(matches.length, 1, "one actual declaration: " + name);
  return matches[0];
}
const codeOf = (source, name) => declaration(source, name).getText(source).replace(/^export\s+/, "");
const theme = parse("theme.ts"), format = parse("format.ts"), ui = parse("ui.tsx");
const icons = parse("icons.tsx"), status = parse("dialogStatus.tsx");
const dependencySource = [
  ...["MODE_COLOR", "MODE_BADGE", "EFFORT_GAP_MAX_MIN", "EFFORT_TAIL_MIN",
    "sessionIdentityKey", "sessionColor"].map((name) => codeOf(theme, name)),
  ...["pad", "fmtTs", "fmtMinutes"].map((name) => codeOf(format, name)),
  ...["IconBase", "ChevronLeftIcon", "ChevronRightIcon"].map((name) => codeOf(icons, name)),
  ...["cx", "CONTROL_TONE", "ControlButton", "getBoundedPageWindow", "CollectionPager"]
    .map((name) => codeOf(ui, name)),
  ...["DialogStatus", "DialogLoadStatus", "EventWindowNotice"].map((name) => codeOf(status, name)),
].join("\n");
const nodes = (node) => Array.isArray(node) ? node.flatMap(nodes)
  : React.isValidElement(node) ? [node, ...nodes(node.props.children)] : [];
const textOf = (node) => Array.isArray(node) ? node.map(textOf).join("")
  : React.isValidElement(node) ? textOf(node.props.children) : node == null ? "" : String(node);

// The complete actual component and real presentation dependencies run.
// Only accepted hook state, paging hook boundary and portal/effects are controlled.
function acceptedSession (rows, page = 1, sessionId = "session-A") {
  const source = parse("SessionTimeline.tsx"), owner = codeOf(source, "SessionTimeline");
  let stateIndex = 0, effects = 0;
  const hooks = {
    useState() { return [[rows, "", false, false, 0][stateIndex++], () => {
      throw new Error("An accepted render must not write hook state");
    }]; },
    useRef(initial) { return { current: initial }; },
    useEffect() { effects++; },
  };
  const program = "const {forwardRef}=React;\nconst {useState,useRef,useEffect}=hooks;\n"
    + dependencySource + "\n"
    + "const DialogShell=({title,description,children})=>"
    + "<section><h2>{title}</h2><p>{description}</p>{children}</section>;\n"
    + "const useBoundedPage=options=>({...getBoundedPageWindow(options.totalItems,page,options.pageSize),setPage:()=>{}});\n"
    + owner + "\nreturn SessionTimeline;";
  const javascript = ts.transpileModule(program, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React,
  } }).outputText;
  const Component = new Function("React", "hooks", "page", javascript)(React, hooks, page);
  const tree = Component({ session: { provider: "codex", sessionId },
    onClose() {}, onStatus() { throw new Error("No transport/effect runs in accepted-state SSR"); } });
  assert.equal(stateIndex, 5); assert.equal(effects, 1);
  const all = nodes(tree), html = renderToStaticMarkup(tree);
  return { tree, html,
    headings: all.filter((node) => node.type === "div"
      && node.props.className?.includes("border-l-2 border-sky-600")).map(textOf),
    rowKeys: all.filter((node) => node.type === "div" && node.key !== null).map((node) => node.key),
  };
}
const row = (id, repo = "Repo_A", task = "plan - A.1", extra = {}) => Object.freeze({
  id, repo_id: repo, task_ref: task, ts: new Date(Date.UTC(2026, 9, 6, 0, 0, id)).toISOString(),
  file: "src/app.ts", mode: "B", provider: "codex", session_id: "session-A",
  tool: "Edit", commit_hash: null, ...extra,
});
const continued = "plan - A.1 \u2014 continued";
const unresolved = "(unresolved \u2014 pick queue)";
const immutable = (rows) => Object.freeze(rows);

test("accepted-session semantics: adjacent repositories start distinct task headings", () => {
  const rows = immutable([row(1), row(2, "Repo_B")]), before = JSON.stringify(rows);
  const actual = acceptedSession(rows);
  assert.deepEqual(actual.headings, ["plan - A.1", "plan - A.1"],
    "Two accepted (repo, task_ref) display runs must start two headings");
  assert.deepEqual(actual.rowKeys, ["1", "2"]);
  assert.match(actual.html, /Repo_A/); assert.match(actual.html, /Repo_B/);
  assert.equal(JSON.stringify(rows), before);
});
test("accepted-session semantics: page boundary never continues a different repository", () => {
  const rows = immutable(Array.from({ length: 51 }, (_, index) =>
    row(index + 1, index === 50 ? "Repo_B" : "Repo_A")));
  const actual = acceptedSession(rows, 2);
  assert.deepEqual(actual.headings, ["plan - A.1"], "Repo_B must not continue Repo_A's display run");
  assert.deepEqual(actual.rowKeys, ["51"]);
  assert.match(actual.html, /Repo_B/); assert.match(actual.html, /Page 2 of 2/);
});
test("same-repository continuation and changed-reference boundaries stay original", () => {
  const same = immutable(Array.from({ length: 51 }, (_, index) => row(index + 1)));
  assert.deepEqual(acceptedSession(same, 1).headings, ["plan - A.1"]);
  assert.deepEqual(acceptedSession(same, 2).headings, [continued]);
  const changed = immutable([...same.slice(0, 50), row(51, "Repo_A", "plan - B.2")]);
  assert.deepEqual(acceptedSession(changed, 2).headings, ["plan - B.2"]);
  assert.deepEqual(acceptedSession(immutable([row(1), row(2, "Repo_A", "plan - B.2")])).headings,
    ["plan - A.1", "plan - B.2"]);
});
test("null references preserve unresolved text while repository boundaries remain distinct", () => {
  assert.deepEqual(acceptedSession(immutable([row(1, "Repo_A", null), row(2, "Repo_B", null)])).headings,
    [unresolved, unresolved]);
  assert.deepEqual(acceptedSession(immutable([row(1, "Repo_A", null), row(2, "Repo_A", null)])).headings,
    [unresolved]);
  const rows = immutable(Array.from({ length: 51 }, (_, index) =>
    row(index + 1, index === 50 ? "Repo_B" : "Repo_A", null)));
  assert.deepEqual(acceptedSession(rows, 2).headings, [unresolved]);
});
test("A-B-A runs, first/empty/last pages and fifty-row bounds use actual paging", () => {
  assert.deepEqual(acceptedSession(immutable([row(1), row(2, "Repo_B"), row(3)])).headings,
    ["plan - A.1", "plan - A.1", "plan - A.1"]);
  const empty = acceptedSession(immutable([]));
  assert.deepEqual(empty.headings, []); assert.deepEqual(empty.rowKeys, []);
  assert.match(empty.html, /No events for this session/);
  const many = immutable(Array.from({ length: 105 }, (_, index) =>
    row(index + 1, index >= 100 ? "Repo_B" : "Repo_A")));
  assert.equal(acceptedSession(many, 1).rowKeys.length, 50);
  const last = acceptedSession(many, 999);
  assert.deepEqual(last.rowKeys, ["101", "102", "103", "104", "105"]);
  assert.deepEqual(last.headings, ["plan - A.1"]);
  assert.match(last.html, /Page 3 of 3/);
});
test("long escaped raw identities, strict repository spelling and full session disclosure remain intact", () => {
  const task = "<script>&\"'" + "x".repeat(2048), repo = "<Repo&\"'>", session = "raw\n\u202e" + "s".repeat(2048);
  const rows = immutable([row(1, repo, task, { session_id: session }),
    row(2, repo + " ", task, { session_id: session })]);
  const actual = acceptedSession(rows, 1, session);
  assert.deepEqual(actual.headings, [task, task]);
  assert.match(actual.html, /&lt;script&gt;&amp;/); assert.doesNotMatch(actual.html, /<script>/);
  assert.match(actual.html, /&lt;Repo&amp;/); assert.match(actual.html, /Full session ID/);
  const field = nodes(actual.tree).find((node) => node.type === "input" && node.props.readOnly);
  assert.equal(JSON.parse(field.props.value), session);
  assert.deepEqual(acceptedSession(immutable([row(1, "Repo_A"), row(2, "repo_a")])).headings,
    ["plan - A.1", "plan - A.1"]);
});

const ORIGINAL_RAW = "4aa43a60708c1ece6636d8109772a5df9efbf3d0cbf63f63a03477fa8de6bd1a";
const ORIGINAL_LF = "c81d4bab92e9bfd27024b5b0cae0a78d7dcf5925dd216ce8f1675d2435414999";
function originalPins (text) {
  const normalized = lf(text), source = parse("SessionTimeline.tsx", normalized);
  const fn = declaration(source, "SessionTimeline"), ret = fn.body.statements.at(-1);
  assert.ok(ts.isReturnStatement(ret));
  assert.equal(sha(normalized), ORIGINAL_LF);
  assert.equal(sha(normalized.replace(/\n/g, "\r\n")), ORIGINAL_RAW);
  assert.equal(sha(fn.getText(source)), "d1a042f3c09b4c24d7b193c5764a11188224861ede8d106c3f73df0f330a5466");
  assert.equal(sha(printed(fn, source)), "5f8305101a45bcddde08b36b1dfb916c7e9485bb857b9d994e3506927d1b8992");
  assert.equal(sha(normalized.slice(fn.getStart(source), ret.getStart(source))),
    "240593fea1cc3ef45b72835cecdb05a22041bf70e0558949fca358ddb61abb33");
  assert.equal(sha(fn.body.statements.slice(0, -1).map((node) => printed(node, source)).join("\n")),
    "4b07aa6826766e040515d95c4cdb80ccedc0b2e97643ff4f7e77bb12fbe8b413");
  assert.equal(sha(normalized.slice(0, fn.getStart(source)) + normalized.slice(fn.end)),
    "97b1069d2d4a35b1eccca51fee9a101d394204c15ec213465ebbfc11e9464ee7");
}
function reviewedSource () {
  const text = lf(read("SessionTimeline.tsx"));
  if (sha(text) === ORIGINAL_LF) {
    originalPins(text);
    assert.equal(text.split(OLD_TASK_LINE).length - 1, 1);
    return text.replace(OLD_TASK_LINE, NEW_TASK_LINE);
  }
  originalPins(restoreSessionTaskGroups(text));
  return text;
}
test("one initializer inverse restores immutable whole owner, prefix, outside and physical bytes", () => {
  const raw = readFileSync(resolve(frontend, "src/SessionTimeline.tsx")), text = raw.toString("utf8");
  assert.ok(!raw.subarray(0, 3).equals(Buffer.from([239, 187, 191])));
  assert.equal((text.match(/\n/g) ?? []).length, (text.match(/\r\n/g) ?? []).length);
  assert.ok(text.endsWith("\r\n") && !text.endsWith("\r\n\r\n"));
  assert.equal(sha(restoreSessionTaskGroups(text)), ORIGINAL_RAW);
  for (const newline of ["\n", "\r\n"]) {
    const variant = lf(text).replace(/\n/g, newline), restored = restoreSessionTaskGroups(variant);
    originalPins(restored);
    const { source, fn } = sessionTaskGroupsInitializer(variant), ret = fn.body.statements.at(-1);
    assert.equal(sha(lf(variant.slice(fn.getStart(source), ret.getStart(source)))),
      "240593fea1cc3ef45b72835cecdb05a22041bf70e0558949fca358ddb61abb33");
  }
});
test("owned-expression guards reject structural changes in LF and CRLF", () => {
  const text = reviewedSource();
  const variants = [
    text.replace(NEW_TASK_LINE, OLD_TASK_LINE),
    text.replace(NEW_TASK_LINE, NEW_TASK_LINE + NEW_TASK_LINE),
    text.replace(NEW_TASK_LINE, "").replace("          const gap = previous\n", NEW_TASK_LINE + "          const gap = previous\n"),
    text.replace("export function SessionTimeline", "export function OtherTimeline"),
    text.replace("visibleRows.map", "rows.map"),
    text.replace("(event, localIndex) => {", "(item, localIndex) => {"),
    text.replace("const taskChanged", "let taskChanged"),
    text.replace("const taskChanged", "const changedTask"),
    text.replace("previous.repo_id !== event.repo_id", "previous.provider !== event.provider"),
    text.replace("previous.repo_id !== event.repo_id", "previous.repo_id === event.repo_id"),
    text.replace("previous.repo_id", "previous?.repo_id"),
    text.replace(NEW_TASK_EXPRESSION, "!previous || previous.task_ref !== event.task_ref || previous.repo_id !== event.repo_id"),
    text.replace(NEW_TASK_EXPRESSION, "!previous || previous.repo_id !== event.repo_id"),
    text.replace(NEW_TASK_EXPRESSION, NEW_TASK_EXPRESSION + " || true"),
    text.replace(NEW_TASK_LINE, NEW_TASK_LINE.replace(" || previous.repo_id", " ||\n            previous.repo_id")),
    text.replace(NEW_TASK_LINE, " " + NEW_TASK_LINE),
    text.replace(NEW_TASK_LINE, NEW_TASK_LINE.trimEnd() + " // unreviewed\n"),
    text + "\n" + NEW_TASK_LINE,
  ];
  for (const [index, changed] of variants.entries()) for (const newline of ["\n", "\r\n"]) {
    assert.notEqual(changed, text, "meaningful structural control " + index);
    assert.throws(() => restoreSessionTaskGroups(changed.replace(/\n/g, newline)), assert.AssertionError);
  }
});
test("unrelated valid changes stay visible to all immutable original pins", () => {
  const text = reviewedSource();
  const changes = [
    text.replace("setBusy(true);", "setBusy(false);"),
    text.replace("action.controller.abort();", "action.clear();"),
    'import "./unexpected";\n' + text,
    text.replace("Cross-repository captured activity", "Changed original description"),
    text.replace("{event.repo_id}", "{event.file}"),
    text.replace("gap > gapMs", "gap > 0"),
    text.replace("[onStatus, retryNonce, session.provider, session.sessionId]", "[onStatus, retryNonce]"),
    text.replace("all.sort((a, b) => {", "all.sort((a, b) => { /* unreviewed helper change */"),
  ];
  for (const [index, changed] of changes.entries()) for (const newline of ["\n", "\r\n"]) {
    assert.notEqual(changed, text, "meaningful unrelated control " + index);
    const restored = restoreSessionTaskGroups(changed.replace(/\n/g, newline));
    assert.notEqual(sha(lf(restored)), ORIGINAL_LF);
    assert.throws(() => originalPins(restored), assert.AssertionError);
  }
});
test("the inverse preserves unrelated mixed physical newlines instead of normalizing them", () => {
  const text = reviewedSource();
  const changed = text.replace('from "react";\n', 'from "react";\r\n');
  assert.notEqual(changed, text);
  assert.equal(restoreSessionTaskGroups(changed),
    changed.replace(NEW_TASK_EXPRESSION, OLD_TASK_EXPRESSION));
});
test("existing .18 .21 .29 ancestral oracles remain exact after the sole new inverse", () => {
  const restored = restoreSessionTaskGroups(read("SessionTimeline.tsx"));
  const chronology = lf(restoreDialogChronology(restored, "SessionTimeline"));
  assert.equal(sha(chronology), "2c838f0b7cc93364ef9179cc45d2902727e35a7cda2c599ed9e498c3038d62db");
  const chronologicalSource = parse("SessionTimeline.tsx", chronology);
  const chronologyOwner = declaration(chronologicalSource, "SessionTimeline");
  assert.equal(sha(chronologyOwner.body.statements.slice(0, -1)
    .map((node) => printed(node, chronologicalSource)).join("\n")),
  "65015fc5cca2e642089de211552e103962bfd7d901558d5871d9911e20704573");
  const disclosure = lf(restoreSessionIdentity(chronology));
  assert.equal(sha(disclosure), "8e3a62e00168f419e3b1e650b65bb908f029e4b46222653f4ed1e3de217859cb");
  const source = parse("SessionTimeline.tsx", disclosure), owner = declaration(source, "SessionTimeline");
  const calls = [];
  const visit = (node) => {
    if (ts.isCallExpression(node) && node.expression.getText(source) === "appendUniqueEvents") calls.push(node);
    ts.forEachChild(node, visit);
  };
  visit(owner); assert.equal(calls.length, 1);
  assert.equal(calls[0].getText(source), "appendUniqueEvents(all, page)");
  const old = disclosure.slice(0, calls[0].getStart(source)) + "all.push(...page)" + disclosure.slice(calls[0].end);
  const previous = parse("SessionTimeline.tsx", old);
  assert.equal(sha(printed(declaration(previous, "SessionTimeline"), previous)),
    "3abf4304969c30b370b7d15ef55afb64512aa1c2044ef012f122c55381274b3d");
});
