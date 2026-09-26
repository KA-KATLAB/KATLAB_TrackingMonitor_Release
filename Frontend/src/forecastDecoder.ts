import type {
  ForecastItem,
  ForecastMode,
  ForecastRepo,
  ForecastScope,
  ForecastTaskIdentity,
} from "./api";

export type ForecastDecodeResult =
  | { tag: "ready"; forecast_scope: ForecastScope; forecast: ForecastRepo[] }
  | { tag: "old-server" }
  | { tag: "unavailable" };

const MODES: readonly ForecastMode[] = [
  "B", "A_SCOPED", "A_GLOBAL", "AMBIGUOUS", "UNKNOWN",
];
const SCOPE_KEYS = ["total_repos", "returned_repos", "truncated"] as const;
const REPO_KEYS = ["repo", "source", "state", "reason", "observed_at",
  "plan_context_at", "plan_context_state", "branch", "total_paths",
  "mode_counts", "items"] as const;
const ITEM_KEYS = ["file", "mode", "target", "candidate_count",
  "candidates", "candidates_truncated"] as const;
const IDENTITY_KEYS = ["plan_file", "task_id"] as const;
const REASONS = new Set(["offline", "status_unavailable", "too_many_paths",
  "too_much_work", "plan_context_unavailable", "busy"]);
const MAX_JSON_BYTES = 2 * 1024 * 1024;
const encoder = new TextEncoder();

function record (value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// Enumerate only until a missing or extra additive key is established.
function exactKeys (value: unknown, expected: readonly string[]): value is Record<string, unknown> {
  if (!record(value)) return false;
  const keys = new Set(expected);
  let count = 0;
  for (const key in value) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    if (++count > expected.length || !keys.has(key)) return false;
  }
  return count === expected.length && expected.every(
    (key) => Object.prototype.hasOwnProperty.call(value, key),
  );
}

