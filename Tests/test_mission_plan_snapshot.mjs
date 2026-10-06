import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { canonicalPrintedText } from "./helpers/printed_source.mjs";
import { restoreMissionOwnerRetirement } from "./helpers/missionOwnerRetirement.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(resolve(root, "Frontend/package.json"));
const ts = require("typescript"), React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const read = (name) => readFileSync(resolve(root, "Frontend/src", name), "utf8");
const parse = (name) => ts.createSourceFile(name, read(name), ts.ScriptTarget.Latest, true);
const mission = parse("MissionView.tsx"), ui = parse("ui.tsx"), model = parse("missionModel.ts");
function declaration (ast, name, optional = false) {
  const node = ast.statements.find((item) => ts.isFunctionDeclaration(item)
    ? item.name?.text === name : ts.isVariableStatement(item)
      && item.declarationList.declarations.some((entry) => entry.name.getText(ast) === name));
  if (!optional) assert.ok(node, `actual declaration: ${name}`);
  return node;
}
const sourceOf = (ast, name, optional = false) =>
  declaration(ast, name, optional)?.getText(ast).replace(/^export\s+/, "") ?? "";
const view = declaration(mission, "MissionView");
const nodes = [];
function visit (node) { nodes.push(node); ts.forEachChild(node, visit); }
visit(view);
function unique (predicate, label) {
  const matches = nodes.filter(predicate);
  assert.equal(matches.length, 1, label);
  return matches[0];
}
const local = (name) => unique((node) => ts.isVariableDeclaration(node)
  && node.name.getText(mission) === name, `actual local ${name}`);
const messageBranches = nodes.filter((node) => ts.isJsxExpression(node)
  && node.expression?.getText(mission).startsWith("!selectedPlan ?"));
assert.equal(messageBranches.length, 2, "actual Verification/Evidence branches");
const nowCall = unique((node) => ts.isJsxSelfClosingElement(node)
  && node.tagName.getText(mission) === "NowPanel", "actual NowPanel caller");
const errorCall = unique((node) => ts.isJsxExpression(node)
  && node.expression?.getText(mission).startsWith("missionError &&"), "actual Mission error/Retry");
const effect = unique((node) => ts.isCallExpression(node)
  && node.expression.getText(mission) === "useEffect"
  && node.arguments[0]?.getText(mission).includes('requestOwner("mission")'), "actual Mission effect");
async function load (source) {
  const code = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React,
  } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
}
const apiModule = await load(read("api.ts"));
const forecast = await load(read("forecastDecoder.ts"));
const format = await load(read("format.ts"));
const declarations = [
  ...["cx", "Surface", "SectionHeading", "CONTROL_TONE", "ControlButton", "getBoundedPageWindow",
    "collectionIdentityKey", "useBoundedPage", "CollectionPager"].map((name) => sourceOf(ui, name)),
  ...["planKey", "ACTIVE_STATES", "spotlightPlan", "MISSION_PRESENTATION", "missionPresentation",
    "REQUIREMENT_PRESENTATION", "requirementPresentation"].map((name) => sourceOf(model, name)),
  ...["TONE_CLASS", "StateBadge", "MissionReasonList", "NowPanel", "ErrorNotice", "REFRESH_PARTS"]
    .map((name) => sourceOf(mission, name)),
  // Absence is allowed only to reproduce the old actual render branches, never a mirrored fallback.
  sourceOf(mission, "missionPlanPrompt", true),
].join("\n");
const { makeSubject } = await load(`export function makeSubject(React, apiModule, forecast, format) {
  const { useState, useRef, useCallback, useEffect, forwardRef } = React;
  const { api, createActionDeadline, isAbortError } = apiModule;
  const { decodeForecast } = forecast, { fmtTs, fmtRel } = format;
  const AlertIcon = () => null, MissionIcon = () => null, RefreshIcon = () => null;
  const ChevronLeftIcon = () => null, ChevronRightIcon = () => null;
  ${declarations}
  function select(env) {
    const { mission, entryState } = env, useMemo = (fn) => fn();
    return (${local("selectedPlan").initializer.getText(mission)});
  }
  function renderState(env) {
    const { mission, scope, missionBusy, missionError, refresh, refreshBusy, entryState } = env;
    const selectedPlan = select(env);
    const visibleRequirements = [], requirementRows = [], evidenceRows = [];
    const evidence = { total: 0 }, evidenceBusy = false, evidenceError = "";
    const verificationPager = { start: 0, end: 50 };
    return <>{${errorCall.expression.getText(mission)}}
      <div data-panel="now">${nowCall.getText(mission)}</div>
      <div data-panel="verification">{${messageBranches[0].expression.getText(mission)}}</div>
      <div data-panel="evidence">{${messageBranches[1].expression.getText(mission)}}</div>
    </>;
  }
  function createOwners(env) {
    const { refreshRunRef, refreshSequenceRef, refreshToken, setRefreshBusy, setRefreshToken, onStatus } = env;
    const useCallback = (fn) => fn;
    ${["finishRefreshPart", "cancelRefresh", "refresh", "requestOwner"]
      .map((name) => `const ${local(name).getText(mission)};`).join("\n")}
    return { finishRefreshPart, cancelRefresh, refresh, requestOwner };
  }
  function runMission(env, owners) {
    const { scope, invalidationNonce, refreshToken, setMissionBusy, setMissionError,
      setMission, setForecastState } = env;
    const { requestOwner } = owners;
    return (${effect.arguments[0].getText(mission)})();
  }
  return { renderState, select, createOwners, runMission, ErrorNotice, ControlButton, planKey };
}`);
const subject = makeSubject(React, apiModule, forecast, format);
const elements = (node) => Array.isArray(node) ? node.flatMap(elements)
  : React.isValidElement(node) ? [node, ...elements(node.props.children)] : [];
