import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const frontend = resolve(root, "Frontend");
const require = createRequire(resolve(frontend, "package.json"));
const ts = require("typescript"), React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const read = name => readFileSync(resolve(frontend, "src", name), "utf8");
const sha = value => createHash("sha256").update(value).digest("hex");

// Middleware-only SSR: no listening HTTP/WebSocket server or native renderer.
async function withActual (body) {
  const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
  const vite = await createServer({ root: frontend,
    server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom",
    optimizeDeps: { noDiscovery: true, entries: [] } });
  try {
    const data = await vite.ssrLoadModule("/src/accessibleData.tsx");
    const theme = await vite.ssrLoadModule("/src/theme.ts");
    return await body(data, theme);
  } finally { await vite.close(); }
}

const snapshot = counts => Object.freeze({
  mode_counts: Object.freeze({ ...counts }), events_per_task: Object.freeze([]),
});

test("UNKNOWN-only accepted summary describes captured events, not task attribution", () => withActual(data => {
  assert.equal(data.modeDistributionSummary(snapshot({ UNKNOWN: 7 })),
    "7 captured events; Pick: none is largest at 7 (100%).");
}));

test("ambiguous, mixed and tied captures preserve the six-mode order and labels", () => withActual((data, theme) => {
  assert.deepEqual(theme.MODE_ORDER, ["B", "A_SCOPED", "A_GLOBAL", "AMBIGUOUS", "UNKNOWN", "MANUAL"]);
  for (const [counts, expected] of [
    [{ AMBIGUOUS: 3 }, "3 captured events; Pick: multi is largest at 3 (100%)."],
    [{ B: 2, A_SCOPED: 3, A_GLOBAL: 5, AMBIGUOUS: 7, UNKNOWN: 11, MANUAL: 13 },
      "41 captured events; Your pick is largest at 13 (32%)."],
    [{ B: 4, UNKNOWN: 4 }, "8 captured events; Declared is largest at 4 (50%)."],
    [{ AMBIGUOUS: 2, UNKNOWN: 2 }, "4 captured events; Pick: multi is largest at 2 (50%)."],
    [{ B: 2, A_SCOPED: 2, A_GLOBAL: 2, AMBIGUOUS: 2, UNKNOWN: 2, MANUAL: 2 },
      "12 captured events; Declared is largest at 2 (17%)."],
  ]) assert.equal(data.modeDistributionSummary(snapshot(counts)), expected);
}));

test("defensive zero and absent-mode fallbacks do not become task-attribution claims", () => withActual(data => {
  for (const counts of [{}, { B: 0, A_SCOPED: 0, A_GLOBAL: 0, AMBIGUOUS: 0, UNKNOWN: 0, MANUAL: 0 },
    { B: undefined, UNKNOWN: 0 }]) {
    assert.equal(data.modeDistributionSummary(snapshot(counts)), "No captured events are available.");
  }
  assert.equal(data.modeDistributionSummary(snapshot({ A_GLOBAL: 1 })),
    "1 captured events; Active * is largest at 1 (100%).", "existing formatting is intentionally unchanged");
  assert.equal(data.eventsPerTaskSummary(snapshot({ UNKNOWN: 7 }), false),
    "No task-attributed events are available.");
  const ranked = Object.freeze({ ...snapshot({ UNKNOWN: 7 }), events_per_task: Object.freeze([
    Object.freeze({ repo: "Repo", task_ref: "Plan - A.1", count: 2 }),
    Object.freeze({ repo: "Repo", task_ref: "Plan - B.1", count: 1 }),
  ]) });
  assert.equal(data.eventsPerTaskSummary(ranked, true),
    "2 ranked tasks account for 3 events; Repo · Plan - A.1 leads with 2.");
  assert.equal(data.eventsPerTaskSummary(ranked, false),
    "2 ranked tasks account for 3 events; Plan - A.1 leads with 2.");
}));

test("en-US grouping, existing rounded shares and frozen inputs stay intact", () => withActual(data => {
  for (const [counts, expected] of [
    [{ B: 1200, UNKNOWN: 34 }, "1,234 captured events; Declared is largest at 1,200 (97%)."],
    [{ B: 2, UNKNOWN: 1 }, "3 captured events; Declared is largest at 2 (67%)."],
  ]) {
    const value = snapshot(counts), before = JSON.stringify(value);
    assert.equal(data.modeDistributionSummary(value), expected);
    assert.equal(JSON.stringify(value), before);
    assert.ok(Object.isFrozen(value) && Object.isFrozen(value.mode_counts));
  }
}));

