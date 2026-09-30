# KATLAB TrackingMonitor v0.3.1.6 — System Health Refresh

Refresh Sys without closing the dialog, while keeping the previous diagnostic
response visible if the next check is pending or fails.

## Changed

- A stable Refresh/Retry action prevents duplicate requests and exposes its
  pending state. Close, Escape and backdrop behavior are unchanged.
- The accepted response shows its local receipt time. Failed refreshes do not
  advance that time or the snapshot's displayed uptime.
- Explicit retained-response text distinguishes old data from a new result.
  A polite status region inside the dialog announces changes accessibly.
- Health requests bypass browser cache and retain the 10-second deadline.
  Timeout settles independently of transport; late results cannot overwrite
  a newer request or update a closed dialog.
- No polling, dependency, storage key, backend API or database change.

## Limits

- This is manual refresh, not a live health stream. Browser receipt time is
  not a server observation timestamp or proof of continuing worker health.
- Automated lifecycle/SSR tests and HTTP smoke checks are not real-browser
  keyboard, screen-reader, focus, zoom or viewport interaction verification.
