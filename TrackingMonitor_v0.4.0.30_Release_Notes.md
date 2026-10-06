# KATLAB TrackingMonitor v0.4.0.30 - Nonfinite Duration Display

## Fixed

The shared duration formatter displays `Unavailable` for NaN and positive
or negative infinity instead of presenting a bogus approximate duration.
File Story and Session Timeline retain admitted malformed timestamp rows
without rendering their resulting nonfinite effort as `NaNh NaNm`.

One leading formatter guard changes. Every finite output remains intact,
including zero, negatives, fractions and large values. Callers, data admission,
raw timestamps, event ordering, formulas, requests, deadlines, paging, dialog
focus, styles and downloads are unchanged.

## Scope and verification

Controlled tests reproduce the actual complete-dialog summary defect, protect
the original formatter through strict whole-module/function/outside
fingerprints, and compare finite results against the actual original function.
All original tests remain unchanged. Representative System and HTML report
checks protect valid output; invalid direct health/report inputs are explicitly
controlled boundary probes, not evidence of accepted API or live defects.

This is display honesty, not an effort-estimator, timestamp, stats or data
repair. Invalid raw date labels and non-duration values remain outside scope.
Existing caller predicates may suppress a value before formatting; this does
not promise an unavailable label on every malformed surface.

Controlled effects/SSR and live HTTP/assets do not establish native focus,
keyboard, geometry, assistive acceptance or accessibility compliance.
Native v0.4 H.1 remains pending under independent-delivery authority. Earlier
launcher fixture limits and the unused synthetic runtime row remain separate.
No cleanup or browser bypass is authorized.

The build-only `braces` issue remains open in the
[primary advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
No dependency migration or chunk-notice suppression.

Use the [safe upgrade procedure](Docs/Installation_Guideline.md#safe-stop-and-restart).
Rebuild after version changes; restarting Python alone leaves old UI assets.
Evidence and publication details are recorded separately in
`temp/Plan/PLAN_v0.4.0.30_Nonfinite_Duration_Display.txt`.

Previous [v0.4.0.29 notes](Docs/Release_Notes/Archive/TrackingMonitor_v0.4.0.29_Release_Notes.md)
retain their historical content with only two move-affected links rebased.
