import type { ReactNode } from "react";

/** Keep modal feedback outside the inert application background. */
export function DialogStatus ({ children }: { children: ReactNode }): JSX.Element {
  return <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">{children}</p>;
}

export function DialogLoadStatus ({ label, busy, error, count, limitReached }: {
  label: "File story" | "Session timeline";
  busy: boolean;
  error: string;
  count: number | null;
  limitReached: boolean;
}): JSX.Element {
  const message = busy ? `Loading ${label.toLowerCase()}.`
    : error ? `${error} Retry is available.`
    : count !== null
    ? `${label} loaded: ${count} captured event${count === 1 ? "" : "s"}${limitReached ? " in the fetched window. More may exist." : "."}`
    : "";
  return <DialogStatus>{message}</DialogStatus>;
}

/** A full final page proves a fetch cap, not that unseen matching rows exist. */
export function EventWindowNotice ({ limitReached, count }: {
  limitReached: boolean;
  count: number;
}): JSX.Element | null {
  if (!limitReached) return null;
  return (
    <p className="mt-3 break-words text-xs text-amber-300">
      Fetched-window limit reached: showing {count.toLocaleString("en-US")} captured events. More may exist.
    </p>
  );
}
