"""Config loading + two-tier validation (PLAN v0.1.0.0 C.1).

Error policy (F44):
- ENVIRONMENTAL issues (missing repo path - drive drift between the Dev and
  Exec PCs) -> repo flagged offline, server keeps running (F14)
- AUTHORING errors (bad id slug, duplicate id, duplicate normalized path,
  unparseable YAML) -> ConfigAuthoringError -> FAIL FAST at startup (F43)
"""

import hashlib
import json
import os
import re
from dataclasses import dataclass, field
from pathlib import Path, PurePosixPath

import yaml
from yaml.constructor import ConstructorError
from yaml.nodes import MappingNode

ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]+$")
CHECK_ID_PATTERN = re.compile(r"^[a-z][a-z0-9-]*(?::[a-z][a-z0-9-]*)?$")
DEFAULT_PLAN_GLOBS = ["temp/Plan/PLAN_*.txt"]
REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ACTIVITY_ROOT = REPO_ROOT / "data"
ACTIVITY_DIR_ENV = "KATLAB_TRACKER_ACTIVITY_DIR"
DEMO_MODE_ENV = "KATLAB_TRACKER_DEMO"


class ConfigAuthoringError(Exception):
    """Fail-fast tier: the config file itself is wrong and must be fixed."""


class _UniqueKeyLoader(yaml.SafeLoader):
    """Safe YAML loader that rejects shadowed configuration at every depth."""


def _construct_unique_mapping (
        loader: _UniqueKeyLoader, node: MappingNode,
        deep: bool = False) -> dict:
    loader.flatten_mapping(node)
    mapping = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node, deep=deep)
        try:
            duplicate = key in mapping
        except TypeError as exc:
            raise ConstructorError(
                "while constructing a configuration mapping", node.start_mark,
                "found an unhashable mapping key", key_node.start_mark,
            ) from exc
        if duplicate:
            raise ConstructorError(
                "while constructing a configuration mapping", node.start_mark,
                "found a duplicate mapping key", key_node.start_mark,
            )
        mapping[key] = loader.construct_object(value_node, deep=deep)
    return mapping


_UniqueKeyLoader.add_constructor(
    yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG,
    _construct_unique_mapping,
)


@dataclass
class RepoConfig:
    id: str
    name: str
    path: Path
    plan_globs: list[str] = field(default_factory=lambda: list(DEFAULT_PLAN_GLOBS))
    offline: bool = False
    demo_status: dict | None = None

    @property
    def tracking_dir (self) -> Path:
        return self.path / ".katlab_tracking"

    @property
    def events_file (self) -> Path:
        return self.tracking_dir / "events.jsonl"


@dataclass
class ServerConfig:
    host: str = "127.0.0.1"
    port: int = 8100
    status_poll_seconds: int = 30


@dataclass(frozen=True)
class CheckDefinition:
    id: str
    label: str
    repo_ids: tuple[str, ...]
    cwd: str
    commands: tuple[str, ...]
    accepted_exit_codes: tuple[int, ...]
    evidence_sources: tuple[str, ...]
    revision: str


@dataclass
class AppConfig:
    server: ServerConfig
    repos: list[RepoConfig]
    activity_root: Path = field(default_factory=lambda: _activity_root())
    checks: tuple[CheckDefinition, ...] = ()

    @property
    def checks_by_id (self) -> dict[str, CheckDefinition]:
        return {check.id: check for check in self.checks}


def _activity_root () -> Path:
    override = os.environ.get(ACTIVITY_DIR_ENV)
    if override:
        path = Path(override)
        if not path.is_absolute():
            raise ConfigAuthoringError(
                f"{ACTIVITY_DIR_ENV} must be an absolute isolated runtime path"
            )
        return path.resolve(strict=False)
    return DEFAULT_ACTIVITY_ROOT.resolve(strict=False)


def _validate_activity_root (root: Path, repos: list[RepoConfig]) -> None:
    for repo in repos:
        repo_root = repo.path.resolve(strict=False)
        for candidate, parent in ((root, repo_root), (repo_root, root)):
            try:
                candidate.relative_to(parent)
            except ValueError:
                continue
            raise ConfigAuthoringError(
                "Activity runtime root must not overlap a monitored repository"
            )


