// REST client - UM envelope {success, data, message, timestamp}.

export interface Repo {
  id: string;
  name: string;
  path: string;
  clean: boolean;
  count: number;
  offline: boolean;
  warnings: { ts: string; message: string }[];
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
  events: (params: { repo?: string; uncommitted?: boolean; limit?: number; offset?: number }) => {
    const q = new URLSearchParams();
    if (params.repo) q.set("repo", params.repo);
    if (params.uncommitted) q.set("uncommitted", "true");
    q.set("limit", String(params.limit ?? 500));
    q.set("offset", String(params.offset ?? 0));
    return call<TrackedEvent[]>(`/api/events?${q}`);
  },
  history: (repo: string, limit = 500, offset = 0) =>
    call<HistoryEntry[]>(`/api/history?repo=${repo}&limit=${limit}&offset=${offset}`),
  diff: (repo: string, file: string) =>
    call<{ file: string; diff: string }>(
      `/api/diff?repo=${encodeURIComponent(repo)}&file=${encodeURIComponent(file)}`,
    ),
  pickTask: (eventId: number, taskRef: string) =>
    call<TrackedEvent>(`/api/events/${eventId}/task`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task_ref: taskRef }),
    }),
};
