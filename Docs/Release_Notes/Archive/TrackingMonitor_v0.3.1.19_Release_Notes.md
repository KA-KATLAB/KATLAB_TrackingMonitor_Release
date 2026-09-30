# KATLAB TrackingMonitor v0.3.1.19 — WebSocket Lifecycle Ownership

Live subscriptions release pending reconnect work when they are cleaned up.

## Changed

- Cancel the owned reconnect timer on cleanup instead of keeping its closure
  until the timer wakes. Keep only one retry and one current socket per
  subscription, with idempotent cleanup and detached event handlers.
- Guard obsolete socket callbacks and saved retry callbacks so they cannot
  invoke consumers, close a replacement or reconnect a disposed subscription.
  Native close is best effort after logical teardown is already complete.
- Preserve same-origin ws/wss, 1/2/4/8/15-second capped retry backoff with reset
  on accepted open, REST resnapshot, 25-second ping and existing message policy.

## Limits

- Saved late/duplicate callback tests are defensive controlled fixtures, not
  evidence of native browsers normally delivering those sequences.
- No new payload validation, heartbeat/pong, connection deadline, offline UI,
  jitter or general constructor/send/error recovery. Cleanup does not prove
  immediate physical disconnection or successful reconnection.
- Native browser/network and UI/keyboard/AT checks remain unrun. Existing
  optional Mermaid chunk advisory and 14 default-branch dependency alerts
  remain outside this scoped change.
