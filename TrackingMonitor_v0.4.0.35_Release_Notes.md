# KATLAB TrackingMonitor v0.4.0.35 - Precision-Safe Warning Chronology

## Fixed

Warning details now retain chronological order when the backend emits both
exact-second UTC timestamps and six-digit fractional timestamps. An earlier
exact-second warning no longer sorts after a later warning in the same second.

Only the existing warning comparator changes. Bare seconds receive zero padding
in local comparison copies; microseconds remain exact, including differences
below one millisecond. Equivalent instants keep stable input order.

Raw timestamps, dismissal keys, messages, repository scope, counts, collapsed
summary, fifty-row paging and complete disclosure/focus lifecycle remain.
This is ordering within the loaded warning model, not a backend retention,
capture-window, timestamp normalization, readiness or identity repair.

## Scope and verification

Actual producer clock probes and complete-component controlled regressions
reproduce the old ordering and protect precision, ties, dismissal and paging.
A strict test-only inverse retains original whole-App and warning-owner
baselines. Narrow old-oracle adapters preserve their immutable hashes,
negative checks, passthrough assertions and original diff-test prefix.

No backend production, API, schema, configuration, dependency or stored-data
change. No current live incidence is inferred from controlled fixtures.
Controlled hooks, SSR and live HTTP/assets are not native paint, focus,
keyboard, geometry, assistive technology or accessibility acceptance.
Native v0.4 H.1 remains pending under independent-delivery authority.
Earlier launcher fixture limits and the unused synthetic runtime row remain
separate; no runtime cleanup or browser bypass is authorized.

The build-only `braces` issue remains open in the
[primary advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
No compatible patch exists today; no forced major upgrade or notice suppression.

Use the [safe upgrade procedure](Docs/Installation_Guideline.md#safe-stop-and-restart).
Rebuild after version changes; restarting Python alone leaves old UI assets.
Evidence and publication details are recorded separately in
`temp/Plan/PLAN_v0.4.0.35_Precision_Safe_Warning_Chronology.txt`.

Previous [v0.4.0.34 notes](Docs/Release_Notes/Archive/TrackingMonitor_v0.4.0.34_Release_Notes.md)
retain their historical content with only two move-affected links rebased.