function modeDisclosure (data, theme, stats, scope) {
  const source = read("OverviewView.tsx");
  const ast = ts.createSourceFile("OverviewView.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  assert.equal(ast.parseDiagnostics.length, 0);
  const nodes = [];
  const visit = node => {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === "DisclosureTable"
      && node.attributes.properties.some(prop => ts.isJsxAttribute(prop)
        && prop.name.text === "label" && prop.initializer?.text === "Attribution health")) nodes.push(node);
    ts.forEachChild(node, visit);
  };
  visit(ast); assert.equal(nodes.length, 1, "one actual Overview mode disclosure");
  const parents = [];
  for (let parent = nodes[0].parent; parent; parent = parent.parent) parents.push(parent);
  assert.ok(parents.some(node => ts.isJsxExpression(node)
    && node.expression?.getText(ast).startsWith("stats && totalEvents > 0 &&")),
  "the zero helper fixture does not imply a zero Overview card mounts");
  const code = ts.transpileModule(`return (${nodes[0].getText(ast)});`, {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return new Function("React", "DisclosureTable", "modeDistributionSummary", "MODE_ORDER", "MODE_CHART_LABEL",
    "stats", "scope", code)(React, data.DisclosureTable, data.modeDistributionSummary,
    theme.MODE_ORDER, theme.MODE_CHART_LABEL, stats, scope);
}

test("actual Overview disclosure exposes the captured summary and unchanged exact-data table and controls", () => withActual((data, theme) => {
  const stats = snapshot({ B: 2, A_SCOPED: 3, A_GLOBAL: 5, AMBIGUOUS: 7, UNKNOWN: 11, MANUAL: 13 });
  for (const scope of [undefined, "ALL", "Repo <&>"]) {
    const element = modeDisclosure(data, theme, stats, scope), props = element.props;
    assert.equal(props.label, "Attribution health");
    assert.equal(props.summary, "41 captured events; Your pick is largest at 13 (32%).");
    assert.deepEqual(props.identity, ["chart-modes", scope === undefined ? "all" : "repo", scope]);
    assert.deepEqual(props.rows, [
      { mode: "B", label: "Declared", count: 2 }, { mode: "A_SCOPED", label: "Active", count: 3 },
      { mode: "A_GLOBAL", label: "Active *", count: 5 }, { mode: "AMBIGUOUS", label: "Pick: multi", count: 7 },
      { mode: "UNKNOWN", label: "Pick: none", count: 11 }, { mode: "MANUAL", label: "Your pick", count: 13 },
    ]);
    assert.deepEqual(props.rows.map(props.rowKey), theme.MODE_ORDER);
    assert.deepEqual(props.columns.map(column => column.label), ["Mode", "Code", "Events"]);
    assert.ok(props.columns.every(column => column.sortValue === undefined), "no new sort controls");
    const closed = renderToStaticMarkup(element);
    assert.match(closed, /41 captured events; Your pick is largest at 13 \(32%\)\./);
    assert.match(closed, /aria-expanded="false"/); assert.doesNotMatch(closed, /<table/);
    assert.match(closed, /Show exact data · 6 rows/);
    const open = renderToStaticMarkup(React.cloneElement(element, { initiallyOpen: true }));
    assert.match(open, /aria-expanded="true"/);
    assert.match(open, /<caption[^>]*>Attribution health: exact data<\/caption>/);
    assert.match(open, /aria-label="Attribution health: exact data"/);
    const body = open.split("<tbody>")[1].split("</tbody>")[0];
    const rows = [...body.matchAll(/<tr\b[^>]*>(.*?)<\/tr>/g)].map(match =>
      [...match[1].matchAll(/<td\b[^>]*>(.*?)<\/td>/g)].map(cell => cell[1]));
    assert.deepEqual(rows, [["Declared", "B", "2"], ["Active", "A_SCOPED", "3"], ["Active *", "A_GLOBAL", "5"],
      ["Pick: multi", "AMBIGUOUS", "7"], ["Pick: none", "UNKNOWN", "11"], ["Your pick", "MANUAL", "13"]]);
    const controls = [...open.matchAll(/<button\b[^>]*>/g)].map(match => match[0]);
    assert.equal(controls.length, 3, "one disclosure and two existing bounded pager controls");
    for (const direction of ["previous", "next"]) {
      const button = controls.find(tag => tag.includes(`aria-label="Attribution health exact data: ${direction} page"`));
      assert.ok(button && button.includes('disabled=""'));
    }
    const target = /aria-controls="([^"]+)"/.exec(open)?.[1];
    assert.ok(target && open.includes(`id="${target}"`), "disclosure owns a connected rendered body ID");
  }
}));

