# KATLAB TrackingMonitor v0.3.1.8 — Evidence Assignment Recovery

Evidence assignment failures now remain visible inside the active dialog,
with honest guidance when the server's final write outcome is unconfirmed.

## Changed

- Visible and local polite feedback describe the pending request or failure.
  Closing may not cancel a submitted change; refresh Mission to verify before
  retrying. No automatic retry or claim that a failed response undid a write.
- The existing 10-second deadline releases the current action even when its
  transport never settles. Closing immediately revokes its callback ownership.
- Late responses cannot announce, close or unlock a newer action. Failed
  attempts preserve the selected target; accepted responses refresh and close.
- No assignment payload, API, database, eligibility or dependency changes.

## Limits

- Client cancellation cannot guarantee cancellation of a server-side write.
- Controlled request and SSR tests do not replace real browser, screen-reader,
  keyboard, focus or viewport verification, which remains unrun this session.
