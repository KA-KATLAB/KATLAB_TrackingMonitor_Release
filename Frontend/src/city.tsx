// v0.2.0.0 D1+D2 (B.1/B.2): KATLAB City — the living workspace. One iso
// district per repo (module-private 2:1 dimetric math — the skyline
// RECIPE at city scale, not its component), buildings from each repo's
// OWN top-20 file_churn via PER-REPO SCOPED api.stats calls (RV1 — the
// global top-20 starves quiet districts), THROTTLED to one round per 10s
// with a single trailing catch-up (RV3 — get_stats is the heavy
// endpoint; the freshness nonce fires on every WS sync). Liveliness:
// event RAIN rides the events prop in real time (id-keyed diff;
// per-batch prune timeouts — RV6, ids not nonces), commit FIREWORKS on
// repo count DROPS (values-ref diff; the celebration burst recipe with
// per-district nonces), a local-hour day/night sky with DETERMINISTIC
// stars (never Math.random at render), and Kat walking the street. The
// city is a MIRROR (the pet law): look, hover, click through — never
// configure. CityScene is exported pure for the battery (the moodOf
// precedent); App renders CityView only.

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import { abortError, api, createActionDeadline, isAbortError, raceWithSignal } from "./api";
import type { ActionDeadline, Repo, Task, TrackedEvent } from "./api";
import { RAMP } from "./calendarHeatmap";
import type { StatsData } from "./charts";
import { startBlobDownload } from "./download";
import { Pet } from "./pet";
import type { Mood, Wardrobe } from "./pet";
import { UNCOMMITTED_AGE_H, usePrefersReducedMotion } from "./theme";
import { DisclosureTable } from "./accessibleData";
import { CollectionPager, useRememberedBoundedPage } from "./ui";

type ChurnRow = StatsData["file_churn"][number];

const PITCH = 190;           // district footprint width
const HEIGHT = 340;          // scene height
const SKY_H = 64;            // sky band height
const GROUND_Y = 248;        // platform baseline
const CAP = 8;               // buildings per district (churn-desc)
const HMIN = 14, HSPAN = 64; // height = HMIN + sqrt(events/churnMax)*HSPAN
const BW = 15;               // building half-footprint (iso 2:1)

const FETCH_WINDOW_MS = 10_000; // RV3 throttle window

// the treemap's recency bands verbatim (<24h/<7d/<30d/older)
function recencyBand (lastTs: string, nowMs: number): number {
  const age = nowMs - new Date(lastTs).getTime();
  if (!(age >= 0)) return 4; // future/invalid ts -> freshest, never NaN
  return age < 86_400_000 ? 4 : age < 7 * 86_400_000 ? 3
    : age < 30 * 86_400_000 ? 2 : 1;
}

