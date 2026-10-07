import { deskPreservation } from "./helpers/missionCommandDesk.mjs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readBuildVersion } from "../Frontend/buildVersion.mjs";
import { restoreChangesWorkbench, restoreChangesWorkbenchOracleAdapters,
  OLD_CHANGES_ROOT, NEW_CHANGES_ROOT, CHANGES_HEADING, CHANGES_COMMAND_DECK,
  CHANGES_WORKBENCH_ORACLE_ADAPTERS } from "./helpers/changesWorkbench.mjs";
import { restoreGitGraphBoundaryCopy } from "./helpers/gitGraphMergeSeed.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), ".."), frontend = resolve(root, "Frontend");
const require = createRequire(resolve(frontend, "package.json")), ts = require("typescript"), React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const read = name => readFileSync(resolve(root, name), "utf8");
const sha = value => createHash("sha256").update(value).digest("hex");
const lf = text => text.replace(/\r\n/g, "\n");
const parse = (text, name = "actual.tsx") => {
  const ast = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true,
    name.endsWith(".mjs") ? ts.ScriptKind.JS : ts.ScriptKind.TSX);
  assert.equal(ast.parseDiagnostics.length, 0, "complete valid actual source or negative fixture");
  return ast;
};
const all = node => {
  const found = [node];
  ts.forEachChild(node, child => { found.push(...all(child)); });
  return found;
};
const one = (nodes, predicate, label) => {
  const found = nodes.filter(predicate);
  assert.equal(found.length, 1, label);
  return found[0];
};
const owner = (ast, name) => one(ast.statements, node => ts.isFunctionDeclaration(node)
  ? node.name?.text === name : ts.isVariableStatement(node)
    && node.declarationList.declarations.some(item => item.name.getText(ast) === name), name);
const extract = (ast, name) => owner(ast, name).getText(ast).replace(/^export\s+/, "");
const replaceOnce = (text, before, after) => {
  assert.equal(text.split(before).length - 1, 1, "one intended physical fixture window");
  return text.replace(before, after);
};
const elements = tree => Array.isArray(tree) ? tree.flatMap(elements)
  : React.isValidElement(tree) ? [tree, ...elements(tree.props.children)] : [];
const textOf = tree => Array.isArray(tree) ? tree.map(textOf).join("")
  : React.isValidElement(tree) ? textOf(tree.props.children)
    : tree === null || tree === undefined || typeof tree === "boolean" ? "" : String(tree);
const compile = async text => {
  const code = ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
};
const appSource = read("Frontend/src/App.tsx"), app = parse(appSource), ui = parse(read("Frontend/src/ui.tsx"));
const ORIGINAL_APP_RAW = "f7d26377cb1311984c71316cbe9c390e1132c721017b3179d1491880b98aa15a";
const ORIGINAL_APP_LF = "3c4b3add33d1c08b682ed14812f8eed5dace5f36665ad0fca55fa2262d7d07c4";
const OLD_SUITE_PINS = {
  "test_history_graph_read_states.mjs": "bb911c4884ae52217b389d557b680dc67d141416753f47140ba18858263e2b40",
  "test_warning_timestamp_order.mjs": "819ebd0b6bb945051f9c3928018430abefb820c5e433b5d78c379c01e77929d4",
  "test_diff_availability.mjs": "505253a0ccd0172e9f4b0cb1dbfc1aab0ebb0b52194a6e7dade8d02e115d79b0",
  "test_git_graph_merge_seed.mjs": "6d658aca1de32f34d49cb5807099519615bf96399e01a94345f11358ecac0101",
};

test("two reviewed workbench windows retain the entire original App and ancestral graph copy in LF/CRLF", () => {
  for (const eol of ["\n", "\r\n"]) {
    const current = lf(deskPreservation("Frontend/src/App.tsx", appSource)).replace(/\n/g, eol), restored = restoreChangesWorkbench(current);
    assert.equal(sha(lf(restored)), ORIGINAL_APP_LF);
    if (eol === "\r\n") assert.equal(sha(restored), ORIGINAL_APP_RAW);
    const currentAst = parse(current), previousAst = parse(restored);
    const currentOwner = owner(currentAst, "ChangesView"), previousOwner = owner(previousAst, "ChangesView");
    assert.equal(restored.slice(0, previousOwner.getStart(previousAst)), current.slice(0, currentOwner.getStart(currentAst)));
    assert.equal(restored.slice(previousOwner.end), current.slice(currentOwner.end), "all non-owner bytes pass through");
    assert.equal(sha(lf(restoreGitGraphBoundaryCopy(restored))),
      "c75c8b8721ccd36259c6acf243717db91aad793f271d94ac954a4fc6f724a370");
  }
  assert.equal(sha(readFileSync(resolve(root, "Tests/helpers/gitGraphMergeSeed.mjs"))),
    "bb40508d5978cbc6975d8bf3dfe3da2be346ca62255ed9559629adf3d5f832ad");
});

