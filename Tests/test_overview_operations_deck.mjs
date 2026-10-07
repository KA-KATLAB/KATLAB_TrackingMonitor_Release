import { deskPreservation } from "./helpers/changesReviewLanes.mjs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const frontend = resolve(root, "Frontend");
const require = createRequire(resolve(frontend, "package.json"));
const ts = require("typescript"), postcss = require("postcss"), React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const read = name => readFileSync(resolve(root, name), "utf8");
const sha = value => createHash("sha256").update(value).digest("hex");
const lf = text => text.replace(/\r\n/g, "\n");
const one = (nodes, predicate, label) => {
  const found = nodes.filter(predicate);
  assert.equal(found.length, 1, label);
  return found[0];
};
const replaceOnce = (text, before, after) => {
  assert.equal(text.split(before).length - 1, 1, "one intended physical fixture window");
  return text.replace(before, after);
};
const ending = text => {
  assert.equal(typeof text, "string");
  assert.ok(!text.startsWith("\uFEFF") && !text.includes("\0"), "no CSS inverse BOM or NUL");
  const eol = text.includes("\r\n") ? "\r\n" : "\n", bare = text.replace(/\r\n/g, "");
  assert.ok(!bare.includes("\r"), "no bare CSS inverse CR");
  if (eol === "\r\n") assert.ok(!bare.includes("\n"), "uniform CSS inverse EOL");
  return eol;
};
const BEGIN = "/* Overview operations deck: existing data and interaction owners. */";
const END = "/* End Overview operations deck. */";
const RAIL = "@media (min-width: 1280px) {";
const ORIGINAL_CSS_RAW = "11aa5c0b57c6aa8f475de2fc1c143da1c4bdd035e5f9f4c293f9d1c5e5ccbf69";
const ORIGINAL_CSS_LF = "b3abb18791c47d6f1204775706716419960c331cac17fe409081164c75c61efd";
const ORIGINAL_OVERVIEW_RAW = "98f77fe8a3f97033f5a2084439f8da6dcb203547d7b1f8409aca11892598d214";
const ORIGINAL_OVERVIEW_LF = "9d42a6c52828018f6bb0ab7f3f668e0040e0a190de144517715460f93b84410a";

// Frozen reviewed source, not generated from a mutable or gitignored plan.
const DECK_CSS = `/* Overview operations deck: existing data and interaction owners. */
section[aria-labelledby="overview-now-heading"] {
  padding: 1rem;
  border: 1px solid rgb(var(--ui-border));
  border-radius: 0.75rem;
  background: rgb(var(--ui-surface) / 0.35);
}
section[aria-labelledby="overview-now-heading"] > .ui-section-heading {
  padding-bottom: 0.75rem;
  border-bottom: 1px solid rgb(var(--ui-border));
}
section[aria-labelledby="overview-now-heading"] [role="group"][aria-label="Current operational metrics"] {
  grid-template-columns: minmax(0, 1fr);
  gap: 1rem;
  align-items: stretch;
}
section[aria-labelledby="overview-now-heading"] [role="group"][aria-label="Current operational metrics"] > .ui-metric {
  padding: 1.25rem;
  border: 1px solid rgb(var(--ui-border));
  border-radius: 0.5rem;
  background: rgb(var(--ui-surface));
}
section[aria-labelledby="overview-now-heading"] [role="group"][aria-label="Current operational metrics"] > .ui-metric:first-child {
  border-color: rgb(var(--ui-focus));
  background: rgb(var(--ui-primary) / 0.12);
}
section[aria-labelledby="overview-now-heading"] [role="group"][aria-label="Captured activity summary"] {
  grid-template-columns: minmax(0, 1fr);
  gap: 1rem;
  padding: 1rem;
  border: 1px solid rgb(var(--ui-border));
  border-radius: 0.5rem;
  background: rgb(var(--ui-surface-raised) / 0.35);
}
section[aria-labelledby="overview-now-heading"] [role="group"][aria-label="Captured activity summary"] > .ui-metric {
  padding: 0;
  border: 0;
}
@media (min-width: 768px) {
  section[aria-labelledby="overview-now-heading"] [role="group"][aria-label="Current operational metrics"] {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  section[aria-labelledby="overview-now-heading"] [role="group"][aria-label="Captured activity summary"] {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
@media (min-width: 1024px) {
  section[aria-labelledby="overview-now-heading"] { padding: 1.5rem; }
  section[aria-labelledby="overview-now-heading"] [role="group"][aria-label="Current operational metrics"] {
    grid-template-columns: minmax(0, 1.2fr) repeat(2, minmax(0, 1fr));
  }
  section[aria-labelledby="overview-now-heading"] [role="group"][aria-label="Current operational metrics"] > .ui-metric:first-child {
    grid-row: 1 / span 2;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }
  section[aria-labelledby="overview-now-heading"] [role="group"][aria-label="Current operational metrics"] > .ui-metric:last-child {
    grid-column: 2 / -1;
  }
}
/* End Overview operations deck. */
`;

