import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const frontend = resolve(root, "Frontend");
const require = createRequire(resolve(frontend, "package.json"));
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const ts = require("typescript");
const read = name => readFileSync(resolve(frontend, "src", name), "utf8");
const repo = (id, extra = {}) => ({ id, path: "safe-fixture", offline: false,
  status_valid: true, clean: true, count: 0, last_event_ts: null, ...extra });

test("actual Pet distinguishes incomplete Git coverage from committed or offline success", async () => {
  const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
  const vite = await createServer({ root: frontend,
    server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom",
    optimizeDeps: { noDiscovery: true, entries: [] } });
  try {
    const { moodOf, Pet } = await vite.ssrLoadModule("/src/pet.tsx");
    const { EFFORT_GAP_MAX_MIN, UNCOMMITTED_AGE_H } = await vite.ssrLoadModule("/src/theme.ts");
    const now = Date.parse("2026-10-01T12:00:00Z");
    const fixtures = [[repo("invalid", {status_valid:false})], [],
      [repo("missing", {status_valid:undefined})],
      [repo("invalid-dirty", {status_valid:false,clean:false,count:97,
        oldest_uncommitted_ts:"2020-01-01T00:00:00Z"})],
      [repo("known"), repo("invalid", {status_valid:false})],
      [repo("known"), repo("offline", {offline:true})],
    ];
    const render = mood => renderToStaticMarkup(React.createElement(Pet, {mood}));
    for (const fixture of fixtures) {
      const before = JSON.stringify(fixture);
      const mood = moodOf(fixture, 0, 0, now);
      const html = render(mood);
      assert.equal(mood, "uncertain", html);
      assert.match(html, /Git status is incomplete or unavailable/);
      assert.doesNotMatch(html, /everything committed|every repo is offline|fresh uncommitted/);
      assert.equal(JSON.stringify(fixture), before, "input snapshots remain unchanged");
      assert.equal(moodOf(fixture, 5, now, now), "excited", "live captures retain precedence");
      assert.equal(moodOf(fixture, 5, now - EFFORT_GAP_MAX_MIN * 60_000 - 1, now),
        "uncertain", "expired capture combos cannot mask unknown coverage");
    }
    assert.equal(moodOf([repo("off", {offline:true}), repo("off2", {offline:true,status_valid:false})],
      0, 0, now), "sleeping");
    assert.equal(moodOf([repo("clean")], 0, 0, now), "content");
    const dirty = repo("dirty", {clean:false,count:1,oldest_uncommitted_ts:new Date(now).toISOString()});
    assert.equal(moodOf([dirty], 0, 0, now), "curious");
    assert.equal(moodOf([{...dirty,oldest_uncommitted_ts:new Date(now - UNCOMMITTED_AGE_H * 3_600_000 - 1).toISOString()}],
      0, 0, now), "anxious");
    assert.equal(moodOf([repo("off", {offline:true})], 5, now, now), "excited");
    const svg = html => html.match(/<svg[\s\S]*<\/svg>/)?.[0];
    assert.ok(svg(render("curious")));
    assert.equal(svg(render("uncertain")), svg(render("curious")),
      "uncertainty reuses the existing curious face, motion and geometry");
    const clothed = renderToStaticMarkup(React.createElement(Pet, {mood:"uncertain",big:true,
      wardrobe:{collar:true,bandana:false,crown:false,scarf:false,star:false}}));
    assert.match(clothed, /Git status is incomplete or unavailable/);
    assert.match(clothed, /collar ✓/);
    assert.match(clothed, /next: bandana at a 21-day streak/);
    assert.match(clothed, /h-24 w-28/);
  } finally { await vite.close(); }
});

