import { CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, HistoryEntry, Repo, Task, TrackedEvent } from "./api";
// v0.1.9.0 D4 (B.2): the gitGraph renderer — mermaid itself stays a dynamic
// import INSIDE this module (R9), loading only on first graph expand.
import { renderGitGraph } from "./mermaidGraph";
import { buildFileTree } from "./fileTree";
import { CommandPalette, PaletteEntry } from "./CommandPalette";
import { exportDigest } from "./digest";
import { FileStory } from "./FileStory";
import { SessionTimeline } from "./SessionTimeline";
import { WrappedCard } from "./WrappedCard";
import { fmtAge, fmtMinutes, fmtRel, fmtTs } from "./format";
import { notifyPickNeeded, notifyStatusChange, notifyWanted, notifyWarning, setNotifyEnabled } from "./notify";
import { StatsData } from "./charts";
import { useReveal } from "./reveal";
import { EFFORT_GAP_MAX_MIN, MODE_BADGE, MODE_COLOR, SWEPT_COLOR, prefersReducedMotion, sessionColor, withViewTransition } from "./theme";
import { ComboMeter } from "./comboMeter";
import { connectWs } from "./ws";
import { OverviewView } from "./OverviewView";

const PAGE = 500; // F38 pagination page size
// v0.1.9.0 D3 (C.2): combo milestones — crossing one exactly fires the pop.
const COMBO_MILESTONES = new Set([5, 10, 25, 50, 100, 250]);

type Tab = string | "ALL";
type View = "changes" | "history" | "overview"; // v0.1.3.0 D2

