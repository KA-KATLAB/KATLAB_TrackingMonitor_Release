# KATLAB TrackingMonitor v0.2.2.0 — Release Notes

**Theme:** The Plan Board — plans get a face.

Fifteenth harvest cycle, born from an unusual source: the living-architecture site in one of the monitored repos, whose "current work at the top" philosophy mapped perfectly onto data the tracker already serves. The plan survived a 7-pass CDD review loop (3 findings RV1–RV3 fixed in place, ending 5/5 consecutive clean).

## Highlights

- **The Plan Board:** the top of the Overview now leads with your **active missions** — every plan that still has open tasks renders as a live row: the plan's name, its repo, a done/total count, and a segmented progress bar (done teal, in-progress amber and pulsing, pending slate). The **in-progress task is spotlighted** — short id, title, its "why" (two lines, hover for all of it), and its declared files as chips that click straight into each file's story. Below it, "next up" queues the first pending task. Done-only plans never appear — the board is the present; history lives in History. It's task-driven, not event-driven: a freshly onboarded repo with plans shows its missions before the first capture ever lands.
- **Hygiene:** the Dependabot HIGH on `postcss` is closed — a lockfile-only bump (8.5.16 → 8.5.25, comfortably past the 8.5.18 patch; `package.json` untouched). Honest exposure note: the vulnerable path needed our build to process untrusted CSS with a malicious source-map pointer — it never did; this was hygiene, not an active risk.

## Cross-repo

Nothing to install in monitored repos, no database migration, no API change — the backend diff is the version constant only. Zero **new** dependencies (the postcss bump patches an existing dev dependency inside its already-shipped version range); no new localStorage keys; the cross-repo contract is unchanged.
