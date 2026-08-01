// v0.1.8.0 D1 (B.1): "what did my day look like" — 24h day lanes, pure SVG
// (the calendarHeatmap/punchCard sibling). Lanes derive from the FETCHED
// ROWS' repo_ids (RV19 — the OverviewView repos prop excludes offline
// repos, but an offline repo's historical day must still render); blocks
// are presentation-only clusters via the MIRRORED constants (the v0.1.6.0
// RV4 contract — the algorithm home stays db.py). The fetch is repo-scoped
// (RV17), windowed via since/until (a LOCAL day converted to UTC instants
// — the wall-clock question, the API stays UTC), <= 3 pages of 500 with
// the per-effect ALIVE flag (RV16) and the ts-ASC client sort (RV8).
// FRESHNESS (RV9): a stats-prop change refetches ONLY while the picked day
// is TODAY (past days are immutable, fetched once per pick) and NEVER
// while replay is armed. B.2 owns the replay engine in this same file.

import { useEffect, useMemo, useRef, useState } from "react";
import { api, TrackedEvent } from "./api";
import { RAMP, rampBucket } from "./calendarHeatmap";
import { fmtMinutes, fmtTs } from "./format";
import { EFFORT_GAP_MAX_MIN, EFFORT_TAIL_MIN, MODE_BADGE, MODE_COLOR,
  prefersReducedMotion, sessionColor } from "./theme";

const LANE_H = 26, GAP_Y = 8, LEFT = 76, TOP = 18, HOUR_W = 34;
const WIDTH = LEFT + 24 * HOUR_W + 8;
const PAGE = 500, MAX_PAGES = 3;
const DAY_S = 86_400;

