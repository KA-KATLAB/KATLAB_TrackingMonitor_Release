// v0.1.11.0 D1 (B.1/C.1): Apple-style daily goal rings — captures / effort /
// commits vs user-set targets, all from the SERVED calendar's last entry
// (UTC today). The 2-circles-per-ring technique: a dim full TRACK under a
// PROGRESS circle (fixed dasharray = circumference, animated dashoffset).
// Crossings fire the celebration recipe WHOLE (nonce spans + 900ms
// nonce-compare clear + unmount clear — RV5: this component REMOUNTS by
// design, the parent keys it by scope so tab switches reseed via the
// first-payload rule instead of false-bursting — RV2/RV3). Goals are
// GLOBAL (one wall, one you); invalid edits are REJECTED, never coerced
// (RV4). Ring palette is decorative — never MODE_COLOR.

import { CSSProperties, useEffect, useRef, useState } from "react";
import { StatsData } from "./charts";
import { fmtMinutes } from "./format";
import { prefersReducedMotion } from "./theme";

type CalDay = StatsData["activity_calendar"][number];

interface Goals { events: number; minutes: number; commits: number; }
const DEFAULTS: Goals = { events: 30, minutes: 120, commits: 2 };
const KEY = "katlab.goals";
// teal / sky / amber by ring — decorative (the identity-donut precedent).
const RING_COLOR = ["#14b8a6", "#0284c7", "#f59e0b"];
const RADII = [50, 38, 26];
const fmt = (n: number) => n.toLocaleString("en-US");

