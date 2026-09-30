# KATLAB TrackingMonitor v0.3.1.4 — Chronicle Probe Recovery

Chronicle's host no longer removes an opened reader because a delayed or
temporary availability check fails.

## Changed

- Checks are sequential, have a 10-second deadline, and retry 10 seconds after
  failure. Cleanup aborts pending work; late results are ignored.
- Host polling stops after the first successful check. The generated page
  keeps its existing navigation and freshness behavior.
- The fallback distinguishes no page (404) from an unavailable check, and no
  longer promises that every Chronicle will build within a minute.
- Stable section naming, iframe sizing and focus boundaries are preserved.
  No dependency, API, database or monitored-repository changes are introduced.

## Limits

- Page availability is not worker health or a freshness guarantee. Re-entering
  the view checks again. The existing HEAD-to-iframe-GET promotion window is
  unchanged; generated content can still refresh itself.
- Deterministic tests, build, SSR and HTTP checks do not constitute an actual
  browser interaction, viewport or iframe focus/scroll test.
