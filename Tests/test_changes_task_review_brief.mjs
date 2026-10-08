import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { after, before, test } from "node:test";
import {
  CHANGES_BRIEF_SOURCES, CHANGES_BRIEF_SUITES, changesBriefPreservation,
  restoreChangesBriefSource, restoreChangesBriefSuite,
} from "./helpers/changesTaskReviewBrief.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const frontend = resolve(root, "Frontend"), require = createRequire(resolve(frontend, "package.json"));
const ts = require("typescript"), React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const read = path => readFileSync(resolve(root, path)), text = path => read(path).toString("utf8");
const lf = value => value.replace(/\r\n/g, "\n"), sha = value => createHash("sha256").update(value).digest("hex");
const APP = "Frontend/src/App.tsx";
const APP_RAW = "b3eb7b7b98c43c065a8f69ef45954b4a69fb90193bbfb3106267c43c7eeecd32";
const APP_LF = "5e10505ce20a1a5700ac5db660b6c8de6094d6eb7433ea12c56ccf77a031e8f6";
const OLD_APP_RAW = "78301b274f2232953002a191ea2e8ff6afdb53f28e0daa6f1fea6846c57632a4";
const OLD_APP_LF = "f69bd31b8e8f1815205e9113cb44310f9fe42b7279d71de34974c82cee4d7949";
const HELPER_RAW = "f1bd072ed09901f0231c091d27284ced8e1b00311a298521835984a1ad803b87";
const TABLE_SHA = "bbb4318db410b0fa91082ec40e2123f5ddb835999e8a48ef880fd88ca35f9c1d";
const WINDOWS = [{"name":"resolvedTaskTitleCaller","count":1,"before":"                    why={task?.why} repos={repos}\n","after":"                    taskTitle={task?.title} why={task?.why} repos={repos}\n"},{"name":"optionalTaskTitleSignature","count":1,"before":"function TaskGroup ({ refLabel, repoId, group, why, repos, planFileSet, onSessionClick,\n  onOpenFileStory, effort, scopeKeyValue, groupIdentity, onStatus }:\n  { refLabel: string; repoId: string; group: TrackedEvent[]; why?: string;\n","after":"function TaskGroup ({ refLabel, taskTitle, repoId, group, why, repos, planFileSet, onSessionClick,\n  onOpenFileStory, effort, scopeKeyValue, groupIdentity, onStatus }:\n  { refLabel: string; taskTitle?: string; repoId: string; group: TrackedEvent[]; why?: string;\n"},{"name":"pureTaskTitleValidity","count":1,"before":"  const planEditPager = useBoundedPage({\n    identity: [\"changes-plan-events\", scopeKeyValue, groupIdentity],\n    totalItems: planEdits.length,\n    pageSize: 50,\n  });\n  return (\n","after":"  const planEditPager = useBoundedPage({\n    identity: [\"changes-plan-events\", scopeKeyValue, groupIdentity],\n    totalItems: planEdits.length,\n    pageSize: 50,\n  });\n  const hasTaskTitle = typeof taskTitle === \"string\" && taskTitle.trim().length > 0;\n  return (\n"},{"name":"titleFirstTaskBriefHeader","count":1,"before":"      <div className=\"flex min-w-0 flex-wrap items-baseline gap-2\">\n        {/* F48: task-ref link \"<plan filename> - <task id>\" */}\n        <h4 className=\"min-w-0 break-all font-mono text-base font-semibold text-sky-300\">{refLabel}</h4>\n        <span className=\"text-xs text-slate-400\">{repoId}</span>\n        <EffortLine effort={effort} /> {/* v0.1.6.0 D1 (C.1) */}\n      </div>\n","after":"      <div data-task-review-brief=\"true\" className=\"min-w-0\">\n        <h4 className={`min-w-0 break-words text-base font-semibold text-ui-text [overflow-wrap:anywhere]${hasTaskTitle ? \"\" : \" font-mono\"}`}>\n          {hasTaskTitle ? taskTitle : refLabel}\n        </h4>\n        <div className=\"mt-1 flex min-w-0 flex-wrap items-baseline gap-2\">\n          {hasTaskTitle && (\n            <span className=\"min-w-0 break-all font-mono text-xs text-slate-400\">{refLabel}</span>\n          )}\n          <span className=\"text-xs text-slate-400\">{repoId}</span>\n          <EffortLine effort={effort} /> {/* v0.1.6.0 D1 (C.1) */}\n        </div>\n      </div>\n"}];
const PINS = [{"path":"Frontend/src/ui.tsx","RAW":"b5650b9e2a3529ff1ca033ed077d7b806f0cc9341c9733b4b3a52c107ab99974","LF":"e1c2ad05398cf771ee17ba576b7feecf03829459379b9e02e35c58aea5004c46"},{"path":"Frontend/src/api.ts","RAW":"b21da4367bb2c9007a62b9ed097fd943286ffb3c863de23ee565acd01b2323a0","LF":"2bdccf5c79ccf5a72f9696df00a924ff918a82c6cf8e4f15ba2a69b39e7cd2b8"},{"path":"Frontend/src/format.ts","RAW":"4c7f1cb040c38a5ef75787c6f7325db6fc162a6890df0fb693e916aa62d8c87f","LF":"4c7f1cb040c38a5ef75787c6f7325db6fc162a6890df0fb693e916aa62d8c87f"},{"path":"Frontend/src/index.css","RAW":"9371bc04cba0b62e8a8e5e3b4a9251deea9273be58f4b9735982e0649527ba81","LF":"788436e9def1e7109fe98d4bfa5e0add49a5f0ca301b17416279c03f18ede0f5"},{"path":"Frontend/index.html","RAW":"6343d1cbd11dc51b748036743f659eff9898039de81010427928a3e7a56c22af","LF":"6343d1cbd11dc51b748036743f659eff9898039de81010427928a3e7a56c22af"},{"path":"Frontend/src/AppShell.tsx","RAW":"c9be3c135a7744fc647d4b7f5d98755144413dc62f743d6236e5055b5b4468c7","LF":"cb94119e2390f9120a43ca8d2689a83232cee1349b979ead049792b350e66176"},{"path":"Frontend/package.json","RAW":"b131be7e90ba2500b01371e594e10c482b94cf651ab425ddf7efaea76b759b9d","LF":"541a787d69fa512a53de01b53240e2e94ac22f068da882e0c2496f68ee5bf1a1"},{"path":"Frontend/package-lock.json","RAW":"0c39bf19779991e4565e00845a061fc954afdfe988d9026c6c356957e2b02258","LF":"d5ccfda11d2d07b4a707b18aca87b866a135182a3bd33ce2380c21730809ce75"},{"path":"Frontend/tsconfig.json","RAW":"97997252d286ecf7a8a4b12a51ac2fdd9199f3b9bf5e14e8d4f7d4e5e60d3f3f","LF":"97997252d286ecf7a8a4b12a51ac2fdd9199f3b9bf5e14e8d4f7d4e5e60d3f3f"},{"path":"Frontend/vite.config.ts","RAW":"6f25836874cc3ca4c97781dd0140ab1e7fee796b3b0c67a67ffdb8600e67cd6b","LF":"4631f5c7380fa909b5b361bf8eb7fdac29a665144ca260f9ac30be30ce83f107"},{"path":"Backend/requirements.txt","RAW":"f750d19859ca5621eea836592d2038857f73e8857bcace96752ce6dadf004ea3","LF":"f24979c56dd6d095f18541462485fb62229cfddf0fa8784d7c7dd9fbb535d0b5"},{"path":"Scripts/Chronicle/requirements.txt","RAW":"9d91436f670aac600f39beb184f7278774dc94e470dfca37f092bb0e3d461722","LF":"562f66ed699de7d73e464c6be1a0938b6b19a8c2f69fe4b955209f0981986a2d"}];
const records = [...CHANGES_BRIEF_SOURCES, ...CHANGES_BRIEF_SUITES];
const appText = text(APP), uiText = text("Frontend/src/ui.tsx");
function parse(name, value) {
  const ast = ts.createSourceFile(name, value, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  assert.equal(ast.parseDiagnostics.length, 0, name); return ast;
}
const app = parse(APP, appText), uiAst = parse("ui.tsx", uiText);
function nodes(root) { const out = []; const visit = node => { out.push(node); ts.forEachChild(node, visit); }; visit(root); return out; }
function one(values, predicate, label) { const hit = values.filter(predicate); assert.equal(hit.length, 1, label); return hit[0]; }
function declaration(ast, name) {
  return one(ast.statements, node => ts.isFunctionDeclaration(node) && node.name?.text === name
    || ts.isVariableStatement(node) && node.declarationList.declarations.some(item => item.name.getText(ast) === name), name);
}
const group = declaration(app, "TaskGroup"), changes = declaration(app, "ChangesView");
function extract(ast, name) { return declaration(ast, name).getText(ast).replace(/^export\s+/, ""); }
const elements = value => Array.isArray(value) ? value.flatMap(elements)
  : React.isValidElement(value) ? [value, ...elements(value.props.children)] : [];
const textOf = value => Array.isArray(value) ? value.map(textOf).join("")
  : React.isValidElement(value) ? textOf(value.props.children)
  : typeof value === "string" || typeof value === "number" ? String(value) : "";
const deepFreeze = value => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze); Object.freeze(value);
  }
  return value;
};
const attr = (node, name) => one([...node.attributes.properties], item => ts.isJsxAttribute(item) && item.name.getText() === name, name).initializer;
async function compile(source) {
  const result = ts.transpileModule(source, { reportDiagnostics: true, compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React,
  } });
  assert.ok(!(result.diagnostics ?? []).some(item => item.category === ts.DiagnosticCategory.Error));
  return import("data:text/javascript;base64," + Buffer.from(result.outputText).toString("base64"));
}
// Finite hooks exercise actual current calculations; no native effects or browser certification.
function hooks() {
  const cells = [], effects = []; let cursor = 0;
  const changed = (a, b) => !a || !b || a.length !== b.length || b.some((value, i) => !Object.is(value, a[i]));
  const h = {
    reset() { cursor = 0; },
    useState(initial) {
      const index = cursor++; cells[index] ??= { value: typeof initial === "function" ? initial() : initial };
      return [cells[index].value, value => { cells[index].value = typeof value === "function" ? value(cells[index].value) : value; }];
    },
    useRef(initial) { const index = cursor++; return cells[index] ??= { current: initial }; },
    useMemo(callback, dependencies) {
      const index = cursor++; if (changed(cells[index]?.dependencies, dependencies)) cells[index] = { dependencies, value: callback() };
      return cells[index].value;
    },
    useCallback(callback, dependencies) { return h.useMemo(() => callback, dependencies); },
    useEffect(callback, dependencies) {
      const index = cursor++; if (changed(cells[index]?.dependencies, dependencies)) { cells[index] = { dependencies }; effects.push(callback); }
    },
    flush() { for (const callback of effects.splice(0)) callback(); },
  }; return h;
}
const noop = () => {};
const event = (id, extra = {}) => deepFreeze({
  id, repo_id: "EA", task_ref: "plan - A.1", file: "src/file_" + id + ".ts",
  mode: "B", provider: "codex", session_id: "same", ts: "2026-10-08T04:00:00Z",
  tool: "Edit", branch: "main", commit_hash: null, swept: 0, candidates_json: null, ...extra,
});
const task = (repo, ref, title) => deepFreeze({
  repo, task_ref: ref, title, plan_file: "temp/Plan/PLAN_" + repo + ".txt",
  task_id: "A.1", status: "in-progress", files: [], why: "Preserve evidence", last_event_ts: null,
});
const baseChanges = () => ({
  events: [], tasks: [], repos: [], effortByTask: new Map(), taskFilter: null, sessionFilter: null,
  groupMode: "task", scopeKeyValue: '["all"]', assignmentState: { selectedIds: [], bulkChoice: "", choices: {} },
  onClearFilter: noop, onClearSessionFilter: noop, onPicked: noop, onSessionClick: noop,
  onOpenTimeline: noop, onOpenFileStory: noop, onGroupModeChange: noop,
  onAssignmentStateChange: noop, onStatus: noop,
});
const baseGroup = () => ({
  refLabel: "plan - A.1", repoId: "EA", group: [], repos: [], scopeKeyValue: '["all"]',
  groupIdentity: '["EA","plan - A.1"]', onStatus: noop,
});
let vite, dependencies, createSubjects, pagerSubject, actual;
before(async () => {
  const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
  vite = await createServer({ root: frontend, logLevel: "silent", appType: "custom",
    server: { middlewareMode: true, hmr: false, ws: false }, optimizeDeps: { noDiscovery: true, entries: [] } });
  dependencies = Object.assign({}, ...await Promise.all(["ui.tsx", "theme.ts", "format.ts"]
    .map(name => vite.ssrLoadModule("/src/" + name))));
  // EventRow/Folder/Pick/SectionNav are explicit controlled leaves. Their full current owners remain outside the four-window change.
  ({ createSubjects } = await compile([
    "export function createSubjects(React,deps,hooks=React){",
    "const {useState,useMemo}=hooks;",
    "const {SectionHeading,ControlButton,CollectionPager,useBoundedPage,useRememberedBoundedPage,",
    "eventSessionIdentity,sameSessionIdentity,sessionIdentityKey,sessionColor,fmtMinutes,fmtRel}=deps;",
    "const useReveal=()=>{},flushSync=callback=>callback();",
    'const EventRow=props=>React.createElement("div",{"data-controlled-event":props.event.id},props.event.file);',
    "const FolderView=()=>null,PickSection=()=>null,SectionNav=()=>null;",
    ...["tupleKey","taskIdentity","taskIdentityParts","EffortLine","FilterChip","ChangesView","TaskGroup"].map(name => extract(app, name)),
    "return {ChangesView,TaskGroup,EffortLine,FilterChip,EventRow,FolderView,PickSection,SectionNav,taskIdentity};}",
  ].join("\n")));
  ({ pagerSubject } = await compile([
    "export function pagerSubject(hooks,memory){const {useState,useRef,useCallback,useEffect}=hooks;",
    "const BoundedPageMemoryContext={},useContext=()=>memory;",
    ...["getBoundedPageWindow","collectionIdentityKey","useBoundedPage","useRememberedBoundedPage"].map(name => extract(uiAst, name)),
    "return {useBoundedPage,useRememberedBoundedPage};}",
  ].join("\n")));
  actual = createSubjects(React, dependencies);
}, { timeout: 30_000 });
after(async () => { await vite?.close(); });
function controlled(name, props) {
  const h = hooks(), memory = { pages: {}, setPage(key, page) { memory.pages[key] = page; } };
  const subjects = createSubjects(React, { ...dependencies, ...pagerSubject(h, memory) }, h);
  let tree, current = props;
  return { subjects, memory, render(next = current) { current = next; h.reset(); tree = subjects[name](current); h.flush(); return tree; },
    nodes() { return elements(tree); } };
}
function brief(tree) {
  const header = one(elements(tree), node => node.props["data-task-review-brief"] === "true", "one actual brief header");
  const children = React.Children.toArray(header.props.children);
  assert.equal(children.length, 2); assert.equal(children[0].type, "h4"); assert.equal(children[1].type, "div");
  return { header, heading: children[0], metadata: children[1], items: React.Children.toArray(children[1].props.children) };
}
const renderGroup = props => renderToStaticMarkup(React.createElement(actual.TaskGroup, props));