function loadGoals (): Goals {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Goals>;
    const pick = (v: unknown, d: number) =>
      typeof v === "number" && Number.isInteger(v) && v > 0 ? v : d;
    return {
      events: pick(raw.events, DEFAULTS.events),
      minutes: pick(raw.minutes, DEFAULTS.minutes),
      commits: pick(raw.commits, DEFAULTS.commits),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function GoalRings ({ calendar, scope, compact }: {
  calendar: CalDay[];
  scope: string | undefined; // undefined = ALL (stats arrive server-scoped)
  compact?: boolean;         // the focus-mode wall variant (C.1)
}) {
  const today = calendar[calendar.length - 1] ?? { events: 0, minutes: 0, commits: 0 };
  const values = [today.events, today.minutes, today.commits];

  const [goals, setGoals] = useState<Goals>(loadGoals);
  const goalsRef = useRef(goals); goalsRef.current = goals;
  const [gearOpen, setGearOpen] = useState(false);
  const popRef = useRef<HTMLDivElement | null>(null);

  // RV2b/RV5: crossings fire on STATS changes only — prev VALUES in a ref
  // (compared against the CURRENT goal at effect time), seeded on the
  // first payload; every pending burst timeout is cleared on unmount.
  const prevRef = useRef<number[] | null>(null);
  const nonceRef = useRef(0);
  const timeoutsRef = useRef<Set<number>>(new Set());
  const [bursts, setBursts] = useState<{ ring: number; n: number }[]>([]);

  useEffect(() => {
    const goalList = [goalsRef.current.events, goalsRef.current.minutes,
      goalsRef.current.commits];
    if (prevRef.current === null) { // first payload = seed, never a crossing
      prevRef.current = values;
      return;
    }
    const prev = prevRef.current;
    values.forEach((v, i) => {
      if (prev[i] < goalList[i] && v >= goalList[i] &&
        !document.hidden && !prefersReducedMotion()) {
        const n = ++nonceRef.current;
        setBursts((b) => [...b, { ring: i, n }]);
        const id = window.setTimeout(() => {
          timeoutsRef.current.delete(id);
          setBursts((b) => b.filter((x) => x.n !== n));
        }, 900);
        timeoutsRef.current.add(id);
      }
    });
    prevRef.current = values;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today.events, today.minutes, today.commits]);

  useEffect(() => () => { // RV5: no timer aims setState at a dead instance
    timeoutsRef.current.forEach((id) => clearTimeout(id));
  }, []);

  // The popover is NOT an overlay — pointerdown outside closes it (the
  // toast-stack recipe); the palette stays live.
  useEffect(() => {
    if (!gearOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!popRef.current?.contains(e.target as Node)) setGearOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [gearOpen]);

  // RV4: reject invalid input — the field keeps its previous valid value.
  const saveGoal = (field: keyof Goals, raw: string) => {
    const v = Number(raw);
    if (!Number.isInteger(v) || v <= 0) return;
    const next = { ...goalsRef.current, [field]: v };
    // RV2b (as built): a goal edit needs NO reseed — prev stores raw
    // VALUES and the crossing compare reads the goal FRESH via goalsRef,
    // so a lowered goal can never satisfy `prev < goal`.
    setGoals(next);
    localStorage.setItem(KEY, JSON.stringify(next));
  };

  const scale = compact ? 0.6 : 1;
  const size = 120 * scale;
  const goalList = [goals.events, goals.minutes, goals.commits];
  const labels = ["captures", "effort", "commits"];
  const rendered = (i: number) =>
    i === 1 ? fmtMinutes(values[1]) : fmt(values[i]);
  const noMotion = prefersReducedMotion();

  return (
    <div className="relative">
      {!compact && (
        <div className="mb-2 flex items-center text-xs font-semibold text-slate-300">
          <span>Today's rings — (UTC) — {scope ?? "ALL repos"}</span>
          <button onClick={() => setGearOpen(!gearOpen)} aria-label="edit daily goals"
            className="ml-auto rounded bg-slate-800 px-1.5 py-0.5 font-normal hover:bg-slate-700">
            ⚙
          </button>
        </div>
      )}
      {gearOpen && !compact && (
        <div ref={popRef}
          className="absolute right-0 top-7 z-10 space-y-1.5 rounded border border-slate-600 bg-slate-800 p-2 text-[11px] shadow-xl">
          {(Object.keys(DEFAULTS) as (keyof Goals)[]).map((f) => (
            <label key={f} className="flex items-center gap-2">
              <span className="w-16 text-slate-300">{f} goal</span>
              <input type="number" min={1} defaultValue={goals[f]}
                onChange={(e) => saveGoal(f, e.target.value)}
                onBlur={(e) => { e.target.value = String(goalsRef.current[f]); }}
                className="w-16 rounded bg-slate-900 px-1 py-0.5 text-slate-100" />
            </label>
          ))}
        </div>
      )}
      <div className={compact ? "flex justify-center" : "flex items-center gap-4"}>
        <div className="relative" style={{ width: size, height: size }}>
          <svg width={size} height={size} viewBox="0 0 120 120" role="img"
            aria-label="daily goal rings">
            {RADII.map((r, i) => {
              const C = 2 * Math.PI * r;
              const pct = Math.min(1, values[i] / goalList[i]);
              return (
                <g key={i}>
                  <circle cx={60} cy={60} r={r} fill="none" stroke={RING_COLOR[i]}
                    strokeWidth={10} opacity={0.25} />
                  <circle cx={60} cy={60} r={r} fill="none" stroke={RING_COLOR[i]}
                    strokeWidth={10} strokeLinecap="round"
                    strokeDasharray={C} strokeDashoffset={C * (1 - pct)}
                    transform="rotate(-90 60 60)"
                    style={noMotion ? undefined :
                      { transition: "stroke-dashoffset 0.6s ease-out" }} />
                </g>
              );
            })}
          </svg>
          {bursts.map(({ ring, n }) => (
            <span key={n} aria-hidden="true">
              {Array.from({ length: 8 }, (_, i) => {
                const angle = (i / 8) * 2 * Math.PI;
                const dist = 24 + (i % 3) * 8;
                return (
                  <span key={i} className="burst-p"
                    style={{
                      "--dx": `${Math.round(Math.cos(angle) * dist)}px`,
                      "--dy": `${Math.round(Math.sin(angle) * dist)}px`,
                      backgroundColor: RING_COLOR[ring],
                    } as CSSProperties} />
                );
              })}
            </span>
          ))}
        </div>
        {!compact && (
          <div className="space-y-1 text-[11px] text-slate-300">
            {labels.map((label, i) => {
              const pct = Math.round((values[i] / goalList[i]) * 100);
              return (
                <div key={label} className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: RING_COLOR[i] }} />
                  <span>{label}</span>
                  <span className="text-slate-400">
                    {rendered(i)} / {i === 1 ? fmtMinutes(goalList[1]) : fmt(goalList[i])} ({fmt(pct)}%)
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
