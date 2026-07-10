# Version Notes

## v0.1.0.0 — Foundation (2026-07-07)

**Key Highlights**

- Initial release: full vertical slice per `temp/Plan/PLAN_v0.1.0.0_TrackingMonitor_Foundation.txt` (51-pass CDD review, 57 findings fixed before implementation)
- **Capture**: PostToolUse hook (`Hook/katlab_tracking_hook.py`) — repo-root discovery via `.git` ancestor walk (F1), forward-slash normalization (F15), exit-0-always, stdlib-only
- **Enhanced plan format**: `Docs/Plan_Format_Spec.md` — column-0 `<task>` blocks (F4), required/optional tag matrix (F53), CRLF/LF + UTF-8/BOM tolerant (F50/F51), warnings for absolute patterns (F52)
- **Server**: FastAPI single process — fixed startup order (F24: plans before catch-up), exactly-once ingest (F13), offset truncation reset (F5), malformed-line skip (F26), atomic plan→task sync (F11/F16), sweep chain for rename/delete + down-across-commit cases (F9/F32/F35/F36), transient-git failure isolation everywhere (F41/F42), two-tier config errors (F14/F43/F44), periodic status poll for non-Claude edits (F22)
- **API**: REST (UM envelope, paginated F38) + WebSocket (event_resolved/task_updated/repo_status_changed/commit_detected/warning — F47)
- **UI**: React+Vite+Tailwind (English) — dynamic repo tabs + ALL (F31), status bar CLEAN/N/OFFLINE (F46), task sidebar, changes-grouped-by-task with task-ref links (F48) + diff viewer (F21 staged-visible), AMBIGUOUS/UNKNOWN manual-pick queue (F17, zero-task guidance F49), History with load-more (F39) + indirect badges, warnings banner, WS auto-reconnect with REST re-sync (F29)
- **Ops**: `Scripts/start_tracking_monitor.bat` (step-abort F54, first-run frontend build F20, portless F10), fresh-clone-safe dirs (F56/F57/F18)
- **Onboarding**: `Docs/Installation_Guideline.md` — merge-not-overwrite hook registration (F40), restart-after-register (F25), stray-dir note (F37)

**Post-release addition (2026-07-09)**: DEMO MODE — `Scripts/start_demo.bat` generates a self-contained scratch repo under gitignored `Demo/runtime/` (marker `.git` dir, sample enhanced plan, 10 synthetic events covering B / A_SCOPED / AMBIGUOUS / UNKNOWN + 2 intentional warnings) and launches the server with `KATLAB_TRACKER_CONFIG` / `KATLAB_TRACKER_DB` env overrides — zero contact with real repos, demo DB isolated from `data/tracking.db`.

**Verification status**: V0/V1/V2/V3/V10 passed in sandbox at release; post-release CFT loop added LIVE passes for V6 (AMBIGUOUS/MANUAL persistence/F16/F49), V7 (restart resilience/F24/F26/F5) and V8 (multi-repo) — all git-free. Remaining user-driven at onboarding: V4 (commit linking), V5 (full UI E2E via real Claude Code session), V9 (poll on real repo), V11 (down-across-commit sweep). CFT fixes: CFT-1..CFT-11 (see plan Status log).
