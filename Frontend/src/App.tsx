import { useCallback, useEffect, useMemo, useState } from "react";
import { api, HistoryEntry, Repo, Task, TrackedEvent } from "./api";
import { fmtRel, fmtTs } from "./format";
import { connectWs } from "./ws";

const PAGE = 500; // F38 pagination page size

type Tab = string | "ALL";

export default function App () {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<TrackedEvent[]>([]);
  const [tab, setTab] = useState<Tab>("ALL"); // F31: tabs dynamic from /api/repos
  const [view, setView] = useState<"changes" | "history">("changes");
  const [dismissedWarnings, setDismissedWarnings] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string>("");
  const [showLegend, setShowLegend] = useState(false);
  const [taskFilter, setTaskFilter] = useState<string | null>(null); // X4: "repo|task_ref"
  const [, setTick] = useState(0);

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
      if (msg.type === "repo_status_changed") {
        const d = msg.data as { repo: string; clean: boolean; count: number; offline: boolean };
        setRepos((prev) => prev.map((r) => (r.id === d.repo ? { ...r, ...d } : r)));
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

  useEffect(() => setTaskFilter(null), [tab]); // a filter never outlives its tab

  const visibleRepos = tab === "ALL" ? repos : repos.filter((r) => r.id === tab);
  const visibleTasks = tab === "ALL" ? tasks : tasks.filter((t) => t.repo === tab);
  const visibleEvents = tab === "ALL" ? events : events.filter((e) => e.repo_id === tab);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-slate-700 bg-slate-900 px-4 py-2">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold text-sky-300">KATLAB Tracking Monitor</h1>
          <nav className="flex gap-1">
            <TabButton active={tab === "ALL"} onClick={() => setTab("ALL")} label="ALL" />
            {repos.map((r) => (
              <TabButton key={r.id} active={tab === r.id} onClick={() => setTab(r.id)} label={r.id} />
            ))}
          </nav>
          <div className="ml-auto flex gap-2">
            <TabButton active={view === "changes"} onClick={() => setView("changes")} label="Changes" />
            <TabButton active={view === "history"} onClick={() => setView("history")} label="History" />
            <TabButton active={showLegend} onClick={() => setShowLegend(!showLegend)} label="?"
              title="Legend - what every badge and state means" />
          </div>
        </div>
        <StatusBar repos={visibleRepos} />
      </header>

      {showLegend && <Legend onClose={() => setShowLegend(false)} />}

      {error && (
        <div className="bg-red-900/60 px-4 py-2 text-sm text-red-200">
          Server unreachable: {error} (auto-reconnecting...)
        </div>
      )}

      <WarningsBanner repos={visibleRepos} dismissed={dismissedWarnings}
        onDismiss={(key) => setDismissedWarnings(new Set(dismissedWarnings).add(key))} />

      <div className="flex flex-1 overflow-hidden">
        <TaskSidebar tasks={visibleTasks} events={events} taskFilter={taskFilter}
          onTaskClick={(key) => {
            setTaskFilter(taskFilter === key ? null : key);
            setView("changes");
          }} />
        <main className="flex-1 overflow-y-auto p-4">
          {view === "changes"
            ? <ChangesView events={visibleEvents} tasks={visibleTasks} repos={repos}
                taskFilter={taskFilter} onClearFilter={() => setTaskFilter(null)} onPicked={sync} />
            : <HistoryView repos={visibleRepos.filter((r) => !r.offline)} />}
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

// Status bar: CLEAN / N uncommitted / OFFLINE (F46) + capture heartbeat (D9).
function StatusBar ({ repos }: { repos: Repo[] }) {
  return (
    <div className="mt-2 flex flex-wrap gap-3">
      {repos.map((r) => (
        <div key={r.id} className="flex items-center gap-2 rounded bg-slate-800 px-3 py-1 text-sm">
          <span className="font-medium">{r.id}</span>
          {r.offline ? (
            <span className="rounded bg-zinc-600 px-2 py-0.5 text-xs font-bold">OFFLINE</span>
          ) : r.clean ? (
            <span className="rounded bg-emerald-600 px-2 py-0.5 text-xs font-bold">CLEAN ✓</span>
          ) : (
            <span className="rounded bg-amber-500 px-2 py-0.5 text-xs font-bold text-slate-950">
              {r.count} uncommitted change{r.count === 1 ? "" : "s"}
            </span>
          )}
          <span className="text-[11px] text-slate-400" title={r.last_event_ts ?? "no captures yet"}>
            · {r.last_event_ts ? `last capture ${fmtRel(r.last_event_ts)}` : "no captures yet"}
          </span>
        </div>
      ))}
      {repos.length === 0 && <span className="text-sm text-slate-400">No repos configured.</span>}
    </div>
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

// D1 + D5: human labels, one hue per mode, technical name in the tooltip (P13).
const MODE_BADGE: Record<TrackedEvent["mode"], { label: string; cls: string; tip: string }> = {
  B: { label: "Declared", cls: "bg-emerald-600",
    tip: "B — the file is declared by exactly this task's <files>" },
  A_SCOPED: { label: "Active task", cls: "bg-sky-600",
    tip: "A_SCOPED — shared file; attributed to the one in-progress match" },
  A_GLOBAL: { label: "Active task *", cls: "bg-indigo-600",
    tip: "A_GLOBAL — undeclared file; attributed to the repo's single in-progress task" },
  AMBIGUOUS: { label: "Pick: multi", cls: "bg-amber-500",
    tip: "AMBIGUOUS — several tasks declare this file, none is the single active one; pick manually" },
  UNKNOWN: { label: "Pick: none", cls: "bg-rose-600",
    tip: "UNKNOWN — no task declares this file and there is no single in-progress task; pick manually" },
  MANUAL: { label: "Your pick", cls: "bg-purple-600",
    tip: "MANUAL — assigned by you; final, never re-resolved" },
};
const SWEPT_BADGE = { label: "auto-linked", cls: "bg-zinc-500",
  tip: "swept — attached to HEAD when the repo went CLEAN (file not in that commit's list)" };

function ModeBadge ({ mode, swept }: { mode: TrackedEvent["mode"]; swept?: boolean }) {
  const badge = MODE_BADGE[mode];
  return (
    <span className="flex gap-1">
      <span title={badge.tip}
        className={`rounded px-1.5 py-0.5 text-[11px] font-bold text-white ${badge.cls}`}>
        {badge.label}
      </span>
      {swept && (
        <span title={SWEPT_BADGE.tip}
          className={`rounded px-1.5 py-0.5 text-[11px] font-bold text-white ${SWEPT_BADGE.cls}`}>
          {SWEPT_BADGE.label}
        </span>
      )}
    </span>
  );
}

// D1: plain-English legend; each entry bridges to the technical mode name (P13).
function Legend ({ onClose }: { onClose: () => void }) {
  const rows: [string, string, string, string][] = [
    ["Declared", "B", MODE_BADGE.B.cls, "The changed file is declared by exactly one task — strongest attribution."],
    ["Active task", "A_SCOPED", MODE_BADGE.A_SCOPED.cls, "Several tasks declare the file; the single in-progress one wins."],
    ["Active task *", "A_GLOBAL", MODE_BADGE.A_GLOBAL.cls, "No task declares the file; the repo's single in-progress task takes it."],
    ["Pick: multi", "AMBIGUOUS", MODE_BADGE.AMBIGUOUS.cls, "Several declarations, no single active task — needs your pick."],
    ["Pick: none", "UNKNOWN", MODE_BADGE.UNKNOWN.cls, "No declaration and no single active task — needs your pick."],
    ["Your pick", "MANUAL", MODE_BADGE.MANUAL.cls, "Assigned by you; never re-resolved."],
    ["auto-linked", "swept", SWEPT_BADGE.cls, "Attached to HEAD when the repo turned CLEAN (rename/delete or server-down cases)."],
  ];
  return (
    <div className="border-b border-slate-700 bg-slate-900 px-4 py-3 text-xs text-slate-300">
      <div className="mb-2 flex items-center">
        <span className="text-sm font-bold text-slate-100">Legend — how changes get their WHY</span>
        <button className="ml-auto text-slate-400 hover:text-white" onClick={onClose}>✕</button>
      </div>
      <div className="grid gap-1.5 md:grid-cols-2">
        {rows.map(([label, tech, cls, text]) => (
          <div key={tech} className="flex items-baseline gap-2">
            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-bold text-white ${cls}`}>{label}</span>
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

function TaskSidebar ({ tasks, events, taskFilter, onTaskClick }:
  { tasks: Task[]; events: TrackedEvent[]; taskFilter: string | null; onTaskClick: (key: string) => void }) {
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
        <PlanGroup key={key} list={list} uncommitted={uncommitted}
          taskFilter={taskFilter} onTaskClick={onTaskClick} />
      ))}
      {showAll && doneGroups.length > 0 && (
        <div className="mt-3 border-t border-slate-800 pt-2">
          <button onClick={() => setDoneOpen(!doneOpen)}
            className="mb-1 flex w-full items-center gap-1 text-xs font-bold uppercase tracking-wide text-slate-500 hover:text-slate-300">
            {doneOpen ? "▾" : "▸"} Done ({doneGroups.length} plan{doneGroups.length === 1 ? "" : "s"})
          </button>
          {doneOpen && doneGroups.map(([key, list]) => (
            <PlanGroup key={key} list={list} uncommitted={uncommitted}
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

function PlanGroup ({ list, uncommitted, taskFilter, onTaskClick }:
  { list: Task[]; uncommitted: Map<string, number>; taskFilter: string | null;
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

function ChangesView ({ events, tasks, repos, taskFilter, onClearFilter, onPicked }:
  { events: TrackedEvent[]; tasks: Task[]; repos: Repo[]; taskFilter: string | null;
    onClearFilter: () => void; onPicked: () => void }) {
  const needsPick = events.filter((e) => e.mode === "AMBIGUOUS" || e.mode === "UNKNOWN");
  const attributed = events.filter((e) => e.mode !== "AMBIGUOUS" && e.mode !== "UNKNOWN");
  const byTask = useMemo(() => {
    const groups = new Map<string, TrackedEvent[]>();
    for (const e of attributed) {
      const key = `${e.repo_id}|${e.task_ref ?? "(no task)"}`;
      groups.set(key, [...(groups.get(key) ?? []), e]);
    }
    return groups;
  }, [attributed]);
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

  return (
    <div className="space-y-6">
      {/* P11: this section is NEVER filtered - it needs action. */}
      <PickSection events={needsPick} tasks={tasks} onPicked={onPicked} />

      <section>
        <h2 className="mb-2 border-l-4 border-sky-500 pl-2 text-sm font-bold text-slate-200">
          Uncommitted changes grouped by task
        </h2>
        {taskFilter && (
          <div className="mb-2 flex items-center gap-2 text-xs">
            <span className="rounded bg-sky-900 px-2 py-0.5 text-sky-200">
              filtered: {taskFilter.split("|").slice(1).join("|")}
            </span>
            <button onClick={onClearFilter} className="text-sky-400 hover:underline">✕ clear</button>
          </div>
        )}
        {groupEntries.length === 0 && (
          <p className="text-sm text-slate-400">
            {taskFilter
              ? "No uncommitted changes for this task."
              : "No uncommitted tracked changes — repo is clean or no edits captured yet."}
          </p>
        )}
        {groupEntries.map(([key, group]) => {
          const task = taskByKey.get(key);
          const ref = key.split("|").slice(1).join("|");
          return (
            <TaskGroup key={key} refLabel={ref} repoId={group[0].repo_id} group={group}
              why={task?.why} repos={repos}
              planFileSet={planFilesByRepo.get(group[0].repo_id)} />
          );
        })}
      </section>
    </div>
  );
}

// D8: plan-file edits collapse to one expandable line inside each group.
function TaskGroup ({ refLabel, repoId, group, why, repos, planFileSet }:
  { refLabel: string; repoId: string; group: TrackedEvent[]; why?: string;
    repos: Repo[]; planFileSet?: Set<string> }) {
  const [showPlanEdits, setShowPlanEdits] = useState(false);
  const planEdits = group.filter((e) => planFileSet?.has(e.file));
  const normal = group.filter((e) => !planFileSet?.has(e.file));
  return (
    <div className="mb-4 rounded border border-slate-700 bg-slate-900 p-3">
      <div className="flex items-baseline gap-2">
        {/* F48: task-ref link "<plan filename> - <task id>" */}
        <span className="font-mono text-sm font-semibold text-sky-300">{refLabel}</span>
        <span className="text-[11px] text-slate-500">{repoId}</span>
      </div>
      {why && <p className="mt-1 text-xs text-slate-400">Why: {why}</p>}
      <div className="mt-2 space-y-1">
        {normal.map((e) => <EventRow key={e.id} event={e} repos={repos} />)}
        {planEdits.length > 0 && (
          <div className="rounded bg-slate-800/40 px-2 py-1">
            <button onClick={() => setShowPlanEdits(!showPlanEdits)}
              className="text-[11px] text-slate-400 hover:text-slate-200">
              {showPlanEdits ? "▾" : "▸"} {planEdits.length} plan-file edit{planEdits.length === 1 ? "" : "s"} · latest {fmtRel(planEdits[0].ts)}
            </button>
            {showPlanEdits && (
              <div className="mt-1 space-y-1">
                {planEdits.map((e) => <EventRow key={e.id} event={e} repos={repos} />)}
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
function EventRow ({ event, repos, showRef }:
  { event: TrackedEvent; repos: Repo[]; showRef?: boolean }) {
  const [diff, setDiff] = useState<string | null>(null);
  const online = repos.some((r) => r.id === event.repo_id && !r.offline);
  return (
    <div className="rounded bg-slate-800/60 px-2 py-1">
      <div className="flex items-center gap-2 text-xs">
        <ModeBadge mode={event.mode} swept={event.swept === 1} />
        <span className="font-mono">{event.file}</span>
        {showRef && event.task_ref && (
          <span className="text-[11px] text-sky-300">{event.task_ref}</span>
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
      {diff !== null && (
        <pre className="mt-1 max-h-64 overflow-auto rounded bg-slate-950 p-2 text-[11px] leading-snug text-slate-300">
          {diff}
        </pre>
      )}
    </div>
  );
}

// History: commit -> events, paginated with LOAD-MORE (F38/F39) + diffs (B.8).
function HistoryView ({ repos }: { repos: Repo[] }) {
  const [repoId, setRepoId] = useState(repos[0]?.id ?? "");
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [exhausted, setExhausted] = useState(false);

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

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <h2 className="border-l-4 border-emerald-500 pl-2 text-sm font-bold text-slate-200">History</h2>
        <select value={repoId} onChange={(e) => setRepoId(e.target.value)}
          className="min-h-[28px] rounded bg-slate-800 px-2 py-1 text-xs">
          {repos.map((r) => <option key={r.id} value={r.id}>{r.id}</option>)}
        </select>
      </div>
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
