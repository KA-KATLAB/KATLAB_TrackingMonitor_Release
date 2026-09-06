# KATLAB TrackingMonitor Repository Guide

This file carries operational detail that would make the root `AGENTS.md` too large. It guides Codex; it does not replace the authoritative specifications in `Docs/` or the design history in `Claude_Info/`.

## 1. Source hierarchy

Use sources in this order for project decisions:

1. The user's current request and explicit rulings.
2. Root `AGENTS.md` and this guide.
3. Normative contracts in `Docs/`.
4. Current implementation and configuration.
5. Architecture and decision history in `Claude_Info/`.
6. Root and archived release notes for version-specific intent.

When prose and running code disagree, do not silently choose one. Establish whether the task is to preserve shipped behavior or restore the documented contract, then report the discrepancy.

`CLAUDE.md` and `Claude_Info/Architecture_Notes.md` mention `Ref/system_architecture.mermaid` and `Ref/hybrid_C_resolution_flow.mermaid`, but `Ref/` is absent from the current checkout. Do not fabricate those diagrams. Use the prose architecture notes and report the missing source if a task depends on it.

## 2. Repository map

| Path | Ownership |
|---|---|
| `Hook/katlab_tracking_hook.py` | User-scope PostToolUse capture, repo discovery, allowlist, durable JSONL append |
| `Backend/app/config.py` | YAML loading, authoring validation, offline-repo handling |
| `Backend/app/db.py` | SQLite schema initialization, migrations, event/task/commit queries, statistics |
| `Backend/app/plan_parser.py` | Enhanced `<task>` plan parsing and warnings |
| `Backend/app/resolver.py` | Glob semantics and Hybrid-C attribution |
| `Backend/app/git_module.py` | The only Git subprocess boundary; read-only operations only |
| `Backend/app/watcher.py` | Startup orchestration, plan/event/Git watchers, polling, sweeps |
| `Backend/app/api/routes.py` | REST endpoints and envelope behavior |
| `Backend/app/api/ws.py` | WebSocket clients and broadcasts |
| `Backend/app/main.py` | FastAPI lifecycle, static UI, badges, Chronicle serving/child lifecycle |
| `Backend/app/version.py` | Canonical application version |
| `Frontend/src/api.ts` | REST types and client; backend contract mirror |
| `Frontend/src/ws.ts` | WebSocket connection/reconnect boundary |
| `Frontend/src/App.tsx` | Global live state, synchronization, navigation, cross-view effects |
| `Frontend/src/OverviewView.tsx` | Overview composition |
| `Frontend/src/theme.ts` | Shared modes, colors, timing thresholds, and cross-feature helpers |
| `Frontend/src/*.tsx` | Focused cards, views, modals, visualizations, and interaction modules |
| `Docs/UI_Design_System.md` | Normative frontend design, accessibility, responsive, motion, and bounded-rendering contract |
| `Scripts/Chronicle/generate.py` | REST-fed Chronicle model, atomic generation/build, loop lifecycle |
| `Scripts/Chronicle/pages.py` | Generated Markdown/config/CSS/JS renderers |
| `Scripts/Chronicle/scribe.py` | Bounded headless-Claude story generation |
| `Scripts/*.bat` | Windows start/stop/restart lifecycle |
| `Config/repos.yaml` | Server settings, monitored-repo registry, capture allowlist |
| `Docs/` | Normative plan, tracking, and onboarding contracts |
| `Guidelines/` | Copyable instructions used inside monitored repos |
| `Claude_Info/` | Architecture, monitored-repo, plan-format, and version history |

## 3. Data and control flow

1. The user-scope hook receives a Claude Code tool event.
2. It finds the edited file's nearest `.git` ancestor and checks the configured allowlist.
3. It appends one versioned JSON object to `<repo>/.katlab_tracking/events.jsonl`.
4. The tracker parses all configured plans before ingesting missed JSONL records.
5. The resolver matches each file against task declarations and records an exact or unresolved attribution.
6. SQLite persists events, tasks, manual choices, commits, offsets, and derived relations.
7. Read-only Git checks provide dirty state, diffs, branch, HEAD, and new commit metadata.
8. REST provides snapshots; WebSocket messages trigger prompt client resynchronization.
9. React renders live state. Chronicle periodically reads REST and atomically replaces its built site.

