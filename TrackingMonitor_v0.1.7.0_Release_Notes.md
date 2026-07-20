# KATLAB TrackingMonitor v0.1.7.0 — Release Notes

**Theme:** Story & Delight — every file can tell its whole story, the dashboard shows WHEN you work and WHAT changes together, and the tracker celebrates with you the moment a repo goes CLEAN ✓.

Third harvest from the external research passes (GitHub punch-card/streak conventions, CodeScene-class change coupling, toast/celebration UX, the View Transitions API): seven wow features built purely on data the tracker already captures. The plan survived a 19-pass CDD review loop (15 findings RV1–RV15 fixed in place, ending 5/5 consecutive clean), with both new algorithms dry-run against the real database before implementation — the coupling pass surfaced a real EA library trio, and the punch-card weekday mapping was proven on 668 live events.

## Highlights

- **Change coupling (WHAT moves together):** a top-10 "these files change together" card on the Overview — pairs counted per task from distinct (task, file) sets, plan files excluded, 30-file mega-tasks skipped so noise never drowns signal. Hidden-knowledge surfacing: if `service.mqh` and `service_cfg.mqh` ride the same tasks again and again, the tracker now says so.
- **File story (the life of ONE file):** click any file name in a Changes task group — or either side of a coupling pair — and get the file's chronological biography: every capture across days (UTC day separators), its task refs, session dots, off-current-branch flags, first-seen → last-touched, commits touched, and an honest "≈" effort estimate over the fetched window.
- **Punch card + streak (WHEN you work):** a GitHub-style day-of-week × hour-of-day heatmap in server-local time ("when do I work" is a wall-clock question), sharing the exact teal ramp with the year calendar — plus a "🔥 N-day streak" in the calendar header (UTC days, today-still-zero grace, shown only from 2 days up).
- **Session pulse (alive right now):** a breathing teal dot in a repo's status chip while a capture landed under 5 minutes ago — derived at render time, switched on promptly by the live push and expired naturally by the existing minute tick. Reduced motion keeps the dot, drops the breathing.
- **CLEAN ✓ celebration (the payoff moment):** on every dirty→CLEAN transition, a ~12-particle confetti micro-burst erupts from that repo's CLEAN ✓ chip (visible tab only, hand-rolled CSS, no canvas) and a persistent "🎉 repo is CLEAN ✓" toast lands bottom-right and WAITS — dismissed only by its ✕ or a click anywhere outside. One toast per repo (new transitions replace, never stack), layered below every modal, and complementary to the unchanged hidden-tab OS notification: one durable channel always fires.
- **Buttery navigation:** repo-tab and view switches crossfade via the View Transitions API — feature-detected, skipped under reduced motion, zero custom CSS, no-op on browsers without it. Filters and palette actions stay instant by design.

## Cross-repo

Nothing to install in monitored repos and — for the first time since v0.1.4.0 — no database migration either: the capture contract, event version, hook, and schema are all untouched. Two additive read-only keys on `/api/stats` (`file_coupling`, `punch_card`, fixed shape in both return paths) plus one optional `file` filter param on `/api/events`; no new endpoints, no new git calls, `package.json` untouched (zero new dependencies).
