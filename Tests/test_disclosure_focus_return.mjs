import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(resolve(root, "Frontend/package.json"));
const ts = require("typescript");
const source = readFileSync(resolve(root, "Frontend/src/ui.tsx"), "utf8");
const canonical = text => text.replace(/\r\n/g, "\n");
const sha = text => createHash("sha256").update(text).digest("hex");
function parse (text, filename = "ui.tsx") {
  const ast = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  assert.equal(ast.parseDiagnostics.length, 0, "valid source syntax");
  return ast;
}
function named (ast, name) {
  const matches = ast.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.equal(matches.length, 1, `one actual ${name}`);
  return matches[0];
}
const compile = text => ts.transpileModule(text, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
}).outputText;
function factory (text) {
  const ast = parse(text);
  const epoch = ast.statements.filter(node => ts.isVariableStatement(node)
    && node.declarationList.declarations.some(item => item.name.getText(ast) === "disclosureRestoreEpoch"));
  assert.equal(epoch.length, 1);
  const actual = [epoch[0], named(ast, "suppressDisclosureFocusRestore"), named(ast, "useDisclosureBehavior")]
    .map(node => node.getText(ast).replace(/^export /, "")).join("\n");
  return new Function("useRef", "useEffect", "window", "document", "queueMicrotask",
    compile(actual) + "\nreturn { useDisclosureBehavior, suppressDisclosureFocusRestore };");
}
const actualFactory = factory(source);

// Only deterministic effect/ref/listener/DOM boundaries are controlled. No browser
// globals are replaced, and the complete production hook owns all focus decisions.
function withDisclosure (run, initial = {}) {
  let cursor = 0, effect, pending, props, mounted = true;
  const refs = [], listeners = new Map(), microtasks = [], focus = [], reasons = [];
  const document = { body: null, documentElement: null, activeElement: null };
  function element (name, connected = true, visible = true) {
    return { name, isConnected: connected, children: new Set(), disabled: false,
      contains (node) { return node === this || this.children.has(node); },
      getClientRects: () => visible ? [{}] : [],
      focus (options) { focus.push({ name, options }); document.activeElement = this; } };
  }
  document.body = element("body"); document.documentElement = element("html");
  document.activeElement = document.body;
  const main = element("main"), opener = element("trigger"), inside = element("inside"), external = element("external");
  const region = element("root"); region.children.add(inside); region.children.add(opener);
  let fallback = main;
  document.getElementById = id => id === "main-content" ? fallback : null;
  const window = {
    addEventListener (name, callback, capture) {
      assert.ok(!listeners.has(name), `no duplicate ${name} listener`);
      listeners.set(name, { callback, capture });
    },
    removeEventListener (name, callback, capture) {
      const current = listeners.get(name);
      assert.equal(current?.callback, callback); assert.equal(current?.capture, capture);
      listeners.delete(name);
    },
  };
  const api = actualFactory(value => refs[cursor++] ?? (refs[cursor - 1] = { current: value }),
    (setup, dependencies) => {
      if (!effect || dependencies.some((value, index) => !Object.is(value, effect.dependencies[index]))) {
        pending = { setup, dependencies };
      }
    }, window, document, callback => microtasks.push(callback));
  function render () {
    assert.ok(mounted); cursor = 0; pending = null;
    api.useDisclosureBehavior(props);
    if (pending) {
      effect?.cleanup?.();
      effect = { ...pending, cleanup: pending.setup() };
    }
  }
  props = { open: false, rootRef: { current: region }, triggerRef: { current: opener },
    onClose: reason => { reasons.push(reason); props = { ...props, open: false }; }, ...initial };
  const h = { document, focus, reasons, listeners, opener, inside, external, main, region, element,
    get props () { return props; },
    setOpen (open) { props = { ...props, open }; },
    update (patch) { props = { ...props, ...patch }; render(); },
    render,
    flush () { let count = 0; while (microtasks.length) { assert.ok(++count < 30); microtasks.shift()(); } },
    key (key) {
      const event = { key, prevented: 0, stopped: 0,
        preventDefault () { this.prevented++; }, stopPropagation () { this.stopped++; } };
      listeners.get("keydown")?.callback(event); render(); return event;
    },
    pointer (target) { listeners.get("pointerdown")?.callback({ target }); render(); },
    replay () { effect?.cleanup?.(); effect = { ...effect, cleanup: effect.setup() }; },
    unmount () { if (!mounted) return; mounted = false; effect?.cleanup?.(); effect = null; },
    suppress: api.suppressDisclosureFocusRestore,
    fallback (value) { fallback = value; },
  };
  try { render(); return run(h); }
  finally { h.suppress(); h.unmount(); h.flush(); assert.equal(listeners.size, 0, "all owned listeners removed"); }
}

