# KATLAB TrackingMonitor v0.4.0.10 - Lazy Failure Focus Ownership

## Fixed

A retired lazy-view error boundary could run its queued focus callback against
another view's failure element because it looked up a shared global ID. The
boundary now owns its section and animation-frame token, revoking pending work
on replacement and unmount before canceling the native frame.

Only the current owned, connected, non-inert node may receive this focus handoff,
and an active overlay suppresses it. Blocked work is consumed rather than retried
after a dialog closes. Error panels, their IDs and labels, explicit Reload,
lazy-load deadlines and route-focus coordination are unchanged.

## Scope and verification

Actual-class controlled lifecycle and SSR regressions cover stale callbacks,
zero/reused frame handles, overlay/inert/disconnected targets and normal recovery.
They verify callback behavior and markup, not native focus transfer or appearance.
Native v0.4 acceptance remains pending. There are no new dependencies, controls,
automatic reloads, layout, API or configuration changes. Existing dependency/chunk
notices and the earlier unconfirmed launcher-fixture transient are unchanged.

Use the [safe upgrade procedure](Docs/Installation_Guideline.md#safe-stop-and-restart).
CDD/CFT, verification, activation and publication evidence is recorded in
`temp/Plan/PLAN_v0.4.0.10_Lazy_Failure_Focus_Ownership.txt`.

Previous [v0.4.0.9 notes](Docs/Release_Notes/Archive/TrackingMonitor_v0.4.0.9_Release_Notes.md)
retain their historical scope, with only move-affected links rebased.
