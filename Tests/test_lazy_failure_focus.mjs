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
const { renderToStaticMarkup } = require("react-dom/server");
const source = readFileSync(resolve(root, "Frontend/src/App.tsx"), "utf8");
const tree = ts.createSourceFile("App.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declarations = tree.statements.filter(node => ts.isClassDeclaration(node)
  && node.name?.text === "LazyViewBoundary");
assert.equal(declarations.length, 1, "extract the one actual lazy-view boundary");
const emitted = ts.transpileModule(declarations[0].getText(tree), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
    jsx: ts.JsxEmit.React },
}).outputText;
const loadBoundary = new Function("Component", "React", "window", "document", "hasOverlayLease",
  `${emitted}\nreturn LazyViewBoundary;`);

// Actual class and React elements; controlled lifecycle/RAF/DOM are not native focus evidence.
function harness (handles = []) {
  const frames = [], pending = new Map(), cancelled = [], focused = [];
  const state = { overlay: false, documentTarget: null, lookups: 0, reloads: 0 };
  const window = {
    requestAnimationFrame(callback) {
      const handle = handles.length ? handles.shift() : frames.length + 1;
      const frame = { handle, callback };
      frames.push(frame);
      pending.set(handle, frame);
      return handle;
    },
    cancelAnimationFrame(handle) { cancelled.push(handle); pending.delete(handle); },
    location: { reload() { state.reloads++; } },
  };
  const document = { getElementById(id) {
    assert.equal(id, "lazy-view-failure");
    state.lookups++;
    return state.documentTarget;
  } };
  const Boundary = loadBoundary(React.Component, React, window, document, () => state.overlay);
  function node (name) {
    return { name, isConnected: true, inert: false, ancestorInert: false,
      closest(selector) {
        assert.equal(selector, "[inert]");
        return this.inert || this.ancestorInert ? this : null;
      },
      focus(options) { focused.push({ name, options }); },
    };
  }
  function failure (boundary, target) {
    boundary.state = Boundary.getDerivedStateFromError(new Error("private module failure"));
    const element = boundary.render();
    // Old-source red probes may have no ref; never substitute private-field writes.
    if (typeof element.ref === "function") element.ref(target);
    return element;
  }
  function catchError (boundary) {
    boundary.componentDidCatch(new Error("private module failure"), { componentStack: "private stack" });
    return frames.at(-1);
  }
  function run (frame) {
    if (pending.get(frame.handle) === frame) pending.delete(frame.handle);
    frame.callback();
  }
  return { Boundary, state, frames, pending, cancelled, focused, node, failure, catchError, run,
    create(name = "Overview", children = React.createElement("div", null, "ready")) {
      return new Boundary({ name, children });
    } };
}

test("actual boundary preserves children and named failure UI with explicit Reload only", () => {
  const h = harness();
  for (const name of ["Mission", "Overview", "City"]) {
    const child = React.createElement("div", null, "ready");
    const boundary = h.create(name, child);
    assert.equal(boundary.render(), child);
    const element = h.failure(boundary, null);
    const html = renderToStaticMarkup(element);
    assert.match(html, /id="lazy-view-failure"/);
    assert.match(html, /tabindex="-1"/);
    assert.match(html, /aria-labelledby="lazy-view-failure-title"/);
    assert.ok(html.includes(`${name} could not load`));
    assert.ok(html.includes("The module failed to load or exceeded its 10-second deadline."));
    assert.match(html, />Reload<\/button>/);
    assert.doesNotMatch(html, /private module failure|private stack/);
    assert.equal(h.frames.length, 0, "rendering alone does not schedule focus");
    const button = React.Children.toArray(element.props.children).find(child => child.type === "button");
    assert.equal(h.state.reloads, 0);
    button.props.onClick();
    assert.equal(h.state.reloads, 1);
    h.state.reloads = 0;
  }
});

test("failure ref is stable and an owned frame focuses only its node once without scrolling", () => {
  const h = harness([0]);
  const boundary = h.create();
  const target = h.node("owned");
  const element = h.failure(boundary, target);
  assert.equal(typeof element.ref, "function", "failure section owns a callback ref");
  assert.equal(boundary.render().ref, element.ref, "ref identity stays stable across renders");
  h.state.documentTarget = h.node("foreign-same-id");
  const frame = h.catchError(boundary);
  assert.equal(h.pending.size, 1);
  h.run(frame);
  h.run(frame);
  assert.deepEqual(h.focused, [{ name: "owned", options: { preventScroll: true } }]);
  assert.equal(h.state.lookups, 0, "never look up a different boundary by global ID");
  assert.equal(h.state.reloads, 0, "focus recovery never reloads automatically");
  boundary.componentWillUnmount?.();
  assert.deepEqual(h.cancelled, [], "the already consumed frame is not pending work");
});

test("unmount retires a saved callback before a replacement view reuses the failure ID", () => {
  const h = harness([0, 7]);
  const old = h.create("Overview");
  h.failure(old, h.node("old Overview"));
  const stale = h.catchError(old);
  old.componentWillUnmount?.();
  const replacement = h.create("City");
  const current = h.node("new City");
  h.failure(replacement, current);
  h.state.documentTarget = current;
  h.run(stale);
  assert.deepEqual(h.focused, [], "a retired Overview must not focus the replacement City");
  assert.deepEqual(h.cancelled, [0], "zero-valued frame handles are cancelled");
  h.run(h.catchError(replacement));
  assert.deepEqual(h.focused, [{ name: "new City", options: { preventScroll: true } }]);
});

