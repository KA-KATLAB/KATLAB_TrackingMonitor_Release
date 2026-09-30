# KATLAB TrackingMonitor v0.3.1.26 — UTC Daily Snapshot Labels

Keep yesterday's cached activity from appearing as today's work.

## Changed

- The existing minute tick invalidates stats once per observed UTC-day change.
  Same-day ticks remain render-only; no extra timer, backend sync or per-minute
  stats polling is added. Existing scoped and unscoped wardrobe consumers retain
  their request ownership and throttling; this is not a single-request guarantee.
- Overview effort, daily goal rings and Focus use the actual supplied UTC day.
  Current data retains its today label; older or clock-skewed snapshots display
  the absolute date. Missing rows show unavailable, while actual zero stays zero.
- Effort KPI animation resets at a new row day; ring crossings never compare
  different or stale days. Daily goal editors and saved targets are preserved.
- Prepared Digest HTML always identifies the effort row's absolute UTC date,
  independently of its existing local report-day event window.

## Verification boundaries

- Refresh is best-effort on an observed day transition, not exact midnight.
  Hidden-tab timers may be delayed. A failed request keeps the dated snapshot
  until an ordinary refresh or later observed day transition.
- Historical records, momentum, Wrapped and reportHtml window wording remain
  unchanged; this is not a guarantee that every snapshot surface is current.
- Controlled actual-source/hook/SSR and HTTP/artifact checks remain separate
  from native browser, assistive-technology, keyboard or live-midnight testing.
  No system-clock changes, fabricated live events or monitored-repo edits.
