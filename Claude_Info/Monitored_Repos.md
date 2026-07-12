# Monitored Repos Registry

Repos tracked by KATLAB TrackingMonitor. The system is multi-repo by design — more can be added anytime via configuration (no code change).

## Active Targets

| # | Repo | Path | Plans location |
|---|---|---|---|
| 1 | EA repo — Development Workspace | `C:\Users\ADMIN\AppData\Roaming\MetaQuotes\Terminal\7ED840DDCFDDCD9E053E1BDBFEACD96A\MQL5\Experts\MQL5_SuperRepo` | `temp\<Component>\PLAN_v*.txt` (Main_EA, Client_EA, Indicator) + `Traceability\Plan\` |
| 2 | UM repo — Development Workspace | `D:\KATLAB_Reiky\_Development_Workspace\KATLAB_UnderworldMerchant` | `temp\Plan\PLAN_v*.txt` (enhanced format from PLAN_v0.4.3.4 onward; older legacy plans parse to zero tasks — harmless); registered v0.1.1.0 |

## Candidates (add when needed)

| Repo | Path | Notes |
|---|---|---|
| EA repo — Execution Workspace | `D:\KATLAB_Reiky\_Execution_Workspace\MQL5_SuperRepo` | removed from active 2026-07-12 (user: currently no need); working copy of the same SuperRepo as #1 |
| UM repo — Execution Workspace | `D:\KATLAB_Reiky\_Execution_Workspace\KATLAB_UnderworldMerchant` | |

## Notes

- Active #1 and the EA Execution Workspace candidate are working copies of the SAME `MQL5_SuperRepo` project (different machines/roles, different branches) — the tracker treats each working copy as an independent monitored repo with its own git state and events stream
- Onboarding a repo = follow the **Installation Guideline** (authored in this repo) inside that repo's own Claude Code session — this repo NEVER edits monitored repos directly
- Hook registration is **user-scope** (once per PC, v0.1.1.0) — a repo is capture-enabled the moment it is in `Config/repos.yaml` (the registry doubles as the hook's allowlist) + the server is restarted; per-repo steps are only gitignore + plan format
