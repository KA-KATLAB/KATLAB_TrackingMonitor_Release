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
const source = (name) => readFileSync(resolve(root, "Frontend/src", name), "utf8");
const appText = source("App.tsx");
const uiText = source("ui.tsx");
const parse = (name, text) => ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true);
const appAst = parse("App.tsx", appText);
const uiAst = parse("ui.tsx", uiText);
const compile = (text) => ts.transpileModule(text, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React,
  },
}).outputText;
const importText = (text) => import(`data:text/javascript;base64,${Buffer.from(compile(text)).toString("base64")}`);
const navigation = await importText(source("navigation.ts"));

function declaration (ast, name) {
  const node = ast.statements.find((entry) =>
    (ts.isFunctionDeclaration(entry) && entry.name?.text === name)
    || (ts.isVariableStatement(entry)
      && entry.declarationList.declarations.some((item) => item.name.getText(ast) === name)));
  assert.ok(node, `actual declaration exists: ${name}`);
  // Strip only the module export modifier to enclose unchanged declarations in a factory.
  return node.getText(ast).replace(/^export\s+/, "");
}

const extracted = [
  ...["getBoundedPageWindow", "collectionIdentityKey", "useBoundedPage",
    "useRememberedBoundedPage", "CollectionPager"].map((name) => declaration(uiAst, name)),
  declaration(appAst, "RepoScopeRail"),
].join("\n");
const { createSubject } = await importText(`
export function createSubject(hooks, navigation, React) {
  const { useState, useRef, useCallback, useEffect, useContext } = hooks;
  const { scopeKey, scopeLabel, scopeEquals, scopeAccessibleName } = navigation;
  const { forwardRef } = React;
  const BoundedPageMemoryContext = {};
  // Cosmetic leaves only; rail, pager, handlers and paging algorithms are actual source.
  const ControlButton = "button";
  const ChevronLeftIcon = () => null;
  const ChevronRightIcon = () => null;
  const cx = (...values) => values.filter(Boolean).join(" ");
  ${extracted}
  return { RepoScopeRail, CollectionPager };
}`);

const sameDeps = (a, b) => Array.isArray(a) && Array.isArray(b)
  && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
const allScope = Object.freeze({ kind: "all" });
const repoScope = (id) => Object.freeze({ kind: "repo", id });
const repoRows = (count) => Object.freeze(Array.from({ length: count }, (_, index) =>
  Object.freeze({ id: `Repo_${index + 1}` })));
const route = (scope, view = "changes") => Object.freeze({ scope, view });

function elements (node) {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement(node)) return [];
  return [node, ...elements(node.props.children)];
}

