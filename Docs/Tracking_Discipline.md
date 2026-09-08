# TrackingMonitor — Working Discipline for Monitored Repos

Standing rules for every Claude Code or Codex session working inside a monitored
repo (EA/UM/...). The tracker is live: supported file tools are captured and
attributed to a plan task; provider/check activity is metadata-only.

## The 3 rules

1. **Flip BEFORE you edit.** Before editing ANY file, set the relevant task in `temp/Plan/PLAN_v*.txt` to `<status>in-progress</status>`. Keep **exactly ONE** task in-progress at a time. Flip it to `done` immediately after finishing (the tracker re-parses on save — statuses are live).

2. **Never edit with zero (or 2+) tasks in-progress.** Any edit of a file not declared in a task's `<files>` — including edits to the plan file itself — is attributed to the single in-progress task (A-global). With zero or several in-progress, the tracker refuses to guess: the event lands as UNKNOWN/AMBIGUOUS in the user's manual-pick queue. That queue must stay empty.

3. **Declare `<files>` precisely.** One path/glob per line, repo-relative, forward slashes (`*` does not cross `/`, `**` does). Exact declarations give exact (MODE B) attribution regardless of statuses. Format spec: `Docs/Plan_Format_Spec.md`.

## Quick self-check before any edit

- Is exactly one task `in-progress`? → if not, fix statuses FIRST
- Is the file I'm about to touch covered by that task's `<files>` (or intentionally A-global)? → if not, update `<files>`

## Reminders

- TrackingMonitor repo itself is READ-ONLY for you — never edit it.
- Legacy-format plans are invisible to the tracker (zero tasks); only the enhanced format counts.
- The status bar goes CLEAN only when the repo has zero uncommitted changes — commit rhythm stays the user's call.
- Declare gates in one top-level `<verification>` block. Run only the reviewed
  command; record manual evidence only with `Scripts/record_evidence.py` after the
  final relevant edit. A later plan/source edit can make prior evidence stale.
- Mission states and green checks are evidence summaries, not universal correctness
  claims. Inspect every blocker and unassigned record.
- TrackingMonitor never runs a gate or mutates Git. It cannot commit, push, check
  out, create, or delete branches; those actions remain explicit user decisions.
