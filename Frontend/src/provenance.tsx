// Linked capture evidence over observed committed file changes, never authorship
// or lines of code. Pure presentation; stats are already server-scoped.

import type { StatsData } from "./charts";
import { SectionHeading, Surface } from "./ui";
import "./provenanceEvidenceDesk.css";

const TEAL = "#14b8a6"; // the DIAGRAM palette — never MODE_COLOR
const fmt = (n: number) => n.toLocaleString("en-US");

// Keep 0/100 for exact captured-slot cases; intermediate ratios round within 1..99.
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
    <Surface data-reveal tone="quiet" data-provenance-evidence="true">
      <SectionHeading level={4} title="Provenance"
        description={scope ?? "All repos"} />
      <div className="provenance-evidence-layout">
        <div>
          <p className="provenance-evidence-label">AI-touched file changes</p>
          <div className="provenance-evidence-value"
            title="share of committed file changes (per commit, per file) with linked captured AI edit events; since tracking began, not a lines-of-code measure">
            {pctOf(slots_ai, slots_total)}%
          </div>
          {/* The bar retains the exact ratio, rounded to one decimal. */}
          <div className="mt-3 h-1 rounded bg-slate-700" aria-hidden="true">
            <div className="h-1 rounded"
              style={{ width: `${((slots_ai / slots_total) * 100).toFixed(1)}%`,
                backgroundColor: TEAL }} />
          </div>
          <p className="provenance-evidence-copy">
            {`${fmt(slots_ai)}/${fmt(slots_total)} file changes` +
             ` · ${fmt(commits_observed)} commit` +
             `${commits_observed === 1 ? "" : "s"} since tracking began` +
             (commits_pre > 0 ? ` · ${fmt(commits_pre)} earlier excluded` : "")}
          </p>
          <p className="provenance-evidence-copy">
            Linked captured edit evidence, not AI authorship or lines of code.
            Unlinked changes do not prove human-only work.
          </p>
        </div>
        <div>
          <p className="provenance-evidence-label">Most frequently committed files</p>
          <p className="provenance-evidence-copy">
            Observed commits per file; linked captures shown separately.
            {onOpenFileStory ? " Open a path to inspect its File Story." : ""}
          </p>
          {top_files.length === 0 ? (
            <p className="provenance-evidence-copy">No ranked file rows in this snapshot.</p>
          ) : (
            <ol className="provenance-evidence-files"
              aria-label="Most frequently committed files since tracking began">
              {top_files.map((row) => (
                <li key={JSON.stringify([row.repo, row.file])}>
                  {onOpenFileStory ? (
                    <button type="button" onClick={() => onOpenFileStory(row.repo, row.file)}
                      aria-label={`${row.repo}: ${row.file} — open file story`}
                      title={`${row.repo}: ${row.file} — open file story`}
                      className="ui-control provenance-evidence-file">
                      {row.file}
                    </button>
                  ) : (
                    <span className="provenance-evidence-file">{row.file}</span>
                  )}
                  <div className="provenance-evidence-row-meta">
                    {scope === undefined && <span>{row.repo}</span>}
                    <span className="h-1 w-16 shrink-0 rounded bg-slate-700" aria-hidden="true">
                      <span className="block h-1 rounded"
                        style={{ width: `${((row.ai_commits / row.commits) * 100).toFixed(1)}%`,
                          backgroundColor: TEAL }} />
                    </span>
                    <span>{row.ai_commits}/{row.commits} linked commits</span>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </Surface>
  );
}
