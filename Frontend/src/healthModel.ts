import type { HealthPayload } from "./api";

function isRecord (value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isCount (value: unknown): boolean {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isNullableText (value: unknown): boolean {
  return value === null || typeof value === "string";
}

function isIdentity (value: unknown): boolean {
  return typeof value === "string" && value.length > 0;
}

function isHealthPayload (value: unknown): value is HealthPayload {
  if (!isRecord(value)) return false;
  const { server, repos, activity, providers } = value;
  return isRecord(server)
    && typeof server.started_ts === "string" && Number.isFinite(Date.parse(server.started_ts))
    && (server.db_bytes === null || isCount(server.db_bytes))
    && isCount(server.watchers_alive) && isCount(server.watchers_total)
    && typeof server.hook_registered === "boolean" && typeof server.hook_settings_path === "string"
    && Array.isArray(repos) && repos.every((repo: unknown) => isRecord(repo)
      && isIdentity(repo.id) && typeof repo.offline === "boolean"
      && isNullableText(repo.last_event_ts) && isNullableText(repo.events_jsonl_mtime)
      && (repo.events_jsonl_bytes === null || isCount(repo.events_jsonl_bytes))
      && isCount(repo.warning_count))
    && (activity === undefined || activity === null || (isRecord(activity)
      && isCount(activity.pending) && isCount(activity.rejected)
      && isCount(activity.ignored_unscoped) && isCount(activity.registry_revision_mismatch)))
    && (providers === undefined || providers === null || (Array.isArray(providers)
      && providers.every((provider: unknown) => isRecord(provider)
        && isIdentity(provider.provider) && typeof provider.adapter_present === "boolean"
        && typeof provider.configuration_valid === "boolean"
        && typeof provider.configuration_state === "string"
        && typeof provider.recently_observed === "boolean"
        && isNullableText(provider.last_observed_at))));
}

/** Validate rendered fields; version and Chronicle keep their own safe decoders. */
export function decodeHealthPayload (value: unknown): HealthPayload | null {
  return isHealthPayload(value) ? value : null;
}

/** The backend reports only owned-worker state, not generated-site freshness. */
export type ChronicleWorkerState = "disabled" | "running" | "unavailable";

export type ChronicleHealthStatus =
  | { kind: "state"; state: ChronicleWorkerState }
  | { kind: "missing" }
  | { kind: "invalid" };

/** A false marker check cannot distinguish a missing line from unreadable settings. */
export function hookRegistrationLabel (registered: boolean): string {
  return registered ? "line present ✓" : "line not verified";
}

/** Decode the untrusted JSON boundary before displaying a positive state. */
export function decodeChronicleHealth (payload: unknown): ChronicleHealthStatus {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return { kind: "invalid" };
  }
  if (!Object.hasOwn(payload, "chronicle")) return { kind: "missing" };
  const chronicle = (payload as Record<string, unknown>).chronicle;
  if (chronicle === null || typeof chronicle !== "object" || Array.isArray(chronicle)) {
    return { kind: "invalid" };
  }
  const state = (chronicle as Record<string, unknown>).state;
  if (state === "disabled" || state === "running" || state === "unavailable") {
    return { kind: "state", state };
  }
  return { kind: "invalid" };
}
