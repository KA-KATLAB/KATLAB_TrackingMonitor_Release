# KATLAB TrackingMonitor v0.1.11.0 — Release Notes

**Theme:** Rings & Constellations — close your rings, read your stars.

Ninth harvest cycle (Apple-rings class, chord/dependency-wheel class): the first **all-frontend release** — the backend, schema, API, and hook are untouched by design. The plan survived a 10-pass CDD review loop (5 findings RV1–RV5 fixed in place, ending 5/5 consecutive clean), with the constellation math dry-run-proven on the live coupling pairs before implementation.

## Highlights

- **Daily goal rings:** three nested Apple-style rings on the Overview — captures, effort minutes, and commits against YOUR daily targets (⚙ to edit; sensible defaults 30 / 120 / 2; stored locally). The rings tick live as you work, and closing one fires a small particle burst in its ring color. Progress past 100% caps visually while the legend tells the truth (150% is 150%). A tab switch shows that repo's progress against your global goals — and never false-celebrates.
- **Coupling constellation:** "Files that change together" reborn as a pure-SVG arc diagram — files as stars on a baseline (hubs first), arcs weighted and tinted by exactly the same strength rule as the list badges. Every star clicks through to its file story. A `list | arcs` toggle keeps the classic ranked list one click away (arcs are the new default).
- **Rings on the wall:** focus mode gains a compact read-only ring cluster — your goal progress ambient on the second monitor, bursting when you close a ring mid-session.

## Cross-repo

Nothing to install in monitored repos, no database migration, no API change — the first release where `git diff` touches the backend ONLY at the version constant. Zero new dependencies (`package.json` untouched); two new localStorage keys (`katlab.goals`, `katlab.couplingView`) live entirely in your browser.
