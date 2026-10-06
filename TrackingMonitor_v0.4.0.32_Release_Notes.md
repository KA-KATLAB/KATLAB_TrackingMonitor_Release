# KATLAB TrackingMonitor v0.4.0.32 - City Trailing Refresh Retirement

## Fixed

City's automatic-round and foreground-retry trailing callbacks check current
mount ownership when their queued microtask executes. Leaving City no longer
allows either retired continuation to schedule a new stats request or loading
state after cleanup has aborted owners and cleared existing timers.

Both guards are inside their existing callbacks. Mounted trailing refresh,
current-scope replacement, throttle, retry deadlines, six-worker concurrency,
accepted snapshots, generation/key/abort gates and cleanup/setup recovery stay
intact. No scheduler-entry guard, extra polling, API or presentation change.

## Scope and verification

Controlled tests execute the actual complete pre-render City owner, actual
request pool and actual API/deadline code with isolated hooks, fetch, clock,
timers and microtasks. They reproduce automatic, foreground and already-queued
retirement failures against the actual original source, then protect both
callback windows through strict reversal and immutable original fingerprints.
All original tests remain unchanged.

This is retirement of two newly dispatched trailing continuations, not universal
cancellation of already-dispatched requests, server work or unrelated callbacks.
Controlled cleanup/setup replay is not native React rendering acceptance.
No backend data, configuration, dependency, schema, download or style change.

Controlled tests and live HTTP/assets do not establish native focus, keyboard,
geometry, assistive acceptance or accessibility compliance. Native v0.4 H.1
remains pending under independent-delivery authority. Earlier launcher fixture
limits and the unused synthetic runtime row remain separate. No cleanup or
browser bypass is authorized.

The build-only `braces` issue remains open in the
[primary advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
No dependency migration or chunk-notice suppression.

Use the [safe upgrade procedure](Docs/Installation_Guideline.md#safe-stop-and-restart).
Rebuild after version changes; restarting Python alone leaves old UI assets.
Evidence and publication details are recorded separately in
`temp/Plan/PLAN_v0.4.0.32_City_Trailing_Refresh_Retirement.txt`.

Previous [v0.4.0.31 notes](Docs/Release_Notes/Archive/TrackingMonitor_v0.4.0.31_Release_Notes.md)
retain their historical content with only two move-affected links rebased.
