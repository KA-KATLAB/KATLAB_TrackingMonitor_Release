import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { restoreRelationshipHistory } from "./helpers/relationshipHistory.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const frontend = resolve(root, "Frontend");
const require = createRequire(resolve(frontend, "package.json"));
const ts = require("typescript"), React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const read = (name) => readFileSync(resolve(frontend, "src", name), "utf8");
const ast = ts.createSourceFile("OverviewView.tsx", read("OverviewView.tsx"), ts.ScriptTarget.Latest, true);
function declaration (name) {
  const node = ast.statements.find((entry) => ts.isFunctionDeclaration(entry) && entry.name?.text === name);
  assert.ok(node, `actual declaration exists: ${name}`);
  return node;
}
const compile = async (source) => {
  const code = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React,
  } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
};
const format = await compile(read("format.ts"));
const calendarDay = await compile(read("calendarDay.ts"));
const { makeSubjects } = await compile(`export function makeSubjects(React, format, calendarDay) {
  const { useState, useRef, useEffect } = React;
  const { fmtMinutes } = format, { calendarDayLabel } = calendarDay;
  // Use the final reduced-motion SSR state. Actual count-up implementation is
  // retained below and separately protected by its original source fingerprint.
  const prefersReducedMotion = () => true, usePrefersReducedMotion = () => true;
  ${["KpiRow", "Kpi", "useCountUp"].map((name) => declaration(name).getText(ast)).join("\n")}
  return { KpiRow, Kpi };
}`);
const subjects = makeSubjects(React, format, calendarDay);
const elements = (node) => Array.isArray(node) ? node.flatMap(elements)
  : React.isValidElement(node) ? [node, ...elements(node.props.children)] : [];
const render = (Component, props) => renderToStaticMarkup(React.createElement(Component, props));
const repo = (overrides = {}) => ({ id: "Repo", offline: false, status_valid: true, clean: false, count: 3, ...overrides });
function stats (overrides = {}) {
  const calendar = [{ day: "2026-09-30", events: 6, commits: 1, minutes: 120 }];
  return {
    mode_counts: { B: 4, A_SCOPED: 2, A_GLOBAL: 1, AMBIGUOUS: 1, UNKNOWN: 1, MANUAL: 1 },
    events_per_task: [{ repo: "Repo", task_ref: "Plan - E.1", count: 8 }],
    activity_daily: [{ day: "2026-09-30", count: 6 }], activity_calendar: calendar,
    effort_per_task: [], punch_card: Array.from({ length: 7 }, () => Array(24).fill(0)),
    file_coupling: [], file_churn: [],
    wrapped: { days: calendar, top_task: null, busiest_hour: null, files_touched: 0, commits: 1, top_pair: null },
    identity: { extensions: [], ext_total: 0, sessions: 0, first_event_ts: null, commits: 1 },
    provenance: { commits_observed: 0, commits_pre: 0, slots_total: 0, slots_ai: 0, top_files: [] },
    ...overrides,
  };
}
const kpis = (repos, snapshot = stats(), uncommitted = []) => {
  const tree = subjects.KpiRow({ stats: snapshot, repos, uncommitted });
  const all = elements(tree).filter((node) => node.type === subjects.Kpi);
  return { tree, all, get: (label) => all.find((node) => node.props.label === label)?.props };
};

