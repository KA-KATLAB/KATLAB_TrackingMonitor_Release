import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { canonicalPrintedText } from "./helpers/printed_source.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(resolve(root, "Frontend/package.json"));
const ts = require("typescript"), React = require("react");
const read = (file) => readFileSync(resolve(root, "Frontend/src", file), "utf8");
const parse = (text) => ts.createSourceFile("CommandPalette.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const source = parse(read("CommandPalette.tsx")), ui = parse(read("ui.tsx"));
const declaration = (ast, name) => {
  const found = ast.statements.filter((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.equal(found.length, 1, `one actual ${name}`); return found[0];
};
const functions = [
  ...["getBoundedPageWindow", "collectionIdentityKey", "useBoundedPage"].map((name) => declaration(ui, name).getText(ui)),
  ...["paletteEntryId", "paletteOptionDomId", "assertUniquePaletteEntries", "normalizeQuery", "fuzzyScore", "CommandPalette"]
    .map((name) => declaration(source, name).getText(source)),
].map((text) => text.replace(/^export\s+/, "")).join("\n");
const emitted = ts.transpileModule(`export function createSubject(React, hooks, boundary) {
  const {useState,useRef,useMemo,useCallback,useEffect}=hooks;
  const {hasOverlayLease,suppressOverlayFocusRestore}=boundary;
  const DialogShell="dialog-shell", CollectionPager="collection-pager";
  ${functions}
  return {CommandPalette,paletteOptionDomId};
}`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React } }).outputText;
const { createSubject } = await import(`data:text/javascript;base64,${Buffer.from(emitted).toString("base64")}`);
const nodes = (value) => Array.isArray(value) ? value.flatMap(nodes)
  : React.isValidElement(value) ? [value, ...nodes(value.props.children)] : [];
const sameDeps = (a, b) => Array.isArray(a) && Array.isArray(b)
  && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
const entries = (count = 50) => Array.from({ length: count }, (_, index) => ({
  id: `row-${index}`, section: "Tasks", label: `Task ${index}`, run() {},
}));

// Complete actual component/pager with controlled hooks and geometry, not React
// DOM rendering, browser scrolling, DialogShell focus trapping or AT evidence.
function withPalette (items, body) {
  const original = ["window", "document", "HTMLElement"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  const listeners = new Set(), slots = [], writes = [], statuses = [], changes = [], bound = new Set();
  const geometry = { top: 100, border: 0, height: 288, rowHeight: 36, scroll: 0,
    connected: true, rowConnected: true, rowHeights: new Map(), rects: new Map(), missing: false, nonElement: false };
  let cursor = 0, pending = [], dirty = false, tree = null, lease = false, suppressed = 0, cleanupFailure = false;
  const forbidden = (name) => () => assert.fail(`forbidden nonlocal operation: ${name}`);
  class Element {
    isConnected = true;
    focus = forbidden("focus");
    scrollIntoView = forbidden("scrollIntoView");
  }
  const list = new Element(), input = new Element();
  list.children = [];
  list.getBoundingClientRect = () => ({ top: geometry.top });
  Object.defineProperties(list, {
    clientTop: { get: () => geometry.border }, clientHeight: { get: () => geometry.height },
    scrollTop: { get: () => geometry.scroll, set(value) {
      writes.push(value); geometry.scroll = Math.max(0, Math.min(value, Math.max(0, list.totalHeight - geometry.height)));
    } },
  });
  let props = { entries: items, open: false, onStatus: (value) => statuses.push(value),
    onOpenChange(value) { changes.push(value); props = { ...props, open: value }; dirty = true; } };
  const slot = (kind, initial) => {
    const index = cursor++; slots[index] ??= { kind, ...initial() };
    assert.equal(slots[index].kind, kind); return slots[index];
  };
  const memo = (factory, deps, kind) => {
    const current = slot(kind, () => ({}));
    if (!sameDeps(current.deps, deps)) { current.deps = deps; current.value = factory(); }
    return current.value;
  };
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
    useMemo(factory, deps) { return memo(factory, deps, "memo"); },
    useCallback(callback, deps) { return memo(() => callback, deps, "callback"); },
    useEffect(callback, deps) {
      const current = slot("effect", () => ({}));
      if (!sameDeps(current.deps, deps)) {
        current.deps = deps; pending.push(() => { current.cleanup?.(); current.cleanup = callback(); });
      }
    },
  };
  const subject = createSubject(React, hooks, {
    hasOverlayLease: () => lease, suppressOverlayFocusRestore: () => { suppressed++; },
  });
  function bindRefs () {
    for (const ref of bound) ref.current = null;
    bound.clear(); list.isConnected = Boolean(tree) && geometry.connected;
    let offset = 0;
    list.children = nodes(tree).filter((node) => node.props.role === "option").map((node) => {
      const row = geometry.nonElement ? {} : new Element(), start = offset;
      const height = geometry.rowHeights.get(node.props.id) ?? geometry.rowHeight; offset += height;
      row.id = node.props.id; row.isConnected = geometry.rowConnected;
      row.getBoundingClientRect = () => geometry.rects.get(row.id) ?? {
        top: geometry.top + geometry.border + start - geometry.scroll,
        bottom: geometry.top + geometry.border + start - geometry.scroll + height, height,
      };
      return row;
    });
    list.totalHeight = offset;
    for (const node of nodes(tree)) {
      if (node.ref && typeof node.ref === "object") {
        node.ref.current = node.type === "ul" ? geometry.missing ? null : list : node.type === "input" ? input : null;
        bound.add(node.ref);
      }
    }
  }
  function render () {
    for (let pass = 0; pass < 20; pass++) {
      cursor = 0; pending = []; dirty = false; tree = subject.CommandPalette(props);
      bindRefs(); for (const effect of pending) effect();
      if (!dirty) return;
    }
    assert.fail("actual palette effects did not settle");
  }
  const h = {
    geometry, list, writes, statuses, changes, listeners, render,
    tree: () => tree, input: () => nodes(tree).find((node) => node.type === "input"),
    options: () => nodes(tree).filter((node) => node.props.role === "option"),
    pager: () => nodes(tree).find((node) => node.type === "collection-pager"),
    active: () => list.children.find((row) => row.id === h.input().props["aria-activedescendant"]),
    open(value = true) { props = { ...props, open: value }; render(); },
    update(next) { props = { ...props, ...next }; render(); },
    query(value) { h.input().props.onChange({ target: { value } }); render(); },
    arrow(key) { let prevented = 0; h.input().props.onKeyDown({ key, preventDefault() { prevented++; } }); render(); return prevented; },
    shortcut(key = "k", meta = false) {
      let prevented = 0;
      for (const callback of listeners) callback({ key, ctrlKey: !meta, metaKey: meta, preventDefault() { prevented++; } });
      render(); return prevented;
    },
    hover(index) { h.options()[index].props.onMouseEnter(); render(); },
    lease(value) { lease = value; }, suppressed: () => suppressed,
    failCleanup() { cleanupFailure = true; },
  };
  try {
    Object.defineProperty(globalThis, "HTMLElement", { configurable: true, value: Element });
    Object.defineProperty(globalThis, "document", { configurable: true, value: {
      getElementById: forbidden("document lookup"), querySelector: forbidden("document selector"),
      documentElement: { scrollTop: 17 }, body: { scrollTop: 23 },
    } });
    Object.defineProperty(globalThis, "window", { configurable: true, value: {
      scrollTo: forbidden("window scroll"), requestAnimationFrame: forbidden("animation frame"), setTimeout: forbidden("timer"),
      addEventListener(type, callback) { assert.equal(type, "keydown"); listeners.add(callback); },
      removeEventListener(type, callback) {
        assert.equal(type, "keydown"); listeners.delete(callback); if (cleanupFailure) throw new Error("cleanup sentinel");
      },
    } });
    render(); body(h, subject);
  } finally {
    try {
      for (const current of slots) current.cleanup?.();
      for (const ref of bound) ref.current = null;
      assert.equal(listeners.size, 0, "global key listener removed");
      assert.equal(globalThis.document.documentElement.scrollTop, 17); assert.equal(globalThis.document.body.scrollTop, 23);
    } finally {
      for (const [key, descriptor] of original) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
      }
    }
  }
}

