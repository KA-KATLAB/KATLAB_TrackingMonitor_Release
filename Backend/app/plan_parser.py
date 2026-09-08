"""Pure enhanced-plan parsing plus stable raw-byte path acquisition.

Task blocks retain the v1 behavior. TrackingMonitor v0.3 adds one optional
column-zero ``<verification>`` block and safe warning codes. The watcher hashes
and persists the exact stable raw buffer returned by ``acquire_stable_plan_bytes``;
the parser never reopens the path.
"""

import hashlib
import re
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable


TASK_BLOCK = re.compile(
    r"^<task\s+id=\"(?P<id>[^\"]+)\">\r?\n(?P<body>.*?)^</task>",
    re.MULTILINE | re.DOTALL,
)
TASK_OPEN_LINE = re.compile(r'^<task\s+id="[^"]+">$')
TAG = {
    name: re.compile(rf"<{name}>(.*?)</{name}>", re.DOTALL)
    for name in ("title", "status", "why", "files")
}
VALID_STATUSES = {"pending", "in-progress", "done"}
ABSOLUTE_PATTERN = re.compile(r"^([A-Za-z]:|/|\\)")
CHECK_ID_PATTERN = re.compile(r"^[a-z][a-z0-9-]*(?::[a-z][a-z0-9-]*)?$")
VERIFICATION_LINE = re.compile(r"^(?P<id>[^@\s]+)(?:@(?P<target>[^@\s]+))?$")


class PlanReadError(Exception):
    """A transient or unstable path observation; preserve the prior snapshot."""


@dataclass
class ParsedTask:
    id: str
    title: str
    status: str
    files: list[str] = field(default_factory=list)
    why: str = ""


@dataclass
class ParsedRequirement:
    id: str
    streak_target: int | None = None


@dataclass
class ParseResult:
    tasks: list[ParsedTask] = field(default_factory=list)
    requirements: list[ParsedRequirement] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    warning_codes: list[str] = field(default_factory=list)
    fatal: bool = False

    def warn (self, code: str, message: str) -> None:
        self.warning_codes.append(code)
        self.warnings.append(message)


def _file_identity (stat) -> tuple[int, int, int, int]:
    return (
        int(getattr(stat, "st_dev", 0)),
        int(getattr(stat, "st_ino", 0)),
        int(stat.st_size),
        int(stat.st_mtime_ns),
    )


def _read_one_stable_observation (path: Path) -> tuple[bytes, tuple[int, int, int, int]]:
    try:
        before = path.stat()
        raw = path.read_bytes()
        after = path.stat()
    except OSError as exc:
        raise PlanReadError("plan path is temporarily unreadable") from exc
    before_id = _file_identity(before)
    after_id = _file_identity(after)
    if before_id != after_id or len(raw) != after.st_size:
        raise PlanReadError("plan changed during read")
    return raw, after_id


def acquire_stable_plan_bytes (
        path: Path, delay_seconds: float = 0.05,
        sleeper: Callable[[float], None] = time.sleep) -> bytes:
    """Return bytes only after two identical, identity-stable observations."""
    first, first_id = _read_one_stable_observation(path)
    sleeper(max(0.0, delay_seconds))
    second, second_id = _read_one_stable_observation(path)
    if first_id != second_id or first != second:
        raise PlanReadError("plan did not stabilize across the debounce window")
    return second


