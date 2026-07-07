# Monitored Repos Registry

Repos tracked by KATLAB TrackingMonitor. The system is multi-repo by design — more can be added anytime via configuration (no code change).

## Active Targets

| # | Repo | Path | Plans location |
|---|---|---|---|
| 1 | EA repo — Development Workspace | `C:\Users\ADMIN\AppData\Roaming\MetaQuotes\Terminal\7ED840DDCFDDCD9E053E1BDBFEACD96A\MQL5\Experts\MQL5_SuperRepo` | `temp\<Component>\PLAN_v*.txt` (Main_EA, Client_EA, Indicator) + `Traceability\Plan\` |
| 2 | EA repo — Execution Workspace | `D:\KATLAB_Reiky\_Execution_Workspace\MQL5_SuperRepo` | `Traceability\Plan\` (working copy of the same SuperRepo; plans mostly authored in #1) |

## Candidates (add when needed)

| Repo | Path | Notes |
|---|---|---|
| UM repo (KATLAB_UnderworldMerchant) | `D:\KATLAB_Reiky\_Development_Workspace\KATLAB_UnderworldMerchant` | plans in `temp\Plan\PLAN_v*.txt`; cross-repo pairs with EA plans |
| UM repo — Execution Workspace | `D:\KATLAB_Reiky\_Execution_Workspace\KATLAB_UnderworldMerchant` | |

## Notes

- Both active targets are working copies of the SAME `MQL5_SuperRepo` project (different machines/roles, different branches) — the tracker treats each working copy as an independent monitored repo with its own git state and events stream
- Onboarding a repo = follow the **Installation Guideline** (authored in this repo) inside that repo's own Claude Code session — this repo NEVER edits monitored repos directly
