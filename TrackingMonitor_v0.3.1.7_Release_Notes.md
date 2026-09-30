# KATLAB TrackingMonitor v0.3.1.7 — Dialog Load Announcements

File Story and Session Timeline now provide load and retry feedback within
their active dialogs, outside the inert application background.

## Changed

- Stable polite status regions describe loading, failure/retry and accepted
  captured-row counts, including empty results and truncated fetched windows.
- Loading takes precedence during a retry, so old data is not announced as a
  newly completed result. Existing visible errors and Retry controls remain.
- Health uses the same small status primitive with its existing messages.
- No fetching, focus, overlay, API, storage, dependency or database change.

## Limits

- Captured-row counts are not a guarantee of complete repository history.
- SSR checks text and semantics; actual screen-reader, keyboard, focus and
  viewport behavior has not been exercised by a browser runner in this session.
