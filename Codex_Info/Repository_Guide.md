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
| `Hook/katlab_tracking_hook.py` | Fail-safe Claude/Codex entry point and channel router |
| `Hook/katlab_activity.py` | Strict registries, safe paths, atomic activity transport, durable JSONL append |
| `Hook/provider_adapters.py` | Provider payload projection into metadata-only records |
| `Backend/app/config.py` | YAML validation, offline-repo handling, and deeply immutable startup snapshot |
| `Backend/app/db.py` | SQLite migrations and event/task/plan/evidence/commit queries |
| `Backend/app/activity.py` | Strict central-inbox validation, recovery, admission, and ingestion |
| `Backend/app/readiness.py` | Authoritative requirement and seven-state Mission evaluation |
| `Backend/app/provider_health.py` | Independent adapter/configuration/recency facts per provider |
| `Backend/app/plan_parser.py` | Enhanced `<task>` plan parsing and warnings |
| `Backend/app/resolver.py` | Glob semantics and Hybrid-C attribution |
| `Backend/app/git_module.py` | The only Git subprocess boundary; read-only operations only |
| `Backend/app/watcher.py` | Startup orchestration, plan/event/Git watchers, polling, sweeps |
| `Backend/app/api/routes.py` | REST endpoints and envelope behavior |
| `Backend/app/api/ws.py` | WebSocket clients and broadcasts |
| `Backend/app/main.py` | FastAPI lifecycle, static UI, badges, Chronicle serving/child lifecycle |
| `Backend/app/chronicle_auth.py` | Revocable signer state and bounded HMAC response proofs for the owned Chronicle child |
| `Backend/app/version.py` | Canonical application version |
| `Frontend/src/api.ts` | REST types and client; backend contract mirror |
| `Frontend/src/ws.ts` | WebSocket connection/reconnect boundary |
| `Frontend/src/App.tsx` | Global live state, synchronization, navigation, cross-view effects |
| `Frontend/src/AppShell.tsx` | Presentation-only header, navigation rail and workspace context |
| `Frontend/src/RepositorySwitcher.tsx` | Shared modal wrapper for existing scope choices and paging |
| `Frontend/buildVersion.mjs` | Data-only canonical version reader for Vite; no Python/Git execution |
| `Frontend/src/ApplicationBrand.tsx` | Visible loaded UI build and existing System action |
| `Frontend/src/MissionView.tsx` | Verification cockpit, evidence queue, and session flight recorder |
| `Frontend/src/missionModel.ts` | Pure Mission labels, ordering, lanes, and entry-state normalization |
| `Frontend/src/OverviewView.tsx` | Overview composition |
| `Frontend/src/theme.ts` | Shared modes, colors, timing thresholds, and cross-feature helpers |
| `Frontend/src/*.tsx` | Focused cards, views, modals, visualizations, and interaction modules |
| `Docs/UI_Design_System.md` | Normative frontend design, accessibility, responsive, motion, and bounded-rendering contract |
| `Scripts/Chronicle/runtime.py` | Chronicle interpreter binding, private capability lifecycle, and authenticated loopback client |
| `Scripts/Chronicle/safe_io.py` | Native no-follow roots, coherent source/runtime snapshots, leases, swaps, and pinned asset authority |
| `Scripts/Chronicle/generate.py` | Signed Chronicle model capture, generated mirrors, atomic build, loop, verify, and view modes |
| `Scripts/Chronicle/pages.py` | Generated Markdown/config/CSS/JS renderers |
| `Scripts/Chronicle/scribe.py` | Intentionally disabled Scribe CLI and inert import-compatibility hook |
| `Scripts/record_evidence.py` | Validated explicit manual check/review evidence publisher |
| `Scripts/render_hook_config.py` | Read-only provider preflight and merge-ready hook renderer |
| `Scripts/lifecycle_port.py` | Configured-port discovery, stop orchestration, readiness and browser handoff |
| `Scripts/lifecycle_process.py` | Bounded Windows ownership proof and retained-handle termination |
| `Scripts/*.bat` | Windows start/stop/restart lifecycle |
| `Config/repos.yaml` | Server settings, monitored-repo registry, fail-closed capture allowlist |
| `Config/checks.json` | Versioned automatic/manual verification registry |
| `Docs/` | Normative plan, tracking, and onboarding contracts |
| `Guidelines/` | Copyable instructions used inside monitored repos |
| `Claude_Info/` | Architecture, monitored-repo, plan-format, and version history |

## 3. Data and control flow

1. User-scope Claude/Codex hooks receive supported lifecycle or tool events.
2. Strict adapters retain bounded metadata and map only registered repositories.
3. File attribution appends to `<repo>/.katlab_tracking/events.jsonl`; provider and
   verification activity is atomically published to the central inbox.
