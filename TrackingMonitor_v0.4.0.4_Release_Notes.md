# KATLAB TrackingMonitor v0.4.0.4 - Git Revision Boundary

## Fixed

- Dynamic revisions can no longer become command options in commit diffs,
  commit metadata or paged history. Non-string, empty, NUL-containing and
  leading-hyphen revision values are rejected before the subprocess boundary.
- Guard errors use a static message without reflecting the rejected value. The diff
  API preserves its existing failure envelope and does not retry as a working-tree
  diff. Existing normal refs/expressions, missing/empty optional commit behavior,
  separated filenames, demo/offline branches and catch-up order remain unchanged.

The defect was reproduced with the actual route/helper and a mocked subprocess.
No write-capable test command was executed against a real repository. Validation
closes this parameter/option boundary; it is not a general sandbox for arbitrary
Git configuration, external tools or future unvalidated command callers.

## Operation and verification

Follow the [safe upgrade procedure](Docs/Installation_Guideline.md#safe-stop-and-restart)
to rebuild the canonical UI version and restart; reload existing tabs afterward.
Owned-process protection, stop phase diagnostics and frontend identity gates remain.
No new Git operations/flags, dependencies, UI layout, data/API shapes, provider
settings or monitored-repository edits were introduced.

Focused helper/API regressions cover pre-subprocess rejection, privacy, no fallback,
lazy pagination, normal refs and option-looking filenames. Full verification,
CDD/CFT, safe activation and publication evidence is in the ignored plan:
`temp/Plan/PLAN_v0.4.0.4_Git_Revision_Boundary.txt`.

Native v0.4 visual/interaction acceptance remains pending. Existing chunk-size
notices and default-branch dependency alerts are not resolved by this fix.

Previous [v0.4.0.3 notes](Docs/Release_Notes/Archive/TrackingMonitor_v0.4.0.3_Release_Notes.md)
are archived with only move-affected links rebased.
