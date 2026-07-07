# KATLAB Enhanced Plan Format — Specification v1.0

Normative spec for tracker-parseable plans. Authored per `PLAN_v0.1.0.0_TrackingMonitor_Foundation.txt` item A.1; the tracker parses ONLY this format (no legacy support — user decision 2026-07-07).

## 1. File

- Plain text `.txt`, human-readable KATLAB plan style
- **Location**: `temp/Plan/PLAN_*.txt` in each monitored repo (configurable via `plan_globs` in `Config/repos.yaml`)
- **Encoding (F51)**: UTF-8. A UTF-8 BOM is tolerated (stripped). Any other encoding (e.g. UTF-16) fails decoding → warning surfaced in the UI, file treated as zero tasks — never a crash
- **Line endings (F50)**: LF and CRLF both accepted — the parser normalizes `\r`

## 2. The `<task>` block — the machine-readable unit

```
<task id="B.1">
<title>PostToolUse hook script</title>
<status>in-progress</status>
<files>
Hook/katlab_tracking_hook.py
Backend/app/*.py
</files>
<why>Free text — shown in the UI as the reason for changes.</why>
</task>
```

### 2.1 Recognition rule (F4 — column 0)

A block is recognized ONLY when its `<task ...>` opening tag starts at **column 0** (line start). Indented blocks (like examples inside documentation) are IGNORED by the parser. Everything outside `<task>` blocks is free prose.

### 2.2 Required / optional tags (F53)

| Tag | Required | Absent means |
|---|---|---|
| `id` (attribute) | YES | block invalid → skipped + warning |
| `<title>` | YES | block invalid → skipped + warning |
| `<status>` | YES | block invalid → skipped + warning |
| `<files>` | no | task declares NOTHING — participates via in-progress MODE A only ("misc" task) |
| `<why>` | no | UI shows the title as the reason |

Unknown tags are ignored (forward compatibility).

### 2.3 Field rules

- **id**: unique within the plan (convention: letter-group + number, e.g. `B.1`). Duplicate id → parser keeps the FIRST, warns
- **status**: exactly one of `pending` | `in-progress` | `done`
- **files**: one path or glob per line, **relative to the monitored repo root**, forward slashes
  - Glob semantics (F2): `*` does NOT cross `/`, `**` crosses directories, `?` = one character (custom translation — NOT raw fnmatch)
  - An absolute-looking pattern (drive letter or leading `/`) can never match and triggers a warning (F52)
- **why**: free text; the UI's "reason" line

## 3. How the tracker uses tasks (hybrid-C summary)

Event file matched against ALL tasks' `<files>` patterns across ALL parsed plans of that repo (task status NOT pre-filtered):

| Matches | Rule | Result |
|---|---|---|
| N = 1 | declaration wins | MODE B — tagged with that task |
| N > 1 | exactly 1 match is `in-progress` | MODE A scoped |
| N > 1 | 0 or ≥2 in-progress | AMBIGUOUS → manual pick |
| N = 0 | exactly 1 `in-progress` in the whole repo | MODE A global fallback |
| N = 0 | 0 or ≥2 in-progress | UNKNOWN → manual pick |

Task reference shown in the UI: **`<plan file> - <task id>`**, where `<plan file>` is the plan's **repo-relative path** (e.g. `temp/Plan/PLAN_v0.1.0.0_X.txt - B.1`) — bare filenames would collide across directories.

## 4. Authoring discipline (recommended, not enforced)

1. Keep **exactly ONE task `in-progress` per repo** at a time → MODE A stays deterministic
2. Set `in-progress` when starting a task, `done` immediately after finishing (the tracker re-parses on save — status changes are live)
3. Declare `<files>` as precisely as possible → more MODE B (exact) attributions, fewer AMBIGUOUS
4. Plans are working documents: archive to subfolders when complete (the tracker removes tasks of deleted/renamed plans automatically — F16)
