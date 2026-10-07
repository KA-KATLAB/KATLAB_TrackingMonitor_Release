import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(new URL("../../Frontend/package.json", import.meta.url));
const ts = require("typescript");
const sha = value => createHash("sha256").update(value).digest("hex");
const freeze = spec => Object.freeze({ ...spec,
  windows: Object.freeze(spec.windows.map(window => Object.freeze(window))) });

export const FILE_STORY_EVIDENCE_SOURCE = freeze({
  "path": "Frontend/src/FileStory.tsx",
  "beforeLfSha": "b4025a9f62f1177e9db82127652ee76a083defb07447b13664c82e356676ec10",
  "beforeRawSha": "e9d9a615ed57319ee0a6c3c05a0f313dd8c386e597e9ae65b94691add99d6b6b",
  "afterLfSha": "6acefc128d858ce0be5e6d1653776ab2dad2ca699d3ffaec8ed79050c78eb706",
  "afterRawSha": "eb04d35d055f50f717c1943564bb5d5fce397487d8aa06c5a4c7ac990b335c0b",
  "windows": [
    {
      "name": "summary",
      "before": "      <>\n        <span>{repo}</span>\n        <span aria-hidden=\"true\"> · </span>\n        <span>\n          {rows.length} event{rows.length === 1 ? \"\" : \"s\"} · {fmtTs(rows[0].ts)}\n          {\" → \"}{fmtTs(rows[rows.length - 1].ts)} · {commits} commit\n          {commits === 1 ? \"\" : \"s\"} · {fmtMinutes(effortMin)}\n          {limitReached ? \" (fetched window)\" : \"\"}\n        </span>\n      </>\n",
      "after": "      <span data-file-story-summary className=\"grid min-w-0 gap-2\">\n        <span data-file-story-fact=\"repository\" className=\"min-w-0 break-words text-base font-semibold leading-6 text-ui-text\">\n          {repo}\n        </span>\n        <span data-file-story-fact=\"range\" className=\"min-w-0 break-words\">\n          <span>\n            {rows.length} event{rows.length === 1 ? \"\" : \"s\"} · {fmtTs(rows[0].ts)}\n            {\" → \"}{fmtTs(rows[rows.length - 1].ts)} · {commits} commit\n            {commits === 1 ? \"\" : \"s\"} · {fmtMinutes(effortMin)}\n            {limitReached ? \" (fetched window)\" : \"\"}\n          </span>\n        </span>\n      </span>\n"
    },
    {
      "name": "row",
      "before": "              <div className=\"ui-work-row flex-wrap items-center !px-3 !py-3\">\n                <span className=\"text-xs text-ui-muted\" title={event.ts}>{fmtTs(event.ts)}</span>\n                <span\n                  className=\"rounded px-1.5 py-0.5 text-xs font-bold text-white\"\n                  style={{ backgroundColor: MODE_COLOR[event.mode], color: MODE_BADGE[event.mode].foreground }}\n                >\n                  {MODE_BADGE[event.mode].label}\n                </span>\n                {event.task_ref && (\n                  <span className=\"min-w-0 break-words text-sky-300\">\n                    {event.task_ref.split(\" - \").pop()}\n                  </span>\n                )}\n                {session && (\n                  <span\n                    title={`${session.provider} session ${session.sessionId.slice(0, 8)}`}\n                    className=\"inline-block h-2 w-2 shrink-0 rounded-full\"\n                    style={{ backgroundColor: sessionColor(session.provider, session.sessionId) }}\n                  />\n                )}\n                {event.branch && repoBranch && event.branch !== repoBranch && (\n                  <span\n                    className=\"min-w-0 break-all text-amber-300/80\"\n                    title=\"captured on a different branch than the repo is on now\"\n                  >\n                    ⎇ {event.branch}\n                  </span>\n                )}\n              </div>\n",
      "after": "              <div data-file-story-row className=\"ui-work-row grid min-w-0 grid-cols-1 gap-3 !px-3 !py-3 sm:grid-cols-[minmax(7rem,10rem)_minmax(0,1fr)]\">\n                <span className=\"min-w-0 text-xs text-ui-muted [overflow-wrap:anywhere]\" title={event.ts}>{fmtTs(event.ts)}</span>\n                <div data-file-story-evidence className=\"flex min-w-0 flex-wrap items-center gap-3\">\n                  <span\n                    className=\"rounded px-1.5 py-0.5 text-xs font-bold text-white\"\n                    style={{ backgroundColor: MODE_COLOR[event.mode], color: MODE_BADGE[event.mode].foreground }}\n                  >\n                    {MODE_BADGE[event.mode].label}\n                  </span>\n                  {event.task_ref && (\n                    <span className=\"min-w-0 break-words text-sky-300\">\n                      {event.task_ref.split(\" - \").pop()}\n                    </span>\n                  )}\n                  {session && (\n                    <span\n                      title={`${session.provider} session ${session.sessionId.slice(0, 8)}`}\n                      className=\"inline-block h-2 w-2 shrink-0 rounded-full\"\n                      style={{ backgroundColor: sessionColor(session.provider, session.sessionId) }}\n                    />\n                  )}\n                  {event.branch && repoBranch && event.branch !== repoBranch && (\n                    <span\n                      className=\"min-w-0 break-all text-amber-300/80\"\n                      title=\"captured on a different branch than the repo is on now\"\n                    >\n                      ⎇ {event.branch}\n                    </span>\n                  )}\n                </div>\n              </div>\n"
    }
  ]
});
export const FILE_STORY_EVIDENCE_SUITES = Object.freeze([
  {
    "path": "Tests/test_dialog_event_chronology.mjs",
    "beforeSha": "869b0430b5a7012389705f8f2f41b3fef761b78444dc5e6cfc7cf2999282a60f",
    "afterSha": "0a1574cab9994cc540cc2a1829ee2b310890d44e095dd895dc27e140b840932d",
    "windows": [
      {
        "before": "import { restoreSessionTaskGroups } from \"./helpers/sessionTaskGroups.mjs\";\n",
        "after": "import { restoreSessionTaskGroups } from \"./helpers/sessionTaskGroups.mjs\";\nimport { restoreFileStoryEvidenceTimeline } from \"./helpers/fileStoryEvidenceTimeline.mjs\";\n"
      },
      {
        "before": "    const text = lf(read(`${pins[0]}.tsx`)); checkOriginal(crlf ? text.replace(/\\n/g, \"\\r\\n\") : text, pins);\n",
        "after": "    const text = lf(restoreFileStoryEvidenceTimeline(read(`${pins[0]}.tsx`), pins[0])); checkOriginal(crlf ? text.replace(/\\n/g, \"\\r\\n\") : text, pins);\n"
      },
      {
        "before": "    const name = pins[0], text = lf(read(`${name}.tsx`));\n",
        "after": "    const name = pins[0], text = lf(restoreFileStoryEvidenceTimeline(read(`${name}.tsx`), name));\n"
      }
    ]
  },
  {
    "path": "Tests/test_event_page_identity.mjs",
    "beforeSha": "b91bb05ab029bd639060ec50adb33be2195d2630fe31d8150a39a8d1a566c675",
    "afterSha": "dc065b200c2cb6eadcf1d5ae7c57d0f785db891880d2825a5fd13ba1609748a4",
    "windows": [
      {
        "before": "import { restoreSessionTaskGroups } from \"./helpers/sessionTaskGroups.mjs\";\n",
        "after": "import { restoreSessionTaskGroups } from \"./helpers/sessionTaskGroups.mjs\";\nimport { restoreFileStoryEvidenceTimeline } from \"./helpers/fileStoryEvidenceTimeline.mjs\";\n"
      },
      {
        "before": "    const text = read(file);\n    for (const variant of [text.replace(/\\r\\n/g, \"\\n\"), text.replace(/\\r?\\n/g, \"\\r\\n\")]) {\n",
        "after": "    const text = restoreFileStoryEvidenceTimeline(read(file), name);\n    for (const variant of [text.replace(/\\r\\n/g, \"\\n\"), text.replace(/\\r?\\n/g, \"\\r\\n\")]) {\n"
      },
      {
        "before": "    const text = read(file), marker = `appendUniqueEvents(${target},`;\n",
        "after": "    const text = restoreFileStoryEvidenceTimeline(read(file), name), marker = `appendUniqueEvents(${target},`;\n"
      }
    ]
  }
].map(freeze));

