import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { canonicalPrintedText } from "./helpers/printed_source.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const frontend = resolve(root, "Frontend");
const require = createRequire(resolve(frontend, "package.json"));
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const read = (name) => readFileSync(resolve(frontend, "src", name), "utf8");
const parse = (name) => ts.createSourceFile(name, read(name), ts.ScriptTarget.Latest, true);
const app = parse("App.tsx");
const declaration = (ast, name) => {
  const node = ast.statements.find((entry) =>
    ts.isFunctionDeclaration(entry) && entry.name?.text === name
    || ts.isVariableStatement(entry)
      && entry.declarationList.declarations.some((item) => item.name.getText(ast) === name));
  assert.ok(node, `actual declaration exists: ${name}`);
  return node;
};
const extract = (ast, name) => declaration(ast, name).getText(ast).replace(/^export\s+/, "");
const compile = async (text) => {
  const code = ts.transpileModule(text, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React,
  } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
};
const noop = () => {};
const render = (Component, props) => renderToStaticMarkup(React.createElement(Component, props));
const event = (id, overrides = {}) => ({ id, repo_id: "EA", task_ref: "plan - A.1",
  file: `src/file_${id}.ts`, mode: "B", provider: "codex", session_id: "session-12345678",
  ts: "2026-10-01T08:00:00Z", tool: "Edit", branch: "develop", commit_hash: null,
  swept: 0, candidates_json: null, ...overrides });
const task = (repo = "EA", overrides = {}) => ({ repo, plan_file: "plan",
  task_ref: "plan - A.1", task_id: "A.1", title: "Implement work", status: "in-progress",
  why: "Keep the work attributable", files: [], last_event_ts: null, ...overrides });

const oneNode = (ast, predicate) => {
  const matches=[];
  const visit=node=>{if(predicate(node)) matches.push(node); ts.forEachChild(node,visit);};
  visit(ast);
  assert.equal(matches.length,1,"one actual status presentation expression");
  return matches[0];
};

test("actual repository palette hint requires an explicit trusted status", async () => {
  const hint=oneNode(app,node=>ts.isPropertyAssignment(node) && node.name.getText(app)==="hint"
    && node.initializer.getText(app).includes("r.status_valid"));
  const {label}=await compile(`export const label=(r)=>(${hint.initializer.getText(app)});`);
  for(const status_valid of [false,undefined,null,"true",1,{},[]]) {
    for(const clean of [false,true]) {
      assert.equal(label({offline:false,status_valid,clean,count:987}),"Git status unavailable");
    }
  }
  assert.equal(label({offline:true,status_valid:true,clean:true,count:0}),"OFFLINE");
  assert.equal(label({offline:false,status_valid:true,clean:true,count:0}),"CLEAN ✓");
  assert.equal(label({offline:false,status_valid:true,clean:false,count:3}),"3 uncommitted");
});

test("actual Mission repository summary requires trusted status without changing readiness", async () => {
  const mission=parse("MissionView.tsx");
  const summary=oneNode(mission,node=>ts.isConditionalExpression(node)
    && node.condition.getText(mission).includes("plan.repo_status.status_valid"));
  const {label}=await compile(`export const label=(plan)=>(${summary.getText(mission)});`);
  for(const status_valid of [false,undefined,null,"true",1,{},[]]) {
    for(const clean of [false,true]) {
      assert.equal(label({repo_status:{status_valid,clean,count:987,branch:"retained"}}),
        "current status unavailable");
    }
  }
  assert.equal(label({repo_status:{status_valid:true,clean:true,count:0,branch:"develop"}}),"clean on develop");
  assert.equal(label({repo_status:{status_valid:true,clean:false,count:3,branch:null}}),"3 changed on unknown branch");
});

