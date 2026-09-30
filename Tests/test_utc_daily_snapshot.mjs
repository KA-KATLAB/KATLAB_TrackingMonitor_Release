import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const frontendRequire = createRequire(resolve(root, "Frontend/package.json"));
const ts = frontendRequire("typescript");
const React = frontendRequire("react");
const NativeDate = Date;
const source = (name) => readFileSync(resolve(root, "Frontend/src", name), "utf8");
const parse = (name) => ts.createSourceFile(name, source(name), ts.ScriptTarget.Latest, true);
const importText = (text) => {
  const code = ts.transpileModule(text, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React,
  } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
};
// The absent-module branch permits the pre-patch KPI/timer negative oracle only.
const calendarDay = existsSync(resolve(root, "Frontend/src/calendarDay.ts"))
  ? await importText(source("calendarDay.ts")) : {};
const format = await importText(source("format.ts"));
const navigation = await importText(source("navigation.ts"));
const app = parse("App.tsx");
const overview = parse("OverviewView.tsx");
function declaration (ast, name) {
  const node = ast.statements.find((item) => ts.isFunctionDeclaration(item) && item.name?.text === name);
  assert.ok(node, `actual declaration exists: ${name}`);
  return node.getText(ast).replace(/^export\s+/, "");
}
function effects (ast) {
  const found = [];
  function visit (node) {
    if (ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)
      && node.expression.expression.getText(ast) === "useEffect") found.push(node.getText(ast));
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return found;
}
const minuteEffect = effects(app).find((text) => text.includes("setInterval") && text.includes("setTick"));
assert.ok(minuteEffect, "actual existing App minute effect exists");
const scopedEffect = effects(app).find((text) => text.includes("api.stats(scopeApiId(scope))"));
assert.ok(scopedEffect, "actual scoped statistics effect exists");
const goalAst = parse("goalRings.tsx");
const goalSource = goalAst.statements.filter((node) => !ts.isImportDeclaration(node))
  .map((node) => node.getText(goalAst).replace(/^export\s+/, "")).join("\n");
const { createSubject } = await importText(`
export function createSubject(hooks, env, React, format, calendarDay) {
  const { useState, useRef, useEffect, useId } = hooks;
  const { fmtMinutes } = format;
  const { utcDayKey, calendarDayLabel } = calendarDay;
  const usePrefersReducedMotion = () => env.reduced;
  const readPreference = () => env.goals;
  const writePreference = (key, value) => { env.saved.push({key, value}); return true; };
  const useDisclosureBehavior = () => {};
  // Unrelated layout/paging leaves only; changed components and effects are actual source.
  const IconButton = "button", SettingsIcon = "icon", SectionHeading = "heading";
  const Surface = "surface", Kpi = "kpi", DialogShell = "dialog", Pet = "pet", Skyline = "skyline";
  const CollectionPager = "pager", useBoundedPage = () => ({start: 0, end: 50});
  const MODE_BADGE = {}, MODE_COLOR = {};
  ${goalSource}
  ${declaration(overview, "KpiRow")}
  ${declaration(parse("calendarHeatmap.tsx"), "streakOf")}
  ${declaration(parse("focusMode.tsx"), "FocusMode")}
  function MinuteTick() {
    const setTick = fn => { env.ticks = fn(env.ticks); };
    const setStatsNonce = fn => { env.refreshes = fn(env.refreshes); };
    const setInterval = env.setInterval, clearInterval = env.clearTimer;
    const sync = () => { throw new Error("Minute tick must not call sync"); };
    ${minuteEffect}
    return null;
  }
  function ScopedStats({membershipReady, currentScopeKey, scope, statsNonce}) {
    const api = env.api, scopeApiId = env.scopeApiId;
    const setStatsState = next => { env.statsState = typeof next === "function" ? next(env.statsState) : next; };
    const setCityRefreshIdentity = next => { env.cityIdentity = next(env.cityIdentity); };
    ${scopedEffect}
    return null;
  }
  return { KpiRow, GoalRings, FocusMode, MinuteTick, ScopedStats };
}`);

const nodes = (node) => Array.isArray(node) ? node.flatMap(nodes)
  : React.isValidElement(node) ? [node, ...nodes(Object.values(node.props))] : [];
const textOf = (node) => Array.isArray(node) ? node.map(textOf).join("")
  : React.isValidElement(node) ? textOf(node.props.children)
    : typeof node === "string" || typeof node === "number" ? String(node) : "";
const sameDeps = (a, b) => Array.isArray(a) && Array.isArray(b)
  && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
