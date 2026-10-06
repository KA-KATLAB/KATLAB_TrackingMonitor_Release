import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { canonicalPrintedText } from "./helpers/printed_source.mjs";
import { MISSION_OWNER_CHANGES, MISSION_OWNER_CHANGES_SHA, ORIGINAL_MISSION_LF_SHA,
  restoreMissionOwnerRetirement } from "./helpers/missionOwnerRetirement.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(resolve(root, "Frontend/package.json"));
const ts = require("typescript");
const read = (file) => readFileSync(resolve(root, "Frontend/src", file), "utf8");
const parse = (text) => ts.createSourceFile("MissionView.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const source = parse(read("MissionView.tsx"));
const declaration = (ast, name) => {
  const found = ast.statements.filter((node) => ts.isFunctionDeclaration(node) ? node.name?.text === name
    : ts.isVariableStatement(node) && node.declarationList.declarations.some((item) => item.name.getText(ast) === name));
  assert.equal(found.length, 1, `one actual ${name}`); return found[0];
};
const view = declaration(source, "MissionView"), parts = ["mission", "sessions", "timeline", "evidence"];
const local = (name) => {
  const found = view.body.statements.filter((node) => ts.isVariableStatement(node)
    && node.declarationList.declarations.some((item) => item.name.getText(source) === name));
  assert.equal(found.length, 1, `one actual local ${name}`); return found[0].getText(source);
};
const effects = Object.fromEntries(parts.map((part) => {
  const found = view.body.statements.filter((node) => ts.isExpressionStatement(node)
    && ts.isCallExpression(node.expression) && node.expression.expression.getText(source) === "useEffect"
    && node.expression.arguments[0].getText(source).includes(`requestOwner("${part}")`));
  assert.equal(found.length, 1, `one complete ${part} effect`);
  return [part, found[0].expression];
}));
const load = (text) => import(`data:text/javascript;base64,${Buffer.from(ts.transpileModule(text, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText).toString("base64")}`);
const apiModule = await load(read("api.ts")), forecast = await load(read("forecastDecoder.ts"));
const model = parse(read("missionModel.ts")), theme = parse(read("theme.ts"));
const envNames = ["scope", "invalidationNonce", "refreshToken", "refreshRunRef", "entryRef", "patchEntry",
  "sessionPager", "timelinePager", "evidencePager", "selectedSession", "selectedSessionKey", "selectedPlan", "sessions",
  "sessionsBusy", "missionBusy", "finishRefreshPart", "setForecastState", "setPlaying",
  ...parts.flatMap((part) => [part, `${part}Busy`, `${part}Error`].map((name) => `set${name[0].toUpperCase()}${name.slice(1)}`))];
const { createSubject } = await load(`export function createSubject(apiModule, forecast) {
  const { api, createActionDeadline, isAbortError } = apiModule, { decodeForecast } = forecast;
  ${["EMPTY_ACTIVITY", "EMPTY_SESSIONS", "REFRESH_PARTS"].map((name) => declaration(source, name).getText(source)).join("\n")}
  ${[declaration(model, "sameSession").getText(model), declaration(theme, "sameSessionIdentity").getText(theme)]
    .map((text) => text.replace(/^export\s+/, "")).join("\n")}
  function owners(env) {
    const { refreshRunRef, refreshSequenceRef, refreshToken, setRefreshBusy, setRefreshToken, onStatus } = env;
    const useCallback = (callback) => callback;
    ${["finishRefreshPart", "cancelRefresh", "refresh", "requestOwner"].map(local).join("\n")}
    return { finishRefreshPart, cancelRefresh, refresh, requestOwner };
  }
  function effect(part, env, owner) {
    const { ${envNames.join(", ")} } = env, { requestOwner } = owner;
    return ({ ${parts.map((part) => `${part}: ${effects[part].arguments[0].getText(source)}`).join(",\n")} })[part]();
  }
  return { owners, effect, EMPTY_ACTIVITY, EMPTY_SESSIONS, REFRESH_PARTS };
}`);
const subject = createSubject(apiModule, forecast);
const flush = async () => { for (let i = 0; i < 18; i++) await Promise.resolve(); };
const page = (part, items = []) => ({ items, total: items.length, limit: 50, offset: 0, order: part === "timeline" ? "asc" : "desc" });
const payload = () => ({ scope: { kind: "all", repo: null }, generated_at: "2026-10-06T00:00:00Z",
  summary: { total: 0, states: {} }, plans: [] });
const result = (part, empty = false) => part === "mission" ? payload() : page(part, empty ? [] : part === "sessions"
  ? [{ provider: "codex", session_id: "session-1" }]
  : [{ id: 1, provider: "codex", session_id: "session-1", kind: "session_start" }]);
const labels = { mission: "Mission snapshot", sessions: "Session list", timeline: "Flight recorder", evidence: "Evidence ledger" };

// Complete production owner closures/effects and real API/deadline/decoder.
// Tests explicitly drive React's cleanup-before-replacement effect boundary.
async function withWorld (body) {
  const original = ["window", "fetch"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  const requests = [], timers = new Map(), owned = []; let timerId = 0;
  globalThis.window = { setTimeout(fn, ms) { const id = timerId++; timers.set(id, { fn, ms }); return id; },
    clearTimeout(id) { timers.delete(id); } };
  globalThis.fetch = (url, { signal }) => new Promise((resolve, reject) => {
    const abort = () => reject(apiModule.abortError());
    if (signal.aborted) abort(); else signal.addEventListener("abort", abort, { once: true });
    requests.push({ url, signal,
      success(data) { signal.removeEventListener("abort", abort); resolve({ ok: true, json: async () => ({ success: true, data }) }); },
      failure(kind = "transport") { signal.removeEventListener("abort", abort);
        if (kind === "http") resolve({ ok: false, status: 503, json: async () => ({ success: false, message: "Queued service failure" }) });
        else reject(new TypeError("Queued transport failure")); },
    });
  });
  const world = { requests, timers,
    expire() { assert.equal(timers.size, 1); const [id, timer] = [...timers][0];
      assert.equal(timer.ms, 10_000); timers.delete(id); timer.fn(); },
    harness(options = {}) { const h = harness(options); owned.push(h); return h; },
  };
  try { await body(world); }
  finally {
    try { for (const h of owned) h.dispose(); await flush(); assert.equal(timers.size, 0, "all action timers are cleared"); }
    finally { for (const [key, descriptor] of original) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    } }
  }
}

function harness (options = {}) {
  const state = { refreshToken: 0, refreshBusy: false, mission: null, forecastState: null,
    scope: "Repo_A", invalidationNonce: 1, sessions: { ...subject.EMPTY_SESSIONS },
    timeline: { ...subject.EMPTY_ACTIVITY, order: "asc" }, evidence: { ...subject.EMPTY_ACTIVITY },
    missionError: "", sessionsError: "", timelineError: "", evidenceError: "",
    missionBusy: false, sessionsBusy: false, timelineBusy: false, evidenceBusy: false, playing: false,
    selectedPlan: { repo: "Repo_A", plan_file: "Plan.txt" },
    sessionPager: { start: 0 }, timelinePager: { start: 0 }, evidencePager: { start: 0 }, ...options };
  const refreshRunRef = { current: null }, refreshSequenceRef = { current: 0 };
  const entryRef = { current: { session: options.session === null ? null : { provider: "codex", sessionId: "session-1" }, cursor: 0 } };
  const cleanups = new Map(), writes = [], statuses = [], patches = [];
  const setters = Object.fromEntries(["refreshToken", "refreshBusy", "forecastState", "playing",
    ...parts.flatMap((part) => [part, `${part}Busy`, `${part}Error`])].map((name) =>
    [`set${name[0].toUpperCase()}${name.slice(1)}`, (value) => {
      state[name] = typeof value === "function" ? value(state[name]) : value; writes.push({ name, value: state[name] });
    }]));
  const env = () => ({ ...state, ...setters, refreshRunRef, refreshSequenceRef, entryRef,
    selectedSession: entryRef.current.session, selectedSessionKey: entryRef.current.session ? JSON.stringify(entryRef.current.session) : "none",
    patchEntry(patch) { patches.push(patch); entryRef.current = { ...entryRef.current, ...patch }; },
    onStatus: (message) => statuses.push(message) });
  const owners = () => subject.owners(env());
  return { state, entryRef, refreshRunRef, writes, statuses, patches, owners,
    refresh() { owners().refresh(); return refreshRunRef.current; },
    cancel() { owners().cancelRefresh(); },
    start(part) { cleanups.get(part)?.(); const cleanup = subject.effect(part, env(), owners()); cleanups.set(part, cleanup); return cleanup; },
    cleanup(part) { cleanups.get(part)?.(); cleanups.delete(part); },
    dispose() { for (const cleanup of cleanups.values()) cleanup(); cleanups.clear(); owners().cancelRefresh(); },
  };
}

test("retired queued Mission transport rejection cannot overwrite its pending replacement", async () => withWorld(async (world) => {
  const h = world.harness(); h.start("mission"); world.requests[0].failure();
  h.state.invalidationNonce++; h.start("mission"); const writes = h.writes.length;
  await flush();
  assert.equal(h.state.missionError, "", "retired transport must not publish an obsolete Mission error");
  assert.equal(h.state.missionBusy, true, "replacement remains busy");
  assert.equal(h.writes.length, writes, "retired callback writes no current state");
  world.requests[1].success(payload()); await flush();
  assert.equal(h.state.missionError, ""); assert.equal(h.state.missionBusy, false);
}));

for (const part of parts) {
  for (const kind of ["transport", "http", "timeout"]) {
    test(`${part}: retired queued ${kind} cannot settle or corrupt a fresh refresh`, async () => withWorld(async (world) => {
      const h = world.harness(); const oldRun = h.refresh(); h.start(part);
      if (kind === "timeout") world.expire(); else world.requests[0].failure(kind);
      h.cleanup(part); h.cancel(); const nextRun = h.refresh(); h.start(part);
      assert.notEqual(oldRun, nextRun); const writes = h.writes.length;
      await flush();
      assert.equal(h.writes.length, writes, "retired continuation has no state authority");
      assert.equal(h.state[`${part}Busy`], true); assert.equal(h.state[`${part}Error`], "");
      assert.equal(nextRun.failed, false); assert.ok(nextRun.pending.has(part));
      assert.equal(h.refreshRunRef.current, nextRun);
      const accepted = result(part, true); world.requests[1].success(accepted); await flush();
      assert.equal(h.state[part], accepted); assert.equal(h.state[`${part}Busy`], false);
      assert.equal(h.state[`${part}Error`], "");
      assert.equal(nextRun.failed, false);
      assert.equal(nextRun.pending.has(part), part === "timeline",
        "empty timeline preserves its existing session-selection deferral");
    }));
  }
  for (const kind of ["transport", "http", "timeout"]) {
    test(`${part}: current ${kind} remains visible and settles its busy state`, async () => withWorld(async (world) => {
      const h = world.harness(); const run = h.refresh(); h.start(part);
      if (kind === "timeout") world.expire(); else world.requests[0].failure(kind);
      await flush();
      assert.equal(h.state[`${part}Busy`], false);
      assert.match(h.state[`${part}Error`], kind === "timeout" ? /timed out after 10 seconds\.$/
        : kind === "http" ? /Queued service failure/ : /Queued transport failure/);
      assert.ok(h.state[`${part}Error`].startsWith(labels[part]));
      assert.equal(run.failed, true); assert.equal(run.pending.has(part), false);
    }));
  }
  test(`${part}: newly created pre-expired current owner still reports timeout`, async () => withWorld(async (world) => {
    const h = world.harness(); const run = h.refresh(); world.expire(); h.start(part); await flush();
    assert.ok(world.requests[0].signal.aborted);
    assert.equal(h.state[`${part}Error`], `${labels[part]} timed out after 10 seconds.`);
    assert.equal(h.state[`${part}Busy`], false); assert.equal(run.failed, true);
  }));
  test(`${part}: late fulfilled response after cleanup cannot publish`, async () => withWorld(async (world) => {
    const h = world.harness(); h.refresh(); h.start(part); world.requests[0].success(result(part));
    h.cleanup(part); const writes = h.writes.length; await flush();
    assert.equal(h.writes.length, writes); assert.equal(h.state[`${part}Error`], "");
  }));
}

test("all four current parts finish one deadline run, including the last busy settlement after ref clear", async () => withWorld(async (world) => {
  const h = world.harness(); const run = h.refresh(); for (const part of parts) h.start(part);
  assert.equal(world.requests.length, 4); world.expire(); await flush();
  assert.equal(run.pending.size, 0); assert.equal(h.refreshRunRef.current, null);
  assert.equal(h.state.refreshBusy, false); assert.equal(world.timers.size, 0);
  for (const part of parts) {
    assert.equal(h.state[`${part}Busy`], false);
    assert.equal(h.state[`${part}Error`], `${labels[part]} timed out after 10 seconds.`);
  }
  assert.deepEqual(h.statuses, ["Refreshing Mission data.", "Mission refresh timed out after 10 seconds. Retry is available."]);
  const refreshDone = h.writes.findIndex((write) => write.name === "refreshBusy" && write.value === false);
  assert.ok(refreshDone >= 0);
  assert.ok(h.writes.slice(refreshDone + 1).some((write) => write.name.endsWith("Busy") && write.value === false),
    "last current effect must settle after finishRefreshPart clears the run ref");
}));

test("same-run replacement generations cannot remove the replacement's pending slot", async () => withWorld(async (world) => {
  const h = world.harness(); const run = h.refresh(); h.start("sessions");
  world.requests[0].failure("http"); h.state.sessionPager = { start: 50 }; h.start("sessions");
  assert.equal(run.generations.get("sessions"), 2); const writes = h.writes.length; await flush();
  assert.equal(h.writes.length, writes); assert.ok(run.pending.has("sessions")); assert.equal(run.failed, false);
  assert.equal(new URL(world.requests[1].url, "http://fixture.invalid").searchParams.get("offset"), "50");
  world.requests[1].success(page("sessions")); await flush();
  assert.equal(run.pending.has("sessions"), false); assert.equal(run.failed, false);
}));

test("page, session, plan and same-entry invalidation replacements retain actual API identities", async () => withWorld(async (world) => {
  const h = world.harness();
  for (const part of parts) {
    h.start(part); const old = world.requests.at(-1); old.failure();
    h.state.invalidationNonce++;
    h.state.scope = "Repo B<&";
    h.state.sessionPager = { start: 100 }; h.state.timelinePager = { start: 50 }; h.state.evidencePager = { start: 150 };
    h.entryRef.current.session = { provider: "claude", sessionId: "exact / ? & session" };
    h.state.selectedPlan = { repo: "Repo C", plan_file: "Other.txt" };
    h.start(part); const current = world.requests.at(-1), writes = h.writes.length; await flush();
    assert.ok(old.signal.aborted); assert.equal(h.writes.length, writes);
    const params = new URL(current.url, "http://fixture.invalid").searchParams;
    assert.equal(params.get("repo"), part === "evidence" ? "Repo C" : "Repo B<&");
    if (part !== "mission") {
      assert.equal(params.get("limit"), "50");
      assert.equal(params.get("offset"), part === "sessions" ? "100" : part === "timeline" ? "50" : "150");
    }
    if (part === "timeline") { assert.equal(params.get("provider"), "claude"); assert.equal(params.get("session"), "exact / ? & session"); }
    current.success(result(part)); await flush(); assert.equal(h.state[`${part}Error`], "");
  }
}));

test("no-session timeline and absent-plan evidence defer real refresh parts until selection resolves", async () => withWorld(async (world) => {
  const h = world.harness({ session: null, selectedPlan: null }); const run = h.refresh();
  h.start("timeline"); h.start("evidence"); assert.equal(world.requests.length, 0);
  assert.ok(run.pending.has("timeline")); assert.ok(run.pending.has("evidence"));
  h.start("mission"); h.start("sessions");
  world.requests[0].success(payload()); world.requests[1].success(page("sessions")); await flush();
  h.start("timeline"); h.start("evidence");
  assert.equal(run.pending.size, 0); assert.equal(h.refreshRunRef.current, null);
  assert.equal(h.state.refreshBusy, false); assert.equal(h.statuses.at(-1), "Mission data refreshed.");
  assert.equal(world.timers.size, 0);
}));

test("empty timeline defers completion for a replacement session and its new generation finishes", async () => withWorld(async (world) => {
  const h = world.harness(); const run = h.refresh(); h.start("timeline");
  world.requests[0].success(page("timeline")); await flush();
  assert.equal(h.entryRef.current.session, null); assert.ok(run.pending.has("timeline"));
  h.state.sessions = page("sessions", [{ provider: "codex", session_id: "replacement" }]);
  h.entryRef.current.session = { provider: "codex", sessionId: "replacement" };
  h.start("timeline"); assert.equal(run.generations.get("timeline"), 2);
  world.requests[1].success(result("timeline")); await flush();
  assert.equal(run.pending.has("timeline"), false); assert.equal(h.state.timelineBusy, false);
  assert.equal(h.state.timeline.items.length, 1);
}));

test("complete current successful refresh preserves forecast decoder result and one status completion", async () => withWorld(async (world) => {
  const h = world.harness(); h.refresh(); h.refresh(); for (const part of parts) h.start(part);
  assert.equal(world.timers.size, 1, "same-stack manual refresh remains duplicate guarded");
  for (const [index, part] of parts.entries()) world.requests[index].success(result(part));
  await flush();
  assert.equal(h.refreshRunRef.current, null); assert.equal(h.state.refreshBusy, false);
  assert.equal(h.state.forecastState.result.tag, "old-server");
  assert.equal(h.state.forecastState.scope, "Repo_A");
  assert.equal(h.state.forecastState.nonce, 1); assert.equal(h.state.forecastState.token, 1);
  assert.deepEqual(h.statuses, ["Refreshing Mission data.", "Mission data refreshed."]);
}));

test("owner abort and finish are idempotent and remove the real deadline listener", async () => withWorld(async (world) => {
  const h = world.harness(); const run = h.refresh(), signal = run.action.signal, listeners = new Set();
  const add = signal.addEventListener.bind(signal), remove = signal.removeEventListener.bind(signal);
  signal.addEventListener = (type, fn, options) => { if (type === "abort") listeners.add(fn); add(type, fn, options); };
  signal.removeEventListener = (type, fn, options) => { if (type === "abort") listeners.delete(fn); remove(type, fn, options); };
  const owner = h.owners().requestOwner("mission"); assert.equal(listeners.size, 1);
  owner.abort(); owner.abort(); assert.ok(owner.controller.signal.aborted); assert.equal(listeners.size, 0);
  world.expire(); assert.equal(owner.timedOut(), false, "retired owner cannot recover timeout authority");
  owner.finish(); const writes = h.writes.length; owner.finish(true);
  assert.equal(h.writes.length, writes); assert.equal(run.failed, false);
  const live = h.owners().requestOwner("sessions"); assert.equal(live.timedOut(), true, "new current pre-expired owner is not retired");
  live.finish(true); assert.equal(listeners.size, 0);
  assert.equal(live.timedOut(), true, "ordinary finish does not retire timeout authority");
}));

test("unmount cleanup and global finally boundaries survive queued failures and fixture errors", async () => {
  const originals = ["window", "fetch"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  await withWorld(async (world) => {
    const h = world.harness(); h.refresh(); for (const part of parts) h.start(part);
    world.expire(); h.dispose(); const writes = h.writes.length; await flush();
    assert.equal(h.writes.length, writes); assert.equal(h.refreshRunRef.current, null);
    for (const part of parts) assert.equal(h.state[`${part}Error`], "");
  });
  await assert.rejects(withWorld(async () => { throw new Error("body sentinel"); }), /body sentinel/);
  for (const [key, descriptor] of originals) assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis, key), descriptor);
  await assert.rejects(withWorld(async (world) => { world.timers.set("stray", {}); }), /all action timers are cleared/);
  for (const [key, descriptor] of originals) assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis, key), descriptor);
  await assert.rejects(withWorld(async (world) => {
    world.harness().dispose = () => { throw new Error("cleanup sentinel"); };
  }), /cleanup sentinel/);
  for (const [key, descriptor] of originals) assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis, key), descriptor);
});