test("four primary KPIs precede complete secondary capture metrics without changing calculations", () => {
  const result = kpis([repo(), repo({ clean: true, count: 0 })], stats(),
    [{ mode: "UNKNOWN" }, { mode: "AMBIGUOUS" }, { mode: "B" }]);
  const groups = elements(result.tree).filter((node) => node.props.role === "group");
  assert.deepEqual(groups.map((node) => node.props["aria-label"]),
    ["Current operational metrics", "Captured activity summary"]);
  const primary = elements(groups[0]).filter((node) => node.type === subjects.Kpi);
  const secondary = elements(groups[1]).filter((node) => node.type === subjects.Kpi);
  assert.equal(primary.length, 4);
  assert.deepEqual(primary.slice(0, 3).map((node) => node.props.label),
    ["need a pick", "uncommitted changes", "repos clean"]);
  assert.ok(primary[3].props.label.startsWith("time "));
  assert.deepEqual(secondary.map((node) => node.props.label), ["captured events", "auto-attributed", "busiest task"]);
  assert.ok(secondary.every((node) => node.props.secondary));
  assert.equal(result.get("need a pick").value, 2);
  assert.equal(result.get("captured events").value, 10);
  assert.equal(result.get("auto-attributed").value, 70);
  assert.equal(result.get("busiest task").value, 8);
  assert.equal(result.get("busiest task").sub, "E.1");
  assert.equal(primary[3].props.value, 120);
  assert.equal(primary[3].props.format(120), "≈ 2h 0m");
});

test("Git KPIs exclude offline and untrusted retained values and disclose partial coverage", () => {
  const rows = Object.freeze([
    Object.freeze(repo({ id: "clean", clean: true, count: 0 })),
    Object.freeze(repo({ id: "dirty", count: 3 })),
    Object.freeze(repo({ id: "offline", offline: true, clean: true, count: 91 })),
    Object.freeze(repo({ id: "unavailable", status_valid: false, clean: true, count: 99 })),
    Object.freeze(repo({ id: "old-server", status_valid: undefined, clean: true, count: 81 })),
  ]);
  const result = kpis(rows);
  assert.equal(result.get("uncommitted changes").value, 3);
  assert.equal(result.get("repos clean").value, 1);
  assert.equal(result.get("repos clean").suffix, "/2");
  for (const label of ["uncommitted changes", "repos clean"]) {
    assert.equal(result.get(label).format, undefined);
    assert.equal(result.get(label).sub, "2/5 repositories with current Git status; remaining status unavailable");
  }
  assert.equal(rows[3].count, 99, "source snapshots are never rewritten");
});

test("all-unknown, empty scope and measured zero have distinct rendered Git states", () => {
  for (const rows of [[repo({ status_valid: false })], [repo({ offline: true })]]) {
    const result = kpis(rows);
    for (const label of ["uncommitted changes", "repos clean"]) {
      const props = result.get(label);
      assert.equal(props.format(props.value), "Unavailable");
      assert.equal(props.suffix, undefined);
      const html = render(subjects.Kpi, props);
      assert.match(html, />Unavailable<\/dd>/);
      assert.match(html, /0\/1 repositories with current Git status; remaining status unavailable/);
    }
  }
  const empty = kpis([]);
  assert.equal(empty.get("repos clean").format(0), "No repos");
  assert.equal(empty.get("uncommitted changes").sub, "No repositories in this scope");
  const zero = kpis([repo({ clean: true, count: 0 })]);
  assert.equal(zero.get("uncommitted changes").value, 0);
  assert.equal(zero.get("uncommitted changes").format, undefined);
  assert.equal(zero.get("repos clean").suffix, "/1");
  assert.match(render(subjects.Kpi, zero.get("uncommitted changes")), />0<\/dd>/);
});

test("workspace-fed metrics distinguish pending, failed, accepted and retained snapshots", () => {
  for(const workspaceError of ["","workspace failed"]) {
    const html=render(subjects.KpiRow,{stats:stats(),repos:[repo()],uncommitted:[{mode:"UNKNOWN"}],
      workspaceReady:false,workspaceError});
    const label=workspaceError?"Unavailable":"Waiting";
    for(const metric of ["need a pick","uncommitted changes","repos clean"]) {
      assert.match(html,new RegExp(`>${metric}</dt><dd[^>]*>${label}</dd>`));
    }
    assert.match(html,/≈ 2h 0m/);
    assert.match(html,/>captured events<\/dt><dd[^>]*>10<\/dd>/);
    assert.doesNotMatch(html,/No repos|repositories with current Git status/);
  }
  const accepted=render(subjects.KpiRow,{stats:stats(),repos:[],uncommitted:[],workspaceReady:true});
  assert.match(accepted,/>need a pick<\/dt><dd[^>]*>0<\/dd>/);
  assert.match(accepted,/>No repos<\/dd>/);
  const retained=render(subjects.KpiRow,{stats:stats(),repos:[repo()],uncommitted:[{mode:"UNKNOWN"}],
    workspaceReady:true,workspaceError:"workspace failed"});
  assert.match(retained,/>need a pick<\/dt><dd[^>]*>1<\/dd>/);
  assert.match(retained,/>uncommitted changes<\/dt><dd[^>]*>3<\/dd>/);
  assert.match(retained,/last accepted workspace snapshot/);
  assert.doesNotMatch(retained,/repositories with current Git status/);
});

