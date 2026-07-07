"""Config loading + two-tier validation (PLAN v0.1.0.0 C.1).

Error policy (F44):
- ENVIRONMENTAL issues (missing repo path - drive drift between the Dev and
  Exec PCs) -> repo flagged offline, server keeps running (F14)
- AUTHORING errors (bad id slug, duplicate id, duplicate normalized path,
  unparseable YAML) -> ConfigAuthoringError -> FAIL FAST at startup (F43)
"""

import re
from dataclasses import dataclass, field
from pathlib import Path

import yaml

ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]+$")
DEFAULT_PLAN_GLOBS = ["temp/Plan/PLAN_*.txt"]


class ConfigAuthoringError(Exception):
    """Fail-fast tier: the config file itself is wrong and must be fixed."""


@dataclass
class RepoConfig:
    id: str
    name: str
    path: Path
    plan_globs: list[str] = field(default_factory=lambda: list(DEFAULT_PLAN_GLOBS))
    offline: bool = False

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


@dataclass
class AppConfig:
    server: ServerConfig
    repos: list[RepoConfig]


def load_config (config_path: Path) -> AppConfig:
    try:
        raw = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise ConfigAuthoringError(f"Config file not found: {config_path}")
    except yaml.YAMLError as exc:
        raise ConfigAuthoringError(f"Config is not valid YAML: {exc}")

    server_raw = (raw or {}).get("server") or {}
    server = ServerConfig(
        host=str(server_raw.get("host", "127.0.0.1")),
        port=int(server_raw.get("port", 8100)),
        status_poll_seconds=int(server_raw.get("status_poll_seconds", 30)),
    )

    repos: list[RepoConfig] = []
    seen_ids: set[str] = set()
    seen_paths: set[str] = set()

    for entry in (raw or {}).get("repos") or []:
        repo_id = str(entry.get("id", "")).strip()
        if not ID_PATTERN.match(repo_id):
            raise ConfigAuthoringError(
                f"Repo id {repo_id!r} is invalid - must match ^[A-Za-z0-9_-]+$ (ids ride in URLs)"
            )
        if repo_id in seen_ids:
            raise ConfigAuthoringError(f"Duplicate repo id {repo_id!r}")
        seen_ids.add(repo_id)

        path = Path(str(entry.get("path", "")))
        normalized = str(path).replace("\\", "/").rstrip("/").lower()
        if normalized in seen_paths:
            raise ConfigAuthoringError(
                f"Duplicate repo path for {repo_id!r}: {path} - would double-ingest every event"
            )
        seen_paths.add(normalized)

        repo = RepoConfig(
            id=repo_id,
            name=str(entry.get("name", repo_id)),
            path=path,
            plan_globs=[str(g) for g in entry.get("plan_globs") or DEFAULT_PLAN_GLOBS],
        )
        # Environmental tier (F14): missing path -> offline, never crash.
        if not (repo.path.exists() and (repo.path / ".git").exists()):
            repo.offline = True
        repos.append(repo)

    return AppConfig(server=server, repos=repos)
