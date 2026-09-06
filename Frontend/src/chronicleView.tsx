import { useEffect, useState } from "react";

/** PLAN v0.2.6.0 C.1 (R-BB): the Chronicle as the 5th top-level view —
 * a SAME-ORIGIN iframe of /chronicle/ (served by the tracker itself,
 * R-BA). The mount probe picks iframe vs the honest not-built card;
 * RV25c: the card RE-PROBES every ~10s so the RV14 cold-start flow
 * completes itself (the card flips to the iframe the moment the loop's
 * first build lands — no manual view switch). RV31 (documented): while
 * the iframe holds focus the app's shortcuts pause — standard iframe
 * boundary, parent chrome restores them. */
export function ChronicleView () {
  const [ok, setOk] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    const probe = () => {
      fetch("/chronicle/", { method: "HEAD", cache: "no-store" })
        .then((r) => { if (alive) setOk(r.ok); })
        .catch(() => { if (alive) setOk(false); });
    };
    probe();
    const timer = window.setInterval(probe, 10_000); // RV25c
    return () => { alive = false; window.clearInterval(timer); };
  }, []);

  if (ok === null) {
    return (
      <section className="flex min-h-96 flex-col" aria-labelledby="chronicle-heading">
        <h2 id="chronicle-heading" data-view-heading tabIndex={-1} className="sr-only">
          Chronicle
        </h2>
        <div className="p-8 text-sm text-slate-500">checking the Chronicle…</div>
      </section>
    );
  }
  if (!ok) {
    return (
      <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-8 text-sm text-slate-400">
        <h2 data-view-heading tabIndex={-1} className="sr-only">Chronicle</h2>
        <div className="mb-2 text-base text-slate-200">📖 Chronicle not built yet</div>
        <p>
          Keep the tracker running — its loop builds the site within a minute
          (or run <code className="text-slate-300">Scripts/Chronicle/generate.bat</code> once;
          MkDocs comes from <code className="text-slate-300">Scripts/Chronicle/install.bat</code>).
        </p>
        <p className="mt-1 text-slate-500">This card checks again every 10 seconds.</p>
      </section>
    );
  }
  return (
    <section className="flex h-full min-h-0 flex-col" aria-labelledby="chronicle-heading">
      <h2 id="chronicle-heading" data-view-heading tabIndex={-1} className="sr-only">
        Chronicle
      </h2>
      <iframe src="/chronicle/" title="KATLAB Chronicle"
        className="min-h-0 w-full flex-1 rounded-lg border border-slate-800 bg-slate-950" />
    </section>
  );
}
