import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { RELATIONSHIP_CHANGES, RELATIONSHIP_CHANGES_SHA, ORIGINAL_OVERVIEW_LF_SHA,
  restoreRelationshipHistory } from "./helpers/relationshipHistory.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const frontend = resolve(root, "Frontend");
const require = createRequire(resolve(frontend, "package.json"));
const ts = require("typescript"), React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const read = (file) => readFileSync(resolve(frontend, "src", file), "utf8");
const parse = (text) => ts.createSourceFile("OverviewView.tsx", text,
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declaration = (source, name) => {
  const found = source.statements.filter((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.equal(found.length, 1, `one actual ${name}`);
  return found[0];
};
const compile = (text) => import(`data:text/javascript;base64,${Buffer.from(ts.transpileModule(text, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React },
}).outputText).toString("base64")}`);
const nodes = (node) => Array.isArray(node) ? node.flatMap(nodes)
  : React.isValidElement(node) ? [node, ...nodes(node.props.children), ...nodes(node.props.actions)] : [];
const flush = async () => { for (let i = 0; i < 24; i++) await Promise.resolve(); };
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject }; };
const task = (id = "A.1", repo = "Repo", plan = "Plan.txt") => ({ repo, plan_file: plan,
  task_ref: `${plan} - ${id}`, task_id: id, title: `Task ${id}`, files: [`${id}.txt`] });
const history = (tasks, hash = "a".repeat(40)) => [{ commit: { hash, message: "work", ts: "2026-10-06", parents: "", files_json: "[]" },
  events: tasks.map((item, index) => ({ id: index + 1, repo_id: item.repo, task_ref: item.task_ref, commit_hash: hash })) }];
let vite, deps, make, makeTable;

before(async () => {
  const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
  vite = await createServer({ root: frontend, server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom", optimizeDeps: { noDiscovery: true, entries: [] } });
  deps = Object.assign({}, ...await Promise.all(["api.ts", "mermaidGraph.ts", "ui.tsx", "accessibleData.tsx"]
    .map((file) => vite.ssrLoadModule(`/src/${file}`))));
  const source = parse(read("OverviewView.tsx"));
  ({ make } = await compile(`export function make(React, deps, hooks) {
    const { useState, useRef, useEffect, useMemo, useCallback } = hooks;
    const { api, createActionDeadline, isAbortError, buildBackbone, renderBackbone,
      MermaidModuleLoadError, DisclosureTable, Surface, SectionHeading } = deps;
    const BoundedChoiceDialog = () => null;
    const DialogShell = ({children}) => <section>{children}</section>;
    const GraphShell = ({svg}) => <div data-graph={svg} />;
    ${declaration(source, "GraphPanel").getText(source)}
    return { GraphPanel, GraphShell, BoundedChoiceDialog, DialogShell };
  }`));
  const table = parse(read("accessibleData.tsx")), ui = parse(read("ui.tsx"));
  ({ makeTable } = await compile(`export function makeTable(React, deps, hooks) {
    const { useState, useRef, useEffect, useMemo, useCallback, useId } = hooks;
    const { ControlButton, CollectionPager, getBoundedPageWindow } = deps;
    ${["collectionIdentityKey", "useBoundedPage"].map((name) =>
      declaration(ui, name).getText(ui).replace(/^export\s+/, "")).join("\n")}
    ${["compareValues", "identityKey", "DisclosureTable"].map((name) =>
      declaration(table, name).getText(table).replace(/^export\s+/, "")).join("\n")}
    return DisclosureTable;
  }`));
});
after(async () => { await vite?.close(); });

// The complete production function owns state and effects. Only host hooks,
// transport and Mermaid rendering are controlled; this is not React DOM proof.
async function withGraph (options, check) {
  const originals = ["window", "fetch"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  const slots = [], pending = new Set(), timers = new Map(), calls = [], renders = [], writes = [], statuses = [];
  let cursor = 0, dirty = true, mounted = true, tree, timerId = 0, reloads = 0;
  const equal = (a, b) => !!a && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const hooks = {
    useState(initial) { const index = cursor++; const cell = slots[index] ??= { value: typeof initial === "function" ? initial() : initial };
      cell.set ??= (next) => { writes.push({ mounted, index }); const value = typeof next === "function" ? next(cell.value) : next;
        if (!Object.is(value, cell.value)) { cell.value = value; dirty = true; } };
      return [cell.value, cell.set]; },
    useRef(current) { return slots[cursor++] ??= { current }; },
    useMemo(factory, dependencies) { const index = cursor++; const prior = slots[index];
      if (!prior || !equal(prior.dependencies, dependencies)) slots[index] = { dependencies, value: factory() };
      return slots[index].value; },
    useCallback(callback, dependencies) { return hooks.useMemo(() => callback, dependencies); },
    useEffect(callback, dependencies) { const index = cursor++; const prior = slots[index];
      if (!prior || !equal(prior.dependencies, dependencies)) {
        slots[index] = { dependencies, callback, cleanup: prior?.cleanup, effect: true }; pending.add(index);
      } },
  };
  globalThis.window = { setTimeout(callback, ms) { const id = timerId++; timers.set(id, { callback, ms }); return id; },
    clearTimeout(id) { timers.delete(id); }, location: { reload() { reloads++; } } };
  globalThis.fetch = (url, init) => {
    const response = deferred(); const call = { url, signal: init.signal, response };
    calls.push(call);
    if (!options.ignoreAbort) init.signal.addEventListener("abort", () => response.reject(deps.abortError()), { once: true });
    return response.promise;
  };
  const rendering = (input, context, prepared) => {
    const result = deferred(); renders.push({ input, context, prepared, result });
    return options.ignoreRenderAbort ? result.promise : deps.raceWithSignal(result.promise, context.signal);
  };
  const subjects = make(React, { ...deps, renderBackbone: rendering }, hooks);
  const props = { tasks: [task()], uncommitted: [], repos: [{ id: "Repo" }], scope: undefined,
    selection: { repoId: "Repo", planFile: "Plan.txt" }, onStatus: (message) => statuses.push(message),
    onSelectionChange: (selection) => { props.selection = selection; dirty = true; }, ...options.props };
  const render = () => { cursor = 0; dirty = false; tree = subjects.GraphPanel(props); return tree; };
  const settle = async () => {
    for (let turn = 0; turn < 30; turn++) {
      if (dirty) render();
      for (const index of [...pending]) { pending.delete(index); const cell = slots[index]; cell.cleanup?.(); cell.cleanup = cell.callback(); }
      await flush();
      if (!dirty && pending.size === 0) return tree;
    }
    assert.fail("controlled effects must converge");
  };
  const unmount = () => { if (!mounted) return; for (const cell of slots) if (cell?.effect) cell.cleanup?.(); mounted = false; };
  const h = { subjects, props, calls, renders, timers, statuses, writes, render, settle, unmount,
    patch(next) { Object.assign(props, next); dirty = true; },
    get tree() { return tree; }, get reloads() { return reloads; },
    table() { return nodes(tree).find((node) => node.type === deps.DisclosureTable)?.props; },
    html() { return renderToStaticMarkup(tree); },
    choose(repo = "Repo", plan = "Plan.txt") { nodes(tree).find((node) => node.type === subjects.BoundedChoiceDialog)
      .props.onChange(JSON.stringify([repo, plan])); },
    retry() { const button = nodes(tree).find((node) => node.type === "button" && node.props.children === "Retry map");
      assert.ok(button, "actual retry control exists"); button.props.onClick(); },
    respond(index, data, status = 200) { calls[index].response.resolve({ ok: status < 400, status,
      json: async () => status < 400 ? { success: true, data } : { success: false, message: "History unavailable" } }); },
    finish(index, svg = `<svg data-render="${index}"/>`) { const work = renders[index]; work.result.resolve({ svg, meta: work.prepared }); },
  };
  try { render(); await check(h); }
  finally {
    try { unmount(); await flush(); assert.equal(timers.size, 0, "action timers cleared"); }
    finally { for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    } }
  }
}

test("initial unobserved History does not claim zero commit links", async () => {
  await withGraph({}, async (h) => {
    assert.match(h.table().summary, /commit links unavailable/);
    const commits = h.table().columns.find((column) => column.key === "commits");
    assert.equal(commits.render(h.table().rows[0]), "Unavailable");
    assert.match(h.html(), /Commit history not loaded yet/);
  });
});

test("initial unobserved History does not claim no committed history", async () => {
  await withGraph({}, async (h) => {
    assert.doesNotMatch(h.html(), /No committed history for this plan yet/);
    assert.equal(h.calls.length, 0, "initial render is before passive History work");
  });
});

test("pending and failed real History preserve task facts; actual Retry observes an empty page", async () => {
  const tasks = [task()];
  await withGraph({ props: { tasks, uncommitted: [{ id: 1, repo_id: "Repo", task_ref: tasks[0].task_ref }] } }, async (h) => {
    await h.settle();
    assert.equal(h.calls.length, 1);
    assert.equal(h.calls[0].url, "/api/history?repo=Repo&limit=500&offset=0");
    assert.ok(h.calls[0].signal instanceof AbortSignal);
    assert.equal(h.timers.size, 0, "restored selection uses unchanged background ownership");
    assert.match(h.table().summary, /commit links unavailable; 1 task with uncommitted activity/);
    assert.match(h.html(), /Map update pending; any visible diagram is from its previous accepted render/);
    h.respond(0, null, 503); await h.settle();
    assert.match(h.html(), /Commit history unavailable\. Task details are shown/);
    assert.match(h.html(), /Latest map update failed; any visible diagram is from its previous accepted render/);
    h.retry(); h.retry(); await h.settle();
    assert.equal(h.calls.length, 2, "same-stack retry is duplicate guarded");
    assert.equal(h.timers.size, 1);
    h.respond(1, []); await h.settle();
    assert.match(h.table().summary, /0 commit links/);
    assert.equal(h.table().columns.find((column) => column.key === "commits").render(h.table().rows[0]), "—");
    assert.match(h.html(), /last accepted History response \(up to 500 commits\)/);
    assert.match(h.html(), /Map update pending/);
    h.finish(0, ""); await h.settle();
    assert.match(h.html(), /No relationship diagram is available for this accepted History response/);
    assert.doesNotMatch(h.html(), /Map update pending|Latest map update failed|No committed history/);
    assert.equal(h.timers.size, 0);
    assert.deepEqual(h.statuses, ["Relationship map ready."]);
  });
});

test("actual foreground deadline aborts transport; retry recovers without fabricated zero", async () => {
  await withGraph({ props: { selection: null } }, async (h) => {
    await h.settle(); assert.equal(h.table(), undefined); assert.equal(h.calls.length, 0);
    h.choose(); await h.settle();
    const [id, timer] = [...h.timers][0]; assert.equal(timer.ms, 10_000);
    h.timers.delete(id); timer.callback(); await h.settle();
    assert.ok(h.calls[0].signal.aborted);
    assert.match(h.html(), /Relationship map timed out after 10 seconds/);
    assert.match(h.table().summary, /commit links unavailable/);
    h.retry(); await h.settle(); h.respond(1, history(h.props.tasks)); await h.settle();
    assert.match(h.table().summary, /1 commit link;/);
    h.finish(0); await h.settle();
    assert.doesNotMatch(h.html(), /timed out|Map update pending/);
    assert.equal(h.timers.size, 0);
  });
});

test("accepted History publishes before deferred Mermaid and counts per-task associations", async () => {
  const tasks = [task("A.1"), task("A.2")];
  const input = history(tasks); input[0].events.push({ ...input[0].events[0], id: 3 });
  await withGraph({ props: { tasks } }, async (h) => {
    await h.settle(); h.respond(0, input); await h.settle();
    assert.equal(h.renders.length, 1);
    assert.match(h.table().summary, /2 tasks; 2 commit links/);
    assert.deepEqual(h.table().rows.map((row) => row.commits), [["a".repeat(40)], ["a".repeat(40)]]);
    assert.match(h.html(), /last accepted History response/);
    h.renders[0].result.reject(new Error("diagram fault")); await h.settle();
    assert.match(h.html(), /last accepted History response/);
    assert.match(h.html(), /Latest map update failed/);
    assert.doesNotMatch(h.table().summary, /unavailable/);
    assert.equal(input[0].events.length, 3, "builder leaves response records untouched");
  });
});

test("accepted same-plan rows remain labelled during refresh and later HTTP failure", async () => {
  await withGraph({}, async (h) => {
    await h.settle(); h.respond(0, history(h.props.tasks)); await h.settle(); h.finish(0); await h.settle();
    h.patch({ tasks: [{ ...task(), title: "Updated title" }] }); await h.settle();
    assert.equal(h.calls.length, 2);
    assert.match(h.table().summary, /1 commit link;/);
    assert.match(h.html(), /last accepted History response/);
    assert.match(h.html(), /Map update pending/);
    assert.equal(nodes(h.tree).find((node) => node.type === h.subjects.GraphShell).props.svg, '<svg data-render="0"/>');
    h.respond(1, null, 503); await h.settle();
    assert.match(h.table().summary, /1 commit link;/);
    assert.match(h.html(), /Latest map update failed/);
    assert.equal(h.table().rows[0].title, "Task A.1", "retained rows remain the accepted page snapshot");
  });
});

test("offline synthetic history is unavailable, not an observed empty page, and recovers online", async () => {
  await withGraph({ props: { repos: [] } }, async (h) => {
    assert.match(h.html(), /offline or missing repository/);
    await h.settle(); assert.equal(h.calls.length, 0); assert.equal(h.renders.length, 1);
    assert.match(h.table().summary, /commit links unavailable/);
    h.finish(0); await h.settle();
    assert.match(h.html(), /offline or missing repository/);
    assert.doesNotMatch(h.html(), /Map update pending|accepted History response/);
    h.patch({ repos: [{ id: "Repo" }] }); await h.settle();
    assert.equal(h.calls.length, 1);
    h.respond(0, []); await h.settle(); h.finish(1); await h.settle();
    assert.match(h.table().summary, /0 commit links/);
    assert.match(h.html(), /last accepted History response/);
  });
});

test("online-to-offline replacement qualifies the retained SVG while Mermaid is pending or fails", async () => {
  for (const fail of [false, true]) await withGraph({}, async (h) => {
    await h.settle(); h.respond(0, history(h.props.tasks)); await h.settle(); h.finish(0); await h.settle();
    h.patch({ repos: [] }); await h.settle();
    assert.equal(h.calls.length, 1, "offline transition makes no additional API call");
    assert.match(h.table().summary, /commit links unavailable/);
    assert.match(h.html(), /offline or missing repository/);
    assert.match(h.html(), /Map update pending; any visible diagram is from its previous accepted render/);
    assert.equal(nodes(h.tree).find((node) => node.type === h.subjects.GraphShell).props.svg, '<svg data-render="0"/>');
    if (fail) h.renders[1].result.reject(new Error("offline diagram fault")); else h.finish(1);
    await h.settle();
    assert.match(h.table().summary, /commit links unavailable/);
    if (fail) assert.match(h.html(), /Latest map update failed; any visible diagram is from its previous accepted render/);
    else assert.doesNotMatch(h.html(), /previous accepted render|Map update pending/);
  });
});

test("module failure keeps accepted History but only exposes actual Reload recovery", async () => {
  await withGraph({}, async (h) => {
    await h.settle(); h.respond(0, []); await h.settle();
    h.renders[0].result.reject(new deps.MermaidModuleLoadError("controlled module failure")); await h.settle();
    assert.match(h.table().summary, /0 commit links/);
    const buttons = nodes(h.tree).filter((node) => node.type === "button");
    assert.equal(buttons.some((node) => node.props.children === "Retry map"), false);
    buttons.find((node) => node.props.children === "Reload page").props.onClick();
    assert.equal(h.reloads, 1);
    h.patch({ tasks: [{ ...task(), title: "change" }] }); await h.settle();
    assert.equal(h.calls.length, 1, "module failure does not retry automatic work");
  });
});

test("stale semantic History cannot publish; the trailing current refresh observes its own page", async () => {
  await withGraph({ ignoreAbort: true }, async (h) => {
    await h.settle(); h.patch({ tasks: [{ ...task(), title: "Current task" }] }); await h.settle();
    assert.equal(h.calls.length, 1, "same-plan change coalesces behind current owner");
    h.respond(0, history([task()])); await h.settle();
    assert.equal(h.renders.length, 0, "stale semantic response never publishes rows or renders");
    assert.equal(h.calls.length, 2);
    assert.match(h.table().summary, /commit links unavailable/);
    assert.equal(h.table().rows[0].title, "Current task");
    h.respond(1, []); await h.settle(); h.finish(0); await h.settle();
    assert.match(h.table().summary, /0 commit links/);
  });
});

test("actual selection clears observations and fences late old generation completion", async () => {
  const tasks = [task(), task("A.1", "Other", "Plan.txt")];
  await withGraph({ ignoreAbort: true, props: { tasks, repos: [{ id: "Repo" }, { id: "Other" }] } }, async (h) => {
    await h.settle(); h.choose("Other"); h.render();
    assert.deepEqual(h.table().identity, ["relationship-alternative", "Other", "Plan.txt"]);
    assert.match(h.table().summary, /commit links unavailable/);
    assert.ok(h.calls[0].signal.aborted);
    await h.settle(); h.respond(0, history([tasks[0]])); await h.settle();
    assert.equal(h.renders.length, 0);
    h.respond(1, history([tasks[1]], "b".repeat(40))); await h.settle(); h.finish(0); await h.settle();
    assert.deepEqual(h.table().rows[0].commits, ["b".repeat(40)]);
    assert.deepEqual(h.table().identity, ["relationship-alternative", "Other", "Plan.txt"]);
  });
});

test("defensive direct selection replacement never assigns foreign accepted rows to the new identity", async () => {
  const tasks = [task(), task("A.2", "Other", "Plan.txt")];
  await withGraph({ props: { tasks, repos: [{ id: "Repo" }, { id: "Other" }] } }, async (h) => {
    await h.settle(); h.respond(0, history([tasks[0]])); await h.settle(); h.finish(0); await h.settle();
    h.patch({ selection: { repoId: "Other", planFile: "Plan.txt" } }); h.render();
    assert.equal(h.table().rows[0].taskId, "A.2");
    assert.match(h.table().summary, /commit links unavailable/);
    assert.deepEqual(h.table().identity, ["relationship-alternative", "Other", "Plan.txt"]);
  });
});

test("unmount aborts work and ignores transport or render results that arrive later", async () => {
  for (const stage of ["history", "render"]) await withGraph({ ignoreAbort: true, ignoreRenderAbort: true }, async (h) => {
    await h.settle();
    if (stage === "render") { h.respond(0, history(h.props.tasks)); await h.settle(); }
    h.unmount(); const writes = h.writes.length;
    assert.ok(h.calls[0].signal.aborted);
    if (stage === "history") h.respond(0, history(h.props.tasks)); else h.finish(0);
    await flush();
    assert.equal(h.writes.length, writes, "late outcomes do not write state after cleanup");
  });
});

test("a foreground render deadline retains observed History but rejects the late diagram result", async () => {
  await withGraph({ props: { selection: null } }, async (h) => {
    await h.settle(); h.choose(); await h.settle(); h.respond(0, history(h.props.tasks)); await h.settle();
    const context = h.renders[0].context;
    assert.equal(context.origin, "foreground"); assert.ok(context.generation > 0);
    assert.equal(context.signal, h.calls[0].signal); assert.ok(Number.isFinite(context.deadlineAt));
    const [id, timer] = [...h.timers][0]; h.timers.delete(id); timer.callback(); await h.settle();
    assert.match(h.table().summary, /1 commit link;/);
    assert.match(h.html(), /last accepted History response/);
    assert.match(h.html(), /timed out after 10 seconds/);
    const writes = h.writes.length; h.finish(0, '<svg data-stale="true"/>'); await flush();
    assert.equal(h.writes.length, writes);
    assert.equal(nodes(h.tree).some((node) => node.type === h.subjects.GraphShell), false);
    assert.equal(h.statuses.some((message) => message === "Relationship map ready."), false);
  });
});

test("harness restores globals even when the test body or cleanup assertion fails", async () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalFetch = Object.getOwnPropertyDescriptor(globalThis, "fetch");
  await assert.rejects(withGraph({}, async () => { throw new Error("body sentinel"); }), /body sentinel/);
  assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis, "window"), originalWindow);
  assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis, "fetch"), originalFetch);
  await assert.rejects(withGraph({}, async (h) => { h.timers.set("unused", {}); }), /action timers cleared/);
  assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis, "window"), originalWindow);
  assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis, "fetch"), originalFetch);
});