test("four exact source windows and independent table retain all old native/LF bytes", () => {
  assert.equal(sha(read(APP)), APP_RAW); assert.equal(read(APP).length, 237562); assert.equal(sha(lf(appText)), APP_LF);
  assert.equal(sha(read("Tests/helpers/changesTaskReviewBrief.mjs")), HELPER_RAW);
  assert.equal(sha(JSON.stringify([CHANGES_BRIEF_SOURCES, CHANGES_BRIEF_SUITES])), TABLE_SHA);
  assert.equal(CHANGES_BRIEF_SOURCES.length, 1); assert.equal(CHANGES_BRIEF_SUITES.length, 31);
  assert.equal(CHANGES_BRIEF_SUITES.reduce((sum, record) => sum + record.windows.length, 0), 102);
  assert.deepEqual(CHANGES_BRIEF_SOURCES[0].windows, WINDOWS);
  for (const record of records) {
    const raw = read(record.path), current = lf(raw.toString("utf8"));
    assert.equal(sha(raw), record.after.RAW); assert.equal(raw.length, record.after.bytes);
    const restore = record.path === APP ? restoreChangesBriefSource : restoreChangesBriefSuite;
    let independent = current;
    for (const window of [...record.windows].reverse()) {
      assert.equal(independent.split(window.after).length - 1, window.count);
      independent = independent.split(window.after).join(window.before);
    }
    for (const input of [current, current.replace(/\n/g, "\r\n"), Buffer.from(current), Buffer.from(current.replace(/\n/g, "\r\n"))]) {
      const restored = restore(record.path, input), normalized = lf(restored.toString());
      assert.equal(Buffer.isBuffer(restored), Buffer.isBuffer(input));
      assert.equal(normalized, independent); assert.equal(sha(normalized), record.before.LF);
      const native = record.before.nativeEOL === "CRLF" ? normalized.replace(/\n/g, "\r\n") : normalized;
      assert.equal(sha(native), record.before.RAW); assert.equal(Buffer.byteLength(native), record.before.bytes);
      assert.deepEqual(changesBriefPreservation(record.path, input), restored);
    }
  }
  assert.equal(CHANGES_BRIEF_SOURCES[0].before.RAW, OLD_APP_RAW);
  assert.equal(CHANGES_BRIEF_SOURCES[0].before.LF, OLD_APP_LF);
  // Restored source is preservation DATA. No historical implementation is compiled or executed.
  for (const pin of PINS) { assert.equal(sha(read(pin.path)), pin.RAW); assert.equal(sha(lf(text(pin.path))), pin.LF); }
});

