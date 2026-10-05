import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(resolve(root, "Frontend/package.json"));
const ts = require("typescript"), React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const read = (name) => readFileSync(resolve(root, "Frontend/src", name), "utf8");
const parse = (name) => ts.createSourceFile(name, read(name), ts.ScriptTarget.Latest, true);
const mission = parse("MissionView.tsx"), ui = parse("ui.tsx");
const model = parse("missionModel.ts"), format = parse("format.ts"), theme = parse("theme.ts");
const all = (node) => {
  const rows = [node];
  ts.forEachChild(node, (child) => { rows.push(...all(child)); });
  return rows;
};
function declaration (ast, name) {
  const node = ast.statements.find((item) => ts.isFunctionDeclaration(item)
    ? item.name?.text === name : ts.isVariableStatement(item)
      && item.declarationList.declarations.some((entry) => entry.name.getText(ast) === name));
  assert.ok(node, `actual declaration: ${name}`);
  return node.getText(ast).replace(/^export\s+/, "");
}
const view = mission.statements.find((node) => ts.isFunctionDeclaration(node)
  && node.name?.text === "MissionView");
const nodes = all(view);
function expression (prefix) {
  const found = nodes.filter((node) => ts.isJsxExpression(node)
    && node.expression?.getText(mission).startsWith(prefix));
  assert.equal(found.length, 1, `one actual render expression: ${prefix}`);
  return found[0].getText(mission);
}
const renderExpressions = ["sessionsError &&", "evidenceError &&", "timelineError &&",
  "sessionsBusy ?", "evidenceBusy ?", "timelineBusy ?"]
  .map(expression);
const details = nodes.filter((node) => ts.isJsxExpression(node)
  && node.expression?.getText(mission).startsWith("!timelineBusy")
  && node.getText(mission).includes("<details"));
assert.equal(details.length, 1, "actual Exact data condition");
renderExpressions.push(details[0].getText(mission));
const declarations = [
  ...["cx", "CONTROL_TONE", "ControlButton"].map((name) => declaration(ui, name)),
  ...["ErrorNotice", "ActivityTable", "EMPTY_ACTIVITY", "EMPTY_SESSIONS", "REFRESH_PARTS"]
    .map((name) => declaration(mission, name)),
  ...["sortActivity", "buildFlightLanes", "activityLabel", "activityActor", "formatDuration", "sameSession"]
    .map((name) => declaration(model, name)),
  declaration(theme, "sameSessionIdentity"), declaration(format, "pad"), declaration(format, "fmtTs"),
].join("\n");
const envNames = ["sessions", "sessionsError", "sessionsBusy", "timeline", "timelineError", "timelineBusy",
  "evidence", "evidenceError", "evidenceBusy", "evidenceRows", "refreshBusy", "refresh", "patchEntry",
  "selectedActivity", "flight"];
async function load (source) {
  const js = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React,
  } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
}
const actualApi = await load(read("api.ts"));
const { makeSubject } = await load(`export function makeSubject(React) {
  const { forwardRef } = React;
  const RefreshIcon = () => null;
  ${declarations}
  function renderState(env) {
    const { ${envNames.join(",")} } = env;
    return <>${renderExpressions.join("\n")}</>;
  }
  return { renderState, ErrorNotice, ActivityTable, ControlButton, buildFlightLanes,
    sameSessionIdentity, sameSession, EMPTY_ACTIVITY, EMPTY_SESSIONS, REFRESH_PARTS };
}`);
const subject = makeSubject(React);
const initial = () => ({ sessions: { ...subject.EMPTY_SESSIONS }, sessionsError: "", sessionsBusy: false,
  timeline: { ...subject.EMPTY_ACTIVITY, order: "asc" }, timelineError: "", timelineBusy: false,
  evidence: { ...subject.EMPTY_ACTIVITY }, evidenceError: "", evidenceBusy: false,
  refreshBusy: false, refresh: () => {}, patchEntry: () => {}, selectedActivity: null });
const stateElement = (state) => subject.renderState({ ...state,
  evidenceRows: state.evidence.items, flight: subject.buildFlightLanes(state.timeline.items) });
const html = (state) => renderToStaticMarkup(stateElement(state));
const children = (node) => Array.isArray(node) ? node.flatMap(children)
  : React.isValidElement(node) ? [node, ...children(node.props.children)] : [];
const row = () => ({ id: 1, evidence_id: 1, provider: "codex", session_id: "session-1",
  kind: "verification_passed", ts: "2026-10-05T01:00:00.000000Z", agent_id: null,
  agent_type: null, parent_agent_id: null, check_id: "check <one>", tool_name: null,
  outcome: "passed", duration_ms: 10, effective_assignment: { repo: null, plan_file: null } });

