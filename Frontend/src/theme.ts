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
