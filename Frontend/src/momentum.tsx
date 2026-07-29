// v0.1.12.0 D1 (B.1): momentum strip — "am I speeding up?". Both windows
// are client-side projections of the SERVED activity_calendar (365
// zero-filled UTC days): this week = the LAST 7 entries (today inclusive,
// the wrapped precedent), last week = [-14:-7] — no overlap, no gap.
// DELTA RULE (honest, no infinities): prev>0 -> rounded pct; prev==0 &&
// cur>0 -> "new ▲" (a percentage against zero is a lie); both 0 -> "—".
// ▼ renders SLATE, not red — a light week is not a failure (deliberate
// divergence from the green/red staple). Tile accents reuse the
// goal-rings metric palette (events teal / minutes sky / commits amber).

import { StatsData } from "./charts";
import { fmtMinutes } from "./format";

type CalDay = StatsData["activity_calendar"][number];
type Metric = "events" | "minutes" | "commits";

const fmt = (n: number) => n.toLocaleString("en-US");

// Metric order + accents mirror goalRings' RING_COLOR mapping.
const TILES: { key: Metric; label: string; accent: string }[] = [
  { key: "events", label: "captures", accent: "#14b8a6" },
  { key: "minutes", label: "effort", accent: "#0284c7" },
  { key: "commits", label: "commits", accent: "#f59e0b" },
];

function windowSums (calendar: CalDay[], key: Metric): { cur: number; prev: number } {
  const cur = calendar.slice(-7).reduce((s, d) => s + d[key], 0);
  const prev = calendar.slice(-14, -7).reduce((s, d) => s + d[key], 0);
  return { cur, prev };
}

// The delta chip: text + tone under the D1 rule. Only a real ▲ (or "new")
// carries the teal accent; ▼ / "=" / "—" stay slate (non-judgmental).
function delta (cur: number, prev: number): { text: string; up: boolean } {
  if (prev === 0) return cur > 0 ? { text: "new ▲", up: true } : { text: "—", up: false };
  const pct = Math.round(((cur - prev) / prev) * 100);
  if (pct > 0) return { text: `▲ ${pct}%`, up: true };
  if (pct < 0) return { text: `▼ ${-pct}%`, up: false };
  return { text: "= 0%", up: false };
}

// Module-private 14-day sparkline (the v0.1.3.0 status-bar polyline recipe,
// not its component): prior week dimmed, current week bright in the tile
// accent; max-normalized over ALL 14 days; max 0 -> a flat baseline. The
// two segments share point 6 so the line never gaps.
function Spark ({ values, accent }: { values: number[]; accent: string }) {
  const max = Math.max(...values);
  const pt = (v: number, i: number) =>
    `${(i * (100 / 13)).toFixed(1)},${(max === 0 ? 26 : 26 - (v / max) * 24).toFixed(1)}`;
  const prior = values.slice(0, 7).map(pt).join(" ");
  const current = values.slice(6).map((v, i) => pt(v, i + 6)).join(" ");
  return (
    <svg viewBox="0 0 100 28" className="h-7 w-full max-w-[130px]" aria-hidden="true">
      <polyline points={prior} fill="none" stroke={accent} strokeWidth="1.5"
        opacity="0.35" strokeLinejoin="round" strokeLinecap="round" />
      <polyline points={current} fill="none" stroke={accent} strokeWidth="1.5"
        strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function MomentumStrip ({ calendar, scope }:
  { calendar: CalDay[]; scope: string | undefined }) {
  return (
    <div data-reveal className="mb-4 rounded border border-slate-700 bg-slate-900 p-3">
      <div className="mb-2 text-xs font-semibold text-slate-300">
        Momentum — this week vs last (UTC) — {scope ?? "ALL repos"}
      </div>
      <div className="overflow-x-auto">
        <div className="grid min-w-[420px] gap-3 sm:grid-cols-3">
          {TILES.map(({ key, label, accent }) => {
            const { cur, prev } = windowSums(calendar, key);
            const d = delta(cur, prev);
            const shown = (n: number) => (key === "minutes" ? fmtMinutes(n) : fmt(n));
            return (
              <div key={key} className="flex items-center gap-3 rounded bg-slate-800/60 px-3 py-2"
                title={`this week ${shown(cur)} · last week ${shown(prev)}`}>
                <div className="min-w-0">
                  <div className="text-[11px] text-slate-400">{label}</div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-lg font-bold text-slate-100">{shown(cur)}</span>
                    <span className={`text-[11px] font-semibold ${
                      d.up ? "text-teal-300" : "text-slate-400"}`}>
                      {d.text}
                    </span>
                  </div>
                </div>
                <div className="ml-auto w-full max-w-[130px]">
                  <Spark accent={accent}
                    values={calendar.slice(-14).map((day) => day[key])} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
