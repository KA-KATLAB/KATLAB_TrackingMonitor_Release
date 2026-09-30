# KATLAB TrackingMonitor v0.3.1.22 — Preabort Promise Observation

Harden the shared asynchronous observation helper's already-canceled path.

## Fixed

- `raceWithSignal` observes a supplied promise's rejection even when the signal
  is already aborted. It still immediately returns the existing AbortError;
  a supplied stage that later fails no longer produces an orphan rejection.
- No-signal promise identity, active-signal results and listener behavior,
  caller-owned cancellation feedback and current UI flows remain unchanged.
  There is no timer, retry, native action, global error filter or new dependency.

## Verification boundaries

- The helper defect was reproduced with actual source in isolated Node checks.
  Strict unhandled-rejection subprocess tests and settlement/listener fixtures
  verify its bounded contract, not native browser/UI behavior.
- Existing callers generally guard preabort; no ordinary UI crash or browser
  reproduction was found. This fix does not cancel an unabortable native stage
  or handle the returned observer rejection on behalf of its caller.
- Browser/keyboard/AT, real audio, notifications and clipboard checks remain
  unrun. Optional Mermaid chunk size and separate GitHub default-branch alerts
  remain outside this patch.
