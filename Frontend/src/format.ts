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
