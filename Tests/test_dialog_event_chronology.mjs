import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CHRONOLOGY_WINDOW, restoreDialogChronology } from "./helpers/dialogChronology.mjs";
import { restoreSessionTaskGroups } from "./helpers/sessionTaskGroups.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const frontend = resolve(root, "Frontend"), require = createRequire(resolve(frontend, "package.json"));
const ts = require("typescript"), React = require("react"), { renderToStaticMarkup } = require("react-dom/server");
const read = file => readFileSync(resolve(frontend, "src", file), "utf8");
const lf = text => text.replace(/\r\n/g, "\n");
const sha = text => createHash("sha256").update(text).digest("hex");
const parse = (file, text = read(file)) => ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function declaration (ast, name) {
  assert.equal(ast.parseDiagnostics.length, 0);
  const matches = ast.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.equal(matches.length, 1, `one actual ${name}`); return matches[0];
}
const nodes = node => Array.isArray(node) ? node.flatMap(nodes)
  : React.isValidElement(node) ? [node, ...nodes(node.props.children)] : [];
const flush = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };
const row = (id, timestamp, extra = {}) => Object.freeze({ id, ts: timestamp, repo_id: "A",
  file: `src/${id}.ts`, provider: "codex", session_id: "session-A", tool: "Edit", mode: "B",
  task_ref: "plan - A.1", commit_hash: null, ...extra });
