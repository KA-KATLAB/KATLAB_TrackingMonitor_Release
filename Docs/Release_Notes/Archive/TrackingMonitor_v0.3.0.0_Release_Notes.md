# KATLAB TrackingMonitor v0.3.0.0 — "Verification Cockpit & Agent Flight Recorder"

This release turns the tracker into local Mission Control for plan-driven work.
It preserves file-to-task attribution while adding inspectable verification
readiness and metadata-only Claude Code/Codex activity.

## Highlights

- **Mission view:** one route-lazy cockpit for the current plan/task, seven plan
  states, exact blockers, verification progress, unassigned evidence, provider-aware
  session lanes, deterministic replay, paging, and an accessible exact-data table.
- **Evidence freshness:** optional plan `<verification>` requirements bind to the
  raw plan revision and trusted check-definition revision. Relevant later edits
  make older evidence stale; any review finding resets the trailing clean streak.
- **Conservative readiness:** the backend—not React—owns all decisions. Readiness
  accounts for parser/status failures, unresolved or uncaptured current work,
  evidence state, exact dirty-path intersection, and direct unswept commit linkage.
- **Claude + Codex flight recorder:** strict adapters normalize supported session,
  turn, subagent, tool, file, and check facts. `(provider, session_id)` prevents
  identical raw IDs from merging across providers.
- **Restart-safe ledger:** atomic inbox publication, canonical fingerprints,
  idempotent ingestion, sanitized rejection receipts, bounded paging, immutable
  evidence rows, and append-only manual assignment history.
- **Operational tools:** read-only provider preflight/snippet rendering and a
  validated explicit evidence recorder. Neither helper edits settings or monitored
  repositories.
- **Deterministic demo:** eight isolated synthetic repositories cover all seven
  states plus empty API shapes, pass/fail/stale/reset evidence, root/subagents,
  unassigned multi-repo evidence, and ready versus directly committed proof.

## New contracts

- `GET /api/mission`
- `GET /api/activity`
- `GET /api/sessions`
- `PATCH /api/activity/{id}/plan`
- Additive activity/evidence/readiness WebSocket invalidations
- Provider-aware `GET /api/events`
- Activity and provider facts in `GET /api/health`
- Optional top-level plan `<verification>` block
- Trusted check registry at `Config/checks.json`

The canonical navigation order is now Changes, Mission, Overview, History, City,
Chronicle. Mission is excluded from attract rotation and keeps its own entry-local
plan, session, filter, replay, and paging state.

## Privacy and safety

The activity ledger accepts bounded structural metadata only. It never stores or
exposes prompts, responses, commands, patches, source, transcripts, environment
values, stdout/stderr, or error text. Missing or invalid repository membership
fails closed to no capture while provider execution still succeeds.

Git remains strictly read-only: executable calls are confined to
`Backend/app/git_module.py` and only use `status`, `diff`, `log`, or `show`.
Mission and evidence recording never run checks, commit, push, check out, create,
or delete branches. A green gate means only that declared evidence is fresh.

## Activation

No user settings are changed by this release.

1. Restart TrackingMonitor after installing the release.
2. Run `Scripts/render_hook_config.py --provider claude|codex` preflight and render
   commands from [Installation_Guideline.md](../../Installation_Guideline.md).
3. Manually merge only the reviewed user-scope handlers, validate JSON, restart the
   provider, and use its normal trust flow.
4. Add only exact reviewed checks to `Config/checks.json`; it ships valid-empty.
   Restart TrackingMonitor and active providers after registry changes.
5. Add plan requirements, run the actual checks/reviews, then record only truthful
   evidence. Inspect Mission blockers and unassigned evidence before acting.

## Verification

- Detailed plan review completed at 5 consecutive clean passes.
- Focused committed Python suite passed 113/113 on the final current tree.
- All Backend, Hook, Scripts, and Tests Python files compiled.
- Frontend `tsc -b && vite build` passed and emitted Mission as a separate lazy chunk.
- Headless-Chrome Mission smoke passed direct routing, six-view navigation,
  Back/Forward, all seven states, exact data, bounded rows, reduced motion, and no
  page overflow at 360/390/768/1024/1440 CSS pixels; no severe console error.
- Demo bootstrap/reset/restart and no-Git/no-Chronicle-process sentinels passed.
- `git diff --check` reported no whitespace error; line-ending notices only.

This focused suite is not a general-purpose browser/end-to-end suite. Provider
activation, a real configured-repository smoke test, and publication remain explicit
operator actions; the release does not silently modify either provider settings or
monitored repositories.

## Rollback

Stop providers and manually remove only the new lifecycle/general-tool/check
handlers. Preserve unrelated settings and, if Changes tracking should continue,
the existing file-attribution handler. Validate JSON and restart the provider.
TrackingMonitor can continue with legacy file events; Mission will report missing
or stale activity honestly. Preserve the inbox, sanitized receipts, and SQLite data
during diagnosis; additive schema objects may remain unused.