test("replacement catches invalidate saved tokens even when RAF reuses the same numeric handle", () => {
  const h = harness([0, 0]);
  const boundary = h.create();
  const target = h.node("current");
  h.failure(boundary, target);
  h.state.documentTarget = target;
  const previous = h.catchError(boundary);
  const current = h.catchError(boundary);
  assert.deepEqual(h.cancelled, [0]);
  assert.equal(h.pending.size, 1);
  h.run(previous);
  assert.deepEqual(h.focused, []);
  assert.equal(h.pending.get(0), current, "stale token must not consume the new frame");
  h.run(current);
  h.run(previous);
  h.run(current);
  assert.deepEqual(h.focused, [{ name: "current", options: { preventScroll: true } }]);
});

test("missing, detached, inert and overlay-blocked targets consume focus without later replay", () => {
  for (const block of ["missing", "detached", "inert", "ancestor-inert", "overlay"]) {
    const h = harness();
    const boundary = h.create();
    const target = h.node(block);
    const element = h.failure(boundary, target);
    h.state.documentTarget = target;
    const frame = h.catchError(boundary);
    if (block === "missing") element.ref?.(null);
    if (block === "detached") target.isConnected = false;
    if (block === "inert") target.inert = true;
    if (block === "ancestor-inert") target.ancestorInert = true;
    if (block === "overlay") h.state.overlay = true;
    h.run(frame);
    assert.deepEqual(h.focused, [], block);
    element.ref?.(target);
    target.isConnected = true;
    target.inert = target.ancestorInert = h.state.overlay = false;
    h.run(frame);
    assert.deepEqual(h.focused, [], `${block}: clearing the obstacle must not replay the old handoff`);
    h.run(h.catchError(boundary));
    assert.deepEqual(h.focused, [{ name: block, options: { preventScroll: true } }]);
  }
});

test("independent boundary instances cannot cancel or consume each other's frame ownership", () => {
  const h = harness([0, 1]);
  const first = h.create("Mission"), second = h.create("Overview");
  h.failure(first, h.node("first"));
  const target = h.node("second");
  h.failure(second, target);
  h.state.documentTarget = target;
  const firstFrame = h.catchError(first), secondFrame = h.catchError(second);
  first.componentWillUnmount?.();
  assert.deepEqual(h.cancelled, [0]);
  assert.equal(h.pending.get(1), secondFrame);
  h.run(firstFrame);
  assert.deepEqual(h.focused, []);
  h.run(secondFrame);
  assert.deepEqual(h.focused, [{ name: "second", options: { preventScroll: true } }]);
  first.componentWillUnmount?.();
  assert.deepEqual(h.cancelled, [0], "repeated old cleanup cannot cancel another instance");
});

test("every caught value selects the named fallback without inspecting the value", async (t) => {
  const privateValue = "private-render-error", privateStack = "private-render-stack";
  const hostile = new Proxy({}, { get() { throw new Error("caught value was inspected"); } });
  const cases = [
    ["null", null], ["undefined", undefined], ["false", false], ["zero", 0],
    ["negative zero", -0], ["NaN", NaN], ["empty string", ""], ["zero bigint", 0n],
    ["string", privateValue], ["object", { message: privateValue, stack: privateStack }],
    ["symbol", Symbol(privateValue)], ["Error", new Error(privateValue)], ["proxy", hostile],
  ];
  for (const [index, [label, value]] of cases.entries()) {
    await t.test(label, () => {
      const h = harness([0]);
      const name = ["Mission", "Overview", "City"][index % 3];
      const child = React.createElement("div", null, "ready");
      const boundary = h.create(name, child);
      assert.equal(boundary.render(), child, "a new boundary preserves the child identity");
      // Pass the value directly: a default argument must not replace explicit undefined.
      boundary.state = h.Boundary.getDerivedStateFromError(value);
      const element = boundary.render();
      assert.notEqual(element, child, "a caught value must never retry the failed children");
      const html = renderToStaticMarkup(element);
      assert.match(html, /id="lazy-view-failure"/);
      assert.ok(html.includes(`${name} could not load`));
      assert.doesNotMatch(html, /private-render-error|private-render-stack/);
      const target = h.node(name);
      assert.equal(typeof element.ref, "function");
      element.ref(target);
      h.state.documentTarget = h.node("foreign-same-id");
      boundary.componentDidCatch(value, { componentStack: privateStack });
      assert.equal(h.frames.length, 1);
      h.run(h.frames[0]);
      h.run(h.frames[0]);
      assert.deepEqual(h.focused, [{ name, options: { preventScroll: true } }]);
      assert.equal(h.state.lookups, 0);
      assert.equal(h.state.reloads, 0, "catching or focusing does not reload automatically");
      const buttons = React.Children.toArray(element.props.children).filter(child => child.type === "button");
      assert.equal(buttons.length, 1, "Reload remains the sole explicit recovery action");
      assert.equal(buttons[0].props.children, "Reload");
      buttons[0].props.onClick();
      assert.equal(h.state.reloads, 1);
      boundary.componentWillUnmount?.();
      assert.deepEqual(h.cancelled, []);
    });
  }
});
