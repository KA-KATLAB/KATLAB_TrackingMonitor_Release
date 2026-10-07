# KATLAB TrackingMonitor

Local Windows Mission Control for plan-driven work across multiple repositories.
It captures bounded Claude Code and Codex metadata, attributes file changes to the
plan task that explains why, correlates declared verification evidence with
read-only Git state, and keeps uncertain work visible instead of guessing.

Current source version: **v0.4.3.1 - Changes Review Lanes**

Normal grouped Changes rows separate attribution, the full file path with
secondary capture context, and the existing Diff action. At desktop widths
the file gets a flexible central lane; narrow layouts stack in reading order.
Full paths stay visible. Session, differing-branch, tool and time details stay
available without competing on the primary line. Plan edits, History, Folder
and the manual attribution queue retain their current presentation.

All Diff/Retry/Hide, offline/retained/error states, file-story/session callbacks,
focus recovery, exact identities and paging remain unchanged. Mission Command
Desk and the four prior presentation styles remain complete. Preservation uses
exact bounded input inverses; current behavioral tests execute current source.
Native/operator acceptance and the known large HTTP Connection:close fault
remain OPEN. Reload existing tabs after upgrade to see the matching UI build.
See the [current release notes](TrackingMonitor_v0.4.3.1_Release_Notes.md).

## What v0.4 changes

- A work-first shell with visible build version beside the product name,
  dedicated navigation, searchable Repository scope, Tasks and System.
- Clearer Changes, Mission and History hierarchy; complete paged Mission reasons.
- Four primary Overview metrics, quieter supporting panels and readable labels.
- Consistent dialogs, exports and Chronicle reading styles. Unknown Git status
  stays unavailable instead of appearing clean or zero.

The local tracker was activated with matching v0.4.0.0 server and served UI assets.
Existing tabs need a reload. Native browser acceptance remains pending; see the
[redesign notes](Docs/Release_Notes/Archive/TrackingMonitor_v0.4.0.0_Release_Notes.md).

## What v0.3 adds

- **Mission:** seven honest plan states, current blockers, verification progress,
  stale/failing/missing evidence, and ready-versus-directly-committed distinction.
- **Flight Recorder:** provider-aware sessions, root/subagent and tool activity,
  check attempts, replay, and an equivalent exact-data table.
- **Trusted evidence:** optional plan `<verification>` blocks, reviewed check
  definitions, explicit manual evidence, freshness/revision rules, trailing review
  streaks, and an append-only assignment audit.
- **Privacy boundary:** records structural metadata only—never prompts, responses,
  commands, patches, source, transcripts, environment values, stdout/stderr, or
  error text.

Mission is observability, not a correctness oracle. A green requirement means only
that its declared evidence is present and fresh.

## Architecture

```text
Claude Code / Codex user-scope hooks
        |
        +-- supported file tools --> <repo>/.katlab_tracking/events.jsonl
        |
        +-- lifecycle/tool/check metadata --> central atomic activity inbox
                                                    |
Configured plans + checks --------------------------+
                                                    v
FastAPI tracker
  - global restart-safe ingestion
  - Hybrid-C task attribution
  - evidence freshness + Mission readiness
  - read-only Git boundary: status / diff / log / show
  - SQLite ledger + immutable assignment history
        |
        +-- REST snapshots + WebSocket invalidation
        v
React UI: Changes | Mission | Overview | History | City | Chronicle
```

The repository registry in `Config/repos.yaml` is also the fail-closed capture
allowlist. Missing, unreadable, empty, invalid, or ambiguous registration produces
no capture while provider work continues successfully.

## Hybrid-C attribution

Each changed file is matched against every task `<files>` declaration:

| Matches | Condition | Result |
|---|---|---|
| 1 | any status | `B` — exact declaration |
| >1 | one matching task is `in-progress` | `A_SCOPED` |
| >1 | otherwise | `AMBIGUOUS` — manual pick |
| 0 | one repo-wide task is `in-progress` | `A_GLOBAL` |
| 0 | otherwise | `UNKNOWN` — manual pick |

Only an explicit operator choice produces `MANUAL`.

## Quick start

Requirements: Windows, Python 3.10+, and Node.js for the first frontend build.

Backend installation requires reviewed `starlette>=1.3.1` and `anyio>=4.14.2`
baselines. Normal and demo setup use `Backend/requirements.txt`; an older
satisfying FastAPI alone cannot retain dependencies below those floors. Let pip
resolve a compatible set or stop on failure; do not bypass constraints.
This does not alter Chronicle's separate dependency set or force a blanket
upgrade. See the [backend security release notes](Docs/Release_Notes/Archive/TrackingMonitor_v0.3.1.25_Release_Notes.md)
and [AnyIO baseline notes](Docs/Release_Notes/Archive/TrackingMonitor_v0.3.1.32_Release_Notes.md) for policy
scope and verification limits. These minimums are not a reproducible lock or
a claim that all dependency advisories are resolved.

| Action | Command |
|---|---|
| Start | `Scripts/start_tracking_monitor.bat` |
| Stop | `Scripts/stop_tracking_monitor.bat` |
| Restart | `Scripts/restart_tracking_monitor.bat` |
| Isolated demo | `Scripts/Demo/start_demo.bat` |

The main UI is `http://127.0.0.1:8100`; Mission is
`http://127.0.0.1:8100/?view=mission`. Demo uses port 8101 and generates all seven
Mission states under ignored `Demo/runtime/`, with no real-repository Git probe.

