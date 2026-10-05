import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

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

// Portable structural guard, no Git dependency in CI: these normalized pre-render
// blocks include original filters, paging, request owners, callbacks and cleanup.
test("operational restyling preserves all original computation and async-owner blocks", () => {
  const expected = {
    ChangesView: "4ede584f19ea9f02448560389fafcb70630c94f62dbc2c131c7d1e7853cfe49e",
    HistoryView: "318d6aa92b28eb86f146e1ed5727cd59aeab57ae7490385254d281c058eaf89c",
    TaskGroup: "c911db0234ae4e40b5304ddf7bf366552d67b55cba86978b20234648ec643b9f",
    PickSection: "46ed46052b639107004c618e7e165927a0ce9f233217821f7a0a5b5c495b0c09",
    PickRow: "b47550a34d63c8a09af31b4d2b14b337c86c3c027a20f5fdfd06eb4330e118d8",
    EventRow: "8d1ac349134cd68c9361d99ec80d8332a6ee2a0eacb4dc10e7f180fdb55e5092",
    HistoryCommitCard: "86651ba8904391f1fbdcdc0fb271a3cb5a0fb184f02bcd251bd82740ab23efb4",
    FolderView: "96c29b4b51de1753d67093b94e0396b277411a490a76dd73cb9b66c2c9aabac5",
    FolderRepoCard: "ec305e48ca03d3a63eb854894f83eb1237aaef42c9581e19aa6466d35240b3a4",
  };
  const printer = ts.createPrinter({ removeComments: true });
  for (const [name, hash] of Object.entries(expected)) {
    const statements = [...declaration(app, name).body.statements];
    assert.ok(ts.isReturnStatement(statements.pop()), `${name} final render boundary`);
    const code = statements.map((node) => printer.printNode(ts.EmitHint.Unspecified, node, app)).join("\n");
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
