import { Component, lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ComponentType, CSSProperties, ErrorInfo, MutableRefObject, ReactNode } from "react";
import { flushSync } from "react-dom";
import { api, createActionDeadline, isAbortError } from "./api";
import type { ActionDeadline, HistoryEntry, Repo, Task, TrackedEvent } from "./api";
// v0.1.9.0 D4 (B.2): the gitGraph renderer — mermaid itself stays a dynamic
// import INSIDE this module (R9), loading only on first graph expand.
import { buildGitGraph, MermaidModuleLoadError, renderGitGraph } from "./mermaidGraph";
import type { GitGraphRow } from "./mermaidGraph";
import { buildFileTree } from "./fileTree";
import { CommandPalette, paletteEntryId } from "./CommandPalette";
import type { PaletteEntry } from "./CommandPalette";
import { prepareDigest } from "./digest";
import { DisclosureTable } from "./accessibleData";
import { requestNoopenerTab, startBlobDownload } from "./download";
import type { PreparedDownload } from "./download";
import { drawStatusFavicon } from "./favicon";
import { exportReport } from "./reportHtml";
import { FileStory } from "./FileStory";
import { SessionTimeline } from "./SessionTimeline";
import { WrappedCard } from "./WrappedCard";
import { fmtAge, fmtMinutes, fmtRel, fmtTs } from "./format";
import { notifyPickNeeded, notifyRelease, notifyStatusChange, notifyWanted, notifyWarning, setNotifyEnabled } from "./notify";
import { playChime, playFanfare, playTick, setSoundEnabled, soundWanted } from "./sound";
import { copyCommitDraft } from "./draft";
import type { StatsData } from "./charts";
import { useReveal } from "./reveal";
import {
  EFFORT_GAP_MAX_MIN,
  MODE_BADGE,
  MODE_COLOR,
  ODOMETER_MILESTONES,
  RELEASE_RX,
  SWEPT_COLOR,
  UNCOMMITTED_AGE_H,
  eventSessionIdentity,
  prefersReducedMotion,
  prefix3,
  sameSessionIdentity,
  sessionColor,
  sessionIdentityKey,
  skipActiveViewTransitions,
  subscribeReducedMotion,
  usePrefersReducedMotion,
  withViewTransition,
} from "./theme";
import type { EventSessionIdentity } from "./theme";
import { Pet, moodOf, wardrobeOf } from "./pet";
import { ComboMeter } from "./comboMeter";
import { FlowChip } from "./flowChip";
import { ChronicleView } from "./chronicleView";
import { FocusMode } from "./focusMode";
import { HealthButton, HealthModal } from "./healthPanel";
import { connectWs } from "./ws";
import { normalizeMissionEntry } from "./missionModel";
import type { MissionEntryState } from "./missionModel";
import {
  formatRouteUrl,
  parseRouteSearch,
  repairRouteMembership,
  routeEquals,
  scopeAccessibleName,
  scopeApiId,
  scopeEquals,
  scopeKey,
  scopeLabel,
} from "./navigation";
import type { AppRoute, Scope, View } from "./navigation";
import {
  BoundedPageMemoryProvider,
  CollectionPager,
  ControlButton,
  hasActiveInteraction,
  suppressDisclosureFocusRestore,
  useBoundedPage,
  useDisclosureBehavior,
  useRememberedBoundedPage,
} from "./ui";
import { BoundedChoiceDialog, DialogShell, suppressOverlayFocusRestore } from "./dialog";
import { BellIcon, MoreIcon, TasksIcon } from "./icons";

const PAGE = 500; // F38 pagination page size
// v0.1.9.0 D3 (C.2): combo milestones — crossing one exactly fires the pop.
const COMBO_MILESTONES = new Set([5, 10, 25, 50, 100, 250]);
// v0.2.9.0 D5 (C.1, R-BM): the daydream constants — generous and calm.
const ATTRACT_IDLE_MS = 10 * 60_000;
const ATTRACT_CYCLE_MS = 25_000;
const ATTRACT_VIEWS: ("city" | "overview" | "chronicle")[] = ["city", "overview", "chronicle"];

type ActiveDialog =
  | { kind: "timeline"; session: EventSessionIdentity }
  | { kind: "file-story"; repo: string; file: string }
  | { kind: "focus"; scope: string | undefined }
  | { kind: "health" }
  | { kind: "wrapped"; stats: StatsData; tasks: Task[] };

type SidebarMode = "active" | "all";

type DigestState =
  | { kind: "idle" }
  | { kind: "preparing"; scopeKey: string }
  | { kind: "ready"; scopeKey: string; prepared: PreparedDownload }
  | { kind: "downloading"; scopeKey: string; prepared: PreparedDownload };

interface HistoryUiState {
  repoId: string;
  fetchDepth: number;
  page: number;
}

const DEFAULT_HISTORY_UI: HistoryUiState = { repoId: "", fetchDepth: PAGE, page: 1 };

interface OverviewUiState {
  relationship: { repoId: string; planFile: string } | null;
  day: string;
  speed: 1 | 2 | 4;
}

interface AssignmentUiState {
  selectedIds: number[];
  bulkChoice: string;
  choices: Record<string, string>;
}

const DEFAULT_ASSIGNMENT_UI: AssignmentUiState = {
  selectedIds: [],
  bulkChoice: "",
  choices: {},
};

function assignmentCandidates (event: TrackedEvent, tasks: Task[]): string[] {
  if (event.candidates_json) {
    try {
      const value: unknown = JSON.parse(event.candidates_json);
      return Array.isArray(value)
        ? value.filter((item): item is string => typeof item === "string")
        : [];
    } catch {
      return [];
    }
  }
  return tasks.filter((task) => task.repo === event.repo_id).map((task) => task.task_ref);
}

function clampAssignmentUi (
  state: AssignmentUiState,
  events: TrackedEvent[],
  tasks: Task[],
  scope: Scope,
): AssignmentUiState {
  const eligible = events.filter((event) =>
    (event.mode === "AMBIGUOUS" || event.mode === "UNKNOWN")
    && (scope.kind === "all" || event.repo_id === scope.id));
  const byId = new Map(eligible.map((event) => [event.id, event]));
  const selectedIds = state.selectedIds.filter((id) => byId.has(id));
  const selectedRepos = new Set(selectedIds.map((id) => byId.get(id)!.repo_id));
  const bulkOptions = new Set(tasks
    .filter((task) => selectedRepos.has(task.repo))
    .map((task) => task.task_ref));
  const choices: Record<string, string> = {};
  for (const [rawId, choice] of Object.entries(state.choices)) {
    const event = byId.get(Number(rawId));
    if (event && assignmentCandidates(event, tasks).includes(choice)) choices[rawId] = choice;
  }
  return {
    selectedIds,
    bulkChoice: bulkOptions.has(state.bulkChoice) ? state.bulkChoice : "",
    choices,
  };
}

function currentLocalDay (): string {
  const value = new Date();
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function isExactCalendarDay (value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= daysInMonth[month - 1];
}

function defaultOverviewUi (): OverviewUiState {
  return { relationship: null, day: currentLocalDay(), speed: 1 };
}

interface EntrySnapshot {
  scrollTop: number;
  taskFilter: string | null;
  sessionFilter: EventSessionIdentity | null;
  groupMode: "task" | "folder";
  sidebarMode: SidebarMode;
  history: HistoryUiState;
  overview: OverviewUiState;
  assignment: AssignmentUiState;
  mission: MissionEntryState;
  pages: Record<string, number>;
}

interface NavigateOptions {
  history?: "push" | "replace" | "none";
  indirect?: boolean;
  animate?: boolean;
  taskFilter?: string | null;
  groupMode?: "task" | "folder";
  pendingScroll?: string | null;
}

const HISTORY_STATE_FIELD = "katlabTrackingMonitor";
const ENTRY_ID_PATTERN = /^entry-[A-Za-z0-9-]{8,}$/;

function tupleKey (...parts: Array<string | number>): string {
  return JSON.stringify(parts);
}

function taskIdentity (repoId: string, taskRef: string): string {
  return tupleKey(repoId, taskRef);
}

function taskIdentityParts (value: string | null): [string, string] | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) && parsed.length === 2
      && typeof parsed[0] === "string" && typeof parsed[1] === "string"
      ? [parsed[0], parsed[1]]
      : null;
  } catch {
    return null;
  }
}

function newEntryId (): string {
  const random = globalThis.crypto?.randomUUID?.()
    ?? Math.random().toString(36).slice(2) + Date.now().toString(36);
  return "entry-" + random;
}

function historyEntryId (): string | null {
  const state = window.history.state;
  if (!state || typeof state !== "object") return null;
  const value = (state as Record<string, unknown>)[HISTORY_STATE_FIELD];
  if (!value || typeof value !== "object") return null;
  const entryId = (value as Record<string, unknown>).entryId;
  return typeof entryId === "string" && ENTRY_ID_PATTERN.test(entryId)
    ? entryId
    : null;
}

function mergedHistoryState (entryId: string): Record<string, unknown> {
  const previous = window.history.state;
  const base = previous && typeof previous === "object"
    ? { ...(previous as Record<string, unknown>) }
    : {};
  return { ...base, [HISTORY_STATE_FIELD]: { entryId } };
}

const BOOTSTRAP_ROUTE = parseRouteSearch(window.location.search);

function lazyView<T> (
  name: string,
  load: () => Promise<T>,
  select: (module: T) => ComponentType<any>,
) {
  return lazy(() => new Promise<{ default: ComponentType<any> }>((resolve, reject) => {
    let current = true;
    const timer = window.setTimeout(() => {
      current = false;
      reject(new Error(`${name} module timed out after 10 seconds`));
    }, 10_000);
    load().then(
      (module) => {
        window.clearTimeout(timer);
        if (current) resolve({ default: select(module) });
      },
      (errorValue) => {
        window.clearTimeout(timer);
        if (current) reject(errorValue);
      },
    );
  }));
}

const LazyOverviewView = lazyView(
  "Overview",
  () => import("./OverviewView"),
  (module) => module.OverviewView,
);
const LazyCityView = lazyView(
  "City",
  () => import("./city"),
  (module) => module.CityView,
);
const LazyMissionView = lazyView(
  "Mission",
  () => import("./MissionView"),
  (module) => module.MissionView,
);

function LazyViewStatus ({ name }: { name: string }): JSX.Element {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), 180);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <div className="min-h-96 rounded-panel border border-ui-border bg-ui-surface p-6">
      {visible && (
        <div className="ui-skeleton max-w-sm rounded-control px-3 py-2 text-sm text-ui-muted">
          Loading {name}…
        </div>
      )}
    </div>
  );
}

class LazyViewBoundary extends Component<
  { name: string; children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError (error: Error) {
    return { error };
  }

  componentDidCatch (_error: Error, _info: ErrorInfo): void {
    window.requestAnimationFrame(() => {
      document.getElementById("lazy-view-failure")?.focus({ preventScroll: true });
    });
  }

  render (): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <section
        id="lazy-view-failure"
        tabIndex={-1}
        aria-labelledby="lazy-view-failure-title"
        className="min-h-64 rounded-panel border border-rose-700 bg-rose-950/30 p-6"
      >
        <h2 id="lazy-view-failure-title" className="font-semibold text-rose-200">
          {this.props.name} could not load
        </h2>
        <p className="mt-2 text-sm text-ui-muted">
          The module failed to load or exceeded its 10-second deadline.
        </p>
        <button
          type="button"
          className="ui-control mt-4 bg-ui-primary text-white"
          onClick={() => window.location.reload()}
        >
          Reload
        </button>
      </section>
    );
  }
}

