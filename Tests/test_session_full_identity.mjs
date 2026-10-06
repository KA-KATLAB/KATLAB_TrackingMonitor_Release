import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { canonicalPrintedText } from "./helpers/printed_source.mjs";
import { restoreDialogChronology } from "./helpers/dialogChronology.mjs";
import { restoreSessionTaskGroups } from "./helpers/sessionTaskGroups.mjs";
import { restoreSessionIdentity, sessionIdentityInsertion, SESSION_DISCLOSURE,
  SESSION_DISCLOSURE_SHA } from "./helpers/sessionIdentity.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const frontend = resolve(root, "Frontend");
const require = createRequire(resolve(frontend, "package.json"));
const ts = require("typescript"), React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const read = (file) => readFileSync(resolve(frontend, "src", file), "utf8");
const parse = (file, text = read(file)) => ts.createSourceFile(file, text,
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declaration = (source, name) => {
  const matches = source.statements.filter((node) =>
    ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.equal(matches.length, 1, `one actual ${name}`);
  return matches[0];
};
const compile = (text) => import(`data:text/javascript;base64,${Buffer.from(ts.transpileModule(text, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
    jsx: ts.JsxEmit.React },
}).outputText).toString("base64")}`);
const nodes = (node) => Array.isArray(node) ? node.flatMap(nodes)
  : React.isValidElement(node) ? [node, ...nodes(node.props.children)] : [];
const collisionIds = ["a1b2c3d4-0000-4000-8000-00000000001a", "a1b2c3d4-0000-4000-8000-0000000000a1"];
const PRE_RENDER_SHA = "65015fc5cca2e642089de211552e103962bfd7d901558d5871d9911e20704573";
const ORIGINAL_FILE_SHA = "8e3a62e00168f419e3b1e650b65bb908f029e4b46222653f4ed1e3de217859cb";
const sha = (text) => createHash("sha256").update(text).digest("hex");
const flush = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };
const fieldOf = (tree) => {
  const details = nodes(tree).filter((node) => node.type === "details");
  assert.equal(details.length, 1);
  const inputs = nodes(details[0]).filter((node) => node.type === "input");
  assert.equal(inputs.length, 1);
  return { details: details[0], input: inputs[0] };
};
let vite, deps, make;

before(async () => {
  const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
  vite = await createServer({ root: frontend,
    server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom",
    optimizeDeps: { noDiscovery: true, entries: [] } });
  deps = Object.assign({}, ...await Promise.all(["ui.tsx", "theme.ts", "format.ts",
    "dialogStatus.tsx", "eventPages.ts", "api.ts"].map((file) => vite.ssrLoadModule(`/src/${file}`))));
  const session = parse("SessionTimeline.tsx"), ui = parse("ui.tsx");
  const constants = session.statements.filter((node) => ts.isVariableStatement(node)
    && node.declarationList.declarations.some((item) => ["API_PAGE", "MAX_PAGES"].includes(item.name.getText(session))));
  ({ make } = await compile(`export function make(React, deps, hooks) {
    const { useState, useRef, useEffect, useCallback } = hooks;
    const { CollectionPager, DialogLoadStatus, EventWindowNotice, fmtMinutes, fmtTs,
      EFFORT_GAP_MAX_MIN, EFFORT_TAIL_MIN, MODE_BADGE, MODE_COLOR, sessionColor,
      appendUniqueEvents, api, createActionDeadline, isAbortError, getBoundedPageWindow } = deps;
    const DialogShell = ({ title, description, children }) =>
      <section><h2>{title}</h2><p>{description}</p>{children}</section>;
    ${["collectionIdentityKey", "useBoundedPage"].map((name) =>
      declaration(ui, name).getText(ui).replace(/^export\s+/, "")).join("\n")}
    ${constants.map((node) => node.getText(session)).join("\n")}
    ${declaration(session, "SessionTimeline").getText(session).replace(/^export\s+/, "")}
    return SessionTimeline;
  }`));
});
after(async () => { await vite?.close(); });

// Complete production component and shared paging hook, with controlled hook slots.
function renderSession (sessionId, acceptedEmpty = false, provider = "codex", overrides = {}) {
  let slot = 0;
  const hooks = {
    useState(initial) {
      const index = slot++;
      return [Object.hasOwn(overrides, index) ? overrides[index]
        : acceptedEmpty && index === 0 ? [] : acceptedEmpty && index === 3 ? false : initial, () => {}];
    },
    useRef: (current) => ({ current }), useEffect: () => {}, useCallback: (callback) => callback,
  };
  return make(React, deps, hooks)({ session: { provider, sessionId },
    onClose: () => {}, onStatus: () => {} });
}

test("actual complete timeline exposes full identity while pending", () => {
  const tree = renderSession(collisionIds[0]);
  const details = nodes(tree).filter((node) => node.type === "details");
  assert.equal(details.length, 1, "pending session must offer its full identity disclosure");
  const input = nodes(details[0]).find((node) => node.type === "input");
  assert.equal(JSON.parse(input.props.value), collisionIds[0]);
});

test("actual complete timeline distinguishes accepted-empty colliding identities", () => {
  assert.equal(deps.sessionColor("codex", collisionIds[0]), deps.sessionColor("codex", collisionIds[1]));
  const trees = collisionIds.map((id) => renderSession(id, true));
  for (const tree of trees) assert.equal(nodes(tree).filter((node) => node.type === "details").length, 1,
    "an accepted-empty session must still offer full identity");
  assert.notEqual(renderToStaticMarkup(trees[0]), renderToStaticMarkup(trees[1]));
});

test("actual disclosure is labelled, default closed, readonly and action free", () => {
  for (const provider of ["claude", "codex"]) {
    const tree = renderSession(collisionIds[0], false, provider);
    const { details, input } = fieldOf(tree), descendants = nodes(details);
    const summary = descendants.find((node) => node.type === "summary");
    const label = descendants.find((node) => node.type === "label");
    const help = descendants.find((node) => node.type === "p");
    assert.equal(details.key, JSON.stringify(["session-full-id", provider, collisionIds[0]]));
    assert.equal(details.props.open, undefined);
    assert.equal(summary.props.tabIndex, 0);
    assert.match(summary.props.className, /\bui-control\b/);
    assert.match(renderToStaticMarkup(summary), /Full session ID/);
    assert.ok(nodes(label).includes(input), "real label wraps the field");
    assert.match(renderToStaticMarkup(label), new RegExp(`Session ID for ${provider} \\(JSON string\\)`));
    assert.equal(input.props.type, "text");
    assert.equal(input.props.readOnly, true);
    assert.equal(input.props.spellCheck, false);
    assert.equal(input.props.autoComplete, "off");
    assert.equal(input.props["aria-describedby"], help.props.id);
    assert.equal(help.props.id, "session-timeline-id-help");
    assert.match(renderToStaticMarkup(help), /Includes quotes and escapes\. Decode JSON to recover the original ID\./);
    for (const node of descendants) {
      for (const prop of Object.keys(node.props)) {
        assert.ok(!/^on[A-Z]/.test(prop), `no new event handler ${prop}`);
        assert.ok(!["autoFocus", "role", "aria-live", "ref", "disabled", "maxLength"].includes(prop));
      }
    }
    assert.equal(descendants.filter((node) => node.type === "button").length, 0);
    const actualChildren = React.Children.toArray(tree.props.children).filter(React.isValidElement);
    assert.equal(actualChildren[0].type, "details");
    assert.equal(actualChildren[1].props.id, "session-timeline-events");
  }
});

test("actual encoded value roundtrips every UTF-16 unit and practical legacy strings", () => {
  const everyUnit = Array.from({ length: 65536 }, (_, unit) => String.fromCharCode(unit)).join("");
  const cases = [everyUnit, "", " edge spaces ", "left\nright\r\nend", "\0\t\x1f\x7f",
    String.raw`literal\n\u202e\\`, 'quotes " and \\', "\u202eabc\u2066rtl\u2069",
    "line\u2028paragraph\u2029", "\u00e9\u4e2d\ud83d\ude00", "\ud800", "\udfff",
    "x".repeat(50000), '<img src=x onerror="bad()">'];
  for (const raw of cases) {
    const { input } = fieldOf(renderSession(raw));
    assert.match(input.props.value, /^[\x20-\x7e]*$/);
    assert.equal(JSON.parse(input.props.value), raw, "exact raw UTF-16 string, no trimming or slicing");
    assert.ok(input.props.value.length <= 6 * raw.length + 2);
  }
  assert.equal(fieldOf(renderSession("\u00e9")).input.props.value, '"\\u00e9"');
  assert.equal(fieldOf(renderSession("\ud83d\ude00")).input.props.value, '"\\ud83d\\ude00"');
  assert.equal(fieldOf(renderSession(String.raw`\n`)).input.props.value, '"\\\\n"');
  const html = renderToStaticMarkup(renderSession('<img src=x onerror="bad()">'));
  assert.doesNotMatch(html, /<img\b|<script\b/);
  assert.match(html, /&lt;img/);
});

// Hook effects, real API/deadline and actual shared pager run against finite local
// fetch/timer boundaries. This models owners, not React DOM/native input behavior.
async function withTimeline (response, check) {
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const oldFetch = Object.getOwnPropertyDescriptor(globalThis, "fetch");
  const timers = new Map(), calls = [], states = [], refs = [], callbacks = [], effects = [];
  let timerId = 0, stateIndex, refIndex, callbackIndex, effectIndex, dirty = true, mounted = true, tree;
  const pending = new Set(), status = [], writes = [];
  globalThis.window = { setTimeout(callback, ms) {
    const id = timerId++; timers.set(id, { callback, ms }); return id;
  }, clearTimeout(id) { timers.delete(id); } };
  globalThis.fetch = async (url, options) => {
    calls.push({ url, signal: options.signal });
    const value = await response(calls.length, options.signal);
    return { ok: !value.error, status: value.error ? 503 : 200,
      json: async () => value.error ? { success: false, message: value.error } : { data: value } };
  };
  const changed = (left, right) => !left || right.some((value, index) => !Object.is(value, left[index]));
  const hooks = {
    useState(initial) {
      const index = stateIndex++;
      if (!(index in states)) states[index] = initial;
      return [states[index], (value) => {
        writes.push({ mounted, index });
        const next = typeof value === "function" ? value(states[index]) : value;
        if (!Object.is(states[index], next)) { states[index] = next; dirty = true; }
      }];
    },
    useRef(initial) { return refs[refIndex++] ??= { current: initial }; },
    useCallback(callback, next) {
      const index = callbackIndex++;
      if (changed(callbacks[index]?.deps, next)) callbacks[index] = { callback, deps: next };
      return callbacks[index].callback;
    },
    useEffect(callback, next) {
      const index = effectIndex++, previous = effects[index];
      if (changed(previous?.deps, next)) {
        effects[index] = { ...previous, callback, deps: next }; pending.add(index);
      }
    },
  };
  const props = { session: { provider: "codex", sessionId: " raw\nidentity " },
    onClose: () => {}, onStatus: (message) => status.push(message) };
  const Component = make(React, deps, hooks);
  const h = {
    props, calls, states, timers, status, writes,
    get tree() { return tree; }, get html() { return renderToStaticMarkup(tree); },
    render() {
      stateIndex = refIndex = callbackIndex = effectIndex = 0;
      dirty = false; tree = Component(props); return tree;
    },
    runEffects() {
      const indices = [...pending]; pending.clear();
      for (const index of indices) {
        const effect = effects[index]; effect.cleanup?.(); effect.cleanup = effect.callback();
      }
    },
    async settle() {
      for (let i = 0; i < 8; i++) {
        await flush(); this.render(); this.runEffects(); await flush();
        if (!dirty && pending.size === 0) return;
      }
      assert.fail("controlled hooks did not settle");
    },
  };
  try {
    h.render(); h.runEffects(); await check(h);
  } finally {
    try {
      mounted = false;
      for (const effect of effects) effect.cleanup?.();
      await flush();
      assert.equal(timers.size, 0, "all actual deadline timers clear on disposal");
      assert.equal(writes.filter((item) => !item.mounted).length, 0);
    } finally {
      if (oldWindow) Object.defineProperty(globalThis, "window", oldWindow); else delete globalThis.window;
      if (oldFetch) Object.defineProperty(globalThis, "fetch", oldFetch); else delete globalThis.fetch;
    }
  }
}

const event = (id) => ({ id, repo_id: id % 2 ? "A" : "B", provider: "codex", session_id: " raw\nidentity ",
  ts: new Date(Date.UTC(2026, 9, 6, 0, 0, id)).toISOString(), tool: "Edit", file: `src/${id}.ts`,
  mode: "B", task_ref: "plan - A.1", commit_hash: null });

test("identity survives actual HTTP failure and Retry recovery without changing raw requests", async () => {
  await withTimeline(async (count) => count === 1 ? { error: "fixture unavailable" } : [], async (h) => {
    const key = fieldOf(h.tree).details.key;
    await h.settle();
    assert.match(h.html, /fixture unavailable/);
    assert.equal(fieldOf(h.tree).details.key, key);
    const retry = nodes(h.tree).find((node) => node.type === "button" && node.props.children === "Retry");
    assert.ok(retry && !retry.props.disabled);
    retry.props.onClick(); h.render(); h.runEffects(); await h.settle();
    assert.match(h.html, /No events for this session/);
    assert.equal(fieldOf(h.tree).details.key, key);
    assert.equal(h.calls.length, 2);
    assert.ok(h.status.includes("Session timeline recovered."));
    for (const call of h.calls) {
      const query = new URL(call.url, "http://fixture.invalid").searchParams;
      assert.equal(query.get("session"), " raw\nidentity ");
      assert.equal(query.get("provider"), "codex");
      assert.equal(query.get("repo"), null);
    }
  });
});

test("identity remains available through the actual deadline callback and retry", async () => {
  await withTimeline((count, signal) => count > 1 ? Promise.resolve([]) : new Promise((resolve, reject) => {
    signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  }), async (h) => {
    const pendingKey = fieldOf(h.tree).details.key;
    const timer = [...h.timers.values()].find((value) => value.ms === deps.USER_ACTION_TIMEOUT_MS);
    assert.ok(timer); timer.callback(); await h.settle();
    assert.match(h.html, /Session timeline timed out after 10 seconds/);
    assert.equal(fieldOf(h.tree).details.key, pendingKey);
    const retry = nodes(h.tree).find((node) => node.type === "button" && node.props.children === "Retry");
    retry.props.onClick(); h.render(); h.runEffects(); await h.settle();
    assert.match(h.html, /No events for this session/);
    assert.equal(JSON.parse(fieldOf(h.tree).input.props.value), h.props.session.sessionId);
  });
});

test("accepted paged and capped windows retain the disclosure key and fifty-row bound", async () => {
  for (const count of [51, 1500]) {
    await withTimeline(async (page) => Array.from({ length: Math.min(500, count - (page - 1) * 500) },
      (_, index) => event((page - 1) * 500 + index + 1)), async (h) => {
      const firstKey = fieldOf(h.tree).details.key;
      await h.settle();
      assert.equal(h.states[0].length, count);
      assert.equal(h.calls.length, count === 51 ? 1 : 3);
      assert.equal(fieldOf(h.tree).details.key, firstKey);
      assert.equal(nodes(h.tree).filter((node) => node.type === "div" && node.key !== null).length, 50);
      const pager = nodes(h.tree).find((node) => node.type === deps.CollectionPager);
      assert.ok(pager); pager.props.onPageChange(2); await h.settle();
      assert.equal(fieldOf(h.tree).details.key, firstKey);
      assert.equal(nodes(h.tree).filter((node) => node.type === "div" && node.key !== null).length, count === 51 ? 1 : 50);
      assert.equal(fieldOf(h.tree).details.props.open, undefined);
      if (count === 1500) assert.match(h.html, /fetched window/);
      h.props.session = { ...h.props.session, provider: "claude" }; h.render();
      assert.notEqual(fieldOf(h.tree).details.key, firstKey);
      const providerKey = fieldOf(h.tree).details.key;
      h.props.session = { ...h.props.session, sessionId: "different full ID" }; h.render();
      assert.notEqual(fieldOf(h.tree).details.key, providerKey);
    });
  }
});

async function dialogFocus (summary, input, opened) {
  const source = parse("dialog.tsx"), shell = declaration(source, "DialogShell"), effects = [];
  const walk = (node) => {
    if (ts.isCallExpression(node) && node.expression.getText(source) === "useLayoutEffect"
      && node.arguments[0].getText(source).includes('document.addEventListener("keydown"')) effects.push(node.arguments[0]);
    ts.forEachChild(node, walk);
  };
  walk(shell); assert.equal(effects.length, 1, "one actual keyboard layout effect");
  const { factory } = await compile(`export function factory(env) {
    const { window, document, panelRef, closeRef, initialFocusRef, onCloseRef } = env;
    ${["isVisibleFocusTarget", "focusableWithin"].map((name) => declaration(source, name).getText(source)).join("\n")}
    return { focusableWithin, setup: ${effects[0].getText(source)} };
  }`);
  const listeners = new Map(), doc = { activeElement: null,
    addEventListener(name, callback, capture) { assert.equal(capture, true); listeners.set(name, callback); },
    removeEventListener(name, callback, capture) {
      assert.equal(capture, true); assert.equal(listeners.get(name), callback); listeners.delete(name);
    } };
  const element = (name, tag, props, visible = true) => ({ name, tag, props, visible, isConnected: true,
    closest: () => null, matches: () => Boolean(props.disabled || props["aria-disabled"] === "true"),
    getClientRects() { return this.visible ? [{}] : []; },
    focus() { doc.activeElement = this; } });
  const close = element("Close", "button", {});
  const summaryElement = element("summary", "summary", summary.props);
  const inputElement = element("input", "input", input.props, opened);
  const candidates = [close, summaryElement, inputElement];
  const panel = { focus() { doc.activeElement = this; }, querySelectorAll(selector) {
    // Controlled native selector boundary, derived from actual rendered props.
    assert.ok(selector.includes("button:not(:disabled)") && selector.includes("input:not(:disabled)"));
    return candidates.filter((item) => ["button", "input"].includes(item.tag)
      || (selector.includes("[tabindex]") && item.props.tabIndex !== undefined && item.props.tabIndex !== -1));
  } };
  let closed = 0;
  const env = { document: doc, window: { getComputedStyle: (item) => ({
    display: item.visible ? "block" : "none", visibility: "visible" }) },
  panelRef: { current: panel }, closeRef: { current: close }, initialFocusRef: null,
  onCloseRef: { current: () => { closed++; } } };
  const actual = factory(env), cleanup = actual.setup();
  return { close, summary: summaryElement, input: inputElement, doc, listeners, cleanup,
    get closed() { return closed; }, stops: () => actual.focusableWithin(panel),
    key(key, shiftKey = false) {
      const event = { key, shiftKey, prevented: 0, stopped: 0,
        preventDefault() { this.prevented++; }, stopPropagation() { this.stopped++; } };
      listeners.get("keydown")(event); return event;
    } };
}

test("actual dialog trap admits summary, hides closed input, wraps endpoints and keeps Escape", async () => {
  const { details, input } = fieldOf(renderSession(collisionIds[0]));
  const summary = nodes(details).find((node) => node.type === "summary");
  for (const opened of [false, true]) {
    const h = await dialogFocus(summary, input, opened);
    try {
      assert.deepEqual(h.stops().map((item) => item.name), opened ? ["Close", "summary", "input"] : ["Close", "summary"]);
      assert.equal(h.doc.activeElement, h.close);
      assert.equal(h.key("Tab").prevented, 0, "Close forward Tab is left to native movement");
      assert.equal(h.doc.activeElement, h.close, "fixture does not simulate native Tab movement");
      assert.equal(h.key("Tab", true).prevented, 1);
      assert.equal(h.doc.activeElement, opened ? h.input : h.summary);
      assert.equal(h.key("Tab").prevented, 1);
      assert.equal(h.doc.activeElement, h.close);
      const escape = h.key("Escape");
      assert.equal(escape.prevented, 1); assert.equal(escape.stopped, 1); assert.equal(h.closed, 1);
    } finally { h.cleanup(); }
    assert.equal(h.listeners.size, 0);
  }
});

test("actual trap regression detects loss of summary tabindex without native browser claims", async () => {
  const { details, input } = fieldOf(renderSession(collisionIds[0]));
  const summary = nodes(details).find((node) => node.type === "summary");
  const changed = React.cloneElement(summary, { tabIndex: undefined });
  const h = await dialogFocus(changed, input, false);
  try {
    assert.deepEqual(h.stops().map((item) => item.name), ["Close"]);
    assert.equal(h.key("Tab").prevented, 1, "missing tabindex incorrectly traps Tab on Close");
    assert.equal(h.doc.activeElement, h.close);
  } finally { h.cleanup(); }
});

function preRenderSha (text) {
  text = restoreDialogChronology(text, "SessionTimeline");
  const source = parse("SessionTimeline.tsx", text), fn = declaration(source, "SessionTimeline");
  assert.ok(ts.isReturnStatement(fn.body.statements.at(-1)));
  const printer = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed });
  return sha(fn.body.statements.slice(0, -1).map((node) => canonicalPrintedText(
    printer.printNode(ts.EmitHint.Unspecified, node, source))).join("\n"));
}