const initial = (overrides = {}) => ({ mission: null, missionBusy: true, missionError: "",
  scope: undefined, refreshBusy: false, refreshToken: 0, forecastState: null,
  entryState: { planKey: null, evidenceFilter: "attention" }, refresh: () => {}, ...overrides });
const html = (state) => renderToStaticMarkup(subject.renderState(state));
const panels = (state) => elements(subject.renderState(state)).filter((node) => node.props["data-panel"])
  .map((node) => renderToStaticMarkup(node));
const choose = /Select (?:a plan|one exact plan)/;
function allPrompts (state, expected) {
  const renderedPanels = panels(state);
  assert.equal(renderedPanels.length, 3, "all three actual plan-dependent panels are examined");
  for (const rendered of renderedPanels) {
    assert.ok(rendered.includes(expected), expected);
    assert.doesNotMatch(rendered, choose);
    assert.doesNotMatch(rendered, /role="(?:alert|status)"|aria-live=|<button/,
      "snapshot placeholders are plain text without new alerts or recovery actions");
  }
}
const plan = (repo = "Repo_A", state = "implementation") => ({ repo,
  plan_file: "temp/Plan/PLAN_fixture.txt", label: `Work in ${repo}`, state,
  revision: "a".repeat(64), revision_at: "2026-10-06T00:00:00Z", parse_state: "valid",
  task_counts: { total: 4, done: 2, pending: 1, in_progress: 1 },
  current_task: { id: "A.1", title: "Fixture work" },
  repo_status: { status_valid: true, clean: false, count: 2, branch: "develop",
    offline: false, observed_at: "2026-10-06T00:00:00Z" },
  requirements: [], blockers: [], warnings: [], unresolved_count: 0 });
const payload = (plans = [], extra = {}) => ({ scope: { kind: "all", repo: null },
  generated_at: "2026-10-06T00:00:00Z", summary: { total: plans.length,
    states: Object.fromEntries(["not_configured", "planning", "implementation", "verification", "blocked",
      "ready_to_commit", "verified_committed"].map((state) => [state, plans.filter((item) => item.state === state).length])) },
  plans, ...extra });

test("Mission presentation preserves the entire baseline pre-render computation and owners", () => {
  const original = ts.createSourceFile("MissionView.tsx", restoreMissionOwnerRetirement(read("MissionView.tsx")),
    ts.ScriptTarget.Latest, true);
  const statements = [...declaration(original, "MissionView").body.statements];
  assert.ok(ts.isReturnStatement(statements.pop()));
  const printer = ts.createPrinter({ removeComments: true });
  const normalized = canonicalPrintedText(statements.map((node) =>
    printer.printNode(ts.EmitHint.Unspecified, node, original)).join("\n"));
  assert.equal(createHash("sha256").update(normalized).digest("hex"),
    "df16cb940a79eb34b4b81dfbb55186bca2dac5265011b295b9a3e4e56d860f20");
});

test("all three actual plan panels distinguish loading, unavailable and successful emptiness", () => {
  allPrompts(initial(), "Loading Mission snapshot...");
  allPrompts(initial({ missionBusy: false }), "Mission snapshot unavailable. Refresh Mission to retry.");
  allPrompts(initial({ missionBusy: false, missionError: "Mission snapshot failed: fixture" }),
    "Mission snapshot unavailable. Refresh Mission to retry.");
  for (const missionBusy of [false, true]) {
    allPrompts(initial({ mission: payload(), missionBusy }), "No tracked plans in all repositories.");
    for (const repeats of [1, 100]) {
      const scope = 'Repo<&"'.repeat(repeats);
      allPrompts(initial({ mission: payload([], { scope: { kind: "repo", repo: scope } }), missionBusy, scope }),
        `No tracked plans in ${"Repo&lt;&amp;&quot;".repeat(repeats)}.`);
    }
  }
});

