// v0.1.3.0 D2 (dashboard) + D4 (Mermaid relationship graph). v0.1.6.0 C.1
// (RV1): the /api/stats fetch LIFTED to App (sidebar/groups need effort on
// the Changes view) — this view renders {stats, statsError} props; the R12
// trigger semantics live in App's [tab, statsNonce] effect. The graph
// lazy-loads mermaid on first open.

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { api, createActionDeadline, isAbortError } from "./api";
import type { ActionDeadline, HistoryEntry, Repo, Task, TrackedEvent } from "./api";
import { fmtMinutes } from "./format";
import { CalendarHeatmap, RAMP, RampLegend, streakOf } from "./calendarHeatmap";
import { Skyline } from "./skyline";
import { IdentityCard } from "./identityCard";
import { ChurnMap } from "./churnMap";
import { GoalRings } from "./goalRings";
import { CouplingArcs } from "./couplingArcs";
import { MomentumStrip } from "./momentum";
import { PlanBoard } from "./planBoard";
import { Records } from "./records";
import { SnakeCalendar } from "./snakeGame";
import { TrophyCase } from "./trophies";
import { DayLanes } from "./dayLanes";
import { DAYS, PunchCard } from "./punchCard";
import { ProvenanceCard } from "./provenance";
import { activityLine, eventsPerTaskBar, modeDistributionBar } from "./charts";
import type { StatsData } from "./charts";
import { buildBackbone, MermaidModuleLoadError, renderBackbone } from "./mermaidGraph";
import type { BackboneRow } from "./mermaidGraph";
import { useReveal } from "./reveal";
import { MODE_CHART_LABEL, MODE_ORDER, prefersReducedMotion,
  subscribeReducedMotion, usePrefersReducedMotion } from "./theme";
import { BoundedChoiceDialog, DialogShell } from "./dialog";
import { DisclosureTable, activitySummary, eventsPerTaskSummary,
  modeDistributionSummary } from "./accessibleData";
import { ControlButton, SectionHeading, SegmentedControl, Surface } from "./ui";

export interface OverviewEntryState {
  relationship: { repoId: string; planFile: string } | null;
  day: string;
  speed: 1 | 2 | 4;
}

interface PunchAlternativeRow {
  dayIndex: number;
  day: string;
  hour: number;
  count: number;
}

function punchAlternativeRows (matrix: number[][]): PunchAlternativeRow[] {
  return matrix.flatMap((row, dayIndex) => row.flatMap((count, hour) => count > 0
    ? [{ dayIndex, day: DAYS[dayIndex] ?? `Day ${dayIndex + 1}`, hour, count }]
    : []));
}

function punchAlternativeSummary (matrix: number[][]): string {
  const rows = punchAlternativeRows(matrix);
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  if (rows.length === 0) return "No activity is recorded by weekday and local hour.";
  const peak = rows.reduce((best, row) => row.count > best.count ? row : best, rows[0]);
  return `${total.toLocaleString("en-US")} events across ${rows.length} non-zero cells; peak `
    + `${peak.day} ${String(peak.hour).padStart(2, "0")}:00 with ${peak.count.toLocaleString("en-US")}.`;
}

function calendarAlternativeSummary (calendar: StatsData["activity_calendar"]): string {
  const active = calendar.filter((day) => day.events > 0 || day.commits > 0 || day.minutes > 0);
  const events = active.reduce((sum, day) => sum + day.events, 0);
  const commits = active.reduce((sum, day) => sum + day.commits, 0);
  if (active.length === 0) return "No non-zero UTC days are available in the 365-day window.";
  return `${active.length} non-zero UTC day${active.length === 1 ? "" : "s"}; `
    + `${events.toLocaleString("en-US")} events and ${commits.toLocaleString("en-US")} commits.`;
}