test("same-part generation and canceled manual run cannot finish a replacement run", async () => withWorld(async (world) => {
  const h = world.harness(), oldRun = h.refresh(), old = h.owners().requestOwner("mission");
  const current = h.owners().requestOwner("mission");
  old.finish(true); assert.equal(oldRun.failed, false); assert.ok(oldRun.pending.has("mission"));
  current.finish(); assert.equal(oldRun.pending.has("mission"), false);
  const unfinished = h.owners().requestOwner("evidence");
  h.cancel(); const replacement = h.refresh(), writes = h.writes.length;
  old.finish(true); current.finish(true); unfinished.finish(true); assert.equal(h.writes.length, writes);
  assert.equal(h.refreshRunRef.current, replacement); assert.equal(replacement.pending.size, 4);
  assert.equal(replacement.failed, false); assert.equal(oldRun.failed, false); assert.equal(world.timers.size, 1);
  old.abort(); current.abort(); unfinished.abort();
}));

const sha = (text) => createHash("sha256").update(text).digest("hex");
test("exact four-edit restoration preserves original owner, whole file and outside scope in LF and CRLF", () => {
  const current = read("MissionView.tsx").replace(/\r\n/g, "\n");
  assert.equal(sha(JSON.stringify(MISSION_OWNER_CHANGES)), MISSION_OWNER_CHANGES_SHA);
  for (const text of [current, current.replace(/\n/g, "\r\n")]) {
    const restored = restoreMissionOwnerRetirement(text);
    assert.equal(restored.includes("\r\n"), text.includes("\r\n"));
    assert.equal(sha(restored.replace(/\r\n/g, "\n")), ORIGINAL_MISSION_LF_SHA);
    const raw = restored.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n");
    assert.equal(sha(raw), "0a25cb4ab036b059dca86be9f7f1ba39b78a12d132def5a1ea399462d4264dfb");
    const ast = parse(raw), owner = declaration(ast, "MissionView"), printer = ts.createPrinter({ removeComments: true });
    const statements = [...owner.body.statements]; assert.ok(ts.isReturnStatement(statements.pop()));
    const before = canonicalPrintedText(statements.map((node) => printer.printNode(ts.EmitHint.Unspecified, node, ast)).join("\n"));
    assert.equal(sha(before), "df16cb940a79eb34b4b81dfbb55186bca2dac5265011b295b9a3e4e56d860f20");
    assert.equal(sha(raw.slice(0, owner.getStart(ast)) + raw.slice(owner.end)),
      "f31856aa7c99a440d4ce995f8486ba135a0c3659b2be877bd82cc4271961a4d0");
  }
});