// Controlled lifecycle, not React DOM: state/ref slots, dependency checks, callbacks
// and post-render effects run deterministically; native focus/history are not exercised.
function mountRail ({ repos = repoRows(60), scope = allScope, pages = {}, membershipReady = true } = {}) {
  const slots = [];
  const writes = [];
  const selections = [];
  let cursor = 0;
  let pendingEffects = [];
  let dirty = false;
  let tree;
  let memory = pages;
  let props = { repos, scope, membershipReady, onSelect: (next) => selections.push(next) };
  function slot (kind, initialize) {
    const index = cursor++;
    slots[index] ??= { kind, ...initialize() };
    assert.equal(slots[index].kind, kind, `stable hook slot ${index}`);
    return slots[index];
  }
  function remember (key, page) {
    writes.push({ key, page });
    if (memory[key] !== page) {
      memory = { ...memory, [key]: page };
      dirty = true;
    }
  }
  const hooks = {
    useState(initial) {
      const current = slot("state", () => ({ value: typeof initial === "function" ? initial() : initial }));
      current.set ??= (next) => {
        const value = typeof next === "function" ? next(current.value) : next;
        if (!Object.is(value, current.value)) { current.value = value; dirty = true; }
      };
      return [current.value, current.set];
    },
    useRef(initial) { return slot("ref", () => ({ value: { current: initial } })).value; },
    useCallback(callback, deps) {
      const current = slot("callback", () => ({}));
      if (!sameDeps(current.deps, deps)) { current.value = callback; current.deps = deps; }
      return current.value;
    },
    useEffect(callback, deps) {
      const current = slot("effect", () => ({}));
      if (!sameDeps(current.deps, deps)) {
        current.deps = deps;
        pendingEffects.push(() => { current.cleanup?.(); current.cleanup = callback(); });
      }
    },
    useContext() { return { pages: memory, setPage: remember }; },
  };
  const subject = createSubject(hooks, navigation, React);
  const render = () => {
    for (let pass = 0; pass < 12; pass += 1) {
      cursor = 0;
      pendingEffects = [];
      dirty = false;
      tree = subject.RepoScopeRail(props);
      for (const effect of pendingEffects) effect();
      if (!dirty) return;
    }
    assert.fail("controlled rail render did not settle");
  };
  const pager = () => elements(tree).find((node) => node.type === subject.CollectionPager);
  const choices = () => elements(tree).filter((node) => node.type === "button"
    && typeof node.props["aria-pressed"] === "boolean");
  const control = (direction) => {
    const node = pager();
    assert.ok(node, "actual CollectionPager is mounted");
    return elements(subject.CollectionPager.render(node.props, null)).find((item) =>
      item.props["aria-label"] === `Repository scopes: ${direction} page`);
  };
  render();
  return {
    writes, selections, render, pager, choices,
    pages: () => memory,
    page: () => pager()?.props.page.page ?? 1,
    nodes: () => elements(tree),
    update(nextProps, nextPages) {
      props = { ...props, ...nextProps };
      if (nextPages !== undefined) memory = nextPages;
      render();
    },
    click(direction) {
      const button = control(direction);
      assert.ok(button, `actual ${direction} callback exists`);
      assert.equal(button.props.disabled, false);
      button.props.onClick();
    },
    control,
  };
}

test("manual All Next stays on page two through render and callback churn", () => {
  const h = mountRail();
  assert.equal(h.page(), 1);
  assert.equal(h.control("previous").props.disabled, true);
  const oldCallback = h.pager().props.onPageChange;
  h.click("next");
  assert.equal(h.pages()["repo-scopes"], 2, "actual pager writes memory in the click stack");
  h.render();
  assert.equal(h.page(), 2, "selected All must not force page one");
  assert.notEqual(h.pager().props.onPageChange, oldCallback, "exercise changing callback identity");
  for (let index = 0; index < 4; index += 1) h.render();
  assert.equal(h.page(), 2);
  assert.deepEqual(h.writes, [{ key: "repo-scopes", page: 2 }]);
  assert.equal(h.choices().length, 11);
  assert.equal(h.control("next").props.disabled, true);
  assert.equal(h.choices().some((node) => node.props["aria-pressed"]), false);
  assert.ok(h.nodes().some((node) => node.type === "span" && node.props.children === "All repos"));
});

test("manual late-repo Previous stays on page one without changing selection", () => {
  const h = mountRail({ scope: repoScope("Repo_60") });
  assert.equal(h.page(), 2);
  h.click("previous");
  assert.equal(h.pages()["repo-scopes"], 1);
  h.render();
  assert.equal(h.page(), 1, "selected late repository must not force page two");
  h.render();
  assert.deepEqual(h.writes, [{ key: "repo-scopes", page: 1 }]);
  assert.equal(h.choices().length, 50);
  assert.deepEqual(h.selections, []);
  assert.ok(h.nodes().some((node) => node.type === "span" && node.props.children === "Repo_60"));
});

