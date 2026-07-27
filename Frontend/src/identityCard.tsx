// v0.1.10.0 D1 (B.1): repo identity card — a pure-SVG stroke-dasharray
// donut of the top-8 extensions (no Chart.js: static identity, not a live
// chart) + a facts line. Colors are a module-private categorical palette
// assigned by RANK (decorative categories, never MODE_COLOR — the
// DIAGRAM-vs-mode separation precedent); the "other" remainder is always
// slate. Empty state (RV4): ext_total === 0 swaps the DONUT AREA only —
// the facts line stays (real data even when every capture is an excluded
// plan edit).

import { StatsData } from "./charts";
import { fmtMinutes, fmtTs } from "./format";

// teal / sky / indigo / amber / purple / rose / emerald / slate — by rank.
const PALETTE = ["#14b8a6", "#0284c7", "#4f46e5", "#f59e0b",
  "#a855f7", "#f43f5e", "#059669", "#64748b"];
const OTHER = "#334155"; // slate-700 — the remainder slice, always

const R = 42, C = 2 * Math.PI * R; // donut radius / circumference
const fmt = (n: number) => n.toLocaleString("en-US");

export function IdentityCard ({ identity, calendar, scope }: {
  identity: StatsData["identity"];
  calendar: StatsData["activity_calendar"];
  scope: string | undefined; // undefined = ALL (stats arrive server-scoped)
}) {
  const { extensions, ext_total } = identity;
  const other = ext_total - extensions.reduce((a, e) => a + e.count, 0);
  const slices = [
    ...extensions.map((e, i) => ({ label: e.ext || "(no ext)", count: e.count,
      color: PALETTE[i] })),
    ...(other > 0 ? [{ label: "other", count: other, color: OTHER }] : []),
  ];
  let acc = 0; // running offset for the dasharray segments
  const effort = calendar.reduce((a, d) => a + d.minutes, 0);
  return (
    <div>
      <div className="mb-2 text-xs font-semibold text-slate-300">
        Repo identity — {scope ?? "ALL repos"}
      </div>
      {ext_total === 0 ? (
        <p className="py-6 text-sm text-slate-400">No captures classified yet.</p>
      ) : (
        <div className="flex items-center gap-4">
          <svg width={110} height={110} viewBox="0 0 110 110" role="img"
            aria-label="file type breakdown">
            {slices.map((s) => {
              const len = (s.count / ext_total) * C;
              const seg = (
                <circle key={s.label} cx={55} cy={55} r={R} fill="none"
                  stroke={s.color} strokeWidth={16}
                  strokeDasharray={`${len} ${C - len}`}
                  strokeDashoffset={-acc}
                  transform="rotate(-90 55 55)" />
              );
              acc += len;
              return seg;
            })}
          </svg>
          <div className="min-w-0 space-y-0.5 text-[11px] text-slate-300">
            {slices.map((s) => (
              <div key={s.label} className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 shrink-0 rounded-sm"
                  style={{ backgroundColor: s.color }} />
                <span className="truncate font-mono">{s.label}</span>
                <span className="text-slate-400">
                  · {fmt(s.count)} ({Math.round((s.count / ext_total) * 100)}%)
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="mt-2 text-[11px] text-slate-400">
        {fmt(identity.sessions)} session{identity.sessions === 1 ? "" : "s"}
        {identity.first_event_ts &&
          ` · first capture ${fmtTs(identity.first_event_ts).slice(0, 10)}`}
        {" · "}{fmt(identity.commits)} commit{identity.commits === 1 ? "" : "s"} (all-time)
        {effort > 0 && ` · ${fmtMinutes(effort)} effort (365d, UTC)`}
      </p>
    </div>
  );
}
