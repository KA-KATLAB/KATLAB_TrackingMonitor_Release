# KATLAB TrackingMonitor v0.3.1.31 — Year Snapshot Labels

The year calendar and personal records identify the dates they actually cover.

## Changed

- Activity calendar and Personal records display supplied UTC date bounds and
  row coverage out of 365, instead of a misleading current-period description.
- Calendar exact-data summaries identify their own period and distinguish
  missing day rows from supplied all-zero data. Existing counts and filtering
  still include capture-only, commit-only and effort-only days.
- The calendar streak badge is explicitly a snapshot streak. Its threshold,
  grace rule and appearance are preserved.
- Record calculations, celebration detection, timers, reduced motion, scope
  keys, wardrobe, calendar modes and exact-data controls remain unchanged.
  No new fetch, dependency, backend behavior or API shape.

## Verification boundaries

- Supplied dates do not certify freshness. Defensive numeric availability for
  empty or short Records input is separate follow-up, not part of this fix.
- Actual-component SSR and source-equivalence checks are not native layout,
  keyboard, focus or assistive-technology evidence. Live HTTP and built-artifact
  verification do not establish those interactions.
