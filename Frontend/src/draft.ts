// v0.2.9.0 D2/D3 (A.1, R-BL): the commit-draft module — the THIRD
// moat inversion (the Chronicle beat git-cliff, the Scribe beat the
// devlog tools, this beats the aicommits class): the tracker KNOWS
// the why, so the draft composes from ATTRIBUTION — deterministic,
// instant, zero-AI, zero-API. The draft NEVER executes anything (the
// house git law is untouchable by construction) — clipboard only,
// forever. RV2: the input is the pool App already holds (F38-capped
// at one page — the draft reads what the UI reads, one truth one cap).

import type { Task, TrackedEvent } from "./api";

// The frame's version slots — the literal placeholder can never match
// the Scribe/fireworks RELEASE_RX (X is not a digit); versioning is
// the USER'S call, both slots left to them (the probed house shape).
const VER = "vX.Y.Z.W";

export function buildCommitDraft (repoId: string, events: TrackedEvent[],
  tasks: Task[]): string {
  // RV5: the pool arrives id-DESC — ascending sort restores the
  // first-touch chronology (the mission-arc order: the first-started
  // mission leads, riders follow — the house subject style).
  const mine = events.filter((e) => e.repo_id === repoId)
    .sort((a, b) => a.id - b.id);
  if (mine.length === 0) return ""; // a draft of nothing is nothing
  // RV7: the compound (repoId, task_ref) lookup — a same-named ref in
  // ANOTHER repo must never match (the generate.py group_reasons law).
  const byRef = new Map<string, Task>();
  for (const t of tasks) if (t.repo === repoId) byRef.set(t.task_ref, t);
  const seen = new Set<string>();
  const parts: string[] = [];
  let unattributed = 0;
  for (const e of mine) {
    const ref = e.task_ref;
    if (ref === null) { unattributed += 1; continue; }
    if (seen.has(ref)) continue;
    seen.add(ref);
    parts.push(byRef.get(ref)?.title ?? ref); // joined title | stale bare ref
  }
  // "+N unattributed" HONESTY — the draft never hides what it cannot
  // attribute; filter(Boolean) keeps an all-unattributed pool tidy.
  const suffix = unattributed > 0 ? `(+${unattributed} unattributed)` : "";
  const summary = [parts.join(" + "), suffix].filter(Boolean).join(" ");
  const tag = repoId.replace(/_Dev$/, ""); // probed: EA_Dev->EA; verbatim fallback
  return `KATLAB ${tag}: ${VER} - ${summary} - ${VER}`;
}

/** D3/RV10: feature-detected clipboard — node/absent/denied resolves
 *  FALSE, never throws (the caller shows the inline failure note; the
 *  button click is the required user gesture). */
export async function copyCommitDraft (repoId: string,
  events: TrackedEvent[], tasks: Task[]): Promise<boolean> {
  const draft = buildCommitDraft(repoId, events, tasks);
  if (draft === "") return false;
  if (typeof navigator === "undefined" || !navigator.clipboard) return false;
  try {
    await navigator.clipboard.writeText(draft);
    return true;
  } catch {
    return false;
  }
}
