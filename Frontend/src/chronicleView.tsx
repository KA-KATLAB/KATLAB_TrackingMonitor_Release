import { useEffect, useState } from "react";
import { startChronicleProbe, type ChronicleState } from "./chronicleProbe";
import { SectionHeading } from "./ui";

/** Same-origin reader; host checks stop once the page becomes available. */
export function ChronicleView () {
  const [state, setState] = useState<ChronicleState>("checking");
  useEffect(() => startChronicleProbe(setState), []);
  return <ChronicleBody state={state} />;
}

export function ChronicleBody ({ state }: { state: ChronicleState }) {
  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col" aria-labelledby="chronicle-heading">
      <SectionHeading title="Chronicle" headingId="chronicle-heading" kind="page"
        headingProps={{ "data-view-heading": true, tabIndex: -1 }}
        description="Read the generated workspace story, plans, and captured activity."
        className="shrink-0"
        actions={
          <a href="/chronicle/" target="_blank" rel="noopener noreferrer"
            className="ui-control bg-ui-surface text-sky-300">
            Open in new tab
          </a>
        } />
      {state === "ready" ? (
        <iframe src="/chronicle/" title="KATLAB Chronicle"
          className="min-h-0 w-full flex-1 rounded-panel border border-ui-border bg-ui-canvas" />
      ) : (
        <div role="status" className="ui-empty-state leading-relaxed">
          {state === "checking" ? (
            <p>Checking Chronicle availability...</p>
          ) : state === "missing" ? (
            <>
              <p className="mb-2 text-base font-semibold text-ui-text">No Chronicle page available yet</p>
              <p>
                Keep the tracker running and check System for the Chronicle worker status.
                You can also run <code className="break-all text-ui-text">Scripts/Chronicle/generate.bat</code> once;
                install MkDocs with <code className="break-all text-ui-text">Scripts/Chronicle/install.bat</code> if needed.
              </p>
            </>
          ) : (
            <>
              <p className="mb-2 text-base font-semibold text-ui-text">Chronicle check unavailable</p>
              <p>The availability check failed or timed out. Check that the tracker is running.</p>
            </>
          )}
          {state !== "checking" && (
            <p className="mt-3 text-sm text-ui-muted">Retrying automatically in 10 seconds after each failed check.</p>
          )}
        </div>
      )}
    </section>
  );
}