4. The tracker parses all configured plans before ingesting missed records.
5. The resolver matches each file against task declarations and records an exact or unresolved attribution.
6. SQLite persists events, plan snapshots, requirements, evidence, immutable assignment history, commits, offsets, and derived relations.
7. Read-only Git checks provide dirty state, diffs, branch, HEAD, and new commit metadata.
8. One backend readiness engine derives evidence freshness, blockers, and Mission state.
9. REST provides snapshots; additive WebSocket signals trigger bounded REST resynchronization.
10. React renders six views. An owned Chronicle child consumes bounded,
    HMAC-proven REST snapshots and promotes a validated replacement site.

## 4. Core contracts

### 4.1 Capture and ingest

- Hook modules use only Python's standard library and never interrupt provider work.
- Repo paths written to events are repo-relative with forward slashes.
- Event schema version is `1`; `session_id` and `branch` are optional compatibility fields.
- Append durability is more important than server availability.
- Ingest consumes only through the last complete newline.
- Malformed records warn and advance the offset; no malformed line may wedge replay forever.
- Missing, unreadable, empty, invalid, or ambiguous repo configuration disables capture for that event while the provider continues. Never restore capture-all fallback behavior.

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
- Backend passes one deeply immutable `ConfigSnapshot`: frozen configuration,
  tuples and read-only mappings plus the canonical file path, native identity,
  and content SHA-256 all refer to the same startup read.
- The hook regex requires each repo `path:` to be single-line and single-quoted.
- `KATLAB_TRACKER_CONFIG`, `KATLAB_TRACKER_DB`, and
  `KATLAB_TRACKER_ACTIVITY_DIR` isolate demo/test instances.
- Generated static status is accepted only with `KATLAB_TRACKER_DEMO=1`,
  `demo: true`, a workspace-relative path under `Demo/runtime`, and its marker.

### 4.4 Git and commit correlation

- The allowed Git verbs are `status`, `diff`, `log`, and `show` only.
- All Git calls belong in `git_module.py`, use bounded execution, and raise `GitError` for callers to isolate.
- The UI diff is against `HEAD` so staged changes remain visible.
- Detect commits oldest-first and link eligible events before clean sweeps.
- A clean sweep may attach otherwise-unlinkable events to `HEAD`; keep its documented attribution limitations honest.
- Commit identity is the composite `(repo_id, hash)`, because separate working copies can share hashes.
- Mission and `record_evidence.py` never invoke Git or mutate repositories; they
  cannot commit, push, check out, create, or delete a branch.

### 4.5 Database and API

- Migrations are idempotent and preserve existing runtime databases.
- Offset advancement and event insertion remain in one transaction.
- Maintain fixed shapes for empty and non-empty `/api/stats`, `/api/mission`,
  `/api/activity`, and `/api/sessions` responses.
- Preserve the standard API envelope: `success`, `data`, `message`, and timestamp.
- Existing filters and pagination must compose rather than silently override one another.
- Additive contract changes require matching TypeScript types and all empty/error paths.
- Avoid extra Git calls inside statistics or display-only features.

### 4.6 Watcher lifecycle

The required startup sequence is:

1. load and validate repositories and checks;
2. initialize/migrate DB, per-repo state, and the central inbox;
3. parse and reconcile every online repository's plans globally;
4. catch up complete legacy file-event lines globally;
5. ingest pending central activity after the complete plan/event world exists;
6. hydrate commits, detect/link new history, backfill normalized task keys, and
   refresh current status;
7. sweep remaining unlinked events only after a valid clean observation;
8. compute the initial readiness snapshot;
9. start repo/Git/activity watchers and the polling safety loop. Demo-status
   entries receive no Git watcher or Git probe.

Plan-before-catch-up prevents permanent `UNKNOWN` attribution. The dedicated Git watcher exists because default file-watcher filtering ignores `.git`.

### 4.7 Frontend

- Follow [`Docs/UI_Design_System.md`](../Docs/UI_Design_System.md) for visual tokens, shared controls, dialog behavior, responsive composition, data alternatives, motion, and bounded rendering.
- Treat `api.ts` interfaces as executable contract mirrors, not convenient approximations.
- `App.tsx` owns global snapshots and cross-view effects; keep feature-specific algorithms in focused modules.
- Navigation has six canonical views in order: Changes, Mission, Overview,
  History, City, Chronicle. Mission remains route-lazy and outside attract mode.
- v0.4 uses a 14rem view rail from 1280px, Navigation drawer below, and Tasks,
  repository scope and status drawers at every width. Tools owns secondary
  reports/Experience/preferences; scope search never overwrites unfiltered paging.
