# KATLAB TrackingMonitor v0.1.1.0 — Release Notes

**Theme:** User-scope capture — one PC-wide hook + registry allowlist; UM onboarded.

The real workflow is ONE Claude Code session (VS Code multi-root, rooted in EA) spanning all repos — but Claude Code loads project hooks only from the session root, so per-repo hook registration never fired for the other repos. Verified: capture was dead in every repo. This release fixes the class, not the instance.

## Highlights

- **User-scope hook:** registration moved to ONE entry in `C:\Users\ADMIN\.claude\settings.json` — fires in every session, any root; the hook already routed events to the edited FILE's repo, so only registration scope changed. Per-repo registration RETIRED
- **Registry allowlist:** the hook captures ONLY repos listed in `Config/repos.yaml` (stdlib regex read, `KATLAB_TRACKER_CONFIG` override, fail-OPEN on unreadable/empty registry — durability first). Path lines must stay single-line + single-quoted (R1)
- **UM_Dev registered** as a monitored repo (`temp/Plan/PLAN_*.txt`, already authoring enhanced-format plans); EA_Exec removed on user request ("currently no need")
- **Onboarding contract rewritten:** per-repo steps shrink to legacy-hook cleanup + gitignore + plan rules; registration strictly BEFORE the smoke test; ordered migration follow-ups (EA gitignore before session restart — prevents tracker self-pollution)
- **Tracking discipline doc** (`Docs/Tracking_Discipline.md`): flip-before-edit, exactly one in-progress task, empty manual-pick queue
- **Publication:** README + MIT license; repo pushed to GitHub (org KA-KATLAB, private dev repo + public read-only release mirror with branch `release/v0.1.1`)
- Cross-repo smoke passed live: one EA-rooted session captured UM + EA edits into each repo's own `events.jsonl`

## Cross-repo

Monitored repos self-executed only gitignore + legacy-entry cleanup per the guideline; the single file outside this repo touched was the user's own `~/.claude/settings.json` (approved). Plan passed a 9-pass CDD review loop (11 findings, 5/5 clean) before implementation.
