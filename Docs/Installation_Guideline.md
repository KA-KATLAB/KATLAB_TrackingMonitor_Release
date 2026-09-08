# KATLAB TrackingMonitor Installation and Repo Onboarding

TrackingMonitor home:

`D:\KATLAB_Reiky\_Development_Workspace\KATLAB_TrackingMonitor`

The application, hook, and helper scripts never edit provider settings or monitored
repositories. Provider activation and repo onboarding are explicit operator actions.

## 1. Activate user-scope provider hooks

Supported configuration baselines:

- Claude Code 2.1.258: `%USERPROFILE%\.claude\settings.json`
- Codex CLI 0.153.4: `%USERPROFILE%\.codex\hooks.json`

Stop the provider before editing its settings. Run the matching read-only preflight:

```powershell
python Scripts\render_hook_config.py --provider claude --preflight "$env:USERPROFILE\.claude\settings.json"
python Scripts\render_hook_config.py --provider codex --preflight "$env:USERPROFILE\.codex\hooks.json"
```

Results:

- `PREFLIGHT OK`: no existing KATLAB registration was found.
- `PREFLIGHT STOP`: inspect the existing KATLAB entries and merge without duplicating
  them. Do not paste another full copy.
- `PREFLIGHT ERROR`: repair or explicitly review the settings JSON first.

Render the provider's merge-ready snippet to the console:

```powershell
python Scripts\render_hook_config.py --provider claude
python Scripts\render_hook_config.py --provider codex
```

Manually merge the rendered `hooks` object into the provider's existing user-scope
JSON. Preserve every unrelated key, matcher group, and hook. Never replace the whole
settings file with the snippet.

The rendered registrations intentionally use:

| Evidence | Claude | Codex | Delivery |
|---|---|---|---|
| File attribution | successful Edit/Write/MultiEdit | successful apply_patch | synchronous |
| Check start | PreToolUse Bash | PreToolUse Bash | synchronous, durable |
| Check finish | PostToolUse/Failure Bash | PostToolUse Bash | synchronous, durable |
| General tools | PostToolUse/Failure | PostToolUse | asynchronous |
| Lifecycle | session, subagent, stop | session, subagent, stop, interrupt | asynchronous where supported |

Validate the merged JSON without rewriting it:

```powershell
python -m json.tool "$env:USERPROFILE\.claude\settings.json" > $null
python -m json.tool "$env:USERPROFILE\.codex\hooks.json" > $null
```

Restart the provider, open `/hooks`, review the exact KATLAB commands, and approve
them through the normal trust flow. Do not use a hook-trust bypass. Managed policy
may still disable user hooks; treat a failed smoke test as the deciding evidence.

### Hook rollback

Stop the provider and manually remove only command handlers whose command references
`KATLAB_TrackingMonitor\Hook\katlab_tracking_hook.py`. Remove a matcher group or event
only if it becomes empty. Preserve all unrelated settings, validate the JSON, then
restart the provider.

## 2. Capture safety model

The hook reads `Config/repos.yaml` and captures only registered repositories. An
unreadable, missing, empty, ambiguous, or invalid registry makes capture a no-op;
provider execution still exits successfully. There is no capture-all fallback.

File attribution is appended to `<repo>/.katlab_tracking/events.jsonl`. Provider
activity and check evidence are atomically published to the central
`data/activity_inbox/`. Records contain bounded metadata only: never prompts,
responses, commands, patches, source, transcripts, environment values, stdout,
stderr, or error text.

`Config/checks.json` is loaded by both hooks and the server. After changing it,
restart TrackingMonitor and active Claude/Codex sessions before running a registered
check. A command, working-directory, repository, or revision mismatch stays
unassigned and is never retroactively guessed.

### Declare and record verification evidence

Plans opt in with one column-zero block:

```text
<verification>
review:cdd@5
my-reviewed-check
review:cft@5
</verification>
```

`review:*` checks are manual-only. Ordinary IDs require an exact reviewed entry in
`Config/checks.json`; the committed registry is initially valid-empty. Provider
check capture matches exact normalized command, working directory, repository,
definition revision, start/finish pair, and accepted exit status.

From the TrackingMonitor root, explicitly record a completed review or a check whose
definition allows `manual` evidence:

```powershell
python Scripts\record_evidence.py --repo My_Repo_Id --plan temp/Plan/PLAN_v1.0.0.0_Example.txt --check review:cdd --outcome clean
python Scripts\record_evidence.py --repo My_Repo_Id --plan temp/Plan/PLAN_v1.0.0.0_Example.txt --check review:cft --outcome finding
python Scripts\record_evidence.py --repo My_Repo_Id --plan temp/Plan/PLAN_v1.0.0.0_Example.txt --check my-reviewed-check --outcome pass
```

