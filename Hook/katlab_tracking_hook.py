"""KATLAB TrackingMonitor - PostToolUse capture hook.

Registered ONCE per PC at USER scope (C:\\Users\\<user>\\.claude\\settings.json,
see Docs/Installation_Guideline.md) so it fires in EVERY Claude Code session
regardless of where the session is rooted - the real workflow is one session
spanning several repos. Reads the Claude Code PostToolUse JSON from stdin and
appends one event line to .katlab_tracking/events.jsonl inside the repo that
OWNS the edited file.

Contract (PLAN v0.1.0.0 B.1; user-scope + allowlist PLAN v0.1.1.0 A.1):
- exit 0 ALWAYS - a hook failure must never block the user's tool call
- stdlib only, no server dependency (durable local append)
- repo root = nearest ancestor of file_path (fallback: cwd) containing .git
- allowlist: append ONLY for repos registered in Config/repos.yaml
  (KATLAB_TRACKER_CONFIG overrides the registry path; an unreadable or
  empty registry fails OPEN = capture every repo, durability first);
  registry path lines must stay single-line + quoted (R1 convention)
- "file" stored repo-root-relative with FORWARD slashes
"""

import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

EVENT_VERSION = 1
TRACKING_DIR = ".katlab_tracking"
EVENTS_FILE = "events.jsonl"
CONFIG_ENV = "KATLAB_TRACKER_CONFIG"
DEFAULT_CONFIG_PATH = Path(__file__).resolve().parent.parent / "Config" / "repos.yaml"

_PATH_LINE = re.compile(r"^\s*path:\s*(.+?)\s*$")


def find_repo_root (start: Path) -> Path | None:
    for candidate in [start, *start.parents]:
        if (candidate / ".git").exists():
            return candidate
    return None


def _unquote (raw: str) -> str:
    if raw[:1] in ("'", '"') and raw.count(raw[0]) >= 2:
        return raw[1:raw.index(raw[0], 1)]
    return raw.split("#", 1)[0].strip()


def load_registered_roots () -> list[Path] | None:
    """Repo paths registered in repos.yaml; None = fail open (capture all)."""
    config_path = Path(os.environ.get(CONFIG_ENV) or DEFAULT_CONFIG_PATH)
    try:
        lines = config_path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return None
    roots: list[Path] = []
    for line in lines:
        match = _PATH_LINE.match(line)
        if not match:
            continue
        raw = _unquote(match.group(1))
        if raw:
            roots.append(Path(raw).resolve())
    return roots or None


def main () -> None:
    # CFT-10: read BYTES and decode UTF-8 explicitly - Windows text-mode
    # stdin uses the locale codepage (cp1252) and would garble non-ASCII
    # paths in the payload.
    payload = json.loads(sys.stdin.buffer.read().decode("utf-8"))

    tool_name = payload.get("tool_name", "")
    # v0.1.5.0 CFT-2: non-empty str or "?" - mirrors the server-side coercion
    # (a non-string value in a hand-crafted payload must never reach the
    # line; same both-ends discipline as the RV17/RV30 session_id guard).
    if not isinstance(tool_name, str) or not tool_name:
        tool_name = "?"
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

    registered = load_registered_roots()
    if registered is not None and repo_root.resolve() not in registered:
        return

    try:
        relative = edited.resolve().relative_to(repo_root.resolve())
    except ValueError:
        return

    # v0.1.5.0 D1 (RV17/RV30): session attribution - non-empty str or None,
    # never any other type (a non-string bind would wedge server ingest).
    # EVENT_VERSION stays 1: the key is optional, compatible both directions.
    session_id = payload.get("session_id")
    if not isinstance(session_id, str) or not session_id:
        session_id = None

    event = {
        "v": EVENT_VERSION,
        "ts": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "tool": tool_name,
        "file": relative.as_posix(),
        "session_id": session_id,
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
