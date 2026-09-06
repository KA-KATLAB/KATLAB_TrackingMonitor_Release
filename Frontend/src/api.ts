// REST client - UM envelope {success, data, message, timestamp}.

export interface Repo {
  id: string;
  name: string;
  path: string;
  clean: boolean;
  count: number;
  offline: boolean;
  warnings: { ts: string; message: string }[];
  last_event_ts: string | null;         // v0.1.2.0 D9 heartbeat
  branch: string | null;                // v0.1.6.0 D2: current git branch (null = unknown/offline)
  oldest_uncommitted_ts: string | null; // v0.1.6.0 D4: uncommitted-age nudge source
  activity_buckets: number[]; // v0.1.3.0 D3/R8/R16: 12x5-min for the sparkline
}

// v0.2.3.0 D2 (B.2): the /api/health payload — nullables mirror the
// route's guarded stats; mtime is ISO-Z, comparable with last_event_ts.
export interface HealthServer {
  version: string;
  started_ts: string;
  db_bytes: number | null;
  watchers_alive: number;
  watchers_total: number;
  hook_registered: boolean;
  hook_settings_path: string;
}
export interface HealthRepo {
  id: string;
  offline: boolean;
  last_event_ts: string | null;
  events_jsonl_bytes: number | null;
  events_jsonl_mtime: string | null;
  warning_count: number;
}
export interface HealthPayload {
  server: HealthServer;
  repos: HealthRepo[];
}

export interface Task {
  repo: string;
  plan_file: string;
  task_id: string;
  task_ref: string;
  title: string;
  status: "pending" | "in-progress" | "done";
  files: string[];
  why: string;
  last_event_ts: string | null; // v0.1.6.0 D4: idle-task nudge source
}

export interface TrackedEvent {
  id: number;
  repo_id: string;
  ts: string;
  tool: string;
  file: string;
  task_ref: string | null;
  mode: "B" | "A_SCOPED" | "A_GLOBAL" | "AMBIGUOUS" | "UNKNOWN" | "MANUAL";
  candidates_json: string | null;
  commit_hash: string | null;
  swept: number;
  session_id: string | null; // v0.1.5.0 D1: Claude session (null = pre-upgrade/unknown)
  branch: string | null;     // v0.1.6.0 D2: branch at capture (null = pre-upgrade/unknown)
}

export interface HistoryEntry {
  commit: { hash: string; message: string; ts: string; files_json: string;
    // v0.1.9.0 A.1: raw %P — space-separated full parent hashes;
    // "" = root commit, null = pre-upgrade row (older than the backfill window)
    parents: string | null };
  events: TrackedEvent[];
}

export const USER_ACTION_TIMEOUT_MS = 10_000;

export interface ActionDeadline {
  controller: AbortController;
  signal: AbortSignal;
  deadlineAt: number;
  didTimeout: () => boolean;
  clear: () => void;
}

export function createActionDeadline (
  timeoutMs = USER_ACTION_TIMEOUT_MS,
): ActionDeadline {
  const controller = new AbortController();
  const deadlineAt = Date.now() + timeoutMs;
  let timedOut = false;
  let cleared = false;
  const timer = window.setTimeout(() => {
    if (cleared) return;
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  return {
    controller,
    signal: controller.signal,
    deadlineAt,
    didTimeout: () => timedOut,
    clear: () => {
      if (cleared) return;
      cleared = true;
      window.clearTimeout(timer);
    },
  };
}

export function abortError (): DOMException {
  return new DOMException("The operation was aborted.", "AbortError");
}

export function isAbortError (error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

export function remainingDeadlineMs (deadlineAt: number): number {
  return Math.max(0, deadlineAt - Date.now());
}

/** Race an unabortable stage (for example dynamic import/render) against a signal. */
export function raceWithSignal<T> (promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError());
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

async function call<T> (url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json();
  if (!response.ok || body.success === false) {
    throw new Error(body.message || `${response.status} ${url}`);
  }
  return body.data as T;
}

export const api = {
  repos: (signal?: AbortSignal) => call<Repo[]>("/api/repos", { signal }),
  health: (signal?: AbortSignal) => call<HealthPayload>("/api/health", { signal }), // v0.2.3.0 D2 (B.2)
  tasks: (repo?: string, signal?: AbortSignal) => {
    const q = new URLSearchParams();
    if (repo) q.set("repo", repo);
    return call<Task[]>(`/api/tasks${q.size > 0 ? `?${q}` : ""}`, { signal });
  },
  events: (params: { repo?: string; uncommitted?: boolean; limit?: number; offset?: number;
    session?: string; file?: string; since?: string; until?: string }, signal?: AbortSignal) => {
    const q = new URLSearchParams();
    if (params.repo) q.set("repo", params.repo);
    if (params.session) q.set("session", params.session); // v0.1.6.0 D3 (C.3)
    if (params.file) q.set("file", params.file); // v0.1.7.0 D2 (A.2)
    if (params.since) q.set("since", params.since); // v0.1.8.0 D1 (A.1)
    if (params.until) q.set("until", params.until); // v0.1.8.0 D1 (A.1)
    if (params.uncommitted) q.set("uncommitted", "true");
    q.set("limit", String(params.limit ?? 500));
    q.set("offset", String(params.offset ?? 0));
    return call<TrackedEvent[]>(`/api/events?${q}`, { signal });
  },
  history: (repo: string, limit = 500, offset = 0, signal?: AbortSignal) => {
    const q = new URLSearchParams({ repo, limit: String(limit), offset: String(offset) });
    return call<HistoryEntry[]>(`/api/history?${q}`, { signal });
  },
  stats: (repo?: string, signal?: AbortSignal) => {
    const q = new URLSearchParams();
    if (repo) q.set("repo", repo);
    return call<import("./charts").StatsData>(`/api/stats${q.size > 0 ? `?${q}` : ""}`, { signal });
  },
  diff: (repo: string, file: string, commit?: string | null, signal?: AbortSignal) =>
    call<{ file: string; diff: string }>(
      `/api/diff?repo=${encodeURIComponent(repo)}&file=${encodeURIComponent(file)}` +
      (commit ? `&commit=${encodeURIComponent(commit)}` : ""),
      { signal },
    ),
  pickTask: (eventId: number, taskRef: string, signal?: AbortSignal) =>
    call<TrackedEvent>(`/api/events/${eventId}/task`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task_ref: taskRef }),
      signal,
    }),
};
