# KATLAB TrackingMonitor v0.3.1.1 — Fail-Closed Restart

This patch makes the Windows tracker and demo lifecycle scripts confirm stop
and startup instead of treating an occupied port or a launch request as success.

## Changed

- Stop checks the exact configured TCP listener until it clears, and reports
  failure if it cannot prove the port is clear. Restart does not call start
  after a failed stop.
- Start opens the UI only after `/api/health` reports this app version, the
  ordered configured repository IDs, and live watcher tasks. The demo remains pinned
  to its isolated port 8101 and does not touch the production port.
- Deadline-based checks replace console-dependent `timeout.exe` waits. The
  existing hidden backend launch and log paths remain in place.
- The v0.3.1.0 Attribution Forecast and compact warnings disclosure are
  retained; no backend API, schema, frontend source, or Git-status behavior
  changes in this patch.

## Limits

- Stop remains port-based and cannot cryptographically prove process ownership.
  Inspect listener identity before stopping a live instance; a matching health
  response proves readiness at the observation instant, not process identity.
- To change `server.port`, stop the old instance before editing the config,
  then start the new one. Restart uses the *current* configured port only.
- Start rejects an already-running older app version; use Restart to upgrade
  a running instance after confirming listener identity.
- A readiness timeout can leave a child that starts later; inspect its log and
  listener before retrying.
