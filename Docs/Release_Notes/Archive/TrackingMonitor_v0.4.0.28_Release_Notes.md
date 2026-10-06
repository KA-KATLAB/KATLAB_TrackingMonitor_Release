# KATLAB TrackingMonitor v0.4.0.28 - Disclosure Focus Return

## Fixed

Closing a persistently mounted disclosure with Escape now returns focus to its
connected opener. A closed effect no longer invalidates the outgoing restoration.
The shared hook retains its active-generation and global handoff-suppression guards.

Passive closure or refresh preserves a connected focus destination outside the
original disclosure. This prevents automatic removal of the final warning or
CLEAN-list collapse from pulling focus away after keyboard navigation. Explicit
Escape still returns focus; body, disconnected or internal focus follows the
existing opener/main fallback. Warnings keeps its own layout recovery.

Four narrow hook edits only. Requests, routes, components, visual styles, listener
ownership, native controls and dialog/overlay handoffs remain unchanged.

## Scope and verification

New tests execute the complete actual hook, suppression state, actual Warnings
focus logic and CLEAN gates through controlled effect/ref/listener/microtask
models. Strict four-window reversal protects the original module, complete hook
and outside-function fingerprints. All original tests remain untouched.

Controlled focus-call checks and live HTTP/assets do not establish native focus,
keyboard, geometry or assistive acceptance, or certify accessibility compliance.
Native v0.4 H.1 stays pending under continuing independent-delivery authority.
Earlier launcher fixture limits and the unused synthetic runtime row remain
separate; no runtime cleanup or browser bypass is authorized by this release.

The build-only `braces` issue remains open in the
[primary advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
No dependency migration, patched-version claim or chunk-notice suppression.

Use the [safe upgrade procedure](../../Installation_Guideline.md#safe-stop-and-restart).
Rebuild after version changes; restarting Python alone leaves old UI assets.
Evidence and publication details are recorded separately in
`temp/Plan/PLAN_v0.4.0.28_Disclosure_Focus_Return.txt`.

Previous [v0.4.0.27 notes](TrackingMonitor_v0.4.0.27_Release_Notes.md)
retain their historical content with only two move-affected links rebased.
