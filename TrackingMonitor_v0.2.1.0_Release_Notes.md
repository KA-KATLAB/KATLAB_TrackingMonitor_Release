# KATLAB TrackingMonitor v0.2.1.0 — Release Notes

**Theme:** Records & Snapshots — the tracker remembers your bests and lets you take pictures.

Fourteenth harvest cycle, and the fourth all-frontend release (the backend diff is the version constant only). The plan survived a 6-pass CDD review loop (2 findings RV1–RV2 fixed in place, ending 5/5 consecutive clean) — with the record math proven on live data before implementation: the year's longest streak (11 days) genuinely differs from the current streak (9), which is exactly why records get their own scan.

## Highlights

- **Personal records:** the trophy case grows a memory — a new card beside it (the arcade shelf) tracks your bests from the last 365 days: best day by captures, best day by effort, longest streak, and best rolling week. Break a record by working and the row bursts with a "NEW RECORD 🏆" banner — detected honestly (strictly greater than every *prior* day, so ties don't celebrate and a broken record fires exactly once). Records reach exactly as far as the activity calendar: **(last 365d, UTC)**, said right on the card.
- **Live status favicon:** the browser tab now tells the truth — a teal ring when everything is CLEAN ✓, an amber dot with the uncommitted count when not (100+ shows "99+"). Works in any ordinary tab, no PWA install needed, and always agrees with the taskbar badge (they share the same counting rule, verbatim). Safari ignores dynamic favicons; Chrome/Edge is the house target.
- **City snapshots:** one click on the City view downloads your living workspace as a standalone `.svg` — colors inlined so it opens anywhere (the live rain and Kat are excluded by construction: the model is the picture).

## Cross-repo

Nothing to install in monitored repos, no database migration, no API change — the backend diff is the version constant only. Zero new dependencies (`package.json` untouched); no new localStorage keys; the cross-repo contract is unchanged.
