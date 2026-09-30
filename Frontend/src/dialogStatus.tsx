import type { ReactNode } from "react";

/** Keep modal feedback outside the inert application background. */
export function DialogStatus ({ children }: { children: ReactNode }): JSX.Element {
  return <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">{children}</p>;
}

export function DialogLoadStatus ({ label, busy, error, count, truncated }: {
  label: "File story" | "Session timeline";
  busy: boolean;
  error: string;
  count: number | null;
  truncated: boolean;
}): JSX.Element {
  const message = busy ? `Loading ${label.toLowerCase()}.`
    : error ? `${error} Retry is available.`
    : count !== null
    ? `${label} loaded: ${count} captured event${count === 1 ? "" : "s"}${truncated ? " in the fetched window" : ""}.`
    : "";
  return <DialogStatus>{message}</DialogStatus>;
}