// Preservation only. Behavioral subjects below compile raw current owners.
function restoreOverviewDeck (text) {
  const eol = ending(text), ast = postcss.parse(text), block = DECK_CSS.replace(/\n/g, eol);
  const begin = one(ast.nodes, node => node.type === "comment"
    && node.text === "Overview operations deck: existing data and interaction owners.", "one top-level begin marker");
  const end = one(ast.nodes, node => node.type === "comment"
    && node.text === "End Overview operations deck.", "one top-level end marker");
  let markerCount = 0;
  ast.walkComments(node => { if (node.text === begin.text || node.text === end.text) markerCount++; });
  assert.equal(markerCount, 2, "no duplicate or nested marker pair");
  assert.equal(text.split(block).length - 1, 1, "one complete contiguous literal CSS block");
  const start = text.indexOf(block), after = start + block.length;
  assert.equal(begin.source.start.offset, start, "actual marker occupies its physical site");
  assert.equal(end.source.start.offset, start + block.lastIndexOf(END), "actual end occupies the literal site");
  assert.equal(text.slice(start - 2 * eol.length, start), eol + eol, "original preceding blank line");
  assert.equal(text.slice(after, after + eol.length + RAIL.length), eol + RAIL, "one blank line before original rail");
  const rail = one(ast.nodes, node => node.type === "atrule" && node.name === "media"
    && node.params === "(min-width: 1280px)", "one actual original top-level rail");
  assert.equal(ast.nodes.indexOf(rail), ast.nodes.indexOf(end) + 1, "rail directly follows the block");
  assert.equal(rail.source.start.offset, after + eol.length, "actual rail is the physical insertion boundary");
  const restored = text.slice(0, start) + text.slice(after + eol.length);
  postcss.parse(restored);
  return restored;
}

const css = read("Frontend/src/index.css");
test("strict literal/site CSS inverse preserves the whole original stylesheet in LF and CRLF", () => {
  for (const eol of ["\n", "\r\n"]) {
    const current = lf(css).replace(/\n/g, eol), restored = restoreOverviewDeck(current);
    assert.equal(sha(lf(restored)), ORIGINAL_CSS_LF);
    if (eol === "\r\n") assert.equal(sha(restored), ORIGINAL_CSS_RAW);
    const at = current.indexOf(BEGIN), window = DECK_CSS.replace(/\n/g, eol) + eol;
    assert.equal(restored.slice(0, at), current.slice(0, at));
    assert.equal(restored.slice(at), current.slice(at + window.length), "every unrelated suffix byte passes through");
  }
});

test("CSS inverse rejects missing, duplicated, partial, altered, relocated, nested and comment sites", () => {
  const source = lf(css), without = restoreOverviewDeck(source);
  const variants = [
    without, source + "\n" + DECK_CSS,
    replaceOnce(source, DECK_CSS, DECK_CSS.replace(END, "/* Missing end marker. */")),
    replaceOnce(source, DECK_CSS, DECK_CSS.replace("padding: 1.25rem;", "padding: 1.5rem;")),
    replaceOnce(source, DECK_CSS, DECK_CSS.replace("overview-now-heading", "overview-trends-heading")),
    replaceOnce(source, DECK_CSS, DECK_CSS.replace("(min-width: 768px)", "(min-width: 769px)")),
    replaceOnce(source, DECK_CSS, DECK_CSS.replace("grid-row: 1 / span 2;", "grid-row: 2 / span 2;")),
    replaceOnce(source, DECK_CSS, DECK_CSS.replace(BEGIN, "  " + BEGIN)),
    without + "\n" + DECK_CSS,
    replaceOnce(without, RAIL, ".wrong-owner {\n" + DECK_CSS + "}\n\n" + RAIL),
    replaceOnce(without, RAIL, "/*\n" + DECK_CSS + "\n" + RAIL),
    replaceOnce(source, DECK_CSS + "\n" + RAIL, DECK_CSS + "\n\n" + RAIL),
  ];
  for (const value of variants) {
    assert.doesNotThrow(() => postcss.parse(value), "negative violates ownership/literal/site, not CSS syntax");
    for (const eol of ["\n", "\r\n"]) assert.throws(() => restoreOverviewDeck(value.replace(/\n/g, eol)), assert.AssertionError);
  }
  for (const value of ["\uFEFF" + source, source.replace("\n", "\r"), source.replace("\n", "\r\n"),
    source + "\0", source + "\n.unclosed {\n"]) assert.throws(() => restoreOverviewDeck(value));
});