test("production History only exposes cards for the current online repository snapshot", async () => {
  const history = declaration(app, "HistoryView");
  const call = oneNode(app, (node) => ts.isJsxSelfClosingElement(node)
    && node.tagName.getText(app) === "HistoryView");
  const reposAttribute = call.attributes.properties.find((node) => ts.isJsxAttribute(node)
    && node.name.getText(app) === "repos");
  assert.ok(reposAttribute && ts.isJsxExpression(reposAttribute.initializer));
  const initializer = (name) => oneNode(history, (node) => ts.isVariableDeclaration(node)
    && node.name.getText(app) === name).initializer.getText(app);
  const enclosingExpression = (node) => {
    while (node && !ts.isJsxExpression(node)) node = node.parent;
    assert.ok(node?.expression, "actual JSX expression owns the render gate");
    return node.expression;
  };
  const mount = enclosingExpression(call);
  assert.ok(ts.isBinaryExpression(mount)
    && mount.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken);
  const capturedRegion = oneNode(history, (node) => ts.isJsxElement(node)
    && node.openingElement.attributes.properties.some((attribute) => ts.isJsxAttribute(attribute)
      && attribute.name.getText(app) === "aria-label"
      && ts.isStringLiteral(attribute.initializer) && attribute.initializer.text === "Captured commits"));
  const { availableRepos, selectedRepo, visibleEntries, canMount, cards } = await compile(`
    export const availableRepos = (visibleRepos) => (${reposAttribute.initializer.expression.getText(app)});
    export const selectedRepo = (repos, state) => (${initializer("repoId")});
    export const visibleEntries = (loadedRepoRef, repoId, entries) => (${initializer("shownEntries")});
    export const canMount = (membershipReady, workspaceReady, view) => (${mount.left.getText(app)});
    export function cards(React, shownEntries, repoId, repos) {
      const HistoryCommitCard = () => null, pager = { start: 0, end: 50 };
      const scopeKeyValue = '["all"]', onStatus = () => {};
      return (${enclosingExpression(capturedRegion).getText(app)});
    }
  `);
  for (const membershipReady of [false, true]) {
    for (const workspaceReady of [false, true]) {
      assert.equal(canMount(membershipReady, workspaceReady, "history"), membershipReady && workspaceReady);
      assert.equal(canMount(membershipReady, workspaceReady, "changes"), false);
    }
  }
  const a = { id: "A", offline: false }, b = { id: "B", offline: false };
  const entries = [{ commit: { hash: "a".repeat(40) }, events: [] }];
  const scenarios = [
    ["selected online A", [a, b], "A", "A", "A", ["A", "B"], true],
    ["A offline falls back to B", [{ ...a, offline: true }, b], "A", "A", "B", ["B"], false],
    ["all offline", [{ ...a, offline: true }, { ...b, offline: true }], "A", "A", "", [], false],
    ["selected membership removed", [b], "A", "A", "B", ["B"], false],
    ["no membership", [], "A", "A", "", [], false],
    ["A returns but B remains selected", [a, b], "B", "B", "B", ["A", "B"], true],
    ["return A waits for matching snapshot", [a, b], "A", "B", "A", ["A", "B"], false],
    ["returned A snapshot accepted", [a, b], "A", "A", "A", ["A", "B"], true],
    ["retained loaded fallback B", [{ ...a, offline: true }, b], "A", "B", "B", ["B"], true],
  ];
  for (const [name, input, requested, loaded, expectedRepo, expectedRepos, visible] of scenarios) {
    const repos = availableRepos(input);
    assert.deepEqual(repos.map((repo) => repo.id), expectedRepos, name);
    const repoId = selectedRepo(repos, { repoId: requested });
    assert.equal(repoId, expectedRepo, name);
    const shownEntries = visibleEntries({ current: loaded }, repoId, entries);
    assert.deepEqual(shownEntries, visible ? entries : [], name);
    if (visible) assert.equal(shownEntries, entries, "matching accepted snapshot is retained exactly");
    const region = cards(React, shownEntries, repoId, repos);
    if (visible) {
      const rows = React.Children.toArray(region.props.children);
      assert.equal(rows.length, 1, name);
      assert.equal(rows[0].props.entry, entries[0]);
      assert.equal(rows[0].props.repoId, expectedRepo);
      assert.equal(rows[0].props.repos, repos);
    } else assert.equal(region, false, `${name}: old cards are absent before effects run`);
  }
});

// Portable structural guard, no Git dependency in CI: these normalized pre-render
// blocks include original filters, paging, request owners, callbacks and cleanup.
// v0.4.0.12 EventRow adds only its owned row ref and neutral recovery announcement.
// The printer retains source newlines in JSX text; canonicalize Windows CRLF.
function preRenderCode (ast, name) {
  const statements = [...declaration(ast, name).body.statements];
  assert.ok(ts.isReturnStatement(statements.pop()), `${name} final render boundary`);
  const printer = ts.createPrinter({ removeComments: true });
  return canonicalPrintedText(statements.map((node) =>
    printer.printNode(ts.EmitHint.Unspecified, node, ast)).join("\n"));
}

test("structural oracle treats LF and CRLF identically in actual early-return JSX", () => {
  assert.equal(canonicalPrintedText("a\r\nb\\r\\n\r"), "a\nb\\r\\n\r",
    "only physical CRLF is normalized, not escapes or bare CR");
  const text = extract(app, "FolderView").replace(/\r\n/g, "\n");
  const expected = preRenderCode(app, "FolderView");
  for (const variant of [text, text.replace(/\n/g, "\r\n")]) {
    const ast = ts.createSourceFile("App.tsx", variant, ts.ScriptTarget.Latest, true);
    assert.equal(preRenderCode(ast, "FolderView"), expected);
  }
});

