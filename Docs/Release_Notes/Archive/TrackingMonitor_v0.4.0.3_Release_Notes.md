# KATLAB TrackingMonitor v0.4.0.3 - Stop Failure Diagnostics

## Fixed

- Expected stop failures identify the last attempted caller phase: configuration,
  discovery, ownership, listener recheck, termination, port confirmation or
  normal-path cleanup. Native exception text and process metadata stay hidden.
- Owned-stop success is printed only after handle cleanup succeeds. A cleanup
  failure no longer emits a misleading success line before aborting.
- If cleanup masks a body failure, the code retains the last attempted body
  phase. It does not claim to identify the native root cause or roll back partial
  termination. Initially clear ports still succeed without process preparation.

## Operation and limits

See the [phase codes and safe restart procedure](../../../Docs/Installation_Guideline.md#safe-stop-and-restart).
Ownership checks, captured targets, one stop deadline, both launcher profiles and
restart's failure cutoff are unchanged. There is no automatic retry or forced
termination fallback. The exact cause of the earlier intermittent live refusal
is still unknown; this release improves future diagnosis, not that unproven cause.

The UI build gate remains in force. Stop the shared frontend's consumers before
building the new version, validate the build, restart, then reload existing tabs.
No dependencies, layout, data/capture contracts, APIs or monitored repositories
changed. Native v0.4 visual and interaction acceptance remains pending; build,
HTTP and controlled tests are separate evidence.

Existing Mermaid chunk-size notices and default-branch dependency alerts remain.
This release does not resolve the build-tooling
[braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).

## Verification

Regression coverage exercises every phase and expected exception family in both
modes through direct and CLI boundaries, output privacy, success ordering,
body/cleanup failures and interruption propagation. Existing ownership, deadline,
hidden-launch and copied-batch checks remain. Full review, test, activation and
publication results are recorded in the ignored plan:
`temp/Plan/PLAN_v0.4.0.3_Stop_Failure_Diagnostics.txt`.

Previous [v0.4.0.2 notes](TrackingMonitor_v0.4.0.2_Release_Notes.md)
are archived with only move-affected links rebased.