export function OverviewView ({ scope, tasks, uncommitted, repos, stats, statsError,
  onOpenFileStory, onOpenWrapped, onExportReport, reportBusy = false,
  initialDayScopeAction = false, onInitialDayScopeActionConsumed, onStatus, entryState,
  onEntryStateChange }: {
  scope: string | undefined; // undefined = ALL
  tasks: Task[];
  uncommitted: TrackedEvent[];
  repos: Repo[];
  // v0.1.6.0 D1 (C.1, RV1/RV10): the stats fetch lifted to App — this
  // view renders the props; the error message renders exactly where the
  // local error did before the lift.
  stats: StatsData | null;
  statsError: string;
  // v0.1.7.0 D1/D2 (B.1/B.2): coupling-row file names open the file story.
  onOpenFileStory?: (repo: string, file: string) => void;
  // v0.1.8.0 D3 (C.1): the header button lifts the open to App (the modal
  // home is App's call site — the FileStory precedent).
  onOpenWrapped?: () => void;
  onExportReport?: (range: 7 | 30) => void;
  reportBusy?: boolean;
  initialDayScopeAction?: boolean;
  onInitialDayScopeActionConsumed?: () => void;
  onStatus: (message: string) => void;
  entryState: OverviewEntryState;
  onEntryStateChange: (state: OverviewEntryState) => void;
}) {

  const totalEvents = stats ? Object.values(stats.mode_counts).reduce((a, b) => a + b, 0) : 0;
  // v0.1.9.0 D1 (B.1): flat | city calendar toggle — DEFAULT city,
  // persisted under the notify.ts key convention. v0.1.13.0 D1 (B.1):
  // the union widens with "snake" — legacy stored values stay valid,
  // unknown/absent still defaults "city".
  const [calView, setCalView] = useState<"city" | "flat" | "snake">(() => {
    const v = localStorage.getItem("katlab.calendarView");
    return v === "flat" || v === "snake" ? v : "city";
  });
  const pickCalView = (v: "city" | "flat" | "snake") => {
    setCalView(v);
    localStorage.setItem("katlab.calendarView", v);
  };
  // v0.1.11.0 D2 (B.2): list | arcs coupling toggle — DEFAULT arcs (the
  // flat|city recipe verbatim).
  const [couplingView, setCouplingView] = useState<"arcs" | "list">(
    () => (localStorage.getItem("katlab.couplingView") === "list" ? "list" : "arcs"));
  const pickCouplingView = (v: "arcs" | "list") => {
    setCouplingView(v);
    localStorage.setItem("katlab.couplingView", v);
  };
  // Coupling rank display: rows arrive API-ranked (-shared, repo, a, b) —
  // make the ranking VISIBLE: #n numeral + ×N badge tinted by strength
  // (quartile of the max, the calendar/punch-card bucket rule; shared >= 1
  // so the zero-slate ramp step never applies).
  const couplingMax = Math.max(1, ...(stats?.file_coupling.map((c) => c.shared) ?? [1]));

  useReveal("overview", [stats]); // D5: stagger KPI cards + charts, once per session

  return (
    <div className="space-y-8">
      <SectionHeading
        title={`Overview ${scope ? `— ${scope}` : "— All repos"}`}
        description="Live work, trends, exploration, and task relationships in the current scope."
        headingProps={{ "data-view-heading": true, tabIndex: -1 }}
        className="!mb-0 border-l-4 border-teal-500 pl-3"
        actions={stats && (
          <>
            {onOpenWrapped && ( /* v0.1.8.0 D3 (C.1) */
              <ControlButton onClick={onOpenWrapped}>Your week ✨</ControlButton>
            )}
            {/* v0.2.0.1 D1 (B.1): the 7d report, current scope */}
            <ControlButton onClick={() => onExportReport?.(7)} disabled={reportBusy}
              aria-busy={reportBusy}
              title="download this scope's 7-day report as one self-contained HTML file">
              {reportBusy ? "Starting…" : "Report ⬇"}
            </ControlButton>
          </>
        )}
      />
      {statsError && (
        <p data-route-hydration-failure tabIndex={-1}
          aria-label="Overview data load failure"
          className="rounded-control border border-rose-500/40 bg-rose-950/30 px-3 py-2 text-sm text-rose-200">
          {statsError}
        </p>
      )}

      <section aria-labelledby="overview-now-heading" className="space-y-4">
        <SectionHeading headingId="overview-now-heading" level={3}
          title="Now" description="The current workload and this week's direction."
          className="!mb-0" />
        {!stats && !statsError && (
          <p className="rounded-control border border-ui-border bg-ui-surface px-3 py-2 text-sm text-ui-muted">
            Loading overview data…
          </p>
        )}
        {stats && <KpiRow stats={stats} repos={repos} uncommitted={uncommitted} />}
        {/* v0.2.2.0 D1 (B.1, RV1): the now-layer — a SIBLING before both
            totalEvents branches (never nested; the board is task-driven,
            not event-driven), gated on its OWN data (the component hides
            itself at zero active plans). */}
        {stats && (
          <PlanBoard tasks={tasks}
            onOpenFileStory={(repo, file) => onOpenFileStory?.(repo, file)} />
        )}
        {stats && totalEvents > 0 && (
          <MomentumStrip calendar={stats.activity_calendar} scope={scope} />
        )}
        {stats && totalEvents === 0 && (
          <p className="rounded-control border border-ui-border bg-ui-surface px-3 py-2 text-sm text-ui-muted">
            No events captured yet — trend and exploration panels will appear after the first capture.
          </p>
        )}
      </section>

        {stats && totalEvents > 0 && (
          <>
            <section aria-labelledby="overview-trends-heading" className="space-y-4">
              <SectionHeading headingId="overview-trends-heading" level={3}
                title="Trends" description="Attribution, activity, timing, and files that move together."
                className="!mb-0" />
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <ChartCard title="Attribution health"
                exactData={(
                  <DisclosureTable
                    label="Attribution health"
                    summary={modeDistributionSummary(stats)}
                    rows={MODE_ORDER.map((mode) => ({
                      mode,
                      label: MODE_CHART_LABEL[mode],
                      count: stats.mode_counts[mode] ?? 0,
                    }))}
                    rowKey={(row) => row.mode}
                    identity={["chart-modes", scope === undefined ? "all" : "repo", scope]}
                    columns={[
                      { key: "label", label: "Mode", render: (row) => row.label },
                      { key: "code", label: "Code", render: (row) => row.mode,
                        cellClassName: "font-mono" },
                      { key: "count", label: "Events", render: (row) => row.count.toLocaleString("en-US"),
                        cellClassName: "text-right tabular-nums",
                        headerClassName: "text-right" },
                    ]}
                  />
                )}>
                <ChartCanvas make={(c) => modeDistributionBar(c, stats)} dep={stats} />
              </ChartCard>
              <ChartCard title="Events per task (top 10)"
                exactData={(
                  <DisclosureTable
                    label="Events per task"
                    summary={eventsPerTaskSummary(stats, scope === undefined)}
                    rows={stats.events_per_task}
                    rowKey={(row) => JSON.stringify([row.repo, row.task_ref])}
                    identity={["chart-events-per-task", scope === undefined ? "all" : "repo", scope]}
                    columns={[
                      { key: "repo", label: "Repository", render: (row) => row.repo,
                        sortValue: (row) => row.repo },
                      { key: "task", label: "Task", render: (row) => row.task_ref,
                        sortValue: (row) => row.task_ref },
                      { key: "count", label: "Events", render: (row) => row.count.toLocaleString("en-US"),
                        sortValue: (row) => row.count, cellClassName: "text-right tabular-nums",
                        headerClassName: "text-right" },
                    ]}
                  />
                )}>
                <ChartCanvas make={(c) => eventsPerTaskBar(c, stats, scope === undefined)} dep={stats} />
              </ChartCard>
              <ChartCard title="Activity (14 days)"
                exactData={(
                  <DisclosureTable
                    label="Activity over 14 days"
                    summary={activitySummary(stats)}
                    rows={stats.activity_daily}
                    rowKey={(row) => row.day}
                    identity={["chart-activity-daily", scope === undefined ? "all" : "repo", scope]}
                    columns={[
                      { key: "day", label: "UTC day", render: (row) => row.day },
                      { key: "count", label: "Events", render: (row) => row.count.toLocaleString("en-US"),
                        cellClassName: "text-right tabular-nums", headerClassName: "text-right" },
                    ]}
                  />
                )}>
                <ChartCanvas make={(c) => activityLine(c, stats)} dep={stats} />
              </ChartCard>
            </div>
            {/* v0.1.5.0 D2 (C.2): year calendar — below the charts, above the
                Mermaid map; behind the same totalEvents gate (RV6); the card
                body scrolls horizontally on narrow viewports (RV11). */}
            <Surface data-reveal>
              <SectionHeading level={4} title="Activity calendar"
                description="Last 365 days (UTC)."
                actions={(
                  <>
                    {/* v0.1.7.0 D4 (C.1): shown only when >= 2 (1-day = noise) */}
                    {streakOf(stats.activity_calendar) >= 2 && (
                      <span className="text-xs font-medium text-amber-300"
                        title="consecutive UTC days with captured activity">
                        🔥 {streakOf(stats.activity_calendar)}-day streak
                      </span>
                    )}
                    {/* v0.1.9.0 D1 (B.1): instant presentation switch */}
                    <SegmentedControl label="calendar view" value={calView}
                      onChange={pickCalView}
                      options={(["flat", "city", "snake"] as const).map((value) => ({
                        value,
                        label: value,
                      }))} />
                  </>
                )} />
              <div className="ui-local-scroller overflow-x-auto" role="region"
                aria-label="Activity calendar visualization" tabIndex={0}>
                {calView === "city"
                  ? <Skyline calendar={stats.activity_calendar} />
                  : calView === "snake"
                    ? <SnakeCalendar calendar={stats.activity_calendar} />
                    : <CalendarHeatmap calendar={stats.activity_calendar} />}
              </div>
              {/* v0.1.9.0 B.1 (RV8): ONE legend home below whichever view */}
              <RampLegend />
              <DisclosureTable
                label="Activity calendar"
                summary={calendarAlternativeSummary(stats.activity_calendar)}
                rows={stats.activity_calendar.filter((day) =>
                  day.events > 0 || day.commits > 0 || day.minutes > 0)}
                rowKey={(row) => row.day}
                identity={["calendar-active-days", scope === undefined ? "all" : "repo", scope]}
                emptyMessage="No non-zero UTC days are available."
                columns={[
                  { key: "day", label: "UTC day", render: (row) => row.day },
                  { key: "events", label: "Events", render: (row) => row.events.toLocaleString("en-US"),
                    cellClassName: "text-right tabular-nums", headerClassName: "text-right" },
                  { key: "commits", label: "Commits", render: (row) => row.commits.toLocaleString("en-US"),
                    cellClassName: "text-right tabular-nums", headerClassName: "text-right" },
                  { key: "minutes", label: "Effort", render: (row) => row.minutes > 0 ? fmtMinutes(row.minutes) : "—",
                    cellClassName: "text-right tabular-nums", headerClassName: "text-right" },
                ]}
              />
            </Surface>
            {/* v0.1.8.0 D1 (B.1): day lanes — year -> day -> aggregates
                chronology; the stats prop is the RV9 freshness signal. */}
            <div className="[&>div]:mt-0">
              <DayLanes scope={scope} stats={stats} day={entryState.day} speed={entryState.speed}
                onDayChange={(day) => onEntryStateChange({ ...entryState, day })}
                onSpeedChange={(speed) => onEntryStateChange({ ...entryState, speed })}
                initialScopeAction={initialDayScopeAction}
                onInitialScopeActionConsumed={onInitialDayScopeActionConsumed}
                onStatus={onStatus} />
            </div>
            {/* v0.1.7.0 D1+D3 (B.1): coupling + punch card share a 2-col
                row (1-col on narrow); coupling card HIDDEN when empty (the
                corner-dot precedent); overflow-x-auto bodies (v0.1.5.0
                RV11 rule). */}
            <div className="grid gap-4 xl:grid-cols-2">
              {stats.file_coupling.length > 0 && (
                <Surface data-reveal>
                  <SectionHeading level={4} title="Files that change together"
                    description="Ranked file pairs that share task activity."
                    actions={(
                      <SegmentedControl label="coupling view" value={couplingView}
                        onChange={pickCouplingView}
                        options={(["list", "arcs"] as const).map((value) => ({
                          value,
                          label: value,
                        }))} />
                    )} />
                  {couplingView === "arcs" && (
                    <div className="ui-local-scroller overflow-x-auto" role="region"
                      aria-label="File coupling constellation" tabIndex={0}>
                      <CouplingArcs pairs={stats.file_coupling}
                        couplingMax={couplingMax} />
                    </div>
                  )}
                  {couplingView === "list" && (
                    <p className="text-xs text-slate-400">
                      Use the exact-data table below to open either file in a pair.
                    </p>
                  )}
                  <DisclosureTable key={couplingView}
                    label="Files that change together"
                    summary={`${stats.file_coupling.length} ranked pair${stats.file_coupling.length === 1 ? "" : "s"}; `
                      + `the strongest pair shares ${couplingMax} task${couplingMax === 1 ? "" : "s"}.`}
                    rows={stats.file_coupling}
                    rowKey={(row) => JSON.stringify([row.repo, row.file_a, row.file_b])}
                    identity={["file-coupling", scope === undefined ? "all" : `repo:${scope}`]}
                    initiallyOpen={couplingView === "list"}
                    columns={[
                      { key: "repo", label: "Repository", render: (row) => row.repo,
                        sortValue: (row) => row.repo },
                      { key: "file-a", label: "File A", render: (row) =>
                        <CouplingFile repo={row.repo} file={row.file_a} onOpen={onOpenFileStory} />,
                      sortValue: (row) => row.file_a },
                      { key: "file-b", label: "File B", render: (row) =>
                        <CouplingFile repo={row.repo} file={row.file_b} onOpen={onOpenFileStory} />,
                      sortValue: (row) => row.file_b },
                      { key: "shared", label: "Shared tasks", render: (row) => row.shared,
                        sortValue: (row) => row.shared, cellClassName: "text-right tabular-nums",
                        headerClassName: "text-right" },
                    ]}
                    className="mt-2"
                  />
                </Surface>
              )}
              <Surface data-reveal>
                <SectionHeading level={4} title="When do I work"
                  description="Activity by weekday and hour (local time)." />
                <div className="ui-local-scroller overflow-x-auto" role="region"
                  aria-label="Weekday and hour visualization" tabIndex={0}>
                  <PunchCard matrix={stats.punch_card} />
                </div>
                <DisclosureTable
                  label="Activity by weekday and hour"
                  summary={punchAlternativeSummary(stats.punch_card)}
                  rows={punchAlternativeRows(stats.punch_card)}
                  rowKey={(row) => JSON.stringify([row.dayIndex, row.hour])}
                  identity={["punch-nonzero", scope === undefined ? "all" : "repo", scope]}
                  emptyMessage="No non-zero weekday/hour cells are available."
                  columns={[
                    { key: "day", label: "Day", render: (row) => row.day },
                    { key: "hour", label: "Local hour", render: (row) => `${String(row.hour).padStart(2, "0")}:00` },
                    { key: "events", label: "Events", render: (row) => row.count.toLocaleString("en-US"),
                      cellClassName: "text-right tabular-nums", headerClassName: "text-right" },
                  ]}
                />
              </Surface>
            </div>
            </section>

            <section aria-labelledby="overview-explore-heading" className="space-y-4">
              <SectionHeading headingId="overview-explore-heading" level={3}
                title="Explore" description="Goals, identity, codebase signals, and earned progress."
                className="!mb-0" />
            {/* v0.1.10.0 D1+D2 + v0.1.11.0 D1 (B.1): rings | identity |
                churn — the responsive 1/2/3-column row keeps today's goals
                FIRST; the rings instance is KEYED BY SCOPE (RV2a/RV3 —
                ONLY the rings remount on a tab switch, this view itself
                must keep persisting); the churn card still hides at 0
                rows. */}
            <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
              <Surface data-reveal>
                <div className="ui-local-scroller overflow-x-auto" role="region"
                  aria-label="Daily goal rings" tabIndex={0}>
                  <GoalRings key={scope ? `repo:${scope}` : "all"} scope={scope}
                    calendar={stats.activity_calendar} onStatus={onStatus} />
                </div>
              </Surface>
              <Surface data-reveal>
                <div className="ui-local-scroller overflow-x-auto" role="region"
                  aria-label="Repository identity" tabIndex={0}>
                  <IdentityCard identity={stats.identity}
                    calendar={stats.activity_calendar} scope={scope} />
                </div>
              </Surface>
              {stats.file_churn.length > 0 && (
                <Surface data-reveal>
                  <div className="ui-local-scroller overflow-x-auto" role="region"
                    aria-label="Codebase heat visualization" tabIndex={0}>
                    <ChurnMap churn={stats.file_churn}
                      onOpenFileStory={onOpenFileStory} />
                  </div>
                </Surface>
              )}
            </div>
            {/* v0.1.9.0 D2 (C.1): trophy case; v0.2.1.0 D1 (B.1, RV1): the
                ARCADE SHELF — trophies | records in a 2-col row (trophies
                first; a deliberate documented placement change). The
                records instance ALONE is scope-keyed (the rings law). */}
            <div className="grid gap-4 xl:grid-cols-2">
              <TrophyCase stats={stats} tasks={tasks} scope={scope} />
              <Records key={scope ? `repo:${scope}` : "all"} calendar={stats.activity_calendar} />
            </div>
            {/* v0.2.11.0 D9 (A.4): the provenance ledger — FULL WIDTH below
                the arcade shelf (its rows are file paths), inside this
                totalEvents branch; the card hides itself at zero slots. */}
            <ProvenanceCard provenance={stats.provenance} scope={scope}
              onOpenFileStory={onOpenFileStory} />
            </section>
          </>
        )}

      <GraphPanel tasks={tasks} uncommitted={uncommitted} repos={repos} scope={scope}
        selection={entryState.relationship}
        onStatus={onStatus}
        onSelectionChange={(relationship) => onEntryStateChange({ ...entryState, relationship })} />
    </div>
  );
}

