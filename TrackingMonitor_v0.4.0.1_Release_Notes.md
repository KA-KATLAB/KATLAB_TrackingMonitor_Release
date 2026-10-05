# KATLAB TrackingMonitor v0.4.0.1 - Owned Process Stop

## Fixed

- Stop/restart no longer terminates a process solely because it occupies the
  configured tracker/demo port. Foreign, mixed or unverifiable listeners refuse
  the operation before any target is terminated.
- The exact repository venv launcher, supported base-pythonw child and captured
  descendants are proved through bounded Windows metadata and native handles.
  Image, creation identity and ancestry are checked before mutation. Retained
  handles prevent a later PID reuse from redirecting termination.
- One shared deadline covers discovery, preparation, termination and observation.
  Stop rechecks listener membership, observes captured process exit and confirms
  the port clear. New replacement listeners are never added as targets.
- Short-lived descendant exits and root/job cascades are handled without PID
  reopen. Access denial, changed identities and partial failures remain errors;
  restart does not launch a replacement after a failed stop.

## Preserved and limited

- Hidden launch, logs, configuration validation, demo isolation, empty-port stop
  and readiness checks remain. Stop ownership is independent of readiness, so
  older-version or unhealthy owned trackers can be restarted.
- Manual/base-only launch shapes are unsupported. This proof is not historical
  mode/configuration attestation, hostile same-owner protection or an atomic
  snapshot of children created in the future. Partial termination is not rolled
  back. See [safe stop/restart](Docs/Installation_Guideline.md#safe-stop-and-restart).
- No dependency, UI, capture, database, API or monitored-repository change.
  Native rendered acceptance of the v0.4 redesign remains pending; tests and
  served HTTP/assets are not keyboard, layout or browser-reload evidence.
- Current build tooling retains the upstream [braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
  The audited lockfile reports five affected development-package nodes through
  Tailwind's tooling, all from that advisory; `npm audit --omit=dev` reports zero.
  Upstream lists no patched braces version. This is not proof that all runtime
  risks or GitHub default-branch alerts are resolved. No forced major migration
  or dependency installation was performed for this lifecycle fix.

## Verification

Ownership/launcher regression tests include finite native fixtures. A foreign
loopback HTTP fixture remains responsive after actual ownership refusal; only
its separately verified original fixture handle is subsequently terminated.
Full-suite, activation and publication results are recorded in the ignored plan:
`temp/Plan/PLAN_v0.4.0.1_Owned_Process_Stop.txt`.

The previous [v0.4.0.0 notes](Docs/Release_Notes/Archive/TrackingMonitor_v0.4.0.0_Release_Notes.md)
retain their historical content; their prior-release link is rebased to its
sibling filename so both repository navigation and strict Chronicle builds work.