test("ArrowUp wrapping to row49 exposes the actual selected option inside its local viewport", () => {
  withPalette(entries(), (h) => {
    h.open(); assert.equal(h.options().length, 50); assert.equal(h.arrow("ArrowUp"), 1);
    assert.equal(h.input().props["aria-activedescendant"], h.options()[49].props.id);
    const row = h.active().getBoundingClientRect(), top = h.geometry.top + h.list.clientTop;
    assert.ok(row.top >= top && row.bottom <= top + h.list.clientHeight,
      `selected row must be locally visible: top=${row.top}, bottom=${row.bottom}, viewport=${top}..${top + h.list.clientHeight}`);
    assert.equal(h.geometry.scroll, 1512); assert.deepEqual(h.writes, [1512]);
  });
});

test("ArrowDown wrapping, visible options and pointer hover preserve selection without gratuitous scroll", () => {
  withPalette(entries(), (h) => {
    h.open(); h.arrow("ArrowDown"); assert.equal(h.writes.length, 0);
    assert.equal(h.input().props["aria-activedescendant"], h.options()[1].props.id);
    h.hover(49); assert.equal(h.writes.length, 0, "pointer hover never reveals");
    h.arrow("ArrowDown"); assert.equal(h.input().props["aria-activedescendant"], h.options()[0].props.id);
    assert.equal(h.writes.length, 0); h.arrow("ArrowUp"); assert.equal(h.geometry.scroll, 1512);
    h.arrow("ArrowDown"); assert.equal(h.geometry.scroll, 0); assert.deepEqual(h.writes, [1512, 0]);
    assert.equal(h.tree().props.initialFocusRef.current, nodes(h.tree()).find((node) => node.type === "input").ref.current);
  });
});

