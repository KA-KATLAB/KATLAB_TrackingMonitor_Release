import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const frontendRoot = resolve(root, "Frontend");
const frontendRequire = createRequire(resolve(frontendRoot, "package.json"));

function calendar (count = 365, end = "2026-09-15") {
  const last = Date.parse(`${end}T00:00:00Z`);
  return Array.from({ length: count }, (_, index) => ({
    day: new Date(last - (count - index - 1) * 86_400_000).toISOString().slice(0, 10),
    events: 0, minutes: 0, commits: 0,
  }));
}

function fixture (rows = calendar(), totalEvents = 1) {
  return {
    mode_counts: { B: totalEvents, A_SCOPED: 0, A_GLOBAL: 0, AMBIGUOUS: 0, UNKNOWN: 0, MANUAL: 0 },
    events_per_task: [], activity_daily: rows.slice(-14).map((row) => ({ day: row.day, count: row.events })),
    activity_calendar: rows, effort_per_task: [], punch_card: Array.from({ length: 7 }, () => Array(24).fill(0)),
    file_coupling: [], file_churn: [],
    wrapped: { days: rows.slice(-7), commits: 0, files_touched: 0, top_task: null, busiest_hour: null, top_pair: null },
    identity: { extensions: [], ext_total: 0, sessions: 0, first_event_ts: null, commits: 0 },
    provenance: { commits_observed: 0, commits_pre: 0, slots_total: 0, slots_ai: 0, top_files: [] },
  };
}

function headingDescription (html, title) {
  const match = html.match(new RegExp(`<h4[^>]*>${title}</h4><p[^>]*>([^<]*)</p>`));
  assert.ok(match, `${title} has its own rendered description`);
  return match[1];
}

function elements (node, React) {
  if (Array.isArray(node)) return node.flatMap((child) => elements(child, React));
  if (!React.isValidElement(node)) return [];
  return [node, ...elements(node.props.children, React)];
}

function deepFreeze (value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze); Object.freeze(value);
  }
  return value;
}

// Portable source guards, captured from the reviewed .30 baseline. No test
// depends on Git history, a branch name, checkout depth, or the current HEAD.
function sourceHash (fileName, functionName, prelude = false) {
  const ts = frontendRequire("typescript");
  const file = ts.createSourceFile(fileName, readFileSync(resolve(frontendRoot, "src", fileName), "utf8"),
    ts.ScriptTarget.Latest, true, fileName.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const fn = file.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === functionName);
  assert.ok(fn, `actual ${fileName}:${functionName} exists`);
  let nodes = prelude ? fn.body.statements.filter((node) => !ts.isReturnStatement(node)) : [fn];
  if (prelude === "rows") {
    let list;
    const visit = (node) => {
      if (ts.isJsxElement(node) && node.openingElement.tagName.getText(file) === "ul") list = node;
      ts.forEachChild(node, visit);
    };
    visit(fn); assert.ok(list, "actual record row rendering is present"); nodes = [list];
  }
  const printer = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed });
  return createHash("sha256").update(nodes.map((node) =>
    printer.printNode(ts.EmitHint.Unspecified, node, file)).join("\n")).digest("hex");
}

