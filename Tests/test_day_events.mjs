import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const frontendRequire = createRequire(resolve(root, "Frontend/package.json"));
const viteUrl = pathToFileURL(frontendRequire.resolve("vite")).href;
const frontendRoot = resolve(root, "Frontend");
const start = new Date("2026-09-30T00:00:00").getTime();
const end = new Date("2026-10-01T00:00:00").getTime();
const since = new Date(start).toISOString().replace(".000Z", ".000000Z");
const until = new Date(end).toISOString().replace(".000Z", ".000000Z");
const row = (id, ts = new Date(start + 3_600_000).toISOString()) => ({
  id, ts, repo_id: "Repo_A", file: `src/${id}.ts`, provider: "codex",
  mode: "B", session_id: "session", task_ref: null, tool: "Edit", commit_hash: null,
});
const rowsOf = (count) => Array.from({ length: count }, (_, index) => row(count - index));

test("actual Day Lanes loader keeps a precise bounded numeric-time window", {
  timeout: 30_000,
}, async (t) => {
  const { createServer } = await import(viteUrl);
  const vite = await createServer({
    root: frontendRoot, server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom", optimizeDeps: { noDiscovery: true, entries: [] },
  });
  try {
    const { api } = await vite.ssrLoadModule("/src/api.ts");
    const { loadDayEvents } = await vite.ssrLoadModule("/src/dayEvents.ts");
    const { shiftDayLabel } = await vite.ssrLoadModule("/src/dayWindow.ts");
    const original = api.events;
    async function run (options = {}) {
      const calls = [];
      const controller = options.controller ?? new AbortController();
      api.events = async (params, signal) => {
        calls.push({ ...params, signal });
        return options.events ? options.events(params, signal, calls.length)
          : Object.freeze((options.rows ?? []).slice(params.offset, params.offset + params.limit));
      };
      try {
        const result = await loadDayEvents(options.scope, options.day ?? "2026-09-30", controller.signal);
        return { ...result, calls, controller };
      } finally {
        api.events = original;
      }
    }

    await t.test("empty and scoped calls retain every query field and the owner signal", async () => {
      for (const scope of [undefined, "Repo_A"]) {
        const result = await run({ scope });
        assert.deepEqual(result.rows, []);
        assert.equal(result.limitReached, false);
        assert.deepEqual(result.calls, [{ repo: scope, since, until,
          limit: 500, offset: 0, signal: result.controller.signal }]);
      }
    });

    await t.test("calendar labels shift across leap/year boundaries without escaping supported years", () => {
      assert.equal(shiftDayLabel("2024-03-01", -1), "2024-02-29");
      assert.equal(shiftDayLabel("2026-03-01", -1), "2026-02-28");
      assert.equal(shiftDayLabel("0099-12-31", 1), "0100-01-01");
      assert.equal(shiftDayLabel("2026-01-01", -1), "2025-12-31");
      for (const [day, delta] of [["0000-01-01", -1], ["9999-12-31", 1],
        ["bad", 1], ["2026-02-30", 1], ["2026-09-30", 0]]) {
        assert.equal(shiftDayLabel(day, delta), null);
      }
    });

    await t.test("numeric timestamps and ID ties restore replay's sorted-input invariant", async () => {
      const second = new Date(start + 3_600_000).toISOString().replace(".000Z", "Z");
      const fractional = second.replace("Z", ".123Z");
      const micro = second.replace("Z", ".123999Z");
      const result = await run({ rows: [row(9, second), row(2, fractional), row(1, micro)] });
      assert.deepEqual(result.rows.map((item) => item.id), [9, 1, 2]);
      assert.deepEqual(result.rows.map((item) => new Date(item.ts).getTime()), [
        start + 3_600_000, start + 3_600_123, start + 3_600_123,
      ]);
    });

    await t.test("filtering excludes bad boundaries without stopping a full raw page", async () => {
      const rows = rowsOf(500);
      rows[0] = row(1001, new Date(start - 1).toISOString());
      rows[1] = row(1002, until);
      rows[2] = row(1003, "bad timestamp");
      rows.push(row(1004, since), row(1005, new Date(end - 1).toISOString()));
      const result = await run({ rows, scope: "Repo_A" });
      assert.equal(result.rows.length, 499);
      assert.equal(result.rows[0].id, 1004);
      assert.equal(result.rows.at(-1).id, 1005);
      assert.deepEqual(result.calls.map((call) => call.offset), [0, 500]);
      for (const call of result.calls) assert.deepEqual(call, {
        repo: "Repo_A", since, until, limit: 500, offset: call.offset,
        signal: result.controller.signal,
      });
    });

    for (const count of [1499, 1500, 1501]) {
      await t.test(`${count} raw rows preserve the three-page cap`, async () => {
        const result = await run({ rows: rowsOf(count) });
        assert.equal(result.rows.length, Math.min(count, 1500));
        assert.equal(result.limitReached, count >= 1500);
        assert.deepEqual(result.calls.map((call) => call.offset), [0, 500, 1000]);
      });
    }

    await t.test("filtered cap counts and page failure never imply complete history", async () => {
      const rows = rowsOf(1500);
      rows[0] = row(5000, until);
      const result = await run({ rows });
      assert.equal(result.rows.length, 1499);
      assert.equal(result.limitReached, true);
      await assert.rejects(run({ events: (_params, _signal, count) => {
        if (count === 1) return rowsOf(500);
        throw new Error("page unavailable");
      } }), /page unavailable/);
    });

    await t.test("invalid days and aborts reject before further transport or acceptance", async () => {
      let calls = 0;
      for (const day of ["invalid", "2026-02-30", "2026-13-01", "2026-9-30"]) {
        await assert.rejects(run({ day, events: () => { calls += 1; return []; } }));
      }
      const before = new AbortController();
      before.abort();
      await assert.rejects(run({ controller: before,
        events: () => { calls += 1; return []; } }), { name: "AbortError" });
      assert.equal(calls, 0);
      const pending = new AbortController();
      let pages = 0;
      await assert.rejects(run({ controller: pending, events: () => {
        pages += 1; pending.abort(); return rowsOf(500);
      } }), { name: "AbortError" });
      assert.equal(pages, 1);
    });
  } finally {
    await vite.close();
  }
});

