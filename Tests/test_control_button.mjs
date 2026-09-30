import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const frontendRoot = resolve(root, "Frontend");
const frontendRequire = createRequire(resolve(frontendRoot, "package.json"));

function attribute (html, name) {
  return html.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] ?? null;
}

function emptyStats () {
  const calendar = Array.from({ length: 365 }, (_, index) => ({
    day: new Date(Date.UTC(2026, 9, 1 - 364 + index)).toISOString().slice(0, 10),
    events: 0, commits: 0, minutes: 0,
  }));
  return {
    mode_counts: { B: 0, A_SCOPED: 0, A_GLOBAL: 0, AMBIGUOUS: 0, UNKNOWN: 0, MANUAL: 0 },
    events_per_task: [], activity_daily: [], activity_calendar: calendar,
    effort_per_task: [], punch_card: Array.from({ length: 7 }, () => Array(24).fill(0)),
    file_coupling: [], file_churn: [],
    wrapped: {
      days: calendar.slice(-7).map(({ day, events, minutes }) => ({ day, events, minutes })),
      top_task: null, busiest_hour: null, files_touched: 0, commits: 0, top_pair: null,
    },
    identity: { extensions: [], ext_total: 0, sessions: 0, first_event_ts: null, commits: 0 },
    provenance: { commits_observed: 0, commits_pre: 0, slots_total: 0, slots_ai: 0, top_files: [] },
  };
}

test("shared control buttons preserve declared busy metadata", { timeout: 30_000 }, async (t) => {
  const React = frontendRequire("react");
  const { renderToStaticMarkup } = frontendRequire("react-dom/server");
  const { createServer } = await import(pathToFileURL(frontendRequire.resolve("vite")).href);
  const vite = await createServer({
    root: frontendRoot,
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
    optimizeDeps: { noDiscovery: true, entries: [] },
  });
  try {
    const { ControlButton, IconButton } = await vite.ssrLoadModule("/src/ui.tsx");
    const render = (props = {}, component = ControlButton) =>
      renderToStaticMarkup(React.createElement(component, props, "Action"));

    await t.test("native true reaches the actual button without shorthand busy", () => {
      const html = render({ "aria-busy": true, disabled: true });
      assert.equal(attribute(html, "aria-busy"), "true");
      assert.equal(attribute(html, "disabled"), "");
    });

    await t.test("45 shorthand, native Booleanish and disabled combinations", () => {
      let cases = 0;
      for (const busy of [undefined, false, true]) {
        for (const native of [undefined, false, true, "false", "true"]) {
          for (const disabled of [undefined, false, true]) {
            const html = render({ busy, "aria-busy": native, disabled });
            const label = JSON.stringify({ busy, native, disabled });
            const expectedBusy = busy === true ? "true" : native === undefined ? null : String(native);
            assert.equal(attribute(html, "aria-busy"), expectedBusy, label);
            assert.equal(attribute(html, "disabled") !== null, busy === true || disabled === true, label);
            cases += 1;
          }
        }
      }
      assert.equal(cases, 45);
    });

    await t.test("defaults, explicit submit type, names and unrelated attributes survive", () => {
      const ordinary = render();
      assert.equal(attribute(ordinary, "type"), "button");
      assert.equal(attribute(ordinary, "aria-busy"), null);
      assert.equal(attribute(ordinary, "disabled"), null);
      assert.match(ordinary, />Action<\/button>$/);
      const explicit = render({ type: "submit", tone: "danger", className: "custom-class",
        "aria-label": "Save & continue", "aria-describedby": "save-note", "data-probe": "kept" });
      assert.equal(attribute(explicit, "type"), "submit");
      assert.equal(attribute(explicit, "aria-label"), "Save &amp; continue");
      assert.equal(attribute(explicit, "aria-describedby"), "save-note");
      assert.equal(attribute(explicit, "data-probe"), "kept");
      assert.match(attribute(explicit, "class"), /\bui-control\b/);
      assert.match(attribute(explicit, "class"), /\bbg-rose-500\b/);
      assert.match(attribute(explicit, "class"), /\bcustom-class\b/);
      assert.equal(attribute(explicit, "tone"), null);
      assert.equal(attribute(render({ busy: true }), "busy"), null);
    });

    await t.test("actual component elements retain handler, ref and prop identities", () => {
      // Element inspection proves forwarding only, not native events or mounted refs.
      const ref = React.createRef();
      const onClick = () => {};
      const onKeyDown = () => {};
      const style = { color: "red" };
      const child = React.createElement("span", null, "Child");
      const element = ControlButton.render({ onClick, onKeyDown, style, children: child,
        "aria-busy": true, "aria-describedby": "note", "data-probe": "kept" }, ref);
      assert.equal(element.type, "button");
      assert.equal(element.ref, ref);
      assert.equal(element.props.onClick, onClick);
      assert.equal(element.props.onKeyDown, onKeyDown);
      assert.equal(element.props.style, style);
      assert.equal(element.props.children, child);
      assert.equal(element.props["aria-describedby"], "note");
      assert.equal(element.props["data-probe"], "kept");
      const iconElement = IconButton.render({ label: "Refresh", onClick, children: child }, ref);
      assert.equal(iconElement.type, ControlButton);
      assert.equal(iconElement.ref, ref);
      assert.equal(iconElement.props.onClick, onClick);
      assert.equal(iconElement.props.children, child);
      const iconButton = ControlButton.render(iconElement.props, iconElement.ref);
      assert.equal(iconButton.ref, ref);
      assert.equal(iconButton.props.onClick, onClick);
    });

    await t.test("IconButton forwards native state, shorthand precedence and accessible names", () => {
      const native = render({ label: "Refresh", "aria-busy": true }, IconButton);
      assert.equal(attribute(native, "aria-busy"), "true");
      assert.equal(attribute(native, "disabled"), null);
      assert.equal(attribute(native, "aria-label"), "Refresh");
      assert.equal(attribute(native, "title"), "Refresh");
      const inactive = render({ label: "Refresh", "aria-busy": "false", title: "Retry refresh" }, IconButton);
      assert.equal(attribute(inactive, "aria-busy"), "false");
      assert.equal(attribute(inactive, "title"), "Retry refresh");
      const shorthand = render({ label: "Refresh", "aria-busy": false, busy: true }, IconButton);
      assert.equal(attribute(shorthand, "aria-busy"), "true");
      assert.equal(attribute(shorthand, "disabled"), "");
    });

    await t.test("actual Overview Report caller exposes busy and idle state without changing copy", async () => {
      const { OverviewView } = await vite.ssrLoadModule("/src/OverviewView.tsx");
      const stats = emptyStats();
      for (const reportBusy of [true, false]) {
        const html = renderToStaticMarkup(React.createElement(OverviewView, {
          scope: undefined, tasks: [], uncommitted: [], repos: [], stats, statsError: "",
          reportBusy, onExportReport() {}, onStatus() {},
          entryState: { relationship: null, day: "2026-10-01", speed: 1 },
          onEntryStateChange() {},
        }));
        const reports = [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)]
          .map(([button]) => button)
          .filter((button) => attribute(button, "title")?.includes("7-day report"));
        assert.equal(reports.length, 1, "actual Report control is present exactly once");
        const [report] = reports;
        assert.equal(attribute(report, "aria-busy"), String(reportBusy));
        assert.equal(attribute(report, "disabled") !== null, reportBusy);
        assert.equal(attribute(report, "type"), "button");
        assert.ok(report.includes(reportBusy ? "Starting…" : "Report ⬇"));
      }
    });
  } finally {
    await vite.close();
  }
});