const ZERO_LINE = '  if (total === 0) return "No captured events are available.";\n';
const TOTAL_LINE = '  return `${total.toLocaleString("en-US")} captured events; ${MODE_CHART_LABEL[top.mode]} is largest at `\n';
const ORIGINAL_MODULE_SHA = "6215f1d599b0ceaa5f86d95a9d309d272bbb7a705387b7d190254abf9b4042c6";
const ORIGINAL_FUNCTION_SHA = "9e39d1a3677b7253b3fc4afb7cfe4421b0fc180ff0076d34629c0593ef73f2eb";
const ORIGINAL_OUTSIDE_SHA = "c6e162f63cbee3578e58b50d7b2d60dd8599dd7d0cbc15f4c3a044db4c657a29";
const canonical = value => value.replace(/\r\n/g, "\n");
function summaryOwner (source) {
  const ast = ts.createSourceFile("accessibleData.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  assert.equal(ast.parseDiagnostics.length, 0, "valid actual accessible-data module");
  const owners = ast.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === "modeDistributionSummary");
  assert.equal(owners.length, 1, "one complete mode summary owner");
  return { ast, owner: owners[0] };
}
function restoreSummary (source) {
  assert.equal(sha(ZERO_LINE), "2a67c5e6c65d1f45bd3f480f63b0ed978936eb087be0d622a0826e82bcc1466c");
  assert.equal(sha(TOTAL_LINE), "c7372a55e78b4020de3ab963e9fc9fff70a5ef298979e21397eb8c47516ee260");
  const { ast, owner } = summaryOwner(source), start = owner.getStart(ast), end = owner.end;
  const raw = source.slice(start, end), lf = canonical(raw);
  for (const line of [ZERO_LINE, TOTAL_LINE]) {
    assert.equal(lf.split(line).length - 1, 1, "one exact anchored complete replacement line in its owner");
  }
  const restored = lf.replace(ZERO_LINE, ZERO_LINE.replace("captured", "attributed"))
    .replace(TOTAL_LINE, TOTAL_LINE.replace("captured", "attributed"));
  assert.equal(sha(restored), ORIGINAL_FUNCTION_SHA, "entire original summary function");
  assert.equal(sha(canonical(source.slice(0, start) + source.slice(end))), ORIGINAL_OUTSIDE_SHA,
    "every other declaration and byte remains original");
  const result = source.slice(0, start) + (raw.includes("\r\n") ? restored.replace(/\n/g, "\r\n") : restored) + source.slice(end);
  assert.equal(sha(canonical(result)), ORIGINAL_MODULE_SHA, "entire original module");
  return result;
}
const replaceOnce = (text, before, after) => {
  assert.equal(text.split(before).length, 2, "negative fixture hits exactly one real location");
  return text.replace(before, after);
};

test("two pinned lines restore original complete module, function and outside bytes for LF and CRLF", () => {
  const lf = canonical(read("accessibleData.tsx"));
  for (const newline of ["\n", "\r\n"]) {
    const source = lf.replace(/\n/g, newline), restored = restoreSummary(source);
    assert.equal(sha(canonical(restored)), ORIGINAL_MODULE_SHA);
    assert.equal(restored, canonical(restored).replace(/\n/g, newline), "restore retains the supplied physical newlines");
    const { ast, owner } = summaryOwner(restored);
    assert.equal(sha(canonical(owner.getText(ast))), ORIGINAL_FUNCTION_SHA);
    assert.equal(sha(canonical(restored.slice(0, owner.getStart(ast)) + restored.slice(owner.end))), ORIGINAL_OUTSIDE_SHA);
    assert.match(restored, /No task-attributed events are available\./);
  }
});

test("strict restoration rejects missing, duplicate, partial, moved, wrong-owner and unrelated edits", () => {
  const source = canonical(read("accessibleData.tsx"));
  const { ast, owner } = summaryOwner(source), originalOwner = owner.getText(ast);
  const swapOwner = value => source.slice(0, owner.getStart(ast)) + value + source.slice(owner.end);
  for (const line of [ZERO_LINE, TOTAL_LINE]) {
    for (const replacement of ["", line + line, line.replace("captured", "attributed"), line.replace("captured", "capture")]) {
      assert.throws(() => restoreSummary(swapOwner(replaceOnce(originalOwner, line, replacement))),
        /replacement line|valid actual/, "both exact terms are independently guarded");
    }
  }
  const withoutZero = replaceOnce(originalOwner, ZERO_LINE, "");
  assert.throws(() => restoreSummary(swapOwner(withoutZero.replace("  const rows =", ZERO_LINE + "  const rows ="))),
    /entire original summary function/, "moving an otherwise exact line is not accepted");
  assert.throws(() => restoreSummary(swapOwner(withoutZero) + `\nfunction wrongOwner () {\n${ZERO_LINE}}\n`), /replacement line/);
  assert.throws(() => restoreSummary(source + "\n" + originalOwner), /one complete mode summary owner/);
  assert.throws(() => restoreSummary(source + "\nconst malformed = <;"), /valid actual/);
  for (const [before, after] of [
    ["row.count > best.count", "row.count >= best.count"],
    ["sum + row.count", "sum - row.count"],
    ["Math.round", "Math.floor"],
    ["stats.mode_counts[mode] ?? 0", "stats.mode_counts[mode] ?? 1"],
    ["}%).`", "} percent).`"],
  ]) assert.throws(() => restoreSummary(swapOwner(replaceOnce(originalOwner, before, after))), /entire original summary function/);
  assert.throws(() => restoreSummary(replaceOnce(source, "No task-attributed events are available.",
    "No captured events are available.")), /every other declaration/);
});
