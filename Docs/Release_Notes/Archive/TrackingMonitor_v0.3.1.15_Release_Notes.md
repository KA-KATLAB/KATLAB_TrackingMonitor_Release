# KATLAB TrackingMonitor v0.3.1.15 — Sound Toggle Recovery

Explicit sound toggles recover when native audio activation does not settle.

## Changed

- One App-owned 10-second deadline bounds observation of explicit activation
  across the existing footer, More and palette controls. Audio activation
  still starts synchronously from the user's gesture after verified opt-in.
- Timeout keeps sounds off for this page and reports whether off was saved.
  If saving fails, an older opt-in may return after reload. Retry explicitly;
  late activation cannot publish a context or play a confirmation.
- Each explicit choice retires the previous context with best-effort output
  disconnection and nonblocking close. A fresh enable uses a separate context,
  so older native work cannot suspend or close the new one.
- Initial saved-on gesture listeners are superseded by any accepted explicit
  choice, including a still-pending enable. Default off, storage key, sounds,
  rate limiting and background delivery remain unchanged.

## Limits

- Retirement does not guarantee native resources are released or physical
  output has stopped. Browser resource limits can prevent a retry; there is no
  automatic retry or hard real-time guarantee beyond event-loop scheduling.
- Saved-on first-gesture background activation has no foreground deadline.
  A background failure can leave the displayed choice stale until an explicit
  action or remount. Cross-tab preference synchronization is unchanged.
- Controlled audio mocks and static checks are not actual browser audio,
  autoplay, keyboard, viewport or assistive-technology verification.
