"""Stdlib-only transport and registry helpers for KATLAB provider hooks."""

import hashlib
import json
import os
import re
import tempfile
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import BinaryIO


SCHEMA_VERSION = 1
EVENT_VERSION = 1
MAX_ACTIVITY_BYTES = 65_536
MAX_STDIN_BYTES = MAX_ACTIVITY_BYTES
MAX_REPO_IDS = 16
CONFIG_ENV = "KATLAB_TRACKER_CONFIG"
ACTIVITY_DIR_ENV = "KATLAB_TRACKER_ACTIVITY_DIR"
REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CONFIG_PATH = REPO_ROOT / "Config" / "repos.yaml"
DEFAULT_CHECKS_PATH = REPO_ROOT / "Config" / "checks.json"
DEFAULT_ACTIVITY_ROOT = REPO_ROOT / "data"
DEFAULT_PLAN_GLOBS = ("temp/Plan/PLAN_*.txt",)
INBOX_NAME = "activity_inbox"

ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]+$")
CHECK_ID_PATTERN = re.compile(r"^[a-z][a-z0-9-]*(?::[a-z][a-z0-9-]*)?$")
_ID_LINE = re.compile(
    r'''^(?P<indent> *)-\s+id:\s*(?:(?P<plain>[A-Za-z0-9_-]+)|'''
    r'''(?P<single>'[A-Za-z0-9_-]+')|(?P<double>"[A-Za-z0-9_-]+"))'''
    r'''\s*(?:#.*)?$''',
)
_PATH_LINE = re.compile(
    r"^(?P<indent> *)path:\s*'(?P<path>[^']+)'\s*(?:#.*)?$",
)
_ANY_PATH_LINE = re.compile(r"^\s*path\s*:")
_PLAN_GLOBS_LINE = re.compile(r"^(?P<indent>\s*)plan_globs:\s*(?:#.*)?$")
_EMPTY_PLAN_GLOBS_LINE = re.compile(
    r"^(?P<indent>\s*)plan_globs:\s*\[\s*\]\s*(?:#.*)?$",
)
_ANY_PLAN_GLOBS_LINE = re.compile(r"^\s*plan_globs\s*:")
_PLAN_GLOB_ITEM = re.compile(
    r'''^\s*-\s+(?:"([^"]+)"|'([^']+)'|([^#]+?))\s*(?:#.*)?$''',
)
_DIRECT_FIELD = re.compile(
    r"^(?P<indent> *)(?P<key>[A-Za-z_][A-Za-z0-9_-]*):",
)
_REPO_FIELDS = {"name", "path", "plan_globs", "demo", "static_status"}
_TOP_LEVEL_REPOS_KEY = re.compile(
    r'''^(?:repos|'repos'|"repos"|!!str\s+repos)\s*:''',
)
_TOP_LEVEL_SERVER_KEY = re.compile(
    r'''^(?:server|'server'|"server"|!!str\s+server)\s*:''',
)
_EXPLICIT_TOP_LEVEL_REPOS_KEY = re.compile(
    r'''^\?\s+(?:repos|'repos'|"repos"|!!str\s+repos)\s*(?:#.*)?$''',
)


class CaptureInputError(Exception):
    """Safe local control-flow error; callers never expose the raw payload."""


@dataclass(frozen=True)
class RegisteredRepo:
    id: str
    root: Path
    plan_globs: tuple[str, ...] = DEFAULT_PLAN_GLOBS


@dataclass(frozen=True)
class HookCheck:
    id: str
    repo_ids: tuple[str, ...]
    cwd: str
    commands: tuple[str, ...]
    accepted_exit_codes: tuple[int, ...]
    evidence_sources: tuple[str, ...]
    revision: str


def now_z () -> str:
    return datetime.now(timezone.utc).isoformat(
        timespec="microseconds",
    ).replace("+00:00", "Z")


def read_bounded_json (stream: BinaryIO) -> dict:
    raw = stream.read(MAX_STDIN_BYTES + 1)
    if len(raw) > MAX_STDIN_BYTES:
        raise CaptureInputError("hook input exceeds the safe size limit")
    try:
        value = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise CaptureInputError("hook input is not valid UTF-8 JSON") from exc
    if not isinstance(value, dict):
        raise CaptureInputError("hook input must be one JSON object")
    return value