// v0.1.7.0 D1 (B.1, RV4): each file name in a coupling row is its OWN
// button opening THAT file's story; middle-truncated, full path in title.
function CouplingFile ({ repo, file, onOpen }:
  { repo: string; file: string; onOpen?: (repo: string, file: string) => void }) {
  const name = file.length > 28 ? `${file.slice(0, 13)}…${file.slice(-14)}` : file;
  if (!onOpen) return <span className="break-all">{file}</span>;
  return (
    <button type="button" onClick={() => onOpen(repo, file)}
      aria-label={`${file} — open file story`} title={`${file} — open file story`}
      className="inline-flex min-h-6 min-w-6 items-center truncate text-sky-300 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">
      {name}
    </button>
  );
}

// D1 (v0.1.4.0): KPI row — the "at a glance" numbers above the charts.
// Sources are PINNED by the plan: /api/stats (total, auto-%, busiest), the
// UNCOMMITTED events prop (needs-pick — must equal the pick-queue N), and
// /api/repos (clean/total, uncommitted sum). Empty-safe: no NaN on total=0.
function KpiRow ({ stats, repos, uncommitted }:
  { stats: StatsData; repos: Repo[]; uncommitted: TrackedEvent[] }) {
  const total = Object.values(stats.mode_counts).reduce((a, b) => a + b, 0);
  const auto = (stats.mode_counts.B ?? 0) + (stats.mode_counts.A_SCOPED ?? 0) +
    (stats.mode_counts.A_GLOBAL ?? 0);
  const autoPct = total > 0 ? Math.round((auto / total) * 100) : 0;
  const needsPick = uncommitted.filter((e) => e.mode === "AMBIGUOUS" || e.mode === "UNKNOWN").length;
  const clean = repos.filter((r) => r.clean).length;
  const uncommittedSum = repos.reduce((n, r) => n + r.count, 0);
  // v0.1.6.0 D1 (C.1): today's effort = the calendar's LAST (UTC) day —
  // no extra stats key; label carries the (UTC) day-basis marker (RV18).
  const todayMinutes = stats.activity_calendar[stats.activity_calendar.length - 1]?.minutes ?? 0;
  const busiest = stats.events_per_task[0]; // backend sorts count DESC — [0] is the top
  return (
    <div className="grid gap-3"
      style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
      <Kpi label="captured events" value={total} />
      <Kpi label="auto-attributed" value={autoPct} suffix="%" />
      <Kpi label="need a pick" value={needsPick} />
      <Kpi label="repos clean" value={clean} suffix={`/${repos.length}`} />
      <Kpi label="uncommitted changes" value={uncommittedSum} />
      <Kpi label="time today (UTC)" value={todayMinutes} format={fmtMinutes}
        tip="estimated from capture timestamps — 15-min gap rule" />
      {busiest && (
        <Kpi label="busiest task" value={busiest.count}
          sub={busiest.task_ref.split(" - ").pop()} />
      )}
    </div>
  );
}