## 4. Core contracts

### 4.1 Capture and ingest

- The hook must use only Python's standard library and must never interrupt Claude Code work.
- Repo paths written to events are repo-relative with forward slashes.
- Event schema version is `1`; `session_id` and `branch` are optional compatibility fields.
- Append durability is more important than server availability.
- Ingest consumes only through the last complete newline.
- Malformed records warn and advance the offset; no malformed line may wedge replay forever.
- Config unreadable/empty is the documented hook fail-open case. Do not casually invert this policy.

### 4.2 Plan parsing and attribution

- The normative format is `Docs/Plan_Format_Spec.md`; legacy plans intentionally parse as zero tasks.
- `<task>` must start at column zero. Required fields are `id`, `title`, and one valid status.
- File patterns are repo-relative and use the custom glob rules: `*` does not cross `/`, `**` does, `?` matches one character.
- Match all tasks before considering status:
  - one file match -> `B`;
  - multiple matches and one matching task in progress -> `A_SCOPED`;
  - multiple matches without a unique active match -> `AMBIGUOUS`;
  - no match and one repo-wide active task -> `A_GLOBAL`;
  - no match without a unique active task -> `UNKNOWN`.
- Only explicit user assignment produces `MANUAL`.

### 4.3 Configuration

- Bad YAML, invalid/duplicate IDs, and duplicate normalized paths are authoring failures and must fail fast.
- Missing repository paths are environmental drift: mark those repos offline and keep the server alive.
- `Config/repos.yaml` is loaded once; configuration changes require restart.
- The hook regex requires each repo `path:` to be single-line and single-quoted.
- `KATLAB_TRACKER_CONFIG` and `KATLAB_TRACKER_DB` isolate demo/test instances.

### 4.4 Git and commit correlation

- The allowed Git verbs are `status`, `diff`, `log`, and `show` only.
- All Git calls belong in `git_module.py`, use bounded execution, and raise `GitError` for callers to isolate.
- The UI diff is against `HEAD` so staged changes remain visible.
- Detect commits oldest-first and link eligible events before clean sweeps.
- A clean sweep may attach otherwise-unlinkable events to `HEAD`; keep its documented attribution limitations honest.
- Commit identity is the composite `(repo_id, hash)`, because separate working copies can share hashes.

### 4.5 Database and API

- Migrations are idempotent and preserve existing runtime databases.
- Offset advancement and event insertion remain in one transaction.
- Maintain fixed shapes for empty and non-empty `/api/stats` responses.
- Preserve the standard API envelope: `success`, `data`, `message`, and timestamp.
- Existing filters and pagination must compose rather than silently override one another.
- Additive contract changes require matching TypeScript types and all empty/error paths.
- Avoid extra Git calls inside statistics or display-only features.

### 4.6 Watcher lifecycle

The required startup sequence is:

1. initialize DB and per-repo state;
2. create tracking directories for online repos;
3. parse all plans;
4. catch up complete event lines;
5. backfill recent commits;
6. refresh initial Git status;
7. sweep unlinked events only if clean;
8. start repo, `.git/logs`, and polling tasks.

Plan-before-catch-up prevents permanent `UNKNOWN` attribution. The dedicated Git watcher exists because default file-watcher filtering ignores `.git`.

### 4.7 Frontend

- Follow [`Docs/UI_Design_System.md`](../Docs/UI_Design_System.md) for visual tokens, shared controls, dialog behavior, responsive composition, data alternatives, motion, and bounded rendering.
- Treat `api.ts` interfaces as executable contract mirrors, not convenient approximations.
- `App.tsx` owns global snapshots and cross-view effects; keep feature-specific algorithms in focused modules.
- Scope statistics intentionally: some features are tab-scoped, while workspace identity such as Kat's wardrobe is unscoped.
- Preserve stable callback identities for overlays whose effects restore focus.
- Async effects must protect against stale completion with the existing alive/cancellation patterns.
- Keep accessibility semantics, keyboard behavior, focus restoration, and `prefers-reduced-motion` behavior intact.
- Reuse shared mode colors, ramps, time thresholds, formatters, and celebration recipes from their current single homes.
- The service worker is network-only by design; do not introduce stale caching into a live monitor.

