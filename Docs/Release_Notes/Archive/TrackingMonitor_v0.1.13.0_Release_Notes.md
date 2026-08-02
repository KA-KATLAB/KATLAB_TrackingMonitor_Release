# KATLAB TrackingMonitor v0.1.13.0 — Release Notes

**Theme:** Snake, Pet & Clock — the arcade layer grows a heart and a rhythm.

Eleventh harvest cycle (Platane/snk class, vscode-pets class, polar-dial class): an activity snake devours your year, a tiny workspace pet mirrors repo truth, and today gets a clock face. The plan survived a 20-pass CDD review loop (13 findings RV1–RV13 fixed in place, ending 5/5 consecutive clean) — including two delight defects caught by live simulation before a line was written: a col-0 snake would have crawled ~93% dead grid on a young install, and the fixed version would then have flashed by in ~0.9 seconds. The shipped snake starts where your activity starts and always plays a ~4-second minimum show.

## Highlights

- **Activity snake:** the year-calendar card gains a third view — `flat | city | snake`. A teal snake sweeps the grid column by column, eating every active day as it passes (cells fade as they're devoured), then signs off with "year devoured — N events 🐍". It auto-plays when you switch to the view, replays on ▶, and adapts its route and speed to your data: young installs get a snappy show starting at their first active week, a full year gets the deliberate ~15-second crawl. Inspired by the GitHub contribution snake — deliberately not a port (no pathfinding AI, honest serpentine).
- **Kat, the workspace pet:** a tiny SVG cat lives in the header beside the combo meter (and big on the focus wall), and its mood is a pure mirror of your workspace: **content** when everything is committed ✓ · **curious** while fresh uncommitted work exists · **anxious** once uncommitted work ages past 48h (the bell's own threshold — one shared constant) · **asleep** when every repo is offline · **excited** while a live capture combo (≥5) is running. Kat breathes, blinks, and bounces — all pure CSS, all silenced by your reduced-motion preference. No feeding, no games: Kat is a mirror, not a tamagotchi.
- **Today's radial clock:** the day-lanes card gains a `lanes | clock` toggle — the same day, re-projected as a 24-hour dial (midnight at top). Hour wedges grow with activity (area-honest square-root scaling, the shared heat ramp), quiet hours are hairline ticks, and a teal hand shows the current minute when you're looking at today. Same fetched data as the lanes — zero new requests; replay stays a lanes feature (the clock button politely waits until you exit replay).

## Cross-repo

Nothing to install in monitored repos, no database migration, no API or schema change — the backend diff is the version constant only. Zero new dependencies (`package.json` untouched); one new localStorage key (`katlab.dayView`) plus a new "snake" value under the existing `katlab.calendarView` — both live entirely in your browser.
