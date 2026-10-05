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
const read = (name) => readFileSync(resolve(root, "Frontend/src", name), "utf8");
const palette = ts.createSourceFile("CommandPalette.tsx", read("CommandPalette.tsx"), ts.ScriptTarget.Latest, true);
const ui = ts.createSourceFile("ui.tsx", read("ui.tsx"), ts.ScriptTarget.Latest, true);
function declaration(ast, name) {
  const node = ast.statements.find((entry) => ts.isFunctionDeclaration(entry) && entry.name?.text === name);
  assert.ok(node, `actual function exists: ${name}`);
  return node.getText(ast).replace(/^export\s+/, "");
}
const extracted = [
  ...["getBoundedPageWindow", "collectionIdentityKey", "useBoundedPage"].map((name) => declaration(ui, name)),
  ...["paletteEntryId", "paletteOptionDomId", "assertUniquePaletteEntries", "normalizeQuery", "fuzzyScore", "CommandPalette"]
    .map((name) => declaration(palette, name)),
].join("\n");
const emitted = ts.transpileModule(`
export function createSubject(React, hooks, boundary) {
  const {useState,useRef,useMemo,useCallback,useEffect}=hooks;
  const {hasOverlayLease,suppressOverlayFocusRestore}=boundary;
  const DialogShell="dialog-shell", CollectionPager="collection-pager";
  ${extracted}
  return {CommandPalette,paletteEntryId,assertUniquePaletteEntries};
}`, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022,
  jsx: ts.JsxEmit.React } }).outputText;
const { createSubject } = await import(`data:text/javascript;base64,${Buffer.from(emitted).toString("base64")}`);
const sameDeps = (a, b) => Array.isArray(a) && Array.isArray(b)
  && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
const elements = (node) => Array.isArray(node) ? node.flatMap(elements)
  : React.isValidElement(node) ? [node, ...elements(node.props.children)] : [];

// Actual component and paging functions, controlled hooks/events. This does not
// simulate React DOM focus, portals, browser keyboard dispatch, or geometry.
function withPalette(entries, run) {
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  const listeners = new Set();
  const slots = [], statuses = [], changes = [];
  let cursor = 0, effects = [], dirty = false, tree = null, lease = false, suppressed = 0;
  let props = { entries, open: false, onStatus: (value) => statuses.push(value),
    onOpenChange: (value) => { changes.push(value); props = {...props, open:value}; dirty = true; } };
  function slot(kind, initial) {
    const index = cursor++;
    slots[index] ??= {kind, ...initial()};
    assert.equal(slots[index].kind, kind);
    return slots[index];
  }
  const memo = (factory, deps, kind) => {
    const current = slot(kind, () => ({}));
    if (!sameDeps(current.deps, deps)) { current.deps = deps; current.value = factory(); }
    return current.value;
  };
  const hooks = {
    useState(initial) {
      const current = slot("state", () => ({value:typeof initial === "function" ? initial() : initial}));
      current.set ??= (next) => {
        const value = typeof next === "function" ? next(current.value) : next;
        if (!Object.is(value, current.value)) { current.value = value; dirty = true; }
      };
      return [current.value, current.set];
    },
    useRef(initial) { return slot("ref", () => ({value:{current:initial}})).value; },
    useMemo(factory, deps) { return memo(factory, deps, "memo"); },
    useCallback(value, deps) { return memo(() => value, deps, "callback"); },
    useEffect(callback, deps) {
      const current = slot("effect", () => ({}));
      if (!sameDeps(current.deps, deps)) {
        current.deps = deps;
        effects.push(() => { current.cleanup?.(); current.cleanup = callback(); });
      }
    },
  };
  Object.defineProperty(globalThis, "window", { configurable:true, value:{
    addEventListener(type, listener) { assert.equal(type, "keydown"); listeners.add(listener); },
    removeEventListener(type, listener) { assert.equal(type, "keydown"); listeners.delete(listener); },
  }});
  const subject = createSubject(React, hooks, {
    hasOverlayLease: () => lease,
    suppressOverlayFocusRestore: () => { suppressed++; },
  });
  function render() {
    for (let pass=0; pass<16; pass++) {
      cursor=0; effects=[]; dirty=false;
      tree=subject.CommandPalette(props);
      for (const effect of effects) effect();
      if (!dirty) return;
    }
    assert.fail("controlled palette render did not settle");
  }
  const h = {
    statuses, changes, listeners,
    render,
    tree: () => tree,
    nodes: () => elements(tree),
    options: () => elements(tree).filter((node) => node.props.role === "option"),
    input: () => elements(tree).find((node) => node.type === "input"),
    pager: () => elements(tree).find((node) => node.type === "collection-pager"),
    open(value=true) { props = {...props, open:value}; render(); },
    update(next) { props = {...props, ...next}; render(); },
    lease(value) { lease=value; },
    suppressed: () => suppressed,
    query(value) { h.input().props.onChange({target:{value}}); render(); },
    key(key="k", meta=false) {
      let prevented=0;
      for (const callback of listeners) callback({key, ctrlKey:!meta, metaKey:meta, preventDefault(){prevented++;}});
      render(); return prevented;
    },
  };
  try { render(); run(h, subject); }
  finally {
    for (const current of slots) current.cleanup?.();
    assert.equal(listeners.size, 0, "listener detached on unmount");
    if (original) Object.defineProperty(globalThis, "window", original);
    else delete globalThis.window;
  }
}