def _path_key (path: Path) -> str:
    return os.path.normcase(str(path.resolve(strict=False))).rstrip("\\/")


def _valid_plan_glob (value: str) -> bool:
    if (not value or len(value) > 1_024 or "\\" in value or ":" in value
            or any(ord(char) < 32 or ord(char) == 127 for char in value)):
        return False
    parts = value.split("/")
    return all(part not in {"", ".", ".."} for part in parts)


def load_registered_repos (config_path: Path | None = None) -> list[RegisteredRepo]:
    """Parse the supported repos.yaml projection; every failure is fail-closed."""
    path = config_path or Path(os.environ.get(CONFIG_ENV) or DEFAULT_CONFIG_PATH)
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except (OSError, UnicodeError):
        return []
    repo_headers = [
        line for line in lines
        if _TOP_LEVEL_REPOS_KEY.match(line)
        or _EXPLICIT_TOP_LEVEL_REPOS_KEY.match(line)
    ]
    server_headers = [
        line for line in lines if _TOP_LEVEL_SERVER_KEY.match(line)
    ]
    top_level = [
        line for line in lines
        if line and not line.startswith((" ", "\t"))
        and not line.startswith("#")
    ]
    if (any("\t" in line for line in lines)
            or repo_headers != ["repos:"]
            or len(server_headers) > 1
            or any(
                line not in repo_headers and line not in server_headers
                for line in top_level
            )):
        return []

    in_repos = False
    repo_item_indent: int | None = None
    current_id: str | None = None
    current_path: str | None = None
    current_plan_globs: list[str] | None = None
    plan_globs_indent: int | None = None
    field_indent: int | None = None
    seen_fields: set[str] = set()
    invalid = False
    pairs: list[tuple[str, str, tuple[str, ...]]] = []

    def finish () -> None:
        nonlocal current_id, current_path, current_plan_globs
        nonlocal plan_globs_indent, field_indent, seen_fields, invalid
        if current_id is None:
            return
        if not current_path:
            invalid = True
        else:
            pairs.append((
                current_id, current_path,
                tuple(current_plan_globs or DEFAULT_PLAN_GLOBS),
            ))
        current_id = None
        current_path = None
        current_plan_globs = None
        plan_globs_indent = None
        field_indent = None
        seen_fields = set()

    for line in lines:
        stripped = line.strip()
        if not in_repos:
            if line == "repos:":
                in_repos = True
            continue
        if not stripped or stripped.startswith("#"):
            continue
        indent = len(line) - len(line.lstrip(" "))
        if indent == 0:
            break
        match_id = _ID_LINE.match(line)
        if match_id:
            indent = len(match_id.group("indent"))
            if repo_item_indent is None:
                repo_item_indent = indent
            elif indent != repo_item_indent:
                invalid = True
                continue
            finish()
            id_token = (
                match_id.group("plain")
                or match_id.group("single")
                or match_id.group("double")
            )
            current_id = id_token.strip("'\"")
            continue
        if current_id is None or repo_item_indent is None or indent <= repo_item_indent:
            invalid = True
            continue
        if plan_globs_indent is not None:
            if indent > plan_globs_indent:
                match_glob = _PLAN_GLOB_ITEM.match(line)
                if not match_glob:
                    invalid = True
                else:
                    value = next(
                        item for item in match_glob.groups() if item is not None
                    ).strip()
                    if not _valid_plan_glob(value):
                        invalid = True
                    else:
                        current_plan_globs.append(value)
                continue
            plan_globs_indent = None
        if field_indent is None:
            field_indent = indent
        if indent < field_indent:
            invalid = True
            continue
        direct_field = indent == field_indent
        if direct_field:
            match_field = _DIRECT_FIELD.match(line)
            key = match_field.group("key") if match_field else None
            if key not in _REPO_FIELDS or key in seen_fields:
                invalid = True
                continue
            seen_fields.add(key)
        empty_globs = _EMPTY_PLAN_GLOBS_LINE.match(line)
        if empty_globs:
            if not direct_field or current_plan_globs is not None:
                invalid = True
            else:
                current_plan_globs = []
            continue
        match_globs = _PLAN_GLOBS_LINE.match(line)
        if match_globs:
            if not direct_field or current_plan_globs is not None:
                invalid = True
            else:
                current_plan_globs = []
                plan_globs_indent = len(match_globs.group("indent"))
            continue
        if _ANY_PLAN_GLOBS_LINE.match(line):
            invalid = True
            continue
        if _ANY_PATH_LINE.match(line):
            match_path = _PATH_LINE.match(line)
            if (not direct_field or not match_path
                    or current_path is not None):
                invalid = True
            else:
                current_path = match_path.group("path")
    finish()
    if invalid or not pairs:
        return []

    repos: list[RegisteredRepo] = []
    seen_ids: set[str] = set()
    seen_paths: set[str] = set()
    try:
        for repo_id, raw_path, plan_globs in pairs:
            source_root = Path(raw_path)
            if (not ID_PATTERN.fullmatch(repo_id) or "\x00" in raw_path
                    or not source_root.is_absolute()
                    or len(plan_globs) > 32 or len(set(plan_globs)) != len(plan_globs)):
                return []
            root = source_root.resolve(strict=False)
            key = _path_key(root)
            if repo_id in seen_ids or key in seen_paths:
                return []
            seen_ids.add(repo_id)
            seen_paths.add(key)
            repos.append(RegisteredRepo(repo_id, root, plan_globs))
    except OSError:
        return []
    return repos