function nonnegativeInteger (value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function hasUnpairedSurrogate (value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      if (++i >= value.length) return true;
      const low = value.charCodeAt(i);
      if (low < 0xdc00 || low > 0xdfff) return true;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

function boundedIdentity (value: unknown, maxBytes: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxBytes
    && !hasUnpairedSurrogate(value) && encoder.encode(value).length <= maxBytes;
}

function repoId (value: unknown): value is string {
  return typeof value === "string" && value.length > 0
    && value.length <= MAX_JSON_BYTES && /^[A-Za-z0-9_-]+$/.test(value)
    && encoder.encode(value).length <= MAX_JSON_BYTES;
}

function path (value: unknown, maxBytes: number): value is string {
  if (!boundedIdentity(value, maxBytes)) return false;
  return !/[\u0000-\u001f\u007f\\]/u.test(value)
    && !value.startsWith("/") && !/^[A-Za-z]:/.test(value)
    && value.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}

function taskId (value: unknown): value is string {
  if (!boundedIdentity(value, 128)) return false;
  return value[0] !== " " && value[value.length - 1] !== " "
    && !/[\u0000-\u001f\u007f]/u.test(value);
}

function taskIdentity (value: unknown): value is ForecastTaskIdentity {
  return exactKeys(value, IDENTITY_KEYS)
    && path(value.plan_file, 2048) && taskId(value.task_id);
}

// The display reference may collide; this relational pair cannot.
export function forecastCandidateKey (identity: ForecastTaskIdentity): string {
  return JSON.stringify([identity.plan_file, identity.task_id]);
}

function timestamp (value: unknown): value is string {
  if (typeof value !== "string" || value.length < 20 || value.length > 27) return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?Z$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (year < 1 || month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) {
    return false;
  }
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= monthDays[month - 1];
}

function item (value: unknown): value is ForecastItem {
  if (!exactKeys(value, ITEM_KEYS) || !path(value.file, 4096)
      || !MODES.includes(value.mode as ForecastMode)
      || !nonnegativeInteger(value.candidate_count)
      || !Array.isArray(value.candidates) || value.candidates.length > 10
      || typeof value.candidates_truncated !== "boolean") return false;
  if (value.mode === "AMBIGUOUS") {
    if (value.target !== null || value.candidate_count < 2 || value.candidate_count > 256
        || value.candidates.length !== Math.min(value.candidate_count, 10)
        || value.candidates_truncated !== (value.candidate_count > 10)) return false;
    const seen = new Set<string>();
    for (const candidate of value.candidates) {
      if (!taskIdentity(candidate)) return false;
      const key = forecastCandidateKey(candidate);
      if (seen.has(key)) return false;
      seen.add(key);
    }
    return true;
  }
  if (value.candidate_count !== 0 || value.candidates.length !== 0
      || value.candidates_truncated !== false) return false;
  return value.mode === "UNKNOWN" ? value.target === null : taskIdentity(value.target);
}

function branch (value: unknown): value is string | null {
  return value === null || (typeof value === "string" && value.length <= MAX_JSON_BYTES
    && encoder.encode(value).length <= MAX_JSON_BYTES);
}

function repo (value: unknown): value is ForecastRepo {
  if (!exactKeys(value, REPO_KEYS) || !repoId(value.repo)
      || (value.source !== "working_tree" && value.source !== "demo")
      || (value.state !== "ready" && value.state !== "unavailable")
      || !branch(value.branch) || !Array.isArray(value.items)
      || value.items.length > 1000) return false;
  if (value.state === "unavailable") {
    if (typeof value.reason !== "string" || !REASONS.has(value.reason)
        || value.plan_context_at !== null || value.plan_context_state !== null
        || value.total_paths !== null || value.mode_counts !== null
        || value.items.length !== 0) return false;
    return value.reason === "offline" || value.reason === "status_unavailable"
      ? value.observed_at === null && value.branch === null
      : timestamp(value.observed_at);
  }
  if (value.reason !== null || !timestamp(value.observed_at)
      || !timestamp(value.plan_context_at)
      || (value.plan_context_state !== "valid" && value.plan_context_state !== "warning")
      || !nonnegativeInteger(value.total_paths) || value.total_paths !== value.items.length
      || !exactKeys(value.mode_counts, MODES)) return false;
  const counts = value.mode_counts;
  const histogram: Record<ForecastMode, number> = {
    B: 0, A_SCOPED: 0, A_GLOBAL: 0, AMBIGUOUS: 0, UNKNOWN: 0,
  };
  const seen = new Set<string>();
  for (const entry of value.items) {
    if (!item(entry) || seen.has(entry.file)) return false;
    seen.add(entry.file);
    histogram[entry.mode]++;
  }
  return MODES.every((mode) => nonnegativeInteger(counts[mode])
    && counts[mode] === histogram[mode]);
}

function decode (payload: unknown): ForecastDecodeResult {
  if (!record(payload)) return { tag: "unavailable" };
  const hasScope = Object.prototype.hasOwnProperty.call(payload, "forecast_scope");
  const hasForecast = Object.prototype.hasOwnProperty.call(payload, "forecast");
  if (!hasScope && !hasForecast) return { tag: "old-server" };
  if (!hasScope || !hasForecast || !record(payload.scope)) return { tag: "unavailable" };
  const missionScope = payload.scope;
  if (missionScope.kind !== "all" && missionScope.kind !== "repo") {
    return { tag: "unavailable" };
  }
  if (missionScope.kind === "all" ? missionScope.repo !== null : !repoId(missionScope.repo)) {
    return { tag: "unavailable" };
  }
  const forecastScope = payload.forecast_scope;
  const forecast = payload.forecast;
  if (!exactKeys(forecastScope, SCOPE_KEYS) || !Array.isArray(forecast)
      || forecast.length > 4
      || !nonnegativeInteger(forecastScope.total_repos)
      || !nonnegativeInteger(forecastScope.returned_repos)
      || forecastScope.returned_repos !== forecast.length
      || typeof forecastScope.truncated !== "boolean"
      || forecastScope.truncated !== (forecastScope.returned_repos < forecastScope.total_repos)) {
    return { tag: "unavailable" };
  }
  if (missionScope.kind === "repo") {
    if (forecastScope.total_repos !== 1 || forecastScope.returned_repos !== 1
        || forecastScope.truncated) return { tag: "unavailable" };
  } else if (forecastScope.returned_repos !== Math.min(forecastScope.total_repos, 4)) {
    return { tag: "unavailable" };
  }
  const seenRepos = new Set<string>();
  let readyItems = 0;
  let jsonBytes = encoder.encode(JSON.stringify({ forecast_scope: forecastScope, forecast: [] })).length;
  if (jsonBytes > MAX_JSON_BYTES) return { tag: "unavailable" };
  for (const row of forecast) {
    if (!repo(row) || seenRepos.has(row.repo)) return { tag: "unavailable" };
    seenRepos.add(row.repo);
    if (missionScope.kind === "repo" && row.repo !== missionScope.repo) {
      return { tag: "unavailable" };
    }
    readyItems += row.items.length;
    if (readyItems > 2000) return { tag: "unavailable" };
    // Each skeleton already contains an empty items array; item strings and
    // separators are the only extra bytes needed for the exact JSON size.
    jsonBytes += (seenRepos.size > 1 ? 1 : 0)
      + encoder.encode(JSON.stringify({ ...row, items: [] })).length;
    if (jsonBytes > MAX_JSON_BYTES) return { tag: "unavailable" };
    for (let index = 0; index < row.items.length; index++) {
      jsonBytes += (index > 0 ? 1 : 0)
        + encoder.encode(JSON.stringify(row.items[index])).length;
      if (jsonBytes > MAX_JSON_BYTES) return { tag: "unavailable" };
    }
  }
  return {
    tag: "ready",
    forecast_scope: forecastScope as unknown as ForecastScope,
    forecast: forecast as ForecastRepo[],
  };
}

export function decodeForecast (payload: unknown): ForecastDecodeResult {
  try {
    return decode(payload);
  } catch {
    return { tag: "unavailable" };
  }
}
