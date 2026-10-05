# KATLAB TrackingMonitor v0.4.0.18 - Unique Event Windows

## Fixed

File Story, Session Timeline, Day Lanes and Digest no longer count overlapping
offset-page observations as additional captured events. Capture between two
requests can shift an existing event into the next page; a shared identity helper
keeps the first observed record/order for each global database event ID.

Local-day filtering still happens before identity acceptance. Each caller keeps
its existing sort, query/signal, three-by-500 raw-page fetch cap and 50-row visible
collections. Stop/cap decisions use raw responses, even when fewer unique events
remain. Dialog counts/keys, replay and Digest captured/per-file totals use the
same unique accepted model. Deadlines, cancellation, retry and export owners stay.

## Scope and verification

Actual-source controlled DB and collector fixtures reproduce a supported overlap,
not a claimed live incident. Regressions exercise real dialog effects under
controlled hooks/API boundaries and real day/export modules, plus first-record
identity, raw caps, filter/sort and lifecycle cases. Prior function fingerprints
remain pinned with only the exact intended append statement reversed.

This is duplicate removal, not transaction snapshot isolation, latest assignment
or commit-field refresh, or recovery of records missed by moving offsets. A short
page does not prove a complete/current history. No new backend/API/schema/cursor,
fetch, setting, dependency, layout, focus or global-state owner is introduced.
Native keyboard, focus, pointer, assistive and viewport acceptance remains pending
under the continuing delivery override; original v0.4 acceptance is not completed.

The build-only `braces` advisory remains open; no direct patched version is listed
in the [primary advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
No Tailwind major migration, security remediation or chunk-notice suppression is
bundled. Existing build and earlier unconfirmed launcher-fixture limits remain.

Use the [safe upgrade procedure](Docs/Installation_Guideline.md#safe-stop-and-restart).
CDD/CFT, automated verification, activation and publication evidence is recorded
in `temp/Plan/PLAN_v0.4.0.18_Unique_Event_Windows.txt`.

Previous [v0.4.0.17 notes](Docs/Release_Notes/Archive/TrackingMonitor_v0.4.0.17_Release_Notes.md)
retain their historical scope, with only move-affected links rebased.
