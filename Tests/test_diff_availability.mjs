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

// v0.4.0.25: appended diff disclosure regressions.
// The complete original 311-line test prefix above remains byte-identical.
import { restoreGitGraphBoundaryCopy, restoreGitGraphOracleAdapters } from "./helpers/gitGraphMergeSeed.mjs";
import { restoreChangesWorkbench, restoreChangesWorkbenchOracleAdapters } from "./helpers/changesWorkbench.mjs";
async function withDisclosure (body) {
  const h = harness();
  try { await body(h); }
  finally {
    try { h.unmount(); }
    finally {
      // This existing fixture fetch does not subscribe to AbortSignal. Retire
      // every pending mock response explicitly so actual finally clears timers.
      for (const request of h.requests) request.reject(new DOMException("Fixture cleanup", "AbortError"));
      await settle();
      assert.equal(h.timers.size, 0, "new disclosure fixture leaves no deadline");
    }
  }
}

for (const [name, value] of [
  ["hunk", "@@ -1 +1 @@\n-old\n+new"],
  ["empty string", ""],
  ["explanatory response", "(no changes vs HEAD)"],
]) {
  test(`accepted ${name} declares expanded only after actual DiffView mounts`, () => withDisclosure(async (h) => {
    h.render(); h.click("Show diff"); await h.accept(value);
    const tree = h.render(), button = control(tree, "Hide diff");
    assert.ok(h.diffElement(), "accepted content mounts the actual DiffView");
    assert.equal(h.diffElement().props.text, value);
    assert.equal(button.props["aria-expanded"], true, "mounted accepted content must be exposed as expanded");
  }));
}

test("closed and pending native controls are collapsed without changing busy labels or duplicate guard", () => withDisclosure(async (h) => {
  const closed = control(h.render(), "Show diff");
  assert.equal(closed.type, "button"); assert.equal(closed.props["aria-expanded"], false);
  assert.equal(closed.props.disabled, false); assert.equal(closed.props["aria-busy"], false);
  assert.equal(closed.props.onKeyDown, undefined); assert.equal(closed.props["aria-controls"], undefined);
  h.click("Show diff"); closed.props.onClick({ currentTarget: h.button });
  const pending = control(h.render(), "Loading diff");
  assert.equal(pending.props["aria-expanded"], false); assert.equal(pending.props.disabled, true);
  assert.equal(pending.props["aria-busy"], true); assert.equal(h.diffElement(), undefined);
  assert.equal(h.requests.length, 1); assert.equal(h.timers.size, 1);
  const { renderToStaticMarkup } = require("react-dom/server");
  assert.match(renderToStaticMarkup(pending), /aria-expanded="false"/);
  assert.match(renderToStaticMarkup(pending), /aria-busy="true"/);
  assert.equal(control(h.render(offline), "Loading diff"), undefined);
  assert.equal(h.requests[0].init.signal.aborted, false);
  await h.accept("(no changes vs HEAD)");
  const accepted = control(h.render(offline), "Hide diff");
  assert.equal(accepted.props["aria-expanded"], true);
  assert.match(renderToStaticMarkup(accepted), /aria-expanded="true"/);
}));

for (const kind of ["transport", "http", "timeout"]) {
  test(`${kind} failure stays collapsed; Retry acceptance and offline Hide preserve honest state`, () => withDisclosure(async (h) => {
    h.render(); h.click("Show diff");
    if (kind === "http") h.requests[0].resolve({ ok: false, status: 503,
      json: async () => ({ success: false, message: "Disclosure fixture unavailable" }) });
    else {
      if (kind === "timeout") {
        const timer = [...h.timers.values()][0]; assert.equal(timer.delay, 10_000); timer.callback();
        assert.equal(h.requests[0].init.signal.aborted, true);
      }
      h.requests[0].reject(kind === "timeout" ? new DOMException("Deadline", "AbortError") : new Error("Disclosure fixture transport"));
    }
    await settle();
    const failed = h.render(), retry = control(failed, "Retry diff");
    assert.equal(retry.props["aria-expanded"], false); assert.equal(retry.props.disabled, false);
    assert.equal(retry.props["aria-busy"], false); assert.equal(h.diffElement(), undefined);
    assert.match(text(failed), kind === "timeout" ? /timed out after 10 seconds/ : /Disclosure fixture/);
    assert.equal(h.timers.size, 0); assert.equal(h.statuses.length, 1);
    h.click("Retry diff"); assert.equal(control(h.render(), "Loading diff").props["aria-expanded"], false);
    assert.equal(h.requests.length, 2); await h.accept("");
    assert.equal(control(h.render(offline), "Hide diff").props["aria-expanded"], true);
    assert.equal(h.diffElement().props.text, "");
    h.document.activeElement = h.button; h.click("Hide diff");
    const hidden = h.render(offline); assert.equal(h.diffElement(), undefined);
    assert.equal(control(hidden, "Show diff"), undefined); assert.equal(control(hidden, "Hide diff"), undefined);
    assert.deepEqual(h.focused, [{ preventScroll: true }]); assert.equal(h.requests.length, 2);
    assert.equal(control(h.render(), "Show diff").props["aria-expanded"], false);
  }));
}

