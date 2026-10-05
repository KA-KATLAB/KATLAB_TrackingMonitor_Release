import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const frontendRoot = resolve(root, "Frontend");
const frontendRequire = createRequire(resolve(frontendRoot, "package.json"));
const generatedAt = () => new Date(2026, 9, 1, 13, 45);

function calendar (end, count = 365) {
  const last = Date.parse(`${end}T00:00:00Z`);
  return Array.from({ length: count }, (_, index) => ({
    day: new Date(last - (count - index - 1) * 86_400_000).toISOString().slice(0, 10),
    events: 2, minutes: 3, commits: 1,
  }));
}

function fixture (rows = calendar("2026-09-15")) {
  return {
    mode_counts: { B: 0, A_SCOPED: 0, A_GLOBAL: 0, AMBIGUOUS: 0, UNKNOWN: 0, MANUAL: 0 },
    events_per_task: [], activity_daily: [], activity_calendar: rows,
    effort_per_task: [], punch_card: Array.from({ length: 7 }, () => Array(24).fill(0)),
    file_coupling: [], file_churn: [],
    wrapped: { days: rows.slice(-7), top_task: null, busiest_hour: null,
      files_touched: 0, commits: 0, top_pair: null },
    identity: { extensions: [], ext_total: 0, sessions: 0, first_event_ts: null, commits: 0 },
    provenance: { commits_observed: 0, commits_pre: 0, slots_total: 0,
      slots_ai: 0, top_files: [] },
  };
}

function hero (html) {
  const values = [...html.matchAll(/<div class="report-metric-value" style="[^"]*">([^<]*)<\/div>\s*<div style="[^"]*">([^<]*)<\/div>/g)];
  assert.equal(values.length, 4, "all four actual hero cards are present");
  return Object.fromEntries(values.map((match) => [match[2], match[1]]));
}

function section (html, name) {
  const headings = [...html.matchAll(/<h2\b[^>]*>(.*?)<\/h2>/gs)];
  const index = headings.findIndex((match) => match[1].toLowerCase().includes(name.toLowerCase()));
  assert.ok(index >= 0, `actual ${name} section exists`);
  return html.slice(headings[index].index, headings[index + 1]?.index ?? html.indexOf("</body>"));
}

function deepFreeze (value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze); Object.freeze(value);
  }
  return value;
}

function replaceProperty (object, name, value) {
  const old = Object.getOwnPropertyDescriptor(object, name);
  Object.defineProperty(object, name, { configurable: true, writable: true, value });
  return () => {
    if (old) Object.defineProperty(object, name, old);
    else delete object[name];
  };
}

function downloadFixture (run, failClick = false) {
  const restore = [], anchors = [], blobs = [], urls = [], revoked = [], timers = [];
  let returned = false, fetchCalls = 0;
  const RealDate = Date, fixedTime = generatedAt().getTime();
  class FixedDate extends RealDate {
    constructor(...args) { super(...(args.length ? args : [fixedTime])); }
    static now() { return fixedTime; }
  }
  class CapturedBlob {
    constructor(parts, options) {
      assert.equal(parts.length, 1); assert.equal(typeof parts[0], "string");
      this.html = parts[0]; this.type = options.type; blobs.push(this);
    }
  }
  try {
    restore.push(replaceProperty(globalThis, "Date", FixedDate));
    restore.push(replaceProperty(globalThis, "Blob", CapturedBlob));
    restore.push(replaceProperty(globalThis, "fetch", () => { fetchCalls += 1; throw new Error("Report must not fetch"); }));
    restore.push(replaceProperty(globalThis, "document", {
      createElement(tag) {
        assert.equal(tag, "a");
        const anchor = { connected: false, clicks: 0, removals: 0,
          click() {
            assert.equal(returned, false, "actual export clicks in the original synchronous call");
            assert.equal(this.connected, true); this.clicks += 1;
            if (failClick) throw new Error("controlled click failure");
          },
          remove() { this.connected = false; this.removals += 1; },
        };
        anchors.push(anchor); return anchor;
      },
      body: { append(anchor) { anchor.connected = true; } },
    }));
    restore.push(replaceProperty(globalThis, "window", {
      setTimeout(callback, delay) { timers.push({ callback, delay }); return timers.length - 1; },
    }));
    restore.push(replaceProperty(URL, "createObjectURL", (blob) => {
      assert.ok(blob instanceof CapturedBlob);
      const url = `blob:controlled-${urls.length}`; urls.push(url); return url;
    }));
    restore.push(replaceProperty(URL, "revokeObjectURL", (url) => revoked.push(url)));
    run({ anchors, blobs, urls, revoked, timers, finishCall() { returned = true; } });
    assert.equal(fetchCalls, 0);
  } finally { restore.reverse().forEach((undo) => undo()); }
}

