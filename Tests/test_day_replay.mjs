import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const frontendRoot = resolve(root, "Frontend");
const frontendRequire = createRequire(resolve(frontendRoot, "package.json"));
const viteUrl = pathToFileURL(frontendRequire.resolve("vite")).href;

const cases = [
  { zone: "Asia/Bangkok", days: [["2026-09-30", 24, 0]] },
  { zone: "UTC", days: [["2026-09-30", 24, 0], ["0042-05-02", 24, 0]] },
  { zone: "America/New_York", days: [["2026-03-08", 23, 0], ["2026-11-01", 25, 0]],
    fold: ["2026-11-01", "2026-11-01T05:30:00Z", "2026-11-01T06:30:00Z", "UTC-04:00", "UTC-05:00"] },
  { zone: "Australia/Lord_Howe", days: [["2026-04-05", 24.5, 0], ["2026-10-04", 23.5, 0]],
    fold: ["2026-04-05", "2026-04-04T14:45:00Z", "2026-04-04T15:15:00Z", "UTC+11:00", "UTC+10:30"] },
  { zone: "America/Santiago", days: [["2026-09-06", 23, 1]] },
  { zone: "Pacific/Apia", days: [["2011-12-29", 24, 0], ["2011-12-31", 24, 0], ["1892-07-04", 48, 0]],
    skipped: "2011-12-30" },
];

