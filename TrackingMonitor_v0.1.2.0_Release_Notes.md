# KATLAB TrackingMonitor v0.1.2.0 — Release Notes

**Theme:** UI/UX enhancement — human terms, context-aware diffs, tidy sidebar, readable time, focus-friendly theme.

After the first real multi-repo day, five user findings (UF1–UF5) + four approved extras (X1–X4) drove this release. The plan passed a 13-pass CDD review (15 findings fixed, 5/5 clean) before implementation, and an 8-pass post-implementation CFT loop (3 more findings + the user-reported favicon 404).

## Highlights

- **Human terminology:** badges say "Declared / Active task / Pick: multi / Pick: none / Your pick / auto-linked" with the technical mode name in every tooltip; a header **"?" Legend** explains the whole attribution model in plain English
- **Commit-aware task states:** `done ✓` (all committed) vs `done, uncommitted` chips + per-task uncommitted counts in the sidebar
- **Diff everywhere:** per-commit diffs in History (`git show --format=`), honest empty-states ("gitignored — git never sees it", "untracked", "not part of this commit" for auto-linked events) instead of silent blanks
- **Tidy sidebar:** tasks grouped by plan file with x/y-done rollups; finished+committed plans collapse into a Done section behind the All chip; clicking a task filters the Changes view (manual-pick queue exempt)
- **Readable time:** local `YYYY-MM-DD HH:mm:ss` + "3m ago" relatives (raw ISO in tooltips), 60s tick so idle UIs never freeze; API stays ISO-8601 UTC-Z
- **Focus-friendly theme:** one hue per attribution mode, larger type, higher contrast, colored section headers, hover/focus states
- **Bulk manual-pick:** select-all + one dropdown + candidate-safety, with an inline result note
- **Plan-edit noise collapsed** to one expandable line per task; **capture heartbeat** ("last capture 3m ago") per repo in the status bar; **favicon** added (no more /favicon.ico 404)

## Cross-repo

UI + read-API only — no capture/hook change, no resolver change, no DB schema change; monitored repos untouched. Git usage stays strictly read-only (`show --format=` and `status --porcelain --ignored` join the same allowed set).
