# KATLAB TrackingMonitor v0.3.1.10 — Digest Day Window

Daily Digest now keeps captured events and report labels inside one local day,
even when preparation crosses midnight or ingestion order differs from time.

## Changed

- Every event page uses the same inclusive-start/exclusive-end day bounds.
  Calendar-midnight construction respects DST; six-digit UTC-Z bounds preserve
  exact-midnight events under the existing timestamp query.
- Old, future-day and invalid returned timestamps are excluded without ending
  the scan early. The existing three-page fetch limit remains unchanged.
- The report date, filename, event KPIs and empty state refer to the captured
  report day. Generated-at is completion time; current UTC effort stays separate.
- A full third page says "More may exist", using the accepted captured count.
  Exactly 1,500 matches no longer imply unseen additional events.
- Aborted/failed preparation cannot return a partial Blob. The existing
  scope-bound prepare/second-click-download flow and 50-row pager are preserved.

## Limits

- Capture and offset paging do not guarantee complete or snapshot-consistent
  history. Legacy malformed/non-UTC timestamps are not repaired.
- Controlled Blob, timezone and isolated API checks are not real-browser,
  download-click, keyboard, screen-reader or viewport verification.
- No dependencies, API shapes, database schema or monitored repositories change.