test("CSS inverse keeps unrelated valid outside mutations visible to immutable whole hashes", () => {
  const source = lf(css);
  for (const [before, after] of [
    ["--ui-canvas: 2 6 23;", "--ui-canvas: 3 6 23;"],
    [".app-brand-title > span:last-child", ".app-brand-title > span:first-child"],
    [".changes-workbench > *", ".changes-workbench > div"],
  ]) for (const eol of ["\n", "\r\n"]) {
    const current = source.replace(/\n/g, eol), modified = replaceOnce(current, before, after);
    postcss.parse(modified);
    const restored = restoreOverviewDeck(modified);
    assert.equal(restored, replaceOnce(restoreOverviewDeck(current), before, after));
    assert.notEqual(sha(lf(restored)), ORIGINAL_CSS_LF);
  }
});

// Parse declarations, not computed geometry, paint, focus or native acceptance.
test("actual full PostCSS owns only the reviewed Now selectors and responsive placements", () => {
  restoreOverviewDeck(css);
  const ast = postcss.parse(css), start = css.indexOf(BEGIN), end = css.indexOf(END) + END.length;
  const reviewed = ast.nodes.filter(node => node.source.start.offset >= start && node.source.start.offset < end);
  const rules = [];
  reviewed.forEach(node => { if (node.type === "rule") rules.push(node); else node.walkRules?.(rule => rules.push(rule)); });
  assert.equal(rules.length, 13);
  for (const rule of rules) {
    assert.ok(rule.selector.startsWith('section[aria-labelledby="overview-now-heading"]'));
    for (const item of rule.nodes.filter(node => node.type === "decl")) {
      assert.ok(!["height", "max-height", "order", "font-size", "animation", "transform", "position"].includes(item.prop));
      assert.ok(!item.prop.startsWith("overflow"), "no new clipping or scroll owner");
    }
  }
  assert.deepEqual(reviewed.filter(node => node.type === "atrule").map(node => [node.name, node.params]),
    [["media", "(min-width: 768px)"], ["media", "(min-width: 1024px)"]]);
  const metricValue = one(ast.nodes.flatMap(node => node.nodes ?? []).concat(ast.nodes),
    node => node.type === "rule" && node.selector === ".ui-metric-value", "unchanged primary numeric rule");
  assert.ok(metricValue.toString().includes("text-[2rem]"));
  assert.ok(metricValue.toString().includes("overflow-wrap: anywhere"));
});

const overview = read("Frontend/src/OverviewView.tsx");
const parseTs = (text, name) => {
  const ast = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  assert.equal(ast.parseDiagnostics.length, 0, "valid actual production source");
  return ast;
};
const overviewAst = parseTs(overview, "OverviewView.tsx");
const owner = name => one(overviewAst.statements, node => ts.isFunctionDeclaration(node)
  && node.name?.text === name, "one actual " + name);
test("whole Overview and all three old suites retain their original complete bytes across EOL conversion", () => {
  ending(overview);
  for (const eol of ["\n", "\r\n"]) {
    const current = lf(overview).replace(/\n/g, eol);
    assert.equal(sha(lf(current)), ORIGINAL_OVERVIEW_LF);
    if (eol === "\r\n") assert.equal(sha(current), ORIGINAL_OVERVIEW_RAW);
  }
  for (const [name, expectedRaw, expectedLf] of [
    ["test_overview_hierarchy.mjs", "faf3b593f97021df8509f896c28adcecfb15e5438221bb9f87f6a0cdd95bc238",
      "d1adb0cb04dec60045173f4c47334b00b71519018bd4bee835125f5fcf1c9840"],
    ["test_relationship_history.mjs", "b533cdbe1cde0c9f1168c935b30528e73ad221a2b69be0f65b3bfcd97bce843d",
      "b533cdbe1cde0c9f1168c935b30528e73ad221a2b69be0f65b3bfcd97bce843d"],
    ["test_mission_control_workbench.mjs", "d92813b96ba0206202d0b40f77aa7e622be438c8e9a9a68bd26290b2ee0577d3",
      "d92813b96ba0206202d0b40f77aa7e622be438c8e9a9a68bd26290b2ee0577d3"],
  ]) {
    const original = deskPreservation(`Tests/${name}`, read(`Tests/${name}`)); ending(original);
    assert.equal(sha(original), expectedRaw, "complete unchanged physical suite bytes");
    for (const eol of ["\n", "\r\n"]) {
      assert.equal(sha(lf(lf(original).replace(/\n/g, eol))), expectedLf);
    }
  }
});

