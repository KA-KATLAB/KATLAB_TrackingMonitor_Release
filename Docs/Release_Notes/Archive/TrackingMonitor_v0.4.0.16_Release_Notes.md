# KATLAB TrackingMonitor v0.4.0.16 - Truthful Workspace Presence

## Fixed

The tab favicon and installed-PWA badge share one whole-workspace coverage rule.
Only an accepted, error-free, nonempty snapshot with every repository online,
strictly valid Git status, nonnegative safe-integer counts and a safe total can claim CLEAN or request a
numeric total. Retained invalid values are no longer counted as current facts.

Pending, empty, offline, invalid or failed-refresh coverage requests badge clearing
and shows a muted '?' favicon. If the canvas has no 2d context, the existing
static brand replaces any prior live icon. Known clean/dirty32px rendering, exact
badge totals and the favicon99+ label remain. Ordinary background refresh retains
accepted status; no connection-expiry heuristic or new request is introduced.

## Scope and verification

Actual App callbacks/dependencies and the actual pure helper/canvas renderer run
under controlled platform boundaries. They reproduce supported status failures,
not an observed live incident. The prior whole-App pre-render oracle retains its
old hash, reverses only two fingerprint-pinned presence calls and continues to
check the release-identity edits. No unrelated baseline is regenerated.

Badge setting/clearing is best-effort and write-only; OS delivery and dynamic
favicon support remain platform-controlled. The '?' and in-app coverage context
are not a certification of native visual/keyboard/assistive/PWA acceptance.
Original native acceptance remains pending. No API, capture, request, setting,
dependency, DOM layout, motion or generated-content implementation changes.

The build-only `braces` advisory remains open; no direct patched version is listed
in the [primary advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
No Tailwind major migration, security remediation or chunk-notice suppression is
bundled. Existing build and earlier unconfirmed launcher-fixture limits remain.

Use the [safe upgrade procedure](../../Installation_Guideline.md#safe-stop-and-restart).
CDD/CFT, automated verification, activation and publication evidence is recorded
in `temp/Plan/PLAN_v0.4.0.16_Truthful_Workspace_Presence.txt`.

Previous [v0.4.0.15 notes](TrackingMonitor_v0.4.0.15_Release_Notes.md)
retain their historical scope, with only move-affected links rebased.