test("initial and hydrated selection follows fallback without inventing page memory", () => {
  const h = mountRail({ repos: [], scope: repoScope("Repo_60"), membershipReady: false });
  assert.equal(h.pager(), undefined);
  assert.equal(h.choices().length, 2);
  assert.equal(h.choices()[1].props["aria-pressed"], true);
  assert.deepEqual(h.pages(), {});
  h.update({ repos: repoRows(60), membershipReady: true });
  assert.equal(h.page(), 2);
  assert.equal(h.choices().at(-1).props["aria-label"], "Scope: repo Repo_60");
  assert.equal(h.choices().at(-1).props["aria-pressed"], true);
  assert.deepEqual(h.writes, [], "valid implicit fallback is not persisted by clamping");
  h.update({ repos: [...repoRows(60)].reverse() });
  assert.equal(h.page(), 1, "unremembered fallback follows reordered selected index");
  assert.deepEqual(h.pages(), {});
});

test("remembered browsing wins over selection, reorder and restored entry changes", () => {
  const remembered = Object.freeze({ "repo-scopes": 2, another: 7 });
  const h = mountRail({ pages: remembered });
  assert.equal(h.page(), 2);
  h.update({ scope: repoScope("Repo_60") }, Object.freeze({ "repo-scopes": 1, another: 8 }));
  assert.equal(h.page(), 1, "restored entry may intentionally exclude its selected button");
  h.update({ scope: allScope }, remembered);
  assert.equal(h.page(), 2, "Back restores All with its browsed page");
  h.update({ repos: [...repoRows(60)].reverse() });
  assert.equal(h.page(), 2);
  assert.deepEqual(h.pages(), remembered);
  assert.deepEqual(h.writes, []);
});

test("shrink clamps remembered page while leaving unrelated memory intact", () => {
  const original = Object.freeze({ "repo-scopes": 2, another: 7 });
  const h = mountRail({ pages: original });
  h.update({ repos: repoRows(10) });
  assert.equal(h.pager(), undefined);
  assert.equal(h.choices().length, 11);
  assert.deepEqual(h.pages(), { "repo-scopes": 1, another: 7 });
  assert.deepEqual(h.writes, [{ key: "repo-scopes", page: 1 }]);
  assert.deepEqual(original, { "repo-scopes": 2, another: 7 });
});

test("zero and 49/50 repo boundaries retain exact labels, pressed state and bounded choices", () => {
  for (const count of [0, 49, 50, 60, 100]) {
    const h = mountRail({ repos: repoRows(count) });
    assert.equal(Boolean(h.pager()), count >= 50, `All adds one choice to ${count} repos`);
    assert.equal(h.choices().length, Math.min(count + 1, 50));
    assert.equal(h.choices()[0].props.children, "All repos");
    assert.equal(h.choices()[0].props["aria-label"], "Scope: all repos");
    assert.equal(h.choices()[0].props["aria-pressed"], true);
    assert.ok(h.nodes().some((node) => node.props.role === "group"
      && node.props["aria-label"] === "Repository scope"));
    assert.ok(h.nodes().some((node) => node.props.role === "region"
      && node.props["aria-label"] === "Repository scope options"));
    if (h.pager()) assert.equal(h.pager().props.page.totalItems, count + 1);
  }
  const h = mountRail({ repos: [{ id: "ALL" }], scope: repoScope("ALL") });
  assert.deepEqual(h.choices().map((node) => [node.props.children, node.props["aria-label"], node.props["aria-pressed"]]),
    [["All repos", "Scope: all repos", false], ["ALL", "Scope: repo ALL", true]]);
  h.choices()[0].props.onClick();
  h.choices()[1].props.onClick();
  assert.deepEqual(h.selections, [allScope, repoScope("ALL")]);
});

test("navigation page policy copies inputs and invalidates only the changed context", () => {
  assert.equal(typeof navigation.pagePositionsForNavigation, "function");
  const scopes = [allScope, repoScope("ALL"), repoScope("Repo_1"), repoScope("Repo_60")];
  for (const currentView of navigation.VIEW_VALUES) for (const targetView of navigation.VIEW_VALUES) {
    for (const currentScope of scopes) for (const targetScope of scopes) {
      const saved = Object.freeze({ "repo-scopes": 2, another: 7 });
      const next = navigation.pagePositionsForNavigation(route(currentScope, currentView), route(targetScope, targetView), saved);
      const expected = currentView !== targetView ? {}
        : navigation.scopeEquals(currentScope, targetScope) ? { "repo-scopes": 2, another: 7 } : { another: 7 };
      assert.deepEqual(next, expected);
      assert.notEqual(next, saved);
      assert.deepEqual(saved, { "repo-scopes": 2, another: 7 });
    }
  }
});

