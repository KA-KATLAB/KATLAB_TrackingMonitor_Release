import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const frontendRequire = createRequire(resolve(root, "Frontend/package.json"));
const ts = frontendRequire("typescript");
const React = frontendRequire("react");
const { renderToStaticMarkup } = frontendRequire("react-dom/server");
const source = (name) => readFileSync(resolve(root, "Frontend/src", name), "utf8");
const parse = (name) => ts.createSourceFile(name, source(name), ts.ScriptTarget.Latest, true);
const mission = parse("MissionView.tsx"), ui = parse("ui.tsx"), model = parse("missionModel.ts");
function declaration (ast, name) {
  const node = ast.statements.find((entry) =>
    (ts.isFunctionDeclaration(entry) && entry.name?.text === name)
    || (ts.isVariableStatement(entry)
      && entry.declarationList.declarations.some((item) => item.name.getText(ast) === name)));
  assert.ok(node, `actual declaration exists: ${name}`);
  return node.getText(ast).replace(/^export\s+/, "");
}
const extracted = [
  ...["cx", "Surface", "SectionHeading", "CONTROL_TONE", "ControlButton",
    "getBoundedPageWindow", "collectionIdentityKey", "useBoundedPage", "CollectionPager"]
    .map((name) => declaration(ui, name)),
  ...["MISSION_PRESENTATION", "missionPresentation"].map((name) => declaration(model, name)),
  ...["TONE_CLASS", "StateBadge", "PlanCard", "MissionReasonList", "missionPlanPrompt", "NowPanel"]
    .map((name) => declaration(mission, name)),
].join("\n");
const code = ts.transpileModule(`
export function createSubject(hooks, React) {
  const { useState, useRef, useCallback, useEffect } = hooks;
  const { forwardRef } = React;
  // Only decorative icon leaves are stubbed. Components, native controls,
  // backend-state presentation and paging algorithms are actual declarations.
  const AlertIcon = () => null, MissionIcon = () => null;
  const ChevronLeftIcon = () => null, ChevronRightIcon = () => null;
  ${extracted}
  return { MissionReasonList, NowPanel, PlanCard, CollectionPager, ControlButton };
}`, { compilerOptions: { target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React } }).outputText;
const { createSubject } = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
const actual = createSubject(React, React);
const elements = (node) => Array.isArray(node) ? node.flatMap(elements)
  : React.isValidElement(node) ? [node, ...elements(node.props.children)] : [];
const textOf = (node) => Array.isArray(node) ? node.map(textOf).join("")
  : React.isValidElement(node) ? textOf(node.props.children)
    : typeof node === "string" || typeof node === "number" ? String(node) : "";
const sameDeps = (a, b) => Array.isArray(a) && Array.isArray(b)
  && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
const reasons = (count) => Object.freeze(Array.from({ length: count }, (_, index) => Object.freeze({
  code: "missing_check", message: `Reason ${index + 1}`, check_id: `Check_${index + 1}`, count: index,
})));
const plan = (overrides = {}) => ({
  repo: "Repo_A", plan_file: "temp/Plan/PLAN_test.txt", label: "Selected work",
  state: "blocked", task_counts: { total: 8, pending: 2, in_progress: 1, done: 5 },
  current_task: { id: "E.1", title: "Inspect the evidence" },
  repo_status: { status_valid: true, clean: false, count: 6, branch: "develop" },
  blockers: reasons(101), warnings: reasons(51), ...overrides,
});