def resolve_input_path (raw: object, cwd: object) -> Path | None:
    if not isinstance(raw, str) or not raw or "\x00" in raw:
        return None
    candidate = Path(raw)
    if not candidate.is_absolute():
        if any(part == ".." for part in candidate.parts):
            return None
        if not isinstance(cwd, str) or not cwd or "\x00" in cwd:
            return None
        candidate = Path(cwd) / candidate
    try:
        return candidate.resolve(strict=False)
    except OSError:
        return None


def repo_for_path (path: Path, repos: list[RegisteredRepo]) -> RegisteredRepo | None:
    candidates: list[RegisteredRepo] = []
    for repo in repos:
        try:
            path.relative_to(repo.root)
        except ValueError:
            continue
        if (repo.root / ".git").exists():
            candidates.append(repo)
    return max(candidates, key=lambda item: len(item.root.parts), default=None)


def repo_for_cwd (cwd: object, repos: list[RegisteredRepo]) -> RegisteredRepo | None:
    path = resolve_input_path(cwd, cwd)
    return repo_for_path(path, repos) if path is not None else None


def read_branch (repo_root: Path) -> str | None:
    """Read a normal branch from .git/HEAD without invoking Git."""
    try:
        git_entry = repo_root / ".git"
        if git_entry.is_dir():
            head = git_entry / "HEAD"
        elif git_entry.is_file():
            first = git_entry.read_text(
                encoding="utf-8", errors="replace",
            ).splitlines()[0]
            if not first.startswith("gitdir:"):
                return None
            git_dir = Path(first[len("gitdir:"):].strip())
            if not git_dir.is_absolute():
                git_dir = (repo_root / git_dir).resolve(strict=False)
            head = git_dir / "HEAD"
        else:
            return None
        line = head.read_text(encoding="utf-8", errors="replace").splitlines()[0].strip()
        prefix = "ref: refs/heads/"
        if not line.startswith(prefix):
            return None
        return line[len(prefix):].strip() or None
    except (OSError, IndexError):
        return None


def normalized_changed_paths (
        raw_paths: list[tuple[object, str]], cwd: object,
        repos: list[RegisteredRepo]) -> list[tuple[RegisteredRepo, Path, str]]:
    found: dict[tuple[str, str], tuple[RegisteredRepo, Path, str]] = {}
    for raw, operation in raw_paths:
        path = resolve_input_path(raw, cwd)
        if path is None:
            continue
        repo = repo_for_path(path, repos)
        if repo is None:
            continue
        try:
            relative = path.relative_to(repo.root)
        except ValueError:
            continue
        relative_posix = Path(*relative.parts).as_posix()
        key = (repo.id, os.path.normcase(relative_posix))
        found.setdefault(key, (repo, relative, operation))
    return list(found.values())


def safe_text (value: object, maximum: int) -> str | None:
    if not isinstance(value, str):
        return None
    value = value.strip()
    if not value or any(ord(char) < 32 or ord(char) == 127 for char in value):
        return None
    return value[:maximum]


