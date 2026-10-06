# KATLAB TrackingMonitor v0.4.0.23 - Retired Mission Request Owners

## Fixed

Mission ignores queued errors and timeout settlement from requests canceled by
effect replacement. An old rejected request can no longer leave its error beside
a newer accepted snapshot or clear that replacement's loading indicator. The
shared owner retirement rule also protects sessions, timeline and evidence.

Current transport/HTTP errors, current deadline timeouts and Retry remain visible.
Already-expired current owners still report timeout, and the last current part
still settles loading after clearing the foreground refresh reference.

## Scope and verification

Exactly four existing-owner edits, with no new import, request, action, timer,
effect, dependency or render change. Existing API contracts, foreground deadline,
background reads, tokens, per-part generations, refresh pending/status accounting,
selection deferrals, paging and navigation remain unchanged.

Controlled regressions execute the complete actual local owners and all four
effect callbacks with actual API/deadline/forecast code. Strict four-fragment
restoration protects original pre-render and complete-source fingerprints, rather
than replacing old baselines. These tests and live HTTP/served-asset checks do
not certify native paint, focus, geometry, keyboard or assistive behavior.
Native v0.4 H.1 stays pending under continuing independent-delivery authority.
Prior launcher fixture limitations and the unused synthetic runtime row remain
separate; no runtime cleanup or browser bypass is authorized by this release.

The build-only `braces` issue remains open in the
[primary advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
No dependency migration, patched-version claim or chunk-notice suppression.

Use the [safe upgrade procedure](Docs/Installation_Guideline.md#safe-stop-and-restart).
Rebuild after version changes; restarting Python alone leaves old UI assets.
Evidence and publication details are recorded separately in
`temp/Plan/PLAN_v0.4.0.23_Retired_Mission_Request_Owners.txt`.

Previous [v0.4.0.22 notes](Docs/Release_Notes/Archive/TrackingMonitor_v0.4.0.22_Release_Notes.md)
retain their historical content with only two move-affected links rebased.
