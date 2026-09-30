# KATLAB TrackingMonitor v0.3.1.27 — Button Busy Semantics

Keep the busy metadata already declared by asynchronous action controls.

## Changed

- Shared `ControlButton` and `IconButton` preserve native `aria-busy`, including
  boolean/string false and omission. App Digest, Report, notification and sound
  actions, plus Overview Report, retain their declared busy state.
- Shorthand `busy=true` still takes precedence and disables the button. Native
  `aria-busy` alone does not disable it. Labels, handlers, refs, button types,
  visual styles, existing disabled states and action deadlines stay unchanged.
- No new live region, dependency, request, timer or backend behavior.

## Verification boundaries

- Actual-component SSR and prop checks cover emitted attributes and forwarding,
  including the real Overview Report caller. They do not establish native
  keyboard activation, focus behavior or a particular screen-reader announcement.
- Live HTTP and built-asset checks remain separate from native interaction tests.
