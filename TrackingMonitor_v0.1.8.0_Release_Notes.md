# KATLAB TrackingMonitor v0.1.8.0 — Release Notes

**Theme:** Replay & Recap — watch your day unfold in 30 seconds, see what the day looked like as timeline lanes, and read your week as a story.

Fifth research harvest (gource-class replay, ActivityWatch-class day timelines, git-wrapped-class recaps): the parked "your day in 30 seconds" centerpiece finally lands, built on a lane view that renders the effort blocks the tracker already computes. The plan survived a 26-pass CDD review loop (22 findings RV1–RV22 fixed in place, ending 5/5 consecutive clean), with the weekly-recap algorithms dry-run verbatim against the real database before implementation — and one honest implementation drop: the proposed KPI count-up turned out to have shipped back in v0.1.4.0, so it is not claimed here.

## Highlights

- **Day lanes (WHAT my day looked like):** a 24-hour timeline card on the Overview — one lane per repo present in that day's events, teal blocks marking your work clusters (the same 15-minute-gap rule as every effort estimate), session-colored dots per event, tooltips with local spans and "≈" effort. A day picker walks any past day; past days are fetched once and immutable, today refreshes live with the dashboard.
- **Activity replay (your day in 30 seconds):** hit ▶ Replay on the lanes card — an amber cursor sweeps the day while events pop into a live feed (time · file · attribution badge) and a running "N events · ≈Xm" counter ticks up. Play/pause, 1×/2×/4×, and a draggable scrubber (keyboard-friendly); a hidden tab pauses the clock instead of skipping ahead; reduced-motion users get manual scrubbing with no auto-play. Pure SVG + one requestAnimationFrame loop — no canvas, no dependencies, no audio.
- **Weekly wrapped (your week, the story):** a "Your week ✨" button (and a Ctrl+K action) opens a story card over the last 7 UTC days — events-per-day mini-bars, your top task by effort (with sessions), busiest hour (local time), files touched, commits, the coupling pair of the week, and your current streak. Computed server-side in one additive `/api/stats` key with deterministic tie-breaks; the modal snapshots at open, so a mid-read sync never rewrites your story.

## Cross-repo

Nothing to install in monitored repos and no database migration: the capture contract, hook, event version, and schema are all untouched. Two additive read-only `/api/events` params (`since`/`until`) and one additive `/api/stats` key (`wrapped`, fixed shape in both return paths); no new endpoints, no new git calls, `package.json` untouched (zero new dependencies).
