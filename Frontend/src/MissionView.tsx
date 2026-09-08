import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CSSProperties } from "react";
import {
  api,
  createActionDeadline,
  isAbortError,
} from "./api";
import type {
  ActionDeadline,
  ActivityItem,
  ActivityPage,
  MissionPlan,
  MissionPayload,
  SessionPage,
} from "./api";
import { DialogShell } from "./dialog";
import { fmtRel, fmtTs } from "./format";
import {
  AlertIcon,
  MissionIcon,
  PauseIcon,
  PlayIcon,
  RefreshIcon,
} from "./icons";
import {
  activityActor,
  activityLabel,
  attentionRequirements,
  buildFlightLanes,
  clampCursor,
  eligibleAssignmentPlans,
  filterEvidence,
  formatDuration,
  missionPresentation,
  planKey,
  requirementPresentation,
  sameSession,
  spotlightPlan,
} from "./missionModel";
import type {
  EvidenceFilter,
  MissionEntryState,
} from "./missionModel";
import {
  sameSessionIdentity,
  sessionIdentityKey,
  usePrefersReducedMotion,
} from "./theme";
import {
  CollectionPager,
  ControlButton,
  IconButton,
  SectionHeading,
  SegmentedControl,
  Surface,
  cx,
  useBoundedPage,
} from "./ui";

const EMPTY_ACTIVITY: ActivityPage = {
  items: [], total: 0, limit: 50, offset: 0, order: "desc",
};
const EMPTY_SESSIONS: SessionPage = {
  items: [], total: 0, limit: 50, offset: 0, order: "desc",
};
const REFRESH_PARTS = ["mission", "sessions", "timeline", "evidence"] as const;
type RefreshPart = typeof REFRESH_PARTS[number];

interface MissionRefreshRun {
  token: number;
  action: ActionDeadline;
  pending: Set<RefreshPart>;
  generations: Map<RefreshPart, number>;
  failed: boolean;
}

const TONE_CLASS = {
  neutral: "border-ui-border text-ui-muted",
  live: "border-teal-700 bg-teal-950/30 text-teal-200",
  success: "border-emerald-700 bg-emerald-950/30 text-emerald-200",
  warning: "border-amber-700 bg-amber-950/30 text-amber-200",
  danger: "border-rose-700 bg-rose-950/30 text-rose-200",
} as const;

export interface MissionViewProps {
  scope: string | undefined;
  invalidationNonce: number;
  entryState: MissionEntryState;
  onEntryStateChange: (state: MissionEntryState) => void;
  onStatus: (message: string) => void;
}

function ErrorNotice ({ message, onRetry, busy = false }: {
  message: string;
  onRetry: () => void;
  busy?: boolean;
}): JSX.Element {
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-panel border border-rose-700 bg-rose-950/30 p-3 text-xs text-rose-100">
      <span className="min-w-0 break-words">{message}</span>
      <ControlButton onClick={onRetry} busy={busy} className="shrink-0">
        <RefreshIcon /> {busy ? "Refreshing" : "Retry"}
      </ControlButton>
    </div>
  );
}

function StateBadge ({ plan }: { plan: MissionPlan }): JSX.Element {
  const state = missionPresentation(plan.state);
  return (
    <span className={cx(
      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold",
      TONE_CLASS[state.tone],
    )}>
      <span aria-hidden="true">{state.marker}</span>
      {state.label}
    </span>
  );
}

function PlanCard ({ plan, selected, onSelect }: {
  plan: MissionPlan;
  selected: boolean;
  onSelect: () => void;
}): JSX.Element {
  const total = Math.max(1, plan.task_counts.total);
  const progress = Math.round((plan.task_counts.done / total) * 100);
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cx(
        "ui-control h-auto min-w-0 items-start border p-3 text-left",
        selected
          ? "border-ui-focus bg-sky-950/40"
          : "border-ui-border bg-ui-surface hover:bg-ui-raised",
      )}
    >
      <span className="flex w-full min-w-0 flex-wrap items-start justify-between gap-2">
        <span className="min-w-0 flex-1">
          <span className="block break-words font-semibold text-ui-text">{plan.label}</span>
          <span className="mt-0.5 block break-all font-mono text-xs text-ui-muted">
            {plan.repo} · {plan.plan_file}
          </span>
        </span>
        <StateBadge plan={plan} />
      </span>
      <span className="mt-2 block text-xs text-ui-muted">
        {plan.task_counts.done}/{plan.task_counts.total} tasks · {progress}%
      </span>
    </button>
  );
}