test("scope navigation reveals destination while Back and Forward preserve independent pages", () => {
  assert.equal(typeof navigation.pagePositionsForNavigation, "function");
  const firstRoute = route(allScope);
  const secondRoute = route(repoScope("Repo_60"));
  const h = mountRail({ pages: { another: 7 } });
  h.click("next"); h.render();
  const firstPages = Object.freeze({ ...h.pages() });
  const destination = navigation.pagePositionsForNavigation(firstRoute, secondRoute, firstPages);
  assert.deepEqual(destination, { another: 7 });
  h.update({ scope: secondRoute.scope }, destination);
  assert.equal(h.page(), 2);
  assert.equal(h.choices().at(-1).props["aria-pressed"], true);
  h.click("previous"); h.render();
  const secondPages = Object.freeze({ ...h.pages() });
  h.update({ scope: firstRoute.scope }, firstPages);
  assert.equal(h.page(), 2);
  h.update({ scope: secondRoute.scope }, secondPages);
  assert.equal(h.page(), 1);
  assert.deepEqual(firstPages, { "repo-scopes": 2, another: 7 });
  assert.deepEqual(secondPages, { "repo-scopes": 1, another: 7 });
  const differentView = route(secondRoute.scope, "history");
  h.update({ scope: differentView.scope },
    navigation.pagePositionsForNavigation(secondRoute, differentView, secondPages));
  assert.equal(h.page(), 2, "view change removes prior memory and uses the selected fallback");
  assert.deepEqual(h.pages(), {});
});

test("missing selected placeholder and membership repair keep explicit navigation policy", () => {
  assert.equal(typeof navigation.pagePositionsForNavigation, "function");
  const missing = repoScope("Missing");
  const h = mountRail({ scope: missing, pages: { another: 7 } });
  assert.equal(h.page(), 2);
  assert.equal(h.choices().at(-1).props["aria-label"], "Scope: repo Missing");
  assert.equal(h.choices().at(-1).props["aria-pressed"], true);
  assert.equal(h.pager().props.page.totalItems, 62);
  h.click("previous"); h.render();
  const current = route(missing);
  const repaired = navigation.repairRouteMembership(current, new Set(repoRows(60).map((repo) => repo.id)));
  h.update({ scope: repaired.scope }, navigation.pagePositionsForNavigation(current, repaired, h.pages()));
  assert.equal(h.page(), 1);
  assert.equal(h.pager().props.page.totalItems, 61);
  assert.deepEqual(h.pages(), { another: 7 });
  assert.equal(h.choices()[0].props["aria-pressed"], true);
});

test("App wires actual navigation policy and retains direct snapshot restoration", () => {
  const declarations = [];
  function visit (node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(appAst) === "nextPages") declarations.push(node);
    ts.forEachChild(node, visit);
  }
  visit(appAst);
  assert.equal(declarations.length, 1);
  const call = declarations[0].initializer;
  assert.ok(call && ts.isCallExpression(call));
  assert.equal(call.expression.getText(appAst), "pagePositionsForNavigation");
  assert.deepEqual(call.arguments.map((argument) => argument.getText(appAst)),
    ["currentRoute", "target", "ui.pagePositions"]);
  assert.match(appText, /pages:\s*\{\s*\.\.\.current\.pagePositions\s*\}/);
  assert.match(appText, /setPagePositions\(\{\s*\.\.\.\(snapshot\?\.pages\s*\?\?\s*\{\}\)\s*\}\)/);
  assert.match(appText, /<BoundedPageMemoryProvider\s+pages=\{pagePositions\}\s+onPageChange=\{rememberPage\}>/);
});
