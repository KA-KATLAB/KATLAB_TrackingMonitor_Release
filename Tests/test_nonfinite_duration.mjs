import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const frontend = resolve(root, "Frontend");
const require = createRequire(resolve(frontend, "package.json"));
const ts = require("typescript"), React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const read = file => readFileSync(resolve(frontend, "src", file), "utf8");
const lf = text => text.replace(/\r\n/g, "\n");
const sha = text => createHash("sha256").update(text).digest("hex");
const GUARD = '  if (!Number.isFinite(minutes)) return "Unavailable";\n';
const ORIGINAL_MODULE = "4baa6006aa94b3859fe84741a8fea445156d23d292fcd6b508202136988d3c24";
const ORIGINAL_FUNCTION = "23da3f60ce07a9c9b4eeb1924213b880b68df5f07c57e8f3285ed2df82588c46";
const ORIGINAL_OUTSIDE = "c25696645934c8037ffc369e6a2b29715cbfff3f6f6cc7d8e54f21fb57bb7cb9";
const GUARD_LINE = "b3ee18e99ba782b2c27a5269aaf9f6f30792c19c44f127db35b7b34b58c678e1";
const GUARD_STATEMENT = "f9503f54b65df23ac477605bb422e0aa3854d6821996c018ccff593d8a43d41f";
const parse = (file, text) => ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true,
  file.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
const printer = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed });
const compile = async text => import(`data:text/javascript;base64,${Buffer.from(ts.transpileModule(text, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React },
}).outputText).toString("base64")}`);

function owner (source) {
  assert.equal(source.parseDiagnostics.length, 0, "valid actual formatter syntax");
  const functions = source.statements.filter(node => ts.isFunctionDeclaration(node)
    && node.name?.text === "fmtMinutes");
  assert.equal(functions.length, 1, "one top-level actual duration formatter");
  assert.ok(functions[0].modifiers?.some(node => node.kind === ts.SyntaxKind.ExportKeyword));
  return functions[0];
}

// Invert only the reviewed first statement; unrelated source remains visible.
function restoreGuard (text) {
  const canonical = lf(text), source = parse("format.ts", canonical), fn = owner(source);
  assert.equal(canonical.split(GUARD).length - 1, 1, "one exact reviewed guard line");
  assert.equal(sha(GUARD), GUARD_LINE);
  const first = fn.body.statements[0];
  assert.ok(ts.isIfStatement(first) && !first.elseStatement);
  assert.equal(sha(printer.printNode(ts.EmitHint.Unspecified, first, source)), GUARD_STATEMENT,
    "exact finite-number predicate and generic return");
  assert.equal(first.getText(source), GUARD.trimEnd().slice(2));
  assert.equal(canonical.slice(fn.body.getStart(source) + 1, first.getStart(source)), "\n  ",
    "the guard is the first source statement without another leading addition");
  const start = first.getStart(source) - 2, end = first.end + 1;
  assert.equal(canonical.slice(start, end), GUARD);
  return canonical.slice(0, start) + canonical.slice(end);
}

function verifyOriginal (text) {
  const canonical = lf(text), source = parse("format.ts", canonical), fn = owner(source);
  assert.equal(sha(canonical), ORIGINAL_MODULE, "entire original physical LF module");
  assert.equal(sha(fn.getText(source)), ORIGINAL_FUNCTION, "entire original formatter");
  assert.equal(sha(canonical.slice(0, fn.getStart(source)) + canonical.slice(fn.end)), ORIGINAL_OUTSIDE,
    "all other formatters, imports and comments");
  return canonical;
}

// Before implementation the real original source is accepted here. Strict
// missing-guard tests stay separate so the behavioral OLD RED can execute.
async function originalFormat () {
  const text = read("format.ts");
  return compile(verifyOriginal(lf(text).includes(GUARD) ? restoreGuard(text) : text));
}

