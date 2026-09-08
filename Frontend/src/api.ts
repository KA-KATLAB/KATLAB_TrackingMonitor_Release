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
  status_valid: boolean;
  paths_complete: boolean;
  observed_at: string | null;
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
export interface HealthActivity {
  pending: number;
  rejected: number;
  ignored_unscoped: number;
  registry_revision_mismatch: number;
}
export interface ProviderHealth {
  provider: EventProvider;
  adapter_present: boolean;
  configuration_valid: boolean;
  configuration_state: string;
  recently_observed: boolean;
  last_observed_at: string | null;
}
export interface HealthPayload {
  server: HealthServer;
  repos: HealthRepo[];
  // Optional only at the live rollout boundary: an older server can briefly
  // serve newly built frontend assets until TrackingMonitor is restarted.
  activity?: HealthActivity;
  providers?: ProviderHealth[];
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

export type EventProvider = "claude" | "codex";

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
  session_id: string | null; // provider-scoped session (null = pre-upgrade/unknown)
  branch: string | null;     // v0.1.6.0 D2: branch at capture (null = pre-upgrade/unknown)
  provider: EventProvider | null; // null is accepted from legacy history rows as Claude
  turn_id: string | null;
  agent_id: string | null;
  tool_use_id: string | null;
  operation: string | null;
  plan_file: string | null;
  task_id: string | null;
}

export type MissionState = "not_configured" | "planning" | "implementation"
  | "verification" | "blocked" | "ready_to_commit" | "verified_committed";
export type RequirementState = "missing" | "stale" | "incomplete" | "failed"
  | "unknown" | "finding" | "partial" | "passed";

export interface MissionReason {
  code: string;
  message: string;
  check_id: string | null;
  count: number | null;
}
export interface MissionRequirement {
  check_id: string;
  label: string;
  state: RequirementState;
  configuration_valid: boolean;
  evidence_sources: Array<"hook" | "manual">;
  check_revision: string | null;
  current: number | null;
  target: number | null;
  latest_outcome: string | null;
  evidence_id: number | null;
  observed_at: string | null;
  freshness_floor: string;
  reason_code: string | null;
}
export interface MissionPlan {
  repo: string;
  plan_file: string;
  label: string;
  revision: string;
  revision_at: string;
  parse_state: "valid" | "warning" | "fatal";
  task_counts: { total: number; pending: number; in_progress: number; done: number };
  current_task: { id: string; title: string } | null;
  state: MissionState;
  repo_status: {
    clean: boolean;
    count: number;
    offline: boolean;
    branch: string | null;
    status_valid: boolean;
    observed_at: string | null;
  };
  requirements: MissionRequirement[];
  blockers: MissionReason[];
  warnings: MissionReason[];
  unresolved_count: number;
}
export interface MissionPayload {
  scope: { kind: "all" | "repo"; repo: string | null };
  generated_at: string;
  summary: { total: number; states: Record<MissionState, number> };
  plans: MissionPlan[];
}

export type ActivityProvider = "claude" | "codex" | "manual";
export type ActivityKind = "session_start" | "session_end" | "turn_stop"
  | "turn_interrupt" | "agent_start" | "agent_stop" | "tool_finished"
  | "check_started" | "check_finished" | "review_result";
export type AssignmentMode = "NONE" | "UNASSIGNED" | "AUTO_ACTIVE"
  | "AUTO_VERIFYING" | "EXPLICIT_TARGET" | "MANUAL_ASSIGNMENT";
export interface ActivityAssignment {
  mode: AssignmentMode;
  repo: string | null;
  plan_file: string | null;
  task_ref: string | null;
  requirement_revision: string | null;
  plan_revision: string | null;
}
export interface ActivityItem {
  id: number;
  evidence_id: number;
  uid: string;
  schema_version: number;
  provider: ActivityProvider;
  evidence_source: "hook" | "manual";
  kind: ActivityKind;
  ts: string;
  delivery_class: "durable" | "best_effort";
  session_id: string | null;
  turn_id: string | null;
  agent_id: string | null;
  parent_agent_id: string | null;
  agent_type: string | null;
  model: string | null;
  permission_mode: string | null;
  tool_use_id: string | null;
  tool_name: string | null;
  tool_class: string | null;
  outcome: string | null;
  duration_ms: number | null;
  check_id: string | null;
  check_revision: string | null;
  repo_ids: string[];
  assignment_repo_ids: string[];
  original_assignment: ActivityAssignment;
  effective_assignment: ActivityAssignment;
  created_at: string;
}
export interface ActivityPage {
  items: ActivityItem[];
  total: number;
  limit: number;
  offset: number;
  order: "asc" | "desc";
}
export interface SessionSummary {
  provider: ActivityProvider;
  session_id: string;
  started_at: string;
  ended_at: string;
  event_count: number;
  agent_count: number;
  tool_count: number;
  check_count: number;
  delivery: "durable" | "best_effort" | "mixed";
  repo_ids: string[];
  repo_count: number;
}
export interface SessionPage {
  items: SessionSummary[];
  total: number;
  limit: number;
  offset: number;
  order: "asc" | "desc";
}
export interface EvidenceAssignmentResult {
  activity_id: number;
  assignment_id: number;
  effective_assignment: ActivityAssignment;
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
  events: (params: { repo?: string; provider?: EventProvider;
    uncommitted?: boolean; limit?: number; offset?: number;
    session?: string; file?: string; since?: string; until?: string }, signal?: AbortSignal) => {
    const q = new URLSearchParams();
    if (params.repo) q.set("repo", params.repo);
    if (params.provider) q.set("provider", params.provider);
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
  mission: (repo?: string, signal?: AbortSignal) => {
    const q = new URLSearchParams();
    if (repo) q.set("repo", repo);
    return call<MissionPayload>(`/api/mission${q.size > 0 ? `?${q}` : ""}`, { signal });
  },
  activity: (params: { repo?: string; provider?: ActivityProvider; session?: string;
    kind?: ActivityKind; check?: string; plan?: string; order?: "asc" | "desc";
    limit?: number; offset?: number }, signal?: AbortSignal) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) q.set(key, String(value));
    });
    return call<ActivityPage>(`/api/activity${q.size > 0 ? `?${q}` : ""}`, { signal });
  },
  sessions: (params: { repo?: string; provider?: ActivityProvider; session?: string;
    order?: "asc" | "desc"; limit?: number; offset?: number }, signal?: AbortSignal) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) q.set(key, String(value));
    });
    return call<SessionPage>(`/api/sessions${q.size > 0 ? `?${q}` : ""}`, { signal });
  },
  assignEvidence: (activityId: number, repo: string, planFile: string | null,
    signal?: AbortSignal) => call<EvidenceAssignmentResult>(
      `/api/activity/${activityId}/plan`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo, plan_file: planFile }),
        signal,
      },
    ),
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
