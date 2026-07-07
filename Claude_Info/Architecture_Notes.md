# Architecture Notes

Source of truth: `Ref/system_architecture.mermaid` + `Ref/hybrid_C_resolution_flow.mermaid`. This doc is the prose companion.

## 1. System Architecture (4 parts)

### 1.1 Capture — inside each monitored repo's Claude Code

- `Edit` / `Write` / `MultiEdit` fires a **PostToolUse hook** — a tiny Python script
- The hook does ONE thing: append a raw event `{file, timestamp, tool}` to `events.jsonl`
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

Implemented per the reviewed plan (57 findings baked in) + post-implementation CFT fixes CFT-1..CFT-12 (see plan Status log). Key as-built mappings: capture = `Hook/katlab_tracking_hook.py`; server = `Backend/app/` (config → db → plan_parser → resolver → git_module → watcher → api/routes + api/ws → main); UI = `Frontend/src/` (built to `Frontend/dist`, served by FastAPI). Startup order is FIXED (CFT-12 as-built): config → DB → per repo: tracking dir → parse ALL plans → catch-up ingest → commit backfill → initial git status → startup sweep (if CLEAN) → then watchers (events/plans watcher + dedicated `.git/logs` watcher per repo — watchfiles' default filter ignores `.git`) + poll loop. Status refresh: ingest + `.git/logs` change + poll (`status_poll_seconds`) + on `/api/repos`.

## 3. Multi-Repo Design

- The server tracks **N repos simultaneously** — each with its own `events.jsonl`, plan files, and `.git`
- Repo registry: see [Monitored_Repos.md](Monitored_Repos.md)
- Divide-and-conquer: hook + guideline are authored HERE; each monitored repo self-installs per the **Installation Guideline** (authored with the hook implementation) — no logic duplication across repos
