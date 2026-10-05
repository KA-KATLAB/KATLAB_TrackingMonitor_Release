// v0.1.8.0 D1 (B.1): "what did my day look like" — local-day lanes, pure SVG
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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createActionDeadline, isAbortError } from "./api";
import type { ActionDeadline, TrackedEvent } from "./api";
import { DisclosureTable } from "./accessibleData";
import { RAMP, rampBucket } from "./calendarHeatmap";
import { loadDayEvents } from "./dayEvents";
import { advanceReplay, clampReplaySeconds, dayAxisTicks, dayBlockGeometry,
  dayReplayWindow, dayTimeText, elapsedDayFraction, replayPointer,
  replaySeekStep, replayTimeText, wallDayFraction } from "./dayReplay";
import { localDayLabel, shiftDayLabel } from "./dayWindow";
import { EventWindowNotice } from "./dialogStatus";
import { fmtMinutes } from "./format";
import { readPreference, writePreference } from "./preferences";
import { EFFORT_GAP_MAX_MIN, EFFORT_TAIL_MIN, eventSessionIdentity,
  MODE_BADGE, MODE_COLOR, sessionColor, usePrefersReducedMotion } from "./theme";
import { SectionHeading, Surface } from "./ui";

const LANE_H = 26, GAP_Y = 8, LEFT = 76, TOP = 18, HOUR_W = 34;
const WIDTH = LEFT + 24 * HOUR_W + 8;
const PLOT_W = 24 * HOUR_W;

interface Block { start: number; rawEnd: number; events: TrackedEvent[] }

interface LaneRequest {
  key: string;
  generation: number;
  controller: AbortController;
  action?: ActionDeadline;
}

export interface DayDensityBand {
  index: number;
  repoIds: string[];
  label: string;
  count: number;
}

export interface DayDensityCell {
  bandIndex: number;
  bin: number;
  count: number;
}

export interface DayDensityModel {
  enabled: boolean;
  repoCount: number;
  total: number;
  bands: DayDensityBand[];
  cells: DayDensityCell[];
  maxCell: number;
}

