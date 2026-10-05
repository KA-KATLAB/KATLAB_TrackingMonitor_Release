# KATLAB TrackingMonitor v0.4.0.13 - History Commit Identity

## Added

Each captured History commit has a compact Full commit ID disclosure, closed by
default. Its labelled read-only field exposes the exact loaded identity for
native selection, without hover or programmatic clipboard permissions. The
existing short hash, subject, time and linked events remain available.

Scope, repository or full-hash changes reset that local disclosure. Same-identity
updates and event paging retain native state. Long values scroll inside the field;
opening it does not fetch data, change focus automatically or validate Git objects.

## Scope and verification

Actual-source component, SSR and controlled DOM-boundary regressions cover exact
identity, escaping, semantic structure, composite keys, unchanged paging and the
existing attract-mode protection. They do not prove native disclosure activation,
keyboard selection, assistive technology behavior or rendered geometry.
Native v0.4 acceptance remains pending. No dependencies, API, requests, clipboard
operations, settings, capture or generated-content behavior changed.

The build-only `braces` advisory remains open; no direct patched version is listed
in the [primary advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
Read-only runtime-dependency audit reports no findings, which is not proof of no
exposure. A Tailwind major migration is not bundled into this enhancement.
The existing large-chunk notice and earlier unconfirmed launcher-fixture transient
remain known limits.

Use the [safe upgrade procedure](Docs/Installation_Guideline.md#safe-stop-and-restart).
CDD/CFT, verification, activation and publication evidence is recorded in
`temp/Plan/PLAN_v0.4.0.13_History_Commit_Identity.txt`.

Previous [v0.4.0.12 notes](Docs/Release_Notes/Archive/TrackingMonitor_v0.4.0.12_Release_Notes.md)
retain their historical scope, with only move-affected links rebased.
