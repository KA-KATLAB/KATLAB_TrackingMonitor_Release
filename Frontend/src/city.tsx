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

import { CSSProperties, useEffect, useRef, useState } from "react";
import { api, Repo, Task, TrackedEvent } from "./api";
import { RAMP } from "./calendarHeatmap";
import { StatsData } from "./charts";
import { Mood, Pet, Wardrobe } from "./pet";
import { UNCOMMITTED_AGE_H } from "./theme";

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
function Building ({ bx, by, h, color, tip }:
  { bx: number; by: number; h: number; color: string; tip: string }) {
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
      <title>{tip}</title>
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

// The PURE scene — everything derivable from props (battery-testable).
export function CityScene ({ districts, churnMax, mood, nowMs, localHour,
  onOpenFileStory, onGoRepo }: {
  districts: DistrictData[];
  churnMax: number;      // max events across ALL districts' rows
  mood: Mood;
  nowMs: number;
  localHour: number;
  onOpenFileStory?: (repo: string, file: string) => void;
  onGoRepo?: (repoId: string) => void;
}) {
  const width = Math.max(PITCH, districts.length * PITCH) + 20;
  const bucket = skyBucket(localHour);
  return (
    <svg width={width} height={HEIGHT} role="img"
      aria-label="KATLAB City — the living workspace">
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
              const bx = dx + 22 + col * 32 + row * 12;
              const by = GROUND_Y - 4 + row * 22;
              const h = HMIN + Math.sqrt(r.events / Math.max(1, churnMax)) * HSPAN;
              const base = r.file.split(/[\\/]/).pop() ?? r.file;
              return (
                <g key={`${r.repo}|${r.file}`} className="cursor-pointer"
                  onClick={() => onOpenFileStory?.(r.repo, r.file)}>
                  <Building bx={bx} by={by} h={h}
                    color={RAMP[recencyBand(r.last_ts, nowMs)]}
                    tip={`${base} — ${r.events} event${r.events === 1 ? "" : "s"} · last ${r.last_ts}`} />
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
            <g className="cursor-pointer" onClick={() => onGoRepo?.(d.repo.id)}>
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

interface Drop { id: number; x: number; batch: number }
interface Burst { repo: string; n: number; x: number }

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

export function CityView ({ repos, tasks, events, mood, wardrobe, stats,
  onOpenFileStory, onGoRepo }: {
  repos: Repo[];
  tasks: Task[];
  events: TrackedEvent[];   // the uncommitted pool (rain rides this)
  mood: Mood;
  wardrobe: Wardrobe;       // v0.2.7.0 B.2 (RV3/RV16): stops HERE — the
                            // street Kat lives on the HTML overlay, the
                            // pure scene (and its snapshot) never sees it
  stats: StatsData | null;  // freshness nonce ONLY (tab-scoped in App)
  onOpenFileStory: (repo: string, file: string) => void;
  onGoRepo: (repoId: string) => void;
}) {
  const [churn, setChurn] = useState<Map<string, ChurnRow[]>>(new Map());
  const [drops, setDrops] = useState<Drop[]>([]);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const mountedRef = useRef(true);
  const timersRef = useRef<Set<number>>(new Set());
  const lastFetchRef = useRef(-Infinity);
  const catchUpRef = useRef<number | null>(null);
  const reposRef = useRef(repos);
  reposRef.current = repos;
  const prevIdsRef = useRef<Set<number> | null>(null);
  const prevCountsRef = useRef<Map<string, number> | null>(null);
  const batchRef = useRef(0);
  const nonceRef = useRef(0);

  const districtX = (repoId: string) => {
    const i = reposRef.current.findIndex((r) => r.id === repoId);
    return i < 0 ? null : 10 + i * PITCH + 85;
  };

  // RV1+RV3: per-repo SCOPED stats, throttled to one round per window
  // with ONE trailing catch-up so the final state always lands.
  const doFetch = async () => {
    lastFetchRef.current = Date.now();
    try {
      const list = reposRef.current;
      const results = await Promise.all(list.map((r) => api.stats(r.id)));
      if (!mountedRef.current) return;
      setChurn(new Map(list.map((r, i) => [r.id, results[i].file_churn])));
    } catch { /* keep the last skyline; the next nonce retries */ }
  };
  useEffect(() => {
    const since = Date.now() - lastFetchRef.current;
    if (since >= FETCH_WINDOW_MS) {
      void doFetch();
    } else if (catchUpRef.current === null) {
      catchUpRef.current = window.setTimeout(() => {
        catchUpRef.current = null;
        void doFetch();
      }, FETCH_WINDOW_MS - since);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats, repos.length]);

  // D2 rain: id-keyed growth diff; per-batch prune timeouts (RV6).
  useEffect(() => {
    const ids = new Set(events.map((e) => e.id));
    const prev = prevIdsRef.current;
    prevIdsRef.current = ids;
    if (prev === null) return; // first payload = baseline, no rain
    const fresh = events.filter((e) => !prev.has(e.id));
    if (fresh.length === 0) return;
    const batch = ++batchRef.current;
    const add: Drop[] = [];
    for (const e of fresh) {
      const x = districtX(e.repo_id);
      if (x !== null) add.push({ id: e.id, x: x - 40 + (e.id % 11) * 8, batch });
    }
    if (add.length === 0) return;
    setDrops((d) => [...d, ...add].slice(-12)); // newest ~12
    const t = window.setTimeout(() => {
      timersRef.current.delete(t);
      setDrops((d) => d.filter((x) => x.batch !== batch)); // own batch only
    }, 900);
    timersRef.current.add(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events]);

  // D2 fireworks: VALUES-ref diff, count DROP only, per-district nonces.
  useEffect(() => {
    const cur = new Map(repos.map((r) => [r.id, r.count]));
    const prev = prevCountsRef.current;
    prevCountsRef.current = cur;
    if (prev === null) return; // baseline
    for (const [id, n] of cur) {
      const p = prev.get(id);
      if (p !== undefined && n < p) {
        const x = districtX(id);
        if (x === null) continue;
        const nonce = ++nonceRef.current;
        setBursts((b) => [...b.filter((y) => y.repo !== id), { repo: id, n: nonce, x }]);
        const t = window.setTimeout(() => {
          timersRef.current.delete(t);
          setBursts((b) => b.filter((y) => !(y.repo === id && y.n === nonce)));
        }, 900);
        timersRef.current.add(t);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repos]);

  // unmount: every pending timer cleared (throttle catch-up included)
  useEffect(() => () => {
    mountedRef.current = false;
    timersRef.current.forEach((t) => clearTimeout(t));
    if (catchUpRef.current !== null) clearTimeout(catchUpRef.current);
  }, []);

  const containerRef = useRef<HTMLDivElement | null>(null);
  // v0.2.1.0 D3 (B.3): clone the scene svg, inline the fill classes,
  // download as a standalone file (the report Blob mechanics). The
  // rain/fireworks/Kat live on the HTML overlay — excluded by
  // construction (the button title says so).
  const snapshot = () => {
    const svg = containerRef.current?.querySelector("svg");
    if (!svg) return;
    const now = new Date();
    const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    // CFT-1: XMLSerializer, NEVER outerHTML — the HTML serializer omits
    // xmlns (the scene JSX never sets it) and a standalone .svg without
    // the namespace fails to render; XMLSerializer auto-adds it.
    const markup = `<?xml version="1.0" encoding="UTF-8"?>\n` +
      inlineSvgClasses(new XMLSerializer().serializeToString(svg));
    const blob = new Blob([markup], { type: "image/svg+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `KATLAB_City_${day}.svg`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const nowMs = Date.now();
  const churnMax = Math.max(1,
    ...[...churn.values()].flatMap((rows) => rows.map((r) => r.events)));
  const districts: DistrictData[] = repos.map((r) => ({
    repo: r,
    churn: churn.get(r.id) ?? [],
    inProgress: tasks.filter((t) => t.repo === r.id && t.status === "in-progress"),
  }));
  const width = Math.max(PITCH, districts.length * PITCH) + 20;

  return (
    <section>
      {/* v0.2.1.0 D3 (B.3, RV2): the h2 gains the Overview header's flex
          treatment — the snapshot button rides ml-auto. */}
      <h2 className="mb-3 flex items-center border-l-4 border-teal-500 pl-2 text-sm font-bold text-slate-200">
        <span>KATLAB City — the living workspace</span>
        <button onClick={snapshot}
          title="download the city model as a standalone SVG — live overlays not included"
          className="ml-auto rounded bg-slate-800 px-2 py-0.5 text-xs font-normal text-slate-200 hover:bg-slate-700">
          snapshot ⬇
        </button>
      </h2>
      <div className="overflow-x-auto rounded border border-slate-700 bg-slate-900 p-3">
        <div ref={containerRef} className="relative" style={{ width, height: HEIGHT }}>
          <CityScene districts={districts} churnMax={churnMax} mood={mood}
            nowMs={nowMs} localHour={new Date().getHours()}
            onOpenFileStory={onOpenFileStory} onGoRepo={onGoRepo} />
          {/* live overlay: rain + fireworks (HTML spans — the burst-p
              recipe home); pointer-events-none keeps the svg clickable */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            {drops.map((d) => (
              <span key={d.id} className="city-drop"
                style={{ left: d.x, top: SKY_H } as CSSProperties} />
            ))}
            {bursts.map((b) => (
              <span key={`${b.repo}-${b.n}`}
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
            {/* Kat walks the street (kat-walk joins the reduced-motion
                block; her own breathe/blink ride along) */}
            <span className="kat-walk absolute" style={{ bottom: 2 }}>
              <Pet mood={mood} big wardrobe={wardrobe} />
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