test("strict current-input inverse rejects missing, moved, changed and outside bytes", () => {
  for (const record of records) {
    const current = lf(text(record.path)), restore = record.path === APP ? restoreChangesBriefSource : restoreChangesBriefSuite;
    const bad = ["// outside approved windows\n" + current, current + "\n", current.slice(0,-1), "\uFEFF" + current,
      current + "\0", current.replace("\n","\r"), current.replace("\n","\r\n"), current.replace("\n"," \n"),
      Buffer.concat([Buffer.from(current),Buffer.from([0xff])])];
    for (const window of record.windows) bad.push(current.replace(window.after, window.before),
      current.replace(window.after, window.after + window.after), current.replace(window.after, "// relocated\n" + window.after));
    for (const input of bad) assert.throws(() => restore(record.path, input), record.path);
    assert.throws(() => restore(record.path, changesBriefPreservation(record.path, current)));
  }
  assert.throws(() => restoreChangesBriefSource(APP, appText.replace('typeof taskTitle === "string"', "true")));
  assert.throws(() => restoreChangesBriefSource(APP, appText.replace('taskTitle={task?.title}', 'taskTitle={ref}')));
  assert.throws(() => restoreChangesBriefSource("../App.tsx", appText));
  const untouched = Buffer.from("unchanged unrelated input\n");
  assert.equal(changesBriefPreservation("Hook/provider_adapters.py", untouched), untouched);
});