test("actual Escape close restores the connected disclosure opener", () => {
  withDisclosure(h => {
    h.update({ open: true }); h.document.activeElement = h.inside;
    const event = h.key("Escape");
    assert.equal(event.prevented, 1); assert.equal(event.stopped, 1);
    assert.deepEqual(h.reasons, ["escape"]); assert.equal(h.props.open, false);
    h.flush();
    assert.deepEqual(h.focus, [{ name: "trigger", options: { preventScroll: true } }],
      "actual open-to-closed lifecycle must restore the opener");
  });
});

test("closed renders are inert and current callbacks receive unchanged key and pointer reasons", () => {
  withDisclosure(h => {
    h.render(); h.flush(); assert.equal(h.listeners.size, 0); assert.deepEqual(h.focus, []);
    h.update({ open: true });
    assert.equal(h.listeners.get("keydown").capture, true);
    assert.equal(h.listeners.get("pointerdown").capture, undefined);
    const listener = h.listeners.get("keydown").callback;
    h.update({ onClose: reason => { h.reasons.push(`latest:${reason}`); h.setOpen(false); } });
    assert.equal(h.listeners.get("keydown").callback, listener, "callback refresh does not reopen the owner");
    const key = h.key("Enter"); assert.equal(key.prevented, 0); assert.equal(key.stopped, 0);
    h.pointer(h.inside); assert.equal(h.props.open, true); assert.deepEqual(h.reasons, []);
    h.pointer(h.external); h.flush();
    assert.deepEqual(h.reasons, ["latest:outside"]); assert.deepEqual(h.focus, []);
  });
  withDisclosure(h => {
    h.update({ open: true, onClose: reason => { h.reasons.push(`latest:${reason}`); h.setOpen(false); } });
    h.key("Escape"); h.flush(); assert.deepEqual(h.reasons, ["latest:escape"]);
    assert.equal(h.focus[0].name, "trigger");
  });
});

test("passive close protects external focus while explicit Escape retains return ownership", () => {
  for (const kind of ["inside", "body", "html", "disconnected", "external", "late-external", "escape-external"]) {
    withDisclosure(h => {
      h.update({ open: true });
      h.document.activeElement = kind === "body" || kind === "late-external" ? h.document.body
        : kind === "html" ? h.document.documentElement
          : kind === "disconnected" ? h.element("gone", false)
            : kind.includes("external") ? h.external : h.inside;
      if (kind === "escape-external") h.key("Escape");
      else h.update({ open: false });
      if (kind === "late-external") h.document.activeElement = h.external;
      h.flush();
      assert.deepEqual(h.focus.map(item => item.name),
        ["external", "late-external"].includes(kind) ? [] : ["trigger"], kind);
    });
  }
});

test("captured roots survive ref clearing and never adopt another disclosure's focused node", () => {
  for (const repoint of [false, true]) withDisclosure(h => {
    h.update({ open: true });
    h.document.activeElement = repoint ? h.external : h.inside;
    const replacement = h.element("replacement"); replacement.children.add(h.external);
    h.props.rootRef.current = repoint ? replacement : null;
    h.update({ open: false }); h.flush();
    assert.deepEqual(h.focus.map(item => item.name), repoint ? [] : ["trigger"]);
  });
});

test("global suppression wins before and after close, including explicit Escape", () => {
  for (const timing of ["before", "after"]) withDisclosure(h => {
    h.update({ open: true });
    if (timing === "before") h.suppress();
    h.key("Escape");
    if (timing === "after") h.suppress();
    h.flush(); assert.deepEqual(h.focus, [], timing);
  });
});

test("reopen, dependency replacement and StrictMode replay retire prior microtasks", () => {
  for (const kind of ["reopen", "replace", "replay"]) withDisclosure(h => {
    h.update({ open: true });
    if (kind === "reopen") { h.key("Escape"); h.update({ open: true }); }
    else if (kind === "replace") h.update({ rootRef: { current: h.region } });
    else h.replay();
    h.flush(); assert.deepEqual(h.focus, [], kind); assert.equal(h.listeners.size, 2);
    h.document.activeElement = h.inside; h.key("Escape"); h.flush();
    assert.deepEqual(h.focus.map(item => item.name), ["trigger"], "new owner still returns focus");
  });
});