export default function App () {
  const reducedMotion = usePrefersReducedMotion();
  const entryIdRef = useRef("");
  const dayLaneForegroundEntryRef = useRef("");
  if (!entryIdRef.current) {
    const existingEntryId = historyEntryId();
    entryIdRef.current = existingEntryId ?? newEntryId();
    if (!existingEntryId) {
      window.history.replaceState(
        mergedHistoryState(entryIdRef.current),
        "",
        window.location.pathname + window.location.search + window.location.hash,
      );
    }
  }
  const entrySnapshotsRef = useRef(new Map<string, EntrySnapshot>());
  const initialCanonicalizedRef = useRef(false);
  useEffect(() => {
    if (initialCanonicalizedRef.current || !BOOTSTRAP_ROUTE.needsCanonicalReplace
        || BOOTSTRAP_ROUTE.route.scope.kind === "repo") return;
    initialCanonicalizedRef.current = true;
    window.history.replaceState(
      mergedHistoryState(entryIdRef.current),
      "",
      formatRouteUrl(BOOTSTRAP_ROUTE.route, window.location.pathname, window.location.hash),
    );
  }, []);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<TrackedEvent[]>([]);
  const reposRef = useRef(repos); reposRef.current = repos;
  const tasksRef = useRef(tasks); tasksRef.current = tasks;
  const eventsRef = useRef(events); eventsRef.current = events;
  const [scope, setScope] = useState<Scope>(BOOTSTRAP_ROUTE.route.scope);
  const [view, setView] = useState<View>(BOOTSTRAP_ROUTE.route.view);
  const [membershipReady, setMembershipReady] = useState(
    BOOTSTRAP_ROUTE.route.scope.kind === "all",
  );
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const membershipReadyRef = useRef(membershipReady);
  membershipReadyRef.current = membershipReady;
  const currentRouteRef = useRef<AppRoute>({ scope, view });
  currentRouteRef.current = { scope, view };
  const desiredRouteRef = useRef<AppRoute>({ scope, view });
  const routeGenerationRef = useRef(0);
  const repairMembershipRef = useRef<(repoIds: ReadonlySet<string>) => void>(() => {});
  const dreamingRef = useRef(false);
  const dreamGenerationRef = useRef(0);
  const wakeCoordinatorRef = useRef<() => void>(() => {});
  const [dismissedWarnings, setDismissedWarnings] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string>("");
  const [showLegend, setShowLegend] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRootRef = useRef<HTMLDivElement | null>(null);
  const moreTriggerRef = useRef<HTMLButtonElement | null>(null);
  const legendTriggerRef = useRef<HTMLButtonElement | null>(null);
  const legendReturnToMoreRef = useRef(false);
  const [taskDrawerOpen, setTaskDrawerOpen] = useState(false);
  const [taskFilter, setTaskFilter] = useState<string | null>(null); // X4: structured task identity key
  const [sessionFilter, setSessionFilter] = useState<EventSessionIdentity | null>(null);
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>("active");
  const [historyUi, setHistoryUi] = useState<HistoryUiState>(DEFAULT_HISTORY_UI);
  const [overviewUi, setOverviewUi] = useState<OverviewUiState>(defaultOverviewUi);
  const [assignmentUi, setAssignmentUi] = useState<AssignmentUiState>(DEFAULT_ASSIGNMENT_UI);
  const [missionUi, setMissionUi] = useState<MissionEntryState>(() => normalizeMissionEntry(null));
  const [pagePositions, setPagePositions] = useState<Record<string, number>>({});
  const rememberPage = useCallback((key: string, page: number) => {
    setPagePositions((previous) => previous[key] === page
      ? previous
      : { ...previous, [key]: page });
  }, []);
  const [activeDialog, setActiveDialog] = useState<ActiveDialog | null>(null);
  const openDialog = useCallback((next: ActiveDialog) => {
    suppressDisclosureFocusRestore();
    setPanelOpen(false);
    setMoreOpen(false);
    setShowLegend(false);
    setActiveDialog((current) => current ?? next);
  }, []);
  const closeDialog = useCallback(() => setActiveDialog(null), []);
  const [actionStatus, setActionStatus] = useState("");
  const lastAnnouncedStatusRef = useRef("");
  const announceStatus = useCallback((message: string) => {
    const normalized = message.trim();
    if (!normalized || normalized === lastAnnouncedStatusRef.current) return;
    lastAnnouncedStatusRef.current = normalized;
    setActionStatus(normalized);
  }, []);
  // v0.1.7.0 D6 (C.3): celebration channels — toasts keyed BY REPO (a new
  // transition replaces, never stacks junk); the burst nonce is consumed by
  // that repo's CLEAN ✓ chip in the StatusBar.
  const [toasts, setToasts] = useState<{ repo: string; n: number; animate: boolean }[]>([]);
  const [burst, setBurst] = useState<{ repo: string; n: number } | null>(null);
  const celebrationN = useRef(0);
  // v0.1.9.0 D3 (C.2): live combo — count + lastMs in REFS (RV7: the WS
  // handler closes over mount-time state), count MIRRORED to state by value
  // for rendering; comboN is the milestone-burst nonce (celebrationN stays
  // the celebration's own counter — never shared).
  const comboCountRef = useRef(0);
  const comboLastMsRef = useRef(0);
  // v0.2.10.0 D3 (A.3a, R-BN): the current chain's birth stamp — set
  // exactly when next === 1 in the WS handler (init 0 is safe: the
  // first event is always next === 1, so on ⇒ stamped, never zero).
  const comboStartMsRef = useRef(0);
  const comboN = useRef(0);
  const [comboCount, setComboCount] = useState(0);
  const [comboBurst, setComboBurst] = useState<number | null>(null);
  // v0.2.7.0 D7/D8 (C.1, R-BG): the release moment — version baselines +
  // the once-per-session hash belt live in REFS (the WS handler closes
  // over mount-time state, the combo's RV7-class rule); the banner is a
  // per-repo STACK, cap 3 (RV10 — coupled cross-repo releases are the
  // OBSERVED house pattern).
  const lastVersionRef = useRef(new Map<string, string>());
  const seenReleasesRef = useRef(new Set<string>());
  const releaseSeededRef = useRef(false);
  const releaseN = useRef(0);
  const [releases, setReleases] = useState<{
    repo: string; version: string; n: number; animate: boolean;
  }[]>([]);
  // v0.1.5.0 D6 (D.2, RV3): groupMode LIFTED from ChangesView so the
  // palette's tree-toggle action can reach it (same behavior, prop-drilled).
  const [groupMode, setGroupMode] = useState<"task" | "folder">("task");
  const [, setTick] = useState(0);
  const [statsNonce, setStatsNonce] = useState(0); // R12: bumped only on a real sync
  const [missionNonce, setMissionNonce] = useState(0);
  const currentScopeKey = scopeKey(scope);
  const [statsState, setStatsState] = useState<{
    key: string;
    data: StatsData | null;
    error: string;
    settled: boolean;
  }>({ key: "", data: null, error: "", settled: false });
  const [cityRefreshIdentity, setCityRefreshIdentity] = useState(0);
  useEffect(() => {
    if (!membershipReady) return;
    let alive = true;
    const key = currentScopeKey;
    api.stats(scopeApiId(scope)).then(
      (data) => {
        if (!alive) return;
        setStatsState({ key, data, error: "", settled: true });
        setCityRefreshIdentity((identity) => identity + 1);
      },
      (errorValue) => {
        if (!alive) return;
        setStatsState((previous) => previous.key === key
          ? { ...previous, error: String(errorValue), settled: true }
          : { key, data: null, error: String(errorValue), settled: true });
      },
    );
    return () => { alive = false; };
  }, [currentScopeKey, membershipReady, scope, statsNonce]);
  const statsEligible = membershipReady && statsState.key === currentScopeKey;
  const stats = statsEligible ? statsState.data : null;
  const statsError = statsEligible ? statsState.error : "";
  // v0.2.7.0 D5 (B.2, R-BF): the wardrobe basis is UNSCOPED (Kat is the
  // WORKSPACE pet — the tab-scoped stats prop would flicker her costume
  // per tab): ONE dedicated api.stats() on mount + real syncs, throttled
  // to one call per 60s with a single trailing catch-up (the v0.2.0.0
  // City-RV3 throttle recipe; get_stats is the heavy endpoint).
  const [allCal, setAllCal] = useState<StatsData["activity_calendar"] | null>(null);
  const requestWardrobeRoundRef = useRef<() => void>(() => {});
  useEffect(() => {
    let live = true;
    let inFlight = false;
    let trailing = false;
    let lastStarted = -Infinity;
    let timer: number | null = null;
    let generation = 0;

    const requestRound = (): void => {
      if (!live) return;
      if (inFlight) {
        trailing = true;
        return;
      }
      const wait = Math.max(0, 60_000 - (Date.now() - lastStarted));
      if (wait > 0) {
        trailing = true;
        if (timer === null) {
          timer = window.setTimeout(() => {
            timer = null;
            if (!live || !trailing) return;
            trailing = false;
            requestRound();
          }, wait);
        }
        return;
      }
      inFlight = true;
      lastStarted = Date.now();
      const currentGeneration = ++generation;
      void api.stats().then((result) => {
        if (live && generation === currentGeneration) {
          setAllCal(result.activity_calendar);
        }
      }).catch(() => {
        // Optional background data: retain the last accepted wardrobe.
      }).finally(() => {
        if (!live || generation !== currentGeneration) return;
        inFlight = false;
        if (trailing) {
          trailing = false;
          requestRound();
        }
      });
    };
    requestWardrobeRoundRef.current = requestRound;
    return () => {
      live = false;
      generation += 1;
      trailing = false;
      if (timer !== null) window.clearTimeout(timer);
      requestWardrobeRoundRef.current = () => {};
    };
  }, []);
  useEffect(() => {
    requestWardrobeRoundRef.current();
  }, [statsNonce]);

  // v0.1.6.0 D1: effort lookup for sidebar cards + task-group headers.
  const effortByTask = useMemo(() => {
    const m = new Map<string, { minutes: number; sessions: number }>();
    for (const e of stats?.effort_per_task ?? []) {
      m.set(taskIdentity(e.repo, e.task_ref), { minutes: e.minutes, sessions: e.sessions });
    }
    return m;
  }, [stats]);

  const syncGenerationRef = useRef(0);
  const statusEpochRef = useRef(0);
  const statusPatchesRef = useRef(new Map<string, {
    epoch: number;
    value: Pick<Repo, "clean" | "count" | "offline" | "branch">;
  }>());
  const sync = useCallback(async () => {
    const generation = ++syncGenerationRef.current;
    try {
      const [repoResult, t, e] = await Promise.all([
        api.repos().then((data) => ({ data, statusEpoch: statusEpochRef.current })),
        api.tasks(),
        api.events({ uncommitted: true, limit: PAGE }),
      ]);
      if (generation !== syncGenerationRef.current) return;
      const r = repoResult.data.map((repo) => {
        const patch = statusPatchesRef.current.get(repo.id);
        return patch && patch.epoch > repoResult.statusEpoch
          ? { ...repo, ...patch.value }
          : repo;
      });
      for (const [repoId, patch] of statusPatchesRef.current) {
        if (patch.epoch <= repoResult.statusEpoch) statusPatchesRef.current.delete(repoId);
      }
      setRepos(r);
      setTasks(t);
      setEvents(e);
      setWorkspaceReady(true);
      setStatsNonce((n) => n + 1); // R12: Overview refetches on real syncs, not ticks/filters
      setError("");
      if (!membershipReadyRef.current) {
        membershipReadyRef.current = true;
        setMembershipReady(true);
      }
      repairMembershipRef.current(new Set(r.map((repo) => repo.id)));
    } catch (exc) {
      if (generation === syncGenerationRef.current) {
        const message = String(exc);
        setError(message);
        announceStatus(`Server sync failed: ${message}`);
      }
    }
  }, [announceStatus]);

  useEffect(() => subscribeReducedMotion(() => {
    if (!prefersReducedMotion() || !dreamingRef.current) return;
    wakeCoordinatorRef.current();
  }), []);

  useEffect(() => {
    // CFT-9: debounce sync bursts - each sync is 3 REST calls incl. git
    // status per repo; a multi-file Claude turn pushes many WS messages.
    let timer: ReturnType<typeof setTimeout> | undefined;
    let missionTimer: ReturnType<typeof setTimeout> | undefined;
    const debouncedSync = () => {
      syncGenerationRef.current += 1;
      clearTimeout(timer);
      timer = setTimeout(() => void sync(), 300);
    };
    const debouncedMissionRefresh = () => {
      clearTimeout(missionTimer);
      missionTimer = setTimeout(() => setMissionNonce((value) => value + 1), 150);
    };
    // WS live push; onSync re-snapshots on every (re)connect (F29).
    const close = connectWs((msg) => {
      debouncedMissionRefresh();
      if (msg.type === "event_resolved" || msg.type === "commit_detected") debouncedSync();
      if (msg.type === "task_updated" || msg.type === "warning") debouncedSync();
      if (msg.type === "event_resolved") {
        // v0.2.8.0 A.2 (R-BH): the capture tick — the WS payload is
        // the FULL DB row (id incl., watcher.py:303 — RV1); the pitch
        // hash + 80ms drop-limiter live in sound.ts; no-op unless
        // the user opted in (beside the combo, never instead).
        const evId = (msg.data as { id?: unknown }).id;
        playTick(typeof evId === "number" ? evId : 0);
        // v0.2.10.0 D7/D8 (A.3c, R-BO): the odometer — event IDS EVER
        // (one global AUTOINCREMENT; ids never reused). UI-closed
        // misses are accepted (the WS-gap law); a brief WS gap self-
        // recovers via the F29 catch-up replay. playChime self-gates
        // (sound.ts law); the 8s timer clears by nonce-compare only.
        if (typeof evId === "number" && ODOMETER_MILESTONES.has(evId)) {
          const n = ++odoN.current;
          setOdoNote({ id: evId, n, animate: !prefersReducedMotion() });
          announceStatus(`Capture milestone ${evId.toLocaleString("en-US")}.`);
          playChime();
          window.setTimeout(() => setOdoNote((cur) => (cur && cur.n === n ? null : cur)), 8_000);
        }
        // v0.1.9.0 D3 (C.2): combo — ONE increment per live message, all in
        // the handler body (RV7: refs for fresh math, state mirror by value;
        // no updater-function side effects). Burst fires only on an exact
        // milestone crossing, never hidden / reduced-motion (D6 rules), and
        // clears after ~900ms with the nonce-compare guard (RV11).
        const nowMs = Date.now();
        const chained = nowMs - comboLastMsRef.current <= EFFORT_GAP_MAX_MIN * 60_000;
        const next = chained ? comboCountRef.current + 1 : 1;
        if (next === 1) comboStartMsRef.current = nowMs; // v0.2.10.0 D3: chain birth
        comboCountRef.current = next;
        comboLastMsRef.current = nowMs;
        setComboCount(next);
        if (COMBO_MILESTONES.has(next) && !document.hidden && !prefersReducedMotion()) {
          const n = ++comboN.current;
          setComboBurst(n);
          window.setTimeout(() => setComboBurst((b) => (b === n ? null : b)), 900);
        }
        // v0.1.5.0 D3 (C.3): a live queue-lander arms the guard banner —
        // rendered only while the repo is actually violating (see render).
        const d = msg.data as { repo_id?: string; mode?: string };
        if (d.repo_id && (d.mode === "UNKNOWN" || d.mode === "AMBIGUOUS")) {
          setGuardEvent({ repo: d.repo_id });
          // D5 trigger (1): coalesced pick-needed notification (hidden tab only)
          const repo = d.repo_id;
          notifyPickNeeded(repo, () => navigateToRepo(repo, true));
        }
      }
      if (msg.type === "repo_status_changed") {
        const d = msg.data as {
          repo: string;
          clean: boolean;
          count: number;
          offline: boolean;
          branch: string | null;
        };
        const statusValue = {
          clean: d.clean,
          count: d.count,
          offline: d.offline,
          branch: d.branch,
        };
        statusPatchesRef.current.set(d.repo, {
          epoch: ++statusEpochRef.current,
          value: statusValue,
        });
        // D5 trigger (2): dirty->CLEAN — transition map lives in notify.ts
        // (RV9: never notify from inside the setRepos updater below).
        const transitioned = notifyStatusChange(d.repo, d.clean, () => navigateToRepo(d.repo, false));
        if (transitioned) {
          // v0.2.8.0 A.2 (R-BH): the CLEAN chime — the 4th channel
          // column (opt-in, visibility-independent), beside the
          // toast/burst/OS-card, each channel its own law (D2).
          playChime();
          // v0.1.7.0 D6 (C.3), the RV1 channel matrix: TOAST always (the
          // durable record); BURST only while the tab is visible.
          const n = ++celebrationN.current;
          const animate = !prefersReducedMotion();
          setToasts((prev) => [
            ...prev.filter((t) => t.repo !== d.repo),
            { repo: d.repo, n, animate },
          ]);
          announceStatus(`${d.repo} is clean.`);
          if (!document.hidden && animate) {
            setBurst({ repo: d.repo, n });
            window.setTimeout(() => setBurst((b) => (b && b.n === n ? null : b)), 900);
          }
        }
        setRepos((prev) => prev.map((r) => (
          r.id === d.repo ? { ...r, ...statusValue } : r
        )));
      }
      if (msg.type === "warning") {
        // D5 trigger (3): server warning (hidden tab only)
        const d = msg.data as { repo?: string; message?: string };
        if (d.repo && d.message) {
          const repo = d.repo;
          notifyWarning(repo, d.message, () => navigateToRepo(repo, false));
          announceStatus(`${repo} warning: ${d.message}`);
        }
      }
      if (msg.type === "commit_detected") {
        // v0.2.7.0 C.1 (R-BG): the RELEASE-LINE LAW (RV5) — every KATLAB
        // commit is version-ENDed, so the moment fires ONLY on a 3-part-
        // prefix change (a 4th-part bump fast-forwards the release
        // branch; it is not a new release). Swept variants carry no
        // message (guarded); the hash set = once-per-session (2nd belt).
        const d = msg.data as { repo?: string; hash?: string; message?: string; swept?: boolean };
        if (d.swept !== true && typeof d.message === "string" && d.repo && d.hash
            && !seenReleasesRef.current.has(d.hash)) {
          const m = RELEASE_RX.exec(d.message);
          if (m) {
            seenReleasesRef.current.add(d.hash);
            const repo = d.repo;
            const version = m[0].trim();
            const prev = lastVersionRef.current.get(repo);
            lastVersionRef.current.set(repo, version);
            // prev undefined = no baseline -> SEED silently (a mid-cycle
            // session must never banner history); equal prefix = rider.
            if (prev !== undefined && prefix3(prev) !== prefix3(version)) {
              if (dreamingRef.current) wakeCoordinatorRef.current();
              const n = ++releaseN.current;
              // RV10 stack: newest on top, same-repo replaces, cap 3.
              setReleases((prevR) => [{ repo, version, n, animate: !prefersReducedMotion() },
                ...prevR.filter((x) => x.repo !== repo)].slice(0, 3));
              announceStatus(`${repo} released ${version}.`);
              window.setTimeout(() => { // own 12s nonce-compare dismiss
                setReleases((prevR) => prevR.filter((x) => !(x.repo === repo && x.n === n)));
              }, 12_000);
              notifyRelease(repo, version, () => navigateToRepo(repo, false));
              // v0.2.8.0 A.2 (R-BH): the release fanfare — consonant
              // beside the same-moment CLEAN chime by the RV4 one-key
              // law (a release also cleans its repo).
              playFanfare();
            }
          }
        }
      }
    }, () => {
      setMissionNonce((value) => value + 1);
      void sync();
    });
    return () => {
      clearTimeout(timer);
      clearTimeout(missionTimer);
      close();
    };
  }, [announceStatus, sync]);

  useEffect(() => {
    // P8: relative times (and the heartbeat chip) must never freeze on an
    // idle UI - re-render once a minute even without WS traffic.
    const timer = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(timer);
  }, []);

  // v0.2.7.0 C.1 (RV18): release-baseline seeding on the FIRST non-empty
  // repos payload — never "at mount": repos is EMPTY there (it arrives
  // via the first sync), and a mount-keyed seed would leave every
  // baseline null, so the session's first real release would silently
  // seed instead of fire. Once-latch; RV14: only-if-null writes (a WS
  // commit racing the seed has already set a FRESHER baseline).
  useEffect(() => {
    if (releaseSeededRef.current || repos.length === 0) return;
    releaseSeededRef.current = true;
    for (const r of repos) {
      void api.history(r.id, 1).then((rows) => {
        const m = RELEASE_RX.exec(rows[0]?.commit.message ?? "");
        if (m && !lastVersionRef.current.has(r.id)) {
          lastVersionRef.current.set(r.id, m[0].trim());
        }
      }).catch(() => { /* failed seed = null = the silent-seed path */ });
    }
  }, [repos]);

  // v0.1.12.0 D2 (C.1): taskbar badge on the INSTALLED PWA — n = the
  // ALL-tab uncommitted KPI basis EXACTLY (non-offline sum, RV1: a stale
  // offline count must never pin a wrong number to the taskbar). Feature-
  // detected; the calls reject when the app is not installed — silenced.
  useEffect(() => {
    if (!("setAppBadge" in navigator)) return;
    const n = repos.filter((r) => !r.offline).reduce((s, r) => s + r.count, 0);
    (n > 0 ? navigator.setAppBadge(n) : navigator.clearAppBadge()).catch(() => {});
  }, [repos]);

  // v0.2.1.0 D2 (B.2): the live status favicon — the SAME non-offline
  // basis as the badge above (the presence surfaces never disagree);
  // feature-detected (link + 2d context), silent no-op otherwise.
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) return;
    const n = repos.filter((r) => !r.offline).reduce((s, r) => s + r.count, 0);
    const url = drawStatusFavicon(n === 0, n);
    if (url) {
      link.href = url;
      link.type = "image/png";
    }
  }, [repos]);

  // v0.1.7.0 D6 (C.3): toast dismissal — its ✕ or ANY click outside the
  // toast stack (the AttentionBell click-out precedent). Toasts are NOT
  // overlays: no data-overlay-open, Ctrl+K stays available while they wait.
  const hasToasts = toasts.length > 0;
  useEffect(() => {
    if (!hasToasts) return;
    const onDown = (e: PointerEvent) => {
      if (!(e.target as Element | null)?.closest?.("[data-toast-stack]")) setToasts([]);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [hasToasts]);

  // v0.1.5.0 D3 (C.3): per-repo discipline state — armed = repo has parsed
  // tasks (zero-task repos never nag); violation = in-progress count != 1.
  // Derived at render time from live tasks, so a task_updated re-sync
  // clears the chip/banner the moment statuses are fixed.
  const taskStats = useMemo(() => {
    const m = new Map<string, { total: number; inProgress: number }>();
    for (const t of tasks) {
      const s = m.get(t.repo) ?? { total: 0, inProgress: 0 };
      s.total += 1;
      if (t.status === "in-progress") s.inProgress += 1;
      m.set(t.repo, s);
    }
    return m;
  }, [tasks]);
  const violationOf = useCallback((repoId: string): number | null => {
    const s = taskStats.get(repoId);
    if (!s || s.total === 0) return null; // not armed
    return s.inProgress === 1 ? null : s.inProgress;
  }, [taskStats]);
  // Banner slot (D3): set by a live queue-lander WS event on a violating
  // repo; dismiss hides it; the next qualifying event re-arms it. Rendered
  // conditionally on the CURRENT violation, so fixing the plan clears it.
  const [guardEvent, setGuardEvent] = useState<{ repo: string } | null>(null);

  // v0.1.5.0 D4 (C.4) + RV23: cross-view navigation with a DEFERRED scroll —
  // the sec-pick anchor exists only after ChangesView mounts. v0.1.5.0 CFT-5
  // (bare CFT-N elsewhere in this file = the v0.1.0.0 loop): pending
  // scroll is STATE, not a ref — a ref mutation never re-renders, so when
  // every other setState in the path bails out (palette jump while already
  // on Changes; notification click while already on that repo's tab) the
  // ref stayed armed and fired as a phantom scroll on the next unrelated
  // render. Consumed + ALWAYS cleared by the effect (no phantom scroll
  // later when the anchor is absent).
  const [pendingScroll, setPendingScroll] = useState<string | null>(null);
  const [routeFocusRequest, setRouteFocusRequest] = useState<{
    generation: number;
    scrollTop: number;
  } | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);
  const snapshotUiRef = useRef({
    taskFilter,
    sessionFilter,
    groupMode,
    sidebarMode,
    historyUi,
    overviewUi,
    assignmentUi,
    missionUi,
    pagePositions,
  });
  snapshotUiRef.current = {
    taskFilter,
    sessionFilter,
    groupMode,
    sidebarMode,
    historyUi,
    overviewUi,
    assignmentUi,
    missionUi,
    pagePositions,
  };

  const captureEntrySnapshot = useCallback((): EntrySnapshot => {
    const current = snapshotUiRef.current;
    return {
      scrollTop: mainRef.current?.scrollTop ?? 0,
      taskFilter: current.taskFilter,
      sessionFilter: current.sessionFilter ? { ...current.sessionFilter } : null,
      groupMode: current.groupMode,
      sidebarMode: current.sidebarMode,
      history: { ...current.historyUi },
      overview: {
        ...current.overviewUi,
        relationship: current.overviewUi.relationship
          ? { ...current.overviewUi.relationship }
          : null,
      },
      assignment: {
        selectedIds: [...current.assignmentUi.selectedIds],
        bulkChoice: current.assignmentUi.bulkChoice,
        choices: { ...current.assignmentUi.choices },
      },
      mission: normalizeMissionEntry(current.missionUi),
      pages: { ...current.pagePositions },
    };
  }, []);

  const snapshotFrameRef = useRef<number | null>(null);
  const saveCurrentEntry = useCallback(() => {
    if (snapshotFrameRef.current !== null) {
      window.cancelAnimationFrame(snapshotFrameRef.current);
      snapshotFrameRef.current = null;
    }
    entrySnapshotsRef.current.set(entryIdRef.current, captureEntrySnapshot());
  }, [captureEntrySnapshot]);
  const scheduleCurrentEntrySave = useCallback(() => {
    if (snapshotFrameRef.current !== null) return;
    snapshotFrameRef.current = window.requestAnimationFrame(() => {
      snapshotFrameRef.current = null;
      entrySnapshotsRef.current.set(entryIdRef.current, captureEntrySnapshot());
    });
  }, [captureEntrySnapshot]);
  useEffect(() => () => {
    if (snapshotFrameRef.current !== null) {
      window.cancelAnimationFrame(snapshotFrameRef.current);
    }
  }, []);

  useEffect(() => {
    saveCurrentEntry();
  }, [assignmentUi, groupMode, historyUi, missionUi, overviewUi, pagePositions,
    saveCurrentEntry, sessionFilter, sidebarMode, taskFilter]);

  const navigate = useCallback((
    intent: Partial<AppRoute>,
    options: NavigateOptions = {},
  ) => {
    if (dreamingRef.current) wakeCoordinatorRef.current();
    if (options.indirect) {
      suppressOverlayFocusRestore();
      suppressDisclosureFocusRestore();
    }
    const desired = desiredRouteRef.current;
    const target: AppRoute = {
      scope: intent.scope ?? desired.scope,
      view: intent.view ?? desired.view,
    };
    desiredRouteRef.current = target;
    const generation = ++routeGenerationRef.current;
    skipActiveViewTransitions();

    const commit = () => {
      if (routeGenerationRef.current !== generation) return;
      const currentRoute = currentRouteRef.current;
      const routeChanged = !routeEquals(currentRoute, target);
      const scopeChanged = !scopeEquals(currentRoute.scope, target.scope);
      const ui = snapshotUiRef.current;
      const hasTaskOverride = Object.prototype.hasOwnProperty.call(options, "taskFilter");
      const nextTaskFilter = hasTaskOverride
        ? options.taskFilter ?? null
        : scopeChanged
          ? target.scope.kind === "repo"
            && taskIdentityParts(ui.taskFilter)?.[0] === target.scope.id
              ? ui.taskFilter
              : null
          : ui.taskFilter;
      const nextSessionFilter = scopeChanged || !ui.sessionFilter
        ? null
        : { ...ui.sessionFilter };
      const nextGroupMode = options.groupMode ?? ui.groupMode;
      const nextPages = currentRoute.view === target.view ? { ...ui.pagePositions } : {};
      const nextHistory = currentRoute.view === "history" && target.view === "history"
        ? { ...ui.historyUi }
        : { ...DEFAULT_HISTORY_UI };
      const nextOverview = currentRoute.view === "overview" && target.view === "overview"
        ? {
            ...ui.overviewUi,
            relationship: ui.overviewUi.relationship
              && (target.scope.kind === "all"
                || ui.overviewUi.relationship.repoId === target.scope.id)
              ? { ...ui.overviewUi.relationship }
              : null,
          }
        : defaultOverviewUi();
      const nextAssignment = currentRoute.view === "changes" && target.view === "changes"
        ? clampAssignmentUi(ui.assignmentUi, eventsRef.current, tasksRef.current, target.scope)
        : { ...DEFAULT_ASSIGNMENT_UI, selectedIds: [], choices: {} };
      const nextMission = currentRoute.view === "mission" && target.view === "mission"
        ? normalizeMissionEntry(
            ui.missionUi,
            target.scope.kind === "repo" ? target.scope.id : undefined,
          )
        : normalizeMissionEntry(null);

      if (routeChanged) {
        saveCurrentEntry();
        if ((options.history ?? "push") === "push") {
          const nextEntryId = newEntryId();
          entryIdRef.current = nextEntryId;
          entrySnapshotsRef.current.set(nextEntryId, {
            scrollTop: 0,
            taskFilter: nextTaskFilter,
            sessionFilter: nextSessionFilter,
            groupMode: nextGroupMode,
            sidebarMode: ui.sidebarMode,
            history: nextHistory,
            overview: nextOverview,
            assignment: nextAssignment,
            mission: nextMission,
            pages: nextPages,
          });
          window.history.pushState(
            mergedHistoryState(nextEntryId),
            "",
            formatRouteUrl(target, window.location.pathname, window.location.hash),
          );
        } else if (options.history === "replace") {
          window.history.replaceState(
            mergedHistoryState(entryIdRef.current),
            "",
            formatRouteUrl(target, window.location.pathname, window.location.hash),
          );
        }
        dayLaneForegroundEntryRef.current = scopeChanged
          && target.view === "overview"
          && (options.history ?? "push") === "push"
          ? entryIdRef.current
          : "";
      } else if (options.history === "replace") {
        window.history.replaceState(
          mergedHistoryState(entryIdRef.current),
          "",
          formatRouteUrl(target, window.location.pathname, window.location.hash),
        );
      }

      currentRouteRef.current = target;
      setScope(target.scope);
      setView(target.view);
      setTaskFilter(nextTaskFilter);
      setSessionFilter(nextSessionFilter);
      setGroupMode(nextGroupMode);
      if (routeChanged) setPagePositions(nextPages);
      if (routeChanged) setHistoryUi(nextHistory);
      if (routeChanged) setOverviewUi(nextOverview);
      if (routeChanged) setAssignmentUi(nextAssignment);
      if (routeChanged) setMissionUi(nextMission);
      setPendingScroll(options.pendingScroll ?? null);
      setActiveDialog(null);
      setPanelOpen(false);
      setMoreOpen(false);
      setTaskDrawerOpen(false);
      setShowLegend(false);
      if (options.indirect) {
        setRouteFocusRequest({ generation, scrollTop: 0 });
      }
    };

    if (options.animate === false || prefersReducedMotion()) commit();
    else withViewTransition(commit);
  }, [saveCurrentEntry]);

  repairMembershipRef.current = (repoIds) => {
    const repaired = repairRouteMembership(desiredRouteRef.current, repoIds);
    const canonicalUrl = formatRouteUrl(
      repaired,
      window.location.pathname,
      window.location.hash,
    );
    const currentUrl = window.location.pathname + window.location.search
      + window.location.hash;
    const routeChanged = !routeEquals(repaired, desiredRouteRef.current);
    if (routeChanged || canonicalUrl !== currentUrl) {
      navigate(repaired, { history: "replace", animate: false, indirect: routeChanged });
    }
  };

  useEffect(() => {
    if (view !== "changes" || !pendingScroll) return;
    const id = pendingScroll;
    setPendingScroll(null);
    requestAnimationFrame(() => {
      const target = document.getElementById(id);
      target?.scrollIntoView({
        behavior: prefersReducedMotion() ? "auto" : "smooth",
        block: "start",
      });
      if (target instanceof HTMLElement) {
        if (!target.hasAttribute("tabindex")) target.tabIndex = -1;
        target.focus({ preventScroll: true });
      }
    });
  }, [view, pendingScroll]);
  const navigateToRepo = useCallback((repoId: string, scrollToPicks: boolean) => {
    navigate(
      { scope: { kind: "repo", id: repoId }, view: "changes" },
      { indirect: true, pendingScroll: scrollToPicks ? "sec-pick" : null },
    );
  }, [navigate]);

  // v0.1.5.0 D5 (D.1): OS-notification toggle — lives in the attention
  // panel FOOTER (user 2026-07-19: one bell in the header). RV21: any
  // non-granted permission snaps it back off with an inline note.
  const [notifyOn, setNotifyOn] = useState(notifyWanted());
  const [notifyNote, setNotifyNote] = useState("");
  const [notifyBusy, setNotifyBusy] = useState(false);
  const notifyBusyRef = useRef(false);
  const toggleNotify = useCallback(() => {
    if (notifyBusyRef.current) return;
    notifyBusyRef.current = true;
    setNotifyBusy(true);
    const next = !notifyOn;
    void setNotifyEnabled(next).then((granted) => {
      setNotifyOn(granted);
      const message = next
        ? granted
          ? "OS alerts enabled."
          : "Notification permission was denied or dismissed; alerts remain off."
        : "OS alerts disabled.";
      setNotifyNote(message);
      announceStatus(message);
    }, (errorValue) => {
      const message = `OS alerts could not change: ${String(errorValue).slice(0, 80)}.`;
      setNotifyNote(message);
      announceStatus(message);
    }).finally(() => {
      notifyBusyRef.current = false;
      setNotifyBusy(false);
    });
  }, [announceStatus, notifyOn]);
  // v0.2.8.0 D5 (A.2, R-BH): the sound toggle — notifyOn's twin (the
  // click IS the AudioContext gesture; sound.ts owns the RV15 order).
  const [soundOn, setSoundOn] = useState(soundWanted());
  const [soundNote, setSoundNote] = useState("");
  const [soundBusy, setSoundBusy] = useState(false);
  const soundBusyRef = useRef(false);
  const toggleSound = useCallback(() => {
    if (soundBusyRef.current) return;
    soundBusyRef.current = true;
    setSoundBusy(true);
    const next = !soundOn;
    void setSoundEnabled(next).then((effective) => {
      setSoundOn(effective);
      const message = next
        ? effective ? "Sounds enabled." : "Audio is unavailable; sounds remain off."
        : "Sounds disabled.";
      setSoundNote(message);
      announceStatus(message);
    }, (errorValue) => {
      const message = `Sounds could not change: ${String(errorValue).slice(0, 80)}.`;
      setSoundNote(message);
      announceStatus(message);
    }).finally(() => {
      soundBusyRef.current = false;
      setSoundBusy(false);
    });
  }, [announceStatus, soundOn]);
  // v0.2.9.0 D2/D3 (A.2, R-BL): the commit-draft action — clipboard
  // only, forever (the click is the gesture); the inline note rides
  // the digestNote recipe (~3s, repo-keyed).
  const [draftNote, setDraftNote] = useState<{ repo: string; ok: boolean; n: number } | null>(null);
  const [draftBusyRepos, setDraftBusyRepos] = useState<Set<string>>(new Set());
  const draftBusyRef = useRef<Set<string>>(new Set());
  const draftNoteN = useRef(0);
  // v0.2.10.0 D8 (A.3c, R-BO): the odometer moment — nonce-compare
  // timer (the v0.2.9.0 CFT-2 law); dies by its own 8s clock, immune
  // to the outside-click toast clear (that handler clears TOASTS only).
  const [odoNote, setOdoNote] = useState<{
    id: number; n: number; animate: boolean;
  } | null>(null);
  const odoN = useRef(0);
  useEffect(() => {
    if (!reducedMotion) return;
    setBurst(null);
    setComboBurst(null);
    setToasts((current) => current.map((toast) => toast.animate
      ? { ...toast, animate: false }
      : toast));
    setReleases((current) => current.map((release) => release.animate
      ? { ...release, animate: false }
      : release));
    setOdoNote((current) => current?.animate ? { ...current, animate: false } : current);
  }, [reducedMotion]);
  const doDraft = useCallback((repoId: string) => {
    if (draftBusyRef.current.has(repoId)) return;
    draftBusyRef.current.add(repoId);
    setDraftBusyRepos(new Set(draftBusyRef.current));
    void copyCommitDraft(repoId, events, tasks).then((ok) => {
      // CFT-2: NONCE-compare clear (the celebration law) — a repo-keyed
      // compare let a rapid re-click's note be cleared EARLY by the
      // first click's timer.
      const n = ++draftNoteN.current;
      setDraftNote({ repo: repoId, ok, n });
      announceStatus(ok
        ? `Commit draft for ${repoId} copied.`
        : `Commit draft for ${repoId} could not be copied.`);
      window.setTimeout(() => {
        setDraftNote((cur) => (cur && cur.n === n ? null : cur));
      }, 3000);
    }, (errorValue) => {
      const n = ++draftNoteN.current;
      setDraftNote({ repo: repoId, ok: false, n });
      announceStatus(`Commit draft for ${repoId} failed: ${String(errorValue).slice(0, 80)}.`);
      window.setTimeout(() => {
        setDraftNote((cur) => (cur && cur.n === n ? null : cur));
      }, 3000);
    }).finally(() => {
      draftBusyRef.current.delete(repoId);
      setDraftBusyRepos(new Set(draftBusyRef.current));
    });
  }, [announceStatus, events, tasks]);

  const lastInputRef = useRef(Date.now());
  const [attractOn, setAttractOn] = useState(
    localStorage.getItem("katlab.attract") !== "off");
  const toggleAttract = useCallback(() => {
    setAttractOn((on) => {
      localStorage.setItem("katlab.attract", on ? "off" : "on");
      return !on;
    });
  }, []);
  const [dreaming, setDreaming] = useState(false);
  const dreamSnapRef = useRef<AppRoute | null>(null);
  const dreamIdxRef = useRef(0);

  const wakeFromDream = useCallback(() => {
    const snapshot = dreamSnapRef.current;
    if (!dreamingRef.current && !snapshot) return;
    dreamingRef.current = false;
    dreamGenerationRef.current += 1;
    routeGenerationRef.current += 1;
    lastInputRef.current = Date.now();
    skipActiveViewTransitions();
    if (snapshot) {
      desiredRouteRef.current = snapshot;
      currentRouteRef.current = snapshot;
    }
    dreamSnapRef.current = null;
    flushSync(() => {
      setDreaming(false);
      if (snapshot) {
        setScope(snapshot.scope);
        setView(snapshot.view);
      }
    });
  }, []);
  wakeCoordinatorRef.current = wakeFromDream;

  useEffect(() => {
    const onPointer = () => { lastInputRef.current = Date.now(); };
    const onKey = () => {
      lastInputRef.current = Date.now();
      if (dreamingRef.current) wakeCoordinatorRef.current();
    };
    const onBlur = () => window.requestAnimationFrame(() => {
      const focused = document.activeElement;
      if (focused instanceof HTMLIFrameElement
          && focused.matches('iframe[src^="/chronicle/"]')) {
        lastInputRef.current = Date.now();
      }
    });
    window.addEventListener("pointerdown", onPointer, { passive: true });
    window.addEventListener("keydown", onKey, { capture: true });
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  useEffect(() => {
    if (dreaming) return;
    const timer = window.setInterval(() => {
      if (!attractOn || prefersReducedMotion() || activeDialog !== null
          || releases.length > 0 || panelOpen || moreOpen || taskDrawerOpen
          || showLegend || document.hidden || view === "chronicle" || view === "mission"
          || hasActiveInteraction()) return;
      if (Date.now() - lastInputRef.current >= ATTRACT_IDLE_MS) {
        const snapshot = currentRouteRef.current;
        dreamSnapRef.current = snapshot;
        dreamIdxRef.current = 0;
        dreamingRef.current = true;
        const generation = ++dreamGenerationRef.current;
        routeGenerationRef.current += 1;
        skipActiveViewTransitions();
        setDreaming(true);
        withViewTransition(() => {
          if (!dreamingRef.current || dreamGenerationRef.current !== generation) return;
          const dreamRoute = { ...snapshot, view: "city" as View };
          currentRouteRef.current = dreamRoute;
          setView("city");
        });
      }
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [activeDialog, attractOn, dreaming, moreOpen, panelOpen, releases.length,
    showLegend, taskDrawerOpen, view]);

  useEffect(() => {
    if (!dreaming) return;
    const timer = window.setInterval(() => {
      dreamIdxRef.current = (dreamIdxRef.current + 1) % ATTRACT_VIEWS.length;
      const nextView = ATTRACT_VIEWS[dreamIdxRef.current];
      const generation = ++dreamGenerationRef.current;
      skipActiveViewTransitions();
      withViewTransition(() => {
        if (!dreamingRef.current || dreamGenerationRef.current !== generation) return;
        const nextRoute = { ...currentRouteRef.current, view: nextView };
        currentRouteRef.current = nextRoute;
        setView(nextView);
      });
    }, ATTRACT_CYCLE_MS);
    return () => window.clearInterval(timer);
  }, [dreaming]);

  useEffect(() => {
    const onPopState = () => {
      const parsed = parseRouteSearch(window.location.search);
      const knownRepoIds = new Set(reposRef.current.map((repo) => repo.id));
      const targetMembershipReady = membershipReadyRef.current
        || parsed.route.scope.kind === "all";
      const target = targetMembershipReady
        ? repairRouteMembership(parsed.route, knownRepoIds)
        : parsed.route;
      const existingPoppedEntryId = historyEntryId();
      const poppedEntryId = existingPoppedEntryId ?? newEntryId();
      if (!existingPoppedEntryId) {
        window.history.replaceState(
          mergedHistoryState(poppedEntryId),
          "",
          window.location.pathname + window.location.search + window.location.hash,
        );
      }

      const shouldCanonicalize = targetMembershipReady && (
        parsed.needsCanonicalReplace || !routeEquals(target, parsed.route)
      );
      lastInputRef.current = Date.now();
      saveCurrentEntry();
      const snapshot = entrySnapshotsRef.current.get(poppedEntryId);
      const validTaskFilter = snapshot?.taskFilter
        && tasksRef.current.some((task) => taskIdentity(task.repo, task.task_ref) === snapshot.taskFilter)
        && (target.scope.kind === "all"
          || taskIdentityParts(snapshot.taskFilter)?.[0] === target.scope.id)
        ? snapshot.taskFilter
        : null;
      const validSessionFilter = snapshot?.sessionFilter
        && eventsRef.current.some((event) => sameSessionIdentity(
          eventSessionIdentity(event), snapshot.sessionFilter,
        )
          && (target.scope.kind === "all" || event.repo_id === target.scope.id))
        ? { ...snapshot.sessionFilter }
        : null;
      const historyRepos = reposRef.current.filter((repo) => !repo.offline
        && (target.scope.kind === "all" || repo.id === target.scope.id));
      const historyRepoId = snapshot?.history.repoId
        && historyRepos.some((repo) => repo.id === snapshot.history.repoId)
        ? snapshot.history.repoId
        : historyRepos[0]?.id ?? "";
      const historyState: HistoryUiState = {
        repoId: historyRepoId,
        fetchDepth: Math.max(PAGE, snapshot?.history.fetchDepth ?? PAGE),
        page: Math.max(1, snapshot?.history.page ?? 1),
      };
      const relationship = snapshot?.overview.relationship;
      const validRelationship = relationship
        && tasksRef.current.some((task) => task.repo === relationship.repoId
          && task.plan_file === relationship.planFile)
        && (target.scope.kind === "all" || relationship.repoId === target.scope.id)
        ? { ...relationship }
        : null;
      const rawDay = snapshot?.overview.day ?? currentLocalDay();
      const parsedDay = isExactCalendarDay(rawDay) ? rawDay : currentLocalDay();
      const rawSpeed = snapshot?.overview.speed;
      const overviewState: OverviewUiState = {
        relationship: validRelationship,
        day: parsedDay,
        speed: rawSpeed === 2 || rawSpeed === 4 ? rawSpeed : 1,
      };
      const assignmentState = clampAssignmentUi(
        snapshot?.assignment ?? DEFAULT_ASSIGNMENT_UI,
        eventsRef.current,
        tasksRef.current,
        target.scope,
      );
      const missionState = normalizeMissionEntry(
        snapshot?.mission,
        target.scope.kind === "repo" ? target.scope.id : undefined,
      );
      const generation = ++routeGenerationRef.current;
      const scopeChanged = !scopeEquals(currentRouteRef.current.scope, target.scope);
      dreamGenerationRef.current += 1;
      dreamingRef.current = false;
      dreamSnapRef.current = null;
      desiredRouteRef.current = target;
      currentRouteRef.current = target;
      entryIdRef.current = poppedEntryId;
      dayLaneForegroundEntryRef.current = scopeChanged && target.view === "overview"
        ? poppedEntryId
        : "";
      membershipReadyRef.current = targetMembershipReady;
      skipActiveViewTransitions();
      suppressOverlayFocusRestore();
      suppressDisclosureFocusRestore();

      if (shouldCanonicalize) {
        window.history.replaceState(
          mergedHistoryState(poppedEntryId),
          "",
          formatRouteUrl(target, window.location.pathname, window.location.hash),
        );
      }

      flushSync(() => {
        setDreaming(false);
        setScope(target.scope);
        setView(target.view);
        setMembershipReady(targetMembershipReady);
        setTaskFilter(validTaskFilter);
        setSessionFilter(validSessionFilter);
        setGroupMode(snapshot?.groupMode === "folder" ? "folder" : "task");
        setSidebarMode(snapshot?.sidebarMode === "all" ? "all" : "active");
        setHistoryUi(historyState);
        setOverviewUi(overviewState);
        setAssignmentUi(assignmentState);
        setMissionUi(missionState);
        setPagePositions({ ...(snapshot?.pages ?? {}) });
        setActiveDialog(null);
        setPanelOpen(false);
        setMoreOpen(false);
        setTaskDrawerOpen(false);
        setShowLegend(false);
        setPendingScroll(null);
        setRouteFocusRequest({ generation, scrollTop: snapshot?.scrollTop ?? 0 });
      });
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [saveCurrentEntry]);

  const consumeInitialDayScopeAction = useCallback(() => {
    if (dayLaneForegroundEntryRef.current === entryIdRef.current) {
      dayLaneForegroundEntryRef.current = "";
    }
  }, []);

  useEffect(() => {
    const request = routeFocusRequest;
    const main = mainRef.current;
    if (!request || !main || request.generation !== routeGenerationRef.current) return;
    const statsReady = view !== "overview"
      || !membershipReady
      || (statsState.key === currentScopeKey && statsState.settled);

    const complete = (): boolean => {
      if (request.generation !== routeGenerationRef.current || !statsReady) return false;
      const failure = main.querySelector<HTMLElement>(
        "#lazy-view-failure, #history-load-failure, [data-route-hydration-failure]",
      );
      const hydrationPending = main.querySelector<HTMLElement>(
        '[data-route-hydration-ready="false"]',
      );
      const history = main.querySelector<HTMLElement>("[data-history-ready]");
      if (view === "history" && !failure
          && history?.dataset.historyReady !== "true") return false;
      if (!failure && hydrationPending) return false;
      const heading = main.querySelector<HTMLElement>("[data-view-heading]");
      if (!failure && !heading) return false;
      const target = failure ?? heading ?? main;
      window.requestAnimationFrame(() => {
        if (request.generation !== routeGenerationRef.current) return;
        if (!target.hasAttribute("tabindex")) target.tabIndex = -1;
        if (request.scrollTop > 0 && !failure) {
          main.focus({ preventScroll: true });
          main.scrollTop = Math.min(request.scrollTop, main.scrollHeight - main.clientHeight);
        } else {
          target.focus({ preventScroll: true });
          main.scrollTop = 0;
        }
        setRouteFocusRequest((current) => current?.generation === request.generation
          ? null
          : current);
      });
      return true;
    };

    if (complete()) return;
    const observer = new MutationObserver(() => {
      if (complete()) observer.disconnect();
    });
    observer.observe(main, { childList: true, subtree: true, attributes: true });
    return () => observer.disconnect();
  }, [currentScopeKey, membershipReady, routeFocusRequest, statsState, view]);

  // D17: digest preparation is async; the prepared Blob downloads only from
  // a second, synchronous user activation shared by every action home.
  const [digestNote, setDigestNote] = useState("");
  const [digestState, setDigestState] = useState<DigestState>({ kind: "idle" });
  const digestStateRef = useRef<DigestState>({ kind: "idle" });
  const digestGenerationRef = useRef(0);
  const digestControllerRef = useRef<AbortController | null>(null);
  const digestScopeKeyRef = useRef(currentScopeKey);
  const setDigestStatus = useCallback((next: DigestState) => {
    digestStateRef.current = next;
    setDigestState(next);
  }, []);

  useLayoutEffect(() => {
    if (digestScopeKeyRef.current === currentScopeKey) return;
    digestScopeKeyRef.current = currentScopeKey;
    digestGenerationRef.current += 1;
    digestControllerRef.current?.abort();
    digestControllerRef.current = null;
    setDigestStatus({ kind: "idle" });
    setDigestNote("");
  }, [currentScopeKey, setDigestStatus]);

  useEffect(() => () => {
    digestGenerationRef.current += 1;
    digestControllerRef.current?.abort();
  }, []);

  const doDigest = useCallback(() => {
    const current = digestStateRef.current;
    if (current.kind === "preparing" || current.kind === "downloading") return;
    if (!membershipReady) {
      const message = `Digest unavailable while validating ${scopeLabel(scope)}.`;
      setDigestNote(message);
      announceStatus(message);
      return;
    }
    if (current.kind === "ready" && current.scopeKey === currentScopeKey) {
      setDigestStatus({ ...current, kind: "downloading" });
      try {
        startBlobDownload(current.prepared);
        setDigestStatus({ kind: "idle" });
        setDigestNote("Digest download started.");
        announceStatus("Daily digest download started.");
      } catch (errorValue) {
        setDigestStatus(current);
        const message = `Digest download could not start: ${String(errorValue).slice(0, 80)}. Retry.`;
        setDigestNote(message);
        announceStatus(message);
      }
      return;
    }

    const action = createActionDeadline();
    const generation = ++digestGenerationRef.current;
    digestControllerRef.current?.abort();
    digestControllerRef.current = action.controller;
    setDigestStatus({ kind: "preparing", scopeKey: currentScopeKey });
    setDigestNote("Preparing digest…");
    const apiScope = scopeApiId(scope);
    void prepareDigest(apiScope,
        apiScope ? repos.filter((r) => r.id === apiScope) : repos,
        apiScope ? tasks.filter((t) => t.repo === apiScope) : tasks,
        apiScope ? events.filter((e) => e.repo_id === apiScope) : events,
        action.signal).then((prepared) => {
      if (digestGenerationRef.current !== generation
          || digestScopeKeyRef.current !== currentScopeKey
          || action.signal.aborted) return;
      setDigestStatus({ kind: "ready", scopeKey: currentScopeKey, prepared });
      setDigestNote("Digest ready — activate Download prepared digest.");
      announceStatus("Daily digest ready for download.");
    }, (errorValue) => {
      if (digestGenerationRef.current !== generation) return;
      if (isAbortError(errorValue) && !action.didTimeout()) return;
      setDigestStatus({ kind: "idle" });
      const message = action.didTimeout()
        ? "Digest preparation timed out after 10 seconds. Retry."
        : `Digest preparation failed: ${String(errorValue).slice(0, 80)}. Retry.`;
      setDigestNote(message);
      announceStatus(message);
    }).finally(() => {
      action.clear();
      if (digestControllerRef.current === action.controller) {
        digestControllerRef.current = null;
      }
    });
  }, [announceStatus, currentScopeKey, events, membershipReady, repos, scope,
    setDigestStatus, tasks]);

  const digestBusy = digestState.kind === "preparing" || digestState.kind === "downloading";
  const digestActionLabel = digestState.kind === "ready"
    ? "Download prepared digest"
    : digestState.kind === "preparing"
      ? "Preparing daily digest…"
      : digestState.kind === "downloading"
        ? "Starting digest download…"
        : "Export daily digest";

  const [reportBusy, setReportBusy] = useState(false);
  const reportBusyRef = useRef(false);
  const reportResetTimerRef = useRef<number | null>(null);
  useEffect(() => () => {
    if (reportResetTimerRef.current !== null) window.clearTimeout(reportResetTimerRef.current);
  }, []);
  const doReport = useCallback((reportStats: StatsData, range: 7 | 30) => {
    if (reportBusyRef.current) return;
    reportBusyRef.current = true;
    setReportBusy(true);
    try {
      exportReport(reportStats, scopeApiId(scope), range);
      announceStatus(`${range}-day report download started.`);
      reportResetTimerRef.current = window.setTimeout(() => {
        reportResetTimerRef.current = null;
        reportBusyRef.current = false;
        setReportBusy(false);
      }, 1_000);
    } catch (errorValue) {
      announceStatus(`${range}-day report download could not start: ${String(errorValue).slice(0, 80)}.`);
      reportBusyRef.current = false;
      setReportBusy(false);
    }
  }, [announceStatus, scope]);

  const openChronicleTab = useCallback(() => {
    try {
      requestNoopenerTab("/chronicle/");
      announceStatus("Chronicle open requested in a new tab.");
    } catch (errorValue) {
      announceStatus(`Chronicle could not open: ${String(errorValue).slice(0, 80)}.`);
    }
  }, [announceStatus]);

  const visibleRepos = scope.kind === "all" ? repos : repos.filter((r) => r.id === scope.id);
  // v0.1.13.0 D2 (B.2): Kat's mood — a plain per-render derivation (no
  // effect, no state); the combo timestamp is ref-read exactly like the
  // ComboMeter feed. Full repos state, never the tab-filtered view.
  const petMood = moodOf(repos, comboCount, comboLastMsRef.current, Date.now());
  // v0.2.7.0 B.2 (R-BF): derived at render, one cat everywhere; RV4 —
  // the null feed passes [] (a briefly naked Kat, never a crash).
  const wardrobe = wardrobeOf(allCal ?? []);
  const visibleTasks = scope.kind === "all" ? tasks : tasks.filter((t) => t.repo === scope.id);
  const visibleEvents = scope.kind === "all" ? events : events.filter((e) => e.repo_id === scope.id);
  const scopeUnavailableReason = membershipReady
    ? undefined
    : `Validating repository ${scopeLabel(scope)}.`;

  // v0.1.5.0 D6 (D.2): palette entries — views, ALL+repo tabs, tasks (X4
  // filter + tab switch, RV14), actions. The tree toggle also lands on
  // Changes and the alerts toggle opens the panel (RV29 visible-effect);
  // "jump to pick queue" uses the RV23 deferred scroll.
  const paletteEntries: PaletteEntry[] = [
    { id: paletteEntryId("view", "changes"), section: "Views", label: "Changes", run: () => navigate({ view: "changes" }, { indirect: true }) },
    { id: paletteEntryId("view", "mission"), section: "Views", label: "Mission", disabledReason: scopeUnavailableReason, run: () => navigate({ view: "mission" }, { indirect: true }) },
    { id: paletteEntryId("view", "overview"), section: "Views", label: "Overview", disabledReason: scopeUnavailableReason, run: () => navigate({ view: "overview" }, { indirect: true }) },
    { id: paletteEntryId("view", "history"), section: "Views", label: "History", disabledReason: scopeUnavailableReason, run: () => navigate({ view: "history" }, { indirect: true }) },
    { id: paletteEntryId("view", "city"), section: "Views", label: "City", run: () => navigate({ view: "city" }, { indirect: true }) },
    { id: paletteEntryId("view", "chronicle"), section: "Views", label: "Open Chronicle view",
      run: () => navigate({ view: "chronicle" }, { indirect: true }) },
    { id: paletteEntryId("dialog", "focus"), section: "Views", label: "Enter focus mode",
      hint: "ambient wall display — Esc exits", opensDialog: true,
      disabledReason: scopeUnavailableReason,
      run: () => openDialog({ kind: "focus", scope: scopeApiId(scope) }) },
    { id: paletteEntryId("dialog", "health"), section: "Views", label: "Open system health",
      hint: "watchers · hook · capture freshness", opensDialog: true,
      run: () => openDialog({ kind: "health" }) },
    { id: paletteEntryId("scope", "all"), section: "Repos", label: "All repos", run: () => navigate({ scope: { kind: "all" } }, { indirect: true }) },
    ...repos.map((r): PaletteEntry => ({
      id: paletteEntryId("scope", "repo", r.id), section: "Repos", label: r.id,
      hint: r.clean ? "CLEAN ✓" : `${r.count} uncommitted`,
      run: () => navigate({ scope: { kind: "repo", id: r.id } }, { indirect: true }),
    })),
    ...tasks.map((t): PaletteEntry => ({
      id: paletteEntryId("task", t.repo, t.plan_file, t.task_ref),
      section: "Tasks", label: `${t.task_ref} ${t.title}`, hint: t.repo,
      run: () => navigate(
        { scope: { kind: "repo", id: t.repo }, view: "changes" },
        { indirect: true, taskFilter: taskIdentity(t.repo, t.task_ref) },
      ),
    })),
    { id: paletteEntryId("action", "pick-queue"), section: "Actions", label: "Jump to pick queue",
      run: () => navigate({ view: "changes" }, { indirect: true, pendingScroll: "sec-pick" }) },
    { id: paletteEntryId("action", "toggle-grouping"), section: "Actions", label: "Toggle by task / by folder",
      run: () => navigate(
        { view: "changes" },
        { indirect: true, groupMode: groupMode === "task" ? "folder" : "task" },
      ) },
    { id: paletteEntryId("action", "toggle-os-alerts"), section: "Actions", label: `OS alerts: turn ${notifyOn ? "off" : "on"}`,
      disabledReason: notifyBusy ? "OS alert permission change is in progress." : undefined,
      run: () => {
        suppressDisclosureFocusRestore();
        setMoreOpen(false); setShowLegend(false); setPanelOpen(true);
        void toggleNotify();
      } },
    // v0.2.8.0 A.2 (R-BH): the sound twin — the same panel-open +
    // toggle shape (the visible-effect rule).
    { id: paletteEntryId("action", "toggle-sounds"), section: "Actions", label: `Sounds: turn ${soundOn ? "off" : "on"}`,
      disabledReason: soundBusy ? "Sound preference change is in progress." : undefined,
      run: () => {
        suppressDisclosureFocusRestore();
        setMoreOpen(false); setShowLegend(false); setPanelOpen(true);
        void toggleSound();
      } },
    // v0.2.9.0 A.2 (R-BL): one draft action per DIRTY repo (the
    // sessionFilter dynamic-entry precedent).
    ...repos.filter((r) => !r.offline && r.count > 0).map((r) => ({
      id: paletteEntryId("action", "copy-draft", r.id),
      section: "Actions", label: `Copy commit draft — ${r.id}`,
      disabledReason: draftBusyRepos.has(r.id) ? `Commit draft for ${r.id} is being copied.` : undefined,
      run: () => void doDraft(r.id),
    } as PaletteEntry)),
    // v0.2.9.0 D5 (C.1, R-BM): the attract opt-out (the visible-effect
    // rule — the label reflects the flip).
    { id: paletteEntryId("action", "toggle-attract"), section: "Actions", label: `Attract mode: turn ${attractOn ? "off" : "on"}`,
      run: () => toggleAttract() },
    ...(sessionFilter ? [{
      id: paletteEntryId("dialog", "timeline",
        sessionIdentityKey(sessionFilter.provider, sessionFilter.sessionId)),
      section: "Actions", label: `View ${sessionFilter.provider} session timeline`, opensDialog: true,
      run: () => openDialog({ kind: "timeline", session: sessionFilter }),
    } as PaletteEntry] : []),
    { id: paletteEntryId("dialog", "wrapped"), section: "Actions", label: "View weekly wrapped",
      disabledReason: scopeUnavailableReason ?? (stats ? undefined : "Weekly stats are still loading."),
      opensDialog: true,
      run: () => { if (stats) openDialog({ kind: "wrapped", stats, tasks: [...tasks] }); } },
    { id: paletteEntryId("action", "open-chronicle-tab"), section: "Actions", label: "Open Chronicle in a new tab ↗",
      run: openChronicleTab },
    { id: paletteEntryId("action", "open-legend"), section: "Actions", label: "Open Legend", run: () => {
      suppressDisclosureFocusRestore();
      legendReturnToMoreRef.current = false;
      setPanelOpen(false); setMoreOpen(false); setShowLegend(true);
    } },
    { id: paletteEntryId("action", "export-digest"), section: "Actions", label: digestActionLabel,
      disabledReason: scopeUnavailableReason ?? (digestBusy ? "Digest action is already in progress." : undefined),
      run: doDigest },
    // v0.2.0.1 D1 (B.1): the report exports — Actions, beside the digest
    // (RV1); no-op while stats is null (the entries stay listed).
    { id: paletteEntryId("action", "export-report", "7"), section: "Actions", label: "Export report — 7 days", hint: "current scope",
      disabledReason: scopeUnavailableReason ?? (reportBusy
        ? "A report download is already starting."
        : stats ? undefined : "Report data is still loading."),
      run: () => { if (stats) doReport(stats, 7); } },
    { id: paletteEntryId("action", "export-report", "30"), section: "Actions", label: "Export report — 30 days", hint: "current scope",
      disabledReason: scopeUnavailableReason ?? (reportBusy
        ? "A report download is already starting."
        : stats ? undefined : "Report data is still loading."),
      run: () => { if (stats) doReport(stats, 30); } },
    { id: paletteEntryId("action", "clear-filters"), section: "Actions", label: "Clear task + session filters",
      run: () => { setTaskFilter(null); setSessionFilter(null); } },
  ];

  useDisclosureBehavior({
    open: moreOpen,
    onClose: () => setMoreOpen(false),
    rootRef: moreRootRef,
    triggerRef: moreTriggerRef,
  });

  const toggleMore = (): void => {
    if (!moreOpen && (panelOpen || showLegend)) {
      suppressDisclosureFocusRestore();
      setPanelOpen(false);
      setShowLegend(false);
    }
    setMoreOpen((open) => !open);
  };
  const toggleAttention = (): void => {
    if (!panelOpen && (moreOpen || showLegend)) {
      suppressDisclosureFocusRestore();
      setMoreOpen(false);
      setShowLegend(false);
    }
    setPanelOpen((open) => !open);
  };
  const openLegendFromMore = (): void => {
    legendReturnToMoreRef.current = true;
    suppressDisclosureFocusRestore();
    setMoreOpen(false);
    setShowLegend(true);
  };
  const closeLegend = (): void => {
    legendReturnToMoreRef.current = false;
    setShowLegend(false);
  };
  const openDialogFromMore = (dialog: ActiveDialog): void => {
    moreTriggerRef.current?.focus({ preventScroll: true });
    suppressDisclosureFocusRestore();
    setMoreOpen(false);
    openDialog(dialog);
  };
  const openTaskDrawer = (): void => {
    if (panelOpen || moreOpen || showLegend) suppressDisclosureFocusRestore();
    setPanelOpen(false);
    setMoreOpen(false);
    setShowLegend(false);
    setTaskDrawerOpen(true);
  };

  return (
    <BoundedPageMemoryProvider pages={pagePositions} onPageChange={rememberPage}>
    <div className="flex h-screen h-[100dvh] min-h-0 min-w-0 flex-col overflow-hidden">
      <a
        href="#main-content"
        className="fixed left-2 top-2 z-layer-dialog inline-flex min-h-11 items-center -translate-y-24 rounded-control bg-ui-primary px-3 py-2 text-sm font-semibold text-white focus:translate-y-0"
      >
        Skip to main content
      </a>
      <header className="ui-safe-header shrink-0 border-b border-ui-border bg-ui-surface px-4 pb-2">
        <div className="flex min-w-0 items-center gap-2 py-1.5">
          <h1 className="min-w-0 flex-1 truncate text-base font-semibold text-sky-300 sm:text-lg">
            KATLAB Tracking Monitor
          </h1>
          <div className="flex shrink-0 items-center gap-1.5">
            <ControlButton onClick={openTaskDrawer} className="lg:hidden">
              <TasksIcon />
              <span>Tasks</span>
            </ControlButton>
            <div className="hidden items-center gap-1.5 lg:flex">
              <Pet mood={petMood} wardrobe={wardrobe} />
              <HealthButton onClick={() => openDialog({ kind: "health" })} />
              <button
                ref={legendTriggerRef}
                type="button"
                aria-expanded={showLegend}
                aria-controls="app-legend"
                onClick={() => {
                  legendReturnToMoreRef.current = false;
                  if (!showLegend && (panelOpen || moreOpen)) suppressDisclosureFocusRestore();
                  setPanelOpen(false);
                  setMoreOpen(false);
                  setShowLegend((open) => !open);
                }}
                className="ui-control bg-ui-raised text-ui-text"
              >
                Legend
              </button>
              <ControlButton
                disabled={!!scopeUnavailableReason || digestBusy}
                aria-busy={digestBusy}
                onClick={doDigest}
                title="Export today's changes as one self-contained HTML file"
              >
                {digestState.kind === "ready" ? "Download digest ↓" : digestState.kind === "preparing" ? "Preparing…" : "Digest ↓"}
              </ControlButton>
            </div>
            <AttentionBell entryKey={entryIdRef.current}
              repos={repos} events={events} tasks={tasks}
              violationOf={violationOf} open={panelOpen} onToggle={toggleAttention}
              onClose={() => setPanelOpen(false)} onNavigate={navigateToRepo}
              footer={(
                <div className="mt-2 hidden flex-wrap items-center gap-2 border-t border-ui-border pt-2 lg:flex">
                  <span className="text-ui-muted">OS alerts:</span>
                  <ControlButton disabled={notifyBusy} aria-busy={notifyBusy}
                    onClick={toggleNotify}>
                    {notifyBusy ? "changing…" : notifyOn ? "on" : "off"}
                  </ControlButton>
                  <span className="text-ui-muted">Sounds:</span>
                  <ControlButton disabled={soundBusy} aria-busy={soundBusy}
                    onClick={toggleSound}>
                    {soundBusy ? "changing…" : soundOn ? "on" : "off"}
                  </ControlButton>
                  {notifyNote && <span className="text-amber-300">{notifyNote}</span>}
                  {soundNote && <span className="text-amber-300">{soundNote}</span>}
                </div>
              )} />
            <div ref={moreRootRef} className="relative lg:hidden">
              <ControlButton
                ref={moreTriggerRef}
                aria-expanded={moreOpen}
                aria-controls="header-more-panel"
                onClick={toggleMore}
              >
                <MoreIcon />
                <span>More</span>
              </ControlButton>
              {moreOpen && (
                <div
                  id="header-more-panel"
                  className="ui-disclosure-enter absolute right-0 top-full z-layer-popover mt-1 max-h-[calc(100dvh-5rem)] w-[min(20rem,calc(100vw-2rem))] overflow-y-auto rounded-panel border border-ui-border bg-ui-surface p-2 shadow-xl"
                >
                  <div className="grid gap-1">
                    <ControlButton onClick={openLegendFromMore}>Legend</ControlButton>
                    <ControlButton onClick={() => openDialogFromMore({ kind: "health" })}>
                      System health
                    </ControlButton>
                    <ControlButton disabled={!!scopeUnavailableReason || digestBusy}
                      aria-busy={digestBusy} onClick={doDigest}>
                      {digestActionLabel}
                    </ControlButton>
                    <ControlButton disabled={!stats || !!scopeUnavailableReason || reportBusy}
                      aria-busy={reportBusy}
                      onClick={() => { if (stats) doReport(stats, 7); }}>
                      {reportBusy ? "Starting report…" : "Export report — 7 days"}
                    </ControlButton>
                    <ControlButton disabled={!stats || !!scopeUnavailableReason || reportBusy}
                      aria-busy={reportBusy}
                      onClick={() => { if (stats) doReport(stats, 30); }}>
                      {reportBusy ? "Starting report…" : "Export report — 30 days"}
                    </ControlButton>
                    <ControlButton disabled={!!scopeUnavailableReason}
                      onClick={() => openDialogFromMore({ kind: "focus", scope: scopeApiId(scope) })}>
                      Enter focus mode
                    </ControlButton>
                    <ControlButton disabled={!stats || !!scopeUnavailableReason}
                      onClick={() => { if (stats) openDialogFromMore({ kind: "wrapped", stats, tasks: [...tasks] }); }}>
                      View weekly wrapped
                    </ControlButton>
                    <a className="ui-control bg-ui-raised text-ui-text hover:bg-ui-border"
                      href="/chronicle/" target="_blank" rel="noopener"
                      onClick={() => announceStatus("Chronicle new-tab open requested.")}>
                      Open Chronicle in new tab ↗
                    </a>
                    <ControlButton onClick={toggleAttract}>
                      Attract mode: turn {attractOn ? "off" : "on"}
                    </ControlButton>
                    <ControlButton disabled={soundBusy} aria-busy={soundBusy} onClick={toggleSound}>
                      {soundBusy ? "Changing sounds…" : `Sounds: turn ${soundOn ? "off" : "on"}`}
                    </ControlButton>
                    <ControlButton disabled={notifyBusy} aria-busy={notifyBusy} onClick={toggleNotify}>
                      {notifyBusy ? "Changing OS alerts…" : `OS alerts: turn ${notifyOn ? "off" : "on"}`}
                    </ControlButton>
                  </div>
                  {(digestNote || notifyNote || soundNote) && (
                    <p className="mt-2 break-words text-xs text-amber-300">
                      {digestNote || notifyNote || soundNote}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <RepoScopeRail repos={repos} scope={scope} membershipReady={membershipReady}
          onSelect={(nextScope) => navigate({ scope: nextScope })} />
        <ViewNavigation view={view} membershipReady={membershipReady}
          onSelect={(nextView) => navigate({ view: nextView })} />
        <div className="ui-horizontal-rail mt-2 flex min-w-0 items-center gap-2 overflow-x-auto pb-1"
          role="region" aria-label="Live workspace indicators" tabIndex={0}>
          <div className="shrink-0 sm:hidden">
            <ComboMeter count={comboCount} lastMs={comboLastMsRef.current} burst={comboBurst} />
          </div>
          <div className="shrink-0 sm:hidden">
            <FlowChip count={comboCount} startMs={comboStartMsRef.current}
              lastMs={comboLastMsRef.current} />
          </div>
          <StatusBar repos={visibleRepos} scopeKeyValue={currentScopeKey}
            violationOf={violationOf} burst={burst}
            onDraft={doDraft} draftNote={draftNote} draftBusyRepos={draftBusyRepos} />
          <div className="hidden shrink-0 items-center gap-2 sm:flex">
            <ComboMeter count={comboCount} lastMs={comboLastMsRef.current} burst={comboBurst} />
            <FlowChip count={comboCount} startMs={comboStartMsRef.current}
              lastMs={comboLastMsRef.current} />
          </div>
        </div>
        {digestNote && <p className="hidden text-xs text-amber-300 lg:block">{digestNote}</p>}
      </header>

      {dreaming && ( /* v0.2.9.0 D5 (C.1, RV4b/RV6): the daydream's
          CLICK-CATCHER — transparent, owns ALL pointer input; the exit
          fires on CLICK (the full gesture completes here — never
          pointerdown, the unmount click-through law); keys wake via
          the window listener; sits above the release banner's z-40 until
          synchronous wake restores normal banner interactivity. */
        <div
          role="region"
          aria-label="Attract mode"
          className="fixed inset-0 z-layer-attract flex cursor-pointer items-end justify-center bg-slate-950/10 p-4"
          onClick={wakeFromDream}
          onFocusCapture={wakeFromDream}
        >
          <button
            type="button"
            className="ui-control mb-[max(0.5rem,env(safe-area-inset-bottom))] bg-slate-900/90 text-white shadow-xl"
          >
            Exit attract mode
          </button>
          <span className="sr-only">Press any key or click to return to your previous view.</span>
        </div>
      )}

      {releases.length > 0 && ( /* v0.2.7.0 D8 (C.1, R-BG): the release
          moment — a TOP-LEVEL slot outside the view switch (RV6: shows
          on EVERY view; the guard-banner precedent is deliberately NOT
          followed — its view gate is right there, wrong here). z-40
          above the CLEAN toasts (RV2: same-repo stacking is layered by
          design). RV10 stack: newest on top, cap 3, own 12s dismiss. */
        <div className="relative z-layer-release">
          {releases.map((r) => ( /* CFT-1: NO overflow-hidden — the hero
              burst travels ±96px from a ~36px band; clipping it kills
              the moment. The particles are pointer-events-none and end
              at opacity 0 (the chip-burst precedent: they fly free).
              CFT-2: this comment is a JS comment INSIDE the arrow's
              parens — the {slash-star} child form at the return
              position is TWO expressions (a syntax error). */
            <div key={JSON.stringify([r.repo, r.n])}
              className="relative flex flex-wrap items-center gap-3 border-b border-teal-600/60 bg-gradient-to-r from-teal-950 via-slate-900 to-slate-900 px-4 py-2 text-sm">
              <span className="text-lg" aria-hidden="true">🚀</span>
              <span className="font-bold text-teal-200">{r.repo}</span>
              <span className="text-slate-200">
                released <b className="text-amber-300">{r.version}</b>
              </span>
              <a href={`/chronicle/changelog/${encodeURIComponent(r.repo)}.html`}
                target="_blank" rel="noopener"
                onClick={() => announceStatus(`${r.repo} changelog new-tab open requested.`)}
                className="ui-control bg-slate-800 text-slate-200 hover:bg-slate-700">
                open changelog ↗
              </a>
              {/* honest: the STORY page lands on the Scribe's next daily
                  tick — never a dead link to it (the changelog is live) */}
              <span className="text-xs text-slate-500">
                the Scribe drafts the release notes on its next daily tick
              </span>
              <button type="button"
                onClick={() => setReleases((prev) => prev.filter((x) => x.n !== r.n))}
                aria-label={`dismiss ${r.repo} release banner`}
                className="ml-auto text-slate-400 hover:text-white">✕</button>
              {r.animate && !reducedMotion && ( /* the hero burst — 24p, the
                  house recipe at banner scale (records precedent gate) */
                <span aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2">
                  {Array.from({ length: 24 }, (_, i) => {
                    const angle = (i / 24) * 2 * Math.PI;
                    const dist = i % 2 === 0 ? 60 : 96;
                    const colors = ["#14b8a6", "#10b981", "#f59e0b"];
                    return (
                      <span key={i} className="burst-p"
                        style={{
                          backgroundColor: colors[i % 3],
                          "--dx": `${Math.round(Math.cos(angle) * dist)}px`,
                          "--dy": `${Math.round(Math.sin(angle) * dist)}px`,
                        } as CSSProperties} />
                    );
                  })}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {showLegend && (
        <Legend
          onClose={closeLegend}
          triggerRef={legendTriggerRef}
          returnFocusRef={legendReturnToMoreRef.current ? moreTriggerRef : undefined}
          focusOnOpen={legendReturnToMoreRef.current}
        />
      )}

      <CommandPalette entries={paletteEntries} onStatus={announceStatus} />
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {actionStatus}
      </div>

      {activeDialog?.kind === "timeline" && (
        <SessionTimeline session={activeDialog.session} onClose={closeDialog}
          onStatus={announceStatus} />
      )}

      {activeDialog?.kind === "focus" && (
        <FocusMode scope={activeDialog.scope} repos={repos}
          events={events} stats={stats} mood={petMood} wardrobe={wardrobe}
          onClose={closeDialog} />
      )}

      {activeDialog?.kind === "file-story" && (
        <FileStory repo={activeDialog.repo} file={activeDialog.file}
          repoPath={repos.find((r) => r.id === activeDialog.repo)?.path ?? null}
          repoBranch={repos.find((r) => r.id === activeDialog.repo)?.branch ?? null}
          onClose={closeDialog} onStatus={announceStatus} />
      )}

      {activeDialog?.kind === "health" && (
        <HealthModal onClose={closeDialog} onStatus={announceStatus} />
      )}

      {activeDialog?.kind === "wrapped" && (
        <WrappedCard stats={activeDialog.stats} tasks={activeDialog.tasks} onClose={closeDialog} />
      )}

      {taskDrawerOpen && activeDialog === null && (
        <DialogShell
          title="Plan tasks"
          description="Filter the Changes view by task."
          onClose={() => setTaskDrawerOpen(false)}
          closeLabel="Close task drawer"
          backdropClose
          panelClassName="mr-auto h-full max-w-xs rounded-none"
          bodyClassName="min-h-0 flex-1 p-0"
        >
          <TaskSidebar tasks={visibleTasks} events={events} effortByTask={effortByTask}
            scopeKeyValue={currentScopeKey}
            taskFilter={taskFilter} mode={sidebarMode} onModeChange={setSidebarMode}
            embedded onTaskClick={(key) => navigate(
              { view: "changes" },
              { indirect: true, taskFilter: taskFilter === key ? null : key },
            )} />
        </DialogShell>
      )}

      {(toasts.length > 0 || odoNote !== null) && ( /* v0.1.7.0 D6 (C.3):
          persistent celebration toasts — z-30, BELOW every overlay (RV3: a
          record waits under a dim, never pierces it); one per repo, newest
          replaces; dismissed by ✕ or any outside click. NOT an overlay (no
          data-overlay-open). v0.2.10.0 D8: the odometer card shares the
          column (condition widened). */
        <CleanToastStack key={`clean:${entryIdRef.current}`} toasts={toasts} odometer={odoNote}
          onDismiss={(repo) => setToasts((previous) => previous.filter((item) => item.repo !== repo))} />
      )}

      {error && (
        <div className="bg-red-900/60 px-4 py-2 text-sm text-red-200">
          Server unreachable: {error} (auto-reconnecting...)
        </div>
      )}

      <WarningsBanner key={`warnings:${entryIdRef.current}`} repos={visibleRepos} dismissed={dismissedWarnings}
        onDismiss={(key) => setDismissedWarnings(new Set(dismissedWarnings).add(key))} />

      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <TaskSidebar key={`tasks:${entryIdRef.current}`}
          tasks={visibleTasks} events={events} effortByTask={effortByTask}
          scopeKeyValue={currentScopeKey}
          taskFilter={taskFilter} mode={sidebarMode} onModeChange={setSidebarMode}
          onTaskClick={(key) => {
            navigate(
              { view: "changes" },
              { taskFilter: taskFilter === key ? null : key },
            );
          }} />
        <main ref={mainRef} id="main-content" tabIndex={-1} data-app-scroll
          aria-label={`${scopeLabel(scope)} — ${view}`}
          onScroll={scheduleCurrentEntrySave}
          className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4">
          <div className={view === "chronicle" ? "flex h-full min-h-0 flex-col" : "min-h-full"}
            style={routeFocusRequest?.scrollTop
            ? { minHeight: `calc(${routeFocusRequest.scrollTop}px + 100%)` }
            : undefined}>
          {/* v0.1.5.0 D3 (C.3): guard banner — shows only while the repo is
              STILL violating (task_updated re-sync clears it live). */}
          {view === "changes" && guardEvent && violationOf(guardEvent.repo) !== null && (
            <div className="mb-4 flex flex-wrap items-center gap-2 rounded border border-amber-600 bg-amber-900/40 px-3 py-2 text-sm text-amber-200">
              <span className="font-bold">⚠ {guardEvent.repo}:</span>
              <span>
                {violationOf(guardEvent.repo)} task{violationOf(guardEvent.repo) === 1 ? "" : "s"} in-progress
                — this change landed in the pick queue. Fix plan statuses
                (Docs/Tracking_Discipline.md).
              </span>
              <button type="button" aria-label="Dismiss task-discipline warning"
                className="ml-auto text-amber-400 hover:text-white"
                onClick={() => setGuardEvent(null)}>✕</button>
            </div>
          )}
          {!membershipReady && view !== "city" && view !== "chronicle" && (
            <section className="min-h-64 rounded-panel border border-ui-border bg-ui-surface p-6">
              <h2 data-view-heading tabIndex={-1} className="font-semibold text-ui-text">
                Validating {scopeLabel(scope)}
              </h2>
              <p className="mt-2 text-sm text-ui-muted">
                Waiting for the latest complete repository snapshot before loading scoped data.
              </p>
            </section>
          )}
          {membershipReady && view === "changes" && (
            <ChangesView key={`changes:${entryIdRef.current}`}
              events={visibleEvents} tasks={visibleTasks} repos={repos}
              scopeKeyValue={currentScopeKey}
              effortByTask={effortByTask}
              taskFilter={taskFilter} onClearFilter={() => setTaskFilter(null)} onPicked={sync}
              onStatus={announceStatus}
              sessionFilter={sessionFilter} onClearSessionFilter={() => setSessionFilter(null)}
              onSessionClick={(identity) => setSessionFilter((current) =>
                sameSessionIdentity(current, identity) ? null : identity)}
              onOpenTimeline={(identity) => openDialog({ kind: "timeline", session: identity })}
              onOpenFileStory={(repo, file) => openDialog({ kind: "file-story", repo, file })}
              groupMode={groupMode} onGroupModeChange={setGroupMode}
              assignmentState={assignmentUi} onAssignmentStateChange={setAssignmentUi} />
          )}
          {membershipReady && view === "mission" && (
            <LazyViewBoundary key={`mission:${entryIdRef.current}`} name="Mission">
              <Suspense fallback={<LazyViewStatus name="Mission" />}>
                <LazyMissionView scope={scopeApiId(scope)} invalidationNonce={missionNonce}
                  entryState={missionUi} onEntryStateChange={setMissionUi}
                  onStatus={announceStatus} />
              </Suspense>
            </LazyViewBoundary>
          )}
          {membershipReady && view === "overview" && (
            <LazyViewBoundary key={`overview:${entryIdRef.current}`} name="Overview">
              <Suspense fallback={<LazyViewStatus name="Overview" />}>
                <LazyOverviewView scope={scopeApiId(scope)} tasks={visibleTasks}
                  uncommitted={visibleEvents} repos={visibleRepos.filter((r) => !r.offline)}
                  stats={stats} statsError={statsError}
                  entryState={overviewUi} onEntryStateChange={setOverviewUi}
                  onStatus={announceStatus}
                  reportBusy={reportBusy}
                  initialDayScopeAction={dayLaneForegroundEntryRef.current === entryIdRef.current}
                  onInitialDayScopeActionConsumed={consumeInitialDayScopeAction}
                  onExportReport={(range: 7 | 30) => { if (stats) doReport(stats, range); }}
                  onOpenFileStory={(repo: string, file: string) => openDialog({ kind: "file-story", repo, file })}
                  onOpenWrapped={() => {
                    if (stats) openDialog({ kind: "wrapped", stats, tasks: [...tasks] });
                  }} />
              </Suspense>
            </LazyViewBoundary>
          )}
          {membershipReady && view === "history" && (
            <HistoryView key={`history:${entryIdRef.current}`} repos={visibleRepos.filter((r) => !r.offline)}
              scopeKeyValue={currentScopeKey} state={historyUi} onStateChange={setHistoryUi}
              onStatus={announceStatus} />
          )}
          {view === "city" && ( /* v0.2.0.0 D3 (B.3): workspace-wide by
              design — full repos/tasks/events, never tab-filtered; the
              scoped stats prop serves ONLY as the freshness nonce */
            <LazyViewBoundary key={`city:${entryIdRef.current}`} name="City">
              <Suspense fallback={<LazyViewStatus name="City" />}>
                <LazyCityView repos={repos} tasks={tasks} events={events}
                  workspaceReady={workspaceReady}
                  mood={petMood} wardrobe={wardrobe} refreshIdentity={cityRefreshIdentity}
                  onStatus={announceStatus}
                  onOpenFileStory={(repo: string, file: string) => openDialog({ kind: "file-story", repo, file })}
                  onGoRepo={(repoId: string) => navigate(
                    { scope: { kind: "repo", id: repoId }, view: "overview" },
                    { indirect: true },
                  )} />
              </Suspense>
            </LazyViewBoundary>
          )}
          {view === "chronicle" && ( /* v0.2.6.0 C.1 (R-BB): the living
              docs site INSIDE the app — same-origin iframe of the
              tracker's own /chronicle/ mount (R-BA) */
            <ChronicleView key={`chronicle:${entryIdRef.current}`} />
          )}
          </div>
        </main>
      </div>
    </div>
    </BoundedPageMemoryProvider>
  );
}

function RepoScopeRail ({
  repos,
  scope,
  membershipReady,
  onSelect,
}: {
  repos: Repo[];
  scope: Scope;
  membershipReady: boolean;
  onSelect: (scope: Scope) => void;
}): JSX.Element {
  const choices: Scope[] = [
    { kind: "all" },
    ...repos.map((repo) => ({ kind: "repo", id: repo.id } as Scope)),
  ];
  if (scope.kind === "repo" && !repos.some((repo) => repo.id === scope.id)) {
    choices.push(scope);
  }
  const ids = choices.map(scopeKey);
  const activeIndex = ids.indexOf(scopeKey(scope));
  const pager = useRememberedBoundedPage("repo-scopes", {
    identity: ["repo-scopes"],
    totalItems: choices.length,
    pageSize: 50,
    defaultPage: Math.floor(Math.max(0, activeIndex) / 50) + 1,
  });
  useEffect(() => {
    if (activeIndex < pager.start || activeIndex >= pager.end) {
      pager.setPage(Math.floor(Math.max(0, activeIndex) / 50) + 1);
    }
  }, [activeIndex, pager.end, pager.setPage, pager.start]);
  const visible = choices.slice(pager.start, pager.end);
  return (
    <div className="mt-1 min-w-0">
      <div className="mb-1 flex items-center gap-2 text-xs text-ui-muted">
        <span className="font-semibold">Repository scope</span>
        <span className="min-w-0 truncate text-ui-text">{scopeLabel(scope)}</span>
        {!membershipReady && <span className="text-amber-300">validating…</span>}
      </div>
      <div className="ui-horizontal-rail overflow-x-auto pb-1" role="region"
        aria-label="Repository scope options" tabIndex={0}>
        <div role="group" aria-label="Repository scope" className="flex w-max gap-1">
          {visible.map((choice) => {
            const active = scopeEquals(choice, scope);
            return (
              <button
                key={scopeKey(choice)}
                type="button"
                aria-label={scopeAccessibleName(choice)}
                aria-pressed={active}
                onClick={() => onSelect(choice)}
                className={`ui-control shrink-0 ${active
                  ? "bg-ui-primary text-white"
                  : "bg-ui-raised text-ui-text"}`}
              >
                {scopeLabel(choice)}
              </button>
            );
          })}
        </div>
      </div>
      {choices.length > 50 && (
        <CollectionPager
          collectionLabel="Repository scopes"
          page={pager}
          onPageChange={pager.setPage}
          className="mt-1"
        />
      )}
    </div>
  );
}

const VIEW_LABELS: Record<View, string> = {
  changes: "Changes",
  mission: "Mission",
  overview: "Overview",
  history: "History",
  city: "City",
  chronicle: "Chronicle",
};

function ViewNavigation ({
  view,
  membershipReady,
  onSelect,
}: {
  view: View;
  membershipReady: boolean;
  onSelect: (view: View) => void;
}): JSX.Element {
  return (
    <nav aria-label="Primary views" className="ui-horizontal-rail mt-1 overflow-x-auto pb-1">
      <div className="flex w-max gap-1">
        {(Object.keys(VIEW_LABELS) as View[]).map((choice) => {
          const scoped = choice === "mission" || choice === "overview" || choice === "history";
          return (
            <button
              key={choice}
              type="button"
              aria-current={view === choice ? "page" : undefined}
              disabled={scoped && !membershipReady}
              onClick={() => onSelect(choice)}
              className={`ui-control shrink-0 ${view === choice
                ? "bg-ui-primary text-white"
                : "bg-ui-raised text-ui-text"}`}
            >
              {VIEW_LABELS[choice]}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

// Status bar: CLEAN / N uncommitted / OFFLINE (F46) + capture heartbeat (D9)
// + v0.1.5.0 D3 discipline micro-chip (absent when exactly 1 in-progress).
function StatusBar ({ repos, scopeKeyValue, violationOf, burst, onDraft, draftNote,
  draftBusyRepos }:
  { repos: Repo[]; violationOf: (repoId: string) => number | null;
    scopeKeyValue: string;
    // v0.1.7.0 D6 (C.3): burst nonce — the matching repo's CLEAN chip
    // renders the particle burst; naturally skipped when the chip is not
    // rendered (other tab / repo currently dirty).
    burst: { repo: string; n: number } | null;
    // v0.2.9.0 A.2 (R-BL): the commit-draft chip (dirty repos only) +
    // its repo-keyed inline note (the digestNote recipe).
    onDraft: (repoId: string) => void;
    draftNote: { repo: string; ok: boolean; n: number } | null;
    draftBusyRepos: ReadonlySet<string> }) {
  const pager = useRememberedBoundedPage("status-bar", {
    identity: ["status-bar", scopeKeyValue],
    totalItems: repos.length,
    pageSize: 50,
  });
  const visibleRepos = repos.slice(pager.start, pager.end);
  return (
    <div className="flex min-w-0 shrink-0 items-center gap-2">
      <div className="flex w-max gap-2">
      {visibleRepos.map((r) => {
        const violation = violationOf(r.id);
        return (
          <div key={r.id} className="flex items-center gap-2 rounded bg-slate-800 px-3 py-1 text-sm">
            <span className="font-medium">{r.id}</span>
            {/* v0.1.6.0 D2 (C.2): current-branch chip; absent when null */}
            {r.branch && (
              <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[11px] text-slate-300"
                title="current git branch">
                &#x2387; {r.branch}
              </span>
            )}
            {r.offline ? (
              <span className="rounded bg-zinc-600 px-2 py-0.5 text-xs font-bold">OFFLINE</span>
            ) : r.clean ? (
              <span className="relative rounded bg-emerald-600 px-2 py-0.5 text-xs font-bold">
                CLEAN ✓
                {burst?.repo === r.id && !prefersReducedMotion() && (
                  /* ~12 self-removing particles (App clears the nonce after
                     ~900ms); keyed by nonce so a re-transition re-fires. */
                  <span key={burst.n} aria-hidden="true">
                    {Array.from({ length: 12 }, (_, i) => {
                      const angle = (i / 12) * 2 * Math.PI;
                      const radius = i % 2 === 0 ? 30 : 42;
                      const colors = ["#14b8a6", "#10b981", "#f59e0b"];
                      return (
                        <span key={i} className="burst-p"
                          style={{
                            backgroundColor: colors[i % 3],
                            "--dx": `${Math.round(Math.cos(angle) * radius)}px`,
                            "--dy": `${Math.round(Math.sin(angle) * radius)}px`,
                          } as CSSProperties} />
                      );
                    })}
                  </span>
                )}
              </span>
            ) : (
              <span className="rounded bg-amber-500 px-2 py-0.5 text-xs font-bold text-slate-950">
                {r.count} uncommitted change{r.count === 1 ? "" : "s"}
              </span>
            )}
            {!r.offline && !r.clean && ( /* v0.2.9.0 A.2 (R-BL): the
                draft chip — composes the commit message from this
                repo's KNOWN attribution; clipboard only, forever. */
              <button onClick={() => onDraft(r.id)} disabled={draftBusyRepos.has(r.id)}
                aria-busy={draftBusyRepos.has(r.id)}
                title="copy a commit-message draft composed from this repo's uncommitted attribution"
                className="rounded bg-slate-700 px-1.5 py-0.5 text-[11px] text-slate-200 hover:bg-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:opacity-40">
                {draftBusyRepos.has(r.id) ? "copying…" : "draft 📋"}
              </button>
            )}
            {draftNote?.repo === r.id && (
              <span className={`text-[11px] ${draftNote.ok ? "text-emerald-300" : "text-amber-300"}`}>
                {draftNote.ok ? "copied ✓" : "clipboard blocked ✗"}
              </span>
            )}
            {violation !== null && (
              <span title="Discipline: keep exactly ONE task in-progress — new undeclared edits will land in the pick queue (Docs/Tracking_Discipline.md)"
                className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[11px] font-bold text-amber-300">
                ⚠ {violation} active
              </span>
            )}
            {/* v0.1.7.0 D5 (C.2): derived AT RENDER — the P8 60s tick
                expires it; WS-driven repo syncs turn it on promptly. */}
            {r.last_event_ts && Date.now() - new Date(r.last_event_ts).getTime() < 5 * 60_000 && (
              <span title={`capturing now — last event ${fmtRel(r.last_event_ts)}`}
                className="pulse-dot inline-block h-2 w-2 shrink-0 rounded-full bg-teal-400" />
            )}
            <span className="text-[11px] text-slate-400" title={r.last_event_ts ?? "no captures yet"}>
              · {r.last_event_ts ? `last capture ${fmtRel(r.last_event_ts)}` : "no captures yet"}
            </span>
            <Sparkline buckets={r.activity_buckets} />
          </div>
        );
      })}
      {repos.length === 0 && <span className="text-sm text-slate-400">No repos configured.</span>}
      </div>
      {repos.length > 50 && (
        <CollectionPager
          collectionLabel="Repository status"
          page={pager}
          onPageChange={pager.setPage}
          className="shrink-0"
        />
      )}
    </div>
  );
}

// D3: pure-SVG capture sparkline (last 60min, 12x5-min buckets from /api/repos).
function Sparkline ({ buckets }: { buckets: number[] }) {
  const w = 48, h = 14, n = buckets?.length ?? 0;
  if (!n) return null;
  const max = Math.max(1, ...buckets);
  const pts = buckets
    .map((v, i) => `${n === 1 ? 0 : (i / (n - 1)) * w},${h - (v / max) * (h - 2) - 1}`)
    .join(" ");
  const total = buckets.reduce((a, b) => a + b, 0);
  return (
    <span className="relative inline-flex shrink-0 items-center">
      <svg width={w} height={h} className="ml-0.5" aria-hidden="true" focusable="false">
        <polyline points={pts} fill="none" stroke="#14b8a6" strokeWidth="1"
          strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <span className="sr-only">
        {`${total} edits in the last hour; five-minute buckets, oldest to newest: ${buckets.join(", ")}.`}
      </span>
    </span>
  );
}

// F47: dismissible per-repo warnings banner.
function WarningsBanner ({ repos, dismissed, onDismiss }:
  { repos: Repo[]; dismissed: Set<string>; onDismiss: (key: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const items = repos.flatMap((r) =>
    r.warnings.map((w) => ({ key: JSON.stringify([r.id, w.ts, w.message]), repo: r.id, ...w })),
  ).filter((w) => !dismissed.has(w.key)).sort((left, right) =>
    left.ts < right.ts ? -1 : left.ts > right.ts ? 1 : 0);
  const disclosureOpen = expanded && items.length > 5;
  useDisclosureBehavior({
    open: disclosureOpen,
    onClose: () => setExpanded(false),
    rootRef,
    triggerRef,
  });
  const pager = useBoundedPage({
    identity: ["warnings"],
    totalItems: items.length,
    pageSize: 50,
  });
  useEffect(() => {
    if (expanded && items.length <= 5) setExpanded(false);
  }, [expanded, items.length]);
  if (items.length === 0) return null;
  const visibleItems = disclosureOpen
    ? items.slice(pager.start, pager.end)
    : items.slice(-5);
  return (
    <div ref={rootRef} className="bg-amber-900/50 px-4 py-1">
      <div className="flex items-center gap-2 py-0.5">
        <span className="text-xs font-semibold text-amber-200">Warnings</span>
        {items.length > 5 && (
          <button ref={triggerRef} type="button" aria-expanded={disclosureOpen}
            aria-controls="warnings-list" onClick={() => setExpanded((open) => !open)}
            className="rounded px-2 py-0.5 text-xs text-amber-300 hover:bg-amber-800/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">
            {disclosureOpen ? "Show newest 5" : `+${items.length - 5} more`}
          </button>
        )}
      </div>
      <div id="warnings-list">
      {visibleItems.map((w) => (
        <div key={w.key} className="flex items-center gap-2 py-0.5 text-xs text-amber-200">
          <span className="font-bold">[{w.repo}]</span>
          <span className="flex-1">{w.message}</span>
          <button type="button" aria-label={`Dismiss warning from ${w.repo}`}
            className="text-amber-400 hover:text-white"
            onClick={() => onDismiss(w.key)}>✕</button>
        </div>
      ))}
      </div>
      {disclosureOpen && items.length > 50 && (
        <CollectionPager collectionLabel="Warnings" page={pager} onPageChange={pager.setPage} />
      )}
    </div>
  );
}

function CleanToastStack ({ toasts, odometer, onDismiss }: {
  toasts: { repo: string; n: number; animate: boolean }[];
  odometer: { id: number; n: number; animate: boolean } | null;
  onDismiss: (repo: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const disclosureOpen = expanded && toasts.length > 4;
  useDisclosureBehavior({
    open: disclosureOpen,
    onClose: () => setExpanded(false),
    rootRef,
    triggerRef,
  });
  const pager = useBoundedPage({
    identity: ["clean-records"],
    totalItems: toasts.length,
    pageSize: 50,
  });
  useEffect(() => {
    if (expanded && toasts.length <= 4) setExpanded(false);
  }, [expanded, toasts.length]);
  const visibleToasts = disclosureOpen
    ? toasts.slice(pager.start, pager.end)
    : toasts.slice(-4);
  return (
    <div ref={rootRef} data-toast-stack
      className="ui-safe-toast fixed bottom-4 right-4 z-layer-popover flex max-h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] flex-col items-end gap-2 overflow-y-auto">
      {odometer && (
        <div className={`${odometer.animate ? "toast-enter " : ""}flex items-center gap-3 rounded border border-amber-600/60 bg-slate-900 px-4 py-2 text-sm shadow-xl`}>
          <span>🎉 capture #{odometer.id.toLocaleString("en-US")} — the odometer rolls</span>
        </div>
      )}
      {toasts.length > 4 && (
        <button ref={triggerRef} type="button" aria-expanded={disclosureOpen}
          aria-controls="clean-record-list" onClick={() => setExpanded((open) => !open)}
          className="ui-control bg-slate-900 text-emerald-200 shadow-xl">
          {disclosureOpen ? "Show newest 4" : `+${toasts.length - 4} CLEAN records`}
        </button>
      )}
      <div id="clean-record-list" className="flex flex-col items-end gap-2">
        {visibleToasts.map((toast) => (
          <div key={JSON.stringify([toast.repo, toast.n])}
            className={`${toast.animate ? "toast-enter " : ""}flex items-center gap-3 rounded border border-emerald-600/60 bg-slate-900 px-4 py-2 text-sm shadow-xl`}>
            <span>🎉 <span className="font-semibold">{toast.repo}</span> is CLEAN ✓</span>
            <button type="button" className="text-slate-400 hover:text-white"
              aria-label={`Dismiss ${toast.repo} celebration`} onClick={() => onDismiss(toast.repo)}>
              ✕
            </button>
          </div>
        ))}
      </div>
      {disclosureOpen && toasts.length > 50 && (
        <CollectionPager collectionLabel="CLEAN records" page={pager}
          onPageChange={pager.setPage} />
      )}
    </div>
  );
}

// D1 + D5 (v0.1.2.0): human labels + technical name in the tooltip (P13).
// v0.1.5.0 C.1 (RV19): MODE_BADGE lifted to theme.ts — single label source
// for App AND digest.ts. R26: color stays INLINE hex from MODE_COLOR.
const SWEPT_TIP = "swept — attached to HEAD when the repo went CLEAN (file not in that commit's list)";
const swatch = "rounded px-1.5 py-0.5 text-[11px] font-bold text-white";

// v0.1.6.0 D4 (C.4): nudge thresholds — frontend constants this release.
// v0.1.13.0 B.2: UNCOMMITTED_AGE_H lifted to theme.ts (one source for
// the bell nudge AND the pet) — imported above, behavior unchanged.
const IDLE_TASK_H = 24;
const olderThanH = (iso: string, hours: number) =>
  Date.now() - new Date(iso).getTime() > hours * 3_600_000;

// v0.1.5.0 D4 (C.4): attention bell + cross-repo triage dropdown. Rows are
// PER-REPO and unscoped — Σ(rows) equals the ALL-tab KPI/queue N (RV26).
// Badge counts ACTIONABLE items only; "N uncommitted" is informational.
// The footer slot hosts the D5 "OS alerts" toggle (D.1).
function AttentionBell ({ entryKey, repos, events, tasks, violationOf, open, onToggle, onClose, onNavigate, footer }: {
  entryKey: string;
  repos: Repo[]; events: TrackedEvent[]; tasks: Task[]; // tasks: v0.1.6.0 D4 (RV14)
  violationOf: (repoId: string) => number | null;
  open: boolean; onToggle: () => void; onClose: () => void;
  onNavigate: (repoId: string, scrollToPicks: boolean) => void;
  footer: ReactNode;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  useDisclosureBehavior({ open, onClose, rootRef: wrapRef, triggerRef });

  const rows = repos.map((r, ordinal) => {
    const picks = events.filter((e) =>
      e.repo_id === r.id && (e.mode === "AMBIGUOUS" || e.mode === "UNKNOWN")).length;
    const violation = violationOf(r.id);
    const actionable: string[] = [];
    if (picks > 0) actionable.push(`${picks} pick${picks === 1 ? "" : "s"} pending`);
    if (violation !== null) actionable.push(`discipline: ${violation} in-progress`);
    if (r.offline) actionable.push("OFFLINE");
    if (!r.offline && !r.last_event_ts && !r.clean) actionable.push("no capture yet");
    // v0.1.6.0 D4 (C.4): rhythm nudges — both ACTIONABLE (badge-counted).
    // Null fields never nag; ages via fmtAge (fmtRel cannot say 2d — RV16).
    for (const t of tasks) {
      if (t.repo === r.id && t.status === "in-progress" && t.last_event_ts &&
          olderThanH(t.last_event_ts, IDLE_TASK_H)) {
        actionable.push(`${t.task_id} in-progress idle ${fmtAge(t.last_event_ts)}`);
      }
    }
    if (r.oldest_uncommitted_ts && olderThanH(r.oldest_uncommitted_ts, UNCOMMITTED_AGE_H)) {
      actionable.push(`uncommitted for ${fmtAge(r.oldest_uncommitted_ts)}`);
    }
    return { repo: r.id, picks, actionable, uncommitted: r.count, branch: r.branch, ordinal };
  });
  const badge = rows.reduce((n, row) => n + row.actionable.length, 0);
  const attentionRows = rows
    .filter((row) => row.actionable.length > 0 || row.uncommitted > 0)
    .sort((a, b) => b.actionable.length - a.actionable.length || a.ordinal - b.ordinal);
  const pager = useBoundedPage({
    identity: ["attention", entryKey],
    totalItems: attentionRows.length,
    pageSize: 50,
  });
  const visibleRows = attentionRows.slice(pager.start, pager.end);

  return (
    <div ref={wrapRef} className="relative">
      <button ref={triggerRef} onClick={onToggle} title="Needs attention — cross-repo triage"
        type="button" aria-label={`Needs attention${badge > 0 ? `, ${badge} items` : ", all clear"}`}
        aria-expanded={open} aria-controls="attention-panel"
        className={`ui-control relative min-h-[28px] px-3 text-sm ${
          open ? "bg-sky-700 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>
        <BellIcon aria-hidden="true" />
        {badge > 0 && (
          <span className="absolute -right-1 -top-1 rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-slate-950">
            {badge}
          </span>
        )}
      </button>
      {open && (
        <div id="attention-panel" role="region" aria-labelledby="attention-heading"
          className="ui-disclosure-enter absolute right-0 top-full z-layer-popover mt-1 max-h-[calc(100dvh-5rem)] w-[min(20rem,calc(100vw-1rem))] overflow-y-auto rounded-panel border border-ui-border bg-ui-surface p-3 text-xs shadow-xl">
          <div id="attention-heading" className="mb-2 text-sm font-bold text-slate-200">Needs attention</div>
          {badge === 0 && <p className="text-slate-400">All clear ✓</p>}
          {visibleRows.map((row) => (
              <button key={row.repo}
                onClick={() => {
                  suppressDisclosureFocusRestore();
                  onClose();
                  onNavigate(row.repo, row.picks > 0);
                }}
                className="mb-1 w-full rounded bg-slate-800 p-2 text-left hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">
                <div className="font-semibold text-sky-300">{row.repo}</div>
                {row.actionable.length > 0 && (
                  <div className="mt-0.5 text-amber-300">{row.actionable.join(" · ")}</div>
                )}
                <div className="mt-0.5 text-slate-400">
                  {row.uncommitted} uncommitted change{row.uncommitted === 1 ? "" : "s"}
                  {row.branch ? <> {" · ⎇ "}{row.branch}</> : null} {/* v0.1.6.0 D2 */}
                </div>
              </button>
            ))}
          {attentionRows.length > 50 && (
            <CollectionPager collectionLabel="Attention repositories" page={pager}
              onPageChange={pager.setPage} />
          )}
          {footer}
        </div>
      )}
    </div>
  );
}

// v0.1.5.0 D1 (C.1): session identity dot — color from sessionColor, short
// id in the tooltip. NULL session (pre-upgrade rows) -> no dot (honest).
// Clickable ONLY where a handler is passed (Changes task groups — RV4);
// History + pick-queue dots stay informational.
function SessionDot ({ identity, onClick }: {
  identity: EventSessionIdentity | null;
  onClick?: () => void;
}) {
  if (!identity) return null;
  const { provider, sessionId } = identity;
  const style = { backgroundColor: sessionColor(provider, sessionId) };
  if (!onClick) {
    return <span title={`${provider} session ${sessionId.slice(0, 8)}`} style={style}
      className="inline-block h-2 w-2 shrink-0 rounded-full" />;
  }
  return (
    <button type="button"
      aria-label={`Filter by ${provider} session ${sessionId.slice(0, 8)}`}
      title={`${provider} session ${sessionId.slice(0, 8)} — click to filter by this session`}
      onClick={onClick}
      className="flex h-4 w-4 shrink-0 items-center justify-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">
      <span className="h-2 w-2 rounded-full" style={style} />
    </button>
  );
}

function ModeBadge ({ mode, swept }: { mode: TrackedEvent["mode"]; swept?: boolean }) {
  const badge = MODE_BADGE[mode];
  return (
    <span className="flex gap-1">
      <span title={badge.tip} className={swatch} style={{ backgroundColor: MODE_COLOR[mode] }}>
        {badge.label}
      </span>
      {swept && (
        <span title={SWEPT_TIP} className={swatch} style={{ backgroundColor: SWEPT_COLOR }}>
          auto-linked
        </span>
      )}
    </span>
  );
}

// D1: plain-English legend; each entry bridges to the technical mode name (P13).
function Legend ({ onClose, triggerRef, returnFocusRef, focusOnOpen }: {
  onClose: () => void;
  triggerRef: MutableRefObject<HTMLButtonElement | null>;
  returnFocusRef?: MutableRefObject<HTMLButtonElement | null>;
  focusOnOpen: boolean;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  useDisclosureBehavior({
    open: true,
    onClose,
    rootRef,
    triggerRef,
    returnFocusRef,
    initialFocusRef: focusOnOpen ? closeRef : undefined,
  });
  const rows: [string, TrackedEvent["mode"] | "swept", string][] = [
    ["Declared", "B", "The changed file is declared by exactly one task — strongest attribution."],
    ["Active task", "A_SCOPED", "Several tasks declare the file; the single in-progress one wins."],
    ["Active task *", "A_GLOBAL", "No task declares the file; the repo's single in-progress task takes it."],
    ["Pick: multi", "AMBIGUOUS", "Several declarations, no single active task — needs your pick."],
    ["Pick: none", "UNKNOWN", "No declaration and no single active task — needs your pick."],
    ["Your pick", "MANUAL", "Assigned by you; never re-resolved."],
    ["auto-linked", "swept", "Attached to HEAD when the repo turned CLEAN (rename/delete or server-down cases)."],
  ];
  return (
    <div ref={rootRef} id="app-legend" role="region" aria-labelledby="app-legend-heading"
      className="ui-disclosure-enter border-b border-slate-700 bg-slate-900 px-4 py-3 text-xs text-slate-300">
      <div className="mb-2 flex items-center">
        <span id="app-legend-heading" className="text-sm font-bold text-slate-100">Legend — how changes get their WHY</span>
        <button ref={closeRef} type="button" aria-label="Close legend"
          className="ui-control ml-auto px-1.5 text-slate-400 hover:text-white" onClick={onClose}>✕</button>
      </div>
      <div className="grid gap-1.5 md:grid-cols-2">
        {rows.map(([label, tech, text]) => (
          <div key={tech} className="flex items-baseline gap-2">
            <span className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-bold text-white"
              style={{ backgroundColor: tech === "swept" ? SWEPT_COLOR : MODE_COLOR[tech] }}>{label}</span>
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
      <p className="mt-1.5 text-slate-400">
        {/* v0.1.10.0 D3 (C.1): discoverability — the palette is the entry */}
        Focus mode: press <b className="text-slate-300">Ctrl+K</b> →{" "}
        <b className="text-slate-300">Enter focus mode</b> for a full-screen ambient
        wall display (live status, in-flight feed, skyline); <b>Esc</b> or ✕ exits.
      </p>
      <p className="mt-1.5 text-slate-400">
        {/* v0.2.6.0 C.1: the in-app Chronicle + the RV31 focus boundary */}
        Chronicle: the <b className="text-slate-300">Chronicle</b> tab opens the
        living docs site
        in-app (devlog, plans, changelog, AI diary). While the embedded site holds
        keyboard focus, app shortcuts (<b>Ctrl+K</b>) pause — click any header
        element to restore them.
      </p>
      <p className="mt-1.5 text-slate-400">
        {/* v0.2.8.0 A.2 (R-BH): the sound channel line */}
        Sounds (opt-in, off by default — toggle in the bell panel): a soft{" "}
        <b className="text-slate-300">tick</b> per live capture, a warm{" "}
        <b className="text-slate-300">chime</b> on CLEAN ✓, a short{" "}
        <b className="text-slate-300">fanfare</b> on a release — synthesized, quiet,
        and playing even while the tab is hidden (the background-awareness channel).
      </p>
      <p className="mt-1.5 text-slate-400">
        {/* v0.2.9.0 A.2/C.1: the draft chip + the daydream */}
        The <b className="text-slate-300">draft 📋</b> chip on a dirty repo copies a
        commit-message draft composed from its uncommitted attribution (fill in the
        version — the tracker never runs git). After 10 idle minutes the tracker{" "}
        <b className="text-slate-300">daydreams</b> — cycling City / Overview /
        Chronicle until any click or key restores exactly where you were (turn off
        via the palette: "Attract mode").
      </p>
      <p className="mt-1.5 text-slate-400">
        {/* v0.2.10.0 A.3d: the flow chip + odometer moments */}
        The <b className="text-sky-300">🌊 flow</b> chip times your current
        unbroken work chain (captures under {EFFORT_GAP_MAX_MIN} min apart — the
        same law as effort); it appears from the second chained capture and rests
        when the chain breaks. Capture <b className="text-slate-300">milestones</b>{" "}
        (the 5,000th, 10,000th, …) roll by as a brief amber card — with a chime
        when sounds are on.
      </p>
      <p className="mt-1.5 text-slate-400">
        {/* v0.2.11.0 A.5: the provenance ledger */}
        <b className="text-slate-300">Provenance</b> (Overview) is the share of
        committed <b>file changes</b> that carry captured Claude events — composed
        from what the tracker already knows, never estimated. Only commits made{" "}
        <b>since tracking began</b> in that repo count; earlier ones are excluded
        and shown separately, so the backfilled history can never dilute the
        number. It is not a lines-of-code measure, and a file reading 0/N usually
        means Claude never touched it (compiled artifacts, for instance) — though
        it can also mean the capture was linked to a different commit, so the
        number leans conservative rather than flattering.
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

// v0.1.6.0 D1 (C.1): one effort line for sidebar cards + group headers —
// fmtMinutes carries the ≈; sessions part hidden when 0; absent when the
// task is outside the top-10 effort_per_task (no client re-computation).
type EffortMap = Map<string, { minutes: number; sessions: number }>;
function EffortLine ({ effort }: { effort?: { minutes: number; sessions: number } }) {
  if (!effort) return null;
  return (
    <span className="text-[11px] text-slate-400"
      title="estimated from capture timestamps — 15-min gap rule">
      {fmtMinutes(effort.minutes)}
      {effort.sessions > 0 ? ` · ${effort.sessions} session${effort.sessions === 1 ? "" : "s"}` : ""}
    </span>
  );
}

function TaskSidebar ({ tasks, events, effortByTask, scopeKeyValue, taskFilter, mode, onModeChange, embedded = false, onTaskClick }:
  { tasks: Task[]; events: TrackedEvent[]; effortByTask: EffortMap;
    scopeKeyValue: string;
    taskFilter: string | null; mode: SidebarMode; onModeChange: (mode: SidebarMode) => void;
    embedded?: boolean; onTaskClick: (key: string) => void }) {
  const showAll = mode === "all";
  const [doneOpen, setDoneOpen] = useState(false);

  // D2: uncommitted count per repo|task_ref from the already-fetched list (P4 bound).
  const uncommitted = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of events) {
      if (!e.task_ref) continue;
      const key = taskIdentity(e.repo_id, e.task_ref);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [events]);

  // D4: group by repo|plan_file.
  const groups = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) {
      const key = tupleKey(t.repo, t.plan_file);
      map.set(key, [...(map.get(key) ?? []), t]);
    }
    return [...map.entries()];
  }, [tasks]);

  const groupUncommitted = (list: Task[]) =>
    list.reduce((n, t) => n + (uncommitted.get(taskIdentity(t.repo, t.task_ref)) ?? 0), 0);
  const activeGroups = groups.filter(([, list]) =>
    list.some((t) => t.status !== "done") || groupUncommitted(list) > 0);
  const doneGroups = groups.filter(([, list]) =>
    list.every((t) => t.status === "done") && groupUncommitted(list) === 0);
  const taskRows = [
    ...activeGroups.flatMap(([groupKey, list]) => list.map((task, taskIndex) => ({
      section: "active" as const,
      groupKey,
      fullList: list,
      task,
      taskIndex,
    }))),
    ...(showAll && doneOpen
      ? doneGroups.flatMap(([groupKey, list]) => list.map((task, taskIndex) => ({
          section: "done" as const,
          groupKey,
          fullList: list,
          task,
          taskIndex,
        })))
      : []),
  ];
  const pager = useRememberedBoundedPage("task-sidebar", {
    identity: ["task-sidebar", scopeKeyValue, mode, doneOpen],
    totalItems: taskRows.length,
    pageSize: 50,
  });
  const pageRows = taskRows.slice(pager.start, pager.end);
  const pageGroups = pageRows.reduce<Array<{
    key: string;
    section: "active" | "done";
    fullList: Task[];
    list: Task[];
    continued: boolean;
  }>>((result, row) => {
    const key = JSON.stringify([row.section, row.groupKey]);
    const last = result[result.length - 1];
    if (last?.key === key) last.list.push(row.task);
    else result.push({
      key,
      section: row.section,
      fullList: row.fullList,
      list: [row.task],
      continued: row.taskIndex > 0,
    });
    return result;
  }, []);

  return (
    <aside className={embedded
      ? "h-full w-full overflow-y-auto bg-slate-900 p-3"
      : "hidden w-72 shrink-0 overflow-y-auto border-r border-slate-800 bg-slate-900 p-3 lg:block"}>
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400">Plan tasks</h2>
        <div className="ml-auto flex gap-1">
          <FilterChip active={!showAll} label="Active" onClick={() => onModeChange("active")} />
          <FilterChip active={showAll} label="All" onClick={() => onModeChange("all")} />
        </div>
      </div>
      {tasks.length === 0 && (
        <p className="text-xs text-slate-400">No tasks — author a plan in temp/Plan/.</p>
      )}
      {showAll && doneGroups.length > 0 && (
        <div className="mt-3 border-t border-slate-800 pt-2">
          <button onClick={() => setDoneOpen(!doneOpen)}
            className="ui-control mb-1 w-full justify-start border-0 bg-transparent px-0 text-xs font-bold uppercase tracking-wide text-slate-500 hover:text-slate-300">
            {doneOpen ? "▾" : "▸"} Done ({doneGroups.length} plan{doneGroups.length === 1 ? "" : "s"})
          </button>
        </div>
      )}
      {pageGroups.map((group, index) => (
        <div key={group.key}>
          {group.section === "done" && (index === 0 || pageGroups[index - 1].section !== "done") && (
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
              Done plans{pager.page > 1 ? " — continued" : ""}
            </h3>
          )}
          <PlanGroup list={group.list} fullList={group.fullList} continued={group.continued}
            uncommitted={uncommitted} effortByTask={effortByTask}
            taskFilter={taskFilter} onTaskClick={onTaskClick} />
        </div>
      ))}
      {taskRows.length > 50 && (
        <CollectionPager collectionLabel="Plan tasks" page={pager} onPageChange={pager.setPage} />
      )}
    </aside>
  );
}

function FilterChip ({ active, label, onClick }:
  { active: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick}
      className={`ui-control border-0 px-2 text-[11px] ${
        active ? "bg-sky-700 text-white" : "bg-slate-800 text-slate-400 hover:bg-slate-700"}`}>
      {label}
    </button>
  );
}

function PlanGroup ({ list, fullList = list, continued = false, uncommitted, effortByTask, taskFilter, onTaskClick }:
  { list: Task[]; fullList?: Task[]; continued?: boolean;
    uncommitted: Map<string, number>; effortByTask: EffortMap;
    taskFilter: string | null;
    onTaskClick: (key: string) => void }) {
  const doneCount = fullList.filter((t) => t.status === "done").length;
  const first = list[0];
  return (
    <div className="mb-3">
      <div className="mb-1 flex items-baseline gap-2">
        <span className="min-w-0 break-all font-mono text-[11px] text-slate-400">
          {first.plan_file}{continued ? " — continued" : ""}
        </span>
        <span className="ml-auto shrink-0 text-[11px] text-slate-500">
          {doneCount}/{fullList.length} done · {first.repo}
        </span>
      </div>
      {list.map((t) => {
        const key = taskIdentity(t.repo, t.task_ref);
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
            <EffortLine effort={effortByTask.get(key)} /> {/* v0.1.6.0 D1 */}
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

function ChangesView ({ events, tasks, repos, effortByTask, taskFilter, onClearFilter, onPicked,
  sessionFilter, onClearSessionFilter, onSessionClick, onOpenTimeline, onOpenFileStory,
  groupMode, onGroupModeChange, scopeKeyValue, assignmentState, onAssignmentStateChange,
  onStatus }:
  { events: TrackedEvent[]; tasks: Task[]; repos: Repo[]; effortByTask: EffortMap;
    scopeKeyValue: string;
    taskFilter: string | null;
    onClearFilter: () => void; onPicked: () => void;
    sessionFilter: EventSessionIdentity | null; onClearSessionFilter: () => void;
    onSessionClick: (identity: EventSessionIdentity) => void;
    onOpenTimeline: (identity: EventSessionIdentity) => void; // v0.1.6.0 D3 (C.3)
    onOpenFileStory: (repo: string, file: string) => void; // v0.1.7.0 D2 (B.2)
    // D6 (v0.1.4.0): "by task | by folder" — swaps ONLY the grouped section.
    // v0.1.5.0 D.2 (RV3): state lifted to App for the palette action.
    groupMode: "task" | "folder"; onGroupModeChange: (m: "task" | "folder") => void;
    assignmentState: AssignmentUiState;
    onAssignmentStateChange: (state: AssignmentUiState) => void;
    onStatus: (message: string) => void }) {
  const needsPick = events.filter((e) => e.mode === "AMBIGUOUS" || e.mode === "UNKNOWN");
  useReveal("changes", [events.length]); // D5: stagger task groups, once per session
  // v0.1.5.0 D1: the session filter ANDs with the X4 task filter and applies
  // ONLY to the by-task grouped section — pick queue + tree exempt (P11/R7).
  const attributed = events.filter((e) =>
    e.mode !== "AMBIGUOUS" && e.mode !== "UNKNOWN" &&
    (!sessionFilter || sameSessionIdentity(eventSessionIdentity(e), sessionFilter)));
  const sessionFilterKey = sessionFilter
    ? sessionIdentityKey(sessionFilter.provider, sessionFilter.sessionId)
    : null;
  const byTask = useMemo(() => {
    const groups = new Map<string, TrackedEvent[]>();
    for (const e of attributed) {
      const key = taskIdentity(e.repo_id, e.task_ref ?? "(no task)");
      groups.set(key, [...(groups.get(key) ?? []), e]);
    }
    return groups;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, sessionFilterKey]);
  const taskByKey = useMemo(
    () => new Map(tasks.map((t) => [taskIdentity(t.repo, t.task_ref), t])),
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
  const groupPager = useRememberedBoundedPage("changes-task-groups", {
    identity: ["changes-task-groups", scopeKeyValue, taskFilter, sessionFilterKey, groupMode],
    totalItems: groupEntries.length,
    pageSize: 50,
  });
  const visibleGroupEntries = groupEntries
    .map((entry, index) => ({ entry, index }))
    .slice(groupPager.start, groupPager.end);

  // D4 (v0.1.4.0, C.1): sticky mini-TOC entries — hidden when <=1 group;
  // by-task mode only (the folder view is one card per repo).
  const navItems: { id: string; label: string; title?: string; itemIndex: number }[] = [];
  if (groupMode === "task" && groupEntries.length > 1) {
    if (needsPick.length > 0) {
      navItems.push({ id: "sec-pick", label: `manual pick (${needsPick.length})`, itemIndex: -1 });
    }
    groupEntries.forEach(([key], i) => {
      const ref = taskIdentityParts(key)?.[1] ?? key;
      navItems.push({ id: `sec-g${i}`, label: ref.split(" - ").pop() ?? ref, title: ref, itemIndex: i });
    });
  }

  return (
    <div className="space-y-6">
      <h2 data-view-heading tabIndex={-1} className="sr-only">Changes</h2>
      {navItems.length > 0 && (
        <SectionNav items={navItems}
          contextKey={JSON.stringify([scopeKeyValue, taskFilter, sessionFilterKey, groupMode])}
          onActivate={(itemIndex) => {
            if (itemIndex < 0) return;
            flushSync(() => groupPager.setPage(Math.floor(itemIndex / 50) + 1));
          }} />
      )}
      {/* P11: this section is NEVER filtered - it needs action. Wrapper is
          conditional — an empty div would add a phantom space-y gap (T2). */}
      {needsPick.length > 0 && (
        <div id="sec-pick" className="scroll-mt-12">
          <PickSection events={needsPick} tasks={tasks} scopeKeyValue={scopeKeyValue}
            state={assignmentState} onStateChange={onAssignmentStateChange}
            onPicked={onPicked} onStatus={onStatus} />
        </div>
      )}

      <section>
        <div className="mb-2 flex min-w-0 flex-wrap items-center gap-2">
          <h2 className="min-w-0 border-l-4 border-sky-500 pl-2 text-sm font-bold text-slate-200">
            Uncommitted changes {groupMode === "task" ? "grouped by task" : "by folder"}
          </h2>
          {/* D6: the toggle never hides the pick queue above (P11); the tree
              is PER-REPO — an active task filter does not subset it (R7). */}
          <div className="ml-auto flex flex-wrap gap-1">
            <FilterChip active={groupMode === "task"} label="by task"
              onClick={() => onGroupModeChange("task")} />
            <FilterChip active={groupMode === "folder"} label="by folder"
              onClick={() => onGroupModeChange("folder")} />
          </div>
        </div>
        {groupMode === "folder" ? (
          <FolderView events={events} scopeKeyValue={scopeKeyValue} />
        ) : (
          <>
            {(taskFilter || sessionFilter) && (
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                {taskFilter && (
                  <>
                    <span className="rounded bg-sky-900 px-2 py-0.5 text-sky-200">
                      filtered: {taskIdentityParts(taskFilter)?.[1] ?? taskFilter}
                    </span>
                    <button onClick={onClearFilter} className="text-sky-400 hover:underline">✕ clear</button>
                  </>
                )}
                {sessionFilter && ( // v0.1.5.0 D1: session filter chip
                  <>
                    <span className="flex items-center gap-1.5 rounded bg-slate-800 px-2 py-0.5 text-slate-200">
                      <span className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: sessionColor(
                          sessionFilter.provider, sessionFilter.sessionId,
                        ) }} />
                      {sessionFilter.provider} session: {sessionFilter.sessionId.slice(0, 8)}
                    </span>
                    {/* v0.1.6.0 D3 (C.3): the timeline opener lives on the chip */}
                    <button onClick={() => onOpenTimeline(sessionFilter)}
                      className="text-sky-400 hover:underline">timeline</button>
                    <button onClick={onClearSessionFilter} className="text-sky-400 hover:underline">✕ clear</button>
                  </>
                )}
              </div>
            )}
            {groupEntries.length === 0 && (
              <p className="text-sm text-slate-400">
                {taskFilter
                  ? "No uncommitted changes for this task."
                  : "No uncommitted tracked changes — repo is clean or no edits captured yet."}
              </p>
            )}
            {visibleGroupEntries.map(({ entry: [key, group], index: i }) => {
              const task = taskByKey.get(key);
              const ref = taskIdentityParts(key)?.[1] ?? key;
              return (
                <div key={key} id={`sec-g${i}`} className="scroll-mt-12">
                  <TaskGroup refLabel={ref} repoId={group[0].repo_id} group={group}
                    scopeKeyValue={scopeKeyValue} groupIdentity={key}
                    why={task?.why} repos={repos}
                    planFileSet={planFilesByRepo.get(group[0].repo_id)}
                    onSessionClick={onSessionClick}
                    onOpenFileStory={onOpenFileStory}
                    onStatus={onStatus}
                    effort={effortByTask.get(key)} />
                </div>
              );
            })}
            {groupEntries.length > 50 && (
              <CollectionPager collectionLabel="Change task groups" page={groupPager}
                onPageChange={groupPager.setPage} />
            )}
          </>
        )}
      </section>
    </div>
  );
}

// D4 (v0.1.4.0, C.1): sticky mini-TOC + IntersectionObserver scroll-spy for
// the Changes view. Sticky within <main> (the scroll container); the caller
// hides it when there are <=1 task groups.
function SectionNav ({ items, contextKey, onActivate }: {
  items: { id: string; label: string; title?: string; itemIndex: number }[];
  contextKey: string;
  onActivate: (itemIndex: number) => void;
}) {
  const [active, setActive] = useState("");
  const key = JSON.stringify(items.map((item) => [item.id, item.label]));
  const pager = useRememberedBoundedPage("changes-section-nav", {
    identity: ["changes-section-nav", contextKey],
    totalItems: items.length,
    pageSize: 50,
  });
  const visibleItems = items.slice(pager.start, pager.end);
  useEffect(() => {
    const els = items
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => el !== null);
    if (els.length === 0) return;
    const io = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible[0]) setActive(visible[0].target.id); // topmost in view wins
    }, { rootMargin: "-10% 0px -60% 0px" });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return (
    <nav aria-label="Change sections" className="sticky top-0 z-20 -mx-4 -mt-4 flex flex-wrap gap-1 border-b border-slate-800 bg-slate-950/95 px-4 py-2 backdrop-blur">
      {visibleItems.map((s) => (
        <button key={s.id} title={s.title ?? s.label}
          onClick={() => {
            onActivate(s.itemIndex);
            document.getElementById(s.id)
              ?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
          }}
          className={`rounded px-2 py-0.5 text-[11px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
            active === s.id ? "bg-sky-700 text-white" : "bg-slate-800 text-slate-400 hover:bg-slate-700"}`}>
          {s.label}
        </button>
      ))}
      {items.length > 50 && (
        <CollectionPager collectionLabel="Change sections" page={pager}
          onPageChange={pager.setPage} className="ml-auto" />
      )}
    </nav>
  );
}

// D6 (v0.1.4.0, B.3): per-repo changed-files tree — the uncommitted events'
// paths as a monospace ├──/└── tree (white-space: pre, no wrap), one card
// per repo, edit-count badge per leaf (churn hotspots). Neutral leaves this
// release. Built from ALL uncommitted events of the repo (pick queue
// included — "no loss" vs the by-task view, V8).
function FolderView ({ events, scopeKeyValue }: { events: TrackedEvent[]; scopeKeyValue: string }) {
  const byRepo = useMemo(() => {
    const m = new Map<string, TrackedEvent[]>();
    for (const e of events) m.set(e.repo_id, [...(m.get(e.repo_id) ?? []), e]);
    return [...m.entries()];
  }, [events]);
  const pager = useRememberedBoundedPage("changes-folder-repos", {
    identity: ["changes-folder-repos", scopeKeyValue],
    totalItems: byRepo.length,
    pageSize: 50,
  });
  if (byRepo.length === 0) {
    return (
      <p className="text-sm text-slate-400">
        No uncommitted tracked changes — repo is clean or no edits captured yet.
      </p>
    );
  }
  return (
    <>
      {byRepo.slice(pager.start, pager.end).map(([repoId, list]) => (
        <FolderRepoCard key={repoId} repoId={repoId} events={list}
          scopeKeyValue={scopeKeyValue} />
      ))}
      {byRepo.length > 50 && (
        <CollectionPager collectionLabel="Changed-file repositories" page={pager}
          onPageChange={pager.setPage} />
      )}
    </>
  );
}

function FolderRepoCard ({ repoId, events, scopeKeyValue }: {
  repoId: string;
  events: TrackedEvent[];
  scopeKeyValue: string;
}) {
  const lines = buildFileTree(events);
  const pager = useRememberedBoundedPage(
    JSON.stringify(["changes-file-tree", scopeKeyValue, repoId]),
    {
      identity: ["changes-file-tree", scopeKeyValue, repoId],
      totalItems: lines.length,
      pageSize: 50,
    },
  );
  return (
    <div className="mb-4 rounded border border-slate-700 bg-slate-900 p-3">
      <div className="mb-1 flex items-baseline gap-2">
        <span className="font-mono text-sm font-semibold text-sky-300">
          {repoId}{pager.page > 1 ? " — continued" : ""}
        </span>
        <span className="text-[11px] text-slate-500">
          {new Set(events.map((event) => event.file)).size} files · {events.length} edits
        </span>
      </div>
      <pre className="ui-local-scroller overflow-x-auto text-[11px] leading-snug text-slate-300"
        role="region" aria-label={`${repoId} file tree`} tabIndex={0}>
        {lines.slice(pager.start, pager.end).map((line, index) => (
          <span key={pager.start + index}>
            {line.text}
            {line.count !== undefined && (
              <span className={line.count >= 3 ? "text-amber-300" : "text-slate-500"}>
                {`  ×${line.count}`}
              </span>
            )}
            {"\n"}
          </span>
        ))}
      </pre>
      {lines.length > 50 && (
        <CollectionPager collectionLabel={`${repoId} file tree`} page={pager}
          onPageChange={pager.setPage} />
      )}
    </div>
  );
}

// D8: plan-file edits collapse to one expandable line inside each group.
function TaskGroup ({ refLabel, repoId, group, why, repos, planFileSet, onSessionClick,
  onOpenFileStory, effort, scopeKeyValue, groupIdentity, onStatus }:
  { refLabel: string; repoId: string; group: TrackedEvent[]; why?: string;
    repos: Repo[]; planFileSet?: Set<string>;
    scopeKeyValue: string; groupIdentity: string;
    onSessionClick?: (identity: EventSessionIdentity) => void;
    onOpenFileStory?: (repo: string, file: string) => void; // v0.1.7.0 D2
    effort?: { minutes: number; sessions: number };
    onStatus: (message: string) => void }) {
  const [showPlanEdits, setShowPlanEdits] = useState(false);
  const planEdits = group.filter((e) => planFileSet?.has(e.file));
  const normal = group.filter((e) => !planFileSet?.has(e.file));
  const eventPager = useRememberedBoundedPage(
    JSON.stringify(["changes-events", scopeKeyValue, groupIdentity]),
    {
      identity: ["changes-events", scopeKeyValue, groupIdentity],
      totalItems: normal.length,
      pageSize: 50,
    },
  );
  const planEditPager = useBoundedPage({
    identity: ["changes-plan-events", scopeKeyValue, groupIdentity],
    totalItems: planEdits.length,
    pageSize: 50,
  });
  return (
    <div data-reveal className="mb-4 rounded border border-slate-700 bg-slate-900 p-3">
      <div className="flex items-baseline gap-2">
        {/* F48: task-ref link "<plan filename> - <task id>" */}
        <span className="font-mono text-sm font-semibold text-sky-300">{refLabel}</span>
        <span className="text-[11px] text-slate-500">{repoId}</span>
        <EffortLine effort={effort} /> {/* v0.1.6.0 D1 (C.1) */}
      </div>
      {why && <p className="mt-1 text-xs text-slate-400">Why: {why}</p>}
      <div className="mt-2 space-y-1">
        {eventPager.page > 1 && (
          <p className="text-[11px] font-semibold text-slate-400">{refLabel} events — continued</p>
        )}
        {normal.slice(eventPager.start, eventPager.end).map((e) => (
          <EventRow key={e.id} event={e} repos={repos} onSessionClick={onSessionClick}
            onOpenFileStory={onOpenFileStory} onStatus={onStatus} />
        ))}
        {normal.length > 50 && (
          <CollectionPager collectionLabel={`${refLabel} events`} page={eventPager}
            onPageChange={eventPager.setPage} />
        )}
        {planEdits.length > 0 && (
          <div className="rounded bg-slate-800/40 px-2 py-1">
            <button onClick={() => setShowPlanEdits(!showPlanEdits)}
              className="text-[11px] text-slate-400 hover:text-slate-200">
              {showPlanEdits ? "▾" : "▸"} {planEdits.length} plan-file edit{planEdits.length === 1 ? "" : "s"} · latest {fmtRel(planEdits[0].ts)}
            </button>
            {showPlanEdits && (
              <div className="mt-1 space-y-1">
                {planEditPager.page > 1 && (
                  <p className="text-[11px] font-semibold text-slate-400">Plan-file edits — continued</p>
                )}
                {planEdits.slice(planEditPager.start, planEditPager.end).map((e) => (
                  <EventRow key={e.id} event={e} repos={repos} onSessionClick={onSessionClick}
                    onOpenFileStory={onOpenFileStory} onStatus={onStatus} />
                ))}
                {planEdits.length > 50 && (
                  <CollectionPager collectionLabel={`${refLabel} plan-file edits`}
                    page={planEditPager} onPageChange={planEditPager.setPage} />
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// D7: manual-pick queue with per-row assign + bulk assign (X1).
function PickSection ({ events, tasks, scopeKeyValue, state, onStateChange, onPicked,
  onStatus }:
  { events: TrackedEvent[]; tasks: Task[]; scopeKeyValue: string;
    state: AssignmentUiState; onStateChange: (state: AssignmentUiState) => void;
    onPicked: () => void; onStatus: (message: string) => void }) {
  const selected = new Set(state.selectedIds);
  const stateRef = useRef(state);
  stateRef.current = state;
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [mutationBusy, setMutationBusy] = useState(false);
  const mutationBusyRef = useRef(false);
  const bulkControllerRef = useRef<AbortController | null>(null);
  const bulkGenerationRef = useRef(0);
  const [retryIds, setRetryIds] = useState<number[]>([]);
  const pager = useRememberedBoundedPage("changes-pick-events", {
    identity: ["changes-pick-events", scopeKeyValue],
    totalItems: events.length,
    pageSize: 50,
  });
  if (events.length === 0) return null;

  const toggle = (id: number) => {
    const next = new Set(state.selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setRetryIds([]);
    setNote("");
    onStateChange({ ...state, selectedIds: [...next] });
  };
  const selectedEvents = events.filter((e) => selected.has(e.id));
  const repoIds = new Set(selectedEvents.map((e) => e.repo_id));
  const bulkOptions = [...new Set(tasks.filter((t) => repoIds.has(t.repo)).map((t) => t.task_ref))];
  const bulkChoice = bulkOptions.includes(state.bulkChoice) ? state.bulkChoice : "";

  const acquireMutation = useCallback((): boolean => {
    if (mutationBusyRef.current) return false;
    mutationBusyRef.current = true;
    setMutationBusy(true);
    return true;
  }, []);
  const releaseMutation = useCallback(() => {
    mutationBusyRef.current = false;
    setMutationBusy(false);
  }, []);

  useEffect(() => () => {
    bulkGenerationRef.current += 1;
    bulkControllerRef.current?.abort();
  }, []);

  const setBulkChoice = (choice: string): void => {
    setRetryIds([]);
    setNote("");
    onStateChange({ ...stateRef.current, bulkChoice: choice });
  };

  const runBulkAssign = (targetIds?: readonly number[]): void => {
    if (!bulkChoice || !acquireMutation()) return;
    const targets = targetIds
      ? events.filter((event) => targetIds.includes(event.id))
      : selectedEvents;
    if (targets.length === 0) {
      releaseMutation();
      setRetryIds([]);
      return;
    }
    const action = createActionDeadline();
    const generation = ++bulkGenerationRef.current;
    bulkControllerRef.current = action.controller;
    const valid: TrackedEvent[] = [];
    let validationSkipped = 0;
    for (const event of targets) {
      if (assignmentCandidates(event, tasks).includes(bulkChoice)) valid.push(event);
      else validationSkipped += 1;
    }
    setBusy(true);
    setNote("");
    void (async () => {
      const savedIds: number[] = [];
      let failed = 0;
      let unattempted = 0;
      let failure = "";
      let remaining: number[] = [];
      for (let index = 0; index < valid.length; index += 1) {
        try {
          await api.pickTask(valid[index].id, bulkChoice, action.signal);
          savedIds.push(valid[index].id);
        } catch (errorValue) {
          if (isAbortError(errorValue) && !action.didTimeout()) return;
          failed = 1;
          unattempted = valid.length - index - 1;
          remaining = valid.slice(index).map((event) => event.id);
          failure = action.didTimeout()
            ? "The 10-second assignment deadline expired."
            : String(errorValue).slice(0, 100);
          break;
        }
      }
      if (bulkGenerationRef.current !== generation) return;
      const saved = new Set(savedIds);
      const current = stateRef.current;
      onStateChange({
        ...current,
        selectedIds: current.selectedIds.filter((id) => !saved.has(id)),
      });
      setRetryIds(remaining);
      const result = `Saved ${savedIds.length}; validation-skipped ${validationSkipped}; ` +
        `failed ${failed}; unattempted ${unattempted}.` + (failure ? ` ${failure}` : "");
      setNote(result);
      onStatus(result);
      if (savedIds.length > 0) onPicked();
    })().finally(() => {
      action.clear();
      if (bulkGenerationRef.current === generation) {
        bulkControllerRef.current = null;
        setBusy(false);
      }
      releaseMutation();
    });
  };

  const bulkChoiceRows = bulkOptions.map((taskRef) => {
    const matching = tasks.filter((task) => repoIds.has(task.repo) && task.task_ref === taskRef);
    return {
      id: JSON.stringify(["task-ref", taskRef]),
      label: taskRef,
      description: matching.map((task) => `${task.repo}: ${task.title}`).join(" · "),
    };
  });
  const bulkChoiceId = bulkChoice ? JSON.stringify(["task-ref", bulkChoice]) : "";

  return (
    <section>
      <h2 className="mb-2 border-l-4 border-amber-500 pl-2 text-sm font-bold text-amber-400">
        Needs attention — manual pick ({events.length})
      </h2>
      <fieldset disabled={mutationBusy} className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        <legend className="sr-only">Bulk task assignment</legend>
        <label className="flex min-h-6 items-center gap-1 text-slate-300">
          {/* C2: count via selectedEvents - `selected` may hold stale ids after a sync */}
          <input type="checkbox" checked={selectedEvents.length === events.length && events.length > 0}
            disabled={mutationBusy}
            onChange={(e) => {
              setRetryIds([]);
              setNote("");
              onStateChange({
                ...stateRef.current,
                selectedIds: e.target.checked ? events.map((event) => event.id) : [],
              });
            }} />
          select all ({events.length})
        </label>
        <BoundedChoiceDialog
          title="Choose a task for selected events"
          description="The task must be valid for each event; incompatible events remain selected."
          fieldLabel="Search tasks"
          collectionLabel="Bulk assignment tasks"
          choices={bulkChoiceRows}
          value={bulkChoiceId}
          onChange={(id) => {
            const choice = bulkChoiceRows.find((row) => row.id === id);
            if (choice) setBulkChoice(choice.label);
          }}
          contextKey={JSON.stringify(["bulk-task", scopeKeyValue, [...repoIds].sort()])}
          placeholder="Choose task for selected"
          disabled={selectedEvents.length === 0 || mutationBusy}
          disabledReason={selectedEvents.length === 0 ? "Select at least one event first." : undefined}
        />
        <button disabled={!bulkChoice || selectedEvents.length === 0 || mutationBusy}
          aria-busy={busy} onClick={() => runBulkAssign()}
          className="min-h-[28px] rounded bg-amber-600 px-2 py-1 text-xs font-semibold text-slate-950 hover:bg-amber-500 disabled:opacity-40">
          {busy ? "Assigning…" : `Assign ${selectedEvents.length || ""}`}
        </button>
        {retryIds.length > 0 && !busy && (
          <button type="button" className="ui-control bg-ui-raised"
            onClick={() => runBulkAssign(retryIds)}>
            Retry failed/unattempted ({retryIds.length})
          </button>
        )}
        {note && <span className="text-slate-400">{note}</span>} {/* P6: inline result note */}
      </fieldset>
      {events.slice(pager.start, pager.end).map((e) => (
        <PickRow key={e.id} event={e} tasks={tasks} onPicked={onPicked}
          onStatus={onStatus} sectionDisabled={mutationBusy}
          acquireMutation={acquireMutation} releaseMutation={releaseMutation}
          choice={state.choices[String(e.id)] ?? ""}
          onChoiceChange={(choice) => onStateChange({
            ...stateRef.current,
            choices: { ...stateRef.current.choices, [String(e.id)]: choice },
          })}
          onAssigned={() => {
            const current = stateRef.current;
            const choices = { ...current.choices };
            delete choices[String(e.id)];
            onStateChange({
              ...current,
              selectedIds: current.selectedIds.filter((id) => id !== e.id),
              choices,
            });
          }}
          checked={selected.has(e.id)} onToggle={() => toggle(e.id)} />
      ))}
      {events.length > 50 && (
        <CollectionPager collectionLabel="Manual-pick events" page={pager}
          onPageChange={pager.setPage} />
      )}
    </section>
  );
}

function PickRow ({ event, tasks, onPicked, onStatus, choice, onChoiceChange,
  onAssigned, checked, onToggle, sectionDisabled, acquireMutation, releaseMutation }:
  { event: TrackedEvent; tasks: Task[]; onPicked: () => void;
    onStatus: (message: string) => void;
    choice: string; onChoiceChange: (choice: string) => void; onAssigned: () => void;
    checked: boolean; onToggle: () => void; sectionDisabled: boolean;
    acquireMutation: () => boolean; releaseMutation: () => void }) {
  // F17: AMBIGUOUS -> candidates list; UNKNOWN -> ALL repo tasks.
  const candidates = assignmentCandidates(event, tasks);
  const effectiveChoice = candidates.includes(choice) ? choice : "";
  const choiceRows = candidates.map((taskRef) => ({
    id: JSON.stringify(["task-ref", event.repo_id, taskRef]),
    label: taskRef,
    description: tasks.find((task) => task.repo === event.repo_id && task.task_ref === taskRef)?.title,
  }));
  const effectiveChoiceId = effectiveChoice
    ? JSON.stringify(["task-ref", event.repo_id, effectiveChoice])
    : "";
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const generationRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => {
    generationRef.current += 1;
    controllerRef.current?.abort();
  }, []);

  const assign = (): void => {
    if (!effectiveChoice || !acquireMutation()) return;
    const action = createActionDeadline();
    const generation = ++generationRef.current;
    controllerRef.current = action.controller;
    setBusy(true);
    setNote("");
    void api.pickTask(event.id, effectiveChoice, action.signal).then(() => {
      if (generationRef.current !== generation || action.signal.aborted) return;
      onAssigned();
      onPicked();
      const message = `${event.file} assigned to ${effectiveChoice}.`;
      setNote(message);
      onStatus(message);
    }, (errorValue) => {
      if (generationRef.current !== generation) return;
      if (isAbortError(errorValue) && !action.didTimeout()) return;
      const message = action.didTimeout()
        ? "Assignment timed out after 10 seconds. Retry."
        : `Assignment failed: ${String(errorValue).slice(0, 100)}. Retry.`;
      setNote(message);
      onStatus(message);
    }).finally(() => {
      action.clear();
      if (generationRef.current === generation) {
        controllerRef.current = null;
        setBusy(false);
      }
      releaseMutation();
    });
  };

  return (
    <div className="mb-2 flex flex-wrap items-center gap-2 rounded border border-amber-700/50 bg-slate-900 p-2 text-sm">
      <label className="flex min-h-6 items-center gap-1 text-[11px] text-slate-400">
        <input type="checkbox" checked={checked} onChange={onToggle}
          disabled={sectionDisabled} />
        <span>Select</span>
      </label>
      <ModeBadge mode={event.mode} />
      <span className="min-w-0 max-w-full break-all font-mono text-xs">{event.file}</span>
      <SessionDot identity={eventSessionIdentity(event)} /> {/* informational — RV4 */}
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
          <BoundedChoiceDialog
            title={`Choose a task for ${event.file}`}
            description={`Repository: ${event.repo_id}`}
            fieldLabel="Search tasks"
            collectionLabel={`${event.repo_id} tasks`}
            choices={choiceRows}
            value={effectiveChoiceId}
            onChange={(id) => {
              const selectedChoice = choiceRows.find((row) => row.id === id);
              if (selectedChoice) {
                setNote("");
                onChoiceChange(selectedChoice.label);
              }
            }}
            contextKey={JSON.stringify(["event-task", event.repo_id, event.id])}
            placeholder="Choose task"
            disabled={sectionDisabled}
          />
          <button disabled={!effectiveChoice || sectionDisabled} aria-busy={busy}
            onClick={assign}
            className="min-h-[28px] rounded bg-sky-700 px-2 py-1 text-xs font-semibold hover:bg-sky-600 disabled:opacity-40">
            {busy ? "Assigning…" : note ? "Retry" : "Assign"}
          </button>
        </>
      )}
      {note && <span className="basis-full text-xs text-slate-400">{note}</span>}
    </div>
  );
}

// B.8: one row everywhere - context-aware diff (commit diff when linked).
// v0.1.5.0 D1: session dot before the timestamp; clickable only when the
// caller passes onSessionClick (Changes task groups — RV4).
function EventRow ({ event, repos, showRef, onSessionClick, onOpenFileStory, onStatus }:
  { event: TrackedEvent; repos: Repo[]; showRef?: boolean;
    onSessionClick?: (identity: EventSessionIdentity) => void;
    // v0.1.7.0 D2 (B.2): passed ONLY from Changes task groups (the
    // v0.1.5.0 RV4 zone precedent) — History/queue file names stay plain.
    onOpenFileStory?: (repo: string, file: string) => void;
    onStatus?: (message: string) => void }) {
  const [diff, setDiff] = useState<string | null>(null);
  const [diffError, setDiffError] = useState("");
  const [diffBusy, setDiffBusy] = useState(false);
  const diffBusyRef = useRef(false);
  const diffGenerationRef = useRef(0);
  const diffControllerRef = useRef<AbortController | null>(null);
  const online = repos.some((r) => r.id === event.repo_id && !r.offline);
  // v0.1.6.0 D2 (C.2, RV14): differs-suffix - only when BOTH branches are
  // known AND differ (the different-branch signal, never same-branch noise).
  const repoBranch = repos.find((r) => r.id === event.repo_id)?.branch;
  const sessionIdentity = eventSessionIdentity(event);
  useEffect(() => () => {
    diffGenerationRef.current += 1;
    diffControllerRef.current?.abort();
  }, []);

  const loadDiff = (): void => {
    if (diffBusyRef.current) return;
    const action = createActionDeadline();
    const generation = ++diffGenerationRef.current;
    diffControllerRef.current?.abort();
    diffControllerRef.current = action.controller;
    diffBusyRef.current = true;
    setDiffBusy(true);
    setDiffError("");
    void api.diff(event.repo_id, event.file, event.commit_hash, action.signal).then((result) => {
      if (diffGenerationRef.current !== generation || action.signal.aborted) return;
      setDiff(result.diff);
    }, (errorValue) => {
      if (diffGenerationRef.current !== generation) return;
      if (isAbortError(errorValue) && !action.didTimeout()) return;
      const message = action.didTimeout()
        ? "Diff timed out after 10 seconds."
        : `Diff failed: ${String(errorValue).slice(0, 100)}`;
      setDiffError(message);
      onStatus?.(`${message} Retry is available.`);
    }).finally(() => {
      action.clear();
      if (diffGenerationRef.current === generation) {
        diffControllerRef.current = null;
        diffBusyRef.current = false;
        setDiffBusy(false);
      }
    });
  };

  const hideDiff = (): void => {
    diffGenerationRef.current += 1;
    diffControllerRef.current?.abort();
    diffControllerRef.current = null;
    diffBusyRef.current = false;
    setDiff(null);
    setDiffError("");
    setDiffBusy(false);
  };
  return (
    <div className="min-w-0 rounded bg-slate-800/60 px-2 py-1">
      <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
        <ModeBadge mode={event.mode} swept={event.swept === 1} />
        {onOpenFileStory ? (
          <button onClick={() => onOpenFileStory(event.repo_id, event.file)}
            title={`${event.file} — open file story`}
            className="min-w-0 flex-1 break-all font-mono text-left hover:text-sky-300 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">
            {event.file}
          </button>
        ) : (
          <span className="font-mono">{event.file}</span>
        )}
        {showRef && event.task_ref && (
          <span className="min-w-0 basis-full break-words text-[11px] text-sky-300">
            {event.task_ref}
          </span>
        )}
        <SessionDot identity={sessionIdentity}
          onClick={onSessionClick && sessionIdentity
            ? () => onSessionClick(sessionIdentity) : undefined} />
        {event.branch && repoBranch && event.branch !== repoBranch && (
          <span className="text-[11px] text-amber-300/80"
            title="captured on a different branch than the repo is on now">
            &#x2387; {event.branch}
          </span>
        )}
        <span className="text-[11px] text-slate-400" title={event.ts}>
          {event.tool} · {fmtRel(event.ts)}
        </span>
        {online && (
          <button className="ml-auto min-h-[24px] text-[11px] text-sky-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:opacity-40"
            disabled={diffBusy} aria-busy={diffBusy}
            aria-label={diffBusy
              ? `Loading diff for ${event.file}`
              : diff === null
                ? diffError ? `Retry diff for ${event.file}` : `Show diff for ${event.file}`
                : `Hide diff for ${event.file}`}
            onClick={diff !== null ? hideDiff : loadDiff}>
            {diffBusy ? "loading…" : diff === null ? diffError ? "retry diff" : "diff" : "hide"}
          </button>
        )}
      </div>
      {diff !== null && <DiffView text={diff} repoId={event.repo_id} eventId={event.id} />}
      {diffError && (
        <p className="mt-1 rounded bg-rose-950/30 px-2 py-1 text-[11px] text-rose-300">
          {diffError} Use “retry diff”.
        </p>
      )}
    </div>
  );
}

// D1/R11: position-aware colored diff. Headers only in the pre-hunk region;
// inside a hunk the first char decides (+added / -removed / space-context).
// Honest empty-state messages (v0.1.2.0 D3) are NOT diffs -> italic note.
function DiffView ({ text, repoId, eventId }: { text: string; repoId: string; eventId: number }) {
  const isDiff = text.startsWith("diff --git") ||
    text.split("\n").some((l) => l.startsWith("@@") || l.startsWith("+") || l.startsWith("-"));
  const sourceLines = text.split("\n");
  const pager = useBoundedPage({
    identity: ["diff-lines", repoId, eventId],
    totalItems: isDiff ? sourceLines.length : 0,
    pageSize: 50,
  });
  if (!isDiff) {
    return <p className="mt-1 rounded bg-slate-950 px-2 py-1 text-[11px] italic text-slate-400">{text}</p>;
  }
  let inHunk = false;
  const HEADER = /^(diff --git|index |\+\+\+ |--- |new file|deleted file|old mode|new mode|rename |similarity |Binary )/;
  const rows = sourceLines.map((line, i) => {
    let color = "text-slate-300"; // context
    if (line.startsWith("@@")) { inHunk = true; color = "text-sky-400"; }
    else if (!inHunk) { color = HEADER.test(line) ? "text-slate-500" : "text-slate-500"; }
    else if (line.startsWith("+")) color = "text-emerald-400";
    else if (line.startsWith("-")) color = "text-rose-400";
    else if (line.startsWith("\\")) color = "text-slate-500";
    return { line, color, index: i };
  });
  return (
    <div className="mt-1 rounded bg-slate-950 p-2">
      {pager.page > 1 && <p className="mb-1 text-[11px] text-slate-400">Diff — continued</p>}
      <pre className="ui-local-scroller max-h-64 overflow-auto text-[11px] leading-snug"
        role="region" aria-label="File diff" tabIndex={0}>
        {rows.slice(pager.start, pager.end).map((row) => (
          <span key={row.index} className={row.color}>{row.line || " "}{"\n"}</span>
        ))}
      </pre>
      {rows.length > 50 && (
        <CollectionPager collectionLabel="Diff lines" page={pager}
          onPageChange={pager.setPage} />
      )}
    </div>
  );
}

interface HistoryRequestOwner {
  controller: AbortController;
  action?: ActionDeadline;
}

interface HistoryGraphFailure {
  message: string;
  recovery: "retry" | "reload";
}

function historyGraphKey (repoId: string, branch: string,
  entries: readonly HistoryEntry[]): string {
  return JSON.stringify([
    "history-graph",
    repoId,
    branch,
    entries.slice(0, 20).map((entry) => [entry.commit.hash, entry.commit.parents]),
  ]);
}

// History keeps its API fetch depth independent from its visible 50-commit page.
function HistoryView ({ repos, scopeKeyValue, state, onStateChange, onStatus }: {
  repos: Repo[];
  scopeKeyValue: string;
  state: HistoryUiState;
  onStateChange: (state: HistoryUiState) => void;
  onStatus: (message: string) => void;
}) {
  const repoId = repos.some((repo) => repo.id === state.repoId)
    ? state.repoId
    : repos[0]?.id ?? "";
  const stateRef = useRef(state);
  stateRef.current = state;
  const reposRef = useRef(repos);
  reposRef.current = repos;
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const entriesRef = useRef<HistoryEntry[]>([]);
  const [exhausted, setExhausted] = useState(false);
  const exhaustedRef = useRef(false);
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(false);
  const [loadError, setLoadError] = useState("");
  const loadErrorRef = useRef("");
  const loadedRepoRef = useRef("");
  const loadGenerationRef = useRef(0);
  const loadOwnerRef = useRef<HistoryRequestOwner | null>(null);
  const targetDepthRef = useRef(PAGE);

  const [showGraph, setShowGraph] = useState(false);
  const showGraphRef = useRef(false);
  const [graphSvg, setGraphSvg] = useState("");
  const [graphShown, setGraphShown] = useState(0);
  const [graphRows, setGraphRows] = useState<GitGraphRow[]>([]);
  const [graphBusy, setGraphBusy] = useState(false);
  const [graphFailure, setGraphFailure] = useState<HistoryGraphFailure | null>(null);
  const graphGenerationRef = useRef(0);
  const graphOwnerRef = useRef<HistoryRequestOwner | null>(null);
  const graphRequestKeyRef = useRef("");
  const graphRef = useRef<HTMLDivElement | null>(null);

  const disposeOwner = useCallback((owner: HistoryRequestOwner | null, abort: boolean) => {
    if (!owner) return;
    if (abort) owner.controller.abort();
    owner.action?.clear();
  }, []);

  const cancelGraph = useCallback(() => {
    graphGenerationRef.current += 1;
    disposeOwner(graphOwnerRef.current, true);
    graphOwnerRef.current = null;
    setGraphBusy(false);
  }, [disposeOwner]);

  const cancelLoad = useCallback(() => {
    loadGenerationRef.current += 1;
    disposeOwner(loadOwnerRef.current, true);
    loadOwnerRef.current = null;
    loadingRef.current = false;
    setLoading(false);
  }, [disposeOwner]);

  const runGraph = useCallback(async (
    id: string,
    sourceEntries: readonly HistoryEntry[],
    owner: HistoryRequestOwner,
    borrowedOwner: boolean,
  ): Promise<boolean> => {
    const branch = reposRef.current.find((repo) => repo.id === id)?.branch ?? "main";
    const key = historyGraphKey(id, branch, sourceEntries);
    const priorOwner = graphOwnerRef.current;
    if (priorOwner && priorOwner.controller !== owner.controller) disposeOwner(priorOwner, true);
    const generation = ++graphGenerationRef.current;
    const changedKey = graphRequestKeyRef.current !== key;
    graphRequestKeyRef.current = key;
    graphOwnerRef.current = owner;
    setGraphBusy(true);
    setGraphFailure(null);
    if (changedKey) {
      setGraphSvg("");
      setGraphShown(0);
      setGraphRows([]);
    }
    try {
      const prepared = buildGitGraph([...sourceEntries], branch);
      setGraphRows(prepared.rows);
      const result = await renderGitGraph([...sourceEntries], branch, {
        origin: owner.action ? "foreground" : "background",
        key,
        generation,
        signal: owner.controller.signal,
        deadlineAt: owner.action?.deadlineAt,
      }, prepared);
      if (graphGenerationRef.current !== generation || !showGraphRef.current
          || loadedRepoRef.current !== id || owner.controller.signal.aborted) return false;
      setGraphSvg(result.svg);
      setGraphShown(result.meta.shown);
      return true;
    } catch (errorValue) {
      if (graphGenerationRef.current !== generation || loadedRepoRef.current !== id) return false;
      const timedOut = !!owner.action
        && (owner.action.didTimeout() || Date.now() >= owner.action.deadlineAt);
      if (isAbortError(errorValue) && !timedOut) return false;
      const moduleFailure = errorValue instanceof MermaidModuleLoadError;
      const message = timedOut
        ? "Commit graph timed out after 10 seconds."
        : moduleFailure
          ? "Commit graph module could not load."
          : `Commit graph failed: ${String(errorValue).slice(0, 120)}`;
      setGraphFailure({ message, recovery: moduleFailure ? "reload" : "retry" });
      if (owner.action) onStatus(`${message} ${moduleFailure ? "Reload the page." : "Retry is available."}`);
      return false;
    } finally {
      if (graphGenerationRef.current === generation) {
        if (graphOwnerRef.current?.controller === owner.controller) graphOwnerRef.current = null;
        setGraphBusy(false);
      }
      if (!borrowedOwner) owner.action?.clear();
    }
  }, [disposeOwner, onStatus]);

  const runLoad = useCallback(async (
    id: string,
    generation: number,
    owner: HistoryRequestOwner,
    options: { recovering?: boolean; successMessage?: string } = {},
  ): Promise<void> => {
    if (!id || loadingRef.current || exhaustedRef.current || loadErrorRef.current) {
      disposeOwner(owner, false);
      return;
    }
    loadOwnerRef.current = owner;
    loadingRef.current = true;
    setLoading(true);
    try {
      while (loadGenerationRef.current === generation
          && entriesRef.current.length < targetDepthRef.current
          && !exhaustedRef.current) {
        const offset = entriesRef.current.length;
        const page = await api.history(id, PAGE, offset, owner.controller.signal);
        if (loadGenerationRef.current !== generation || loadedRepoRef.current !== id
            || owner.controller.signal.aborted) return;
        const next = [...entriesRef.current, ...page];
        entriesRef.current = next;
        setEntries(next);
        if (page.length < PAGE) {
          exhaustedRef.current = true;
          setExhausted(true);
        }
      }
      if (loadGenerationRef.current !== generation || loadedRepoRef.current !== id) return;
      if (showGraphRef.current && entriesRef.current.length > 0) {
        const graphComplete = await runGraph(id, entriesRef.current, owner, true);
        if (!graphComplete) return;
      }
      if (owner.controller.signal.aborted) return;
      if (options.recovering) onStatus("History recovered.");
      else if (options.successMessage) onStatus(options.successMessage);
    } catch (errorValue) {
      if (loadGenerationRef.current !== generation || loadedRepoRef.current !== id) return;
      const timedOut = !!owner.action
        && (owner.action.didTimeout() || Date.now() >= owner.action.deadlineAt);
      if (isAbortError(errorValue) && !timedOut) return;
      const message = timedOut
        ? "History request timed out after 10 seconds."
        : `History request failed: ${String(errorValue).slice(0, 120)}`;
      loadErrorRef.current = message;
      setLoadError(message);
      onStatus(`${message} Retry is available.`);
    } finally {
      disposeOwner(owner, false);
      if (loadOwnerRef.current?.controller === owner.controller) loadOwnerRef.current = null;
      if (loadGenerationRef.current === generation && loadedRepoRef.current === id) {
        loadingRef.current = false;
        setLoading(false);
      }
    }
  }, [disposeOwner, onStatus, runGraph]);

  const clearRepoState = useCallback((nextRepoId: string): number => {
    cancelLoad();
    cancelGraph();
    loadedRepoRef.current = nextRepoId;
    entriesRef.current = [];
    exhaustedRef.current = false;
    loadErrorRef.current = "";
    graphRequestKeyRef.current = "";
    setEntries([]);
    setExhausted(false);
    setLoadError("");
    setGraphSvg("");
    setGraphShown(0);
    setGraphRows([]);
    setGraphFailure(null);
    return loadGenerationRef.current;
  }, [cancelGraph, cancelLoad]);

  useEffect(() => {
    const targetDepth = state.repoId === repoId
      ? Math.max(PAGE, state.fetchDepth)
      : PAGE;
    targetDepthRef.current = targetDepth;
    if (state.repoId !== repoId) onStateChange({ repoId, fetchDepth: PAGE, page: 1 });
    let generation = loadGenerationRef.current;
    if (loadedRepoRef.current !== repoId) generation = clearRepoState(repoId);
    if (!repoId || loadingRef.current || exhaustedRef.current || loadErrorRef.current
        || entriesRef.current.length >= targetDepthRef.current) return;
    void runLoad(repoId, generation, { controller: new AbortController() });
  }, [clearRepoState, onStateChange, repoId, runLoad, state.fetchDepth, state.repoId]);

  useEffect(() => () => {
    cancelLoad();
    cancelGraph();
  }, [cancelGraph, cancelLoad]);

  const shownEntries = loadedRepoRef.current === repoId ? entries : [];
  const requiredDepth = state.repoId === repoId
    ? Math.max(PAGE, state.fetchDepth)
    : PAGE;
  const historyHydrating = !!repoId && !loadError
    && !exhausted && (loading || shownEntries.length < requiredDepth);
  const pager = useBoundedPage({
    identity: ["history-commits", scopeKeyValue, repoId],
    totalItems: historyHydrating
      ? Math.max(shownEntries.length, requiredDepth)
      : shownEntries.length,
    pageSize: 50,
    page: state.page,
    onPageChange: (page) => {
      const current = stateRef.current;
      if (current.page !== page) onStateChange({ ...current, page });
    },
  });

  const branch = repos.find((repo) => repo.id === repoId)?.branch ?? "main";
  const semanticGraphKey = historyGraphKey(repoId, branch, shownEntries);
  useEffect(() => {
    if (!showGraph || loading || shownEntries.length === 0
        || graphRequestKeyRef.current === semanticGraphKey || graphBusy) return;
    void runGraph(repoId, shownEntries, { controller: new AbortController() }, false);
  }, [graphBusy, loading, repoId, runGraph, semanticGraphKey, showGraph, shownEntries]);

  useEffect(() => {
    const host = graphRef.current;
    if (!host) return;
    if (!graphSvg) { host.replaceChildren(); return; }
    const doc = new DOMParser().parseFromString(graphSvg, "text/html");
    const parsed = doc.querySelector("svg");
    if (parsed) host.replaceChildren(document.adoptNode(parsed));
  }, [graphSvg]);

  const toggleGraph = (): void => {
    if (showGraphRef.current) {
      showGraphRef.current = false;
      setShowGraph(false);
      cancelGraph();
      setGraphSvg("");
      setGraphShown(0);
      setGraphRows([]);
      setGraphFailure(null);
      return;
    }
    showGraphRef.current = true;
    setShowGraph(true);
    if (!repoId || exhaustedRef.current && entriesRef.current.length === 0) return;
    const action = createActionDeadline();
    const owner = { controller: action.controller, action };
    if (loadingRef.current && entriesRef.current.length === 0) {
      cancelLoad();
      const generation = loadGenerationRef.current;
      loadErrorRef.current = "";
      setLoadError("");
      void runLoad(repoId, generation, owner);
    } else if (entriesRef.current.length > 0) {
      void runGraph(repoId, entriesRef.current, owner, false);
    } else {
      disposeOwner(owner, false);
    }
  };

  const retryGraph = (): void => {
    if (!repoId || entriesRef.current.length === 0 || graphOwnerRef.current || graphBusy) return;
    const action = createActionDeadline();
    void runGraph(repoId, entriesRef.current,
      { controller: action.controller, action }, false);
  };

  const historyReady = !repoId || !!loadError || !historyHydrating;
  const repoChoices = repos.map((repo) => ({
    id: JSON.stringify(["repo", repo.id]),
    label: repo.id,
    description: repo.branch ? `Current branch: ${repo.branch}` : "Branch unavailable",
  }));
  const repoChoiceId = repoId ? JSON.stringify(["repo", repoId]) : "";
  return (
    <section data-history-ready={historyReady ? "true" : "false"}>
      <div className="mb-3 flex min-w-0 flex-wrap items-center gap-2">
        <h2 data-view-heading tabIndex={-1}
          className="border-l-4 border-emerald-500 pl-2 text-sm font-bold text-slate-200">
          History
        </h2>
        <div className="flex min-w-0 items-center gap-2 text-xs text-slate-300">
          <span>Repository</span>
          <BoundedChoiceDialog
            title="Choose History repository"
            description="Only currently online repositories are available."
            fieldLabel="Search repositories"
            collectionLabel="History repositories"
            choices={repoChoices}
            value={repoChoiceId}
            onChange={(choiceId) => {
              const nextRepoId = repoChoices.find((choice) => choice.id === choiceId)?.label ?? "";
              if (!nextRepoId || nextRepoId === loadedRepoRef.current) return;
              const generation = clearRepoState(nextRepoId);
              targetDepthRef.current = PAGE;
              onStateChange({ repoId: nextRepoId, fetchDepth: PAGE, page: 1 });
              const action = createActionDeadline();
              void runLoad(nextRepoId, generation,
                { controller: action.controller, action },
                { successMessage: `History loaded for ${nextRepoId}.` });
            }}
            contextKey={JSON.stringify(["history-repo", scopeKeyValue])}
            placeholder="Choose repository"
            disabled={repos.length === 0}
            disabledReason={repos.length === 0 ? "No online repositories are available." : undefined}
            triggerClassName="min-h-[28px] text-xs"
          />
        </div>
        <button type="button" disabled={!repoId} onClick={toggleGraph}
          aria-pressed={showGraph} title="toggle the commit graph (latest 20 commits, real parents)"
          className={`min-h-[28px] rounded px-2 py-1 text-xs disabled:opacity-40 ${
            showGraph ? "bg-teal-800 text-white" : "bg-slate-800 hover:bg-slate-700"}`}>
          ⎇ graph
        </button>
        {graphBusy && <span className="text-xs text-slate-400">rendering…</span>}
      </div>
      {showGraph && (
        <div className="mb-3 min-w-0 rounded border border-slate-700 bg-slate-900 p-3">
          {graphFailure && (
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-amber-300">
              <span>{graphFailure.message}</span>
              <button type="button" className="ui-control" disabled={graphBusy}
                onClick={graphFailure.recovery === "reload"
                  ? () => window.location.reload()
                  : retryGraph}>
                {graphFailure.recovery === "reload" ? "Reload page" : "Retry graph"}
              </button>
            </div>
          )}
          <DisclosureTable
            label="Commit graph"
            summary={graphRows.length === 0
              ? "No commits are available for this graph."
              : `Latest ${graphRows.length} commit${graphRows.length === 1 ? "" : "s"}; `
                + `${graphRows.filter((row) => row.parents.length > 1).length} merge commit${graphRows.filter((row) => row.parents.length > 1).length === 1 ? "" : "s"}.`}
            rows={graphRows}
            rowKey={(row) => row.hash}
            identity={["history-graph-alternative", scopeKeyValue, repoId, semanticGraphKey]}
            columns={[
              { key: "hash", label: "Commit", render: (row) => row.hash.slice(0, 10) },
              { key: "message", label: "Message", render: (row) => row.message },
              { key: "time", label: "Timestamp", render: (row) => fmtTs(row.timestamp) },
              { key: "parents", label: "Parents", render: (row) => row.parents.length > 0
                ? row.parents.map((hash) => hash.slice(0, 10)).join(", ") : "root" },
              { key: "events", label: "Tracked events", render: (row) => row.eventCount,
                sortValue: (row) => row.eventCount },
            ]}
            className="mb-2"
          />
          <div ref={graphRef} className="ui-local-scroller" role="img" aria-label="commit graph" />
          {graphSvg && (
            <p className="mt-1 text-[11px] text-slate-400">
              latest {graphShown} of {shownEntries.length} fetched commits · merge side branches summarized to their tip (*)
            </p>
          )}
          {!graphBusy && !graphSvg && !graphFailure && (
            <p className="text-xs text-slate-400">No commits to graph.</p>
          )}
        </div>
      )}
      {loadError && (
        <div id="history-load-failure" tabIndex={-1}
          className="mb-3 rounded border border-rose-700 bg-rose-950/30 p-3 text-sm text-rose-200">
          <p>{loadError}</p>
          <button type="button" className="ui-control mt-2" disabled={loading}
            aria-busy={loading} onClick={() => {
              if (!repoId || loadingRef.current) return;
              loadErrorRef.current = "";
              setLoadError("");
              const action = createActionDeadline();
              void runLoad(repoId, loadGenerationRef.current,
                { controller: action.controller, action }, { recovering: true });
            }}>
            Retry
          </button>
        </div>
      )}
      {loading && shownEntries.length === 0 && (
        <div className="ui-skeleton min-h-48 rounded-panel p-4 text-sm text-ui-muted">Loading History…</div>
      )}
      {shownEntries.slice(pager.start, pager.end).map((entry) => (
        <HistoryCommitCard key={entry.commit.hash} entry={entry} repos={repos}
          scopeKeyValue={scopeKeyValue} repoId={repoId} onStatus={onStatus} />
      ))}
      {!historyHydrating && shownEntries.length > 50 && (
        <CollectionPager collectionLabel="History commits" page={pager}
          onPageChange={pager.setPage} />
      )}
      {!loading && !loadError && shownEntries.length === 0 && (
        <p className="text-sm text-slate-400">
          {repoId ? "No commits captured yet." : "No online repositories are available."}
        </p>
      )}
      {!exhausted && shownEntries.length > 0 && (
        <button type="button" disabled={loading} aria-busy={loading}
          onClick={() => {
            if (loadingRef.current) return;
            const nextDepth = Math.max(PAGE, stateRef.current.fetchDepth) + PAGE;
            targetDepthRef.current = nextDepth;
            onStateChange({ ...stateRef.current, fetchDepth: nextDepth });
            const action = createActionDeadline();
            void runLoad(repoId, loadGenerationRef.current,
              { controller: action.controller, action },
              { successMessage: "Older History entries loaded." });
          }}
          className="ui-control mt-3 bg-ui-raised disabled:opacity-40">
          {loading ? "Loading older commits…" : "Load more (older)"}
        </button>
      )}
    </section>
  );
}

function HistoryCommitCard ({ entry: { commit, events }, repos, scopeKeyValue, repoId,
  onStatus }: {
  entry: HistoryEntry;
  repos: Repo[];
  scopeKeyValue: string;
  repoId: string;
  onStatus: (message: string) => void;
}) {
  const pager = useRememberedBoundedPage(
    JSON.stringify(["history-events", scopeKeyValue, repoId, commit.hash]),
    {
      identity: ["history-events", scopeKeyValue, repoId, commit.hash],
      totalItems: events.length,
      pageSize: 50,
    },
  );
  return (
    <article className="mb-3 min-w-0 rounded border border-slate-700 bg-slate-900 p-3">
      <div className="flex min-w-0 flex-wrap items-baseline gap-2">
        <span className="shrink-0 font-mono text-xs text-emerald-400">{commit.hash.slice(0, 10)}</span>
        <span className="min-w-0 flex-1 break-words text-sm">{commit.message}</span>
        <span className="shrink-0 text-[11px] text-slate-400" title={commit.ts}>{fmtTs(commit.ts)}</span>
      </div>
      <div className="mt-2 space-y-1">
        {events.length === 0 && (
          <p className="text-[11px] text-slate-500">No tracked events in this commit.</p>
        )}
        {pager.page > 1 && (
          <p className="text-[11px] font-semibold text-slate-400">Commit events — continued</p>
        )}
        {events.slice(pager.start, pager.end).map((event) => (
          <EventRow key={event.id} event={event} repos={repos} showRef onStatus={onStatus} />
        ))}
        {events.length > 50 && (
          <CollectionPager collectionLabel={`${commit.hash.slice(0, 10)} events`}
            page={pager} onPageChange={pager.setPage} />
        )}
      </div>
    </article>
  );
}
