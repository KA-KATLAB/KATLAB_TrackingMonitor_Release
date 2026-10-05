# KATLAB TrackingMonitor v0.4.0.6 - Bounded Hook Preflight

## Fixed

- The standalone `render_hook_config.py --preflight` operator check now bounds
  settings reads to 1 MiB plus one detection byte. Oversized input is refused
  before strict UTF-8 decoding; no truncated prefix is accepted.
- Excessive recursion during JSON decoding or reference traversal returns one
  static `PREFLIGHT ERROR` line, exit 2 and no rendered snippet. Previously these
  paths could escape with a traceback. Integer-decoder errors already used exit 2.

Normal rendering, provider hook schemas, existing reference-count semantics,
missing-file success and collision exit 3 are unchanged. The CLI remains stdlib-only
and never changes settings, installs hooks or alters interpreter limits. The cap
is an independent preflight limit, not a provider configuration limit.

## Boundaries and operation

No capture, backend health behavior, dependencies, UI layout or API shapes changed.
Existing symlink/BOM and exists-then-read behavior remain; no I/O deadline,
memory-allocation ceiling or atomic/coherent snapshot guarantee is added. Tests
use isolated settings fixtures, not operator configuration. Rejected files require
operator review; no automatic trimming or repair is attempted.

Follow the [safe upgrade procedure](../../Installation_Guideline.md#safe-stop-and-restart)
to rebuild the canonical UI version and restart, then reload existing tabs.
CDD/CFT, focused/full tests, activation and publication evidence is recorded in
`temp/Plan/PLAN_v0.4.0.6_Bounded_Hook_Preflight.txt`.

Native v0.4 visual/interaction acceptance remains pending. Existing chunk notices
and default-branch dependency alerts are not resolved. The earlier one-off native
launcher test-fixture failure is not claimed fixed by this CLI change.

Previous [v0.4.0.5 notes](TrackingMonitor_v0.4.0.5_Release_Notes.md)
retain their historical health-only scope, with only move-affected links rebased.