// Deterministic hook lifecycle, not a native DOM: exercise unchanged source
// handlers, render-time identity resets, effect clamps and disabled boundaries.
function mountReasons (initial = {}) {
  let props = { kind: "blockers", repo: "Repo_A", planFile: "temp/Plan/PLAN_test.txt",
    reasons: reasons(101), ...initial };
  const slots = [];
  let cursor = 0, dirty = false, effects = [], tree;
  function slot (kind, initialize) {
    const index = cursor++;
    slots[index] ??= { kind, ...initialize() };
    assert.equal(slots[index].kind, kind, `stable hook slot ${index}`);
    return slots[index];
  }
  const hooks = {
    useState(initialValue) {
      const current = slot("state", () => ({ value: typeof initialValue === "function" ? initialValue() : initialValue }));
      current.set ??= (next) => {
        const value = typeof next === "function" ? next(current.value) : next;
        if (!Object.is(value, current.value)) { current.value = value; dirty = true; }
      };
      return [current.value, current.set];
    },
    useRef(value) { return slot("ref", () => ({ value: { current: value } })).value; },
    useCallback(callback, deps) {
      const current = slot("callback", () => ({}));
      if (!sameDeps(current.deps, deps)) { current.value = callback; current.deps = deps; }
      return current.value;
    },
    useEffect(callback, deps) {
      const current = slot("effect", () => ({}));
      if (!sameDeps(current.deps, deps)) {
        current.deps = deps;
        effects.push(() => { current.cleanup?.(); current.cleanup = callback(); });
      }
    },
  };
  const subject = createSubject(hooks, React);
  const render = () => {
    for (let pass = 0; pass < 12; pass += 1) {
      cursor = 0; dirty = false; effects = [];
      tree = subject.MissionReasonList(props);
      for (const effect of effects) effect();
      if (!dirty) return;
    }
    assert.fail("controlled reason-list render did not settle");
  };
  const pager = () => elements(tree).find((node) => node.type === subject.CollectionPager);
  const control = (direction) => {
    const node = pager();
    assert.ok(node, "actual CollectionPager exists for multi-page data");
    const entry = elements(subject.CollectionPager.render(node.props, null)).find((child) =>
      child.type === subject.ControlButton && child.props["aria-label"].endsWith(`: ${direction} page`));
    assert.ok(entry, `actual ${direction} ControlButton exists`);
    return subject.ControlButton.render(entry.props, null);
  };
  render();
  return {
    pager, control, render,
    tree: () => tree,
    rows: () => elements(tree).filter((node) => node.type === "li"),
    update(next) { props = { ...props, ...next }; render(); },
    click(direction) {
      const button = control(direction);
      assert.equal(button.props.disabled, false, `${direction} is reachable`);
      button.props.onClick(); render();
    },
  };
}

for (const kind of ["blockers", "warnings"]) {
  for (const count of [0, 1, 51, 101]) {
    test(`${kind}: all ${count} reasons are reachable with exact totals and a 50-row bound`, () => {
      const h = mountReasons({ kind, reasons: reasons(count) });
      const header = elements(h.tree()).find((node) => node.type === "h4");
      assert.equal(textOf(header), `${kind === "blockers" ? "Exact blockers" : "Plan warnings"}${count} total`);
      const seen = [];
      while (true) {
        assert.ok(h.rows().length <= 50);
        seen.push(...h.rows().map((row) => textOf(row)));
        if (!h.pager()) break;
        assert.equal(h.pager().props.page.totalItems, count);
        assert.equal(h.pager().props.controlsId, `mission-${kind}`);
        if (h.control("next").props.disabled) break;
        h.click("next");
      }
      assert.deepEqual(seen, reasons(count).map((reason) =>
        `${reason.message}[${reason.check_id}] (${reason.count})`));
      if (count === 0) assert.match(textOf(h.tree()), /No (?:blocker|warning) reported\./);
      if (count <= 1) assert.equal(h.pager(), undefined);
      if (count > 50) {
        assert.equal(h.pager().props.page.pageCount, Math.ceil(count / 50));
        while (h.pager().props.page.page > 1) h.click("previous");
        assert.equal(h.control("previous").props.disabled, true);
        assert.equal(h.pager().props.page.start, 0);
      }
    });
  }
}

test("reason paging is stable for refreshes and resets for each exact identity component", () => {
  const h = mountReasons();
  h.click("next");
  h.update({ reasons: [...reasons(101)] });
  assert.equal(h.pager().props.page.page, 2, "same plan and kind preserve a browsed page");
  for (const change of [
    { repo: "Repo_B" },
    { planFile: "temp/Plan/PLAN_other.txt" },
    { kind: "warnings" },
  ]) {
    h.update(change);
    assert.equal(h.pager().props.page.page, 1, "repo, plan and kind each reset independently");
    h.click("next");
  }
  h.update({ repo: "A:B", planFile: "C" });
  h.click("next");
  h.update({ repo: "A", planFile: "B:C" });
  assert.equal(h.pager().props.page.page, 1, "delimiter-shaped identities cannot collide");
});

