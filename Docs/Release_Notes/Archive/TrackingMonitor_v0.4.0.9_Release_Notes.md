# KATLAB TrackingMonitor v0.4.0.9 - System Upgrade Guidance

## Fixed

System's missing-data warning no longer claims restarting loads matching frontend
and backend code. Missing optional health fields alone do not prove a version
mismatch. The known-mismatch explanation remains separate and does not imply
which version is newer or healthy.

If updating, the guidance names the safe sequence: stop Tracker and demo, rebuild
the UI, restart Tracker, then reload the existing browser tab. It appears once
even when missing-data and mismatch warnings overlap. It does not promise that
an update will restore missing data or trigger any automatic action.

## Scope and verification

This is existing System copy plus actual-component SSR regressions. No layout,
control, request lifecycle, validation, API, settings or dependency changes.
The version badge remains unconditional and identifies this tab's loaded build.
SSR checks content, not browser wrapping, focus or interaction; native v0.4
acceptance remains pending. Existing dependency/chunk notices and the earlier
unconfirmed native launcher-fixture transient are not resolved by this change.

Use the [safe upgrade procedure](../../Installation_Guideline.md#safe-stop-and-restart).
CDD/CFT, verification, live activation and publication evidence is recorded in
`temp/Plan/PLAN_v0.4.0.9_System_Upgrade_Guidance.txt`.

Previous [v0.4.0.8 notes](TrackingMonitor_v0.4.0.8_Release_Notes.md)
retain their historical scope, with only move-affected links rebased.