- Header version is the loaded UI build. System shows the backend version
  separately; unknown or malformed values are not a mismatch or a render error.
  Do not add health polling for version display. Verify rebuilt/served assets
  and tab reload independently of backend restart.
- Current clean/count summaries require valid online Git status and disclose
  known coverage. Never reinterpret retained invalid/offline values as clean/zero.
- Mission readiness comes only from the backend; React displays reasons and never
  infers a pass. Session identity is always `(provider, session_id)`.
- Scope statistics intentionally: some features are tab-scoped, while workspace identity such as Kat's wardrobe is unscoped.
- Preserve stable callback identities for overlays whose effects restore focus.
- Async effects must protect against stale completion with the existing alive/cancellation patterns.
- Keep accessibility semantics, keyboard behavior, focus restoration, and `prefers-reduced-motion` behavior intact.
- Reuse shared mode colors, ramps, time thresholds, formatters, and celebration recipes from their current single homes.
- The service worker is network-only by design; do not introduce stale caching into a live monitor.

### 4.8 Chronicle and generated content

- Production Chronicle is optional and owned by the Backend lifespan. Demo mode
  or an explicit config override rejects Chronicle before production file I/O.
  Incomplete optional-startup cleanup remains in a retained ledger for shutdown
  retry with signing revoked; persistent cleanup failures are reported and preserved.
- Chronicle selects an absolute `KATLAB_CHRONICLE_PYTHON` or the first PATH
  Python once, binds and rechecks its native identity, and probes its reviewed
  dependencies before mutation or launch. This interpreter is deliberately
  separate from Backend's `.venv`.
- The fixed `Chronicle/runtime/.chronicle_capability.json` is a bounded canonical
  private record for the current Windows user and SYSTEM. It binds one random
  response key and session to the exact live parent PID/creation time and numeric
  loopback origin. This protects the local protocol from ordinary accidental
  access; it does not isolate hostile code running as the same owner.
- `chronicle_auth.py` signs only eligible bounded REST responses while the owned
  child remains live. `runtime.py` verifies a fresh nonce/HMAC proof before JSON,
  applies canonical target, byte/request and absolute-time bounds, and has no
  unsigned or arbitrary-URL fallback. Chronicle never reads the database.
- Optional Chronicle models support at most 256 repositories and 250-character
  ASCII repository IDs (so the final changelog `.html` leaf fits Windows). They retain
  limits of 4,096 requests, 16 MiB per response, 128 MiB per session, and 120
  seconds per session; fetched history, history events, and day events each have
  a cumulative 10,000-row cap. Over-budget models refuse without changing Backend
  config/API admission or replacing the prior site. Native reserved-name and
  case-collision checks still apply to otherwise accepted IDs.
- Source mirroring is limited to root `README.md`, `LICENSE`, `AGENTS.md`, current
  root release notes, one-level `Claude_Info/*.md` and `Codex_Info/*.md`, recursive
  `Docs/**/*.md`, and optional one-level `temp/Ref/*.mermaid`. `CLAUDE.md` is not
  source authority; missing or empty diagrams omit Architecture navigation.
- `safe_io.py` owns retained native no-follow reads, bounded coherent inventories,
  exact writes/removals, pinned asset validation, and directory swaps. Separate
  singleton-loop and short writer leases reclaim only an exact proved-dead
  PID/creation owner. Legacy text locks remain blocked: during deployment, only
  after confirming old tracker and Chronicle processes are stopped, an operator
  may inspect and remove the exact legacy lock under `Chronicle/runtime/`.
- All authenticated model and source reads complete before generated-content
  writes. Generated Markdown and final HTML destinations are preflighted for
  flattening, Windows case/native-path limits, and MkDocs README/index collisions.
  Writes are UTF-8, atomic and write-only-if-changed;
  story pages are not swept by the mechanical generator.
- Strict MkDocs builds use a unique candidate and native swap. Build failure leaves
  the served site untouched. Promotion restores the old site when possible; its
  two renames can briefly return 404. If promotion and restoration both fail, the
  surviving prior-site backup is retained and its recovery path is reported rather
  than claimed as still served. Failed builds remain pending across unchanged ticks
  and process restart.
- `--view` requires exact validated local Mermaid and sanitized, import-free
  Bootswatch assets plus a matching local-only generated config before its strict
  build and browser open. A fresh signed tracker probe is required before build
  and again before browser open; a bare TCP listener is insufficient.
  Ordinary builds may use the documented pinned CDN
  fallback; that path is online-only and is not offline evidence. Theme-provided
  CDN Highlight.js is disabled.
- Scribe is intentionally disabled: its Python CLI writes the disabled notice to
  stderr and exits `3` for valid supported syntax; invalid Python syntax exits `2`
  with usage. `scribe.bat` ignores its arguments and always exits `3` disabled. No
  path launches model, process or network work, and retained `auto_tick` is inert.
  Re-enabling Scribe requires a separately reviewed integration.