test("actual current AST preserves caller identity, rank, direct Why and event/control owners", () => {
  const caller = one(nodes(changes), node => ts.isJsxSelfClosingElement(node) && node.tagName.getText(app) === "TaskGroup", "sole current caller");
  assert.equal(attr(caller, "taskTitle").getText(app), "{task?.title}");
  assert.equal(attr(caller, "why").getText(app), "{task?.why}");
  assert.equal(attr(caller, "groupIdentity").getText(app), "{key}");
  const header = one(nodes(group), node => ts.isJsxElement(node) && node.openingElement.attributes.properties.some(item =>
    ts.isJsxAttribute(item) && item.name.getText(app) === "data-task-review-brief"), "header current owner");
  const heading = one(nodes(header), node => ts.isJsxElement(node) && node.openingElement.tagName.getText(app) === "h4", "unchanged heading rank");
  assert.ok(heading.getText(app).includes("{hasTaskTitle ? taskTitle : refLabel}"));
  const valid = one(nodes(group), node => ts.isVariableDeclaration(node) && node.name.getText(app) === "hasTaskTitle", "pure title guard");
  assert.equal(valid.initializer.getText(app), 'typeof taskTitle === "string" && taskTitle.trim().length > 0');
  const rootReturn = one(group.body.statements, ts.isReturnStatement, "one final task return");
  const rootElement = rootReturn.expression.expression ?? rootReturn.expression;
  assert.ok(ts.isJsxElement(rootElement));
  const directChildren = rootElement.children.filter(node => !ts.isJsxText(node));
  assert.ok(directChildren.some(node => node.getText(app) === '{why && <p className="mt-1 text-xs text-slate-400">Why: {why}</p>}'));
  assert.ok(directChildren.some(node => ts.isJsxElement(node) && attr(node.openingElement, "className").text === "mt-4"));
  const eventCalls = nodes(group).filter(node => ts.isJsxSelfClosingElement(node) && node.tagName.getText(app) === "EventRow");
  assert.equal(eventCalls.length, 2);
  for (const row of eventCalls) {
    assert.equal(attr(row, "key").getText(app), "{e.id}");
    assert.equal(attr(row, "onSessionClick").getText(app), "{onSessionClick}");
    assert.equal(attr(row, "onOpenFileStory").getText(app), "{onOpenFileStory}");
    assert.equal(attr(row, "onStatus").getText(app), "{onStatus}");
  }
  assert.ok(eventCalls[0].attributes.properties.some(item => item.name?.getText(app) === "reviewLedger"));
  assert.ok(!eventCalls[1].attributes.properties.some(item => item.name?.getText(app) === "reviewLedger"));
});

