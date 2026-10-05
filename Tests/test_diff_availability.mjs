import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(resolve(root, "Frontend/package.json"));
const ts = require("typescript");
const React = require("react");
const read = name => readFileSync(resolve(root, "Frontend/src", name), "utf8");
const parse = name => ts.createSourceFile(name, read(name), ts.ScriptTarget.Latest, true);
const app = parse("App.tsx"), ui = parse("ui.tsx");
const extract = (tree, name) => {
  const nodes = tree.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === name
    || ts.isVariableStatement(node) && node.declarationList.declarations.some(item => item.name.getText(tree) === name));
  assert.equal(nodes.length, 1, `one actual declaration: ${name}`);
  return nodes[0].getText(tree).replace(/^export\s+/, "");
};
const emit = source => ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React,
} }).outputText;
const loadApi = new Function("exports", "window", "fetch", emit(read("api.ts")));
const loadViews = new Function("React", "hooks", "deps", emit(`
  const {useState, useRef, useEffect, useCallback} = hooks;
  const {api, createActionDeadline, isAbortError, document, hasOverlayLease} = deps;
  // Untouched visual/session dependencies are inert for this session-less fixture.
  const ModeBadge = () => null, SessionDot = () => null;
  const eventSessionIdentity = () => null, fmtRel = (value) => value;
  const {forwardRef} = React;
  const ControlButton = ({children, ...props}) => React.createElement("button", props, children);
  const ChevronLeftIcon = () => null, ChevronRightIcon = () => null;
  ${["cx", "getBoundedPageWindow", "collectionIdentityKey", "useBoundedPage", "CollectionPager"]
    .map(name => extract(ui, name)).join("\n")}
  ${extract(app, "DiffView")}
  ${extract(app, "EventRow")}
  return {EventRow, DiffView, CollectionPager};
`));

function retainedHooks () {
  const cells = [], effects = [];
  let cursor = 0, writes = 0;
  const changed = (old, next) => !old || !next || old.length !== next.length
    || next.some((value, index) => !Object.is(value, old[index]));
  return {
    reset() { cursor = 0; },
    get writes() { return writes; },
    useState(initial) {
      const index = cursor++;
      if (!cells[index]) cells[index] = { value: typeof initial === "function" ? initial() : initial };
      return [cells[index].value, value => {
        cells[index].value = typeof value === "function" ? value(cells[index].value) : value;
        writes++;
      }];
    },
    useRef(initial) {
      const index = cursor++;
      return cells[index] ??= { current: initial };
    },
    useCallback(callback, dependencies) {
      const index = cursor++;
      if (changed(cells[index]?.dependencies, dependencies)) cells[index] = { callback, dependencies };
      return cells[index].callback;
    },
    useEffect(callback, dependencies) {
      const index = cursor++;
      if (changed(cells[index]?.dependencies, dependencies)) {
        const previous = cells[index];
        cells[index] = { dependencies };
        effects.push(() => { previous?.cleanup?.(); cells[index].cleanup = callback(); });
      }
    },
    flush() { for (const effect of effects.splice(0)) effect(); },
    cleanup() { for (const cell of cells) cell?.cleanup?.(); },
  };
}

const fixture = { id: 7, repo_id: "Repo A", file: "src/long path/a.ts", commit_hash: "abc123",
  ts: "2026-10-05T00:00:00Z", mode: "B", swept: 0, task_ref: null,
  provider: null, session_id: null, branch: null, tool: "Edit" };
const online = [{ id: fixture.repo_id, offline: false }];
const offline = [{ id: fixture.repo_id, offline: true }];
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const walk = tree => {
  if (Array.isArray(tree)) return tree.flatMap(walk);
  if (!React.isValidElement(tree)) return [];
  return [tree, ...walk(tree.props.children)];
};
const text = tree => Array.isArray(tree) ? tree.map(text).join("")
  : React.isValidElement(tree) ? text(tree.props.children)
    : tree === null || tree === undefined || typeof tree === "boolean" ? "" : String(tree);
const control = (tree, prefix) => walk(tree).find(node => node.type === "button"
  && node.props["aria-label"]?.startsWith(prefix));

