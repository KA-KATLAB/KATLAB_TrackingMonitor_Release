# KATLAB TrackingMonitor

Local web UI that tracks **every Claude Code file change** across multiple repos in real time, attributes each change to **the plan task that caused it (the WHY)**, counts uncommitted work per repo, and reports **CLEAN ✓** once everything is committed.

## How it works

```text
Claude Code session (any root, N repos)
        │  Edit / Write / MultiEdit
        ▼
PostToolUse hook (ONE user-scope registration per PC)
        │  routes by the edited FILE's repo (.git ancestor walk)
        │  allowlist = Config/repos.yaml · fail-open · stdlib-only · exit 0 always
        ▼
<repo>/.katlab_tracking/events.jsonl        (durable append — server may be down)
        ▼
FastAPI server (single process)
  · watchfiles tails events + plan files live
  · hybrid-C resolver → task attribution
  · git module (STRICTLY read-only: status/diff/log/show)
  · SQLite (events · tasks · commits)
        ▼
REST + WebSocket → React UI (status bar · task sidebar · changes-by-task · diff viewer · manual-pick queue · Overview dashboard: KPIs, charts, year calendar, task→commit map · session dots · discipline guard · attention bell + OS alerts · Ctrl+K palette · daily digest export · history)
```

### Hybrid-C resolution — never silently guess

Every event's file is matched against all tasks' `<files>` declarations:

| Matches | Condition | Result |
|---|---|---|
| 1 | — | **MODE B** (declaration wins) |
| >1 | exactly one match `in-progress` | **A_SCOPED** |
| >1 | otherwise | **AMBIGUOUS** → manual pick |
| 0 | exactly one `in-progress` in repo | **A_GLOBAL** |
| 0 | otherwise | **UNKNOWN** → manual pick |

The WHY comes from plan files (`temp/Plan/PLAN_*.txt`) written in the enhanced task-block format:

```text
<task id="B.1">
<title>PostToolUse hook script</title>
<status>in-progress</status>
<files>
Hook/katlab_tracking_hook.py
</files>
<why>Shown in the UI as the reason for the change.</why>
</task>
```

## Quick start

Requirements: Windows · Python 3.10+ on PATH · Node.js (first-run frontend build only).

| Action | Script |
|---|---|
| Start | `Scripts/start_tracking_monitor.bat` → UI at `http://127.0.0.1:8100` |
| Stop / Restart | `Scripts/stop_tracking_monitor.bat` / `Scripts/restart_tracking_monitor.bat` |
| Demo mode (zero real repos, self-generated data) | `Scripts/Demo/start_demo.bat` → `http://127.0.0.1:8101` (stop/restart: `Scripts/Demo/stop_demo.bat` / `restart_demo.bat`) |

Host/port and the monitored-repo registry live in `Config/repos.yaml` (read at startup — restart after changes; the registry doubles as the capture allowlist).

## Onboarding a repo

1. Register the hook **once per PC** at user scope (`~/.claude/settings.json` → PostToolUse → `python "<this repo>/Hook/katlab_tracking_hook.py"`)
2. Per repo: gitignore `.katlab_tracking/` + adopt the plan format — full contract in [Docs/Installation_Guideline.md](Docs/Installation_Guideline.md)
3. Add the repo to `Config/repos.yaml`, restart the server, smoke-test

Key docs: [Plan_Format_Spec.md](Docs/Plan_Format_Spec.md) · [Tracking_Discipline.md](Docs/Tracking_Discipline.md) · [Architecture_Notes.md](Claude_Info/Architecture_Notes.md) · [Version_Notes.md](Claude_Info/Version_Notes.md)

## Repo structure

```text
Hook/         capture hook (stdlib-only, user-scope, allowlist)
Backend/      FastAPI server: config · db · plan parser · resolver · git · watchers · API/WS
Frontend/     React + Vite + Tailwind UI (built to Frontend/dist, served by the backend)
Config/       repos.yaml — registry + allowlist + host/port
Docs/         normative specs: onboarding guideline, plan format, tracking discipline
Guidelines/   copy-paste prompts for monitored-repo Claude Code sessions
Scripts/      start / stop / restart / demo launchers
Claude_Info/  architecture, version notes, monitored-repo registry
Demo/         self-contained demo bootstrap (runtime data gitignored)
```

## Design guarantees

- **Capture never blocks work**: the hook exits 0 always, stdlib-only, no server dependency
- **Git is read-only**: the tracker never mutates any monitored repo (`status`/`diff`/`log`/`show` only)
- **No silent guessing**: uncertain attributions go to the manual-pick queue, not to a wrong WHY
- **Durable**: events append to plain files; the server catches up after downtime

## License

[MIT](LICENSE) © 2026 KATLAB
