"""Bounded, read-only Mission attribution forecast from captured observations."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import datetime

from . import db
from .plan_parser import ABSOLUTE_PATTERN
from .resolver import deterministic_glob_match, resolve


MAX_PATHS = 1000
MAX_PLANS = 256
MAX_TASKS = 256
MAX_PATH_BYTES = 4096
MAX_PLAN_BYTES = 2048
MAX_TASK_ID_BYTES = 128
MAX_PATTERN_BYTES = 512
MAX_RESOLVER_VISITS = 100_000
MAX_MATCHER_VISITS = 10_000_000
MAX_REQUEST_PATHS = 2000
MAX_JSON_BYTES = 2 * 1024 * 1024
MODES = ("B", "A_SCOPED", "A_GLOBAL", "AMBIGUOUS", "UNKNOWN")
REASONS = {
    "offline", "status_unavailable", "too_many_paths", "too_much_work",
    "plan_context_unavailable", "busy",
}
_REPO_ID = re.compile(r"^[A-Za-z0-9_-]+$", re.ASCII)
_UTC_Z = re.compile(
    r"^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):"
    r"([0-9]{2}):([0-9]{2})(?:\.([0-9]{1,6}))?Z$", re.ASCII,
)
_CONTROL = re.compile(r"[\x00-\x1f\x7f]")
_DRIVE = re.compile(r"^[A-Za-z]:", re.ASCII)


class ForecastPayloadError(Exception):
    """The additive response cannot be represented within its hard byte cap."""


def valid_timestamp (value: object) -> bool:
    if not isinstance(value, str) or not 20 <= len(value) <= 27:
        return False
    match = _UTC_Z.fullmatch(value)
    if match is None:
        return False
    year, month, day, hour, minute, second = map(int, match.groups()[:6])
    try:
        datetime(year, month, day, hour, minute, second)
    except ValueError:
        return False
    return True


def _utf8_bytes (value: str, cap: int) -> int | None:
    if len(value) > cap:
        return None
    try:
        size = len(value.encode("utf-8"))
    except UnicodeEncodeError:
        return None
    return size if size <= cap else None


def _lexical_path (value: object, cap: int) -> bool:
    if not isinstance(value, str) or not value or len(value) > cap:
        return False
    if (value.startswith("/") or _DRIVE.match(value) or "\\" in value
            or _CONTROL.search(value)):
        return False
    if any(part in ("", ".", "..") for part in value.split("/")):
        return False
    return True


def _valid_path (value: object, cap: int) -> bool:
    return _lexical_path(value, cap) and _utf8_bytes(value, cap) is not None


def _valid_task_id (value: object) -> bool:
    return bool(
        isinstance(value, str) and value and len(value) <= MAX_TASK_ID_BYTES
        and not value.startswith(" ") and not value.endswith(" ")
        and not _CONTROL.search(value)
        and _utf8_bytes(value, MAX_TASK_ID_BYTES) is not None
    )


def _row (repo: str, source: str, reason: str | None, *,
          observed_at: str | None = None, branch: str | None = None,
          plan_context_at: str | None = None,
          plan_context_state: str | None = None) -> dict:
    ready = reason is None
    return {
        "repo": repo, "source": source,
        "state": "ready" if ready else "unavailable", "reason": reason,
        "observed_at": observed_at,
        "plan_context_at": plan_context_at if ready else None,
        "plan_context_state": plan_context_state if ready else None,
        "branch": branch,
        "total_paths": 0 if ready else None,
        "mode_counts": {mode: 0 for mode in MODES} if ready else None,
        "items": [],
    }


@dataclass(frozen=True)
class PreparedRepo:
    repo: str
    row: dict
    paths: tuple[str, ...] | None = None
    path_bytes: tuple[int, ...] | None = None

    @property
    def eligible (self) -> bool:
        return self.paths is not None


def prepare_repo (repo_id: str, status: dict | None,
                  dirty_paths: object, *, offline: bool,
                  source: str) -> PreparedRepo:
    """Apply offline/status/path gates without reading the plan guard or DB."""
    if len(repo_id) > MAX_JSON_BYTES:
        raise ForecastPayloadError("configured repository ID exceeds response cap")
    if _REPO_ID.fullmatch(repo_id) is None:
        raise ForecastPayloadError("invalid configured repository ID")
    if source not in ("working_tree", "demo"):
        raise ValueError("unknown forecast source")
    if offline:
        return PreparedRepo(repo_id, _row(repo_id, source, "offline"))
    if (not isinstance(status, dict) or status.get("status_valid") is not True
            or status.get("paths_complete") is not True
            or not valid_timestamp(status.get("observed_at"))):
        return PreparedRepo(repo_id, _row(repo_id, source, "status_unavailable"))

    observed_at = status["observed_at"]
    branch = status.get("branch")
    if not (branch is None or isinstance(branch, str)):
        return PreparedRepo(repo_id, _row(repo_id, source, "status_unavailable"))
    if isinstance(branch, str):
        if len(branch) > MAX_JSON_BYTES:
            return PreparedRepo(repo_id, _row(repo_id, source, "status_unavailable"))
        try:
            branch.encode("utf-8")
        except UnicodeEncodeError:
            return PreparedRepo(repo_id, _row(repo_id, source, "status_unavailable"))

    if not isinstance(dirty_paths, (list, tuple)):
        return PreparedRepo(repo_id, _row(repo_id, source, "status_unavailable"))
    if len(dirty_paths) > MAX_PATHS:
        return PreparedRepo(repo_id, _row(
            repo_id, source, "too_many_paths", observed_at=observed_at,
            branch=branch,
        ))
    paths: list[str] = []
    path_bytes: list[int] = []
    seen: set[str] = set()
    for path in dirty_paths:
        if not isinstance(path, str):
            return PreparedRepo(repo_id, _row(repo_id, source,
                                              "status_unavailable"))
        if len(path) > MAX_PATH_BYTES:
            return PreparedRepo(repo_id, _row(
                repo_id, source, "too_much_work", observed_at=observed_at,
                branch=branch,
            ))
        if not _lexical_path(path, MAX_PATH_BYTES) or path in seen:
            return PreparedRepo(repo_id, _row(repo_id, source,
                                              "status_unavailable"))
        try:
            byte_count = len(path.encode("utf-8"))
        except UnicodeEncodeError:
            return PreparedRepo(repo_id, _row(repo_id, source,
                                              "status_unavailable"))
        if byte_count > MAX_PATH_BYTES:
            return PreparedRepo(repo_id, _row(
                repo_id, source, "too_much_work", observed_at=observed_at,
                branch=branch,
            ))
        seen.add(path)
        paths.append(path)
        path_bytes.append(byte_count)
    return PreparedRepo(
        repo_id,
        _row(repo_id, source, "busy", observed_at=observed_at, branch=branch),
        tuple(paths), tuple(path_bytes),
    )


def _pattern_bytes (value: object) -> tuple[int | None, str | None]:
    if not isinstance(value, str) or not value:
        return None, "plan_context_unavailable"
    if len(value) > MAX_PATTERN_BYTES:
        return None, "too_much_work"
    if (value != value.strip() or value.splitlines() != [value]
            or ABSOLUTE_PATTERN.match(value)):
        return None, "plan_context_unavailable"
    size = _utf8_bytes(value, MAX_PATTERN_BYTES)
    if size is None:
        try:
            value.encode("utf-8")
        except UnicodeEncodeError:
            return None, "plan_context_unavailable"
        return None, "too_much_work"
    return size, None


def validate_plan_row (row: dict) -> bool:
    """Validate one projected current-plan identity and health value."""
    return bool(
        isinstance(row, dict)
        and _valid_path(row.get("plan_file"), MAX_PLAN_BYTES)
        and row.get("parse_state") in ("valid", "warning", "fatal")
    )


def validate_task_row (row: dict, plan_files: set[str]
                       ) -> tuple[dict | None, str | None]:
    """Validate one projected task before the next SQLite row is fetched."""
    if not isinstance(row, dict):
        return None, "plan_context_unavailable"
    plan_file, task_id, status = (
        row.get("plan_file"), row.get("task_id"), row.get("status")
    )
    if (not _valid_path(plan_file, MAX_PLAN_BYTES)
            or not _valid_task_id(task_id)
            or status not in ("pending", "in-progress", "done")
            or plan_file not in plan_files):
        return None, "plan_context_unavailable"
    if "files_json" in row:
        raw = row["files_json"]
        if not isinstance(raw, str) or len(raw) > 8192:
            return None, "plan_context_unavailable"
        try:
            if len(raw.encode("utf-8")) > 8192:
                return None, "plan_context_unavailable"
            patterns = json.loads(raw)
        except (UnicodeEncodeError, ValueError, TypeError, RecursionError):
            return None, "plan_context_unavailable"
    else:
        patterns = row.get("files")
    if not isinstance(patterns, list):
        return None, "plan_context_unavailable"
    pattern_bytes = 0
    for pattern in patterns:
        size, reason = _pattern_bytes(pattern)
        if reason is not None:
            return None, reason
        pattern_bytes += size + 1
    return {
        "plan_file": plan_file, "task_id": task_id,
        "status": status, "files": patterns,
        "pattern_bytes": pattern_bytes,
    }, None


def _validate_context (context: db.ForecastContext,
                       needs_tasks: bool) -> tuple[str | None, str | None,
                                                   list[dict], int]:
    if context.reason is not None:
        return context.reason, None, [], 0
    if len(context.plans) > MAX_PLANS:
        return "too_much_work", None, [], 0
    plan_files: set[str] = set()
    state = "valid"
    for plan in context.plans:
        if not validate_plan_row(plan):
            return "plan_context_unavailable", None, [], 0
        plan_file = plan.get("plan_file")
        if plan_file in plan_files:
            return "plan_context_unavailable", None, [], 0
        plan_files.add(plan_file)
        parse_state = plan.get("parse_state")
        if parse_state not in ("valid", "warning"):
            return "plan_context_unavailable", None, [], 0
        if parse_state == "warning":
            state = "warning"
    if not needs_tasks:
        return None, state, [], 0

    if context.tasks is None:
        return "plan_context_unavailable", None, [], 0
    if len(context.tasks) > MAX_TASKS:
        return "too_much_work", None, [], 0
    tasks: list[dict] = []
    pattern_bytes = 0
    seen_tasks: set[tuple[str, str]] = set()
    for row in context.tasks:
        validated, reason = validate_task_row(row, plan_files)
        if reason is not None:
            return reason, None, [], 0
        assert validated is not None
        key = (validated["plan_file"], validated["task_id"])
        if key in seen_tasks:
            return "plan_context_unavailable", None, [], 0
        seen_tasks.add(key)
        pattern_bytes += validated["pattern_bytes"]
        tasks.append(validated)
    return None, state, tasks, pattern_bytes


def _json_size (value: object) -> int:
    return len(json.dumps(value, ensure_ascii=True,
                          separators=(",", ":")).encode("utf-8"))


class ForecastBatch:
    """Exact output charging and cumulative work admission for one request."""

    def __init__ (self, scope: dict, prepared: list[PreparedRepo]) -> None:
        if len(prepared) > 4:
            raise ForecastPayloadError("too many forecast repositories")
        self.scope = scope
        self.prepared = prepared
        self.rows = [item.row.copy() for item in prepared]
        self._row_sizes = [_json_size(row) for row in self.rows]
        self._size = (
            _json_size({"forecast_scope": scope, "forecast": []})
            + sum(self._row_sizes) + max(0, len(self.rows) - 1)
        )
        self._paths = 0
        self._resolver_visits = 0
        self._matcher_visits = 0

    def _replace (self, index: int, row: dict) -> None:
        charge = _json_size(row)
        self._size += charge - self._row_sizes[index]
        self._row_sizes[index] = charge
        self.rows[index] = row

    def mark_unavailable (self, index: int, reason: str) -> None:
        if reason not in REASONS:
            raise ValueError("unknown forecast reason")
        prior = self.rows[index]
        observed_at = prior["observed_at"]
        branch = prior["branch"]
        if reason in ("offline", "status_unavailable"):
            observed_at = branch = None
        self._replace(index, _row(
            prior["repo"], prior["source"], reason,
            observed_at=observed_at, branch=branch,
        ))

    def build_ready (self, index: int, context: db.ForecastContext,
                     guard_completed_at: str | None) -> None:
        prepared = self.prepared[index]
        if not prepared.eligible:
            return
        if not valid_timestamp(guard_completed_at):
            self.mark_unavailable(index, "plan_context_unavailable")
            return
        reason, state, tasks, pattern_bytes = _validate_context(
            context, bool(prepared.paths),
        )
        if reason is not None:
            self.mark_unavailable(index, reason)
            return
        assert prepared.paths is not None and prepared.path_bytes is not None
        path_count = len(prepared.paths)
        pattern_count = sum(len(task["files"]) for task in tasks)
        literal_patterns: set[str] = set()
        literal_pattern_bytes = 0
        for task in tasks:
            for pattern in task["files"]:
                if "*" not in pattern and "?" not in pattern:
                    literal_patterns.add(pattern)
                    literal_pattern_bytes += len(pattern.encode("utf-8")) + 1
        wildcard_pattern_bytes = pattern_bytes - literal_pattern_bytes
        resolver_visits = path_count * (3 * len(tasks) + pattern_count)
        matcher_visits = (
            path_count * literal_pattern_bytes
            + sum(n + 1 for n in prepared.path_bytes) * wildcard_pattern_bytes
        )
        if (resolver_visits > MAX_RESOLVER_VISITS
                or matcher_visits > MAX_MATCHER_VISITS
                or self._paths + path_count > MAX_REQUEST_PATHS
                or self._resolver_visits + resolver_visits > MAX_RESOLVER_VISITS
                or self._matcher_visits + matcher_visits > MAX_MATCHER_VISITS):
            self.mark_unavailable(index, "too_much_work")
            return
        self._paths += path_count
        self._resolver_visits += resolver_visits
        self._matcher_visits += matcher_visits

        prior = self.rows[index]
        self._replace(index, _row(
            prior["repo"], prior["source"], None,
            observed_at=prior["observed_at"], branch=prior["branch"],
            plan_context_at=guard_completed_at, plan_context_state=state,
        ))
        if self._size > MAX_JSON_BYTES:
            self.mark_unavailable(index, "too_much_work")
            return
        row = self.rows[index]
        task_keys = {(task["plan_file"], task["task_id"]) for task in tasks}

        def forecast_matcher (pattern: str, file_path: str) -> bool:
            if pattern in literal_patterns:
                return pattern == file_path
            return deterministic_glob_match(pattern, file_path)

        for path in prepared.paths:
            resolution = resolve(path, tasks, matcher=forecast_matcher)
            mode = resolution.mode
            if mode not in MODES:
                self.mark_unavailable(index, "plan_context_unavailable")
                return
            target = None
            if mode in ("B", "A_SCOPED", "A_GLOBAL"):
                if ((resolution.plan_file, resolution.task_id) not in task_keys
                        or resolution.candidate_keys):
                    self.mark_unavailable(index, "plan_context_unavailable")
                    return
                target = {
                    "plan_file": resolution.plan_file,
                    "task_id": resolution.task_id,
                }
            candidate_keys = resolution.candidate_keys or []
            if mode == "AMBIGUOUS":
                if (resolution.plan_file is not None
                        or resolution.task_id is not None
                        or not isinstance(candidate_keys, list)
                        or not 2 <= len(candidate_keys) <= min(MAX_TASKS, len(tasks))):
                    self.mark_unavailable(index, "plan_context_unavailable")
                    return
                shown = candidate_keys[:10]
                if (len(set(shown)) != len(shown)
                        or any(key not in task_keys for key in shown)):
                    self.mark_unavailable(index, "plan_context_unavailable")
                    return
            elif mode == "UNKNOWN" and (
                    resolution.plan_file is not None
                    or resolution.task_id is not None or candidate_keys):
                self.mark_unavailable(index, "plan_context_unavailable")
                return
            candidate_count = len(candidate_keys) if mode == "AMBIGUOUS" else 0
            item = {
                "file": path, "mode": mode, "target": target,
                "candidate_count": candidate_count,
                "candidates": [
                    {"plan_file": plan_file, "task_id": task_id}
                    for plan_file, task_id in candidate_keys[:10]
                ] if mode == "AMBIGUOUS" else [],
                "candidates_truncated": candidate_count > 10,
            }
            count = row["mode_counts"][mode]
            delta = (
                _json_size(item) + (1 if row["items"] else 0)
                + len(str(row["total_paths"] + 1)) - len(str(row["total_paths"]))
                + len(str(count + 1)) - len(str(count))
            )
            if self._size + delta > MAX_JSON_BYTES:
                self.mark_unavailable(index, "too_much_work")
                return
            row["items"].append(item)
            row["total_paths"] += 1
            row["mode_counts"][mode] += 1
            self._size += delta
            self._row_sizes[index] += delta

    def finish (self) -> dict:
        result = {"forecast_scope": self.scope, "forecast": self.rows}
        if self._size > MAX_JSON_BYTES or _json_size(result) != self._size:
            raise ForecastPayloadError("forecast unavailable")
        return result
