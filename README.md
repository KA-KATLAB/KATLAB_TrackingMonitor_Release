# KATLAB TrackingMonitor

Local Windows Mission Control for plan-driven work across multiple repositories.
It captures bounded Claude Code and Codex metadata, attributes file changes to the
plan task that explains why, correlates declared verification evidence with
read-only Git state, and keeps uncertain work visible instead of guessing.

Current version: **v0.3.0.1 — System Health Version-Skew Hotfix**

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

| Action | Command |
|---|---|
| Start | `Scripts/start_tracking_monitor.bat` |
| Stop | `Scripts/stop_tracking_monitor.bat` |
| Restart | `Scripts/restart_tracking_monitor.bat` |
| Isolated demo | `Scripts/Demo/start_demo.bat` |

The main UI is `http://127.0.0.1:8100`; Mission is
`http://127.0.0.1:8100/?view=mission`. Demo uses port 8101 and generates all seven
Mission states under ignored `Demo/runtime/`, with no real-repository Git probe.

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
- [Current release notes](TrackingMonitor_v0.3.0.1_Release_Notes.md)

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
