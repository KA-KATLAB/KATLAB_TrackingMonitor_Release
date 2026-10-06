# KATLAB TrackingMonitor v0.4.0.25 - Inline Diff Disclosure State

## Fixed

The existing inline Diff button in Changes and History exposes its open/closed
state through `aria-expanded`. The state follows the existing DiffView mount
predicate: accepted content, including an empty response, is expanded; a closed
or not-yet-accepted diff is collapsed. Retained offline content remains expanded
until local Hide removes it.

The button keeps its current names, disabled/loading feedback and native behavior.
This change adds no request, state, ID, focus operation, wrapper or shared owner.
Optional `aria-controls` is not added.

## Scope and verification

One production JSX attribute. Appended actual-source tests reuse the complete
existing Diff/API/deadline/paging harness while preserving its original six tests.
Strict anchored restoration protects the original EventRow and whole-App source.
The coupled historical graph oracle restores only this reviewed insertion before
its original checks; old hashes, two-term reversal and negative guards stay fixed.

Controlled props and live HTTP/served assets do not establish native keyboard,
paint, focus or assistive behavior, or certify accessibility compliance.
Native v0.4 H.1 stays pending under continuing independent-delivery authority.
Prior launcher fixture limits and the unused synthetic runtime row remain separate;
no runtime cleanup or browser bypass is authorized by this release.

The build-only `braces` issue remains open in the
[primary advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
No dependency migration, patched-version claim or chunk-notice suppression.

Use the [safe upgrade procedure](../../Installation_Guideline.md#safe-stop-and-restart).
Rebuild after version changes; restarting Python alone leaves old UI assets.
Evidence and publication details are recorded separately in
`temp/Plan/PLAN_v0.4.0.25_Inline_Diff_Disclosure_State.txt`.

Previous [v0.4.0.24 notes](TrackingMonitor_v0.4.0.24_Release_Notes.md)
retain their historical content with only two move-affected links rebased.