export function buildDayDensity (rows: readonly TrackedEvent[]): DayDensityModel {
  const repoIds = [...new Set(rows.map((row) => row.repo_id))]
    .sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
  const enabled = rows.length >= 1_000 || repoIds.length > 20;
  if (!enabled) {
    return { enabled: false, repoCount: repoIds.length, total: rows.length,
      bands: [], cells: [], maxCell: 0 };
  }
  const bandCount = Math.min(20, repoIds.length);
  const grouped = Array.from({ length: bandCount }, () => [] as string[]);
  const bandByRepo = new Map<string, number>();
  repoIds.forEach((repoId, ordinal) => {
    const bandIndex = repoIds.length <= 20
      ? ordinal
      : Math.floor((ordinal * 20) / repoIds.length);
    grouped[bandIndex].push(repoId);
    bandByRepo.set(repoId, bandIndex);
  });
  const counts = new Map<string, number>();
  for (const row of rows) {
    const timestamp = new Date(row.ts);
    const second = timestamp.getHours() * 3_600 + timestamp.getMinutes() * 60
      + timestamp.getSeconds();
    const bin = Math.min(47, Math.max(0, Math.floor(second / 1_800)));
    const bandIndex = bandByRepo.get(row.repo_id);
    if (bandIndex === undefined) continue;
    const key = JSON.stringify([bandIndex, bin]);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const cells: DayDensityCell[] = [];
  for (let bandIndex = 0; bandIndex < grouped.length; bandIndex += 1) {
    for (let bin = 0; bin < 48; bin += 1) {
      const count = counts.get(JSON.stringify([bandIndex, bin])) ?? 0;
      if (count > 0) cells.push({ bandIndex, bin, count });
    }
  }
  const bands = grouped.map((ids, index) => {
    const count = cells.filter((cell) => cell.bandIndex === index)
      .reduce((sum, cell) => sum + cell.count, 0);
    return {
      index,
      repoIds: ids,
      label: ids.length === 1 ? ids[0] : `${ids[0]} … ${ids[ids.length - 1]} (${ids.length} repos)`,
      count,
    };
  });
  return {
    enabled,
    repoCount: repoIds.length,
    total: rows.length,
    bands,
    cells,
    maxCell: Math.max(0, ...cells.map((cell) => cell.count)),
  };
}

export function DayLanes ({ scope, stats, day, speed, onDayChange, onSpeedChange,
  initialScopeAction = false, onInitialScopeActionConsumed, onStatus }:
  { scope: string | undefined; stats: unknown; day: string; speed: 1 | 2 | 4;
    onDayChange: (day: string) => void; onSpeedChange: (speed: 1 | 2 | 4) => void;
    initialScopeAction?: boolean; onInitialScopeActionConsumed?: () => void;
    onStatus: (message: string) => void }) {
  const today = localDayLabel(new Date());
  const reducedMotion = usePrefersReducedMotion();
  const requestKey = JSON.stringify([
    scope === undefined ? ["all"] : ["repo", scope],
    day,
  ]);
  // v0.1.13.0 D3 (B.3): lanes | clock — a second projection of the SAME
  // fetched rows (the flat|city recipe; persisted, default lanes).
  const [laneView, setLaneView] = useState<"lanes" | "clock">(
    () => (readPreference("katlab.dayView") === "clock" ? "clock" : "lanes"));
  const [preferenceNote, setPreferenceNote] = useState("");
  const pickLaneView = (v: "lanes" | "clock") => {
    setLaneView(v);
    const saved = writePreference("katlab.dayView", v);
    const message = saved ? ""
      : "Day view choice applies to this view only; browser storage could not save it.";
    setPreferenceNote(message);
    if (message) onStatus(message);
  };
  const [result, setResult] = useState<{
    key: string;
    rows: TrackedEvent[];
    limitReached: boolean;
  } | null>(null);
  const rows = result?.key === requestKey ? result.rows : null;
  const limitReached = result?.key === requestKey ? result.limitReached : false;
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const error = failure?.key === requestKey ? failure.message : "";
  const errorRef = useRef("");
  const [settledKey, setSettledKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [catchUpNonce, setCatchUpNonce] = useState(0);
  // v0.1.8.0 D2 (B.2): replay state — the RV9 fetch guard reads `replay`.
  const [replay, setReplay] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [vt, setVt] = useState(0); // virtual seconds into the local day
  const rafRef = useRef(0);
  const lastFrame = useRef(0);
  const mountedRef = useRef(false);
  const currentKeyRef = useRef("");
  const generationRef = useRef(0);
  const requestRef = useRef<LaneRequest | null>(null);
  const trailingRefreshRef = useRef(false);
  const pendingCatchUpRef = useRef(false);
  const pendingActionRef = useRef<{ key: string; action: ActionDeadline } | null>(null);
  const lastStatsRef = useRef(stats);
  const replayRef = useRef(replay);
  replayRef.current = replay;
  const isToday = day === today;

  const timeWindow = useMemo(() => dayReplayWindow(day), [day]);
  const dayStartMs = timeWindow?.startMs ?? 0;
  const daySeconds = timeWindow?.durationSeconds ?? 0;
  const replaySeconds = clampReplaySeconds(vt, daySeconds);
  const seekStep = replaySeekStep(daySeconds);
  const seekPosition = Math.floor(replaySeconds / seekStep) * seekStep;
  const sparseTicks = useMemo(() => timeWindow ? dayAxisTicks(timeWindow) : [], [timeWindow]);
  const previousDay = shiftDayLabel(day, -1);
  const nextDay = shiftDayLabel(day, 1);

  const cancelRequest = useCallback(() => {
    generationRef.current += 1;
    const request = requestRef.current;
    requestRef.current = null;
    request?.controller.abort();
    request?.action?.clear();
    setBusy(false);
  }, []);

  const startRequest = useCallback((requestScope: string | undefined,
    requestDay: string, key: string, owner: { controller: AbortController;
      action?: ActionDeadline }): void => {
    if (requestRef.current) {
      requestRef.current.controller.abort();
      requestRef.current.action?.clear();
    }
    const generation = ++generationRef.current;
    const request: LaneRequest = { key, generation, ...owner };
    requestRef.current = request;
    setBusy(true);
    void (async () => {
      try {
        const { rows: all, limitReached: reached } = await loadDayEvents(
          requestScope, requestDay, request.controller.signal,
        );
        if (!mountedRef.current || requestRef.current?.generation !== generation
            || currentKeyRef.current !== key || request.controller.signal.aborted) return;
        const recovered = !!errorRef.current;
        setResult({ key, rows: all, limitReached: reached });
        errorRef.current = "";
        setFailure(null);
        setSettledKey(key);
        if (recovered) onStatus("Activity day recovered.");
      } catch (errorValue) {
        if (!mountedRef.current || requestRef.current?.generation !== generation
            || currentKeyRef.current !== key) return;
        const timedOut = !!request.action
          && (request.action.didTimeout() || Date.now() >= request.action.deadlineAt);
        if (isAbortError(errorValue) && !timedOut) return;
        const message = timedOut
          ? "Activity day timed out after 10 seconds."
          : `Activity day failed: ${String(errorValue).slice(0, 120)}`;
        errorRef.current = message;
        setFailure({ key, message });
        setSettledKey(key);
        onStatus(`${message} Retry is available.`);
      } finally {
        request.action?.clear();
        if (!mountedRef.current || requestRef.current?.generation !== generation) return;
        requestRef.current = null;
        setBusy(false);
        const stillToday = requestDay === localDayLabel(new Date());
        if (trailingRefreshRef.current && currentKeyRef.current === key
            && stillToday && !replayRef.current) {
          trailingRefreshRef.current = false;
          pendingCatchUpRef.current = true;
          queueMicrotask(() => setCatchUpNonce((value) => value + 1));
        }
      }
    })();
  }, [onStatus]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      requestRef.current?.controller.abort();
      requestRef.current?.action?.clear();
      requestRef.current = null;
      pendingActionRef.current?.action.controller.abort();
      pendingActionRef.current?.action.clear();
      pendingActionRef.current = null;
      currentKeyRef.current = "";
    };
  }, []);

  useEffect(() => {
    const key = requestKey;
    const previousKey = currentKeyRef.current;
    const keyChanged = previousKey !== key;
    const statsChanged = lastStatsRef.current !== stats;
    lastStatsRef.current = stats;
    currentKeyRef.current = key;
    if (replay && !keyChanged) {
      pendingCatchUpRef.current = false;
      trailingRefreshRef.current = false;
      return;
    }
    if (keyChanged) {
      if (replay) {
        setReplay(false);
        setPlaying(false);
      }
      cancelRequest();
      trailingRefreshRef.current = false;
      pendingCatchUpRef.current = false;
      setResult(null);
      errorRef.current = "";
      setFailure(null);
      const pending = pendingActionRef.current;
      pendingActionRef.current = null;
      if (pending && pending.key !== key) {
        pending.action.controller.abort();
        pending.action.clear();
      }
      if (pending?.key === key) {
        startRequest(scope, day, key,
          { controller: pending.action.controller, action: pending.action });
      } else if (previousKey) {
        const action = createActionDeadline();
        startRequest(scope, day, key, { controller: action.controller, action });
      } else if (initialScopeAction) {
        onInitialScopeActionConsumed?.();
        const action = createActionDeadline();
        startRequest(scope, day, key, { controller: action.controller, action });
      } else {
        startRequest(scope, day, key, { controller: new AbortController() });
      }
      return;
    }
    if (pendingCatchUpRef.current) {
      pendingCatchUpRef.current = false;
      if (requestRef.current?.key === key) trailingRefreshRef.current = true;
      else startRequest(scope, day, key, { controller: new AbortController() });
      return;
    }
    if (!isToday || !statsChanged) return;
    if (requestRef.current?.key === key) trailingRefreshRef.current = true;
    else startRequest(scope, day, key, { controller: new AbortController() });
  }, [cancelRequest, catchUpNonce, day, initialScopeAction, isToday,
    onInitialScopeActionConsumed, replay, requestKey, scope, startRequest, stats]);

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
  const density = useMemo(() => rows ? buildDayDensity(rows) : null, [rows]);

  const x = (ms: number) => LEFT + (timeWindow ? elapsedDayFraction(timeWindow, ms) : 0) * PLOT_W;
  const tailMs = EFFORT_TAIL_MIN * 60_000;
  const visualLaneCount = density?.enabled ? density.bands.length : lanes.length;
  const plotTop = timeWindow?.variableDay && !density?.enabled ? 32 : TOP;
  const height = plotTop + Math.max(1, visualLaneCount) * (LANE_H + GAP_Y);
  const fmtLocal = (ms: number, full = false) => dayTimeText(ms, !!timeWindow?.variableDay, full);
  const cursorFraction = timeWindow
    ? density?.enabled ? wallDayFraction(timeWindow, replaySeconds) : replaySeconds / daySeconds
    : 0;
  const axisTicks = density?.enabled
    ? Array.from({ length: 9 }, (_, index) => ({ fraction: index / 8,
      label: String(index * 3).padStart(2, "0"), offset: "", title: "Local wall time" }))
    : sparseTicks;

  const exitReplay = () => { setReplay(false); setPlaying(false); };
  const shift = (delta: number) => {
    const targetDay = delta < 0 ? previousDay : nextDay;
    if (targetDay === null) return;
    exitReplay(); // RV9: a day switch exits replay FIRST (one day, one stage)
    const nextKey = JSON.stringify([
      scope === undefined ? ["all"] : ["repo", scope],
      targetDay,
    ]);
    cancelRequest();
    pendingActionRef.current?.action.controller.abort();
    pendingActionRef.current?.action.clear();
    pendingActionRef.current = { key: nextKey, action: createActionDeadline() };
    onDayChange(targetDay); // calendar labels remain navigable across skipped local dates
  };

  const retryDay = (): void => {
    if (requestRef.current || busy || replay) return;
    const action = createActionDeadline();
    startRequest(scope, day, requestKey, { controller: action.controller, action });
  };

  // The ONE rAF loop (RV15: cancelled by the effect cleanup — a view
  // switch unmounts mid-replay without leaking a running loop). Virtual
  // time accumulates CLAMPED dt (a hidden tab stops rAF; the first resumed
  // frame's huge dt is capped, so the clock effectively pauses — never
  // wall-anchored, never skips events). 1x = the whole day in 30s.
  useEffect(() => {
    if (!replay || !playing || daySeconds <= 0) return;
    lastFrame.current = performance.now();
    const step = (now: number) => {
      const dt = now - lastFrame.current;
      lastFrame.current = now;
      setVt((v) => advanceReplay(v, dt, daySeconds, speed));
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [replay, playing, speed, daySeconds]);
  useEffect(() => {
    if (!reducedMotion) return;
    cancelAnimationFrame(rafRef.current);
    setPlaying(false);
  }, [reducedMotion]);
  useEffect(() => { if (playing && vt >= daySeconds) setPlaying(false); }, [vt, playing, daySeconds]);

  // Consumed pointer via binary search over precomputed event seconds
  // (O(log n) per seek; the ts-ASC order is RV8's).
  const eventSecs = useMemo(
    () => (rows ?? []).map((e) => (new Date(e.ts).getTime() - dayStartMs) / 1000),
    [rows, dayStartMs]);
  const ptr = useMemo(() => replayPointer(eventSecs, replaySeconds), [eventSecs, replaySeconds]);
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
    if (!timeWindow) return;
    cancelRequest();
    trailingRefreshRef.current = false;
    pendingCatchUpRef.current = false;
    setReplay(true);
    setVt(0);
    setPlaying(!reducedMotion); // no auto-play under reduced motion
  };

  return (
    <Surface data-reveal className="mt-4"
      data-route-hydration-ready={settledKey === requestKey && (rows !== null || !!error)
        ? "true"
        : "false"}>
      <SectionHeading level={4} title="Your day"
        description={(
          <>
            Activity lanes (local time)
            {limitReached && <span className="ml-1 text-amber-300">· fetched window</span>}
            {busy && <span className="ml-1 text-ui-muted">· loading…</span>}
          </>
        )}
        actions={(
        <span className="flex flex-wrap items-center gap-1 font-normal">
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
                className={`rounded px-1.5 py-0.5 text-xs ${
                  laneView === v
                    ? "bg-teal-800 text-white"
                    : "bg-slate-800 text-slate-400 hover:bg-slate-700"} disabled:opacity-30 disabled:hover:bg-slate-800`}>
                {v}
              </button>
            ))}
          </span>
          {!replay && timeWindow && laneView === "lanes" && rows && rows.length > 0 && (
            <button onClick={armReplay}
              title="replay this day — the whole day in 30 seconds at 1x"
              className="mr-2 rounded bg-teal-700 px-2 py-0.5 text-xs font-bold text-white hover:bg-teal-800">
              ▶ Replay
            </button>
          )}
          <button onClick={() => shift(-1)} disabled={previousDay === null} aria-label="previous day"
            className="rounded px-1.5 py-0.5 text-slate-300 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-transparent">◀</button>
          <span className="font-mono">{day}</span>
          <button onClick={() => shift(1)} disabled={isToday || nextDay === null} aria-label="next day"
            className="rounded px-1.5 py-0.5 text-slate-300 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-transparent">▶</button>
        </span>
        )} />
      {preferenceNote && <p className="mb-2 text-xs text-amber-300">{preferenceNote}</p>}
      {timeWindow?.variableDay && (
        <p className="mb-2 text-xs text-slate-400">
          This local day lasts {daySeconds / 3_600} hours. Sparse lanes and replay use elapsed time.
          {" "}Density and clock combine repeated wall times; the density cursor can jump or revisit them.
        </p>
      )}
      {error && (
        <div data-route-hydration-failure tabIndex={-1}
          aria-label="Activity day load failure"
          className="mb-2 flex flex-wrap items-center gap-2 text-xs text-rose-300">
          <span>{error}</span>
          <button type="button" className="ui-control bg-ui-raised"
            disabled={busy || replay} aria-busy={busy} onClick={retryDay}>
            Retry day
          </button>
        </div>
      )}
      {rows && rows.length === 0 && !error && (
        <p className="text-xs text-slate-400">No captures this day.</p>
      )}
      {/* v0.1.13.0 D3 (B.3): the clock — same rows, polar projection; at
          0 rows NEITHER view renders an svg (RV12 — the shared empty
          paragraph above covers it, mirroring the lanes' gate). */}
      {timeWindow && rows && rows.length > 0 && laneView === "clock" && (
        <DayClock rows={rows} day={day} isToday={isToday} density={density} />
      )}
      {timeWindow && rows && rows.length > 0 && laneView === "lanes" && (
        <div className="ui-local-scroller overflow-x-auto" role="region"
          aria-label={`Activity lanes visualization for ${day}`} tabIndex={0}>
          <svg width={WIDTH} height={height} role="img"
            aria-label={density?.enabled
              ? `Activity density for ${day}: ${density.total} events in ${density.bands.length} repository bands and 48 half-hour bins`
              : `activity lanes for ${day} (local time)`}>
            {axisTicks.map((tick) => (
              <g key={tick.fraction}>
                <title>{tick.title}</title>
                <text x={LEFT + tick.fraction * PLOT_W} y={10}
                  textAnchor={tick.fraction === 1 ? "end" : tick.fraction === 0 ? "start" : "middle"}
                  className="fill-slate-400" fontSize={9}>
                  {tick.label}
                  {tick.offset && <tspan x={LEFT + tick.fraction * PLOT_W} dy={12}
                    fontSize={8}>{tick.offset}</tspan>}
                </text>
                <line x1={LEFT + tick.fraction * PLOT_W} y1={plotTop - 4} x2={LEFT + tick.fraction * PLOT_W}
                  y2={height} stroke="#334155" strokeWidth={0.5} />
              </g>
            ))}
            {density?.enabled ? <LaneDensityMarks density={density} /> : lanes.map(([repo, blocks], lane) => {
              const yTop = plotTop + lane * (LANE_H + GAP_Y);
              return (
                <g key={repo}>
                  <text x={0} y={yTop + LANE_H / 2 + 3} className="fill-slate-400"
                    fontSize={10}>
                    {repo.length > 11 ? `${repo.slice(0, 10)}…` : repo}
                  </text>
                  {blocks.map((b, i) => {
                    const minutes = Math.round((b.rawEnd - b.start + tailMs) / 60_000);
                    const geometry = dayBlockGeometry(timeWindow, b.start, b.rawEnd, tailMs, PLOT_W);
                    return (
                      <g key={i}>
                        <title>
                          {`${fmtLocal(b.start)} to ${fmtLocal(geometry.endMs)} (local) — ${b.events.length} event${b.events.length === 1 ? "" : "s"} · estimated effort ${fmtMinutes(minutes)}${geometry.clipped ? "; visual tail clipped at day end" : ""}`}
                        </title>
                        <rect x={LEFT + geometry.left} y={yTop}
                          width={geometry.width}
                          height={LANE_H} rx={3} fill="#14b8a6" opacity={0.35} />
                        {b.events.map((e) => {
                          const identity = eventSessionIdentity(e);
                          return (
                            <circle key={e.id} cx={x(new Date(e.ts).getTime())}
                              cy={yTop + LANE_H / 2} r={2.5}
                              fill={identity
                                ? sessionColor(identity.provider, identity.sessionId)
                                : "#94a3b8"}>
                              <title>{`${fmtLocal(new Date(e.ts).getTime(), true)} — ${e.file}`}</title>
                            </circle>
                          );
                        })}
                      </g>
                    );
                  })}
                </g>
              );
            })}
            {replay && ( /* D2: the cursor sweeps OVER the lanes — painted
                LAST (CFT-1: SVG paint order; under the semi-transparent
                blocks it read dimmed at exactly the moments it matters) */
              <line x1={LEFT + cursorFraction * PLOT_W} y1={plotTop - 6}
                x2={LEFT + cursorFraction * PLOT_W} y2={height}
                stroke="#f59e0b" strokeWidth={1.5} />
            )}
          </svg>
        </div>
      )}
      {replay && timeWindow && rows && (
        <div className="mt-2 space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button onClick={() => {
              if (replaySeconds >= daySeconds) { setVt(0); setPlaying(true); }
              else setPlaying(!playing);
            }}
              aria-label={playing ? "pause replay" : replaySeconds >= daySeconds ? "replay day again" : "play replay"}
              className="rounded bg-slate-700 px-2 py-0.5 font-bold text-white hover:bg-slate-600">
              {playing ? "⏸" : "▶"}
            </button>
            {[1, 2, 4].map((s) => (
              <button key={s} onClick={() => onSpeedChange(s as 1 | 2 | 4)}
                className={`rounded px-1.5 py-0.5 text-xs ${speed === s
                  ? "bg-teal-700 font-bold text-white" : "text-slate-300 hover:bg-slate-700"}`}>
                {s}x
              </button>
            ))}
            <label className="flex min-w-32 flex-1 items-center gap-2 text-slate-400">
              <span className="shrink-0">Position</span>
              <input type="range" min={0} max={daySeconds} step={seekStep}
                value={seekPosition}
                aria-valuetext={replayTimeText(timeWindow, seekPosition, true)}
                onChange={(e) => setVt(clampReplaySeconds(Number(e.target.value), daySeconds))}
                className="min-w-24 flex-1 accent-teal-500" />
            </label>
            <span className="shrink-0 font-mono text-slate-400">
              {replayTimeText(timeWindow, replaySeconds)}
            </span>
            <span className="shrink-0 text-slate-400"
              title="estimated from capture timestamps — 15-min gap rule">
              {ptr} event{ptr === 1 ? "" : "s"} · {fmtMinutes(replayedMinutes)}
            </span>
            <button type="button" onClick={exitReplay} aria-label="exit replay"
              className="text-slate-400 hover:text-white">✕</button>
          </div>
          <div className="flex min-h-6 flex-wrap gap-1.5">
            {feed.map((e) => (
              <span key={e.id}
                className="chip-pop flex items-center gap-1 rounded bg-slate-800 px-1.5 py-0.5 text-xs">
                <span className="font-mono text-slate-400">
                  {fmtLocal(new Date(e.ts).getTime())}
                </span>
                {scope === undefined && (
                  <span className="text-xs text-slate-400">{e.repo_id}</span>
                )}
                <span className="max-w-40 truncate font-mono" title={e.file}>{e.file}</span>
                <span className="rounded px-1 text-xs font-bold text-white"
                  style={{ backgroundColor: MODE_COLOR[e.mode], color: MODE_BADGE[e.mode].foreground }}>
                  {MODE_BADGE[e.mode].label}
                </span>
              </span>
            ))}
            {feed.length === 0 && (
              <span className="text-xs text-slate-400">
                — scrub or play to see the day unfold —
              </span>
            )}
          </div>
        </div>
      )}
      {rows && (
        <DisclosureTable
          label={`Activity events for ${day}`}
          summary={density?.enabled
            ? `${density.total.toLocaleString("en-US")} exact events are aggregated into `
              + `${density.bands.length} repository bands and 48 half-hour bins; the rows below are the complete fetched drill-down.`
            : `${rows.length.toLocaleString("en-US")} exact fetched event`
              + `${rows.length === 1 ? "" : "s"} for this local day.`}
          rows={rows}
          rowKey={(row) => String(row.id)}
          identity={["day-events", scope === undefined ? "all" : "repo", scope, day]}
          emptyMessage="No events were fetched for this local day."
          columns={[
            { key: "time", label: "Captured (local)", render: (row) => fmtLocal(new Date(row.ts).getTime(), true),
              cellClassName: "whitespace-nowrap font-mono" },
            { key: "repo", label: "Repository", render: (row) => row.repo_id,
              cellClassName: "break-all" },
            { key: "file", label: "File", render: (row) => row.file,
              cellClassName: "break-all font-mono" },
            { key: "mode", label: "Attribution", render: (row) => MODE_BADGE[row.mode].label },
            { key: "task", label: "Task", render: (row) => row.task_ref ?? "Unresolved",
              cellClassName: "break-words" },
          ]}
          className="mt-3 border-t border-slate-800 pt-3"
        />
      )}
      {rows && <EventWindowNotice limitReached={limitReached} count={rows.length} />}
      {!rows && busy && <p className="text-xs text-slate-400">Loading…</p>}
    </Surface>
  );
}

