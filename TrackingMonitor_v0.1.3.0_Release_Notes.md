# KATLAB TrackingMonitor v0.1.3.0 — Release Notes

**Theme:** Visualization — the tracker stops being all text and lists.

Inspired by studying `nicobailon/visual-explainer`, the one thing the tracker was missing was visual insight. This release adds a colored diff, a Chart.js dashboard, a capture sparkline, and a lazy-loaded Mermaid relationship graph — all wired into the live React SPA (techniques borrowed, not the static-HTML delivery model). The plan went through a 33-pass CDD review (26 findings fixed; all four novel algorithms prototype-proven on live data) before a line was written.

## Highlights

- **Colored diff:** the monochrome `<pre>` becomes a GitHub-style diff — green added / red removed / blue hunk headers / dim context. Position-aware (headers only pre-hunk; in-hunk the first char decides) so even an added line whose content starts with `++ ` colors right. The honest empty-state messages (gitignored / untracked / no-changes / not-in-commit) render as italic notes, never as fake diffs.
- **Overview dashboard (Chart.js):** attribution-health doughnut (events by mode), events-per-task bar (top 10), and a 14-day activity line. ALL scope aggregates configured repos only — a repo you removed from `repos.yaml` never pollutes the charts with lingering data. Charts refresh on real captures, not on idle ticks.
- **Capture sparkline:** a tiny pure-SVG spark of the last 60 minutes in each status-bar chip — "is the hook actually firing?" at a glance, next to "last capture 3m ago".
- **Relationship map (Mermaid, lazy):** pick a plan → a task→commit backbone graph (file counts on task nodes, an "uncommitted" sink), built from tasks + commit history. Node-capped with a hybrid fallback for very large plans. Mermaid loads only when you open a map (its own bundle chunk).
- **One color source:** a mode's hue is defined once and shared by the badges and the doughnut — no drift.

## Cross-repo

UI + one read-only aggregate endpoint (`/api/stats`) only — no capture/hook/resolver/schema change, monitored repos untouched, and **zero new git calls** (all reads are SQLite; charts and diagrams are client-side).