test("ordinary ArrowDown crosses the viewport edge by one row and ArrowUp exposes the leading row", () => {
  withPalette(entries(12), (h) => {
    h.open(); for (let index = 0; index < 8; index++) h.arrow("ArrowDown");
    assert.equal(h.geometry.scroll, 36); assert.deepEqual(h.writes, [36]);
    assert.equal(h.active().getBoundingClientRect().bottom, h.geometry.top + h.list.clientHeight);
    for (let index = 0; index < 8; index++) h.arrow("ArrowUp");
    assert.equal(h.geometry.scroll, 0); assert.deepEqual(h.writes, [36, 0]);
  });
});

for (const [name, row, expected] of [
  ["partly above", { top: 98.5, bottom: 118.5, height: 20 }, 494.75],
  ["partly below", { top: 135.25, bottom: 155.25, height: 20 }, 511],
  ["already visible", { top: 105.5, bottom: 125.5, height: 20 }, null],
  ["oversized leading edge", { top: 120.25, bottom: 220.25, height: 100 }, 516.5],
]) {
  test(`fractional ${name} uses the local clientTop viewport`, () => withPalette(entries(), (h) => {
    h.open(); Object.assign(h.geometry, { top: 100.25, border: 3.5, height: 40.5, scroll: 500 });
    h.geometry.rects.set(h.options()[1].props.id, row); h.arrow("ArrowDown");
    assert.deepEqual(h.writes, expected === null ? [] : [expected]);
    assert.equal(h.geometry.scroll, expected ?? 500);
  }));
}

test("one oversized option realigns its leading edge on repeated same-ID arrows without a state change", () => {
  withPalette(entries(1), (h) => {
    h.geometry.rowHeight = 500; h.open(); assert.equal(h.writes.length, 0);
    h.geometry.scroll = 100; h.arrow("ArrowDown"); assert.equal(h.geometry.scroll, 0);
    h.geometry.scroll = 80; h.arrow("ArrowUp"); assert.equal(h.geometry.scroll, 0);
    assert.deepEqual(h.writes, [0, 0]); assert.equal(h.options()[0].props["aria-selected"], true);
  });
});

for (const [name, configure] of [
  ["missing list ref", (h) => { h.geometry.missing = true; h.render(); }],
  ["disconnected list", (h) => { h.geometry.connected = false; h.render(); }],
  ["zero list height", (h) => { h.geometry.height = 0; }],
  ["missing exact option", (h) => { h.list.children.splice(49, 1); }],
  ["disconnected option", (h) => { h.geometry.rowConnected = false; h.render(); }],
  ["non-HTMLElement option", (h) => { h.geometry.nonElement = true; h.render(); }],
  ["zero-height option", (h) => { h.geometry.rowHeight = 0; h.render(); }],
]) {
  test(`${name} is a no-op without a fallback global lookup`, () => withPalette(entries(), (h) => {
    h.open(); configure(h); h.arrow("ArrowUp"); assert.equal(h.writes.length, 0);
    assert.equal(h.input().props["aria-activedescendant"], h.options()[49].props.id);
  }));
}

test("empty results and one ordinary option keep bounded keys and no scrolling", () => {
  withPalette(entries(1), (h) => {
    h.open(); h.arrow("ArrowUp"); h.arrow("ArrowDown"); assert.equal(h.writes.length, 0);
    h.query("not present"); assert.equal(h.options().length, 0);
    assert.equal(h.input().props["aria-activedescendant"], undefined);
    h.arrow("ArrowUp"); h.arrow("ArrowDown"); assert.equal(h.writes.length, 0);
    h.update({ entries: [] }); h.query(""); assert.equal(h.options().length, 0);
  });
});