test("valid titles preserve raw values, equal-reference identity, escaping and full wrapping", () => {
  const values = ["Human work title", "  raw title with outer spaces  ", "plan - A.1",
    '<title & "evidence">', "very-long-" + "X".repeat(4096)];
  for (const title of values) {
    const props = deepFreeze({ ...baseGroup(), taskTitle: title, why: '<reason & "keep">',
      effort: { minutes: 15, sessions: 2 } });
    const snapshot = JSON.stringify(props), h = controlled("TaskGroup", props), result = brief(h.render());
    assert.equal(textOf(result.heading), title); assert.ok(!result.heading.props.className.split(/\s+/).includes("font-mono"));
    assert.equal(textOf(result.items[0]), props.refLabel); assert.match(result.items[0].props.className, /font-mono/);
    assert.equal(textOf(result.items[1]), props.repoId); assert.equal(result.items[1].props.className, "text-xs text-slate-400");
    assert.equal(result.items[2].type.name, "EffortLine"); assert.equal(result.items[2].props.effort, props.effort);
    const html = renderGroup(props);
    assert.match(html, /<h4[^>]*>/); assert.ok(!/<h[12356]\b/.test(html));
    assert.match(html, /Why: &lt;reason &amp; &quot;keep&quot;&gt;/);
    assert.match(html, /15m/); assert.match(html, /2 sessions/);
    assert.equal(JSON.stringify(props), snapshot);
    if (title === props.refLabel) assert.equal((html.match(/plan - A\.1/g) ?? []).length, 2);
    if (title.includes("<")) assert.match(html, /&lt;title &amp; &quot;evidence&quot;&gt;/);
    if (title.length > 4096) assert.ok(html.includes(title));
    assert.match(result.heading.props.className, /break-words/);
    assert.ok(result.heading.props.className.includes("[overflow-wrap:anywhere]"));
    assert.doesNotMatch(html, /truncate|line-clamp|dangerouslySetInnerHTML/);
  }
});