// the skyline shade helper (hex * factor -> rgb) — face lighting
function shade (hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (s: number) => Math.round(((n >> s) & 0xff) * f);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

// local-hour sky bucket: [22,5) night / [5,8) dawn / [8,17) day / [17,22) dusk
export function skyBucket (hour: number): "night" | "dawn" | "day" | "dusk" {
  if (hour >= 22 || hour < 5) return "night";
  if (hour < 8) return "dawn";
  if (hour < 17) return "day";
  return "dusk";
}
const SKY_FILL = { night: "#020617", dawn: "#1e293b", day: "#334155", dusk: "#1e2536" };

// v0.2.7.0 D2 (A.1, R-BE): weather = repo HEALTH state, never work.
// Branch order IS the law (fog first — an offline repo's live staleness
// is unknowable, fog is the honest face); rain reads the ONE-source
// UNCOMMITTED_AGE_H chain (bell nudge + Kat "anxious" + this — theme.ts,
// never a copy); fresh uncommitted = null (the plaque already counts it;
// weather marks STATES, decorating normal flow would punish it).
// v0.2.8.0 D6 (B.1, R-BJ): the 5th state — "forecast", the gathering
// storm in the (rain − lead, rain] window; scene-only, NEVER a
// bell/sound/OS ping (D7 — weather forecasts, it does not demand).
export type Weather = "sun" | "rain" | "fog" | "forecast" | null;

// The forecast lead — weather-internal (not a cross-surface mirror);
// RV9: both window bounds stay SYMBOLIC against the ONE source, so
// the window self-adjusts if the 48h threshold ever moves.
const WX_FORECAST_LEAD_H = 12;

export function weatherOf (repo: Repo, nowMs: number): Weather {
  if (repo.offline) return "fog";
  if (repo.clean) return "sun";
  if (repo.oldest_uncommitted_ts !== null) {
    const age = nowMs - new Date(repo.oldest_uncommitted_ts).getTime();
    if (age > UNCOMMITTED_AGE_H * 3_600_000) return "rain";
    if (age > (UNCOMMITTED_AGE_H - WX_FORECAST_LEAD_H) * 3_600_000) {
      return "forecast";
    }
  }
  return null;
}

// RV3 (v0.2.8.0): the static map stays THREE-keyed — the forecast tip
// is the ONE computed weather tip (built in the scene; the title
// builder branches three ways).
const WEATHER_TIP: Record<Exclude<Weather, null | "forecast">, string> = {
  sun: "clear — everything committed ✓",
  rain: `rain — uncommitted work aging ${UNCOMMITTED_AGE_H}h+`,
  fog: "fog — repo offline",
};

// one iso building (3 faces from base point bx,by — the skyline recipe)
function Building ({ bx, by, h, color }:
  { bx: number; by: number; h: number; color: string }) {
  const w = BW, dy = w / 2;
  const p = (pts: number[][]) => pts.map(([x, y]) => `${x},${y}`).join(" ");
  return (
    <g>
      <polygon points={p([[bx, by], [bx, by - h], [bx + w, by - h + dy], [bx + w, by + dy]])}
        fill={shade(color, 0.62)} />
      <polygon points={p([[bx + w, by + dy], [bx + w, by - h + dy], [bx + 2 * w, by - h], [bx + 2 * w, by]])}
        fill={shade(color, 0.82)} />
      <polygon points={p([[bx, by - h], [bx + w, by - h + dy], [bx + 2 * w, by - h], [bx + w, by - h - dy]])}
        fill={color} />
    </g>
  );
}

// a tiny construction crane (in-progress task marker)
function Crane ({ x, y, tip }: { x: number; y: number; tip: string }) {
  return (
    <g stroke="#f59e0b" strokeWidth="1.4" fill="none">
      <line x1={x} y1={y} x2={x} y2={y - 34} />
      <line x1={x} y1={y - 34} x2={x + 20} y2={y - 30} />
      <line x1={x + 20} y1={y - 30} x2={x + 20} y2={y - 20} />
      <line x1={x - 6} y1={y - 28} x2={x} y2={y - 34} />
      <title>{tip}</title>
    </g>
  );
}

export interface DistrictData {
  repo: Repo;
  churn: ChurnRow[];     // that repo's OWN scoped top-20 (RV1)
  inProgress: Task[];    // cranes
}

function activateSvgAction (event: KeyboardEvent<SVGGElement>, action: () => void): void {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  action();
}

// The PURE scene — everything derivable from props (battery-testable).
export function CityScene ({ districts, churnMax, mood, nowMs, localHour,
  rangeLabel, onOpenFileStory, onGoRepo }: {
  districts: DistrictData[];
  churnMax: number;      // max events across ALL districts' rows
  mood: Mood;
  nowMs: number;
  localHour: number;
  rangeLabel: string;
  onOpenFileStory?: (repo: string, file: string) => void;
  onGoRepo?: (repoId: string) => void;
}) {
  const width = Math.max(PITCH, districts.length * PITCH) + 20;
  const bucket = skyBucket(localHour);
  return (
    <svg width={width} height={HEIGHT} role="img"
      aria-label={`KATLAB City — ${rangeLabel}`}>
      <title>{`KATLAB City — ${rangeLabel}`}</title>
      <desc>
        {`Exactly this visible district page is shown. Building heights share the full-workspace scale.`}
      </desc>
      {/* sky band + deterministic stars at night (index-math seeded) */}
      <rect x={0} y={0} width={width} height={SKY_H} fill={SKY_FILL[bucket]} />
      {bucket === "night" && Array.from({ length: 18 }, (_, i) => (
        <circle key={i} cx={20 + ((i * 149) % Math.max(1, width - 40))}
          cy={8 + ((i * 61) % (SKY_H - 20))} r={i % 3 === 0 ? 1.2 : 0.8}
          fill="#94a3b8" />
      ))}
      {districts.map((d, di) => {
        const dx = 10 + di * PITCH;
        const offline = d.repo.offline;
        const clean = !offline && d.repo.clean;
        const rows = [...d.churn].sort((a, b) => b.events - a.events).slice(0, CAP);
        const ground = clean ? "#022c22" : "#1e293b"; // emerald-950 | slate-800
        const cranes = d.inProgress.slice(0, 3);
        const extra = d.inProgress.length - cranes.length;
        const weather = weatherOf(d.repo, nowMs); // v0.2.7.0 A.1 (R-BE)
        // v0.2.8.0 B.1 (RV3/RV7): the three-way tip — forecast gets
        // the ONE computed line; max(1, ceil) never renders "~0h" at
        // the exact-threshold edge (rain needs strict >, so the
        // boundary itself is still forecast).
        const wxTip = weather === "forecast"
          ? `rain in ~${Math.max(1, Math.ceil(UNCOMMITTED_AGE_H
              - (nowMs - new Date(d.repo.oldest_uncommitted_ts!).getTime())
                / 3_600_000))}h — commit to clear`
          : weather !== null ? WEATHER_TIP[weather] : null;
        return (
          <g key={d.repo.id} opacity={offline ? 0.5 : 1}>
            {/* platform (iso ground) */}
            <polygon points={`${dx},${GROUND_Y + 26} ${dx + 85},${GROUND_Y - 16} ${dx + 170},${GROUND_Y + 26} ${dx + 85},${GROUND_Y + 68}`}
              fill={ground} stroke="#334155" strokeWidth="1">
              <title>{wxTip ? `${d.repo.path}\n${wxTip}` : d.repo.path}</title>
            </polygon>
            {/* buildings — back row (0..3) first, front row after (painter) */}
            {rows.map((r, i) => {
              const row = i < 4 ? 0 : 1, col = i % 4;
              const bx = dx + 4 + col * 44 + row * 6;
              const by = GROUND_Y - 4 + row * 44;
              const h = HMIN + Math.sqrt(r.events / Math.max(1, churnMax)) * HSPAN;
              const base = r.file.split(/[\\/]/).pop() ?? r.file;
              const buildingLabel = `${r.repo}/${r.file} — ${r.events} event${r.events === 1 ? "" : "s"}; open file story`;
              return (
                <g key={JSON.stringify([r.repo, r.file])}
                  role={onOpenFileStory ? "button" : undefined}
                  tabIndex={onOpenFileStory ? 0 : undefined}
                  aria-label={onOpenFileStory ? buildingLabel : undefined}
                  className={onOpenFileStory ? "ui-svg-action cursor-pointer" : undefined}
                  onClick={() => onOpenFileStory?.(r.repo, r.file)}
                  onKeyDown={onOpenFileStory
                    ? (event) => activateSvgAction(event, () => onOpenFileStory(r.repo, r.file))
                    : undefined}>
                  <title>{`${base} — ${r.events} event${r.events === 1 ? "" : "s"} · last ${r.last_ts}`}</title>
                  {onOpenFileStory && (
                    <rect x={bx - 7} y={by - 22} width={44} height={44}
                      fill="transparent" />
                  )}
                  <Building bx={bx} by={by} h={h}
                    color={RAMP[recencyBand(r.last_ts, nowMs)]} />
                </g>
              );
            })}
            {rows.length === 0 && ( /* bare plaza */
              <text x={dx + 85} y={GROUND_Y + 30} textAnchor="middle"
                fontSize={9} className="fill-slate-500">plaza</text>
            )}
            {/* cranes at the east edge (cap 3 + "+N") */}
            {cranes.map((t, i) => (
              <Crane key={t.task_ref} x={dx + 148 - i * 14} y={GROUND_Y + 18 - i * 8}
                tip={t.task_ref} />
            ))}
            {extra > 0 && (
              <text x={dx + 158} y={GROUND_Y - 22} fontSize={9}
                className="fill-amber-400">+{extra}</text>
            )}
            {offline && (
              <text x={dx + 130} y={GROUND_Y - 40} fontSize={11}
                className="fill-slate-500">z z</text>
            )}
            {/* v0.2.7.0 A.1 (R-BE): WEATHER — scene state, rides the
                snapshot (a snapshot hiding the rain would lie about
                health). Laws: fill/stroke ATTRS only (FILL_MAP stays
                untouched by construction), index-math geometry (the
                stars law), wx-* motion in the ONE reduced-motion block
                as animation:none (RV7 — state stays visible). Pointer
                events off: weather never blocks building clicks. */}
            {weather === "sun" && (
              <g pointerEvents="none">
                {bucket === "night" ? (
                  /* the MOON — a sun at 2am breaks the sky fiction */
                  <circle cx={dx + 85} cy={24} r={6} fill="#94a3b8"
                    opacity={0.9} />
                ) : (
                  <>
                    <circle cx={dx + 85} cy={24} r={11} fill="#fbbf24" opacity={0.22} />
                    <circle cx={dx + 85} cy={24} r={6} fill="#fbbf24" />
                    {Array.from({ length: 8 }, (_, i) => {
                      const a = (i * Math.PI) / 4;
                      return <line key={i}
                        x1={dx + 85 + Math.cos(a) * 9} y1={24 + Math.sin(a) * 9}
                        x2={dx + 85 + Math.cos(a) * 13} y2={24 + Math.sin(a) * 13}
                        stroke="#fbbf24" strokeWidth="1.4" />;
                    })}
                  </>
                )}
              </g>
            )}
            {weather === "rain" && (
              <g pointerEvents="none">
                <ellipse cx={dx + 72} cy={58} rx={17} ry={7} fill="#475569" />
                <ellipse cx={dx + 97} cy={56} rx={14} ry={6} fill="#334155" />
                {Array.from({ length: 8 }, (_, i) => {
                  const x = dx + 15 + ((i * 37) % 140);
                  const y = 70 + ((i * 23) % 18);
                  return <line key={i} className="wx-drop"
                    x1={x} y1={y} x2={x} y2={y + 12}
                    stroke="#38bdf8" strokeWidth="1.2" opacity={0.7} />;
                })}
              </g>
            )}
            {weather === "fog" && (
              <g pointerEvents="none">
                <rect className="wx-fog" x={dx + 8} y={150} width={154}
                  height={26} rx={10} fill="#94a3b8" opacity={0.10} />
                <rect className="wx-fog" x={dx + 14} y={186} width={142}
                  height={22} rx={10} fill="#94a3b8" opacity={0.14}
                  style={{ animationDelay: "-4s" }} />
              </g>
            )}
            {weather === "forecast" && ( /* v0.2.8.0 B.1 (R-BJ): the
                gathering storm — ONE still lighter cloud, no drops,
                no motion (reduced-motion-immune by construction);
                scene svg, attrs only, rides the snapshot; silent by
                D7 (weather forecasts, it does not demand). */
              <g pointerEvents="none">
                <ellipse cx={dx + 72} cy={58} rx={17} ry={7}
                  fill="#64748b" opacity={0.8} />
                <ellipse cx={dx + 97} cy={56} rx={14} ry={6}
                  fill="#475569" opacity={0.8} />
              </g>
            )}
            {/* plaque: repo id + the StatusBar chip mirror */}
            <g role={onGoRepo ? "button" : undefined}
              tabIndex={onGoRepo ? 0 : undefined}
              aria-label={onGoRepo ? `Open Overview for repository ${d.repo.id}` : undefined}
              className={onGoRepo ? "ui-svg-action cursor-pointer" : undefined}
              onClick={() => onGoRepo?.(d.repo.id)}
              onKeyDown={onGoRepo
                ? (event) => activateSvgAction(event, () => onGoRepo(d.repo.id))
                : undefined}>
              {onGoRepo && (
                <rect x={dx + 41} y={74} width={88} height={44} fill="transparent" />
              )}
              <text x={dx + 85} y={92} textAnchor="middle" fontSize={12}
                fontWeight="bold" className="fill-slate-200">{d.repo.id}</text>
              {offline ? (
                <>
                  <rect x={dx + 55} y={100} width={60} height={16} rx={3} fill="#52525b" />
                  <text x={dx + 85} y={112} textAnchor="middle" fontSize={9}
                    fontWeight="bold" className="fill-white">OFFLINE</text>
                </>
              ) : clean ? (
                <>
                  <rect x={dx + 55} y={100} width={60} height={16} rx={3} fill="#059669" />
                  <text x={dx + 85} y={112} textAnchor="middle" fontSize={9}
                    fontWeight="bold" className="fill-white">CLEAN ✓</text>
                </>
              ) : (
                <>
                  <rect x={dx + 47} y={100} width={76} height={16} rx={3} fill="#f59e0b" />
                  <text x={dx + 85} y={112} textAnchor="middle" fontSize={9}
                    fontWeight="bold" fill="#020617">{d.repo.count} uncommitted</text>
                </>
              )}
              <title>{d.repo.path}</title>
            </g>
          </g>
        );
      })}
      {/* the street */}
      <line x1={0} y1={GROUND_Y + 74} x2={width} y2={GROUND_Y + 74}
        stroke="#334155" strokeWidth="2" strokeDasharray="6 8" />
    </svg>
  );
}

interface Drop { id: number; x: number; batch: number; pageKey: string }
interface Burst { repo: string; n: number; x: number; pageKey: string }
// v0.2.9.0 D4 (B.1, R-BK): the recovery rainbow (rain -> sun only).
interface Rainbow { repo: string; n: number; x: number; pageKey: string }
interface CityAlternativeRow {
  district: DistrictData;
  building: ChurnRow | null;
  buildingOrdinal: number | null;
}
// RV9: the pinned arc geometry — outside-in, red first (the physical
// rainbow order); upper semicircles on the y=170 rooftop baseline.
// Exported for the battery (the WARDROBE_TIERS readability precedent).
export const RAINBOW_ARCS: { r: number; color: string }[] = [
  { r: 60, color: "#ef4444" }, { r: 54, color: "#f59e0b" },
  { r: 48, color: "#10b981" }, { r: 42, color: "#38bdf8" },
];

// v0.2.1.0 D3 (B.3): the snapshot exporter's PURE transform (exported
// for the battery): a standalone .svg has no Tailwind, so the scene's
// four fill classes are inlined to their hexes and ALL class attributes
// stripped (cursor-pointer etc. are meaningless in a file). Idempotent.
const FILL_MAP: Record<string, string> = {
  "fill-slate-200": "#e2e8f0",
  "fill-slate-500": "#64748b",
  "fill-amber-400": "#fbbf24",
  "fill-white": "#ffffff",
};

export function inlineSvgClasses (markup: string): string {
  let out = markup;
  for (const [cls, hex] of Object.entries(FILL_MAP)) {
    out = out.replaceAll(`class="${cls}"`, `fill="${hex}"`);
  }
  return out.replace(/ class="[^"]*"/g, "");
}

interface CityRound {
  generation: number;
  key: string;
  origin: "automatic" | "foreground";
  controller: AbortController;
  action?: ActionDeadline;
  settled: Promise<boolean>;
}

async function fetchCityChurnPool (repoIds: readonly string[],
  signal: AbortSignal): Promise<Map<string, ChurnRow[]>> {
  const rows = new Map<string, ChurnRow[]>();
  let cursor = 0;
  let firstError: unknown;
  let failed = false;
  let stopped = false;
  const workers = Array.from({ length: Math.min(6, repoIds.length) }, async () => {
    while (!stopped && !signal.aborted) {
      const index = cursor;
      cursor += 1;
      if (index >= repoIds.length) return;
      try {
        const result = await api.stats(repoIds[index], signal);
        rows.set(repoIds[index], result.file_churn);
      } catch (errorValue) {
        if (signal.aborted) return;
        if (!failed) firstError = errorValue;
        failed = true;
        stopped = true;
      }
    }
  });
  await Promise.all(workers);
  if (signal.aborted) throw abortError();
  if (failed) throw firstError;
  return rows;
}

export function CityView ({ repos, tasks, events, workspaceReady, mood, wardrobe, refreshIdentity,
  onOpenFileStory, onGoRepo, onStatus }: {
  repos: Repo[];
  tasks: Task[];
  events: TrackedEvent[];   // the uncommitted pool (rain rides this)
  workspaceReady: boolean;  // first complete repos/tasks/events snapshot accepted
  mood: Mood;
  wardrobe: Wardrobe;       // v0.2.7.0 B.2 (RV3/RV16): stops HERE — the
                            // street Kat lives on the HTML overlay, the
                            // pure scene (and its snapshot) never sees it
  refreshIdentity: number;  // changes only after an accepted scoped-stats success
  onOpenFileStory: (repo: string, file: string) => void;
  onGoRepo: (repoId: string) => void;
  onStatus: (message: string) => void;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const reducedMotionRef = useRef(reducedMotion);
  reducedMotionRef.current = reducedMotion;
  const [churn, setChurn] = useState<Map<string, ChurnRow[]>>(new Map());
  const [acceptedKey, setAcceptedKey] = useState("");
  const acceptedKeyRef = useRef("");
  const [hydrating, setHydrating] = useState(false);
  const [hydrationNote, setHydrationNote] = useState("");
  const hydrationNoteRef = useRef("");
  const [retryBusy, setRetryBusy] = useState(false);
  const retryBusyRef = useRef(false);
  const [drops, setDrops] = useState<Drop[]>([]);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [rainbows, setRainbows] = useState<Rainbow[]>([]);
  const prevWeatherRef = useRef<Map<string, Weather> | null>(null);
  const rainbowN = useRef(0);
  const mountedRef = useRef(true);
  const animationTimersRef = useRef<Map<number, string>>(new Map());
  const snapshotTimerRef = useRef<number | null>(null);
  const autoTimerRef = useRef<number | null>(null);
  const lastRoundStartRef = useRef(-Infinity);
  const reposRef = useRef(repos);
  reposRef.current = repos;
  const repoKey = JSON.stringify(repos.map((repo) => repo.id));
  const repoKeyRef = useRef("");
  const roundGenerationRef = useRef(0);
  const roundRef = useRef<CityRound | null>(null);
  const retryActionRef = useRef<ActionDeadline | null>(null);
  const trailingRoundRef = useRef(false);
  const scheduleAutomaticRef = useRef<() => void>(() => {});
  const prevIdsRef = useRef<Set<number> | null>(null);
  const prevCountsRef = useRef<Map<string, number> | null>(null);
  const batchRef = useRef(0);
  const nonceRef = useRef(0);
  const visibleRepoIdsRef = useRef<string[]>([]);
  const pageKeyRef = useRef("");

  const districtX = (repoId: string) => {
    const i = visibleRepoIdsRef.current.indexOf(repoId);
    return i < 0 ? null : 10 + i * PITCH + 85;
  };

  const clearTransientAnimations = useCallback((): void => {
    for (const timer of animationTimersRef.current.keys()) clearTimeout(timer);
    animationTimersRef.current.clear();
    setDrops([]);
    setBursts([]);
    setRainbows([]);
  }, []);

  const runRound = useCallback((origin: "automatic" | "foreground",
    key: string, repoIds: readonly string[], owner: { controller: AbortController;
      action?: ActionDeadline }): Promise<boolean> => {
    const generation = ++roundGenerationRef.current;
    lastRoundStartRef.current = Date.now();
    const record: CityRound = {
      generation,
      key,
      origin,
      controller: owner.controller,
      action: owner.action,
      settled: Promise.resolve(false),
    };
    roundRef.current = record;
    setHydrating(true);
    record.settled = (async () => {
      try {
        const next = await fetchCityChurnPool(repoIds, owner.controller.signal);
        if (!mountedRef.current || roundGenerationRef.current !== generation
            || repoKeyRef.current !== key || owner.controller.signal.aborted) return false;
        const recovered = !!hydrationNoteRef.current;
        acceptedKeyRef.current = key;
        setAcceptedKey(key);
        setChurn(next);
        hydrationNoteRef.current = "";
        setHydrationNote("");
        if (recovered) onStatus("City data recovered.");
        return true;
      } catch (errorValue) {
        if (!mountedRef.current || roundGenerationRef.current !== generation
            || repoKeyRef.current !== key) return false;
        const timedOut = !!owner.action
          && (owner.action.didTimeout() || Date.now() >= owner.action.deadlineAt);
        if (isAbortError(errorValue) && !timedOut) return false;
        const hasAccepted = acceptedKeyRef.current === key;
        const message = timedOut
          ? "City retry timed out after 10 seconds."
          : `${hasAccepted ? "City refresh failed; showing the last accepted snapshot" : "City data is unavailable"}: ${String(errorValue).slice(0, 100)}.`;
        hydrationNoteRef.current = message;
        setHydrationNote(message);
        if (origin === "foreground") onStatus(`${message} Retry is available.`);
        return false;
      } finally {
        if (roundRef.current === record) {
          roundRef.current = null;
          if (mountedRef.current) setHydrating(false);
        }
        if (origin === "automatic" && trailingRoundRef.current) {
          trailingRoundRef.current = false;
          queueMicrotask(() => scheduleAutomaticRef.current());
        }
      }
    })();
    return record.settled;
  }, [onStatus]);

  const scheduleAutomatic = useCallback((): void => {
    if (!workspaceReady) return;
    const key = repoKeyRef.current;
    const repoIds = reposRef.current.map((repo) => repo.id);
    if (roundRef.current || retryBusyRef.current) {
      trailingRoundRef.current = true;
      return;
    }
    if (repoIds.length === 0) {
      acceptedKeyRef.current = key;
      setAcceptedKey(key);
      setChurn(new Map());
      hydrationNoteRef.current = "";
      setHydrationNote("");
      setHydrating(false);
      return;
    }
    const wait = FETCH_WINDOW_MS - (Date.now() - lastRoundStartRef.current);
    if (wait > 0) {
      if (autoTimerRef.current === null) {
        autoTimerRef.current = window.setTimeout(() => {
          autoTimerRef.current = null;
          scheduleAutomaticRef.current();
        }, wait);
      }
      return;
    }
    trailingRoundRef.current = false;
    void runRound("automatic", key, repoIds, { controller: new AbortController() });
  }, [runRound, workspaceReady]);
  scheduleAutomaticRef.current = scheduleAutomatic;

  useEffect(() => {
    const changedKey = repoKeyRef.current !== repoKey;
    if (changedKey) {
      repoKeyRef.current = repoKey;
      acceptedKeyRef.current = "";
      setAcceptedKey("");
      setChurn(new Map());
      hydrationNoteRef.current = "";
      setHydrationNote("");
      trailingRoundRef.current = false;
      if (autoTimerRef.current !== null) {
        window.clearTimeout(autoTimerRef.current);
        autoTimerRef.current = null;
      }
      if (roundRef.current) {
        roundGenerationRef.current += 1;
        roundRef.current.controller.abort();
        trailingRoundRef.current = true;
      }
      retryActionRef.current?.controller.abort();
    }
    scheduleAutomatic();
  }, [refreshIdentity, repoKey, scheduleAutomatic]);

  const retryHydration = (): void => {
    if (retryBusyRef.current) return;
    const action = createActionDeadline();
    retryActionRef.current = action;
    retryBusyRef.current = true;
    setRetryBusy(true);
    const key = repoKeyRef.current;
    const repoIds = reposRef.current.map((repo) => repo.id);
    const prior = roundRef.current;
    if (prior) {
      roundGenerationRef.current += 1;
      prior.controller.abort();
    }
    void (async () => {
      try {
        if (prior) {
          await raceWithSignal(prior.settled.then(() => undefined), action.signal);
          if (roundRef.current === prior) roundRef.current = null;
        }
        if (action.signal.aborted || repoKeyRef.current !== key) throw abortError();
        await runRound("foreground", key, repoIds,
          { controller: action.controller, action });
      } catch (errorValue) {
        const timedOut = action.didTimeout() || Date.now() >= action.deadlineAt;
        if (!mountedRef.current || repoKeyRef.current !== key
            || (isAbortError(errorValue) && !timedOut)) return;
        const message = "City retry timed out while stopping the prior refresh. Retry.";
        hydrationNoteRef.current = message;
        setHydrationNote(message);
        onStatus(message);
      } finally {
        action.clear();
        if (retryActionRef.current === action) retryActionRef.current = null;
        retryBusyRef.current = false;
        if (mountedRef.current) setRetryBusy(false);
        if (trailingRoundRef.current) {
          trailingRoundRef.current = false;
          queueMicrotask(() => scheduleAutomaticRef.current());
        }
      }
    })();
  };

  // D2 rain: id-keyed growth diff; per-batch prune timeouts (RV6).
  useEffect(() => {
    const ids = new Set(events.map((e) => e.id));
    const prev = prevIdsRef.current;
    prevIdsRef.current = ids;
    if (prev === null) return; // first payload = baseline, no rain
    if (reducedMotionRef.current) return;
    const fresh = events.filter((e) => !prev.has(e.id));
    if (fresh.length === 0) return;
    const batch = ++batchRef.current;
    const pageKey = pageKeyRef.current;
    const add: Drop[] = [];
    for (const e of fresh) {
      const x = districtX(e.repo_id);
      if (x !== null) add.push({
        id: e.id, x: x - 40 + (e.id % 11) * 8, batch, pageKey,
      });
    }
    if (add.length === 0) return;
    setDrops((d) => [...d, ...add].slice(-12)); // newest ~12
    const t = window.setTimeout(() => {
      animationTimersRef.current.delete(t);
      setDrops((d) => d.filter((x) => x.batch !== batch || x.pageKey !== pageKey));
    }, 900);
    animationTimersRef.current.set(t, pageKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events]);

  // v0.2.9.0 D4 (B.1, R-BK): the recovery rainbow — the fireworks
  // recipe verbatim (values-ref diff, first-payload baseline, nonce-
  // keyed, ~2.5s nonce-compare clear); rain -> sun ONLY (forecast->sun
  // and null->sun stay silent — only the full rain state earns it).
  // RV3 (documented): CityView-local liveness, the v0.2.0.0 class.
  useEffect(() => {
    const nowMs = Date.now();
    const cur = new Map(repos.map((r) => [r.id, weatherOf(r, nowMs)]));
    const prev = prevWeatherRef.current;
    prevWeatherRef.current = cur;
    if (prev === null) return; // first payload = baseline
    if (reducedMotionRef.current) return;
    const pageKey = pageKeyRef.current;
    for (const [id, w] of cur) {
      if (prev.get(id) === "rain" && w === "sun") {
        const x = districtX(id);
        if (x === null) continue;
        const n = ++rainbowN.current;
        setRainbows((b) => [
          ...b.filter((y) => y.repo !== id || y.pageKey !== pageKey),
          { repo: id, n, x, pageKey },
        ]);
        const t = window.setTimeout(() => {
          animationTimersRef.current.delete(t);
          setRainbows((b) => b.filter((y) =>
            !(y.repo === id && y.n === n && y.pageKey === pageKey)));
        }, 2500);
        animationTimersRef.current.set(t, pageKey);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repos]);

  // D2 fireworks: VALUES-ref diff, count DROP only, per-district nonces.
  useEffect(() => {
    const cur = new Map(repos.map((r) => [r.id, r.count]));
    const prev = prevCountsRef.current;
    prevCountsRef.current = cur;
    if (prev === null) return; // baseline
    if (reducedMotionRef.current) return;
    const pageKey = pageKeyRef.current;
    for (const [id, n] of cur) {
      const p = prev.get(id);
      if (p !== undefined && n < p) {
        const x = districtX(id);
        if (x === null) continue;
        const nonce = ++nonceRef.current;
        setBursts((b) => [
          ...b.filter((y) => y.repo !== id || y.pageKey !== pageKey),
          { repo: id, n: nonce, x, pageKey },
        ]);
        const t = window.setTimeout(() => {
          animationTimersRef.current.delete(t);
          setBursts((b) => b.filter((y) =>
            !(y.repo === id && y.n === nonce && y.pageKey === pageKey)));
        }, 900);
        animationTimersRef.current.set(t, pageKey);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repos]);

  // Unmount: animation timers and both request owners are cancelled silently.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      roundGenerationRef.current += 1;
      roundRef.current?.controller.abort();
      roundRef.current?.action?.clear();
      retryActionRef.current?.controller.abort();
      retryActionRef.current?.clear();
      for (const timer of animationTimersRef.current.keys()) clearTimeout(timer);
      animationTimersRef.current.clear();
      if (snapshotTimerRef.current !== null) clearTimeout(snapshotTimerRef.current);
      if (autoTimerRef.current !== null) clearTimeout(autoTimerRef.current);
    };
  }, []);

  const nowMs = Date.now();
  const churnMax = Math.max(1,
    ...[...churn.values()].flatMap((rows) => rows.map((row) => row.events)));
  const districts: DistrictData[] = repos.map((repo) => ({
    repo,
    churn: churn.get(repo.id) ?? [],
    inProgress: tasks.filter((task) => task.repo === repo.id && task.status === "in-progress"),
  }));
  const districtPager = useRememberedBoundedPage(
    "city-districts",
    {
      identity: ["city-districts", repoKey],
      totalItems: districts.length,
      pageSize: 6,
    },
  );
  const visibleDistricts = districts.slice(districtPager.start, districtPager.end);
  const visibleRepoIds = visibleDistricts.map((district) => district.repo.id);
  const pageRange = districtPager.totalItems === 0
    ? "0 of 0 repositories"
    : `${districtPager.start + 1}–${districtPager.end} of ${districtPager.totalItems} repositories`;
  const pageKey = JSON.stringify([repoKey, districtPager.page, visibleRepoIds]);
  visibleRepoIdsRef.current = visibleRepoIds;
  pageKeyRef.current = pageKey;
  const width = Math.max(PITCH, visibleDistricts.length * PITCH) + 20;
  const alternativeRows = districts.flatMap<CityAlternativeRow>((district) =>
    district.churn.length > 0
      ? district.churn.map((building, buildingOrdinal) => ({
        district, building, buildingOrdinal,
      }))
      : [{ district, building: null, buildingOrdinal: null }]);

  useEffect(() => {
    clearTransientAnimations();
  }, [clearTransientAnimations, pageKey]);

  useEffect(() => {
    if (reducedMotion) clearTransientAnimations();
  }, [clearTransientAnimations, reducedMotion]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [snapshotNote, setSnapshotNote] = useState("");
  const [snapshotBusy, setSnapshotBusy] = useState(false);
  const snapshotBusyRef = useRef(false);
  // v0.2.1.0 D3 (B.3): clone the scene svg, inline the fill classes,
  // download as a standalone file (the report Blob mechanics). The
  // rain/fireworks/Kat live on the HTML overlay — excluded by
  // construction (the button title says so).
  const snapshot = () => {
    if (snapshotBusyRef.current) return;
    const svg = containerRef.current?.querySelector("svg");
    if (!svg) {
      const message = "City snapshot is not ready yet.";
      setSnapshotNote(message);
      onStatus(message);
      return;
    }
    snapshotBusyRef.current = true;
    setSnapshotBusy(true);
    const now = new Date();
    const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    // CFT-1: XMLSerializer, NEVER outerHTML — the HTML serializer omits
    // xmlns (the scene JSX never sets it) and a standalone .svg without
    // the namespace fails to render; XMLSerializer auto-adds it.
    const markup = `<?xml version="1.0" encoding="UTF-8"?>\n` +
      inlineSvgClasses(new XMLSerializer().serializeToString(svg));
    try {
      const identityToken = encodeURIComponent(JSON.stringify(visibleRepoIds)).replace(/\*/g, "%2A");
      const fileRange = districtPager.totalItems === 0
        ? "repos-0-of-0"
        : `repos-${districtPager.start + 1}-${districtPager.end}-of-${districtPager.totalItems}`;
      startBlobDownload({
        blob: new Blob([markup], { type: "image/svg+xml" }),
        filename: `KATLAB_City_${fileRange}_${identityToken || "empty"}_${day}.svg`,
      });
      const message = `City snapshot for ${pageRange} download started.`;
      setSnapshotNote(message);
      onStatus(message);
      snapshotTimerRef.current = window.setTimeout(() => {
        snapshotTimerRef.current = null;
        snapshotBusyRef.current = false;
        if (mountedRef.current) setSnapshotBusy(false);
      }, 1_000);
    } catch (errorValue) {
      snapshotBusyRef.current = false;
      setSnapshotBusy(false);
      const message = `City snapshot could not start: ${String(errorValue).slice(0, 100)}.`;
      setSnapshotNote(message);
      onStatus(message);
    }
  };

  const cityReady = workspaceReady && acceptedKey === repoKey;

  return (
    <section>
      {/* v0.2.1.0 D3 (B.3, RV2): the h2 gains the Overview header's flex
          treatment — the snapshot button rides ml-auto. */}
      <div className="mb-3 flex min-w-0 items-center gap-2">
        <h2 data-view-heading tabIndex={-1}
          className="min-w-0 flex-1 border-l-4 border-teal-500 pl-2 text-sm font-bold text-slate-200">
          KATLAB City — the living workspace
        </h2>
        <button onClick={snapshot} disabled={!cityReady || snapshotBusy}
          aria-busy={snapshotBusy}
          title={`download ${pageRange} as a standalone SVG — live overlays not included`}
          className="ml-auto rounded bg-slate-800 px-2 py-0.5 text-xs font-normal text-slate-200 hover:bg-slate-700 disabled:opacity-40">
          {snapshotBusy ? "starting snapshot…" : "snapshot ⬇"}
        </button>
      </div>
      {(hydrationNote || snapshotNote || hydrating) && (
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-400">
          {hydrating && <span>{retryBusy ? "Retrying City data…" : "Refreshing City data…"}</span>}
          {hydrationNote && <span className="text-amber-300">{hydrationNote}</span>}
          {snapshotNote && <span>{snapshotNote}</span>}
          {hydrationNote && (
            <button type="button" className="ui-control bg-ui-raised"
              disabled={retryBusy} aria-busy={retryBusy} onClick={retryHydration}>
              {retryBusy ? "Retrying…" : "Retry City data"}
            </button>
          )}
        </div>
      )}
      {!cityReady ? (
        <div className="ui-skeleton flex min-h-[340px] items-center justify-center rounded border border-slate-700 bg-slate-900 p-6 text-sm text-slate-400">
          {hydrationNote || (!workspaceReady
            ? "Waiting for the first complete workspace snapshot…"
            : hydrating ? "Loading City data…" : "City data is waiting to refresh.")}
        </div>
      ) : (
      <div className="rounded border border-slate-700 bg-slate-900 p-3">
        <div className="ui-local-scroller overflow-x-auto" role="region"
          aria-label={`KATLAB City scene — ${pageRange}`} tabIndex={0}>
        <div ref={containerRef} className="relative" style={{ width, height: HEIGHT }}>
          <CityScene districts={visibleDistricts} churnMax={churnMax} mood={mood}
            nowMs={nowMs} localHour={new Date().getHours()}
            rangeLabel={pageRange}
            onOpenFileStory={onOpenFileStory} onGoRepo={onGoRepo} />
          {/* live overlay: rain + fireworks (HTML spans — the burst-p
              recipe home); pointer-events-none keeps the svg clickable */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            {drops.filter((drop) => drop.pageKey === pageKey).map((d) => (
              <span key={d.id} className="city-drop"
                style={{ left: d.x, top: SKY_H } as CSSProperties} />
            ))}
            {bursts.filter((burst) => burst.pageKey === pageKey).map((b) => (
              <span key={JSON.stringify([b.repo, b.n])}
                className="absolute" style={{ left: b.x, top: 150 } as CSSProperties}>
                {Array.from({ length: 12 }, (_, i) => {
                  const angle = (i / 12) * 2 * Math.PI;
                  const dist = i % 2 === 0 ? 30 : 44;
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
            {/* v0.2.9.0 B.1 (R-BK): the recovery rainbows — transient
                OVERLAY decorations (snapshot-excluded by construction;
                display:none under reduced motion — the city-drop form).
                RV9 geometry: district-center x, baseline y=170, upper
                semicircles, radii 60/54/48/42 outside-in red-first. */}
            {rainbows.filter((rainbow) => rainbow.pageKey === pageKey).map((rb) => (
              <svg key={JSON.stringify([rb.repo, rb.n])} className="rainbow-p absolute"
                width={140} height={74}
                style={{ left: rb.x - 70, top: 96 } as CSSProperties}>
                {RAINBOW_ARCS.map((a) => (
                  <path key={a.color} fill="none" stroke={a.color}
                    strokeWidth={3}
                    d={`M ${70 - a.r} 74 A ${a.r} ${a.r} 0 0 1 ${70 + a.r} 74`} />
                ))}
              </svg>
            ))}
            {/* Kat walks the street (kat-walk joins the reduced-motion
                block; her own breathe/blink ride along) */}
            <span className="kat-walk absolute" style={{ bottom: 2 }}>
              <Pet mood={mood} big wardrobe={wardrobe} />
            </span>
          </div>
        </div>
        </div>
        <CollectionPager collectionLabel="City districts" page={districtPager}
          onPageChange={districtPager.setPage} className="mt-2" />
        <DisclosureTable
          label="City districts and buildings"
          summary={`${districts.length.toLocaleString("en-US")} district${districts.length === 1 ? "" : "s"} `
            + `and ${districts.reduce((sum, district) => sum + district.churn.length, 0).toLocaleString("en-US")} `
            + `file building${districts.reduce((sum, district) => sum + district.churn.length, 0) === 1 ? "" : "s"}; `
            + `the scene shows ${pageRange}.`}
          rows={alternativeRows}
          rowKey={(row) => JSON.stringify([
            row.district.repo.id,
            row.building?.file ?? "plaza",
          ])}
          identity={["city-alternative", repoKey, acceptedKey]}
          columns={[
            { key: "district", label: "District", render: (row) => (
              <button type="button" onClick={() => onGoRepo(row.district.repo.id)}
                className="ui-focus-ring inline-flex min-h-6 min-w-6 items-center rounded text-left font-semibold text-teal-300 hover:underline">
                {row.district.repo.id}
              </button>
            ), sortValue: (row) => row.district.repo.id },
            { key: "health", label: "Health", render: (row) => row.district.repo.offline
              ? "offline"
              : row.district.repo.clean ? "clean" : `${row.district.repo.count} uncommitted` },
            { key: "building", label: "File building", render: (row) => row.building ? (
              <button type="button"
                onClick={() => onOpenFileStory(row.building!.repo, row.building!.file)}
                className="ui-focus-ring inline-flex min-h-6 min-w-6 items-center break-all rounded text-left font-mono text-sky-300 hover:underline">
                {row.building.file}
              </button>
            ) : <span className="text-slate-500">plaza — no churn rows</span>,
            sortValue: (row) => row.building?.file },
            { key: "captures", label: "Captures", render: (row) =>
              row.building?.events.toLocaleString("en-US") ?? "—",
            sortValue: (row) => row.building?.events,
            cellClassName: "text-right tabular-nums", headerClassName: "text-right" },
            { key: "last", label: "Last observed", render: (row) =>
              row.building?.last_ts ?? "—", sortValue: (row) => row.building?.last_ts },
            { key: "scene", label: "Scene", render: (row) => {
              const districtOrdinal = repos.findIndex((repo) => repo.id === row.district.repo.id);
              const page = districtOrdinal < 0 ? 0 : Math.floor(districtOrdinal / 6) + 1;
              const building = row.buildingOrdinal === null
                ? "plaza"
                : row.buildingOrdinal < CAP ? "visible building" : "table detail";
              return `page ${page} · ${building}`;
            } },
          ]}
          className="mt-3 border-t border-slate-800 pt-3"
        />
      </div>
      )}
    </section>
  );
}