test("workbench inverse rejects missing/duplicate/relocated/partial and changed-expression TSX fixtures", () => {
  const source = lf(deskPreservation("Frontend/src/App.tsx", appSource)), actualOwner = owner(parse(source), "ChangesView");
  const withoutDeck = replaceOnce(source, CHANGES_COMMAND_DECK + "\n", "");
  const variants = [
    replaceOnce(source, NEW_CHANGES_ROOT, OLD_CHANGES_ROOT), withoutDeck,
    replaceOnce(source, CHANGES_COMMAND_DECK, CHANGES_COMMAND_DECK + "\n" + CHANGES_COMMAND_DECK),
    replaceOnce(source, NEW_CHANGES_ROOT, NEW_CHANGES_ROOT.replace("needsPick.length > 0", "needsPick.length >= 0")),
    replaceOnce(source, NEW_CHANGES_ROOT, NEW_CHANGES_ROOT.replace("space-y-6", "space-y-5")),
    replaceOnce(source, NEW_CHANGES_ROOT, NEW_CHANGES_ROOT.replace(/>$/, ' data-other="extra">')),
    replaceOnce(source, CHANGES_COMMAND_DECK, CHANGES_COMMAND_DECK.replace("needsPick.length", "events.length")),
    replaceOnce(source, CHANGES_COMMAND_DECK, CHANGES_COMMAND_DECK.replace('groupMode === "folder"', 'groupMode === "task"')),
    replaceOnce(source, CHANGES_COMMAND_DECK, CHANGES_COMMAND_DECK.replace("Loaded uncommitted capture window", "All Git dirty files")),
    replaceOnce(source, CHANGES_COMMAND_DECK, CHANGES_COMMAND_DECK.replace("      <dl", "     <dl")),
    replaceOnce(source, CHANGES_HEADING, CHANGES_HEADING.replace('title="Changes"', 'title="Wrong heading"')),
    replaceOnce(withoutDeck, CHANGES_HEADING, CHANGES_COMMAND_DECK + "\n" + CHANGES_HEADING),
    replaceOnce(withoutDeck, "function ChangesView (", "function WrongChangesView (")
      + '\nfunction WrongOwner() { return (\n' + CHANGES_COMMAND_DECK + '\n); }\n',
    replaceOnce(source, "function ChangesView (", "function WrongChangesView ("),
    source + "\n" + actualOwner.getText(parse(source)) + "\n",
    source + "\n/*\n" + CHANGES_COMMAND_DECK + "\n*/\n",
  ];
  for (const value of variants) {
    parse(value);
    for (const eol of ["\n", "\r\n"]) assert.throws(() => restoreChangesWorkbench(value.replace(/\n/g, eol)), assert.AssertionError);
  }
  for (const value of ["\uFEFF" + source, source.replace("\n", "\r"), source.replace("\n", "\r\n"),
    source + "\nconst invalid = <;\n"]) assert.throws(() => restoreChangesWorkbench(value), assert.AssertionError);
});

test("workbench inverse preserves unrelated pre-render, owner and outside mutations visibly", () => {
  for (const [before, after] of [
    ["const needsPick = events.filter", "const needsPick = events.slice().filter"],
    ["Explore commit history and its linked captured events.", "Independent History sentinel."],
    ["function WarningsBanner (", "function IndependentWarningsBanner ("],
  ]) for (const eol of ["\n", "\r\n"]) {
    const source = lf(deskPreservation("Frontend/src/App.tsx", appSource)).replace(/\n/g, eol), modified = replaceOnce(source, before, after);
    parse(modified);
    const restored = restoreChangesWorkbench(modified);
    assert.equal(restored, replaceOnce(restoreChangesWorkbench(source), before, after));
    assert.notEqual(sha(lf(restored)), ORIGINAL_APP_LF);
  }
});

