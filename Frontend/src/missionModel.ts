import type {
  ActivityItem,
  ActivityProvider,
  MissionPlan,
  MissionRequirement,
  MissionState,
  RequirementState,
  SessionSummary,
} from "./api";
import { sameSessionIdentity } from "./theme";
import type { SessionIdentity } from "./theme";

export type EvidenceFilter = "attention" | "unassigned" | "all";

export interface MissionEntryState {
  planKey: string | null;
  session: SessionIdentity | null;
  evidenceFilter: EvidenceFilter;
  cursor: number;
}

export const EMPTY_MISSION_ENTRY: MissionEntryState = {
  planKey: null,
  session: null,
  evidenceFilter: "attention",
  cursor: 0,
};

export function planKey (repo: string, planFile: string): string {
  return JSON.stringify([repo, planFile]);
}

export function planKeyParts (value: string | null): [string, string] | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) && parsed.length === 2
      && typeof parsed[0] === "string" && parsed[0].length > 0
      && typeof parsed[1] === "string" && parsed[1].length > 0
      ? [parsed[0], parsed[1]]
      : null;
  } catch {
    return null;
  }
}

const EVIDENCE_FILTERS = new Set<EvidenceFilter>(["attention", "unassigned", "all"]);
const ACTIVITY_PROVIDERS = new Set<ActivityProvider>(["claude", "codex", "manual"]);

export function normalizeMissionEntry (
  state: Partial<MissionEntryState> | null | undefined,
  scopedRepo?: string,
): MissionEntryState {
  const parts = planKeyParts(state?.planKey ?? null);
  const selectedPlan = parts && (!scopedRepo || parts[0] === scopedRepo)
    ? planKey(parts[0], parts[1])
    : null;
  const rawSession = state?.session;
  const session = rawSession
    && ACTIVITY_PROVIDERS.has(rawSession.provider)
    && typeof rawSession.sessionId === "string"
    && rawSession.sessionId.length > 0
    ? { provider: rawSession.provider, sessionId: rawSession.sessionId }
    : null;
  const evidenceFilter = state?.evidenceFilter
    && EVIDENCE_FILTERS.has(state.evidenceFilter)
    ? state.evidenceFilter
    : "attention";
  const cursor = typeof state?.cursor === "number" && Number.isFinite(state.cursor)
    ? Math.max(0, Math.floor(state.cursor))
    : 0;
  return { planKey: selectedPlan, session, evidenceFilter, cursor };
}

export function sameSession (
  value: SessionIdentity | null,
  row: Pick<SessionSummary, "provider" | "session_id">,
): boolean {
  return sameSessionIdentity(value, {
    provider: row.provider,
    sessionId: row.session_id,
  });
}

const ACTIVE_STATES = new Set<MissionState>([
  "implementation", "verification", "blocked", "ready_to_commit",
]);

export function spotlightPlan (plans: readonly MissionPlan[]): MissionPlan | null {
  const active = plans.filter((plan) => ACTIVE_STATES.has(plan.state));
  return active.length === 1 ? active[0] : null;
}

export interface StatePresentation {
  label: string;
  marker: string;
  tone: "neutral" | "live" | "success" | "warning" | "danger";
}

const MISSION_PRESENTATION: Record<MissionState, StatePresentation> = {
  not_configured: { label: "Not configured", marker: "○", tone: "neutral" },
  planning: { label: "Planning", marker: "◇", tone: "neutral" },
  implementation: { label: "Implementation", marker: "▶", tone: "live" },
  verification: { label: "Verification", marker: "◐", tone: "warning" },
  blocked: { label: "Blocked", marker: "!", tone: "danger" },
  ready_to_commit: { label: "Ready to commit", marker: "◆", tone: "success" },
  verified_committed: { label: "Verified + committed", marker: "✓", tone: "success" },
};

const REQUIREMENT_PRESENTATION: Record<RequirementState, StatePresentation> = {
  missing: { label: "Missing", marker: "○", tone: "warning" },
  stale: { label: "Stale", marker: "↻", tone: "warning" },
  incomplete: { label: "Incomplete", marker: "…", tone: "warning" },
  failed: { label: "Failed", marker: "×", tone: "danger" },
  unknown: { label: "Unknown", marker: "?", tone: "warning" },
  finding: { label: "Finding", marker: "!", tone: "danger" },
  partial: { label: "Partial", marker: "◐", tone: "live" },
  passed: { label: "Passed", marker: "✓", tone: "success" },
};

export function missionPresentation (state: MissionState): StatePresentation {
  return MISSION_PRESENTATION[state];
}

export function requirementPresentation (
  requirement: Pick<MissionRequirement, "state" | "current" | "target">,
): StatePresentation & { progress: string | null } {
  const presentation = REQUIREMENT_PRESENTATION[requirement.state];
  return {
    ...presentation,
    progress: requirement.target === null
      ? null
      : `${requirement.current ?? 0}/${requirement.target}`,
  };
}