def _normalized_plan_globs (value: object) -> list[str]:
    if value is None or value == []:
        return list(DEFAULT_PLAN_GLOBS)
    if not isinstance(value, list) or not 1 <= len(value) <= 32:
        raise ConfigAuthoringError("plan_globs must be a list of 1..32 patterns")
    normalized: list[str] = []
    for pattern in value:
        if (not isinstance(pattern, str) or not pattern
                or pattern != pattern.strip() or len(pattern) > 1_024
                or "\\" in pattern or ":" in pattern
                or any(ord(char) < 32 or ord(char) == 127 for char in pattern)):
            raise ConfigAuthoringError("plan_globs contains an invalid pattern")
        relative = PurePosixPath(pattern)
        if (relative.is_absolute()
                or any(part in {"", ".", ".."} for part in relative.parts)
                or relative.as_posix() != pattern):
            raise ConfigAuthoringError("plan_globs patterns must stay repo-relative")
        normalized.append(pattern)
    if len(set(normalized)) != len(normalized):
        raise ConfigAuthoringError("plan_globs patterns must be unique")
    return normalized


def _load_server_config (value: object) -> ServerConfig:
    if value is None:
        value = {}
    if not isinstance(value, dict):
        raise ConfigAuthoringError("server must be a YAML mapping")
    allowed = {"host", "port", "status_poll_seconds"}
    if set(value) - allowed:
        raise ConfigAuthoringError("server contains unknown settings")
    host = value.get("host", "127.0.0.1")
    port = value.get("port", 8100)
    poll = value.get("status_poll_seconds", 30)
    if (not isinstance(host, str) or not host or host != host.strip()
            or len(host) > 255
            or any(ord(char) < 32 or ord(char) == 127 for char in host)):
        raise ConfigAuthoringError("server host is invalid")
    if (not isinstance(port, int) or isinstance(port, bool)
            or not 1 <= port <= 65_535):
        raise ConfigAuthoringError("server port must be an integer from 1 to 65535")
    if (not isinstance(poll, int) or isinstance(poll, bool)
            or not 5 <= poll <= 86_400):
        raise ConfigAuthoringError(
            "server status_poll_seconds must be an integer from 5 to 86400"
        )
    return ServerConfig(host=host, port=port, status_poll_seconds=poll)


def _load_demo_status (entry: dict, path: Path) -> dict | None:
    raw = entry.get("static_status")
    if raw is None:
        return None
    if os.environ.get(DEMO_MODE_ENV) != "1":
        raise ConfigAuthoringError(
            "static_status is permitted only when KATLAB_TRACKER_DEMO=1"
        )
    if entry.get("demo") is not True:
        raise ConfigAuthoringError("static_status requires the explicit demo: true marker")
    if path.is_absolute() or any(part in {"", ".", ".."} for part in path.parts):
        raise ConfigAuthoringError("demo repository paths must be workspace-relative")
    resolved = (REPO_ROOT / path).resolve(strict=False)
    demo_root = (REPO_ROOT / "Demo" / "runtime").resolve(strict=False)
    try:
        resolved.relative_to(demo_root)
    except ValueError as exc:
        raise ConfigAuthoringError(
            "static_status repository must stay under Demo/runtime"
        ) from exc
    if not (resolved / ".git").is_dir():
        raise ConfigAuthoringError("static_status requires the generated .git marker directory")
    if not isinstance(raw, dict) or set(raw) != {
            "clean", "count", "branch", "dirty_paths"}:
        raise ConfigAuthoringError("static_status shape is invalid")
    clean, count = raw.get("clean"), raw.get("count")
    branch, dirty_paths = raw.get("branch"), raw.get("dirty_paths")
    if (not isinstance(clean, bool)
            or not isinstance(count, int) or isinstance(count, bool)
            or not 0 <= count <= 10_000
            or (branch is not None and (
                not isinstance(branch, str) or not branch or len(branch) > 256
                or any(ord(char) < 32 or ord(char) == 127 for char in branch)
            ))
            or not isinstance(dirty_paths, list) or len(dirty_paths) > 10_000):
        raise ConfigAuthoringError("static_status values are invalid")
    normalized_paths: list[str] = []
    for value in dirty_paths:
        if (not isinstance(value, str) or not value or len(value) > 1_024
                or "\\" in value or ":" in value):
            raise ConfigAuthoringError("static_status dirty path is invalid")
        relative = PurePosixPath(value)
        if (relative.is_absolute() or any(
                part in {"", ".", ".."} for part in relative.parts)
                or relative.as_posix() != value):
            raise ConfigAuthoringError("static_status dirty path is invalid")
        normalized_paths.append(value)
    if (normalized_paths != sorted(set(normalized_paths))
            or count != len(normalized_paths) or clean != (count == 0)):
        raise ConfigAuthoringError("static_status count/clean/dirty_paths disagree")
    return {
        "clean": clean,
        "count": count,
        "branch": branch,
        "dirty_paths": normalized_paths,
    }