test("accepted diff paging keeps expanded true and Hide resets false without a request", () => withDisclosure(async (h) => {
  h.render(); h.click("Show diff");
  await h.accept(["@@ -1 +1 @@", ...Array.from({ length: 100 }, (_, index) => `+row${index}`)].join("\n"));
  for (const count of [50, 50, 1]) {
    assert.equal(control(h.render(offline), "Hide diff").props["aria-expanded"], true);
    const diff = h.renderDiff(), region = walk(diff).find((node) => node.type === "pre");
    assert.equal(React.Children.count(region.props.children), count); assert.equal(region.props["aria-label"], "File diff");
    if (count === 50) walk(h.pager(diff)).find((node) => node.props["aria-label"] === "Diff lines: next page").props.onClick();
  }
  assert.equal(h.requests.length, 1); h.render(); h.click("Hide diff");
  assert.equal(control(h.render(), "Show diff").props["aria-expanded"], false); assert.equal(h.diffElement(), undefined);
  assert.equal(h.requests.length, 1);
}));

test("cleanup prevents late disclosure acceptance, failure and busy writes", async () => {
  for (const outcome of ["accept", "reject", "abort"]) await withDisclosure(async (h) => {
    assert.equal(control(h.render(), "Show diff").props["aria-expanded"], false);
    h.click("Show diff"); assert.equal(control(h.render(), "Loading diff").props["aria-expanded"], false);
    h.unmount(); const writes = h.hooks.writes; assert.equal(h.requests[0].init.signal.aborted, true);
    if (outcome === "accept") await h.accept("+late");
    else {
      h.requests[0].reject(outcome === "abort" ? new DOMException("Late abort", "AbortError") : new Error("Late error"));
      await settle();
    }
    assert.equal(h.hooks.writes, writes); assert.deepEqual(h.statuses, []); assert.equal(h.timers.size, 0);
  });
});

test("new disclosure fixtures clean pending deadlines even when an assertion fails", async () => {
  let captured;
  await assert.rejects(withDisclosure(async (h) => {
    captured = h; h.render(); h.click("Show diff"); assert.fail("disclosure assertion sentinel");
  }), /disclosure assertion sentinel/);
  assert.equal(captured.requests[0].init.signal.aborted, true);
  assert.equal(captured.timers.size, 0); assert.deepEqual(captured.statuses, []);
});

test("new disclosure fixtures settle pending responses even when unmount cleanup throws", async () => {
  let captured;
  await assert.rejects(withDisclosure(async (h) => {
    captured = h; h.render(); h.click("Show diff");
    const unmount = h.unmount;
    h.unmount = () => { unmount(); throw new Error("disclosure cleanup sentinel"); };
  }), /disclosure cleanup sentinel/);
  assert.equal(captured.requests[0].init.signal.aborted, true);
  assert.equal(captured.timers.size, 0); assert.deepEqual(captured.statuses, []);
});

const disclosureAst = value => ts.createSourceFile("App.tsx", value, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const disclosureOwner = ast => {
  assert.equal(ast.parseDiagnostics.length, 0);
  const owners = ast.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === "EventRow");
  assert.equal(owners.length, 1);
  return owners[0];
};
const disclosureReplaceOnce = (value, before, after) => {
  assert.equal(value.split(before).length, 2, "mutation reaches exactly one intended site");
  return value.replace(before, after);
};

