// v0.1.13.0 D1 (B.1): the activity snake — a serpentine sweep that EATS
// the year's calendar (Platane/snk-inspired, deliberately NOT a port: no
// pathfinding). Layout math is a module-private duplicate of the heatmap
// grid (the punch-card precedent); RAMP + rampBucket are IMPORTED (single
// color source — the RV7-v0.1.7.0 law). The path starts at the FIRST
// column containing a non-zero day (RV9 — a col-0 start on a young DB
// crawls mostly dead grid) and runs at min(24, pathLength / 4)
// positions/s (RV10 — a minimum ~4s show). The calendar is SNAPSHOTTED
// per run (stats ticks apply on the NEXT run); eaten cells are DERIVED
// from the head index — no per-cell state. Reduced motion: static grid,
// snake parked, no control (rAF is JS-driven — the JS guard applies).

import { useEffect, useRef, useState } from "react";
import { RAMP, rampBucket } from "./calendarHeatmap";
import type { StatsData } from "./charts";
import { usePrefersReducedMotion } from "./theme";

type CalDay = StatsData["activity_calendar"][number];

const CELL = 10, GAP = 2, STEP = CELL + GAP;
const LEFT = 30, TOP = 16;
const COLS = 53; // ceil((lead + 365) / 7) = 53 for every lead 0..6 (RV1)

const fmt = (n: number) => n.toLocaleString("en-US");

interface Snap {
  cal: CalDay[];
  lead: number;
  startCol: number;
  path: [number, number][]; // (col, row) — serpentine from startCol
  max: number;              // 365-day events max (cell coloring basis)
  events: number;           // caption N
  speed: number;            // positions/s (RV10 clamp)
}

function buildSnap (calendar: CalDay[]): Snap {
  const first = new Date(`${calendar[0]?.day}T00:00:00Z`);
  const lead = isNaN(first.getTime()) ? 0 : first.getUTCDay();
  const dayAt = (c: number, r: number): CalDay | null => {
    const i = c * 7 + r - lead;
    return i >= 0 && i < calendar.length ? calendar[i] : null;
  };
  let startCol = 0;
  outer: for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < 7; r++) {
      if ((dayAt(c, r)?.events ?? 0) > 0) { startCol = c; break outer; }
    }
  }
  // Direction parity by ABSOLUTE column (even = down) — an odd startCol
  // starts upward (RV9).
  const path: [number, number][] = [];
  for (let c = startCol; c < COLS; c++) {
    for (let r = 0; r < 7; r++) path.push([c, c % 2 === 0 ? r : 6 - r]);
  }
  return {
    cal: calendar, lead, startCol, path,
    max: Math.max(0, ...calendar.map((d) => d.events)),
    events: calendar.reduce((s, d) => s + d.events, 0),
    speed: Math.min(24, path.length / 4),
  };
}

export function SnakeCalendar ({ calendar }: { calendar: CalDay[] }) {
  const reduced = usePrefersReducedMotion();
  const suppressResumeRef = useRef(false);
  const snapRef = useRef<Snap>(buildSnap(calendar));
  // head index into the path; -1 = parked before the run (nothing eaten)
  const [hi, setHi] = useState(-1);
  const rafRef = useRef(0);
  const vtRef = useRef(0);
  const lastRef = useRef(0);

  const startRun = () => {
    cancelAnimationFrame(rafRef.current);
    snapRef.current = buildSnap(calendar); // snapshot per run (init-once)
    vtRef.current = 0;
    lastRef.current = performance.now();
    setHi(0);
    const loop = (t: number) => {
      const snap = snapRef.current;
      vtRef.current += Math.min(t - lastRef.current, 100) / 1000; // clamped dt
      lastRef.current = t;
      const target = Math.min(
        Math.floor(vtRef.current * snap.speed), snap.path.length - 1);
      setHi(target);
      if (target < snap.path.length - 1) rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  };

  // Auto-play on entry. A live reduced-motion change cancels immediately and
  // parks the snake; turning motion back on never replays stale activity.
  useEffect(() => {
    if (reduced) {
      suppressResumeRef.current = true;
      cancelAnimationFrame(rafRef.current);
      setHi(-1);
    } else if (!suppressResumeRef.current) {
      startRun();
    }
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  const snap = snapRef.current;
  const dayAt = (c: number, r: number): CalDay | null => {
    const i = c * 7 + r - snap.lead;
    return i >= 0 && i < snap.cal.length ? snap.cal[i] : null;
  };
  // path index lookup for eaten derivation (path index <= head index)
  const pathIdx = new Map<number, number>();
  snap.path.forEach(([c, r], i) => pathIdx.set(c * 7 + r, i));

  const width = LEFT + COLS * STEP + 14;
  const height = TOP + 7 * STEP;
  const finished = hi >= 0 && hi === snap.path.length - 1;
  // body occupies the last min(5, hi + 1) path cells (RV13 — grows over
  // the first 4 steps); parked (hi -1) shows the head alone at path[0]
  const headAt = Math.max(hi, 0);
  const bodyFrom = Math.max(0, headAt - 4);
  const segOpacity = [0.35, 0.5, 0.65, 0.8];

  return (
    <div>
      {!reduced && (
        <div className="mb-1 flex justify-end">
          <button onClick={startRun}
            title="replay — the snake devours the year again"
            className="rounded bg-slate-800 px-1.5 py-0.5 text-[11px] text-slate-300 hover:bg-slate-700">
            ▶ run
          </button>
        </div>
      )}
      <svg width={width} height={height} aria-hidden="true" focusable="false">
        {Array.from({ length: COLS }, (_, c) =>
          Array.from({ length: 7 }, (_, r) => {
            const d = dayAt(c, r);
            if (!d) return null; // empty position (lead / trailing pad)
            const idx = pathIdx.get(c * 7 + r);
            const eaten = d.events > 0 && idx !== undefined && hi >= 0 && idx <= hi;
            return (
              <rect key={`${c}-${r}`} x={LEFT + c * STEP} y={TOP + r * STEP}
                width={CELL} height={CELL} rx={2}
                fill={eaten ? RAMP[0] : RAMP[rampBucket(d.events, snap.max)]}
                style={reduced ? undefined : { transition: "fill 0.3s" }}>
                <title>{`${d.day} (UTC) — ${d.events} event${d.events === 1 ? "" : "s"}`}</title>
              </rect>
            );
          }))}
        {/* the snake: up to 4 body segments + the head (white eye dot) */}
        {snap.path.slice(bodyFrom, headAt + 1).map(([c, r], i, arr) => {
          const head = i === arr.length - 1;
          return (
            <g key={`s${bodyFrom + i}`}>
              <rect x={LEFT + c * STEP - 1} y={TOP + r * STEP - 1}
                width={CELL + 2} height={CELL + 2} rx={4}
                fill="#2dd4bf" opacity={head ? 1 : segOpacity[i] ?? 0.8} />
              {head && (
                <circle cx={LEFT + c * STEP + CELL - 2.5} cy={TOP + r * STEP + 3.5}
                  r={1.6} fill="#ffffff" />
              )}
            </g>
          );
        })}
      </svg>
      {finished && (
        <p className="mt-1 text-[11px] text-slate-400">
          year devoured — {fmt(snap.events)} events 🐍
        </p>
      )}
    </div>
  );
}
