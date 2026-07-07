"""KATLAB TrackingMonitor - PostToolUse capture hook.

Registered in each monitored repo's .claude/settings.json (see
Docs/Installation_Guideline.md). Reads the Claude Code PostToolUse JSON from
stdin and appends one event line to <repo_root>/.katlab_tracking/events.jsonl.

Contract (PLAN v0.1.0.0 B.1):
- exit 0 ALWAYS - a hook failure must never block the user's tool call
- stdlib only, no server dependency (durable local append)
- repo root = nearest ancestor of file_path (fallback: cwd) containing .git
- "file" stored repo-root-relative with FORWARD slashes
"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

EVENT_VERSION = 1
TRACKING_DIR = ".katlab_tracking"
EVENTS_FILE = "events.jsonl"


def find_repo_root (start: Path) -> Path | None:
    for candidate in [start, *start.parents]:
        if (candidate / ".git").exists():
            return candidate
    return None


def main () -> None:
    # CFT-10: read BYTES and decode UTF-8 explicitly - Windows text-mode
    # stdin uses the locale codepage (cp1252) and would garble non-ASCII
    # paths in the payload.
    payload = json.loads(sys.stdin.buffer.read().decode("utf-8"))

    tool_name = payload.get("tool_name", "")
    file_path = (payload.get("tool_input") or {}).get("file_path")
    if not file_path:
        return

    edited = Path(file_path)
    repo_root = find_repo_root(edited.parent if edited.parent != edited else edited)
    if repo_root is None:
        cwd = payload.get("cwd")
        repo_root = find_repo_root(Path(cwd)) if cwd else None
    if repo_root is None:
        return

    try:
        relative = edited.resolve().relative_to(repo_root.resolve())
    except ValueError:
        return

    event = {
        "v": EVENT_VERSION,
        "ts": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "tool": tool_name,
        "file": relative.as_posix(),
    }

    tracking_dir = repo_root / TRACKING_DIR
    tracking_dir.mkdir(parents=True, exist_ok=True)
    with open(tracking_dir / EVENTS_FILE, "a", encoding="utf-8") as handle:
        handle.write(json.dumps(event, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass
    sys.exit(0)