// Actual shared disclosure and paging hooks, driven through their real JSX
// callbacks. No copied sorting, page arithmetic or identity reset algorithm.
function tableHarness (initial) {
  const cells = [], pending = new Set(); let cursor, dirty, tree, props = initial;
  const equal = (a, b) => !!a && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const hooks = {
    useState(value) { const index = cursor++; const cell = cells[index] ??= { value };
      return [cell.value, (next) => { const value = typeof next === "function" ? next(cell.value) : next;
        if (!Object.is(value, cell.value)) { cell.value = value; dirty = true; } }]; },
    useRef(current) { return cells[cursor++] ??= { current }; },
    useMemo(callback, deps) { const index = cursor++; if (!cells[index] || !equal(cells[index].deps, deps))
      cells[index] = { deps, value: callback() }; return cells[index].value; },
    useCallback(callback, deps) { return hooks.useMemo(() => callback, deps); },
    useId() { return ":relationship-data:"; },
    useEffect(callback, deps) { const index = cursor++; if (!cells[index] || !equal(cells[index].deps, deps)) {
      cells[index] = { deps, callback }; pending.add(index); } },
  };
  const Table = makeTable(React, deps, hooks);
  const render = () => { cursor = 0; dirty = false; tree = Table(props); return tree; };
  const settle = () => { for (let i = 0; i < 20; i++) { render();
    for (const index of [...pending]) { pending.delete(index); cells[index].callback(); }
    if (!dirty) return tree; } assert.fail("table effects converge"); };
  settle();
  return { get tree() { return tree; }, settle, render,
    replace(next) { props = next; return render(); },
    toggle() { nodes(tree).find((node) => node.type === deps.ControlButton).props.onClick(); settle(); },
    pager() { return nodes(tree).find((node) => node.type === deps.CollectionPager)?.props; },
    rows() { const body = nodes(tree).find((node) => node.type === "tbody"); return nodes(body).filter((node) => node.type === "tr"); },
  };
}