function decoded (input) {
  assert.ok(typeof input === "string" || Buffer.isBuffer(input), "text or Buffer input");
  const text = typeof input === "string" ? input : new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(input);
  assert.ok(!text.startsWith("\uFEFF"), "no UTF-8 BOM");
  assert.equal(Buffer.from(text).toString("utf8"), text, "lossless UTF-8 scalar text");
  const lf = text.replace(/\r\n/g, "\n");
  assert.ok(!lf.includes("\r"), "no bare carriage return");
  assert.ok(!text.includes("\r\n") || !/(?<!\r)\n/.test(text), "unmixed LF or CRLF");
  assert.ok(text.endsWith("\n"), "one physical final newline");
  assert.ok(!lf.endsWith("\n\n"), "no extra final blank line");
  return { lf, crlf: text.includes("\r\n"), buffer: Buffer.isBuffer(input) };
}

function encoded (decodedInput, lf) {
  const text = decodedInput.crlf ? lf.replace(/\n/g, "\r\n") : lf;
  return decodedInput.buffer ? Buffer.from(text, "utf8") : text;
}

function ast (path, text) {
  const parsed = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.JS);
  assert.equal(parsed.parseDiagnostics.length, 0, "complete actual syntax");
  return parsed;
}

function descendants (root, predicate) {
  const result = [];
  const walk = node => { if (predicate(node)) result.push(node); ts.forEachChild(node, walk); };
  walk(root); return result;
}

