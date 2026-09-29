# KATLAB TrackingMonitor v0.3.1.2 — Chronicle Worker Health

This patch makes Sys distinguish the optional Chronicle worker from ordinary
tracker watcher health. It also records the user-requested Workflow K shorthand
for the repository's gated research-to-release process.

## Changed

- `/api/health` adds a read-only Chronicle worker state: `disabled`, `running`,
  or `unavailable`. Demo/isolated mode is distinguished from a production
  worker that failed to start or later stopped.
- Sys shows the worker state without treating a surviving built site as proof
  that its worker is live. Older backends and malformed state payloads are
  reported as unavailable health data, not as healthy.
- [Workflow K](Claude_Info/Workflow_K.md) documents the repeatable CDD 5/5,
  implementation, CFT 5/5, verification, restart, and authorized publication
  sequence. Agent Git guidance now consistently lists only the four allowed
  read-only commands by default.
- The prior fail-closed restart behavior remains. No new package, database
  migration, Git subprocess, or monitored-repository write is introduced.

## Limits

- Worker state is a snapshot when Sys opens; `running` does not prove that a
  Chronicle page has been built, is fresh, or will remain available.
- Workflow K does not waive staging, Git mutation, live-restart, or other
  repository authority checks. Browser interaction evidence is reported
  separately from HTTP and automated tests.
