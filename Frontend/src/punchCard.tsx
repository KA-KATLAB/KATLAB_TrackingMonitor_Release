// v0.1.7.0 D3 (B.1): "when do I work" punch card — day-of-week x hour-of-day
// heatmap, pure SVG, zero deps (the calendarHeatmap sibling). Rows Sun..Sat
// (Sunday-first, the calendar convention; the backend maps Python's
// Monday=0 weekday via (weekday()+1)%7 — the RV2 trap); columns 0..23 in
// SERVER-LOCAL hours — "when do I work" is a timestamp question, so UF4's
// LOCAL rule applies, and every tooltip says "(local time)". The RAMP is
// imported from calendarHeatmap (RV7 single source).

import { RAMP } from "./calendarHeatmap";

const CELL = 12, GAP = 2, STEP = CELL + GAP;
const LEFT = 30, TOP = 16; // day / hour label gutters
// v0.1.8.0 C.1 (RV5): EXPORTED — WrappedCard renders busiest_hour's day
// label from this exact array (the RAMP single-source precedent).
export const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOUR_LABELS = [0, 6, 12, 18];

export function PunchCard ({ matrix }: { matrix: number[][] }) {
  const max = Math.max(0, ...matrix.flat());
  const bucket = (n: number) =>
    n === 0 || max === 0 ? 0 : Math.min(4, Math.ceil((n / max) * 4));
  const width = LEFT + 24 * STEP + 4;
  const height = TOP + 7 * STEP;
  return (
    <div>
      <svg width={width} height={height} aria-hidden="true" focusable="false">
        {HOUR_LABELS.map((h) => (
          <text key={h} x={LEFT + h * STEP} y={10} className="fill-slate-400" fontSize={9}>
            {String(h).padStart(2, "0")}
          </text>
        ))}
        {DAYS.map((d, row) => (
          <text key={d} x={0} y={TOP + row * STEP + CELL - 3}
            className="fill-slate-400" fontSize={9}>
            {d}
          </text>
        ))}
        {matrix.map((rowCounts, row) => rowCounts.map((n, hour) => (
          <g key={`${row}-${hour}`}>
            <title>
              {`${DAYS[row]} ${String(hour).padStart(2, "0")}:00-${String((hour + 1) % 24).padStart(2, "0")}:00 — ${n} event${n === 1 ? "" : "s"} (local time)`}
            </title>
            <rect x={LEFT + hour * STEP} y={TOP + row * STEP} width={CELL} height={CELL}
              rx={2} fill={RAMP[bucket(n)]} />
          </g>
        )))}
      </svg>
      <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-400">
        <span>less</span>
        {RAMP.map((color) => (
          <span key={color} className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ backgroundColor: color }} />
        ))}
        <span>more</span>
        <span className="ml-3">local time</span>
      </div>
    </div>
  );
}