let vite, deps;
const factories = new Map();
before(async () => {
  const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
  vite = await createServer({ root: frontend, server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom", optimizeDeps: { noDiscovery: true, entries: [] } });
  deps = Object.assign({}, ...await Promise.all(["ui.tsx", "theme.ts", "format.ts", "api.ts",
    "eventPages.ts", "dialogStatus.tsx", "icons.tsx"].map(file => vite.ssrLoadModule(`/src/${file}`))));
  const ui = parse("ui.tsx");
  for (const name of ["FileStory", "SessionTimeline"]) {
    const ast = parse(`${name}.tsx`);
    const constants = ast.statements.filter(node => ts.isVariableStatement(node)
      && node.declarationList.declarations.some(item => ["API_PAGE", "MAX_PAGES"].includes(item.name.getText(ast))));
    const actual = `const { useState, useRef, useEffect, useCallback } = hooks;
      const { CollectionPager, DialogLoadStatus, EventWindowNotice, ExternalLinkIcon, fmtMinutes, fmtTs,
        EFFORT_GAP_MAX_MIN, EFFORT_TAIL_MIN, MODE_BADGE, MODE_COLOR, eventSessionIdentity, sessionColor,
        appendUniqueEvents, api, createActionDeadline, isAbortError, getBoundedPageWindow } = deps;
      const DialogShell = ({ title, description, children }) => <section><h2>{title}</h2><p>{description}</p>{children}</section>;
      ${["collectionIdentityKey", "useBoundedPage"].map(fn => declaration(ui, fn).getText(ui).replace(/^export /, "")).join("\n")}
      ${constants.map(node => node.getText(ast)).join("\n")}
      ${declaration(ast, name).getText(ast).replace(/^export /, "")}
      return ${name};`;
    factories.set(name, new Function("React", "deps", "hooks", ts.transpileModule(actual,
      { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText));
  }
});
after(async () => { await vite?.close(); });

// Complete actual dialog, API/deadline and shared pager; only hooks, fetch,
// timers and the portal shell are controlled. No native rendering is claimed.
async function withDialog (name, pages, check, options = {}) {
  const saved = ["window", "fetch"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  const states = [], refs = [], callbacks = [], effects = [], calls = [], status = [], writes = [], timers = new Map();
  const pending = new Set();
  let stateIndex, refIndex, callbackIndex, effectIndex, tree, dirty, mounted = true, timerId = 0;
  const changed = (previous, next) => !previous || next.some((value, index) => !Object.is(value, previous[index]));
  const hooks = {
    useState(initial) { const index = stateIndex++; if (!(index in states)) states[index] = initial;
      return [states[index], value => { writes.push({ mounted, index });
        const next = typeof value === "function" ? value(states[index]) : value;
        if (!Object.is(next, states[index])) { states[index] = next; dirty = true; } }]; },
    useRef(initial) { return refs[refIndex++] ??= { current: initial }; },
    useCallback(callback, next) { const index = callbackIndex++;
      if (changed(callbacks[index]?.deps, next)) callbacks[index] = { callback, deps: next };
      return callbacks[index].callback; },
    useEffect(callback, next) { const index = effectIndex++, old = effects[index];
      if (changed(old?.deps, next)) { effects[index] = { ...old, callback, deps: next }; pending.add(index); } },
  };
  const props = { repo: "A", file: "src/file.ts", repoPath: null, repoBranch: null,
    session: { provider: "codex", sessionId: "session-A" }, onClose() {}, onStatus: message => status.push(message) };
  const Component = factories.get(name)(React, deps, hooks);
  const h = { props, states, calls, status, timers, writes,
    get tree() { return tree; }, get html() { return renderToStaticMarkup(tree); },
    render() { stateIndex = refIndex = callbackIndex = effectIndex = 0; dirty = false; tree = Component(props); return tree; },
    runEffects() { const indices = [...pending]; pending.clear();
      for (const index of indices) { const effect = effects[index]; effect.cleanup?.(); effect.cleanup = effect.callback(); } },
    async settle() { for (let i = 0; i < 10; i++) { await flush(); this.render(); this.runEffects(); await flush();
      if (!dirty && pending.size === 0) return; } assert.fail("controlled effects did not settle"); },
  };
  try {
    globalThis.window = { setTimeout(callback, ms) { const id = timerId++; timers.set(id, { callback, ms }); return id; },
      clearTimeout(id) { timers.delete(id); } };
    globalThis.fetch = async (url, init) => {
      const query = new URL(url, "http://fixture.invalid").searchParams;
      calls.push({ query, signal: init.signal });
      const value = options.response ? await options.response(calls.length, init.signal)
        : pages[Number(query.get("offset")) / 500] ?? [];
      return { ok: !value.error, status: value.error ? 503 : 200,
        json: async () => value.error ? { success: false, message: value.error } : { data: value } };
    };
    h.render(); h.runEffects(); await check(h);
  } finally {
    try { mounted = false; for (const effect of effects) effect.cleanup?.(); await flush();
      assert.equal(timers.size, 0, "all actual deadline timers clear");
      assert.equal(writes.filter(write => !write.mounted).length, 0, "no writes after disposal");
    } finally { for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    } }
  }
}

for (const name of ["FileStory", "SessionTimeline"]) {
  test(`actual ${name} mixed precision chronology removes the false effort split`, async () => {
    const page = Object.freeze([row(3, "2026-10-06T01:15:00.100Z"),
      row(2, "2026-10-06T01:00:00.900Z"), row(1, "2026-10-06T01:00:00Z")]);
    await withDialog(name, [page], async h => {
      await h.settle();
      assert.deepEqual(h.states[0].map(event => event.id), [1, 2, 3], "accepted rows follow actual instants, not timestamp spelling");
      assert.match(h.html, /3 events/); assert.match(h.html, /\u2248 17m/);
      if (name === "SessionTimeline") assert.doesNotMatch(h.html, / gap /);
      assert.equal(h.states[0][0], page[2]); assert.equal(page[0].id, 3);
    });
  });

  test(`actual ${name} handles fixed precision, empty and single accepted windows`, async () => {
    const cases = [[], [row(7, "2026-10-06T01:00:00.000Z")],
      [row(3, "2026-10-06T01:02:00.000Z"), row(1, "2026-10-06T01:00:00.000Z"), row(2, "2026-10-06T01:01:00.000Z")]];
    for (const page of cases) await withDialog(name, [Object.freeze(page)], async h => {
      await h.settle();
      assert.deepEqual(h.states[0].map(event => event.id), page.length === 3 ? [1, 2, 3] : page.map(event => event.id));
      assert.equal(h.states[3], false); assert.equal(h.states[1], ""); assert.equal(h.timers.size, 0);
      if (!page.length) assert.match(h.html, /No events for this (file|session)/);
      else assert.match(h.html, page.length === 1 ? /1 event[^s]/ : /3 events/);
      for (const event of h.states[0]) assert.ok(page.includes(event));
    });
  });

  test(`actual ${name} puts every finite timestamp before invalid rows consistently`, async () => {
    const early = row(3, "2026-10-06T00:00:00Z"), late = row(1, "2026-10-06T01:00:00Z"), bad = row(2, "invalid");
    for (const page of [[early, late, bad], [early, bad, late], [late, early, bad],
      [late, bad, early], [bad, early, late], [bad, late, early]]) {
      await withDialog(name, [Object.freeze(page)], async h => {
        await h.settle(); assert.deepEqual(h.states[0], [early, late, bad]);
        assert.equal(h.states[0][2], bad); assert.match(h.html, /3 events/);
        assert.match(h.html, /invalid/, "invalid raw timestamp remains visible, not discarded");
      });
    }
    const page = Object.freeze([row(3, "bad-three"), row(1, "bad-one"), row(2, "bad-two")]);
    await withDialog(name, [page], async h => {
      await h.settle(); assert.deepEqual(h.states[0].map(event => event.id), [1, 2, 3]);
      assert.equal(h.states[0][0], page[1]); assert.match(h.html, /3 events/);
    });
  });

  test(`actual ${name} breaks equal-millisecond and sub-millisecond ties by event ID`, async () => {
    const page = Object.freeze([row(5, "2026-10-06T01:00:00.0001Z"), row(3, "2026-10-06T01:00:00.000Z"),
      row(1, "2026-10-06T01:00:00.0009Z"), row(2, "2026-10-06T01:00:00Z")]);
    // These are this JS engine's millisecond observations, not a microsecond or
    // universal browser parsing guarantee for nonstandard fractional precision.
    assert.ok(page.every(event => new Date(event.ts).getTime() === Date.parse("2026-10-06T01:00:00.000Z")));
    await withDialog(name, [page], async h => {
      await h.settle(); assert.deepEqual(h.states[0].map(event => event.id), [1, 2, 3, 5]);
      assert.match(h.html, /\u2248 2m/); assert.equal(page[0].id, 5);
    });
  });

  test(`actual ${name} keeps fifty-row paging and absolute predecessor day/task grouping`, async () => {
    for (const variant of ["fifty", "continuation", "new-group"]) {
      const count = variant === "fifty" ? 50 : 51;
      const base = Date.parse("2026-10-05T23:58:00Z");
      const page = Object.freeze(Array.from({ length: count }, (_, index) => {
        const id = count - index, changed = variant === "new-group" && id === 51;
        return row(id, new Date(changed ? Date.parse("2026-10-06T00:01:00Z") : base + id * 1000).toISOString(),
          { task_ref: changed ? "plan - B.2" : "plan - A.1" });
      }));
      await withDialog(name, [page], async h => {
        await h.settle();
        const rows = () => nodes(h.tree).filter(node => node.type === "div" && node.key !== null);
        assert.deepEqual(rows().map(node => node.key), Array.from({ length: 50 }, (_, i) => String(i + 1)));
        const pager = nodes(h.tree).find(node => node.type === deps.CollectionPager);
        if (variant === "fifty") { assert.equal(pager, undefined); return; }
        assert.ok(pager); pager.props.onPageChange(2); await h.settle();
        assert.deepEqual(rows().map(node => node.key), ["51"]);
        const renderedRow = renderToStaticMarkup(rows()[0]);
        if (variant === "continuation") assert.match(renderedRow, /continued/);
        else { assert.doesNotMatch(renderedRow, /continued/);
          assert.match(renderedRow, name === "FileStory" ? /2026-10-06 \(UTC\)/ : /plan - B\.2/); }
        assert.equal(h.calls.length, 1, "local page changes do not refetch");
      });
    }
  });

  test(`actual ${name} retains first global IDs, raw three-page cap, scope and immutable records`, async () => {
    const first = Object.freeze(Array.from({ length: 500 }, (_, index) =>
      row(500 - index, new Date(Date.UTC(2026, 9, 6, 0, 0, 500 - index)).toISOString())));
    const duplicates = Object.freeze(first.map(event => Object.freeze({ ...event, task_ref: "plan - changed" })));
    await withDialog(name, [first, duplicates, duplicates], async h => {
      await h.settle(); assert.equal(h.states[0].length, 500); assert.equal(h.states[2], true);
      assert.equal(h.states[0][0], first[499]); assert.equal(h.states[0][499], first[0]);
      assert.ok(h.states[0].every(event => event.task_ref === "plan - A.1"));
      assert.deepEqual(h.calls.map(call => Number(call.query.get("offset"))), [0, 500, 1000]);
      for (const [index, call] of h.calls.entries()) {
        assert.deepEqual(Object.fromEntries(call.query), name === "FileStory"
          ? { repo: "A", file: "src/file.ts", limit: "500", offset: String(index * 500) }
          : { provider: "codex", session: "session-A", limit: "500", offset: String(index * 500) });
        assert.equal(call.signal, h.calls[0].signal);
      }
      assert.match(h.html, /showing 500 captured events\. More may exist/);
      assert.equal(h.timers.size, 0); assert.equal(first[0].id, 500);
    });
  });
}

test("controlled fixture restores globals on assertion and cleanup validation failure", async () => {
  const keys = ["window", "fetch"], saved = keys.map(key => Object.getOwnPropertyDescriptor(globalThis, key));
  for (const failCleanup of [false, true]) {
    await assert.rejects(withDialog("FileStory", [[]], async h => {
      await h.settle();
      if (failCleanup) h.timers.set(999, { callback() {}, ms: 1 });
      else throw new Error("controlled check failure");
    }), failCleanup ? /all actual deadline timers clear/ : /controlled check failure/);
    keys.forEach((key, index) => assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis, key), saved[index]));
  }
});

const originals = [
  ["FileStory", "5cd4c740aed7893972652d50fdde17d7353b95631d0b29ba76aa25ca17f5000b",
    "39f84e0800ba024bad36b86fad5a33e6bbd0626512c971fe1190f5bd9e05228c",
    "021e4106d17c54ce52aa7d5ff4a5334f32f96db5ab7c1e5706e773b4be80d613",
    "905fd59d8f6065b8c04b01a205d19ef7b0f6bff84e37dcfec8cb35a7933c3fc9"],
  ["SessionTimeline", "4929c5654da3f3027d2a425ef05efce3717987f5668e76a130f3beb37fa307d7",
    "2c838f0b7cc93364ef9179cc45d2902727e35a7cda2c599ed9e498c3038d62db",
    "74e46180a0fa449dcd554b39cb80dfb0d36481fd21e0eb6379ed413da43cae34",
    "97b1069d2d4a35b1eccca51fee9a101d394204c15ec213465ebbfc11e9464ee7"],
];
function checkOriginal (text, pins) {
  const [name, rawPin, lfPin, fnPin, outsidePin] = pins;
  if (name === "SessionTimeline") text = restoreSessionTaskGroups(text);
  const restored = restoreDialogChronology(text, name), canonical = lf(restored);
  const ast = parse(`${name}.tsx`, canonical), owner = declaration(ast, name);
  assert.equal(sha(canonical), lfPin); assert.equal(sha(owner.getText(ast)), fnPin);
  assert.equal(sha(canonical.slice(0, owner.getStart(ast)) + canonical.slice(owner.end)), outsidePin);
  assert.equal(sha(canonical.replace(/\n/g, "\r\n")), rawPin);
  return restored;
}
test("reviewed comparator reversal preserves both original whole owners, imports, renders and physical bytes", () => {
  for (const pins of originals) for (const crlf of [false, true]) {
    const text = lf(read(`${pins[0]}.tsx`)); checkOriginal(crlf ? text.replace(/\n/g, "\r\n") : text, pins);
  }
});
test("strict comparator ownership rejects partial, moved, repeated and unrelated changes without hiding old negatives", () => {
  for (const pins of originals) {
    const name = pins[0], text = lf(read(`${name}.tsx`));
    assert.equal(text.split(CHRONOLOGY_WINDOW).length - 1, 1);
    const move = text.replace(CHRONOLOGY_WINDOW, "").replace("        for (let pageIndex", CHRONOLOGY_WINDOW + "        for (let pageIndex");
    const structural = [
      text.replace(CHRONOLOGY_WINDOW, "        all.sort((a, b) => a.ts.localeCompare(b.ts));\n"),
      text.replace(CHRONOLOGY_WINDOW, CHRONOLOGY_WINDOW + CHRONOLOGY_WINDOW), move,
      text.replace(`export function ${name}`, "export function WrongOwner"),
      text.replace("all.sort((a, b) => {", "other.sort((a, b) => {"),
      text.replace("new Date(a.ts)", "new Date(b.ts)"),
      text.replace("Number.isFinite(left) ? left : Infinity", "Number.isFinite(left) ? left : 0"),
      text.replace("a.id - b.id", "b.id - a.id"),
      text.replace(CHRONOLOGY_WINDOW, CHRONOLOGY_WINDOW.replace("\n          return", "\n         return")),
      text + "\nconst broken = ;\n",
    ];
    for (const altered of structural) for (const crlf of [false, true]) assert.throws(() =>
      restoreDialogChronology(crlf ? altered.replace(/\n/g, "\r\n") : altered, name), assert.AssertionError);
    const unrelated = [text.replace("setBusy(true);", "setBusy(false);"),
      text.replace("action.controller.abort();", "action.clear();"),
      'import "./unexpected";\n' + text, text.replace("<DialogShell", '<DialogShell data-unreviewed="yes"')];
    for (const altered of unrelated) for (const crlf of [false, true]) {
      const variant = crlf ? altered.replace(/\n/g, "\r\n") : altered;
      assert.doesNotThrow(() => restoreDialogChronology(variant, name), "older unequal-hash assertions must receive unrelated edits");
      assert.throws(() => checkOriginal(variant, pins), assert.AssertionError);
    }
  }
});