function localDayISO (d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-` +
    `${String(d.getDate()).padStart(2, "0")}`;
}

interface Block { start: number; rawEnd: number; events: TrackedEvent[] }

export function DayLanes ({ scope, stats }:
  { scope: string | undefined; stats: unknown }) {
  const today = localDayISO(new Date());
  const [day, setDay] = useState(today);
  // v0.1.13.0 D3 (B.3): lanes | clock — a second projection of the SAME
  // fetched rows (the flat|city recipe; persisted, default lanes).
  const [laneView, setLaneView] = useState<"lanes" | "clock">(
    () => (localStorage.getItem("katlab.dayView") === "clock" ? "clock" : "lanes"));
  const pickLaneView = (v: "lanes" | "clock") => {
    setLaneView(v);
    localStorage.setItem("katlab.dayView", v);
  };
  const [rows, setRows] = useState<TrackedEvent[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState("");
  // v0.1.8.0 D2 (B.2): replay state — the RV9 fetch guard reads `replay`.
  const [replay, setReplay] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [vt, setVt] = useState(0); // virtual seconds into the local day
  const rafRef = useRef(0);
  const lastFrame = useRef(0);
  const lastKey = useRef("");
  const isToday = day === today;

  const [y, m, d] = day.split("-").map(Number);
  const dayStartMs = new Date(y, m - 1, d).getTime();

  useEffect(() => {
    if (replay) return; // RV9: never refetch while replay is armed
    const key = `${scope ?? ""}|${day}`;
    // RV9: past days are immutable — a stats-only change never refetches.
    if (key === lastKey.current && !isToday) return;
    let alive = true; // RV16: the FileStory fetch recipe verbatim
    (async () => {
      try {
        const since = new Date(y, m - 1, d).toISOString();
        const until = new Date(y, m - 1, d + 1).toISOString();
        const all: TrackedEvent[] = [];
        let trunc = false;
        for (let p = 0; p < MAX_PAGES; p++) {
          const page = await api.events({ repo: scope, since, until,
            limit: PAGE, offset: p * PAGE }); // RV17: repo-scoped
          all.push(...page);
          if (page.length < PAGE) break;
          if (p === MAX_PAGES - 1) trunc = true;
        }
        all.sort((a, b) => a.ts.localeCompare(b.ts)); // RV8
        if (alive) {
          setRows(all); setTruncated(trunc); setError("");
          lastKey.current = key;
        }
      } catch (exc) {
        if (alive) setError(String(exc));
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, day, stats, replay]);

  // Presentation-only clustering per repo (mirrored constants — RV4
  // contract): a block joins while the gap <= 15min; +2min visual tail.
  const lanes = useMemo(() => {
    if (!rows) return [];
    const gapMs = EFFORT_GAP_MAX_MIN * 60_000;
    const byRepo = new Map<string, Block[]>();
    for (const e of rows) { // rows are ts-ASC (RV8)
      const t = new Date(e.ts).getTime();
      const blocks = byRepo.get(e.repo_id) ?? [];
      const last = blocks[blocks.length - 1];
      if (last && t - last.rawEnd <= gapMs) {
        last.rawEnd = t;
        last.events.push(e);
      } else {
        blocks.push({ start: t, rawEnd: t, events: [e] });
      }
      byRepo.set(e.repo_id, blocks);
    }
    return [...byRepo.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [rows]);

  const x = (ms: number) => LEFT + ((ms - dayStartMs) / 1000 / DAY_S) * 24 * HOUR_W;
  const tailMs = EFFORT_TAIL_MIN * 60_000;
  const height = TOP + Math.max(1, lanes.length) * (LANE_H + GAP_Y);
  const fmtLocal = (ms: number) => fmtTs(new Date(ms).toISOString()).slice(11, 16);

  const exitReplay = () => { setReplay(false); setPlaying(false); };
  const shift = (delta: number) => {
    exitReplay(); // RV9: a day switch exits replay FIRST (one day, one stage)
    const next = new Date(y, m - 1, d + delta);
    setDay(localDayISO(next)); // month/year roll-over free (V3)
  };

  // RV21: a SCOPE switch keeps this component mounted (OverviewView is
  // re-used un-keyed across repo tabs) — exit replay before the refetch
  // replaces the rows under the pointer.
  const prevScope = useRef(scope);
  useEffect(() => {
    if (prevScope.current !== scope) { prevScope.current = scope; exitReplay(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  // The ONE rAF loop (RV15: cancelled by the effect cleanup — a view
  // switch unmounts mid-replay without leaking a running loop). Virtual
  // time accumulates CLAMPED dt (a hidden tab stops rAF; the first resumed
  // frame's huge dt is capped, so the clock effectively pauses — never
  // wall-anchored, never skips events). 1x = the whole day in 30s.
  useEffect(() => {
    if (!replay || !playing) return;
    lastFrame.current = performance.now();
    const step = (now: number) => {
      const dt = Math.min(100, now - lastFrame.current);
      lastFrame.current = now;
      setVt((v) => Math.min(DAY_S, v + (dt / 1000) * (DAY_S / 30) * speed));
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [replay, playing, speed]);
  useEffect(() => { if (vt >= DAY_S) setPlaying(false); }, [vt]);

  // Consumed pointer via binary search over precomputed event seconds
  // (O(log n) per seek; the ts-ASC order is RV8's).
  const eventSecs = useMemo(
    () => (rows ?? []).map((e) => (new Date(e.ts).getTime() - dayStartMs) / 1000),
    [rows, dayStartMs]);
  const ptr = useMemo(() => {
    let lo = 0, hi = eventSecs.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (eventSecs[mid] <= vt) lo = mid + 1; else hi = mid;
    }
    return lo;
  }, [eventSecs, vt]);
  // "~Xm replayed-effort" over the CONSUMED rows via the MIRRORED
  // constants (RV6 — fmtMinutes renders the ≈).
  const replayedMinutes = useMemo(() => {
    if (ptr === 0) return 0;
    const gapS = EFFORT_GAP_MAX_MIN * 60, tailS = EFFORT_TAIL_MIN * 60;
    let total = 0, blockStart = eventSecs[0], prev = eventSecs[0];
    for (let i = 1; i < ptr; i++) {
      const t = eventSecs[i];
      if (t - prev > gapS) { total += prev - blockStart + tailS; blockStart = t; }
      prev = t;
    }
    total += prev - blockStart + tailS;
    return Math.round(total / 60);
  }, [eventSecs, ptr]);
  const feed = useMemo(
    () => (rows ?? []).slice(Math.max(0, ptr - 8), ptr).reverse(),
    [rows, ptr]);

  const armReplay = () => {
    setReplay(true);
    setVt(0);
    setPlaying(!prefersReducedMotion()); // no auto-play under reduced motion
  };

  return (
    <div data-reveal className="mt-4 rounded border border-slate-700 bg-slate-900 p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-300">
        <span>Your day — activity lanes (local time)</span>
        {truncated && (
          <span className="font-normal text-amber-300">(fetched window)</span>
        )}
        <span className="ml-auto flex items-center gap-1 font-normal">
          {/* v0.1.13.0 D3 (B.3): lanes | clock toggle — the clock button
              is DISABLED while replay is armed (the RV9-v0.1.8.0
              no-refetch-during-replay discipline; the engine can never
              be raced from the clock side). */}
          <span role="group" aria-label="day view" className="mr-2 flex gap-1">
            {(["lanes", "clock"] as const).map((v) => (
              <button key={v} aria-pressed={laneView === v}
                onClick={() => pickLaneView(v)}
                disabled={v === "clock" && replay}
                title={v === "clock" && replay ? "exit replay first" : undefined}
                className={`rounded px-1.5 py-0.5 text-[11px] ${
                  laneView === v
                    ? "bg-teal-800 text-white"
                    : "bg-slate-800 text-slate-400 hover:bg-slate-700"} disabled:opacity-30 disabled:hover:bg-slate-800`}>
                {v}
              </button>
            ))}
          </span>
          {!replay && laneView === "lanes" && rows && rows.length > 0 && (
            <button onClick={armReplay}
              title="replay this day — the whole day in 30 seconds at 1x"
              className="mr-2 rounded bg-teal-700 px-2 py-0.5 text-[11px] font-bold text-white hover:bg-teal-600">
              ▶ Replay
            </button>
          )}
          <button onClick={() => shift(-1)} aria-label="previous day"
            className="rounded px-1.5 py-0.5 text-slate-300 hover:bg-slate-700">◀</button>
          <span className="font-mono">{day}</span>
          <button onClick={() => shift(1)} disabled={isToday} aria-label="next day"
            className="rounded px-1.5 py-0.5 text-slate-300 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-transparent">▶</button>
        </span>
      </div>
      {error && <p className="text-xs text-rose-300">{error}</p>}
      {rows && rows.length === 0 && !error && (
        <p className="text-xs text-slate-400">No captures this day.</p>
      )}
      {/* v0.1.13.0 D3 (B.3): the clock — same rows, polar projection; at
          0 rows NEITHER view renders an svg (RV12 — the shared empty
          paragraph above covers it, mirroring the lanes' gate). */}
      {rows && rows.length > 0 && laneView === "clock" && (
        <DayClock rows={rows} day={day} isToday={isToday} />
      )}
      {rows && rows.length > 0 && laneView === "lanes" && (
        <div className="overflow-x-auto">
          <svg width={WIDTH} height={height} role="img"
            aria-label={`activity lanes for ${day} (local time)`}>
            {Array.from({ length: 9 }, (_, i) => i * 3).map((h) => (
              <g key={h}>
                <text x={LEFT + h * HOUR_W} y={10} className="fill-slate-400" fontSize={9}>
                  {String(h).padStart(2, "0")}
                </text>
                <line x1={LEFT + h * HOUR_W} y1={TOP - 4} x2={LEFT + h * HOUR_W}
                  y2={height} stroke="#334155" strokeWidth={0.5} />
              </g>
            ))}
            {lanes.map(([repo, blocks], lane) => {
              const yTop = TOP + lane * (LANE_H + GAP_Y);
              return (
                <g key={repo}>
                  <text x={0} y={yTop + LANE_H / 2 + 3} className="fill-slate-400"
                    fontSize={10}>
                    {repo.length > 11 ? `${repo.slice(0, 10)}…` : repo}
                  </text>
                  {blocks.map((b, i) => {
                    const minutes = Math.round((b.rawEnd - b.start + tailMs) / 60_000);
                    return (
                      <g key={i}>
                        <title>
                          {`${fmtLocal(b.start)}-${fmtLocal(b.rawEnd + tailMs)} (local) — ${b.events.length} event${b.events.length === 1 ? "" : "s"} · ${fmtMinutes(minutes)}`}
                        </title>
                        <rect x={x(b.start)} y={yTop}
                          width={Math.max(2, x(b.rawEnd + tailMs) - x(b.start))}
                          height={LANE_H} rx={3} fill="#14b8a6" opacity={0.35} />
                        {b.events.map((e) => (
                          <circle key={e.id} cx={x(new Date(e.ts).getTime())}
                            cy={yTop + LANE_H / 2} r={2.5}
                            fill={e.session_id ? sessionColor(e.session_id) : "#94a3b8"}>
                            <title>{`${fmtTs(e.ts)} — ${e.file}`}</title>
                          </circle>
                        ))}
                      </g>
                    );
                  })}
                </g>
              );
            })}
            {replay && ( /* D2: the cursor sweeps OVER the lanes — painted
                LAST (CFT-1: SVG paint order; under the semi-transparent
                blocks it read dimmed at exactly the moments it matters) */
              <line x1={LEFT + (vt / DAY_S) * 24 * HOUR_W} y1={TOP - 6}
                x2={LEFT + (vt / DAY_S) * 24 * HOUR_W} y2={height}
                stroke="#f59e0b" strokeWidth={1.5} />
            )}
          </svg>
        </div>
      )}
      {replay && rows && (
        <div className="mt-2 space-y-2">
          <div className="flex items-center gap-2 text-xs">
            <button onClick={() => setPlaying(!playing)}
              aria-label={playing ? "pause replay" : "play replay"}
              className="rounded bg-slate-700 px-2 py-0.5 font-bold text-white hover:bg-slate-600">
              {playing ? "⏸" : "▶"}
            </button>
            {[1, 2, 4].map((s) => (
              <button key={s} onClick={() => setSpeed(s)}
                className={`rounded px-1.5 py-0.5 text-[11px] ${speed === s
                  ? "bg-teal-700 font-bold text-white" : "text-slate-300 hover:bg-slate-700"}`}>
                {s}x
              </button>
            ))}
            <input type="range" min={0} max={DAY_S} step={30} value={Math.round(vt)}
              onChange={(e) => setVt(Number(e.target.value))}
              aria-label="replay position (seconds into the day)"
              className="min-w-24 flex-1 accent-teal-500" />
            <span className="shrink-0 font-mono text-slate-400">
              {String(Math.floor(vt / 3600)).padStart(2, "0")}:{String(Math.floor((vt % 3600) / 60)).padStart(2, "0")}
            </span>
            <span className="shrink-0 text-slate-400"
              title="estimated from capture timestamps — 15-min gap rule">
              {ptr} event{ptr === 1 ? "" : "s"} · {fmtMinutes(replayedMinutes)}
            </span>
            <button onClick={exitReplay} aria-label="exit replay"
              className="text-slate-400 hover:text-white">✕</button>
          </div>
          <div className="flex min-h-6 flex-wrap gap-1.5">
            {feed.map((e) => (
              <span key={e.id}
                className="chip-pop flex items-center gap-1 rounded bg-slate-800 px-1.5 py-0.5 text-[11px]">
                <span className="font-mono text-slate-400">
                  {fmtTs(e.ts).slice(11, 16)}
                </span>
                {scope === undefined && (
                  <span className="text-[10px] text-slate-500">{e.repo_id}</span>
                )}
                <span className="max-w-40 truncate font-mono" title={e.file}>{e.file}</span>
                <span className="rounded px-1 text-[9px] font-bold text-white"
                  style={{ backgroundColor: MODE_COLOR[e.mode] }}>
                  {MODE_BADGE[e.mode].label}
                </span>
              </span>
            ))}
            {feed.length === 0 && (
              <span className="text-[11px] text-slate-500">
                — scrub or play to see the day unfold —
              </span>
            )}
          </div>
        </div>
      )}
      {truncated && (
        <p className="mt-1 text-[11px] text-amber-300">
          ⚠ Only the newest {PAGE * MAX_PAGES} events of this day were fetched.
        </p>
      )}
      {!rows && !error && <p className="text-xs text-slate-500">Loading…</p>}
    </div>
  );
}

// v0.1.13.0 D3 (B.3): the day as a dial — 24 LOCAL-hour wedges from the
// SAME fetched rows (zero new fetches); midnight at TOP, clockwise; outer
// radius 26 + sqrt(count/dayMax) * 84 (the skyline area-honesty rule),
// inner 24; fills = the shared RAMP bucket vs the day max; zero hours are
// hairline ticks. The live hand renders only when the picked day IS today
// and is computed AT RENDER — the P8 60s tick moves it with no new timer.
function DayClock ({ rows, day, isToday }:
  { rows: TrackedEvent[]; day: string; isToday: boolean }) {
  const hours = Array.from({ length: 24 }, () => 0);
  for (const r of rows) hours[new Date(r.ts).getHours()] += 1;
  const max = Math.max(...hours);
  const C = 130, R_IN = 24;
  const pt = (r: number, deg: number): [number, number] => [
    C + r * Math.cos((deg - 90) * Math.PI / 180),
    C + r * Math.sin((deg - 90) * Math.PI / 180),
  ];
  const f = (n: number) => n.toFixed(1);
  const wedge = (h: number, rOut: number) => {
    const a0 = h * 15 + 1, a1 = (h + 1) * 15 - 1; // hairline gap between wedges
    const [x0, y0] = pt(rOut, a0), [x1, y1] = pt(rOut, a1);
    const [x2, y2] = pt(R_IN, a1), [x3, y3] = pt(R_IN, a0);
    return `M ${f(x0)} ${f(y0)} A ${rOut} ${rOut} 0 0 1 ${f(x1)} ${f(y1)} ` +
      `L ${f(x2)} ${f(y2)} A ${R_IN} ${R_IN} 0 0 0 ${f(x3)} ${f(y3)} Z`;
  };
  const now = new Date();
  const handDeg = (now.getHours() + now.getMinutes() / 60) * 15;
  const [hx, hy] = pt(112, handDeg);
  return (
    <svg viewBox="0 0 260 260" width={260} height={260} className="mx-auto block"
      role="img" aria-label={`activity clock for ${day} (local time)`}>
      {hours.map((c, h) => {
        if (c === 0) {
          const [x0, y0] = pt(R_IN, h * 15 + 7.5);
          const [x1, y1] = pt(R_IN + 4, h * 15 + 7.5);
          return <line key={h} x1={f(x0)} y1={f(y0)} x2={f(x1)} y2={f(y1)}
            stroke="#334155" strokeWidth={1} />;
        }
        const rOut = 26 + Math.sqrt(c / max) * 84;
        return (
          <path key={h} d={wedge(h, rOut)} fill={RAMP[rampBucket(c, max)]}>
            <title>
              {`${String(h).padStart(2, "0")}:00-${String(h + 1).padStart(2, "0")}:00 (local) — ${c} event${c === 1 ? "" : "s"}`}
            </title>
          </path>
        );
      })}
      {[0, 6, 12, 18].map((h) => {
        const [x, y] = pt(118, h * 15);
        return (
          <text key={h} x={f(x)} y={f(y + 3)} textAnchor="middle" fontSize={9}
            className="fill-slate-500">
            {h}
          </text>
        );
      })}
      {isToday && (
        <g>
          <line x1={C} y1={C} x2={f(hx)} y2={f(hy)}
            stroke="#14b8a6" strokeWidth={1.5} />
          <circle cx={C} cy={C} r={2} fill="#14b8a6" />
        </g>
      )}
      <text x={C} y={122} textAnchor="middle" fontSize={10}
        className="fill-slate-400">{day}</text>
      <text x={C} y={138} textAnchor="middle" fontSize={13} fontWeight="bold"
        className="fill-slate-100">{rows.length.toLocaleString("en-US")}</text>
      <text x={C} y={150} textAnchor="middle" fontSize={8}
        className="fill-slate-500">events (local)</text>
    </svg>
  );
}
