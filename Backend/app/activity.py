"""Strict atomic activity-ledger consumer and sanitized rejection transport."""

from __future__ import annotations

import hashlib
import json
import os
import re
import tempfile
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath

from . import db
from .config import AppConfig


MAX_ACTIVITY_BYTES = 65_536
MAX_REPO_IDS = 16
DEFAULT_BATCH_SIZE = 100
INBOX_NAME = "activity_inbox"
REJECTED_NAME = "activity_rejected"

ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]+$")
CHECK_ID_PATTERN = re.compile(r"^[a-z][a-z0-9-]*(?::[a-z][a-z0-9-]*)?$")
HEX_64_PATTERN = re.compile(r"^[0-9a-f]{64}$")
UTC_PATTERN = re.compile(
    r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$"
)

REQUIRED_FIELDS = {
    "schema_version", "uid", "provider", "evidence_source", "kind", "ts",
    "delivery_class", "repo_ids",
}
OPTIONAL_LIMITS = {
    "session_id": 256,
    "turn_id": 256,
    "agent_id": 256,
    "parent_agent_id": 256,
    "agent_type": 128,
    "model": 128,
    "permission_mode": 64,
    "tool_use_id": 256,
    "tool_name": 128,
    "tool_class": 64,
    "plan_repo_id": 128,
    "plan_file": 1_024,
    "task_ref": 1_024,
    "outcome": 32,
    "check_id": 128,
    "check_revision": 64,
}
ALLOWED_FIELDS = REQUIRED_FIELDS | set(OPTIONAL_LIMITS) | {"duration_ms"}
LIFECYCLE_KINDS = {
    "session_start", "session_end", "turn_stop", "turn_interrupt",
    "agent_start", "agent_stop",
}
KINDS = LIFECYCLE_KINDS | {
    "tool_finished", "check_started", "check_finished", "review_result",
}
GENERIC_OUTCOMES = {"success", "failure", "cancelled", "unknown"}
CHECK_OUTCOMES = {"pass", "fail", "cancelled", "unknown"}
MANUAL_CHECK_OUTCOMES = {"pass", "fail", "cancelled"}
REVIEW_OUTCOMES = {"clean", "finding"}
REJECTION_CODES = {
    "OVERSIZED", "INVALID_JSON", "INVALID_SCHEMA", "INVALID_UID",
    "UID_MISMATCH", "UID_CONFLICT", "UNREGISTERED_REPO", "INVALID_FIELD",
}


class ActivityConfigurationError(Exception):
    """Safe startup error for an activity root that overlaps source repositories."""


class UnstableFinal(Exception):
    """Transient acquisition failure; leave the final for a later bounded sweep."""


class InvalidRecord(Exception):
    def __init__ (self, reason_code: str):
        if reason_code not in REJECTION_CODES:
            raise ValueError("unknown safe rejection code")
        self.reason_code = reason_code
        super().__init__(reason_code)


class InvalidFinal(InvalidRecord):
    def __init__ (self, reason_code: str, byte_count: int, sample: bytes,
                  identity: tuple[int, int, int, int]):
        super().__init__(reason_code)
        self.byte_count = byte_count
        self.sample = sample[:MAX_ACTIVITY_BYTES + 1]
        self.identity = identity


@dataclass(frozen=True)
class ValidatedActivity:
    transport: dict
    repo_ids: tuple[str, ...]
    record_sha256: str


@dataclass(frozen=True)
class Candidate:
    path: Path
    raw: bytes
    byte_count: int
    identity: tuple[int, int, int, int]
    value: ValidatedActivity


@dataclass
class BatchResult:
    inserted: int = 0
    duplicates: int = 0
    rejected: int = 0
    ignored_unscoped: int = 0
    removed: int = 0
    affected_repo_ids: set[str] = field(default_factory=set)

    @property
    def changed (self) -> bool:
        return self.inserted > 0


def _now_z () -> str:
    return datetime.now(timezone.utc).isoformat(
        timespec="microseconds",
    ).replace("+00:00", "Z")


