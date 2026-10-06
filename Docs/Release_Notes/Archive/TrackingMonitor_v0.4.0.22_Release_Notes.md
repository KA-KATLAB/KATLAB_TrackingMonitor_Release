# KATLAB TrackingMonitor v0.4.0.22 - Observed Relationship History

## Improved

Relationships no longer presents unobserved History as zero commit links.
Initial loading, first failure and offline task-only preparation expose
unavailable commit facts while preserving independently available task details.
Accepted empty link windows still show their measured zero/dash state.

A compact provenance line identifies the last accepted History response of up
to 500 commits. Counts are per-task commit associations, not unique commits or
complete plan history. Pending or failed map updates identify any visible
diagram as its previous accepted render, including when offline synthetic rows
replace accepted commit rows before the new diagram completes.

## Scope and verification

Only the existing Relationship row state gains selection/observation metadata,
published at its original guarded point before awaited diagram rendering. History
success followed by a diagram failure still supplies valid accepted commit data.
Unknown commit cells say Unavailable; the empty-diagram footer cannot claim that
a bounded link window establishes a plan has no committed history.

Request limits, foreground deadlines, background ownership, stale guards,
trailing refresh, module Reload/Retry, choice cleanup, App remount policy,
SVG/modal ownership and bounded exact-data paging remain unchanged. No new
request, action, effect, timer, shared component, live region or dependency.

Controlled regressions execute the complete actual owner with real API/deadline
and backbone preparation, plus separately deferred request/render stages.
Strict exact-fragment restoration protects the original complete function,
whole-source and pre-render fingerprints. These checks do not certify native
paint, geometry, keyboard or assistive behavior. Native v0.4 H.1 stays pending
under the continuing independent-delivery override. Earlier launcher fixture
limits and the unused synthetic runtime row remain separate; no cleanup or
hand-edited runtime data is authorized by this change.

The build-only `braces` issue remains open in the
[primary advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
No patched-version claim, dependency major migration or chunk-notice suppression.

Use the [safe upgrade procedure](../../Installation_Guideline.md#safe-stop-and-restart).
Rebuild after version changes; restarting Python alone leaves old UI assets.
Evidence and publication details are recorded separately in
`temp/Plan/PLAN_v0.4.0.22_Observed_Relationship_History.txt`.

Previous [v0.4.0.21 notes](TrackingMonitor_v0.4.0.21_Release_Notes.md)
retain their historical content with only two move-affected links rebased.
