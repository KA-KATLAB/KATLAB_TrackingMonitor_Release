# KATLAB TrackingMonitor v0.4.0.17 - Declared File Patterns

## Fixed

Active plans no longer send wildcard scope declarations into the exact-file Story
filter or editor URI. Both the spotlight preview and exact-data files column show
'*'/'?' patterns in full with a visible 'pattern' prefix and no fake action.
Concrete file paths keep their existing Story action with a full path/repository
accessible name. Brackets, spaces and Unicode remain literal.

The spotlight still previews four declarations and the remaining count. Large
exact-data cells now page declarations above50 with the shared 50-item local
controls. Repository/plan/task identity owns paging; source order, duplicates,
global ordinal keys and the complete underlying file model remain intact.

## Scope and verification

Controlled supported-data reproduction uses the actual parser, board callbacks
and exact DB filter, not a claimed live incident. Actual-source callback, shared
page-window and SSR regressions cover pattern/literal targets, long/escaped text,
empty/first/last pages and unchanged grouping/pre-render fingerprints.

No glob expansion, matched-file discovery, new API/fetch, setting, attribution,
dependency or global focus/state owner is introduced. A concrete path can still
have no recorded events. Full declarations wrap locally; native keyboard, focus,
pointer, assistive and viewport acceptance remains pending under the continuing
delivery override. Existing native v0.4 acceptance is not marked complete.

The build-only `braces` advisory remains open; no direct patched version is listed
in the [primary advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
No Tailwind major migration, security remediation or chunk-notice suppression is
bundled. Existing build and earlier unconfirmed launcher-fixture limits remain.

Use the [safe upgrade procedure](../../Installation_Guideline.md#safe-stop-and-restart).
CDD/CFT, automated verification, activation and publication evidence is recorded
in `temp/Plan/PLAN_v0.4.0.17_Declared_File_Patterns.txt`.

Previous [v0.4.0.16 notes](TrackingMonitor_v0.4.0.16_Release_Notes.md)
retain their historical scope, with only move-affected links rebased.