test("strict one-subtree restoration preserves original full file and every pre-render statement", () => {
  const text = read("SessionTimeline.tsx");
  for (const variant of [text.replace(/\r\n/g, "\n"), text.replace(/\r?\n/g, "\r\n")]) {
    const restored = restoreSessionIdentity(restoreDialogChronology(restoreSessionTaskGroups(variant), "SessionTimeline"));
    assert.equal(sha(canonicalPrintedText(restored)), ORIGINAL_FILE_SHA);
    assert.equal(preRenderSha(variant), PRE_RENDER_SHA);
    const { source, detail } = sessionIdentityInsertion(variant);
    const printer = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed });
    assert.equal(sha(canonicalPrintedText(printer.printNode(ts.EmitHint.Unspecified, detail, source))), SESSION_DISCLOSURE_SHA);
  }
});

test("strict restoration rejects missing, repeated, moved, partial or altered disclosure contracts", () => {
  const text = canonicalPrintedText(read("SessionTimeline.tsx"));
  const { start, end } = sessionIdentityInsertion(text);
  const insertion = text.slice(start, end), original = restoreSessionIdentity(text);
  const moved = original.replace("      {rows && rows.length > 50 && (", `      ${insertion}{rows && rows.length > 50 && (`);
  const mutations = [original, text.slice(0, start) + insertion + text.slice(start), moved,
    text.replace('      </details>\n      <div id="session-timeline-events"', '      </details>\n       <div id="session-timeline-events"')];
  for (const [from, to] of [
    ['"session-full-id"', '"session-id"'], ["tabIndex={0}", "tabIndex={-1}"],
    ["tabIndex={0}", ""], ['["session-full-id", session.provider, session.sessionId]', '["session-full-id", session.sessionId]'],
    ['/[\\u007f-\\uffff]/g', '/[\\u007f-\\uffff]/gu'], ['padStart(4, "0")', 'padStart(5, "0")'],
    ['aria-describedby="session-timeline-id-help"', 'aria-describedby="missing-help"'],
    ['id="session-timeline-id-help"', 'id="different-help"'],
    ["Session ID for", "Raw ID for"], ["Includes quotes and escapes.", "Copy the raw ID."],
    ['<input type="text"', '<input onCopy={() => {}} type="text"'],
    ["<details key=", "<details open key="],
    ['className="mb-3 min-w-0"', 'className="mb-3"'],
  ]) {
    assert.equal(text.split(from).length - 1, 1, `unique controlled mutation: ${from}`);
    mutations.push(text.replace(from, to));
  }
  const withoutHelp = text.replace(/        <p id="session-timeline-id-help"[\s\S]*?        <\/p>\n/, "");
  assert.notEqual(withoutHelp, text); mutations.push(withoutHelp);
  for (const [index, mutated] of mutations.entries()) {
    assert.throws(() => restoreSessionIdentity(mutated), assert.AssertionError, `mutation ${index}`);
  }
  assert.equal(insertion, SESSION_DISCLOSURE + "\n      ", "literal insertion and exact boundary remain reviewed");
});