test("actual Focus and City never present retained Git status as current clean or counts", async () => {
  const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
  const vite = await createServer({ root: frontend,
    server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom",
    optimizeDeps: { noDiscovery: true, entries: [] } });
  try {
    const { CityScene } = await vite.ssrLoadModule("/src/city.tsx");
    const theme = await vite.ssrLoadModule("/src/theme.ts");
    const focusAst = ts.createSourceFile("focusMode.tsx", read("focusMode.tsx"), ts.ScriptTarget.Latest, true);
    const focus = focusAst.statements.find(node => ts.isFunctionDeclaration(node) && node.name.text === "FocusMode");
    const code = ts.transpileModule(`export function createFocus(React, theme) {
      const {useState, useEffect} = React;
      const {MODE_BADGE, MODE_COLOR} = theme;
      const DialogShell = ({children}) => React.createElement("section", null, children);
      const Pet = () => null, GoalRings = () => null, Skyline = () => null;
      const useBoundedPage = () => ({ start: 0, end: 50 });
      const CollectionPager = () => null, calendarDayLabel = () => "Today (UTC)";
      const streakOf = () => 0;
      ${focus.getText(focusAst).replace(/^export\s+/, "")}
      return FocusMode;
    }`, {compilerOptions:{ target:ts.ScriptTarget.ES2022, module:ts.ModuleKind.ESNext, jsx:ts.JsxEmit.React }}).outputText;
    const { createFocus } = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
    const FocusMode = createFocus(React, theme);
    const renderFocus = (repos, scope) => renderToStaticMarkup(React.createElement(FocusMode,
      { scope, repos, events: [], stats: null, mood: "sleeping", wardrobe: {}, onClose() {} }));
    for (const fixture of [repo("A", {status_valid: false, count: 987, clean: true}),
      repo("A", {offline: true, count: 987, clean: true})]) {
      const html = renderFocus([fixture], "A");
      assert.doesNotMatch(html, /987|CLEAN|0 uncommitted/);
      assert.match(html, /offline|unavailable/);
      const city = renderToStaticMarkup(React.createElement(CityScene, {
        districts: [{ repo: fixture, churn: [], inProgress: [] }], churnMax: 0,
        mood: "sleeping", nowMs: Date.now(), localHour: 12, rangeLabel: "1 of 1",
      }));
      assert.doesNotMatch(city, /987|CLEAN/);
      assert.match(city, /OFFLINE|Status unavailable/);
    }
    const mixed = renderFocus([repo("A"), repo("B", {status_valid:false}), repo("C", {clean:false,count:12})]);
    assert.match(mixed, /1\/2 clean/);
    assert.match(mixed, /2 of 3 repositories have current Git status/);
    assert.match(mixed, /12 uncommitted/);
    assert.match(renderFocus([], "gone"), /Selected repository is no longer available/);
    assert.match(renderFocus([]), /Git status unavailable/);
    assert.match(renderFocus([repo("A")], "A"), /CLEAN/);
    const longId = "Very_long_repository_".repeat(12);
    const longScene = renderToStaticMarkup(React.createElement(CityScene, {
      districts: [{ repo: repo(longId), churn: [], inProgress: [] }], churnMax: 0,
      mood: "sleeping", nowMs: Date.now(), localHour: 12, rangeLabel: "1 of 1", onGoRepo() {},
    }));
    assert.ok(longScene.includes(`aria-label="Open Overview for repository ${longId}"`));
    assert.ok(longScene.includes(`<title>${longId} · safe-fixture</title>`));
    assert.ok(longScene.includes(`${longId.slice(0, 17)}…</text>`));
    assert.ok(!longScene.includes(`${longId}</text>`));
  } finally { await vite.close(); }
});