test("strict disclosure restoration preserves original whole App, complete owner and outside bytes in LF and CRLF", async () => {
  const { createHash } = await import("node:crypto");
  const { canonicalPrintedText } = await import("./helpers/printed_source.mjs");
  const { restoreDiffDisclosureState, DIFF_DISCLOSURE_WINDOW, DIFF_DISCLOSURE_WINDOW_SHA } =
    await import("./helpers/diffDisclosureState.mjs");
  const { restoreWarningTimestampOrder } = await import("./helpers/warningTimestampOrder.mjs");
  const sha = value => createHash("sha256").update(value).digest("hex");
  const printer = ts.createPrinter({ removeComments: true });
  assert.equal(sha(DIFF_DISCLOSURE_WINDOW), DIFF_DISCLOSURE_WINDOW_SHA);
  const lf = restoreWarningTimestampOrder(restoreGitGraphBoundaryCopy(restoreChangesWorkbench(read("App.tsx")))).replace(/\r\n/g, "\n");
  for (const newline of ["\n", "\r\n"]) {
    const source = lf.replace(/\n/g, newline), restored = restoreDiffDisclosureState(source);
    const ast = disclosureAst(restored), owner = disclosureOwner(ast);
    const rawOwner = restored.slice(owner.getStart(ast), owner.end);
    assert.equal(sha(restored), newline === "\n"
      ? "6039a62e9897efa7b90e0e6acf8d8375df002976de01da17d7907a909669e226"
      : "dcdbf20d203a7fec413baa38ecd0c0a3971205049499125577467a5da9f7770c");
    assert.equal(sha(rawOwner), newline === "\n"
      ? "8fa1fe0abab91da81d1be8b48990f04075fc1589af81a77aed10c748eac87a44"
      : "4fb97797c610f7c52171c873716fbe5ba44fe8bea24cc07819018c0680476670");
    const statements = [...owner.body.statements];
    assert.ok(ts.isReturnStatement(statements.pop()));
    assert.equal(sha(statements.map(node => canonicalPrintedText(
      printer.printNode(ts.EmitHint.Unspecified, node, ast))).join("\n")),
    "82a0fcbdc83c2559febd75d234c3a859bf330fb897e1f370e457785fb4a6543a");
    if (newline === "\r\n") assert.equal(sha(restored.slice(0, owner.getStart(ast)) + restored.slice(owner.end)),
      "16635b0db9a8172aec55a5c85298145349d5c0195ab5736bd98b1ddc2d07e78d");
    const currentAst = disclosureAst(source), currentOwner = disclosureOwner(currentAst);
    assert.equal(restored.slice(0, owner.getStart(ast)), source.slice(0, currentOwner.getStart(currentAst)));
    assert.equal(restored.slice(owner.end), source.slice(currentOwner.end), "all non-owner bytes pass through unchanged");
  }
});