function fixtureImports (text, filename) {
  return text.replaceAll("import.meta.url", JSON.stringify(pathToFileURL(filename).href))
    .replace(/(from\s+)(["'])(\.\/helpers\/[^"']+)\2/g, (_, prefix, quote, relative) =>
      prefix + JSON.stringify(pathToFileURL(resolve(dirname(filename), relative)).href));
}

async function existingFixture (name, exports) {
  const filename = resolve(root, "Tests", name);
  let text = readFileSync(filename, "utf8");
  const registration = 'import { test } from "node:test";';
  assert.equal(text.split(registration).length - 1, 1);
  text = text.replace(registration, "const test = () => {};");
  return import(`data:text/javascript;base64,${Buffer.from(fixtureImports(text, filename)
    + `\nexport { ${exports} };\n`).toString("base64")}`);
}

function moduleBody (filename) {
  const text = read(filename), source = parse(filename, text);
  assert.equal(source.parseDiagnostics.length, 0);
  return source.statements.filter(node => !ts.isImportDeclaration(node))
    .map(node => node.getText(source).replace(/^export\s+/, "")).join("\n");
}

let actualFormat, dialogHarness, dependencies, makeHealth, makeReport, healthFixture, reportFixture, generatedAt;
before(async () => {
  actualFormat = await compile(read("format.ts"));
  const filename = resolve(root, "Tests/test_dialog_event_chronology.mjs");
  let text = readFileSync(filename, "utf8");
  const registration = 'import { after, before, test } from "node:test";';
  assert.equal(text.split(registration).length - 1, 1);
  text = text.replace(registration, "let setup, cleanup; const before = fn => { setup = fn; }, "
    + "after = fn => { cleanup = fn; }, test = () => {};");
  dialogHarness = await import(`data:text/javascript;base64,${Buffer.from(fixtureImports(text, filename)
    + "\nexport { setup, cleanup, withDialog, deps, vite };\n").toString("base64")}`);
  await dialogHarness.setup();
  dependencies = Object.assign({}, dialogHarness.deps, ...await Promise.all([
    "healthModel.ts", "appVersion.ts", "calendarHeatmap.tsx", "calendarDay.ts", "download.ts",
    "navigation.ts", "identityData.ts",
  ].map(file => dialogHarness.vite.ssrLoadModule(`/src/${file}`))));
  ({ make: makeHealth } = await compile(`export function make(React, deps) {
    const { useEffect, useRef, useState } = React;
    const { CollectionPager, useBoundedPage, decodeAppVersion, UI_BUILD_VERSION,
      decodeChronicleHealth, hookRegistrationLabel, fmtMinutes, fmtTs, fmtRel } = deps;
    ${moduleBody("healthPanel.tsx")}
    return HealthBody;
  }`));
  ({ make: makeReport } = await compile(`export function make(deps) {
    const { RAMP, rampBucket, calendarRangeLabel, startBlobDownload, fmtMinutes,
      scopeFileToken, buildIdentityData } = deps;
    ${moduleBody("reportHtml.ts")}
    return buildReportHtml;
  }`));
  ({ healthFixture } = await existingFixture("test_health_ui.mjs", "healthFixture"));
  ({ fixture: reportFixture, generatedAt } = await existingFixture("test_report_snapshot.mjs", "fixture, generatedAt"));
});
after(async () => { await dialogHarness?.cleanup?.(); });

function deepFreeze (value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze); Object.freeze(value);
  }
  return value;
}

test("actual shared formatter nonfinite durations are unavailable", () => {
  for (const value of [NaN, Infinity, -Infinity]) {
    assert.equal(actualFormat.fmtMinutes(value), "Unavailable", `actual original ${String(value)} output`);
  }
});

test("all finite outputs match the verified actual original, including signed zero and extremes", async () => {
  const original = await originalFormat();
  const values = [-Number.MAX_VALUE, -Number.MAX_SAFE_INTEGER, -1440, -60, -2, -0.5, -0,
    0, Number.MIN_VALUE, Number.EPSILON, 0.5, 1.5, Math.PI, 59, 59.999, 60, 60.001, 61,
    120, 1440, 1e12, Number.MAX_SAFE_INTEGER, Number.MAX_VALUE];
  for (const value of values) assert.equal(actualFormat.fmtMinutes(value), original.fmtMinutes(value),
    `actual original finite ${Object.is(value, -0) ? "-0" : String(value)}`);
  for (const name of ["fmtTs", "fmtRel", "fmtAge"]) assert.equal(typeof actualFormat[name], "function");
});

