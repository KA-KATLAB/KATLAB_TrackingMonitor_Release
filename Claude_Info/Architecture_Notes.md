# Architecture Notes

Source of truth: `Ref/system_architecture.mermaid` + `Ref/hybrid_C_resolution_flow.mermaid`. This doc is the prose companion.

## 1. System Architecture (4 parts)

### 1.1 Capture — one user-scope hook, every session (v0.1.1.0)

- `Edit` / `Write` / `MultiEdit` fires a **PostToolUse hook** — a tiny Python script registered ONCE per PC at user scope (`C:\Users\ADMIN\.claude\settings.json`), so it fires in EVERY Claude Code session regardless of the session's root (the real workflow is one session spanning several repos)
- The hook routes each event to the repo that OWNS the edited file (nearest `.git` ancestor) and appends a raw event `{file, timestamp, tool}` to that repo's `events.jsonl`
- **Allowlist**: only repos registered in `Config/repos.yaml` are captured (fail-open to capture-all when the registry is unreadable/empty; path lines must stay single-line + single-quoted — the hook reads the registry with a stdlib regex, not YAML)
- **Durable by design**: pure file append — capture keeps working even when the server is down

### 1.2 Data sources (per monitored repo)

| Source | Role |
|---|---|
| `events.jsonl` | raw change events from the hook |
| PLAN files (task blocks) | the "why" — tasks, file declarations, statuses |
| `.git` (logs/HEAD, index) | truth for committed vs. uncommitted, diffs, commit detection |

### 1.3 Local server — FastAPI, single process

- **File watchers** (`watchfiles`): tail `events.jsonl`, watch plan files (parse + cache, re-parse on change)
- **Resolver**: hybrid-C decision tree (section 2) attributes each event to a task
- **Git module**: status · diff · commit detection per repo
- **SQLite**: events · tasks · commits
- **API**: REST + WebSocket (live push to UI)

### 1.4 Browser UI — React + Vite + Tailwind (English)

- **Status bar**: `CLEAN ✓` / `N uncommitted changes` (resets to CLEAN when all changes are committed)
- **Task sidebar**: plan tasks + status chips
- **Main view**: changes grouped by task — why + files + diff viewer + **AMBIGUOUS queue** (manual pick)
- **Overview tab** (v0.1.3.0/v0.1.4.0): KPI metric cards + Chart.js dashboard (attribution doughnut · events-per-task bar · 14-day activity line) + lazy Mermaid task→commit relationship map
- **History tab**: commit → tasks → events (commits counted separately)

## 2. Hybrid-C Resolution (the "why" attribution)

For every event, match the changed file path against ALL tasks' file-pattern declarations → N matches:

| Case | Rule | Result |
|---|---|---|
| N = 1 | declaration wins | **MODE B** — tag with that task |
| N > 1 (shared file) | exactly 1 of the matches is `in-progress` | **MODE A scoped** — tag with that one |
| N > 1 | 0 or ≥2 in-progress among matches | **AMBIGUOUS** → UI manual-pick queue |
| N = 0 (undeclared file) | exactly 1 task in-progress in the WHOLE plan | **MODE A global fallback** |
| N = 0 | 0 or ≥2 in-progress overall | **UNKNOWN** → UI manual-pick queue |

**Key principles:**

1. **B first, A as tie-breaker/fallback** — file declarations beat status; status disambiguates
2. **NEVER silently guess** — uncertain events go to the manual-pick queue, not a wrong "why"
3. Resolved events persist to SQLite and push live to the UI via WebSocket

## 2b. As-Built Notes (v0.1.0.0, 2026-07-07)

Implemented per the reviewed plan (57 findings baked in) + post-implementation CFT fixes CFT-1..CFT-12 (see plan Status log). Key as-built mappings: capture = `Hook/katlab_tracking_hook.py`; server = `Backend/app/` (config → db → plan_parser → resolver → git_module → watcher → api/routes + api/ws → main); UI = `Frontend/src/` (built to `Frontend/dist`, served by FastAPI). Startup order is FIXED (CFT-12 as-built): config → DB → per repo: tracking dir → parse ALL plans → catch-up ingest → commit backfill → initial git status → startup sweep (if CLEAN) → then watchers (events/plans watcher + dedicated `.git/logs` watcher per repo — watchfiles' default filter ignores `.git`) + poll loop. Status refresh: ingest + `.git/logs` change + poll (`status_poll_seconds`) + on `/api/repos`. v0.1.1.0 (2026-07-12): hook registration moved to USER scope + registry allowlist inside the hook (per-repo registration RETIRED — it never fired in the real 1-session-N-repos workflow); UM_Dev registered as the 3rd monitored repo. v0.1.2.0 (2026-07-13): UI/UX pass — human badge terms + Legend, commit-aware task states, context-aware diff (`/api/diff?commit=` via `show --format=`; empty-diff classification via `status --porcelain --ignored`, prefix-parsed), sidebar plan-grouping + click-filter, local timestamps + 60s tick, bulk manual-pick, plan-edit collapse, `last_event_ts` heartbeat in `/api/repos`, favicon. v0.1.3.0 (2026-07-14): visualization — colored diff, Chart.js Overview dashboard behind ONE additive read-only endpoint `/api/stats` (zero-filled fixed shape: all 6 modes, 14 UTC days) + `activity_buckets` on `/api/repos` (60-min sparkline), lazy-loaded Mermaid task→commit map (≤12-node cap, its own Vite chunk), `theme.ts` MODE_COLOR as the single color source; no schema change, no new git calls. v0.1.4.0 (2026-07-17): visual polish, UI-only (sole Backend touch = the version constant) — "Plus Jakarta Sans" + "Azeret Mono" typography wired into Tailwind + Mermaid + Chart.js, 6 KPI cards (needs-a-pick = pick-queue N invariant), Mermaid viewport shell (zoom/pan/fullscreen-expand, DOMParser+adoptNode injection), changed-files tree with churn badges, sticky scroll-spy nav, once-per-session staggered reveal (reduced-motion safe), background atmosphere.

## 3. Multi-Repo Design

- The server tracks **N repos simultaneously** — each with its own `events.jsonl`, plan files, and `.git`
- Repo registry: see [Monitored_Repos.md](Monitored_Repos.md)
- Divide-and-conquer: hook + guideline are authored HERE; the hook is registered ONCE at user scope (maintained here, v0.1.1.0); each monitored repo self-installs only gitignore + plan rules per the **Installation Guideline** — no logic duplication across repos; `Config/repos.yaml` doubles as the capture allowlist