test("original owner, import and return changes remain visible to full-file preservation", () => {
  const text = read("SessionTimeline.tsx");
  const changes = [text.replace("setBusy(true);", "setBusy(false);"),
    'import "./unexpected";\n' + text,
    text.replace("Cross-repository captured activity", "Changed original description")];
  for (const changed of changes) {
    assert.notEqual(sha(canonicalPrintedText(restoreSessionIdentity(restoreDialogChronology(restoreSessionTaskGroups(changed), "SessionTimeline")))), ORIGINAL_FILE_SHA);
  }
  assert.notEqual(preRenderSha(changes[0]), PRE_RENDER_SHA);
});

test("controlled lifecycle restores globals even when the check or cleanup validation fails", async () => {
  const windowBefore = Object.getOwnPropertyDescriptor(globalThis, "window");
  const fetchBefore = Object.getOwnPropertyDescriptor(globalThis, "fetch");
  await assert.rejects(withTimeline(async () => [], async () => {
    throw new Error("fixture assertion failure");
  }), /fixture assertion failure/);
  assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis, "window"), windowBefore);
  assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis, "fetch"), fetchBefore);
  await assert.rejects(withTimeline(async () => [], async (h) => {
    h.timers.set(999, { callback: () => {}, ms: 1 });
  }), /all actual deadline timers clear/);
  assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis, "window"), windowBefore);
  assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis, "fetch"), fetchBefore);
});
