"""Hybrid-C resolver (PLAN v0.1.0.0 E.1) - implements
Ref/hybrid_C_resolution_flow.mermaid LITERALLY.

Match the event file against ALL tasks' <files> patterns across ALL parsed
plans of the repo (task status is NOT pre-filtered - D8):
  N=1              -> MODE B (declaration wins)
  N>1, exactly 1 in-progress among matches -> A_SCOPED
  N>1, else        -> AMBIGUOUS (manual pick; candidates stored - F12)
  N=0, exactly 1 in-progress in whole repo  -> A_GLOBAL
  N=0, else        -> UNKNOWN (manual pick)
Never silently guess. MANUAL (set via PATCH) is final - no auto re-resolution.
"""

import re
from dataclasses import dataclass


def glob_to_regex (pattern: str) -> re.Pattern:
    """F2 semantics: `*` does NOT cross `/`, `**` does, `?` = one char.

    Raw fnmatch is WRONG here - its `*` crosses separators and over-matches.
    """
    out = []
    i = 0
    while i < len(pattern):
        ch = pattern[i]
        if ch == "*":
            if pattern[i:i + 2] == "**":
                out.append(".*")
                i += 2
                if i < len(pattern) and pattern[i] == "/":
                    i += 1  # "**/" already covered by ".*"
                continue
            out.append("[^/]*")
        elif ch == "?":
            out.append("[^/]")
        else:
            out.append(re.escape(ch))
        i += 1
    return re.compile("^" + "".join(out) + "$")


@dataclass
class Resolution:
    mode: str                      # B|A_SCOPED|A_GLOBAL|AMBIGUOUS|UNKNOWN
    task_ref: str | None           # "<plan filename> - <task id>" or None
    candidates: list[str] | None   # task refs for the manual picker (AMBIGUOUS)


def task_ref (task_row) -> str:
    return f"{task_row['plan_file']} - {task_row['task_id']}"


def resolve (file_path: str, repo_tasks: list) -> Resolution:
    """repo_tasks: rows with plan_file, task_id, status, files (list of patterns)."""
    matches = []
    for task in repo_tasks:
        for pattern in task["files"]:
            if glob_to_regex(pattern).match(file_path):
                matches.append(task)
                break  # one task counts once, however many patterns match

    if len(matches) == 1:
        return Resolution("B", task_ref(matches[0]), None)

    if len(matches) > 1:
        in_progress = [t for t in matches if t["status"] == "in-progress"]
        if len(in_progress) == 1:
            return Resolution("A_SCOPED", task_ref(in_progress[0]), None)
        return Resolution("AMBIGUOUS", None, [task_ref(t) for t in matches])

    # N = 0 - undeclared file
    in_progress_all = [t for t in repo_tasks if t["status"] == "in-progress"]
    if len(in_progress_all) == 1:
        return Resolution("A_GLOBAL", task_ref(in_progress_all[0]), None)
    return Resolution("UNKNOWN", None, None)
