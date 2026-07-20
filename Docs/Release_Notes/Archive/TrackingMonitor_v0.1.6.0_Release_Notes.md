# KATLAB TrackingMonitor v0.1.6.0 — Release Notes

**Theme:** Effort & Context — HOW LONG each task actually took, WHERE each change landed, and the story of every session — from data the tracker already captures.

Second harvest from the external research pass (WakaTime/Wakapi-class time trackers, GitDeck-class dashboards, agents-observe replay): effort estimates derived purely from existing capture timestamps, git branch awareness end-to-end, a session timeline, and attention-bell rhythm nudges. The plan survived a 22-pass CDD review loop (25 findings RV1–RV25 fixed in place, ending 5/5 consecutive clean — including two empirically disproven assumptions caught by live probes) before a line of code was written.

## Highlights

- **Effort estimates (HOW LONG):** every task now shows "≈ 2h 40m · 3 sessions" — derived from capture timestamps with a 15-minute-gap block rule (one algorithm home in the backend, validated against real data before implementation). Surfaces: task sidebar cards, Changes group headers, a "time today (UTC)" KPI, per-day calendar tooltips, and the daily digest. Always "≈", always labelled — an honest estimate, never fake precision.
- **Branch awareness (WHERE):** the hook records the git branch per event (pure stdlib `.git/HEAD` read, worktree-aware, fail-open) and the status bar shows each repo's current branch (`⎇ main`). Event rows flag work captured on a *different* branch than the repo is on now — the interesting signal, never same-branch noise. Same additive event-version-1 contract as session_id: any hook/server upgrade order works.
- **Session timeline (the story):** click a session's filter chip → a chronological modal of everything that session did — across repos, with task-transition separators and "— ≈ 47m gap —" markers. A static snapshot, honest about truncation.
- **Rhythm nudges:** the attention bell now flags an in-progress task idle for 24h+ and repos carrying uncommitted work for 48h+ — the two drifts the discipline rules care about, derived from two additive API fields.

## Cross-repo

Nothing to install in monitored repos: the capture contract is unchanged (same registration, same event version — old and new hooks/servers interoperate in any order, downgrade included). The database migrates itself additively on first start (`events.branch`, idempotent needed-columns loop that also covers pre-v0.1.5.0 databases). Additive read-only fields on `/api/stats`, `/api/repos`, `/api/tasks` plus one optional `/api/events` filter param; no new endpoints, no new git calls beyond one read-only `rev-parse` per status refresh (two while detached), `package.json` untouched (zero new dependencies).