function LaneDensityMarks ({ density }: { density: DayDensityModel }): JSX.Element {
  const cellWidth = HOUR_W / 2;
  return (
    <>
      {density.bands.map((band) => {
        const yTop = TOP + band.index * (LANE_H + GAP_Y);
        const shortLabel = band.label.length > 11 ? `${band.label.slice(0, 10)}…` : band.label;
        return (
          <g key={band.index}>
            <title>{`${band.label} — ${band.count} events`}</title>
            <text x={0} y={yTop + LANE_H / 2 + 3} className="fill-slate-400"
              fontSize={9}>{shortLabel}</text>
          </g>
        );
      })}
      {density.cells.map((cell) => {
        const band = density.bands[cell.bandIndex];
        const startMinute = cell.bin * 30;
        const startHour = Math.floor(startMinute / 60);
        const startMin = startMinute % 60;
        const endMinute = startMinute + 30;
        const endHour = Math.floor(endMinute / 60) % 24;
        const endMin = endMinute % 60;
        const label = `${band.label}, ${String(startHour).padStart(2, "0")}:`+
          `${String(startMin).padStart(2, "0")}-${String(endHour).padStart(2, "0")}:`+
          `${String(endMin).padStart(2, "0")} local — ${cell.count} event${cell.count === 1 ? "" : "s"}`;
        const x = LEFT + cell.bin * cellWidth;
        const y = TOP + cell.bandIndex * (LANE_H + GAP_Y);
        return (
          <g key={JSON.stringify([cell.bandIndex, cell.bin])} aria-label={label}>
            <title>{label}</title>
            <rect x={x + 0.5} y={y} width={cellWidth - 1} height={LANE_H}
              rx={2} fill={RAMP[rampBucket(cell.count, density.maxCell)]} />
            <text x={x + cellWidth / 2} y={y + LANE_H / 2 + 2.5}
              textAnchor="middle" fontSize={6.5} fill="#f8fafc" aria-hidden="true">
              {cell.count}
            </text>
          </g>
        );
      })}
    </>
  );
}