def raw_plan_sha256 (raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def _verification_blocks (text: str, source: str, result: ParseResult) -> list[list[str]]:
    """Return structurally valid top-level blocks in source order."""
    lines = text.split("\n")
    blocks: list[list[str]] = []
    current: list[str] | None = None
    nested = False
    inside_task = False
    for line in lines:
        if current is None and TASK_OPEN_LINE.fullmatch(line):
            inside_task = True
            continue
        if inside_task:
            if line.startswith("</task>"):
                inside_task = False
            elif line == "<verification>":
                result.warn(
                    "VERIFICATION_NESTED",
                    f"{source}: task-nested <verification> block ignored",
                )
            continue
        if line == "<verification>":
            if current is None:
                current = []
                nested = False
            else:
                nested = True
                result.warn(
                    "VERIFICATION_NESTED",
                    f"{source}: nested <verification> block ignored",
                )
            continue
        if line == "</verification>":
            if current is None:
                result.warn(
                    "VERIFICATION_STRAY_CLOSE",
                    f"{source}: stray </verification> tag ignored",
                )
                continue
            if not nested:
                blocks.append(current)
            current = None
            nested = False
            continue
        if current is not None:
            current.append(line)
        elif line.startswith("<verification") and line != "<verification>":
            result.warn(
                "VERIFICATION_MALFORMED_OPEN",
                f"{source}: malformed column-zero verification opening tag ignored",
            )
    if current is not None:
        result.warn(
            "VERIFICATION_UNCLOSED",
            f"{source}: unclosed <verification> block ignored",
        )
    return blocks


def _parse_requirements (text: str, source: str, result: ParseResult) -> None:
    blocks = _verification_blocks(text, source, result)
    if not blocks:
        return
    if len(blocks) > 1:
        result.warn(
            "VERIFICATION_MULTIPLE",
            f"{source}: multiple valid verification blocks - using the first",
        )

    seen: set[str] = set()
    for ordinal, raw_line in enumerate(blocks[0], start=1):
        line = raw_line.strip()
        if not line:
            continue
        match = VERIFICATION_LINE.fullmatch(line)
        if not match:
            result.warn(
                "VERIFICATION_MALFORMED_LINE",
                f"{source}: malformed verification line {ordinal} ignored",
            )
            continue
        check_id = match.group("id")
        target_raw = match.group("target")
        if not CHECK_ID_PATTERN.fullmatch(check_id):
            result.warn(
                "VERIFICATION_INVALID_ID",
                f"{source}: invalid verification id on line {ordinal} ignored",
            )
            continue

        target: int | None = None
        if target_raw is not None:
            if not check_id.startswith("review:"):
                result.warn(
                    "VERIFICATION_STREAK_NON_REVIEW",
                    f"{source}: streak target is allowed only for review:* on line {ordinal}",
                )
                continue
            try:
                target = int(target_raw, 10)
            except ValueError:
                target = 0
            if not 1 <= target <= 99 or str(target) != target_raw:
                result.warn(
                    "VERIFICATION_STREAK_RANGE",
                    f"{source}: review streak target must be 1..99 on line {ordinal}",
                )
                continue
        elif check_id.startswith("review:"):
            target = 1

        if check_id in seen:
            result.warn(
                "VERIFICATION_DUPLICATE_ID",
                f"{source}: duplicate verification id {check_id!r} - keeping the first",
            )
            continue
        seen.add(check_id)
        result.requirements.append(ParsedRequirement(check_id, target))


def parse_plan_text (text: str, source: str = "plan") -> ParseResult:
    result = ParseResult()
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    seen_ids: set[str] = set()

    for match in TASK_BLOCK.finditer(text):
        task_id = match.group("id").strip()
        body = match.group("body")

        if task_id in seen_ids:
            result.warn(
                "TASK_DUPLICATE_ID",
                f"{source}: duplicate task id {task_id!r} - keeping the first, skipping this one",
            )
            continue

        title_m = TAG["title"].search(body)
        status_m = TAG["status"].search(body)
        if not title_m or not status_m:
            missing = [n for n, m in (("title", title_m), ("status", status_m)) if not m]
            result.warn(
                "TASK_MISSING_REQUIRED",
                f"{source}: task {task_id!r} missing required tag(s) {missing} - block skipped",
            )
            continue

        status = status_m.group(1).strip()
        if status not in VALID_STATUSES:
            result.warn(
                "TASK_INVALID_STATUS",
                f"{source}: task {task_id!r} has invalid status {status!r} - block skipped",
            )
            continue

        files: list[str] = []
        files_m = TAG["files"].search(body)
        if files_m:
            for line in files_m.group(1).splitlines():
                pattern = line.strip()
                if not pattern:
                    continue
                if ABSOLUTE_PATTERN.match(pattern):
                    result.warn(
                        "TASK_ABSOLUTE_PATTERN",
                        f"{source}: task {task_id!r} has ABSOLUTE-looking pattern "
                        f"{pattern!r} - it will never match (use repo-relative paths)",
                    )
                    continue
                files.append(pattern)

        why_m = TAG["why"].search(body)
        seen_ids.add(task_id)
        result.tasks.append(ParsedTask(
            id=task_id,
            title=title_m.group(1).strip(),
            status=status,
            files=files,
            why=why_m.group(1).strip() if why_m else "",
        ))

    _parse_requirements(text, source, result)
    return result


def parse_plan_bytes (raw: bytes, source: str = "plan") -> ParseResult:
    decoded = raw[3:] if raw.startswith(b"\xef\xbb\xbf") else raw
    try:
        text = decoded.decode("utf-8")
    except UnicodeDecodeError:
        result = ParseResult(fatal=True)
        result.warn(
            "PLAN_NOT_UTF8",
            f"{source}: not UTF-8 (UTF-16 or binary?) - preserving the last valid snapshot",
        )
        return result
    return parse_plan_text(text, source)


def parse_plan_file (path: Path, source: str | None = None) -> ParseResult:
    """Compatibility helper for direct callers; watcher uses stable acquisition."""
    source = source or path.name
    try:
        raw = path.read_bytes()
    except OSError:
        result = ParseResult(fatal=True)
        result.warn(
            "PLAN_UNREADABLE",
            f"{source}: unreadable - preserving the last valid snapshot",
        )
        return result
    return parse_plan_bytes(raw, source)
