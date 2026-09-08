"""Focused stdlib tests for v0.3 plan requirements and durable snapshots."""

import sqlite3
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from Backend.app import db
from Backend.app.config import AppConfig, RepoConfig, ServerConfig
from Backend.app.plan_parser import (
    ParseResult,
    ParsedRequirement,
    ParsedTask,
    PlanReadError,
    acquire_stable_plan_bytes,
    parse_plan_bytes,
    parse_plan_text,
    raw_plan_sha256,
)
from Backend.app.watcher import Tracker


TASK = """<task id=\"A.1\">
<title>Unicode café</title>
<status>in-progress</status>
<files>
Backend/**/*.py
</files>
<why>Exercise the parser.</why>
</task>
"""


class TemporaryDatabase(unittest.TestCase):
    def setUp (self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.old_db_path = db.DB_PATH
        self.old_data_dir = db.DATA_DIR
        self._close_db()
        db.DB_PATH = self.root / "tracking.db"
        db.DATA_DIR = self.root
        self.repo = SimpleNamespace(id="Repo_A", name="Repo A", path=self.root / "repo")
        self.repo.path.mkdir()
        (self.repo.path / ".git").mkdir()
        db.init_db([self.repo])

    def tearDown (self) -> None:
        self._close_db()
        db.DB_PATH = self.old_db_path
        db.DATA_DIR = self.old_data_dir
        self.temp.cleanup()

    @staticmethod
    def _close_db () -> None:
        conn = getattr(db._local, "conn", None)
        if conn is not None:
            conn.close()
            del db._local.conn


class PlanParserTests(unittest.TestCase):
    def test_valid_crlf_bom_unicode_and_fixed_result_shape (self) -> None:
        text = (TASK + "<verification>\nreview:cdd@5\nbackend-compile\n</verification>\n")
        raw = b"\xef\xbb\xbf" + text.replace("\n", "\r\n").encode("utf-8")
        result = parse_plan_bytes(raw, "synthetic")
        self.assertFalse(result.fatal)
        self.assertEqual([task.title for task in result.tasks], ["Unicode café"])
        self.assertEqual(
            [(req.id, req.streak_target) for req in result.requirements],
            [("review:cdd", 5), ("backend-compile", None)],
        )
        self.assertEqual(result.warnings, [])
        self.assertEqual(result.warning_codes, [])

    def test_legacy_and_valid_zero_task_plans_remain_explicitly_parseable (self) -> None:
        legacy = parse_plan_text("OLD PLAN\n[ ] A.1 prose only\n")
        zero = parse_plan_text("<verification>\nreview:cft\n</verification>\n")
        self.assertEqual((legacy.tasks, legacy.requirements, legacy.warnings), ([], [], []))
        self.assertEqual(zero.tasks, [])
        self.assertEqual([(r.id, r.streak_target) for r in zero.requirements],
                         [("review:cft", 1)])

    def test_first_valid_requirement_wins_and_invalid_lines_do_not_override (self) -> None:
        result = parse_plan_text("""<verification>
backend-build@2
review:cdd@0
review:cdd@3
review:cdd@5
Bad_Id
too many words
</verification>
""")
        self.assertEqual([(r.id, r.streak_target) for r in result.requirements],
                         [("review:cdd", 3)])
        self.assertEqual(result.warning_codes, [
            "VERIFICATION_STREAK_NON_REVIEW",
            "VERIFICATION_STREAK_RANGE",
            "VERIFICATION_DUPLICATE_ID",
            "VERIFICATION_INVALID_ID",
            "VERIFICATION_MALFORMED_LINE",
        ])

    def test_nested_block_is_ignored_and_later_valid_block_is_used (self) -> None:
        result = parse_plan_text("""<verification>
review:cdd@2
<verification>
review:cft@2
</verification>
</verification>
<verification>
frontend-build
</verification>
""")
        self.assertEqual([(r.id, r.streak_target) for r in result.requirements],
                         [("frontend-build", None)])
        self.assertIn("VERIFICATION_NESTED", result.warning_codes)
        self.assertIn("VERIFICATION_STRAY_CLOSE", result.warning_codes)

    def test_task_nested_block_is_ignored_and_later_top_level_block_is_used (self) -> None:
        result = parse_plan_text("""<task id="A.1">
<title>Nested</title>
<status>done</status>
<why>
<verification>
backend-build
</verification>
</why>
</task>
<verification>
frontend-build
</verification>
""")
        self.assertEqual([(r.id, r.streak_target) for r in result.requirements],
                         [("frontend-build", None)])
        self.assertEqual(result.warning_codes, ["VERIFICATION_NESTED"])

    def test_invalid_utf8_is_fatal (self) -> None:
        result = parse_plan_bytes(b"\xff\xfe\x00", "synthetic")
        self.assertTrue(result.fatal)
        self.assertEqual(result.warning_codes, ["PLAN_NOT_UTF8"])

    def test_stable_acquisition_rejects_truncate_write_change (self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "PLAN.txt"
            path.write_bytes(b"first")

            def mutate (_delay: float) -> None:
                path.write_bytes(b"second")

            with self.assertRaises(PlanReadError):
                acquire_stable_plan_bytes(path, sleeper=mutate)

    def test_stable_acquisition_accepts_unchanged_exact_bytes (self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "PLAN.txt"
            expected = "same Ω\n".encode("utf-8")
            path.write_bytes(expected)
            self.assertEqual(
                acquire_stable_plan_bytes(path, delay_seconds=0, sleeper=lambda _: None),
                expected,
            )


class PlanSnapshotTests(TemporaryDatabase):
    def _sync (self, raw: bytes, result: ParseResult, observed: str) -> None:
        db.sync_plan_snapshot(
            "Repo_A", "temp/Plan/PLAN_Synthetic.txt", raw_plan_sha256(raw),
            result, observed,
        )

    def test_unchanged_restart_keeps_revision_and_refreshes_last_seen (self) -> None:
        raw = (TASK + "<verification>\nreview:cdd@2\n</verification>\n").encode()
        result = parse_plan_bytes(raw)
        self._sync(raw, result, "2026-01-01T00:00:00Z")
        self._sync(raw, result, "2026-01-02T00:00:00Z")
        row = db.get_plan_snapshots("Repo_A")[0]
        self.assertEqual(row["revision_at"], "2026-01-01T00:00:00Z")
        self.assertEqual(row["last_seen_at"], "2026-01-02T00:00:00Z")

    def test_content_edit_advances_revision_and_replaces_rows_atomically (self) -> None:
        first = (TASK + "<verification>\nreview:cdd@2\n</verification>\n").encode()
        second = (TASK.replace("in-progress", "done") +
                  "<verification>\nreview:cft@3\n</verification>\n").encode()
        self._sync(first, parse_plan_bytes(first), "2026-01-01T00:00:00Z")
        self._sync(second, parse_plan_bytes(second), "2026-01-02T00:00:00Z")
        snapshot = db.get_plan_snapshots("Repo_A")[0]
        self.assertEqual(snapshot["revision_at"], "2026-01-02T00:00:00Z")
        self.assertEqual(db.get_tasks("Repo_A")[0]["status"], "done")
        self.assertEqual(db.get_plan_requirements("Repo_A")[0]["check_id"], "review:cft")

    def test_fatal_snapshot_preserves_last_valid_tasks_and_requirements (self) -> None:
        valid = (TASK + "<verification>\nreview:cdd@2\n</verification>\n").encode()
        self._sync(valid, parse_plan_bytes(valid), "2026-01-01T00:00:00Z")
        invalid = b"\xff\xfe"
        self._sync(invalid, parse_plan_bytes(invalid), "2026-01-02T00:00:00Z")
        snapshot = db.get_plan_snapshots("Repo_A")[0]
        self.assertEqual(snapshot["parse_state"], "fatal")
        self.assertEqual(len(db.get_tasks("Repo_A")), 1)
        self.assertEqual(len(db.get_plan_requirements("Repo_A")), 1)

    def test_database_failure_rolls_back_snapshot_tasks_and_requirements (self) -> None:
        valid = (TASK + "<verification>\nreview:cdd@2\n</verification>\n").encode()
        self._sync(valid, parse_plan_bytes(valid), "2026-01-01T00:00:00Z")
        broken = ParseResult(
            tasks=[
                ParsedTask("X", "one", "done"),
                ParsedTask("X", "two", "done"),
            ],
            requirements=[ParsedRequirement("review:cft", 2)],
        )
        with self.assertRaises(sqlite3.IntegrityError):
            self._sync(b"different", broken, "2026-01-02T00:00:00Z")
        snapshot = db.get_plan_snapshots("Repo_A")[0]
        self.assertEqual(snapshot["content_sha256"], raw_plan_sha256(valid))
        self.assertEqual(db.get_tasks("Repo_A")[0]["task_id"], "A.1")
        self.assertEqual(db.get_plan_requirements("Repo_A")[0]["check_id"], "review:cdd")

    def test_zero_task_zero_requirement_snapshot_is_stored (self) -> None:
        raw = b"legacy prose only\n"
        self._sync(raw, parse_plan_bytes(raw), "2026-01-01T00:00:00Z")
        self.assertEqual(len(db.get_plan_snapshots("Repo_A")), 1)
        self.assertEqual(db.get_tasks("Repo_A"), [])
        self.assertEqual(db.get_plan_requirements("Repo_A"), [])

    def test_confirmed_missed_delete_removes_all_plan_state (self) -> None:
        plan_dir = self.repo.path / "temp" / "Plan"
        plan_dir.mkdir(parents=True)
        plan = plan_dir / "PLAN_Synthetic.txt"
        plan.write_text(TASK, encoding="utf-8")
        cfg_repo = RepoConfig("Repo_A", "Repo A", self.repo.path)
        tracker = Tracker(AppConfig(ServerConfig(), [cfg_repo]))
        with patch("Backend.app.watcher.PLAN_STABILITY_DELAY_SECONDS", 0):
            self.assertTrue(tracker._parse_all_plans(cfg_repo))
            plan.unlink()
            self.assertTrue(tracker._parse_all_plans(cfg_repo))
        self.assertEqual(db.get_plan_snapshots("Repo_A"), [])
        self.assertEqual(db.get_tasks("Repo_A"), [])

    def test_atomic_replace_manifest_gap_preserves_snapshot (self) -> None:
        raw = TASK.encode()
        self._sync(raw, parse_plan_bytes(raw), "2026-01-01T00:00:00Z")
        plan = self.repo.path / "temp" / "Plan" / "PLAN_Synthetic.txt"
        cfg_repo = RepoConfig("Repo_A", "Repo A", self.repo.path)
        tracker = Tracker(AppConfig(ServerConfig(), [cfg_repo]))
        with patch.object(tracker, "_plan_files", side_effect=[[], [plan]]), \
             patch("Backend.app.watcher.PLAN_STABILITY_DELAY_SECONDS", 0):
            self.assertFalse(tracker._parse_all_plans(cfg_repo))
        self.assertEqual(len(db.get_plan_snapshots("Repo_A")), 1)

    def test_failed_plan_reconciliation_gets_one_bounded_retry (self) -> None:
        cfg_repo = RepoConfig("Repo_A", "Repo A", self.repo.path)
        tracker = Tracker(AppConfig(ServerConfig(), [cfg_repo]))
        with patch.object(
                tracker, "_parse_all_plans", side_effect=[False, True]) as reconcile, \
             patch("Backend.app.watcher.time.sleep") as sleeper:
            self.assertTrue(tracker._parse_all_plans_with_retry(cfg_repo))
        self.assertEqual(reconcile.call_count, 2)
        sleeper.assert_called_once_with(0.05)


class ExistingDatabaseMigrationTests(unittest.TestCase):
    def test_v0212_database_opens_and_gains_plan_tables (self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            path = root / "old.db"
            conn = sqlite3.connect(path)
            conn.executescript("""
                CREATE TABLE repos (id TEXT PRIMARY KEY, name TEXT NOT NULL, path TEXT NOT NULL);
                CREATE TABLE tasks (repo_id TEXT, plan_file TEXT, task_id TEXT, title TEXT,
                    status TEXT, files_json TEXT, why TEXT,
                    PRIMARY KEY (repo_id, plan_file, task_id));
                CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT);
                CREATE TABLE commits (repo_id TEXT, hash TEXT,
                    PRIMARY KEY (repo_id, hash));
                CREATE TABLE ingest_state (repo_id TEXT PRIMARY KEY, events_offset INTEGER);
            """)
            conn.close()
            old_path, old_dir = db.DB_PATH, db.DATA_DIR
            db.DB_PATH, db.DATA_DIR = path, root
            TemporaryDatabase._close_db()
            try:
                repo_path = root / "repo"
                repo_path.mkdir()
                db.init_db([SimpleNamespace(id="Repo_A", name="Repo A", path=repo_path)])
                tables = {
                    row["name"] for row in db.get_conn().execute(
                        "SELECT name FROM sqlite_master WHERE type = 'table'"
                    )
                }
                self.assertIn("plan_snapshots", tables)
                self.assertIn("plan_requirements", tables)
                event_columns = {
                    row["name"] for row in db.get_conn().execute("PRAGMA table_info(events)")
                }
                self.assertTrue({"session_id", "branch"}.issubset(event_columns))
            finally:
                TemporaryDatabase._close_db()
                db.DB_PATH, db.DATA_DIR = old_path, old_dir


if __name__ == "__main__":
    unittest.main()
