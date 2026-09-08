# Monitored Repos Registry

Repos tracked by KATLAB TrackingMonitor. The system is multi-repo by design — more can be added anytime via configuration (no code change).

## Active Targets

| # | Repo | Path | Plans location |
|---|---|---|---|
| 1 | EA repo — Development Workspace | `C:\Users\ADMIN\AppData\Roaming\MetaQuotes\Terminal\7ED840DDCFDDCD9E053E1BDBFEACD96A\MQL5\Experts\MQL5_SuperRepo` | Configured glob: `temp/*/PLAN_*.txt` (Main_EA, Client_EA, Indicator, and future direct component folders) |
| 2 | UM repo — Development Workspace | `D:\KATLAB_Reiky\_Development_Workspace\KATLAB_UnderworldMerchant` | Configured glob: `temp/Plan/PLAN_*.txt` (enhanced from PLAN_v0.4.3.4; older legacy plans parse to zero tasks) |

## Candidates (add when needed)

| Repo | Path | Notes |
|---|---|---|
| EA repo — Execution Workspace | `D:\KATLAB_Reiky\_Execution_Workspace\MQL5_SuperRepo` | removed from active 2026-07-12 (user: currently no need); working copy of the same SuperRepo as #1 |
| UM repo — Execution Workspace | `D:\KATLAB_Reiky\_Execution_Workspace\KATLAB_UnderworldMerchant` | |

## Notes

- Active #1 and the EA Execution Workspace candidate are working copies of the SAME `MQL5_SuperRepo` project (different machines/roles, different branches) — the tracker treats each working copy as an independent monitored repo with its own git state and events stream
- Onboarding a repo = follow the **Installation Guideline** (authored here) inside that repo's own agent session; this repo NEVER edits monitored repos directly.
- Claude/Codex hook registration is explicit and user-scope (once per provider per PC).
  A repo is capture-enabled when its valid entry exists in `Config/repos.yaml`; server
  restart applies the registry to backend monitoring. Per-repo steps are gitignore and
  plan/instruction rules only.
- Repository IDs are also the membership boundary for central activity and trusted
  checks. `Config/checks.json` is currently valid-empty; automatic check evidence is
  intentionally disabled until exact reviewed definitions are added and the tracker
  and provider sessions are restarted.
- Mission treats plans as `(repo_id, plan_file)` and sessions as
  `(provider, session_id)`, so identical relative plan names or raw session IDs across
  working copies/providers never cross-bind.
