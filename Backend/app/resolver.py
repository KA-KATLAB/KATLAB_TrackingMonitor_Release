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
from collections.abc import Callable
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
                i += 2
                if i < len(pattern) and pattern[i] == "/":
                    out.append("(?:.*/)?")
                    i += 1
                else:
                    out.append(".*")
                continue
            out.append("[^/]*")
        elif ch == "?":
            out.append("[^/]")
        else:
            out.append(re.escape(ch))
        i += 1
    return re.compile("^" + "".join(out) + "$")


@dataclass
class GlobMatchStats:
    """Optional counters for checking the forecast matcher's work bounds."""

    state_visits: int = 0
    peak_live_states: int = 0


def deterministic_glob_match (pattern: str, file_path: str,
                              stats: GlobMatchStats | None = None) -> bool:
    """Match the existing glob language with two rolling NFA frontiers.

    A frontier has one slot per token boundary. Each input code point visits
    each token once; `**/` has separate optional-start and directory-body
    states so a partial directory cannot escape without its final `/`.
    The final-LF check mirrors Python regex's terminal `$` anchor.
    """
    tokens: list[tuple[str, str]] = []
    index = 0
    while index < len(pattern):
        char = pattern[index]
        if char == "*" and pattern[index:index + 2] == "**":
            index += 2
            if index < len(pattern) and pattern[index] == "/":
                tokens.append(("directory_start", ""))
                tokens.append(("directory_body", ""))
                index += 1
            else:
                tokens.append(("deep", ""))
            continue
        if char == "*":
            tokens.append(("star", ""))
        elif char == "?":
            tokens.append(("any", ""))
        else:
            tokens.append(("literal", char))
        index += 1

    token_count = len(tokens)
    current = bytearray(token_count + 1)
    current[0] = 1
    for index, (kind, _) in enumerate(tokens):
        if current[index] and kind in ("star", "deep"):
            current[index + 1] = 1
        elif current[index] and kind == "directory_start":
            current[index + 2] = 1
        if stats is not None:
            stats.state_visits += 1

    if stats is not None:
        stats.peak_live_states = max(stats.peak_live_states,
                                     2 * (token_count + 1))

    before_final_lf = False
    for path_index, char in enumerate(file_path):
        if path_index == len(file_path) - 1 and char == "\n":
            before_final_lf = bool(current[token_count])
        following = bytearray(token_count + 1)
        for index, (kind, literal) in enumerate(tokens):
            if current[index]:
                if kind == "star" and char != "/":
                    following[index] = 1
                elif kind == "deep" and char != "\n":
                    following[index] = 1
                elif kind == "directory_start":
                    if char != "\n":
                        following[index + 1] = 1
                    if char == "/":
                        following[index + 2] = 1
                elif kind == "directory_body":
                    if char != "\n":
                        following[index] = 1
                    if char == "/":
                        following[index + 1] = 1
                elif kind == "any" and char != "/":
                    following[index + 1] = 1
                elif kind == "literal" and char == literal:
                    following[index + 1] = 1
            if following[index] and kind in ("star", "deep"):
                following[index + 1] = 1
            elif following[index] and kind == "directory_start":
                following[index + 2] = 1
            if stats is not None:
                stats.state_visits += 1
        current = following
    return bool(current[token_count]) or before_final_lf


@dataclass
class Resolution:
    mode: str                      # B|A_SCOPED|A_GLOBAL|AMBIGUOUS|UNKNOWN
    task_ref: str | None           # "<plan filename> - <task id>" or None
    candidates: list[str] | None   # task refs for the manual picker (AMBIGUOUS)
    plan_file: str | None = None   # normalized relational key; never parsed from task_ref
    task_id: str | None = None
    candidate_keys: list[tuple[str, str]] | None = None


def task_ref (task_row) -> str:
    return f"{task_row['plan_file']} - {task_row['task_id']}"


def _resolved (mode: str, task_row) -> Resolution:
    return Resolution(
        mode, task_ref(task_row), None,
        task_row["plan_file"], task_row["task_id"],
    )


def resolve (file_path: str, repo_tasks: list,
             matcher: Callable[[str, str], bool] | None = None) -> Resolution:
    """repo_tasks: rows with plan_file, task_id, status, files (list of patterns)."""
    matches = []
    for task in repo_tasks:
        for pattern in task["files"]:
            matched = (matcher(pattern, file_path) if matcher is not None
                       else bool(glob_to_regex(pattern).match(file_path)))
            if matched:
                matches.append(task)
                break  # one task counts once, however many patterns match

    if len(matches) == 1:
        return _resolved("B", matches[0])

    if len(matches) > 1:
        in_progress = [t for t in matches if t["status"] == "in-progress"]
        if len(in_progress) == 1:
            return _resolved("A_SCOPED", in_progress[0])
        candidates = []
        candidate_keys = []
        for task in matches:
            candidates.append(task_ref(task))
            candidate_keys.append((task["plan_file"], task["task_id"]))
        return Resolution("AMBIGUOUS", None, candidates,
                          candidate_keys=candidate_keys)

    # N = 0 - undeclared file
    in_progress_all = [t for t in repo_tasks if t["status"] == "in-progress"]
    if len(in_progress_all) == 1:
        return _resolved("A_GLOBAL", in_progress_all[0])
    return Resolution("UNKNOWN", None, None)