test("strict disclosure restoration rejects absent, repeated, partial, wrong-site and unrelated owner changes", async () => {
  const { restoreDiffDisclosureState, DIFF_DISCLOSURE_LINE, DIFF_DISCLOSURE_WINDOW } =
    await import("./helpers/diffDisclosureState.mjs");
  const source = read("App.tsx").replace(/\r\n/g, "\n");
  const ast = disclosureAst(source), owner = disclosureOwner(ast), originalOwner = owner.getText(ast);
  const changedOwner = body => source.slice(0, owner.getStart(ast)) + body + source.slice(owner.end);
  const cases = [
    disclosureReplaceOnce(originalOwner, DIFF_DISCLOSURE_LINE, ""),
    disclosureReplaceOnce(originalOwner, DIFF_DISCLOSURE_LINE, DIFF_DISCLOSURE_LINE.repeat(2)),
    disclosureReplaceOnce(originalOwner, DIFF_DISCLOSURE_LINE, "            aria-expanded={Boolean(diff)}\n"),
    disclosureReplaceOnce(originalOwner, DIFF_DISCLOSURE_LINE, "            aria-expanded={diff !== \"\"}\n"),
    disclosureReplaceOnce(originalOwner, DIFF_DISCLOSURE_LINE, "            aria-expanded={diff}\n"),
    disclosureReplaceOnce(originalOwner, DIFF_DISCLOSURE_WINDOW,
      DIFF_DISCLOSURE_LINE + "            disabled={diffBusy} aria-busy={diffBusy}\n            aria-label={diffBusy\n"),
    disclosureReplaceOnce(originalOwner, DIFF_DISCLOSURE_LINE,
      "            aria-expanded={false}\n" + DIFF_DISCLOSURE_LINE),
    disclosureReplaceOnce(originalOwner, "const generation = ++diffGenerationRef.current;", "const generation = diffGenerationRef.current;"),
    disclosureReplaceOnce(originalOwner, "if (diffBusyRef.current) return;", "if (!diffBusyRef.current) return;"),
    disclosureReplaceOnce(originalOwner, "{diff !== null && <DiffView", "{diff && <DiffView"),
  ];
  for (const modified of cases) assert.throws(() => restoreDiffDisclosureState(changedOwner(modified)),
    /EventRow|disclosure|expanded/, "every negative retains valid TSX but violates the reviewed owner");
  const without = disclosureReplaceOnce(originalOwner, DIFF_DISCLOSURE_LINE, "");
  assert.throws(() => restoreDiffDisclosureState(changedOwner(without)
    + "\nfunction WrongOwner() { return <button aria-expanded={diff !== null} />; }\n"), /EventRow expanded/);
  assert.throws(() => restoreDiffDisclosureState(source + "\n" + originalOwner), /one complete EventRow owner/);
  assert.throws(() => restoreDiffDisclosureState(source + "\nconst broken = <;"), /valid actual App syntax/);
});

test("disclosure restoration leaves unrelated History changes for its original negative oracles", async () => {
  const { restoreDiffDisclosureState } = await import("./helpers/diffDisclosureState.mjs");
  const source = read("App.tsx");
  const before = "Explore commit history and its linked captured events.", after = "Independent History sentinel.";
  assert.equal(restoreDiffDisclosureState(disclosureReplaceOnce(source, before, after)),
    disclosureReplaceOnce(restoreDiffDisclosureState(source), before, after));
});

test("all six old diff tests and every old History oracle survive exact append-only and two-site adaptations", async () => {
  const { createHash } = await import("node:crypto");
  const sha = value => createHash("sha256").update(value).digest("hex");
  const currentLF = readFileSync(fileURLToPath(import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const historyLF = restoreGitGraphOracleAdapters("test_history_graph_read_states.mjs", restoreChangesWorkbenchOracleAdapters("test_history_graph_read_states.mjs", readFileSync(resolve(root, "Tests/test_history_graph_read_states.mjs"), "utf8"))).replace(/\r\n/g, "\n");
  for (const newline of ["\n", "\r\n"]) {
    // Checkout newline conversion cannot excuse any changed token or old test.
    const current = Buffer.from(currentLF.replace(/\n/g, newline).replace(/\r\n/g, "\n"));
    const prefix = current.subarray(0, 15449), prefixText = prefix.toString("utf8");
    assert.equal(sha(prefix), "83d4e95e949a912fdf73b708526f514ed5a73e7afcdd91b79fc4da6639a28bd5");
    assert.equal(prefixText.split("\n").length - 1, 311);
    assert.equal((prefixText.match(/^test\(/gm) ?? []).length, 6);
    assert.ok(current.subarray(15449).toString("utf8").startsWith(
      "\n// v0.4.0.25: appended diff disclosure regressions.\n"));
    let history = historyLF.replace(/\n/g, newline).replace(/\r\n/g, "\n");
    history = disclosureReplaceOnce(history,
      'import { restoreWarningTimestampOrder } from "./helpers/warningTimestampOrder.mjs";\n', "");
    history = disclosureReplaceOnce(history,
      "const ast = parse(restoreDiffDisclosureState(restoreWarningTimestampOrder(text)));",
      "const ast = parse(restoreDiffDisclosureState(text));");
    history = disclosureReplaceOnce(history,
      'import { restoreDiffDisclosureState } from "./helpers/diffDisclosureState.mjs";\n', "");
    history = disclosureReplaceOnce(history, "const ast = parse(restoreDiffDisclosureState(text));", "const ast = parse(text);");
    assert.equal(sha(history), "98c3d7cb2e3b104f3aca63a6169a425ce682275267edf99c8f6c9bcb761bc2bb");
  }
});