def _normalized_check_command (value: object) -> str | None:
    if not isinstance(value, str):
        return None
    value = value.replace("\r\n", "\n").replace("\r", "\n").strip()
    if not value or len(value) > 2_048:
        return None
    if any(token in value for token in (
            "\n", "|", ">", "<", "`", "$(", "&", ";", "\x00")):
        return None
    return value


def _normalized_check_cwd (value: object) -> str | None:
    if value == ".":
        return "."
    if (not isinstance(value, str) or not value or len(value) > 1_024
            or "\\" in value or ":" in value):
        return None
    path = PurePosixPath(value)
    if path.is_absolute() or any(part in {"", ".", ".."} for part in path.parts):
        return None
    normalized = path.as_posix()
    return normalized if normalized == value else None


def _check_revision (check_id: str, repo_ids: tuple[str, ...], cwd: str,
                     commands: tuple[str, ...], exits: tuple[int, ...],
                     sources: tuple[str, ...]) -> str:
    effective = {
        "accepted_exit_codes": list(exits),
        "commands": list(commands),
        "cwd": cwd,
        "evidence_sources": list(sources),
        "id": check_id,
        "repo_ids": list(repo_ids),
    }
    encoded = json.dumps(
        effective, ensure_ascii=False, sort_keys=True, separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def load_check_registry (path: Path, known_repo_ids: set[str]) -> tuple[CheckDefinition, ...]:
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise ConfigAuthoringError("Check registry file is missing") from exc
    except OSError as exc:
        raise ConfigAuthoringError("Check registry file cannot be read") from exc
    except (UnicodeError, json.JSONDecodeError) as exc:
        raise ConfigAuthoringError("Check registry is not valid UTF-8 JSON") from exc
    if not isinstance(raw, dict) or set(raw) != {"schema_version", "checks"}:
        raise ConfigAuthoringError("Check registry root shape is invalid")
    entries = raw.get("checks")
    if (not isinstance(raw.get("schema_version"), int)
            or isinstance(raw.get("schema_version"), bool)
            or raw.get("schema_version") != 1
            or not isinstance(entries, list) or len(entries) > 256):
        raise ConfigAuthoringError("Check registry version or row count is invalid")

    allowed_keys = {
        "id", "label", "repo_ids", "cwd", "commands",
        "accepted_exit_codes", "evidence_sources",
    }
    checks: list[CheckDefinition] = []
    seen: set[str] = set()
    seen_hook_routes: set[tuple[str, str, str]] = set()
    for index, entry in enumerate(entries, start=1):
        if not isinstance(entry, dict) or set(entry) - allowed_keys:
            raise ConfigAuthoringError(f"Check registry row {index} has invalid keys")
        check_id = entry.get("id")
        label = entry.get("label")
        repo_ids_raw = entry.get("repo_ids")
        cwd = _normalized_check_cwd(entry.get("cwd"))
        commands_raw = entry.get("commands")
        exits_raw = entry.get("accepted_exit_codes", [0])
        sources_raw = entry.get("evidence_sources")
        if (
            not isinstance(check_id, str) or len(check_id) > 128
            or not CHECK_ID_PATTERN.fullmatch(check_id) or check_id.startswith("review:")
            or check_id in seen
            or not isinstance(label, str) or label != label.strip() or not label
            or len(label) > 128 or any(ord(char) < 32 or ord(char) == 127 for char in label)
            or not isinstance(repo_ids_raw, list) or not 1 <= len(repo_ids_raw) <= 16
            or any(not isinstance(item, str) or item not in known_repo_ids
                   for item in repo_ids_raw)
            or len(set(repo_ids_raw)) != len(repo_ids_raw) or cwd is None
            or not isinstance(commands_raw, list) or not 1 <= len(commands_raw) <= 16
            or not isinstance(exits_raw, list) or not 1 <= len(exits_raw) <= 32
            or any(not isinstance(code, int) or isinstance(code, bool) or not 0 <= code <= 255
                   for code in exits_raw) or len(set(exits_raw)) != len(exits_raw)
            or not isinstance(sources_raw, list) or not 1 <= len(sources_raw) <= 2
            or any(not isinstance(source, str) or source not in {"hook", "manual"}
                   for source in sources_raw)
            or len(set(sources_raw)) != len(sources_raw)
        ):
            raise ConfigAuthoringError(f"Check registry row {index} is invalid")
        commands = tuple(_normalized_check_command(item) for item in commands_raw)
        if any(item is None for item in commands) or len(set(commands)) != len(commands):
            raise ConfigAuthoringError(f"Check registry row {index} has unsafe commands")
        repo_ids = tuple(sorted(repo_ids_raw))
        exits = tuple(sorted(exits_raw))
        sources = tuple(sorted(sources_raw))
        hook_routes = (
            {(repo_id, cwd, command) for repo_id in repo_ids for command in commands}
            if "hook" in sources else set()
        )
        if seen_hook_routes & hook_routes:
            raise ConfigAuthoringError(
                f"Check registry row {index} overlaps another hook route"
            )
        checks.append(CheckDefinition(
            check_id, label, repo_ids, cwd, commands, exits, sources,
            _check_revision(check_id, repo_ids, cwd, commands, exits, sources),
        ))
        seen.add(check_id)
        seen_hook_routes.update(hook_routes)
    return tuple(checks)


def load_config (config_path: Path) -> AppConfig:
    try:
        raw = yaml.load(
            config_path.read_text(encoding="utf-8"), Loader=_UniqueKeyLoader,
        )
    except FileNotFoundError as exc:
        raise ConfigAuthoringError(f"Config file not found: {config_path}") from exc
    except OSError as exc:
        raise ConfigAuthoringError(f"Config file cannot be read: {config_path}") from exc
    except (UnicodeError, yaml.YAMLError) as exc:
        raise ConfigAuthoringError(f"Config is not valid YAML: {exc}")

    if raw is not None and not isinstance(raw, dict):
        raise ConfigAuthoringError("Config root must be a YAML mapping")
    if set(raw or {}) - {"server", "repos"}:
        raise ConfigAuthoringError("Config root contains unknown settings")

    server = _load_server_config((raw or {}).get("server"))

    repos: list[RepoConfig] = []
    seen_ids: set[str] = set()
    seen_paths: set[str] = set()

    repo_entries = (raw or {}).get("repos", [])
    if repo_entries is None:
        repo_entries = []
    if not isinstance(repo_entries, list):
        raise ConfigAuthoringError("repos must be a YAML list")

    allowed_repo_keys = {
        "id", "name", "path", "plan_globs", "demo", "static_status",
    }
    for entry in repo_entries:
        if not isinstance(entry, dict):
            raise ConfigAuthoringError("Each repository entry must be a YAML mapping")
        if set(entry) - allowed_repo_keys:
            raise ConfigAuthoringError("Repository entry contains unknown settings")
        raw_repo_id = entry.get("id")
        if (not isinstance(raw_repo_id, str)
                or raw_repo_id != raw_repo_id.strip()):
            raise ConfigAuthoringError(
                "Repository id must be a normalized YAML string"
            )
        repo_id = raw_repo_id
        if not ID_PATTERN.fullmatch(repo_id):
            raise ConfigAuthoringError(
                f"Repo id {repo_id!r} is invalid - must match ^[A-Za-z0-9_-]+$ (ids ride in URLs)"
            )
        if repo_id in seen_ids:
            raise ConfigAuthoringError(f"Duplicate repo id {repo_id!r}")
        seen_ids.add(repo_id)

        raw_path = entry.get("path")
        if (not isinstance(raw_path, str) or not raw_path
                or raw_path != raw_path.strip()
                or any(ord(char) < 32 or ord(char) == 127 for char in raw_path)):
            raise ConfigAuthoringError(f"Repository path for {repo_id!r} is invalid")
        path = Path(raw_path)
        demo_status = _load_demo_status(entry, path)
        if demo_status is None and not path.is_absolute():
            raise ConfigAuthoringError(
                f"Repository path for {repo_id!r} must be absolute"
            )
        try:
            repo_path = ((REPO_ROOT / path).resolve(strict=False)
                         if demo_status is not None else path.resolve(strict=False))
        except OSError as exc:
            raise ConfigAuthoringError(
                f"Repository path for {repo_id!r} cannot be resolved"
            ) from exc
        normalized = str(repo_path).replace("\\", "/").rstrip("/").lower()
        if normalized in seen_paths:
            raise ConfigAuthoringError(
                f"Duplicate repo path for {repo_id!r}: {path} - would double-ingest every event"
            )
        seen_paths.add(normalized)

        repo = RepoConfig(
            id=repo_id,
            name=str(entry.get("name", repo_id)),
            path=repo_path,
            plan_globs=_normalized_plan_globs(entry.get("plan_globs")),
            demo_status=demo_status,
        )
        # Environmental tier (F14): missing path -> offline, never crash.
        if (demo_status is None
                and not (repo.path.exists() and (repo.path / ".git").exists())):
            repo.offline = True
        repos.append(repo)

    activity_root = _activity_root()
    _validate_activity_root(activity_root, repos)
    checks = load_check_registry(config_path.parent / "checks.json", seen_ids)
    return AppConfig(
        server=server, repos=repos, activity_root=activity_root, checks=checks,
    )
