import { raceWithSignal } from "./api";
import type { ActionDeadline } from "./api";
import type { DraftCopyOutcome } from "./draft";

export type DraftCopyResult = DraftCopyOutcome | "timed-out";

export function draftCopyMessage (repo: string, result: DraftCopyResult): string {
  const prefix = `Commit draft for ${repo}: `;
  switch (result) {
    case "copied": return `Commit draft copied for ${repo}.`;
    case "empty": return `${prefix}no captured uncommitted events in the current fetched window. Nothing was copied.`;
    case "unavailable": return `${prefix}clipboard access is unavailable in this browser/context. Check browser support and secure-context settings.`;
    case "failed": return `${prefix}copy could not be confirmed. Check browser permissions and your clipboard before retrying.`;
    case "timed-out": return `${prefix}copy was not confirmed within 10 seconds. The browser may still finish. Check your clipboard before retrying.`;
  }
}

/** Bound UI observation, not the unabortable native clipboard write. */
export async function runDraftCopy ({ action, copy, isCurrent, onResult, onSettled }: {
  action: ActionDeadline;
  copy: () => Promise<DraftCopyOutcome>;
  isCurrent: () => boolean;
  onResult: (result: DraftCopyResult) => void;
  onSettled: () => void;
}): Promise<void> {
  try {
    if (!isCurrent() || action.signal.aborted) return;
    let resolveCopy!: (value: DraftCopyOutcome | PromiseLike<DraftCopyOutcome>) => void;
    let rejectCopy!: (error: unknown) => void;
    const pending = new Promise<DraftCopyOutcome>((resolve, reject) => {
      resolveCopy = resolve;
      rejectCopy = reject;
    });
    // Attach handlers first, but do not move the native call to a later microtask.
    const observed = raceWithSignal(pending, action.signal);
    try { resolveCopy(copy()); } catch (error) { rejectCopy(error); }
    let result: DraftCopyResult;
    try {
      result = await observed;
    } catch {
      if (!isCurrent() || (action.signal.aborted && !action.didTimeout())) return;
      result = action.didTimeout() ? "timed-out" : "failed";
    }
    // Callback errors are not clipboard failures; late native results stay ignored.
    if (isCurrent() && (!action.signal.aborted || action.didTimeout())) onResult(result);
  } finally {
    action.clear();
    if (isCurrent()) onSettled();
  }
}
