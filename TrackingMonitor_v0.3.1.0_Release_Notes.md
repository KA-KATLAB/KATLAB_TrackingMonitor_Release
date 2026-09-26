# KATLAB TrackingMonitor v0.3.1.0 — Attribution Forecast

Mission now previews how currently dirty files would be attributed, without
creating assignments or changing repository state. The preview is a projection,
not a guarantee that a future event or commit will receive the same attribution.

## Changed

- Mission adds a read-only Attribution Forecast after Plan scope. It summarizes
  the existing resolver's `B`, `A_SCOPED`, `A_GLOBAL`, `AMBIGUOUS`, and `UNKNOWN`
  outcomes, then shows locally paged dirty-path rows and bounded ambiguous
  candidate references. No manual-pick control is added to Forecast.
- The backend captures status and plan context for each projection, validates
  input before matching, and returns an explicit unavailable reason when a
  stable, bounded forecast cannot be made. It does not write Forecast results.
- Literal plan-file patterns use an exact-match fast path in Forecast. Wildcard
  patterns retain deterministic bounded matching. Existing event attribution
  remains unchanged.
- Windows start and restart scripts launch the tracker or demo through a hidden
  `pythonw` helper and retain visible setup errors. Tracker output goes to
  `data/logs/tracker.log`; demo output goes to `Demo/runtime/demo.log`.
  A successful launch request is not a server-readiness check.
- Chronicle tests now cover the strict offline documentation universe more
  directly. Forecast adds no schema migration, hook change, Git command, or
  WebSocket event.

## Known limits

- Forecast admits at most four repositories per workspace request and uses
  cumulative path, resolver, matcher-work, and response-size budgets. The
  10-million-work-unit matcher limit remains. Wildcard-heavy or otherwise
  over-budget input can return `unavailable/too_much_work` with no partial rows.
- An earlier live dirty-repository smoke confirmed the bounded-unavailable
  response, not a ready attribution preview. Later live reads found the two
  configured repositories clean and returned ready rows with zero paths. Those
  observations do not verify nonempty real-repository attribution after the
  literal fast path.
- Actual-browser zoom, complete keyboard/focus flow, coarse-pointer targets,
  safe-area/rotation, reduced-motion switching, contrast, Retry activation,
  and nonempty real-repository ready-state behavior have not been manually
  verified. Synthetic and automated checks are recorded separately in the
  detailed plan and must not be treated as substitutes for these checks.