test("reason count shrink clamps safely and empty/refill cannot strand the page", () => {
  const h = mountReasons();
  h.click("next"); h.click("next");
  h.update({ reasons: reasons(51) });
  assert.equal(h.pager().props.page.page, 2);
  assert.equal(h.rows().length, 1);
  h.update({ reasons: reasons(0) });
  assert.equal(h.rows().length, 0); assert.equal(h.pager(), undefined);
  h.update({ reasons: reasons(101) });
  assert.equal(h.pager().props.page.page, 1);
  assert.equal(h.rows().length, 50);
});

test("Now passes both complete reason arrays with exact plan identity and no conditional hooks", () => {
  const selected = plan();
  const tree = actual.NowPanel({ plan: selected, scope: undefined, summary: null });
  const children = elements(tree).filter((node) => node.type === actual.MissionReasonList);
  assert.deepEqual(children.map((node) => node.props.kind), ["blockers", "warnings"]);
  for (const child of children) {
    assert.equal(child.props.repo, selected.repo);
    assert.equal(child.props.planFile, selected.plan_file);
    assert.equal(child.props.reasons, selected[child.props.kind]);
  }
  assert.doesNotMatch(declaration(mission, "NowPanel"), /\buse[A-Z]\w*\s*\(/,
    "reason hooks remain in the unconditional child, not after NowPanel's empty return");
});

test("Now keeps authoritative readiness, truthful empty states and escaped long identities", () => {
  const render = (selected, scope = undefined, summary = null) => renderToStaticMarkup(
    React.createElement(actual.NowPanel, { plan: selected, scope, summary }));
  for (const [state, label] of [
    ["not_configured", "Not configured"], ["planning", "Planning"],
    ["implementation", "Implementation"], ["verification", "Verification"],
    ["blocked", "Blocked"], ["ready_to_commit", "Ready to commit"],
    ["verified_committed", "Verified + committed"],
  ]) {
    const html = render(plan({ state, blockers: [], warnings: [] }));
    assert.ok(html.includes(label), state);
    assert.ok(html.includes("No blocker reported."));
    assert.ok(html.includes("5 done")); assert.ok(html.includes("1 in progress"));
    assert.ok(html.includes("2 pending")); assert.ok(html.includes("63% of tasks complete"));
    assert.ok(html.includes("Green means declared evidence is fresh, not universal correctness."));
  }
  const unknown = render(plan({ repo_status: { status_valid: false, clean: true, count: 99, branch: "stale" },
    blockers: [], warnings: [] }));
  assert.ok(unknown.includes("current status unavailable"));
  assert.ok(!unknown.includes("clean on stale"));
  assert.ok(render(null, "Repo_A", { total: 0 }).includes("No tracked plans in Repo_A."));
  assert.ok(render(null, undefined, { total: 2 }).includes("does not prove one unique active plan"));
  const long = render(plan({ repo: "<repo>".repeat(50), plan_file: "<plan>".repeat(50),
    blockers: [{ code: "unsafe", message: "<script>not code</script>", check_id: "<check>", count: 0 }], warnings: [] }));
  assert.ok(long.includes("&lt;repo&gt;".repeat(50))); assert.ok(long.includes("&lt;plan&gt;".repeat(50)));
  assert.ok(long.includes("&lt;script&gt;not code&lt;/script&gt;")); assert.ok(!long.includes("<script>"));
  assert.ok(long.includes("break-all"));
});

test("plan choices retain selection callbacks and secondary section order stays unchanged", () => {
  let calls = 0;
  const choice = actual.PlanCard({ plan: plan(), selected: true, onSelect: () => { calls += 1; } });
  assert.equal(choice.type, "button"); assert.equal(choice.props.type, "button");
  assert.equal(choice.props["aria-pressed"], true); choice.props.onClick(); assert.equal(calls, 1);
  const view = declaration(mission, "MissionView");
  const anchors = ["<NowPanel", 'title="Plan scope"', "<ForecastPanel", 'title="Verification rail"',
    'title="Evidence queue"', 'title="Session flight recorder"', 'id="mission-exact-data"'];
  const positions = anchors.map((anchor) => view.indexOf(anchor));
  assert.ok(positions.every((position, index) => position >= 0 && (index === 0 || position > positions[index - 1])));
  assert.ok(view.includes('"data-view-heading": true, tabIndex: -1'));
  assert.doesNotMatch(declaration(mission, "MissionReasonList"), /\bapi\.|\bfetch\(|setInterval|setTimeout/);
});