### 4.8 Chronicle and generated content

- Chronicle consumes the running server's REST API; it does not read the DB directly.
- All remote reads complete before writes begin.
- Writes are UTF-8, atomic, and write-only-if-changed where specified.
- Build into a replacement directory and swap atomically so the served site stays whole on failure.
- Edit `generate.py`, `pages.py`, or source docs; never edit `Chronicle/runtime/` output.
- The Scribe's daily quota, retry, validation, data-as-untrusted-content, and authorship-footer rules are cost and honesty boundaries.
- Demo mode must remain isolated and must not spawn the Chronicle loop.

## 5. Working workflows

### 5.1 Fix or feature

1. Confirm the target behavior, affected layer, and active plan.
2. Read the nearest code plus relevant normative/history sections.
3. Set exactly one plan task to `in-progress` and verify its `<files>` coverage.
4. Make the smallest complete change, including contract mirrors and empty/error paths.
5. Run focused checks, then the layer-level check from the matrix below.
6. Update durable documentation only where behavior or an invariant changed.
7. Mark the task `done` and report the ignored plan change separately.

### 5.2 Release work

- Follow the active plan and the four-part KATLAB version convention.
- Change `Backend/app/version.py` only when release scope requires it.
- Keep one current `TrackingMonitor_vX.Y.Z.W_Release_Notes.md` at the root.
- Move the prior current release notes into `Docs/Release_Notes/Archive/`; do not copy stale claims forward.
- Update `Claude_Info/Version_Notes.md` with evidence-backed, as-built behavior.
- Rebuild the frontend when its source changes and verify the served artifact when a release claim depends on it.
- Never perform the commit, tag, or push unless the user explicitly requests that exact Git action.

### 5.3 Onboarding contract changes

- Change the contract here only; do not apply it directly in EA, UM, or another monitored repo.
- Keep `Docs/Installation_Guideline.md`, `Docs/Tracking_Discipline.md`, `Docs/Plan_Format_Spec.md`, and `Guidelines/Onboarding_Prompt.txt` consistent.
- Preserve user-scope hook registration and forbid duplicate per-repo registration.
- Validate the single-line, single-quoted registry-path example.

## 6. Verification matrix

| Change | Minimum useful checks |
|---|---|
| Frontend TypeScript/React/CSS | `npm run build` from `Frontend/`; targeted pure-helper/render check when behavior is algorithmic |
| Backend Python | Compile changed modules; focused function/API check; controlled demo smoke when orchestration changes |
| Plan parser/resolver | Fixtures for valid, malformed, duplicate, absolute-pattern, glob, and all resolution modes affected |
| DB/schema/stats | Temporary DB migration plus empty and populated result shapes; check composite repo/hash behavior when relevant |
| Hook | Isolated temp Git repos and config; malformed input, allowlist, path normalization, and exit-success behavior |
| Watcher/commit logic | Controlled temp repo/demo; startup ordering, replay offset, transient Git failure, commit-before-sweep behavior |
| API/WebSocket | Endpoint status/envelope/pagination/filter cases and message-triggered resync behavior |
| Chronicle | Generate/build against a running isolated tracker, then `python Scripts/Chronicle/generate.py --verify` |
| Scripts/config | Fresh-path reasoning, Windows quoting, configured-port behavior, and no persistent console regression |
| Documentation | Links, paths, version claims, terminology, encoding, and consistency across normative copies |

Do not run every check for every edit. Choose the smallest set that can falsify the changed behavior, and expand only when failures or cross-layer risk justify it.

## 7. Current repository facts

- The supported environment is Windows with Python 3.10+ and Node.js.
- The frontend's only standard verification script is `npm run build` (`tsc -b && vite build`).
- No general committed Python/JS test suite exists; historical “batteries” were targeted release checks.
- Product Python dependencies are in `Backend/requirements.txt`; Chronicle has a separate pinned set in `Scripts/Chronicle/requirements.txt`.
- The primary launcher is `Scripts/start_tracking_monitor.bat`; demo uses `Scripts/Demo/start_demo.bat`.
- Runtime state and generated output are intentionally gitignored.
