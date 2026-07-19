// Display-side time formatting (v0.1.2.0 D6) - the API stays ISO-8601
// UTC-Z (UM message standard); only the rendering is localized.

const pad = (n: number): string => String(n).padStart(2, "0");

export function fmtTs (iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function fmtRel (iso: string): string {
  const then = new Date(iso).getTime();
  if (isNaN(then)) return iso;
  const s = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return fmtTs(iso);
}

// v0.1.6.0 D1 (C.1): the ONE effort humanizer — every effort surface
// (sidebar, group headers, KPI, calendar tooltip, timeline, digest) renders
// through this; the "≈" lives HERE on the value, never in labels (RV19).
export function fmtMinutes (minutes: number): string {
  if (minutes < 60) return `≈ ${minutes}m`;
  return `≈ ${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

// v0.1.6.0 D4 (C.4): nudge-row ages — fmtRel switches to an absolute
// timestamp past 24h and can never say "≈ 2d" (RV16); hours under 48h,
// whole days after. Negative deltas are gated out by the nudge conditions.
export function fmtAge (iso: string): string {
  const h = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000));
  return h < 48 ? `≈ ${h}h` : `≈ ${Math.floor(h / 24)}d`;
}