test("missing, empty, blank and defensively invalid titles use only the full-reference heading", () => {
  for (const title of [undefined,null,""," \t\n ","\u00A0",false,0,{},[]]) {
    const props = { ...baseGroup(), refLabel: '<full & "reference">' + "R".repeat(1024), taskTitle: title };
    const result = brief(controlled("TaskGroup", props).render());
    assert.equal(textOf(result.heading), props.refLabel); assert.match(result.heading.props.className, /font-mono/);
    assert.equal(result.items.length, 3, "repository, original EffortLine and preserved JSX space");
    assert.equal(result.items[1].type.name, "EffortLine");
    assert.equal(result.items[2], " ", "original trailing-comment JSX space");
    assert.equal(textOf(result.items[0]), "EA");
    const html = renderGroup(props); assert.ok(!html.includes("[object Object]"));
    assert.match(html, /&lt;full &amp; &quot;reference&quot;&gt;/);
    assert.equal((html.match(/&lt;full &amp; &quot;reference&quot;&gt;/g) ?? []).length, 1);
  }
});

test("resolved task titles remain repository-qualified and update without changing identity", () => {
  const ref = "shared - A.1", rows = deepFreeze([event(1,{task_ref:ref}),event(2,{repo_id:"UM",task_ref:ref})]);
  const titles = [task("EA",ref,"EA work"),task("UM",ref,"UM work")];
  const props = { ...baseChanges(), events: rows, tasks: deepFreeze(titles) }, h = controlled("ChangesView", props);
  h.render();
  const groups = () => h.nodes().filter(node => node.type === h.subjects.TaskGroup);
  assert.deepEqual(groups().map(node => [node.props.repoId,node.props.taskTitle,node.props.refLabel]),
    [["EA","EA work",ref],["UM","UM work",ref]]);
  const identities = groups().map(node => node.props.groupIdentity);
  h.render({ ...props, tasks: deepFreeze([task("EA",ref,"Updated EA work"),titles[1]]) });
  assert.equal(groups()[0].props.taskTitle, "Updated EA work");
  assert.deepEqual(groups().map(node => node.props.groupIdentity), identities);
  h.render({ ...props, tasks: [] }); assert.ok(groups().every(node => node.props.taskTitle === undefined));
  h.render({ ...props, taskFilter: h.subjects.taskIdentity("UM",ref) });
  assert.equal(groups().length, 1); assert.equal(groups()[0].props.taskTitle, "UM work");
  h.render({ ...props, groupMode: "folder" }); assert.equal(groups().length, 0);
  assert.equal(one(h.nodes(), node => node.type === h.subjects.FolderView, "unchanged folder").props.events, rows);
  assert.deepEqual(rows.map(row => row.id), [1,2]);
});