test("actual selection retains ambiguous guidance, unique spotlight and exact explicit identity", () => {
  const scopedEmpty = initial({ scope: "Repo_" + "A".repeat(700), mission: payload(), missionBusy: false });
  const scopeParagraphs = elements(subject.renderState(scopedEmpty)).filter((node) => node.type === "p");
  assert.equal(scopeParagraphs.length, 2, "both actual scope-bearing message paragraphs");
  for (const paragraph of scopeParagraphs) {
    assert.match(paragraph.props.className, /\[overflow-wrap:anywhere\]/,
      "long valid repository identity can wrap without changing its text");
  }
  for (const missionBusy of [false, true]) {
    for (const plans of [[plan("A"), plan("B")], [plan("A", "planning")]]) {
      const state = initial({ mission: payload(plans), missionBusy });
      assert.equal(subject.select(state), null);
      for (const rendered of panels(state)) assert.match(rendered, choose);
    }
    const selected = plan("A"), other = plan("B");
    for (const state of [initial({ mission: payload([selected]), missionBusy }),
      initial({ mission: payload([selected, other]), missionBusy,
        entryState: { planKey: subject.planKey(selected.repo, selected.plan_file), evidenceFilter: "attention" } })]) {
      assert.equal(subject.select(state), selected);
      const rendered = html(state);
      assert.doesNotMatch(rendered, /Select (?:a plan|one exact plan)|Loading Mission snapshot|Mission snapshot unavailable/);
      for (const text of ["Work in A", "Implementation", "2 done", "50% of tasks complete",
        "This plan declares no verification requirements.", "Requirement attention", "Evidence ledger"]) {
        assert.ok(rendered.includes(text), text);
      }
    }
  }
});

