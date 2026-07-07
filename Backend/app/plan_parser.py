"""Enhanced plan format parser (PLAN v0.1.0.0 D.1, spec: Docs/Plan_Format_Spec.md).

Parses ONLY the enhanced <task> block format. Never crashes on bad input:
invalid blocks are skipped with a warning (surfaced to the UI via F47).
"""

import re
from dataclasses import dataclass, field
from pathlib import Path

# F4: <task ...> recognized ONLY at column 0. Closing </task> also at column 0.
TASK_BLOCK = re.compile(
    r"^<task\s+id=\"(?P<id>[^\"]+)\">\r?\n(?P<body>.*?)^</task>",
    re.MULTILINE | re.DOTALL,
)
TAG = {
    name: re.compile(rf"<{name}>(.*?)</{name}>", re.DOTALL)
    for name in ("title", "status", "why", "files")
}
VALID_STATUSES = {"pending", "in-progress", "done"}
ABSOLUTE_PATTERN = re.compile(r"^([A-Za-z]:|/|\\)")  # F52


@dataclass
class ParsedTask:
    id: str
    title: str
    status: str
    files: list[str] = field(default_factory=list)
    why: str = ""


@dataclass
class ParseResult:
    tasks: list[ParsedTask] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def parse_plan_text (text: str, source: str = "plan") -> ParseResult:
    result = ParseResult()
    text = text.replace("\r\n", "\n").replace("\r", "\n")  # F50: CRLF/LF
    seen_ids: set[str] = set()

    for match in TASK_BLOCK.finditer(text):
        task_id = match.group("id").strip()
        body = match.group("body")

        if task_id in seen_ids:
            result.warnings.append(
                f"{source}: duplicate task id {task_id!r} - keeping the first, skipping this one"
            )
            continue

        title_m = TAG["title"].search(body)
        status_m = TAG["status"].search(body)
        # F53 matrix: id + title + status REQUIRED.
        if not title_m or not status_m:
            missing = [n for n, m in (("title", title_m), ("status", status_m)) if not m]
            result.warnings.append(
                f"{source}: task {task_id!r} missing required tag(s) {missing} - block skipped"
            )
            continue

        status = status_m.group(1).strip()
        if status not in VALID_STATUSES:
            result.warnings.append(
                f"{source}: task {task_id!r} has invalid status {status!r} - block skipped"
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
                    # F52: absolute paths can never match repo-relative events.
                    result.warnings.append(
                        f"{source}: task {task_id!r} has ABSOLUTE-looking pattern "
                        f"{pattern!r} - it will never match (use repo-relative paths)"
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

    return result


def parse_plan_file (path: Path, source: str | None = None) -> ParseResult:
    source = source or path.name
    try:
        raw = path.read_bytes()
    except OSError as exc:
        result = ParseResult()
        result.warnings.append(f"{source}: unreadable ({exc}) - treated as zero tasks")
        return result

    # F51: UTF-8 only; BOM stripped; decode failure -> warning + zero tasks.
    if raw.startswith(b"\xef\xbb\xbf"):
        raw = raw[3:]
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        result = ParseResult()
        result.warnings.append(
            f"{source}: not UTF-8 (UTF-16 or binary?) - treated as zero tasks; "
            f"save the plan as UTF-8"
        )
        return result

    return parse_plan_text(text, source)