test("operational restyling preserves all original computation and async-owner blocks", () => {
  const expected = {
    ChangesView: "4ede584f19ea9f02448560389fafcb70630c94f62dbc2c131c7d1e7853cfe49e",
    HistoryView: "318d6aa92b28eb86f146e1ed5727cd59aeab57ae7490385254d281c058eaf89c",
    TaskGroup: "c911db0234ae4e40b5304ddf7bf366552d67b55cba86978b20234648ec643b9f",
    PickSection: "46ed46052b639107004c618e7e165927a0ce9f233217821f7a0a5b5c495b0c09",
    PickRow: "b47550a34d63c8a09af31b4d2b14b337c86c3c027a20f5fdfd06eb4330e118d8",
    EventRow: "82a0fcbdc83c2559febd75d234c3a859bf330fb897e1f370e457785fb4a6543a",
    HistoryCommitCard: "86651ba8904391f1fbdcdc0fb271a3cb5a0fb184f02bcd251bd82740ab23efb4",
    FolderView: "96c29b4b51de1753d67093b94e0396b277411a490a76dd73cb9b66c2c9aabac5",
    FolderRepoCard: "ec305e48ca03d3a63eb854894f83eb1237aaef42c9581e19aa6466d35240b3a4",
  };
  for (const [name, hash] of Object.entries(expected)) {
    const code = preRenderCode(app, name);
    assert.equal(createHash("sha256").update(code).digest("hex"), hash, name);
  }
  assert.doesNotMatch(read("App.tsx"), /text-\[1[01]px\]/);
});