Review outcomes are `clean|finding`; ordinary outcomes are
`pass|fail|cancelled`. The plan must match that repository's configured
`plan_globs`. The recorder validates and publishes metadata only. It does
not run the check, edit a monitored repository, or invoke Git. Record evidence only
after the relevant final edit: plan/check revisions and implementation-sensitive
file activity can make older evidence stale.

### Read Mission safely

Open the **Mission** view or inspect `GET /api/mission`. The seven plan states are
`not_configured`, `planning`, `implementation`, `verification`, `blocked`,
`ready_to_commit`, and `verified_committed`. `GET /api/activity` and
`GET /api/sessions` expose bounded evidence and provider-composite sessions.

A green requirement means only that its declared evidence is present and fresh.
Inspect blockers and unassigned evidence; TrackingMonitor is not a correctness
oracle. Mission and evidence recording never run commands, commit, push, check out,
create, or delete branches.

### Evidence troubleshooting and rollback

1. Check `/api/health` for separate adapter, configuration, recency, inbox, rejected,
   and ignored-unscoped facts.
2. Confirm the repo ID/path and check definition, then restart both TrackingMonitor
   and the provider after configuration changes.
3. Treat `unassigned`, `stale`, `incomplete`, `failed`, `finding`, and `unknown` as
   distinct evidence states; do not relabel or guess them.
4. Preserve `data/activity_inbox`, `data/activity_rejected`, and the SQLite database
   while diagnosing. Copy diagnostics before any explicitly authorized cleanup.
5. To roll back activity/evidence hooks, manually remove only the newly rendered
   lifecycle/general-tool/check handlers. Keep the legacy file-attribution handler
   if Changes tracking must continue; validate JSON and restart the provider.

## 3. Remove legacy per-repo hooks

In each monitored repo, inspect `.claude/settings.json` and `.codex/hooks.json`. If
one contains a command invoking `katlab_tracking_hook.py`, remove only that handler.
Delete an empty matcher/event object only when necessary for valid JSON; preserve
all unrelated settings. Never add a per-repo TrackingMonitor hook.

Existing user-scope KATLAB file hooks must be reconciled during the preflight in
Section 1, not duplicated.

## 4. Ignore runtime attribution data

Add this to the monitored repo's `.gitignore` before its first captured edit:

```text
# KATLAB TrackingMonitor runtime data
.katlab_tracking/
```

## 5. Author tracked plans

- Location: `temp/Plan/PLAN_*.txt`
- Format: `Docs/Plan_Format_Spec.md`
- Keep exactly one task `in-progress` while implementing.
- Flip a task before its first edit and mark it `done` immediately after completion.
- Declare precise repo-relative forward-slash paths in `<files>`.
- Use `PLAN_*.txt` only for plans; the name controls statistics exclusions.
- Persist the short standing rules in the monitored repo's `AGENTS.md` or equivalent.

## 6. Register the monitored repo

The operator adds one entry to `Config/repos.yaml`:

```yaml
  - id: My_Repo_Id
    name: "Readable name"
    path: 'X:\absolute\path\to\repo'
    plan_globs:
      - "temp/Plan/PLAN_*.txt"
```

The `path:` value is load-bearing: keep it single-line and single-quoted. IDs are
normalized YAML strings matching `[A-Za-z0-9_-]+`; quote values YAML would otherwise
type as a boolean, null, or number. IDs and resolved absolute paths must be unique.
`plan_globs` is a bounded list of unique,
repo-relative forward-slash patterns; absolute paths, backslashes, empty segments,
`.` and `..` segments are invalid. Restart TrackingMonitor after registry changes
because the server loads this configuration at startup.

The optional `server` value must be a mapping containing only `host`, `port`, and
`status_poll_seconds`. `host` must be a nonempty string, `port` an integer from
1 to 65535, and the polling interval an integer from 5 to 86400 seconds.

## 7. Smoke test

1. Start a fresh provider session after user-scope activation.
2. Edit a scratch file inside the registered repo with a supported file tool.
3. Confirm `.katlab_tracking/events.jsonl` has one complete, repo-relative event.
4. Confirm `http://127.0.0.1:8100/api/health` reports the expected hook and provider
   configuration/recency facts.
5. Remove the scratch file through the repo's normal workflow.

If capture is absent, check in order: provider restart, normal hook trust, valid
single-quoted repo registration, Python path from the provider, then managed policy.

Start TrackingMonitor with `Scripts/start_tracking_monitor.bat`; the default UI is
`http://127.0.0.1:8100`. Mission is directly addressable with
`http://127.0.0.1:8100/?view=mission`.

## Optional local badge

```markdown
![KATLAB](http://127.0.0.1:8100/badge/<repo_id>.svg)
```

This works in local previews only; GitHub cannot reach the loopback server.
