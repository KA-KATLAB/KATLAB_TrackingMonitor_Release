# KATLAB TrackingMonitor v0.1.10.0 — Release Notes

**Theme:** Identity & Focus — know what each repo is, see where the work lives, and put the one number that matters on the wall.

Seventh research harvest (onefetch-class identity cards, Git-Heat-Map-class treemaps, kiosk-class ambient dashboards): the three seeds backlogged after v0.1.9.0 land together. The plan survived two CDD review loops — 13 passes before a user amendment, 11 more after it (12 findings RV1–RV12 fixed in place, both loops ending 5/5 consecutive clean) — with the identity/churn aggregations, the squarified layout (the Bruls et al. canonical fixture), and the amendment's exact blast radius all dry-run-proven on the real database before implementation.

## Highlights

- **Repo identity card (WHAT each repo is):** a pure-SVG donut of the top file extensions your captures actually touch — churn-weighted, so it reads like the repo's real fingerprint — plus the facts line: sessions, first capture, all-time commits, and 365-day effort. On the ALL tab the blend is your workspace identity; each repo tab re-draws its own.
- **Codebase heat treemap (WHERE the work lives):** the top-20 churned files as a squarified treemap (Bruls et al. 2000, hand-rolled, zero deps) — tile size = captures, tile color = recency (today burns teal, old work fades) — and every tile clicks through to that file's full story. Plan files are excluded so the map shows CODE heat.
- **Ambient focus mode (the wall display):** Ctrl+K → "Enter focus mode" turns any monitor into a mission-control wall — a giant live CLEAN ✓ / N-uncommitted hero (per repo, or x/y clean across all), a minute clock, the "in flight" feed of uncommitted changes that drains to "All clear ✨" the moment you commit, the session pulse, today's effort + streak, and the isometric skyline as ambient texture. Esc or ✕ exits; a stray click never kills the wall.
- **Cleaner stats everywhere (Amendment A1):** plan files whose tasks have left the cache no longer pollute the change-coupling card or the weekly wrapped pair — the same convention-anchored exclusion now guards all four plan-file-excluding surfaces. On real data this removed exactly the noise pairs (plan↔code meta-coupling) and none of the code↔code signal.

## Cross-repo

Nothing to install in monitored repos and no schema change: the capture contract, hook, event version, and database tables are all untouched. Two additive read-only `/api/stats` keys (`identity` + `file_churn`, fixed shape in both return paths, fed by one shared file-level scan); no new endpoints, no new git calls, `package.json` untouched (zero new dependencies).