test("actual loader rejects a nonexistent local day before requesting any page", () => {
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import assert from "node:assert/strict";
    const { createServer } = await import(${JSON.stringify(viteUrl)});
    const vite = await createServer({ root: ${JSON.stringify(frontendRoot)},
      server: {middlewareMode:true,hmr:false,ws:false},appType:"custom",
      optimizeDeps:{noDiscovery:true,entries:[]} });
    try {
      const {api}=await vite.ssrLoadModule("/src/api.ts");
      const {loadDayEvents}=await vite.ssrLoadModule("/src/dayEvents.ts");
      const {shiftDayLabel}=await vite.ssrLoadModule("/src/dayWindow.ts");
      assert.equal(shiftDayLabel("2011-12-31",-1),"2011-12-30");
      assert.equal(shiftDayLabel("2011-12-30",-1),"2011-12-29");
      assert.equal(shiftDayLabel("2011-12-29",1),"2011-12-30");
      assert.equal(shiftDayLabel("2011-12-30",1),"2011-12-31");
      let calls=0; api.events=async()=>{calls+=1;return[];};
      await assert.rejects(loadDayEvents(undefined,"2011-12-30",new AbortController().signal),
        /selected local calendar day does not exist/);
      assert.equal(calls,0);
    } finally { await vite.close(); }
  `], { env: { ...process.env, TZ: "Pacific/Apia" }, encoding: "utf8", timeout: 15_000 });
  assert.equal(result.status, 0, result.stderr);
});

test("Day Lanes statically preserves owner guards and reuses honest cap feedback", () => {
  // Static wiring only; no React effects, browser interactions or lifecycle execution.
  const source = readFileSync(resolve(root, "Frontend/src/dayLanes.tsx"), "utf8");
  assert.match(source, /await loadDayEvents\(\s*requestScope, requestDay, request\.controller\.signal,/);
  assert.match(source, /if \(!mountedRef\.current \|\| requestRef\.current\?\.generation !== generation\s*\|\| currentKeyRef\.current !== key \|\| request\.controller\.signal\.aborted\) return;/);
  assert.match(source, /request\.action\?\.clear\(\);/);
  assert.match(source, /if \(targetDay === null\) return;\s*exitReplay\(\)/);
  assert.match(source, /disabled=\{previousDay === null\}/);
  assert.match(source, /disabled=\{isToday \|\| nextDay === null\}/);
  assert.match(source, /\{rows && <EventWindowNotice limitReached=\{limitReached\} count=\{rows\.length\} \/>\}/);
  assert.doesNotMatch(source, /\btruncated\b|Only the newest|left\.ts\.localeCompare/);
  // Explicit outstanding limitation, not evidence of DST-complete replay.
  assert.match(source, /const DAY_S = 86_400;/);
});
