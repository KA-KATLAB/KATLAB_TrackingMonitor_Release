import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  FILE_STORY_EVIDENCE_SOURCE, FILE_STORY_EVIDENCE_SUITES,
  restoreFileStoryEvidenceTimeline, restoreFileStoryEvidenceTimelineSuite,
} from "./helpers/fileStoryEvidenceTimeline.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(resolve(root, "Frontend/package.json"));
const React = require("react"), ts = require("typescript");
const { renderToStaticMarkup } = require("react-dom/server");
const read = path => readFileSync(resolve(root, path));
const sha = value => createHash("sha256").update(value).digest("hex");
const lf = text => text.replace(/\r\n/g, "\n");
const nodes = node => Array.isArray(node) ? node.flatMap(nodes)
  : React.isValidElement(node) ? [node, ...nodes(node.props.children)] : [];
const rowsOf = tree => nodes(tree).filter(node => node.props["data-file-story-row"] !== undefined);
const keyedRows = tree => nodes(tree).filter(node => node.type === "div" && node.key !== null);
const summaryOf = tree => nodes(tree.props.description).filter(node => node.props["data-file-story-summary"] !== undefined);
const evidenceOf = row => nodes(row).filter(node => node.props["data-file-story-evidence"] !== undefined);
const htmlOf = tree => renderToStaticMarkup(React.createElement(React.Fragment, null, tree));
const event = (id, extra = {}) => Object.freeze({
  id, ts: new Date(Date.UTC(2026, 9, 6, 8, 0, id)).toISOString(),
  repo_id: "A", file: "src/file.ts", provider: "codex", session_id: "session-A",
  tool: "Edit", mode: "B", task_ref: "plan - A.1", commit_hash: null, ...extra,
});
let harness;