// v0.1.6.0 D1 (C.1, RV8): optional format prop — count-up stays NUMERIC,
// the formatter renders each frame (effort KPI: fmtMinutes carries the ≈).
function Kpi ({ label, value, suffix, sub, format, tip }:
  { label: string; value: number; suffix?: string; sub?: string;
    format?: (n: number) => string; tip?: string }) {
  const shown = useCountUp(value);
  const heroRef = useRef<HTMLDivElement | null>(null);
  const fitRef = useRef<() => void>(() => {});

  // D2(b) (B.2): scale over-wide hero values via transform so huge counts
  // never break the auto-fit grid; re-fits on card resize and on every
  // count-up frame (the final value is the widest).
  useEffect(() => {
    const el = heroRef.current;
    if (!el) return;
    fitRef.current = () => {
      el.style.transform = "";
      const k = el.clientWidth / el.scrollWidth;
      if (k < 1) {
        el.style.transformOrigin = "left bottom";
        el.style.transform = `scale(${Math.max(0.5, k)})`;
      }
    };
    const ro = new ResizeObserver(() => fitRef.current());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => { fitRef.current(); }, [shown, suffix]);

  return (
    <Surface data-reveal title={tip}>
      <div ref={heroRef}
        className="whitespace-nowrap font-mono text-4xl font-bold leading-none text-slate-100">
        {format ? format(shown) : shown.toLocaleString()}{suffix}
      </div>
      <div className="mt-1.5 min-h-8 break-words text-[11px] font-semibold uppercase leading-4 tracking-wide text-slate-400"
        title={sub ? `${label} · ${sub}` : label}>
        {label}{sub ? ` · ${sub}` : ""}
      </div>
    </Surface>
  );
}

// D1 count-up: rAF ease-out from the previous value; SKIPPED entirely under
// prefers-reduced-motion (V5 — the final value renders immediately).
function useCountUp (target: number): number {
  // T5: start at 0 so the ENTRANCE animates 0→N (the point of a count-up);
  // under reduced motion start at the target — never a fake zero.
  const reducedMotion = usePrefersReducedMotion();
  const initial = prefersReducedMotion() ? target : 0;
  const [value, setValue] = useState(initial);
  const prev = useRef(initial);
  useEffect(() => {
    const start = prev.current;
    prev.current = target;
    if (reducedMotion || start === target) { setValue(target); return; }
    const t0 = performance.now();
    const DUR = 600;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / DUR);
      setValue(Math.round(start + (target - start) * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reducedMotion, target]);
  return value;
}

function ChartCard ({ title, children, exactData }: {
  title: string;
  children: React.ReactNode;
  exactData: React.ReactNode;
}) {
  const titleId = useId();
  return (
    <figure data-reveal aria-labelledby={titleId}
      className="ui-surface">
      <figcaption>
        <SectionHeading headingId={titleId} level={4} title={title} />
      </figcaption>
      <div className="h-56 min-w-0">{children}</div> {/* R18: explicit height */}
      {exactData}
    </figure>
  );
}

interface ManagedChart {
  destroy: () => void;
  stop?: () => void;
  update?: (mode?: "none") => void;
}

// R2: create in an effect, destroy on cleanup + before re-create on data change.
function ChartCanvas ({ make, dep }: {
  make: (canvas: HTMLCanvasElement) => ManagedChart;
  dep: unknown;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    const chart = make(ref.current);
    const unsubscribe = subscribeReducedMotion(() => {
      if (!prefersReducedMotion()) return;
      chart.stop?.();
      chart.update?.("none");
    });
    return () => {
      unsubscribe();
      chart.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dep]);
  return <canvas ref={ref} aria-hidden="true" />;
}

interface RelationshipOwner {
  controller: AbortController;
  action?: ActionDeadline;
}

interface RelationshipFailure {
  message: string;
  recovery: "retry" | "reload";
}

// D4: per-plan Mermaid backbone. Lazy: mermaid loads only when a plan is picked.
function GraphPanel ({ tasks, uncommitted, repos, scope, selection, onSelectionChange,
  onStatus }: {
  tasks: Task[]; uncommitted: TrackedEvent[]; repos: Repo[];
  scope: string | undefined;
  selection: OverviewEntryState["relationship"];
  onSelectionChange: (selection: OverviewEntryState["relationship"]) => void;
  onStatus: (message: string) => void;
}) {
  const plans = useMemo(() => {
    const seen = new Map<string, { repo: string; plan_file: string }>();
    for (const task of tasks) {
      seen.set(JSON.stringify([task.repo, task.plan_file]), {
        repo: task.repo,
        plan_file: task.plan_file,
      });
    }
    return [...seen.values()];
  }, [tasks]);
  const selected = selection && plans.some((plan) => plan.repo === selection.repoId
    && plan.plan_file === selection.planFile)
    ? selection
    : null;
  const selectedValue = selected
    ? JSON.stringify([selected.repoId, selected.planFile])
    : "";
  const planChoices = plans.map((plan) => ({
    id: JSON.stringify([plan.repo, plan.plan_file]),
    label: `${plan.repo} · ${plan.plan_file.split("/").pop()}`,
    description: plan.plan_file,
  }));
  const semanticKey = useMemo(() => selected ? JSON.stringify([
    "relationship",
    selected.repoId,
    selected.planFile,
    repos.some((repo) => repo.id === selected.repoId),
    tasks.filter((task) => task.repo === selected.repoId
      && task.plan_file === selected.planFile)
      .map((task) => [task.task_ref, task.task_id, task.title, task.files]),
    uncommitted.filter((event) => event.repo_id === selected.repoId)
      .map((event) => [event.id, event.task_ref]),
  ]) : "", [repos, selected, tasks, uncommitted]);

  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const uncommittedRef = useRef(uncommitted);
  uncommittedRef.current = uncommitted;
  const reposRef = useRef(repos);
  reposRef.current = repos;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const semanticKeyRef = useRef(semanticKey);
  semanticKeyRef.current = semanticKey;
  const [svg, setSvg] = useState("");
  const [graphRows, setGraphRows] = useState<BackboneRow[]>([]);
  const [note, setNote] = useState("");
  const [failure, setFailure] = useState<RelationshipFailure | null>(null);
  const [settledKey, setSettledKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const workGenerationRef = useRef(0);
  const workOwnerRef = useRef<RelationshipOwner | null>(null);
  const workSelectionRef = useRef("");
  const trailingRefreshRef = useRef(false);
  const pendingActionRef = useRef<{ selectionKey: string; action: ActionDeadline } | null>(null);
  const moduleUnavailableRef = useRef(false);

  const disposeOwner = useCallback((owner: RelationshipOwner | null, abort: boolean) => {
    if (!owner) return;
    if (abort) owner.controller.abort();
    owner.action?.clear();
  }, []);

  const cancelWork = useCallback(() => {
    workGenerationRef.current += 1;
    disposeOwner(workOwnerRef.current, true);
    workOwnerRef.current = null;
    trailingRefreshRef.current = false;
    setBusy(false);
  }, [disposeOwner]);

  const runWork = useCallback((selectionValue: { repoId: string; planFile: string },
    workSemanticKey: string, owner: RelationshipOwner): void => {
    const selectionKey = JSON.stringify([selectionValue.repoId, selectionValue.planFile]);
    if (workOwnerRef.current) {
      if (workSelectionRef.current === selectionKey) trailingRefreshRef.current = true;
      disposeOwner(owner, false);
      return;
    }
    const generation = ++workGenerationRef.current;
    workOwnerRef.current = owner;
    workSelectionRef.current = selectionKey;
    setBusy(true);
    setFailure(null);
    const sourceTasks = tasksRef.current.filter((task) => task.repo === selectionValue.repoId);
    const sourceUncommitted = uncommittedRef.current.filter(
      (event) => event.repo_id === selectionValue.repoId,
    );
    void (async () => {
      try {
        const history: HistoryEntry[] = reposRef.current.some(
          (repo) => repo.id === selectionValue.repoId,
        )
          ? await api.history(selectionValue.repoId, 500, 0, owner.controller.signal)
          : [];
        const input = {
          planFile: selectionValue.planFile,
          tasks: sourceTasks,
          history,
          uncommitted: sourceUncommitted,
        };
        const prepared = buildBackbone(input);
        if (workGenerationRef.current !== generation || owner.controller.signal.aborted
            || semanticKeyRef.current !== workSemanticKey) return;
        setGraphRows(prepared.rows);
        const result = await renderBackbone(input, {
          origin: owner.action ? "foreground" : "background",
          key: workSemanticKey,
          generation,
          signal: owner.controller.signal,
          deadlineAt: owner.action?.deadlineAt,
        }, prepared);
        if (workGenerationRef.current !== generation || owner.controller.signal.aborted
            || semanticKeyRef.current !== workSemanticKey
            || selectedRef.current?.repoId !== selectionValue.repoId
            || selectedRef.current?.planFile !== selectionValue.planFile) return;
        setSvg(result.svg);
        setNote(result.meta.capped > 0
          ? `showing ${result.meta.shown} of ${result.meta.total} tasks — see the sidebar for the rest`
          : result.meta.total === 0 ? "no tasks in this plan" : "");
        setFailure(null);
        setSettledKey(workSemanticKey);
        if (owner.action) onStatus("Relationship map ready.");
      } catch (errorValue) {
        if (workGenerationRef.current !== generation
            || semanticKeyRef.current !== workSemanticKey
            || selectedRef.current?.repoId !== selectionValue.repoId
            || selectedRef.current?.planFile !== selectionValue.planFile) return;
        const timedOut = !!owner.action
          && (owner.action.didTimeout() || Date.now() >= owner.action.deadlineAt);
        if (isAbortError(errorValue) && !timedOut) return;
        const moduleFailure = errorValue instanceof MermaidModuleLoadError;
        if (moduleFailure) moduleUnavailableRef.current = true;
        const message = timedOut
          ? "Relationship map timed out after 10 seconds."
          : moduleFailure
            ? "Relationship-map module could not load."
            : `Relationship map failed: ${String(errorValue).slice(0, 120)}`;
        setFailure({ message, recovery: moduleFailure ? "reload" : "retry" });
        setSettledKey(workSemanticKey);
        if (owner.action) onStatus(`${message} ${moduleFailure ? "Reload the page." : "Retry is available."}`);
      } finally {
        disposeOwner(owner, false);
        if (workGenerationRef.current !== generation) return;
        workOwnerRef.current = null;
        setBusy(false);
        if (trailingRefreshRef.current && !moduleUnavailableRef.current
            && selectedRef.current && semanticKeyRef.current) {
          trailingRefreshRef.current = false;
          queueMicrotask(() => setRefreshNonce((value) => value + 1));
        }
      }
    })();
  }, [disposeOwner, onStatus]);

  useEffect(() => {
    if (selection && !selected) onSelectionChange(null);
  }, [onSelectionChange, selected, selection]);

  useEffect(() => {
    if (!selected || !semanticKey) {
      cancelWork();
      const pending = pendingActionRef.current;
      pendingActionRef.current = null;
      pending?.action.controller.abort();
      pending?.action.clear();
      setSvg("");
      setGraphRows([]);
      setNote("");
      setFailure(null);
      setSettledKey("");
      setExpanded(false);
      return;
    }
    const selectionKey = JSON.stringify([selected.repoId, selected.planFile]);
    if (workOwnerRef.current) {
      if (workSelectionRef.current === selectionKey) {
        trailingRefreshRef.current = true;
        return;
      }
      cancelWork();
    }
    const pending = pendingActionRef.current;
    pendingActionRef.current = null;
    if (moduleUnavailableRef.current) {
      pending?.action.clear();
      setFailure({
        message: "Relationship-map module could not load.",
        recovery: "reload",
      });
      setSettledKey(semanticKey);
      return;
    }
    const owner = pending?.selectionKey === selectionKey
      ? { controller: pending.action.controller, action: pending.action }
      : { controller: new AbortController() };
    if (pending && pending.selectionKey !== selectionKey) {
      pending.action.controller.abort();
      pending.action.clear();
    }
    runWork(selected, semanticKey, owner);
  }, [cancelWork, refreshNonce, runWork, selected, semanticKey]);

  useEffect(() => () => {
    cancelWork();
    const pending = pendingActionRef.current;
    pending?.action.controller.abort();
    pending?.action.clear();
  }, [cancelWork]);

  const choosePlan = (choiceId: string): void => {
    const plan = plans.find((candidate) =>
      JSON.stringify([candidate.repo, candidate.plan_file]) === choiceId);
    if (!plan) return;
    cancelWork();
    const previousPending = pendingActionRef.current;
    previousPending?.action.controller.abort();
    previousPending?.action.clear();
    const action = createActionDeadline();
    pendingActionRef.current = { selectionKey: choiceId, action };
    setSvg("");
    setGraphRows([]);
    setNote("");
    setFailure(null);
    setExpanded(false);
    onSelectionChange({ repoId: plan.repo, planFile: plan.plan_file });
  };

  const retry = (): void => {
    if (!selected || !semanticKey || workOwnerRef.current
        || busy || moduleUnavailableRef.current) return;
    const action = createActionDeadline();
    runWork(selected, semanticKey, { controller: action.controller, action });
  };

  const taskOnlyRows = useMemo(() => selected ? buildBackbone({
    planFile: selected.planFile,
    tasks: tasks.filter((task) => task.repo === selected.repoId),
    history: [],
    uncommitted: uncommitted.filter((event) => event.repo_id === selected.repoId),
  }).rows : [], [selected, tasks, uncommitted]);
  const accessibleRows = graphRows.length > 0 ? graphRows : taskOnlyRows;
  const linkedCommits = accessibleRows.reduce((sum, row) => sum + row.commits.length, 0);
  const pendingTasks = accessibleRows.filter((row) => row.uncommitted).length;

  return (
    <section aria-labelledby="overview-relationships-heading" className="space-y-4">
      <SectionHeading headingId="overview-relationships-heading" level={3}
        title="Relationships"
        description="Trace a plan from declared tasks to commits and uncommitted work."
        className="!mb-0"
        actions={(
          <>
            <BoundedChoiceDialog
              title="Choose a relationship plan"
              description="Build a task-to-commit relationship map for one plan."
              fieldLabel="Search plans"
              collectionLabel="Relationship plans"
              choices={planChoices}
              value={selectedValue}
              onChange={choosePlan}
              contextKey={JSON.stringify(["relationship-plan", scope === undefined ? "all" : ["repo", scope]])}
              placeholder="Choose a plan"
              triggerClassName="min-h-[28px] text-xs"
            />
            {busy && <span className="text-xs text-ui-muted">rendering…</span>}
          </>
        )} />
      <Surface data-reveal
        data-route-hydration-ready={!selected || settledKey === semanticKey ? "true" : "false"}>
      {note && <p className="mb-2 text-xs italic text-slate-400">{note}</p>}
      {failure && (
        <div data-route-hydration-failure tabIndex={-1}
          aria-label="Relationship map load failure"
          className="mb-3 flex flex-wrap items-center gap-2 rounded-control border border-amber-500/40 bg-amber-950/20 px-3 py-2 text-xs text-amber-200">
          <span>{failure.message}</span>
          <button type="button" className="ui-control" disabled={busy}
            onClick={failure.recovery === "reload" ? () => window.location.reload() : retry}>
            {failure.recovery === "reload" ? "Reload page" : "Retry map"}
          </button>
        </div>
      )}
      {selected && (
        <DisclosureTable
          label="Relationship map"
          summary={accessibleRows.length === 0
            ? "This plan has no tasks to relate."
            : `${accessibleRows.length} tasks; ${linkedCommits} commit link${linkedCommits === 1 ? "" : "s"}; `
              + `${pendingTasks} task${pendingTasks === 1 ? "" : "s"} with uncommitted activity.`}
          rows={accessibleRows}
          rowKey={(row) => JSON.stringify([row.taskRef, row.taskId])}
          identity={["relationship-alternative", selected.repoId, selected.planFile]}
          columns={[
            { key: "task", label: "Task", render: (row) => row.taskId,
              sortValue: (row) => row.taskId },
            { key: "title", label: "Title", render: (row) => row.title,
              sortValue: (row) => row.title },
            { key: "files", label: "Declared files", render: (row) =>
              row.files.length > 0 ? row.files.join(", ") : "—" },
            { key: "commits", label: "Commits", render: (row) =>
              row.commits.length > 0 ? row.commits.map((hash) => hash.slice(0, 10)).join(", ") : "—" },
            { key: "pending", label: "Uncommitted", render: (row) => row.uncommitted ? "yes" : "no",
              sortValue: (row) => row.uncommitted ? 1 : 0 },
          ]}
          className="mb-2"
        />
      )}
      {svg ? (
        <>
          <GraphShell svg={svg} onExpand={() => setExpanded(true)} />
          {/* D7: one-line shape legend (user-approved 2026-07-17) */}
          <p className="mt-1 text-[11px] text-slate-400">
            ▭ task · ⬭ commit · ⬡ uncommitted (dashed edge = not committed yet)
          </p>
        </>
      ) : !busy && selected && !note && !failure && (
        <p className="text-sm text-slate-400">No committed history for this plan yet.</p>
      )}
      {!selected && <p className="text-sm text-slate-400">Pick a plan to see its task → commit map.</p>}
      {expanded && svg && (
        <DialogShell
          title="Relationship map — expanded"
          description="Interactive task-to-commit relationship graph"
          onClose={() => setExpanded(false)}
          closeLabel="Close expanded relationship map"
          backdropClose
          panelClassName="h-full max-w-[1600px]"
          bodyClassName="min-h-0 flex-1 p-0"
        >
          <GraphShell svg={svg} tall />
        </DialogShell>
      )}
      </Surface>
    </section>
  );
}

// D7 (v0.1.4.0): the diagram shell — overflow-hidden viewport + canvas that
// hosts the SVG. Zoom = explicit px size on the SVG (clamp 0.08-6.5, step
// 14%); pan = canvas translate; ctrl|cmd+wheel zooms around the cursor;
// drag pans; keyboard +/-/0; the initial smart-FIT is the containment
// (D2 — NO CSS max-width clamp on the zoom-controlled SVG). Closure-based:
// all wiring lives in the effect and re-attaches on every new SVG, so the
// controls survive re-renders (V9). SVG injection via DOMParser + adoptNode
// instead of raw innerHTML (v-e 0.8.1 parsing fix).
function GraphShell ({ svg, tall, onExpand }:
  { svg: string; tall?: boolean; onExpand?: () => void }) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const ctl = useRef<{ zoomIn: () => void; zoomOut: () => void; fit: () => void } | null>(null);

  useEffect(() => {
    const viewport = viewportRef.current, canvas = canvasRef.current;
    if (!viewport || !canvas || !svg) return;
    const doc = new DOMParser().parseFromString(svg, "text/html");
    const parsedSvg = doc.body.querySelector("svg");
    if (!parsedSvg) return;
    canvas.replaceChildren(document.adoptNode(parsedSvg));
    const node = canvas.querySelector("svg") as SVGSVGElement | null;
    if (!node) return;
    node.removeAttribute("style"); // mermaid inlines max-width — the D2-forbidden clamp
    const vb = node.viewBox?.baseVal;
    let natW = (vb && vb.width) || Number(node.getAttribute("width")) || 0;
    let natH = (vb && vb.height) || Number(node.getAttribute("height")) || 0;
    if (!natW || !natH) {
      try { const b = node.getBBox(); natW = b.width || 600; natH = b.height || 400; }
      catch { natW = 600; natH = 400; }
    }

    const MIN = 0.08, MAX = 6.5, STEP = 0.14;
    let zoom = 1, panX = 0, panY = 0;
    const apply = () => {
      node.style.width = `${natW * zoom}px`;
      node.style.height = `${natH * zoom}px`;
      canvas.style.transform = `translate(${panX}px, ${panY}px)`;
    };
    const fit = () => {
      const r = viewport.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      const s = Math.min((r.width - 24) / natW, (r.height - 24) / natH);
      zoom = Math.min(1.5, Math.max(MIN, s)); // readability: never inflate tiny graphs
      panX = Math.max(12, (r.width - natW * zoom) / 2);
      panY = Math.max(12, (r.height - natH * zoom) / 2);
      apply();
    };
    const zoomAround = (factor: number, cx: number, cy: number) => {
      const next = Math.min(MAX, Math.max(MIN, zoom * factor));
      const k = next / zoom;
      panX = cx - (cx - panX) * k;
      panY = cy - (cy - panY) * k;
      zoom = next;
      apply();
    };
    const center = (): [number, number] => {
      const r = viewport.getBoundingClientRect();
      return [r.width / 2, r.height / 2];
    };
    ctl.current = {
      zoomIn: () => zoomAround(1 + STEP, ...center()),
      zoomOut: () => zoomAround(1 / (1 + STEP), ...center()),
      fit,
    };

    let pendingDrag = false, dragging = false, suppressClick = false;
    let pointerId = -1, sx = 0, sy = 0, spx = 0, spy = 0;
    const down = (e: PointerEvent) => {
      if (e.button !== 0) return; // T3: primary button only — a right-click
      // drag could get stuck when the context menu swallows pointerup
      pendingDrag = true;
      dragging = false;
      pointerId = e.pointerId;
      sx = e.clientX; sy = e.clientY; spx = panX; spy = panY;
    };
    const move = (e: PointerEvent) => {
      if (!pendingDrag || e.pointerId !== pointerId) return;
      if (!dragging && Math.hypot(e.clientX - sx, e.clientY - sy) < 5) return;
      if (!dragging) {
        dragging = true;
        suppressClick = true;
        viewport.setPointerCapture(e.pointerId);
        viewport.style.cursor = "grabbing";
      }
      panX = spx + (e.clientX - sx);
      panY = spy + (e.clientY - sy);
      apply();
    };
    const up = (e: PointerEvent) => {
      if (dragging && viewport.hasPointerCapture(e.pointerId)) {
        viewport.releasePointerCapture(e.pointerId);
      }
      pendingDrag = false;
      dragging = false;
      pointerId = -1;
      viewport.style.cursor = "";
      if (e.type === "pointercancel") suppressClick = false;
    };
    const click = (event: MouseEvent) => {
      if (!suppressClick) return;
      suppressClick = false;
      event.preventDefault();
      event.stopPropagation();
    };
    const wheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return; // plain scroll keeps scrolling the page
      e.preventDefault();
      const r = viewport.getBoundingClientRect();
      zoomAround(e.deltaY < 0 ? 1 + STEP : 1 / (1 + STEP), e.clientX - r.left, e.clientY - r.top);
    };
    viewport.addEventListener("pointerdown", down);
    viewport.addEventListener("pointermove", move);
    viewport.addEventListener("pointerup", up);
    viewport.addEventListener("pointercancel", up);
    viewport.addEventListener("click", click, true);
    viewport.addEventListener("wheel", wheel, { passive: false });
    const ro = new ResizeObserver(() => fit());
    ro.observe(viewport); // fires once on observe -> the initial smart-fit
    return () => {
      ro.disconnect();
      viewport.removeEventListener("pointerdown", down);
      viewport.removeEventListener("pointermove", move);
      viewport.removeEventListener("pointerup", up);
      viewport.removeEventListener("pointercancel", up);
      viewport.removeEventListener("click", click, true);
      viewport.removeEventListener("wheel", wheel);
      ctl.current = null;
    };
  }, [svg]);

  return (
    <div className={`relative ${tall ? "h-full" : ""}`}>
      <div className="absolute right-2 top-2 z-10 flex gap-1">
        <ShellBtn label="+" title="zoom in (+)" onClick={() => ctl.current?.zoomIn()} />
        <ShellBtn label="−" title="zoom out (-)" onClick={() => ctl.current?.zoomOut()} />
        <ShellBtn label="⤢" title="fit (0)" onClick={() => ctl.current?.fit()} />
        {onExpand && <ShellBtn label="⛶" title="expand" onClick={onExpand} />}
      </div>
      <div ref={viewportRef} tabIndex={0} role="img" aria-label="plan relationship graph"
        onKeyDown={(e) => {
          if (e.key === "+" || e.key === "=") { e.preventDefault(); ctl.current?.zoomIn(); }
          else if (e.key === "-") { e.preventDefault(); ctl.current?.zoomOut(); }
          else if (e.key === "0") { e.preventDefault(); ctl.current?.fit(); }
        }}
        className={`cursor-grab overflow-hidden rounded border border-slate-700 bg-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
          tall ? "h-full" : "h-96"}`}>
        <div ref={canvasRef} className="w-max will-change-transform" />
      </div>
    </div>
  );
}

function ShellBtn ({ label, title, onClick }:
  { label: string; title: string; onClick: () => void }) {
  return (
    <button type="button" aria-label={title} title={title} onClick={onClick}
      className="min-h-[24px] min-w-[24px] rounded bg-slate-800/90 px-1.5 text-xs text-slate-200 hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">
      {label}
    </button>
  );
}