test("raw whitespace, case and NFKC query edits reveal the reset first row despite equal normalized identity", () => {
  withPalette(entries(), (h) => {
    h.open(); h.query("task");
    for (const query of [" TASK ", "\uff34\uff21\uff33\uff2b", "task"]) {
      h.arrow("ArrowUp"); assert.equal(h.geometry.scroll, 1512); h.query(query);
      assert.equal(h.geometry.scroll, 0); assert.equal(h.options()[0].props["aria-selected"], true);
      assert.equal(h.options().length, 50);
    }
  });
});

test("actual page changes, reopen and live result replacement reveal only their bounded first row", () => {
  withPalette(entries(110), (h, subject) => {
    h.open(); h.arrow("ArrowUp");
    for (const [page, first, count] of [[2, 50, 50], [3, 100, 10]]) {
      h.pager().props.onPageChange(page); h.render();
      assert.equal(h.pager().props.page.page, page); assert.equal(h.options().length, count);
      assert.equal(h.input().props["aria-activedescendant"], subject.paletteOptionDomId(`row-${first}`));
      assert.equal(h.geometry.scroll, 0); h.arrow("ArrowUp"); assert.ok(h.geometry.scroll > 0);
    }
    h.open(false); assert.equal(h.tree(), null); h.open();
    assert.equal(h.pager().props.page.page, 3, "existing reopen page policy is unchanged");
    assert.equal(h.input().props["aria-activedescendant"], subject.paletteOptionDomId("row-100"));
    assert.equal(h.geometry.scroll, 0);
    h.arrow("ArrowUp");
    h.update({ entries: entries(60).map((entry) => ({ ...entry, id: `new:${entry.id}` })) });
    assert.equal(h.pager().props.page.page, 1); assert.equal(h.options().length, 50);
    assert.equal(h.input().props["aria-activedescendant"], subject.paletteOptionDomId("new:row-0"));
    assert.equal(h.geometry.scroll, 0);
  });
});

test("disabled keyboard selection, Enter and dialog/disclosure handoffs retain existing action owners", () => {
  for (const handoff of ["opensDialog", "opensDisclosure"]) {
    const calls = [], items = entries();
    items[49] = { ...items[49], disabledReason: "Action pending", run() { assert.fail("disabled command ran"); } };
    items[0] = { ...items[0], [handoff]: true, run() { calls.push("run"); } };
    withPalette(items, (h) => {
      assert.equal(h.listeners.size, 1); h.lease(true); assert.equal(h.shortcut(), 0);
      assert.equal(h.tree(), null); h.lease(false); assert.equal(h.shortcut("K", true), 1);
      h.arrow("ArrowUp"); assert.equal(h.geometry.scroll, 1512); h.arrow("Enter");
      assert.deepEqual(h.statuses, ["Action pending"]); assert.ok(h.tree()); assert.equal(h.suppressed(), 0);
      h.arrow("ArrowDown"); h.arrow("Enter"); assert.deepEqual(calls, ["run"]);
      assert.equal(h.suppressed(), 1); assert.equal(h.tree(), null);
      h.open(); h.tree().props.onClose(); h.render(); assert.equal(h.tree(), null);
    });
  }
});

test("controlled global descriptors restore even when body, assertion or cleanup fails", () => {
  const original = ["window", "document", "HTMLElement"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  for (const [body, expected] of [
    [() => { throw new Error("body sentinel"); }, /body sentinel/],
    [(h) => { h.open(); assert.fail("assertion sentinel"); }, /assertion sentinel/],
    [(h) => { h.open(); h.failCleanup(); }, /cleanup sentinel/],
  ]) {
    assert.throws(() => withPalette(entries(), body), expected);
    for (const [key, descriptor] of original) assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis, key), descriptor);
  }
});