const day = (date, events = 0, minutes = 0, commits = 0) =>
  Object.freeze({ day: date, events, minutes, commits });
const stats = (calendar) => ({ activity_calendar: Object.freeze(calendar), mode_counts: { B: 3 }, events_per_task: [] });

function withWorld (env, run) {
  const saved = new Map(["Date", "window", "document", "clearTimeout"].map((key) =>
    [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  try {
    Object.defineProperty(globalThis, "Date", { configurable: true, writable: true,
      value: class extends NativeDate {
        constructor (...args) { super(...(args.length ? args : [env.now])); }
        static now () { return new NativeDate(env.now).getTime(); }
      } });
    Object.defineProperty(globalThis, "window", { configurable: true, value: {
      setTimeout: env.setTimeout, clearTimeout: env.clearTimer,
      setInterval: env.setInterval, clearInterval: env.clearTimer,
    } });
    Object.defineProperty(globalThis, "document", { configurable: true, value: { hidden: env.hidden } });
    Object.defineProperty(globalThis, "clearTimeout", { configurable: true, value: env.clearTimer });
    return run();
  } finally {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

// Deterministic state/ref/effect lifecycle, not React DOM or native timer evidence.
function mount (name, initialProps = {}, options = {}) {
  const env = { now: "2026-09-30T12:00:00Z", reduced: false, hidden: false,
    goals: null, saved: [], timers: new Map(), ticks: 0, refreshes: 0, ...options };
  let timerId = 0, cursor = 0, dirty = false, pending = [], tree, props = initialProps;
  const slots = [];
  const schedule = (kind) => (callback, delay) => {
    const id = timerId++;
    env.timers.set(id, { kind, callback, delay });
    return id;
  };
  env.setTimeout = schedule("timeout"); env.setInterval = schedule("interval");
  env.clearTimer = (id) => env.timers.delete(id);
  const slot = (kind, initialize) => {
    const index = cursor++;
    slots[index] ??= { kind, ...initialize() };
    assert.equal(slots[index].kind, kind, `stable hook slot ${index}`);
    return slots[index];
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
    useId() { return slot("id", () => ({ value: `fixture-${cursor}` })).value; },
    useEffect(callback, deps) {
      const current = slot("effect", () => ({}));
      if (!sameDeps(current.deps, deps)) {
        current.deps = deps;
        pending.push(() => { current.cleanup?.(); current.cleanup = callback(); });
      }
    },
  };
  const subject = createSubject(hooks, env, React, format, calendarDay);
  const render = () => withWorld(env, () => {
    for (let pass = 0; pass < 12; pass += 1) {
      cursor = 0; dirty = false; pending = [];
      tree = subject[name](props);
      pending.forEach((effect) => effect());
      if (!dirty) return;
    }
    assert.fail("controlled component did not settle");
  });
  render();
  return {
    env, render, nodes: () => nodes(tree), text: () => textOf(tree),
    update(next, now = env.now) { props = { ...props, ...next }; env.now = now; render(); },
    act(callback) { withWorld(env, callback); render(); },
    fire(kind, now = env.now) {
      env.now = now;
      withWorld(env, () => {
        for (const [id, timer] of [...env.timers]) {
          if (timer.kind !== kind) continue;
          if (kind === "timeout") env.timers.delete(id);
          timer.callback();
        }
      });
      render();
    },
    replay() {
      withWorld(env, () => slots.filter((entry) => entry.kind === "effect").forEach((entry) => {
        entry.cleanup?.(); entry.cleanup = undefined; entry.deps = undefined;
      }));
      render();
    },
    unmount() { withWorld(env, () => slots.forEach((entry) => entry.cleanup?.())); },
  };
}

test("UTC day helpers distinguish dates, local offsets and unavailable without mutating input", () => {
  for (const [iso, expected] of [
    ["2026-10-01T00:30:00+07:00", "2026-09-30"],
    ["2026-09-30T23:30:00-04:00", "2026-10-01"],
    ["2028-02-29T23:59:59Z", "2028-02-29"],
    ["2027-01-01T00:00:00Z", "2027-01-01"],
    ["0042-05-02T12:00:00Z", "0042-05-02"],
  ]) {
    const date = new Date(iso), before = date.getTime();
    assert.equal(calendarDay.utcDayKey(date), expected);
    assert.equal(calendarDay.calendarDayLabel(expected, date), "today (UTC)");
    assert.equal(calendarDay.calendarDayLabel("2020-01-01", date), "2020-01-01 (UTC)");
    assert.equal(calendarDay.calendarDayLabel("2099-01-01", date), "2099-01-01 (UTC)");
    assert.equal(calendarDay.calendarDayLabel(undefined, date), "unavailable (UTC)");
    assert.equal(date.getTime(), before);
  }
  withWorld({ now: "2026-10-01T00:00:00Z" }, () => {
    assert.equal(calendarDay.utcDayKey(), "2026-10-01");
    assert.equal(calendarDay.calendarDayLabel("2026-10-01"), "today (UTC)");
  });
});

test("actual minute effect refreshes once per observed UTC transition and cleans up", () => {
  const h = mount("MinuteTick", {}, { now: "2026-09-30T23:59:00Z" });
  assert.deepEqual([...h.env.timers.keys()], [0]);
  assert.equal(h.env.timers.get(0).delay, 60_000);
  assert.equal(h.env.refreshes, 0, "no extra mount request");
  h.fire("interval", "2026-09-30T23:59:30Z");
  assert.equal(h.env.refreshes, 0);
  h.fire("interval", "2026-10-01T00:00:00Z");
  assert.equal(h.env.refreshes, 1);
  h.fire("interval", "2026-10-01T09:00:00Z");
  assert.equal(h.env.refreshes, 1);
  h.fire("interval", "2026-10-04T12:00:00Z");
  assert.equal(h.env.refreshes, 2, "resume does not poll once for each missed day");
  h.fire("interval", "2026-10-03T12:00:00Z");
  assert.equal(h.env.refreshes, 3, "backward day change is one observed transition");
  assert.equal(h.env.ticks, 5);
  h.replay();
  assert.equal(h.env.timers.size, 1, "effect replay retains only one interval");
  h.fire("interval");
  assert.equal(h.env.refreshes, 3);
  h.unmount();
  assert.equal(h.env.timers.size, 0);
  const local = mount("MinuteTick", {}, { now: "2026-09-30T23:59:00+07:00" });
  local.fire("interval", "2026-10-01T00:01:00+07:00");
  assert.equal(local.env.refreshes, 0, "local midnight is not UTC midnight");
  local.unmount();
});

test("actual scoped stats effect retains failed snapshots and ignores obsolete scope or unmount results", async () => {
  const requests = [];
  const api = { stats(repo) {
    return new Promise((resolve, reject) => { requests.push({ repo, resolve, reject }); });
  } };
  const scopeA = { kind: "repo", id: "Repo_A" }, scopeB = { kind: "repo", id: "Repo_B" };
  const h = mount("ScopedStats", { scope: scopeA, currentScopeKey: navigation.scopeKey(scopeA),
    membershipReady: false, statsNonce: 0 }, {
    api, scopeApiId: navigation.scopeApiId, cityIdentity: 0,
    statsState: { key: "", data: null, error: "", settled: false },
  });
  assert.equal(requests.length, 0);
  h.update({ membershipReady: true });
  assert.equal(requests[0].repo, "Repo_A");
  const oldSnapshot = stats([day("2026-09-30", 6, 120)]);
  requests[0].resolve(oldSnapshot);
  await Promise.resolve();
  assert.equal(h.env.statsState.data, oldSnapshot);
  assert.equal(h.env.cityIdentity, 1);
  h.update({ statsNonce: 1 });
  requests[1].reject(new Error("offline"));
  await Promise.resolve();
  assert.equal(h.env.statsState.data, oldSnapshot, "failed rollover keeps its dated snapshot");
  assert.equal(h.env.statsState.error, "Error: offline");
  assert.equal(h.env.cityIdentity, 1);
  h.update({ statsNonce: 2 });
  h.update({ scope: scopeB, currentScopeKey: navigation.scopeKey(scopeB) });
  assert.equal(requests[3].repo, "Repo_B");
  requests[3].reject(new Error("B unavailable"));
  await Promise.resolve();
  assert.deepEqual(h.env.statsState, { key: navigation.scopeKey(scopeB), data: null,
    error: "Error: B unavailable", settled: true });
  requests[2].resolve(stats([day("2026-10-01", 3, 20)]));
  await Promise.resolve();
  assert.equal(h.env.statsState.data, null, "obsolete A success cannot populate B");
  h.update({ statsNonce: 3 });
  const current = stats([day("2026-10-01")]);
  requests[4].resolve(current);
  await Promise.resolve();
  assert.equal(h.env.statsState.data, current);
  assert.equal(h.env.statsState.error, "");
  assert.equal(h.env.cityIdentity, 2);
  h.update({ statsNonce: 4 });
  const accepted = h.env.statsState;
  h.unmount();
  requests[5].reject(new Error("late unmounted failure"));
  await Promise.resolve();
  assert.equal(h.env.statsState, accepted);
});

test("actual daily KPI retains dated values and separates missing data and new-day identity", () => {
  const calendar = [day("2026-09-30", 6, 120, 1)];
  const h = mount("KpiRow", { stats: stats(calendar), repos: [], uncommitted: [] });
  const effort = () => h.nodes().find((node) => node.type === "kpi" && node.props.label.startsWith("time "));
  assert.equal(effort().props.label, "time today (UTC)");
  assert.equal(effort().props.value, 120);
  const oldKey = effort().key;
  h.update({}, "2026-10-01T00:01:00Z");
  assert.equal(effort().props.label, "time 2026-09-30 (UTC)");
  assert.equal(effort().props.format(effort().props.value), "≈ 2h 0m");
  assert.equal(effort().key, oldKey, "same dated snapshot retains its identity");
  h.update({ stats: stats([day("2026-10-01")]) });
  assert.equal(effort().props.label, "time today (UTC)");
  assert.equal(effort().props.value, 0);
  assert.notEqual(effort().key, oldKey, "new day cannot reuse the old count-up state");
  h.update({ stats: stats([]) });
  assert.equal(effort().props.label, "time unavailable (UTC)");
  assert.equal(effort().props.format(effort().props.value), "Unavailable");
  assert.deepEqual(calendar, [day("2026-09-30", 6, 120, 1)]);
});

test("actual Focus distinguishes absent, quiet current and dated snapshot effort with its clock", () => {
  const h = mount("FocusMode", { scope: undefined, repos: [], events: [], stats: null,
    mood: "idle", wardrobe: {}, onClose() {} });
  assert.match(h.text(), /Effort unavailable \(UTC\)/);
  assert.doesNotMatch(h.text(), /quiet so far today/);
  h.update({ stats: stats([day("2026-09-30")]) });
  assert.match(h.text(), /quiet so far today \(UTC\)/);
  h.fire("interval", "2026-10-01T00:01:00Z");
  assert.match(h.text(), /no effort recorded for 2026-09-30 \(UTC\)/);
  assert.doesNotMatch(h.text(), /quiet so far today/);
  h.update({ stats: stats([day("2026-09-29", 1), day("2026-09-30", 2, 120)]) });
  assert.match(h.text(), /≈ 2h 0m.*2026-09-30 \(UTC\).*2-day streak/);
  h.update({ stats: stats([]) });
  assert.match(h.text(), /Effort unavailable \(UTC\)/);
  h.unmount();
  assert.equal(h.env.timers.size, 0);
});

test("actual ring labels and geometry distinguish unavailable, true zero and compact stale data", () => {
  const h = mount("GoalRings", { calendar: [], scope: "Repo_A" },
    { goals: JSON.stringify({ events: 41, minutes: 77, commits: 5 }) });
  assert.equal(h.nodes().filter((node) => node.type === "circle").length, 3);
  assert.match(h.text(), /capturesUnavailable \/ 41/);
  assert.match(h.text(), /effortUnavailable \/ ≈ 1h 17m/);
  assert.doesNotMatch(h.text(), /\(0%\)/);
  assert.match(h.nodes().find((node) => node.type === "ul").props["aria-label"], /unavailable \(UTC\)/);
  h.update({ calendar: [day("2026-09-30")] });
  assert.equal(h.nodes().filter((node) => node.type === "circle").length, 6);
  assert.match(h.text(), /captures0 \/ 41 \(0%\)/);
  assert.equal(h.nodes().find((node) => node.type === "heading").props.title, "Today's rings");
  h.update({ compact: true }, "2026-10-01T12:00:00Z");
  const list = h.nodes().find((node) => node.type === "ul");
  assert.equal(list.props.className, "sr-only");
  assert.equal(list.props["aria-label"], "Daily goals for Repo_A · 2026-09-30 (UTC)");
  assert.equal(h.env.timers.size, 0);
});

test("actual rings seed across stale, missing and new dates including equal metrics", () => {
  const h = mount("GoalRings", { calendar: [day("2026-09-30", 20)], scope: undefined });
  h.update({ calendar: [day("2026-09-30", 30)] });
  assert.equal(h.env.timers.size, 1, "same current-day target crossing celebrates");
  assert.equal(h.nodes().filter((node) => node.props.className === "burst-p").length, 8);
  h.update({}, "2026-10-01T00:00:00Z");
  assert.equal(h.env.timers.size, 0, "stale-day transition clears pending celebration");
  assert.equal(h.nodes().filter((node) => node.props.className === "burst-p").length, 0);
  h.update({ calendar: [day("2026-09-30", 100)] });
  assert.equal(h.env.timers.size, 0, "late stale-day update is not current progress");
  h.update({ calendar: [day("2026-10-01", 29)] });
  assert.equal(h.env.timers.size, 0);
  h.update({ calendar: [day("2026-10-01", 30)] });
  assert.equal(h.env.timers.size, 1);
  h.update({ calendar: [day("2026-10-02", 30)] }, "2026-10-02T00:00:00Z");
  assert.equal(h.env.timers.size, 0, "changed date with equal metrics still reseeds and clears");
  h.update({ calendar: [] });
  h.update({ calendar: [day("2026-10-02", 100)] });
  assert.equal(h.env.timers.size, 0, "recovery's first row is only a baseline");
  h.update({ calendar: [day("2026-10-03", 20)] });
  h.update({ calendar: [day("2026-10-03", 30)] });
  assert.equal(h.env.timers.size, 0, "future-dated server row is not today's crossing");
  h.update({}, "2026-10-03T00:00:00Z");
  assert.equal(h.env.timers.size, 0, "becoming current seeds rather than celebrates");
});

test("actual ring editor survives rollover; edits, hidden state and reduced motion do not false-fire", () => {
  const h = mount("GoalRings", { calendar: [day("2026-09-30", 29)], scope: undefined });
  h.act(() => h.nodes().find((node) => node.props.label === "Edit daily goals").props.onClick());
  const inputs = () => h.nodes().filter((node) => node.type === "input");
  h.act(() => inputs()[0].props.onChange({ target: { value: "20" } }));
  h.update({ calendar: [day("2026-10-01", 29)] }, "2026-10-01T00:00:00Z");
  assert.equal(inputs()[0].props.value, "20", "day transition preserves editor draft");
  h.act(() => h.nodes().find((node) => node.type === "form").props.onSubmit({ preventDefault() {} }));
  assert.deepEqual(JSON.parse(h.env.saved[0].value), { events: 20, minutes: 120, commits: 2 });
  assert.equal(h.env.timers.size, 0, "goal edit is not a crossing");
  h.update({ calendar: [day("2026-10-01", 30)] });
  assert.equal(h.env.timers.size, 0, "previous value already exceeded the lowered goal");
  h.env.hidden = true;
  h.update({ calendar: [day("2026-10-01", 30, 120)] });
  assert.equal(h.env.timers.size, 0);
  h.env.hidden = false; h.env.reduced = true;
  h.update({ calendar: [day("2026-10-01", 30, 120, 2)] });
  assert.equal(h.env.timers.size, 0);
  h.env.reduced = false;
  h.update({ calendar: [day("2026-10-02", 0)] }, "2026-10-02T00:00:00Z");
  h.update({ calendar: [day("2026-10-02", 20)] });
  assert.equal(h.env.timers.size, 1);
  h.fire("timeout");
  assert.equal(h.env.timers.size, 0);
  assert.equal(h.nodes().filter((node) => node.props.className === "burst-p").length, 0);
  h.update({ calendar: [day("2026-10-02", 20, 120)] });
  assert.equal(h.env.timers.size, 1);
  h.unmount();
  assert.equal(h.env.timers.size, 0);
});

test("actual App stats ownership and wardrobe throttle remain separate from the minute tick", () => {
  const scoped = effects(app).find((text) => text.includes("api.stats(scopeApiId(scope))"));
  const wardrobe = effects(app).find((text) => text.includes("lastStarted = -Infinity"));
  assert.ok(scoped && wardrobe);
  assert.match(scoped, /if \(!membershipReady\) return/);
  assert.match(scoped, /if \(!alive\) return/g);
  assert.match(scoped, /previous\.key === key/);
  assert.match(scoped, /return \(\) => \{ alive = false; \}/);
  assert.match(scoped, /\[currentScopeKey, membershipReady, scope, statsNonce\]/);
  assert.match(wardrobe, /60_000 - \(Date\.now\(\) - lastStarted\)/);
  assert.match(wardrobe, /live && generation === currentGeneration/);
  assert.match(wardrobe, /setAllCal\(result\.activity_calendar\)/);
  assert.doesNotMatch(minuteEffect, /\bsync\(/);
  assert.equal((minuteEffect.match(/setInterval\(/g) ?? []).length, 1);
});
