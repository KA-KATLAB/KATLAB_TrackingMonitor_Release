# TrackingMonitor — Repo Onboarding Guideline

Self-contained steps for the **Claude Code session running INSIDE a monitored repo** (divide-and-conquer: the TrackingMonitor repo NEVER edits monitored repos — you, the session in the target repo, execute these steps yourself).

**TrackingMonitor home** (single source of truth for hook + server + UI):
`D:\KATLAB_Reiky\_Development_Workspace\KATLAB_TrackingMonitor`

## How capture works (context — NOTHING to install per repo)

The PostToolUse hook is registered ONCE per PC at **user scope** (`C:\Users\ADMIN\.claude\settings.json`, maintained by the TrackingMonitor repo — NOT by you). It fires in EVERY Claude Code session regardless of the session's root and routes each event to the repo that OWNS the edited file (nearest `.git` ancestor), appending to `<that repo>/.katlab_tracking/events.jsonl`. One session may span several repos — each edit still lands in the right repo's events file.

**Allowlist**: the hook captures ONLY repos registered in `TrackingMonitor/Config/repos.yaml`. If that file is unreadable or empty, the hook fails OPEN (captures every repo — durability first); that fail-open mode is the only way a stray `.katlab_tracking/` can appear in an unregistered repo (harmless — delete it).

## Step 1 — Remove any legacy per-repo hook (migration)

Older guideline versions registered the hook in each repo's `.claude/settings.json`. If this repo's `.claude/settings.json` contains a `hooks.PostToolUse` entry invoking `katlab_tracking_hook.py`, REMOVE that entry — a second registration would double-fire events for sessions rooted here. If that entry is the file's ONLY content, delete the file. PRESERVE all other settings (F40: merge-not-overwrite applies to removal too — verify the JSON after editing).

**NEVER add per-repo hook entries** — registration is user-scope only.

## Step 2 — Gitignore the tracking data

Add to this repo's `.gitignore` (the dir is tracker-owned runtime data):

```
# KATLAB TrackingMonitor runtime data
.katlab_tracking/
```

Do this BEFORE any hooked session edits this repo — an un-ignored `events.jsonl` turns this repo's git status dirty, and the tracker would pollute its own uncommitted metric.

## Step 3 — Plan authoring rules

- Plans live in **`temp/Plan/PLAN_*.txt`** (enhanced format ONLY — legacy plans are invisible to the tracker: zero tasks, no errors)
- Format spec: `TrackingMonitor/Docs/Plan_Format_Spec.md` (task blocks at column 0; required tags id/title/status; UTF-8; repo-relative `<files>` globs)
- Discipline: keep **exactly ONE task `in-progress`** per repo at a time; flip statuses as you work — the tracker re-parses live

## Step 4 — Register the repo (user does this, BEFORE the smoke test)

Ask the user to add an entry to `TrackingMonitor/Config/repos.yaml`:

```yaml
  - id: My_Repo_Id          # letters/digits/_/- only
    name: "Readable name"
    path: 'X:\absolute\path\to\repo'
    plan_globs:
      - "temp/Plan/PLAN_*.txt"
```

⚠️ **Path convention (R1)**: the capture hook reads this file with a regex, not YAML — the `path:` line must stay **single-line and single-quoted** (never folded/multi-line/flow style; never unquoted when the path contains `#`). A style the server accepts but the hook cannot read silently drops this repo's capture.

**THEN RESTART the TrackingMonitor server (F25)** — config is read at startup only. Registration also puts this repo on the capture **allowlist** — the smoke test below CANNOT pass before this step.

## Step 5 — Smoke-test capture

1. From ANY Claude Code session **started AFTER the user-scope hook registration** (restart the session if unsure), edit a scratch file in THIS repo (Edit/Write)
2. Confirm `<repo_root>/.katlab_tracking/events.jsonl` exists and its last line is a JSON event for that file (repo-relative, forward slashes)

If nothing appears, check in this order:

1. the session was started before the hook registration → restart it
2. this repo is missing from `Config/repos.yaml` (allowlist) → do Step 4
3. `python` is not on PATH for the session
4. a managed-settings policy restricts hooks (a managed policy exists on this PC; treated as model-pin-only until a failed smoke says otherwise)

## Notes

- The tracker only READS this repo (git status/diff/log/show — never any mutation).
- The resolution mode of the smoke event depends on this repo's live task set (no `in-progress` task → UNKNOWN in the manual queue — that is correct behavior, NOT a capture failure).
- Start the server: double-click `TrackingMonitor/Scripts/start_tracking_monitor.bat` → UI at the configured host/port (default `http://127.0.0.1:8100`).
