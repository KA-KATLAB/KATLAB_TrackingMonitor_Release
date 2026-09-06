// v0.2.1.0 D1 (B.1): personal records — the trophies' memory. Four rows
// from the served activity_calendar (records reach exactly as far as the
// calendar: "(last 365d, UTC)"). DISPLAY spans the FULL calendar (a
// today-break shows immediately); DETECTION compares today against the
// record-to-beat over calendar[:-1] (today excluded) with the
// STRICTLY-GREATER law, via a prev-RAW-VALUES ref on stats changes only
// (the goalRings crossing recipe). The instance is keyed by scope AT THE
// CALL SITE (key={scope ?? "ALL"}) — tab switches reseed via the
// first-payload rule and can never false-fire. maxStreakOf is the MAX
// run over the year; the shipped streakOf answers the CURRENT streak — a
// different question, never reused.

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { StatsData } from "./charts";
import { fmtMinutes } from "./format";
import { usePrefersReducedMotion } from "./theme";
import { SectionHeading, Surface } from "./ui";

type CalDay = StatsData["activity_calendar"][number];
const fmt = (n: number) => n.toLocaleString("en-US");

export function maxStreakOf (calendar: CalDay[]): { len: number; endDay: string } {
  let best = 0, bestEnd = "", cur = 0;
  for (const d of calendar) {
    cur = d.events > 0 ? cur + 1 : 0;
    if (cur > best) { best = cur; bestEnd = d.day; }
  }
  return { len: best, endDay: bestEnd };
}

export function bestRolling7 (calendar: CalDay[]): { sum: number; endDay: string } {
  let best = 0, bestEnd = "";
  for (let i = 6; i < calendar.length; i++) {
    let s = 0;
    for (let j = i - 6; j <= i; j++) s += calendar[j].events;
    if (s > best) { best = s; bestEnd = calendar[i].day; }
  }
  return { sum: best, endDay: bestEnd };
}

// today's run INCLUDING today (no today-zero grace — a zero today cannot
// break anything, and the detection needs the truthful current run)
function runEndingToday (calendar: CalDay[]): number {
  let n = 0;
  for (let i = calendar.length - 1; i >= 0 && calendar[i].events > 0; i--) n += 1;
  return n;
}

type RowKey = "dayEvents" | "dayMinutes" | "streak" | "week";

export function Records ({ calendar }: { calendar: CalDay[] }) {
  const reducedMotion = usePrefersReducedMotion();
  const reducedMotionRef = useRef(reducedMotion);
  reducedMotionRef.current = reducedMotion;
  // today's raw values per row (the detection feed)
  const last = calendar[calendar.length - 1];
  const todayVals: Record<RowKey, number> = {
    dayEvents: last?.events ?? 0,
    dayMinutes: last?.minutes ?? 0,
    streak: runEndingToday(calendar),
    week: calendar.slice(-7).reduce((s, d) => s + d.events, 0),
  };
  // the record-to-beat per row: the max over ALL days EXCEPT today
  const prior = calendar.slice(0, -1);
  const toBeat: Record<RowKey, number> = {
    dayEvents: Math.max(0, ...prior.map((d) => d.events)),
    dayMinutes: Math.max(0, ...prior.map((d) => d.minutes)),
    streak: maxStreakOf(prior).len,
    week: bestRolling7(prior).sum,
  };
  // DISPLAY: the full-calendar records (today included)
  const bestEv = calendar.reduce((a, d) => (d.events > a.events ? d : a),
    { day: "", events: 0, minutes: 0, commits: 0 } as CalDay);
  const bestMin = calendar.reduce((a, d) => (d.minutes > a.minutes ? d : a),
    { day: "", events: 0, minutes: 0, commits: 0 } as CalDay);
  const streak = maxStreakOf(calendar);
  const week = bestRolling7(calendar);

  const prevRef = useRef<Record<RowKey, number> | null>(null);
  const [bursts, setBursts] = useState<{ row: RowKey; n: number }[]>([]);
  const [banner, setBanner] = useState<number | null>(null);
  const nonceRef = useRef(0);
  const timersRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = todayVals;
    if (prev === null) return; // first payload = baseline (the rings rule)
    for (const row of Object.keys(todayVals) as RowKey[]) {
      // strictly greater, crossed BETWEEN payloads, never re-fires
      if (prev[row] <= toBeat[row] && todayVals[row] > toBeat[row]) {
        const n = ++nonceRef.current;
        if (!reducedMotionRef.current) {
          setBursts((b) => [...b.filter((x) => x.row !== row), { row, n }]);
          const t = window.setTimeout(() => {
            timersRef.current.delete(t);
            setBursts((b) => b.filter((x) => !(x.row === row && x.n === n)));
          }, 900);
          timersRef.current.add(t);
        }
        setBanner(n);
        const tb = window.setTimeout(() => {
          timersRef.current.delete(tb);
          setBanner((cur) => (cur === n ? null : cur)); // nonce-compare
        }, 4000);
        timersRef.current.add(tb);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendar]);
  useEffect(() => () => timersRef.current.forEach((t) => clearTimeout(t)), []);
  useEffect(() => {
    if (!reducedMotion) return;
    timersRef.current.forEach((timer) => clearTimeout(timer));
    timersRef.current.clear();
    setBursts([]);
    setBanner(null);
  }, [reducedMotion]);

  const rows: { key: RowKey; label: string; value: string; day: string }[] = [
    { key: "dayEvents", label: "best day — captures", value: fmt(bestEv.events), day: bestEv.day },
    { key: "dayMinutes", label: "best day — effort", value: fmtMinutes(bestMin.minutes), day: bestMin.day },
    { key: "streak", label: "longest streak", value: `${streak.len} day${streak.len === 1 ? "" : "s"}`, day: streak.endDay },
    { key: "week", label: "best week (rolling 7d)", value: `${fmt(week.sum)} captures`, day: week.endDay },
  ];

  return (
    <Surface data-reveal>
      <SectionHeading level={4} title="Personal records"
        description="Last 365 days (UTC)."
        actions={banner !== null ? (
          <span className="rounded bg-amber-900/50 px-2 py-1 text-xs font-bold text-amber-300">
            NEW RECORD 🏆
          </span>
        ) : undefined} />
      <ul className="space-y-1.5 text-sm">
        {rows.map((r) => (
          <li key={r.key} className="relative flex items-baseline gap-2">
            <span className="text-slate-400">{r.label}</span>
            <span className="font-bold text-slate-100">{r.value}</span>
            <span className="ml-auto text-[11px] text-slate-500">{r.day || "—"}</span>
            {bursts.filter((b) => b.row === r.key).map((b) => (
              /* the ~12-particle celebration recipe (nonce-keyed spans) */
              <span key={b.n} aria-hidden="true">
                {Array.from({ length: 12 }, (_, i) => {
                  const angle = (i / 12) * 2 * Math.PI;
                  const dist = i % 2 === 0 ? 26 : 38;
                  const colors = ["#14b8a6", "#10b981", "#f59e0b"];
                  return (
                    <span key={i} className="burst-p"
                      style={{
                        backgroundColor: colors[i % 3],
                        "--dx": `${Math.round(Math.cos(angle) * dist)}px`,
                        "--dy": `${Math.round(Math.sin(angle) * dist)}px`,
                      } as CSSProperties} />
                  );
                })}
              </span>
            ))}
          </li>
        ))}
      </ul>
    </Surface>
  );
}