test("actual operational components preserve hierarchy, complete models and actions", { timeout: 30_000 }, async (t) => {
  const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
  const vite = await createServer({ root: frontend,
    server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom",
    optimizeDeps: { noDiscovery: true, entries: [] } });
  try {
    const modules = await Promise.all(["ui.tsx", "theme.ts", "format.ts", "fileTree.ts", "mermaidGraph.ts",
      "dialog.tsx", "accessibleData.tsx", "dialogStatus.tsx", "icons.tsx"]
      .map((name) => vite.ssrLoadModule(`/src/${name}`)));
    const deps = Object.assign({}, ...modules);
    const names = ["PAGE", "tupleKey", "taskIdentity", "taskIdentityParts", "assignmentCandidates",
      "SWEPT_TIP", "swatch", "SessionDot", "ModeBadge", "EffortLine", "FilterChip", "ChangesView",
      "SectionNav", "FolderView", "FolderRepoCard", "TaskGroup", "PickSection", "PickRow", "EventRow",
      "DiffView", "historyGraphKey", "HistoryView", "HistoryCommitCard", "StatusBar", "Sparkline",
      "IDLE_TASK_H", "olderThanH", "AttentionBell"];
    const { createSubjects } = await compile(`export function createSubjects(React, deps, hooks = React) {
      const { useState, useRef, useMemo, useCallback, useEffect } = hooks;
      const { SectionHeading, ControlButton, CollectionPager, useBoundedPage, useRememberedBoundedPage,
        BoundedChoiceDialog, DisclosureTable, buildFileTree, buildGitGraph, renderGitGraph,
        MermaidModuleLoadError, MODE_BADGE, MODE_COLOR, SWEPT_COLOR, eventSessionIdentity,
        sameSessionIdentity, sessionIdentityKey, sessionColor, prefersReducedMotion,
        fmtMinutes, fmtTs, fmtRel, fmtAge, EFFORT_GAP_MAX_MIN, UNCOMMITTED_AGE_H,
        BellIcon, useDisclosureBehavior, suppressDisclosureFocusRestore } = deps;
      const useReveal = () => {};
      const api = {}, createActionDeadline = () => { throw new Error("No network actions in SSR"); };
      const isAbortError = () => false, flushSync = (callback) => callback();
      ${names.map((name) => extract(app, name)).join("\n")}
      return { ChangesView, HistoryView, HistoryCommitCard, TaskGroup, EventRow, DiffView, taskIdentity,
        StatusBar, AttentionBell };
    }`);
    const subjects = createSubjects(React, deps);
    await t.test("Attention never turns pending or unavailable Git status into an all-clear claim", () => {
      const props = { entryKey: "fixture", repos: [], events: [], tasks: [],
        violationOf: () => null, ready: true, error: "", open: true,
        onToggle: noop, onClose: noop, onNavigate: noop, footer: null };
      const pending = render(subjects.AttentionBell, { ...props, ready: false });
      assert.match(pending, /Waiting for workspace snapshot/);
      assert.doesNotMatch(pending, /all clear|All clear|No actionable alerts/);
      const failed = render(subjects.AttentionBell, { ...props, ready: false, error: "unavailable" });
      assert.match(failed, /Workspace snapshot unavailable/);
      assert.doesNotMatch(failed, /all clear|All clear|No actionable alerts/);
      const base = { id: "EA", offline: false, status_valid: true, clean: true,
        count: 0, branch: "retained-branch", last_event_ts: null, oldest_uncommitted_ts: null };
      for (const unavailable of [{ offline: true }, { status_valid: false }, { status_valid: undefined }]) {
        const html = render(subjects.AttentionBell, { ...props,
          repos: [{ ...base, ...unavailable, count: 987 }] });
        assert.match(html, /Git status unavailable/);
        assert.match(html, /Last-known branch: /);
        assert.doesNotMatch(html, /987|all clear|All clear|No actionable alerts/);
      }
      const valid = render(subjects.AttentionBell, { ...props,
        repos: [{ ...base, clean: false, count: 3, last_event_ts: "2026-10-01T00:00:00Z" }] });
      assert.match(valid, /3 uncommitted changes/);
      assert.doesNotMatch(valid, /Git status unavailable|Last-known branch/);
      const captured = render(subjects.AttentionBell, { ...props,
        repos: [{ ...base, status_valid: false }], events: [event(1, { mode: "UNKNOWN" })],
        tasks: [task("EA", { last_event_ts: "2020-01-01T00:00:00Z" })] });
      assert.match(captured, /1 pick pending/);
      assert.match(captured, /in-progress idle/);
      const paged = render(subjects.AttentionBell, { ...props,
        repos: Array.from({ length: 51 }, (_, index) => ({ ...base, id: `Repo_${index}`, status_valid: false })) });
      assert.match(paged, /51 items/);
      assert.match(paged, /Attention repositories: next page/);
      assert.doesNotMatch(paged, />Repo_50</);
    });
    await t.test("status drawer retains honest scope, branch and contrasting clean labels", () => {
      const props = { repos: [], scopeKeyValue: '["all"]', violationOf: () => null,
        burst: null, onDraft: noop, draftBusyRepo: null };
      assert.match(render(subjects.StatusBar, props), /No repositories in this scope/);
      const fixture = { id: "Fixture", branch: "develop", status_valid: true,
        offline: true, clean: true, count: 999, activity_buckets: [], last_event_ts: null };
      const offline = render(subjects.StatusBar, { ...props, repos: [fixture] });
      assert.match(offline, /Last-known branch: /);
      assert.match(offline, /OFFLINE/);
      assert.doesNotMatch(offline, /CLEAN|999|title="current git branch"/);
      const clean = render(subjects.StatusBar, { ...props,
        repos: [{ ...fixture, offline: false, count: 0 }] });
      assert.match(clean, /bg-emerald-600[^"]*text-slate-950/);
      assert.match(clean, /CLEAN/);
      assert.match(clean, /title="current git branch"/);
      for(const status_valid of [false,undefined,null,"true",1,{},[]]) {
        for(const clean of [false,true]) {
          const unavailable=render(subjects.StatusBar,{...props,
            repos:[{...fixture,offline:false,status_valid,clean}]});
          assert.match(unavailable,/Git status unavailable/);
          assert.match(unavailable,/Last-known branch/);
          assert.doesNotMatch(unavailable,/CLEAN|999|title="current git branch"/);
        }
      }
    });
    const props = { events: [], tasks: [], repos: [], effortByTask: new Map(),
      taskFilter: null, sessionFilter: null, groupMode: "task", scopeKeyValue: '["all"]',
      assignmentState: { selectedIds: [], bulkChoice: "", choices: {} },
      onClearFilter: noop, onClearSessionFilter: noop, onPicked: noop, onSessionClick: noop,
      onOpenTimeline: noop, onOpenFileStory: noop, onGroupModeChange: noop,
      onAssignmentStateChange: noop, onStatus: noop };

    await t.test("Changes has one visible page heading and honest empty state", () => {
      const html = render(subjects.ChangesView, props);
      assert.match(html, /<h2[^>]*data-view-heading[^>]*class="ui-page-title[^>]*>Changes<\/h2>/);
      assert.doesNotMatch(html, /aria-label="Manual attribution queue"/);
      assert.match(html, /No uncommitted tracked changes/);
      assert.match(html, /aria-label="Grouped uncommitted changes"/);
    });

    await t.test("attribution remains first and unfiltered; task/session filters do not leak repos", () => {
      const html = render(subjects.ChangesView, { ...props, tasks: [task(), task("Other")],
        events: [event(1, { file: "queue.ts", mode: "UNKNOWN" }), event(2),
          event(3, { repo_id: "Other", file: "other.ts" }), event(4, { session_id: "another", file: "another.ts" })],
        taskFilter: subjects.taskIdentity("EA", "plan - A.1"),
        sessionFilter: { provider: "codex", sessionId: "session-12345678" } });
      const queue = html.indexOf('aria-label="Manual attribution queue"');
      const work = html.indexOf('aria-label="Grouped uncommitted changes"');
      assert.ok(queue >= 0 && work > queue);
      for (const value of ["queue.ts", "file_2.ts", "Clear task filter", "Clear session filter", "Session timeline"]) {
        assert.ok(html.includes(value), value);
      }
      assert.doesNotMatch(html, /other\.ts|another\.ts/);
    });

    await t.test("folder mode discloses retained filters and leaves all event paths reachable", () => {
      const html = render(subjects.ChangesView, { ...props, groupMode: "folder",
        events: [event(1), event(2, { repo_id: "Other", mode: "UNKNOWN" })],
        taskFilter: subjects.taskIdentity("EA", "missing - <task>"),
        sessionFilter: { provider: "codex", sessionId: "stale-session" } });
      for (const value of ["saved for task grouping", "Clear task filter", "Clear session filter", "file_1.ts", "file_2.ts"]) {
        assert.ok(html.includes(value), value);
      }
      assert.match(html, /missing - &lt;task&gt;/);
      assert.doesNotMatch(html, /<task>/);
    });

    await t.test("51 task groups keep full count and bounded work list", () => {
      const html = render(subjects.ChangesView, { ...props,
        events: Array.from({ length: 51 }, (_, index) => event(index, { task_ref: `plan - T${index}` })) });
      assert.match(html, /51 task groups in the current filter/);
      assert.match(html, /Change task groups: next page/);
      assert.equal((html.match(/data-reveal="true"/g) ?? []).length, 50);
      assert.doesNotMatch(html, />src\/file_50.ts</);
    });

    await t.test("filter callbacks retain exact identities when presentation moves", () => {
      const calls = [];
      const direct = createSubjects(React, { ...deps,
        useRememberedBoundedPage: (key, options) => ({ ...deps.getBoundedPageWindow(options.totalItems, 1, options.pageSize), setPage: noop }),
      }, { useMemo: (fn) => fn() });
      const session = { provider: "codex", sessionId: "exact-session" };
      const tree = direct.ChangesView({ ...props, taskFilter: subjects.taskIdentity("EA", "plan - A.1"),
        sessionFilter: session, onClearFilter: () => calls.push("task"),
        onClearSessionFilter: () => calls.push("session"), onOpenTimeline: (value) => calls.push(value) });
      const elements = (node) => Array.isArray(node) ? node.flatMap(elements)
        : React.isValidElement(node) ? [node, ...elements(node.props.children)] : [];
      const controls = elements(tree).filter((node) => node.type === deps.ControlButton);
      for (const name of ["Clear task filter", "Session timeline", "Clear session filter"]) {
        const control = controls.find((node) => node.props.children === name);
        assert.ok(control, name); control.props.onClick();
      }
      assert.deepEqual(calls, ["task", session, "session"]);
      assert.equal(calls[1], session);
    });

    await t.test("History empty boundary keeps visible heading and disabled graph action", () => {
      const html = render(subjects.HistoryView, { repos: [], scopeKeyValue: '["all"]',
        state: { repoId: "", fetchDepth: 500, page: 1 }, onStateChange: noop, onStatus: noop });
      assert.match(html, /<h2[^>]*class="ui-page-title[^>]*>History<\/h2>/);
      assert.match(html, /No online repositories are available/);
      assert.match(html, /<button[^>]*disabled=""[^>]*>Commit graph<\/button>/);
      assert.match(html, /data-history-ready="true"/);
    });

    await t.test("commit list retains full identity, escaped text and linked-event pagination", () => {
      const hash = "1234567890abcdef";
      const html = render(subjects.HistoryCommitCard, { entry: {
        commit: { hash, message: '<script>long & "commit"</script>', ts: "2026-10-01T00:00:00Z" },
        events: Array.from({ length: 51 }, (_, index) => event(index)),
      }, repos: [], scopeKeyValue: '["all"]', repoId: "EA", onStatus: noop });
      assert.match(html, /<article class="ui-work-row"/);
      assert.match(html, /title="1234567890abcdef"/);
      assert.match(html, /&lt;script&gt;long &amp; &quot;commit&quot;&lt;\/script&gt;/);
      assert.match(html, /1234567890 events: next page/);
      assert.doesNotMatch(html, />src\/file_50.ts</);
    });

    const cardElements = (node) => Array.isArray(node) ? node.flatMap(cardElements)
      : React.isValidElement(node) ? [node, ...cardElements(node.props.children)] : [];
    const cardText = (node) => Array.isArray(node) ? node.map(cardText).join("")
      : React.isValidElement(node) ? cardText(node.props.children)
        : node === null || node === undefined || typeof node === "boolean" ? "" : String(node);
    const cardProps = (hash, overrides = {}) => ({ entry: {
      commit: { hash, message: '<script>exact & "subject"</script>', ts: "2026-10-01T00:00:00Z" },
      events: [],
    }, repos: [], scopeKeyValue: '["all"]', repoId: "EA", onStatus: noop, ...overrides });
    function capturedCard (props, pages = {}, onPageChange = noop) {
      let tree;
      function Capture () {
        tree = subjects.HistoryCommitCard(props);
        return tree;
      }
      const html = renderToStaticMarkup(React.createElement(deps.BoundedPageMemoryProvider,
        { pages, onPageChange }, React.createElement(Capture)));
      return { tree, html };
    }
    function commitDisclosure (tree) {
      const details = cardElements(tree).filter((node) => node.type === "details");
      assert.equal(details.length, 1, "actual card exposes one native full-identity disclosure");
      return details[0];
    }

    await t.test("full commit identity uses a native closed disclosure and associated readonly exact field", () => {
      const hashes = ["a".repeat(40), "b".repeat(64), "abc", "", "0123456789abcdef".repeat(64),
        'abc<unsafe>&"hash"', "1234567890" + "a".repeat(30), "1234567890" + "b".repeat(30)];
      for (const hash of hashes) {
        const props = cardProps(hash, { repoId: '<repo>&"A"' });
        const { tree, html } = capturedCard(props);
        const details = commitDisclosure(tree);
        const direct = React.Children.toArray(details.props.children);
        assert.equal(direct[0].type, "summary", "summary is the first child");
        const summary = direct[0];
        assert.match(cardText(summary), /Full commit ID/);
        const supplemental = cardElements(summary).find((node) => node.props.className?.split(/\s+/).includes("sr-only"));
        assert.ok(supplemental, "summary context is supplemental, not hover-only");
        assert.ok(cardText(supplemental).includes(props.repoId));
        assert.ok(cardText(supplemental).includes(hash.slice(0, 10)));
        assert.match(summary.props.className, /\bui-control\b/);
        assert.match(summary.props.className, /list-item/);
        assert.match(summary.props.className, /max-w-full/);
        for (const node of [details, summary]) {
          assert.equal(node.props.role, undefined, "preserve native disclosure semantics");
          assert.equal(node.props["aria-expanded"], undefined);
        }
        assert.equal(details.props.open, undefined, "uncontrolled and default closed");
        const input = cardElements(details).filter((node) => node.type === "input");
        assert.equal(input.length, 1);
        const field = input[0];
        const label = cardElements(details).find((node) => node.type === "label"
          && (cardElements(node).includes(field) || field.props.id && node.props.htmlFor === field.props.id));
        assert.ok(label, "the visible label is associated with this input");
        assert.ok(cardText(label).includes(`Commit ID in ${props.repoId}`));
        assert.equal(field.props.type, "text");
        assert.equal(field.props.value, hash, "never abbreviate, normalize or trim the exact value");
        assert.equal(field.props.readOnly, true);
        assert.notEqual(field.props.disabled, true);
        assert.notEqual(field.props.tabIndex, -1);
        assert.equal(field.props.maxLength, undefined);
        assert.equal(field.props.spellCheck, false);
        assert.equal(field.props.autoComplete, "off");
        for (const token of ["ui-field", "w-full", "min-w-0", "font-mono", "text-xs"]) {
          assert.ok(field.props.className.split(/\s+/).includes(token), token);
        }
        for (const node of cardElements(tree)) {
          assert.notEqual(node.props.autoFocus, true);
          assert.equal(node.props.dangerouslySetInnerHTML, undefined);
          assert.deepEqual(Object.keys(node.props).filter((key) => /^on[A-Z]/.test(key)), [],
            "native identity access adds no toggle, clipboard, selection or focus handlers");
        }
        assert.match(html, /&lt;script&gt;exact &amp; &quot;subject&quot;&lt;\/script&gt;/);
        assert.match(html, /Commit ID in &lt;repo&gt;&amp;&quot;A&quot;/);
        assert.doesNotMatch(html, /<script>|<unsafe>/);
        if (hash.includes("<unsafe>")) assert.match(html, /value="abc&lt;unsafe&gt;&amp;&quot;hash&quot;"/);
        assert.ok(cardElements(tree).some((node) => node.type === "span"
          && node.props.title === hash && cardText(node) === hash.slice(0, 10)), "compact header is preserved");
      }
    });

    await t.test("native identity key distinguishes scope, repo and full hash without callback state", () => {
      const hash = "1234567890" + "a".repeat(30), props = cardProps(hash);
      const key = (value) => commitDisclosure(capturedCard(value).tree).key;
      const initial = key(props);
      assert.equal(initial, JSON.stringify(["history-commit-id", props.scopeKeyValue, props.repoId, hash]));
      assert.equal(key({ ...props, entry: { ...props.entry,
        commit: { ...props.entry.commit, message: "Updated captured subject" }, events: [event(1)] } }), initial);
      const changed = [
        { ...props, scopeKeyValue: '["repo","EA"]' },
        { ...props, repoId: "Other" },
        { ...props, entry: { ...props.entry, commit: { ...props.entry.commit,
          hash: "1234567890" + "b".repeat(30) } } },
      ];
      assert.equal(new Set([initial, ...changed.map(key)]).size, 4);
      for (const value of changed) assert.equal(commitDisclosure(capturedCard(value).tree).props.open, undefined);
      // Keys and element contracts are evidence, not a simulation of native DOM retention.
    });

    await t.test("commit identity leaves all 101 linked events reachable through the actual remembered pager", () => {
      const props = cardProps("a".repeat(40));
      props.entry.events = Array.from({ length: 101 }, (_, index) => event(index));
      const memoryKey = JSON.stringify(["history-events", props.scopeKeyValue, props.repoId, props.entry.commit.hash]);
      const pages = {}, observed = [];
      let identityKey;
      for (const [index, length] of [50, 50, 1].entries()) {
        const { tree, html } = capturedCard(props, pages, (key, page) => {
          assert.equal(key, memoryKey); pages[key] = page;
        });
        const details = commitDisclosure(tree);
        identityKey ??= details.key;
        assert.equal(details.key, identityKey, "local event paging preserves disclosure identity");
        const rows = cardElements(tree).filter((node) => node.props.event);
        assert.equal(rows.length, length);
        observed.push(...rows.map((node) => node.props.event.id));
        assert.ok(html.includes(`src/file_${index * 50}.ts`));
        const pager = cardElements(tree).find((node) => node.type === deps.CollectionPager);
        assert.ok(pager);
        assert.equal(pager.props.page.page, index + 1);
        assert.equal(pager.props.page.totalItems, 101);
        const controls = deps.CollectionPager.render(pager.props, null);
        const next = cardElements(controls).find((node) => node.props["aria-label"]?.endsWith(": next page"));
        assert.equal(next.props.disabled, index === 2);
        if (index < 2) next.props.onClick();
      }
      assert.deepEqual(observed, Array.from({ length: 101 }, (_, index) => index));
    });

    await t.test("actual interaction guard protects visible open native details, not closed or hidden ones", () => {
      const keys = ["document", "window", "HTMLElement"];
      const descriptors = Object.fromEntries(keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
      class FixtureElement {
        constructor(overrides = {}) {
          Object.assign(this, { open: true, isConnected: true, hidden: false,
            display: "block", visibility: "visible", rects: 1 }, overrides);
        }
        getClientRects() { return Array.from({ length: this.rects }, () => ({})); }
      }
      let rows = [];
      const selectors = [];
      try {
        Object.defineProperty(globalThis, "HTMLElement", { configurable: true, value: FixtureElement });
        Object.defineProperty(globalThis, "window", { configurable: true,
          value: { getComputedStyle: (node) => ({ display: node.display, visibility: node.visibility }) } });
        Object.defineProperty(globalThis, "document", { configurable: true, value: {
          body: { dataset: {} }, activeElement: null,
          querySelectorAll(selector) {
            selectors.push(selector);
            if (selector === '[aria-expanded="true"]') return [];
            assert.equal(selector, "details[open]");
            return rows.filter((node) => node.open);
          },
        } });
        for (const [overrides, expected] of [[{}, true], [{ open: false }, false],
          [{ hidden: true }, false], [{ isConnected: false }, false],
          [{ display: "none" }, false], [{ visibility: "hidden" }, false], [{ rects: 0 }, false]]) {
          rows = [new FixtureElement(overrides)];
          assert.equal(deps.hasActiveInteraction(), expected, JSON.stringify(overrides));
        }
        rows = [new FixtureElement({ hidden: true }), new FixtureElement()];
        assert.equal(deps.hasActiveInteraction(), true);
        assert.ok(selectors.includes("details[open]"));
      } finally {
        for (const key of keys) {
          if (descriptors[key]) Object.defineProperty(globalThis, key, descriptors[key]);
          else delete globalThis[key];
        }
      }
    });

    await t.test("plan and provenance actual helpers retain composite scope, zero and exact-ratio semantics", async () => {
      const { PlanBoard, groupActivePlans } = await vite.ssrLoadModule("/src/planBoard.tsx");
      const { ProvenanceCard, pctOf } = await vite.ssrLoadModule("/src/provenance.tsx");
      const tasks = [task(), task("Other"), task("Done", { status: "done" })];
      assert.deepEqual(groupActivePlans(tasks).map((plan) => plan.repo), ["EA", "Other"]);
      assert.equal(render(PlanBoard, { tasks: [tasks[2]], onOpenFileStory: noop }), "");
      const board = render(PlanBoard, { tasks, onOpenFileStory: noop });
      assert.match(board, /ui-work-list/);
      assert.match(board, /Other/);
      assert.equal(pctOf(396, 397), 99);
      assert.equal(pctOf(1, 400), 1);
      const provenance = { commits_observed: 2, commits_pre: 1, slots_total: 397,
        slots_ai: 396, top_files: [{ repo: "EA", file: "<folder>/long.ts", commits: 2, ai_commits: 1 }] };
      const html = render(ProvenanceCard, { provenance, scope: undefined, onOpenFileStory: noop });
      assert.match(html, /99%/);
      assert.match(html, /396\/397 file changes/);
      assert.match(html, /&lt;folder&gt;\/long.ts/);
      assert.equal(render(ProvenanceCard, { provenance: { ...provenance, slots_total: 0 } }), "");
    });

    await t.test("actual session/file dialogs keep fetched-window and row boundaries without a native portal", async () => {
      // Only lifecycle/portal boundaries are controlled. Actual functions, effort,
      // labels and shared page calculations are executed, with no network or DOM.
      for (const name of ["SessionTimeline", "FileStory"]) {
        const ast = parse(`${name}.tsx`);
        const { makeDialog } = await compile(`export function makeDialog(React, deps, rows, states = {}) {
          let stateIndex = 0;
          const useState = (initial) => {
            const index = stateIndex++;
            return [index === 0 ? rows : Object.hasOwn(states, index) ? states[index]
              : initial === true ? false : initial, () => {}];
          };
          const useRef = (initial) => ({ current: initial }), useEffect = () => {};
          const { useBoundedPage, CollectionPager, DialogLoadStatus, EventWindowNotice, ExternalLinkIcon,
            fmtMinutes, fmtTs, EFFORT_GAP_MAX_MIN, EFFORT_TAIL_MIN, MODE_BADGE, MODE_COLOR,
            eventSessionIdentity, sessionColor } = deps;
          const DialogShell = ({ title, description, children, headerActions }) =>
            <section><h2>{title}</h2><p>{description}</p>{headerActions}{children}</section>;
          const API_PAGE = 500, MAX_PAGES = 3;
          ${extract(ast, name)}
          return ${name};
        }`);
        const rows = Array.from({ length: 51 }, (_, index) => event(index));
        const Component = makeDialog(React, deps, rows, { 2: true });
        const dialogProps = { session: { provider: "codex", sessionId: "session-12345678" },
          repo: "EA", file: "<folder>/file.ts", repoPath: null, repoBranch: "develop", onStatus: noop, onClose: noop };
        const html = render(Component, dialogProps);
        assert.match(html, /51 events/);
        assert.equal((html.match(/class="ui-work-row/g) ?? []).length, 50);
        assert.match(html, /events: next page/);
        assert.match(html, /Fetched-window limit reached: showing 51 captured events. More may exist./);
        assert.doesNotMatch(html, /text-\[1[01]px\]/);
        if (name === "FileStory") assert.match(html, /&lt;folder&gt;\/file.ts/);
        const empty = render(makeDialog(React, deps, []), dialogProps);
        assert.match(empty, /No events for this (session|file)/);
        assert.doesNotMatch(empty, /events: next page|Fetched-window limit reached/);
        const pending = render(makeDialog(React, deps, null, { 3: true }), dialogProps);
        assert.match(pending, /Loading (session timeline|file story)/);
        assert.doesNotMatch(pending, /No events for this/);
        const failed = render(makeDialog(React, deps, null, { 1: "Fixture <unavailable>" }), dialogProps);
        assert.match(failed, /Fixture &lt;unavailable&gt;/);
        assert.match(failed, />Retry<\/button>/);
      }
    });
  } finally {
    await vite.close();
  }
});
