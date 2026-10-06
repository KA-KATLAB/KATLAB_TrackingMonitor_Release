# KATLAB TrackingMonitor v0.4.0.24 - Local Palette Keyboard Visibility

## Fixed

ArrowUp and ArrowDown expose the selected command within the Palette's existing
local list viewport, including wraparound. Opening, searching, changing pages
and replacing results expose the first current option. Raw search edits also
reset visibility when their normalized result identity is unchanged.

Only the list's scroll position changes. Search-input focus, pointer hover,
sorting, paging, keyboard selection, disabled actions, dialog/disclosure handoff
and the existing modal owners remain unchanged. Oversized options align their
leading edge; already-visible options do not cause a scroll write.

## Scope and verification

Six local source insertions, with no new imports, requests, listeners, timers,
dependencies, shared layout or CSS changes. Controlled tests execute the complete
actual component and paging helpers with bounded geometry. Strict six-insertion
restoration retains original complete-source and component fingerprints; existing
Palette tests remain unchanged.

This fixes visibility inside the local list, not clipping by the outer dialog
on very short screens. Controlled geometry and live HTTP/served-asset checks
do not certify native scrolling, focus, keyboard, paint or assistive behavior.
Native v0.4 H.1 remains pending under continuing independent-delivery authority.
Prior launcher fixture limitations and the unused synthetic runtime row remain
separate; no runtime cleanup or browser bypass is authorized by this release.

The build-only `braces` issue remains open in the
[primary advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
No dependency migration, patched-version claim or chunk-notice suppression.

Use the [safe upgrade procedure](Docs/Installation_Guideline.md#safe-stop-and-restart).
Rebuild after version changes; restarting Python alone leaves old UI assets.
Evidence and publication details are recorded separately in
`temp/Plan/PLAN_v0.4.0.24_Local_Palette_Keyboard_Visibility.txt`.

Previous [v0.4.0.23 notes](Docs/Release_Notes/Archive/TrackingMonitor_v0.4.0.23_Release_Notes.md)
retain their historical content with only two move-affected links rebased.