test("complete task rows, actual 50-row disclosure pager and identity reset remain independent of graph cap", async () => {
  const tasks = Array.from({ length: 101 }, (_, index) => task(`T.${String(index).padStart(3, "0")}`));
  await withGraph({ props: { tasks } }, async (h) => {
    const table = tableHarness(h.table());
    assert.equal(table.rows().length, 0, "actual disclosure starts closed"); table.toggle();
    assert.equal(table.rows().length, 50);
    assert.equal(table.pager().page.totalItems, 101);
    assert.equal(table.pager().page.pageSize, 50);
    assert.equal(nodes(table.tree).filter((node) => node.type === "th").length, 5);
    assert.equal(nodes(table.rows()[0]).filter((node) => node.type === "td")[3].props.children, "Unavailable");
    table.pager().onPageChange(3); table.settle(); assert.equal(table.rows().length, 1);
    assert.equal(table.rows()[0].key, JSON.stringify([tasks[100].task_ref, tasks[100].task_id]));
    await h.settle(); h.respond(0, history(tasks)); await h.settle();
    assert.equal(h.renders[0].prepared.shown, 10);
    assert.equal(h.renders[0].prepared.capped, 91);
    assert.equal(h.table().rows.length, 101);
    assert.match(h.table().summary, /101 tasks; 101 commit links/);
    table.replace(h.table()); table.settle();
    assert.equal(table.rows().length, 1, "same identity retains page and disclosure");
    assert.equal(nodes(table.rows()[0]).filter((node) => node.type === "td")[3].props.children, "a".repeat(10));
    table.replace({ ...h.table(), identity: ["relationship-alternative", "Other", "Plan.txt"] });
    assert.equal(table.rows().length, 0, "different repo identity closes before its passive reset");
    table.settle(); table.toggle(); assert.equal(table.rows().length, 50); assert.equal(table.pager().page.page, 1);
    table.replace({ ...h.table(), identity: ["relationship-alternative", "Other", "Other.txt"] });
    assert.equal(table.rows().length, 0, "plan identity also resets disclosure");
    h.finish(0); await h.settle();
    assert.match(h.html(), /showing 10 of 101 tasks/);
    const graph = nodes(h.tree).find((node) => node.type === h.subjects.GraphShell);
    graph.props.onExpand(); h.render();
    const dialog = nodes(h.tree).find((node) => node.type === h.subjects.DialogShell);
    assert.equal(dialog.props.title, "Relationship map — expanded");
    assert.ok(nodes(dialog).find((node) => node.type === h.subjects.GraphShell).props.tall);
    dialog.props.onClose(); h.render(); assert.equal(nodes(h.tree).some((node) => node.type === h.subjects.DialogShell), false);
  });
});