const compile = async text => import(`data:text/javascript;base64,${Buffer.from(ts.transpileModule(text, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React },
}).outputText).toString("base64")}`);
const format = await compile(read("Frontend/src/format.ts"));
const calendarDay = await compile(read("Frontend/src/calendarDay.ts"));
const { makeSubjects } = await compile(`export function makeSubjects(React,format,calendarDay) {
  const {useState,useRef,useEffect}=React;
  const {fmtMinutes}=format, {calendarDayLabel}=calendarDay;
  // Explicit finite reduced-motion final-state fixture, not a browser oracle.
  const prefersReducedMotion=()=>true, usePrefersReducedMotion=()=>true;
  ${["KpiRow", "Kpi", "useCountUp"].map(name => owner(name).getText(overviewAst)).join("\n")}
  return {KpiRow,Kpi};
}`);
const subjects = makeSubjects(React, format, calendarDay);
const elements = tree => Array.isArray(tree) ? tree.flatMap(elements)
  : React.isValidElement(tree) ? [tree, ...elements(tree.props.children)] : [];
const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));
const repo = (extra = {}) => ({ id: "Repo", offline: false, status_valid: true, clean: false, count: 3, ...extra });
const snapshot = (extra = {}) => ({ mode_counts: { B: 4, A_SCOPED: 2, A_GLOBAL: 1, AMBIGUOUS: 1, UNKNOWN: 1, MANUAL: 1 },
  events_per_task: [{ repo: "Repo", task_ref: "Plan - E.1", count: 8 }],
  activity_calendar: [{ day: "1980-01-01", events: 6, commits: 1, minutes: 120 }], ...extra });
const props = (extra = {}) => ({ stats: snapshot(), repos: [], uncommitted: [], workspaceReady: true, workspaceError: "", ...extra });
function inspected (input) {
  const tree = subjects.KpiRow(input), groups = elements(tree).filter(node => node.props.role === "group");
  assert.deepEqual(groups.map(node => node.props["aria-label"]), ["Current operational metrics", "Captured activity summary"]);
  const rows = groups.map(group => React.Children.toArray(group.props.children));
  assert.equal(rows[0].length, 4); assert.ok([2, 3].includes(rows[1].length));
  rows.flat().forEach(node => assert.equal(node.type, subjects.Kpi, "only actual direct metric owners"));
  const html = render(subjects.KpiRow, input);
  assert.equal((html.match(/class="ui-metric"/g) ?? []).length, rows.flat().length);
  const values = rows.map(items => items.map(node => {
    const rendered = render(subjects.Kpi, node.props);
    assert.match(rendered, /^<div\b[^>]*class="ui-metric"><dl\b/);
    return rendered;
  }));
  const labels = rows.map(items => items.map(node => node.props.label));
  assert.deepEqual(labels[0].slice(0, 3), ["need a pick", "uncommitted changes", "repos clean"]);
  assert.ok(labels[0][3].startsWith("time "));
  assert.deepEqual(labels[1], rows[1].length === 3 ? ["captured events", "auto-attributed", "busiest task"] : ["captured events", "auto-attributed"]);
  return { html, rows, values, labels };
}
const hasValue = (html, value) => assert.ok(html.includes(`>${value}</dd>`), value);

