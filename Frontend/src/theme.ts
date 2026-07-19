// v0.1.3.0 D6: single source of truth for mode colors + theming helpers.
// MODE_COLOR is HEX (charts need real hex; R26) — the badge swatches AND the
// Chart.js doughnut both read it, so a mode looks identical everywhere.

import { TrackedEvent } from "./api";

export const MODE_COLOR: Record<TrackedEvent["mode"], string> = {
  B: "#059669", // emerald-600
  A_SCOPED: "#0284c7", // sky-600
  A_GLOBAL: "#4f46e5", // indigo-600
  AMBIGUOUS: "#f59e0b", // amber-500
  UNKNOWN: "#e11d48", // rose-600
  MANUAL: "#9333ea", // purple-600
};

export const SWEPT_COLOR = "#71717a"; // zinc-500

// v0.1.5.0 D1 (C.1): identity color for session dots - deterministic hash
// -> HSL hue, saturation/lightness fixed for the dark palette. An IDENTITY
// cue, not a mode (modes stay in MODE_COLOR); same session = same color
// everywhere (dots + digest).
export function sessionColor (id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return `hsl(${hash % 360}, 65%, 60%)`;
}

// v0.1.5.0 C.1 (RV19): human badge labels, LIFTED from App.tsx - the single
// label source for App AND digest.ts (importing App.tsx from digest would
// create an App<->digest module cycle). charts.ts keeps its own abbreviated
// MODE_LABEL variants (chart legends are width-constrained).
export const MODE_BADGE: Record<TrackedEvent["mode"], { label: string; tip: string }> = {
  B: { label: "Declared", tip: "B — the file is declared by exactly this task's <files>" },
  A_SCOPED: { label: "Active task", tip: "A_SCOPED — shared file; attributed to the one in-progress match" },
  A_GLOBAL: { label: "Active task *", tip: "A_GLOBAL — undeclared file; attributed to the repo's single in-progress task" },
  AMBIGUOUS: { label: "Pick: multi", tip: "AMBIGUOUS — several tasks declare this file, none is the single active one; pick manually" },
  UNKNOWN: { label: "Pick: none", tip: "UNKNOWN — no task declares this file and there is no single in-progress task; pick manually" },
  MANUAL: { label: "Your pick", tip: "MANUAL — assigned by you; final, never re-resolved" },
};

// Neutral teal/slate palette for the Mermaid graph (decorative nodes are NOT
// modes — kept separate from MODE_COLOR per D6).
export const DIAGRAM = {
  bg: "#0f172a", // slate-900
  surface: "#134e4a", // teal-900
  border: "#334155", // slate-700
  text: "#e2e8f0", // slate-200
  textDim: "#94a3b8", // slate-400
  accent: "#14b8a6", // teal-500
};

export function prefersReducedMotion (): boolean {
  return typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
