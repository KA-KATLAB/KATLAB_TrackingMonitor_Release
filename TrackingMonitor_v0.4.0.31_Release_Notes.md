# KATLAB TrackingMonitor v0.4.0.31 - Chronological Effort Aggregation

## Fixed

Backend effort aggregation orders a copy of each parsed epoch group before
applying the existing gap rule. Accepted mixed-precision timestamps no longer
invent a gap, undercount task/calendar effort or select the wrong Wrapped task.
A reproduced three-row window now estimates 17 minutes instead of 4.

The 15-minute strict gap threshold, two-minute tail and rounding stay intact.
Caller-owned lists, stored timestamps, event IDs, ingest offsets, grouping,
provider/session counts, configured scope, API shape and queries are unchanged.
Wrapped day minutes still project calendar values; no duplicate estimator.

## Scope and verification

Controlled tests use the actual schema, atomic insert and complete aggregation
in SQLite memory only. They reproduce the original duration/ranking defect,
compare unchanged finite ascending behavior against the actual original helper,
and protect both source windows through strict reversal and original hashes.
All original tests remain unchanged.

This remains approximate effort, not elapsed work measurement. Raw date buckets,
text-based time-window cutoffs, MIN/MAX identity/provenance and unrelated
timestamp logic are not normalized. No schema, admission or data migration.
Sorting adds a per-group copy; no unmeasured performance claim.

Controlled tests and live HTTP/assets do not establish native focus, keyboard,
geometry, assistive acceptance or accessibility compliance. Native v0.4 H.1
remains pending under independent-delivery authority. Earlier launcher fixture
limits and the unused synthetic runtime row remain separate. No cleanup or
browser bypass is authorized.

The build-only `braces` issue remains open in the
[primary advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
No dependency migration or chunk-notice suppression.

Use the [safe upgrade procedure](Docs/Installation_Guideline.md#safe-stop-and-restart).
Rebuild after version changes; restarting Python alone leaves old UI assets.
Evidence and publication details are recorded separately in
`temp/Plan/PLAN_v0.4.0.31_Chronological_Effort_Aggregation.txt`.

Previous [v0.4.0.30 notes](Docs/Release_Notes/Archive/TrackingMonitor_v0.4.0.30_Release_Notes.md)
retain their historical content with only two move-affected links rebased.
