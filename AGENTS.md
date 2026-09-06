# AGENTS.md

## Scope

These instructions apply to the entire `KATLAB_TrackingMonitor` repository.

## Communication

- Keep user-facing updates short, concrete, and evidence-based.
- State the outcome first. Mention assumptions only when they affect the result.
- Use a clear hierarchy and uncluttered wording that is easy to scan.
- Do not claim a check passed unless its command completed successfully.

## Session startup (CDD)

Before substantive work:

1. Read this file completely.
2. Read [Codex_Info/Repository_Guide.md](Codex_Info/Repository_Guide.md) completely.
3. Read these project sources completely:
   - `Claude_Info/Architecture_Notes.md`
   - `Claude_Info/Monitored_Repos.md`
   - `Claude_Info/Plan_Format_Notes.md`
   - `Claude_Info/Version_Notes.md`
4. Read the task-relevant normative documents under `Docs/`.
5. Briefly report which instruction/doc files were read and confirm the target scope.

CDD means careful, deep, and detailed: understand the reason behind a rule, not only its wording.

## Project purpose

KATLAB TrackingMonitor is a local Windows web application that captures Claude Code file-edit events across configured repositories, attributes each event to the plan task that caused it, correlates events with read-only Git state, and presents the result through REST, WebSocket, React UI, and the generated Chronicle.

The high-level flow is:

`user-scope hook -> per-repo events.jsonl -> FastAPI/watchers/SQLite -> REST + WebSocket -> React UI + Chronicle`

## Non-negotiable boundaries

- This repository is the single source of truth for the hook, server, UI, Chronicle, and onboarding contract.
- Never edit a monitored repository from work scoped to this repository. Change `Docs/Installation_Guideline.md` or `Guidelines/Onboarding_Prompt.txt`; the agent operating inside the monitored repo performs its own onboarding.
- Work solo by default. Do not create subagents for routine work unless the user explicitly requests parallel delegation.
- Git is read-only. Allowed commands are `git status`, `git diff`, `git log`, and `git show` only.
- Never run Git mutation commands (`add`, `commit`, `push`, `branch`, `checkout`, `reset`, `merge`, `rebase`, `tag`, `stash`, `cherry-pick`, `restore`, `clean`, or equivalents) unless the user explicitly requests that exact one-off command in the current turn.
- Do not hand-edit runtime or generated output: `data/`, `Demo/runtime/`, `Chronicle/runtime/`, `Frontend/dist/`, caches, logs, databases, or `events.jsonl`.
- Do not add secrets, `.env` files, local settings, or machine-specific runtime artifacts to tracked content.
- Avoid new dependencies. If one is genuinely required, explain why and keep product, frontend, and Chronicle dependency sets separate.

## Critical system invariants

- Capture must never block editing: `Hook/katlab_tracking_hook.py` remains stdlib-only, fail-open where documented, and exits successfully even on malformed input or environmental failure.
- Event version remains compatible with optional fields; validate malformed records without stalling the persisted byte offset.
- Never silently guess attribution. Preserve the Hybrid-C resolver outcomes `B`, `A_SCOPED`, `A_GLOBAL`, `AMBIGUOUS`, `UNKNOWN`, and `MANUAL`.
- Preserve watcher startup order: config/DB -> parse all plans -> catch-up ingest -> commit backfill -> initial Git status -> clean sweep -> watchers/poll loop.
- All Git subprocess use stays inside `Backend/app/git_module.py`, remains read-only, and tolerates transient failures without killing background work.
- `Config/repos.yaml` is read once at startup and doubles as the hook allowlist. Every `path:` value must remain single-line and single-quoted because the hook parses it with a stdlib regex.
- Keep API response shapes stable, including empty-scope shapes. Mirror backend contract changes in `Frontend/src/api.ts` and related TypeScript types.
- Keep shared constants and algorithms in one authoritative home. Reuse them rather than creating near-duplicates.
- Preserve reduced-motion, offline, empty-data, stale-reference, and Windows-path behavior.

## Planning and tracking discipline

- Significant fixes/features/releases require an enhanced-format `temp/Plan/PLAN_*.txt` plan; follow `Docs/Plan_Format_Spec.md`.
- Before editing implementation files, mark exactly one relevant task `in-progress`, with precise repo-relative forward-slash entries in `<files>`.
- Mark the task `done` immediately after completion and keep the manual-pick queue empty.
- Plans under `temp/` are gitignored. Verify and report plan changes explicitly; Git status cannot prove them.
- Do not invent or retrofit a release/version bump unless the user request or active plan calls for one.

## Change discipline

- Inspect the current implementation and nearby history/docs before changing behavior.
- Prefer the smallest coherent patch. Preserve local naming, formatting, comments, and architectural boundaries.
- Python uses type hints and small focused modules; preserve the repository's existing `name ()` spacing style.
- TypeScript is strict, uses two-space indentation, double quotes, semicolons, and reusable pure helpers where practical.
- UI text, documentation, identifiers intended for users, and code comments are English only.
- End every text file with exactly one newline.
- Update comments and documentation when an invariant or public behavior changes; avoid historical essays in source comments.
- For releases, keep `Backend/app/version.py`, the root release-notes file, `Claude_Info/Version_Notes.md`, and the release-notes archive convention consistent.

## Verification

Match checks to the affected surface:

- Frontend: from `Frontend/`, run `npm run build`. Trust the builder's own exit code; do not infer success from a downstream pipeline command.
- Python: compile changed Python modules and run focused executable checks for the affected parser, resolver, DB, API, hook, watcher, or Chronicle behavior.
- Backend/API: use demo or a controlled local configuration when end-to-end behavior matters; do not touch configured monitored repos to manufacture test data.
- Chronicle: edit generators under `Scripts/Chronicle/`, never generated files. When applicable, generate/build against a running tracker and run `python Scripts/Chronicle/generate.py --verify`.
- Hook: use isolated temporary repositories/configuration for tests; never pollute real monitored repos.
- Documentation-only changes: check links, paths, commands, terminology, and the 200-line limit for this file.

There is no committed general-purpose automated test suite. Do not imply otherwise; document targeted checks and any checks not run.

## Completion report

Report:

- files changed and the behavior/documentation affected;
- verification commands and results;
- checks not run and why;
- any plan/status follow-up the user must perform;
- confirmation that no Git mutation command was run.

## Detailed guidance

Use [Codex_Info/Repository_Guide.md](Codex_Info/Repository_Guide.md) for module ownership, architectural contracts, workflow details, and the verification matrix. Follow [Docs/UI_Design_System.md](Docs/UI_Design_System.md) for frontend design, accessibility, responsive, motion, and bounded-rendering work. Authoritative historical and normative sources remain in `Claude_Info/` and `Docs/`.
