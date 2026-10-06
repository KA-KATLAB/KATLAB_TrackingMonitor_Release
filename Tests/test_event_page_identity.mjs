import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { canonicalPrintedText } from "./helpers/printed_source.mjs";
import { restoreSessionIdentity } from "./helpers/sessionIdentity.mjs";
import { restoreDialogChronology } from "./helpers/dialogChronology.mjs";
import { restoreSessionTaskGroups } from "./helpers/sessionTaskGroups.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const frontend = resolve(root, "Frontend");
const require = createRequire(resolve(frontend, "package.json"));
const ts = require("typescript"), React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const RealDate = Date;
const start = new RealDate(2026, 9, 6).getTime();
const noon = new RealDate(2026, 9, 6, 12).getTime();
const read = (file) => readFileSync(resolve(frontend, "src", file), "utf8");
const parse = (file, text = read(file)) => ts.createSourceFile(file, text,
  ts.ScriptTarget.Latest, true, file.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
const declaration = (ast, name) => {
  const matches = ast.statements.filter((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.equal(matches.length, 1, `one actual ${name} function`);
  return matches[0];
};
const compile = (text) => import(`data:text/javascript;base64,${Buffer.from(ts.transpileModule(text, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
    jsx: ts.JsxEmit.React },
}).outputText).toString("base64")}`);
const row = (id, extra = {}) => ({ id, repo_id: "Repo_A", file: "src/app.ts",
  ts: new RealDate(start + id * 1000).toISOString(), provider: "codex",
  session_id: "session-A", tool: "Edit", mode: "B", task_ref: "plan - A.1",
  commit_hash: null, ...extra });
const rowsOf = (count) => Array.from({ length: count }, (_, index) => row(count - index));
const overlapping = () => [rowsOf(501).slice(0, 500), [row(2), row(1)]];
const flush = async () => { for (let index = 0; index < 16; index++) await Promise.resolve(); };
const nodes = (node) => Array.isArray(node) ? node.flatMap(nodes)
  : React.isValidElement(node) ? [node, ...nodes(node.props.children)] : [];
let vite, api, deps, loadDayEvents, prepareDigest;

before(async () => {
  const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
  vite = await createServer({ root: frontend,
    server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom",
    optimizeDeps: { noDiscovery: true, entries: [] } });
  ({ api } = await vite.ssrLoadModule("/src/api.ts"));
  ({ loadDayEvents } = await vite.ssrLoadModule("/src/dayEvents.ts"));
  ({ prepareDigest } = await vite.ssrLoadModule("/src/digest.ts"));
  deps = Object.assign({}, ...await Promise.all(["ui.tsx", "theme.ts", "format.ts",
    "dialogStatus.tsx", "icons.tsx"].map((file) => vite.ssrLoadModule(`/src/${file}`))));
});
after(async () => { await vite?.close(); });

// Full production dialog functions run with controlled hooks/transport/portal.
// Their data, summaries, row keys and JSX remain actual source, not a copied model.
async function dialog (name, pages, options = {}) {
  const ast = parse(`${name}.tsx`);
  const { make } = await compile(`export function make(React, deps, hooks, api, createActionDeadline) {
    const { useState, useRef, useEffect } = hooks;
    const { CollectionPager, DialogLoadStatus, EventWindowNotice, ExternalLinkIcon,
      fmtMinutes, fmtTs, EFFORT_GAP_MAX_MIN, EFFORT_TAIL_MIN, MODE_BADGE, MODE_COLOR,
      eventSessionIdentity, sessionColor, appendUniqueEvents } = deps;
    const useBoundedPage = (options) => ({
      ...deps.getBoundedPageWindow(options.totalItems, 1, options.pageSize), setPage: () => {} });
    const DialogShell = ({ title, description, children }) =>
      <section><h2>{title}</h2><p>{description}</p>{children}</section>;
    const isAbortError = (error) => error?.name === "AbortError";
    const API_PAGE = 500, MAX_PAGES = 3;
    ${declaration(ast, name).getText(ast).replace(/^export\s+/, "")}
    return ${name};
  }`);
  const optionalHelper = existsSync(resolve(frontend, "src/eventPages.ts"))
    ? await vite.ssrLoadModule("/src/eventPages.ts") : {};
  const states = [], refs = [], calls = [], actions = [], status = [], writes = [];
  let stateIndex = 0, refIndex = 0, effectDeps, pendingEffect, cleanup, tree, mounted = true;
  const hooks = {
    useState(initial) {
      const index = stateIndex++;
      if (!(index in states)) states[index] = initial;
      return [states[index], (value) => {
        writes.push({ index, mounted });
        states[index] = typeof value === "function" ? value(states[index]) : value;
      }];
    },
    useRef(initial) { const index = refIndex++; return refs[index] ??= { current: initial }; },
    useEffect(callback, next) {
      if (!effectDeps || next.some((value, index) => !Object.is(value, effectDeps[index]))) {
        effectDeps = next; pendingEffect = callback;
      }
    },
  };
  const transport = { events: async (query, signal) => {
    calls.push({ query, signal });
    return options.events ? options.events(query, signal, calls.length) : pages[calls.length - 1] ?? [];
  } };
  const makeAction = () => {
    const controller = new AbortController();
    const action = { controller, signal: controller.signal, timedOut: false, clears: 0,
      clear() { this.clears++; }, didTimeout() { return this.timedOut; } };
    actions.push(action); return action;
  };
  const Component = make(React, { ...deps, ...optionalHelper }, hooks, transport, makeAction);
  const props = { repo: "Repo_A", file: "src/app.ts", repoPath: null, repoBranch: null,
    session: { provider: "codex", sessionId: "session-A" }, onClose: () => {},
    onStatus: (message) => status.push(message) };
  const h = {
    states, calls, actions, status, writes,
    render() { stateIndex = 0; refIndex = 0; tree = Component(props); return tree; },
    runEffects() { if (pendingEffect) { cleanup?.(); const next = pendingEffect; pendingEffect = null; cleanup = next(); } },
    async settle() { await flush(); this.render(); return this; },
    get tree() { return tree; },
    get html() { return renderToStaticMarkup(tree); },
    unmount() { mounted = false; cleanup?.(); },
  };
  h.render(); h.runEffects();
  return h;
}

async function loaded (kind, pages, options = {}) {
  const previousEvents = api.events, previousStats = api.stats, previousDate = globalThis.Date;
  const calls = [], statsCalls = [], controller = options.controller ?? new AbortController();
  const scope = Object.hasOwn(options, "scope") ? options.scope : "Repo_A";
  globalThis.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [noon])); }
    static now() { return noon; }
  };
  api.events = async (query, signal) => {
    calls.push({ query, signal });
    return options.events ? options.events(query, signal, calls.length) : pages[calls.length - 1] ?? [];
  };
  api.stats = async (...args) => { statsCalls.push(args); return { activity_calendar: [] }; };
  try {
    if (kind === "DayEvents") return { ...await loadDayEvents(scope, "2026-10-06", controller.signal), calls, statsCalls };
    const prepared = await prepareDigest(scope, [], [], [], controller.signal);
    const html = await prepared.blob.text();
    const partitions = JSON.parse(html.match(/<script id="digest-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
    return { html, summaries: partitions.flat(), calls, statsCalls, prepared };
  } finally {
    api.events = previousEvents; api.stats = previousStats; globalThis.Date = previousDate;
  }
}

for (const name of ["FileStory", "SessionTimeline"]) {
  test(`moving-offset duplicates: actual ${name} accepts 501 distinct rows`, async () => {
    const h = await dialog(name, overlapping());
    try {
      await h.settle();
      assert.equal(h.states[0].length, 501, "one captured row must not be counted twice");
      assert.equal(new Set(h.states[0].map((event) => event.id)).size, 501);
      assert.deepEqual(h.calls.map((call) => call.query.offset), [0, 500]);
      assert.match(h.html, /501 events/);
      const keyed = nodes(h.tree).filter((node) => node.type === "div" && node.key !== null);
      assert.equal(keyed.length, 50, "actual collection remains bounded to fifty rows");
      assert.equal(new Set(keyed.map((node) => node.key)).size, 50);
      assert.match(h.html, /events: next page/);
    } finally { h.unmount(); }
  });
}
test("moving-offset duplicates: actual DayEvents accepts 501 distinct rows", async () => {
  const result = await loaded("DayEvents", overlapping());
  assert.equal(result.rows.length, 501, "replay must not count an observation twice");
  assert.equal(new Set(result.rows.map((event) => event.id)).size, 501);
  assert.equal(result.limitReached, false);
});
test("moving-offset duplicates: actual Digest exports 501 captured events", async () => {
  const result = await loaded("Digest", overlapping());
  assert.equal(result.summaries.reduce((sum, item) => sum + item.count, 0), 501,
    "exported per-file totals must count distinct captured rows");
  assert.match(result.html, />501<\/div><div[^>]*>events on report day/);
  assert.doesNotMatch(result.html, /More may exist/);
});

test("actual helper retains first global ID, record reference and order without mutating input", async () => {
  // Lazy import intentionally leaves old-source RED independent of the new module.
  const { appendUniqueEvents } = await vite.ssrLoadModule("/src/eventPages.ts");
  const first = Object.freeze(row(1));
  const sameContent = Object.freeze({ ...first, id: 2 });
  const otherRepo = Object.freeze(row(3, { repo_id: "Repo_B", provider: "claude" }));
  const newer = Object.freeze({ ...first, task_ref: "plan - B.2", commit_hash: "a".repeat(40) });
  const incoming = Object.freeze([newer, sameContent, otherRepo,
    Object.freeze({ ...otherRepo, mode: "MANUAL" })]);
  const target = [first];
  assert.equal(appendUniqueEvents(target, incoming), undefined);
  assert.deepEqual(target.map((event) => event.id), [1, 2, 3]);
  assert.equal(target[0], first); assert.equal(target[1], sameContent); assert.equal(target[2], otherRepo);
  assert.equal(incoming.length, 4); assert.equal(incoming[0], newer);
  appendUniqueEvents(target, Object.freeze([]));
  appendUniqueEvents(target, Object.freeze([sameContent, newer]));
  assert.deepEqual(target, [first, sameContent, otherRepo]);
});

test("all four actual collectors retain first records through a three-page overlapping window", async () => {
  const first = rowsOf(1001).slice(0, 500);
  const second = rowsOf(503).slice(0, 500).map((event) => event.id >= 502
    ? { ...event, task_ref: "plan - later" } : event);
  const third = rowsOf(5).map((event) => event.id >= 4 ? { ...event, task_ref: "plan - later" } : event);
  const pages = [first, second, third].map((page) => Object.freeze(page.map(Object.freeze)));
  for (const name of ["FileStory", "SessionTimeline"]) {
    const h = await dialog(name, pages);
    try {
      await h.settle();
      assert.equal(h.states[0].length, 1001); assert.equal(h.states[2], false);
      assert.equal(h.states[0].find((event) => event.id === 502), first.at(-1));
      assert.ok(h.states[0].every((event) => event.task_ref !== "plan - later"));
      assert.deepEqual(h.calls.map((call) => call.query.offset), [0, 500, 1000]);
    } finally { h.unmount(); }
  }
  for (const kind of ["DayEvents", "Digest"]) {
    const result = await loaded(kind, pages);
    assert.deepEqual(result.calls.map((call) => call.query.offset), [0, 500, 1000]);
    if (kind === "DayEvents") {
      assert.equal(result.rows.length, 1001); assert.equal(result.limitReached, false);
      assert.equal(result.rows.find((event) => event.id === 502), first.at(-1));
      assert.ok(result.rows.every((event) => event.task_ref !== "plan - later"));
    } else {
      assert.equal(result.summaries.reduce((sum, item) => sum + item.count, 0), 1001);
      assert.doesNotMatch(result.html, /plan - later|More may exist/);
    }
  }
});

test("actual cross-repository session retains distinct global event IDs", async () => {
  const h = await dialog("SessionTimeline", [[row(1), row(2, { repo_id: "Repo_B" }), row(1)]]);
  try {
    await h.settle();
    assert.deepEqual(h.states[0].map((event) => event.repo_id), ["Repo_A", "Repo_B"]);
    assert.match(h.html, /Repo_A/); assert.match(h.html, /Repo_B/);
    const keyed = nodes(h.tree).filter((node) => node.type === "div" && node.key !== null);
    assert.deepEqual(keyed.map((node) => node.key), ["1", "2"]);
  } finally { h.unmount(); }
});

for (const name of ["FileStory", "SessionTimeline"]) {
  test(`${name} preserves first observations, actual order, scope and immutable pages`, async () => {
    const first = Object.freeze(row(20));
    const sameContent = Object.freeze({ ...first, id: 21 });
    const duplicate = Object.freeze({ ...first, task_ref: "plan - B.2", commit_hash: "a".repeat(40) });
    const page = Object.freeze([first, duplicate, sameContent, Object.freeze(row(2))]);
    const h = await dialog(name, [page]);
    try {
      await h.settle();
      assert.deepEqual(h.states[0].map((event) => event.id), [2, 20, 21]);
      assert.equal(h.states[0][1], first); assert.equal(h.states[0][2], sameContent);
      assert.equal(page[0], first); assert.equal(page.length, 4);
      assert.equal(h.calls[0].signal, h.actions[0].signal);
      assert.deepEqual(h.calls[0].query, name === "FileStory"
        ? { repo: "Repo_A", file: "src/app.ts", limit: 500, offset: 0 }
        : { provider: "codex", session: "session-A", limit: 500, offset: 0 });
      assert.match(h.html, /3 events/); assert.doesNotMatch(h.html, /plan - B\.2/);
    } finally { h.unmount(); }
  });

  test(`${name} uses raw page lengths for empty, short, boundary and duplicate-only caps`, async () => {
    for (const count of [0, 3, 1499, 1500, 1501]) {
      const rows = rowsOf(count), pages = [0, 500, 1000].map((offset) => rows.slice(offset, offset + 500));
      const h = await dialog(name, pages);
      try {
        await h.settle();
        assert.equal(h.states[0].length, Math.min(count, 1500));
        assert.equal(h.states[2], count >= 1500);
        assert.equal(h.calls.length, count < 500 ? 1 : 3);
        assert.equal(new Set(h.states[0].map((event) => event.id)).size, Math.min(count, 1500));
        assert.equal((h.html.match(/class="ui-work-row/g) ?? []).length, Math.min(count, 50));
        if (count === 0) assert.match(h.html, /No events for this (file|session)/);
        if (count >= 1500) assert.match(h.html, /showing 1,500 captured events\. More may exist/);
      } finally { h.unmount(); }
    }
    const page = Object.freeze(Array.from({ length: 500 }, () => Object.freeze(row(1))));
    const h = await dialog(name, [page, page, page]);
    try {
      await h.settle();
      assert.equal(h.states[0].length, 1); assert.equal(h.states[2], true);
      assert.deepEqual(h.calls.map((call) => call.query.offset), [0, 500, 1000]);
      assert.match(h.html, /showing 1 captured events\. More may exist/);
    } finally { h.unmount(); }
  });

  test(`${name} keeps failure, retry, timeout, abort and late-cleanup ownership`, async () => {
    let fail = true;
    const h = await dialog(name, [], { events: (_query, _signal, call) => {
      if (fail) { if (call === 1) return rowsOf(500); throw new Error("synthetic page failure"); }
      return [row(1), row(1)];
    } });
    try {
      await h.settle();
      assert.equal(h.states[0], null); assert.match(h.states[1], /synthetic page failure/);
      assert.equal(h.states[3], false); assert.ok(h.actions[0].clears > 0);
      const retry = nodes(h.tree).find((node) => node.type === "button" && node.props.children === "Retry");
      assert.ok(retry); fail = false; retry.props.onClick(); retry.props.onClick();
      h.render(); h.runEffects(); await h.settle();
      assert.equal(h.calls.length, 3, "synchronous duplicate retry does not create another request");
      assert.equal(h.states[0].length, 1); assert.equal(h.states[1], "");
      assert.match(h.status.at(-1), /recovered/);
      assert.equal(h.actions[0].signal.aborted, true);
    } finally { h.unmount(); }

    for (const kind of ["timeout", "abort", "late-success", "late-error"]) {
      let resolve, reject;
      const pending = new Promise((yes, no) => { resolve = yes; reject = no; });
      const subject = await dialog(name, [], { events: () => pending });
      const action = subject.actions[0];
      if (kind.startsWith("late")) subject.unmount();
      else { action.timedOut = kind === "timeout"; action.controller.abort(); }
      const afterCleanup = subject.writes.length;
      if (kind === "late-error") reject(new Error("late failure"));
      else if (kind === "timeout") reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
      else resolve([row(1), row(1)]);
      await subject.settle();
      assert.equal(subject.states[0], null, `${kind}: no partial or retired result accepted`);
      if (kind === "timeout") assert.match(subject.states[1], /timed out after 10 seconds/);
      else assert.equal(subject.states[1], "");
      if (kind.startsWith("late")) assert.equal(subject.writes.length, afterCleanup,
        "late outcome cannot call any state setter after unmount");
      assert.ok(action.clears > 0);
      subject.unmount();
    }
  });
}

for (const kind of ["DayEvents", "Digest"]) {
  test(`${kind} deduplicates after local filtering and retains first eligible observations`, async () => {
    const first = Object.freeze(row(20));
    const changed = Object.freeze({ ...first, task_ref: "plan - changed", commit_hash: "a".repeat(40) });
    const outside = Object.freeze(row(1, { ts: new RealDate(start - 1).toISOString() }));
    const inside = Object.freeze(row(1));
    const end = new RealDate(2026, 9, 7).getTime();
    const input = Object.freeze([outside, first, changed, inside,
      Object.freeze({ ...first, id: 21 }), Object.freeze(row(2, { ts: new RealDate(end).toISOString() }))]);
    const result = await loaded(kind, [input]);
    assert.deepEqual(result.calls.map((call) => call.query.offset), [0]);
    assert.equal(input[0], outside); assert.equal(input.length, 6);
    if (kind === "DayEvents") {
      assert.deepEqual(result.rows.map((event) => event.id), [1, 20, 21]);
      assert.equal(result.rows[0], inside); assert.equal(result.rows[1], first);
    } else {
      assert.equal(result.summaries.reduce((sum, item) => sum + item.count, 0), 3);
      assert.doesNotMatch(result.html, /plan - changed/);
      assert.match(result.html, />3<\/div><div[^>]*>events on report day/);
    }
  });

  test(`${kind} keeps empty, short, raw 1499/1500/1501 and duplicate-only page caps`, async () => {
    for (const count of [0, 3, 1499, 1500, 1501]) {
      const rows = rowsOf(count), pages = [0, 500, 1000].map((offset) => rows.slice(offset, offset + 500));
      const result = await loaded(kind, pages);
      assert.equal(result.calls.length, count < 500 ? 1 : 3);
      if (kind === "DayEvents") {
        assert.equal(result.rows.length, Math.min(count, 1500));
        assert.equal(result.limitReached, count >= 1500);
      } else {
        assert.equal(result.summaries.reduce((sum, item) => sum + item.count, 0), Math.min(count, 1500));
        assert.equal(result.html.includes("More may exist"), count >= 1500);
      }
    }
    const page = Object.freeze(Array.from({ length: 500 }, () => Object.freeze(row(1))));
    const result = await loaded(kind, [page, page, page]);
    assert.deepEqual(result.calls.map((call) => call.query.offset), [0, 500, 1000]);
    if (kind === "DayEvents") {
      assert.equal(result.rows.length, 1); assert.equal(result.limitReached, true);
    } else {
      assert.equal(result.summaries[0].count, 1);
      assert.match(result.html, /1 captured events for the selected local day\. More may exist/);
    }
  });

  test(`${kind} keeps global identities across repositories and fails without partial acceptance`, async () => {
    const rows = [row(1), row(2, { repo_id: "Repo_B", provider: "claude" }), row(1)];
    const result = await loaded(kind, [rows], { scope: undefined });
    assert.equal(result.calls[0].query.repo, undefined);
    if (kind === "DayEvents") assert.deepEqual(result.rows.map((event) => event.repo_id), ["Repo_A", "Repo_B"]);
    else assert.deepEqual(result.summaries.map((item) => item.repoId), ["Repo_A", "Repo_B"]);
    await assert.rejects(loaded(kind, [], { events: (_query, _signal, call) => {
      if (call === 1) return rowsOf(500);
      throw new Error("synthetic next-page failure");
    } }), /synthetic next-page failure/);
    for (const when of ["before", "after-page"]) {
      const controller = new AbortController(); let requests = 0;
      if (when === "before") controller.abort();
      await assert.rejects(loaded(kind, [], { controller, events: () => {
        requests++; controller.abort(); return rowsOf(500);
      } }), { name: "AbortError" });
      assert.equal(requests, when === "before" ? 0 : 1);
    }
  });
}

const fingerprints = [
  ["FileStory.tsx", "FileStory", "all", "page", "c3646ac638a7a2043d8431a2ee8c57dcf96a444019c444e68199024cadfe7be9"],
  ["SessionTimeline.tsx", "SessionTimeline", "all", "page", "3abf4304969c30b370b7d15ef55afb64512aa1c2044ef012f122c55381274b3d"],
  ["dayEvents.ts", "loadDayEvents", "rows", `page.filter((row) => {
      const timestamp = new Date(row.ts).getTime();
      return timestamp >= window.startMs && timestamp < window.endMs;
    })`, "a7d378a6173e0b018adb65ec8145d6f07f621a9f0ffa3eff2d32844bf5958c64"],
];
function originalFingerprint (file, name, target, incoming, text) {
  if (name === "SessionTimeline") text = restoreSessionTaskGroups(text);
  if (name === "FileStory" || name === "SessionTimeline") text = restoreDialogChronology(text, name);
  if (name === "SessionTimeline") text = restoreSessionIdentity(text);
  const ast = parse(file, text), fn = declaration(ast, name), calls = [], identifiers = [];
  const visit = (node) => {
    if (ts.isIdentifier(node) && node.text === "appendUniqueEvents") identifiers.push(node);
    if (ts.isCallExpression(node) && node.expression.getText(ast) === "appendUniqueEvents") calls.push(node);
    ts.forEachChild(node, visit);
  };
  visit(fn);
  assert.equal(calls.length, 1, "exactly one shared append call inside the whole collector");
  assert.equal(identifiers.length, 1, "no extra helper references are masked");
  const printer = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed });
  const print = (node, source) => canonicalPrintedText(printer.printNode(ts.EmitHint.Unspecified, node, source));
  const expected = parse("expected.ts", `appendUniqueEvents(${target}, ${incoming});`);
  assert.equal(print(calls[0], ast), print(expected.statements[0].expression, expected),
    "only the reviewed helper arguments may be reversed");
  const restored = text.slice(0, calls[0].getStart(ast)) + `${target}.push(...${incoming})` + text.slice(calls[0].end);
  const previous = parse(file, restored);
  return createHash("sha256").update(print(declaration(previous, name), previous)).digest("hex");
}

test("all three other complete collectors retain original fingerprints after exactly one append reversal", () => {
  for (const [file, name, target, incoming, expected] of fingerprints) {
    const text = read(file);
    for (const variant of [text.replace(/\r\n/g, "\n"), text.replace(/\r?\n/g, "\r\n")]) {
      assert.equal(originalFingerprint(file, name, target, incoming, variant), expected, `${name}: whole function`);
    }
  }
});
test("collector preservation rejects missing, repeated, wrong-argument and unrelated owner edits", () => {
  for (const [file, name, target, incoming, expected] of fingerprints) {
    const text = read(file), marker = `appendUniqueEvents(${target},`;
    assert.equal(text.split(marker).length - 1, 1);
    for (const mutated of [text.replace(marker, "otherCollector("),
      text.replace(marker, `appendUniqueEvents(other,`),
      text.replace(marker, `appendUniqueEvents(${target}, []); appendUniqueEvents(${target},`)]) {
      assert.throws(() => originalFingerprint(file, name, target, incoming, mutated), assert.AssertionError);
    }
    const before = name === "loadDayEvents" ? "if (signal.aborted)" : "setBusy(true);";
    assert.ok(text.includes(before));
    const changed = text.replace(before, name === "loadDayEvents" ? "if (false)" : "setBusy(false);");
    assert.notEqual(originalFingerprint(file, name, target, incoming, changed), expected);
  }
});
