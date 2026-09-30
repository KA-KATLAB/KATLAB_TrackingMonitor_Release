import { raceWithSignal } from "./api";
import type { ActionDeadline } from "./api";
import type { StatsData } from "./charts";

export type StatsRefreshResult =
  | { ok: true; data: StatsData }
  | { ok: false; error: string };

/** Bound manual observation even when a transport ignores cancellation. */
export async function runStatsRefresh ({ action, request, isCurrent, onResult, onSettled }: {
  action: ActionDeadline;
  request: (signal: AbortSignal) => Promise<StatsData>;
  isCurrent: () => boolean;
  onResult: (result: StatsRefreshResult) => void;
  onSettled: () => void;
}): Promise<void> {
  try {
    if (!isCurrent() || action.signal.aborted) return;
    let result: StatsRefreshResult;
    try {
      const data = await raceWithSignal(request(action.signal), action.signal);
      result = { ok: true, data };
    } catch (errorValue) {
      if (!isCurrent() || (action.signal.aborted && !action.didTimeout())) return;
      result = { ok: false, error: action.didTimeout()
        ? "Overview stats refresh timed out after 10 seconds. Retry stats."
        : `Overview stats refresh failed: ${String(errorValue).slice(0, 120)}. Retry stats.` };
    }
    // Consumer failures are not transport failures; cleanup still releases ownership.
    if (isCurrent() && (!action.signal.aborted || action.didTimeout())) onResult(result);
  } finally {
    action.clear();
    onSettled();
  }
}
