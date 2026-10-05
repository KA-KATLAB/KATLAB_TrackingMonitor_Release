# KATLAB TrackingMonitor v0.4.0.2 - UI Build Identity Gate

## Fixed

- Restarting Python no longer silently accepts an existing older UI. Production
  HTML has a build-only version marker from the same canonical value as the UI
  version beside the product name.
- Both start scripts reject obsolete, unmarked or invalid entry builds before
  dependency setup. Missing-index first-run bootstrap remains; a strict check
  precedes log rotation, demo bootstrap and hidden launch.
- Healthy already-running and readiness paths check UI identity immediately
  before browser handoff. Invalid UI never prevents the owned stop operation.
- Frontend directory changes are checked before npm. Top-level abort labels
  preserve nonzero failure exits after nested setup failures for direct CMD
  invocation as well as restart's CALL path.

## Upgrade and limits

Follow the [safe upgrade sequence](Docs/Installation_Guideline.md#safe-stop-and-restart):
stop Tracker and any demo, confirm their ports clear, build the shared frontend,
validate it, then restart. Existing tabs need a reload. The launchers do not
automatically rebuild existing stale output or coordinate concurrent builds.

The bounded stdlib check validates release identity, canonical HTML structure and
nonempty local JS/CSS entry assets. It is not a same-version source freshness
check, complete chunk attestation, proof of previous npm success, hostile-owner
protection or a browser rendering test. Ready-time refusal may leave a backend
running. Native acceptance of the v0.4 redesign remains pending.

No dependencies, layout, data/capture contracts, APIs or monitored repositories
changed. Existing Mermaid chunk-size warnings and the build-tooling
[braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) remain; this
release does not clear GitHub default-branch vulnerability alerts.

## Verification

Focused checks cover actual isolated Vite output, native-file validation, copied
Windows batches, health/browser ordering and independent stop ownership. Full
suite, CFT, activation and publication evidence is recorded in the ignored plan:
`temp/Plan/PLAN_v0.4.0.2_UI_Build_Identity_Gate.txt`.

Previous [v0.4.0.1 notes](Docs/Release_Notes/Archive/TrackingMonitor_v0.4.0.1_Release_Notes.md)
are archived with only move-affected links rebased.
