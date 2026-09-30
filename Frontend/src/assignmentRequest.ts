import { abortError, raceWithSignal } from "./api";
import type { ActionDeadline } from "./api";

export function assignmentFailureMessage (error: unknown, timedOut: boolean): string {
  const detail = timedOut ? "Evidence assignment timed out after 10 seconds."
    : `Evidence assignment could not be confirmed: ${String(error).slice(0, 120)}.`;
  return `${detail} The server may have saved the change. Close and refresh Mission to verify before retrying.`;
}

/** Settle the current write observer, without claiming cancellation undoes a write. */
export async function runAssignmentRequest ({
  action, request, isCurrent, onSuccess, onFailure, onSettled,
}: {
  action: ActionDeadline;
  request: (signal: AbortSignal) => Promise<unknown>;
  isCurrent: () => boolean;
  onSuccess: () => void;
  onFailure: (message: string) => void;
  onSettled: () => void;
}): Promise<void> {
  try {
    if (!isCurrent() || action.signal.aborted) return;
    try {
      // Install the abort race before transport can start or synchronously throw.
      const pending = Promise.resolve().then(() => {
        if (!isCurrent() || action.signal.aborted) throw abortError();
        return request(action.signal);
      });
      await raceWithSignal(pending, action.signal);
    } catch (error) {
      if (!isCurrent()) return;
      if (!action.didTimeout() && action.signal.aborted) return;
      onFailure(assignmentFailureMessage(error, action.didTimeout()));
      return;
    }
    // Callback defects are not failed PATCH responses.
    if (isCurrent() && !action.signal.aborted) onSuccess();
  } finally {
    action.clear();
    if (isCurrent()) onSettled();
  }
}
