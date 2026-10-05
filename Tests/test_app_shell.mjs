import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const frontendRoot = resolve(root, "Frontend");
const require = createRequire(resolve(frontendRoot, "package.json"));
const app = readFileSync(resolve(frontendRoot, "src/App.tsx"), "utf8");
const css = readFileSync(resolve(frontendRoot, "src/index.css"), "utf8");

test("actual shell components keep identity/actions separate from scoped status", { timeout: 30_000 }, async (t) => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
  const vite = await createServer({ root: frontendRoot,
    server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom",
    optimizeDeps: { noDiscovery: true, entries: [] } });
  try {
    const { AppShell, AppShellNavigation, WorkspaceContext, ConnectionStatus } =
      await vite.ssrLoadModule("/src/AppShell.tsx");
    const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));
    const repo = (id, extra = {}) => ({ id, offline: false, status_valid: true,
      clean: false, count: 3, branch: "develop", last_event_ts: null, ...extra });
    const context = (repos, extra = {}) => render(WorkspaceContext, {
      scope: { kind: "all" }, repos, ready: true, error: "", violationOf: () => null,
      onDetails() {}, ...extra,
    });
    await t.test("global header retains actions, feedback and labelled navigation slots", () => {
      const html = render(AppShell, { onSystem() {},
        actions: React.createElement("button", null, "Commands"),
        context: React.createElement("span", null, "Scope fixture"),
        children: React.createElement("p", null, "Persistent feedback") });
      assert.match(html, /<header/);
      assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
      for (const text of ["KATLAB Tracking Monitor", "Commands", "Scope fixture", "Persistent feedback"]) {
        assert.ok(html.includes(text));
      }
      assert.match(render(AppShellNavigation, { children: "Views" }), /aria-label="Workspace navigation"/);
    });
    await t.test("pending and failed initial snapshots are not empty or clean success", () => {
      const pending = context([], { ready: false });
      assert.match(pending, /Waiting for workspace snapshot/);
      assert.doesNotMatch(pending, /No repositories configured|known statuses clean/);
      assert.match(context([], { ready: false, error: "Unavailable" }), /Workspace snapshot unavailable/);
      assert.match(context([]), /No repositories configured/);
      assert.match(context([], { scope: { kind: "repo", id: "removed" } }),
        /Selected repository unavailable/);
    });
    await t.test("offline and retained invalid Git values cannot enter current totals", () => {
      const html = context([repo("clean", { clean: true, count: 0 }), repo("dirty"),
        repo("unknown", { status_valid: false, clean: true, count: 777 }),
        repo("offline", { offline: true, clean: true, count: 999 })]);
      assert.match(html, /1\/2 known statuses clean/);
      assert.match(html, /3 known uncommitted changes/);
      assert.match(html, /1 Git status unknown/);
      assert.match(html, /1 unavailable/);
      assert.doesNotMatch(html, /777|999/);
      assert.match(context([repo("unknown", { status_valid: false })]), /Git status unavailable/);
      assert.doesNotMatch(context([repo("unknown", { status_valid: false })]), /0 known uncommitted/);
      assert.match(context([repo("offline", { offline: true })]), /No online repositories/);
    });
    await t.test("selected scope retains branch/capture/discipline and last-known wording", () => {
      const selected = repo("ALL", { status_valid: false, branch: "feature/<script>" });
      const html = context([selected], { scope: { kind: "repo", id: "ALL" },
        error: "Refresh failure", violationOf: () => 2 });
      assert.match(html, /Last-known branch/);
      assert.match(html, /feature\/&lt;script&gt;/);
      assert.match(html, /No captures yet/);
      assert.match(html, /1 discipline warning/);
      assert.match(html, /Refresh failed; showing the last workspace snapshot/);
      assert.match(html, /Repository status/);
      const offline = context([repo("ALL", { offline: true, status_valid: true })],
        { scope: { kind: "repo", id: "ALL" } });
      assert.match(offline, /Last-known branch/);
      assert.doesNotMatch(offline, />Branch:/);
    });
    await t.test("connection labels describe transport only", () => {
      for (const state of ["connecting", "connected", "reconnecting"]) {
        const html = render(ConnectionStatus, { state });
        assert.ok(html.includes(state[0].toUpperCase() + state.slice(1)));
        assert.match(html, /not proof of fresh data or verification readiness/);
      }
    });
  } finally { await vite.close(); }
});

