import { useCallback, useEffect, useMemo, useState } from "react";
import { api, HistoryEntry, Repo, Task, TrackedEvent } from "./api";
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

  const visibleRepos = tab === "ALL" ? repos : repos.filter((r) => r.id === tab);
  const visibleTasks = tab === "ALL" ? tasks : tasks.filter((t) => t.repo === tab);
  const visibleEvents = tab === "ALL" ? events : events.filter((e) => e.repo_id === tab);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-slate-800 bg-slate-900 px-4 py-2">
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
          </div>
        </div>
        <StatusBar repos={visibleRepos} />
      </header>

      {error && (
        <div className="bg-red-900/60 px-4 py-2 text-sm text-red-200">
          Server unreachable: {error} (auto-reconnecting...)
        </div>
      )}

      <WarningsBanner repos={visibleRepos} dismissed={dismissedWarnings}
        onDismiss={(key) => setDismissedWarnings(new Set(dismissedWarnings).add(key))} />

      <div className="flex flex-1 overflow-hidden">
        <TaskSidebar tasks={visibleTasks} />
        <main className="flex-1 overflow-y-auto p-4">
          {view === "changes"
            ? <ChangesView events={visibleEvents} tasks={visibleTasks} repos={repos} onPicked={sync} />
            : <HistoryView repos={visibleRepos.filter((r) => !r.offline)} />}
        </main>
      </div>
    </div>
  );
}

function TabButton ({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick}
      className={`rounded px-3 py-1 text-sm ${active ? "bg-sky-700 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>
      {label}
    </button>
  );
}

// Status bar: CLEAN / N uncommitted / OFFLINE (F46).
function StatusBar ({ repos }: { repos: Repo[] }) {
  return (
    <div className="mt-2 flex flex-wrap gap-3">
      {repos.map((r) => (
        <div key={r.id} className="flex items-center gap-2 rounded bg-slate-800 px-3 py-1 text-sm">
          <span className="font-medium">{r.id}</span>
          {r.offline ? (
            <span className="rounded bg-zinc-600 px-2 py-0.5 text-xs font-bold">OFFLINE</span>
          ) : r.clean ? (
            <span className="rounded bg-emerald-700 px-2 py-0.5 text-xs font-bold">CLEAN ✓</span>
          ) : (
            <span className="rounded bg-amber-600 px-2 py-0.5 text-xs font-bold">
              {r.count} uncommitted change{r.count === 1 ? "" : "s"}
            </span>
          )}
        </div>
      ))}
      {repos.length === 0 && <span className="text-sm text-slate-500">No repos configured.</span>}
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

const STATUS_CHIP: Record<Task["status"], string> = {
  "pending": "bg-slate-600",
  "in-progress": "bg-sky-600",
  "done": "bg-emerald-700",
};

function TaskSidebar ({ tasks }: { tasks: Task[] }) {
  return (
    <aside className="w-72 shrink-0 overflow-y-auto border-r border-slate-800 bg-slate-900 p-3">
      <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Plan tasks</h2>
      {tasks.length === 0 && (
        <p className="text-xs text-slate-500">No tasks — author a plan in temp/Plan/.</p>
      )}
      {tasks.map((t) => (
        <div key={`${t.repo}|${t.task_ref}`} className="mb-2 rounded bg-slate-800 p-2">
          <div className="flex items-center gap-2">
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold text-white ${STATUS_CHIP[t.status]}`}>
              {t.status}
            </span>
            <span className="text-xs font-semibold text-sky-300">{t.task_id}</span>
            <span className="ml-auto text-[10px] text-slate-500">{t.repo}</span>
          </div>
          <div className="mt-1 text-xs text-slate-200">{t.title}</div>
          <div className="text-[10px] text-slate-500">{t.plan_file}</div>
        </div>
      ))}
    </aside>
  );
}

const MODE_BADGE: Record<TrackedEvent["mode"], { label: string; cls: string }> = {
  B: { label: "B declared", cls: "bg-emerald-700" },
  A_SCOPED: { label: "A scoped", cls: "bg-sky-700" },
  A_GLOBAL: { label: "A global", cls: "bg-sky-800" },
  AMBIGUOUS: { label: "AMBIGUOUS", cls: "bg-amber-600" },
  UNKNOWN: { label: "UNKNOWN", cls: "bg-amber-700" },
  MANUAL: { label: "manual", cls: "bg-purple-700" },
};

