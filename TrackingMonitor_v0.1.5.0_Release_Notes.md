# KATLAB TrackingMonitor v0.1.5.0 — Release Notes

**Theme:** Insights & Awareness — WHO changed it, WHEN, and whether the tracking itself is healthy, without watching the tab.

First harvest from an external research pass over observability dashboards (disler's multi-agent observability, GitDock, the Git-Heat-Map family): session attribution end-to-end, a discipline guard that enforces the tracker's own working rules, a year-view calendar, and three awareness surfaces — attention bell, OS notifications, daily digest — plus a Ctrl+K palette to drive it all. The plan survived a 23-pass CDD review loop (32 findings RV1–RV32 fixed in place, ending 5/5 consecutive clean) before a line of code was written.

## Highlights

- **Session attribution (WHO):** every captured event now carries the Claude session that made it — the hook already received `session_id` on stdin and silently dropped it. One additive, optional field under the same event version (no hook/server upgrade-order constraint); existing rows read back as "unknown" honestly. In the UI: a colored identity dot per event (same session = same color everywhere), click a dot in Changes to filter by that session.
- **Yearly calendar (WHEN):** a GitHub-style 365-day heatmap on the Overview — Sunday-first weeks, 4-step teal ramp, commit corner dots, UTC-day tooltips — pure SVG, zero new dependencies, fed by one additive field on `/api/stats`.
- **Discipline guard:** the flip-before-edit rules are now enforced by the UI, not just trusted — an amber "⚠ N active" chip per repo whenever the in-progress count isn't exactly 1, and a live banner the moment a change actually lands in the pick queue during a violation. Zero-task repos never nag; fixing the plan clears the guard live.
- **Attention bell:** ONE bell in the header with an actionable-count badge — a cross-repo triage panel listing picks pending, discipline violations, offline repos, and capture gaps; click a row to jump straight to that repo's pick queue. Its footer hosts the OS-alerts switch.
- **OS notifications (opt-in):** while the tab is hidden — and only then — get "N changes need a pick", "repo is CLEAN ✓", and server warnings as system notifications (coalesced, deduped by tag, click-to-focus). Anything short of a granted permission snaps the toggle back off.
- **Daily digest:** one click exports today's work as a single self-contained HTML file — KPI strip, per-repo → per-task → per-file breakdown with mode badges and session dots, honest truncation and abort-on-failure semantics. Scoped exports get their own filename suffix.
- **Ctrl+K palette:** fuzzy-jump to any view, repo, or task (cross-tab task picks keep their filter), and run every new action from the keyboard — no router, no dependency.

## Cross-repo

Nothing to install in monitored repos: the capture contract is unchanged (same hook registration, same event version — old and new hooks/servers interoperate in any upgrade order). The database migrates itself additively on first start (`events.session_id`, idempotent). One additive read-only field on `/api/stats`; no new endpoints, no new git calls, `package.json` untouched (zero new dependencies — Mermaid stays its own lazy chunk).