// These are integration-source guards, not browser focus/geometry evidence.
test("shell keeps one task browser, canonical navigation, route cleanup and existing main owner", () => {
  assert.equal((app.match(/<TaskSidebar\b/g) ?? []).length, 1);
  assert.equal((app.match(/<CommandPalette\b/g) ?? []).length, 1);
  assert.match(app, /type ShellPanel = "navigation" \| "scope" \| "status" \| "tasks"/);
  for (const panel of ["navigation", "scope", "status", "tasks"]) {
    assert.ok(app.includes(`shellPanel === "${panel}" && activeDialog === null && !paletteOpen`));
  }
  const labels = app.slice(app.indexOf("const VIEW_LABELS:"), app.indexOf("function ViewNavigation"));
  assert.deepEqual([...labels.matchAll(/\b(changes|mission|overview|history|city|chronicle):/g)]
    .map(match => match[1]), ["changes", "mission", "overview", "history", "city", "chronicle"]);
  assert.ok((app.match(/setShellPanel\(null\);\s*setPaletteOpen\(false\);/g) ?? []).length >= 3,
    "dialog opening and both route commit paths clear shell/palette owners");
  assert.match(app, /<main ref={mainRef} id="main-content" tabIndex={-1} data-app-scroll/);
  assert.match(app, /onScroll={scheduleCurrentEntrySave}/);
  assert.match(app, /}, setConnectionState\);/);
  assert.match(app, /statusPanelRef\.current\?\.focus\({ preventScroll: true }\)/);
  assert.match(app, /disclosureFocusRef\.current !== destination \|\| hasOverlayLease\(\)/);
  assert.match(app, /window\.cancelAnimationFrame\(frame\)/);
});

test("desktop navigation contract and narrow header reflow are explicit CSS, not measured claims", () => {
  assert.match(css, /@media \(min-width: 1280px\)/);
  assert.match(css, /\.app-shell-navigation\s*{[\s\S]*width: 14rem;/);
  assert.match(css, /\.app-header-primary,[\s\S]*flex-wrap: wrap/);
  assert.match(css, /\.app-brand { flex-basis: 100%; }/);
  assert.doesNotMatch(app, /Scribe will.*daily/i);
});

test("actual disclosure handoff waits for palette teardown and fences stale or modal focus", () => {
  const ts = require("typescript");
  const tree = ts.createSourceFile("App.tsx", app, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback;
  const visit = node => {
    if (ts.isCallExpression(node) && node.expression.getText(tree) === "useEffect"
        && node.arguments[0]?.getText(tree).includes("const destination = disclosureFocusRef.current")) {
      callback = node.arguments[0].getText(tree);
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  assert.ok(callback, "extract the actual App handoff effect");
  const body = ts.transpileModule(`const effect = ${callback};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  const create = new Function("paletteOpen", "disclosureFocusRef", "moreOpen", "showLegend",
    "window", "document", "hasOverlayLease", body + "\nreturn effect;");
  for (const destination of ["tools", "legend"]) {
    for (const obstacle of ["none", "new-owner", "modal", "inert", "detached"]) {
      const owner = { current: destination }, frames = [], canceled = [], focused = [];
      let lease = false;
      const target = { isConnected: true, closest: () => null, focus: options => focused.push(options) };
      const effect = create(false, owner, destination === "tools", destination === "legend", {
        requestAnimationFrame(fn) { frames.push(fn); return 7; },
        cancelAnimationFrame(id) { canceled.push(id); },
      }, { querySelector(selector) {
        assert.equal(selector, destination === "tools" ? "#header-more-panel" : "#app-legend button");
        return target;
      } }, () => lease);
      const cleanup = effect();
      assert.equal(focused.length, 0);
      assert.equal(frames.length, 1);
      if (obstacle === "new-owner") owner.current = null;
      if (obstacle === "modal") lease = true;
      if (obstacle === "inert") target.closest = () => ({});
      if (obstacle === "detached") target.isConnected = false;
      frames[0]();
      assert.equal(focused.length, Number(obstacle === "none"));
      cleanup();
      assert.deepEqual(canceled, [7]);
    }
  }
  const noFrame = { requestAnimationFrame() { assert.fail("must not arm before handoff"); } };
  assert.equal(create(true, { current: "tools" }, true, false, noFrame, {}, () => false)(), undefined);
  const canceledOwner = { current: "tools" };
  create(false, canceledOwner, false, false, noFrame, {}, () => false)();
  assert.equal(canceledOwner.current, null);
});