test("initial focus, optional return targets, hidden targets, fallback and unmount remain bounded", () => {
  for (const kind of ["return", "detached", "hidden", "missing-main", "unmount", "unmount-external"]) withDisclosure(h => {
    const initial = h.element("initial"), destination = h.element("return", kind !== "detached", kind !== "hidden");
    h.region.children.add(initial);
    h.update({ open: true, initialFocusRef: { current: initial }, returnFocusRef: { current: destination } });
    assert.deepEqual(h.focus, [{ name: "initial", options: { preventScroll: true } }]);
    h.focus.length = 0;
    if (kind === "missing-main") { h.props.returnFocusRef.current = null; h.props.triggerRef.current = null; h.fallback(null); }
    if (kind === "unmount-external") h.document.activeElement = h.external;
    if (kind.startsWith("unmount")) h.unmount(); else h.key("Escape");
    h.flush();
    assert.deepEqual(h.focus.map(item => item.name), ["missing-main", "unmount-external"].includes(kind) ? []
      : ["detached", "hidden"].includes(kind) ? ["main"] : ["return"], kind);
    for (const call of h.focus) assert.deepEqual(call.options, { preventScroll: true });
  });
});

const appSource = readFileSync(resolve(root, "Frontend/src/App.tsx"), "utf8"), appAst = parse(appSource, "App.tsx");
const warningOwner = named(appAst, "WarningsBanner"), cleanOwner = named(appAst, "CleanToastStack");
function declarations (owner, names) {
  return owner.body.statements.filter(node => ts.isVariableStatement(node)
    && node.declarationList.declarations.some(item => names.includes(item.name.getText(appAst))))
    .map(node => node.getText(appAst)).join("\n");
}
const warningState = new Function("repos", "dismissed", "expanded",
  compile(declarations(warningOwner, ["items", "disclosureOpen"]) + "\nreturn { items, disclosureOpen };"));
const cleanGate = new Function("toasts", "expanded",
  compile(declarations(cleanOwner, ["disclosureOpen"]) + "\nreturn disclosureOpen;"));
const warningLayouts = warningOwner.body.statements.filter(node => ts.isExpressionStatement(node)
  && ts.isCallExpression(node.expression) && node.expression.expression.getText(appAst) === "useLayoutEffect"
  && node.expression.arguments[0].getText(appAst).includes("pendingDismissFocusRef"));
assert.equal(warningLayouts.length, 1);
const warningLayoutCode = warningLayouts[0].expression.arguments[0].getText(appAst);
function warningLayout (h, items, flags = {}) {
  const environment = {
    pendingDismissFocusRef: { current: undefined }, dismissRefs: { current: new Map() },
    triggerRef: h.props.triggerRef, pendingEscapeFocusRef: { current: false },
    pendingPageFocusRef: { current: false }, disclosureOpen: items.length > 0,
    listRef: { current: { scrollTop: 100 } }, headingRef: { current: h.element("heading") },
    focusedDetailRef: { current: { element: h.element("removed warning", false), kind: "warning", index: 0 } },
    suppressRefreshFocusRef: { current: false }, document: h.document, HTMLButtonElement: class {}, items, ...flags,
  };
  new Function(...Object.keys(environment), compile(`return (${warningLayoutCode});`))(...Object.values(environment))();
  return environment;
}

test("actual warning snapshot removal preserves both external focus and warning-owned recovery", () => {
  for (const kind of ["external", "lost", "dismissed", "late-external"]) withDisclosure(h => {
    const initial = warningState([{ id: "EA", warnings: [{ ts: "t", message: "one" }] }], new Set(), true);
    assert.equal(initial.disclosureOpen, true); h.update({ open: initial.disclosureOpen });
    const next = warningState([{ id: "EA", warnings: [] }], new Set(), true);
    assert.equal(next.disclosureOpen, false); assert.deepEqual(next.items, []);
    h.props.rootRef.current = null; h.props.triggerRef.current = null;
    h.document.activeElement = kind === "external" ? h.external : h.document.body;
    warningLayout(h, next.items, kind === "dismissed" ? { pendingDismissFocusRef: { current: null } } : {});
    h.update({ open: next.disclosureOpen });
    if (kind === "late-external") h.document.activeElement = h.external;
    h.flush();
    assert.deepEqual(h.focus.map(item => item.name), kind === "external" ? [] : ["main"],
      "shared cleanup must not duplicate or redirect the actual layout decision");
    if (kind === "late-external") assert.equal(h.document.activeElement, h.external);
  });
});