test("Mission failures do not claim empty sessions, evidence, or timeline data", () => {
  const state = { ...initial(), sessionsError: "Session list failed: unavailable",
    evidenceError: "Evidence ledger failed: unavailable", timelineError: "Flight recorder failed: unavailable" };
  const result = html(state);
  for (const message of [state.sessionsError, state.evidenceError, state.timelineError]) {
    assert.ok(result.includes(message), `existing failure remains visible: ${message}`);
  }
  assert.doesNotMatch(result, /No provider sessions|No matching canonical evidence|Select a recorded session|No activity on this page|Exact data/);
});

test("failed sessions without a timeline cannot expose Exact data's false zero", () => {
  const state = { ...initial(), sessionsError: "Session list failed: unavailable" };
  assert.doesNotMatch(html(state), /No provider sessions|Select a recorded session|No activity on this page|Exact data/);
});

function local (name) {
  const item = view.body.statements.find((node) => ts.isVariableStatement(node)
    && node.declarationList.declarations.some((entry) => entry.name.getText(mission) === name));
  assert.ok(item, `actual Mission owner: ${name}`);
  return item.getText(mission);
}
const parts = ["sessions", "evidence", "timeline"];
const effectSources = Object.fromEntries(parts.map((part) => {
  const effects = nodes.filter((node) => ts.isCallExpression(node)
    && node.expression.getText(mission) === "useEffect"
    && node.arguments[0]?.getText(mission).includes(`requestOwner("${part}")`));
  assert.equal(effects.length, 1, `one actual ${part} request effect`);
  return [part, effects[0].arguments[0].getText(mission)];
}));
const effectNames = ["scope", "refreshToken", "refreshRunRef", "entryRef", "patchEntry",
  "sessionPager", "evidencePager", "timelinePager", "selectedSession", "selectedPlan", "sessions",
  ...parts.flatMap((part) => ["set" + part[0].toUpperCase() + part.slice(1),
    "set" + part[0].toUpperCase() + part.slice(1) + "Busy",
    "set" + part[0].toUpperCase() + part.slice(1) + "Error"]), "setPlaying"];
const { createOwners, runEffect } = await load(`
export function createOwners(env, apiHelpers, constants) {
  const { createActionDeadline } = apiHelpers;
  const { REFRESH_PARTS } = constants;
  const { refreshRunRef, refreshSequenceRef, refreshToken, setRefreshBusy, setRefreshToken, onStatus } = env;
  const useCallback = (fn) => fn;
  ${["finishRefreshPart", "cancelRefresh", "refresh", "requestOwner"].map(local).join("\n")}
  return { finishRefreshPart, cancelRefresh, refresh, requestOwner };
}
export function runEffect(part, env, owners, apiHelpers, constants) {
  const { api, isAbortError } = apiHelpers;
  const { EMPTY_ACTIVITY, EMPTY_SESSIONS, sameSessionIdentity, sameSession } = constants;
  const { requestOwner } = owners;
  const { ${effectNames.join(",")} } = env;
  return ({ ${parts.map((part) => `${part}: ${effectSources[part]}`).join(",\n")} })[part]();
}`);
const flush = async () => { for (let i = 0; i < 12; i += 1) await Promise.resolve(); };

