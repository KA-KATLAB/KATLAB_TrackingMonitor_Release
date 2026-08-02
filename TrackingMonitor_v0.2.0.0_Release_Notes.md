# KATLAB TrackingMonitor v0.2.0.0 — Release Notes

**Theme:** KATLAB City — the living workspace. The v0.2 line opens.

Twelfth harvest cycle, and the first breakthrough release: the tracker stops being a dashboard and becomes a **place**. KATLAB City is a new top-level view (the 4th, beside Changes / Overview / History) that renders your whole workspace as an isometric city — and unlike the GitCity/Gource class that inspired it, this one is *alive*: events rain in as you work, commits fire fireworks, and Kat walks the streets. The plan survived a 15-pass CDD review loop (6 findings RV1–RV6 fixed in place, ending 5/5 consecutive clean), including one caught by a live probe before a line was written: the globally-capped churn list would have starved quiet repos of buildings, so every district is built from its repo's **own** top-20 heat.

## Highlights

- **One district per repo:** each monitored repo gets an isometric platform whose skyline is grown from its hottest files — building height follows churn (square-root honest, comparable across districts), facade color follows recency (the same heat ramp as the treemap: fresh teal → old deep-sea). Hover any building for its file, event count, and last touch; click it to open the file's story. The district plaque mirrors the status bar exactly — CLEAN ✓ green, an amber uncommitted count, or a dimmed OFFLINE district asleep under a "z z".
- **The city is alive:** every capture you make lands as a teal raindrop over its district in real time; when a repo's uncommitted count drops (you committed!), fireworks burst over that district; in-progress plan tasks stand as construction cranes at the district's edge. The sky follows your local clock — dawn, day, dusk, and a starry night — and Kat (your workspace pet, mood and all) wanders the street below. Every animation respects your reduced-motion preference: the city stills into a model.
- **Zero cost to everything else:** the City is purely additive — a 4th view button and a Ctrl+K palette entry. No new dependencies, no schema, no API change; the backend diff is the version constant only. The city feeds itself from the existing per-repo stats endpoint, politely throttled to one refresh round per 10 seconds (the rain doesn't wait — it rides the live WebSocket state).

## Cross-repo

Nothing to install in monitored repos, no database migration, no API or schema change — the backend diff is the version constant only. Zero new dependencies (`package.json` untouched); no new localStorage keys. The v0.2 version line signals the product milestone, not a contract change: everything documented in the Installation Guideline (last contract change: v0.1.10.0) still holds verbatim.
