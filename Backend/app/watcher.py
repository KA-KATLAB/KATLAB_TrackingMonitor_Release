"""Watchers + orchestration (PLAN v0.1.0.0 D.2).

Startup sequence is FIXED: load config -> init DB -> globally parse ALL plans ->
catch up every events.jsonl -> central activity -> commit/status/direct-link/sweep ->
backfill normalized keys -> readiness -> watchers/polling. Catch-up before plan parse
would resolve missed-while-down events against an empty task set forever.
"""

import asyncio
import json
import logging
import sqlite3
import time
from collections import deque
from datetime import datetime, timezone
from pathlib import Path

from watchfiles import awatch

from . import db, git_module, readiness
from .activity import ActivityIngestor, BatchResult
from .config import AppConfig, RepoConfig
from .plan_parser import (
    PlanReadError,
    acquire_stable_plan_bytes,
    parse_plan_bytes,
    raw_plan_sha256,
)
from .resolver import resolve

log = logging.getLogger("katlab.tracker")
PLAN_STABILITY_DELAY_SECONDS = 0.05
PLAN_RECONCILE_ATTEMPTS = 2
ACTIVITY_STARTUP_BATCHES = 20


def _now_z () -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class Tracker:
    """Single-process orchestrator; owns per-repo state and background tasks."""

    def __init__ (self, config: AppConfig):
        self.config = config
        self.status: dict[str, dict] = {}          # repo_id -> {clean, count, offline}
        self.dirty_paths: dict[str, list[str]] = {}  # private complete-path snapshots
        self.warnings: dict[str, deque] = {}       # repo_id -> recent warnings (F47)
        self.known_commits: dict[str, set[str]] = {}
        self.reconciled_heads: dict[str, str | None] = {}
        self.activity = ActivityIngestor(config)
        self.missions: dict = {"generated_at": None, "summary": {}, "plans": []}
        self._broadcast = None                     # set by ws.py
        self._tasks: list[asyncio.Task] = []

    # --- wiring ---------------------------------------------------------

    def set_broadcaster (self, fn) -> None:
        self._broadcast = fn

    async def _push (self, msg_type: str, data: dict) -> None:
        if self._broadcast:
            await self._broadcast(msg_type, data)

    def _warn (self, repo_id: str, message: str) -> None:
        self.warnings.setdefault(repo_id, deque(maxlen=50)).append(
            {"ts": _now_z(), "message": message}
        )
        log.warning("[%s] %s", repo_id, message)

    async def _warn_push (self, repo_id: str, message: str) -> None:
        self._warn(repo_id, message)
        await self._push("warning", {"repo": repo_id, "message": message})

    def _online_repos (self) -> list[RepoConfig]:
        return [r for r in self.config.repos if not r.offline]

    # --- startup (F24 order) ---------------------------------------------

    async def startup (self) -> None:
        db.init_db(self.config.repos)
        for repo in self.config.repos:
            # CFT-5: PESSIMISTIC init - if the first status read fails
            # transiently (F41 keeps last-known), clean=True here would let
            # the F32 sweep run against a possibly-dirty repo.
            # v0.1.6.0 D2 (B.2, RV2): branch is ALWAYS present (fixed shape).
            if repo.demo_status is not None:
                self.status[repo.id] = {
                    "clean": repo.demo_status["clean"],
                    "count": repo.demo_status["count"],
                    "offline": False,
                    "branch": repo.demo_status["branch"],
                    "paths_complete": True,
                    "status_valid": True,
                    "observed_at": _now_z(),
                }
                self.dirty_paths[repo.id] = list(repo.demo_status["dirty_paths"])
            else:
                self.status[repo.id] = {
                    "clean": False, "count": 0, "offline": repo.offline,
                    "branch": None, "paths_complete": False,
                    "status_valid": False, "observed_at": _now_z(),
                }
                self.dirty_paths[repo.id] = []
            self.warnings.setdefault(repo.id, deque(maxlen=50))
            self.known_commits[repo.id] = set()
            self.reconciled_heads[repo.id] = None

        # Create transport directories early, but classify nothing until all
        # plan and legacy file-event state is loaded globally.
        self.activity.initialize()

        # All plans become visible before either legacy or central catch-up.
        for repo in self._online_repos():
            repo.tracking_dir.mkdir(parents=True, exist_ok=True)  # F18
            self._parse_all_plans_with_retry(repo)

        for repo in self._online_repos():
            self._catch_up_events(repo)

        # Evidence classification now sees every repository's complete plan/event
        # snapshot, including records produced while this process was stopped.
        for _ in range(ACTIVITY_STARTUP_BATCHES):
            result = self.activity.ingest_batch()
            if self.activity.pending_count() == 0 or result.removed == 0:
                break

        for repo in self._online_repos():
            commit_scan_ok = self._catch_up_commits(repo)
            db.backfill_event_task_keys(repo.id)
            self._refresh_status(repo)
            if (self.status[repo.id]["status_valid"]
                    and self.status[repo.id]["clean"]
                    and db.has_unlinked_events(repo.id)):
                self._sweep(
                    repo, commit_scan_ok=commit_scan_ok,
                )                                                 # F32 startup sweep

        self._recompute_readiness()

        repo_tasks: list[asyncio.Task] = []
        for repo in self._online_repos():
            repo_tasks.append(asyncio.create_task(self._watch_repo(repo)))
            if repo.demo_status is None:
                repo_tasks.append(asyncio.create_task(self._watch_git(repo)))  # CFT-3
        self._tasks = repo_tasks + [
            asyncio.create_task(self._watch_activity()),
            asyncio.create_task(self._poll_loop()),
        ]

    async def shutdown (self) -> None:
        for task in self._tasks:
            task.cancel()

    # --- plans -----------------------------------------------------------

    def _plan_files (self, repo: RepoConfig) -> list[Path]:
        found: list[Path] = []
        for pattern in repo.plan_globs:
            found.extend(repo.path.glob(pattern))  # F57: missing dirs -> just no matches
        return sorted(set(found))

    def _plan_key (self, repo: RepoConfig, path: Path) -> str:
        return path.relative_to(repo.path).as_posix()

    def _parse_one_plan (self, repo: RepoConfig, path: Path) -> bool:
        key = self._plan_key(repo, path)
        try:
            raw = acquire_stable_plan_bytes(
                path, delay_seconds=PLAN_STABILITY_DELAY_SECONDS,
            )
            result = parse_plan_bytes(raw, source=key)
            db.sync_plan_snapshot(
                repo.id, key, raw_plan_sha256(raw), result, _now_z(),
                self.config.checks,
            )
        except PlanReadError:
            self._warn(repo.id, "plan read was unstable; prior snapshot preserved")
            return False
        except sqlite3.Error:
            self._warn(repo.id, "plan database sync failed; prior snapshot preserved")
            return False
        return True

    def _stable_plan_manifest (self, repo: RepoConfig) -> list[Path] | None:
        """Require two identical complete glob manifests before reconciliation."""
        try:
            first = self._plan_files(repo)
            time.sleep(PLAN_STABILITY_DELAY_SECONDS)
            second = self._plan_files(repo)
        except OSError:
            self._warn(repo.id, "plan manifest scan failed; prior snapshots preserved")
            return None
        first_keys = [self._plan_key(repo, path) for path in first]
        second_keys = [self._plan_key(repo, path) for path in second]
        if first_keys != second_keys:
            self._warn(repo.id, "plan manifest was unstable; prior snapshots preserved")
            return None
        return second

    def _parse_all_plans (self, repo: RepoConfig) -> bool:
        manifest = self._stable_plan_manifest(repo)
        if manifest is None:
            return False
        current_keys = {self._plan_key(repo, path) for path in manifest}
        complete = True
        for path in manifest:
            complete = self._parse_one_plan(repo, path) and complete

        # F16/v0.3: a server-down deletion becomes authoritative only after two
        # matching complete manifests and one final per-path absence check.
        try:
            known_keys = {row["plan_file"] for row in db.get_plan_snapshots(repo.id)}
        except sqlite3.Error:
            self._warn(repo.id, "plan reconciliation query failed; prior snapshots preserved")
            return False
        for key in sorted(known_keys - current_keys):
            if (repo.path / Path(key)).exists():
                complete = False
                continue
            try:
                db.delete_plan_state(repo.id, key)
            except sqlite3.Error:
                self._warn(repo.id, "plan deletion sync failed; prior snapshot preserved")
                complete = False
        return complete

    def _parse_all_plans_with_retry (self, repo: RepoConfig) -> bool:
        """Retry one failed reconciliation once after the debounce window."""
        for attempt in range(PLAN_RECONCILE_ATTEMPTS):
            if self._parse_all_plans(repo):
                return True
            if attempt + 1 < PLAN_RECONCILE_ATTEMPTS:
                time.sleep(PLAN_STABILITY_DELAY_SECONDS)
        return False

    def _matches_plan_glob (self, repo: RepoConfig, path: Path) -> bool:
        try:
            rel = path.relative_to(repo.path)
        except ValueError:
            return False
        from .resolver import glob_to_regex
        rel_posix = rel.as_posix()
        return any(glob_to_regex(g).match(rel_posix) for g in repo.plan_globs)

    # --- events ingest ----------------------------------------------------

    def _repo_task_rows (self, repo_id: str) -> list[dict]:
        rows = db.get_tasks(repo_id)
        return [
            {"plan_file": r["plan_file"], "task_id": r["task_id"],
             "status": r["status"], "files": json.loads(r["files_json"])}
            for r in rows
        ]

    def _catch_up_events (self, repo: RepoConfig) -> list[int]:
        events_file = repo.events_file
        offset = db.get_offset(repo.id)
        if not events_file.exists():
            return []
        size = events_file.stat().st_size
        if offset > size:
            offset = 0  # F5: truncation/manual delete -> reset
        if offset == size:
            return []

        with open(events_file, "rb") as handle:
            handle.seek(offset)
            chunk = handle.read()
        # CFT-1: only consume up to the LAST newline - a trailing partial line
        # (hook append in progress) must wait for the next wake-up, otherwise
        # the event is lost and the next read starts mid-line.
        last_newline = chunk.rfind(b"\n")
        if last_newline < 0:
            return []
        chunk = chunk[:last_newline + 1]
        new_offset = offset + len(chunk)

        task_rows = self._repo_task_rows(repo.id)
        parsed: list[dict] = []
        for line in chunk.decode("utf-8", errors="replace").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                raw = json.loads(line)
                # v0.1.5.0 CFT-2 (bare CFT-N above = the v0.1.0.0 loop):
                # F26's never-stall invariant must hold for ANY
                # hand-crafted line - a non-dict line ("x", 5, null) would
                # AttributeError past the narrow except below and restart-
                # loop the watcher on the same offset forever; a non-string
                # ts/file would wedge the F13 transaction (InterfaceError)
                # the same way RV17 documented for session_id.
                if not isinstance(raw, dict):
                    raise ValueError(f"non-object event line ({type(raw).__name__})")
                if raw.get("v") != 1:
                    raise ValueError("unknown event version")
                ts, file = raw.get("ts"), raw.get("file")
                if not isinstance(ts, str) or not ts or not isinstance(file, str) or not file:
                    raise ValueError("missing, empty or non-string ts/file")
                tool = raw.get("tool")
                if not isinstance(tool, str) or not tool:
                    tool = "?"  # v0.1.5.0 CFT-2: same coercion class, never a bad bind
                resolution = resolve(file, task_rows)
                # v0.1.5.0 D1 (RV17/RV30): non-empty str or None - any other
                # bind type would fail the F13 transaction and wedge ingest.
                session_id = raw.get("session_id")
                if not isinstance(session_id, str) or not session_id:
                    session_id = None
                # v0.1.6.0 D2 (A.2): branch joins the same guard class.
                branch = raw.get("branch")
                if not isinstance(branch, str) or not branch:
                    branch = None
                provider = raw.get("provider")
                if provider not in {"claude", "codex"}:
                    provider = None

                def bounded_text (key: str, maximum: int) -> str | None:
                    value = raw.get(key)
                    if (not isinstance(value, str) or not value
                            or len(value) > maximum or "\x00" in value):
                        return None
                    return value

                operation = bounded_text("operation", 16)
                if operation not in {"add", "update", "delete", "move", "write"}:
                    operation = None
                parsed.append({
                    "ts": ts, "tool": tool, "file": file,
                    "task_ref": resolution.task_ref, "mode": resolution.mode,
                    "candidates": resolution.candidates,
                    "session_id": session_id,
                    "branch": branch,
                    "provider": provider,
                    "turn_id": bounded_text("turn_id", 256),
                    "agent_id": bounded_text("agent_id", 256),
                    "tool_use_id": bounded_text("tool_use_id", 256),
                    "operation": operation,
                    "plan_file": resolution.plan_file,
                    "task_id": resolution.task_id,
                })
            except (ValueError, KeyError):
                # F26: skip + warn; offset still advances - never stall. The
                # exception may derive from untrusted JSONL values, so diagnostics
                # intentionally expose no raw value or parser text.
                self._warn(repo.id, "events.jsonl: skipped malformed line")

        return db.insert_events_with_offset(repo.id, parsed, new_offset)  # F13: one tx

    # --- git status + commits ---------------------------------------------

    def _refresh_status (self, repo: RepoConfig) -> bool:
        """Refresh one complete snapshot; failure retains display but invalidates trust."""
        previous = self.status[repo.id]
        previous_paths = self.dirty_paths.get(repo.id, [])
        if repo.demo_status is not None:
            current_paths = list(repo.demo_status["dirty_paths"])
            current = {
                "clean": repo.demo_status["clean"],
                "count": repo.demo_status["count"],
                "offline": False,
                "branch": repo.demo_status["branch"],
                "paths_complete": True,
                "status_valid": True,
                "observed_at": previous.get("observed_at") or _now_z(),
            }
            changed = previous_paths != current_paths or any(
                previous.get(key) != current.get(key)
                for key in ("clean", "count", "offline", "branch",
                            "paths_complete", "status_valid")
            )
            self.dirty_paths[repo.id] = current_paths
            self.status[repo.id] = current
            return changed
        try:
            observed = dict(git_module.repo_status(repo.path))
        except git_module.GitError as exc:
            log.debug("[%s] status kept (transient git failure: %s)", repo.id, exc)
            self.status[repo.id] = {
                **previous,
                "offline": False,
                "paths_complete": False,
                "status_valid": False,
                "observed_at": _now_z(),
            }
            return bool(previous.get("status_valid", False))
        current_paths = list(observed.pop("dirty_paths"))
        self.dirty_paths[repo.id] = current_paths
        current = {**observed, "offline": False}
        changed = previous_paths != current_paths or any(
            previous.get(key) != current.get(key)
            for key in (
                "clean", "count", "branch", "paths_complete",
                "status_valid",
            )
        )
        self.status[repo.id] = current
        return changed

    def _catch_up_commits (self, repo: RepoConfig) -> bool:
        """Hydrate persisted hashes, then directly link newly observed history."""
        self.known_commits[repo.id] = db.get_commit_hashes(repo.id)
        if repo.demo_status is not None:
            return True
        try:
            scan_head = git_module.head_hash(repo.path)
            recent = git_module.new_commits_since(
                repo.path, set(self.known_commits[repo.id]), limit=20,
                head=scan_head,
            )
            if git_module.head_hash(repo.path) != scan_head:
                return False
        except git_module.GitError as exc:
            log.debug("[%s] commit catch-up skipped (git: %s)", repo.id, exc)
            return False
        for commit in recent:
            db.upsert_commit(repo.id, commit)
            self.known_commits[repo.id].add(commit["hash"])
            db.link_events_to_commit(
                repo.id, commit["hash"], commit["ts"], commit["files"],
            )
        self.reconciled_heads[repo.id] = scan_head
        return True

    def _recompute_readiness (self, repo_ids: set[str] | None = None) -> None:
        private_status = {
            repo_id: {**status, "dirty_paths": self.dirty_paths.get(repo_id, [])}
            for repo_id, status in self.status.items()
        }
        configured = {repo.id for repo in self.config.repos}
        selected = None if repo_ids is None else repo_ids & configured
        if selected == set():
            return

        # The startup/all-scope path is the authoritative full rebuild. Once that
        # cache exists, scoped reads and live invalidations replace only affected
        # repository slices and then derive the cheap global counts from the cache.
        if self.missions["generated_at"] is None:
            selected = None
        updated = readiness.evaluate_all(
            self.config, private_status, repo_ids=selected,
        )
        if selected is None:
            self.missions = updated
            return

        plans = [
            plan for plan in self.missions["plans"]
            if plan["repo"] not in selected
        ] + updated["plans"]
        plans.sort(key=lambda plan: (plan["repo"], plan["plan_file"]))
        states = {state: 0 for state in readiness.MISSION_STATES}
        for plan in plans:
            states[plan["state"]] += 1
        self.missions = {
            "generated_at": updated["generated_at"],
            "summary": {"total": len(plans), "states": states},
            "plans": plans,
        }

    def mission_snapshot (self, repo_id: str | None = None) -> dict:
        self._recompute_readiness(None if repo_id is None else {repo_id})
        plans = [
            plan for plan in self.missions["plans"]
            if repo_id is None or plan["repo"] == repo_id
        ]
        states = {state: 0 for state in readiness.MISSION_STATES}
        for plan in plans:
            states[plan["state"]] += 1
        return {
            "scope": {
                "kind": "all" if repo_id is None else "repo",
                "repo": repo_id,
            },
            "generated_at": self.missions["generated_at"],
            "summary": {"total": len(plans), "states": states},
            "plans": plans,
        }

    async def _push_readiness_update (self, repo_ids: set[str]) -> None:
        self._recompute_readiness(repo_ids)
        await self._push("readiness_updated", {"repo_ids": sorted(repo_ids)})

    def _sweep (self, repo: RepoConfig, *, commit_scan_ok: bool) -> int:
        """F9/F32: attach unlinked events to HEAD. F35/F36: upsert HEAD's row first."""
        if repo.demo_status is not None or not commit_scan_ok:
            return 0
        status = self.status.get(repo.id, {})
        if not status.get("status_valid") or not status.get("clean"):
            return 0
        try:
            head = git_module.commit_info(repo.path, "HEAD")
        except git_module.GitError as exc:
            self._warn(repo.id, f"sweep skipped (git: {exc})")
            return 0
        if head["hash"] != self.reconciled_heads.get(repo.id):
            return 0
        db.upsert_commit(repo.id, head)
        self.known_commits[repo.id].add(head["hash"])
        return db.sweep_unlinked_events(repo.id, head["hash"])

    async def _detect_commits (self, repo: RepoConfig) -> bool:
        if repo.demo_status is not None:
            return True
        try:
            scan_head = git_module.head_hash(repo.path)
            fresh = git_module.new_commits_since(
                repo.path, set(self.known_commits[repo.id]),
                head=scan_head,
            )
            if git_module.head_hash(repo.path) != scan_head:
                return False
        except git_module.GitError as exc:
            log.debug("[%s] commit detect kept (transient: %s)", repo.id, exc)  # F42
            return False
        for commit in fresh:
            db.upsert_commit(repo.id, commit)
            self.known_commits[repo.id].add(commit["hash"])
            db.link_events_to_commit(repo.id, commit["hash"], commit["ts"], commit["files"])
            await self._push("commit_detected", {"repo": repo.id, "hash": commit["hash"],
                                                 "message": commit["message"]})
        self.reconciled_heads[repo.id] = scan_head
        if fresh:
            was_clean = self.status[repo.id]["clean"]
            self._refresh_status(repo)
            if (self.status[repo.id]["status_valid"]
                    and self.status[repo.id]["clean"] and not was_clean):
                if self._sweep(repo, commit_scan_ok=True):  # F9: transition sweep
                    await self._push("commit_detected", {"repo": repo.id, "swept": True})
            await self._push("repo_status_changed",
                             {"repo": repo.id, **self.status[repo.id]})
            await self._push_readiness_update({repo.id})
        return True

    # --- live watchers ------------------------------------------------------

    async def _watch_repo (self, repo: RepoConfig) -> None:
        """Events + plans watcher over the repo root (F57-safe: root exists).

        NOTE (CFT-3): watchfiles' DefaultFilter IGNORES `.git` - commit
        detection lives in the dedicated _watch_git task, not here.
        """
        events_file = repo.events_file
        while True:
            try:
                async for changes in awatch(repo.path, recursive=True, step=300):
                    touched = {Path(p) for _, p in changes}
                    if any(self._same(p, events_file) for p in touched):
                        for event_id in self._catch_up_events(repo):
                            row = db.get_event(event_id)
                            await self._push("event_resolved", dict(row))
                        if self._refresh_status(repo):
                            await self._push("repo_status_changed",
                                             {"repo": repo.id, **self.status[repo.id]})
                        await self._push_readiness_update({repo.id})
                    plan_touched = [p for p in touched if self._matches_plan_glob(repo, p)]
                    warnings_before = len(self.warnings[repo.id])  # CFT-6
                    if plan_touched:
                        self._parse_all_plans_with_retry(repo)
                        await self._push_readiness_update({repo.id})
                        await self._push("task_updated", {"repo": repo.id})
                        new_count = len(self.warnings[repo.id]) - warnings_before
                        for w in list(self.warnings[repo.id])[-new_count:] if new_count > 0 else []:
                            await self._push("warning", {"repo": repo.id, **w})
            except asyncio.CancelledError:
                return
            except Exception as exc:  # F42-class: the watcher task never dies
                log.exception("[%s] watcher error, restarting: %s", repo.id, exc)
                await asyncio.sleep(2)

    async def _watch_git (self, repo: RepoConfig) -> None:
        """CFT-3: dedicated `.git/logs` watcher with the default filter DISABLED
        (DefaultFilter ignores `.git`, which silently killed live commit
        detection). Small dir -> cheap. F57-style tolerant of a missing dir."""
        if repo.demo_status is not None:
            return
        logs_dir = repo.path / ".git" / "logs"
        while True:
            try:
                if not logs_dir.exists():
                    await asyncio.sleep(30)
                    continue
                async for _changes in awatch(logs_dir, watch_filter=None, step=300):
                    await self._detect_commits(repo)
            except asyncio.CancelledError:
                return
            except Exception as exc:  # F42: never dies
                log.exception("[%s] git watcher error, restarting: %s", repo.id, exc)
                await asyncio.sleep(2)

    async def _push_activity_batch (self, result: BatchResult) -> None:
        if result.changed:
            await self._push(
                "activity_recorded",
                {
                    "repo_ids": sorted(result.affected_repo_ids),
                    "count": result.inserted,
                    "latest_id": db.get_latest_activity_id(),
                },
            )
            await self._push_readiness_update(result.affected_repo_ids)

    async def _watch_activity (self) -> None:
        """One central inbox watcher; atomic finals and bounded batches only."""
        while True:
            try:
                await self._push_activity_batch(self.activity.ingest_batch())
                async for _changes in awatch(
                        self.activity.inbox, recursive=False, step=300):
                    await self._push_activity_batch(self.activity.ingest_batch())
            except asyncio.CancelledError:
                return
            except Exception:
                # Never interpolate an untrusted path, payload, or parser exception.
                log.exception("activity watcher error; restarting")
                await asyncio.sleep(2)

    @staticmethod
    def _same (a: Path, b: Path) -> bool:
        try:
            return a.resolve() == b.resolve()
        except OSError:
            return False

    async def _poll_loop (self) -> None:
        """F22: periodic status poll - non-Claude edits (MetaEditor saves)
        produce no hook/.git signal and must not leave a stale CLEAN badge."""
        interval = max(5, self.config.server.status_poll_seconds)
        while True:
            try:
                await asyncio.sleep(interval)
                for repo in self._online_repos():
                    commit_scan_ok = True
                    if repo.demo_status is None:
                        commit_scan_ok = await self._detect_commits(repo)  # CFT-3
                    was_clean = self.status[repo.id]["clean"]
                    if self._refresh_status(repo):
                        now_clean = self.status[repo.id]["clean"]
                        if (self.status[repo.id]["status_valid"] and now_clean
                                and not was_clean and db.has_unlinked_events(repo.id)):
                            self._sweep(
                                repo, commit_scan_ok=commit_scan_ok,
                            )                              # F9 via poll path
                        await self._push("repo_status_changed",
                                         {"repo": repo.id, **self.status[repo.id]})
                        await self._push_readiness_update({repo.id})
                    # F58: a gitignored-file edit (e.g. a detailed plan under the
                    # ignored temp/) accrues an UNLINKED event WITHOUT dirtying the
                    # repo, so neither the startup nor the dirty->clean transition
                    # sweep fires for it (_refresh_status reports no change) -> it
                    # would linger unlinked until a restart / next commit. Safety
                    # net: sweep ANY clean repo that has accrued unlinked events,
                    # every poll. Idempotent (touches only commit_hash IS NULL rows).
                    if (self.status[repo.id]["status_valid"]
                            and self.status[repo.id]["clean"]
                            and db.has_unlinked_events(repo.id)):
                        if self._sweep(repo, commit_scan_ok=commit_scan_ok):
                            await self._push("commit_detected",
                                             {"repo": repo.id, "swept": True})
                            await self._push_readiness_update({repo.id})
                # Bounded safety sweep covers files published while the watcher was
                # down or between its baseline and startup catch-up.
                await self._push_activity_batch(self.activity.ingest_batch())
            except asyncio.CancelledError:
                return
            except Exception as exc:  # F41: the poll loop never dies
                log.exception("poll loop error: %s", exc)
