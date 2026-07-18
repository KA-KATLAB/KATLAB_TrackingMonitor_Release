// v0.1.3.0 D2: Chart.js dashboard helpers. `chart.js/auto` auto-registers all
// controllers/elements/scales (R9 — a bare `chart.js` import throws
// "'doughnut' is not a registered controller"). Every chart is created via
// makeChart and MUST be .destroy()'d on cleanup/re-create (R2: a Chart owns
// its canvas; StrictMode + per-sync re-render would else throw "Canvas
// already in use"). Colors come from theme.ts MODE_COLOR (R4/R26).

import { Chart } from "chart.js/auto";
import { MODE_COLOR, prefersReducedMotion } from "./theme";
import { TrackedEvent } from "./api";

// A.1/D3: Chart.js draws text on CANVAS — page CSS never reaches it, so the
// pairing must land on the defaults (per-chart font objects only set size).
Chart.defaults.font.family = '"Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif';

export interface StatsData {
  mode_counts: Record<TrackedEvent["mode"], number>;
  events_per_task: { repo: string; task_ref: string; count: number }[];
  activity_daily: { day: string; count: number }[];
}

const GRID = "#334155"; // slate-700
const TEXT = "#94a3b8"; // slate-400
const noAnim = () => (prefersReducedMotion() ? (false as const) : undefined);

const MODES: TrackedEvent["mode"][] = ["B", "A_SCOPED", "A_GLOBAL", "AMBIGUOUS", "UNKNOWN", "MANUAL"];
const MODE_LABEL: Record<TrackedEvent["mode"], string> = {
  B: "Declared", A_SCOPED: "Active", A_GLOBAL: "Active *",
  AMBIGUOUS: "Pick: multi", UNKNOWN: "Pick: none", MANUAL: "Your pick",
};

export function modeDoughnut (canvas: HTMLCanvasElement, s: StatsData): Chart {
  return new Chart(canvas, {
    type: "doughnut",
    data: {
      labels: MODES.map((m) => MODE_LABEL[m]),
      datasets: [{
        data: MODES.map((m) => s.mode_counts[m] ?? 0),
        backgroundColor: MODES.map((m) => MODE_COLOR[m]), // R26: same hex as the badges
        borderColor: "#0f172a", borderWidth: 2,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: noAnim(), // R18
      plugins: { legend: { position: "right", labels: { color: TEXT, font: { size: 11 } } } },
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
