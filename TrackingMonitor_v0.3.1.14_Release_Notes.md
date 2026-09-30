# KATLAB TrackingMonitor v0.3.1.14 — Notification Opt-In Recovery

OS-alert opt-in no longer leaves the page busy indefinitely when a browser
permission prompt does not settle.

## Changed

- One App-owned 10-second deadline bounds observation of an opt-in request
  across the existing palette, More and footer controls. The native permission
  request still starts synchronously in the user gesture.
- A generation fence prevents a late result from an older prompt from
  overwriting a newer application choice. Timeout keeps application alerts off
  for this page, even if the browser later grants permission.
- On a current timeout, the app attempts and verifies persisted off. If
  storage blocks that write, visible guidance warns that an older saved opt-in
  may return after reload. Complete or dismiss the browser prompt, then
  explicitly retry to opt in.
- Existing background-only delivery, default-off behavior, storage key and
  controls remain unchanged. There is no automatic retry.

## Limits

- The deadline cannot cancel a native browser prompt or revoke browser/OS
  permission. A later browser grant is not application opt-in.
- Controlled tests and static checks do not replace actual browser prompt,
  OS alert, keyboard, viewport or assistive-technology verification.