Start scripts show setup progress, then launch the backend without a persistent
CMD window through `Scripts/launch_hidden.py`. Logs remain in
`data/logs/tracker.log` (Chronicle: `data/logs/chronicle.log`) or
`Demo/runtime/demo.log` for the demo. Stop validates the exact repository venv
launcher and its captured descendants, retains identity-verified native process
handles, then confirms their exit and the configured port clear. Foreign or
unverifiable listeners are refused before termination; restart aborts on failure.
This is separate from readiness, so an older or unhealthy owned tracker can stop.
Expected stop failures include a fixed `[STOP_*]` phase code, not a native root
cause. Successful owned stops report port clearance only after handle cleanup;
failure never triggers an automatic retry.
Use the repository scripts; manual/base-Python launches are not supported stop
targets. See [safe restart guidance](Docs/Installation_Guideline.md#safe-stop-and-restart)
for proof boundaries and refusal handling. Start verifies the matching app version,
ordered configured repository IDs, and live watchers through `/api/health` before
opening the browser or reporting success. A health match does not prove exact
process identity or guarantee continued health after that observation. A
double-clicked setup window closes on success; an existing interactive terminal
remains open by design. Restart reuses the setup session without a persistent
CMD shell. To change `server.port`, stop the old tracker *before* editing
`Config/repos.yaml`, then start it on the new port; restart alone cannot find an
instance still bound to the old port. When upgrading a running tracker, use
**Restart**: **Start** refuses an occupied port serving a different version.

The header version identifies the loaded UI build. System also shows the server
version and explains known mismatches. Build the frontend from the matching source
and reload open tabs after an authorized upgrade; restarting Python cannot replace
JavaScript already loaded in a browser. Tests can build to an isolated `temp/`
output without touching the currently served `Frontend/dist/`.

## Chronicle

Chronicle uses the running tracker's configured loopback origin and an owned,
signed-response capability; there is no separate server or unsigned fallback.
Demo and explicit-config instances do not access production Chronicle state.

- Python: absolute `KATLAB_CHRONICLE_PYTHON`, otherwise the first PATH Python.
  Chronicle dependencies are separate from Backend's `.venv`.
- Install dependencies and pinned assets: `Scripts/Chronicle/install.bat`.
  `install.bat --mermaid-only` fetches only Mermaid, without pip.
- Generate/build with the tracker running: `Scripts/Chronicle/generate.bat`.
- Strict offline build, then open: `Scripts/Chronicle/view.bat`. Both verified
  assets must already be selected in generated configuration; after installing
  assets, regenerate first. Normal generation's CDN fallback is online-only.
- Parity check: run `Scripts/Chronicle/generate.py --verify` with Chronicle's
  Python. Scribe is disabled: Python exits 3 for valid arguments or 2 for invalid
  syntax; its batch entrypoint always exits 3. Existing stories remain.

For an upgrade with a legacy plain-text `.chronicle_loop.lock`, first confirm
all old tracker/Chronicle processes are stopped, then inspect/remove only that
legacy file under `Chronicle/runtime/`. Live or ambiguous structured locks and
capabilities must not be deleted to bypass a refusal. See the
[repository guide](Codex_Info/Repository_Guide.md) for recovery and trust limits.

## Onboard providers and repositories

1. From this repository, render and manually merge the user-scope Claude and/or
   Codex hook snippet. The helper reads or prints; it never writes settings.
2. Add `.katlab_tracking/` to each monitored repository's `.gitignore` and use the
   enhanced plan format.
3. Add one single-line, single-quoted path entry to `Config/repos.yaml`, then restart
   TrackingMonitor and the provider.
4. Run the documented smoke test.

Follow [Installation_Guideline.md](Docs/Installation_Guideline.md) for exact
provider snippets, evidence commands, rollback, and troubleshooting.

## Key contracts

- [Plan format](Docs/Plan_Format_Spec.md)
- [Verification evidence](Docs/Verification_Evidence_Spec.md)
- [Activity/privacy](Docs/Agent_Activity_Spec.md)
- [Mission API](Docs/Mission_API_Spec.md)
- [UI design system](Docs/UI_Design_System.md)
- [Working discipline](Docs/Tracking_Discipline.md)
- [Repository guide](Codex_Info/Repository_Guide.md)
- [Current source release notes](TrackingMonitor_v0.4.3.1_Release_Notes.md)

## Guarantees

- Hooks are stdlib-only, fail safely, and never block provider work.
- Git subprocesses are confined to one module and only use `status`, `diff`, `log`,
  or `show`.
- Mission and evidence recording never run checks or commit, push, check out,
  create, or delete branches.
- Server downtime does not lose complete file events or atomically published
  activity; restart catches them up idempotently.
- Composite identities prevent same-named plans or sessions from cross-binding.
- `Tests/` is a focused regression suite for v0.3 behavior, not a general-purpose
  browser/end-to-end suite.

## Repository map

```text
Hook/         provider adapters and fail-safe capture
Backend/      FastAPI, ingestion, SQLite, readiness, Git boundary, REST/WS
Frontend/     six-view React application; build output is generated
Config/       repository allowlist and trusted check registry
Docs/         normative product contracts and archived release notes
Scripts/      lifecycle, hook rendering, explicit evidence, demo, Chronicle
Tests/        focused Python regression suite
Claude_Info/  architecture and version history
Codex_Info/   concise agent repository guide
```

## License

[MIT](LICENSE) © 2026 KATLAB