def canonical_json_bytes (record: dict) -> bytes:
    return json.dumps(
        record, ensure_ascii=False, sort_keys=True, separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")


def _normalized_command (value: object) -> str | None:
    if not isinstance(value, str):
        return None
    value = value.replace("\r\n", "\n").replace("\r", "\n").strip()
    if not value or len(value) > 2_048:
        return None
    if any(token in value for token in ("\n", "|", ">", "<", "`", "$(", "&", ";", "\x00")):
        return None
    return value


def _relative_cwd (value: object) -> str | None:
    if value == ".":
        return "."
    if not isinstance(value, str) or not value or len(value) > 1_024 or "\\" in value:
        return None
    path = Path(value)
    if (path.is_absolute() or ":" in value
            or any(part in {"", ".", ".."} for part in path.parts)
            or path.as_posix() != value):
        return None
    return path.as_posix()


def load_hook_checks (repos: list[RegisteredRepo],
                      checks_path: Path | None = None) -> list[HookCheck]:
    """Read a strict stdlib projection; any registry error disables checks only."""
    if checks_path is None:
        configured = os.environ.get(CONFIG_ENV)
        checks_path = Path(configured).parent / "checks.json" if configured else DEFAULT_CHECKS_PATH
    try:
        raw = json.loads(checks_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError):
        return []
    if not isinstance(raw, dict) or set(raw) != {"schema_version", "checks"}:
        return []
    entries = raw.get("checks")
    if (not isinstance(raw.get("schema_version"), int)
            or isinstance(raw.get("schema_version"), bool)
            or raw.get("schema_version") != 1
            or not isinstance(entries, list) or len(entries) > 256):
        return []
    known_repos = {repo.id for repo in repos}
    checks: list[HookCheck] = []
    seen: set[str] = set()
    seen_hook_routes: set[tuple[str, str, str]] = set()
    allowed_keys = {
        "id", "label", "repo_ids", "cwd", "commands",
        "accepted_exit_codes", "evidence_sources",
    }
    for entry in entries:
        if not isinstance(entry, dict) or set(entry) - allowed_keys:
            return []
        check_id = entry.get("id")
        label = entry.get("label")
        repo_ids = entry.get("repo_ids")
        cwd = _relative_cwd(entry.get("cwd"))
        commands_raw = entry.get("commands")
        exits = entry.get("accepted_exit_codes", [0])
        sources = entry.get("evidence_sources")
        if (
            not isinstance(check_id, str) or len(check_id) > 128
            or not CHECK_ID_PATTERN.fullmatch(check_id)
            or check_id.startswith("review:") or check_id in seen
            or not isinstance(label, str) or not label.strip() or len(label.strip()) > 128
            or label != label.strip()
            or any(ord(char) < 32 or ord(char) == 127 for char in label)
            or not isinstance(repo_ids, list) or not 1 <= len(repo_ids) <= MAX_REPO_IDS
            or any(not isinstance(item, str) or item not in known_repos for item in repo_ids)
            or len(set(repo_ids)) != len(repo_ids) or cwd is None
            or not isinstance(commands_raw, list) or not 1 <= len(commands_raw) <= 16
            or not isinstance(exits, list) or not 1 <= len(exits) <= 32
            or any(not isinstance(code, int) or isinstance(code, bool) or not 0 <= code <= 255
                   for code in exits) or len(set(exits)) != len(exits)
            or not isinstance(sources, list) or not 1 <= len(sources) <= 2
            or any(not isinstance(source, str) or source not in {"hook", "manual"}
                   for source in sources)
            or len(set(sources)) != len(sources)
        ):
            return []
        commands = [_normalized_command(command) for command in commands_raw]
        if any(command is None for command in commands) or len(set(commands)) != len(commands):
            return []
        effective = {
            "accepted_exit_codes": sorted(exits),
            "commands": commands,
            "cwd": cwd,
            "evidence_sources": sorted(sources),
            "id": check_id,
            "repo_ids": sorted(repo_ids),
        }
        revision = hashlib.sha256(canonical_json_bytes(effective)).hexdigest()
        hook_routes = (
            {(repo_id, cwd, command) for repo_id in repo_ids for command in commands}
            if "hook" in sources else set()
        )
        if seen_hook_routes & hook_routes:
            return []
        checks.append(HookCheck(
            check_id, tuple(sorted(repo_ids)), cwd, tuple(commands),
            tuple(sorted(exits)), tuple(sorted(sources)), revision,
        ))
        seen.add(check_id)
        seen_hook_routes.update(hook_routes)
    return checks


def match_hook_check (payload: dict, repos: list[RegisteredRepo],
                      checks: list[HookCheck]) -> tuple[HookCheck, RegisteredRepo] | None:
    if payload.get("tool_name") != "Bash":
        return None
    command = _normalized_command(
        payload.get("tool_input", {}).get("command")
        if isinstance(payload.get("tool_input"), dict) else None
    )
    cwd = resolve_input_path(payload.get("cwd"), payload.get("cwd"))
    if command is None or cwd is None:
        return None
    repo = repo_for_path(cwd, repos)
    if repo is None:
        return None
    for check in checks:
        expected = repo.root if check.cwd == "." else repo.root / Path(check.cwd)
        try:
            exact_cwd = cwd == expected.resolve(strict=False)
        except OSError:
            exact_cwd = False
        if (repo.id in check.repo_ids and exact_cwd and command in check.commands
                and "hook" in check.evidence_sources):
            return check, repo
    return None


def activity_root (repos: list[RegisteredRepo] | None = None) -> Path:
    override = os.environ.get(ACTIVITY_DIR_ENV)
    if override:
        root = Path(override)
        if not root.is_absolute():
            raise CaptureInputError("activity runtime override must be absolute")
        root = root.resolve(strict=False)
    else:
        root = DEFAULT_ACTIVITY_ROOT.resolve(strict=False)
    for repo in repos or []:
        for candidate, parent in ((root, repo.root), (repo.root, root)):
            try:
                candidate.relative_to(parent)
            except ValueError:
                continue
            raise CaptureInputError(
                "activity runtime must not overlap monitored repositories"
            )
    return root


def publish_activity (record: dict, durable: bool = True,
                      repos: list[RegisteredRepo] | None = None) -> Path:
    """Atomically publish one validated writer-built activity object."""
    payload = dict(record)
    payload["schema_version"] = SCHEMA_VERSION
    payload["uid"] = str(uuid.uuid4())
    repo_ids = payload.get("repo_ids")
    if not isinstance(repo_ids, list) or len(repo_ids) > MAX_REPO_IDS:
        raise CaptureInputError("invalid repository link set")
    if any(not isinstance(value, str) or not ID_PATTERN.fullmatch(value) for value in repo_ids):
        raise CaptureInputError("invalid repository link set")
    payload["repo_ids"] = sorted(set(repo_ids))
    encoded = canonical_json_bytes(payload)
    if len(encoded) > MAX_ACTIVITY_BYTES:
        raise CaptureInputError("activity record exceeds the safe size limit")

    inbox = activity_root(repos) / INBOX_NAME
    inbox.mkdir(parents=True, exist_ok=True)
    final = inbox / f"{payload['uid']}.json"
    fd, temporary_name = tempfile.mkstemp(prefix=".katlab-", suffix=".tmp", dir=inbox)
    temporary = Path(temporary_name)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(encoded)
            handle.flush()
            if durable:
                try:
                    os.fsync(handle.fileno())
                except OSError:
                    pass
        os.replace(temporary, final)
    except Exception:
        try:
            temporary.unlink(missing_ok=True)
        except OSError:
            pass
        raise
    return final


def append_file_event (repo: RegisteredRepo, event: dict) -> None:
    """Durably append one complete v1 event line to the owning repository."""
    tracking = repo.root / ".katlab_tracking"
    tracking.mkdir(parents=True, exist_ok=True)
    encoded = (json.dumps(event, ensure_ascii=False) + "\n").encode("utf-8")
    flags = os.O_APPEND | os.O_CREAT | os.O_WRONLY
    fd = os.open(tracking / "events.jsonl", flags, 0o600)
    try:
        view = memoryview(encoded)
        while view:
            written = os.write(fd, view)
            if written <= 0:
                raise OSError("event append made no progress")
            view = view[written:]
        try:
            os.fsync(fd)
        except OSError:
            pass
    finally:
        os.close(fd)


def bounded_sample_sha256 (raw: bytes) -> str:
    return hashlib.sha256(raw[:MAX_ACTIVITY_BYTES + 1]).hexdigest()
