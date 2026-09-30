# KATLAB TrackingMonitor v0.3.1.9 — Event Window Accuracy

File Story and Session Timeline no longer assert that unseen events exist
merely because their fetched window reached 1,500 rows.

## Changed

- A shared visible note and local status say "More may exist" when the fetch
  cap is reached, using the actual accepted captured-row count.
- Exactly 1,500 matches and a larger matching set produce equally cautious
  feedback. Private state now describes a reached limit, not proven truncation.
- The existing three-by-500 fetch bound, filters, sorting, 50-row rendering
  pager, retry/close behavior, API and database remain unchanged.

## Limits

- Captured rows are not a guarantee of complete or snapshot-consistent history.
- Isolated API boundary and SSR checks do not replace real browser, keyboard,
  screen-reader or viewport verification, which remains unrun this session.