test("exact 2/6/3/4 adapters retain all complete original suites and the immutable Diff prefix", () => {
  assert.deepEqual(Object.values(CHANGES_WORKBENCH_ORACLE_ADAPTERS).map(windows => windows.length), [2, 6, 3, 4]);
  for (const [name, expected] of Object.entries(OLD_SUITE_PINS)) for (const eol of ["\n", "\r\n"]) {
    const source = lf(deskPreservation(`Tests/${name}`, read(`Tests/${name}`))).replace(/\n/g, eol);
    const restored = restoreChangesWorkbenchOracleAdapters(name, source);
    assert.equal(sha(lf(restored)), expected, "complete original suite, not a rebased owner fragment");
    assert.equal(restored.includes("\r\n"), eol === "\r\n");
  }
  const prefix = Buffer.from(lf(deskPreservation("Tests/test_diff_availability.mjs", read("Tests/test_diff_availability.mjs")))).subarray(0, 15449);
  assert.equal(sha(prefix), "83d4e95e949a912fdf73b708526f514ed5a73e7afcdd91b79fc4da6639a28bd5");
  assert.equal(prefix.toString("utf8").split("\n").length - 1, 311);
  assert.equal((prefix.toString("utf8").match(/^test\(/gm) ?? []).length, 6);
});

test("adapter inverses reject missing/duplicate/partial/comment sites and retain unrelated assertions", () => {
  for (const [name, expected] of Object.entries(OLD_SUITE_PINS)) {
    const source = lf(deskPreservation(`Tests/${name}`, read(`Tests/${name}`)));
    for (const { before, after, fn } of CHANGES_WORKBENCH_ORACLE_ADAPTERS[name]) {
      assert.ok(!after.includes("*/"));
      const variants = [replaceOnce(source, after, before), source + "\n/*\n" + after + "\n*/\n",
        replaceOnce(source, after, after.replace(/restoreChangesWorkbench(?:OracleAdapters)?/g, "wrongRestore"))];
      if (fn) variants.push(replaceOnce(source, after, before) + "\n/*\n" + after + "\n*/\n"
        + (fn === "restoreChangesWorkbench" ? "void restoreChangesWorkbench(null);\n"
          : 'void restoreChangesWorkbenchOracleAdapters("outside", "outside");\n'));
      for (const modified of variants) {
        parse(modified, name);
        for (const eol of ["\n", "\r\n"]) assert.throws(() => restoreChangesWorkbenchOracleAdapters(name,
          modified.replace(/\n/g, eol)), assert.AssertionError);
      }
    }
    const extraCall = source + "\nvoid restoreChangesWorkbench(null);\n";
    parse(extraCall, name);
    assert.throws(() => restoreChangesWorkbenchOracleAdapters(name, extraCall), assert.AssertionError);
    const sentinel = source + '\nassert.equal("unrelated assertion", "visible mutation");\n';
    const restored = restoreChangesWorkbenchOracleAdapters(name, sentinel);
    assert.ok(restored.endsWith('\nassert.equal("unrelated assertion", "visible mutation");\n'));
    assert.notEqual(sha(lf(restored)), expected);
    for (const value of ["\uFEFF" + source, source.replace("\n", "\r"), source.replace("\n", "\r\n"),
      source + "\nconst malformed = ;\n"]) assert.throws(() => restoreChangesWorkbenchOracleAdapters(name, value), assert.AssertionError);
  }
  assert.throws(() => restoreChangesWorkbenchOracleAdapters("not-reviewed.mjs", ""), assert.AssertionError);
});

// Finite hook cells execute actual current Changes and bounded-page owners.
// Effects here are pager reconciliation only, never DOM or native acceptance.
function hooks () {
  const cells = [], pending = [];
  let cursor = 0;
  const changed = (before, after) => !before || !after || before.length !== after.length
    || after.some((value, index) => !Object.is(value, before[index]));
  const h = {
    reset() { cursor = 0; },
    useState(initial) {
      const index = cursor++;
      cells[index] ??= { value: typeof initial === "function" ? initial() : initial };
      return [cells[index].value, value => { cells[index].value = typeof value === "function" ? value(cells[index].value) : value; }];
    },
    useRef(initial) { const index = cursor++; return cells[index] ??= { current: initial }; },
    useMemo(callback, deps) {
      const index = cursor++;
      if (changed(cells[index]?.deps, deps)) cells[index] = { deps, value: callback() };
      return cells[index].value;
    },
    useCallback(callback, deps) { return h.useMemo(() => callback, deps); },
    useEffect(callback, deps) {
      const index = cursor++;
      if (changed(cells[index]?.deps, deps)) { cells[index] = { deps }; pending.push(callback); }
    },
    flush() { for (const callback of pending.splice(0)) callback(); },
  };
  return h;
}
const { pagerSubject } = await compile(`export function pagerSubject(hooks, memory) {
  const {useState,useRef,useCallback,useEffect}=hooks;
  const BoundedPageMemoryContext={}, useContext=context=>{
    if(context!==BoundedPageMemoryContext) throw new Error("Only the finite pager context is supported");
    return memory;
  };
  ${["getBoundedPageWindow", "collectionIdentityKey", "useBoundedPage", "useRememberedBoundedPage"].map(name => extract(ui, name)).join("\n")}
  return {useRememberedBoundedPage};
}`);
const event = (id, extra = {}) => ({ id, repo_id: "EA", task_ref: "plan - A.1", file: `src/file_${id}.ts`,
  mode: "B", provider: "codex", session_id: "session-one", ts: "2026-10-01T08:00:00Z", tool: "Edit",
  branch: "develop", commit_hash: null, swept: 0, candidates_json: null, ...extra });
const noop = () => {};
const baseProps = () => ({ events: [], tasks: [], repos: [], effortByTask: new Map(), taskFilter: null,
  sessionFilter: null, groupMode: "task", scopeKeyValue: '["all"]',
  assignmentState: { selectedIds: [], bulkChoice: "", choices: {} },
  onClearFilter: noop, onClearSessionFilter: noop, onPicked: noop, onSessionClick: noop, onOpenTimeline: noop,
  onOpenFileStory: noop, onGroupModeChange: noop, onAssignmentStateChange: noop, onStatus: noop });
const freeze = value => {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};

test("raw current owners preserve loaded quantities, callbacks, complete models and shell identity", { timeout: 30_000 }, async t => {
  const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
  const vite = await createServer({ root: frontend, server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom", optimizeDeps: { noDiscovery: true, entries: [] } });
  try {
    const modules = await Promise.all(["ui.tsx", "theme.ts", "format.ts", "fileTree.ts", "mermaidGraph.ts",
      "dialog.tsx", "accessibleData.tsx", "dialogStatus.tsx", "icons.tsx"].map(name => vite.ssrLoadModule(`/src/${name}`)));
    const deps = Object.assign({}, ...modules);
    const names = ["PAGE", "tupleKey", "taskIdentity", "taskIdentityParts", "assignmentCandidates", "SWEPT_TIP", "swatch",
      "SessionDot", "ModeBadge", "EffortLine", "FilterChip", "ChangesView", "SectionNav", "FolderView", "FolderRepoCard",
      "TaskGroup", "PickSection", "PickRow", "EventRow", "DiffView", "VIEW_LABELS", "ViewNavigation"];
    const { createSubjects } = await compile(`export function createSubjects(React,deps,hooks=React) {
      const {useState,useRef,useMemo,useCallback,useEffect}=hooks;
      const {SectionHeading,ControlButton,CollectionPager,useBoundedPage,useRememberedBoundedPage,BoundedChoiceDialog,
        DisclosureTable,buildFileTree,MODE_BADGE,MODE_COLOR,SWEPT_COLOR,eventSessionIdentity,sameSessionIdentity,
        sessionIdentityKey,sessionColor,fmtMinutes,fmtTs,fmtRel,fmtAge,EFFORT_GAP_MAX_MIN,UNCOMMITTED_AGE_H}=deps;
      const useReveal=()=>{}, api={}, createActionDeadline=()=>{throw new Error("No mutation/network work in SSR fixtures");};
      const isAbortError=()=>false, flushSync=callback=>callback();
      ${names.map(name => extract(app, name)).join("\n")}
      return {ChangesView,SectionNav,TaskGroup,PickSection,FilterChip,ViewNavigation,taskIdentity};
    }`);
    const actual = createSubjects(React, deps);
    const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));
    const direct = initial => {
      const h = hooks(), memory = { pages: {}, setPage(key, page) { memory.pages[key] = page; } };
      const controls = createSubjects(React, { ...deps, ...pagerSubject(h, memory) }, h);
      let props = initial, tree;
      return { controls, memory, render(next = props) { props = next; h.reset(); tree = controls.ChangesView(props); h.flush(); return tree; },
        nodes() { return elements(tree); } };
    };
    const deck = tree => one(elements(tree), node => node.type === "dl" && node.props["aria-label"] === "Captured work summary", "actual summary dl");
    const assertDeck = (tree, values, folder = false) => {
      const metrics = React.Children.toArray(deck(tree).props.children);
      assert.equal(metrics.length, 3);
      assert.deepEqual(metrics.map(metric => textOf(metric.props.children[0])), ["Needs attribution", "Captured edits", "Task groups"]);
      assert.deepEqual(metrics.map(metric => metric.props.children[1].props.children[0]), values.map(value => value.toLocaleString()));
      assert.deepEqual(metrics.map(metric => textOf(metric.props.children[1].props.children[1])), [
        "Unfiltered captured edits requiring a task choice", "Loaded uncommitted capture window",
        folder ? "With saved task filters" : "In the current task filter",
      ]);
    };

    await t.test("accepted empty work shows three exact zeros, not bootstrap or Git cleanliness", async () => {
      const h = direct(baseProps()), tree = h.render(); assertDeck(tree, [0, 0, 0]);
      assert.equal(tree.props["data-has-picks"], false);
      const html = render(actual.ChangesView, baseProps());
      assert.match(html, /data-has-picks="false"/); assert.doesNotMatch(html, /id="sec-pick"/);
      const call = one(all(app), node => ts.isJsxSelfClosingElement(node) && node.tagName.getText(app) === "ChangesView", "actual Changes mount");
      let expression = call.parent;
      while (expression && !ts.isJsxExpression(expression)) expression = expression.parent;
      assert.ok(ts.isBinaryExpression(expression.expression));
      const { canMount } = await compile(`export const canMount=(membershipReady,workspaceReady,view)=>(${expression.expression.left.getText(app)});`);
      for (const member of [false, true]) for (const loaded of [false, true]) {
        assert.equal(canMount(member, loaded, "changes"), member && loaded);
        assert.equal(canMount(member, loaded, "history"), false);
      }
    });

    await t.test("mixed filters retain the unfiltered queue and complete captured count", () => {
      const callbacks = [], session = { provider: "codex", sessionId: "session-one" };
      const props = { ...baseProps(), sessionFilter: session, taskFilter: actual.taskIdentity("EA", "plan - A.1"),
        events: freeze([event(1, { mode: "UNKNOWN" }), event(2), event(3, { repo_id: "Other" }), event(4, { session_id: "other" })]),
        onClearFilter: () => callbacks.push("task"), onClearSessionFilter: () => callbacks.push("session"),
        onOpenTimeline: value => callbacks.push(value), onAssignmentStateChange: value => callbacks.push(value) };
      const before = JSON.stringify(props.events), h = direct(props), tree = h.render(); assertDeck(tree, [1, 4, 1]);
      assert.equal(tree.props["data-has-picks"], true);
      const pick = one(h.nodes(), node => node.type === h.controls.PickSection, "actual unfiltered PickSection");
      assert.deepEqual(pick.props.events, [props.events[0]]);
      assert.equal(pick.props.state, props.assignmentState);
      for (const [child, parent] of [["onStateChange", "onAssignmentStateChange"], ["onPicked", "onPicked"], ["onStatus", "onStatus"]]) {
        assert.equal(pick.props[child], props[parent]);
      }
      const group = one(h.nodes(), node => node.type === h.controls.TaskGroup, "one filtered actual task group");
      assert.deepEqual(group.props.group, [props.events[1]]);
      for (const name of ["onSessionClick", "onOpenFileStory", "onStatus"]) assert.equal(group.props[name], props[name]);
      for (const label of ["Clear task filter", "Session timeline", "Clear session filter"]) {
        one(h.nodes(), node => node.type === deps.ControlButton && node.props.children === label, label).props.onClick();
      }
      const choice = { selectedIds: [1], bulkChoice: "", choices: {} }; pick.props.onStateChange(choice);
      assert.deepEqual(callbacks, ["task", session, "session", choice]); assert.equal(callbacks[1], session);
      assert.equal(JSON.stringify(props.events), before, "frozen captured inputs remain exact");
      const html = render(actual.ChangesView, props);
      assert.ok(html.indexOf('id="sec-pick"') < html.indexOf('aria-label="Grouped uncommitted changes"'));
      assert.match(html, /file_1\.ts|file_2\.ts/); assert.doesNotMatch(html, /file_3\.ts|file_4\.ts/);
    });

    await t.test("folder mode honestly reports saved task groups while keeping all captured paths", () => {
      const props = { ...baseProps(), groupMode: "folder", taskFilter: actual.taskIdentity("EA", "missing - <task>"),
        sessionFilter: { provider: "codex", sessionId: "absent" },
        events: [event(1), event(2, { repo_id: "Other", mode: "AMBIGUOUS" })] };
      const tree = direct(props).render(); assertDeck(tree, [1, 2, 0], true);
      const html = render(actual.ChangesView, props);
      for (const token of ["With saved task filters", "saved for task grouping", "file_1.ts", "file_2.ts", "missing - &lt;task&gt;"]) {
        assert.ok(html.includes(token), token);
      }
    });

    await t.test("51 groups retain complete metrics, actual pager reconciliation and global section anchors", () => {
      const modes = [], props = { ...baseProps(), events: Array.from({ length: 51 }, (_, index) => event(index, { task_ref: `plan - T${index}` })),
        onGroupModeChange: value => modes.push(value) };
      const h = direct(props); assertDeck(h.render(), [0, 51, 51]);
      assert.equal(h.nodes().filter(node => node.type === h.controls.TaskGroup).length, 50);
      const pager = one(h.nodes(), node => node.type === deps.CollectionPager, "actual group pager");
      assert.deepEqual([pager.props.page.start, pager.props.page.end, pager.props.page.totalItems], [0, 50, 51]);
      const nav = one(h.nodes(), node => node.type === h.controls.SectionNav, "actual bounded section navigation");
      assert.equal(nav.props.items.length, 51); assert.equal(nav.props.items[50].id, "sec-g50");
      nav.props.onActivate(-1); assert.equal(h.memory.pages["changes-task-groups"], undefined);
      nav.props.onActivate(50); assert.equal(h.memory.pages["changes-task-groups"], 2);
      assertDeck(h.render(), [0, 51, 51]);
      assert.equal(h.nodes().filter(node => node.type === h.controls.TaskGroup).length, 1);
      assert.ok(h.nodes().some(node => node.props.id === "sec-g50"));
      const secondPager = one(h.nodes(), node => node.type === deps.CollectionPager, "actual second page");
      const previous = one(elements(secondPager.type.render(secondPager.props, null)),
        node => node.props["aria-label"] === "Change task groups: previous page", "actual native Previous control");
      previous.props.onClick(); assertDeck(h.render(), [0, 51, 51]);
      assert.equal(h.nodes().filter(node => node.type === h.controls.TaskGroup).length, 50);
      const section = one(h.nodes(), node => node.type === "section" && node.props["aria-label"] === "Grouped uncommitted changes", "grouped section");
      const heading = React.Children.toArray(section.props.children)[0];
      one(elements(heading.props.actions), node => node.type === h.controls.FilterChip && node.props.label === "by folder", "original folder callback").props.onClick();
      assert.deepEqual(modes, ["folder"]);
      const html = render(actual.ChangesView, props);
      assert.match(html, /51 task groups in the current filter/); assert.match(html, /Change task groups: next page/);
      assert.doesNotMatch(html, />src\/file_50\.ts</);
    });

    await t.test("special captured tokens are escaped and never enter static summary copy", () => {
      const props = { ...baseProps(), events: [event(1, { task_ref: '<script>task & "value"</script>', file: 'src/<img onerror="x">&.ts' }),
        event(2, { mode: "UNKNOWN", file: "queue/<script>bad</script>.ts" })] };
      assertDeck(direct(props).render(), [1, 2, 1]);
      const html = render(actual.ChangesView, props);
      assert.match(html, /&lt;script&gt;/); assert.match(html, /&lt;img/); assert.doesNotMatch(html, /<script>|<img onerror=/);
    });

    await t.test("real brand preserves complete product identity and the same explicit System action", async () => {
      const { ApplicationBrand } = await vite.ssrLoadModule("/src/ApplicationBrand.tsx");
      const { AppShell, AppShellNavigation, WorkspaceContext, ConnectionStatus } = await vite.ssrLoadModule("/src/AppShell.tsx");
      let calls = 0; const onSystem = () => calls++, brand = ApplicationBrand({ onSystem });
      assert.equal(brand.props.children.length, 2);
      const [heading, button] = brand.props.children;
      assert.equal(heading.type, "h1"); assert.equal(heading.props.children[0].props["aria-hidden"], "true");
      assert.equal(heading.props.children[0].props.children, "K");
      assert.equal(heading.props.children[1].props.children, "KATLAB Tracking Monitor");
      assert.equal(button.type, "button"); assert.equal(button.props.onClick, onSystem); button.props.onClick(); assert.equal(calls, 1);
      const version = readBuildVersion();
      assert.equal(button.props["aria-label"], `UI build v${version}. Open System health`);
      assert.equal(button.props.title, "Loaded UI build version. Open System health for server details.");
      const html = render(ApplicationBrand, { onSystem });
      assert.match(html, /KATLAB Tracking Monitor/); assert.ok(html.includes(`v${version}</button>`));
      assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
      const actions = React.createElement("button", null, "Commands"), context = React.createElement("span", null, "Scoped facts"),
        feedback = React.createElement("p", null, "Persistent feedback"), shell = AppShell({ actions, context, children: feedback, onSystem });
      assert.equal(shell.props.children[0].props.children[0].props.onSystem, onSystem);
      assert.equal(shell.props.children[0].props.children[1].props.children, actions);
      assert.equal(shell.props.children[1], context); assert.equal(shell.props.children[2], feedback);
      const nav = AppShellNavigation({ children: actions });
      assert.equal(nav.props["aria-label"], "Workspace navigation");
      assert.equal(nav.props.children[0].type, "p"); assert.equal(nav.props.children[0].props.children, "Workspace");
      assert.equal(nav.props.children[1], actions);
      const pending = render(WorkspaceContext, { scope: { kind: "all" }, repos: [], ready: false, error: "", violationOf: () => null, onDetails: noop });
      assert.match(pending, /Waiting for workspace snapshot/); assert.doesNotMatch(pending, /known statuses clean/);
      const retained = render(WorkspaceContext, { scope: { kind: "repo", id: "EA" }, repos: [{ id: "EA", offline: true,
        status_valid: true, clean: true, count: 999, branch: "<branch>", last_event_ts: null }], ready: true,
        error: "Refresh failed", violationOf: () => null, onDetails: noop });
      assert.match(retained, /Repository unavailable|Last-known branch/); assert.match(retained, /&lt;branch&gt;/);
      assert.doesNotMatch(retained, /999|known statuses clean/);
      assert.match(render(ConnectionStatus, { state: "connected" }), /not proof of fresh data or verification readiness/);
      const selected = [], navigation = actual.ViewNavigation({ view: "changes", membershipReady: false, onSelect: value => selected.push(value) });
      const buttons = elements(navigation).filter(node => node.type === "button");
      assert.deepEqual(buttons.map(node => node.props.children), ["Changes", "Mission", "Overview", "History", "City", "Chronicle"]);
      assert.deepEqual(buttons.map(node => node.props.disabled), [false, true, true, true, false, false]);
      assert.deepEqual(buttons.map(node => node.props["aria-current"]), ["page", undefined, undefined, undefined, undefined, undefined]);
      buttons.forEach(node => node.props.onClick()); assert.deepEqual(selected, ["changes", "mission", "overview", "history", "city", "chronicle"]);
    });
  } finally { await vite.close(); }
});

// Parse source declarations only. These contracts do not measure native layout,
// paint, focus, zoom, hit boxes, safe areas or assistive technology behavior.
test("raw CSS states bounded responsive workbench, identity and preserved interaction contracts", () => {
  const css = read("Frontend/src/index.css"), tree = require("postcss").parse(css);
  const rule = (selector, media = null) => {
    const found = []; tree.walkRules(node => {
      const actualMedia = node.parent.type === "atrule" && node.parent.name === "media" ? node.parent.params : null;
      if (node.selector === selector && actualMedia === media) found.push(node);
    });
    assert.equal(found.length, 1, `one actual ${selector} rule at ${media}`); return found[0];
  };
  const value = (node, prop) => {
    const declarations = node.nodes.filter(item => item.type === "decl" && item.prop === prop);
    assert.equal(declarations.length, 1, `one ${prop} declaration`); return declarations[0].value;
  };
  assert.equal(value(rule(":root"), "--ui-font-page"), "clamp(1.75rem, 1.4rem + 0.7vw, 2rem)");
  assert.equal(value(rule(".app-brand-title"), "font-size"), "clamp(1.375rem, 1.15rem + 0.4vw, 1.625rem)");
  assert.equal(value(rule(".app-brand-title > span:last-child"), "overflow-wrap"), "anywhere");
  assert.equal(value(rule(".app-version-badge"), "border-color"), "rgb(var(--ui-focus))");
  assert.equal(value(rule(".app-shell-navigation", "(min-width: 1280px)"), "width"), "14rem");
  assert.equal(value(rule(".app-brand", "(max-width: 767px)"), "flex-basis"), "100%");
  assert.equal(value(rule('.app-shell-navigation nav[aria-label="Primary views"] button'), "background-color"), "transparent");
  assert.equal(value(rule('.app-shell-navigation nav[aria-label="Primary views"] button[aria-current="page"]'), "border-left-color"), "rgb(var(--ui-focus))");
  assert.equal(value(rule(".changes-command-deck"), "grid-template-columns"), "minmax(0, 1fr)");
  assert.equal(value(rule(".changes-command-deck", "(min-width: 768px)"), "grid-template-columns"), "repeat(3, minmax(0, 1fr))");
  assert.equal(value(rule(".changes-command-metric"), "padding"), "1rem");
  assert.equal(value(rule(".changes-command-metric"), "border-radius"), "0.5rem");
  assert.equal(value(rule(".changes-command-metric dd"), "font-size"), "2rem");
  assert.equal(value(rule(".changes-command-metric dd"), "font-variant-numeric"), "tabular-nums");
  assert.equal(value(rule(".changes-command-description"), "overflow-wrap"), "anywhere");
  const selector = '.changes-workbench[data-has-picks="true"]', media = "(min-width: 1440px)";
  assert.equal(value(rule(selector, media), "grid-template-columns"), "minmax(0, 0.9fr) minmax(0, 1.6fr)");
  assert.equal(value(rule(selector, media), "gap"), "1.5rem");
  const children = rule(selector + " > :not([hidden])", media);
  assert.equal(value(children, "grid-column"), "1 / -1");
  for (const prop of ["margin-top", "margin-bottom"]) assert.equal(value(children, prop), "0");
  assert.equal(value(rule(selector + " > #sec-pick", media), "grid-column"), "1");
  assert.equal(value(rule(selector + ' > section[aria-label="Grouped uncommitted changes"]', media), "grid-column"), "2");
  assert.equal(value(rule(selector + " .changes-command-metric-action"), "border-left"), "3px solid rgb(var(--ui-warning))");
  tree.walkRules(node => {
    if (!node.selector.includes(".changes-")) return;
    for (const item of node.nodes.filter(item => item.type === "decl")) {
      assert.ok(!["height", "max-height", "order"].includes(item.prop), "no clipping, height or visual-order rewrite");
      if (item.prop === "position") assert.ok(!["fixed", "sticky"].includes(item.value));
      if (item.prop.startsWith("overflow")) assert.ok(!["hidden", "auto", "scroll"].includes(item.value));
    }
  });
  assert.match(css, /min-width: 24px;\s*min-height: 24px;/);
  const coarse = []; tree.walkRules(node => {
    if (node.parent.type === "atrule" && node.parent.params === "(pointer: coarse)"
      && node.selector.includes('button:not([aria-hidden="true"])')) coarse.push(node);
  });
  assert.equal(coarse.length, 1);
  for (const prop of ["min-width", "min-height"]) {
    assert.equal(value(coarse[0], prop), "44px");
    assert.equal(coarse[0].nodes.find(node => node.type === "decl" && node.prop === prop).important, true);
  }
  assert.match(css, /\.ui-control:focus-visible,\s*\.ui-focus-ring:focus-visible\s*{\s*@apply ring-2 ring-ui-focus ring-offset-2 ring-offset-ui-canvas;/);
  assert.match(css, /:focus-visible/); assert.match(css, /outline:[^;]*var\(--ui-focus\)/);
  assert.match(css, /--ui-safe-top: env\(safe-area-inset-top, 0px\)/);
  assert.equal((css.match(/@media \(prefers-reduced-motion: reduce\)/g) ?? []).length, 1);
  assert.match(css, /\.ui-disclosure-enter { animation: none; }/);
  assert.doesNotMatch(read("Frontend/src/ApplicationBrand.tsx"), /fetch\(|api\.|useEffect|setInterval|setTimeout/);
});