// v0.1.13.0 D3 (B.3): the day as a dial — 24 LOCAL-hour wedges from the
// SAME fetched rows (zero new fetches); midnight at TOP, clockwise; outer
// radius 26 + sqrt(count/dayMax) * 84 (the skyline area-honesty rule),
// inner 24; fills = the shared RAMP bucket vs the day max; zero hours are
// hairline ticks. The live hand renders only when the picked day IS today
// and is computed AT RENDER — the P8 60s tick moves it with no new timer.
function DayClock ({ rows, day, isToday, density }:
  { rows: TrackedEvent[]; day: string; isToday: boolean;
    density: DayDensityModel | null }) {
  if (density?.enabled) {
    return <DayDensityClock density={density} day={day} isToday={isToday} />;
  }
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

function DayDensityClock ({ density, day, isToday }: {
  density: DayDensityModel;
  day: string;
  isToday: boolean;
}): JSX.Element {
  const center = 130;
  const inner = 27;
  const outer = 110;
  const thickness = (outer - inner) / Math.max(1, density.bands.length);
  const point = (radius: number, degrees: number): [number, number] => [
    center + radius * Math.cos((degrees - 90) * Math.PI / 180),
    center + radius * Math.sin((degrees - 90) * Math.PI / 180),
  ];
  const number = (value: number) => value.toFixed(1);
  const pathFor = (bandIndex: number, bin: number): string => {
    const radiusIn = inner + bandIndex * thickness;
    const radiusOut = radiusIn + thickness;
    const angleStart = bin * 7.5 + 0.25;
    const angleEnd = (bin + 1) * 7.5 - 0.25;
    const [x0, y0] = point(radiusOut, angleStart);
    const [x1, y1] = point(radiusOut, angleEnd);
    const [x2, y2] = point(radiusIn, angleEnd);
    const [x3, y3] = point(radiusIn, angleStart);
    return `M ${number(x0)} ${number(y0)} A ${number(radiusOut)} ${number(radiusOut)} 0 0 1 `
      + `${number(x1)} ${number(y1)} L ${number(x2)} ${number(y2)} A `
      + `${number(radiusIn)} ${number(radiusIn)} 0 0 0 ${number(x3)} ${number(y3)} Z`;
  };
  const now = new Date();
  const handDegrees = (now.getHours() + now.getMinutes() / 60) * 15;
  const [handX, handY] = point(114, handDegrees);
  return (
    <div className="ui-local-scroller overflow-x-auto" role="region"
      aria-label={`Activity density clock for ${day}`} tabIndex={0}>
      <svg viewBox="0 0 260 260" width={260} height={260} className="mx-auto block"
        role="img" aria-label={`${density.total} events across ${density.bands.length} repository bands and 48 half-hour local-time bins`}>
        {density.cells.map((cell) => {
          const band = density.bands[cell.bandIndex];
          const minute = cell.bin * 30;
          const hour = Math.floor(minute / 60);
          const minutePart = minute % 60;
          const label = `${band.label}, ${String(hour).padStart(2, "0")}:`+
            `${String(minutePart).padStart(2, "0")} local — ${cell.count} event`+
            `${cell.count === 1 ? "" : "s"}`;
          return (
            <path key={JSON.stringify([cell.bandIndex, cell.bin])}
              d={pathFor(cell.bandIndex, cell.bin)}
              fill={RAMP[rampBucket(cell.count, density.maxCell)]}
              aria-label={label}>
              <title>{label}</title>
            </path>
          );
        })}
        {[0, 6, 12, 18].map((hour) => {
          const [x, y] = point(119, hour * 15);
          return <text key={hour} x={number(x)} y={number(y + 3)} textAnchor="middle"
            fontSize={9} className="fill-slate-500">{hour}</text>;
        })}
        {isToday && (
          <g aria-hidden="true">
            <line x1={center} y1={center} x2={number(handX)} y2={number(handY)}
              stroke="#14b8a6" strokeWidth={1.5} />
            <circle cx={center} cy={center} r={2} fill="#14b8a6" />
          </g>
        )}
        <text x={center} y={122} textAnchor="middle" fontSize={10}
          className="fill-slate-400">density</text>
        <text x={center} y={138} textAnchor="middle" fontSize={13} fontWeight="bold"
          className="fill-slate-100">{density.total.toLocaleString("en-US")}</text>
        <text x={center} y={150} textAnchor="middle" fontSize={8}
          className="fill-slate-500">events (local)</text>
      </svg>
    </div>
  );
}