function event (id, timestamp) {
  return Object.freeze({ id, ts: timestamp, repo_id: "A", file: `src/${id}.ts`, provider: "codex",
    session_id: "session-A", tool: "Edit", mode: "B", task_ref: "plan - A.1", commit_hash: null });
}

for (const name of ["FileStory", "SessionTimeline"]) {
  test(`actual ${name} admitted malformed windows render unavailable effort`, async () => {
    const windows = [[event(1, "single-malformed")],
      [event(3, "mixed-malformed"), event(2, "2026-10-06T01:00:00.900Z"), event(1, "2026-10-06T01:00:00Z")],
      [event(3, "bad-three"), event(1, "bad-one"), event(2, "bad-two")]];
    for (const page of windows) await dialogHarness.withDialog(name, [Object.freeze(page)], async h => {
      await h.settle();
      assert.match(h.html, /Unavailable/, "admitted malformed timestamp makes effort unavailable, not a guessed number");
      assert.doesNotMatch(h.html, /NaNh|NaNm|Infinity/);
      assert.equal(h.states[0].length, page.length);
      for (const row of page) { assert.ok(h.states[0].includes(row)); assert.ok(h.html.includes(row.ts)); }
      assert.equal(h.calls.length, 1); assert.deepEqual(h.status, []); assert.equal(h.timers.size, 0);
      assert.deepEqual(Object.fromEntries(h.calls[0].query), name === "FileStory"
        ? { repo: "A", file: "src/file.ts", limit: "500", offset: "0" }
        : { provider: "codex", session: "session-A", limit: "500", offset: "0" });
    });
  });

  test(`actual ${name} valid and empty complete-dialog HTML matches the actual original formatter`, async () => {
    const original = await originalFormat(), current = dialogHarness.deps.fmtMinutes;
    try {
      for (const page of [[], [event(1, "2026-10-06T01:00:00Z")],
        [event(3, "2026-10-06T01:15:00.100Z"), event(2, "2026-10-06T01:00:00.900Z"), event(1, "2026-10-06T01:00:00Z")]]) {
        let expected;
        dialogHarness.deps.fmtMinutes = original.fmtMinutes;
        await dialogHarness.withDialog(name, [Object.freeze(page)], async h => { await h.settle(); expected = h.html; });
        dialogHarness.deps.fmtMinutes = current;
        await dialogHarness.withDialog(name, [page], async h => {
          await h.settle(); assert.equal(h.html, expected);
          assert.equal(h.calls.length, 1); assert.deepEqual(h.status, []); assert.equal(h.timers.size, 0);
        });
      }
    } finally { dialogHarness.deps.fmtMinutes = current; }
  });
}

function renderHealth (data, format) {
  const HealthBody = makeHealth(React, { ...dependencies, ...format });
  return renderToStaticMarkup(React.createElement(HealthBody, { data, receivedAt: "2026-10-06T01:00:00Z" }));
}

test("actual decoded-valid HealthBody uptime HTML remains byte-identical", async () => {
  const original = await originalFormat(), data = healthFixture(), saved = structuredClone(data);
  assert.equal(dependencies.decodeHealthPayload(data), data); deepFreeze(data);
  assert.equal(renderHealth(data, actualFormat), renderHealth(data, original));
  assert.deepEqual(data, saved);
});

test("actual HealthBody unsupported invalid direct props are only a controlled formatter boundary", () => {
  const data = healthFixture(); data.server.started_ts = "malformed-direct-prop";
  assert.equal(dependencies.decodeHealthPayload(data), null, "the real health API decoder rejects this input");
  deepFreeze(data);
  const html = renderHealth(data, actualFormat);
  assert.match(html, /uptime<\/span><span[^>]*>Unavailable<\/span>/);
  assert.doesNotMatch(html, /NaNh|NaNm|Infinity/);
});