test("restoration rejects partial, absent, repeated and unrelated owner or render changes", () => {
  const current = read("MissionView.tsx").replace(/\r\n/g, "\n");
  for (const change of MISSION_OWNER_CHANGES) {
    assert.ok(current.includes(change.after));
    assert.throws(() => restoreMissionOwnerRetirement(current.replace(change.after, change.before)), undefined, `absent ${change.name}`);
    assert.throws(() => restoreMissionOwnerRetirement(current.replace(change.after, `${change.after}\n${change.after}`)), undefined,
      `repeated ${change.name}`);
  }
  for (const [from, to] of [
    ["let retired = false;", "let retired = true;"],
    ["!retired && (run?.action.didTimeout() ?? false)", "!retired && refreshRunRef.current === run && (run?.action.didTimeout() ?? false)"],
    ["run.pending.delete(part);", "run.pending.clear();"],
    ["run.generations.get(part) !== generation", "false"],
    ["setMissionBusy(false);", "setMissionBusy(true);"],
    ['title="Mission"', 'title="Changed Mission"'],
    ['const REFRESH_PARTS = ["mission", "sessions", "timeline", "evidence"]', 'const REFRESH_PARTS = ["mission"]'],
  ]) {
    assert.ok(current.includes(from), `mutation targets actual ${from}`);
    assert.throws(() => restoreMissionOwnerRetirement(current.replace(from, to)), undefined, `reject ${to}`);
  }
  const ast = parse(current), owner = declaration(ast, "MissionView").getText(ast);
  assert.throws(() => restoreMissionOwnerRetirement(`${current}\n${owner}`), /one complete Mission owner/);
  assert.throws(() => restoreMissionOwnerRetirement(restoreMissionOwnerRetirement(current)), /exact retirement state cardinality/);
});
