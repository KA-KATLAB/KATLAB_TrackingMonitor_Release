import assert from "node:assert/strict";
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

function fixture (rows = calendar()) {
  return {
    activity_calendar: rows,
    wrapped: { days: rows.slice(-7), commits: 0, files_touched: 0,
      top_task: null, busiest_hour: null, top_pair: null },
  };
}

function deepFreeze (value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze); Object.freeze(value);
  }
  return value;
}

function elements (node, React) {
  if (Array.isArray(node)) return node.flatMap((child) => elements(child, React));
  if (!React.isValidElement(node)) return [];
  return [node, ...elements(node.props.children, React)];
}

// Extract the complete real function, replacing only the hook scheduler. The
// single snapshot slot persists across controlled renders; no product date,
// streak, fact visibility, or formatting algorithm is copied here.
function snapshotSubject (dependencies) {
  const ts = frontendRequire("typescript");
  const source = readFileSync(resolve(frontendRoot, "src/WrappedCard.tsx"), "utf8");
  const file = ts.createSourceFile("WrappedCard.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declaration = file.statements.find((node) => ts.isFunctionDeclaration(node)
    && node.name?.text === "WrappedCard");
  assert.ok(declaration, "extract the actual full WrappedCard function");
  const compiled = ts.transpileModule(declaration.getText(file), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  let initialized = false, snapshot, calls = 0;
  const useState = (initial) => {
    calls += 1;
    if (!initialized) { snapshot = initial(); initialized = true; }
    return [snapshot, () => assert.fail("the held snapshot must not be replaced")];
  };
  const exports = {};
  const names = Object.keys(dependencies);
  new Function("exports", "require", "useState", ...names, compiled)(
    exports, frontendRequire, useState, ...Object.values(dependencies));
  return {
    render(props) {
      calls = 0;
      const result = exports.WrappedCard(props);
      assert.equal(calls, 1, "the controlled subject has exactly one actual snapshot hook");
      return result;
    },
  };
}

test("weekly snapshot visibility", { timeout: 30_000 }, async (t) => {
  const React = frontendRequire("react");
  const { renderToStaticMarkup } = frontendRequire("react-dom/server");
  const { createServer } = await import(pathToFileURL(frontendRequire.resolve("vite")).href);
  const vite = await createServer({ root: frontendRoot,
    server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom",
    optimizeDeps: { noDiscovery: true, entries: [] } });
  try {
    const { MomentumStrip } = await vite.ssrLoadModule("/src/momentum.tsx");
    const { WrappedCard } = await vite.ssrLoadModule("/src/WrappedCard.tsx");
    const { calendarRangeLabel } = await vite.ssrLoadModule("/src/calendarDay.ts");
    const { streakOf } = await vite.ssrLoadModule("/src/calendarHeatmap.tsx");
    const { DialogShell } = await vite.ssrLoadModule("/src/dialog.tsx");
    const { DisclosureTable } = await vite.ssrLoadModule("/src/accessibleData.tsx");
    const { fmtMinutes } = await vite.ssrLoadModule("/src/format.ts");
    const { DAYS } = await vite.ssrLoadModule("/src/punchCard.tsx");
    const subject = () => snapshotSubject({ calendarRangeLabel, streakOf,
      DialogShell, DisclosureTable, fmtMinutes, DAYS });
    const shellHtml = (shell) => renderToStaticMarkup(React.createElement("article", null,
      React.createElement("h2", null, shell.props.title),
      React.createElement("p", null, shell.props.description), shell.props.children));
    const momentumHtml = (rows, scope) => renderToStaticMarkup(
      React.createElement(MomentumStrip, { calendar: rows, scope }));
    const disclosure = (shell) => elements(shell, React).find((node) => node.type === DisclosureTable);
    // The actual component runs with React hooks. Only its portal boundary is
    // inspected instead of mounted; this does not exercise native dialog focus.
    function WrappedContent (props) {
      const shell = WrappedCard(props);
      return React.createElement("article", null,
        React.createElement("h2", null, shell.props.title),
        React.createElement("p", null, shell.props.description), shell.props.children);
    }

    await t.test("stale Momentum names supplied selected and preceding dates", () => {
      const html = renderToStaticMarkup(React.createElement(MomentumStrip,
        { calendar: calendar(), scope: "Probe" }));
      assert.ok(html.includes("2026-09-09 to 2026-09-15 (UTC)"), "selected snapshot dates are visible");
      assert.ok(html.includes("2026-09-02 to 2026-09-08 (UTC)"));
      assert.doesNotMatch(html, /this week|last week/i);
    });

    await t.test("zero captures do not hide supplied Wrapped commits", () => {
      const stats = fixture(); stats.wrapped.commits = 3;
      const html = renderToStaticMarkup(React.createElement(WrappedContent,
        { stats, tasks: [], onClose() {} }));
      assert.match(html, />commits</, "the actual commit tile remains present without capture events");
      assert.match(html, />3<\/div>/);
      assert.doesNotMatch(html, /A quiet week|nothing captured|captured when this dialog opened/i);
    });

    await t.test("shared range labels preserve supplied order and frozen dates", () => {
      assert.equal(typeof calendarRangeLabel, "function");
      for (const [rows, expected] of [
        [[], "Dates unavailable (UTC)"],
        [[{ day: "2026-09-15" }], "2026-09-15 (UTC)"],
        [[{ day: "same" }, { day: "same" }], "same (UTC)"],
        [[{ day: "2026-12-31" }, { day: "2027-01-01" }], "2026-12-31 to 2027-01-01 (UTC)"],
        [[{ day: "2024-02-29" }, { day: "2024-03-01" }], "2024-02-29 to 2024-03-01 (UTC)"],
        [[{ day: "z<first>" }, { day: "a&last" }], "z<first> to a&last (UTC)"],
      ]) {
        const before = JSON.stringify(rows); deepFreeze(rows);
        assert.equal(calendarRangeLabel(rows), expected); assert.equal(JSON.stringify(rows), before);
      }
    });

    await t.test("Momentum keeps current and stale full-window values and signed deltas", () => {
      for (const [end, selected, preceding] of [
        ["2026-09-15", "2026-09-09 to 2026-09-15 (UTC)", "2026-09-02 to 2026-09-08 (UTC)"],
        ["2026-10-01", "2026-09-25 to 2026-10-01 (UTC)", "2026-09-18 to 2026-09-24 (UTC)"],
      ]) {
        const rows = calendar(14, end).map((row, index) => ({ ...row,
          events: index < 7 ? 0 : 2, minutes: index < 7 ? 1 : 2, commits: index < 7 ? 2 : 1 }));
        deepFreeze(rows);
        const html = momentumHtml(rows, undefined);
        assert.ok(html.includes(selected)); assert.ok(html.includes(preceding));
        const description = html.match(/<h4[^>]*>Momentum<\/h4><p[^>]*>([^<]*)<\/p>/)?.[1];
        assert.ok(description?.includes(selected)); assert.ok(description?.includes(preceding));
        assert.match(html, /All repos/); assert.match(html, /7\/7/);
        assert.match(html, /new ▲/); assert.match(html, /▲ 100%/); assert.match(html, /▼ 50%/);
        assert.match(html, />14<\/span>/); assert.match(html, />≈ 14m<\/span>/); assert.match(html, />7<\/span>/);
        assert.equal((html.match(/<polyline\b/g) ?? []).length, 6);
        assert.equal((html.match(/title="[^"]*Selected[^"]*Preceding[^"]*"/gi) ?? []).length, 3);
        assert.doesNotMatch(html, /this week|last week|Comparison unavailable/i);
        assert.match(html, /aria-label="Momentum metrics"/); assert.match(html, /overflow-x-auto/);
      }
      const zero = momentumHtml(calendar());
      assert.equal((zero.match(/>—<\/span>/g) ?? []).length, 3);
      assert.equal((zero.match(/<polyline\b/g) ?? []).length, 6);
      assert.doesNotMatch(zero, /Unavailable|NaN|Infinity/);
      const equal = momentumHtml(calendar().map((row) => ({ ...row, events: 1, minutes: 1, commits: 1 })));
      assert.equal((equal.match(/= 0%/g) ?? []).length, 3);
    });

    await t.test("Momentum exposes partial sums without invented prior values or comparison graphics", () => {
      for (const count of [0, 1, 6, 7, 13, 14, 365]) {
        const rows = calendar(count).map((row) => ({ ...row, events: 2, minutes: 3, commits: 1 }));
        const html = momentumHtml(rows);
        const selected = Math.min(count, 7), prior = Math.min(Math.max(count - 7, 0), 7);
        assert.ok(html.includes(`${selected}/7`)); assert.ok(html.includes(`${prior}/7`));
        if (count === 0) {
          assert.equal((html.match(/text-lg font-bold text-slate-100">Unavailable<\/span>/g) ?? []).length, 3);
          assert.match(html, /Dates unavailable \(UTC\)/);
        } else {
          assert.match(html, new RegExp(`>${selected * 2}</span>`));
          assert.match(html, new RegExp(`>≈ ${selected * 3}m</span>`));
        }
        if (prior === 0) assert.match(html, /Preceding[^<]*Unavailable/i);
        else {
          assert.ok(html.includes(`Preceding ${prior * 2}</div>`));
          assert.ok(html.includes(`Preceding ≈ ${prior * 3}m</div>`));
          assert.ok(html.includes(`Preceding ${prior}</div>`));
        }
        if (count < 14) {
          assert.equal((html.match(/Comparison unavailable/gi) ?? []).length, 1);
          assert.doesNotMatch(html, /<polyline\b|new ▲|= 0%|[▲▼] \d+%/);
        } else {
          assert.doesNotMatch(html, /Comparison unavailable/);
          assert.equal((html.match(/<polyline\b/g) ?? []).length, 6);
        }
        assert.doesNotMatch(html, /NaN|Infinity|>0\/0</);
      }
    });

    await t.test("React escapes Momentum scope, supplied dates and tile titles", () => {
      const rows = calendar(14);
      rows[0].day = '<prior>"&'; rows[7].day = '<selected>"&';
      const before = JSON.stringify(rows); deepFreeze(rows);
      const html = momentumHtml(rows, '<scope>"&');
      for (const marker of ["&lt;scope&gt;&quot;&amp;", "&lt;prior&gt;&quot;&amp;", "&lt;selected&gt;&quot;&amp;"]) {
        assert.ok(html.includes(marker), marker);
      }
      assert.doesNotMatch(html, /<scope>|<prior>|<selected>/);
      assert.equal(JSON.stringify(rows), before);
    });

    await t.test("Wrapped distinguishes missing, partial and zero rows while preserving independent facts", () => {
      for (const count of [0, 1, 3, 7]) {
        const stats = fixture();
        stats.wrapped = { ...stats.wrapped, days: calendar(count, "2026-08-07"), commits: 3, files_touched: 5 };
        const shell = subject().render({ stats, tasks: [], onClose() {} });
        const html = shellHtml(shell), table = disclosure(shell);
        assert.equal(shell.type, DialogShell); assert.equal(shell.props.backdropClose, true);
        assert.equal(shell.props.closeLabel, "Close weekly wrapped");
        assert.equal(shell.props.panelClassName, "max-w-lg");
        assert.match(html, /Weekly snapshot/); assert.match(html, /accepted/i);
        assert.ok(html.includes(`${count}/7`));
        assert.match(html, />3<\/div>/); assert.match(html, />commits</);
        assert.match(html, />5<\/div>/); assert.match(html, />files touched</);
        assert.doesNotMatch(html, /Last 7 days|last seven UTC days|captured when|A quiet week/i);
        if (count === 0) {
          assert.equal(table, undefined); assert.doesNotMatch(html, /<figure\b/);
          assert.match(html, /unavailable/i); assert.match(html, /Dates unavailable \(UTC\)/);
          assert.doesNotMatch(html, /No capture events/);
        } else {
          assert.ok(table); assert.equal(table.props.rows, stats.wrapped.days);
          assert.match(html, /No capture events in this snapshot/); assert.match(html, /<figure\b/);
          assert.match(html, new RegExp(`Show exact data[^<]*${count} row`));
          const expectedPeriod = count === 1 ? "2026-08-07 (UTC)"
            : `2026-08-${String(8 - count).padStart(2, "0")} to 2026-08-07 (UTC)`;
          assert.ok(String(shell.props.description).includes(expectedPeriod));
          assert.ok(String(table.props.summary).includes(expectedPeriod));
          assert.ok(String(table.props.summary).includes(`${count}/7`));
          const caption = html.match(/<figcaption[^>]*>([^<]*)<\/figcaption>/)?.[1];
          assert.ok(caption?.includes(expectedPeriod)); assert.ok(caption?.includes(`${count}/7`));
          assert.doesNotMatch(String(shell.props.description), /2026-09/);
          assert.equal(table.props.rowKey(stats.wrapped.days[0]), stats.wrapped.days[0].day);
          assert.deepEqual(table.props.columns.map((column) => column.render(stats.wrapped.days[0])),
            [stats.wrapped.days[0].day, 0, "≈ 0m"]);
          assert.deepEqual(table.props.identity, ["weekly-wrapped-days", ...stats.wrapped.days.map((row) => row.day)]);
          const exact = renderToStaticMarkup(React.createElement(table.type,
            { ...table.props, initiallyOpen: true }));
          const body = exact.match(/<tbody>(.*?)<\/tbody>/s)?.[1];
          assert.ok(body, "actual disclosure can render its zero-valued exact rows");
          assert.equal((body.match(/<tr\b/g) ?? []).length, count);
          assert.ok(body.includes(stats.wrapped.days[0].day)); assert.match(body, /≈ 0m/);
        }
      }
      const stats = fixture([]), html = shellHtml(subject().render({ stats, tasks: [], onClose() {} }));
      assert.match(html, />Unavailable<\/div>/); assert.match(html, /calendar snapshot streak/i);
      for (const [events, expected] of [[[0, 0, 0], "—"], [[0, 0, 1], "—"], [[0, 1, 1], "🔥 2"], [[1, 1, 0], "🔥 2"]]) {
        const withStreak = fixture(calendar(3).map((row, index) => ({ ...row, events: events[index] })));
        const shown = shellHtml(subject().render({ stats: withStreak, tasks: [], onClose() {} }));
        assert.ok(shown.includes(`>${expected}</div>`)); assert.doesNotMatch(shown, />Unavailable<\/div>/);
      }
    });

    await t.test("Wrapped keeps actual snapshot dates, facts, titles and streak across new props", () => {
      const rows = calendar(14).map((row) => ({ ...row, events: 1 }));
      const stats = fixture(rows);
      stats.wrapped = { ...stats.wrapped, days: calendar(7, "2026-08-07").map((row) => ({ ...row, events: 2, minutes: 3 })),
        commits: 11, files_touched: 13,
        top_task: { repo: "Probe", task_ref: "P - A.1", minutes: 65, sessions: 2 },
        busiest_hour: { dow: 2, hour: 9, events: 17 },
        top_pair: { repo: "Probe", file_a: "first.ts", file_b: "second.ts", shared: 2 } };
      const tasks = [{ repo: "Other", task_ref: "P - A.1", title: "Wrong repository" },
        { repo: "Probe", task_ref: "P - A.1", title: "Held task title" }];
      deepFreeze(stats); deepFreeze(tasks);
      let oldCloses = 0, newCloses = 0;
      const holder = subject(), oldClose = () => { oldCloses += 1; }, newClose = () => { newCloses += 1; };
      const original = holder.render({ stats, tasks, onClose: oldClose });
      const changed = fixture(calendar(365, "2026-10-01"));
      changed.wrapped.commits = 999;
      const latest = holder.render({ stats: changed,
        tasks: [{ repo: "Probe", task_ref: "P - A.1", title: "New title" }], onClose: newClose });
      assert.equal(original.props.onClose, oldClose); assert.equal(latest.props.onClose, newClose);
      latest.props.onClose(); assert.equal(newCloses, 1); assert.equal(oldCloses, 0);
      assert.equal(shellHtml(latest), shellHtml(original));
      const html = shellHtml(latest), table = disclosure(latest);
      assert.ok(html.includes("2026-08-01 to 2026-08-07 (UTC)"));
      assert.match(html, /Held task title/); assert.doesNotMatch(html, /Wrong repository|New title|999|2026-10-01/);
      assert.match(html, />11<\/div>/); assert.match(html, />13<\/div>/); assert.match(html, /🔥 14/);
      assert.match(html, /≈ 1h 5m/); assert.match(html, /2 sessions/); assert.match(html, /Tue 09:00/);
      assert.match(html, /local time/); assert.match(html, /first\.ts/); assert.match(html, /second\.ts/);
      assert.equal(table.props.rows, stats.wrapped.days);
      assert.equal(table.props.columns[2].render(stats.wrapped.days[0]), "≈ 3m");
      const reopened = shellHtml(subject().render({ stats: changed, tasks: [], onClose: newClose }));
      assert.match(reopened, /2026-09-25 to 2026-10-01 \(UTC\)/); assert.match(reopened, />999<\/div>/);
      assert.doesNotMatch(reopened, /Held task title|2026-08-01 to 2026-08-07/);
    });

    await t.test("Wrapped escapes held text and preserves top facts with zero captures or absent days", () => {
      const stats = fixture([]);
      stats.wrapped = { ...stats.wrapped, days: [{ day: '<day>"&', events: 0, minutes: 0 }],
        top_task: { repo: "<repo>&", task_ref: "Plan - Fallback <task>&", minutes: 5, sessions: 1 },
        busiest_hour: { dow: 0, hour: 0, events: 1 },
        top_pair: { repo: "<repo>&", file_a: "<first>&", file_b: "<second>&", shared: 1 } };
      const before = JSON.stringify(stats); deepFreeze(stats);
      const html = shellHtml(subject().render({ stats, tasks: [], onClose() {} }));
      for (const marker of ["&lt;day&gt;&quot;&amp;", "Fallback &lt;task&gt;&amp;", "&lt;repo&gt;&amp;", "&lt;first&gt;&amp;", "&lt;second&gt;&amp;"]) {
        assert.ok(html.includes(marker), marker);
      }
      assert.doesNotMatch(html, /<day>|<task>|<repo>|<first>|<second>/);
      assert.match(html, /1 session/); assert.match(html, /Sun 00:00/); assert.match(html, /1 task/);
      assert.equal(JSON.stringify(stats), before);
      const withoutDays = { ...stats, wrapped: { ...stats.wrapped, days: [] } };
      const absent = shellHtml(subject().render({ stats: withoutDays, tasks: [], onClose() {} }));
      assert.match(absent, /Weekly day data is unavailable/);
      assert.match(absent, /Fallback &lt;task&gt;&amp;/); assert.match(absent, /Sun 00:00/);
      assert.match(absent, /&lt;first&gt;&amp;/); assert.match(absent, /&lt;second&gt;&amp;/);
    });
  } finally { await vite.close(); }
});
