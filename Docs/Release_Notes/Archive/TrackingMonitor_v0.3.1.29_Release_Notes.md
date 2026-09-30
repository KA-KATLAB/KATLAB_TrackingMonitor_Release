# KATLAB TrackingMonitor v0.3.1.29 — Report Snapshot Dates

Reports now name the dates their statistics actually describe.

## Changed

- Selected and preceding calendar windows show independent absolute UTC bounds.
  The export's local generation time is separate; retained data is no longer
  called this week or month merely because it was exported now.
- Weekly wrapped names its own supplied dates and appears only in 7-day reports.
  All-time sections and full-window totals, units, rankings and deltas are intact.
- Supplied/requested row coverage is explicit. Missing calendar values are
  Unavailable, partial active days use the supplied denominator, and incomplete
  window pairs do not show deltas or the split comparison sparkline. A complete
  zero-filled calendar still represents measured zero activity.
- Scope-safe filenames and synchronous downloads are unchanged. Export uses the
  accepted snapshot without a new fetch, dependency or backend change.

## Verification boundaries

- Date labels identify supplied rows; they do not certify source freshness or
  validate a new data schema. Generated-local timestamps are not observation dates.
- Actual-module and controlled export checks are not native rendering, keyboard,
  screen-reader or completed-download verification. Live HTTP/artifact checks
  are separate from those native interactions.
