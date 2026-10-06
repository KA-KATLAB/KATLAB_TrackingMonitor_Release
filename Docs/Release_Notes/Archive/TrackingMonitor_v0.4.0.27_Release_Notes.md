# KATLAB TrackingMonitor v0.4.0.27 - Replay Speed Selection State

## Fixed

The existing Day Replay 1x/2x/4x buttons expose the selected speed through
`aria-pressed`, matching their existing visual selection. Exactly one is pressed
for each valid current speed. Labels, numeric callbacks and playback stay intact.

One JSX attribute only: no state, effect, request, focus operation, group,
keyboard handler, wrapper or style changes. Selecting the current speed retains
its existing callback and selected state.

## Scope and verification

New tests execute the actual mapped JSX with all three speed snapshots, all nine
callback transitions and static markup. Strict single-insertion reversal protects
the original complete module, DayLanes function, pre-render and outside bytes.
Existing Day Replay, Day Events, preferences and preservation tests remain intact.

Controlled mapped-expression/SSR checks do not establish actual replay arming,
native keyboard, focus, geometry or assistive behavior, or certify compliance.
Native v0.4 H.1 stays pending under continuing independent-delivery authority.
Earlier launcher fixture limits and the unused synthetic runtime row remain
separate; no runtime cleanup or browser bypass is authorized by this release.

The build-only `braces` issue remains open in the
[primary advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
No dependency migration, patched-version claim or chunk-notice suppression.

Use the [safe upgrade procedure](../../Installation_Guideline.md#safe-stop-and-restart).
Rebuild after version changes; restarting Python alone leaves old UI assets.
Evidence and publication details are recorded separately in
`temp/Plan/PLAN_v0.4.0.27_Replay_Speed_Selection_State.txt`.

Previous [v0.4.0.26 notes](TrackingMonitor_v0.4.0.26_Release_Notes.md)
retain their historical content with only two move-affected links rebased.