test("year snapshot period labels", { timeout: 30_000 }, async (t) => {
  const React = frontendRequire("react"), { renderToStaticMarkup } = frontendRequire("react-dom/server");
  const { createServer } = await import(pathToFileURL(frontendRequire.resolve("vite")).href);
  const vite = await createServer({ root: frontendRoot,
    server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom",
    optimizeDeps: { noDiscovery: true, entries: [] } });
  const originalError = console.error;
  try {
    // Overview is client-only. Suppress only React's expected SSR layout-effect
    // diagnostic, never assertions or other console errors, and restore it.
    console.error = (...args) => {
      if (String(args[0]).startsWith("Warning: useLayoutEffect does nothing on the server")) return;
      originalError(...args);
    };
    const { OverviewView } = await vite.ssrLoadModule("/src/OverviewView.tsx");
    const { Records, maxStreakOf, bestRolling7 } = await vite.ssrLoadModule("/src/records.tsx");
    const { DisclosureTable } = await vite.ssrLoadModule("/src/accessibleData.tsx");
    const { SectionHeading, SegmentedControl } = await vite.ssrLoadModule("/src/ui.tsx");
    const { CalendarHeatmap, streakOf } = await vite.ssrLoadModule("/src/calendarHeatmap.tsx");
    const { wardrobeOf } = await vite.ssrLoadModule("/src/pet.tsx");
    function overview (stats, scope) {
      let tree;
      function Capture () {
        tree = OverviewView({ scope, stats, statsError: "", tasks: [], repos: [], uncommitted: [],
          onStatus() {}, entryState: { relationship: null, day: "2026-10-01", speed: 1 }, onEntryStateChange() {} });
        return tree;
      }
      const html = renderToStaticMarkup(React.createElement(Capture));
      const all = elements(tree, React);
      return { html, all, table: all.find((node) => node.type === DisclosureTable && node.props.label === "Activity calendar") };
    }

    await t.test("stale Activity calendar heading names its actual UTC period", () => {
      const { html } = overview(fixture());
      assert.ok(headingDescription(html, "Activity calendar").includes("2025-09-16 to 2026-09-15 (UTC)"));
    });
    await t.test("stale Personal records heading names its actual UTC period", () => {
      const html = renderToStaticMarkup(React.createElement(Records, { calendar: calendar() }));
      assert.ok(headingDescription(html, "Personal records").includes("2025-09-16 to 2026-09-15 (UTC)"));
    });
    await t.test("calendar disclosure summary names its own supplied UTC period", () => {
      const { table } = overview(fixture());
      assert.ok(table, "actual calendar disclosure is present");
      assert.ok(String(table.props.summary).includes("2025-09-16 to 2026-09-15 (UTC)"));
    });

    await t.test("current, stale and year-boundary descriptions use supplied dates independently of other periods", () => {
      for (const [end, expected] of [
        ["2026-09-15", "2025-09-16 to 2026-09-15 (UTC)"],
        ["2026-10-01", "2025-10-02 to 2026-10-01 (UTC)"],
        ["2026-01-03", "2025-01-04 to 2026-01-03 (UTC)"],
        ["2024-03-02", "2023-03-04 to 2024-03-02 (UTC)"],
      ]) {
        const stats = fixture(calendar(365, end));
        stats.wrapped.days = calendar(7, "2020-01-07");
        stats.activity_daily = [{ day: "2021-01-01", count: 0 }];
        const before = JSON.stringify(stats); deepFreeze(stats);
        const { html, table } = overview(stats, "Probe");
        for (const title of ["Activity calendar", "Personal records"]) {
          const description = headingDescription(html, title);
          assert.ok(description.includes(expected)); assert.match(description, /365\/365/);
          assert.doesNotMatch(description, /Last 365|2020-01-07|2021-01-01/i);
        }
        assert.ok(String(table.props.summary).startsWith(expected));
        const exact = renderToStaticMarkup(React.createElement(table.type, table.props));
        assert.ok(exact.match(/^<div[^>]*><p[^>]*>([^<]*)<\/p>/)?.[1]?.includes(expected),
          "the actual disclosure displays its own period before its control");
        const heat = renderToStaticMarkup(React.createElement(CalendarHeatmap, { calendar: stats.activity_calendar }));
        assert.equal((heat.match(/<g>/g) ?? []).length, 365);
        assert.ok(heat.includes(`${stats.activity_calendar[0].day} (UTC)`));
        assert.ok(heat.includes(`${end} (UTC)`));
        assert.equal(JSON.stringify(stats), before);
      }
    });

    await t.test("absent, single, partial and zero inputs describe actual coverage without changing Records numbers", () => {
      for (const count of [0, 1, 6, 30, 365]) {
        // A positive all-time count keeps the existing panels mounted. Empty
        // and short calendars are defensive shapes, not normal backend output.
        const stats = fixture(calendar(count));
        const { html, table } = overview(stats);
        for (const title of ["Activity calendar", "Personal records"]) {
          const description = headingDescription(html, title);
          assert.ok(description.includes(`${count}/365`));
          assert.doesNotMatch(description, /Last 365 days/);
          if (count === 0) assert.match(description, /Dates unavailable \(UTC\)/);
          if (count === 1) {
            assert.match(description, /2026-09-15 \(UTC\)/);
            assert.doesNotMatch(description, /2026-09-15 to 2026-09-15/);
          }
        }
        assert.ok(String(table.props.summary).includes(`${count}/365`));
        assert.equal(table.props.rows.length, 0);
        if (count === 0) {
          assert.match(String(table.props.summary), /calendar day data is unavailable/i);
          assert.doesNotMatch(String(table.props.summary), /No non-zero/);
        } else {
          assert.match(String(table.props.summary), /No non-zero UTC days/);
          assert.doesNotMatch(String(table.props.summary), /unavailable/i);
        }
        const records = renderToStaticMarkup(React.createElement(Records, { calendar: stats.activity_calendar }));
        assert.match(records, />0 captures</); assert.match(records, />≈ 0m</);
        assert.match(records, />0 days</); // Numeric absence policy is explicitly deferred.
      }
      const tied = calendar(2).map((row) => ({ ...row, day: "2026-09-15" }));
      const description = headingDescription(overview(fixture(tied)).html, "Activity calendar");
      assert.match(description, /2026-09-15 \(UTC\)/); assert.match(description, /2\/365/);
      assert.doesNotMatch(description, /2026-09-15 to 2026-09-15/);
    });

    await t.test("calendar summary and exact rows retain event, commit and effort-only observations", () => {
      const rows = calendar();
      rows[0].events = 2; rows[1].commits = 3; rows[2].minutes = 5;
      rows[3] = { ...rows[3], events: 4, commits: 7, minutes: 1 };
      const { table } = overview(fixture(rows), "Probe");
      assert.match(String(table.props.summary), /4 non-zero UTC days/);
      assert.match(String(table.props.summary), /6 events and 10 commits/);
      assert.deepEqual(table.props.rows, rows.slice(0, 4));
      assert.deepEqual(table.props.identity, ["calendar-active-days", "repo", "Probe"]);
      assert.equal(table.props.rowKey(rows[2]), rows[2].day);
      assert.deepEqual(table.props.columns.map((column) => column.render(rows[2])), [rows[2].day, "0", "0", "≈ 5m"]);
      const exact = renderToStaticMarkup(React.createElement(table.type, { ...table.props, initiallyOpen: true }));
      assert.equal((exact.match(/<tbody>(.*?)<\/tbody>/s)?.[1]?.match(/<tr\b/g) ?? []).length, 4);
      for (const row of rows.slice(0, 4)) assert.ok(exact.includes(row.day));
      const singular = overview(fixture(calendar(1).map((row) => ({ ...row, commits: 3 }))));
      assert.match(String(singular.table.props.summary), /1 non-zero UTC day;/);
      assert.match(String(singular.table.props.summary), /0 events and 3 commits/);
      assert.deepEqual(singular.table.props.identity, ["calendar-active-days", "all", undefined]);
    });

    await t.test("date headings and calendar summary rely on React escaping, not HTML insertion", () => {
      const rows = calendar(2); rows[0].day = '<first>"&'; rows[1].day = '<last>"&';
      const stats = fixture(rows), before = JSON.stringify(stats); deepFreeze(stats);
      const { html, table } = overview(stats, "<scope>&");
      for (const title of ["Activity calendar", "Personal records"]) {
        const description = headingDescription(html, title);
        assert.ok(description.includes("&lt;first&gt;&quot;&amp; to &lt;last&gt;&quot;&amp; (UTC)"));
      }
      const exact = renderToStaticMarkup(React.createElement(table.type, table.props));
      assert.match(exact, /&lt;first&gt;&quot;&amp;/); assert.match(exact, /&lt;last&gt;&quot;&amp;/);
      assert.doesNotMatch(html, /<first>|<last>|<scope>/);
      assert.equal(JSON.stringify(stats), before);
    });

    await t.test("snapshot streak keeps the original two-day threshold and final-zero grace", () => {
      for (const [events, expected] of [[[0, 0, 0], 0], [[0, 0, 1], 1], [[0, 1, 1], 2], [[1, 1, 0], 2], [[1, 1, 1], 3]]) {
        const rows = calendar(3).map((row, index) => ({ ...row, events: events[index] }));
        const { all } = overview(fixture(rows));
        const header = all.find((node) => node.type === SectionHeading && node.props.title === "Activity calendar");
        assert.ok(header);
        const actions = renderToStaticMarkup(React.createElement(React.Fragment, null, header.props.actions));
        assert.equal(streakOf(rows), expected);
        if (expected >= 2) {
          assert.match(actions, new RegExp(`${expected}-day snapshot streak`));
          assert.match(actions, /title="[^"]*snapshot[^"]*"/);
        } else assert.doesNotMatch(actions, /snapshot streak|🔥/);
      }
    });

    await t.test("existing mount gates, mode controls and typed Records scope keys are unchanged", () => {
      for (const stats of [null, fixture(calendar(), 0)]) {
        const { html, table, all } = overview(stats);
        assert.equal(table, undefined); assert.equal(all.some((node) => node.type === Records), false);
        assert.doesNotMatch(html, />Activity calendar<|>Personal records</);
      }
      for (const scope of [undefined, "all", "Probe"]) {
        const { all } = overview(fixture(), scope);
        const record = all.find((node) => node.type === Records);
        assert.ok(record); assert.equal(record.key, scope === undefined ? "all" : `repo:${scope}`);
        const heading = all.find((node) => node.type === SectionHeading && node.props.title === "Activity calendar");
        const modes = elements(heading.props.actions, React).find((node) => node.type === SegmentedControl);
        assert.ok(modes); assert.equal(modes.props.label, "calendar view");
        assert.deepEqual(modes.props.options.map(({ value, label }) => [value, label]),
          [["flat", "flat"], ["city", "city"], ["snake", "snake"]]);
      }
    });

    await t.test("full-window record helpers and wardrobe consumers retain their existing results", () => {
      const rows = calendar();
      for (let index = 0; index < 7; index++) rows[index].events = 2;
      rows[20].events = 300; rows[21].events = 300;
      const before = JSON.stringify(rows); deepFreeze(rows);
      assert.deepEqual(maxStreakOf(rows), { len: 7, endDay: rows[6].day });
      assert.deepEqual(bestRolling7(rows), { sum: 600, endDay: rows[21].day });
      assert.deepEqual(wardrobeOf(rows), { collar: true, bandana: false, crown: false, scarf: true, star: true });
      const html = renderToStaticMarkup(React.createElement(Records, { calendar: rows }));
      assert.match(html, />300</); assert.match(html, />7 days</); assert.match(html, />600 captures</);
      assert.ok(html.includes(rows[20].day), "earliest tied best day remains selected");
      assert.equal(JSON.stringify(rows), before);
    });

    await t.test("portable AST block hashes protect unchanged Records detection and shared calculations", () => {
      for (const [file, name, prelude, expected] of [
        ["records.tsx", "maxStreakOf", false, "d441cf8a69f44e27b3a90d1d7c7f46ef5ecde190ba0bb49b3989269623fcef86"],
        ["records.tsx", "bestRolling7", false, "b4e5c4eaa26e8d3c3fdadc581536fc10b7bc010f80fa953f7adf146d7537a7fe"],
        ["records.tsx", "runEndingToday", false, "1761173cb88145ad013d2bde89e380975a27d4de86cdcf307b3f52e6474a264d"],
        ["records.tsx", "Records", true, "ddd803b9551c9c80fe343aa812e2b0084c6c24a6c131b26bcc450ec43c5725c7"],
        ["records.tsx", "Records", "rows", "aa7ddfaea9aa46fdeebf98f8bbe16deb8b0bfcd4ca27217ccce3290bb95f0356"],
        ["calendarHeatmap.tsx", "streakOf", false, "a3c3a010c51b117b2ddb23844e359590f86439d35e5e6536869baa48eac22149"],
        ["calendarHeatmap.tsx", "rampBucket", false, "2687399fc22fafc2bf19ba97ac1c0c2a0e69e803049edc0f9759e3c607b3794e"],
        ["pet.tsx", "wardrobeOf", false, "05f3e9ca1f744e174c0dd19b05f6a86aceb0ac9c017725f33aefc1a039c21e15"],
        ["calendarDay.ts", "calendarRangeLabel", false, "641ad7617feac41ca0bb255eb21acc41404e3d30517073219555d0adfb0c6f85"],
      ]) assert.equal(sourceHash(file, name, prelude), expected, `${file}:${name}`);
    });
  } finally { console.error = originalError; await vite.close(); }
});