test("actual invalid selection is cleared and same-stack choice cancellation preserves the latest owner", async () => {
  await withGraph({ props: { selection: { repoId: "missing", planFile: "absent.txt" } } }, async (h) => {
    await h.settle(); assert.equal(h.props.selection, null); assert.equal(h.table(), undefined);
    assert.equal(h.calls.length, 0);
    h.choose(); h.choose(); await h.settle();
    assert.equal(h.calls.length, 1); assert.equal(h.timers.size, 1);
    h.respond(0, []); await h.settle(); h.finish(0); await h.settle();
    assert.equal(h.timers.size, 0); assert.match(h.table().summary, /0 commit links/);
    h.patch({ tasks: [] }); await h.settle();
    assert.equal(h.props.selection, null); assert.equal(h.table(), undefined);
    assert.equal(nodes(h.tree).some((node) => node.type === h.subjects.GraphShell), false);
  });
});

const sha = (text) => createHash("sha256").update(text).digest("hex");
test("strict reviewed restoration preserves all five original baselines for LF and CRLF", () => {
  const current = read("OverviewView.tsx");
  assert.equal(sha(JSON.stringify(RELATIONSHIP_CHANGES)), RELATIONSHIP_CHANGES_SHA);
  const lf = current.replace(/\r\n/g, "\n");
  for (const text of [lf, lf.replace(/\n/g, "\r\n")]) {
    const original = restoreRelationshipHistory(text);
    assert.equal(original.includes("\r\n"), text.includes("\r\n"), "restoration retains physical newline style");
    assert.equal(sha(original.replace(/\r\n/g, "\n")), ORIGINAL_OVERVIEW_LF_SHA);
    const raw = original.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n");
    assert.equal(sha(raw), "0490678030e9f4a210b0e70a288f131eae2afee578ede5b126eab9fdc03c164a");
    const source = parse(raw), fn = declaration(source, "GraphPanel"), printer = ts.createPrinter({ removeComments: true });
    assert.equal(sha(printer.printNode(ts.EmitHint.Unspecified, fn, source)),
      "4c58443bebedb1281f4d0a2039f3cbb7bfafdea8cb7bece553f6ae7c3399016e");
    let before = fn.body.statements.slice(0, -1).map((node) => printer.printNode(ts.EmitHint.Unspecified, node, source)).join("\n");
    const hint = "tasks — open Tasks for the rest";
    assert.equal(before.split(hint).length - 1, 1);
    before = before.replace(hint, "tasks — see the sidebar for the rest");
    assert.equal(sha(before), "eea773b956bb8ff5409f079216b93e60cd13b4582d52e88a46d6b4fef05a7131");
    assert.equal(sha(raw.slice(0, fn.getStart(source)) + raw.slice(fn.end)),
      "ebeb751994cf991fa0e1a7f57158a4d406473ed6e07120f03b84943bac0d2194");
  }
});

