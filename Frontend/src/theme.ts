// v0.1.3.0 D6: single source of truth for mode colors + theming helpers.
// MODE_COLOR is HEX (charts need real hex; R26) — the badge swatches AND the
// Chart.js doughnut both read it, so a mode looks identical everywhere.

import { flushSync } from "react-dom";
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

// v0.1.6.0 D3 (C.3, RV4 mirror contract): MUST match Backend/app/db.py
// EFFORT_GAP_MAX_S / EFFORT_TAIL_S (there in seconds, here in minutes) —
// used ONLY for timeline gap markers + the presentation-only header sum;
// the effort ALGORITHM home stays in db.py.
export const EFFORT_GAP_MAX_MIN = 15;
export const EFFORT_TAIL_MIN = 2;

// v0.2.10.0 D2 (A.1, R-BN): the flow chip's law — the LIVE face of the
// effort chain (EFFORT_GAP_MAX_MIN above mirrors db.py; the ALGORITHM
// home stays there — this is a presentation-only derivation). Consumed
// by flowChip.tsx at render; App.tsx's WS handler feeds the chain refs
// and the P8 60s tick supplies minute growth + expiry. PURE for the
// battery. count >= 2: one capture is not a flow (the chip's on-
// boundary); Math.max(1, …): never "0m" (the wxTip precedent — and it
// gracefully clamps a clock-set-back negative too).
export function flowState (count: number, startMs: number, lastMs: number,
  nowMs: number): { on: boolean; minutes: number } {
  const on = count >= 2 && nowMs - lastMs <= EFFORT_GAP_MAX_MIN * 60_000;
  return { on, minutes: on ? Math.max(1, Math.floor((nowMs - startMs) / 60_000)) : 0 };
}

// v0.2.10.0 D6 (A.1, R-BO): odometer milestones — event IDS EVER (the
// ONE global AUTOINCREMENT odometer, schema.sql events.id — ids are
// never reused, even after deletes). DISTINCT from App-local
// COMBO_MILESTONES (chain COUNTS that reset per gap): same suffix,
// different semantics — never conflate the two Sets. Checked at App's
// event_resolved id-read site; exported for the battery.
export const ODOMETER_MILESTONES: ReadonlySet<number> = new Set(
  [5_000, 10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000]);

// v0.1.6.0 D4: the bell's uncommitted-age nudge threshold (hours).
// v0.1.13.0 B.2: LIFTED here from App.tsx — ONE source for the bell
// nudge AND the pet's "anxious" mood (never a mirrored copy).
export const UNCOMMITTED_AGE_H = 48;

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

// v0.1.7.0 D7 (C.4): View Transitions on view/tab switches — the documented
// React-18 pattern: flushSync makes React commit synchronously inside the
// browser's snapshot callback; the default crossfade is used (zero custom
// CSS this release). No-op fallback on browsers without the API and under
// reduced motion (progressive enhancement). Nav call sites ONLY — filters
// and palette actions stay instant (deliberate: a crossfade on every filter
// click would be noise).
export function withViewTransition (update: () => void): void {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  if (doc.startViewTransition && !prefersReducedMotion()) {
    doc.startViewTransition(() => flushSync(update));
  } else {
    update();
  }
}

// v0.2.7.0 D6 (C.1, R-BG): MUST match Scripts/Chronicle/scribe.py
// RELEASE_RX (the v0.2.5.0 D10 message-END law) — a 4-part version at
// the END of a commit subject IS a release marker, both ends one law.
export const RELEASE_RX = /v\d+\.\d+\.\d+\.\d+\s*$/;

// v0.2.7.0 D7 (C.1, RV8): the RELEASE-LINE LAW's helper lives beside
// the law — in this workspace EVERY commit is version-ENDed (RV5,
// live-proven 10/10 on EA+UM history), and a 4th-part bump merely
// fast-forwards the release/vX.Y.Z branch: only a 3-PART-PREFIX change
// is a new release, so the moment fires on prefix3 change alone.
export function prefix3 (version: string): string {
  return version.trim().split(".").slice(0, 3).join(".");
}