- External bootstrap/guardian/watchdog, sealed runtime provenance, Job-tree
  activation/rollback, hostile same-owner isolation, host upgrades and VM
  attestation are explicitly deferred. Do not infer those guarantees from the
  current bounded local implementation.
- Edit Chronicle sources under `Scripts/Chronicle/`; never hand-edit generated
  `Chronicle/runtime/` output.
- Reader typography/color/focus/motion is owned by `pages.py` build_extra_css.
  Preserve local fonts, native table structure, pinned assets, navigation and
  signed runtime. Generated build checks are not native visual acceptance.

## 5. Working workflows

### 5.1 Fix or feature

1. Brainstorm scope and decisions with the user; for a defect, reproduce it and
   establish the root cause before proposing a fix.
2. Read the nearest code and relevant normative/history sources, then write or
   update the enhanced-format plan with exact tasks, files and verification.
3. Complete five consecutive clean CDD passes over the frozen plan and coupled
   source flows. Every finding is fixed in the plan and resets the streak.
4. Set exactly one plan task `in-progress`, verify its `<files>` coverage, and
   implement the smallest complete change including mirrors and failure paths.
5. Complete five consecutive clean CFT passes over the actual merged result and
   runtime flows. Every finding is fixed and resets the streak.
6. Run the focused and layer/full verification required by the plan; distinguish
   executed evidence from deferred or operator-only checks.
7. Update durable documentation where behavior changed, record final evidence and
   limitations in the plan, mark the task `done`, and report the ignored plan
   update separately.

### 5.2 Release work

- Follow the active plan and the four-part KATLAB version convention.
- Change `Backend/app/version.py` only when release scope requires it.
- Keep one current `TrackingMonitor_vX.Y.Z.W_Release_Notes.md` at the root.
- Move the prior current release notes into `Docs/Release_Notes/Archive/`; do not copy stale claims forward.
- Preserve historical content when archiving, rebasing only local links affected
  by the move. Check the moved file's links and Chronicle's strict document build.
- Update `Claude_Info/Version_Notes.md` with evidence-backed, as-built behavior.
- Rebuild the frontend when its source changes and verify the served artifact when a release claim depends on it.
- The Vite production HTML marker and UI constant share one canonical version.
  `python -m Scripts.frontend_build check` validates bounded entry identity; it
  does not certify all chunks or same-version source freshness. Both launchers
  refuse stale existing output; missing-index first-run bootstrap is separate.
- Tracker and demo share `Frontend/dist`. Stop both before manual production
  builds. Automated release work must refuse an active, unauthorized sibling,
  stop only the identified authorized tracker, confirm both ports clear, then
  build, validate, restart and compare served artifacts. This is not an atomic
  lock against concurrent external starts/builds. Existing tabs require reload.
- Never perform the commit, tag, or push unless the user explicitly requests that exact Git action.

### 5.3 Onboarding contract changes

- Change the contract here only; do not apply it directly in EA, UM, or another monitored repo.
- Keep `Docs/Installation_Guideline.md`, `Docs/Tracking_Discipline.md`, `Docs/Plan_Format_Spec.md`, and `Guidelines/Onboarding_Prompt.txt` consistent.
- Preserve explicit user-scope provider hook registration and forbid duplicate per-repo registration.
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
| Chronicle | Use the selected Chronicle Python and an owned isolated signed tracker; exercise generation, strict candidate build/swap/failure preservation, offline-view closure where relevant, then run `Scripts/Chronicle/generate.py --verify` |
| Scripts/config | Fresh-path reasoning, Windows quoting, configured-port behavior, and no persistent console regression |
| Documentation | Links, paths, version claims, terminology, encoding, and consistency across normative copies |

Do not run every check for every edit. Choose the smallest set that can falsify the changed behavior, and expand only when failures or cross-layer risk justify it.

## 7. Current repository facts

- The supported environment is Windows with Python 3.10+ and Node.js.
- The frontend's only standard verification script is `npm run build` (`tsc -b && vite build`).
- `Tests/` is a committed focused Python regression suite for v0.3 capture,
  ingestion, plans, evidence, readiness, API, Git allowlisting, and demo behavior;
  it is not a general-purpose browser/end-to-end suite.
- Product Python dependencies are in `Backend/requirements.txt`; Chronicle has a
  separate dependency set and selected interpreter in `Scripts/Chronicle/requirements.txt`
  and `KATLAB_CHRONICLE_PYTHON`/PATH respectively.
- The primary launcher is `Scripts/start_tracking_monitor.bat`; demo uses `Scripts/Demo/start_demo.bat`.
- Runtime state and generated output are intentionally gitignored.