// Controlled hooks/fetch/timers and DOM boundaries exercise actual source, not native focus.
function harness () {
  const hooks = retainedHooks(), requests = [], timers = new Map(), statuses = [], focused = [];
  let nextTimer = 0;
  const state = { overlay: false };
  const document = { activeElement: null, body: { dataset: {
    get overlayOpen() { return state.overlay ? "1" : undefined; },
  } } };
  const node = { isConnected: true, inert: false, ancestorInert: false, containsTarget: true,
    contains(target) { return this.containsTarget && target === button; },
    closest(selector) { assert.equal(selector, "[inert]"); return this.inert || this.ancestorInert ? this : null; },
    focus(options) { focused.push(options); document.activeElement = this; } };
  const button = { isConnected: true };
  const window = {
    setTimeout(callback, delay) { const id = ++nextTimer; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
  };
  const fetch = (url, init) => new Promise((resolve, reject) => requests.push({ url, init, resolve, reject }));
  const apiExports = {};
  loadApi(apiExports, window, fetch);
  const deps = { ...apiExports, document, hasOverlayLease: () => state.overlay };
  const views = loadViews(React, hooks, deps);
  const diffHooks = retainedHooks(), diffViews = loadViews(React, diffHooks, deps);
  let tree;
  return {
    requests, timers, statuses, focused, hooks, document, node, button, state,
    render(repos = online) {
      hooks.reset();
      tree = views.EventRow({ event: fixture, repos, onStatus: message => statuses.push(message) });
      // Mount the actual rendered React ref, never mutate private component state.
      if (typeof tree.ref === "function") tree.ref(node);
      else if (tree.ref) tree.ref.current = node;
      hooks.flush();
      return tree;
    },
    click(prefix, target = button) {
      const action = control(tree, prefix);
      assert.ok(action, `actual ${prefix} action exists`);
      assert.equal(action.props.disabled, false);
      action.props.onClick({ currentTarget: target });
    },
    async accept(value, index = requests.length - 1) {
      requests[index].resolve({ ok: true, status: 200,
        json: async () => ({ success: true, data: { file: fixture.file, diff: value } }) });
      await settle();
    },
    diffElement() { return walk(tree).find(element => element.type === views.DiffView); },
    renderDiff() {
      const element = this.diffElement();
      assert.ok(element, "actual accepted DiffView stays mounted");
      diffHooks.reset();
      const diff = diffViews.DiffView(element.props);
      diffHooks.flush();
      return diff;
    },
    pager(diff) {
      const element = walk(diff).find(entry => entry.type === diffViews.CollectionPager);
      assert.ok(element, "actual bounded pager exists");
      return element.type.render(element.props, null);
    },
    unmount() { hooks.cleanup(); diffHooks.cleanup(); if (tree?.ref) tree.ref.current = null; },
  };
}

test("accepted diffs, including empty strings, retain local Hide offline and reconnect Show", async () => {
  for (const value of ["@@ -1 +1 @@\n-old\n+new", ""]) {
    const h = harness();
    h.render(); h.click("Show diff");
    assert.equal(h.requests.length, 1);
    const request = new URL(h.requests[0].url, "http://fixture.invalid");
    assert.equal(request.pathname, "/api/diff");
    assert.equal(request.searchParams.get("repo"), fixture.repo_id);
    assert.equal(request.searchParams.get("file"), fixture.file);
    assert.equal(request.searchParams.get("commit"), fixture.commit_hash);
    await h.accept(value);
    const tree = h.render(offline);
    assert.ok(control(tree, "Hide diff"), "retained offline diff must be dismissible");
    assert.equal(h.diffElement().props.text, value);
    assert.match(text(tree), /Repository offline.*previously loaded diff.*Hide remains available/i);
    h.click("Hide diff");
    const closed = h.render(offline);
    assert.equal(h.diffElement(), undefined);
    assert.equal(control(closed, "Show diff"), undefined);
    assert.equal(control(closed, "Retry diff"), undefined);
    assert.equal(h.requests.length, 1, "offline Hide is local");
    assert.equal(h.timers.size, 0);
    assert.ok(control(h.render(), "Show diff"), "availability recovery restores Show");
  }
});

test("offline Hide focuses only its connected, contained, active owned row without an overlay", async () => {
  const cases = ["owned", "online", "other focus", "detached", "inert", "ancestor inert", "overlay", "outside"];
  for (const scenario of cases) {
    const h = harness(); h.render(); h.click("Show diff"); await h.accept("+line");
    h.document.activeElement = scenario === "other focus" ? {} : h.button;
    h.node.isConnected = scenario !== "detached";
    h.node.inert = scenario === "inert";
    h.node.ancestorInert = scenario === "ancestor inert";
    h.node.containsTarget = scenario !== "outside";
    h.state.overlay = scenario === "overlay";
    const repos = scenario === "online" ? online : offline;
    const tree = h.render(repos);
    assert.equal(tree.props.role, "group");
    assert.equal(tree.props.tabIndex, -1);
    assert.ok(tree.props["aria-label"].includes(fixture.repo_id));
    assert.ok(tree.props["aria-label"].includes(fixture.file));
    assert.match(tree.props.className, /focus-visible:ring/);
    assert.deepEqual(h.focused, [], "availability updates never move focus");
    h.click("Hide diff");
    h.render(repos);
    assert.deepEqual(h.focused, scenario === "owned" ? [{ preventScroll: true }] : [], scenario);
    assert.equal(h.requests.length, 1);
  }
});

test("closed offline and missing repositories never offer a fetch; a pending offline load remains honest", async () => {
  for (const repos of [offline, []]) {
    const h = harness();
    assert.equal(control(h.render(repos), "Show diff"), undefined);
    assert.equal(h.requests.length, 0);
  }
  const h = harness();
  const initialAction = control(h.render(), "Show diff");
  h.click("Show diff");
  initialAction.props.onClick({ currentTarget: h.button });
  assert.equal(h.requests.length, 1, "same-turn repeated activation keeps the existing busy owner");
  const onlinePending = h.render();
  assert.equal(control(onlinePending, "Loading diff").props.disabled, true);
  assert.equal(control(onlinePending, "Loading diff").props["aria-busy"], true);
  const pending = h.render(offline);
  assert.match(text(pending), /Repository offline.*(?:loading|load) may fail/i);
  assert.equal((text(pending).match(/Repository offline/gi) ?? []).length, 1);
  assert.equal(h.requests[0].init.signal.aborted, false, "availability change does not cancel the owner");
  await h.accept("+late accepted");
  assert.ok(control(h.render(offline), "Hide diff"));
  assert.doesNotMatch(text(h.render(offline)), /(?:loading|load) may fail/i);
});

test("transport, HTTP, and deadline failures give availability-correct recovery and retry succeeds", async () => {
  for (const kind of ["transport", "http", "timeout"]) {
    const h = harness(); h.render(); h.click("Show diff"); h.render(offline);
    if (kind === "http") h.requests[0].resolve({ ok: false, status: 503,
      json: async () => ({ success: false, message: "Fixture unavailable" }) });
    else {
      if (kind === "timeout") {
        assert.equal(h.timers.size, 1);
        const timer = [...h.timers.values()][0];
        assert.equal(timer.delay, 10_000); timer.callback();
        assert.equal(h.requests[0].init.signal.aborted, true);
      }
      h.requests[0].reject(kind === "timeout" ? new DOMException("aborted", "AbortError") : new Error("Fixture transport"));
    }
    await settle();
    const failed = h.render(offline);
    assert.match(text(failed), /restore repository availability before retrying/i);
    assert.doesNotMatch(text(failed), /Use .retry diff|previously loaded|(?:loading|load) may fail/i);
    assert.equal(control(failed, "Retry diff"), undefined);
    assert.equal(h.statuses.length, 1);
    assert.doesNotMatch(h.statuses[0], /Retry is available/);
    assert.match(h.statuses[0], /row.*recovery/i);
    if (kind === "timeout") assert.match(text(failed), /timed out after 10 seconds/);
    assert.equal(h.timers.size, 0);
    const recovered = h.render();
    assert.ok(control(recovered, "Retry diff"));
    assert.match(text(recovered), /retry diff/i);
    h.click("Retry diff");
    assert.equal(h.requests.length, 2);
    assert.doesNotMatch(text(h.render()), /Fixture transport|Fixture unavailable|timed out/);
    await h.accept("+recovered");
    assert.ok(control(h.render(), "Hide diff"));
  }
});

test("late settlement after actual cleanup cannot publish diff, error or busy state", async () => {
  for (const outcome of ["accept", "reject", "abort"]) {
    const h = harness(); h.render(); h.click("Show diff"); h.render(offline);
    h.unmount();
    assert.equal(h.requests[0].init.signal.aborted, true);
    const writes = h.hooks.writes;
    if (outcome === "accept") await h.accept("+late");
    else {
      h.requests[0].reject(outcome === "abort" ? new DOMException("aborted", "AbortError") : new Error("late"));
      await settle();
    }
    assert.equal(h.hooks.writes, writes);
    assert.deepEqual(h.statuses, []);
    assert.deepEqual(h.focused, []);
    assert.equal(h.timers.size, 0);
  }
});

test("retained offline DiffView keeps actual fifty-line paging and hunk classification", async () => {
  const h = harness(); h.render(); h.click("Show diff");
  await h.accept(["@@ -1 +1 @@", ...Array.from({ length: 100 }, (_, index) => `+line${index}`)].join("\n"));
  h.render(offline);
  const first = h.renderDiff();
  const region = walk(first).find(node => node.type === "pre");
  assert.equal(region.props["aria-label"], "File diff");
  assert.equal(region.props.tabIndex, 0);
  assert.equal(React.Children.count(region.props.children), 50);
  assert.match(text(h.pager(first)), /1.50 of 101/);
  const pager = h.pager(first);
  const next = walk(pager).find(node => node.props["aria-label"] === "Diff lines: next page");
  next.props.onClick();
  const second = h.renderDiff();
  assert.match(text(h.pager(second)), /51.100 of 101/);
  const lines = walk(second).filter(node => node.type === "span" && node.props.className === "text-emerald-400");
  assert.equal(lines.length, 50);
  assert.equal(text(lines[0]), "+line49\n");
  walk(h.pager(second)).find(node => node.props["aria-label"] === "Diff lines: next page").props.onClick();
  const last = h.renderDiff();
  assert.match(text(h.pager(last)), /101.101 of 101/);
  assert.equal(React.Children.count(walk(last).find(node => node.type === "pre").props.children), 1);
  assert.equal(h.requests.length, 1, "local diff paging never fetches");
  assert.ok(control(h.render(offline), "Hide diff"));
});
