"""D.2 contract tests for Mission REST, health, assignment, and paging."""

import json
import sqlite3
import subprocess
import sys
import tempfile
import threading
import unittest
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from Backend.app import db, provider_health
from Backend.app.api import routes
from Backend.app.chronicle_auth import SignerState
from Backend.app.config import AppConfig, RepoConfig, ServerConfig, load_check_registry
from Backend.app.plan_parser import parse_plan_bytes, raw_plan_sha256
from Backend.app.watcher import Tracker
from Backend.app.version import __version__
from Scripts.render_hook_config import render_config


PLAN = "temp/Plan/PLAN_API.txt"
BASE_TS = "2026-09-07T00:00:00Z"


def _close_db () -> None:
    connection = getattr(db._local, "conn", None)
    if connection is not None:
        connection.close()
        del db._local.conn


def _plan (verification: str = "backend-test") -> bytes:
    return f"""<task id=\"D.2\">
<title>API task</title>
<status>in-progress</status>
<files>
src/**
</files>
<why>Synthetic contract fixture.</why>
</task>
<verification>
{verification}
</verification>
""".encode()


class MissionApiTests(unittest.TestCase):
    def setUp (self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.repo_a = self.root / "repo-a"
        self.repo_b = self.root / "repo-b"
        for root in (self.repo_a, self.repo_b):
            (root / ".git").mkdir(parents=True)
        self.repos = [
            RepoConfig("Repo_A", "Repo A", self.repo_a),
            RepoConfig("Repo_B", "Repo B", self.repo_b),
        ]
        registry = self.root / "checks.json"
        registry.write_text(json.dumps({
            "schema_version": 1,
            "checks": [{
                "id": "backend-test", "label": "Backend test",
                "repo_ids": ["Repo_A", "Repo_B"], "cwd": ".",
                "commands": ["python verify.py"],
                "accepted_exit_codes": [0],
                "evidence_sources": ["hook", "manual"],
            }],
        }), encoding="utf-8")
        self.definitions = load_check_registry(registry, {"Repo_A", "Repo_B"})
        self.config = AppConfig(
            ServerConfig(), self.repos, self.root / "runtime", self.definitions,
        )

        self.old_db_path, self.old_data_dir = db.DB_PATH, db.DATA_DIR
        _close_db()
        db.DB_PATH = self.root / "tracking.db"
        db.DATA_DIR = self.root
        self.db_connection = sqlite3.connect(db.DB_PATH, check_same_thread=False)
        self.db_connection.row_factory = sqlite3.Row
        self.db_connection.execute("PRAGMA foreign_keys=ON")
        self.get_conn_patch = patch.object(
            db, "get_conn", return_value=self.db_connection,
        )
        self.get_conn_patch.start()
        db.init_db(self.repos)
        self._sync_plan()

        self.tracker = Tracker(self.config)
        self.tracker.activity.initialize()
        for repo in self.repos:
            self.tracker.status[repo.id] = {
                "clean": True, "count": 0, "offline": False, "branch": "main",
                "status_valid": True, "paths_complete": True,
                "observed_at": "2026-09-07T02:00:00Z",
            }
            self.tracker.dirty_paths[repo.id] = []
            self.tracker.warnings[repo.id] = []
        # API refresh semantics are tested without invoking a real Git process.
        self.tracker._refresh_status = lambda _repo: False
        self.messages: list[tuple[str, dict]] = []

        async def capture (kind: str, data: dict) -> None:
            self.messages.append((kind, data))

        self.tracker.set_broadcaster(capture)
        app = FastAPI()
        app.state.tracker = self.tracker
        app.state.chronicle_disabled = False
        app.state.chronicle_runtime = None
        app.state.chronicle_signer = SignerState()
        app.include_router(routes.router)
        self.app = app
        self.client = TestClient(app)

    def tearDown (self) -> None:
        self.client.close()
        self.db_connection.close()
        self.get_conn_patch.stop()
        db.DB_PATH, db.DATA_DIR = self.old_db_path, self.old_data_dir
        self.temp.cleanup()

    def _sync_plan (self, verification: str = "backend-test",
                    seen_at: str = BASE_TS) -> None:
        raw = _plan(verification)
        parsed = parse_plan_bytes(raw, "api fixture")
        db.sync_plan_snapshot(
            "Repo_A", PLAN, raw_plan_sha256(raw), parsed, seen_at,
            self.definitions,
        )

    def _activity (self, kind: str, *, provider: str = "codex",
                   session: str | None = "shared", repo_ids=None,
                   ts: str = "2026-09-07T01:00:00Z", tool_use_id: str | None = None,
                   outcome: str | None = None, assignment: str = "NONE") -> int:
        transport = {
            "uid": str(uuid.uuid4()), "schema_version": 1,
            "provider": provider, "evidence_source": "hook", "kind": kind,
            "ts": ts, "delivery_class": "durable", "session_id": session,
            "tool_use_id": tool_use_id, "outcome": outcome,
        }
        if kind == "tool_finished":
            transport.update({"tool_name": "apply_patch", "tool_class": "write"})
        if kind in {"check_started", "check_finished"}:
            transport.update({
                "check_id": "backend-test",
                "check_revision": self.definitions[0].revision,
            })
        derived = {
            "assignment_mode": assignment, "plan_repo_id": None,
            "plan_file": None, "task_ref": None,
            "check_revision": transport.get("check_revision"),
            "requirement_revision": None, "plan_revision": None,
        }
        status, activity_id = db.insert_activity(
            transport, uuid.uuid4().hex, repo_ids or [], derived, ts,
        )
        self.assertEqual(status, "inserted")
        return activity_id

    def test_mission_has_fixed_scopes_states_and_no_private_paths (self) -> None:
        response = self.client.get("/api/mission")
        self.assertEqual(response.status_code, 200)
        data = response.json()["data"]
        self.assertEqual(data["scope"], {"kind": "all", "repo": None})
        self.assertEqual(data["summary"]["total"], 1)
        self.assertEqual(set(data["summary"]["states"]), {
            "not_configured", "planning", "implementation", "verification",
            "blocked", "ready_to_commit", "verified_committed",
        })
        self.assertEqual(data["plans"][0]["state"], "implementation")
        requirement = data["plans"][0]["requirements"][0]
        self.assertEqual(requirement["evidence_sources"], ["hook", "manual"])
        self.assertEqual(requirement["check_revision"], self.definitions[0].revision)
        self.assertNotIn("dirty_paths", json.dumps(data))

        scoped = self.client.get("/api/mission", params={"repo": "Repo_B"}).json()["data"]
        self.assertEqual(scoped["scope"], {"kind": "repo", "repo": "Repo_B"})
        self.assertEqual(scoped["summary"]["total"], 0)
        self.assertTrue(all(value == 0 for value in scoped["summary"]["states"].values()))
        self.assertEqual(self.client.get(
            "/api/mission", params={"repo": "missing"},
        ).status_code, 404)

    def test_diff_rejects_revision_options_privately_without_fallback (self) -> None:
        for revision in (
                "--output=C:/PRIVATE_REVISION_SENTINEL/result.txt",
                "-p", "--stat", "--", "HEAD\0PRIVATE_REVISION_SENTINEL"):
            with self.subTest(revision=revision), \
                 patch.object(routes.git_module.subprocess, "run") as run, \
                 patch.object(routes.git_module, "file_diff") as working_diff, \
                 patch.object(routes.git_module, "file_state") as file_state:
                response = self.client.get("/api/diff", params={
                    "repo": "Repo_A", "file": "src/fixture.py", "commit": revision,
                })
                self.assertEqual(response.status_code, 200)
                body = response.json()
                self.assertEqual(set(body), {"success", "data", "message", "timestamp"})
                self.assertIs(body["success"], False)
                self.assertIsNone(body["data"])
                self.assertEqual(body["message"], "git diff failed: Invalid Git revision")
                self.assertNotIn("PRIVATE_REVISION_SENTINEL", response.text)
                run.assert_not_called()
                working_diff.assert_not_called()
                file_state.assert_not_called()

    def test_diff_preserves_revision_and_working_tree_argument_paths (self) -> None:
        file = "--output=literal-file.txt"
        for revision in ("abcdef1", "HEAD", "feature/topic", "main..HEAD", "HEAD~1"):
            completed = subprocess.CompletedProcess([], 0, "fixture diff\n", "")
            with self.subTest(revision=revision), patch.object(
                    routes.git_module.subprocess, "run", return_value=completed) as run:
                response = self.client.get("/api/diff", params={
                    "repo": "Repo_A", "file": file, "commit": revision,
                })
                self.assertEqual(response.status_code, 200)
                self.assertIs(response.json()["success"], True)
                self.assertEqual(response.json()["data"], {"file": file, "diff": "fixture diff\n"})
                run.assert_called_once()
                self.assertEqual(run.call_args.args[0], [
                    "git", "-C", str(self.repo_a), "show", "--format=", revision, "--", file,
                ])

        for revision in (None, ""):
            params = {"repo": "Repo_A", "file": file}
            if revision is not None:
                params["commit"] = revision
            results = [subprocess.CompletedProcess([], 0, text, "")
                       for text in ("", f"?? {file}\n")]
            with self.subTest(revision=revision), patch.object(
                    routes.git_module.subprocess, "run", side_effect=results) as run:
                response = self.client.get("/api/diff", params=params)
                self.assertEqual(response.status_code, 200)
                self.assertIs(response.json()["success"], True)
                self.assertIn("new untracked file", response.json()["data"]["diff"])
                self.assertEqual([call.args[0][3:] for call in run.call_args_list], [
                    ["diff", "HEAD", "--", file],
                    ["status", "--porcelain", "--ignored", "--", file],
                ])

    def test_diff_unknown_offline_and_demo_repositories_never_invoke_git (self) -> None:
        for repo_id, config_repo, expected in (
                ("missing", self.repos[0], 404),
                ("Repo_A", replace(self.repos[0], offline=True), 404),
                ("Repo_A", replace(self.repos[0], demo_status={}), 200)):
            config = replace(self.config, repos=(config_repo,))
            with self.subTest(repo=repo_id, offline=config_repo.offline, expected=expected), \
                 patch.object(self.tracker, "config", config), \
                 patch.object(routes.git_module.subprocess, "run") as run:
                response = self.client.get("/api/diff", params={
                    "repo": repo_id, "file": "fixture.txt",
                    "commit": "--output=PRIVATE_REVISION_SENTINEL.txt",
                })
                self.assertEqual(response.status_code, expected)
                if expected == 200:
                    self.assertIs(response.json()["success"], True)
                    self.assertIn("intentionally disabled", response.json()["data"]["diff"])
                run.assert_not_called()

    def test_forecast_uses_paired_paths_and_completed_plan_sync (self) -> None:
        repo_id = "Repo_A"
        self.tracker.status[repo_id]["clean"] = False
        self.tracker.status[repo_id]["count"] = 1  # Git records need not equal paths.
        self.tracker.dirty_paths[repo_id] = ["src/first.py", "src/second.py"]
        self.tracker._publish_status_pair(repo_id)
        self.tracker.plan_reconciliation[repo_id] = (
            2, True, "2026-09-07T01:30:00Z",
        )
        self.tracker.plan_reconciliation["Repo_B"] = (
            2, True, "2026-09-07T01:30:00Z",
        )

        data = self.client.get("/api/mission").json()["data"]
        self.assertEqual(data["forecast_scope"], {
            "total_repos": 2, "returned_repos": 2, "truncated": False,
        })
        first, second = data["forecast"]
        self.assertEqual([first["repo"], second["repo"]], ["Repo_A", "Repo_B"])
        self.assertEqual(first["state"], "ready")
        self.assertEqual(first["source"], "working_tree")
        self.assertEqual(first["plan_context_at"], "2026-09-07T01:30:00Z")
        self.assertEqual(first["total_paths"], 2)
        self.assertEqual(first["mode_counts"]["B"], 2)
        self.assertEqual([item["file"] for item in first["items"]],
                         ["src/first.py", "src/second.py"])
        self.assertEqual(first["items"][0]["target"], {
            "plan_file": PLAN, "task_id": "D.2",
        })
        self.assertEqual(second["state"], "ready")
        self.assertEqual(second["total_paths"], 0)
        self.assertEqual(second["items"], [])
        self.assertEqual(self.tracker.missions["generated_at"], None)

        scoped = self.client.get(
            "/api/mission", params={"repo": "Repo_A"},
        ).json()["data"]
        self.assertEqual(scoped["forecast_scope"], {
            "total_repos": 1, "returned_repos": 1, "truncated": False,
        })
        self.assertEqual(len(scoped["forecast"]), 1)
        self.assertEqual(scoped["forecast"][0]["repo"], "Repo_A")

    def test_forecast_status_and_plan_guards_fail_closed (self) -> None:
        repo_id = "Repo_A"
        self.tracker.status[repo_id]["clean"] = False
        self.tracker.dirty_paths[repo_id] = ["src/first.py"]
        self.tracker._publish_status_pair(repo_id)

        without_sync = self.client.get(
            "/api/mission", params={"repo": repo_id},
        ).json()["data"]
        row = without_sync["forecast"][0]
        self.assertEqual(row["reason"], "plan_context_unavailable")
        self.assertIsNone(row["total_paths"])
        self.assertEqual(row["items"], [])
        self.assertEqual(without_sync["plans"][0]["plan_file"], PLAN)

        self.tracker.plan_reconciliation[repo_id] = (
            2, True, "2026-09-07T01:30:00Z",
        )
        self.tracker.status[repo_id].update({
            "status_valid": False, "paths_complete": False,
            "observed_at": "2026-09-07T04:00:00Z", "branch": "stale",
        })
        self.tracker._publish_status_pair(repo_id)
        failed = self.client.get(
            "/api/mission", params={"repo": repo_id},
        ).json()["data"]["forecast"][0]
        self.assertEqual(failed["reason"], "status_unavailable")
        self.assertIsNone(failed["observed_at"])
        self.assertIsNone(failed["branch"])

        self.tracker.status[repo_id].update({
            "status_valid": True, "paths_complete": True,
            "observed_at": "2026-09-07T04:01:00Z", "branch": "main",
        })
        self.tracker._publish_status_pair(repo_id)
        recovered = self.client.get(
            "/api/mission", params={"repo": repo_id},
        ).json()["data"]["forecast"][0]
        self.assertEqual(recovered["state"], "ready")
        self.assertEqual(recovered["observed_at"], "2026-09-07T04:01:00Z")

        self.tracker.plan_reconciliation[repo_id] = (
            4, True, "2026-02-30T01:30:00Z",
        )
        bad_context_time = self.client.get(
            "/api/mission", params={"repo": repo_id},
        ).json()["data"]["forecast"][0]
        self.assertEqual(bad_context_time["reason"],
                         "plan_context_unavailable")
        self.assertEqual(bad_context_time["observed_at"],
                         "2026-09-07T04:01:00Z")

        self.tracker.status[repo_id]["observed_at"] = "2026-02-30T04:01:00Z"
        self.tracker._publish_status_pair(repo_id)
        bad_status_time = self.client.get(
            "/api/mission", params={"repo": repo_id},
        ).json()["data"]["forecast"][0]
        self.assertEqual(bad_status_time["reason"], "status_unavailable")
        self.assertIsNone(bad_status_time["observed_at"])

    def test_forecast_busy_does_not_read_context_or_hide_mission (self) -> None:
        self.tracker.plan_reconciliation["Repo_A"] = (
            2, True, "2026-09-07T01:30:00Z",
        )
        self.assertTrue(self.tracker.forecast_gate.acquire(blocking=False))
        try:
            with patch.object(db, "capture_forecast_contexts") as capture:
                response = self.client.get(
                    "/api/mission", params={"repo": "Repo_A"},
                )
                capture.assert_not_called()
        finally:
            self.tracker.forecast_gate.release()
        self.assertEqual(response.status_code, 200)
        data = response.json()["data"]
        self.assertEqual(data["forecast"][0]["reason"], "busy")
        self.assertEqual(data["plans"][0]["plan_file"], PLAN)
        retry = self.client.get(
            "/api/mission", params={"repo": "Repo_A"},
        ).json()["data"]["forecast"][0]
        self.assertEqual(retry["state"], "ready")

    def test_forecast_generation_change_quarantines_completed_rows (self) -> None:
        repo_id = "Repo_A"
        self.tracker.status[repo_id]["clean"] = False
        self.tracker.dirty_paths[repo_id] = ["src/first.py"]
        self.tracker._publish_status_pair(repo_id)
        self.tracker.plan_reconciliation[repo_id] = (
            2, True, "2026-09-07T01:30:00Z",
        )
        original = routes.forecast.ForecastBatch.build_ready

        def interleave (batch, index, context, completed_at):
            original(batch, index, context, completed_at)
            self.tracker.plan_reconciliation[repo_id] = (3, False, None)

        with patch.object(routes.forecast.ForecastBatch,
                          "build_ready", interleave):
            data = self.client.get(
                "/api/mission", params={"repo": repo_id},
            ).json()["data"]
        self.assertEqual(data["plans"][0]["plan_file"], PLAN)
        self.assertEqual(data["forecast"][0]["reason"],
                         "plan_context_unavailable")
        self.assertEqual(data["forecast"][0]["items"], [])

    def test_plan_reconciliation_guard_tracks_whole_runs (self) -> None:
        repo = self.repos[0]
        self.assertEqual(self.tracker.plan_reconciliation[repo.id],
                         (0, False, None))
        with patch.object(self.tracker, "_parse_all_plans",
                          side_effect=[False, True]), \
                patch("Backend.app.watcher.time.sleep"):
            self.assertTrue(self.tracker._parse_all_plans_with_retry(repo))
        generation, healthy, completed_at = self.tracker.plan_reconciliation[repo.id]
        self.assertEqual(generation, 2)
        self.assertTrue(healthy)
        self.assertTrue(completed_at.endswith("Z"))

        with patch.object(self.tracker, "_parse_all_plans",
                          side_effect=[False, False]), \
                patch("Backend.app.watcher.time.sleep"):
            self.assertFalse(self.tracker._parse_all_plans_with_retry(repo))
        self.assertEqual(self.tracker.plan_reconciliation[repo.id],
                         (3, False, None))

        with patch.object(self.tracker, "_parse_all_plans", return_value=True):
            self.assertTrue(self.tracker._parse_all_plans_with_retry(repo))
        recovered = self.tracker.plan_reconciliation[repo.id]
        self.assertEqual(recovered[0], 6)
        self.assertTrue(recovered[1])
        self.assertTrue(recovered[2].endswith("Z"))

    def test_forecast_gate_releases_on_query_exception (self) -> None:
        self.tracker.plan_reconciliation["Repo_A"] = (
            2, True, "2026-09-07T01:30:00Z",
        )
        with patch.object(db, "capture_forecast_contexts",
                          side_effect=sqlite3.OperationalError("synthetic")):
            with self.assertRaises(sqlite3.OperationalError):
                self.client.get("/api/mission", params={"repo": "Repo_A"})
        self.assertFalse(self.tracker.forecast_gate.locked())

    def test_forecast_workspace_cap_includes_offline_repos (self) -> None:
        extra = [
            RepoConfig(f"Offline_{number}", f"Offline {number}",
                       self.root / f"missing-{number}", offline=True)
            for number in range(3)
        ]
        self.tracker.config = AppConfig(
            self.config.server, [*self.repos, *extra],
            self.config.activity_root, self.config.checks,
        )
        data = self.client.get("/api/mission").json()["data"]
        self.assertEqual(data["forecast_scope"], {
            "total_repos": 5, "returned_repos": 4, "truncated": True,
        })
        self.assertEqual([row["repo"] for row in data["forecast"]],
                         ["Repo_A", "Repo_B", "Offline_0", "Offline_1"])
        self.assertEqual(data["forecast"][2]["reason"], "offline")
        self.assertIsNone(data["forecast"][2]["observed_at"])

        omitted = self.client.get(
            "/api/mission", params={"repo": "Offline_2"},
        ).json()["data"]
        self.assertEqual(omitted["forecast_scope"], {
            "total_repos": 1, "returned_repos": 1, "truncated": False,
        })
        self.assertEqual(omitted["forecast"][0]["repo"], "Offline_2")
        self.assertEqual(omitted["forecast"][0]["reason"], "offline")

    def test_forecast_gate_contender_and_wal_writer_after_snapshot (self) -> None:
        self.db_connection.execute("PRAGMA journal_mode=WAL")
        repo_id = "Repo_A"
        self.tracker.status[repo_id]["clean"] = False
        self.tracker.dirty_paths[repo_id] = ["src/first.py"]
        self.tracker._publish_status_pair(repo_id)
        self.tracker.plan_reconciliation[repo_id] = (
            2, True, "2026-09-07T01:30:00Z",
        )
        request = SimpleNamespace(app=SimpleNamespace(
            state=SimpleNamespace(tracker=self.tracker),
        ))
        entered = threading.Event()
        release = threading.Event()
        original = routes.forecast.ForecastBatch.build_ready

        def blocked (batch, index, context, completed_at):
            entered.set()
            if not release.wait(timeout=5):
                raise TimeoutError("forecast test gate was not released")
            return original(batch, index, context, completed_at)

        with patch.object(routes.forecast.ForecastBatch,
                          "build_ready", blocked), ThreadPoolExecutor(
                              max_workers=2,
                          ) as pool:
            owner = pool.submit(routes.mission, request, repo_id)
            try:
                self.assertTrue(entered.wait(timeout=5))
                self.assertTrue(self.tracker.forecast_gate.locked())
                self.assertFalse(self.db_connection.in_transaction)
                writer = sqlite3.connect(db.DB_PATH, timeout=1)
                try:
                    writer.execute(
                        "UPDATE plan_snapshots SET last_seen_at = last_seen_at "
                        "WHERE repo_id = ?", (repo_id,),
                    )
                    writer.commit()
                finally:
                    writer.close()
                contender = pool.submit(routes.mission, request, repo_id)
                busy = contender.result(timeout=5)["data"]
                self.assertEqual(busy["forecast"][0]["reason"], "busy")
                self.assertEqual(busy["plans"][0]["plan_file"], PLAN)
            finally:
                release.set()
            winner = owner.result(timeout=5)["data"]
        self.assertEqual(winner["forecast"][0]["state"], "ready")
        self.assertFalse(self.tracker.forecast_gate.locked())

    def test_isolated_mission_projection_does_not_hold_forecast_gate (self) -> None:
        self.tracker.plan_reconciliation["Repo_A"] = (
            2, True, "2026-09-07T01:30:00Z",
        )
        request = SimpleNamespace(app=SimpleNamespace(
            state=SimpleNamespace(tracker=self.tracker),
        ))
        entered = threading.Event()
        release = threading.Event()
        calls_lock = threading.Lock()
        calls = 0
        original = self.tracker.mission_projection

        def delayed (repo_id, captured):
            nonlocal calls
            with calls_lock:
                calls += 1
                first = calls == 1
            if first:
                entered.set()
                if not release.wait(timeout=5):
                    raise TimeoutError("isolated Mission test was not released")
            return original(repo_id, captured)

        with patch.object(self.tracker, "mission_projection", delayed), \
                ThreadPoolExecutor(max_workers=2) as pool:
            first = pool.submit(routes.mission, request, "Repo_A")
            try:
                self.assertTrue(entered.wait(timeout=5))
                self.assertFalse(self.tracker.forecast_gate.locked())
                second = pool.submit(routes.mission, request, "Repo_A")
                self.assertEqual(second.result(timeout=5)["data"]["forecast"][0][
                    "state"], "ready")
            finally:
                release.set()
            self.assertEqual(first.result(timeout=5)["data"]["forecast"][0][
                "state"], "ready")

    def test_activity_scope_filters_order_bounds_and_effective_plan (self) -> None:
        boundary = self._activity("session_start", repo_ids=[], ts="2026-09-07T00:50:00Z")
        direct = self._activity("tool_finished", repo_ids=["Repo_A"],
                                ts="2026-09-07T01:00:00Z")
        multi = self._activity("tool_finished", repo_ids=["Repo_A", "Repo_B"],
                               ts="2026-09-07T01:10:00Z")
        other = self._activity("tool_finished", provider="claude", session="other",
                               repo_ids=["Repo_B"], ts="2026-09-07T01:20:00Z")

        page = self.client.get("/api/activity", params={
            "repo": "Repo_A", "provider": "codex", "session": "shared",
            "order": "asc", "limit": 9999,
        }).json()["data"]
        self.assertEqual([row["id"] for row in page["items"]], [boundary, direct, multi])
        self.assertEqual((page["total"], page["limit"], page["offset"]), (3, 2000, 0))
        self.assertEqual(page["items"][-1]["repo_ids"], ["Repo_A", "Repo_B"])
        self.assertEqual(
            page["items"][-1]["assignment_repo_ids"], ["Repo_A", "Repo_B"],
        )
        self.assertNotIn(other, [row["id"] for row in page["items"]])
        serialized = json.dumps(page)
        self.assertNotIn("record_sha256", serialized)
        self.assertNotIn(str(self.repo_a), serialized)

        for params in (
            {"provider": "invalid"}, {"kind": "invalid"}, {"order": "sideways"},
            {"offset": -1}, {"session": "shared"}, {"plan": PLAN},
            {"repo": "Repo_A", "check": "BAD"},
        ):
            with self.subTest(params=params):
                self.assertEqual(self.client.get(
                    "/api/activity", params=params,
                ).status_code, 400)

    def test_activity_page_resolves_only_the_requested_unfiltered_window (self) -> None:
        ids = [
            self._activity(
                "tool_finished", repo_ids=["Repo_A"],
                ts=f"2026-09-07T01:00:0{index}.000000Z",
            )
            for index in range(6)
        ]
        real_effective = db.effective_activity_binding
        with patch(
            "Backend.app.db.effective_activity_binding", wraps=real_effective,
        ) as effective:
            rows, total = db.get_activity_page(
                repo_id="Repo_A", order="asc", limit=2, offset=2,
            )

        self.assertEqual(total, 6)
        self.assertEqual([row[0]["id"] for row in rows], ids[2:4])
        self.assertEqual(effective.call_count, 2)

    def test_sessions_use_composite_identity_and_stable_empty_shape (self) -> None:
        self._activity("session_start", provider="codex", session="same", repo_ids=[])
        self._activity("tool_finished", provider="codex", session="same",
                       repo_ids=["Repo_A"], ts="2026-09-07T01:01:00Z")
        self._activity("tool_finished", provider="claude", session="same",
                       repo_ids=["Repo_B"], ts="2026-09-07T01:02:00Z")
        data = self.client.get("/api/sessions", params={"order": "asc"}).json()["data"]
        self.assertEqual(data["total"], 2)
        self.assertEqual(
            [(row["provider"], row["session_id"]) for row in data["items"]],
            [("codex", "same"), ("claude", "same")],
        )
        codex = data["items"][0]
        self.assertEqual((codex["event_count"], codex["repo_count"]), (2, 1))

        empty = self.client.get("/api/sessions", params={
            "provider": "codex", "session": "absent",
        }).json()["data"]
        self.assertEqual(empty, {
            "items": [], "total": 0, "limit": 50, "offset": 0, "order": "desc",
        })
        self.assertEqual(self.client.get(
            "/api/sessions", params={"session": "same"},
        ).status_code, 400)

    def test_assignment_is_append_only_pair_wide_and_signals_after_commit (self) -> None:
        start = self._activity(
            "check_started", repo_ids=["Repo_A"], tool_use_id="check-1",
            ts="2026-09-07T01:00:00Z", assignment="UNASSIGNED",
        )
        finish = self._activity(
            "check_finished", repo_ids=["Repo_A"], tool_use_id="check-1",
            ts="2026-09-07T01:01:00Z", outcome="pass", assignment="UNASSIGNED",
        )
        assigned = self.client.patch(f"/api/activity/{start}/plan", json={
            "repo": "Repo_A", "plan_file": PLAN,
        })
        self.assertEqual(assigned.status_code, 200, assigned.text)
        value = assigned.json()["data"]
        self.assertEqual(value["activity_id"], finish)
        self.assertEqual(value["effective_assignment"]["plan_file"], PLAN)
        self.assertEqual([kind for kind, _ in self.messages], [
            "evidence_updated", "readiness_updated",
        ])
        assignment = db.get_conn().execute(
            "SELECT * FROM activity_assignments WHERE id = ?",
            (value["assignment_id"],),
        ).fetchone()
        self.assertIsNotNone(assignment)

        self.messages.clear()
        cleared = self.client.patch(f"/api/activity/{finish}/plan", json={
            "repo": "Repo_A", "plan_file": None,
        })
        self.assertEqual(cleared.status_code, 200)
        self.assertEqual(
            cleared.json()["data"]["effective_assignment"]["mode"], "UNASSIGNED",
        )
        activity = self.client.get("/api/activity", params={
            "repo": "Repo_A", "plan": PLAN,
        }).json()["data"]
        self.assertEqual(activity["total"], 0)

        generic = self._activity("tool_finished", repo_ids=["Repo_A"])
        for target, body, expected in (
            (generic, {"repo": "Repo_A", "plan_file": PLAN}, 400),
            (finish, {"repo": "Repo_B", "plan_file": PLAN}, 400),
            (999999, {"repo": "Repo_A", "plan_file": PLAN}, 404),
        ):
            with self.subTest(target=target):
                self.assertEqual(self.client.patch(
                    f"/api/activity/{target}/plan", json=body,
                ).status_code, expected)

    def test_reassignment_invalidates_prior_and_new_repository_scopes (self) -> None:
        raw = _plan()
        db.sync_plan_snapshot(
            "Repo_B", PLAN, raw_plan_sha256(raw),
            parse_plan_bytes(raw, "api fixture B"), BASE_TS,
            self.definitions,
        )
        split_start = self._activity(
            "check_started", repo_ids=["Repo_A"],
            tool_use_id="split-check",
        )
        split_finish = self._activity(
            "check_finished", repo_ids=["Repo_B"],
            tool_use_id="split-check", outcome="pass",
            ts="2026-09-07T01:01:00Z",
        )
        split_assignment = self.client.patch(
            f"/api/activity/{split_finish}/plan", json={
                "repo": "Repo_A", "plan_file": PLAN,
            },
        )
        self.assertEqual(split_assignment.status_code, 200, split_assignment.text)
        self.assertEqual(split_assignment.json()["data"]["activity_id"], split_finish)
        self.assertNotEqual(split_start, split_finish)
        split_rows = self.client.get("/api/activity", params={
            "provider": "codex", "session": "shared", "check": "backend-test",
            "order": "asc",
        }).json()["data"]["items"]
        split_pair = [row for row in split_rows if row["evidence_id"] == split_finish]
        self.assertEqual(len(split_pair), 2)
        self.assertTrue(all(
            row["assignment_repo_ids"] == ["Repo_A", "Repo_B"]
            for row in split_pair
        ))

        self.messages.clear()
        evidence = self._activity(
            "check_finished", repo_ids=["Repo_A", "Repo_B"],
            tool_use_id="multi-check", outcome="pass",
        )
        assigned_a = self.client.patch(f"/api/activity/{evidence}/plan", json={
            "repo": "Repo_A", "plan_file": PLAN,
        })
        self.assertEqual(assigned_a.status_code, 200, assigned_a.text)

        self.messages.clear()
        assigned_b = self.client.patch(f"/api/activity/{evidence}/plan", json={
            "repo": "Repo_B", "plan_file": PLAN,
        })
        self.assertEqual(assigned_b.status_code, 200, assigned_b.text)
        self.assertEqual(self.messages, [
            ("evidence_updated", {
                "repo_ids": ["Repo_A", "Repo_B"],
                "activity_id": evidence,
                "assignment_id": assigned_b.json()["data"]["assignment_id"],
            }),
            ("readiness_updated", {"repo_ids": ["Repo_A", "Repo_B"]}),
        ])

        invalid_clear = self.client.patch(f"/api/activity/{evidence}/plan", json={
            "repo": "Repo_A", "plan_file": None,
        })
        self.assertEqual(invalid_clear.status_code, 400)

    def test_events_provider_filter_normalizes_legacy_null (self) -> None:
        conn = db.get_conn()
        task_ref = f"{PLAN} - D.2"
        conn.executemany(
            "INSERT INTO events "
            "(repo_id, ts, tool, file, mode, provider, session_id, task_ref) "
            "VALUES ('Repo_A', ?, 'Edit', ?, 'B', ?, 'same-session', ?)",
            [
                ("2026-09-07T01:00:00Z", "src/legacy.py", None, task_ref),
                ("2026-09-07T01:00:30Z", "src/claude.py", "claude", task_ref),
                ("2026-09-07T01:01:00Z", "src/codex.py", "codex", task_ref),
            ],
        )
        conn.commit()
        claude = self.client.get("/api/events", params={"provider": "claude"})
        self.assertEqual(
            {row["file"] for row in claude.json()["data"]},
            {"src/legacy.py", "src/claude.py"},
        )
        self.assertTrue(all(
            row["provider"] == "claude" for row in claude.json()["data"]
        ))
        codex = self.client.get("/api/events", params={"provider": "codex"})
        self.assertEqual([row["file"] for row in codex.json()["data"]], ["src/codex.py"])
        self.assertEqual(self.client.get(
            "/api/events", params={"provider": "manual"},
        ).status_code, 400)
        # Backward compatibility: a session alone is still accepted.
        self.assertEqual(self.client.get(
            "/api/events", params={"session": "any"},
        ).status_code, 200)

        # Session identity is provider + session_id across every aggregate;
        # legacy NULL provider rows normalize to Claude before deduplication.
        stats = db.get_stats(["Repo_A"], "2026-09-07T02:00:00Z")
        self.assertEqual(stats["identity"]["sessions"], 2)
        effort = next(row for row in stats["effort_per_task"]
                      if row["task_ref"] == task_ref)
        self.assertEqual(effort["sessions"], 2)
        self.assertEqual(stats["wrapped"]["top_task"]["sessions"], 2)

    def test_event_window_cap_does_not_prove_more_rows (self) -> None:
        # Each group is isolated by both exact file and provider+session filters.
        # The fourth page is a test-only probe; production dialogs stop at three.
        self.db_connection.executemany(
            "INSERT INTO events "
            "(repo_id, ts, tool, file, mode, provider, session_id) "
            "VALUES ('Repo_A', ?, 'Edit', ?, 'B', 'codex', ?)",
            (
                (BASE_TS, f"src/window_{total}.py", f"window-{total}")
                for total in (1499, 1500, 1501)
                for _ in range(total)
            ),
        )
        self.db_connection.commit()

        for total in (1499, 1500, 1501):
            file = f"src/window_{total}.py"
            session = f"window-{total}"
            scopes = (
                {"repo": "Repo_A", "file": file},
                {"provider": "codex", "session": session},
            )
            for scope in scopes:
                with self.subTest(total=total, scope=scope):
                    page_sizes = []
                    for offset in (0, 500, 1000, 1500):
                        response = self.client.get("/api/events", params={
                            **scope, "limit": 500, "offset": offset,
                        })
                        self.assertEqual(response.status_code, 200)
                        rows = response.json()["data"]
                        self.assertIsInstance(rows, list)
                        self.assertTrue(all(
                            row["file"] == file
                            and row["provider"] == "codex"
                            and row["session_id"] == session
                            for row in rows
                        ))
                        page_sizes.append(len(rows))

                    expected = [500, 500, min(total - 1000, 500),
                                max(total - 1500, 0)]
                    self.assertEqual(page_sizes, expected)
                    self.assertEqual(sum(page_sizes[:3]), min(total, 1500))
                    self.assertEqual(page_sizes[2] == 500, total >= 1500)
                    # 1500 and 1501 are identical within the three-page window.
                    self.assertEqual(page_sizes[3], 1 if total == 1501 else 0)

    def test_digest_day_bounds_keep_mixed_precision_midnight_rows (self) -> None:
        # Insertion order intentionally differs from timestamp order. The
        # endpoint filters by TEXT but still pages by ingestion ID descending.
        fixtures = [
            ("before", "2026-09-06T23:59:59.999999Z"),
            ("end_seconds", "2026-09-08T00:00:00Z"),
            ("start_micros", "2026-09-07T00:00:00.000000Z"),
            ("mid_late", "2026-09-07T12:00:00Z"),
            ("start_seconds", "2026-09-07T00:00:00Z"),
            ("after_end", "2026-09-08T00:00:00.000001Z"),
            ("start_millis", "2026-09-07T00:00:00.000Z"),
            ("end_millis", "2026-09-08T00:00:00.000Z"),
            ("last_micro", "2026-09-07T23:59:59.999999Z"),
            ("end_micros", "2026-09-08T00:00:00.000000Z"),
            ("first_micro", "2026-09-07T00:00:00.000001Z"),
            ("mid_early", "2026-09-07T01:00:00Z"),
        ]
        self.db_connection.executemany(
            "INSERT INTO events "
            "(repo_id, ts, tool, file, mode, provider, session_id) "
            "VALUES ('Repo_B', ?, 'Edit', ?, 'B', 'codex', 'digest-window')",
            ((ts, f"src/{name}.py") for name, ts in fixtures),
        )
        self.db_connection.commit()

        response = self.client.get("/api/events", params={
            "repo": "Repo_B", "provider": "codex", "session": "digest-window",
            "since": "2026-09-07T00:00:00.000000Z",
            "until": "2026-09-08T00:00:00.000000Z",
            "limit": 500, "offset": 0,
        })
        self.assertEqual(response.status_code, 200, response.text)
        rows = response.json()["data"]
        self.assertEqual([row["file"] for row in rows], [
            "src/mid_early.py", "src/first_micro.py", "src/last_micro.py",
            "src/start_millis.py", "src/start_seconds.py", "src/mid_late.py",
            "src/start_micros.py",
        ])
        self.assertEqual([row["id"] for row in rows], sorted(
            (row["id"] for row in rows), reverse=True,
        ))

    def test_health_has_independent_fixed_provider_and_activity_facts (self) -> None:
        expected = [{
            "provider": "claude", "adapter_present": True,
            "configuration_valid": False, "configuration_state": "settings_missing",
            "recently_observed": False, "last_observed_at": None,
        }, {
            "provider": "codex", "adapter_present": True,
            "configuration_valid": True, "configuration_state": "configured",
            "recently_observed": True, "last_observed_at": BASE_TS,
        }]
        with patch.object(routes.provider_health, "provider_health", return_value=expected):
            data = self.client.get("/api/health").json()["data"]
        self.assertEqual(set(data), {
            "server", "repos", "activity", "providers", "chronicle",
        })
        self.assertEqual(data["server"]["version"], __version__)
        self.assertEqual(set(data["activity"]), {
            "pending", "rejected", "ignored_unscoped",
            "registry_revision_mismatch",
        })
        self.assertEqual(data["providers"], expected)
        self.assertNotIn("session", json.dumps(data["providers"]))
        self.assertEqual(data["chronicle"], {"state": "unavailable"})

    def test_health_degrades_only_hook_marker_on_invalid_settings_encoding (self) -> None:
        home = self.root / "isolated-home"
        settings_path = home / ".claude" / "settings.json"
        settings_path.parent.mkdir(parents=True)

        def health_data () -> dict:
            response = self.client.get("/api/health")
            self.assertEqual(response.status_code, 200)
            payload = response.json()
            self.assertTrue(payload["success"])
            self.assertEqual(payload["message"], "")
            return payload["data"]

        providers = [{"provider": "claude", "configuration_state": "isolated"}]
        with patch.object(routes.Path, "home", return_value=home), \
             patch.object(routes.provider_health, "provider_health",
                          return_value=providers):
            settings_path.write_text("katlab_tracking_hook.py", encoding="utf-8")
            valid = health_data()
            self.assertTrue(valid["server"]["hook_registered"])
            self.assertEqual(valid["server"]["hook_settings_path"], str(settings_path))

            settings_path.write_bytes(b"\xffkatlab_tracking_hook.py")
            invalid = health_data()
            self.assertFalse(invalid["server"]["hook_registered"])

            settings_path.unlink()
            missing = health_data()
            self.assertFalse(missing["server"]["hook_registered"])

        for degraded in (invalid, missing):
            for key in ("repos", "activity", "providers", "chronicle"):
                self.assertEqual(degraded[key], valid[key])
            self.assertEqual(
                {key: value for key, value in degraded["server"].items()
                 if key != "hook_registered"},
                {key: value for key, value in valid["server"].items()
                 if key != "hook_registered"},
            )
            self.assertEqual(degraded["providers"], providers)

    def test_health_chronicle_reports_only_observed_worker_state (self) -> None:
        state = self.app.state

        def observed () -> dict:
            response = self.client.get("/api/health")
            self.assertEqual(response.status_code, 200)
            return response.json()["data"]["chronicle"]

        # Demo/explicit-config isolation never probes a production object.
        state.chronicle_disabled = True
        owned = SimpleNamespace(is_live=MagicMock(
            side_effect=AssertionError("disabled mode probed worker")))
        signer = SimpleNamespace(snapshot=MagicMock(
            side_effect=AssertionError("disabled mode probed signer")))
        state.chronicle_runtime = owned
        state.chronicle_signer = signer
        self.assertEqual(observed(), {"state": "disabled"})
        owned.is_live.assert_not_called()
        signer.snapshot.assert_not_called()

        state.chronicle_disabled = False
        self.assertEqual(observed(), {"state": "unavailable"})
        owned.is_live.assert_called_once()

        owned.is_live = MagicMock(return_value=True)
        state.chronicle_signer = SignerState()
        self.assertEqual(observed(), {"state": "unavailable"})
        state.chronicle_signer.publish(b"k" * 32, lambda: True)
        self.assertEqual(observed(), {"state": "running"})
        state.chronicle_signer.revoke()
        self.assertEqual(observed(), {"state": "unavailable"})
        state.chronicle_signer = SimpleNamespace(snapshot=MagicMock(
            side_effect=RuntimeError("signer observation failed")))
        self.assertEqual(observed(), {"state": "unavailable"})

        owned.is_live.return_value = False
        self.assertEqual(observed(), {"state": "unavailable"})
        owned.is_live.side_effect = RuntimeError("observation failed")
        self.assertEqual(observed(), {"state": "unavailable"})
        state.chronicle_runtime = None
        self.assertEqual(observed(), {"state": "unavailable"})

    def test_settings_reader_uses_byte_limits_without_rewriting_files (self) -> None:
        limit = provider_health.SETTINGS_MAX_BYTES
        self.assertEqual(limit, 1_048_576)
        path = self.root / "bounded-settings.json"
        for raw, accepted in (
                (b" " * (limit - 1), True), (b" " * limit, True),
                (b" " * (limit + 1), False),
                (("é" * (limit // 2)).encode("utf-8"), True),
                (("é" * (limit // 2) + "x").encode("utf-8"), False)):
            with self.subTest(bytes=len(raw), accepted=accepted):
                path.write_bytes(raw)
                if accepted:
                    self.assertEqual(provider_health.read_settings_text(path), raw.decode("utf-8"))
                else:
                    with self.assertRaisesRegex(ValueError, "^Provider settings exceed the health observation limit$"):
                        provider_health.read_settings_text(path)
                self.assertEqual(path.read_bytes(), raw)

    def test_settings_reader_bounds_reads_closes_and_checks_size_before_decode (self) -> None:
        oversized = MagicMock()
        oversized.__len__.return_value = provider_health.SETTINGS_MAX_BYTES + 1
        for raw, read_error, expected_error in (
                (b"{}", None, None), (b"\xff", None, UnicodeDecodeError),
                (oversized, None, ValueError),
                (None, OSError("PRIVATE_READ_FAILURE"), OSError)):
            with self.subTest(error=expected_error), patch.object(Path, "open") as opened:
                context = opened.return_value
                stream = context.__enter__.return_value
                stream.read.return_value = raw
                stream.read.side_effect = read_error
                if expected_error is None:
                    self.assertEqual(provider_health.read_settings_text(self.root / "fixture"), "{}")
                else:
                    with self.assertRaises(expected_error):
                        provider_health.read_settings_text(self.root / "fixture")
                opened.assert_called_once_with("rb")
                stream.read.assert_called_once_with(provider_health.SETTINGS_MAX_BYTES + 1)
                context.__exit__.assert_called_once()
                if read_error is None:
                    context.__exit__.assert_called_once_with(None, None, None)
        oversized.decode.assert_not_called()

    def test_provider_settings_preserve_size_encoding_and_missing_states (self) -> None:
        path = self.root / "provider-settings.json"
        limit = provider_health.SETTINGS_MAX_BYTES
        for provider in ("claude", "codex"):
            rendered = json.dumps(render_config(provider)).encode("utf-8")
            for size in (limit - 1, limit, limit + 1):
                raw = rendered + b" " * (size - len(rendered))
                path.write_bytes(raw)
                with self.subTest(provider=provider, bytes=size):
                    self.assertEqual(provider_health.validate_provider_settings(provider, path),
                                     (True, "configured") if size <= limit else (False, "settings_invalid"))
                    self.assertEqual(path.read_bytes(), raw)
            for raw in (b"", b"\xff", b"\xef\xbb\xbf" + rendered,
                        b"{", b"[]", b"null", b'"text"'):
                path.write_bytes(raw)
                with self.subTest(provider=provider, raw=raw[:12]):
                    self.assertEqual(provider_health.validate_provider_settings(provider, path),
                                     (False, "settings_invalid"))
                    self.assertEqual(path.read_bytes(), raw)
            self.assertEqual(provider_health.validate_provider_settings(provider, self.root / "missing.json"),
                             (False, "settings_missing"))
            with patch.object(Path, "open", side_effect=PermissionError("PRIVATE_OPEN_FAILURE")):
                self.assertEqual(provider_health.validate_provider_settings(provider, path),
                                 (False, "settings_invalid"))

    def test_provider_decoder_failures_are_expected_not_blanket_isolation (self) -> None:
        for provider in ("claude", "codex"):
            for error_type in (ValueError, RecursionError, RuntimeError,
                               MemoryError, KeyboardInterrupt, SystemExit):
                with self.subTest(provider=provider, error=error_type), \
                     patch.object(provider_health, "read_settings_text", return_value="{}"), \
                     patch.object(provider_health.json, "loads", side_effect=error_type("PRIVATE_DECODER_FAILURE")):
                    if error_type in (ValueError, RecursionError):
                        self.assertEqual(provider_health.validate_provider_settings(provider, self.root / "fixture"),
                                         (False, "settings_invalid"))
                    else:
                        with self.assertRaises(error_type):
                            provider_health.validate_provider_settings(provider, self.root / "fixture")

    def test_real_json_runtime_limits_degrade_without_changing_limits (self) -> None:
        recursion_limit = sys.getrecursionlimit()
        integer_limit = getattr(sys, "get_int_max_str_digits", lambda: 0)()
        depth = max(5000, recursion_limit * 2)
        cases = [("deep", '{"value":' + "[" * depth + "0" + "]" * depth + "}", RecursionError)]
        if integer_limit:
            cases.append(("integer", '{"value":' + "9" * (integer_limit + 1) + "}", ValueError))
        for name, text, error_type in cases:
            with self.subTest(case=name):
                self.assertLess(len(text.encode("utf-8")), provider_health.SETTINGS_MAX_BYTES)
                with self.assertRaises(error_type):
                    json.loads(text)
                path = self.root / f"{name}-settings.json"
                path.write_text(text, encoding="utf-8")
                for provider in ("claude", "codex"):
                    self.assertEqual(provider_health.validate_provider_settings(provider, path),
                                     (False, "settings_invalid"))
                self.assertEqual(path.read_text(encoding="utf-8"), text)
        self.assertEqual(sys.getrecursionlimit(), recursion_limit)
        self.assertEqual(getattr(sys, "get_int_max_str_digits", lambda: 0)(), integer_limit)

    def test_health_real_provider_failures_preserve_independent_facts_and_marker (self) -> None:
        home = self.root / "provider-home"
        paths = {"claude": home / ".claude" / "settings.json", "codex": home / ".codex" / "hooks.json"}
        valid = {provider: json.dumps(render_config(provider)).encode("utf-8") for provider in paths}
        for provider, path in paths.items():
            path.parent.mkdir(parents=True)
            path.write_bytes(valid[provider])
            self._activity("session_start", provider=provider,
                           session="bounded-health", ts=routes._now_z())
        marker = b"katlab_tracking_hook.py PRIVATE_SETTINGS_SENTINEL"
        depth = max(5000, sys.getrecursionlimit() * 2)
        malformed = [
            (marker, True), (b"\xff" + marker, False), (b"\xef\xbb\xbf" + marker, True),
            (marker + b" " * provider_health.SETTINGS_MAX_BYTES, False),
            (b'{"marker":"' + marker + b'","nested":' + b"[" * depth + b"0" + b"]" * depth + b"}", True),
            (None, False),
        ]
        integer_limit = getattr(sys, "get_int_max_str_digits", lambda: 0)()
        if integer_limit:
            malformed.append((b'{"marker":"' + marker + b'","integer":' + b"9" * (integer_limit + 1) + b"}", True))
        original_open = Path.open

        def read_only_open (path, mode="r", *args, **kwargs):
            self.assertEqual(mode, "rb", "health must not write settings")
            return original_open(path, mode, *args, **kwargs)

        with patch.object(routes.Path, "home", return_value=home), \
             patch.object(provider_health, "DEFAULT_SETTINGS", paths):
            baseline = self.client.get("/api/health").json()["data"]
            self.assertEqual([row["provider"] for row in baseline["providers"]], ["claude", "codex"])
            self.assertTrue(baseline["server"]["hook_registered"])
            self.assertTrue(all(row["configuration_valid"] for row in baseline["providers"]))
            self.assertTrue(all(row["recently_observed"] for row in baseline["providers"]))
            for provider, path in paths.items():
                for raw, marker_present in malformed:
                    with self.subTest(provider=provider, bytes=None if raw is None else len(raw)):
                        if raw is None:
                            path.unlink()
                        else:
                            path.write_bytes(raw)
                        with patch.object(Path, "open", autospec=True, side_effect=read_only_open) as opened:
                            response = self.client.get("/api/health")
                        self.assertEqual(response.status_code, 200)
                        payload = response.json()
                        self.assertEqual(set(payload), {"success", "data", "message", "timestamp"})
                        self.assertIs(payload["success"], True)
                        self.assertEqual(payload["message"], "")
                        self.assertNotIn("PRIVATE_SETTINGS_SENTINEL", response.text)
                        self.assertEqual(opened.call_count, 3)
                        data = payload["data"]
                        self.assertEqual([row["provider"] for row in data["providers"]], ["claude", "codex"])
                        expected_marker = marker_present if provider == "claude" else True
                        self.assertEqual(data["server"]["hook_registered"], expected_marker)
                        for key in ("repos", "activity", "chronicle"):
                            self.assertEqual(data[key], baseline[key])
                        self.assertEqual({k: v for k, v in data["server"].items() if k != "hook_registered"},
                                         {k: v for k, v in baseline["server"].items() if k != "hook_registered"})
                        for row, prior in zip(data["providers"], baseline["providers"]):
                            expected = dict(prior)
                            if row["provider"] == provider:
                                state = "settings_missing" if raw is None else "settings_invalid"
                                expected.update(configuration_valid=False, configuration_state=state)
                            self.assertEqual(row, expected)
                        self.assertEqual(path.read_bytes() if path.exists() else None, raw)
                        self.assertEqual(paths["codex" if provider == "claude" else "claude"].read_bytes(),
                                         valid["codex" if provider == "claude" else "claude"])
                        path.write_bytes(valid[provider])

    def test_rendered_provider_settings_validate_without_writes (self) -> None:
        paths = {}
        for provider in ("claude", "codex"):
            path = self.root / f"{provider}.json"
            path.write_text(json.dumps(render_config(provider)), encoding="utf-8")
            paths[provider] = path
            self.assertEqual(
                provider_health.validate_provider_settings(provider, path),
                (True, "configured"),
            )
        broken = self.root / "broken.json"
        broken.write_text("{}", encoding="utf-8")
        self.assertEqual(
            provider_health.validate_provider_settings("codex", broken),
            (False, "registration_incomplete"),
        )
        undecodable = self.root / "undecodable.json"
        undecodable.write_bytes(b"\xff")
        self.assertEqual(
            provider_health.validate_provider_settings("claude", undecodable),
            (False, "settings_invalid"),
        )

        lookalike = render_config("codex")
        for groups in lookalike["hooks"].values():
            for group in groups:
                for handler in group["hooks"]:
                    handler["command"] = handler["command"].replace(
                        "--provider codex", "--provider codexx",
                    )
        prefix = self.root / "prefix-lookalike.json"
        prefix.write_text(json.dumps(lookalike), encoding="utf-8")
        self.assertEqual(
            provider_health.validate_provider_settings("codex", prefix),
            (False, "registration_invalid"),
        )

        path_lookalike = render_config("codex")
        expected_hook = str(provider_health.HOOK_PATH)
        for groups in path_lookalike["hooks"].values():
            for group in groups:
                for handler in group["hooks"]:
                    self.assertIn(expected_hook, handler["command"])
                    handler["command"] = handler["command"].replace(
                        expected_hook, f"{expected_hook}.bak",
                    )
        fake_path = self.root / "path-lookalike.json"
        fake_path.write_text(json.dumps(path_lookalike), encoding="utf-8")
        self.assertEqual(
            provider_health.validate_provider_settings("codex", fake_path),
            (False, "registration_incomplete"),
        )

        extra_arguments = render_config("codex")
        for groups in extra_arguments["hooks"].values():
            for group in groups:
                for handler in group["hooks"]:
                    handler["command"] += " --unexpected value"
        extra_path = self.root / "extra-arguments.json"
        extra_path.write_text(json.dumps(extra_arguments), encoding="utf-8")
        self.assertEqual(
            provider_health.validate_provider_settings("codex", extra_path),
            (False, "registration_invalid"),
        )

        invalid_async = render_config("codex")
        invalid_async["hooks"]["SessionStart"][0]["hooks"][0]["async"] = "true"
        async_path = self.root / "invalid-async.json"
        async_path.write_text(json.dumps(invalid_async), encoding="utf-8")
        self.assertEqual(
            provider_health.validate_provider_settings("codex", async_path),
            (False, "registration_invalid"),
        )

    def test_resolved_plan_parser_warning_disappears_from_repos (self) -> None:
        self._sync_plan("BAD ID", seen_at="2026-09-07T01:00:00Z")
        warned = self.client.get("/api/repos").json()["data"][0]["warnings"]
        self.assertTrue(any(row.get("source") == "plan" for row in warned))
        self._sync_plan("backend-test", seen_at="2026-09-07T02:00:00Z")
        resolved = self.client.get("/api/repos").json()["data"][0]["warnings"]
        self.assertFalse(any(row.get("source") == "plan" for row in resolved))


if __name__ == "__main__":
    unittest.main()
