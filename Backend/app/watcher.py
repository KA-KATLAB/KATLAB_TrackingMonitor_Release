"""Watchers + orchestration (PLAN v0.1.0.0 D.2).

Startup sequence is FIXED (F24): load config -> init DB -> parse ALL plans
(task cache) -> catch-up ingest of events.jsonl beyond stored offset ->
startup sweep if repo already CLEAN (F32) -> start watchers -> initial git
status. Catch-up before plan parse would resolve every missed-while-down
event against an empty task set -> all UNKNOWN forever.
"""

import asyncio
import json
import logging
from collections import deque
from datetime import datetime, timezone
from pathlib import Path

from watchfiles import awatch

from . import db, git_module
from .config import AppConfig, RepoConfig
from .plan_parser import parse_plan_file
from .resolver import resolve

log = logging.getLogger("katlab.tracker")


def _now_z () -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class Tracker:
    """Single-process orchestrator; owns per-repo state and background tasks."""

    def __init__ (self, config: AppConfig):
        self.config = config
        self.status: dict[str, dict] = {}          # repo_id -> {clean, count, offline}
        self.warnings: dict[str, deque] = {}       # repo_id -> recent warnings (F47)
        self.known_commits: dict[str, set[str]] = {}
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
            self.status[repo.id] = {"clean": False, "count": 0,
                                    "offline": repo.offline, "branch": None}
            self.warnings.setdefault(repo.id, deque(maxlen=50))
            self.known_commits[repo.id] = set()

        for repo in self._online_repos():
            repo.tracking_dir.mkdir(parents=True, exist_ok=True)  # F18
            self._parse_all_plans(repo)                           # plans BEFORE catch-up
            self._catch_up_events(repo)
            self._backfill_commits(repo)                          # CFT-2: seed quietly
            self._refresh_status(repo)
            if self.status[repo.id]["clean"] and db.has_unlinked_events(repo.id):
                self._sweep(repo)                                 # F32 startup sweep

        self._tasks = [
            task
            for repo in self._online_repos()
            for task in (
                asyncio.create_task(self._watch_repo(repo)),
                asyncio.create_task(self._watch_git(repo)),       # CFT-3
            )
        ] + [asyncio.create_task(self._poll_loop())]

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

    def _parse_one_plan (self, repo: RepoConfig, path: Path) -> None:
        key = self._plan_key(repo, path)
        if not path.exists():
            db.sync_plan_tasks(repo.id, key, [])  # F16: deleted plan -> tasks removed
            return
        result = parse_plan_file(path, source=key)
        for warning in result.warnings:
            self._warn(repo.id, warning)
        db.sync_plan_tasks(repo.id, key, [
            {"id": t.id, "title": t.title, "status": t.status,
             "files": t.files, "why": t.why}
            for t in result.tasks
        ])  # F11: atomic per-plan sync

    def _parse_all_plans (self, repo: RepoConfig) -> None:
        for path in self._plan_files(repo):
            self._parse_one_plan(repo, path)

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
                    raise ValueError(f"unknown event version {raw.get('v')!r}")
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
                parsed.append({
                    "ts": ts, "tool": tool, "file": file,
                    "task_ref": resolution.task_ref, "mode": resolution.mode,
                    "candidates": resolution.candidates,
                    "session_id": session_id,
                    "branch": branch,
                })
            except (ValueError, KeyError) as exc:
                # F26: skip + warn; offset still advances - never stall.
                self._warn(repo.id, f"events.jsonl: skipped malformed line ({exc})")

        return db.insert_events_with_offset(repo.id, parsed, new_offset)  # F13: one tx

    # --- git status + commits ---------------------------------------------

    def _refresh_status (self, repo: RepoConfig) -> bool:
        """Returns True if status changed. F41: git failure -> keep last known."""
        try:
            count = git_module.uncommitted_count(repo.path)
        except git_module.GitError as exc:
            log.debug("[%s] status kept (transient git failure: %s)", repo.id, exc)
            return False
        # v0.1.6.0 D2 (B.2, RV2): branch under its OWN try - on GitError the
        # PREVIOUS value carries forward into the new dict (F41 keep-last-
        # known applies per-field; the key is NEVER absent).
        try:
            branch = git_module.current_branch(repo.path)
        except git_module.GitError:
            branch = self.status[repo.id].get("branch")
        previous = self.status[repo.id]
        changed = previous["count"] != count or previous["clean"] != (count == 0)
        self.status[repo.id] = {"clean": count == 0, "count": count,
                                "offline": False, "branch": branch}
        return changed

    def _backfill_commits (self, repo: RepoConfig) -> None:
        """CFT-2: seed known_commits + History with recent commits QUIETLY at
        startup - no WS pushes, no linking (F32 sweep owns the down-across-
        commit case). Without seeding, the first logs/HEAD change would
        announce up to 20 pre-existing commits as new."""
        try:
            recent = git_module.new_commits_since(repo.path, set(), limit=20)
        except git_module.GitError as exc:
            log.debug("[%s] backfill skipped (git: %s)", repo.id, exc)
            return
        for commit in recent:
            db.upsert_commit(repo.id, commit)
            self.known_commits[repo.id].add(commit["hash"])

    def _sweep (self, repo: RepoConfig) -> int:
        """F9/F32: attach unlinked events to HEAD. F35/F36: upsert HEAD's row first."""
        try:
            head = git_module.commit_info(repo.path, "HEAD")
        except git_module.GitError as exc:
            self._warn(repo.id, f"sweep skipped (git: {exc})")
            return 0
        db.upsert_commit(repo.id, head)
        self.known_commits[repo.id].add(head["hash"])
        return db.sweep_unlinked_events(repo.id, head["hash"])

    async def _detect_commits (self, repo: RepoConfig) -> None:
        try:
            fresh = git_module.new_commits_since(repo.path, self.known_commits[repo.id])
        except git_module.GitError as exc:
            log.debug("[%s] commit detect kept (transient: %s)", repo.id, exc)  # F42
            return
        for commit in fresh:
            db.upsert_commit(repo.id, commit)
            self.known_commits[repo.id].add(commit["hash"])
            db.link_events_to_commit(repo.id, commit["hash"], commit["ts"], commit["files"])
            await self._push("commit_detected", {"repo": repo.id, "hash": commit["hash"],
                                                 "message": commit["message"]})
        if fresh:
            was_clean = self.status[repo.id]["clean"]
            self._refresh_status(repo)
            if self.status[repo.id]["clean"] and not was_clean:
                if self._sweep(repo):                       # F9: transition sweep
                    await self._push("commit_detected", {"repo": repo.id, "swept": True})
            await self._push("repo_status_changed",
                             {"repo": repo.id, **self.status[repo.id]})

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
                    plan_touched = [p for p in touched if self._matches_plan_glob(repo, p)]
                    warnings_before = len(self.warnings[repo.id])  # CFT-6
                    for path in plan_touched:
                        self._parse_one_plan(repo, path)
                    if plan_touched:
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
                    await self._detect_commits(repo)        # CFT-3 safety net
                    was_clean = self.status[repo.id]["clean"]
                    if self._refresh_status(repo):
                        now_clean = self.status[repo.id]["clean"]
                        if now_clean and not was_clean and db.has_unlinked_events(repo.id):
                            self._sweep(repo)               # F9 via poll path
                        await self._push("repo_status_changed",
                                         {"repo": repo.id, **self.status[repo.id]})
            except asyncio.CancelledError:
                return
            except Exception as exc:  # F41: the poll loop never dies
                log.exception("poll loop error: %s", exc)