test("controlled visible opener and Ctrl/Cmd+K share one palette and listener", () => {
  withPalette([{id:"a",section:"Views",label:"Changes",run(){}}], h => {
    assert.equal(h.tree(), null);
    assert.equal(h.listeners.size, 1);
    h.open();
    assert.equal(h.options().length, 1);
    h.query("change");
    assert.equal(h.key(), 1);
    assert.equal(h.tree(), null);
    assert.equal(h.key("K", true), 1);
    assert.equal(h.input().props.value, "");
    h.open(false); // App navigation and Back/Forward use this same controlled close.
    assert.equal(h.tree(), null);
    h.lease(true);
    assert.equal(h.key(), 0);
    assert.equal(h.tree(), null);
    h.lease(false);
    h.key();
    h.tree().props.onClose(); h.render();
    assert.equal(h.tree(), null);
    assert.equal(h.listeners.size, 1);
  });
});

test("palette keeps bounded search, actual arrow navigation and live entry identities", () => {
  const called=[];
  const entries=Array.from({length:110}, (_, index) => ({id:`id${index}`,section:"Tasks",label:`Task ${index}`,
    run(){called.push(index);}}));
  withPalette(entries, h => {
    h.open();
    assert.equal(h.options().length, 50);
    assert.equal(h.pager().props.page.totalItems, 110);
    h.pager().props.onPageChange(3); h.render();
    assert.equal(h.options().length, 10);
    h.input().props.onKeyDown({key:"ArrowDown",preventDefault(){}}); h.render();
    assert.equal(h.input().props["aria-activedescendant"], h.options()[1].props.id);
    h.input().props.onKeyDown({key:"Enter",preventDefault(){}}); h.render();
    assert.deepEqual(called,[101]);
    assert.equal(h.tree(), null);
    h.open(); h.query("missing");
    assert.equal(h.options().length, 0);
    assert.equal(h.input().props["aria-activedescendant"], undefined);
    h.query(" Ｔａｓｋ １０９ ");
    assert.equal(h.options().length, 1);
    h.update({entries:[{id:"new",section:"Tasks",label:"Task 109",run(){called.push("new");}}]});
    h.options()[0].props.onClick(); h.render();
    assert.deepEqual(called,[101,"new"]);
  });
});

test("disabled commands remain open; dialog/disclosure handoffs suppress obsolete focus", () => {
  for (const flag of ["opensDialog", "opensDisclosure"]) {
    const order=[];
    withPalette([
      {id:"busy",section:"Actions",label:"Busy",disabledReason:"Already pending",run(){assert.fail("disabled action ran");}},
      {id:"run",section:"Actions",label:"Run",[flag]:true,run(){order.push("ran");}},
    ], h => {
      h.open();
      h.options()[0].props.onClick(); h.render();
      assert.deepEqual(h.statuses,["Already pending"]);
      assert.notEqual(h.tree(),null);
      h.options()[1].props.onClick(); h.render();
      assert.deepEqual(order,["ran"]);
      assert.equal(h.suppressed(),1);
      assert.equal(h.tree(),null);
    });
  }
});

test("palette structured identities remain injective and duplicate IDs fail clearly", () => {
  withPalette([], (h, subject) => {
    assert.notEqual(subject.paletteEntryId("a|b","c"), subject.paletteEntryId("a","b|c"));
    assert.throws(() => subject.assertUniquePaletteEntries([{id:"same"},{id:"same"}]), /Duplicate palette entry id/);
    h.open();
    assert.equal(h.options().length,0);
  });
});

test("selected command metadata inherits the high-contrast selected foreground", () => {
  const entries = [
    {id:"a", section:"Views", label:"Changes", hint:"View changes", run(){}},
    {id:"b", section:"Views", label:"History", hint:"View history", run(){}},
  ];
  withPalette(entries, h => {
    h.open();
    const check = selectedIndex => {
      h.options().forEach((option, index) => {
        const metadata = elements(option).filter(node => node.type === "span"
          && ["Views", "View changes", "View history"].includes(node.props.children));
        assert.equal(metadata.length, 2);
        for (const item of metadata) {
          assert.match(item.props.className, index === selectedIndex ? /text-white/ : /text-ui-muted/);
          assert.doesNotMatch(item.props.className, index === selectedIndex ? /text-ui-muted/ : /text-white/);
        }
      });
    };
    check(0);
    h.input().props.onKeyDown({key:"ArrowDown", preventDefault(){}}); h.render();
    check(1);
  });
  const css = read("index.css");
  const token = name => css.match(new RegExp(`--ui-${name}:\\s*(\\d+) (\\d+) (\\d+);`))
    .slice(1).map(Number);
  const luminance = rgb => rgb.map(value => value / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
    .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
  assert.ok(1.05 / (luminance(token("primary")) + 0.05) >= 4.5);
});
