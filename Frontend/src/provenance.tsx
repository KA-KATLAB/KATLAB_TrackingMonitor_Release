// v0.2.11.0 D6 (A.3): the provenance ledger — what share of committed
// file changes carries captured Claude events. The industry estimates this
// number from commit metadata; the tracker COMPOSES it from ground truth,
// so the card's job is to stay honest about what it is measuring: file
// changes per commit, never lines of code (D7).
// PURE presentational — no state, no timers, derives at render. The
// percentage rule lives in the exported pctOf so it stays testable without
// a DOM, and because 100/0 must be reserved for the exact cases (D6b).

import { StatsData } from "./charts";

const TEAL = "#14b8a6"; // the DIAGRAM palette — never MODE_COLOR
const fmt = (n: number) => n.toLocaleString("en-US");

// NEVER A FALSE ABSOLUTE: 396/397 must not print "100%" while a
// human-touched file exists, and 1/400 must not print "0%" while Claude
// did touch something — the shipped flowState "never 0m" shape.
export function pctOf (ai: number, total: number): number {
  if (total <= 0) return 0;   // callers gate on the hide law; defensive
  if (ai >= total) return 100;
  if (ai <= 0) return 0;
  return Math.min(99, Math.max(1, Math.round((ai / total) * 100)));
}

export function ProvenanceCard ({ provenance, scope, onOpenFileStory }: {
  provenance: StatsData["provenance"];
  scope: string | undefined; // undefined = ALL (stats arrive server-scoped)
  onOpenFileStory?: (repo: string, file: string) => void;
}) {
  const { commits_observed, commits_pre, slots_total, slots_ai, top_files } = provenance;
  // Hide law: slots_total === 0 covers every scope-level zero (no observed
  // commits, all files plan-excluded, all-merge) AND the divide-by-zero.
  if (slots_total === 0) return null;
  return (
    <div data-reveal className="mt-4 rounded border border-slate-700 bg-slate-900 p-3">
      <div className="mb-2 text-xs font-semibold text-slate-300">
        Provenance — {scope ?? "ALL repos"}
      </div>
      <div className="flex items-baseline gap-2"
        title="share of committed file changes (per commit, per file) that carry captured Claude events — since tracking began; not a lines-of-code measure">
        <span className="font-mono text-4xl font-bold leading-none text-slate-100">
          {pctOf(slots_ai, slots_total)}%
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          AI-touched file changes
        </span>
      </div>
      {/* the bar keeps the UNCLAMPED ratio — geometry is not a claim —
          but rounded to one decimal so the DOM never carries float noise */}
      <div className="mt-1.5 h-1 rounded bg-slate-700">
        <div className="h-1 rounded"
          style={{ width: `${((slots_ai / slots_total) * 100).toFixed(1)}%`,
            backgroundColor: TEAL }} />
      </div>
      <p className="mt-1.5 text-[11px] text-slate-400">
        {`${fmt(slots_ai)}/${fmt(slots_total)} file changes` +
         ` · ${fmt(commits_observed)} commit` +
         `${commits_observed === 1 ? "" : "s"} since tracking began` +
         (commits_pre > 0 ? ` · ${fmt(commits_pre)} earlier excluded` : "")}
      </p>
      <div className="mt-2 space-y-1 text-xs">
        {top_files.map((row) => (
          <div key={`${row.repo}|${row.file}`} className="flex items-center gap-2">
            {/* ALL scope shows the repo: both monitored repos hold files
                with identical basenames (Version_Notes.md) */}
            {scope === undefined && (
              <span className="shrink-0 text-[10px] text-slate-500">{row.repo}</span>
            )}
            <button onClick={() => onOpenFileStory?.(row.repo, row.file)}
              title={`${row.file} — open file story`}
              className="min-w-0 truncate font-mono text-left hover:text-sky-300 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">
              {row.file.split("/").pop()}
            </button>
            <span className="ml-auto h-1 w-16 shrink-0 rounded bg-slate-700">
              <span className="block h-1 rounded"
                style={{ width: `${((row.ai_commits / row.commits) * 100).toFixed(1)}%`,
                  backgroundColor: TEAL }} />
            </span>
            <span className="shrink-0 text-[10px] text-slate-400">
              {row.ai_commits}/{row.commits}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