test("report snapshot dates and controlled export", { timeout: 30_000 }, async (t) => {
  const { createServer } = await import(pathToFileURL(frontendRequire.resolve("vite")).href);
  const vite = await createServer({ root: frontendRoot,
    server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom",
    optimizeDeps: { noDiscovery: true, entries: [] } });
  try {
    const { buildReportHtml, exportReport } = await vite.ssrLoadModule("/src/reportHtml.ts");
    await t.test("stale report names the selected and preceding absolute UTC windows", () => {
      const html = buildReportHtml(fixture(), "Probe", 7, generatedAt());
      assert.ok(html.includes("2026-09-09 to 2026-09-15 (UTC)"),
        "actual selected snapshot bounds must be shown instead of current-week wording");
      assert.ok(html.includes("2026-09-02 to 2026-09-08 (UTC)"));
      assert.doesNotMatch(html, /your week|your month|last 7 days|this week/i);
    });

    await t.test("full current and stale 7/30 windows retain totals and all-time data", () => {
      const cases = [
        ["2026-09-15", 7, "2026-09-09 to 2026-09-15 (UTC)", "2026-09-02 to 2026-09-08 (UTC)"],
        ["2026-09-15", 30, "2026-08-17 to 2026-09-15 (UTC)", "2026-07-18 to 2026-08-16 (UTC)"],
        ["2026-10-01", 7, "2026-09-25 to 2026-10-01 (UTC)", "2026-09-18 to 2026-09-24 (UTC)"],
        ["2026-10-01", 30, "2026-09-02 to 2026-10-01 (UTC)", "2026-08-03 to 2026-09-01 (UTC)"],
      ];
      for (const [end, range, selected, preceding] of cases) {
        const stats = fixture(calendar(end));
        stats.identity = { ...stats.identity, sessions: 81, commits: 9_001,
          extensions: [{ ext: ".ts", count: 99 }], ext_total: 99 };
        stats.effort_per_task = [{ repo: "Probe", task_ref: "T1", minutes: 123, sessions: 3 }];
        stats.file_churn = [{ repo: "Probe", file: "source.ts", events: 111, last_ts: null },
          { repo: "Other", file: "excluded.ts", events: 999, last_ts: null }];
        const html = buildReportHtml(stats, "Probe", range, generatedAt());
        assert.ok(html.includes(`${range}-day snapshot`)); assert.ok(html.includes(selected)); assert.ok(html.includes(preceding));
        assert.ok(html.includes(`Calendar coverage: ${range}/${range} supplied UTC day rows.`));
        assert.ok(html.includes("generated 2026-10-01 13:45 (local)"));
        assert.deepEqual(hero(html), range === 7
          ? { events: "14", effort: "≈ 21m", commits: "7", "active observed days": "7/7" }
          : { events: "60", effort: "≈ 1h 30m", commits: "30", "active observed days": "30/30" });
        const momentum = section(html, "Momentum");
        assert.match(momentum, /selected window vs preceding window/i);
        assert.ok(momentum.includes(`Selected: ${selected}`));
        assert.ok(momentum.includes(`Preceding: ${preceding}`));
        assert.equal((momentum.match(/= 0%/g) ?? []).length, 3);
        assert.equal((momentum.match(/<polyline\b/g) ?? []).length, 2);
        const daily = section(html, "Daily activity");
        assert.ok(daily.match(/^<h2\b[^>]*>([^<]*)<\/h2>/)?.[1]?.includes(selected), "daily heading names its window");
        assert.ok(daily.match(/<caption>([^<]*)<\/caption>/)?.[1]?.includes(selected), "daily caption names its window");
        assert.match(section(html, "Identity"), /9,001 commits/);
        assert.match(section(html, "Top tasks"), /T1[\s\S]*2h 3m/);
        assert.match(section(html, "Top files"), /source\.ts[\s\S]*111/);
        assert.doesNotMatch(section(html, "Top files"), /excluded\.ts/);
        for (const name of ["Rhythm", "Identity", "Top tasks", "Top files"]) assert.match(section(html, name), /all-time/);
        assert.doesNotMatch(html, /your week|your month|last (?:7|30) days|this (?:week|month)/i);
      }
    });

    await t.test("UTC year, leap and month bounds do not follow export-local time", () => {
      for (const [end, range, expected] of [
        ["2026-01-03", 7, "2025-12-28 to 2026-01-03 (UTC)"],
        ["2024-03-02", 7, "2024-02-25 to 2024-03-02 (UTC)"],
        ["2024-03-02", 30, "2024-02-02 to 2024-03-02 (UTC)"],
        ["2026-03-02", 30, "2026-02-01 to 2026-03-02 (UTC)"],
      ]) {
        const stats = fixture(calendar(end));
        for (const now of [new Date("2026-01-01T00:30:00+14:00"), new Date("2026-10-01T23:30:00-11:00")]) {
          assert.ok(buildReportHtml(stats, undefined, range, now).includes(expected));
        }
      }
      const html = buildReportHtml(fixture(calendar("2024-03-02")), undefined, 7, generatedAt());
      assert.match(section(html, "Daily activity"), /<th scope="row">2024-02-29<\/th>/);
      assert.match(html, /<title>[^<]*All repos[^<]*7d[^<]*2026-10-01<\/title>/);
    });

    await t.test("wrapped labels its own supplied dates and remains absent from 30-day reports", () => {
      const stats = fixture();
      stats.wrapped = { ...stats.wrapped, days: calendar("2026-08-07", 7), files_touched: 37, commits: 43 };
      const html = buildReportHtml(stats, undefined, 7, generatedAt());
      const wrapped = section(html, "weekly");
      assert.ok(wrapped.includes("2026-08-01 to 2026-08-07 (UTC)"));
      assert.ok(wrapped.match(/^<h2\b[^>]*>([^<]*)<\/h2>/)?.[1]?.includes("2026-08-01 to 2026-08-07 (UTC)"));
      assert.ok(wrapped.match(/<caption>([^<]*)<\/caption>/)?.[1]?.includes("2026-08-01 to 2026-08-07 (UTC)"));
      assert.match(wrapped, /7\/7/); assert.match(wrapped, /37 files touched/); assert.match(wrapped, /43 commits/);
      assert.doesNotMatch(wrapped, /2026-09-09 to 2026-09-15/);
      const monthly = buildReportHtml(stats, undefined, 30, generatedAt());
      assert.doesNotMatch(monthly, /2026-08-01 to 2026-08-07|Wrapped daily values|37 files touched/);
      stats.wrapped.days = [];
      const missing = section(buildReportHtml(stats, undefined, 7, generatedAt()), "weekly");
      assert.match(missing, /Dates unavailable \(UTC\)/); assert.match(missing, /0\/7/);
      assert.match(missing, /37 files touched/); assert.match(missing, /43 commits/);
    });

    await t.test("missing and partial calendars cannot become zero observations or full comparisons", () => {
      for (const range of [7, 30]) for (const count of [0, 1, range - 1, range, 2 * range - 1, 2 * range]) {
        const html = buildReportHtml(fixture(calendar("2026-09-15", count)), undefined, range, generatedAt());
        const values = hero(html), momentum = section(html, "Momentum"), daily = section(html, "Daily activity");
        const supplied = Math.min(count, range);
        assert.ok(html.includes(`Calendar coverage: ${supplied}/${range} supplied UTC day rows.`));
        if (count === 0) {
          assert.deepEqual(Object.values(values), Array(4).fill("Unavailable"));
          assert.match(momentum, /captures Unavailable/); assert.match(momentum, /effort Unavailable/);
          assert.match(momentum, /commits Unavailable/); assert.match(daily, /No daily values/);
          assert.doesNotMatch(daily, /0 events across/); assert.match(html, /Dates unavailable \(UTC\)/);
        } else {
          assert.equal(values["active observed days"], `${supplied}/${supplied}`);
          assert.equal(values.events, String(supplied * 2)); assert.equal(values.commits, String(supplied));
        }
        if (count < 2 * range) {
          assert.match(momentum, /Comparison unavailable: incomplete selected or preceding window\./);
          assert.doesNotMatch(momentum, /<polyline\b|new ▲|= 0%|[▲▼] \d+%/);
        } else {
          assert.doesNotMatch(momentum, /Comparison unavailable/);
          assert.equal((momentum.match(/<polyline\b/g) ?? []).length, 2);
        }
        assert.doesNotMatch(html, /NaN|Infinity|>0\/0</);
      }
      const single = buildReportHtml(fixture(calendar("2026-09-15", 1)), undefined, 7, generatedAt());
      assert.match(single, /2026-09-15 \(UTC\)/); assert.doesNotMatch(single, /2026-09-15 to 2026-09-15/);
      const equalEndpoints = fixture(calendar("2026-09-15", 2).map((row) => ({ ...row, day: "2026-09-15" })));
      const repeated = buildReportHtml(equalEndpoints, undefined, 7, generatedAt());
      assert.match(repeated, /2026-09-15 \(UTC\)/); assert.doesNotMatch(repeated, /2026-09-15 to 2026-09-15/);
    });

    await t.test("complete zero, new-growth and signed delta rules remain unchanged", () => {
      const zero = fixture(calendar("2026-09-15").map((row) => ({ ...row, events: 0, minutes: 0, commits: 0 })));
      for (const range of [7, 30]) {
        const html = buildReportHtml(zero, undefined, range, generatedAt()), momentum = section(html, "Momentum");
        assert.deepEqual(hero(html), { events: "0", effort: "≈ 0m", commits: "0", "active observed days": `0/${range}` });
        assert.doesNotMatch(momentum, /Unavailable|Comparison unavailable|new ▲/);
        assert.equal((momentum.match(/<polyline\b/g) ?? []).length, 2);
        assert.equal((momentum.match(/>—<\/span>/g) ?? []).length, 3);
      }
      const mixed = fixture(calendar("2026-09-15", 14).map((row, index) => ({ ...row,
        events: index < 7 ? 0 : 2, minutes: index < 7 ? 1 : 2, commits: index < 7 ? 2 : 1 })));
      const momentum = section(buildReportHtml(mixed, undefined, 7, generatedAt()), "Momentum");
      assert.match(momentum, /new ▲/); assert.match(momentum, /▲ 100%/); assert.match(momentum, /▼ 50%/);
    });

    await t.test("dynamic labels and exact tables are escaped without changing frozen inputs", () => {
      const stats = fixture(calendar("2026-09-15", 14));
      stats.activity_calendar[0].day = "<prior>&first";
      stats.activity_calendar[6].day = "prior&<last>";
      stats.activity_calendar[7].day = "<selected>&first";
      stats.activity_calendar[13].day = "selected&<last>";
      stats.wrapped.days = [{ day: "<wrapped>&day", events: 8, minutes: 5 }];
      const before = JSON.stringify(stats); deepFreeze(stats);
      const html = buildReportHtml(stats, "<scope>&label", 7, generatedAt());
      for (const text of ["&lt;scope&gt;&amp;label", "&lt;selected&gt;&amp;first to selected&amp;&lt;last&gt; (UTC)",
        "&lt;prior&gt;&amp;first to prior&amp;&lt;last&gt; (UTC)", "&lt;wrapped&gt;&amp;day (UTC)"]) {
        assert.ok(html.includes(text), text);
      }
      assert.doesNotMatch(html, /<scope>|<selected>|<prior>|<wrapped>/);
      assert.match(section(html, "Daily activity"), /<th scope="row">&lt;selected&gt;&amp;first<\/th><td>2<\/td>/);
      assert.match(section(html, "weekly"), /<th scope="row">&lt;wrapped&gt;&amp;day<\/th><td>8<\/td>/);
      assert.equal(JSON.stringify(stats), before);
    });

    await t.test("actual export stays synchronous, scope-safe and fetch-free with delayed URL cleanup", () => {
      for (const [scope, token] of [[undefined, "all-repos"], ["all", "repo-all"], ["Repo_A", "repo-Repo_A"]]) for (const range of [7, 30]) {
        downloadFixture(({ anchors, blobs, urls, revoked, timers, finishCall }) => {
          const result = exportReport(fixture(), scope, range); finishCall();
          assert.equal(result, undefined); assert.equal(anchors.length, 1); assert.equal(blobs.length, 1);
          assert.equal(anchors[0].clicks, 1); assert.equal(anchors[0].removals, 1);
          assert.equal(anchors[0].connected, false); assert.equal(anchors[0].hidden, true);
          assert.equal(anchors[0].download, `KATLAB_Report_${token}_${range}d_2026-10-01.html`);
          assert.equal(anchors[0].href, urls[0]); assert.equal(blobs[0].type, "text/html");
          assert.ok(blobs[0].html.includes(range === 7
            ? "2026-09-09 to 2026-09-15 (UTC)" : "2026-08-17 to 2026-09-15 (UTC)"));
          assert.ok(blobs[0].html.includes("generated 2026-10-01 13:45 (local)"));
          assert.deepEqual(revoked, []); assert.equal(timers.length, 1); assert.equal(timers[0].delay, 1_000);
          timers[0].callback(); assert.deepEqual(revoked, [urls[0]]);
        });
      }
    });

    await t.test("actual export surfaces initiation failure and cleans its anchor and URL", () => {
      downloadFixture(({ anchors, revoked, urls, timers }) => {
        assert.throws(() => exportReport(fixture(), "Probe", 30), /controlled click failure/);
        assert.equal(anchors[0].clicks, 1); assert.equal(anchors[0].connected, false);
        assert.equal(anchors[0].removals, 1); assert.deepEqual(revoked, [urls[0]]); assert.equal(timers.length, 0);
      }, true);
    });
  } finally { await vite.close(); }
});
