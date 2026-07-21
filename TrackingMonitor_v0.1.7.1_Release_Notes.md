# KATLAB TrackingMonitor v0.1.7.1 — Release Notes

**Theme:** Sweep hotfix (F58) — gitignored plan edits made during a clean, commit-free stretch no longer linger as "uncommitted".

A shipped monitored-repo version kept showing an uncommitted change that no commit could ever clear. Root cause: all three sweep triggers (startup, commit-transition, poll dirty→clean transition) require a restart or a status *change* — but a gitignored-file edit (a detailed plan under the ignored `temp/`) accrues an unlinked event **without dirtying the repo**, so no trigger ever fires and the event lingers until an unrelated restart or commit. First surfaced now only because plan edits normally ride along with dirty code; this was a plan-only edit during a sustained CLEAN stretch (review loop after a wrap-up).

## Highlights

- **F58 poll-path safety net** (`Backend/app/watcher.py`, `_poll_loop`): every poll, any repo that is CLEAN and still has unlinked events gets swept to HEAD (`swept=1`) — unconditionally, outside the transition gate. Correct by ordering: `_detect_commits()` links all committable events to their real commits first in the same iteration, so on a clean repo only truly-unlinkable (gitignored) events remain. Idempotent (touches only `commit_hash IS NULL` rows), offline-safe (online-repos loop + keep-last-known + GitError-guarded sweep), one `LIMIT 1` probe per poll when idle.
- **Self-healing on upgrade**: the first poll after restart sweeps any pre-existing stragglers — no manual database surgery needed for future occurrences.

## Cross-repo

Nothing to install in monitored repos: capture contract, hook, event version, schema, API — all untouched. One file changed (`watcher.py`) plus the version constant; the WS push reuses the existing `commit_detected {swept: true}` shape. Restart the tracker to load it.