test("actual City rewards require consecutive current Git status and clear unavailable baselines", async () => {
  const source = read("city.tsx");
  const ast = ts.createSourceFile("city.tsx", source, ts.ScriptTarget.Latest, true);
  const view = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "CityView");
  const weather = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "weatherOf");
  let currentStatus, weatherEffect, countEffect;
  const renderFilters = {};
  const visit = node => {
    if (ts.isVariableStatement(node)
      && node.declarationList.declarations.some(item => item.name.getText(ast) === "currentStatusRepoIds")) {
      currentStatus = node.getText(ast);
    }
    if (ts.isCallExpression(node) && node.expression.getText(ast) === "useEffect") {
      const callback = node.arguments[0].getText(ast);
      if (callback.includes("prevWeatherRef.current")) weatherEffect = callback;
      if (callback.includes("prevCountsRef.current")) countEffect = callback;
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === "filter"
      && ["bursts", "rainbows"].includes(node.expression.expression.getText(ast))) {
      renderFilters[node.expression.expression.getText(ast)] = node.arguments[0].getText(ast);
    }
    ts.forEachChild(node, visit);
  };
  visit(view);
  assert.ok(currentStatus && weatherEffect && countEffect && renderFilters.bursts && renderFilters.rainbows,
    "extract the actual ownership, transition effects and render-time filters");
  const threshold = read("theme.ts").match(/export const UNCOMMITTED_AGE_H\s*=\s*\d+;/)?.[0];
  const lead = source.match(/const WX_FORECAST_LEAD_H\s*=\s*\d+;/)?.[0];
  assert.ok(threshold && lead);
  const code = ts.transpileModule(`
    ${threshold}
    ${lead}
    ${weather.getText(ast)}
    export function createRewards() {
      const prevWeatherRef={current:null}, prevCountsRef={current:null};
      const reducedMotionRef={current:false}, pageKeyRef={current:"page-one"};
      const rainbowN={current:0}, nonceRef={current:0};
      const animationTimersRef={current:new Map()}, callbacks=new Map();
      let rainbows=[], bursts=[], nextTimer=0;
      const setRainbows=update=>{rainbows=update(rainbows);};
      const setBursts=update=>{bursts=update(bursts);};
      const districtX=id=>id==="off-page"?null:85;
      const window={setTimeout(callback,delay){const id=++nextTimer; callbacks.set(id,{callback,delay}); return id;}};
      function update(repos) {
        ${currentStatus}
        (${weatherEffect})();
        (${countEffect})();
      }
      function visible(repos, pageKey=pageKeyRef.current) {
        ${currentStatus}
        return {rainbows:rainbows.filter(${renderFilters.rainbows}),
          bursts:bursts.filter(${renderFilters.bursts})};
      }
      return {update,visible,reducedMotionRef,
        state:()=>({rainbows,bursts,weather:prevWeatherRef.current,counts:prevCountsRef.current}),
        timers:()=>[...callbacks.values()].map(item=>item.delay),
        expire(){for(const item of callbacks.values())item.callback(); callbacks.clear();
          return animationTimersRef.current.size;}};
    }
  `, {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
  const { createRewards } = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
  const dirty = id => repo(id, {clean:false,count:9,
    oldest_uncommitted_ts:new Date(Date.now()-100*24*3600*1000).toISOString()});
  const clean = id => repo(id, {oldest_uncommitted_ts:null});
  for (const invalid of [{status_valid:false}, {status_valid:undefined}, {offline:true}]) {
    const subject=createRewards();
    subject.update([dirty("A")]);
    subject.update([clean("A")]);
    assert.equal(subject.state().rainbows.length,1);
    assert.equal(subject.state().bursts.length,1);
    assert.deepEqual(subject.timers(),[2500,900],"existing reward deadlines are unchanged");
    const unavailable=[repo("A",{...clean("A"),...invalid})];
    assert.deepEqual(subject.visible(unavailable),{rainbows:[],bursts:[]},
      "render gating hides existing rewards before effects process status loss");
    subject.update(unavailable);
    assert.deepEqual(subject.state().rainbows,[]);
    assert.deepEqual(subject.state().bursts,[]);
    assert.equal(subject.state().weather.has("A"),false);
    assert.equal(subject.state().counts.has("A"),false);
    subject.update([clean("A")]);
    assert.deepEqual(subject.visible([clean("A")]),{rainbows:[],bursts:[]},
      "restored status creates a baseline, not a delayed recovery reward");
    assert.equal(subject.expire(),0,"pending old timers remain safe and release their owners");

    const interrupted=createRewards();
    interrupted.update([dirty("A")]);
    interrupted.update(unavailable);
    interrupted.update([clean("A")]);
    assert.deepEqual(interrupted.visible([clean("A")]),{rainbows:[],bursts:[]});
    assert.deepEqual(interrupted.timers(),[]);
  }
  const valid=createRewards();
  valid.update([dirty("A"),dirty("off-page")]);
  valid.update([clean("A"),clean("off-page")]);
  assert.deepEqual(valid.state().rainbows.map(item=>item.repo),["A"]);
  assert.deepEqual(valid.state().bursts.map(item=>item.repo),["A"]);
  assert.deepEqual(valid.visible([clean("A")],"another-page"),{rainbows:[],bursts:[]});
  assert.equal(valid.expire(),0);
  assert.deepEqual(valid.visible([clean("A")]),{rainbows:[],bursts:[]});
  const reduced=createRewards();
  reduced.reducedMotionRef.current=true;
  reduced.update([dirty("A")]);
  reduced.update([clean("A")]);
  assert.deepEqual(reduced.timers(),[]);
  assert.deepEqual(reduced.visible([clean("A")]),{rainbows:[],bursts:[]});
});
