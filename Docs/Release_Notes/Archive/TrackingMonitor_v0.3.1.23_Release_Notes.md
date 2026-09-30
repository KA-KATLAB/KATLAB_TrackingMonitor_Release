# KATLAB TrackingMonitor v0.3.1.23 — Single-Line Commit Drafts

Copy a compact subject even when task titles span multiple lines.

## Changed

- Collapse JavaScript whitespace runs to ASCII spaces and trim the final draft
  text. This includes whitespace inside quoted summary text; original titles
  and non-whitespace Unicode/punctuation are not rewritten.
- Preserve exact repo/ref lookup and deduplication, chronological task parts,
  stale-ref fallback, unattributed counts, KATLAB frame and version placeholders.
  No truncation, length cap, additional fetch or expanded captured-data scope.
- Keep the existing single gesture-bound clipboard write, empty/unavailable/
  failed/copied outcomes, ownership, deadlines and feedback. No new UI surface,
  native action or dependency.

## Verification boundaries

- Multiline plan titles were already valid. This introduces an explicit draft
  formatting policy, not a parser defect fix or a Git message requirement.
- Actual-source composition and mocked clipboard checks verify formatting,
  immutable inputs and invocation timing. Native clipboard/browser, keyboard/AT
  and visual layout checks remain unrun.
- Optional Mermaid chunk size and separate GitHub default-branch alerts remain
  outside this refinement.
