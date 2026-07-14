# Version Notes

## v0.1.3.0 — Visualization (2026-07-14)

**Key Highlights**

- Inspired by `nicobailon/visual-explainer` (the tracker was all text/lists); adds real visuals. Plan passed a 33-pass CDD review (26 findings R1-R26; all 4 novel algorithms prototype-proven on live data) before implementation
- **Colored diff** (D1): the raw `<pre>` becomes a GitHub-style colored diff — position-aware classification (headers only pre-hunk; in-hunk first char = +added/-removed/context), so even an added line whose content starts with `++ ` colors correctly; honest empty-state messages (gitignored/untracked/no-changes/not-in-commit) render as italic notes, not fake diffs
- **Overview dashboard** (D2, Chart.js): attribution-health doughnut (events by mode) + events-per-task bar (top 10, `(repo, task_ref)`-keyed, unresolved excluded) + 14-day activity line; ALL scope aggregates **configured repos only** (a removed repo's lingering events never pollute it); charts refresh on real syncs, not ticks
- **Capture sparkline** (D3): a pure-SVG 60-minute activity spark in each status-bar chip — "is the hook firing?" at a glance; fed by `activity_buckets` on `/api/repos`
- **Relationship map** (D4, Mermaid, lazy-loaded): per-plan task→commit backbone (file counts on task nodes, uncommitted sink) built from `/api/tasks` + `/api/history`; ≤12-node cap with a hybrid fallback for huge plans; mermaid@11 is dynamically imported (its own Vite chunk — the initial bundle stays lean)
- **One color source** (D6/R26): `theme.ts` `MODE_COLOR` (hex) drives both the badges (inline style) and the doughnut — a mode looks identical everywhere, no Tailwind-class↔hex drift
- **Backend**: one additive read-only endpoint `/api/stats` (zero-filled fixed shape: all 6 modes, 14 UTC days) + `activity_buckets` on `/api/repos`; zero new git calls, no schema change

## v0.1.2.0 — UI/UX Enhancement (2026-07-13)

**Key Highlights**

- Driven by 5 user findings (UF1-UF5, 2026-07-12) after the first real multi-repo day + 4 approved extras (X1-X4); plan passed a 13-pass CDD review loop (15 findings P1-P15 fixed, 5/5 consecutive clean) before implementation
- **UF1 Terms/states**: badges relabeled to human terms with technical names in tooltips (Declared/B, Active task/A_SCOPED, Active task */A_GLOBAL, Pick: multi/AMBIGUOUS, Pick: none/UNKNOWN, Your pick/MANUAL, auto-linked/swept) + header "?" Legend popover; task chips gain derived commit-aware states: `done ✓` vs `done, uncommitted` + per-task uncommitted counts
- **UF2 Diff everywhere**: `/api/diff?commit=` serves per-commit diffs via `git show --format=` (header suppressed); empty HEAD-diffs classified honestly (gitignored / untracked / no changes — prefix-parsed `git status --porcelain --ignored`, P1: ignored DIRS reported, not files); swept-event commit diffs get an explanatory message; History rows now have diff toggles
- **UF3 Sidebar**: tasks grouped by plan file with x/y-done rollups; Active/Done sections (Done collapsed, behind the All chip); finished+committed plans stop cluttering the list
- **UF4 Timestamps**: local `YYYY-MM-DD HH:mm:ss` + relative times ("3m ago") with raw ISO in tooltips (`Frontend/src/format.ts`); 60s re-render tick so idle UIs never freeze; API stays ISO-8601 UTC-Z
- **UF5 Theme**: one hue per mode, 12px base rows, higher-contrast secondary text, colored section headers, hover/focus states
- **X1** bulk-assign manual picks (select-all + one dropdown + candidate-safety + inline result note) · **X2** plan-file edit noise collapsed to one expandable line per task (exact plan_file-set match — covers EA_Dev's temp/<Component>/ layout) · **X3** capture heartbeat per repo ("last capture 3m ago" in the status bar, `last_event_ts` in /api/repos) · **X4** click a task to filter the Changes view (manual-pick queue exempt)
- Zero schema changes; git usage stays strictly read-only (`show --format=`, `status --porcelain --ignored` added to the same allowed set)

## v0.1.1.0 — User-Scope Capture (2026-07-12)

**Key Highlights**

- **Root cause fixed**: the real workflow is ONE Claude Code session (VS Code multi-root, rooted in EA) spanning ALL repos, but Claude Code loads project hooks only from the SESSION root — per-repo hook registration (old guideline Step 1) never fired for the other repos. Verified 2026-07-12: capture was DEAD in every repo (UM had an inert entry; EA had none; both EA `.katlab_tracking/` dirs existed empty from a real server run — server fine, capture dead)
- **Capture**: hook registration moved to ONE user-scope entry (`C:\Users\ADMIN\.claude\settings.json`) — fires in every session, any root; the hook already routed events per edited file (F1), so only registration scope changed. Per-repo registration RETIRED (double-fire risk)
- **Allowlist** (`Hook/katlab_tracking_hook.py`): captures ONLY repos in `Config/repos.yaml` (stdlib regex read; `KATLAB_TRACKER_CONFIG` override; unreadable/empty registry = fail-OPEN capture-all, durability first; supersedes stray-dir note F37). R1 convention: registry `path:` lines stay single-line + single-quoted — the server reads YAML, the hook reads regex
- **UM_Dev registered** as the 3rd monitored repo (`temp/Plan/PLAN_*.txt`; already authoring enhanced-format plans — PLAN_v0.4.3.4 H.1..H.5; older legacy plans parse to zero tasks, harmless)
- **Onboarding contract rewritten** (`Docs/Installation_Guideline.md` + `Guidelines/Onboarding_Prompt.txt`): per-repo steps shrink to legacy-hook cleanup + gitignore + plan rules; registration (user) strictly BEFORE smoke test (allowlist); ordered migration FOLLOW-UPS (EA gitignore BEFORE session restart — prevents tracker self-polluting EA git status)
- **Plan review discipline**: PLAN_v0.1.1.0 passed a 9-pass CDD review loop (4-step methodology, 11 findings fixed, 5 consecutive clean) before implementation
- Verification: V1 hook unit 5/5 (allowlist/fail-open/default-path/malformed-stdin on temp repos), V2 settings merge (all keys preserved), V3 server restart + 3 repos live, V5 guideline dry-read. V4 (real cross-repo smoke) pending user-side follow-ups: EA gitignores → UM legacy-entry removal → workspace session restart → smoke

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

**Post-release addition (2026-07-09; moved to `Scripts/Demo/` 2026-07-15)**: DEMO MODE — `Scripts/Demo/start_demo.bat` (+ `stop_demo.bat` / `restart_demo.bat`) generates a self-contained scratch repo under gitignored `Demo/runtime/` (marker `.git` dir, sample enhanced plan, 10 synthetic events covering B / A_SCOPED / AMBIGUOUS / UNKNOWN + 2 intentional warnings) and launches the server with `KATLAB_TRACKER_CONFIG` / `KATLAB_TRACKER_DB` env overrides — zero contact with real repos, demo DB isolated from `data/tracking.db`.

**Verification status**: V0/V1/V2/V3/V10 passed in sandbox at release; post-release CFT loop added LIVE passes for V6 (AMBIGUOUS/MANUAL persistence/F16/F49), V7 (restart resilience/F24/F26/F5) and V8 (multi-repo) — all git-free. Remaining user-driven at onboarding: V4 (commit linking), V5 (full UI E2E via real Claude Code session), V9 (poll on real repo), V11 (down-across-commit sweep). CFT fixes: CFT-1..CFT-11 (see plan Status log).
