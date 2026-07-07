# TrackingMonitor — Repo Onboarding Guideline

Self-contained steps for the **Claude Code session running INSIDE a monitored repo** (divide-and-conquer: the TrackingMonitor repo NEVER edits monitored repos — you, the session in the target repo, execute these steps yourself).

**TrackingMonitor home** (single source of truth for hook + server + UI):
`D:\KATLAB_Reiky\_Development_Workspace\KATLAB_TrackingMonitor`

## Step 1 — Register the PostToolUse hook

Edit **this repo's** `.claude/settings.json`.

⚠️ **MERGE — never overwrite (F40)**: read the file first; if it already has content, APPEND to the existing `hooks.PostToolUse` array and PRESERVE all other hooks/permissions/settings. Verify the JSON after writing.

Entry to add (create the file with exactly this if it doesn't exist):

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "python \"D:\\KATLAB_Reiky\\_Development_Workspace\\KATLAB_TrackingMonitor\\Hook\\katlab_tracking_hook.py\""
          }
        ]
      }
    ]
  }
}
```

The script stays in the TrackingMonitor repo (absolute path — zero duplication, no version drift).

## Step 2 — Gitignore the tracking data

Add to this repo's `.gitignore` (the dir is tracker-owned runtime data):

```
# KATLAB TrackingMonitor runtime data
.katlab_tracking/
```

## Step 3 — Smoke-test the hook

1. Edit any scratch file with Claude Code (Edit/Write)
2. Confirm `<repo_root>/.katlab_tracking/events.jsonl` exists and its last line is a JSON event for that file (repo-relative, forward slashes)

If nothing appears: the hook may need a session restart to load the new settings; check `python` is on PATH.

## Step 4 — Plan authoring rules

- Plans live in **`temp/Plan/PLAN_*.txt`** (enhanced format ONLY — no legacy parsing)
- Format spec: `TrackingMonitor/Docs/Plan_Format_Spec.md` (task blocks at column 0; required tags id/title/status; UTF-8; repo-relative `<files>` globs)
- Discipline: keep **exactly ONE task `in-progress`** per repo at a time; flip statuses as you work — the tracker re-parses live

## Step 5 — Register the repo (user does this)

Ask the user to add an entry to `TrackingMonitor/Config/repos.yaml`:

```yaml
  - id: My_Repo_Id          # letters/digits/_/- only
    name: "Readable name"
    path: 'X:\absolute\path\to\repo'
    plan_globs:
      - "temp/Plan/PLAN_*.txt"
```

**THEN RESTART the TrackingMonitor server (F25)** — config is read at startup only; an unrestarted server silently ignores the new repo.

## Notes

- **Stray `.katlab_tracking/` in another repo (F37)**: a hooked session editing a file in a NOT-yet-onboarded repo leaves a tracking dir there (the hook follows the edited FILE's repo). Harmless — delete or gitignore it; it becomes the normal dir once that repo is onboarded.
- The tracker only READS this repo (git status/diff/log/show — never any mutation).
- Start the server: double-click `TrackingMonitor/Scripts/start_tracking_monitor.bat` → UI at the configured host/port (default `http://127.0.0.1:8100`).
