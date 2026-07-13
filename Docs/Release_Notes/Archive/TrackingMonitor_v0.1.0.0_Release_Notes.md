# KATLAB TrackingMonitor v0.1.0.0 — Release Notes

**Theme:** Foundation — capture hook, FastAPI server, hybrid-C resolver, React UI, multi-repo registry.

Initial release of the local tracking system: every Claude Code file change across KATLAB repos is captured, attributed to the plan task that caused it (the WHY), counted per repo, and reported CLEAN ✓ once everything is committed. Built from a 51-pass CDD-reviewed plan (57 findings fixed pre-implementation) plus two CFT loops (15 more findings, all live-verified).

## Highlights

- **Capture:** PostToolUse hook (`Hook/katlab_tracking_hook.py`) — stdlib-only, exit-0-always, repo-root discovery via `.git` ancestor walk, forward-slash normalization, durable local append to `.katlab_tracking/events.jsonl` (works with the server down)
- **Enhanced plan format** (`Docs/Plan_Format_Spec.md`): column-0 `<task>` blocks with id/title/status (+ `<files>` globs, `<why>`); CRLF/BOM tolerant; the tracker parses ONLY this format
- **Hybrid-C resolver:** declaration wins (MODE B), single in-progress task breaks ties (A scoped/global), everything uncertain goes to a manual-pick queue — never a silent guess
- **Server:** FastAPI single process — watchfiles tailing events + plans live, read-only git module (status/diff/log/show), SQLite (events · tasks · commits), REST + WebSocket with the UM message standard
- **UI:** React + Vite + Tailwind — CLEAN/N-uncommitted status bar, task sidebar, changes-grouped-by-task with diff viewer, AMBIGUOUS/UNKNOWN manual-pick queue, History (commit → tasks → events) with sweep badges
- **Multi-repo registry** (`Config/repos.yaml`): N repos tracked simultaneously, add a repo = config entry + restart
- **Ops:** start/stop/restart BAT launchers (port-targeted stop); **demo mode** (`Scripts/start_demo.bat`) — self-contained scratch repo + synthetic events on port 8101, zero contact with real repos

## Cross-repo

Divide-and-conquer: this repo is the single source of truth (hook + server + UI + onboarding guideline); monitored repos self-install the minimum per the guideline — the tracker never mutates them (read-only git, hard rule).
