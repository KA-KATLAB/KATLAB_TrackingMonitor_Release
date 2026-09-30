# KATLAB TrackingMonitor v0.3.1.3 — Health Settings Encoding Recovery

This patch keeps system health and restart readiness available if Claude user
settings contain invalid UTF-8 bytes.

## Changed

- `/api/health` treats a Claude settings decode failure like an unreadable
  settings file: `server.hook_registered` is `false`, while the rest of the
  health response remains available.
- Sys now says "line not verified" when the legacy marker cannot be confirmed,
  instead of incorrectly claiming that the line is missing.
- The API contract and regression tests cover the fail-soft behavior. No new
  package, database migration, Git subprocess, or monitored-repository write
  is introduced.

## Limits

- The hook marker is a text-presence check, not complete provider registration
  validation. Provider configuration remains a separate health fact.
- Sys is a snapshot at open time; live HTTP and automated checks are not a
  browser click test or a guarantee of continued worker availability.
- Restart remains port-based. Check listener identity before stopping a live
  instance, and do not restart if the configured listener cannot be identified.