const sha = (text) => createHash("sha256").update(text).digest("hex");
test("strict six-insertion restoration preserves every original source fingerprint in LF and CRLF", async () => {
  const { restorePaletteVisibility, PALETTE_VISIBILITY_INSERTIONS, PALETTE_VISIBILITY_INSERTIONS_SHA,
    ORIGINAL_PALETTE_LF_SHA } = await import("./helpers/paletteVisibility.mjs");
  assert.equal(sha(JSON.stringify(PALETTE_VISIBILITY_INSERTIONS)), PALETTE_VISIBILITY_INSERTIONS_SHA);
  assert.equal(PALETTE_VISIBILITY_INSERTIONS.reduce((sum, insertion) => sum + insertion.count, 0), 6);
  const current = read("CommandPalette.tsx").replace(/\r\n/g, "\n");
  for (const text of [current, current.replace(/\n/g, "\r\n")]) {
    const restored = restorePaletteVisibility(text);
    assert.equal(restored.includes("\r\n"), text.includes("\r\n"));
    const lf = restored.replace(/\r\n/g, "\n"), raw = lf.replace(/\n/g, "\r\n");
    assert.equal(sha(lf), ORIGINAL_PALETTE_LF_SHA);
    assert.equal(sha(raw), "fdcb22fec68cf92cec4f5d2f86640991583a8a0763ea458496c3c105051cfcc6");
    const ast = parse(raw), fn = declaration(ast, "CommandPalette");
    assert.equal(sha(fn.getText(ast)), "7a033dfa446c42a8cae2182e07c21258e444daea5d9b303ca98581b549a59663");
    assert.equal(sha(fn.getText(ast).replace(/\r\n/g, "\n")),
      "05c278624a07ea919978ff4a6cfa2007c4b71b828694693f69bab417bb2c435d");
    assert.equal(sha(raw.slice(0, fn.getStart(ast)) + raw.slice(fn.end)),
      "343520e6dd297ce95116c3c4150f0cd6638470d9b8f41676f21ac706972f1216");
    const statements = [...fn.body.statements], printer = ts.createPrinter({ removeComments: true });
    assert.ok(ts.isReturnStatement(statements.pop()));
    const printed = canonicalPrintedText(statements.map((node) => printer.printNode(ts.EmitHint.Unspecified, node, ast)).join("\n"));
    assert.equal(sha(printed), "27b83b8bb100a6088a0c8dcc97ef44229ee301cee526866300c53cb7a81cc919");
  }
});

test("restoration rejects missing, repeated, partial and unrelated owner, render and outside edits", async () => {
  const { restorePaletteVisibility, PALETTE_VISIBILITY_INSERTIONS } = await import("./helpers/paletteVisibility.mjs");
  const current = read("CommandPalette.tsx").replace(/\r\n/g, "\n");
  for (const insertion of PALETTE_VISIBILITY_INSERTIONS) {
    assert.equal(current.split(insertion.text).length - 1, insertion.count);
    assert.throws(() => restorePaletteVisibility(current.replace(insertion.text, "")), undefined, `missing ${insertion.name}`);
    assert.throws(() => restorePaletteVisibility(current.replace(insertion.text, insertion.text.repeat(2))), undefined,
      `duplicate ${insertion.name}`);
  }
  for (const [from, to] of [
    ["!list?.isConnected", "!list"],
    ["row.height > list.clientHeight", "row.height >= list.clientHeight"],
    [".top + list.clientTop", ".top"],
    ["[open, query, resultIdentity, pager.page]", "[open, resultIdentity, pager.page]"],
    ["[open, query, resultIdentity, pager.page]", "[open, query, resultIdentity, pager.page, activeId]"],
    ["const closePalette = useCallback(() => changeOpenRef.current(false), []);",
      "const closePalette = useCallback(() => changeOpenRef.current(true), []);"],
    ["pageSize: 50,", "pageSize: 40,"],
    ['title="Command palette"', 'title="Changed palette"'],
    ['return "palette-opt-" + encoded;', 'return "changed-option-" + encoded;'],
  ]) {
    assert.ok(current.includes(from), `actual mutation target ${from}`);
    assert.throws(() => restorePaletteVisibility(current.replace(from, to)), undefined, `reject ${to}`);
  }
  for (const [before, insertion] of [
    ["  const inputRef = useRef<HTMLInputElement | null>(null);\n", PALETTE_VISIBILITY_INSERTIONS[0].text],
    ["              setActiveId(visibleMatches[next].entry.id);\n", PALETTE_VISIBILITY_INSERTIONS[4].text],
  ]) {
    assert.ok(current.includes(before + insertion));
    assert.throws(() => restorePaletteVisibility(current.replace(before + insertion, insertion + before)),
      /reviewed insertion placement/, "unchanged insertion text at the wrong site must fail");
  }
  const binding = PALETTE_VISIBILITY_INSERTIONS[3].text, id = '        id="palette-list"\n';
  assert.throws(() => restorePaletteVisibility(current.replace(binding + id, id + binding)), /reviewed insertion placement/);
  const ast = parse(current), owner = declaration(ast, "CommandPalette").getText(ast);
  assert.throws(() => restorePaletteVisibility(`${current}\n${owner}`), /one complete palette owner/);
  assert.throws(() => restorePaletteVisibility(restorePaletteVisibility(current)), /reviewed insertion placement/);
});
