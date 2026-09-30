import { useEffect, useState } from "react";
import { startChronicleProbe, type ChronicleState } from "./chronicleProbe";

/** Same-origin reader; host checks stop once the page becomes available. */
export function ChronicleView () {
  const [state, setState] = useState<ChronicleState>("checking");
  useEffect(() => startChronicleProbe(setState), []);
  return <ChronicleBody state={state} />;
}

export function ChronicleBody ({ state }: { state: ChronicleState }) {
  return (
    <section className="flex h-full min-h-0 flex-col" aria-labelledby="chronicle-heading">
      <h2 id="chronicle-heading" data-view-heading tabIndex={-1} className="sr-only">
        Chronicle
      </h2>
      {state === "ready" ? (
        <iframe src="/chronicle/" title="KATLAB Chronicle"
          className="min-h-0 w-full flex-1 rounded-lg border border-slate-800 bg-slate-950" />
      ) : (
        <div role="status" className="rounded-lg border border-slate-800 bg-slate-900/40 p-8 text-sm text-slate-400">
          {state === "checking" ? (
            <p>Checking Chronicle availability...</p>
          ) : state === "missing" ? (
            <>
              <p className="mb-2 text-base text-slate-200">No Chronicle page available yet</p>
              <p>
                Keep the tracker running and check Sys for the Chronicle worker status.
                You can also run <code className="text-slate-300">Scripts/Chronicle/generate.bat</code> once;
                install MkDocs with <code className="text-slate-300">Scripts/Chronicle/install.bat</code> if needed.
              </p>
            </>
          ) : (
            <>
              <p className="mb-2 text-base text-slate-200">Chronicle check unavailable</p>
              <p>The availability check failed or timed out. Check that the tracker is running.</p>
            </>
          )}
          {state !== "checking" && (
            <p className="mt-2 text-slate-500">Retrying automatically in 10 seconds after each failed check.</p>
          )}
        </div>
      )}
    </section>
  );
}
