import { draftCopyMessage } from "./draftRequest";
import type { DraftCopyResult } from "./draftRequest";

/** Visible feedback shares the App announcer; it must not announce a second time. */
export function DraftFeedback ({ repo, result, onDismiss }: {
  repo: string;
  result: DraftCopyResult;
  onDismiss: () => void;
}): JSX.Element {
  return (
    <div className={`mt-2 flex min-w-0 flex-wrap items-start gap-3 text-sm ${
      result === "copied" ? "text-emerald-300" : "text-ui-warning"}`}>
      <p
        role={result === "copied" ? undefined : "region"}
        aria-label={result === "copied" ? undefined : "Commit draft result details"}
        tabIndex={result === "copied" ? undefined : 0}
        className={`min-w-0 flex-1 break-words [overflow-wrap:anywhere] ${
          result === "copied" ? "line-clamp-2" : "max-h-[min(8rem,25dvh)] overflow-y-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500"}`}>
        {draftCopyMessage(repo, result)}
      </p>
      {result !== "copied" && (
        <button type="button" onClick={onDismiss} className="ui-control shrink-0"
          aria-label="Dismiss commit draft feedback">Dismiss</button>
      )}
    </div>
  );
}