def _canonical_bytes (value: dict) -> bytes:
    return json.dumps(
        value, ensure_ascii=False, sort_keys=True, separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")


def _normalize_utc (value: object) -> str | None:
    if not isinstance(value, str) or len(value) > 32 or not UTC_PATTERN.fullmatch(value):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed.astimezone(timezone.utc).isoformat(
        timespec="microseconds",
    ).replace("+00:00", "Z")


def _valid_utc (value: object) -> bool:
    return _normalize_utc(value) is not None


def _canonical_uuid4 (value: object) -> str | None:
    if not isinstance(value, str) or len(value) != 36:
        return None
    try:
        parsed = uuid.UUID(value)
    except (ValueError, AttributeError):
        return None
    if parsed.version != 4 or str(parsed) != value:
        return None
    return value


def _optional_text (raw: dict, key: str, maximum: int) -> str | None:
    if key not in raw or raw[key] is None:
        return None
    value = raw[key]
    if not isinstance(value, str) or "\x00" in value:
        raise InvalidRecord("INVALID_FIELD")
    value = value.strip()
    if not value:
        return None
    if len(value) > maximum or any(
            ord(char) < 32 or ord(char) == 127 for char in value):
        raise InvalidRecord("INVALID_FIELD")
    return value


def _relative_plan_file (value: str | None) -> str | None:
    if value is None:
        return None
    if "\\" in value or ":" in value:
        raise InvalidRecord("INVALID_FIELD")
    path = PurePosixPath(value)
    if path.is_absolute() or any(part in {"", ".", ".."} for part in path.parts):
        raise InvalidRecord("INVALID_FIELD")
    normalized = path.as_posix()
    if normalized != value:
        raise InvalidRecord("INVALID_FIELD")
    return normalized


def _decode_object (raw: bytes) -> dict:
    def reject_constant (_value: str):
        raise ValueError("non-finite JSON number")

    try:
        value = json.loads(raw.decode("utf-8"), parse_constant=reject_constant)
    except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as exc:
        raise InvalidRecord("INVALID_JSON") from exc
    if not isinstance(value, dict):
        raise InvalidRecord("INVALID_SCHEMA")
    return value


def validate_activity (raw: bytes, filename_stem: str,
                       registered_repo_ids: set[str]) -> ValidatedActivity:
    value = _decode_object(raw)
    if set(value) - ALLOWED_FIELDS or not REQUIRED_FIELDS.issubset(value):
        raise InvalidRecord("INVALID_SCHEMA")
    if (not isinstance(value["schema_version"], int)
            or isinstance(value["schema_version"], bool)
            or value["schema_version"] != 1):
        raise InvalidRecord("INVALID_SCHEMA")

    uid = _canonical_uuid4(value["uid"])
    if uid is None or _canonical_uuid4(filename_stem) is None:
        raise InvalidRecord("INVALID_UID")
    if filename_stem != uid:
        raise InvalidRecord("UID_MISMATCH")

    provider = _optional_text(value, "provider", 16)
    evidence_source = _optional_text(value, "evidence_source", 16)
    kind = _optional_text(value, "kind", 32)
    delivery = _optional_text(value, "delivery_class", 16)
    timestamp = _normalize_utc(value["ts"])
    if provider not in {"claude", "codex", "manual"}:
        raise InvalidRecord("INVALID_FIELD")
    if evidence_source not in {"hook", "manual"} or kind not in KINDS:
        raise InvalidRecord("INVALID_FIELD")
    if delivery not in {"durable", "best_effort"} or timestamp is None:
        raise InvalidRecord("INVALID_FIELD")
    if ((provider == "manual") != (evidence_source == "manual")):
        raise InvalidRecord("INVALID_FIELD")

    raw_repo_ids = value["repo_ids"]
    if not isinstance(raw_repo_ids, list) or len(raw_repo_ids) > MAX_REPO_IDS:
        raise InvalidRecord("INVALID_FIELD")
    if any(not isinstance(item, str) or not ID_PATTERN.fullmatch(item)
           for item in raw_repo_ids):
        raise InvalidRecord("INVALID_FIELD")
    if len(set(raw_repo_ids)) != len(raw_repo_ids):
        raise InvalidRecord("INVALID_FIELD")
    if any(item not in registered_repo_ids for item in raw_repo_ids):
        raise InvalidRecord("UNREGISTERED_REPO")
    repo_ids = tuple(sorted(raw_repo_ids))

    normalized: dict = {
        "schema_version": 1,
        "uid": uid,
        "provider": provider,
        "evidence_source": evidence_source,
        "kind": kind,
        "ts": timestamp,
        "delivery_class": delivery,
        "repo_ids": list(repo_ids),
    }
    for key, maximum in OPTIONAL_LIMITS.items():
        text = _optional_text(value, key, maximum)
        if text is not None:
            normalized[key] = text
    if "plan_file" in normalized:
        normalized["plan_file"] = _relative_plan_file(normalized["plan_file"])

    duration = value.get("duration_ms")
    if duration is not None:
        if (not isinstance(duration, int) or isinstance(duration, bool)
                or not 0 <= duration <= 86_400_000):
            raise InvalidRecord("INVALID_FIELD")
        normalized["duration_ms"] = duration

    session = normalized.get("session_id")
    tool_use = normalized.get("tool_use_id")
    outcome = normalized.get("outcome")
    check_id = normalized.get("check_id")
    check_revision = normalized.get("check_revision")
    plan_repo_id = normalized.get("plan_repo_id")
    plan_file = normalized.get("plan_file")
    task_ref = normalized.get("task_ref")

    if check_id is not None and not CHECK_ID_PATTERN.fullmatch(check_id):
        raise InvalidRecord("INVALID_FIELD")
    if check_revision is not None and not HEX_64_PATTERN.fullmatch(check_revision):
        raise InvalidRecord("INVALID_FIELD")
    if plan_repo_id is not None and plan_repo_id not in registered_repo_ids:
        raise InvalidRecord("UNREGISTERED_REPO")

    if provider == "manual":
        if (delivery != "durable" or kind not in {"check_finished", "review_result"}
                or plan_repo_id is None or plan_file is None
                or repo_ids != (plan_repo_id,) or check_id is None
                or check_revision is not None):
            raise InvalidRecord("INVALID_FIELD")
        if kind == "check_finished" and outcome not in MANUAL_CHECK_OUTCOMES:
            raise InvalidRecord("INVALID_FIELD")
        if kind == "review_result" and outcome not in REVIEW_OUTCOMES:
            raise InvalidRecord("INVALID_FIELD")
    else:
        if plan_repo_id is not None or plan_file is not None or task_ref is not None:
            raise InvalidRecord("INVALID_FIELD")
        if kind == "review_result" or delivery == "durable" and kind not in {
            "check_started", "check_finished",
        }:
            raise InvalidRecord("INVALID_FIELD")
        if kind not in {"check_started", "check_finished"} and delivery != "best_effort":
            raise InvalidRecord("INVALID_FIELD")

    if kind in LIFECYCLE_KINDS:
        if outcome is not None or check_id is not None or check_revision is not None:
            raise InvalidRecord("INVALID_FIELD")
        if not repo_ids and session is None:
            raise InvalidRecord("INVALID_FIELD")
    elif kind == "tool_finished":
        if not repo_ids or outcome not in GENERIC_OUTCOMES or check_id is not None:
            raise InvalidRecord("INVALID_FIELD")
    elif kind == "check_started":
        if (provider == "manual" or not repo_ids or delivery != "durable"
                or session is None or tool_use is None or check_id is None
                or check_revision is None or outcome is not None):
            raise InvalidRecord("INVALID_FIELD")
    elif kind == "check_finished" and provider != "manual":
        if (not repo_ids or delivery != "durable" or session is None
                or tool_use is None or check_id is None or check_revision is None
                or outcome not in CHECK_OUTCOMES):
            raise InvalidRecord("INVALID_FIELD")

    digest = hashlib.sha256(_canonical_bytes(normalized)).hexdigest()
    return ValidatedActivity(normalized, repo_ids, digest)


def _identity (stat_result: os.stat_result) -> tuple[int, int, int, int]:
    return (
        stat_result.st_dev, stat_result.st_ino,
        stat_result.st_size, stat_result.st_mtime_ns,
    )


def acquire_final (path: Path) -> tuple[bytes, int, tuple[int, int, int, int]]:
    try:
        before = path.stat()
        with path.open("rb") as handle:
            raw = handle.read(MAX_ACTIVITY_BYTES + 1)
        after = path.stat()
    except (FileNotFoundError, PermissionError, OSError) as exc:
        raise UnstableFinal() from exc
    if _identity(before) != _identity(after):
        raise UnstableFinal()
    stable_identity = _identity(after)
    if before.st_size > MAX_ACTIVITY_BYTES or len(raw) > MAX_ACTIVITY_BYTES:
        raise InvalidFinal("OVERSIZED", before.st_size, raw, stable_identity)
    if len(raw) != before.st_size:
        raise UnstableFinal()
    return raw, before.st_size, stable_identity


def _receipt_material (reason_code: str, byte_count: int, sample: bytes,
                       basename: str) -> tuple[str, dict]:
    sample_sha256 = hashlib.sha256(sample[:MAX_ACTIVITY_BYTES + 1]).hexdigest()
    basename_sha256 = hashlib.sha256(
        b"KATLAB-ACTIVITY-BASENAME-v1\0" + basename.encode("utf-8", errors="replace")
    ).hexdigest()
    identity = (
        b"KATLAB-ACTIVITY-REJECTION-v1\0" + reason_code.encode("ascii") + b"\0"
        + str(byte_count).encode("ascii") + b"\0" + sample_sha256.encode("ascii")
        + b"\0" + basename_sha256.encode("ascii")
    )
    rejection_id = hashlib.sha256(identity).hexdigest()
    return rejection_id, {
        "byte_count": byte_count,
        "reason_code": reason_code,
        "rejection_id": rejection_id,
        "sample_sha256": sample_sha256,
    }


def _valid_existing_receipt (path: Path, expected: dict) -> bool:
    try:
        raw = path.read_bytes()
        if len(raw) > 4_096:
            return False
        value = json.loads(raw.decode("utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError):
        return False
    if not isinstance(value, dict) or set(value) != set(expected) | {"observed_at"}:
        return False
    return _valid_utc(value.get("observed_at")) and all(
        value.get(key) == item for key, item in expected.items()
    )


def _publish_receipt (rejected_dir: Path, source: Path, reason_code: str,
                      byte_count: int, sample: bytes) -> bool:
    rejection_id, expected = _receipt_material(
        reason_code, byte_count, sample, source.name,
    )
    rejected_dir.mkdir(parents=True, exist_ok=True)
    final = rejected_dir / f"{rejection_id}.json"
    if final.exists():
        return _valid_existing_receipt(final, expected)
    receipt = {**expected, "observed_at": _now_z()}
    encoded = _canonical_bytes(receipt)
    fd, temporary_name = tempfile.mkstemp(
        prefix=".katlab-rejection-", suffix=".tmp", dir=rejected_dir,
    )
    temporary = Path(temporary_name)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(encoded)
            handle.flush()
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
        return False
    return True


class ActivityIngestor:
    """Serialized bounded consumer; callers provide the watcher/poll schedule."""

    def __init__ (self, config: AppConfig):
        self.root = config.activity_root.resolve(strict=False)
        for repo in config.repos:
            repo_root = repo.path.resolve(strict=False)
            for candidate, parent in ((self.root, repo_root), (repo_root, self.root)):
                try:
                    candidate.relative_to(parent)
                except ValueError:
                    continue
                raise ActivityConfigurationError(
                    "activity runtime root overlaps a monitored repository"
                )
        self.inbox = self.root / INBOX_NAME
        self.rejected = self.root / REJECTED_NAME
        self.registered_repo_ids = {repo.id for repo in config.repos}
        self.checks_by_id = config.checks_by_id
        # In-memory only: keep transient/corrupt-receipt finals from starving newer
        # work at the front of every bounded lexical sweep. Names are never logged.
        self._deferred_names: set[str] = set()

    def initialize (self) -> None:
        self.inbox.mkdir(parents=True, exist_ok=True)
        self.rejected.mkdir(parents=True, exist_ok=True)

    def pending_count (self) -> int:
        try:
            return sum(1 for path in self.inbox.iterdir()
                       if path.is_file() and path.suffix == ".json")
        except OSError:
            return 0

    def rejected_count (self) -> int:
        try:
            return sum(1 for path in self.rejected.iterdir()
                       if path.is_file() and path.suffix == ".json")
        except OSError:
            return 0

    @staticmethod
    def _remove (path: Path,
                 expected_identity: tuple[int, int, int, int] | None = None) -> bool:
        try:
            if expected_identity is not None and _identity(path.stat()) != expected_identity:
                return False
            path.unlink()
            return True
        except FileNotFoundError:
            return True
        except OSError:
            return False

    def _reject (self, path: Path, reason_code: str,
                 byte_count: int, sample: bytes,
                 identity: tuple[int, int, int, int]) -> bool:
        if not _publish_receipt(
            self.rejected, path, reason_code, byte_count, sample,
        ):
            return False
        return self._remove(path, identity)

    def _candidate (self, path: Path, result: BatchResult) -> Candidate | None:
        raw = b""
        byte_count = 0
        stable_identity: tuple[int, int, int, int] | None = None
        try:
            raw, byte_count, stable_identity = acquire_final(path)
            value = validate_activity(raw, path.stem, self.registered_repo_ids)
            return Candidate(path, raw, byte_count, stable_identity, value)
        except InvalidFinal as exc:
            if self._reject(
                    path, exc.reason_code, exc.byte_count, exc.sample, exc.identity):
                result.rejected += 1
                result.removed += 1
        except InvalidRecord as exc:
            if stable_identity is not None and self._reject(
                    path, exc.reason_code, byte_count, raw, stable_identity):
                result.rejected += 1
                result.removed += 1
        except UnstableFinal:
            pass
        return None

    def _store (self, candidate: Candidate, result: BatchResult,
                existing: tuple[str, int] | None = None) -> str:
        transport = candidate.value.transport
        if existing is None:
            existing = db.classify_existing_activity(
                transport["uid"], candidate.value.record_sha256,
            )
        if existing is not None:
            status, activity_id = existing
        else:
            try:
                derived = self._derive(transport, candidate.value.repo_ids)
            except InvalidRecord as exc:
                if self._reject(
                        candidate.path, exc.reason_code, candidate.byte_count,
                        candidate.raw, candidate.identity):
                    result.rejected += 1
                    result.removed += 1
                return "rejected"
            status, activity_id = db.insert_activity(
                transport, candidate.value.record_sha256,
                list(candidate.value.repo_ids), derived, _now_z(),
            )
        if status == "conflict":
            if self._reject(
                candidate.path, "UID_CONFLICT",
                candidate.byte_count, candidate.raw, candidate.identity,
            ):
                result.rejected += 1
                result.removed += 1
            return status
        if status == "inserted":
            result.inserted += 1
            result.affected_repo_ids.update(candidate.value.repo_ids)
        else:
            result.duplicates += 1
        if self._remove(candidate.path, candidate.identity):
            result.removed += 1
        return status

    @staticmethod
    def _unbound (mode: str, check_revision: str | None = None,
                  health_counter: str | None = None) -> dict:
        value = {
            "assignment_mode": mode,
            "plan_repo_id": None,
            "plan_file": None,
            "task_ref": None,
            "check_revision": check_revision,
            "requirement_revision": None,
            "plan_revision": None,
        }
        if health_counter is not None:
            value["_health_counter"] = health_counter
        return value

    @staticmethod
    def _bound (mode: str, binding: dict,
                check_revision: str | None) -> dict:
        return {
            "assignment_mode": mode,
            "plan_repo_id": binding["repo_id"],
            "plan_file": binding["plan_file"],
            "task_ref": None,
            "check_revision": check_revision,
            "requirement_revision": binding["requirement_revision"],
            "plan_revision": binding["plan_revision"],
        }

    def _derive (self, transport: dict, repo_ids: tuple[str, ...]) -> dict:
        """Revalidate trust and derive all assignment fields before insert."""
        kind = transport["kind"]
        if kind not in {"check_started", "check_finished", "review_result"}:
            return self._unbound("NONE")

        check_id = transport["check_id"]
        if transport["evidence_source"] == "manual":
            repo_id = transport["plan_repo_id"]
            binding = db.get_plan_requirement_binding(
                repo_id, transport["plan_file"], check_id,
            )
            if binding is None:
                raise InvalidRecord("INVALID_FIELD")
            if check_id.startswith("review:"):
                if kind != "review_result":
                    raise InvalidRecord("INVALID_FIELD")
                check_revision = None
            else:
                definition = self.checks_by_id.get(check_id)
                if (
                    kind != "check_finished" or definition is None
                    or repo_id not in definition.repo_ids
                    or "manual" not in definition.evidence_sources
                ):
                    raise InvalidRecord("INVALID_FIELD")
                check_revision = definition.revision
            return self._bound("EXPLICIT_TARGET", binding, check_revision)

        claimed_revision = transport["check_revision"]
        unassigned = self._unbound("UNASSIGNED", claimed_revision)
        if len(repo_ids) != 1:
            return unassigned
        repo_id = repo_ids[0]
        definition = self.checks_by_id.get(check_id)
        if definition is None or definition.revision != claimed_revision:
            return self._unbound(
                "UNASSIGNED", claimed_revision,
                "registry_revision_mismatch",
            )
        if (
            repo_id not in definition.repo_ids
            or "hook" not in definition.evidence_sources
        ):
            return unassigned

        if kind == "check_finished":
            start = db.first_attempt_start(
                transport["provider"], transport["session_id"],
                transport["tool_use_id"], check_id, claimed_revision,
            )
            if start is None:
                return unassigned
            return {
                "assignment_mode": start["assignment_mode"],
                "plan_repo_id": start["plan_repo_id"],
                "plan_file": start["plan_file"],
                "task_ref": None,
                "check_revision": claimed_revision,
                "requirement_revision": start["requirement_revision"],
                "plan_revision": start["plan_revision"],
            }

        bindings = db.automatic_plan_bindings(repo_id, check_id)
        active = [item for item in bindings if item["in_progress_count"] == 1]
        if len(active) == 1:
            return self._bound("AUTO_ACTIVE", active[0], claimed_revision)
        if active:
            return unassigned
        verifying = [
            item for item in bindings
            if item["all_done"] and not db.requirement_has_current_pass(item)
        ]
        if len(verifying) == 1:
            return self._bound("AUTO_VERIFYING", verifying[0], claimed_revision)
        return unassigned

    def ingest_batch (self, limit: int = DEFAULT_BATCH_SIZE) -> BatchResult:
        result = BatchResult()
        limit = min(max(1, limit), 1_000)
        try:
            all_paths = [
                path for path in self.inbox.iterdir()
                if path.is_file() and path.suffix == ".json"
            ]
        except OSError:
            return result
        live_names = {path.name for path in all_paths}
        self._deferred_names.intersection_update(live_names)
        paths = sorted(
            all_paths,
            key=lambda path: (path.name in self._deferred_names, path.name),
        )[:limit]
        self._deferred_names.difference_update(path.name for path in paths)

        linked: list[Candidate] = []
        zero_link: list[Candidate] = []
        for path in paths:
            candidate = self._candidate(path, result)
            if candidate is not None:
                (linked if candidate.value.repo_ids else zero_link).append(candidate)
            elif path.exists():
                self._deferred_names.add(path.name)

        admitted: dict[tuple[str, str], set[str]] = {}
        for candidate in linked:
            status = self._store(candidate, result)
            session = candidate.value.transport.get("session_id")
            if status in {"inserted", "duplicate"} and session:
                key = (candidate.value.transport["provider"], session)
                admitted.setdefault(key, set()).update(candidate.value.repo_ids)

        for candidate in zero_link:
            transport = candidate.value.transport
            existing = db.classify_existing_activity(
                transport["uid"], candidate.value.record_sha256,
            )
            if existing is not None:
                self._store(candidate, result, existing)
                continue
            key = (transport["provider"], transport.get("session_id"))
            context_repo_ids = admitted.get(key) or db.activity_session_repo_ids(
                key[0], key[1], self.registered_repo_ids,
            )
            if not context_repo_ids:
                if self._remove(candidate.path, candidate.identity):
                    db.increment_activity_counter("ignored_unscoped")
                    result.ignored_unscoped += 1
                    result.removed += 1
                continue
            status = self._store(candidate, result)
            if status == "inserted":
                result.affected_repo_ids.update(context_repo_ids)
        return result

    def health_counts (self) -> dict[str, int]:
        return {
            "pending": self.pending_count(),
            "rejected": self.rejected_count(),
            "ignored_unscoped": db.get_activity_counter("ignored_unscoped"),
            "registry_revision_mismatch": db.get_activity_counter(
                "registry_revision_mismatch",
            ),
        }