export function attentionRequirements (
  requirements: readonly MissionRequirement[],
): MissionRequirement[] {
  return requirements.filter((requirement) => requirement.state !== "passed");
}

export function isEvidenceActivity (row: ActivityItem): boolean {
  return row.kind === "check_started" || row.kind === "check_finished"
    || row.kind === "review_result";
}

export function filterEvidence (
  rows: readonly ActivityItem[], filter: EvidenceFilter, plan?: MissionPlan | null,
): ActivityItem[] {
  const filtered = rows.filter((row) => {
    if (!isEvidenceActivity(row) || row.id !== row.evidence_id) return false;
    if (plan) {
      const assignment = row.effective_assignment;
      const belongsToPlan = assignment.mode === "UNASSIGNED"
        ? eligibleAssignmentPlans([plan], row).length === 1
        : assignment.repo === plan.repo && assignment.plan_file === plan.plan_file;
      if (!belongsToPlan) return false;
    }
    if (filter === "unassigned") {
      return row.effective_assignment.mode === "UNASSIGNED";
    }
    if (filter === "attention") {
      return row.effective_assignment.mode === "UNASSIGNED"
        || row.outcome === "fail" || row.outcome === "cancelled"
        || row.outcome === "finding" || row.outcome === "unknown"
        || row.kind === "check_started";
    }
    return true;
  });
  return sortActivity(filtered).reverse();
}

export function eligibleAssignmentPlans (
  plans: readonly MissionPlan[], row: ActivityItem,
): MissionPlan[] {
  if (!row.check_id) return [];
  const direct = new Set(row.assignment_repo_ids);
  return plans.filter((plan) => direct.has(plan.repo)
    && plan.parse_state === "valid"
    && plan.requirements.some((requirement) => requirement.check_id === row.check_id
      && requirement.configuration_valid
      && requirement.evidence_sources.includes(row.evidence_source)
      && (requirement.check_revision === null
        ? row.evidence_source === "manual"
        : row.check_revision === requirement.check_revision)));
}

export function sortActivity (rows: readonly ActivityItem[]): ActivityItem[] {
  return [...rows].sort((left, right) => {
    const time = left.ts.localeCompare(right.ts);
    return time !== 0 ? time : left.id - right.id;
  });
}

export function clampCursor (cursor: number, count: number): number {
  if (count <= 0 || !Number.isFinite(cursor)) return 0;
  return Math.min(count - 1, Math.max(0, Math.floor(cursor)));
}

export function formatDuration (durationMs: number | null): string {
  if (durationMs === null) return "not reported";
  if (durationMs < 1_000) return `${durationMs} ms`;
  const totalSeconds = Math.round(durationMs / 1_000);
  if (totalSeconds < 60) return `${(durationMs / 1_000).toFixed(1)} s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

export function activityLabel (row: ActivityItem): string {
  if (row.check_id) return `${row.kind.replaceAll("_", " ")}: ${row.check_id}`;
  if (row.tool_name) return `${row.kind.replaceAll("_", " ")}: ${row.tool_name}`;
  return row.kind.replaceAll("_", " ");
}

export function activityActor (row: ActivityItem): string {
  if (row.agent_id) {
    return row.agent_type ? `${row.agent_type} · ${row.agent_id}` : row.agent_id;
  }
  return "session root";
}

export interface FlightPoint {
  row: ActivityItem;
  index: number;
  position: number;
}

export interface FlightLane {
  id: string;
  label: string;
  parent: string;
  points: FlightPoint[];
}

export function buildFlightLanes (input: readonly ActivityItem[]): {
  rows: ActivityItem[];
  lanes: FlightLane[];
} {
  const rows = sortActivity(input);
  const epochs = rows.map((row) => Date.parse(row.ts));
  const finite = epochs.filter(Number.isFinite);
  const start = finite.length > 0 ? Math.min(...finite) : 0;
  const end = finite.length > 0 ? Math.max(...finite) : start;
  const span = Math.max(0, end - start);
  const lanes = new Map<string, FlightLane>();

  rows.forEach((row, index) => {
    const id = row.agent_id === null ? "root:" : `agent:${row.agent_id}`;
    if (!lanes.has(id)) {
      lanes.set(id, {
        id,
        label: row.agent_id
          ? (row.agent_type ? `${row.agent_type} · ${row.agent_id}` : row.agent_id)
          : "Session root",
        parent: row.agent_id
          ? (row.parent_agent_id ?? "parent not reported")
          : "provider session",
        points: [],
      });
    }
    const epoch = epochs[index];
    const position = span > 0 && Number.isFinite(epoch)
      ? ((epoch - start) / span) * 100
      : rows.length <= 1 ? 50 : (index / (rows.length - 1)) * 100;
    lanes.get(id)?.points.push({ row, index, position });
  });

  return { rows, lanes: [...lanes.values()] };
}
