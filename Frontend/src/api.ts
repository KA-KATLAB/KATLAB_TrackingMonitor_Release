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
  commit: { hash: string; message: string; ts: string; files_json: string };
  events: TrackedEvent[];
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
  repos: () => call<Repo[]>("/api/repos"),
  tasks: (repo?: string) => call<Task[]>(`/api/tasks${repo ? `?repo=${repo}` : ""}`),
  events: (params: { repo?: string; uncommitted?: boolean; limit?: number; offset?: number;
    session?: string; file?: string; since?: string; until?: string }) => {
    const q = new URLSearchParams();
    if (params.repo) q.set("repo", params.repo);
    if (params.session) q.set("session", params.session); // v0.1.6.0 D3 (C.3)
    if (params.file) q.set("file", params.file); // v0.1.7.0 D2 (A.2)
    if (params.since) q.set("since", params.since); // v0.1.8.0 D1 (A.1)
    if (params.until) q.set("until", params.until); // v0.1.8.0 D1 (A.1)
    if (params.uncommitted) q.set("uncommitted", "true");
    q.set("limit", String(params.limit ?? 500));
    q.set("offset", String(params.offset ?? 0));
    return call<TrackedEvent[]>(`/api/events?${q}`);
  },
  history: (repo: string, limit = 500, offset = 0) =>
    call<HistoryEntry[]>(`/api/history?repo=${repo}&limit=${limit}&offset=${offset}`),
  stats: (repo?: string) =>
    call<import("./charts").StatsData>(`/api/stats${repo ? `?repo=${encodeURIComponent(repo)}` : ""}`),
  diff: (repo: string, file: string, commit?: string | null) =>
    call<{ file: string; diff: string }>(
      `/api/diff?repo=${encodeURIComponent(repo)}&file=${encodeURIComponent(file)}` +
      (commit ? `&commit=${encodeURIComponent(commit)}` : ""),
    ),
  pickTask: (eventId: number, taskRef: string) =>
    call<TrackedEvent>(`/api/events/${eventId}/task`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task_ref: taskRef }),
    }),
};