test("strict restoration rejects missing, partial, repeated and unrelated owner edits", () => {
  const current = read("OverviewView.tsx").replace(/\r\n/g, "\n");
  for (const change of RELATIONSHIP_CHANGES) {
    assert.ok(current.includes(change.after));
    assert.throws(() => restoreRelationshipHistory(current.replace(change.after, change.before)), undefined,
      `reject missing ${change.name}`);
    assert.throws(() => restoreRelationshipHistory(current.replace(change.after, `${change.after}\n${change.after}`)), undefined,
      `reject repeated ${change.name}`);
  }
  for (const [from, to] of [
    ['historyObserved: false, rows: []', 'historyObserved: true, rows: []'],
    ['graphRows.selectionKey === selectedValue && graphRows.historyObserved', 'graphRows.historyObserved'],
    ['500, 0, owner.controller.signal', '499, 0, owner.controller.signal'],
    ['owner.controller.signal.aborted', 'false'],
    ['setBusy(false);', 'setBusy(true);'],
    ['const MIN = 0.08, MAX = 6.5, STEP = 0.14;', 'const MIN = 0.08, MAX = 7, STEP = 0.14;'],
  ]) {
    assert.ok(current.includes(from), `negative mutation actually targets ${from}`);
    assert.throws(() => restoreRelationshipHistory(current.replace(from, to)), undefined, `reject ${to}`);
  }
  const source = parse(current), owner = declaration(source, "GraphPanel").getText(source);
  assert.throws(() => restoreRelationshipHistory(`${current}\n${owner}`), /one complete GraphPanel owner/);
  assert.throws(() => restoreRelationshipHistory(restoreRelationshipHistory(current)), /exact state cardinality/);
});
