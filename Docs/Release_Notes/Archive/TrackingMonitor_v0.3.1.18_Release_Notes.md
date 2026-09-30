# KATLAB TrackingMonitor v0.3.1.18 — Live Audio Failure Isolation

Optional audio failures no longer interrupt core live-event processing.

## Changed

- Tick, chime and fanfare catch playback/setup failures, stop the remaining cue
  and return to their caller. Current failures turn sound off for this page,
  retire output/context best effort and show existing recovery feedback.
- Failed off saving retains the warning that an older opt-in may return after
  reload. Recovery text covers activation or playback; retry is explicit.
- Explicit enable keeps a private throwing confirmation path so confirmation
  failure cannot masquerade as successful opt-in. Owned rollback and final
  result checks preserve newer choices and cancellation during confirmation.
- Cue content, default off, rate/drop limits, visibility independence and
  non-running-context no-op behavior remain unchanged.

## Limits

- No general WebSocket callback-error or frame-validation redesign. Tests use
  actual modules with controlled native/socket/timer fixtures, not real audio.
- Already-started native work may have occurred; cleanup is best effort, not
  proof of physical silence or resource release. Silent external context drift
  and unbounded background first-gesture activation remain unchanged.
- Real browser audio/autoplay, keyboard/viewport/AT checks remain unrun.
  Existing optional Mermaid chunk advisory and 14 default-branch Dependabot
  alerts remain unresolved by this scoped change.
