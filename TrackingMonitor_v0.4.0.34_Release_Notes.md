# KATLAB TrackingMonitor v0.4.0.34 - Unambiguous Commit Draft Reasons

## Fixed

A commit draft no longer selects an arbitrary task title when two current tasks
in the same repository share a compatibility display reference. It preserves
the existing bare-reference fallback instead of claiming the wrong reason.

Duplicate references remain ambiguous regardless of task order, third matches
or matching titles. Unique titles, raw references, captured-event ordering,
deduplication, stale/null handling, unattributed counts and placeholders remain.
The existing single-line subject compaction and complete clipboard lifecycle
are unchanged. Three product windows only: one comment, Map type and insertion.

## Scope and verification

The admitted collision is reproduced through actual pure plan parsing,
resolution, in-memory SQLite ordering and the tasks API projection. Distinct
normalized identities can have equal display labels even with unique MODE B.
Controlled complete-module tests protect fallback, source preservation and
the actual same-stack copy wrapper. All existing tests/helpers stay unchanged.

This is conservative display metadata resolution, not a canonical task join,
assignment inference, identity normalization or migration. No backend production,
API, schema, configuration, dependency or stored event/task change. Current
configured plans had no observed collision; do not infer live incidence.

Controlled fixtures, clipboard mocks and live HTTP/assets are not native
clipboard, focus, keyboard, geometry, assistive or accessibility acceptance.
Native v0.4 H.1 remains pending under independent-delivery authority. Earlier
launcher fixture limits and the unused synthetic runtime row remain separate.
No runtime cleanup or browser bypass is authorized.

The build-only `braces` issue remains open in the
[primary advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
No compatible patch exists today; no forced major upgrade or notice suppression.

Use the [safe upgrade procedure](Docs/Installation_Guideline.md#safe-stop-and-restart).
Rebuild after version changes; restarting Python alone leaves old UI assets.
Evidence and publication details are recorded separately in
`temp/Plan/PLAN_v0.4.0.34_Unambiguous_Commit_Draft_Reasons.txt`.

Previous [v0.4.0.33 notes](Docs/Release_Notes/Archive/TrackingMonitor_v0.4.0.33_Release_Notes.md)
retain their historical content with only two move-affected links rebased.
