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

import { useId, useEffect, useRef, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import type { StatsData } from "./charts";
import { fmtMinutes } from "./format";
import { SettingsIcon } from "./icons";
import { usePrefersReducedMotion } from "./theme";
import { IconButton, SectionHeading, useDisclosureBehavior } from "./ui";

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

export function GoalRings ({ calendar, scope, compact, onStatus }: {
  calendar: CalDay[];
  scope: string | undefined; // undefined = ALL (stats arrive server-scoped)
  compact?: boolean;         // the focus-mode wall variant (C.1)
  onStatus?: (message: string) => void;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const reducedMotionRef = useRef(reducedMotion);
  reducedMotionRef.current = reducedMotion;
  const today = calendar[calendar.length - 1] ?? { events: 0, minutes: 0, commits: 0 };
  const values = [today.events, today.minutes, today.commits];

  const [goals, setGoals] = useState<Goals>(loadGoals);
  const goalsRef = useRef(goals); goalsRef.current = goals;
  const [drafts, setDrafts] = useState<Record<keyof Goals, string>>({
    events: String(goals.events),
    minutes: String(goals.minutes),
    commits: String(goals.commits),
  });
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof Goals, string>>>({});
  const [saveNote, setSaveNote] = useState("");
  const fieldRefs = useRef<Record<keyof Goals, HTMLInputElement | null>>({
    events: null,
    minutes: null,
    commits: null,
  });
  const formId = useId().replace(/:/g, "-");
  const [gearOpen, setGearOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  useDisclosureBehavior({
    open: gearOpen,
    onClose: () => setGearOpen(false),
    rootRef,
    triggerRef,
  });

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
        !document.hidden && !reducedMotionRef.current) {
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

  useEffect(() => {
    if (!reducedMotion) return;
    timeoutsRef.current.forEach((id) => clearTimeout(id));
    timeoutsRef.current.clear();
    setBursts([]);
  }, [reducedMotion]);

  const validateGoal = (raw: string): string => {
    const v = Number(raw);
    return Number.isInteger(v) && v > 0 ? "" : "Enter a whole number greater than zero.";
  };

  const saveGoals = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const fields = Object.keys(DEFAULTS) as (keyof Goals)[];
    const errors: Partial<Record<keyof Goals, string>> = {};
    for (const field of fields) {
      const error = validateGoal(drafts[field]);
      if (error) errors[field] = error;
    }
    setFieldErrors(errors);
    const firstInvalid = fields.find((field) => errors[field]);
    if (firstInvalid) {
      fieldRefs.current[firstInvalid]?.focus();
      setSaveNote("Fix the highlighted goal value.");
      return;
    }
    const next: Goals = {
      events: Number(drafts.events),
      minutes: Number(drafts.minutes),
      commits: Number(drafts.commits),
    };
    // RV2b (as built): a goal edit needs NO reseed — prev stores raw
    // VALUES and the crossing compare reads the goal FRESH via goalsRef,
    // so a lowered goal can never satisfy `prev < goal`.
    setGoals(next);
    localStorage.setItem(KEY, JSON.stringify(next));
    setSaveNote("Daily goals saved.");
    onStatus?.("Daily goals saved.");
  };

  const openGoalEditor = (): void => {
    if (!gearOpen) {
      setDrafts({
        events: String(goalsRef.current.events),
        minutes: String(goalsRef.current.minutes),
        commits: String(goalsRef.current.commits),
      });
      setFieldErrors({});
      setSaveNote("");
    }
    setGearOpen(!gearOpen);
  };

  const scale = compact ? 0.6 : 1;
  const size = 120 * scale;
  const goalList = [goals.events, goals.minutes, goals.commits];
  const labels = ["captures", "effort", "commits"];
  const rendered = (i: number) =>
    i === 1 ? fmtMinutes(values[1]) : fmt(values[i]);
  return (
    <div ref={rootRef} className="relative">
      {!compact && (
        <SectionHeading level={4} title="Today's rings"
          description={`UTC — ${scope ?? "All repos"}.`}
          actions={(
            <IconButton ref={triggerRef} label="Edit daily goals"
              onClick={openGoalEditor} aria-expanded={gearOpen}
              aria-controls="daily-goals-panel">
              <SettingsIcon />
            </IconButton>
          )} />
      )}
      {gearOpen && !compact && (
        <div id="daily-goals-panel" role="region" aria-label="Daily goal values"
          className="ui-disclosure-enter absolute right-0 top-12 z-10 rounded border border-slate-600 bg-slate-800 p-2 text-xs shadow-xl">
          <form noValidate onSubmit={saveGoals}>
            <fieldset className="space-y-2">
              <legend className="mb-1 font-semibold text-slate-200">Daily goal values</legend>
              {(Object.keys(DEFAULTS) as (keyof Goals)[]).map((field) => {
                const errorId = `${formId}-${field}-error`;
                return (
                  <label key={field} className="block">
                    <span className="mb-0.5 block text-slate-300">{field} goal</span>
                    <input ref={(element) => { fieldRefs.current[field] = element; }}
                      type="number" min={1} step={1} inputMode="numeric"
                      value={drafts[field]}
                      aria-invalid={fieldErrors[field] ? "true" : undefined}
                      aria-describedby={fieldErrors[field] ? errorId : undefined}
                      onChange={(event) => {
                        setDrafts((current) => ({ ...current, [field]: event.target.value }));
                        setSaveNote("");
                      }}
                      onBlur={() => setFieldErrors((current) => ({
                        ...current,
                        [field]: validateGoal(drafts[field]) || undefined,
                      }))}
                      className="w-28 rounded bg-slate-900 px-2 py-1 text-slate-100 aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-rose-500" />
                    {fieldErrors[field] && (
                      <span id={errorId} className="mt-0.5 block max-w-48 text-rose-300">
                        {fieldErrors[field]}
                      </span>
                    )}
                  </label>
                );
              })}
            </fieldset>
            <button type="submit" className="ui-control mt-2 bg-teal-700 text-white">
              Save goals
            </button>
            {saveNote && <p className="mt-1 text-slate-300">{saveNote}</p>}
          </form>
        </div>
      )}
      <div className={compact ? "flex justify-center" : "flex items-center gap-4"}>
        <div className="relative" style={{ width: size, height: size }}>
          <svg width={size} height={size} viewBox="0 0 120 120"
            aria-hidden="true" focusable="false">
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
                    style={reducedMotion ? undefined :
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
        <ul className={compact ? "sr-only" : "space-y-1 text-[11px] text-slate-300"}
          aria-label={`Today's daily goals for ${scope ?? "All repos"}`}>
            {labels.map((label, i) => {
              const pct = Math.round((values[i] / goalList[i]) * 100);
              return (
                <li key={label} className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: RING_COLOR[i] }} />
                  <span>{label}</span>
                  <span className="text-slate-400">
                    {rendered(i)} / {i === 1 ? fmtMinutes(goalList[1]) : fmt(goalList[i])} ({fmt(pct)}%)
                  </span>
                </li>
              );
            })}
        </ul>
      </div>
    </div>
  );
}
