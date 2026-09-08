"""F.1 deterministic demo, isolation, and Mission contract tests."""

import asyncio
import io
import json
import os
import shutil
import sqlite3
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from Backend.app import config as config_module
from Backend.app import db, git_module
from Backend.app.api import routes
from Backend.app.config import ConfigAuthoringError, load_config
from Backend.app.watcher import Tracker
from Scripts import demo_bootstrap


def _close_db () -> None:
    connection = getattr(db._local, "conn", None)
    if connection is not None:
        connection.close()
        del db._local.conn


class DemoMissionTests(unittest.TestCase):
    def setUp (self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.workspace = Path(self.temp.name) / "workspace"
        self.runtime = self.workspace / "Demo" / "runtime"
        self.workspace.mkdir()
        with redirect_stdout(io.StringIO()):
            demo_bootstrap.main(self.runtime, self.workspace)

        self.environment = patch.dict(os.environ, {
            "KATLAB_TRACKER_DEMO": "1",
            "KATLAB_TRACKER_CONFIG": str(self.runtime / "repos.demo.yaml"),
            "KATLAB_TRACKER_DB": str(self.runtime / "demo.db"),
            "KATLAB_TRACKER_ACTIVITY_DIR": str(self.runtime / "activity"),
        })
        self.environment.start()
        with patch.object(config_module, "REPO_ROOT", self.workspace):
            self.config = load_config(self.runtime / "repos.demo.yaml")

        self.old_db_path, self.old_data_dir = db.DB_PATH, db.DATA_DIR
        _close_db()
        db.DB_PATH = self.runtime / "demo.db"
        db.DATA_DIR = self.runtime
        self.db_connection = sqlite3.connect(db.DB_PATH, check_same_thread=False)
        self.db_connection.row_factory = sqlite3.Row
        self.db_connection.execute("PRAGMA foreign_keys=ON")
        self.get_conn_patch = patch.object(
            db, "get_conn", return_value=self.db_connection,
        )
        self.get_conn_patch.start()
        self.tracker = Tracker(self.config)
        with patch.object(git_module, "repo_status",
                          side_effect=AssertionError("demo ran git status")) as status, \
             patch.object(git_module, "new_commits_since",
                          side_effect=AssertionError("demo scanned git history")) as commits, \
             patch.object(git_module, "commit_info",
                          side_effect=AssertionError("demo resolved git HEAD")) as head, \
             patch("Backend.app.watcher.PLAN_STABILITY_DELAY_SECONDS", 0):
            asyncio.run(self.tracker.startup())
        self.startup_git_calls = (status.call_count, commits.call_count, head.call_count)

        app = FastAPI()
        app.state.tracker = self.tracker
        app.include_router(routes.router)
        self.client = TestClient(app)

    def tearDown (self) -> None:
        self.client.close()
        self.db_connection.close()
        self.get_conn_patch.stop()
        db.DB_PATH, db.DATA_DIR = self.old_db_path, self.old_data_dir
        self.environment.stop()
        self.temp.cleanup()

    def test_all_states_and_empty_populated_shapes (self) -> None:
        mission = self.client.get("/api/mission").json()["data"]
        expected = {
            "Demo_NotConfigured": "not_configured",
            "Demo_Planning": "planning",
            "Demo_Implementation": "implementation",
            "Demo_Verification": "verification",
            "Demo_Blocked": "blocked",
            "Demo_Ready": "ready_to_commit",
            "Demo_Committed": "verified_committed",
        }
        plans = {row["repo"]: row for row in mission["plans"]}
        self.assertEqual({key: row["state"] for key, row in plans.items()}, expected)
        self.assertEqual(mission["summary"]["total"], 7)
        self.assertTrue(all(value == 1 for value in mission["summary"]["states"].values()))

        requirements = {
            repo: plans[repo]["requirements"][0] for repo in (
                "Demo_Planning", "Demo_Verification", "Demo_Blocked",
                "Demo_Ready", "Demo_Committed",
            )
        }
        self.assertEqual(requirements["Demo_Planning"]["state"], "stale")
        self.assertEqual(requirements["Demo_Blocked"]["state"], "failed")
        self.assertEqual(requirements["Demo_Ready"]["state"], "passed")
        self.assertEqual(requirements["Demo_Committed"]["state"], "passed")
        self.assertEqual(
            (requirements["Demo_Verification"]["state"],
             requirements["Demo_Verification"]["current"],
             requirements["Demo_Verification"]["target"]),
            ("partial", 2, 3),
        )

        review = self.client.get("/api/activity", params={
            "repo": "Demo_Verification", "check": "review:cft", "order": "asc",
        }).json()["data"]
        self.assertEqual(
            [row["outcome"] for row in review["items"]],
            ["clean", "clean", "finding", "clean", "clean"],
        )

        empty_mission = self.client.get(
            "/api/mission", params={"repo": "Demo_Empty"},
        ).json()["data"]
        self.assertEqual(empty_mission["summary"]["total"], 0)
        self.assertEqual(empty_mission["plans"], [])
        for endpoint in ("/api/activity", "/api/sessions"):
            empty = self.client.get(endpoint, params={"repo": "Demo_Empty"}).json()["data"]
            populated = self.client.get(endpoint, params={"repo": "Demo_Ready"}).json()["data"]
            self.assertEqual((empty["total"], empty["items"]), (0, []))
            self.assertGreater(populated["total"], 0)

    def test_composite_sessions_subagents_and_unassigned_evidence (self) -> None:
        sessions = self.client.get("/api/sessions", params={"order": "asc"}).json()["data"]
        identities = {
            (row["provider"], row["session_id"]) for row in sessions["items"]
        }
        self.assertIn(("claude", "shared-demo-session"), identities)
        self.assertIn(("codex", "shared-demo-session"), identities)

        for provider in ("claude", "codex"):
            activity = self.client.get("/api/activity", params={
                "provider": provider, "session": "shared-demo-session", "order": "asc",
            }).json()["data"]
            self.assertEqual(activity["total"], 5)
            self.assertEqual(
                [row["kind"] for row in activity["items"]],
                ["session_start", "agent_start", "tool_finished", "agent_stop", "session_end"],
            )
            self.assertTrue(any(row["parent_agent_id"] for row in activity["items"]))

        unassigned = self.client.get("/api/activity", params={
            "provider": "codex", "session": "unassigned-demo-session", "order": "asc",
        }).json()["data"]
        self.assertEqual(unassigned["total"], 2)
        self.assertEqual(
            [row["kind"] for row in unassigned["items"]],
            ["check_started", "check_finished"],
        )
        self.assertTrue(all(
            row["effective_assignment"]["mode"] == "UNASSIGNED"
            and row["repo_ids"] == ["Demo_Blocked", "Demo_Verification"]
            for row in unassigned["items"]
        ))

    def test_demo_gate_relative_paths_and_private_content_boundary (self) -> None:
        config_text = (self.runtime / "repos.demo.yaml").read_text(encoding="utf-8")
        self.assertNotIn(str(self.workspace.resolve()), config_text)
        self.assertTrue(all(repo.path.is_absolute() for repo in self.config.repos))
        self.assertTrue(all(not repo.offline for repo in self.config.repos))

        with patch.dict(os.environ, {"KATLAB_TRACKER_DEMO": ""}), \
             patch.object(config_module, "REPO_ROOT", self.workspace):
            with self.assertRaises(ConfigAuthoringError):
                load_config(self.runtime / "repos.demo.yaml")

        marker = self.runtime / "repos" / "not-configured" / ".git"
        shutil.rmtree(marker)
        with patch.object(config_module, "REPO_ROOT", self.workspace):
            with self.assertRaises(ConfigAuthoringError):
                load_config(self.runtime / "repos.demo.yaml")

        forbidden = (
            str(self.workspace.resolve()), "C:\\Users\\", "/Users/",
            "BEGIN PRIVATE KEY", '"api_key"', "sk-",
        )
        for path in self.runtime.rglob("*"):
            if path.is_file() and path.suffix.lower() in {".yaml", ".json", ".jsonl", ".txt", ".py"}:
                text = path.read_text(encoding="utf-8")
                self.assertFalse(any(value in text for value in forbidden), path)

    def test_no_git_probe_watcher_diff_or_chronicle_process (self) -> None:
        self.assertEqual(self.startup_git_calls, (0, 0, 0))
        # Eight repository watchers plus the central activity watcher and poll loop.
        self.assertEqual(len(self.tracker._tasks), len(self.config.repos) + 2)
        repo = self.config.repos[0]
        with patch.object(git_module, "repo_status") as status, \
             patch.object(git_module, "new_commits_since") as commits, \
             patch.object(git_module, "commit_info") as head:
            self.tracker._refresh_status(repo)
            self.assertTrue(self.tracker._catch_up_commits(repo))
            self.assertEqual(self.tracker._sweep(repo, commit_scan_ok=True), 0)
            self.assertTrue(asyncio.run(self.tracker._detect_commits(repo)))
            asyncio.run(self.tracker._watch_git(repo))
            status.assert_not_called()
            commits.assert_not_called()
            head.assert_not_called()

        with patch.object(git_module, "file_diff",
                          side_effect=AssertionError("demo diff ran git")) as diff:
            response = self.client.get("/api/diff", params={
                "repo": repo.id, "file": "synthetic.txt",
            })
        self.assertEqual(response.status_code, 200)
        self.assertIn("intentionally disabled", response.json()["data"]["diff"])
        diff.assert_not_called()

        from Backend.app import main as main_module
        with patch.object(main_module.subprocess, "run") as run, \
             patch.object(main_module.subprocess, "Popen") as popen:
            self.assertEqual(main_module.spawn_chronicle_loop(), (None, None))
            run.assert_not_called()
            popen.assert_not_called()

    def test_reset_and_restart_are_reproducible (self) -> None:
        workspace = Path(self.temp.name) / "restart-workspace"
        runtime = workspace / "Demo" / "runtime"
        workspace.mkdir()

        def counts () -> tuple[int, ...]:
            connection = sqlite3.connect(runtime / "demo.db")
            try:
                return tuple(connection.execute(
                    f"SELECT COUNT(*) FROM {table}",
                ).fetchone()[0] for table in (
                    "repos", "plan_snapshots", "events", "activity_events", "commits",
                ))
            finally:
                connection.close()

        # The bootstrap must exercise its own database connector, not the API
        # fixture connection installed by setUp.
        self.get_conn_patch.stop()
        try:
            with redirect_stdout(io.StringIO()):
                demo_bootstrap.main(runtime, workspace)
            config_first = (runtime / "repos.demo.yaml").read_bytes()
            checks_first = (runtime / "checks.json").read_bytes()
            counts_first = counts()
            (runtime / "stale-from-prior-run.txt").write_text(
                "remove me", encoding="utf-8",
            )

            with redirect_stdout(io.StringIO()):
                demo_bootstrap.main(runtime, workspace)
            self.assertFalse((runtime / "stale-from-prior-run.txt").exists())
            self.assertEqual((runtime / "repos.demo.yaml").read_bytes(), config_first)
            self.assertEqual((runtime / "checks.json").read_bytes(), checks_first)
            self.assertEqual(counts(), counts_first)
        finally:
            self.get_conn_patch.start()


if __name__ == "__main__":
    unittest.main()
