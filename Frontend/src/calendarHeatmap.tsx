// v0.1.5.0 D2 (C.2): GitHub-style yearly activity calendar — pure SVG, zero
// deps (the D3-sparkline precedent). Sunday-first rows (user 2026-07-19);
// 4-step teal ramp bucketed by quartiles of the max day; days with commits
// get a corner dot; native <title> tooltips carry the (UTC) marker — day
// buckets are UTC (UF4's local rule applies to timestamps, not day buckets).

import type { StatsData } from "./charts";
import { fmtMinutes } from "./format";

type CalDay = StatsData["activity_calendar"][number];

const CELL = 10, GAP = 2, STEP = CELL + GAP;
const LEFT = 30, TOP = 16; // weekday / month label gutters
// slate-800 zero + 4 teal steps ending at the theme accent (#14b8a6).
// v0.1.7.0 B.1 (RV7): EXPORTED — the punch card shares this exact ramp
// (single source; a duplicated array would silently diverge).
export const RAMP = ["#1e293b", "#134e4a", "#0f766e", "#0d9488", "#14b8a6"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS: [number, string][] = [[1, "Mon"], [3, "Wed"], [5, "Fri"]];

// v0.1.9.0 B.1: the quartile bucket, EXPORTED beside RAMP — the skyline
// shares ramp AND bucketing (single source, the RV7-v0.1.7.0 class; the
// punch card keeps its own max basis deliberately).
export function rampBucket (n: number, max: number): number {
  return n === 0 || max === 0 ? 0 : Math.min(4, Math.ceil((n / max) * 4));
}

// v0.1.9.0 B.1 (RV8): the legend strip, LIFTED out of CalendarHeatmap — the
// card renders it ONCE below whichever view (flat | city) is active.
export function RampLegend () {
  return (
    <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-400">
      <span>less</span>
      {RAMP.map((color) => (
        <span key={color} className="inline-block h-2.5 w-2.5 rounded-sm"
          style={{ backgroundColor: color }} />
      ))}
      <span>more</span>
      <span className="ml-3 flex items-center gap-1">
        <span className="inline-block h-1 w-1 rounded-full bg-slate-200" /> = commit
      </span>
    </div>
  );
}

// v0.1.7.0 D4 (C.1): current activity streak — consecutive events>0 days
// ending at the LAST calendar day; when UTC-today is still 0 the streak may
// end at YESTERDAY instead (GitHub semantics — today isn't over yet).
export function streakOf (calendar: CalDay[]): number {
  if (calendar.length === 0) return 0;
  let end = calendar.length - 1;
  if (calendar[end].events === 0) end -= 1; // today-zero grace
  let n = 0;
  for (let i = end; i >= 0 && calendar[i].events > 0; i--) n += 1;
  return n;
}

export function CalendarHeatmap ({ calendar }: { calendar: CalDay[] }) {
  if (calendar.length === 0) return null;
  // Sunday-first alignment: pad leading cells so column 0 starts on the
  // Sunday of the oldest day's week (the server shape stays fixed — D2).
  const first = new Date(`${calendar[0].day}T00:00:00Z`);
  const lead = isNaN(first.getTime()) ? 0 : first.getUTCDay(); // 0 = Sunday
  const cells: (CalDay | null)[] = [...Array<null>(lead).fill(null), ...calendar];
  const weeks: (CalDay | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const max = Math.max(0, ...calendar.map((d) => d.events));

  // Month labels only at the week containing a month's 1st (GitHub rule —
  // labels land >= 4 weeks apart, never colliding).
  const months: { x: number; label: string }[] = [];
  weeks.forEach((week, wi) => {
    const firstOfMonth = week.find((c) => c !== null && c.day.slice(8) === "01");
    if (firstOfMonth) {
      months.push({
        x: LEFT + wi * STEP,
        label: MONTHS[Number(firstOfMonth.day.slice(5, 7)) - 1],
      });
    }
  });

  // v0.1.5.0 CFT-3: right pad — a month label at the LAST week column (today
  // within the current month's first week) needs ~18px but the column leaves
  // 12px; svg clips by default, so the trailing label would truncate.
  const width = LEFT + weeks.length * STEP + 14;
  const height = TOP + 7 * STEP;
  // v0.1.9.0 B.1 (RV8): the legend moved to the exported RampLegend — the
  // Overview card renders it once below whichever view is active.
  return (
    <svg width={width} height={height} aria-hidden="true" focusable="false">
      {months.map((m) => (
        <text key={m.x} x={m.x} y={10} className="fill-slate-400" fontSize={9}>
          {m.label}
        </text>
      ))}
      {WEEKDAYS.map(([row, label]) => (
        <text key={label} x={0} y={TOP + row * STEP + CELL - 2}
          className="fill-slate-400" fontSize={9}>
          {label}
        </text>
      ))}
      {weeks.map((week, wi) => week.map((c, di) => c && (
        <g key={c.day}>
          <title>
            {/* v0.1.6.0 D1 (C.1, RV13): effort only when > 0 — 300+ zero
                days must never all read "≈ 0m" (corner-dot precedent). */}
            {`${c.day} (UTC) — ${c.events} event${c.events === 1 ? "" : "s"} · ${c.commits} commit${c.commits === 1 ? "" : "s"}${c.minutes > 0 ? ` · ${fmtMinutes(c.minutes)}` : ""}`}
          </title>
          <rect x={LEFT + wi * STEP} y={TOP + di * STEP} width={CELL} height={CELL}
            rx={2} fill={RAMP[rampBucket(c.events, max)]} />
          {c.commits > 0 && (
            <circle cx={LEFT + wi * STEP + CELL - 2.5} cy={TOP + di * STEP + CELL - 2.5}
              r={1.5} fill="#e2e8f0" />
          )}
        </g>
      )))}
    </svg>
  );
}