function ChangesView ({ events, tasks, repos, onPicked }:
  { events: TrackedEvent[]; tasks: Task[]; repos: Repo[]; onPicked: () => void }) {
  const needsPick = events.filter((e) => e.mode === "AMBIGUOUS" || e.mode === "UNKNOWN");
  const attributed = events.filter((e) => e.mode !== "AMBIGUOUS" && e.mode !== "UNKNOWN");
  const byTask = useMemo(() => {
    const groups = new Map<string, TrackedEvent[]>();
    for (const e of attributed) {
      const key = e.task_ref ?? "(no task)";
      groups.set(key, [...(groups.get(key) ?? []), e]);
    }
    return groups;
  }, [attributed]);
  const taskByRef = useMemo(
    () => new Map(tasks.map((t) => [`${t.repo}|${t.task_ref}`, t])),
    [tasks],
  );

  return (
    <div className="space-y-6">
      {needsPick.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-bold text-amber-400">
            Needs attention — manual pick ({needsPick.length})
          </h2>
          {needsPick.map((e) => (
            <PickRow key={e.id} event={e} tasks={tasks} onPicked={onPicked} />
          ))}
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-bold text-slate-300">
          Uncommitted changes grouped by task
        </h2>
        {byTask.size === 0 && (
          <p className="text-sm text-slate-500">
            No uncommitted tracked changes — repo is clean or no edits captured yet.
          </p>
        )}
        {[...byTask.entries()].map(([ref, group]) => {
          const task = taskByRef.get(`${group[0].repo_id}|${ref}`);
          return (
            <div key={ref} className="mb-4 rounded border border-slate-800 bg-slate-900 p-3">
              <div className="flex items-baseline gap-2">
                {/* F48: task-ref link "<plan filename> - <task id>" */}
                <span className="font-mono text-sm font-semibold text-sky-300">{ref}</span>
                <span className="text-[10px] text-slate-500">{group[0].repo_id}</span>
              </div>
              {task && <p className="mt-1 text-xs text-slate-400">Why: {task.why}</p>}
              <div className="mt-2 space-y-1">
                {group.map((e) => <EventRow key={e.id} event={e} repos={repos} />)}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}

function PickRow ({ event, tasks, onPicked }:
  { event: TrackedEvent; tasks: Task[]; onPicked: () => void }) {
  // F17: AMBIGUOUS -> candidates list; UNKNOWN -> ALL repo tasks.
  const candidates: string[] = event.candidates_json
    ? JSON.parse(event.candidates_json)
    : tasks.filter((t) => t.repo === event.repo_id).map((t) => t.task_ref);
  const [choice, setChoice] = useState("");

  return (
    <div className="mb-2 flex flex-wrap items-center gap-2 rounded border border-amber-700/50 bg-slate-900 p-2 text-sm">
      <ModeBadge mode={event.mode} />
      <span className="font-mono text-xs">{event.file}</span>
      <span className="text-[10px] text-slate-500">{event.repo_id} · {event.ts}</span>
      {candidates.length === 0 ? (
        /* F49: zero-task guidance instead of an empty dropdown */
        <span className="text-xs italic text-slate-400">
          No tasks defined — author a plan in temp/Plan/ of this repo; the event stays here and
          becomes pickable once tasks exist.
        </span>
      ) : (
        <>
          <select value={choice} onChange={(e) => setChoice(e.target.value)}
            className="rounded bg-slate-800 px-2 py-1 text-xs">
            <option value="">— pick the task —</option>
            {candidates.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button disabled={!choice}
            onClick={async () => { await api.pickTask(event.id, choice); onPicked(); }}
            className="rounded bg-sky-700 px-2 py-1 text-xs font-semibold disabled:opacity-40">
            Assign
          </button>
        </>
      )}
    </div>
  );
}

function ModeBadge ({ mode, swept }: { mode: TrackedEvent["mode"]; swept?: boolean }) {
  const badge = MODE_BADGE[mode];
  return (
    <span className="flex gap-1">
      <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold text-white ${badge.cls}`}>
        {badge.label}
      </span>
      {/* F48: indirect badge on swept events */}
      {swept && (
        <span className="rounded bg-zinc-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
          indirect
        </span>
      )}
    </span>
  );
}

function EventRow ({ event, repos }: { event: TrackedEvent; repos: Repo[] }) {
  const [diff, setDiff] = useState<string | null>(null);
  const online = repos.some((r) => r.id === event.repo_id && !r.offline);
  return (
    <div className="rounded bg-slate-800/60 px-2 py-1">
      <div className="flex items-center gap-2 text-xs">
        <ModeBadge mode={event.mode} swept={event.swept === 1} />
        <span className="font-mono">{event.file}</span>
        <span className="text-[10px] text-slate-500">{event.tool} · {event.ts}</span>
        {online && (
          <button className="ml-auto text-[10px] text-sky-400 hover:underline"
            onClick={async () => {
              if (diff !== null) { setDiff(null); return; }
              try { setDiff((await api.diff(event.repo_id, event.file)).diff); }
              catch (exc) { setDiff(String(exc)); }
            }}>
            {diff === null ? "diff" : "hide"}
          </button>
        )}
      </div>
      {diff !== null && (
        <pre className="mt-1 max-h-64 overflow-auto rounded bg-slate-950 p-2 text-[10px] leading-tight text-slate-300">
          {diff}
        </pre>
      )}
    </div>
  );
}

// History: commit -> events, paginated with LOAD-MORE (F38/F39).
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
        <h2 className="text-sm font-bold text-slate-300">History</h2>
        <select value={repoId} onChange={(e) => setRepoId(e.target.value)}
          className="rounded bg-slate-800 px-2 py-1 text-xs">
          {repos.map((r) => <option key={r.id} value={r.id}>{r.id}</option>)}
        </select>
      </div>
      {entries.map(({ commit, events }) => (
        <div key={commit.hash} className="mb-3 rounded border border-slate-800 bg-slate-900 p-3">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-xs text-emerald-400">{commit.hash.slice(0, 10)}</span>
            <span className="text-sm">{commit.message}</span>
            <span className="ml-auto text-[10px] text-slate-500">{commit.ts}</span>
          </div>
          <div className="mt-2 space-y-1">
            {events.length === 0 && (
              <p className="text-[11px] text-slate-500">No tracked events in this commit.</p>
            )}
            {events.map((e) => (
              <div key={e.id} className="flex items-center gap-2 text-xs">
                <ModeBadge mode={e.mode} swept={e.swept === 1} />
                <span className="font-mono">{e.file}</span>
                <span className="text-[10px] text-sky-300">{e.task_ref ?? ""}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
      {entries.length === 0 && <p className="text-sm text-slate-500">No commits captured yet.</p>}
      {!exhausted && entries.length > 0 && (
        <button onClick={() => void load(repoId, entries.length)}
          className="rounded bg-slate-800 px-3 py-1 text-xs hover:bg-slate-700">
          Load more (older)
        </button>
      )}
    </div>
  );
}
