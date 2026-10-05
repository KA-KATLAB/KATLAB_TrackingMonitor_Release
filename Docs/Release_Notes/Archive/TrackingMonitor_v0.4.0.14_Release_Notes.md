# KATLAB TrackingMonitor v0.4.0.14 - Mission Plan Snapshot Prompts

## Fixed

Now, Verification rail and Evidence queue no longer suggest selecting plan cards
before a Mission snapshot loads, after it fails, or when the accepted scope has
no tracked plans. Each shows the appropriate loading, unavailable or empty
message instead. Existing Mission Refresh/Retry remains the recovery action.

An accepted base summary takes priority over the busy transition; an unavailable
additive Forecast does not discard valid Mission guidance. When plans are
available, selection instructions and selected-plan readiness remain unchanged.

## Scope and verification

Actual-source component, selection, request-owner/API and controlled-boundary
regressions cover loading, failure, timeout, cancellation, recovery, empty scopes
and accepted plan transitions. They are not native visual, keyboard or assistive
technology acceptance. Native v0.4 acceptance remains pending.
No requests, deadlines, API shapes, dependencies, settings, selection policy,
layout, capture or generated-content behavior changed.

The build-only `braces` advisory remains open; no direct patched version is listed
in the [primary advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
A Tailwind major migration is not bundled into this correction. The existing
large-chunk notice and earlier unconfirmed launcher-fixture transient remain
known limits.

Use the [safe upgrade procedure](../../Installation_Guideline.md#safe-stop-and-restart).
CDD/CFT, verification, activation and publication evidence is recorded in
`temp/Plan/PLAN_v0.4.0.14_Mission_Plan_Snapshot_Prompts.txt`.

Previous [v0.4.0.13 notes](TrackingMonitor_v0.4.0.13_Release_Notes.md)
retain their historical scope, with only move-affected links rebased.