// Native fetch/timers are controlled. All request ownership, effects, API envelope
// handling and changed render conditions are actual source, not a React DOM test.
async function withWorld (body) {
  const descriptors = Object.fromEntries(["window", "fetch"].map((key) =>
    [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const timers = new Map(), requests = [];
  let nextTimer = 0;
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    setTimeout(fn, ms) { const id = nextTimer++; timers.set(id, { fn, ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
  } });
  Object.defineProperty(globalThis, "fetch", { configurable: true, value: (url, init) =>
    new Promise((resolve, reject) => {
      const signal = init.signal;
      const abort = () => reject(new DOMException("Aborted", "AbortError"));
      signal.addEventListener("abort", abort, { once: true });
      requests.push({ url, signal,
        success(data) { signal.removeEventListener("abort", abort); resolve({ ok: true, json: async () => ({ success: true, data }) }); },
        fail(error = new TypeError("Failed to fetch")) { signal.removeEventListener("abort", abort); reject(error); },
        httpFailure() { signal.removeEventListener("abort", abort); resolve({ ok: false, status: 503,
          json: async () => ({ success: false, message: "Synthetic service unavailable" }) }); },
      });
    }) });
  const owned = [];
  try {
    await body({ requests, timers, harness(options) {
      const h = harness(options); owned.push(h); return h;
    } });
  } finally {
    for (const h of owned) h.dispose();
    await flush();
    for (const key of ["window", "fetch"]) {
      if (descriptors[key]) Object.defineProperty(globalThis, key, descriptors[key]);
      else delete globalThis[key];
    }
  }
}
function harness (options = {}) {
  const state = { ...initial(), refreshToken: 0, ...options };
  const refreshRunRef = { current: null }, refreshSequenceRef = { current: 0 };
  const entryRef = { current: { session: options.session === null ? null
    : { provider: "codex", sessionId: "session-1" }, cursor: 0 } };
  const cleanups = new Map(), statuses = [], writes = [];
  const setters = {};
  for (const name of [...parts.flatMap((part) => [part, `${part}Busy`, `${part}Error`]),
    "refreshToken", "refreshBusy", "playing"]) {
    setters[`set${name[0].toUpperCase()}${name.slice(1)}`] = (next) => {
      state[name] = typeof next === "function" ? next(state[name]) : next;
      writes.push(name);
    };
  }
  const env = () => ({ ...state, ...setters, scope: "Repo_A", refreshRunRef, refreshSequenceRef, entryRef,
    onStatus: (message) => statuses.push(message), patchEntry: (patch) => {
      entryRef.current = { ...entryRef.current, ...patch };
    }, selectedSession: entryRef.current.session,
    selectedPlan: { repo: "Repo_A", plan_file: "temp/Plan/PLAN_test.txt" },
    sessionPager: { start: 0 }, evidencePager: { start: 0 }, timelinePager: { start: 0 } });
  const owners = () => createOwners(env(), actualApi, subject);
  state.refresh = () => owners().refresh();
  return { state, writes, statuses, entryRef,
    start(part) {
      cleanups.get(part)?.();
      const cleanup = runEffect(part, env(), owners(), actualApi, subject);
      cleanups.set(part, cleanup);
      return cleanup;
    },
    dispose() { for (const cleanup of cleanups.values()) cleanup(); owners().cancelRefresh(); },
  };
}
const emptyCopy = { sessions: /No provider sessions/, evidence: /No matching canonical evidence/,
  timeline: /Select a recorded session|No activity on this page|Exact data/ };
const errorLabel = { sessions: "Session list", evidence: "Evidence ledger", timeline: "Flight recorder" };
const page = (items, part) => ({ items, total: items.length, limit: 50, offset: 0,
  order: part === "timeline" ? "asc" : "desc" });

for (const part of parts) {
  for (const failure of ["transport", "http"]) {
    test(`${part}: actual ${failure} failure is unavailable, then Retry recovers`, async () => withWorld(async (world) => {
      const h = world.harness();
      h.start(part);
      assert.equal(h.state[`${part}Busy`], true);
      assert.equal(world.requests.length, 1);
      const params = new URL(world.requests[0].url, "http://fixture.invalid").searchParams;
      assert.equal(params.get("repo"), "Repo_A");
      assert.equal(params.get("limit"), "50");
      assert.equal(params.get("offset"), "0");
      if (part === "timeline") {
        assert.equal(params.get("provider"), "codex");
        assert.equal(params.get("session"), "session-1");
      }
      if (failure === "transport") world.requests[0].fail(); else world.requests[0].httpFailure();
      await flush();
      assert.equal(h.state[`${part}Busy`], false);
      assert.match(h.state[`${part}Error`], new RegExp(`${errorLabel[part]} failed:`));
      assert.match(h.state[`${part}Error`], failure === "transport" ? /Failed to fetch/ : /Synthetic service unavailable/);
      assert.doesNotMatch(html(h.state), emptyCopy[part]);
      const notice = children(stateElement(h.state)).find((node) => node.type === subject.ErrorNotice);
      assert.ok(notice, "actual ErrorNotice remains mounted");
      assert.equal(notice.props.onRetry, h.state.refresh);
      const button = children(subject.ErrorNotice(notice.props)).find((node) => node.type === subject.ControlButton);
      assert.equal(button.props.onClick, h.state.refresh);
      subject.ControlButton.render(button.props, null).props.onClick();
      h.start(part);
      assert.equal(world.requests.length, 2);
      assert.equal(h.state[`${part}Error`], "");
      assert.equal(h.state[`${part}Busy`], true);
      assert.doesNotMatch(html(h.state), emptyCopy[part]);
      world.requests[1].success(page([], part));
      await flush();
      assert.equal(h.state[`${part}Busy`], false);
      assert.equal(h.state[`${part}Error`], "");
      assert.match(html(h.state), emptyCopy[part], "successful emptiness retains its existing copy");
    }));
  }
  test(`${part}: real action deadline reports timeout without false emptiness`, async () => withWorld(async (world) => {
    const h = world.harness();
    h.state.refresh(); h.start(part);
    assert.equal(world.timers.size, 1);
    const [id, timer] = [...world.timers][0];
    assert.equal(timer.ms, 10000);
    world.timers.delete(id); timer.fn();
    await flush();
    assert.equal(world.requests[0].signal.aborted, true);
    assert.equal(h.state[`${part}Busy`], false);
    assert.equal(h.state[`${part}Error`], `${errorLabel[part]} timed out after 10 seconds.`);
    assert.doesNotMatch(html(h.state), emptyCopy[part]);
  }));
  test(`${part}: cleanup cancels silently and late success cannot publish`, async () => withWorld(async (world) => {
    const h = world.harness();
    const cleanup = h.start(part);
    world.requests[0].success(page([row()], part));
    cleanup();
    const writeCount = h.writes.length;
    await flush();
    assert.equal(world.requests[0].signal.aborted, true);
    assert.equal(h.writes.length, writeCount, "aborted completion writes no state");
    assert.equal(h.state[part].items.length, 0);
    assert.equal(h.state[`${part}Error`], "");
    h.start(part); // Also exercise abort-driven rejection while fetch remains pending.
    h.dispose();
    const canceledWrites = h.writes.length;
    await flush();
    assert.equal(h.writes.length, canceledWrites, "silent cancellation does not publish a failure");
    assert.equal(h.state[`${part}Error`], "");
  }));
  test(`${part}: successful nonempty response remains accepted rather than an empty claim`, async () => withWorld(async (world) => {
    const h = world.harness();
    const item = part === "sessions" ? { provider: "codex", session_id: "session-1",
      event_count: 1, agent_count: 0, repo_count: 1,
      started_at: "2026-10-05T01:00:00.000000Z", ended_at: "2026-10-05T01:00:00.000000Z",
      delivery: "realtime" } : row();
    const accepted = page([item], part);
    h.start(part); world.requests[0].success(accepted); await flush();
    assert.equal(h.state[part], accepted, "actual API data is accepted without reshaping");
    assert.equal(h.state[`${part}Busy`], false);
    assert.equal(h.state[`${part}Error`], "");
    const result = html(h.state);
    assert.doesNotMatch(result, part === "timeline"
      ? /Select a recorded session|No activity on this page/ : emptyCopy[part]);
  }));
}

test("actual failed initial session read does not turn absent selection into empty Exact data", async () => withWorld(async (world) => {
  const h = world.harness({ session: null });
  h.start("timeline");
  assert.equal(world.requests.length, 0, "no selected session means no timeline fetch");
  h.start("sessions"); world.requests[0].fail(); await flush();
  h.start("timeline"); // Actual sessionsBusy dependency settles after the list failure.
  assert.equal(world.requests.length, 1, "selection remains absent; no fabricated timeline read");
  assert.equal(h.state.timelineError, "");
  assert.doesNotMatch(html(h.state), /No provider sessions|Select a recorded session|Exact data|No activity on this page/);
}));

test("independent accepted timeline remains inspectable despite failed session list", async () => withWorld(async (world) => {
  const h = world.harness();
  h.start("sessions"); world.requests[0].fail(); await flush();
  h.start("timeline"); world.requests[1].success(page([row()], "timeline")); await flush();
  const result = html(h.state);
  assert.match(result, /Session list failed/);
  assert.match(result, /Exact data/);
  assert.match(result, /check &lt;one&gt;/);
  assert.doesNotMatch(result, /No provider sessions|Select a recorded session|No activity on this page/);
  const table = children(stateElement(h.state)).find((node) => node.type === subject.ActivityTable);
  assert.equal(table.props.rows[0].id, 1);
  const selected = [];
  h.state.patchEntry = (patch) => selected.push(patch);
  const currentTable = children(stateElement(h.state)).find((node) => node.type === subject.ActivityTable);
  const activityButton = children(subject.ActivityTable(currentTable.props)).find((node) => node.type === "button");
  activityButton.props.onClick();
  assert.deepEqual(selected, [{ cursor: 0 }]);
}));

test("loading has priority, and Retry preserves its real busy/disabled semantics", () => {
  const state = { ...initial(), sessionsBusy: true, evidenceBusy: true, timelineBusy: true,
    sessionsError: "Existing failure", refreshBusy: true };
  const result = html(state);
  for (const text of ["Loading sessions...", "Loading evidence ledger...", "Loading session activity...", "Refreshing"]) {
    assert.ok(result.includes(text), text);
  }
  assert.match(result, /aria-busy="true"/);
  assert.match(result, /disabled=""/);
  assert.doesNotMatch(result, /No provider sessions|No matching canonical evidence|Select a recorded session|Exact data/);
});