const flush = async () => { for (let index = 0; index < 12; index += 1) await Promise.resolve(); };
async function withWorld (body) {
  const originals = Object.fromEntries(["window", "fetch"].map((key) =>
    [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const requests = [], timers = new Map(), owned = [];
  let timerId = 0;
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    setTimeout(fn, ms) { const id = timerId++; timers.set(id, { fn, ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
  } });
  Object.defineProperty(globalThis, "fetch", { configurable: true, value: (url, { signal }) =>
    new Promise((resolve, reject) => {
      const abort = () => reject(new DOMException("Aborted", "AbortError"));
      signal.addEventListener("abort", abort, { once: true });
      requests.push({ url, signal,
        success(data) { signal.removeEventListener("abort", abort);
          resolve({ ok: true, json: async () => ({ success: true, data }) }); },
        fail(http = false) { signal.removeEventListener("abort", abort);
          if (http) resolve({ ok: false, status: 503,
            json: async () => ({ success: false, message: "Synthetic unavailable" }) });
          else reject(new TypeError("Failed to fetch")); },
      });
    }) });
  try {
    await body({ requests, timers, harness(options = {}) {
      const state = initial({ scope: "Repo_A", ...options }), writes = [], accepted = [], statuses = [];
      const refreshRunRef = { current: null }, refreshSequenceRef = { current: 0 };
      let cleanup = () => {};
      const setters = Object.fromEntries(["mission", "missionBusy", "missionError", "forecastState",
        "refreshToken", "refreshBusy"].map((name) => [`set${name[0].toUpperCase()}${name.slice(1)}`, (value) => {
        state[name] = typeof value === "function" ? value(state[name]) : value;
        writes.push(name);
        if (name === "mission" && value !== null) accepted.push({ ...state });
      }]));
      const env = () => ({ ...state, ...setters, invalidationNonce: 1,
        refreshRunRef, refreshSequenceRef, onStatus: (message) => statuses.push(message) });
      const owners = () => subject.createOwners(env());
      state.refresh = () => owners().refresh();
      const h = { state, writes, accepted, statuses, refreshRunRef,
        start() { cleanup(); cleanup = subject.runMission(env(), owners()); return cleanup; },
        // The other three effects are NOT executed. Complete only their real owner slots as fixtures.
        completeOtherParts() { for (const part of ["sessions", "timeline", "evidence"]) owners().requestOwner(part).finish(); },
        dispose() { owners().cancelRefresh(); cleanup(); },
      };
      owned.push(h); return h;
    } });
  } finally {
    for (const h of owned) h.dispose();
    await flush();
    for (const [key, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  }
}

test("actual Mission fetch and refresh clear old snapshots, then accept data before finally", async () => withWorld(async (world) => {
  const h = world.harness({ scope: 'Repo<&"' });
  h.start();
  assert.equal(world.requests.length, 1);
  assert.equal(new URL(world.requests[0].url, "http://fixture.invalid").searchParams.get("repo"), 'Repo<&"');
  allPrompts(h.state, "Loading Mission snapshot...");
  const first = payload([], { scope: { kind: "repo", repo: h.state.scope } });
  world.requests[0].success(first); await flush();
  assert.equal(h.state.mission, first);
  assert.equal(h.state.forecastState.result.tag, "old-server");
  assert.equal(h.accepted[0].missionBusy, true);
  allPrompts(h.accepted[0], "No tracked plans in Repo&lt;&amp;&quot;.");
  assert.equal(h.state.missionBusy, false);
  h.state.refresh(); h.start(); h.completeOtherParts();
  assert.equal(h.state.mission, null);
  allPrompts(h.state, "Loading Mission snapshot...");
  world.requests[1].success(payload([plan(h.state.scope)], { scope: first.scope })); await flush();
  assert.equal(h.accepted.at(-1).missionBusy, true);
  assert.equal(subject.select(h.accepted.at(-1)), h.state.mission.plans[0]);
  assert.doesNotMatch(html(h.accepted.at(-1)), /Loading Mission snapshot|Mission snapshot unavailable/);
  assert.equal(h.state.refreshBusy, false);
  assert.equal(world.timers.size, 0);
  assert.equal(subject.select(h.state), h.state.mission.plans[0]);
  assert.equal(h.statuses.at(-1), "Mission data refreshed.");
}));

for (const failure of ["transport", "http", "timeout"]) {
  test(`actual ${failure} failure keeps one ErrorNotice/Retry and recovers to an empty snapshot`, async () => withWorld(async (world) => {
    const h = world.harness();
    if (failure === "timeout") h.state.refresh();
    h.start();
    if (failure === "timeout") {
      h.completeOtherParts();
      const [id, timer] = [...world.timers][0];
      assert.equal(timer.ms, 10000); world.timers.delete(id); timer.fn();
    } else world.requests[0].fail(failure === "http");
    await flush();
    assert.equal(h.state.mission, null);
    assert.equal(h.state.missionBusy, false);
    assert.match(h.state.missionError, failure === "timeout" ? /^Mission snapshot timed out after 10 seconds\.$/
      : failure === "http" ? /Synthetic unavailable/ : /Failed to fetch/);
    allPrompts(h.state, "Mission snapshot unavailable. Refresh Mission to retry.");
    const notices = elements(subject.renderState(h.state)).filter((node) => node.type === subject.ErrorNotice);
    assert.equal(notices.length, 1);
    assert.equal(notices[0].props.onRetry, h.state.refresh);
    const button = elements(subject.ErrorNotice(notices[0].props)).find((node) => node.type === subject.ControlButton);
    subject.ControlButton.render(button.props, null).props.onClick();
    h.start(); h.completeOtherParts();
    assert.equal(world.requests.length, 2);
    assert.equal(h.state.missionError, "");
    assert.equal(h.state.refreshBusy, true);
    allPrompts(h.state, "Loading Mission snapshot...");
    world.requests[1].success(payload([], { scope: { kind: "repo", repo: h.state.scope } })); await flush();
    allPrompts(h.state, "No tracked plans in Repo_A.");
    assert.equal(h.state.refreshBusy, false);
    assert.equal(world.timers.size, 0);
    assert.equal(h.statuses.at(-1), "Mission data refreshed.");
  }));
}

test("actual cleanup silently cancels pending and already-fulfilled late replies", async () => withWorld(async (world) => {
  for (const fulfilled of [false, true]) {
    const h = world.harness(), cleanup = h.start(), request = world.requests.at(-1);
    if (fulfilled) request.success(payload([plan()], { scope: { kind: "repo", repo: h.state.scope } }));
    cleanup(); const before = h.writes.length; await flush();
    assert.equal(request.signal.aborted, true);
    assert.equal(h.writes.length, before);
    assert.equal(h.state.mission, null);
    assert.equal(h.state.missionError, "");
    assert.equal(h.accepted.length, 0);
  }
}));

test("malformed additive forecast does not discard valid base plans or create false prompts", async () => withWorld(async (world) => {
  const h = world.harness();
  h.state.refresh(); h.start(); h.completeOtherParts();
  const accepted = payload([plan()], { scope: { kind: "repo", repo: h.state.scope }, forecast_scope: null, forecast: [] });
  world.requests[0].success(accepted); await flush();
  assert.equal(h.state.forecastState.result.tag, "unavailable");
  assert.equal(h.state.mission, accepted);
  assert.equal(h.state.missionError, "");
  assert.equal(subject.select(h.state), accepted.plans[0]);
  assert.doesNotMatch(html(h.state), /Select (?:a plan|one exact plan)|Mission snapshot unavailable/);
  assert.equal(h.statuses.at(-1), "Mission refresh finished with errors. Retry is available.");
}));