test("KPI values wrap at readable sizes without fit observers or transformed text", () => {
  const big = Number.MAX_SAFE_INTEGER;
  for (const secondary of [true, false]) {
    const html = render(subjects.Kpi, { label: "Large count", value: big, secondary,
      sub: "<script>long task identity</script>" });
    assert.ok(html.includes(big.toLocaleString()));
    assert.ok(html.includes(secondary ? "text-xl" : "ui-metric-value"));
    assert.ok(html.includes("&lt;script&gt;long task identity&lt;/script&gt;"));
    assert.ok(html.includes("ui-metadata"));
    assert.doesNotMatch(html, /whitespace-nowrap|scale\(|transform:|<script>/);
  }
  const source = declaration("Kpi").getText(ast);
  assert.doesNotMatch(source, /ResizeObserver|useEffect|useRef|scale\(|fitRef/);
  assert.equal((source.match(/useCountUp\(/g) ?? []).length, 1);
  const metricCss = read("index.css").match(/\.ui-metric-value\s*\{([^}]+)\}/)?.[1];
  assert.ok(metricCss?.includes("overflow-wrap: anywhere"));
});

test("count-up, chart cleanup and request owners are unchanged except the reviewed Tasks hint", () => {
  // Fingerprints were compared with the pre-redesign source before being recorded.
  const hashes = {
    useCountUp: "fe16d4c5c79c9de8fd8ce9eb963319d324fbb800ebaf108c6ba7375b76987673",
    ChartCanvas: "2bf25b50e24ad72c93d706fb54584e6fa34de8b0fd1554cca2cd6ffff854d3bb",
    OverviewView: "f96dca4049fa4a9b9650fae1e9187fab2fcf85ba50786c0787cbfef8cb4526ca",
    GraphPanel: "eea773b956bb8ff5409f079216b93e60cd13b4582d52e88a46d6b4fef05a7131",
  };
  const printer = ts.createPrinter({ removeComments: true });
  for (const [name, hash] of Object.entries(hashes)) {
    const ownerSource = name === "GraphPanel" ? ts.createSourceFile("OverviewView.tsx",
      restoreRelationshipHistory(read("OverviewView.tsx")), ts.ScriptTarget.Latest, true) : ast;
    const node = name === "GraphPanel" ? ownerSource.statements.find((entry) =>
      ts.isFunctionDeclaration(entry) && entry.name?.text === name) : declaration(name);
    assert.ok(node, `actual restored owner exists: ${name}`);
    const nodes = name === "OverviewView" || name === "GraphPanel"
      ? [...node.body.statements].slice(0, -1) : [node];
    let code = nodes.map((entry) => printer.printNode(ts.EmitHint.Unspecified, entry, ownerSource)).join("\n");
    if (name === "GraphPanel") {
      // The only pre-render change is display copy for the removed permanent
      // sidebar. Normalize that exact text, not a callback or calculation.
      const currentHint = "tasks — open Tasks for the rest";
      assert.equal(code.split(currentHint).length - 1, 1);
      code = code.replace(currentHint, "tasks — see the sidebar for the rest");
    }
    assert.equal(createHash("sha256").update(code).digest("hex"), hash, name);
  }
});

test("actual Overview caller keeps complete status coverage while graph eligibility stays online-only", () => {
  const app = ts.createSourceFile("App.tsx", read("App.tsx"), ts.ScriptTarget.Latest, true);
  const propExpression = (tree, tag, prop) => {
    const matches = [];
    const visit = node => {
      if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node))
          && node.tagName.getText(tree) === tag) {
        const attribute = node.attributes.properties.find(item => ts.isJsxAttribute(item)
          && item.name.text === prop);
        assert.ok(attribute?.initializer && ts.isJsxExpression(attribute.initializer));
        matches.push(attribute.initializer.expression.getText(tree));
      }
      ts.forEachChild(node, visit);
    };
    visit(tree);
    assert.equal(matches.length, 1, `${tag} has one actual ${prop} owner`);
    return matches[0];
  };
  const caller = propExpression(app, "LazyOverviewView", "repos");
  const metrics = propExpression(ast, "KpiRow", "repos");
  const graph = propExpression(ast, "GraphPanel", "repos");
  assert.equal(caller, "visibleRepos");
  assert.equal(metrics, "repos");
  const fixture = Object.freeze([
    Object.freeze(repo({id:"online",clean:true,count:0})),
    Object.freeze(repo({id:"offline",offline:true,clean:true,count:8})),
    Object.freeze(repo({id:"invalid",status_valid:false,clean:true,count:9})),
  ]);
  const viewRepos = new Function("visibleRepos", `return (${caller});`)(fixture);
  const metricRepos = new Function("repos", `return (${metrics});`)(viewRepos);
  const graphRepos = new Function("repos", `return (${graph});`)(viewRepos);
  assert.equal(metricRepos,fixture);
  assert.deepEqual(graphRepos.map(item=>item.id),["online","invalid"],
    "preserve the pre-redesign graph membership policy; exclude offline only");
  const result = kpis(metricRepos);
  assert.equal(result.get("repos clean").value,1);
  assert.equal(result.get("repos clean").sub,
    "1/3 repositories with current Git status; remaining status unavailable");
});