function tag (node, source) {
  return node.openingElement.tagName.getText(source);
}

function hasAttribute (node, name) {
  return node.openingElement.attributes.properties.some(attribute =>
    ts.isJsxAttribute(attribute) && attribute.name.getText() === name);
}

function sourceSites (text, spec) {
  const parsed = ast(spec.path, text);
  const owners = parsed.statements.filter(node => ts.isFunctionDeclaration(node)
    && node.name?.text === "FileStory");
  assert.equal(owners.length, 1, "one actual FileStory owner");
  assert.ok(owners[0].modifiers?.some(node => node.kind === ts.SyntaxKind.ExportKeyword),
    "actual exported dialog owner");
  const summaryDeclarations = descendants(owners[0], node =>
    ts.isVariableDeclaration(node) && node.name.getText(parsed) === "summary");
  assert.equal(summaryDeclarations.length, 1, "one owned actual summary");
  let summary = summaryDeclarations[0].initializer;
  assert.ok(ts.isConditionalExpression(summary), "unchanged conditional summary");
  summary = summary.whenTrue;
  while (ts.isParenthesizedExpression(summary)) summary = summary.expression;
  assert.ok(ts.isJsxElement(summary) && tag(summary, parsed) === "span"
    && hasAttribute(summary, "data-file-story-summary"), "owned data-only summary span");
  const maps = descendants(owners[0], node => ts.isCallExpression(node)
    && node.expression.getText(parsed) === "visibleRows.map");
  assert.equal(maps.length, 1, "one unchanged current bounded row map");
  assert.equal(maps[0].arguments.length, 1, "one actual callback");
  const callback = maps[0].arguments[0];
  assert.ok(ts.isArrowFunction(callback) && ts.isBlock(callback.body),
    "actual owned row callback");
  const rows = descendants(callback.body, node => ts.isJsxElement(node)
    && hasAttribute(node, "data-file-story-row"));
  assert.equal(rows.length, 1, "one owned timeline row");
  assert.equal(tag(rows[0], parsed), "div", "native existing row node retained");
  for (const [node, window, indent] of [[summary, spec.windows[0], 6], [rows[0], spec.windows[1], 14]]) {
    assert.equal(text.split(window.after).length - 1, 1, "one complete reviewed render window");
    const start = text.indexOf(window.after);
    assert.equal(start + indent, node.getStart(parsed), "reviewed exact owner position");
    assert.equal(start + window.after.length - 1, node.end, "complete JSX node and final LF");
  }
}

function inverse (text, spec) {
  assert.equal(sha(text), spec.afterLfSha ?? spec.afterSha, "whole reviewed current LF input");
  let restored = text;
  for (const window of [...spec.windows].reverse()) {
    assert.equal(restored.split(window.after).length - 1, 1, "one exact inverse window");
    restored = restored.replace(window.after, window.before);
  }
  assert.equal(sha(restored), spec.beforeLfSha ?? spec.beforeSha, "entire published LF inverse");
  ast(spec.path, restored);
  return restored;
}

// Preservation inputs only. Production source/runtime readers stay current.
// Older adversaries mutate the restored baseline AFTER this strict inverse.
export function restoreFileStoryEvidenceTimeline (input, name) {
  assert.ok(["FileStory", "SessionTimeline", "loadDayEvents"].includes(name),
    "only actual reviewed preservation owners");
  if (name !== "FileStory") return input;
  const value = decoded(input), spec = FILE_STORY_EVIDENCE_SOURCE;
  sourceSites(value.lf, spec);
  const restored = inverse(value.lf, spec), result = encoded(value, restored);
  const raw = Buffer.isBuffer(result) ? result : Buffer.from(result, "utf8");
  assert.equal(sha(raw), value.crlf ? spec.beforeRawSha : spec.beforeLfSha,
    "complete native reviewed source inverse");
  return result;
}

export function restoreFileStoryEvidenceTimelineSuite (path, input) {
  const spec = FILE_STORY_EVIDENCE_SUITES.find(entry => entry.path === path);
  assert.ok(spec, "only two exact reviewed old-suite owners");
  const value = decoded(input), parsed = ast(path, value.lf);
  const imports = parsed.statements.filter(node => ts.isImportDeclaration(node)
    && node.moduleSpecifier.text === "./helpers/fileStoryEvidenceTimeline.mjs");
  assert.equal(imports.length, 1, "one new preservation-only helper import");
  const calls = descendants(parsed, node => ts.isCallExpression(node)
    && node.expression.getText(parsed) === "restoreFileStoryEvidenceTimeline");
  assert.equal(calls.length, 2, "positive and baseline-before-adversary inputs only");
  return encoded(value, inverse(value.lf, spec));
}