export default function App () {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<TrackedEvent[]>([]);
  const [tab, setTab] = useState<Tab>("ALL"); // F31: tabs dynamic from /api/repos
  const [view, setView] = useState<View>("changes");
  const [dismissedWarnings, setDismissedWarnings] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string>("");
  const [showLegend, setShowLegend] = useState(false);
  const [taskFilter, setTaskFilter] = useState<string | null>(null); // X4: "repo|task_ref"
  const [sessionFilter, setSessionFilter] = useState<string | null>(null); // v0.1.5.0 D1 (RV3: App-level)
  const [timelineSession, setTimelineSession] = useState<string | null>(null); // v0.1.6.0 D3 (C.3)
  const [fileStory, setFileStory] = useState<{ repo: string; file: string } | null>(null); // v0.1.7.0 D2 (B.2)
  // v0.1.7.0 D6 (C.3): celebration channels — toasts keyed BY REPO (a new
  // transition replaces, never stacks junk); the burst nonce is consumed by
  // that repo's CLEAN ✓ chip in the StatusBar.
  const [toasts, setToasts] = useState<{ repo: string; n: number }[]>([]);
  const [burst, setBurst] = useState<{ repo: string; n: number } | null>(null);
  const celebrationN = useRef(0);
  // v0.1.9.0 D3 (C.2): live combo — count + lastMs in REFS (RV7: the WS
  // handler closes over mount-time state), count MIRRORED to state by value
  // for rendering; comboN is the milestone-burst nonce (celebrationN stays
  // the celebration's own counter — never shared).
  const comboCountRef = useRef(0);
  const comboLastMsRef = useRef(0);
  const comboN = useRef(0);
  const [comboCount, setComboCount] = useState(0);
  const [comboBurst, setComboBurst] = useState<number | null>(null);
  // v0.1.7.0 CFT-3: STABLE onClose identities for the two overlay modals —
  // an inline arrow (new identity every App render) re-ran the modals'
  // [onClose]-dep'd overlay effect on every 60s tick / WS sync while open;
  // its cleanup fires prevFocus.focus(), yanking a keyboard user's
  // in-modal focus to the background. Pinned -> effect runs once per open.
  const closeTimeline = useCallback(() => setTimelineSession(null), []);
  const closeFileStory = useCallback(() => setFileStory(null), []);
  // v0.1.8.0 D3 (C.1): the wrapped story modal (CFT-3-stable onClose).
  const [wrappedOpen, setWrappedOpen] = useState(false);
  const closeWrapped = useCallback(() => setWrappedOpen(false), []);
  // v0.1.5.0 D6 (D.2, RV3): groupMode LIFTED from ChangesView so the
  // palette's tree-toggle action can reach it (same behavior, prop-drilled).
  const [groupMode, setGroupMode] = useState<"task" | "folder">("task");
  const [, setTick] = useState(0);
  const [statsNonce, setStatsNonce] = useState(0); // R12: bumped only on a real sync
  // v0.1.6.0 D1 (C.1, RV1): the stats fetch LIVES HERE now — lifted from
  // OverviewView (unmounted on Changes, where sidebar/groups need effort).
  // [tab, statsNonce] keeps the R12 trigger semantics exactly (scope
  // change + real sync only, never ticks/filters).
  const [stats, setStats] = useState<StatsData | null>(null);
  const [statsError, setStatsError] = useState("");
  useEffect(() => {
    let alive = true;
    api.stats(tab === "ALL" ? undefined : tab)
      .then((s) => { if (alive) { setStats(s); setStatsError(""); } })
      .catch((e) => alive && setStatsError(String(e)));
    return () => { alive = false; };
  }, [tab, statsNonce]);
  // v0.1.6.0 D1: effort lookup for sidebar cards + task-group headers.
  const effortByTask = useMemo(() => {
    const m = new Map<string, { minutes: number; sessions: number }>();
    for (const e of stats?.effort_per_task ?? []) {
      m.set(`${e.repo}|${e.task_ref}`, { minutes: e.minutes, sessions: e.sessions });
    }
    return m;
  }, [stats]);

  const sync = useCallback(async () => {
    try {
      const [r, t, e] = await Promise.all([
        api.repos(),
        api.tasks(),
        api.events({ uncommitted: true, limit: PAGE }),
      ]);
      setRepos(r);
      setTasks(t);
      setEvents(e);
      setStatsNonce((n) => n + 1); // R12: Overview refetches on real syncs, not ticks/filters
      setError("");
    } catch (exc) {
      setError(String(exc));
    }
  }, []);

  useEffect(() => {
    // CFT-9: debounce sync bursts - each sync is 3 REST calls incl. git
    // status per repo; a multi-file Claude turn pushes many WS messages.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const debouncedSync = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void sync(), 300);
    };
    // WS live push; onSync re-snapshots on every (re)connect (F29).
    const close = connectWs((msg) => {
      if (msg.type === "event_resolved" || msg.type === "commit_detected") debouncedSync();
      if (msg.type === "task_updated" || msg.type === "warning") debouncedSync();
      if (msg.type === "event_resolved") {
        // v0.1.9.0 D3 (C.2): combo — ONE increment per live message, all in
        // the handler body (RV7: refs for fresh math, state mirror by value;
        // no updater-function side effects). Burst fires only on an exact
        // milestone crossing, never hidden / reduced-motion (D6 rules), and
        // clears after ~900ms with the nonce-compare guard (RV11).
        const nowMs = Date.now();
        const chained = nowMs - comboLastMsRef.current <= EFFORT_GAP_MAX_MIN * 60_000;
        const next = chained ? comboCountRef.current + 1 : 1;
        comboCountRef.current = next;
        comboLastMsRef.current = nowMs;
        setComboCount(next);
        if (COMBO_MILESTONES.has(next) && !document.hidden && !prefersReducedMotion()) {
          const n = ++comboN.current;
          setComboBurst(n);
          window.setTimeout(() => setComboBurst((b) => (b === n ? null : b)), 900);
        }
        // v0.1.5.0 D3 (C.3): a live queue-lander arms the guard banner —
        // rendered only while the repo is actually violating (see render).
        const d = msg.data as { repo_id?: string; mode?: string };
        if (d.repo_id && (d.mode === "UNKNOWN" || d.mode === "AMBIGUOUS")) {
          setGuardEvent({ repo: d.repo_id });
          // D5 trigger (1): coalesced pick-needed notification (hidden tab only)
          const repo = d.repo_id;
          notifyPickNeeded(repo, () => navigateToRepo(repo, true));
        }
      }
      if (msg.type === "repo_status_changed") {
        const d = msg.data as { repo: string; clean: boolean; count: number; offline: boolean };
        // D5 trigger (2): dirty->CLEAN — transition map lives in notify.ts
        // (RV9: never notify from inside the setRepos updater below).
        const transitioned = notifyStatusChange(d.repo, d.clean, () => navigateToRepo(d.repo, false));
        if (transitioned) {
          // v0.1.7.0 D6 (C.3), the RV1 channel matrix: TOAST always (the
          // durable record); BURST only while the tab is visible.
          const n = ++celebrationN.current;
          setToasts((prev) => [...prev.filter((t) => t.repo !== d.repo), { repo: d.repo, n }]);
          if (!document.hidden) {
            setBurst({ repo: d.repo, n });
            window.setTimeout(() => setBurst((b) => (b && b.n === n ? null : b)), 900);
          }
        }
        setRepos((prev) => prev.map((r) => (r.id === d.repo ? { ...r, ...d } : r)));
      }
      if (msg.type === "warning") {
        // D5 trigger (3): server warning (hidden tab only)
        const d = msg.data as { repo?: string; message?: string };
        if (d.repo && d.message) {
          const repo = d.repo;
          notifyWarning(repo, d.message, () => navigateToRepo(repo, false));
        }
      }
    }, sync);
    return () => {
      clearTimeout(timer);
      close();
    };
  }, [sync]);

  useEffect(() => {
    // P8: relative times (and the heartbeat chip) must never freeze on an
    // idle UI - re-render once a minute even without WS traffic.
    const timer = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(timer);
  }, []);

  // v0.1.7.0 D6 (C.3): toast dismissal — its ✕ or ANY click outside the
  // toast stack (the AttentionBell click-out precedent). Toasts are NOT
  // overlays: no data-overlay-open, Ctrl+K stays available while they wait.
  const hasToasts = toasts.length > 0;
  useEffect(() => {
    if (!hasToasts) return;
    const onDown = (e: PointerEvent) => {
      if (!(e.target as Element | null)?.closest?.("[data-toast-stack]")) setToasts([]);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [hasToasts]);

  useEffect(() => {
    // X4 + v0.1.5.0 RV14/RV18: REPO-AWARE reset — keep the task filter when
    // its embedded repo (key prefix) matches the destination tab (a palette
    // cross-tab pick sets tab+filter together and must survive the effect;
    // ALL -> own-repo manual switches now keep it too — expected, V12).
    setTaskFilter((prev) => (prev && prev.split("|")[0] === tab ? prev : null));
    // RV8: sessions are not repo-scoped — the session filter always resets.
    setSessionFilter(null);
  }, [tab]);

  // v0.1.5.0 D3 (C.3): per-repo discipline state — armed = repo has parsed
  // tasks (zero-task repos never nag); violation = in-progress count != 1.
  // Derived at render time from live tasks, so a task_updated re-sync
  // clears the chip/banner the moment statuses are fixed.
  const taskStats = useMemo(() => {
    const m = new Map<string, { total: number; inProgress: number }>();
    for (const t of tasks) {
      const s = m.get(t.repo) ?? { total: 0, inProgress: 0 };
      s.total += 1;
      if (t.status === "in-progress") s.inProgress += 1;
      m.set(t.repo, s);
    }
    return m;
  }, [tasks]);
  const violationOf = useCallback((repoId: string): number | null => {
    const s = taskStats.get(repoId);
    if (!s || s.total === 0) return null; // not armed
    return s.inProgress === 1 ? null : s.inProgress;
  }, [taskStats]);
  // Banner slot (D3): set by a live queue-lander WS event on a violating
  // repo; dismiss hides it; the next qualifying event re-arms it. Rendered
  // conditionally on the CURRENT violation, so fixing the plan clears it.
  const [guardEvent, setGuardEvent] = useState<{ repo: string } | null>(null);

  // v0.1.5.0 D4 (C.4) + RV23: cross-view navigation with a DEFERRED scroll —
  // the sec-pick anchor exists only after ChangesView mounts. v0.1.5.0 CFT-5
  // (bare CFT-N elsewhere in this file = the v0.1.0.0 loop): pending
  // scroll is STATE, not a ref — a ref mutation never re-renders, so when
  // every other setState in the path bails out (palette jump while already
  // on Changes; notification click while already on that repo's tab) the
  // ref stayed armed and fired as a phantom scroll on the next unrelated
  // render. Consumed + ALWAYS cleared by the effect (no phantom scroll
  // later when the anchor is absent).
  const [panelOpen, setPanelOpen] = useState(false);
  const [pendingScroll, setPendingScroll] = useState<string | null>(null);
  useEffect(() => {
    if (view !== "changes" || !pendingScroll) return;
    const id = pendingScroll;
    setPendingScroll(null);
    requestAnimationFrame(() =>
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [view, pendingScroll]);
  const navigateToRepo = useCallback((repoId: string, scrollToPicks: boolean) => {
    // v0.1.7.0 D7 (C.4): crossfade the jump (bell rows + notification clicks)
    withViewTransition(() => {
      setTab(repoId);
      setView("changes");
      if (scrollToPicks) setPendingScroll("sec-pick");
      setPanelOpen(false);
    });
  }, []);

  // v0.1.5.0 D5 (D.1): OS-notification toggle — lives in the attention
  // panel FOOTER (user 2026-07-19: one bell in the header). RV21: any
  // non-granted permission snaps it back off with an inline note.
  const [notifyOn, setNotifyOn] = useState(notifyWanted());
  const [notifyNote, setNotifyNote] = useState("");
  const toggleNotify = useCallback(async () => {
    const next = !notifyOn;
    const granted = await setNotifyEnabled(next);
    setNotifyOn(granted);
    setNotifyNote(next && !granted ? "permission denied/dismissed — alerts stay off" : "");
  }, [notifyOn]);

  // v0.1.5.0 D7 (D.3): digest export — a fetch failure ABORTS with an
  // inline note next to the button; nothing downloads (RV20).
  const [digestNote, setDigestNote] = useState("");
  const doDigest = useCallback(async () => {
    setDigestNote("exporting…");
    const scope = tab === "ALL" ? undefined : tab;
    try {
      await exportDigest(scope,
        scope ? repos.filter((r) => r.id === scope) : repos,
        scope ? tasks.filter((t) => t.repo === scope) : tasks,
        scope ? events.filter((e) => e.repo_id === scope) : events);
      setDigestNote("");
    } catch (exc) {
      setDigestNote(`digest failed (${String(exc).slice(0, 60)}) — nothing downloaded`);
    }
  }, [tab, repos, tasks, events]);

  const visibleRepos = tab === "ALL" ? repos : repos.filter((r) => r.id === tab);
  const visibleTasks = tab === "ALL" ? tasks : tasks.filter((t) => t.repo === tab);
  const visibleEvents = tab === "ALL" ? events : events.filter((e) => e.repo_id === tab);

  // v0.1.5.0 D6 (D.2): palette entries — views, ALL+repo tabs, tasks (X4
  // filter + tab switch, RV14), actions. The tree toggle also lands on
  // Changes and the alerts toggle opens the panel (RV29 visible-effect);
  // "jump to pick queue" uses the RV23 deferred scroll.
  const paletteEntries: PaletteEntry[] = [
    { section: "Views", label: "Changes", run: () => setView("changes") },
    { section: "Views", label: "Overview", run: () => setView("overview") },
    { section: "Views", label: "History", run: () => setView("history") },
    { section: "Repos", label: "ALL repos", run: () => setTab("ALL") },
    ...repos.map((r): PaletteEntry => ({
      section: "Repos", label: r.id, hint: r.clean ? "CLEAN ✓" : `${r.count} uncommitted`,
      run: () => setTab(r.id),
    })),
    ...tasks.map((t): PaletteEntry => ({
      section: "Tasks", label: `${t.task_ref} ${t.title}`, hint: t.repo,
      run: () => { // RV14: tab + filter together — the repo-aware reset keeps it
        setTab(t.repo);
        setTaskFilter(`${t.repo}|${t.task_ref}`);
        setView("changes");
      },
    })),
    { section: "Actions", label: "Jump to pick queue",
      run: () => { setView("changes"); setPendingScroll("sec-pick"); } },
    { section: "Actions", label: "Toggle by task / by folder",
      run: () => { setGroupMode(groupMode === "task" ? "folder" : "task"); setView("changes"); } },
    { section: "Actions", label: `OS alerts: turn ${notifyOn ? "off" : "on"}`,
      run: () => { setPanelOpen(true); void toggleNotify(); } },
    ...(sessionFilter ? [{ section: "Actions", label: "View session timeline",
      run: () => setTimelineSession(sessionFilter) } as PaletteEntry] : []), // v0.1.6.0 D3
    { section: "Actions", label: "View weekly wrapped", // v0.1.8.0 D3 (C.1)
      run: () => setWrappedOpen(true) },
    { section: "Actions", label: "Open Legend", run: () => setShowLegend(true) },
    { section: "Actions", label: "Export daily digest", run: () => void doDigest() },
    { section: "Actions", label: "Clear task + session filters",
      run: () => { setTaskFilter(null); setSessionFilter(null); } },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-slate-700 bg-slate-900 px-4 py-2">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold text-sky-300">KATLAB Tracking Monitor</h1>
          {/* v0.1.7.0 D7 (C.4): tab/view switches crossfade via the View
              Transitions helper — nav call sites ONLY (filters stay instant) */}
          <nav className="flex gap-1">
            <TabButton active={tab === "ALL"} onClick={() => withViewTransition(() => setTab("ALL"))} label="ALL" />
            {repos.map((r) => (
              <TabButton key={r.id} active={tab === r.id}
                onClick={() => withViewTransition(() => setTab(r.id))} label={r.id} />
            ))}
          </nav>
          <div className="ml-auto flex gap-2">
            <TabButton active={view === "changes"} onClick={() => withViewTransition(() => setView("changes"))} label="Changes" />
            <TabButton active={view === "overview"} onClick={() => withViewTransition(() => setView("overview"))} label="Overview" />
            <TabButton active={view === "history"} onClick={() => withViewTransition(() => setView("history"))} label="History" />
            <TabButton active={showLegend} onClick={() => setShowLegend(!showLegend)} label="?"
              title="Legend - what every badge and state means" />
            {/* v0.1.9.0 D3 (C.2): live combo chip — left of the bell */}
            <ComboMeter count={comboCount} lastMs={comboLastMsRef.current}
              burst={comboBurst} />
            {/* v0.1.5.0 D4 (C.4): the ONE bell — cross-repo triage panel */}
            <AttentionBell repos={repos} events={events} tasks={tasks} violationOf={violationOf}
              open={panelOpen} onToggle={() => setPanelOpen(!panelOpen)}
              onClose={() => setPanelOpen(false)}
              onNavigate={navigateToRepo}
              footer={
                /* v0.1.5.0 D5 (D.1): the OS-alert switch lives HERE — one
                   bell in the header (user 2026-07-19). */
                <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-slate-700 pt-2">
                  <span className="text-slate-400">OS alerts (hidden tab only):</span>
                  <button onClick={() => void toggleNotify()}
                    className={`rounded px-2 py-0.5 text-[11px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
                      notifyOn ? "bg-emerald-700 text-white" : "bg-slate-800 text-slate-400 hover:bg-slate-700"}`}>
                    {notifyOn ? "on" : "off"}
                  </button>
                  {notifyNote && <span className="text-amber-300">{notifyNote}</span>}
                </div>
              } />
            {/* v0.1.5.0 D7 (D.3): daily digest export (RV20 inline note) */}
            <TabButton active={false} onClick={() => void doDigest()} label="Digest ↓"
              title="Export today's changes as one self-contained HTML file" />
            {digestNote && <span className="self-center text-[11px] text-amber-300">{digestNote}</span>}
          </div>
        </div>
        <StatusBar repos={visibleRepos} violationOf={violationOf} burst={burst} />
      </header>

      {showLegend && <Legend onClose={() => setShowLegend(false)} />}

      <CommandPalette entries={paletteEntries} /> {/* v0.1.5.0 D6 (D.2) */}

      {timelineSession && ( /* v0.1.6.0 D3 (C.3): static snapshot modal */
        <SessionTimeline session={timelineSession} onClose={closeTimeline} />
      )}

      {fileStory && ( /* v0.1.7.0 D2 (B.2): the life of one file */
        <FileStory repo={fileStory.repo} file={fileStory.file}
          repoBranch={repos.find((r) => r.id === fileStory.repo)?.branch ?? null}
          onClose={closeFileStory} />
      )}

      {wrappedOpen && stats && ( /* v0.1.8.0 D3 (C.1): your week */
        <WrappedCard stats={stats} tasks={tasks} onClose={closeWrapped} />
      )}

      {toasts.length > 0 && ( /* v0.1.7.0 D6 (C.3): persistent celebration
          toasts — z-30, BELOW every overlay (RV3: a record waits under a
          dim, never pierces it); one per repo, newest replaces; dismissed
          by ✕ or any outside click. NOT an overlay (no data-overlay-open). */
        <div data-toast-stack
          className="fixed bottom-4 right-4 z-30 flex flex-col items-end gap-2">
          {toasts.map((t) => (
            <div key={`${t.repo}|${t.n}`}
              className="toast-enter flex items-center gap-3 rounded border border-emerald-600/60 bg-slate-900 px-4 py-2 text-sm shadow-xl">
              <span>🎉 <span className="font-semibold">{t.repo}</span> is CLEAN ✓</span>
              <button className="text-slate-400 hover:text-white"
                aria-label={`dismiss ${t.repo} celebration`}
                onClick={() => setToasts((prev) => prev.filter((x) => x.repo !== t.repo))}>
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="bg-red-900/60 px-4 py-2 text-sm text-red-200">
          Server unreachable: {error} (auto-reconnecting...)
        </div>
      )}

      <WarningsBanner repos={visibleRepos} dismissed={dismissedWarnings}
        onDismiss={(key) => setDismissedWarnings(new Set(dismissedWarnings).add(key))} />

      <div className="flex flex-1 overflow-hidden">
        <TaskSidebar tasks={visibleTasks} events={events} effortByTask={effortByTask}
          taskFilter={taskFilter}
          onTaskClick={(key) => {
            setTaskFilter(taskFilter === key ? null : key);
            setView("changes");
          }} />
        <main className="flex-1 overflow-y-auto p-4">
          {/* v0.1.5.0 D3 (C.3): guard banner — shows only while the repo is
              STILL violating (task_updated re-sync clears it live). */}
          {view === "changes" && guardEvent && violationOf(guardEvent.repo) !== null && (
            <div className="mb-4 flex flex-wrap items-center gap-2 rounded border border-amber-600 bg-amber-900/40 px-3 py-2 text-sm text-amber-200">
              <span className="font-bold">⚠ {guardEvent.repo}:</span>
              <span>
                {violationOf(guardEvent.repo)} task{violationOf(guardEvent.repo) === 1 ? "" : "s"} in-progress
                — this change landed in the pick queue. Fix plan statuses
                (Docs/Tracking_Discipline.md).
              </span>
              <button className="ml-auto text-amber-400 hover:text-white"
                onClick={() => setGuardEvent(null)}>✕</button>
            </div>
          )}
          {view === "changes" && (
            <ChangesView events={visibleEvents} tasks={visibleTasks} repos={repos}
              effortByTask={effortByTask}
              taskFilter={taskFilter} onClearFilter={() => setTaskFilter(null)} onPicked={sync}
              sessionFilter={sessionFilter} onClearSessionFilter={() => setSessionFilter(null)}
              onSessionClick={(id) => setSessionFilter(sessionFilter === id ? null : id)}
              onOpenTimeline={(id) => setTimelineSession(id)}
              onOpenFileStory={(repo, file) => setFileStory({ repo, file })}
              groupMode={groupMode} onGroupModeChange={setGroupMode} />
          )}
          {view === "overview" && (
            <OverviewView scope={tab === "ALL" ? undefined : tab} tasks={visibleTasks}
              uncommitted={visibleEvents} repos={visibleRepos.filter((r) => !r.offline)}
              stats={stats} statsError={statsError}
              onOpenFileStory={(repo, file) => setFileStory({ repo, file })}
              onOpenWrapped={() => setWrappedOpen(true)} />
          )}
          {view === "history" && <HistoryView repos={visibleRepos.filter((r) => !r.offline)} />}
        </main>
      </div>
    </div>
  );
}

function TabButton ({ active, onClick, label, title }:
  { active: boolean; onClick: () => void; label: string; title?: string }) {
  return (
    <button onClick={onClick} title={title}
      className={`min-h-[28px] rounded px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
        active ? "bg-sky-700 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>
      {label}
    </button>
  );
}

// Status bar: CLEAN / N uncommitted / OFFLINE (F46) + capture heartbeat (D9)
// + v0.1.5.0 D3 discipline micro-chip (absent when exactly 1 in-progress).
function StatusBar ({ repos, violationOf, burst }:
  { repos: Repo[]; violationOf: (repoId: string) => number | null;
    // v0.1.7.0 D6 (C.3): burst nonce — the matching repo's CLEAN chip
    // renders the particle burst; naturally skipped when the chip is not
    // rendered (other tab / repo currently dirty).
    burst: { repo: string; n: number } | null }) {
  return (
    <div className="mt-2 flex flex-wrap gap-3">
      {repos.map((r) => {
        const violation = violationOf(r.id);
        return (
          <div key={r.id} className="flex items-center gap-2 rounded bg-slate-800 px-3 py-1 text-sm">
            <span className="font-medium">{r.id}</span>
            {/* v0.1.6.0 D2 (C.2): current-branch chip; absent when null */}
            {r.branch && (
              <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[11px] text-slate-300"
                title="current git branch">
                &#x2387; {r.branch}
              </span>
            )}
            {r.offline ? (
              <span className="rounded bg-zinc-600 px-2 py-0.5 text-xs font-bold">OFFLINE</span>
            ) : r.clean ? (
              <span className="relative rounded bg-emerald-600 px-2 py-0.5 text-xs font-bold">
                CLEAN ✓
                {burst?.repo === r.id && !prefersReducedMotion() && (
                  /* ~12 self-removing particles (App clears the nonce after
                     ~900ms); keyed by nonce so a re-transition re-fires. */
                  <span key={burst.n} aria-hidden="true">
                    {Array.from({ length: 12 }, (_, i) => {
                      const angle = (i / 12) * 2 * Math.PI;
                      const radius = i % 2 === 0 ? 30 : 42;
                      const colors = ["#14b8a6", "#10b981", "#f59e0b"];
                      return (
                        <span key={i} className="burst-p"
                          style={{
                            backgroundColor: colors[i % 3],
                            "--dx": `${Math.round(Math.cos(angle) * radius)}px`,
                            "--dy": `${Math.round(Math.sin(angle) * radius)}px`,
                          } as CSSProperties} />
                      );
                    })}
                  </span>
                )}
              </span>
            ) : (
              <span className="rounded bg-amber-500 px-2 py-0.5 text-xs font-bold text-slate-950">
                {r.count} uncommitted change{r.count === 1 ? "" : "s"}
              </span>
            )}
            {violation !== null && (
              <span title="Discipline: keep exactly ONE task in-progress — new undeclared edits will land in the pick queue (Docs/Tracking_Discipline.md)"
                className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[11px] font-bold text-amber-300">
                ⚠ {violation} active
              </span>
            )}
            {/* v0.1.7.0 D5 (C.2): derived AT RENDER — the P8 60s tick
                expires it; WS-driven repo syncs turn it on promptly. */}
            {r.last_event_ts && Date.now() - new Date(r.last_event_ts).getTime() < 5 * 60_000 && (
              <span title={`capturing now — last event ${fmtRel(r.last_event_ts)}`}
                className="pulse-dot inline-block h-2 w-2 shrink-0 rounded-full bg-teal-400" />
            )}
            <span className="text-[11px] text-slate-400" title={r.last_event_ts ?? "no captures yet"}>
              · {r.last_event_ts ? `last capture ${fmtRel(r.last_event_ts)}` : "no captures yet"}
            </span>
            <Sparkline buckets={r.activity_buckets} />
          </div>
        );
      })}
      {repos.length === 0 && <span className="text-sm text-slate-400">No repos configured.</span>}
    </div>
  );
}

// D3: pure-SVG capture sparkline (last 60min, 12x5-min buckets from /api/repos).
function Sparkline ({ buckets }: { buckets: number[] }) {
  const w = 48, h = 14, n = buckets?.length ?? 0;
  if (!n) return null;
  const max = Math.max(1, ...buckets);
  const pts = buckets
    .map((v, i) => `${(i / (n - 1)) * w},${h - (v / max) * (h - 2) - 1}`)
    .join(" ");
  const total = buckets.reduce((a, b) => a + b, 0);
  return (
    <svg width={w} height={h} className="ml-0.5" role="img"
      aria-label={`${total} edits in the last hour`}>
      <title>{`${total} edits in the last hour`}</title>
      <polyline points={pts} fill="none" stroke="#14b8a6" strokeWidth="1"
        strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// F47: dismissible per-repo warnings banner.
function WarningsBanner ({ repos, dismissed, onDismiss }:
  { repos: Repo[]; dismissed: Set<string>; onDismiss: (key: string) => void }) {
  const items = repos.flatMap((r) =>
    r.warnings.map((w) => ({ key: `${r.id}|${w.ts}|${w.message}`, repo: r.id, ...w })),
  ).filter((w) => !dismissed.has(w.key));
  if (items.length === 0) return null;
  return (
    <div className="bg-amber-900/50 px-4 py-1">
      {items.slice(-5).map((w) => (
        <div key={w.key} className="flex items-center gap-2 py-0.5 text-xs text-amber-200">
          <span className="font-bold">[{w.repo}]</span>
          <span className="flex-1">{w.message}</span>
          <button className="text-amber-400 hover:text-white" onClick={() => onDismiss(w.key)}>✕</button>
        </div>
      ))}
    </div>
  );
}

// D1 + D5 (v0.1.2.0): human labels + technical name in the tooltip (P13).
// v0.1.5.0 C.1 (RV19): MODE_BADGE lifted to theme.ts — single label source
// for App AND digest.ts. R26: color stays INLINE hex from MODE_COLOR.
const SWEPT_TIP = "swept — attached to HEAD when the repo went CLEAN (file not in that commit's list)";
const swatch = "rounded px-1.5 py-0.5 text-[11px] font-bold text-white";

// v0.1.6.0 D4 (C.4): nudge thresholds — frontend constants this release.
const IDLE_TASK_H = 24;
const UNCOMMITTED_AGE_H = 48;
const olderThanH = (iso: string, hours: number) =>
  Date.now() - new Date(iso).getTime() > hours * 3_600_000;

// v0.1.5.0 D4 (C.4): attention bell + cross-repo triage dropdown. Rows are
// PER-REPO and unscoped — Σ(rows) equals the ALL-tab KPI/queue N (RV26).
// Badge counts ACTIONABLE items only; "N uncommitted" is informational.
// The footer slot hosts the D5 "OS alerts" toggle (D.1).
function AttentionBell ({ repos, events, tasks, violationOf, open, onToggle, onClose, onNavigate, footer }: {
  repos: Repo[]; events: TrackedEvent[]; tasks: Task[]; // tasks: v0.1.6.0 D4 (RV14)
  violationOf: (repoId: string) => number | null;
  open: boolean; onToggle: () => void; onClose: () => void;
  onNavigate: (repoId: string, scrollToPicks: boolean) => void;
  footer: React.ReactNode;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [open, onClose]);

  const rows = repos.map((r) => {
    const picks = events.filter((e) =>
      e.repo_id === r.id && (e.mode === "AMBIGUOUS" || e.mode === "UNKNOWN")).length;
    const violation = violationOf(r.id);
    const actionable: string[] = [];
    if (picks > 0) actionable.push(`${picks} pick${picks === 1 ? "" : "s"} pending`);
    if (violation !== null) actionable.push(`discipline: ${violation} in-progress`);
    if (r.offline) actionable.push("OFFLINE");
    if (!r.offline && !r.last_event_ts && !r.clean) actionable.push("no capture yet");
    // v0.1.6.0 D4 (C.4): rhythm nudges — both ACTIONABLE (badge-counted).
    // Null fields never nag; ages via fmtAge (fmtRel cannot say 2d — RV16).
    for (const t of tasks) {
      if (t.repo === r.id && t.status === "in-progress" && t.last_event_ts &&
          olderThanH(t.last_event_ts, IDLE_TASK_H)) {
        actionable.push(`${t.task_id} in-progress idle ${fmtAge(t.last_event_ts)}`);
      }
    }
    if (r.oldest_uncommitted_ts && olderThanH(r.oldest_uncommitted_ts, UNCOMMITTED_AGE_H)) {
      actionable.push(`uncommitted for ${fmtAge(r.oldest_uncommitted_ts)}`);
    }
    return { repo: r.id, picks, actionable, uncommitted: r.count, branch: r.branch };
  });
  const badge = rows.reduce((n, row) => n + row.actionable.length, 0);

  return (
    <div ref={wrapRef} className="relative">
      <button onClick={onToggle} title="Needs attention — cross-repo triage"
        className={`relative min-h-[28px] rounded px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
          open ? "bg-sky-700 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>
        🔔
        {badge > 0 && (
          <span className="absolute -right-1 -top-1 rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-slate-950">
            {badge}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-80 rounded border border-slate-700 bg-slate-900 p-3 text-xs shadow-xl">
          <div className="mb-2 text-sm font-bold text-slate-200">Needs attention</div>
          {badge === 0 && <p className="text-slate-400">All clear ✓</p>}
          {rows.filter((row) => row.actionable.length > 0 || row.uncommitted > 0)
            .sort((a, b) => b.actionable.length - a.actionable.length)
            .map((row) => (
              <button key={row.repo}
                onClick={() => onNavigate(row.repo, row.picks > 0)}
                className="mb-1 w-full rounded bg-slate-800 p-2 text-left hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">
                <div className="font-semibold text-sky-300">{row.repo}</div>
                {row.actionable.length > 0 && (
                  <div className="mt-0.5 text-amber-300">{row.actionable.join(" · ")}</div>
                )}
                <div className="mt-0.5 text-slate-400">
                  {row.uncommitted} uncommitted change{row.uncommitted === 1 ? "" : "s"}
                  {row.branch ? <> {" · ⎇ "}{row.branch}</> : null} {/* v0.1.6.0 D2 */}
                </div>
              </button>
            ))}
          {footer}
        </div>
      )}
    </div>
  );
}

// v0.1.5.0 D1 (C.1): session identity dot — color from sessionColor, short
// id in the tooltip. NULL session (pre-upgrade rows) -> no dot (honest).
// Clickable ONLY where a handler is passed (Changes task groups — RV4);
// History + pick-queue dots stay informational.
function SessionDot ({ id, onClick }: { id: string | null; onClick?: () => void }) {
  if (!id) return null;
  const style = { backgroundColor: sessionColor(id) };
  if (!onClick) {
    return <span title={`session ${id.slice(0, 8)}`} style={style}
      className="inline-block h-2 w-2 shrink-0 rounded-full" />;
  }
  return (
    <button title={`session ${id.slice(0, 8)} — click to filter by this session`}
      onClick={onClick}
      className="flex h-4 w-4 shrink-0 items-center justify-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">
      <span className="h-2 w-2 rounded-full" style={style} />
    </button>
  );
}

function ModeBadge ({ mode, swept }: { mode: TrackedEvent["mode"]; swept?: boolean }) {
  const badge = MODE_BADGE[mode];
  return (
    <span className="flex gap-1">
      <span title={badge.tip} className={swatch} style={{ backgroundColor: MODE_COLOR[mode] }}>
        {badge.label}
      </span>
      {swept && (
        <span title={SWEPT_TIP} className={swatch} style={{ backgroundColor: SWEPT_COLOR }}>
          auto-linked
        </span>
      )}
    </span>
  );
}

// D1: plain-English legend; each entry bridges to the technical mode name (P13).
function Legend ({ onClose }: { onClose: () => void }) {
  const rows: [string, TrackedEvent["mode"] | "swept", string][] = [
    ["Declared", "B", "The changed file is declared by exactly one task — strongest attribution."],
    ["Active task", "A_SCOPED", "Several tasks declare the file; the single in-progress one wins."],
    ["Active task *", "A_GLOBAL", "No task declares the file; the repo's single in-progress task takes it."],
    ["Pick: multi", "AMBIGUOUS", "Several declarations, no single active task — needs your pick."],
    ["Pick: none", "UNKNOWN", "No declaration and no single active task — needs your pick."],
    ["Your pick", "MANUAL", "Assigned by you; never re-resolved."],
    ["auto-linked", "swept", "Attached to HEAD when the repo turned CLEAN (rename/delete or server-down cases)."],
  ];
  return (
    <div className="border-b border-slate-700 bg-slate-900 px-4 py-3 text-xs text-slate-300">
      <div className="mb-2 flex items-center">
        <span className="text-sm font-bold text-slate-100">Legend — how changes get their WHY</span>
        <button className="ml-auto text-slate-400 hover:text-white" onClick={onClose}>✕</button>
      </div>
      <div className="grid gap-1.5 md:grid-cols-2">
        {rows.map(([label, tech, text]) => (
          <div key={tech} className="flex items-baseline gap-2">
            <span className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-bold text-white"
              style={{ backgroundColor: tech === "swept" ? SWEPT_COLOR : MODE_COLOR[tech] }}>{label}</span>
            <span className="shrink-0 font-mono text-slate-500">({tech})</span>
            <span>{text}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-slate-400">
        Task chips: <b className="text-slate-300">pending</b> → <b className="text-sky-300">in-progress</b> →{" "}
        <b className="text-amber-300">done, uncommitted</b> (work finished, commit pending) →{" "}
        <b className="text-emerald-300">done ✓</b> (every change committed). A repo is{" "}
        <b className="text-emerald-300">CLEAN ✓</b> when git reports zero uncommitted changes.
      </p>
    </div>
  );
}

// D2: derived task state - "done" splits by remaining uncommitted events.
const TASK_CHIP: Record<string, { text: string; cls: string; tip: string }> = {
  "pending": { text: "pending", cls: "bg-slate-600 text-white",
    tip: "Declared in the plan, not started" },
  "in-progress": { text: "in-progress", cls: "bg-sky-600 text-white",
    tip: "The active task - undeclared edits attribute here (A_GLOBAL)" },
  "done": { text: "done ✓", cls: "bg-emerald-600 text-white",
    tip: "Task finished and every tracked change is committed" },
  "done-uncommitted": { text: "done, uncommitted", cls: "border border-amber-500 text-amber-300",
    tip: "Task marked done but some of its changes are not committed yet" },
};

// v0.1.6.0 D1 (C.1): one effort line for sidebar cards + group headers —
// fmtMinutes carries the ≈; sessions part hidden when 0; absent when the
// task is outside the top-10 effort_per_task (no client re-computation).
type EffortMap = Map<string, { minutes: number; sessions: number }>;
function EffortLine ({ effort }: { effort?: { minutes: number; sessions: number } }) {
  if (!effort) return null;
  return (
    <span className="text-[11px] text-slate-400"
      title="estimated from capture timestamps — 15-min gap rule">
      {fmtMinutes(effort.minutes)}
      {effort.sessions > 0 ? ` · ${effort.sessions} session${effort.sessions === 1 ? "" : "s"}` : ""}
    </span>
  );
}

function TaskSidebar ({ tasks, events, effortByTask, taskFilter, onTaskClick }:
  { tasks: Task[]; events: TrackedEvent[]; effortByTask: EffortMap;
    taskFilter: string | null; onTaskClick: (key: string) => void }) {
  const [showAll, setShowAll] = useState(false);
  const [doneOpen, setDoneOpen] = useState(false);

  // D2: uncommitted count per repo|task_ref from the already-fetched list (P4 bound).
  const uncommitted = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of events) {
      if (!e.task_ref) continue;
      const key = `${e.repo_id}|${e.task_ref}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [events]);

  // D4: group by repo|plan_file.
  const groups = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) {
      const key = `${t.repo}|${t.plan_file}`;
      map.set(key, [...(map.get(key) ?? []), t]);
    }
    return [...map.entries()];
  }, [tasks]);

  const groupUncommitted = (list: Task[]) =>
    list.reduce((n, t) => n + (uncommitted.get(`${t.repo}|${t.task_ref}`) ?? 0), 0);
  const activeGroups = groups.filter(([, list]) =>
    list.some((t) => t.status !== "done") || groupUncommitted(list) > 0);
  const doneGroups = groups.filter(([, list]) =>
    list.every((t) => t.status === "done") && groupUncommitted(list) === 0);

  return (
    <aside className="w-72 shrink-0 overflow-y-auto border-r border-slate-800 bg-slate-900 p-3">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400">Plan tasks</h2>
        <div className="ml-auto flex gap-1">
          <FilterChip active={!showAll} label="Active" onClick={() => setShowAll(false)} />
          <FilterChip active={showAll} label="All" onClick={() => setShowAll(true)} />
        </div>
      </div>
      {tasks.length === 0 && (
        <p className="text-xs text-slate-400">No tasks — author a plan in temp/Plan/.</p>
      )}
      {activeGroups.map(([key, list]) => (
        <PlanGroup key={key} list={list} uncommitted={uncommitted} effortByTask={effortByTask}
          taskFilter={taskFilter} onTaskClick={onTaskClick} />
      ))}
      {showAll && doneGroups.length > 0 && (
        <div className="mt-3 border-t border-slate-800 pt-2">
          <button onClick={() => setDoneOpen(!doneOpen)}
            className="mb-1 flex w-full items-center gap-1 text-xs font-bold uppercase tracking-wide text-slate-500 hover:text-slate-300">
            {doneOpen ? "▾" : "▸"} Done ({doneGroups.length} plan{doneGroups.length === 1 ? "" : "s"})
          </button>
          {doneOpen && doneGroups.map(([key, list]) => (
            <PlanGroup key={key} list={list} uncommitted={uncommitted} effortByTask={effortByTask}
              taskFilter={taskFilter} onTaskClick={onTaskClick} />
          ))}
        </div>
      )}
    </aside>
  );
}

function FilterChip ({ active, label, onClick }:
  { active: boolean; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`rounded px-2 py-0.5 text-[11px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
        active ? "bg-sky-700 text-white" : "bg-slate-800 text-slate-400 hover:bg-slate-700"}`}>
      {label}
    </button>
  );
}

function PlanGroup ({ list, uncommitted, effortByTask, taskFilter, onTaskClick }:
  { list: Task[]; uncommitted: Map<string, number>; effortByTask: EffortMap;
    taskFilter: string | null;
    onTaskClick: (key: string) => void }) {
  const doneCount = list.filter((t) => t.status === "done").length;
  const first = list[0];
  return (
    <div className="mb-3">
      <div className="mb-1 flex items-baseline gap-2">
        <span className="truncate font-mono text-[11px] text-slate-400" title={first.plan_file}>
          {first.plan_file}
        </span>
        <span className="ml-auto shrink-0 text-[11px] text-slate-500">
          {doneCount}/{list.length} done · {first.repo}
        </span>
      </div>
      {list.map((t) => {
        const key = `${t.repo}|${t.task_ref}`;
        const count = uncommitted.get(key) ?? 0;
        const derived = t.status === "done" ? (count === 0 ? "done" : "done-uncommitted") : t.status;
        const chip = TASK_CHIP[derived];
        return (
          <button key={key} onClick={() => onTaskClick(key)}
            className={`mb-2 w-full rounded p-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
              taskFilter === key ? "bg-sky-900/60 ring-1 ring-sky-500" : "bg-slate-800 hover:bg-slate-800/80"}`}
            title="Click to filter the Changes view to this task">
            <div className="flex items-center gap-2">
              <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${chip.cls}`} title={chip.tip}>
                {chip.text}
              </span>
              <span className="text-xs font-semibold text-sky-300">{t.task_id}</span>
            </div>
            <div className="mt-1 text-xs text-slate-200">{t.title}</div>
            <EffortLine effort={effortByTask.get(key)} /> {/* v0.1.6.0 D1 */}
            {count > 0 && (
              <div className="mt-0.5 text-[11px] text-amber-300">
                {count} uncommitted change{count === 1 ? "" : "s"}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

function ChangesView ({ events, tasks, repos, effortByTask, taskFilter, onClearFilter, onPicked,
  sessionFilter, onClearSessionFilter, onSessionClick, onOpenTimeline, onOpenFileStory,
  groupMode, onGroupModeChange }:
  { events: TrackedEvent[]; tasks: Task[]; repos: Repo[]; effortByTask: EffortMap;
    taskFilter: string | null;
    onClearFilter: () => void; onPicked: () => void;
    sessionFilter: string | null; onClearSessionFilter: () => void;
    onSessionClick: (id: string) => void;
    onOpenTimeline: (id: string) => void; // v0.1.6.0 D3 (C.3)
    onOpenFileStory: (repo: string, file: string) => void; // v0.1.7.0 D2 (B.2)
    // D6 (v0.1.4.0): "by task | by folder" — swaps ONLY the grouped section.
    // v0.1.5.0 D.2 (RV3): state lifted to App for the palette action.
    groupMode: "task" | "folder"; onGroupModeChange: (m: "task" | "folder") => void }) {
  const needsPick = events.filter((e) => e.mode === "AMBIGUOUS" || e.mode === "UNKNOWN");
  useReveal("changes", [events.length]); // D5: stagger task groups, once per session
  // v0.1.5.0 D1: the session filter ANDs with the X4 task filter and applies
  // ONLY to the by-task grouped section — pick queue + tree exempt (P11/R7).
  const attributed = events.filter((e) =>
    e.mode !== "AMBIGUOUS" && e.mode !== "UNKNOWN" &&
    (!sessionFilter || e.session_id === sessionFilter));
  const byTask = useMemo(() => {
    const groups = new Map<string, TrackedEvent[]>();
    for (const e of attributed) {
      const key = `${e.repo_id}|${e.task_ref ?? "(no task)"}`;
      groups.set(key, [...(groups.get(key) ?? []), e]);
    }
    return groups;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, sessionFilter]);
  const taskByKey = useMemo(
    () => new Map(tasks.map((t) => [`${t.repo}|${t.task_ref}`, t])),
    [tasks],
  );
  // D8/P3: exact plan-file set per repo, from tasks data.
  const planFilesByRepo = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const t of tasks) {
      if (!m.has(t.repo)) m.set(t.repo, new Set());
      m.get(t.repo)!.add(t.plan_file);
    }
    return m;
  }, [tasks]);

  const groupEntries = [...byTask.entries()]
    .filter(([key]) => !taskFilter || key === taskFilter); // X4 (manual picks exempt, P11)

  // D4 (v0.1.4.0, C.1): sticky mini-TOC entries — hidden when <=1 group;
  // by-task mode only (the folder view is one card per repo).
  const navItems: { id: string; label: string; title?: string }[] = [];
  if (groupMode === "task" && groupEntries.length > 1) {
    if (needsPick.length > 0) {
      navItems.push({ id: "sec-pick", label: `manual pick (${needsPick.length})` });
    }
    groupEntries.forEach(([key], i) => {
      const ref = key.split("|").slice(1).join("|");
      navItems.push({ id: `sec-g${i}`, label: ref.split(" - ").pop() ?? ref, title: ref });
    });
  }

  return (
    <div className="space-y-6">
      {navItems.length > 0 && <SectionNav items={navItems} />}
      {/* P11: this section is NEVER filtered - it needs action. Wrapper is
          conditional — an empty div would add a phantom space-y gap (T2). */}
      {needsPick.length > 0 && (
        <div id="sec-pick" className="scroll-mt-12">
          <PickSection events={needsPick} tasks={tasks} onPicked={onPicked} />
        </div>
      )}

      <section>
        <div className="mb-2 flex items-center gap-2">
          <h2 className="border-l-4 border-sky-500 pl-2 text-sm font-bold text-slate-200">
            Uncommitted changes {groupMode === "task" ? "grouped by task" : "by folder"}
          </h2>
          {/* D6: the toggle never hides the pick queue above (P11); the tree
              is PER-REPO — an active task filter does not subset it (R7). */}
          <div className="ml-1 flex gap-1">
            <FilterChip active={groupMode === "task"} label="by task"
              onClick={() => onGroupModeChange("task")} />
            <FilterChip active={groupMode === "folder"} label="by folder"
              onClick={() => onGroupModeChange("folder")} />
          </div>
        </div>
        {groupMode === "folder" ? (
          <FolderView events={events} />
        ) : (
          <>
            {(taskFilter || sessionFilter) && (
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                {taskFilter && (
                  <>
                    <span className="rounded bg-sky-900 px-2 py-0.5 text-sky-200">
                      filtered: {taskFilter.split("|").slice(1).join("|")}
                    </span>
                    <button onClick={onClearFilter} className="text-sky-400 hover:underline">✕ clear</button>
                  </>
                )}
                {sessionFilter && ( // v0.1.5.0 D1: session filter chip
                  <>
                    <span className="flex items-center gap-1.5 rounded bg-slate-800 px-2 py-0.5 text-slate-200">
                      <span className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: sessionColor(sessionFilter) }} />
                      session: {sessionFilter.slice(0, 8)}
                    </span>
                    {/* v0.1.6.0 D3 (C.3): the timeline opener lives on the chip */}
                    <button onClick={() => onOpenTimeline(sessionFilter)}
                      className="text-sky-400 hover:underline">timeline</button>
                    <button onClick={onClearSessionFilter} className="text-sky-400 hover:underline">✕ clear</button>
                  </>
                )}
              </div>
            )}
            {groupEntries.length === 0 && (
              <p className="text-sm text-slate-400">
                {taskFilter
                  ? "No uncommitted changes for this task."
                  : "No uncommitted tracked changes — repo is clean or no edits captured yet."}
              </p>
            )}
            {groupEntries.map(([key, group], i) => {
              const task = taskByKey.get(key);
              const ref = key.split("|").slice(1).join("|");
              return (
                <div key={key} id={`sec-g${i}`} className="scroll-mt-12">
                  <TaskGroup refLabel={ref} repoId={group[0].repo_id} group={group}
                    why={task?.why} repos={repos}
                    planFileSet={planFilesByRepo.get(group[0].repo_id)}
                    onSessionClick={onSessionClick}
                    onOpenFileStory={onOpenFileStory}
                    effort={effortByTask.get(key)} />
                </div>
              );
            })}
          </>
        )}
      </section>
    </div>
  );
}

// D4 (v0.1.4.0, C.1): sticky mini-TOC + IntersectionObserver scroll-spy for
// the Changes view. Sticky within <main> (the scroll container); the caller
// hides it when there are <=1 task groups.
function SectionNav ({ items }: { items: { id: string; label: string; title?: string }[] }) {
  const [active, setActive] = useState("");
  const key = items.map((s) => s.id + s.label).join("|");
  useEffect(() => {
    const els = items
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => el !== null);
    if (els.length === 0) return;
    const io = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible[0]) setActive(visible[0].target.id); // topmost in view wins
    }, { rootMargin: "-10% 0px -60% 0px" });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return (
    <nav className="sticky top-0 z-20 -mx-4 -mt-4 flex flex-wrap gap-1 border-b border-slate-800 bg-slate-950/95 px-4 py-2 backdrop-blur">
      {items.map((s) => (
        <button key={s.id} title={s.title ?? s.label}
          onClick={() => document.getElementById(s.id)
            ?.scrollIntoView({ behavior: "smooth", block: "start" })}
          className={`rounded px-2 py-0.5 text-[11px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
            active === s.id ? "bg-sky-700 text-white" : "bg-slate-800 text-slate-400 hover:bg-slate-700"}`}>
          {s.label}
        </button>
      ))}
    </nav>
  );
}

// D6 (v0.1.4.0, B.3): per-repo changed-files tree — the uncommitted events'
// paths as a monospace ├──/└── tree (white-space: pre, no wrap), one card
// per repo, edit-count badge per leaf (churn hotspots). Neutral leaves this
// release. Built from ALL uncommitted events of the repo (pick queue
// included — "no loss" vs the by-task view, V8).
function FolderView ({ events }: { events: TrackedEvent[] }) {
  const byRepo = useMemo(() => {
    const m = new Map<string, TrackedEvent[]>();
    for (const e of events) m.set(e.repo_id, [...(m.get(e.repo_id) ?? []), e]);
    return [...m.entries()];
  }, [events]);
  if (byRepo.length === 0) {
    return (
      <p className="text-sm text-slate-400">
        No uncommitted tracked changes — repo is clean or no edits captured yet.
      </p>
    );
  }
  return (
    <>
      {byRepo.map(([repoId, list]) => (
        <div key={repoId} className="mb-4 rounded border border-slate-700 bg-slate-900 p-3">
          <div className="mb-1 flex items-baseline gap-2">
            <span className="font-mono text-sm font-semibold text-sky-300">{repoId}</span>
            <span className="text-[11px] text-slate-500">
              {new Set(list.map((e) => e.file)).size} files · {list.length} edits
            </span>
          </div>
          <pre className="overflow-x-auto text-[11px] leading-snug text-slate-300">
            {buildFileTree(list).map((line, i) => (
              <span key={i}>
                {line.text}
                {line.count !== undefined && (
                  <span className={line.count >= 3 ? "text-amber-300" : "text-slate-500"}>
                    {`  ×${line.count}`}
                  </span>
                )}
                {"\n"}
              </span>
            ))}
          </pre>
        </div>
      ))}
    </>
  );
}

// D8: plan-file edits collapse to one expandable line inside each group.
function TaskGroup ({ refLabel, repoId, group, why, repos, planFileSet, onSessionClick,
  onOpenFileStory, effort }:
  { refLabel: string; repoId: string; group: TrackedEvent[]; why?: string;
    repos: Repo[]; planFileSet?: Set<string>;
    onSessionClick?: (id: string) => void;
    onOpenFileStory?: (repo: string, file: string) => void; // v0.1.7.0 D2
    effort?: { minutes: number; sessions: number } }) {
  const [showPlanEdits, setShowPlanEdits] = useState(false);
  const planEdits = group.filter((e) => planFileSet?.has(e.file));
  const normal = group.filter((e) => !planFileSet?.has(e.file));
  return (
    <div data-reveal className="mb-4 rounded border border-slate-700 bg-slate-900 p-3">
      <div className="flex items-baseline gap-2">
        {/* F48: task-ref link "<plan filename> - <task id>" */}
        <span className="font-mono text-sm font-semibold text-sky-300">{refLabel}</span>
        <span className="text-[11px] text-slate-500">{repoId}</span>
        <EffortLine effort={effort} /> {/* v0.1.6.0 D1 (C.1) */}
      </div>
      {why && <p className="mt-1 text-xs text-slate-400">Why: {why}</p>}
      <div className="mt-2 space-y-1">
        {normal.map((e) => (
          <EventRow key={e.id} event={e} repos={repos} onSessionClick={onSessionClick}
            onOpenFileStory={onOpenFileStory} />
        ))}
        {planEdits.length > 0 && (
          <div className="rounded bg-slate-800/40 px-2 py-1">
            <button onClick={() => setShowPlanEdits(!showPlanEdits)}
              className="text-[11px] text-slate-400 hover:text-slate-200">
              {showPlanEdits ? "▾" : "▸"} {planEdits.length} plan-file edit{planEdits.length === 1 ? "" : "s"} · latest {fmtRel(planEdits[0].ts)}
            </button>
            {showPlanEdits && (
              <div className="mt-1 space-y-1">
                {planEdits.map((e) => (
                  <EventRow key={e.id} event={e} repos={repos} onSessionClick={onSessionClick}
                    onOpenFileStory={onOpenFileStory} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// D7: manual-pick queue with per-row assign + bulk assign (X1).
function PickSection ({ events, tasks, onPicked }:
  { events: TrackedEvent[]; tasks: Task[]; onPicked: () => void }) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkChoice, setBulkChoice] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  if (events.length === 0) return null;

  const toggle = (id: number) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const selectedEvents = events.filter((e) => selected.has(e.id));
  const repoIds = new Set(selectedEvents.map((e) => e.repo_id));
  const bulkOptions = [...new Set(tasks.filter((t) => repoIds.has(t.repo)).map((t) => t.task_ref))];

  const bulkAssign = async () => {
    setBusy(true);
    let ok = 0, skipped = 0;
    for (const e of selectedEvents) {
      const candidates: string[] | null = e.candidates_json ? JSON.parse(e.candidates_json) : null;
      const repoRefs = tasks.filter((t) => t.repo === e.repo_id).map((t) => t.task_ref);
      const valid = repoRefs.includes(bulkChoice) &&
        (e.mode !== "AMBIGUOUS" || !candidates || candidates.includes(bulkChoice));
      if (!valid) { skipped += 1; continue; } // D7 candidate-safety
      try { await api.pickTask(e.id, bulkChoice); ok += 1; } catch { skipped += 1; }
    }
    setNote(`assigned ${ok}${skipped > 0 ? `, skipped ${skipped} (not a valid candidate)` : ""}`);
    setSelected(new Set());
    setBulkChoice("");
    setBusy(false);
    onPicked(); // single sync after the batch
  };

  return (
    <section>
      <h2 className="mb-2 border-l-4 border-amber-500 pl-2 text-sm font-bold text-amber-400">
        Needs attention — manual pick ({events.length})
      </h2>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        <label className="flex items-center gap-1 text-slate-300">
          {/* C2: count via selectedEvents - `selected` may hold stale ids after a sync */}
          <input type="checkbox" checked={selectedEvents.length === events.length && events.length > 0}
            onChange={(e) => setSelected(e.target.checked ? new Set(events.map((x) => x.id)) : new Set())} />
          select all ({events.length})
        </label>
        <select value={bulkChoice} onChange={(e) => setBulkChoice(e.target.value)}
          disabled={selectedEvents.length === 0}
          className="min-h-[28px] rounded bg-slate-800 px-2 py-1 text-xs disabled:opacity-40">
          <option value="">— task for selected —</option>
          {bulkOptions.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <button disabled={!bulkChoice || selectedEvents.length === 0 || busy} onClick={() => void bulkAssign()}
          className="min-h-[28px] rounded bg-amber-600 px-2 py-1 text-xs font-semibold text-slate-950 hover:bg-amber-500 disabled:opacity-40">
          Assign {selectedEvents.length || ""}
        </button>
        {note && <span className="text-slate-400">{note}</span>} {/* P6: inline result note */}
      </div>
      {events.map((e) => (
        <PickRow key={e.id} event={e} tasks={tasks} onPicked={onPicked}
          checked={selected.has(e.id)} onToggle={() => toggle(e.id)} />
      ))}
    </section>
  );
}

function PickRow ({ event, tasks, onPicked, checked, onToggle }:
  { event: TrackedEvent; tasks: Task[]; onPicked: () => void;
    checked: boolean; onToggle: () => void }) {
  // F17: AMBIGUOUS -> candidates list; UNKNOWN -> ALL repo tasks.
  const candidates: string[] = event.candidates_json
    ? JSON.parse(event.candidates_json)
    : tasks.filter((t) => t.repo === event.repo_id).map((t) => t.task_ref);
  const [choice, setChoice] = useState("");

  return (
    <div className="mb-2 flex flex-wrap items-center gap-2 rounded border border-amber-700/50 bg-slate-900 p-2 text-sm">
      <input type="checkbox" checked={checked} onChange={onToggle} />
      <ModeBadge mode={event.mode} />
      <span className="font-mono text-xs">{event.file}</span>
      <SessionDot id={event.session_id} /> {/* informational — RV4 */}
      <span className="text-[11px] text-slate-400" title={event.ts}>
        {event.repo_id} · {fmtRel(event.ts)}
      </span>
      {candidates.length === 0 ? (
        /* F49: zero-task guidance instead of an empty dropdown */
        <span className="text-xs italic text-slate-400">
          No tasks defined — author a plan in temp/Plan/ of this repo; the event stays here and
          becomes pickable once tasks exist.
        </span>
      ) : (
        <>
          <select value={choice} onChange={(e) => setChoice(e.target.value)}
            className="min-h-[28px] rounded bg-slate-800 px-2 py-1 text-xs">
            <option value="">— pick the task —</option>
            {candidates.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button disabled={!choice}
            onClick={async () => { await api.pickTask(event.id, choice); onPicked(); }}
            className="min-h-[28px] rounded bg-sky-700 px-2 py-1 text-xs font-semibold hover:bg-sky-600 disabled:opacity-40">
            Assign
          </button>
        </>
      )}
    </div>
  );
}

// B.8: one row everywhere - context-aware diff (commit diff when linked).
// v0.1.5.0 D1: session dot before the timestamp; clickable only when the
// caller passes onSessionClick (Changes task groups — RV4).
function EventRow ({ event, repos, showRef, onSessionClick, onOpenFileStory }:
  { event: TrackedEvent; repos: Repo[]; showRef?: boolean;
    onSessionClick?: (id: string) => void;
    // v0.1.7.0 D2 (B.2): passed ONLY from Changes task groups (the
    // v0.1.5.0 RV4 zone precedent) — History/queue file names stay plain.
    onOpenFileStory?: (repo: string, file: string) => void }) {
  const [diff, setDiff] = useState<string | null>(null);
  const online = repos.some((r) => r.id === event.repo_id && !r.offline);
  // v0.1.6.0 D2 (C.2, RV14): differs-suffix - only when BOTH branches are
  // known AND differ (the different-branch signal, never same-branch noise).
  const repoBranch = repos.find((r) => r.id === event.repo_id)?.branch;
  return (
    <div className="rounded bg-slate-800/60 px-2 py-1">
      <div className="flex items-center gap-2 text-xs">
        <ModeBadge mode={event.mode} swept={event.swept === 1} />
        {onOpenFileStory ? (
          <button onClick={() => onOpenFileStory(event.repo_id, event.file)}
            title={`${event.file} — open file story`}
            className="truncate font-mono text-left hover:text-sky-300 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">
            {event.file}
          </button>
        ) : (
          <span className="font-mono">{event.file}</span>
        )}
        {showRef && event.task_ref && (
          <span className="text-[11px] text-sky-300">{event.task_ref}</span>
        )}
        <SessionDot id={event.session_id}
          onClick={onSessionClick && event.session_id
            ? () => onSessionClick(event.session_id!) : undefined} />
        {event.branch && repoBranch && event.branch !== repoBranch && (
          <span className="text-[11px] text-amber-300/80"
            title="captured on a different branch than the repo is on now">
            &#x2387; {event.branch}
          </span>
        )}
        <span className="text-[11px] text-slate-400" title={event.ts}>
          {event.tool} · {fmtRel(event.ts)}
        </span>
        {online && (
          <button className="ml-auto min-h-[24px] text-[11px] text-sky-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            onClick={async () => {
              if (diff !== null) { setDiff(null); return; }
              try { setDiff((await api.diff(event.repo_id, event.file, event.commit_hash)).diff); }
              catch (exc) { setDiff(String(exc)); }
            }}>
            {diff === null ? "diff" : "hide"}
          </button>
        )}
      </div>
      {diff !== null && <DiffView text={diff} />}
    </div>
  );
}

// D1/R11: position-aware colored diff. Headers only in the pre-hunk region;
// inside a hunk the first char decides (+added / -removed / space-context).
// Honest empty-state messages (v0.1.2.0 D3) are NOT diffs -> italic note.
function DiffView ({ text }: { text: string }) {
  const isDiff = text.startsWith("diff --git") ||
    text.split("\n").some((l) => l.startsWith("@@") || l.startsWith("+") || l.startsWith("-"));
  if (!isDiff) {
    return <p className="mt-1 rounded bg-slate-950 px-2 py-1 text-[11px] italic text-slate-400">{text}</p>;
  }
  let inHunk = false;
  const HEADER = /^(diff --git|index |\+\+\+ |--- |new file|deleted file|old mode|new mode|rename |similarity |Binary )/;
  const rows = text.split("\n").map((line, i) => {
    let color = "text-slate-300"; // context
    if (line.startsWith("@@")) { inHunk = true; color = "text-sky-400"; }
    else if (!inHunk) { color = HEADER.test(line) ? "text-slate-500" : "text-slate-500"; }
    else if (line.startsWith("+")) color = "text-emerald-400";
    else if (line.startsWith("-")) color = "text-rose-400";
    else if (line.startsWith("\\")) color = "text-slate-500";
    return <span key={i} className={color}>{line || " "}{"\n"}</span>;
  });
  return (
    <pre className="mt-1 max-h-64 overflow-auto rounded bg-slate-950 p-2 text-[11px] leading-snug">
      {rows}
    </pre>
  );
}

// History: commit -> events, paginated with LOAD-MORE (F38/F39) + diffs (B.8).
function HistoryView ({ repos }: { repos: Repo[] }) {
  const [repoId, setRepoId] = useState(repos[0]?.id ?? "");
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [exhausted, setExhausted] = useState(false);
  // v0.1.9.0 D4 (B.2): commit graph card — default collapsed (mermaid's
  // chunk loads only on first expand, R9), not persisted.
  const [showGraph, setShowGraph] = useState(false);
  const [graphSvg, setGraphSvg] = useState("");
  const [graphShown, setGraphShown] = useState(0);
  const [graphBusy, setGraphBusy] = useState(false);
  const [graphNote, setGraphNote] = useState("");
  const graphRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async (id: string, offset: number) => {
    if (!id) return;
    const page = await api.history(id, PAGE, offset);
    setEntries((prev) => (offset === 0 ? page : [...prev, ...page]));
    setExhausted(page.length < PAGE);
  }, []);

  // CFT-8: depend on STABLE ids only - the repos array identity changes on
  // every status push (30s poll), which reset pagination to page 1.
  const firstRepoId = repos[0]?.id ?? "";
  useEffect(() => {
    const id = repoId || firstRepoId;
    if (id && id !== repoId) setRepoId(id);
    if (id) void load(id, 0);
  }, [repoId, firstRepoId, load]);

  // v0.1.9.0 D4 (B.2): render on expand + newest-hash/repo change ONLY
  // (load-more appends OLDER rows — the first 20 stay identical). The
  // GraphPanel effect recipe VERBATIM (RV10): alive flag discards a
  // mid-flight render on any dep change or unmount; errors -> inline note.
  const newestHash = entries[0]?.commit.hash ?? "";
  const branch = repos.find((r) => r.id === repoId)?.branch ?? "main";
  // Refs so the effect reads the CURRENT page/branch without widening its
  // deps (entries identity changes on load-more; repos on every poll).
  const entriesRef = useRef(entries); entriesRef.current = entries;
  const branchRef = useRef(branch); branchRef.current = branch;
  useEffect(() => {
    if (!showGraph || !newestHash) { setGraphSvg(""); setGraphNote(""); return; }
    let alive = true;
    setGraphBusy(true); setGraphNote("");
    (async () => {
      try {
        const { svg, meta } = await renderGitGraph(entriesRef.current, branchRef.current);
        if (!alive) return;
        setGraphSvg(svg);
        setGraphShown(meta.shown);
      } catch (e) {
        if (alive) { setGraphSvg(""); setGraphNote(String(e)); }
      } finally {
        if (alive) setGraphBusy(false);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showGraph, repoId, newestHash]);

  // The GraphPanel injection idiom: DOMParser + adoptNode, never innerHTML.
  useEffect(() => {
    const host = graphRef.current;
    if (!host) return;
    if (!graphSvg) { host.replaceChildren(); return; }
    const doc = new DOMParser().parseFromString(graphSvg, "text/html");
    const parsed = doc.querySelector("svg");
    if (parsed) host.replaceChildren(document.adoptNode(parsed));
  }, [graphSvg]);

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <h2 className="border-l-4 border-emerald-500 pl-2 text-sm font-bold text-slate-200">History</h2>
        <select value={repoId} onChange={(e) => setRepoId(e.target.value)}
          className="min-h-[28px] rounded bg-slate-800 px-2 py-1 text-xs">
          {repos.map((r) => <option key={r.id} value={r.id}>{r.id}</option>)}
        </select>
        <button onClick={() => setShowGraph(!showGraph)} aria-pressed={showGraph}
          title="toggle the commit graph (latest 20 commits, real parents)"
          className={`min-h-[28px] rounded px-2 py-1 text-xs ${
            showGraph ? "bg-teal-800 text-white" : "bg-slate-800 hover:bg-slate-700"}`}>
          ⎇ graph
        </button>
        {graphBusy && <span className="text-xs text-slate-400">rendering…</span>}
      </div>
      {showGraph && (
        <div className="mb-3 rounded border border-slate-700 bg-slate-900 p-3">
          {graphNote && <p className="mb-2 text-xs italic text-slate-400">{graphNote}</p>}
          <div ref={graphRef} className="overflow-x-auto" role="img"
            aria-label="commit graph" />
          {graphSvg && (
            <p className="mt-1 text-[11px] text-slate-400">
              latest {graphShown} of {entries.length} fetched commits · merge side
              branches summarized to their tip (*)
            </p>
          )}
          {!graphBusy && !graphSvg && !graphNote && (
            <p className="text-xs text-slate-400">No commits to graph.</p>
          )}
        </div>
      )}
      {entries.map(({ commit, events }) => (
        <div key={commit.hash} className="mb-3 rounded border border-slate-700 bg-slate-900 p-3">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-xs text-emerald-400">{commit.hash.slice(0, 10)}</span>
            <span className="text-sm">{commit.message}</span>
            <span className="ml-auto text-[11px] text-slate-400" title={commit.ts}>
              {fmtTs(commit.ts)}
            </span>
          </div>
          <div className="mt-2 space-y-1">
            {events.length === 0 && (
              <p className="text-[11px] text-slate-500">No tracked events in this commit.</p>
            )}
            {events.map((e) => (
              <EventRow key={e.id} event={e} repos={repos} showRef />
            ))}
          </div>
        </div>
      ))}
      {entries.length === 0 && <p className="text-sm text-slate-400">No commits captured yet.</p>}
      {!exhausted && entries.length > 0 && (
        <button onClick={() => void load(repoId, entries.length)}
          className="min-h-[28px] rounded bg-slate-800 px-3 py-1 text-xs hover:bg-slate-700">
          Load more (older)
        </button>
      )}
    </div>
  );
}