for (const fixture of cases) {
  test(`actual Day Lanes projection/replay helpers in ${fixture.zone}`, { timeout: 30_000 }, () => {
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", `
      import assert from "node:assert/strict";
      import { createRequire } from "node:module";
      const fixture = ${JSON.stringify(fixture)};
      const require = createRequire(${JSON.stringify(resolve(frontendRoot, "package.json"))});
      const React = require("react");
      const { renderToStaticMarkup } = require("react-dom/server");
      const { createServer } = await import(${JSON.stringify(viteUrl)});
      const vite = await createServer({ root: ${JSON.stringify(frontendRoot)},
        server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom",
        optimizeDeps: { noDiscovery: true, entries: [] } });
      try {
        const replay = await vite.ssrLoadModule("/src/dayReplay.ts");
        const { localDayWindow } = await vite.ssrLoadModule("/src/dayWindow.ts");
        const { buildDayDensity, DayLanes } = await vite.ssrLoadModule("/src/dayLanes.tsx");
        const { dayReplayWindow, elapsedDayFraction, wallDayFraction, dayAxisTicks,
          dayBlockGeometry, advanceReplay, replayPointer, replaySeekStep, dayTimeText, replayTimeText } = replay;
        assert.equal(replaySeekStep(86400), 30);
        assert.equal(replaySeekStep(86399), 1);
        for (const [day, hours, startHour] of fixture.days) {
          const model = dayReplayWindow(day);
          assert.ok(model);
          const actualQueryWindow = localDayWindow(new Date(day + "T12:00:00"));
          assert.equal(model.startMs, actualQueryWindow.startMs);
          assert.equal(model.endMs, actualQueryWindow.endMs);
          assert.equal(model.durationSeconds, hours * 3600);
          assert.equal(model.durationSeconds % replaySeekStep(model.durationSeconds), 0);
          assert.equal(new Date(model.startMs).getHours(), startHour);
          const late = model.endMs - 1;
          const lateSeconds = (late - model.startMs) / 1000;
          assert.ok(lateSeconds < model.durationSeconds);
          assert.equal(elapsedDayFraction(model, model.startMs - 1000), 0);
          assert.equal(elapsedDayFraction(model, model.endMs + 1000), 1);
          assert.ok(elapsedDayFraction(model, late) < 1);
          assert.equal(wallDayFraction(model, 0), startHour / 24);
          assert.equal(wallDayFraction(model, model.durationSeconds), 1);
          assert.equal(wallDayFraction(model, model.durationSeconds + 100), 1);
          assert.equal(replayPointer([0, lateSeconds, lateSeconds], model.durationSeconds), 3);
          assert.equal(replayPointer([0, lateSeconds], lateSeconds - .001), 1);
          if (hours > 24) assert.equal(replayPointer([0, lateSeconds], 86400), 1);
          const geometry = dayBlockGeometry(model, late, late, 120000, 816);
          assert.equal(geometry.clipped, true);
          assert.equal(geometry.endMs, model.endMs);
          assert.ok(geometry.left >= 0 && geometry.width > 0);
          assert.ok(geometry.left + geometry.width <= 816);
          const block = dayBlockGeometry(model, model.startMs, model.startMs + 60000, 120000, 816);
          assert.equal(block.clipped, false);
          assert.equal(block.left, 0);
          assert.ok(block.width >= 2);
          const ticks = dayAxisTicks(model);
          assert.ok(ticks.length <= 18);
          assert.equal(ticks[0].fraction, 0);
          assert.equal(ticks.at(-1).fraction, 1);
          for (let i = 1; i < ticks.length; i++) {
            assert.ok(ticks[i].fraction > ticks[i - 1].fraction);
            assert.ok(ticks[i].fraction <= 1);
          }
          if (model.variableDay) {
            assert.equal(ticks.at(-1).label, "End");
            assert.ok(ticks.every(tick => /^UTC[+-]\\d{2}:\\d{2}$/.test(tick.offset)));
            assert.ok((1 - ticks.at(-2).fraction) * model.durationSeconds >= 7200);
            if (hours > 27) assert.ok(ticks.length <= 10);
          } else {
            assert.deepEqual(ticks.map(tick => tick.label), ["00","03","06","09","12","15","18","21","24"]);
            assert.ok(ticks.every(tick => tick.offset === ""));
          }
          for (const speed of [1, 2, 4]) {
            let seconds = 0;
            for (let frame = 0; frame < 301; frame++) {
              seconds = advanceReplay(seconds, 100, model.durationSeconds, speed);
            }
            assert.equal(seconds, model.durationSeconds);
            assert.equal(replayPointer([0, lateSeconds], seconds), 2);
          }
          assert.equal(advanceReplay(0, 10000, model.durationSeconds, 1),
            advanceReplay(0, 100, model.durationSeconds, 1));
          assert.equal(advanceReplay(5, -10, model.durationSeconds, 1), 5);
          assert.equal(replayTimeText(model, model.durationSeconds), "End of day");
          assert.match(replayTimeText(model, model.durationSeconds, true), /^End of day \\(.+ UTC[+-]/);
          const html = renderToStaticMarkup(React.createElement(DayLanes, {
            scope: undefined, stats: null, day, speed: 1,
            onDayChange() {}, onSpeedChange() {}, onStatus() {},
          }));
          // Initial SSR only: no fetched rows or React effects/interaction executed.
          assert.match(html, /Your day/);
          assert.equal(html.includes("Density and clock combine repeated wall times"), model.variableDay);
          assert.doesNotMatch(html, /NaN|Infinity/);
        }
        if (fixture.fold) {
          const [day, firstIso, secondIso, firstOffset, secondOffset] = fixture.fold;
          const model = dayReplayWindow(day);
          const first = new Date(firstIso).getTime(), second = new Date(secondIso).getTime();
          const firstSec = (first - model.startMs) / 1000;
          const secondSec = (second - model.startMs) / 1000;
          assert.ok(elapsedDayFraction(model, first) < elapsedDayFraction(model, second));
          assert.equal(wallDayFraction(model, firstSec), wallDayFraction(model, secondSec));
          assert.ok(dayTimeText(first, true).endsWith(firstOffset));
          assert.ok(dayTimeText(second, true).endsWith(secondOffset));
          assert.notEqual(replayTimeText(model, firstSec), replayTimeText(model, secondSec));
          assert.equal(replayPointer([firstSec, secondSec], firstSec), 1);
          assert.equal(replayPointer([firstSec, secondSec], secondSec), 2);
          const rows = Array.from({length:1000}, (_, id) => ({id, repo_id:"Repo_A",
            ts:id % 2 ? firstIso : secondIso}));
          const density = buildDayDensity(rows);
          assert.equal(density.enabled, true);
          assert.equal(density.cells.length, 1);
          assert.equal(density.cells[0].count, 1000);
        }
        for (const day of ["bad", "2026-02-30", "2026-13-01", "2026-9-30", fixture.skipped].filter(Boolean)) {
          assert.equal(dayReplayWindow(day), null);
          assert.doesNotThrow(() => renderToStaticMarkup(React.createElement(DayLanes, {
            scope: undefined, stats: null, day, speed: 1,
            onDayChange() {}, onSpeedChange() {}, onStatus() {},
          })));
        }
      } finally { await vite.close(); }
    `], { env: { ...process.env, TZ: fixture.zone }, encoding: "utf8", timeout: 25_000 });
    assert.equal(result.status, 0, result.stderr || result.error?.message);
  });
}

test("Day Lanes statically connects real-duration helpers and preserves replay ownership", () => {
  // Wiring evidence only, not an execution of React effects or browser controls.
  const source = readFileSync(resolve(frontendRoot, "src/dayLanes.tsx"), "utf8");
  assert.match(source, /advanceReplay\(v, dt, daySeconds, speed\)/);
  assert.match(source, /\[replay, playing, speed, daySeconds\]/);
  assert.match(source, /\[vt, playing, daySeconds\]/);
  assert.match(source, /max=\{daySeconds\} step=\{seekStep\}/);
  assert.match(source, /const seekPosition = Math\.floor\(replaySeconds \/ seekStep\) \* seekStep;/);
  assert.match(source, /value=\{seekPosition\}/);
  assert.match(source, /aria-valuetext=\{replayTimeText\(timeWindow, seekPosition, true\)\}/);
  assert.match(source, /wallDayFraction\(timeWindow, replaySeconds\)/);
  assert.match(source, /replayPointer\(eventSecs, replaySeconds\)/);
  assert.match(source, /if \(replaySeconds >= daySeconds\) \{ setVt\(0\); setPlaying\(true\); \}/);
  assert.match(source, /replay day again/);
  assert.match(source, /setPlaying\(!reducedMotion\)/);
  assert.match(source, /return \(\) => cancelAnimationFrame\(rafRef\.current\)/);
  assert.match(source, /if \(replay && !keyChanged\)/);
  assert.match(source, /timeWindow && rows && rows\.length > 0 && laneView === "lanes"/);
  assert.match(source, /visual tail clipped at day end/);
  assert.doesNotMatch(source, /\bDAY_S\b|vt \/ 3600/);
});