test("actual complete 7d and 30d report HTML preserves finite scope, escaping and frozen data", async () => {
  const original = await originalFormat();
  const build = makeReport({ ...dependencies, ...actualFormat });
  const baseline = makeReport({ ...dependencies, ...original });
  for (const range of [7, 30]) for (const scope of [undefined, "<scope>&label"]) {
    const stats = reportFixture(); stats.effort_per_task = [{ repo: "<repo>&label", task_ref: "<task>&label", minutes: 60.5, sessions: 1 }];
    const saved = structuredClone(stats); deepFreeze(stats);
    const html = build(stats, scope, range, generatedAt());
    assert.equal(html, baseline(stats, scope, range, generatedAt())); assert.deepEqual(stats, saved);
    assert.match(html, /&lt;repo&gt;&amp;label/); assert.match(html, /&lt;task&gt;&amp;label/);
    assert.doesNotMatch(html, /<repo>|<task>|<scope>/);
  }
});

test("actual report nonfinite direct task inputs are controlled boundaries, not JSON admission", () => {
  const build = makeReport({ ...dependencies, ...actualFormat });
  for (const range of [7, 30]) for (const minutes of [NaN, Infinity, -Infinity]) {
    const stats = reportFixture(); stats.effort_per_task = [{ repo: "Probe", task_ref: "boundary-task", minutes, sessions: 1 }];
    const saved = structuredClone(stats); deepFreeze(stats);
    const html = build(stats, "Probe", range, generatedAt());
    assert.match(html, /boundary-task<\/td><td style="text-align:right">Unavailable<\/td>/);
    assert.doesNotMatch(html, /NaNh|NaNm|Infinity/); assert.deepEqual(stats, saved);
  }
});

test("the exact first-guard inverse preserves the original module, function and outside bytes in LF and CRLF", () => {
  const text = lf(read("format.ts"));
  for (const variant of [text, text.replace(/\n/g, "\r\n")]) verifyOriginal(restoreGuard(variant));
});

test("guard structural mutations are refused without masking unrelated original-source edits", () => {
  const text = lf(read("format.ts"));
  assert.equal(text.split(GUARD).length - 1, 1);
  const move = text.replace(GUARD, "").replace('  if (minutes < 60) return `≈ ${minutes}m`;\n',
    '  if (minutes < 60) return `≈ ${minutes}m`;\n' + GUARD);
  const mutations = [text.replace(GUARD, ""), text.replace(GUARD, GUARD + GUARD), move,
    text.replace("export function fmtMinutes", "export function AnotherFormatter"),
    text.replace("Number.isFinite(minutes)", "isFinite(minutes)"),
    text.replace("Number.isFinite(minutes)", "Number.isFinite(0)"),
    text.replace("Number.isFinite(minutes)", "Number.isFinite?.(minutes)"),
    text.replace('return "Unavailable";', 'return "Effort unavailable";'),
    text.replace(GUARD, GUARD.trimStart()), text.replace(GUARD, GUARD.trimEnd() + " else return 0;\n"),
    text.replace(GUARD, '  if (!Number.isFinite(minutes)) { return "Unavailable"; }\n'),
    text + "\nconst malformed = ;\n"];
  for (const changed of mutations) for (const variant of [changed, changed.replace(/\n/g, "\r\n")]) {
    assert.throws(() => restoreGuard(variant), assert.AssertionError);
  }
  const unrelated = [text.replace("minutes < 60", "minutes <= 60"),
    text.replace("Math.floor(minutes / 60)", "Math.round(minutes / 60)"),
    text.replace("if (minutes < 60)", 'if (minutes === 0) return "Unknown";\n  if (minutes < 60)'),
    text.replace("const d = new Date(iso);", "const d = new Date();"),
    'import "./unexpected";\n' + text,
    text.replace("// Display-side time formatting", "// Changed time formatting"),
    text.replace("export function fmtAge", "export function fmtChangedAge")];
  for (const changed of unrelated) for (const variant of [changed, changed.replace(/\n/g, "\r\n")]) {
    assert.doesNotThrow(() => restoreGuard(variant), "unrelated source is not removed by the narrow inverse");
    assert.throws(() => verifyOriginal(restoreGuard(variant)), assert.AssertionError);
  }
});