test("actual warning page and outside recovery remain independently owned", () => {
  withDisclosure(h => {
    h.update({ open: true }); h.document.activeElement = h.inside;
    const env = warningLayout(h, [{ key: "one" }], { pendingPageFocusRef: { current: true },
      focusedDetailRef: { current: null } });
    assert.equal(env.listRef.current.scrollTop, 0);
    h.render(); h.flush(); assert.deepEqual(h.focus.map(item => item.name), ["heading"]);
  });
  withDisclosure(h => {
    h.update({ open: true }); h.document.activeElement = h.external;
    h.pointer(h.external);
    warningLayout(h, [], { suppressRefreshFocusRef: { current: true } }); h.flush();
    assert.deepEqual(h.focus, []);
  });
});

test("actual CLEAN five-to-four gate preserves external focus and recovers a removed control", () => {
  const effects = cleanOwner.body.statements.filter(node => ts.isExpressionStatement(node)
    && ts.isCallExpression(node.expression) && node.expression.expression.getText(appAst) === "useEffect"
    && node.expression.arguments[0].getText(appAst).includes("setExpanded(false)"));
  assert.equal(effects.length, 1);
  const collapse = new Function("expanded", "toasts", "setExpanded",
    compile(`return (${effects[0].expression.arguments[0].getText(appAst)});`));
  for (const external of [false, true]) withDisclosure(h => {
    assert.equal(cleanGate(Array(5), true), true); assert.equal(cleanGate(Array(4), true), false);
    assert.equal(cleanGate(Array(5), false), false);
    h.update({ open: cleanGate(Array(5), true) }); h.props.triggerRef.current = null;
    h.document.activeElement = external ? h.external : h.element("removed dismiss", false);
    const updates = []; collapse(true, Array(4), value => updates.push(value))();
    assert.deepEqual(updates, [false], "actual consumer effect resets expanded after shrink");
    h.update({ open: cleanGate(Array(4), true) }); h.flush();
    assert.deepEqual(h.focus.map(item => item.name), external ? [] : ["main"]);
  });
});