test("actual group and plan-edit paging, callbacks and state survive title-only updates", () => {
  const calls = [], groupRows = deepFreeze([
    ...Array.from({length:51},(_,i)=>event(i+1)),
    ...Array.from({length:51},(_,i)=>event(i+100,{file:"temp/Plan/PLAN_EA.txt"})),
  ]);
  const props = { ...baseGroup(), taskTitle: "Review work", group: groupRows,
    planFileSet: new Set(["temp/Plan/PLAN_EA.txt"]),
    onSessionClick: value => calls.push(["session",value]),
    onOpenFileStory: (repo,file) => calls.push(["story",repo,file]), onStatus: value => calls.push(["status",value]) };
  const h = controlled("TaskGroup",props), rows = () => h.nodes().filter(node => node.type === h.subjects.EventRow);
  h.render(); assert.equal(rows().length, 50); assert.equal(rows()[0].props.event, groupRows[0]);
  const toggle = () => one(h.nodes(), node => node.type === "button" && "aria-expanded" in node.props, "original disclosure");
  assert.equal(toggle().props["aria-expanded"],false); toggle().props.onClick(); h.render(); assert.equal(rows().length,100);
  const pager = suffix => one(h.nodes(),node => node.type === dependencies.CollectionPager && node.props.collectionLabel.endsWith(suffix),"actual "+suffix);
  pager("plan-file edits").props.onPageChange(2); h.render(); assert.equal(rows().length,51);
  pager(" events").props.onPageChange(2); h.render(); assert.equal(rows().length,2);
  const normal = rows()[0]; assert.equal(normal.props.event.id,51); assert.equal(normal.props.reviewLedger,true);
  assert.equal(rows()[1].props.event.id,150); assert.equal(rows()[1].props.reviewLedger,undefined);
  const session = {provider:"codex",sessionId:"full-session"};
  normal.props.onSessionClick(session); normal.props.onOpenFileStory("EA",normal.props.event.file); normal.props.onStatus("Existing status");
  assert.deepEqual(calls,[["session",session],["story","EA","src/file_51.ts"],["status","Existing status"]]);
  h.render({...props,taskTitle:"Updated title"}); assert.equal(rows().length,2); assert.equal(toggle().props["aria-expanded"],true);
  assert.equal(textOf(brief(h.render({...props,taskTitle:"Updated title"})).heading),"Updated title");
  for (const count of [0,49,50,51]) {
    const own = controlled("TaskGroup",{...baseGroup(),taskTitle:"Bounded",group:deepFreeze(Array.from({length:count},(_,i)=>event(i+1)))});
    own.render(); assert.equal(own.nodes().filter(node=>node.type===own.subjects.EventRow).length,Math.min(count,50));
    assert.equal(own.nodes().filter(node=>node.type===dependencies.CollectionPager).length,count>50?1:0);
  }
  const many = {...baseChanges(),events:deepFreeze(Array.from({length:51},(_,i)=>event(i+1,{task_ref:"task-"+i}))),
    tasks:deepFreeze(Array.from({length:51},(_,i)=>task("EA","task-"+i,"Title "+i)))};
  const view=controlled("ChangesView",many);view.render();
  assert.equal(view.nodes().filter(node=>node.type===view.subjects.TaskGroup).length,50);
  one(view.nodes(),node=>node.type===dependencies.CollectionPager&&node.props.collectionLabel==="Change task groups","group page").props.onPageChange(2);view.render();
  const last=one(view.nodes(),node=>node.type===view.subjects.TaskGroup,"last group");
  assert.equal(last.props.taskTitle,"Title 50");assert.ok(view.nodes().some(node=>node.props.id==="sec-g50"));
});

test("header uses only existing utility tokens and adds no control or side-effect owner", () => {
  const header=one(nodes(group),node=>ts.isJsxElement(node)&&node.openingElement.attributes.properties.some(item=>
    ts.isJsxAttribute(item)&&item.name.getText(app)==="data-task-review-brief"),"one header");
  assert.ok(!nodes(header).some(node=>ts.isCallExpression(node)||ts.isJsxElement(node)&&["button","input","select","textarea","a"].includes(node.openingElement.tagName.getText(app))));
  const old=changesBriefPreservation(APP,appText);
  for(const token of ["min-w-0","break-words","text-base","font-semibold","text-ui-text","[overflow-wrap:anywhere]",
    "font-mono","mt-1","flex","flex-wrap","items-baseline","gap-2","break-all","text-xs","text-slate-400"])
    assert.ok(old.includes(token),"existing source token "+token);
  assert.ok(!WINDOWS.some(window=>/useEffect|setTimeout|localStorage|sessionStorage|fetch\s*\(/.test(window.after)));
  // Token inventory is not emitted CSS/native acceptance; formal compiled23 and full-byte CSS gates own that proof.
});
