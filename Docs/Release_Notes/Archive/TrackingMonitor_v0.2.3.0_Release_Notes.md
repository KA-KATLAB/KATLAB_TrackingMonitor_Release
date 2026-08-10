# KATLAB TrackingMonitor v0.2.3.0 — Release Notes

**Theme:** Editor & Health — the dashboard becomes actionable and honest about itself.

Sixteenth harvest cycle, closing out the living-architecture mine: one idea makes the tracker *actionable* (files open in your editor), the other makes it *self-honest* (the tracker audits its own plumbing the way that site audits its docs — "an orphaned page is worse than a missing one"). The plan survived a 16-pass CDD review loop (12 findings RV1–RV12 fixed in place, ending 5/5 consecutive clean).

## Highlights

- **Open in editor:** every file story now carries an **"editor ↗"** chip — one click opens that exact file in VS Code (`vscode://file/…`). It lives in the one place every file chip in the app already converges (plan-board chips, coupling pairs, treemap tiles, changes-by-task rows, city buildings → the file story), so one link covers the whole product. Paths with spaces and even `#` in filenames are escaped correctly. Honest caveat: the link needs VS Code's protocol handler — on a machine without it, the OS shows its "no app" dialog.
- **System health panel:** a quiet **"sys"** chip in the header (also in the palette: "Open system health") opens the tracker's self-audit — server version and uptime, database size, **watcher tasks alive/total** (red when any died), **hook line present/missing** in your user-scope `settings.json` (an honest text-presence check, not schema validation), and per repo: capture freshness ("12m ago" / "never"), the event-log size with **last-log-write on hover** (if the log is newer than the last ingested event, you're looking at ingest lag), and the parse-warning count (the dismissible banner remains the place to read them). Observational only — no polling, no action buttons; the panel makes breakage visible, you fix it.
- **Under the hood:** one new read-only endpoint `GET /api/health` — zero git calls, zero DB writes; the first REST addition since `/badge` in v0.2.0.1.

## Cross-repo

Nothing to install in monitored repos, no database migration, no schema change — the backend diff is `version.py` plus the one new route in `routes.py`. Zero new dependencies; no new localStorage keys; the cross-repo contract is unchanged.
