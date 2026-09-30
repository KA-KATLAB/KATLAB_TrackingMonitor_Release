# KATLAB TrackingMonitor v0.3.1.11 — Day Lanes Window Accuracy

Day Lanes now keeps selected-day events inside precise local-day bounds and
orders accepted rows numerically for replay.

## Changed

- Day Lanes and Digest share calendar-day bounds with six-digit UTC-Z precision.
  Invalid or nonexistent selected dates fail before any event request.
- Day Lanes filters old, future and invalid returned timestamps, sorts by
  timestamp milliseconds then ID, and keeps the existing three-by-500 fetch.
- A full final raw page shows the shared fetched-window notice with the actual
  accepted count. It no longer claims to know that more or newer events exist.
- Day navigation shifts calendar labels without getting stuck on a skipped
  local date; unavailable calendar-boundary arrows are disabled.
- API/database shapes, ownership, retry, replay coordination and the 50-row
  exact-data pager remain unchanged.

## Limits

- DST-safe query bounds do not fix Day Lanes' existing 24-hour sparse axis and
  replay assumption; late events on a 25-hour day may plot outside the lane or
  remain unreachable by replay. This needs a separate coordinated change.
- Captured/offset-paged rows are not complete or snapshot-consistent history.
  Controlled API/SSR/static checks do not replace browser, keyboard, viewport
  or assistive-technology verification.