test("raw current KPI owners retain mixed full-model quantities, coverage and primary then secondary DOM order", () => {
  const input = props({ repos: [repo({ clean: true, count: 0 }), repo(), repo({ offline: true, clean: true, count: 999 }),
    repo({ status_valid: false, clean: true, count: 888 }), repo({ status_valid: undefined, clean: true, count: 777 })],
  uncommitted: [{ mode: "UNKNOWN" }, { mode: "AMBIGUOUS" }, { mode: "B" }] });
  const before = JSON.stringify(input), result = inspected(input);
  ["2", "3", "1/2", "≈ 2h 0m"].forEach((value, index) => hasValue(result.values[0][index], value));
  ["10", "70%", "8"].forEach((value, index) => hasValue(result.values[1][index], value));
  assert.match(result.html, /2\/5 repositories with current Git status; remaining status unavailable/);
  assert.match(result.html, /time 1980-01-01 \(UTC\)/);
  assert.doesNotMatch(result.html, />999<|>888<|>777</);
  const primaryAt = result.html.indexOf('aria-label="Current operational metrics"');
  const secondaryAt = result.html.indexOf('aria-label="Captured activity summary"');
  assert.ok(primaryAt >= 0 && secondaryAt > primaryAt);
  assert.equal(JSON.stringify(input), before, "captured model is not rewritten");
});

test("raw current KPI owners distinguish measured zero, no repos, unknown/offline and missing dated effort", () => {
  const zero = snapshot({ mode_counts: {}, events_per_task: [], activity_calendar: [{ day: "1980-01-01", minutes: 0 }] });
  const measured = inspected(props({ stats: zero, repos: [repo({ clean: true, count: 0 })] }));
  ["0", "0", "1/1", "≈ 0m"].forEach((value, index) => hasValue(measured.values[0][index], value));
  assert.equal(measured.rows[1].length, 2); hasValue(measured.values[1][0], "0"); hasValue(measured.values[1][1], "0%");
  const empty = inspected(props({ stats: zero }));
  hasValue(empty.values[0][0], "0"); hasValue(empty.values[0][1], "No repos"); hasValue(empty.values[0][2], "No repos");
  assert.match(empty.html, /No repositories in this scope/);
  for (const rows of [[repo({ status_valid: false })], [repo({ offline: true })]]) {
    const unavailable = inspected(props({ stats: zero, repos: rows }));
    hasValue(unavailable.values[0][1], "Unavailable"); hasValue(unavailable.values[0][2], "Unavailable");
    assert.match(unavailable.html, /0\/1 repositories with current Git status; remaining status unavailable/);
    assert.doesNotMatch(unavailable.html, />No repos</);
  }
  const undated = inspected(props({ stats: snapshot({ activity_calendar: [] }) }));
  assert.equal(undated.labels[0][3], "time unavailable (UTC)"); hasValue(undated.values[0][3], "Unavailable");
});

test("raw current KPI owners keep independent stats through waiting/failed workspace and retained refresh states", () => {
  for (const workspaceError of ["", "workspace failed"]) {
    const result = inspected(props({ workspaceReady: false, workspaceError, repos: [repo()], uncommitted: [{ mode: "UNKNOWN" }] }));
    result.values[0].slice(0, 3).forEach(value => hasValue(value, workspaceError ? "Unavailable" : "Waiting"));
    hasValue(result.values[0][3], "≈ 2h 0m"); hasValue(result.values[1][0], "10");
    assert.match(result.html, /A complete workspace snapshot has not been accepted/);
    assert.doesNotMatch(result.html, /repositories with current Git status|>No repos</);
  }
  const retained = inspected(props({ workspaceError: "refresh failed", repos: [repo()], uncommitted: [{ mode: "UNKNOWN" }] }));
  ["1", "3", "0/1"].forEach((value, index) => hasValue(retained.values[0][index], value));
  assert.match(retained.html, /Captured events from the last accepted workspace snapshot/);
  assert.match(retained.html, /valid Git status in the last accepted workspace snapshot/);
  assert.doesNotMatch(retained.html, /repositories with current Git status/);
});

test("raw current KPI labels and long values wrap unchanged and special tokens remain escaped", () => {
  const large = Number.MAX_SAFE_INTEGER, special = '<script>task & "value"</script>';
  const result = inspected(props({ stats: snapshot({ mode_counts: { B: large }, events_per_task: [{ task_ref: special, count: large }] }),
    repos: [repo({ count: large })] }));
  hasValue(result.values[0][1], large.toLocaleString()); hasValue(result.values[1][0], large.toLocaleString());
  assert.match(result.html, /&lt;script&gt;task &amp; &quot;value&quot;&lt;\/script&gt;/);
  assert.doesNotMatch(result.html, /<script>|whitespace-nowrap|transform:|scale\(/);
  assert.ok(result.values[0].every(value => value.includes("ui-metric-value")));
  assert.ok(result.values[1].every(value => value.includes("text-xl")));
  assert.ok(result.html.includes("[overflow-wrap:anywhere]"));
});
