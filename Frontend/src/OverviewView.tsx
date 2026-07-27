// v0.1.3.0 D2 (dashboard) + D4 (Mermaid relationship graph). v0.1.6.0 C.1
// (RV1): the /api/stats fetch LIFTED to App (sidebar/groups need effort on
// the Changes view) — this view renders {stats, statsError} props; the R12
// trigger semantics live in App's [tab, statsNonce] effect. The graph
// lazy-loads mermaid on first open.

import { useEffect, useMemo, useRef, useState } from "react";
import { api, HistoryEntry, Repo, Task, TrackedEvent } from "./api";
import { fmtMinutes } from "./format";
import { CalendarHeatmap, RAMP, RampLegend, streakOf } from "./calendarHeatmap";
import { Skyline } from "./skyline";
import { IdentityCard } from "./identityCard";
import { ChurnMap } from "./churnMap";
import { TrophyCase } from "./trophies";
import { DayLanes } from "./dayLanes";
import { PunchCard } from "./punchCard";
import { StatsData, activityLine, eventsPerTaskBar, modeDoughnut } from "./charts";
import { renderBackbone } from "./mermaidGraph";
import { useReveal } from "./reveal";
import { prefersReducedMotion } from "./theme";

export function OverviewView ({ scope, tasks, uncommitted, repos, stats, statsError,
  onOpenFileStory, onOpenWrapped }: {
  scope: string | undefined; // undefined = ALL
  tasks: Task[];
  uncommitted: TrackedEvent[];
  repos: Repo[];
  // v0.1.6.0 D1 (C.1, RV1/RV10): the stats fetch lifted to App — this
  // view renders the props; the error message renders exactly where the
  // local error did before the lift.
  stats: StatsData | null;
  statsError: string;
  // v0.1.7.0 D1/D2 (B.1/B.2): coupling-row file names open the file story.
  onOpenFileStory?: (repo: string, file: string) => void;
  // v0.1.8.0 D3 (C.1): the header button lifts the open to App (the modal
  // home is App's call site — the FileStory precedent).
  onOpenWrapped?: () => void;
}) {

  const totalEvents = stats ? Object.values(stats.mode_counts).reduce((a, b) => a + b, 0) : 0;
  // v0.1.9.0 D1 (B.1): flat | city calendar toggle — DEFAULT city (the
  // release centerpiece), persisted under the notify.ts key convention.
  const [calView, setCalView] = useState<"city" | "flat">(
    () => (localStorage.getItem("katlab.calendarView") === "flat" ? "flat" : "city"));
  const pickCalView = (v: "city" | "flat") => {
    setCalView(v);
    localStorage.setItem("katlab.calendarView", v);
  };
  // Coupling rank display: rows arrive API-ranked (-shared, repo, a, b) —
  // make the ranking VISIBLE: #n numeral + ×N badge tinted by strength
  // (quartile of the max, the calendar/punch-card bucket rule; shared >= 1
  // so the zero-slate ramp step never applies).
  const couplingMax = Math.max(1, ...(stats?.file_coupling.map((c) => c.shared) ?? [1]));

  useReveal("overview", [stats]); // D5: stagger KPI cards + charts, once per session

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-3 flex items-center border-l-4 border-teal-500 pl-2 text-sm font-bold text-slate-200">
          <span>Overview {scope ? `— ${scope}` : "— ALL repos"}</span>
          {stats && onOpenWrapped && ( /* v0.1.8.0 D3 (C.1) */
            <button onClick={onOpenWrapped}
              className="ml-auto rounded bg-slate-800 px-2 py-0.5 text-xs font-normal text-slate-200 hover:bg-slate-700">
              Your week ✨
            </button>
          )}
        </h2>
        {statsError && <p className="text-sm text-rose-300">{statsError}</p>}
        {stats && <KpiRow stats={stats} repos={repos} uncommitted={uncommitted} />}
        {stats && totalEvents === 0 && (
          <p className="text-sm text-slate-400">No events captured yet — nothing to chart.</p>
        )}
        {stats && totalEvents > 0 && (
          <>
            <div className="grid gap-4 lg:grid-cols-3">
              <ChartCard title="Attribution health">
                <ChartCanvas make={(c) => modeDoughnut(c, stats)} dep={stats} />
              </ChartCard>
              <ChartCard title="Events per task (top 10)">
                <ChartCanvas make={(c) => eventsPerTaskBar(c, stats, scope === undefined)} dep={stats} />
              </ChartCard>
              <ChartCard title="Activity (14 days)">
                <ChartCanvas make={(c) => activityLine(c, stats)} dep={stats} />
              </ChartCard>
            </div>
            {/* v0.1.5.0 D2 (C.2): year calendar — below the charts, above the
                Mermaid map; behind the same totalEvents gate (RV6); the card
                body scrolls horizontally on narrow viewports (RV11). */}
            <div data-reveal className="mt-4 rounded border border-slate-700 bg-slate-900 p-3">
              <div className="mb-2 flex items-baseline text-xs font-semibold text-slate-300">
                <span>Activity calendar — last 365 days (UTC)</span>
                {/* v0.1.7.0 D4 (C.1): shown only when >= 2 (1-day = noise) */}
                {streakOf(stats.activity_calendar) >= 2 && (
                  <span className="ml-auto font-normal text-amber-300"
                    title="consecutive UTC days with captured activity">
                    🔥 {streakOf(stats.activity_calendar)}-day streak
                  </span>
                )}
                {/* v0.1.9.0 D1 (B.1): flat | city toggle — instant switch
                    (crossfades are for nav, not filters) */}
                <span role="group" aria-label="calendar view"
                  className={`${streakOf(stats.activity_calendar) >= 2 ? "ml-2" : "ml-auto"} flex gap-1 font-normal`}>
                  {(["flat", "city"] as const).map((v) => (
                    <button key={v} aria-pressed={calView === v}
                      onClick={() => pickCalView(v)}
                      className={`rounded px-1.5 py-0.5 text-[11px] ${
                        calView === v
                          ? "bg-teal-800 text-white"
                          : "bg-slate-800 text-slate-400 hover:bg-slate-700"}`}>
                      {v}
                    </button>
                  ))}
                </span>
              </div>
              <div className="overflow-x-auto">
                {calView === "city"
                  ? <Skyline calendar={stats.activity_calendar} />
                  : <CalendarHeatmap calendar={stats.activity_calendar} />}
              </div>
              {/* v0.1.9.0 B.1 (RV8): ONE legend home below whichever view */}
              <RampLegend />
            </div>
            {/* v0.1.8.0 D1 (B.1): day lanes — year -> day -> aggregates
                chronology; the stats prop is the RV9 freshness signal. */}
            <DayLanes scope={scope} stats={stats} />
            {/* v0.1.7.0 D1+D3 (B.1): coupling + punch card share a 2-col
                row (1-col on narrow); coupling card HIDDEN when empty (the
                corner-dot precedent); overflow-x-auto bodies (v0.1.5.0
                RV11 rule). */}
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {stats.file_coupling.length > 0 && (
                <div data-reveal className="rounded border border-slate-700 bg-slate-900 p-3">
                  <div className="mb-2 text-xs font-semibold text-slate-300">
                    Files that change together
                  </div>
                  <div className="space-y-1 overflow-x-auto text-xs">
                    {stats.file_coupling.map((c, i) => (
                      <div key={`${c.repo}|${c.file_a}|${c.file_b}`}
                        className="flex items-center gap-1.5 font-mono">
                        <span className="w-6 shrink-0 text-right text-[10px] text-slate-500">
                          #{i + 1}
                        </span>
                        {scope === undefined && (
                          <span className="shrink-0 text-[10px] text-slate-500">{c.repo}</span>
                        )}
                        <CouplingFile repo={c.repo} file={c.file_a} onOpen={onOpenFileStory} />
                        <span className="shrink-0 text-slate-500">↔</span>
                        <CouplingFile repo={c.repo} file={c.file_b} onOpen={onOpenFileStory} />
                        <span title={`changed together in ${c.shared} task${c.shared === 1 ? "" : "s"}`}
                          className="ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold text-white"
                          style={{ backgroundColor: RAMP[Math.min(4, Math.max(1, Math.ceil((c.shared / couplingMax) * 4)))] }}>
                          ×{c.shared}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div data-reveal className="rounded border border-slate-700 bg-slate-900 p-3">
                <div className="mb-2 text-xs font-semibold text-slate-300">
                  When do I work — activity by weekday and hour (local time)
                </div>
                <div className="overflow-x-auto">
                  <PunchCard matrix={stats.punch_card} />
                </div>
              </div>
            </div>
            {/* v0.1.10.0 D1+D2 (B.1/B.2): identity | churn map — the new
                2-col row below coupling/punch, above the trophy case; the
                churn card hides entirely at 0 rows (the coupling-card
                precedent) and the row collapses to identity alone. */}
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div data-reveal className="rounded border border-slate-700 bg-slate-900 p-3">
                <div className="overflow-x-auto">
                  <IdentityCard identity={stats.identity}
                    calendar={stats.activity_calendar} scope={scope} />
                </div>
              </div>
              {stats.file_churn.length > 0 && (
                <div data-reveal className="rounded border border-slate-700 bg-slate-900 p-3">
                  <div className="overflow-x-auto">
                    <ChurnMap churn={stats.file_churn}
                      onOpenFileStory={onOpenFileStory} />
                  </div>
                </div>
              )}
            </div>
            {/* v0.1.9.0 D2 (C.1): trophy case — below the 2-col row, above
                the Mermaid GraphPanel; scope-aware ranks (stats arrive
                server-scoped, Finisher filters the tasks prop client-side) */}
            <TrophyCase stats={stats} tasks={tasks} scope={scope} />
          </>
        )}
      </section>

      <GraphPanel tasks={tasks} uncommitted={uncommitted} repos={repos} />
    </div>
  );
}

// v0.1.7.0 D1 (B.1, RV4): each file name in a coupling row is its OWN
// button opening THAT file's story; middle-truncated, full path in title.
function CouplingFile ({ repo, file, onOpen }:
  { repo: string; file: string; onOpen?: (repo: string, file: string) => void }) {
  const name = file.length > 28 ? `${file.slice(0, 13)}…${file.slice(-14)}` : file;
  if (!onOpen) return <span className="truncate" title={file}>{name}</span>;
  return (
    <button onClick={() => onOpen(repo, file)} title={`${file} — open file story`}
      className="truncate text-sky-300 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">
      {name}
    </button>
  );
}

// D1 (v0.1.4.0): KPI row — the "at a glance" numbers above the charts.
// Sources are PINNED by the plan: /api/stats (total, auto-%, busiest), the
// UNCOMMITTED events prop (needs-pick — must equal the pick-queue N), and
// /api/repos (clean/total, uncommitted sum). Empty-safe: no NaN on total=0.
function KpiRow ({ stats, repos, uncommitted }:
  { stats: StatsData; repos: Repo[]; uncommitted: TrackedEvent[] }) {
  const total = Object.values(stats.mode_counts).reduce((a, b) => a + b, 0);
  const auto = (stats.mode_counts.B ?? 0) + (stats.mode_counts.A_SCOPED ?? 0) +
    (stats.mode_counts.A_GLOBAL ?? 0);
  const autoPct = total > 0 ? Math.round((auto / total) * 100) : 0;
  const needsPick = uncommitted.filter((e) => e.mode === "AMBIGUOUS" || e.mode === "UNKNOWN").length;
  const clean = repos.filter((r) => r.clean).length;
  const uncommittedSum = repos.reduce((n, r) => n + r.count, 0);
  // v0.1.6.0 D1 (C.1): today's effort = the calendar's LAST (UTC) day —
  // no extra stats key; label carries the (UTC) day-basis marker (RV18).
  const todayMinutes = stats.activity_calendar[stats.activity_calendar.length - 1]?.minutes ?? 0;
  const busiest = stats.events_per_task[0]; // backend sorts count DESC — [0] is the top
  return (
    <div className="mb-4 grid gap-3"
      style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
      <Kpi label="captured events" value={total} />
      <Kpi label="auto-attributed" value={autoPct} suffix="%" />
      <Kpi label="need a pick" value={needsPick} />
      <Kpi label="repos clean" value={clean} suffix={`/${repos.length}`} />
      <Kpi label="uncommitted changes" value={uncommittedSum} />
      <Kpi label="time today (UTC)" value={todayMinutes} format={fmtMinutes}
        tip="estimated from capture timestamps — 15-min gap rule" />
      {busiest && (
        <Kpi label="busiest task" value={busiest.count}
          sub={busiest.task_ref.split(" - ").pop()} />
      )}
    </div>
  );
}

// v0.1.6.0 D1 (C.1, RV8): optional format prop — count-up stays NUMERIC,
// the formatter renders each frame (effort KPI: fmtMinutes carries the ≈).
function Kpi ({ label, value, suffix, sub, format, tip }:
  { label: string; value: number; suffix?: string; sub?: string;
    format?: (n: number) => string; tip?: string }) {
  const shown = useCountUp(value);
  const heroRef = useRef<HTMLDivElement | null>(null);
  const fitRef = useRef<() => void>(() => {});

  // D2(b) (B.2): scale over-wide hero values via transform so huge counts
  // never break the auto-fit grid; re-fits on card resize and on every
  // count-up frame (the final value is the widest).
  useEffect(() => {
    const el = heroRef.current;
    if (!el) return;
    fitRef.current = () => {
      el.style.transform = "";
      const k = el.clientWidth / el.scrollWidth;
      if (k < 1) {
        el.style.transformOrigin = "left bottom";
        el.style.transform = `scale(${Math.max(0.5, k)})`;
      }
    };
    const ro = new ResizeObserver(() => fitRef.current());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => { fitRef.current(); }, [shown, suffix]);

  return (
    <div data-reveal className="rounded border border-slate-700 bg-slate-900 p-3" title={tip}>
      <div ref={heroRef}
        className="whitespace-nowrap font-mono text-4xl font-bold leading-none text-slate-100">
        {format ? format(shown) : shown.toLocaleString()}{suffix}
      </div>
      <div className="mt-1.5 truncate text-[11px] font-semibold uppercase tracking-wide text-slate-400"
        title={sub ? `${label} · ${sub}` : label}>
        {label}{sub ? ` · ${sub}` : ""}
      </div>
    </div>
  );
}

// D1 count-up: rAF ease-out from the previous value; SKIPPED entirely under
// prefers-reduced-motion (V5 — the final value renders immediately).
function useCountUp (target: number): number {
  // T5: start at 0 so the ENTRANCE animates 0→N (the point of a count-up);
  // under reduced motion start at the target — never a fake zero.
  const initial = prefersReducedMotion() ? target : 0;
  const [value, setValue] = useState(initial);
  const prev = useRef(initial);
  useEffect(() => {
    const start = prev.current;
    prev.current = target;
    if (prefersReducedMotion() || start === target) { setValue(target); return; }
    const t0 = performance.now();
    const DUR = 600;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / DUR);
      setValue(Math.round(start + (target - start) * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return value;
}

function ChartCard ({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div data-reveal className="rounded border border-slate-700 bg-slate-900 p-3">
      <div className="mb-2 text-xs font-semibold text-slate-300">{title}</div>
      <div className="h-56">{children}</div> {/* R18: explicit height */}
    </div>
  );
}

// R2: create in an effect, destroy on cleanup + before re-create on data change.
function ChartCanvas ({ make, dep }: { make: (c: HTMLCanvasElement) => { destroy(): void }; dep: unknown }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    const chart = make(ref.current);
    return () => chart.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dep]);
  return <canvas ref={ref} />;
}

// D4: per-plan Mermaid backbone. Lazy: mermaid loads only when a plan is picked.
function GraphPanel ({ tasks, uncommitted, repos }: {
  tasks: Task[]; uncommitted: TrackedEvent[]; repos: Repo[];
}) {
  const plans = useMemo(() => {
    const seen = new Map<string, { repo: string; plan_file: string }>();
    for (const t of tasks) seen.set(`${t.repo}|${t.plan_file}`, { repo: t.repo, plan_file: t.plan_file });
    return [...seen.values()];
  }, [tasks]);

  const [selected, setSelected] = useState("");
  const [svg, setSvg] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // D7: Esc closes the expanded overlay (click-out closes it too).
  // v0.1.5.0 D6 (D.2, RV3): while open, mark the body so the Ctrl+K
  // palette suppresses itself (single-overlay rule).
  useEffect(() => {
    if (!expanded) return;
    document.body.dataset.overlayOpen = "1";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setExpanded(false); };
    window.addEventListener("keydown", onKey);
    return () => {
      delete document.body.dataset.overlayOpen;
      window.removeEventListener("keydown", onKey);
    };
  }, [expanded]);

  useEffect(() => {
    if (!selected) { setSvg(""); setNote(""); return; }
    const [repo, planFile] = selected.split(" ");
    let alive = true;
    setBusy(true); setNote("");
    (async () => {
      try {
        const history: HistoryEntry[] = repos.some((r) => r.id === repo)
          ? await api.history(repo, 500, 0) : [];
        const { svg, meta } = await renderBackbone({
          planFile, tasks: tasks.filter((t) => t.repo === repo), history,
          uncommitted: uncommitted.filter((e) => e.repo_id === repo),
        });
        if (!alive) return;
        setSvg(svg);
        setNote(meta.capped > 0
          ? `showing ${meta.shown} of ${meta.total} tasks — see the sidebar for the rest`
          : meta.total === 0 ? "no tasks in this plan" : "");
      } catch (e) {
        if (alive) { setSvg(""); setNote(String(e)); }
      } finally {
        if (alive) setBusy(false);
      }
    })();
    return () => { alive = false; };
  }, [selected, tasks, uncommitted, repos]);

  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <h2 className="border-l-4 border-indigo-500 pl-2 text-sm font-bold text-slate-200">
          Relationship map
        </h2>
        <select value={selected} onChange={(e) => setSelected(e.target.value)}
          className="min-h-[28px] rounded bg-slate-800 px-2 py-1 text-xs">
          <option value="">— pick a plan —</option>
          {plans.map((p) => (
            <option key={`${p.repo}|${p.plan_file}`} value={`${p.repo} ${p.plan_file}`}>
              {p.repo} · {p.plan_file.split("/").pop()}
            </option>
          ))}
        </select>
        {busy && <span className="text-xs text-slate-400">rendering…</span>}
      </div>
      {note && <p className="mb-2 text-xs italic text-slate-400">{note}</p>}
      {svg ? (
        <>
          <GraphShell svg={svg} onExpand={() => setExpanded(true)} />
          {/* D7: one-line shape legend (user-approved 2026-07-17) */}
          <p className="mt-1 text-[11px] text-slate-400">
            ▭ task · ⬭ commit · ⬡ uncommitted (dashed edge = not committed yet)
          </p>
        </>
      ) : !busy && selected && !note && <p className="text-sm text-slate-400">No committed history for this plan yet.</p>}
      {!selected && <p className="text-sm text-slate-400">Pick a plan to see its task → commit map.</p>}
      {expanded && svg && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 p-4" onClick={() => setExpanded(false)}>
          <div className="mx-auto flex h-full w-full max-w-[1600px] flex-col"
            onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center">
              <span className="text-sm font-bold text-slate-200">Relationship map — expanded</span>
              <button onClick={() => setExpanded(false)}
                className="ml-auto min-h-[28px] rounded bg-slate-800 px-3 py-1 text-xs hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">
                ✕ close (Esc)
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <GraphShell svg={svg} tall />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// D7 (v0.1.4.0): the diagram shell — overflow-hidden viewport + canvas that
// hosts the SVG. Zoom = explicit px size on the SVG (clamp 0.08-6.5, step
// 14%); pan = canvas translate; ctrl|cmd+wheel zooms around the cursor;
// drag pans; keyboard +/-/0; the initial smart-FIT is the containment
// (D2 — NO CSS max-width clamp on the zoom-controlled SVG). Closure-based:
// all wiring lives in the effect and re-attaches on every new SVG, so the
// controls survive re-renders (V9). SVG injection via DOMParser + adoptNode
// instead of raw innerHTML (v-e 0.8.1 parsing fix).
function GraphShell ({ svg, tall, onExpand }:
  { svg: string; tall?: boolean; onExpand?: () => void }) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const ctl = useRef<{ zoomIn: () => void; zoomOut: () => void; fit: () => void } | null>(null);

  useEffect(() => {
    const viewport = viewportRef.current, canvas = canvasRef.current;
    if (!viewport || !canvas || !svg) return;
    const doc = new DOMParser().parseFromString(svg, "text/html");
    const parsedSvg = doc.body.querySelector("svg");
    if (!parsedSvg) return;
    canvas.replaceChildren(document.adoptNode(parsedSvg));
    const node = canvas.querySelector("svg") as SVGSVGElement | null;
    if (!node) return;
    node.removeAttribute("style"); // mermaid inlines max-width — the D2-forbidden clamp
    const vb = node.viewBox?.baseVal;
    let natW = (vb && vb.width) || Number(node.getAttribute("width")) || 0;
    let natH = (vb && vb.height) || Number(node.getAttribute("height")) || 0;
    if (!natW || !natH) {
      try { const b = node.getBBox(); natW = b.width || 600; natH = b.height || 400; }
      catch { natW = 600; natH = 400; }
    }

    const MIN = 0.08, MAX = 6.5, STEP = 0.14;
    let zoom = 1, panX = 0, panY = 0;
    const apply = () => {
      node.style.width = `${natW * zoom}px`;
      node.style.height = `${natH * zoom}px`;
      canvas.style.transform = `translate(${panX}px, ${panY}px)`;
    };
    const fit = () => {
      const r = viewport.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      const s = Math.min((r.width - 24) / natW, (r.height - 24) / natH);
      zoom = Math.min(1.5, Math.max(MIN, s)); // readability: never inflate tiny graphs
      panX = Math.max(12, (r.width - natW * zoom) / 2);
      panY = Math.max(12, (r.height - natH * zoom) / 2);
      apply();
    };
    const zoomAround = (factor: number, cx: number, cy: number) => {
      const next = Math.min(MAX, Math.max(MIN, zoom * factor));
      const k = next / zoom;
      panX = cx - (cx - panX) * k;
      panY = cy - (cy - panY) * k;
      zoom = next;
      apply();
    };
    const center = (): [number, number] => {
      const r = viewport.getBoundingClientRect();
      return [r.width / 2, r.height / 2];
    };
    ctl.current = {
      zoomIn: () => zoomAround(1 + STEP, ...center()),
      zoomOut: () => zoomAround(1 / (1 + STEP), ...center()),
      fit,
    };

    let dragging = false, sx = 0, sy = 0, spx = 0, spy = 0;
    const down = (e: PointerEvent) => {
      if (e.button !== 0) return; // T3: primary button only — a right-click
      // drag could get stuck when the context menu swallows pointerup
      dragging = true; sx = e.clientX; sy = e.clientY; spx = panX; spy = panY;
      viewport.setPointerCapture(e.pointerId);
      viewport.style.cursor = "grabbing";
    };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      panX = spx + (e.clientX - sx);
      panY = spy + (e.clientY - sy);
      apply();
    };
    const up = () => { dragging = false; viewport.style.cursor = ""; };
    const wheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return; // plain scroll keeps scrolling the page
      e.preventDefault();
      const r = viewport.getBoundingClientRect();
      zoomAround(e.deltaY < 0 ? 1 + STEP : 1 / (1 + STEP), e.clientX - r.left, e.clientY - r.top);
    };
    viewport.addEventListener("pointerdown", down);
    viewport.addEventListener("pointermove", move);
    viewport.addEventListener("pointerup", up);
    viewport.addEventListener("pointercancel", up);
    viewport.addEventListener("wheel", wheel, { passive: false });
    const ro = new ResizeObserver(() => fit());
    ro.observe(viewport); // fires once on observe -> the initial smart-fit
    return () => {
      ro.disconnect();
      viewport.removeEventListener("pointerdown", down);
      viewport.removeEventListener("pointermove", move);
      viewport.removeEventListener("pointerup", up);
      viewport.removeEventListener("pointercancel", up);
      viewport.removeEventListener("wheel", wheel);
      ctl.current = null;
    };
  }, [svg]);

  return (
    <div className={`relative ${tall ? "h-full" : ""}`}>
      <div className="absolute right-2 top-2 z-10 flex gap-1">
        <ShellBtn label="+" title="zoom in (+)" onClick={() => ctl.current?.zoomIn()} />
        <ShellBtn label="−" title="zoom out (-)" onClick={() => ctl.current?.zoomOut()} />
        <ShellBtn label="⤢" title="fit (0)" onClick={() => ctl.current?.fit()} />
        {onExpand && <ShellBtn label="⛶" title="expand" onClick={onExpand} />}
      </div>
      <div ref={viewportRef} tabIndex={0} role="img" aria-label="plan relationship graph"
        onKeyDown={(e) => {
          if (e.key === "+" || e.key === "=") { e.preventDefault(); ctl.current?.zoomIn(); }
          else if (e.key === "-") { e.preventDefault(); ctl.current?.zoomOut(); }
          else if (e.key === "0") { e.preventDefault(); ctl.current?.fit(); }
        }}
        className={`cursor-grab overflow-hidden rounded border border-slate-700 bg-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
          tall ? "h-full" : "h-96"}`}>
        <div ref={canvasRef} className="w-max will-change-transform" />
      </div>
    </div>
  );
}

function ShellBtn ({ label, title, onClick }:
  { label: string; title: string; onClick: () => void }) {
  return (
    <button title={title} onClick={onClick}
      className="min-h-[24px] min-w-[24px] rounded bg-slate-800/90 px-1.5 text-xs text-slate-200 hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">
      {label}
    </button>
  );
}