test("actual Overview preserves loading, empty, stale, chart and task-only mounting gates", { timeout: 30_000 }, async (t) => {
  const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
  const vite = await createServer({ root: frontend,
    server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom",
    optimizeDeps: { noDiscovery: true, entries: [] } });
  try {
    const { OverviewView } = await vite.ssrLoadModule("/src/OverviewView.tsx");
    const props = { scope: undefined, tasks: [], uncommitted: [], repos: [], stats: null, statsError: "",
      onStatus() {}, onRefreshStats() {}, onExportReport() {}, onOpenWrapped() {},
      entryState: { relationship: null, day: "2026-09-30", speed: 1 }, onEntryStateChange() {} };
    const activeTask={repo:"Repo",plan_file:"plan.txt",task_ref:"plan - E.1",task_id:"E.1",
      status:"in-progress",title:"Independent task",files:[],why:"Still active"};
    await t.test("pending and failed workspace snapshots keep independent stats but cannot imply empty workspace facts",()=>{
      for(const workspaceError of ["","workspace failed"]) {
        const html=render(OverviewView,{...props,stats:stats(),tasks:[activeTask],repos:[repo()],
          uncommitted:[{mode:"UNKNOWN"}],workspaceReady:false,workspaceError});
        assert.match(html,workspaceError?/Workspace snapshot unavailable/:/Waiting for workspace snapshot/);
        const label=workspaceError?"Unavailable":"Waiting";
        for(const metric of ["need a pick","uncommitted changes","repos clean"]) {
          assert.match(html,new RegExp(`>${metric}</dt><dd[^>]*>${label}</dd>`));
        }
        for(const available of ["Report ⬇","Your week","Refresh stats","time ","Captured activity summary",
          "overview-trends-heading","overview-explore-heading","Personal records"]) assert.ok(html.includes(available),available);
        assert.doesNotMatch(html,/Independent task|Trophy case|overview-relationships-heading|>No repos<\/dd>/);
      }
    });
    await t.test("accepted empty and retained workspace snapshots remain distinguishable from an initial failure",()=>{
      const empty=render(OverviewView,{...props,stats:stats({mode_counts:{},events_per_task:[]}),workspaceReady:true});
      assert.match(empty,/>need a pick<\/dt><dd[^>]*>0<\/dd>/);
      assert.match(empty,/>No repos<\/dd>/);
      assert.match(empty,/overview-relationships-heading/);
      assert.doesNotMatch(empty,/Waiting for workspace snapshot|Workspace snapshot unavailable/);
      const retained=render(OverviewView,{...props,stats:stats(),workspaceReady:true,workspaceError:"workspace failed",
        repos:[repo()],tasks:[activeTask],uncommitted:[{mode:"UNKNOWN"}]});
      assert.match(retained,/Workspace refresh failed/);
      assert.match(retained,/last accepted workspace snapshot/);
      for(const available of ["Independent task","Trophy case","overview-relationships-heading"]) {
        assert.ok(retained.includes(available),available);
      }
      assert.doesNotMatch(retained,/repositories with current Git status/);
    });
    await t.test("missing stats retain refresh and independent Relationships", () => {
      const html = render(OverviewView, props);
      assert.match(html, /Loading overview data/); assert.match(html, /Refresh stats/);
      assert.match(html, /overview-relationships-heading/);
      assert.doesNotMatch(html, /Current operational metrics|overview-trends-heading|overview-explore-heading/);
      assert.match(render(OverviewView, { ...props, statsSettled: true }), /Overview stats are unavailable/);
    });
    await t.test("zero event data retains active plans but does not mount Trends or Explore", () => {
      const html = render(OverviewView, { ...props,
        stats: stats({ mode_counts: {}, events_per_task: [] }),
        tasks: [{ repo: "Repo", plan_file: "plan.txt", task_ref: "plan - E.1", task_id: "E.1",
          status: "in-progress", title: "Independent task", files: [], why: "Still active" }],
      });
      assert.match(html, /Independent task/); assert.match(html, /No events captured yet/);
      assert.match(html, /Current operational metrics/);
      assert.doesNotMatch(html, /overview-trends-heading|overview-explore-heading/);
    });
    await t.test("mixed and offline-only scopes disclose complete repository status coverage", () => {
      const mixed = render(OverviewView, { ...props, stats: stats({mode_counts:{},events_per_task:[]}),
        repos:[repo({id:"online",clean:true,count:0}),
          repo({id:"offline",offline:true,clean:true,count:8}),
          repo({id:"invalid",status_valid:false,clean:true,count:9})],
      });
      assert.match(mixed,/1\/3 repositories with current Git status; remaining status unavailable/);
      const offline = render(OverviewView, { ...props, scope:"offline",
        stats:stats({mode_counts:{},events_per_task:[]}),
        repos:[repo({id:"offline",offline:true,clean:true,count:8})],
      });
      assert.match(offline,/>Unavailable<\/dd>/);
      assert.match(offline,/0\/1 repositories with current Git status; remaining status unavailable/);
      assert.doesNotMatch(offline,/>No repos<\/dd>/);
    });
    await t.test("positive and stale snapshots keep all sections, alternatives and recovery", () => {
      const html = render(OverviewView, { ...props, stats: stats(), statsError: "Refresh failed", reportBusy: true });
      const headings = ["now", "trends", "explore", "relationships"].map((name) =>
        html.indexOf(`id="overview-${name}-heading"`));
      assert.ok(headings.every((position, index) => position >= 0 && (index === 0 || position > headings[index - 1])));
      assert.match(html, /data-route-hydration-failure/);
      assert.match(html, /Showing the last successful stats response; it has not been updated/);
      assert.match(html, /Retry stats/); assert.match(html, /Starting…/);
      for (const title of ["Attribution health", "Events per task", "Activity calendar", "Activity by weekday and hour",
        "Daily goal rings", "Repository identity", "Personal records", "Your week"]) {
        assert.ok(html.includes(title), title);
      }
    });
  } finally { await vite.close(); }
});
