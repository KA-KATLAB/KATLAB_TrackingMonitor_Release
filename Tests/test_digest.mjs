import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const frontendRequire = createRequire(resolve(root, "Frontend/package.json"));
const RealDate = Date;
const startMs = new RealDate(2026, 8, 30).getTime();
const endMs = new RealDate(2026, 9, 1).getTime();
const noonMs = new RealDate(2026, 8, 30, 12).getTime();
const since = new RealDate(startMs).toISOString().replace(".000Z", ".000000Z");
const until = new RealDate(endMs).toISOString().replace(".000Z", ".000000Z");
const row = (id, overrides = {}) => ({
  id, repo_id: "Repo_A", ts: new RealDate(startMs + 3_600_000).toISOString(),
  tool: "Edit", file: `src/file-${id}.ts`, mode: "B", provider: "codex",
  session_id: "shared-session", task_ref: "plan - A.1", commit_hash: null,
  ...overrides,
});
const rowsOf = (count) => Array.from({ length: count }, (_, index) => row(index + 1));
const pagesFrom = (html) => JSON.parse(
  html.match(/<script id="digest-data" type="application\/json">([\s\S]*?)<\/script>/)[1],
);

test("actual day helper uses calendar midnights and six-digit UTC bounds across DST", () => {
  const ts = frontendRequire("typescript");
  const code = ts.transpileModule(
    readFileSync(resolve(root, "Frontend/src/dayWindow.ts"), "utf8"),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } },
  ).outputText;
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
  for (const [tz, days, expected] of [
    ["Asia/Bangkok", ["2026-03-08", "2026-11-01"], [
      [24, "2026-03-07T17:00:00.000000Z", "2026-03-08T17:00:00.000000Z"],
      [24, "2026-10-31T17:00:00.000000Z", "2026-11-01T17:00:00.000000Z"],
    ]],
    ["America/New_York", ["2026-03-08", "2026-11-01"], [
      [23, "2026-03-08T05:00:00.000000Z", "2026-03-09T04:00:00.000000Z"],
      [25, "2026-11-01T04:00:00.000000Z", "2026-11-02T05:00:00.000000Z"],
    ]],
    ["America/Santiago", ["2026-09-06", "2026-09-07"], [
      [23, "2026-09-06T04:00:00.000000Z", "2026-09-07T03:00:00.000000Z"],
      [24, "2026-09-07T03:00:00.000000Z", "2026-09-08T03:00:00.000000Z"],
    ]],
    ["Pacific/Apia", ["2011-12-29", "2011-12-31"], [
      [24, "2011-12-29T10:00:00.000000Z", "2011-12-30T10:00:00.000000Z"],
      [24, "2011-12-30T10:00:00.000000Z", "2011-12-31T10:00:00.000000Z"],
    ]],
    ["UTC", ["0042-05-02", "0099-12-31"], [
      [24, "0042-05-02T00:00:00.000000Z", "0042-05-03T00:00:00.000000Z"],
      [24, "0099-12-31T00:00:00.000000Z", "0100-01-01T00:00:00.000000Z"],
    ]],
  ]) {
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", `
      const { localDayWindow } = await import(${JSON.stringify(moduleUrl)});
      const dates = ${JSON.stringify(days)}.map(day => new Date(day + "T12:00:00"));
      const before = dates.map(date => date.getTime());
      const windows = dates.map(localDayWindow);
      if (dates.some((date, index) => date.getTime() !== before[index])) {
        throw new Error("Input date was mutated");
      }
      process.stdout.write(JSON.stringify(windows));
    `], { env: { ...process.env, TZ: tz }, encoding: "utf8", timeout: 10_000 });
    assert.equal(result.status, 0, result.stderr);
    const windows = JSON.parse(result.stdout);
    assert.deepEqual(windows.map((window) => window.day), days);
    assert.deepEqual(windows.map((window) => [
      (window.endMs - window.startMs) / 3_600_000, window.since, window.until,
    ]), expected);
  }
});

test("actual prepared Digest preserves its captured day and bounded export contract", {
  timeout: 30_000,
}, async (t) => {
  const { createServer } = await import(pathToFileURL(frontendRequire.resolve("vite")).href);
  const vite = await createServer({
    root: resolve(root, "Frontend"),
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom", optimizeDeps: { noDiscovery: true, entries: [] },
  });
  try {
    const { api } = await vite.ssrLoadModule("/src/api.ts");
    const { prepareDigest } = await vite.ssrLoadModule("/src/digest.ts");
    const originalEvents = api.events;
    const originalStats = api.stats;

    async function run (options = {}) {
      let clockMs = options.clockMs ?? noonMs;
      globalThis.Date = class extends RealDate {
        constructor (...args) { super(...(args.length ? args : [clockMs])); }
        static now () { return clockMs; }
      };
      const calls = [];
      const statsCalls = [];
      const controller = options.controller ?? new AbortController();
      const scope = Object.hasOwn(options, "scope") ? options.scope : "Repo_A";
      const inputRows = options.rows ?? [];
      api.events = async (params, signal) => {
        calls.push({ ...params, signal });
        return options.events
          ? options.events(params, signal, calls.length)
          : inputRows.slice(params.offset, params.offset + params.limit);
      };
      api.stats = async (repo, signal) => {
        statsCalls.push({ repo, signal });
        if (options.completeAt !== undefined) clockMs = options.completeAt;
        return options.stats ? options.stats(repo, signal)
          : { activity_calendar: [{ day: "2026-09-30", minutes: 65 }] };
      };
      try {
        const prepared = await prepareDigest(scope, options.repos ?? [],
          options.tasks ?? [], options.uncommitted ?? [], controller.signal);
        assert.equal(prepared.blob.type, "text/html");
        const html = await prepared.blob.text();
        return { ...prepared, html, pages: pagesFrom(html), calls, statsCalls, controller };
      } finally {
        globalThis.Date = RealDate;
        api.events = originalEvents;
        api.stats = originalStats;
      }
    }

    await t.test("empty all-repo report retains truthful copy and signal identity", async () => {
      const result = await run({ scope: undefined });
      assert.equal(result.filename, "TrackingMonitor_Digest_all-repos_2026-09-30.html");
      assert.deepEqual(result.pages, []);
      assert.match(result.html, /No tracked file summaries for this report day\./);
      assert.doesNotMatch(result.html, /More may exist|events today|sessions today/);
      assert.deepEqual(result.calls, [{
        repo: undefined, since, until, limit: 500, offset: 0,
        signal: result.controller.signal,
      }]);
      assert.deepEqual(result.statsCalls, [{ repo: undefined, signal: result.controller.signal }]);
      assert.match(result.html, /≈ 1h 5m/);
      assert.match(result.html, /time on 2026-09-30 \(UTC\)/);
      assert.doesNotMatch(result.html, /time today \(UTC\)/);
    });

    await t.test("old rows in a full raw page do not hide later in-day rows", async () => {
      const rows = rowsOf(500);
      rows[499] = row(500, { ts: new RealDate(startMs - 1).toISOString() });
      rows.push(row(501, { file: "later-page-today.ts" }));
      const result = await run({ rows });
      assert.deepEqual(result.calls.map((call) => call.offset), [0, 500]);
      assert.equal(result.pages.flat().reduce((sum, item) => sum + item.count, 0), 500);
      assert.ok(result.pages.flat().some((item) => item.file === "later-page-today.ts"));
      for (const call of result.calls) {
        assert.deepEqual(call, { repo: "Repo_A", since, until, limit: 500,
          offset: call.offset, signal: result.controller.signal });
      }
    });

    await t.test("half-open client filter rejects malformed, old and next-day rows", async () => {
      const result = await run({ rows: [
        row(1, { ts: since }), row(2, { ts: new RealDate(endMs - 1).toISOString() }),
        row(3, { ts: until }), row(4, { ts: "invalid" }),
        row(5, { ts: new RealDate(startMs - 1).toISOString() }),
        row(6, { ts: new RealDate(endMs + 3_600_000).toISOString() }),
      ] });
      assert.deepEqual(result.pages.flat().map((item) => item.file), ["src/file-1.ts", "src/file-2.ts"]);
    });

    for (const count of [1499, 1500, 1501]) {
      await t.test(`${count} server rows do not prove additional events at the cap`, async () => {
        const result = await run({ rows: rowsOf(count) });
        assert.deepEqual(result.calls.map((call) => call.offset), [0, 500, 1000]);
        assert.equal(result.pages.flat().length, Math.min(count, 1500));
        assert.ok(result.pages.every((page) => page.length <= 50));
        assert.doesNotMatch(result.html, /today had more|Truncated: only the newest/);
        if (count < 1500) assert.doesNotMatch(result.html, /More may exist/);
        else assert.match(result.html, /this report contains 1,500 captured events for the selected local day\. More may exist\./);
      });
    }

    await t.test("a full raw cap uses the accepted count after defensive filtering", async () => {
      const rows = rowsOf(1500);
      rows[0] = row(1, { ts: until });
      const result = await run({ rows });
      assert.match(result.html, /this report contains 1,499 captured events/);
      assert.equal(result.calls.length, 3);
    });

    await t.test("midnight rollover keeps report labels while completion time advances", async () => {
      const result = await run({ rows: [row(1)], clockMs: endMs - 1, completeAt: endMs + 1_000 });
      assert.equal(result.filename, "TrackingMonitor_Digest_repo-Repo_A_2026-09-30.html");
      assert.match(result.html, /2026-09-30 \(local day\) · generated 2026-10-01 00:00:01/);
      for (const label of ["events on report day", "auto-attributed on report day", "sessions on report day"]) {
        assert.ok(result.html.includes(label));
      }
      assert.doesNotMatch(result.html, /events today|auto-attributed today|sessions today|summaries today/);
      assert.match(result.html, /time on 2026-09-30 \(UTC\)/);
      assert.equal(result.calls[0].since, since);
      assert.equal(result.calls[0].until, until);
    });

    await t.test("effort keeps its absolute snapshot date and distinguishes missing from measured zero", async () => {
      const missing = await run({ stats: () => ({ activity_calendar: [] }) });
      assert.match(missing.html, /font-weight:700">Unavailable<\/div><div[^>]*>time unavailable \(UTC\)/);
      const zero = await run({ stats: () => ({
        activity_calendar: [{ day: "2026-09-29", minutes: 0 }],
      }) });
      assert.match(zero.html, /font-weight:700">≈ 0m<\/div><div[^>]*>time on 2026-09-29 \(UTC\)/);
      assert.doesNotMatch(zero.html, /time today|time unavailable/);
      const before = zero.html;
      assert.equal(await zero.blob.text(), before, "prepared content is immutable after preparation");
    });

    await t.test("dynamic effort date is escaped at the raw HTML boundary", async () => {
      const result = await run({ stats: () => ({
        activity_calendar: [{ day: "<day>&", minutes: 1 }],
      }) });
      assert.match(result.html, /time on &lt;day&gt;&amp; \(UTC\)/);
      assert.doesNotMatch(result.html, /time on <day>/);
    });

    await t.test("grouping and script-safe JSON retain exact names and provider identities", async () => {
      const hostile = "</script><img src=x onerror=alert(1)>&\u2028";
      const result = await run({ scope: undefined, rows: [
        row(1, { file: hostile, provider: "codex" }),
        row(2, { file: hostile, provider: "claude" }),
        row(3, { file: hostile, repo_id: "Repo_B" }),
      ], tasks: [
        { repo: "Repo_A", task_ref: "plan - A.1", why: hostile },
        { repo: "Repo_B", task_ref: "plan - A.1", why: "Other reason" },
      ] });
      assert.equal(result.pages.flat().length, 2);
      assert.equal(result.pages[0][0].count, 2);
      assert.equal(result.pages[0][0].file, hostile);
      assert.equal(result.pages[0][0].why, hostile);
      assert.equal(result.pages[0][1].why, "Other reason");
      assert.match(result.html, /font-weight:700">2<\/div><div[^>]*>sessions on report day/);
      assert.doesNotMatch(result.html, /<img src=x/);
      assert.match(result.html, /\\u003c\/script\\u003e/);
      const encoded = await run({ scope: "Repo <A>/&" });
      assert.match(encoded.html, /scope: Repo &lt;A&gt;\/&amp;/);
      assert.equal(encoded.filename, "TrackingMonitor_Digest_repo-Repo%20%3CA%3E%2F%26_2026-09-30.html");
    });

    await t.test("page or stats failure rejects instead of returning a partial export", async () => {
      let statsCalled = false;
      await assert.rejects(run({ events: (_params, _signal, count) => {
        if (count === 1) return rowsOf(500);
        throw new Error("page failure");
      }, stats: () => { statsCalled = true; return {}; } }), /page failure/);
      assert.equal(statsCalled, false);
      await assert.rejects(run({ rows: [row(1)], stats: () => {
        throw new Error("stats failure");
      } }), /stats failure/);
    });

    await t.test("pre-start and late aborts cannot return or continue a prepared export", async () => {
      const pre = new AbortController();
      pre.abort();
      let called = false;
      await assert.rejects(run({ controller: pre, events: () => { called = true; return []; } }),
        { name: "AbortError" });
      assert.equal(called, false);
      const pageOwner = new AbortController();
      await assert.rejects(run({ controller: pageOwner, events: () => {
        pageOwner.abort(); return rowsOf(500);
      }, stats: () => { throw new Error("Stats must not start"); } }), { name: "AbortError" });
      const statsOwner = new AbortController();
      await assert.rejects(run({ controller: statsOwner, stats: () => {
        statsOwner.abort(); return { activity_calendar: [] };
      } }), { name: "AbortError" });
    });
  } finally {
    globalThis.Date = RealDate;
    await vite.close();
  }
});