function NowPanel ({ plan, scope, summary }: {
  plan: MissionPlan | null;
  scope: string | undefined;
  summary: MissionPayload["summary"] | null;
}): JSX.Element {
  if (!plan) {
    return (
      <Surface>
        <SectionHeading title="Now" description="One exact plan is shown only after it is proven unique or explicitly selected." />
        <div className="rounded-panel border border-dashed border-ui-border p-4 text-sm text-ui-muted">
          {summary?.total === 0
            ? `No tracked plans in ${scope ?? "all repositories"}.`
            : "Select a plan below; the current scope does not prove one unique active plan."}
        </div>
      </Surface>
    );
  }
  const state = missionPresentation(plan.state);
  const total = Math.max(1, plan.task_counts.total);
  const progress = Math.round((plan.task_counts.done / total) * 100);
  return (
    <Surface className="overflow-hidden">
      <SectionHeading
        title={<span className="inline-flex items-center gap-2"><MissionIcon /> Now</span>}
        description={`${plan.repo} · ${plan.plan_file}`}
        actions={<StateBadge plan={plan} />}
      />
      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(16rem,1fr)]">
        <div className="min-w-0">
          <p className="break-words text-base font-semibold text-ui-text">{plan.label}</p>
          <p className="mt-1 text-sm text-ui-muted">
            {plan.current_task
              ? `Current task ${plan.current_task.id}: ${plan.current_task.title}`
              : "No single task is currently in progress."}
          </p>
          <div className="mt-3" aria-label={`${progress}% of tasks complete`}>
            <div className="mb-1 flex justify-between text-xs text-ui-muted">
              <span>{plan.task_counts.done} done</span>
              <span>{plan.task_counts.pending} pending</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-ui-canvas">
              <div className="h-full rounded-full bg-ui-live"
                style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>
        <div className="min-w-0 rounded-panel border border-ui-border bg-ui-canvas/50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-ui-muted">
            Exact blockers
          </p>
          {plan.blockers.length === 0 ? (
            <p className="mt-2 text-sm text-emerald-200">No blocker reported.</p>
          ) : (
            <ul className="mt-2 space-y-2 text-sm">
              {plan.blockers.slice(0, 50).map((blocker, index) => (
                <li key={`${blocker.code}-${blocker.check_id ?? "plan"}-${index}`}
                  className="flex min-w-0 gap-2 text-amber-100">
                  <AlertIcon className="mt-0.5 shrink-0" />
                  <span className="min-w-0 break-words">
                    {blocker.message}
                    {blocker.check_id && <span className="ml-1 font-mono text-xs">[{blocker.check_id}]</span>}
                    {blocker.count !== null && <span> ({blocker.count})</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {plan.warnings.length > 0 && (
            <div className="mt-3 border-t border-ui-border pt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-ui-muted">
                Parser warnings
              </p>
              <ul className="mt-2 space-y-2 text-sm">
                {plan.warnings.slice(0, 50).map((warning, index) => (
                  <li key={`${warning.code}-${index}`}
                    className="flex min-w-0 gap-2 text-ui-muted">
                    <AlertIcon className="mt-0.5 shrink-0" />
                    <span className="min-w-0 break-words">{warning.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="mt-3 text-xs text-ui-muted">
            Repository: {plan.repo_status.status_valid
              ? `${plan.repo_status.clean ? "clean" : `${plan.repo_status.count} changed`} on ${plan.repo_status.branch ?? "unknown branch"}`
              : "current status unavailable"}. State: {state.label}.
          </p>
        </div>
      </div>
    </Surface>
  );
}

function AssignmentDialog ({ row, plans, onClose, onSaved, onStatus }: {
  row: ActivityItem;
  plans: readonly MissionPlan[];
  onClose: () => void;
  onSaved: () => void;
  onStatus: (message: string) => void;
}): JSX.Element {
  const candidates = useMemo(() => eligibleAssignmentPlans(plans, row), [plans, row]);
  const currentKey = row.effective_assignment.repo && row.effective_assignment.plan_file
    ? planKey(row.effective_assignment.repo, row.effective_assignment.plan_file)
    : null;
  const initialTarget = (
    currentKey && candidates.some((plan) => planKey(plan.repo, plan.plan_file) === currentKey)
      ? currentKey
      : candidates[0] ? planKey(candidates[0].repo, candidates[0].plan_file) : ""
  );
  const initialTargetIndex = candidates.findIndex(
    (plan) => planKey(plan.repo, plan.plan_file) === initialTarget,
  );
  const [target, setTarget] = useState(initialTarget);
  const selectedTarget = candidates.find(
    (plan) => planKey(plan.repo, plan.plan_file) === target,
  );
  const [busy, setBusy] = useState(false);
  const mountedRef = useRef(true);
  const activeActionRef = useRef<ReturnType<typeof createActionDeadline> | null>(null);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const action = activeActionRef.current;
      activeActionRef.current = null;
      action?.controller.abort();
      action?.clear();
    };
  }, []);
  useEffect(() => {
    if (selectedTarget) return;
    const current = currentKey
      ? candidates.find((plan) => planKey(plan.repo, plan.plan_file) === currentKey)
      : undefined;
    const fallback = current ?? candidates[0];
    const nextTarget = fallback ? planKey(fallback.repo, fallback.plan_file) : "";
    if (target !== nextTarget) setTarget(nextTarget);
  }, [candidates, currentKey, selectedTarget, target]);
  const pager = useBoundedPage({
    identity: ["assignment", row.evidence_id],
    totalItems: candidates.length,
    pageSize: 50,
    defaultPage: initialTargetIndex < 0 ? 1 : Math.floor(initialTargetIndex / 50) + 1,
  });
  const visible = candidates.slice(pager.start, pager.end);
  const canClear = row.effective_assignment.repo !== null
    && row.assignment_repo_ids.includes(row.effective_assignment.repo)
    && row.effective_assignment.mode !== "UNASSIGNED"
    && row.effective_assignment.mode !== "NONE";

  const save = (clear: boolean): void => {
    if (busy || activeActionRef.current) return;
    const repo = clear ? row.effective_assignment.repo : selectedTarget?.repo;
    if (!repo || (!clear && !selectedTarget)) return;
    const action = createActionDeadline();
    activeActionRef.current = action;
    setBusy(true);
    void api.assignEvidence(
      row.evidence_id, repo, clear ? null : selectedTarget?.plan_file ?? null, action.signal,
    ).then(() => {
      if (!mountedRef.current || action.signal.aborted) return;
      onStatus(clear ? "Evidence assignment cleared." : "Evidence assigned to plan.");
      onSaved();
      onClose();
    }, (errorValue) => {
      if (isAbortError(errorValue) && !action.didTimeout()) return;
      onStatus(action.didTimeout()
        ? "Evidence assignment timed out after 10 seconds. Retry is available."
        : `Evidence assignment failed: ${String(errorValue).slice(0, 120)}`);
    }).finally(() => {
      action.clear();
      if (activeActionRef.current === action) activeActionRef.current = null;
      if (mountedRef.current) setBusy(false);
    });
  };

  return (
    <DialogShell
      title="Assign verification evidence"
      description={`${row.check_id ?? "Unknown check"} · evidence ${row.evidence_id}`}
      onClose={onClose}
      backdropClose={!busy}
      closeLabel="Close evidence assignment"
    >
      {candidates.length === 0 ? (
        <p className="text-sm text-ui-muted">
          No current valid plan directly linked to this evidence declares its check.
        </p>
      ) : (
        <fieldset disabled={busy}>
          <legend className="mb-2 text-sm font-semibold text-ui-text">Target plan</legend>
          <div id="mission-assignment-plans" className="space-y-2">
            {visible.map((plan) => {
              const key = planKey(plan.repo, plan.plan_file);
              return (
                <label key={key}
                  className="flex min-w-0 cursor-pointer items-start gap-3 rounded-control border border-ui-border p-3 hover:bg-ui-raised">
                  <input type="radio" name="mission-assignment" value={key}
                    checked={target === key} onChange={() => setTarget(key)} />
                  <span className="min-w-0">
                    <span className="block break-words text-sm text-ui-text">{plan.label}</span>
                    <span className="block break-all font-mono text-xs text-ui-muted">{plan.plan_file}</span>
                  </span>
                </label>
              );
            })}
          </div>
          {candidates.length > 50 && (
            <CollectionPager collectionLabel="Assignment plans"
              controlsId="mission-assignment-plans" page={pager}
              onPageChange={pager.setPage} className="mt-3" />
          )}
        </fieldset>
      )}
      <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-ui-border pt-3">
        {canClear && (
          <ControlButton disabled={busy} onClick={() => save(true)}>Clear assignment</ControlButton>
        )}
        <ControlButton tone="primary" busy={busy} disabled={!selectedTarget}
          onClick={() => save(false)}>
          Assign evidence
        </ControlButton>
      </div>
    </DialogShell>
  );
}

function ActivityTable ({ rows, selectedId, onSelect }: {
  rows: readonly ActivityItem[];
  selectedId: number | null;
  onSelect: (index: number) => void;
}): JSX.Element {
  return (
    <div className="ui-local-scroller max-w-full" role="region"
      aria-label="Exact flight-recorder data" tabIndex={0}>
      <table className="w-full min-w-[58rem] border-collapse text-left text-xs">
        <thead>
          <tr className="border-b border-ui-border text-ui-muted">
            <th className="p-2">Time</th><th className="p-2">Provider</th>
            <th className="p-2">Kind</th><th className="p-2">Actor</th>
            <th className="p-2">Tool / check</th><th className="p-2">Outcome</th>
            <th className="p-2">Duration</th><th className="p-2">Plan binding</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id}
              className={cx("border-b border-ui-border/50", selectedId === row.id && "bg-sky-950/40")}>
              <td className="p-2 font-mono">
                <button type="button" onClick={() => onSelect(index)}
                  aria-label={`Select activity ${index + 1}: ${activityLabel(row)}`}
                  className="ui-control bg-transparent px-1.5 font-mono">
                  {fmtTs(row.ts)}
                </button>
              </td>
              <td className="p-2">{row.provider}</td>
              <td className="p-2">{row.kind.replaceAll("_", " ")}</td>
              <td className="max-w-48 break-all p-2">{activityActor(row)}</td>
              <td className="max-w-56 break-all p-2">{row.check_id ?? row.tool_name ?? "not reported"}</td>
              <td className="p-2">{row.outcome ?? "not reported"}</td>
              <td className="p-2">{formatDuration(row.duration_ms)}</td>
              <td className="max-w-64 break-all p-2">
                {row.effective_assignment.repo && row.effective_assignment.plan_file
                  ? `${row.effective_assignment.repo} · ${row.effective_assignment.plan_file}`
                  : "unassigned"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="p-3 text-sm text-ui-muted">No activity on this page.</p>}
    </div>
  );
}

export function MissionView ({ scope, invalidationNonce, entryState,
  onEntryStateChange, onStatus }: MissionViewProps): JSX.Element {
  const reducedMotion = usePrefersReducedMotion();
  const entryRef = useRef(entryState);
  entryRef.current = entryState;
  const patchEntry = useCallback((patch: Partial<MissionEntryState>) => {
    const next = { ...entryRef.current, ...patch };
    entryRef.current = next;
    onEntryStateChange(next);
  }, [onEntryStateChange]);

  const [refreshToken, setRefreshToken] = useState(0);
  const [refreshBusy, setRefreshBusy] = useState(false);
  const refreshSequenceRef = useRef(0);
  const refreshRunRef = useRef<MissionRefreshRun | null>(null);
  const [mission, setMission] = useState<MissionPayload | null>(null);
  const [missionError, setMissionError] = useState("");
  const [missionBusy, setMissionBusy] = useState(true);
  const [sessions, setSessions] = useState<SessionPage>(EMPTY_SESSIONS);
  const [sessionsError, setSessionsError] = useState("");
  const [sessionsBusy, setSessionsBusy] = useState(true);
  const [timeline, setTimeline] = useState<ActivityPage>({ ...EMPTY_ACTIVITY, order: "asc" });
  const [timelineError, setTimelineError] = useState("");
  const [timelineBusy, setTimelineBusy] = useState(false);
  const [evidence, setEvidence] = useState<ActivityPage>(EMPTY_ACTIVITY);
  const [evidenceError, setEvidenceError] = useState("");
  const [evidenceBusy, setEvidenceBusy] = useState(false);
  const [assignment, setAssignment] = useState<ActivityItem | null>(null);
  const [playing, setPlaying] = useState(false);

  const finishRefreshPart = useCallback((
    run: MissionRefreshRun | null, part: RefreshPart, generation: number,
    failed = false,
  ) => {
    if (!run || refreshRunRef.current !== run
        || run.generations.get(part) !== generation) return;
    if (failed) run.failed = true;
    run.pending.delete(part);
    if (run.pending.size > 0) return;
    run.action.clear();
    refreshRunRef.current = null;
    setRefreshBusy(false);
    onStatus(run.action.didTimeout()
      ? "Mission refresh timed out after 10 seconds. Retry is available."
      : run.failed
        ? "Mission refresh finished with errors. Retry is available."
        : "Mission data refreshed.");
  }, [onStatus]);

  const cancelRefresh = useCallback(() => {
    const run = refreshRunRef.current;
    if (!run) return;
    refreshRunRef.current = null;
    run.action.controller.abort();
    run.action.clear();
    setRefreshBusy(false);
  }, []);

  const refresh = useCallback(() => {
    if (refreshRunRef.current) return;
    const token = ++refreshSequenceRef.current;
    refreshRunRef.current = {
      token,
      action: createActionDeadline(),
      pending: new Set(REFRESH_PARTS),
      generations: new Map(),
      failed: false,
    };
    setRefreshBusy(true);
    setRefreshToken(token);
    onStatus("Refreshing Mission data.");
  }, [onStatus]);

  const requestOwner = (part: RefreshPart) => {
    const controller = new AbortController();
    const candidate = refreshRunRef.current;
    const run = candidate?.token === refreshToken ? candidate : null;
    const generation = run ? (run.generations.get(part) ?? 0) + 1 : 0;
    if (run) {
      run.generations.set(part, generation);
      run.pending.add(part);
    }
    const abortForDeadline = () => controller.abort();
    if (run?.action.signal.aborted) controller.abort();
    else run?.action.signal.addEventListener("abort", abortForDeadline, { once: true });
    let settled = false;
    return {
      controller,
      timedOut: () => run?.action.didTimeout() ?? false,
      finish: (failed = false) => {
        if (settled) return;
        settled = true;
        run?.action.signal.removeEventListener("abort", abortForDeadline);
        finishRefreshPart(run, part, generation, failed);
      },
      abort: () => {
        run?.action.signal.removeEventListener("abort", abortForDeadline);
        controller.abort();
      },
    };
  };

  useEffect(() => () => {
    const run = refreshRunRef.current;
    refreshRunRef.current = null;
    run?.action.controller.abort();
    run?.action.clear();
  }, []);

  useEffect(() => cancelRefresh(), [cancelRefresh, scope, invalidationNonce]);

  useEffect(() => setAssignment(null), [scope]);

  useEffect(() => {
    const owner = requestOwner("mission");
    let failed = false;
    setMissionBusy(true);
    setMissionError("");
    setMission(null);
    void api.mission(scope, owner.controller.signal).then((payload) => {
      if (!owner.controller.signal.aborted) setMission(payload);
    }, (errorValue) => {
      const timedOut = owner.timedOut();
      if (isAbortError(errorValue) && !timedOut) return;
      failed = true;
      setMissionError(timedOut
        ? "Mission snapshot timed out after 10 seconds."
        : `Mission snapshot failed: ${String(errorValue).slice(0, 120)}`);
    }).finally(() => {
      const timedOut = owner.timedOut();
      owner.finish(failed || timedOut);
      if (!owner.controller.signal.aborted || timedOut) setMissionBusy(false);
    });
    return () => owner.abort();
  }, [scope, invalidationNonce, refreshToken, finishRefreshPart]);

  const selectedPlan = useMemo(() => {
    if (!mission) return null;
    const explicit = mission.plans.find(
      (plan) => planKey(plan.repo, plan.plan_file) === entryState.planKey,
    );
    return explicit ?? spotlightPlan(mission.plans);
  }, [entryState.planKey, mission]);

  useEffect(() => {
    if (!mission) return;
    const nextKey = selectedPlan ? planKey(selectedPlan.repo, selectedPlan.plan_file) : null;
    if (entryRef.current.planKey !== nextKey) patchEntry({ planKey: nextKey });
  }, [mission, patchEntry, selectedPlan]);

  const planPager = useBoundedPage({
    identity: ["mission-plans", scope],
    totalItems: mission?.plans.length ?? 0,
    pageSize: 12,
  });
  const selectedPlanIndex = selectedPlan && mission
    ? mission.plans.findIndex(
      (plan) => planKey(plan.repo, plan.plan_file)
        === planKey(selectedPlan.repo, selectedPlan.plan_file),
    )
    : -1;
  const planChoiceIdentity = `${scope ?? "all"}\0${selectedPlan
    ? planKey(selectedPlan.repo, selectedPlan.plan_file)
    : "none"}`;
  const previousPlanChoiceRef = useRef("");
  useEffect(() => {
    if (previousPlanChoiceRef.current === planChoiceIdentity) return;
    previousPlanChoiceRef.current = planChoiceIdentity;
    if (selectedPlanIndex >= 0) {
      planPager.setPage(Math.floor(selectedPlanIndex / 12) + 1);
    }
  }, [planChoiceIdentity, planPager.setPage, selectedPlanIndex]);
  const visiblePlans = mission?.plans.slice(planPager.start, planPager.end) ?? [];

  const sessionPager = useBoundedPage({
    identity: ["mission-sessions", scope],
    totalItems: sessions.total,
    pageSize: 50,
  });
  useEffect(() => {
    const owner = requestOwner("sessions");
    let failed = false;
    setSessionsBusy(true);
    setSessionsError("");
    setSessions((current) => ({
      ...current, items: [], offset: sessionPager.start, order: "desc",
    }));
    void api.sessions({
      repo: scope, limit: 50, offset: sessionPager.start, order: "desc",
    }, owner.controller.signal).then((page) => {
      if (!owner.controller.signal.aborted) setSessions(page);
    }, (errorValue) => {
      const timedOut = owner.timedOut();
      if (isAbortError(errorValue) && !timedOut) return;
      failed = true;
      if (!owner.controller.signal.aborted || timedOut) {
        setSessions(EMPTY_SESSIONS);
        setSessionsError(timedOut
          ? "Session list timed out after 10 seconds."
          : `Session list failed: ${String(errorValue).slice(0, 120)}`);
      }
    }).finally(() => {
      const timedOut = owner.timedOut();
      owner.finish(failed || timedOut);
      if (!owner.controller.signal.aborted || timedOut) setSessionsBusy(false);
    });
    return () => owner.abort();
  }, [scope, invalidationNonce, refreshToken, sessionPager.start, finishRefreshPart]);

  useEffect(() => {
    if (!entryRef.current.session && sessions.items[0]) {
      patchEntry({
        session: {
          provider: sessions.items[0].provider,
          sessionId: sessions.items[0].session_id,
        },
        cursor: 0,
      });
    }
  }, [entryState.session, patchEntry, sessions.items]);

  const selectedSession = entryState.session;
  const selectedSessionKey = selectedSession
    ? sessionIdentityKey(selectedSession.provider, selectedSession.sessionId)
    : "none";
  const timelinePager = useBoundedPage({
    identity: ["mission-timeline", scope, selectedSessionKey],
    totalItems: timeline.total,
    pageSize: 50,
  });
  useEffect(() => {
    const owner = requestOwner("timeline");
    let failed = false;
    let deferRefreshFinish = false;
    setTimelineError("");
    if (!selectedSession) {
      setTimeline({ ...EMPTY_ACTIVITY, order: "asc" });
      setTimelineBusy(false);
      const run = refreshRunRef.current;
      const refreshWillChooseSession = run?.token === refreshToken
        && (run.pending.has("sessions") || sessions.items.length > 0);
      if (!refreshWillChooseSession) owner.finish();
      return () => owner.abort();
    }
    setPlaying(false);
    setTimelineBusy(true);
    setTimeline((current) => ({
      ...current, items: [], offset: timelinePager.start, order: "asc",
    }));
    void api.activity({
      repo: scope, provider: selectedSession.provider,
      session: selectedSession.sessionId, order: "asc",
      limit: 50, offset: timelinePager.start,
    }, owner.controller.signal).then((page) => {
      if (owner.controller.signal.aborted) return;
      setTimeline(page);
      if (page.total === 0 && sameSessionIdentity(entryRef.current.session, selectedSession)) {
        const run = refreshRunRef.current;
        const replacementAvailable = sessions.items.some(
          (item) => !sameSession(selectedSession, item),
        );
        deferRefreshFinish = run?.token === refreshToken
          && (run.pending.has("sessions") || replacementAvailable);
        patchEntry({ session: null, cursor: 0 });
      }
    }, (errorValue) => {
      const timedOut = owner.timedOut();
      if (isAbortError(errorValue) && !timedOut) return;
      failed = true;
      if (!owner.controller.signal.aborted || timedOut) {
        setTimeline({ ...EMPTY_ACTIVITY, order: "asc" });
        setTimelineError(timedOut
          ? "Flight recorder timed out after 10 seconds."
          : `Flight recorder failed: ${String(errorValue).slice(0, 120)}`);
      }
    }).finally(() => {
      const timedOut = owner.timedOut();
      if (!deferRefreshFinish) owner.finish(failed || timedOut);
      if (!owner.controller.signal.aborted || timedOut) setTimelineBusy(false);
    });
    return () => owner.abort();
  }, [scope, selectedSession?.provider, selectedSession?.sessionId,
    selectedSessionKey, sessions.items.length, sessionsBusy, timelinePager.start,
    invalidationNonce, refreshToken, patchEntry, finishRefreshPart]);

  const flight = useMemo(() => buildFlightLanes(timeline.items), [timeline.items]);
  const cursor = clampCursor(entryState.cursor, flight.rows.length);
  const selectedActivity = flight.rows[cursor] ?? null;
  useEffect(() => {
    if (cursor !== entryRef.current.cursor) patchEntry({ cursor });
  }, [cursor, patchEntry]);
  useEffect(() => {
    setPlaying(false);
    if (entryRef.current.cursor !== 0) patchEntry({ cursor: 0 });
  }, [patchEntry, selectedSessionKey, timelinePager.start]);
  useEffect(() => {
    if (reducedMotion) setPlaying(false);
  }, [reducedMotion]);
  useEffect(() => {
    if (!playing || reducedMotion || flight.rows.length < 2) return;
    const timer = window.setInterval(() => {
      const current = clampCursor(entryRef.current.cursor, flight.rows.length);
      if (current >= flight.rows.length - 1) {
        setPlaying(false);
        return;
      }
      patchEntry({ cursor: current + 1 });
    }, 700);
    return () => window.clearInterval(timer);
  }, [flight.rows.length, patchEntry, playing, reducedMotion]);

  const evidencePager = useBoundedPage({
    identity: ["mission-evidence", selectedPlan?.repo, selectedPlan?.plan_file,
      entryState.evidenceFilter],
    totalItems: evidence.total,
    pageSize: 50,
  });
  useEffect(() => {
    const owner = requestOwner("evidence");
    let failed = false;
    setEvidenceError("");
    if (!selectedPlan) {
      setEvidence(EMPTY_ACTIVITY);
      setEvidenceBusy(false);
      const run = refreshRunRef.current;
      if (!(run?.token === refreshToken && run.pending.has("mission"))) {
        owner.finish();
      }
      return () => owner.abort();
    }
    setEvidenceBusy(true);
    setEvidence((current) => ({
      ...current, items: [], offset: evidencePager.start, order: "desc",
    }));
    void api.activity({
      repo: selectedPlan.repo, order: "desc", limit: 50,
      offset: evidencePager.start,
    }, owner.controller.signal).then((page) => {
      if (!owner.controller.signal.aborted) setEvidence(page);
    }, (errorValue) => {
      const timedOut = owner.timedOut();
      if (isAbortError(errorValue) && !timedOut) return;
      failed = true;
      if (!owner.controller.signal.aborted || timedOut) {
        setEvidence(EMPTY_ACTIVITY);
        setEvidenceError(timedOut
          ? "Evidence ledger timed out after 10 seconds."
          : `Evidence ledger failed: ${String(errorValue).slice(0, 120)}`);
      }
    }).finally(() => {
      const timedOut = owner.timedOut();
      owner.finish(failed || timedOut);
      if (!owner.controller.signal.aborted || timedOut) setEvidenceBusy(false);
    });
    return () => owner.abort();
  }, [selectedPlan?.repo, selectedPlan?.plan_file, evidencePager.start,
    invalidationNonce, missionBusy, refreshToken, finishRefreshPart]);

  const verificationPager = useBoundedPage({
    identity: ["mission-verification", selectedPlan?.repo, selectedPlan?.plan_file],
    totalItems: selectedPlan?.requirements.length ?? 0,
    pageSize: 50,
  });
  const requirementRows = !selectedPlan || entryState.evidenceFilter === "unassigned"
    ? []
    : entryState.evidenceFilter === "all"
      ? selectedPlan.requirements
      : attentionRequirements(selectedPlan.requirements);
  const requirementPager = useBoundedPage({
    identity: ["mission-requirements", selectedPlan?.repo, selectedPlan?.plan_file,
      entryState.evidenceFilter],
    totalItems: requirementRows.length,
    pageSize: 50,
  });
  const visibleRequirements = requirementRows.slice(
    requirementPager.start, requirementPager.end,
  );
  const evidenceRows = filterEvidence(
    evidence.items, entryState.evidenceFilter, selectedPlan,
  );

  return (
    <div className="mx-auto min-w-0 max-w-[100rem] space-y-4 p-3 sm:p-4">
      <SectionHeading
        title="Mission"
        description="Verification readiness and metadata-only agent activity. Green means declared evidence is fresh—not universal correctness."
        headingProps={{ "data-view-heading": true, tabIndex: -1 }}
        actions={
          <IconButton label="Refresh Mission" onClick={refresh} busy={refreshBusy}>
            <RefreshIcon />
          </IconButton>
        }
      />

      {missionError && <ErrorNotice message={missionError} onRetry={refresh}
        busy={refreshBusy} />}
      {missionBusy && !mission && (
        <div className="ui-skeleton h-32 rounded-panel" aria-label="Loading Mission" />
      )}
      <NowPanel plan={selectedPlan} scope={scope} summary={mission?.summary ?? null} />

      {mission && mission.plans.length > 0 && (
        <Surface>
          <SectionHeading title="Plan scope"
            description="Choose an exact repository + plan pair; ambiguous scopes are never guessed." />
          <div id="mission-plan-cards" className="grid min-w-0 gap-2 md:grid-cols-2 xl:grid-cols-3">
            {visiblePlans.map((plan) => {
              const key = planKey(plan.repo, plan.plan_file);
              return <PlanCard key={key} plan={plan} selected={entryState.planKey === key}
                onSelect={() => patchEntry({ planKey: key })} />;
            })}
          </div>
          {mission.plans.length > 12 && (
            <CollectionPager collectionLabel="Mission plans" controlsId="mission-plan-cards"
              page={planPager} onPageChange={planPager.setPage} className="mt-3" />
          )}
        </Surface>
      )}

      <Surface>
        <SectionHeading title="Verification rail"
          description="Current backend-evaluated gate state, freshness, and clean-review streak." />
        {!selectedPlan ? (
          <p className="text-sm text-ui-muted">Select one exact plan to inspect its requirements.</p>
        ) : selectedPlan.requirements.length === 0 ? (
          <p className="text-sm text-ui-muted">This plan declares no verification requirements.</p>
        ) : (
          <div id="mission-verification-rail" className="grid min-w-0 gap-2 md:grid-cols-2 xl:grid-cols-3">
            {selectedPlan.requirements.slice(
              verificationPager.start, verificationPager.end,
            ).map((requirement) => {
              const state = requirementPresentation(requirement);
              return (
                <article key={requirement.check_id}
                  className={cx("min-w-0 rounded-panel border p-3", TONE_CLASS[state.tone])}>
                  <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="break-words text-sm font-semibold">{requirement.label}</h3>
                      <p className="break-all font-mono text-xs opacity-80">{requirement.check_id}</p>
                    </div>
                    <span className="rounded-full border border-current px-2 py-0.5 text-xs font-semibold">
                      <span aria-hidden="true">{state.marker} </span>{state.label}
                    </span>
                  </div>
                  <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
                    <dt>Outcome</dt><dd className="break-words">{requirement.latest_outcome ?? "not reported"}</dd>
                    <dt>Observed</dt><dd>{requirement.observed_at ? fmtRel(requirement.observed_at) : "never"}</dd>
                    <dt>Fresh after</dt><dd className="break-all font-mono">{fmtTs(requirement.freshness_floor)}</dd>
                    {state.progress && <><dt>Streak</dt><dd>{state.progress} clean</dd></>}
                  </dl>
                </article>
              );
            })}
          </div>
        )}
        {selectedPlan && selectedPlan.requirements.length > 50 && (
          <CollectionPager collectionLabel="Verification requirements"
            controlsId="mission-verification-rail" page={verificationPager}
            onPageChange={verificationPager.setPage} className="mt-3" />
        )}
      </Surface>

      <Surface>
        <SectionHeading title="Evidence queue"
          description="Missing or unhealthy requirements plus selected-plan and eligible unassigned evidence from the current bounded ledger page."
          actions={
            <SegmentedControl<EvidenceFilter>
              label="Evidence filter"
              value={entryState.evidenceFilter}
              onChange={(evidenceFilter) => patchEntry({ evidenceFilter })}
              options={[
                { value: "attention", label: "Attention" },
                { value: "unassigned", label: "Unassigned" },
                { value: "all", label: "All" },
              ]}
            />
          }
        />
        {evidenceError && <ErrorNotice message={evidenceError} onRetry={refresh}
          busy={refreshBusy} />}
        {!selectedPlan ? (
          <p className="text-sm text-ui-muted">Select a plan to inspect evidence.</p>
        ) : (
          <div className="grid min-w-0 gap-4 xl:grid-cols-2">
            <section className="min-w-0" aria-labelledby="mission-requirement-queue-title">
              <h3 id="mission-requirement-queue-title" className="mb-2 text-sm font-semibold text-ui-text">
                Requirement attention
              </h3>
              <div id="mission-requirement-queue" className="space-y-2">
                {visibleRequirements.map((requirement) => {
                  const state = requirementPresentation(requirement);
                  return (
                    <div key={requirement.check_id}
                      className="flex min-w-0 items-start justify-between gap-2 rounded-control border border-ui-border p-3 text-sm">
                      <span className="min-w-0">
                        <span className="block break-words text-ui-text">{requirement.label}</span>
                        <span className="block break-all font-mono text-xs text-ui-muted">{requirement.check_id}</span>
                      </span>
                      <span className={cx("shrink-0 font-semibold", TONE_CLASS[state.tone].split(" ").at(-1))}>
                        <span aria-hidden="true">{state.marker} </span>{state.label}
                      </span>
                    </div>
                  );
                })}
                {visibleRequirements.length === 0 && (
                  <p className="rounded-control border border-dashed border-ui-border p-3 text-sm text-ui-muted">
                    {entryState.evidenceFilter === "unassigned"
                      ? "Requirement states are hidden by the unassigned-evidence filter."
                      : "No requirement needs attention."}
                  </p>
                )}
              </div>
              {requirementRows.length > 50 && (
                <CollectionPager collectionLabel="Requirement evidence queue"
                  controlsId="mission-requirement-queue" page={requirementPager}
                  onPageChange={requirementPager.setPage} className="mt-3" />
              )}
            </section>
            <section className="min-w-0" aria-labelledby="mission-ledger-queue-title">
              <h3 id="mission-ledger-queue-title" className="mb-2 text-sm font-semibold text-ui-text">
                Evidence ledger
              </h3>
              <div id="mission-ledger-queue" className="space-y-2">
                {evidenceRows.map((row) => (
                  <div key={row.evidence_id}
                    className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-control border border-ui-border p-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-ui-text">{activityLabel(row)}</p>
                      <p className="mt-0.5 break-words text-xs text-ui-muted">
                        {row.provider} · {fmtTs(row.ts)} · {row.outcome ?? "outcome not reported"}
                      </p>
                      <p className="mt-0.5 break-all font-mono text-xs text-ui-muted">
                        {row.effective_assignment.repo && row.effective_assignment.plan_file
                          ? `${row.effective_assignment.mode}: ${row.effective_assignment.repo} · ${row.effective_assignment.plan_file}`
                          : "UNASSIGNED"}
                      </p>
                    </div>
                    {(eligibleAssignmentPlans(mission?.plans ?? [], row).length > 0
                      || (row.effective_assignment.repo !== null
                        && row.assignment_repo_ids.includes(row.effective_assignment.repo)
                        && row.effective_assignment.mode !== "UNASSIGNED"
                        && row.effective_assignment.mode !== "NONE")) && (
                      <ControlButton onClick={() => setAssignment(row)}>
                        {row.effective_assignment.mode === "UNASSIGNED" ? "Assign" : "Review assignment"}
                      </ControlButton>
                    )}
                  </div>
                ))}
                {evidenceBusy ? (
                  <p className="rounded-control border border-dashed border-ui-border p-3 text-sm text-ui-muted"
                    role="status">Loading evidence ledger...</p>
                ) : evidenceRows.length === 0 && (
                  <p className="rounded-control border border-dashed border-ui-border p-3 text-sm text-ui-muted">
                    No matching canonical evidence on this activity page.
                  </p>
                )}
              </div>
              {!evidenceBusy && evidence.total > 50 && (
                <CollectionPager collectionLabel="Evidence ledger activity"
                  controlsId="mission-ledger-queue" page={evidencePager}
                  onPageChange={evidencePager.setPage} className="mt-3" />
              )}
            </section>
          </div>
        )}
      </Surface>

      <Surface>
        <SectionHeading title="Session flight recorder"
          description="Provider + session identity, deterministic time ordering, and explicit session-root lanes." />
        {sessionsError && <ErrorNotice message={sessionsError} onRetry={refresh}
          busy={refreshBusy} />}
        <div className="grid min-w-0 gap-4 xl:grid-cols-[18rem_minmax(0,1fr)]">
          <section className="min-w-0" aria-labelledby="mission-session-list-title">
            <h3 id="mission-session-list-title" className="mb-2 text-sm font-semibold text-ui-text">
              Sessions
            </h3>
            <div id="mission-session-list" className="max-h-96 space-y-2 overflow-y-auto pr-1">
              {sessions.items.map((session) => (
                <button key={sessionIdentityKey(session.provider, session.session_id)} type="button"
                  aria-pressed={sameSession(entryState.session, session)}
                  onClick={() => patchEntry({
                    session: { provider: session.provider, sessionId: session.session_id },
                    cursor: 0,
                  })}
                  className={cx(
                    "ui-control h-auto w-full min-w-0 items-start p-3 text-left",
                    sameSession(entryState.session, session)
                      ? "border-ui-focus bg-sky-950/40"
                      : "bg-ui-canvas",
                  )}>
                  <span className="block w-full break-all font-mono text-xs text-ui-text">
                    {session.provider} · {session.session_id}
                  </span>
                  <span className="mt-1 block text-xs text-ui-muted">
                    {session.event_count} events · {session.agent_count} agents · {session.repo_count} repos
                  </span>
                  <span className="mt-0.5 block text-xs text-ui-muted">
                    {fmtRel(session.ended_at)} · {session.delivery}
                  </span>
                </button>
              ))}
              {sessionsBusy ? (
                <p className="rounded-control border border-dashed border-ui-border p-3 text-sm text-ui-muted"
                  role="status">Loading sessions...</p>
              ) : sessions.items.length === 0 && (
                  <p className="rounded-control border border-dashed border-ui-border p-3 text-sm text-ui-muted">
                    No provider sessions recorded in this scope.
                  </p>
                )}
            </div>
            {!sessionsBusy && sessions.total > 50 && (
              <CollectionPager collectionLabel="Flight recorder sessions"
                controlsId="mission-session-list" page={sessionPager}
                onPageChange={sessionPager.setPage} className="mt-3" />
            )}
          </section>

          <section className="min-w-0" aria-labelledby="mission-timeline-title">
            <div className="mb-2 flex min-w-0 flex-wrap items-center justify-between gap-2">
              <h3 id="mission-timeline-title" className="text-sm font-semibold text-ui-text">
                Timeline
              </h3>
              {selectedSession && (
                <span className="max-w-full break-all font-mono text-xs text-ui-muted">
                  {selectedSession.provider} · {selectedSession.sessionId}
                </span>
              )}
            </div>
            {timelineError && <ErrorNotice message={timelineError} onRetry={refresh}
              busy={refreshBusy} />}
            <div className="ui-local-scroller mission-timeline" role="region"
              aria-label="Visual agent activity timeline" tabIndex={0}>
              <div className="min-w-[42rem] space-y-2 p-2">
                {flight.lanes.map((lane) => (
                  <div key={lane.id} className="grid grid-cols-[10rem_minmax(0,1fr)] items-center gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-ui-text" title={lane.label}>{lane.label}</p>
                      <p className="truncate text-xs text-ui-muted" title={lane.parent}>{lane.parent}</p>
                    </div>
                    <div className="relative h-10 rounded-control border border-ui-border bg-ui-canvas">
                      <span className="absolute left-2 right-2 top-1/2 h-px bg-ui-border" aria-hidden="true" />
                      {lane.points.map((point) => (
                        <button type="button" key={point.row.id}
                          aria-label={`Activity ${point.index + 1}: ${activityLabel(point.row)}, ${fmtTs(point.row.ts)}`}
                          aria-pressed={selectedActivity?.id === point.row.id}
                          title={activityLabel(point.row)}
                          onClick={() => patchEntry({ cursor: point.index })}
                          className={cx(
                            "mission-timeline-point ui-transition",
                            selectedActivity?.id === point.row.id && "is-selected",
                          )}
                          style={{ "--mission-x": `${2 + point.position * 0.96}%` } as CSSProperties}>
                          <span className="sr-only">{activityLabel(point.row)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                {timelineBusy ? (
                  <p className="p-3 text-sm text-ui-muted" role="status">Loading session activity...</p>
                ) : flight.rows.length === 0 && (
                  <p className="p-3 text-sm text-ui-muted">Select a recorded session to inspect its activity.</p>
                )}
              </div>
            </div>

            {flight.rows.length > 0 && (
              <div className="mt-3 rounded-panel border border-ui-border bg-ui-canvas/50 p-3">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  {!reducedMotion && (
                    <IconButton label={playing ? "Pause timeline replay" : "Play timeline replay"}
                      aria-pressed={playing} onClick={() => setPlaying((value) => !value)}>
                      {playing ? <PauseIcon /> : <PlayIcon />}
                    </IconButton>
                  )}
                  <label className="min-w-[12rem] flex-1 text-xs text-ui-muted">
                    Activity {cursor + 1} of {flight.rows.length}
                    <input type="range" min={0} max={Math.max(0, flight.rows.length - 1)}
                      value={cursor} onChange={(event) => patchEntry({ cursor: Number(event.target.value) })}
                      className="mt-1 w-full" />
                  </label>
                </div>
                {selectedActivity && (
                  <div className="mt-3 grid min-w-0 gap-1 text-xs sm:grid-cols-2">
                    <p className="break-words text-ui-text">{activityLabel(selectedActivity)}</p>
                    <p className="break-words text-ui-muted">Actor: {activityActor(selectedActivity)}</p>
                    <p className="break-all text-ui-muted">Time: {fmtTs(selectedActivity.ts)}</p>
                    <p className="break-words text-ui-muted">Duration: {formatDuration(selectedActivity.duration_ms)}</p>
                  </div>
                )}
              </div>
            )}

            {!timelineBusy && timeline.total > 50 && (
              <CollectionPager collectionLabel="Session activity"
                controlsId="mission-exact-data" page={timelinePager}
                onPageChange={timelinePager.setPage} className="mt-3" />
            )}

            {!timelineBusy && <details className="mt-3 rounded-panel border border-ui-border">
              <summary className="ui-control cursor-pointer border-0 bg-ui-raised px-3">
                Exact data
              </summary>
              <div id="mission-exact-data" className="border-t border-ui-border p-2">
                <ActivityTable rows={flight.rows} selectedId={selectedActivity?.id ?? null}
                  onSelect={(index) => patchEntry({ cursor: index })} />
              </div>
            </details>}
          </section>
        </div>
      </Surface>

      {assignment && mission && (
        <AssignmentDialog row={assignment} plans={mission.plans}
          onClose={() => setAssignment(null)}
          onSaved={refresh} onStatus={onStatus} />
      )}
    </div>
  );
}