test("all six actual consumers retain the same shared hook and handoff contract", () => {
  const goalSource = readFileSync(resolve(root, "Frontend/src/goalRings.tsx"), "utf8"), goalAst = parse(goalSource, "goalRings.tsx");
  const consumers = ["App", "WarningsBanner", "CleanToastStack", "AttentionBell", "Legend"]
    .map(name => named(appAst, name).getText(appAst));
  consumers.push(named(goalAst, "GoalRings").getText(goalAst));
  for (const text of consumers) assert.equal((text.match(/useDisclosureBehavior\(/g) ?? []).length, 1);
  assert.match(consumers[4], /open: true/);
  assert.match(appSource, /suppressDisclosureFocusRestore\(\);\s*setPanelOpen\(false\);\s*setMoreOpen\(false\);\s*setShowLegend\(false\)/);
  assert.match(appSource, /suppressDisclosureFocusRestore\(\);\s*onClose\(\);\s*onNavigate\(row.repo, row.picks > 0\)/);
});

const WINDOWS = [
  ["    const lifecycle = ++lifecycleRef.current;\n    if (!open) return;\n",
    "    if (!open) return;\n    const lifecycle = ++lifecycleRef.current;\n",
    "220337ab5599044e67accc156a44d492b348d0467705aa9cd95a63f49d461785"],
  ["    const mountedEpoch = disclosureRestoreEpoch;\n",
    "    const mountedEpoch = disclosureRestoreEpoch;\n    const root = rootRef.current;\n    let escapeRequested = false;\n",
    "6111b26bb9f5aab716dd2393f8e773dc7e78952d8f46bb589e0b38ddaadfb21d"],
  ['      event.stopPropagation();\n      onCloseRef.current("escape");\n',
    '      event.stopPropagation();\n      escapeRequested = true;\n      onCloseRef.current("escape");\n',
    "3e900d8bfb458cb92ceb22e4cb54f84e3b48a99fa1ba936e1c8d7abcb57cf554"],
  ["        if (mountedEpoch !== disclosureRestoreEpoch) return;\n",
    "        if (mountedEpoch !== disclosureRestoreEpoch) return;\n        const active = document.activeElement;\n"
      + "        if (!escapeRequested && active?.isConnected && active !== document.body\n"
      + "            && active !== document.documentElement && !root?.contains(active)) return;\n",
    "3edb09f04d30f2f1b56c9c13f474f41f7dab2d93e5477e1f6e1ffd8827eb6511"],
];
function restoreOriginal (text) {
  let restored = canonical(text); const ast = parse(restored), hook = named(ast, "useDisclosureBehavior");
  const effects = hook.body.statements.filter(node => ts.isExpressionStatement(node)
    && ts.isCallExpression(node.expression) && node.expression.expression.getText(ast) === "useEffect");
  assert.equal(effects.length, 1, "one complete owning effect");
  for (const [old, next, pin] of WINDOWS) {
    assert.equal(sha(next), pin); assert.equal(restored.split(next).length - 1, 1, "one exact reviewed window");
    assert.equal(effects[0].getText(ast).split(next).length - 1, 1, "window belongs to hook effect");
    restored = restored.replace(next, old);
  }
  const oldAst = parse(restored), originalHook = named(oldAst, "useDisclosureBehavior");
  assert.equal(sha(originalHook.getText(oldAst)), "6b69d479253007134c6fe46bce76709cb8e761ae75c3e8052a298de628bd52f5");
  assert.equal(sha(restored.slice(0, originalHook.getStart(oldAst)) + restored.slice(originalHook.end)),
    "1c4a82a53ee7079e7a9040360c94fde58afc76d892d76b10c6bfcda9a5ab66e0");
  assert.equal(sha(restored), "e1bd3c02d65c7e3cdf5f6fdada514afd78137278222492ef4c5de95e7d99686e");
  return text.includes("\r\n") ? restored.replace(/\n/g, "\r\n") : restored;
}

test("strict four-window restoration retains original whole hook, outside and raw/LF module", () => {
  assert.equal(sha(restoreOriginal(canonical(source))), "e1bd3c02d65c7e3cdf5f6fdada514afd78137278222492ef4c5de95e7d99686e");
  assert.equal(sha(restoreOriginal(canonical(source).replace(/\n/g, "\r\n"))), "e40178bae133c6e1c6509f5c629442b41042529bb18741e4e4a0a9d1906cf3f9");
});

test("restoration rejects incomplete, relocated and unrelated changes under both physical endings", () => {
  const lf = canonical(source), negatives = [];
  function changed (from, to) {
    assert.equal(lf.split(from).length - 1, 1, "unique mutation anchor"); return lf.replace(from, to);
  }
  for (const [index, [old, next]] of WINDOWS.entries()) {
    negatives.push([`missing window ${index}`, changed(next, old)], [`duplicate window ${index}`, changed(next, next + next)]);
  }
  negatives.push(
    ["partial intent", changed("let escapeRequested = false;", "let escapeRequested = true;")],
    ["live root instead of captured root", changed("!root?.contains(active)", "!rootRef.current?.contains(active)")],
    ["wrong owner", changed("export function useDisclosureBehavior (", "export function otherDisclosure (")],
    ["moved root capture", changed(WINDOWS[1][1], "    const root = rootRef.current;\n    let escapeRequested = false;\n" + WINDOWS[1][0])],
    ["suppression", changed("if (mountedEpoch !== disclosureRestoreEpoch) return;", "if (mountedEpoch === disclosureRestoreEpoch) return;")],
    ["listener", changed('window.addEventListener("keydown", onKey, true);', 'window.addEventListener("keydown", onKey, false);')],
    ["focus", changed("target.focus({ preventScroll: true });", "target.focus({ preventScroll: false });")],
    ["dependency", changed("[initialFocusRef, open, returnFocusRef, rootRef, triggerRef]", "[initialFocusRef, open, rootRef, triggerRef]")],
    ["outside", lf + "\nconst unrelated = 1;\n"],
    ["duplicate owner", lf + "\n" + named(parse(lf), "useDisclosureBehavior").getText(parse(lf))],
    ["syntax", lf + "\nconst broken = ;\n"],
  );
  for (const [label, altered] of negatives) for (const crlf of [false, true]) {
    assert.throws(() => restoreOriginal(crlf ? altered.replace(/\n/g, "\r\n") : altered),
      { name: "AssertionError" }, `${label} ${crlf ? "CRLF" : "LF"}`);
  }
});