function fixtureImports (text, filename) {
  return text.replaceAll("import.meta.url", JSON.stringify(pathToFileURL(filename).href))
    .replace(/(from\s+)(["'])(\.\/helpers\/[^"']+)\2/g, (_match, prefix, _quote, relative) =>
      prefix + JSON.stringify(pathToFileURL(resolve(dirname(filename), relative)).href));
}

before(async () => {
  const filename = resolve(root, "Tests/test_dialog_event_chronology.mjs");
  let text = readFileSync(filename, "utf8");
  const registration = 'import { after, before, test } from "node:test";';
  assert.equal(text.split(registration).length - 1, 1, "one existing controlled registration");
  text = text.replace(registration,
    "let setup, cleanup; const before = fn => { setup = fn; }, "
    + "after = fn => { cleanup = fn; }, test = () => {};");
  // Actual current FileStory factory; never restored historical production JS.
  harness = await import("data:text/javascript;base64," + Buffer.from(
    fixtureImports(text, filename) + "\nexport { setup, cleanup, withDialog, deps };\n",
  ).toString("base64"));
  await harness.setup();
});
after(async () => { await harness?.cleanup?.(); });

test("two complete render inverses preserve native source, LF, CRLF and Buffer identity", () => {
  const raw = read(FILE_STORY_EVIDENCE_SOURCE.path), current = lf(raw.toString("utf8"));
  assert.equal(sha(raw), FILE_STORY_EVIDENCE_SOURCE.afterRawSha);
  assert.equal(sha(current), FILE_STORY_EVIDENCE_SOURCE.afterLfSha);
  assert.equal(FILE_STORY_EVIDENCE_SOURCE.windows.length, 2);
  const baseline = FILE_STORY_EVIDENCE_SOURCE.windows.reduce(
    (text, window) => text.replace(window.after, window.before), current);
  for (const crlf of [false, true]) for (const buffer of [false, true]) {
    const text = crlf ? current.replace(/\n/g, "\r\n") : current;
    const result = restoreFileStoryEvidenceTimeline(buffer ? Buffer.from(text) : text, "FileStory");
    assert.equal(Buffer.isBuffer(result), buffer);
    const restored = buffer ? result.toString("utf8") : result;
    assert.equal(restored, crlf ? baseline.replace(/\n/g, "\r\n") : baseline);
    assert.equal(sha(Buffer.from(restored)),
      crlf ? FILE_STORY_EVIDENCE_SOURCE.beforeRawSha : FILE_STORY_EVIDENCE_SOURCE.beforeLfSha);
  }
  for (const name of ["SessionTimeline", "loadDayEvents"]) {
    const untouched = Buffer.from("untouched non-target");
    assert.equal(restoreFileStoryEvidenceTimeline(untouched, name), untouched);
  }
});

test("source inverse rejects partial, duplicate, moved and unrelated current source mutations", () => {
  const current = lf(read(FILE_STORY_EVIDENCE_SOURCE.path).toString("utf8"));
  const [summary, row] = FILE_STORY_EVIDENCE_SOURCE.windows;
  const cases = [
    current.replace(summary.after, summary.before), current.replace(row.after, row.before),
    current.replace(summary.after, summary.after + summary.after),
    current.replace(row.after, row.after + row.after),
    current.replace(row.after, "").replace("        {visibleRows.map", row.after + "        {visibleRows.map"),
    current.replace("data-file-story-summary", "data-other-summary"),
    current.replace("data-file-story-row", "data-other-row"),
    current.replace("data-file-story-evidence", "data-other-evidence"),
    current.replace("sm:grid-cols-[minmax(7rem,10rem)_minmax(0,1fr)]", "sm:grid-cols-2"),
    current.replace("setBusy(true);", "setBusy(false);"),
    current.replace("action.controller.abort();", "action.clear();"),
    current.replace("page.length < API_PAGE", "page.length <= API_PAGE"),
    current.replace("Number.isFinite(left) ? left : Infinity", "left"),
    current.replace("a.id - b.id", "b.id - a.id"),
    current.replace('identity: ["file-story", repo, file]', 'identity: ["file-story", file]'),
    current.replace("EFFORT_TAIL_MIN * 60_000", "0"),
    current.replace("export function FileStory", "export function Other"),
    current + "\n", "\uFEFF" + current,
    current.replace("\n", "\r\n"), current.replace("\n", "\r"),
    current + "const broken = ;\n",
  ];
  for (const candidate of cases) {
    assert.notEqual(candidate, current, "negative changes actual current source");
    assert.throws(() => restoreFileStoryEvidenceTimeline(candidate, "FileStory"));
  }
  assert.throws(() => restoreFileStoryEvidenceTimeline(Buffer.from([0xff, 0xfe]), "FileStory"));
  assert.throws(() => restoreFileStoryEvidenceTimeline(current, "Other"));
});

test("both old suites preserve all original bytes and mutate baselines before their original guards", () => {
  assert.equal(FILE_STORY_EVIDENCE_SUITES.length, 2);
  for (const spec of FILE_STORY_EVIDENCE_SUITES) {
    const current = lf(read(spec.path).toString("utf8"));
    assert.equal(sha(current), spec.afterSha);
    assert.equal(spec.windows.length, 3, "one import and two preservation-input adapters");
    for (const crlf of [false, true]) for (const buffer of [false, true]) {
      const text = crlf ? current.replace(/\n/g, "\r\n") : current;
      const restored = restoreFileStoryEvidenceTimelineSuite(spec.path, buffer ? Buffer.from(text) : text);
      assert.equal(Buffer.isBuffer(restored), buffer);
      assert.equal(sha(lf(buffer ? restored.toString("utf8") : restored)), spec.beforeSha);
    }
    for (const window of spec.windows) {
      assert.throws(() => restoreFileStoryEvidenceTimelineSuite(spec.path, current.replace(window.after, window.before)));
      assert.throws(() => restoreFileStoryEvidenceTimelineSuite(spec.path, current.replace(window.after, window.after + window.after)));
    }
    for (const invalid of [current + "\n", "\uFEFF" + current]) {
      assert.throws(() => restoreFileStoryEvidenceTimelineSuite(spec.path, invalid));
    }
    const parsed = ts.createSourceFile(spec.path, current, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    assert.equal(parsed.parseDiagnostics.length, 0);
    assert.ok(current.includes("const ast = parse("), "actual runtime parser stays present");
    assert.ok(current.includes("assert.throws("), "original negative assertions remain present");
  }
});

test("current summary has data-only facts and retains real range, count, commit and effort text", async () => {
  const input = [event(1, { commit_hash: "same" }), event(2, { commit_hash: "same" })];
  await harness.withDialog("FileStory", [input], async h => {
    await h.settle();
    const groups = summaryOf(h.tree); assert.equal(groups.length, 1);
    assert.equal(groups[0].type, "span"); assert.equal(groups[0].props.role, undefined);
    assert.equal(groups[0].props["aria-label"], undefined);
    const facts = nodes(groups[0]).filter(node => node.props["data-file-story-fact"]);
    assert.deepEqual(facts.map(node => node.props["data-file-story-fact"]), ["repository", "range"]);
    for (const fact of facts) {
      assert.equal(fact.type, "span"); assert.equal(fact.props.role, undefined);
      assert.equal(fact.props["aria-label"], undefined);
    }
    assert.match(htmlOf(facts[0]), />A<\/span>$/);
    const range = htmlOf(facts[1]);
    assert.match(range, /2 events/); assert.match(range, /1 commit/);
    assert.ok(range.includes(harness.deps.fmtTs(input[0].ts)));
    assert.ok(range.includes(harness.deps.fmtTs(input[1].ts)));
    assert.ok(range.includes(harness.deps.fmtMinutes(harness.deps.EFFORT_TAIL_MIN)));
    assert.equal(h.states[0][0], input[0]); assert.equal(h.states[0][1], input[1]);
  });
});

test("pending and empty retain original repository fallback and no invented facts", async () => {
  await harness.withDialog("FileStory", [[]], async h => {
    assert.equal(h.tree.props.description, "A"); assert.match(h.html, /Loading file story/);
    assert.equal(summaryOf(h.tree).length, 0); assert.equal(rowsOf(h.tree).length, 0);
    await h.settle();
    assert.equal(h.tree.props.description, "A"); assert.match(h.html, /No events for this file/);
    assert.equal(summaryOf(h.tree).length, 0); assert.equal(rowsOf(h.tree).length, 0);
    assert.doesNotMatch(h.html, /events: next page|fetched window/);
  });
});

test("current two-cell rows preserve all MODE, optional sessions, branch truth and escaping", async () => {
  await harness.withDialog("FileStory", [[event(1)]], async h => {
    await h.settle(); h.props.repoBranch = "main";
    for (const mode of Object.keys(harness.deps.MODE_BADGE)) for (const provider of ["codex", "claude", null]) {
      const value = event(1, { mode, provider, session_id: provider ? "provider-session" : null,
        task_ref: "plan - <task>&.1", branch: "<branch>&" });
      h.states[0] = [value]; h.render();
      const row = rowsOf(h.tree); assert.equal(row.length, 1);
      const cells = React.Children.toArray(row[0].props.children);
      assert.equal(cells.length, 2); assert.equal(cells[0].type, "span");
      assert.equal(cells[0].props.title, value.ts); assert.equal(cells[1].type, "div");
      assert.equal(evidenceOf(row[0]).length, 1);
      assert.ok(row[0].props.className.startsWith("ui-work-row "));
      const badge = nodes(cells[1]).find(node => node.props.style?.backgroundColor === harness.deps.MODE_COLOR[mode]);
      assert.ok(badge); assert.equal(badge.props.style.color, harness.deps.MODE_BADGE[mode].foreground);
      assert.ok(htmlOf(badge).includes(harness.deps.MODE_BADGE[mode].label));
      const sessions = nodes(cells[1]).filter(node => /^(codex|claude) session /.test(node.props.title ?? ""));
      assert.equal(sessions.length, provider ? 1 : 0);
      assert.match(h.html, /&lt;task&gt;&amp;\.1/); assert.match(h.html, /&lt;branch&gt;&amp;/);
      assert.doesNotMatch(h.html, /<task>|<branch>/);
      assert.equal(keyedRows(h.tree).length, 1); assert.equal(String(keyedRows(h.tree)[0].key), "1");
    }
    for (const [branch, current, shown] of [["main", "main", false], ["other", null, false], ["other", "main", true]]) {
      h.states[0] = [event(1, { branch })]; h.props.repoBranch = current; h.render();
      assert.equal(nodes(h.tree).some(node => node.props.title === "captured on a different branch than the repo is on now"), shown);
    }
  });
});

test("long current file, repository, task and branch labels retain text and original editor/Close wiring", async () => {
  await harness.withDialog("FileStory", [[event(1)]], async h => {
    await h.settle();
    const close = h.tree.props.onClose; assert.equal(close, h.props.onClose);
    assert.equal(h.tree.props.closeLabel, "Close file story"); assert.equal(h.tree.props.backdropClose, true);
    assert.equal(h.tree.props.headerActions, null);
    const long = "<long>&" + "x".repeat(512);
    h.props.file = "<folder>/long#file.ts"; h.props.repoPath = "D:\\repo folder"; h.props.repo = long;
    h.props.repoBranch = "main"; h.states[0] = [event(1, { task_ref: "plan - " + long, branch: long })];
    h.render();
    const editor = h.tree.props.headerActions; assert.equal(editor.type, "a");
    assert.equal(editor.props.href, "vscode://file/D:/repo%20folder/%3Cfolder%3E/long%23file.ts");
    assert.equal(editor.props.title, "Open in VS Code"); assert.equal(h.tree.props.onClose, close);
    assert.match(htmlOf(h.tree.props.title), /&lt;folder&gt;/);
    assert.match(h.html, /&lt;long&gt;&amp;x{512}/); assert.doesNotMatch(h.html, /<long>/);
  });
});

test("errors, retry and retained rows still execute actual API/hooks rather than a copied state model", async () => {
  await harness.withDialog("FileStory", [], async h => {
    await h.settle(); assert.match(h.html, />Retry<\/button>/); assert.equal(rowsOf(h.tree).length, 0);
    const retry = nodes(h.tree).find(node => node.type === "button" && node.props.children === "Retry");
    assert.ok(retry); assert.equal(retry.props.disabled, false);
    retry.props.onClick(); h.render(); h.runEffects(); await h.settle();
    assert.equal(rowsOf(h.tree).length, 1); assert.ok(h.status.includes("File story recovered."));
    h.props.file = "changed-file.ts"; h.render(); h.runEffects();
    assert.equal(rowsOf(h.tree).length, 1, "retained during next busy request");
    await h.settle();
    assert.equal(rowsOf(h.tree).length, 1, "retained after next request error");
    assert.match(h.html, />Retry<\/button>/); assert.equal(h.calls.length, 3);
  }, { response: call => call === 2 ? [event(1)] : { error: "synthetic <failure>" } });
});

test("current fifty-row paging preserves continued UTC days and native keyed wrappers", async () => {
  for (const newDay of [false, true]) {
    const input = Array.from({ length: 51 }, (_value, index) => event(index + 1,
      newDay && index === 50 ? { ts: "2026-10-07T00:00:00.000Z" } : {}));
    await harness.withDialog("FileStory", [input], async h => {
      await h.settle(); assert.equal(rowsOf(h.tree).length, 50); assert.equal(keyedRows(h.tree).length, 50);
      const pager = nodes(h.tree).find(node => node.props.collectionLabel === "File story events");
      assert.ok(pager); assert.equal(pager.props.controlsId, "file-story-events");
      pager.props.onPageChange(2); await h.settle();
      assert.equal(rowsOf(h.tree).length, 1); assert.equal(String(keyedRows(h.tree)[0].key), "51");
      assert.ok(h.html.includes(newDay ? "2026-10-07 (UTC)" : "2026-10-06 (UTC)"));
      assert.equal(h.html.includes("continued"), !newDay); assert.equal(h.calls.length, 1);
    });
  }
});

test("legacy and unknown providers keep actual Claude identity while invalid timestamps remain raw", async () => {
  for (const provider of [null, undefined, "unrecognized"]) {
    const input = [event(1, { provider, session_id: "legacy-session" }),
      event(2, { provider, session_id: "legacy-session", ts: "invalid <ts>&" })];
    await harness.withDialog("FileStory", [input], async h => {
      await h.settle();
      assert.equal(h.states[0][0], input[0]); assert.equal(h.states[0][1], input[1]);
      assert.equal(rowsOf(h.tree).length, 2);
      const dots = nodes(h.tree).filter(node => typeof node.props.title === "string"
        && node.props.title.startsWith("claude session "));
      assert.equal(dots.length, 2);
      for (const dot of dots) assert.equal(dot.props.style.backgroundColor,
        harness.deps.sessionColor("claude", "legacy-session"));
      assert.match(h.html, /invalid &lt;ts&gt;&amp;/);
      assert.match(htmlOf(h.tree.props.description), /Unavailable/);
      assert.doesNotMatch(htmlOf(h.tree.props.description), /NaN/);
    });
  }
});

test("actual three-page cap retains full identities, scope, summary and bounded display", async () => {
  const input = Array.from({ length: 1500 }, (_value, index) => event(index + 1));
  await harness.withDialog("FileStory", [input.slice(0, 500), input.slice(500, 1000), input.slice(1000)], async h => {
    await h.settle(); assert.equal(h.states[0].length, 1500); assert.equal(h.calls.length, 3);
    assert.deepEqual(h.calls.map(call => Number(call.query.get("offset"))), [0, 500, 1000]);
    for (const call of h.calls) assert.deepEqual(Object.fromEntries(call.query),
      { repo: "A", file: "src/file.ts", limit: "500", offset: call.query.get("offset") });
    assert.equal(new Set(h.states[0].map(value => value.id)).size, 1500); assert.equal(rowsOf(h.tree).length, 50);
    assert.match(htmlOf(h.tree.props.description), /1500 events/); assert.match(htmlOf(h.tree.props.description), /fetched window/);
    assert.match(h.html, /Fetched-window limit reached: showing 1,500 captured events/);
    assert.equal(h.states[0][0], input[0]); assert.equal(h.states[0].at(-1), input.at(-1));
  });
});
