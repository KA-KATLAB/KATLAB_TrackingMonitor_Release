// v0.1.3.0 D2: Chart.js dashboard helpers. `chart.js/auto` auto-registers all
// controllers/elements/scales. Every chart is created via
// makeChart and MUST be .destroy()'d on cleanup/re-create (R2: a Chart owns
// its canvas; StrictMode + per-sync re-render would else throw "Canvas
// already in use"). Colors come from theme.ts MODE_COLOR (R4/R26).

import { Chart } from "chart.js/auto";
import { MODE_CHART_LABEL, MODE_COLOR, MODE_ORDER, prefersReducedMotion } from "./theme";
import type { TrackedEvent } from "./api";

// A.1/D3: Chart.js draws text on CANVAS — page CSS never reaches it, so the
// pairing must land on the defaults (per-chart font objects only set size).
Chart.defaults.font.family = '"Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif';

export interface StatsData {
  mode_counts: Record<TrackedEvent["mode"], number>;
  events_per_task: { repo: string; task_ref: string; count: number }[];
  activity_daily: { day: string; count: number }[];
  // v0.1.5.0 D2 (RV2: the type lives HERE, api.ts only re-imports it):
  // 365 zero-filled UTC days, oldest->newest, fixed shape in BOTH backend
  // return paths (RV28). v0.1.6.0 D1: minutes = per-UTC-day effort estimate.
  activity_calendar: { day: string; events: number; commits: number; minutes: number }[];
  // v0.1.6.0 D1 (B.1): top-10 effort estimates, fixed shape in both paths.
  effort_per_task: { repo: string; task_ref: string; minutes: number; sessions: number }[];
  // v0.1.7.0 D3 (A.1): 7x24 counts, Sunday-first rows, SERVER-LOCAL hours.
  punch_card: number[][];
  // v0.1.7.0 D1 (A.1): top-10 task-level coupling pairs, file_a < file_b.
  file_coupling: { repo: string; file_a: string; file_b: string; shared: number }[];
  // v0.1.8.0 D3 (A.2): the last-7-UTC-days story — nullable sub-objects,
  // fixed shape in BOTH backend return paths (the v0.1.5.0 RV28 rule).
  wrapped: {
    days: { day: string; events: number; minutes: number }[];
    top_task: { repo: string; task_ref: string; minutes: number; sessions: number } | null;
    busiest_hour: { dow: number; hour: number; events: number } | null;
    files_touched: number;
    commits: number;
    top_pair: { repo: string; file_a: string; file_b: string; shared: number } | null;
  };
  // v0.1.10.0 D1 (A.1): repo identity — fixed shape both paths; the A1
  // double exclusion strips plan files from the extension mix.
  identity: {
    extensions: { ext: string; count: number }[]; // top 8, (-count, ext)
    ext_total: number;
    sessions: number;
    first_event_ts: string | null;
    commits: number; // ALL-TIME (not the 365d calendar window)
  };
  // v0.1.10.0 D2 (A.1): top-20 file churn (plan files excluded, A1).
  file_churn: { repo: string; file: string; events: number; last_ts: string }[];
  // v0.2.11.0 D1 (A.1): AI-touch provenance — commits are gated by each
  // repo's FIRST capture (D2) and a slot counts as AI-touched only where
  // the commit's file list intersects that commit's own linked events
  // (D3); plan files excluded (A1). Fixed shape in BOTH backend return
  // paths (the v0.1.5.0 RV28 rule).
  provenance: {
    commits_observed: number;   // commits inside the observation gate
    commits_pre: number;        // honesty counter — commits before it
    slots_total: number;        // file-slots over observed commits
    slots_ai: number;           // slots whose file has a linked event
    top_files: { repo: string; file: string; commits: number; ai_commits: number }[];
  };
}

const GRID = "#334155"; // slate-700
const TEXT = "#94a3b8"; // slate-400
const noAnim = () => (prefersReducedMotion() ? (false as const) : undefined);

export function modeDistributionBar (canvas: HTMLCanvasElement, s: StatsData): Chart {
  return new Chart(canvas, {
    type: "bar",
    data: {
      labels: MODE_ORDER.map((mode) => MODE_CHART_LABEL[mode]),
      datasets: [{
        data: MODE_ORDER.map((mode) => s.mode_counts[mode] ?? 0),
        backgroundColor: MODE_ORDER.map((mode) => MODE_COLOR[mode]),
      }],
    },
    options: {
      indexAxis: "y",
      responsive: true, maintainAspectRatio: false, animation: noAnim(), // R18
      plugins: { legend: { display: false } },
      scales: {
        x: { beginAtZero: true, ticks: { color: TEXT, precision: 0 }, grid: { color: GRID } },
        y: { ticks: { color: TEXT, font: { size: 10 } }, grid: { display: false } },
      },
    },
  });
}

export function eventsPerTaskBar (canvas: HTMLCanvasElement, s: StatsData, allScope: boolean): Chart {
  const rows = s.events_per_task;
  return new Chart(canvas, {
    type: "bar",
    data: {
      labels: rows.map((r) => (allScope ? `${r.repo} · ` : "") + r.task_ref.split(" - ").pop()),
      datasets: [{ data: rows.map((r) => r.count), backgroundColor: "#0284c7" }],
    },
    options: {
      indexAxis: "y", responsive: true, maintainAspectRatio: false, animation: noAnim(),
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: TEXT, precision: 0 }, grid: { color: GRID } },
        y: { ticks: { color: TEXT, font: { size: 10 } }, grid: { display: false } },
      },
    },
  });
}

export function activityLine (canvas: HTMLCanvasElement, s: StatsData): Chart {
  return new Chart(canvas, {
    type: "line",
    data: {
      labels: s.activity_daily.map((d) => d.day.slice(5)), // MM-DD
      datasets: [{
        data: s.activity_daily.map((d) => d.count),
        borderColor: "#14b8a6", backgroundColor: "#14b8a633",
        fill: true, tension: 0.3, pointRadius: 2,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: noAnim(),
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: TEXT, font: { size: 10 } }, grid: { color: GRID } },
        y: { ticks: { color: TEXT, precision: 0 }, grid: { color: GRID }, beginAtZero: true },
      },
    },
  });
}
