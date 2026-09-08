"""Focused tests for atomic central activity ingestion and legacy correlation."""

import json
import sqlite3
import tempfile
import unittest
import uuid
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from Backend.app import activity, db
from Backend.app.activity import ActivityConfigurationError, ActivityIngestor
from Backend.app.config import (
    AppConfig,
    ConfigAuthoringError,
    RepoConfig,
    ServerConfig,
    load_check_registry,
    load_config,
)
from Backend.app.plan_parser import parse_plan_bytes, raw_plan_sha256
from Backend.app.resolver import glob_to_regex
from Backend.app.watcher import Tracker


TS = "2026-09-07T00:00:00Z"


def _close_db () -> None:
    connection = getattr(db._local, "conn", None)
    if connection is not None:
        connection.close()
        del db._local.conn


class ActivityIngestTests(unittest.TestCase):
    def setUp (self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.repo_a = self.root / "Repo A"
        self.repo_b = self.root / "Repo B"
        for repo in (self.repo_a, self.repo_b):
            (repo / ".git").mkdir(parents=True)
            (repo / ".git" / "HEAD").write_text(
                "ref: refs/heads/synthetic\n", encoding="utf-8",
            )
        self.repos = [
            RepoConfig("Repo_A", "Repo A", self.repo_a),
            RepoConfig("Repo_B", "Repo B", self.repo_b),
        ]
        self.runtime = self.root / "runtime"
        self.config = AppConfig(ServerConfig(), self.repos, self.runtime)

        self.old_db_path, self.old_data_dir = db.DB_PATH, db.DATA_DIR
        _close_db()
        db.DB_PATH = self.root / "tracking.db"
        db.DATA_DIR = self.root
        db.init_db(self.repos)
        self.ingestor = ActivityIngestor(self.config)
        self.ingestor.initialize()

    def tearDown (self) -> None:
        _close_db()
        db.DB_PATH, db.DATA_DIR = self.old_db_path, self.old_data_dir
        self.temp.cleanup()

    def record (self, *, uid: str | None = None, kind: str = "tool_finished",
                repo_ids: list[str] | None = None,
                session_id: str = "session-synthetic", **extra) -> dict:
        value = {
            "schema_version": 1,
            "uid": uid or str(uuid.uuid4()),
            "provider": "codex",
            "evidence_source": "hook",
            "kind": kind,
            "ts": TS,
            "delivery_class": "best_effort",
            "repo_ids": ["Repo_A"] if repo_ids is None else repo_ids,
            "session_id": session_id,
        }
        if kind == "tool_finished":
            value.update({"tool_name": "apply_patch", "outcome": "unknown"})
        value.update(extra)
        return value

    def write_final (self, value: object, filename: str | None = None) -> Path:
        name = filename or f"{value['uid']}.json"
        path = self.ingestor.inbox / name
        path.write_bytes(json.dumps(
            value, sort_keys=True, separators=(",", ":"),
        ).encode("utf-8"))
        return path

    def rows (self) -> list[sqlite3.Row]:
        return db.get_activity_events()

    def test_insert_exact_duplicate_and_normalized_links_are_idempotent (self) -> None:
        value = self.record(repo_ids=["Repo_B", "Repo_A"])
        path = self.write_final(value)
        first = self.ingestor.ingest_batch()
        self.assertEqual((first.inserted, first.duplicates), (1, 0))
        self.assertFalse(path.exists())
        row = self.rows()[0]
        self.assertEqual(row["record_sha256"], activity.validate_activity(
            json.dumps(value, sort_keys=True, separators=(",", ":")).encode(),
            value["uid"], {"Repo_A", "Repo_B"},
        ).record_sha256)
        self.assertEqual(
            [link["repo_id"] for link in db.get_activity_links(row["id"])],
            ["Repo_A", "Repo_B"],
        )
        columns = {item["name"] for item in db.get_conn().execute(
            "PRAGMA table_info(activity_events)"
        )}
        self.assertNotIn("repo_ids", columns)

        self.write_final(value)
        second = ActivityIngestor(self.config).ingest_batch()
        self.assertEqual((second.inserted, second.duplicates), (0, 1))
        self.assertEqual(len(self.rows()), 1)

    def test_timestamp_precision_is_normalized_before_lexical_ordering (self) -> None:
        early = self.record(
            uid="00000000-0000-4000-8000-000000000001",
            ts="2026-09-07T00:00:00Z",
        )
        later = self.record(
            uid="00000000-0000-4000-8000-000000000002",
            ts="2026-09-07T00:00:00.1Z",
        )
        self.write_final(early)
        self.write_final(later)
        self.assertEqual(self.ingestor.ingest_batch().inserted, 2)
        rows, _ = db.get_activity_page(order="asc")
        self.assertEqual([row[0]["ts"] for row in rows], [
            "2026-09-07T00:00:00.000000Z",
            "2026-09-07T00:00:00.100000Z",
        ])

    def test_crash_after_insert_replays_as_exact_duplicate (self) -> None:
        value = self.record()
        path = self.write_final(value)
        with patch.object(self.ingestor, "_remove", return_value=False):
            first = self.ingestor.ingest_batch()
        self.assertEqual(first.inserted, 1)
        self.assertTrue(path.exists())

        restarted = ActivityIngestor(self.config)
        restarted.initialize()
        second = restarted.ingest_batch()
        self.assertEqual((second.inserted, second.duplicates), (0, 1))
        self.assertFalse(path.exists())
        self.assertEqual(len(self.rows()), 1)

    def test_committed_manual_retry_does_not_depend_on_current_plan (self) -> None:
        plan_file = "temp/Plan/PLAN_Synthetic.txt"
        raw_plan = b"<verification>\nreview:cdd\n</verification>\n"
        db.sync_plan_snapshot(
            "Repo_A", plan_file, raw_plan_sha256(raw_plan),
            parse_plan_bytes(raw_plan), TS,
        )
        value = {
            "schema_version": 1,
            "uid": str(uuid.uuid4()),
            "provider": "manual",
            "evidence_source": "manual",
            "kind": "review_result",
            "ts": "2026-09-07T00:01:00Z",
            "delivery_class": "durable",
            "repo_ids": ["Repo_A"],
            "plan_repo_id": "Repo_A",
            "plan_file": plan_file,
            "check_id": "review:cdd",
            "outcome": "clean",
        }
        path = self.write_final(value)
        with patch.object(self.ingestor, "_remove", return_value=False):
            first = self.ingestor.ingest_batch()
        self.assertEqual(first.inserted, 1)
        self.assertTrue(path.exists())

        db.delete_plan_state("Repo_A", plan_file)
        restarted = ActivityIngestor(self.config)
        restarted.initialize()
        second = restarted.ingest_batch()
        self.assertEqual((second.inserted, second.duplicates, second.rejected), (0, 1, 0))
        self.assertFalse(path.exists())
        self.assertEqual(len(self.rows()), 1)

    def test_committed_zero_link_retry_precedes_current_session_admission (self) -> None:
        self.write_final(self.record())
        self.assertEqual(self.ingestor.ingest_batch().inserted, 1)
        zero = self.record(
            uid="10000000-0000-4000-8000-000000000009",
            kind="session_end", repo_ids=[],
        )
        path = self.write_final(zero)
        with patch.object(self.ingestor, "_remove", return_value=False):
            first = self.ingestor.ingest_batch()
        self.assertEqual(first.inserted, 1)
        self.assertTrue(path.exists())

        reduced_config = AppConfig(
            ServerConfig(), [self.repos[1]], self.runtime,
        )
        restarted = ActivityIngestor(reduced_config)
        restarted.initialize()
        second = restarted.ingest_batch()
        self.assertEqual(
            (second.inserted, second.duplicates, second.ignored_unscoped),
            (0, 1, 0),
        )
        self.assertFalse(path.exists())
        self.assertEqual(len(self.rows()), 2)

    def test_same_batch_and_prior_session_admission_are_provider_scoped (self) -> None:
        zero = self.record(
            uid="10000000-0000-4000-8000-000000000001",
            kind="session_end", repo_ids=[],
        )
        direct = self.record(
            uid="f0000000-0000-4000-8000-000000000002",
            kind="agent_start", repo_ids=["Repo_A"],
        )
        self.write_final(zero)
        self.write_final(direct)
        result = self.ingestor.ingest_batch()
        self.assertEqual(result.inserted, 2)
        self.assertEqual(result.affected_repo_ids, {"Repo_A"})
        self.assertEqual(len(self.rows()), 2)
        zero_row = next(row for row in self.rows() if row["kind"] == "session_end")
        self.assertEqual(db.get_activity_links(zero_row["id"]), [])

        prior = self.record(kind="turn_stop", repo_ids=[])
        self.write_final(prior)
        self.assertEqual(self.ingestor.ingest_batch().inserted, 1)

        unrelated = self.record(
            kind="session_end", repo_ids=[], session_id="session-unrelated",
        )
        unrelated_path = self.write_final(unrelated)
        ignored = self.ingestor.ingest_batch()
        self.assertEqual(ignored.ignored_unscoped, 1)
        self.assertFalse(unrelated_path.exists())
        self.assertEqual(self.ingestor.health_counts()["ignored_unscoped"], 1)
        self.assertEqual(len(self.rows()), 3)

    def test_stale_link_to_removed_repo_does_not_admit_session (self) -> None:
        direct = self.record(repo_ids=["Repo_A"])
        self.write_final(direct)
        self.assertEqual(self.ingestor.ingest_batch().inserted, 1)

        current = AppConfig(ServerConfig(), [self.repos[1]], self.runtime)
        current_ingestor = ActivityIngestor(current)
        zero = self.record(kind="session_end", repo_ids=[])
        self.write_final(zero)
        result = current_ingestor.ingest_batch()
        self.assertEqual((result.inserted, result.ignored_unscoped), (0, 1))
        self.assertEqual(len(self.rows()), 1)

    def test_malformed_oversized_mismatch_and_partial_files_are_safe (self) -> None:
        secret = "SENTINEL_SECRET_MUST_NOT_PERSIST"
        malformed = self.ingestor.inbox / f"{secret}.json"
        malformed.write_bytes(("{" + secret).encode())

        oversized = self.ingestor.inbox / "20000000-0000-4000-8000-000000000002.json"
        oversized.write_bytes(b"x" * (activity.MAX_ACTIVITY_BYTES + 1))

        mismatch = self.record(uid="30000000-0000-4000-8000-000000000003")
        self.write_final(
            mismatch, "40000000-0000-4000-8000-000000000004.json",
        )
        partial = self.ingestor.inbox / ".katlab-partial.tmp"
        partial.write_text(secret, encoding="utf-8")
        unknown = self.ingestor.inbox / "ignored.bin"
        unknown.write_text(secret, encoding="utf-8")

        result = self.ingestor.ingest_batch()
        self.assertEqual(result.rejected, 3)
        self.assertEqual(len(self.rows()), 0)
        self.assertTrue(partial.exists())
        self.assertTrue(unknown.exists())
        receipts = sorted(self.ingestor.rejected.glob("*.json"))
        self.assertEqual(len(receipts), 3)
        for receipt in receipts:
            value = json.loads(receipt.read_text(encoding="utf-8"))
            self.assertEqual(set(value), {
                "byte_count", "observed_at", "reason_code", "rejection_id",
                "sample_sha256",
            })
            self.assertNotIn(secret, receipt.name)
            self.assertNotIn(secret, json.dumps(value))
        self.assertNotIn(secret.encode(), db.DB_PATH.read_bytes())

    def test_uid_conflict_receipt_survives_crash_before_raw_delete (self) -> None:
        uid = "50000000-0000-4000-8000-000000000005"
        original = self.record(uid=uid, tool_name="original")
        self.write_final(original)
        self.ingestor.ingest_batch()

        conflict = self.record(uid=uid, tool_name="changed")
        raw_path = self.write_final(conflict)
        with patch.object(self.ingestor, "_remove", return_value=False):
            first = self.ingestor.ingest_batch()
        self.assertEqual(first.rejected, 0)
        self.assertTrue(raw_path.exists())
        receipts = list(self.ingestor.rejected.glob("*.json"))
        self.assertEqual(len(receipts), 1)
        observed = receipts[0].read_bytes()

        second = self.ingestor.ingest_batch()
        self.assertEqual(second.rejected, 1)
        self.assertFalse(raw_path.exists())
        self.assertEqual(receipts[0].read_bytes(), observed)
        self.assertEqual(len(self.rows()), 1)
        self.assertEqual(self.rows()[0]["tool_name"], "original")

    def test_replacement_after_acquisition_uses_exact_buffer_and_is_not_deleted (self) -> None:
        uid = "60000000-0000-4000-8000-000000000006"
        original = self.record(uid=uid, tool_name="Alpha")
        replacement = self.record(uid=uid, tool_name="Bravo")
        path = self.write_final(original)
        real_validate = activity.validate_activity

        def replace_after_read (raw: bytes, stem: str, repo_ids: set[str]):
            path.write_bytes(json.dumps(
                replacement, sort_keys=True, separators=(",", ":"),
            ).encode())
            return real_validate(raw, stem, repo_ids)

        with patch("Backend.app.activity.validate_activity", side_effect=replace_after_read):
            result = self.ingestor.ingest_batch()
        self.assertEqual(result.inserted, 1)
        self.assertEqual(self.rows()[0]["tool_name"], "Alpha")
        self.assertTrue(path.exists())

        conflict = self.ingestor.ingest_batch()
        self.assertEqual(conflict.rejected, 1)
        self.assertFalse(path.exists())

    def test_transient_identity_change_and_restart_recovery_leave_no_loss (self) -> None:
        value = self.record()
        path = self.write_final(value)
        with patch("Backend.app.activity._identity", side_effect=[
                (1, 1, 1, 1), (1, 1, 1, 2)]):
            result = self.ingestor.ingest_batch()
        self.assertEqual(result.inserted, 0)
        self.assertTrue(path.exists())

        restarted = ActivityIngestor(self.config)
        restarted.initialize()
        self.assertEqual(restarted.ingest_batch().inserted, 1)
        self.assertFalse(path.exists())

    def test_runtime_root_cannot_overlap_a_monitored_repository (self) -> None:
        bad = AppConfig(ServerConfig(), self.repos, self.repo_a / "data")
        with self.assertRaises(ActivityConfigurationError):
            ActivityIngestor(bad)
        inverse = AppConfig(ServerConfig(), self.repos, self.root)
        with self.assertRaises(ActivityConfigurationError):
            ActivityIngestor(inverse)

    def test_config_rejects_unproved_repo_paths_and_plan_globs (self) -> None:
        (self.root / "checks.json").write_text(
            '{"schema_version":1,"checks":[]}\n', encoding="utf-8",
        )
        config_path = self.root / "repos.yaml"
        invalid_entries = (
            "  - id: Missing_Path\n",
            f"  - id: true\n    path: '{self.repo_a}'\n",
            f"  - id: null\n    path: '{self.repo_a}'\n",
            f"  - id: 0x10\n    path: '{self.repo_a}'\n",
            f"  - id: ' Repo_A '\n    path: '{self.repo_a}'\n",
            "  - id: Relative_Path\n    path: 'relative/repo'\n",
            f"  - id: Scalar_Glob\n    path: '{self.repo_a}'\n"
            "    plan_globs: temp/Plan/PLAN_*.txt\n",
            f"  - id: Escaping_Glob\n    path: '{self.repo_a}'\n"
            "    plan_globs:\n      - '../PLAN_*.txt'\n",
            f"  - id: Nested_Entry\n    path: '{self.repo_a}'\n"
            "    ignored:\n"
            "      - id: Hidden_Repo\n"
            f"        path: '{self.repo_b}'\n",
        )
        for entry in invalid_entries:
            with self.subTest(entry=entry):
                config_path.write_text("repos:\n" + entry, encoding="utf-8")
                with self.assertRaises(ConfigAuthoringError):
                    load_config(config_path)

        for value in ("true", "1", "{}", "Repo_A"):
            with self.subTest(repos=value):
                config_path.write_text(f"repos: {value}\n", encoding="utf-8")
                with self.assertRaises(ConfigAuthoringError):
                    load_config(config_path)

        duplicate_configs = (
            "repos:\n"
            f"  - id: Repo_A\n    path: '{self.repo_a}'\n"
            "repos: # duplicate\n"
            f"  - id: Repo_B\n    path: '{self.repo_b}'\n",
            "repos:\n"
            f"  - id: Repo_A\n    path: '{self.repo_a}'\n"
            f"    path: '{self.repo_b}'\n",
            "unknown_root: true\nrepos: []\n",
        )
        for content in duplicate_configs:
            with self.subTest(content=content):
                config_path.write_text(content, encoding="utf-8")
                with self.assertRaises(ConfigAuthoringError):
                    load_config(config_path)

    def test_config_read_failures_use_the_authoring_error_boundary (self) -> None:
        config_path = self.root / "repos.yaml"
        with patch.object(Path, "read_text", side_effect=PermissionError("synthetic")):
            with self.assertRaises(ConfigAuthoringError):
                load_config(config_path)
            with self.assertRaises(ConfigAuthoringError):
                load_check_registry(self.root / "checks.json", set())

    def test_config_rejects_invalid_server_settings (self) -> None:
        (self.root / "checks.json").write_text(
            '{"schema_version":1,"checks":[]}\n', encoding="utf-8",
        )
        config_path = self.root / "repos.yaml"
        invalid_servers = (
            "server: []\n",
            "server:\n  unknown: true\n",
            "server:\n  host: 123\n",
            "server:\n  host: ' 127.0.0.1'\n",
            "server:\n  port: '8100'\n",
            "server:\n  port: true\n",
            "server:\n  port: 65536\n",
            "server:\n  status_poll_seconds: false\n",
            "server:\n  status_poll_seconds: 4\n",
            "server:\n  status_poll_seconds: 86401\n",
        )
        for value in invalid_servers:
            with self.subTest(value=value):
                config_path.write_text(value + "repos: []\n", encoding="utf-8")
                with self.assertRaises(ConfigAuthoringError):
                    load_config(config_path)

        config_path.write_text(
            "server:\n  host: 0.0.0.0\n  port: 65535\n"
            "  status_poll_seconds: 5\nrepos: []\n",
            encoding="utf-8",
        )
        loaded = load_config(config_path)
        self.assertEqual(loaded.server, ServerConfig("0.0.0.0", 65535, 5))

    def test_deferred_invalid_final_does_not_starve_later_batches (self) -> None:
        blocked = self.ingestor.inbox / "00000000-0000-4000-8000-000000000000.json"
        blocked.write_bytes(b"not-json")
        self.ingestor.rejected.mkdir(parents=True, exist_ok=True)
        rejection_id, _ = activity._receipt_material(
            "INVALID_JSON", len(b"not-json"), b"not-json", blocked.name,
        )
        (self.ingestor.rejected / f"{rejection_id}.json").write_bytes(b"corrupt")
        valid = self.record(uid="70000000-0000-4000-8000-000000000007")
        valid_path = self.write_final(valid)

        first = self.ingestor.ingest_batch(limit=1)
        self.assertEqual(first.inserted, 0)
        self.assertTrue(blocked.exists())
        second = self.ingestor.ingest_batch(limit=1)
        self.assertEqual(second.inserted, 1)
        self.assertFalse(valid_path.exists())

    def test_new_and_legacy_file_events_gain_normalized_task_keys (self) -> None:
        conn = db.get_conn()
        conn.execute(
            "INSERT INTO tasks (repo_id, plan_file, task_id, title, status, files_json, why) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            ("Repo_A", "temp/Plan/PLAN_Synthetic.txt", "A.1", "Task",
             "in-progress", '["src/**"]', "why"),
        )
        conn.commit()
        events_file = self.repos[0].events_file
        events_file.parent.mkdir(parents=True, exist_ok=True)
        events_file.write_text(json.dumps({
            "v": 1, "ts": TS, "tool": "Edit", "file": "src/a.py",
            "session_id": "s", "branch": "main", "provider": "claude",
            "turn_id": "t", "agent_id": "a", "tool_use_id": "u",
            "operation": "update",
        }) + "\n", encoding="utf-8")
        tracker = Tracker(self.config)
        ids = tracker._catch_up_events(self.repos[0])
        row = db.get_event(ids[0])
        self.assertEqual((row["plan_file"], row["task_id"]),
                         ("temp/Plan/PLAN_Synthetic.txt", "A.1"))
        self.assertEqual((row["provider"], row["tool_use_id"]), ("claude", "u"))

        cursor = conn.execute(
            "INSERT INTO events (repo_id, ts, tool, file, task_ref, mode) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            ("Repo_A", TS, "Edit", "legacy.py",
             "temp/Plan/PLAN_Synthetic.txt - A.1", "B"),
        )
        conn.commit()
        self.assertEqual(db.backfill_event_task_keys("Repo_A"), 1)
        legacy = db.get_event(cursor.lastrowid)
        self.assertEqual((legacy["plan_file"], legacy["task_id"]),
                         ("temp/Plan/PLAN_Synthetic.txt", "A.1"))

        db.set_manual_task(ids[0], "temp/Plan/PLAN_Synthetic.txt - A.1")
        manually_bound = db.get_event(ids[0])
        self.assertEqual(manually_bound["mode"], "MANUAL")
        self.assertEqual((manually_bound["plan_file"], manually_bound["task_id"]),
                         ("temp/Plan/PLAN_Synthetic.txt", "A.1"))

        conn.executemany(
            "INSERT INTO tasks (repo_id, plan_file, task_id, title, status, files_json, why) "
            "VALUES (?, ?, ?, 'Collision', 'done', '[]', '')",
            [("Repo_A", "a - b", "c"), ("Repo_A", "a", "b - c")],
        )
        collision_id = conn.execute(
            "INSERT INTO events (repo_id, ts, tool, file, task_ref, mode) "
            "VALUES ('Repo_A', ?, 'Edit', 'collision.py', 'a - b - c', 'B')",
            (TS,),
        ).lastrowid
        conn.commit()
        self.assertEqual(db.backfill_event_task_keys("Repo_A"), 0)
        collision = db.get_event(collision_id)
        self.assertIsNone(collision["plan_file"])
        self.assertIsNone(collision["task_id"])

    def test_malformed_legacy_event_warning_never_echoes_raw_values (self) -> None:
        secret = "KATLAB_PRIVATE_SENTINEL_DO_NOT_PERSIST"
        events_file = self.repos[0].events_file
        events_file.parent.mkdir(parents=True, exist_ok=True)
        events_file.write_text(json.dumps({
            "v": secret, "ts": TS, "tool": "Edit", "file": "src/a.py",
        }) + "\n", encoding="utf-8")
        tracker = Tracker(self.config)

        with self.assertLogs("katlab.tracker", level="WARNING") as captured:
            self.assertEqual(tracker._catch_up_events(self.repos[0]), [])

        diagnostics = json.dumps({
            "logs": captured.output,
            "warnings": list(tracker.warnings["Repo_A"]),
        })
        self.assertNotIn(secret, diagnostics)
        self.assertIn("events.jsonl: skipped malformed line", diagnostics)
        self.assertEqual(db.get_offset("Repo_A"), events_file.stat().st_size)

    def test_additive_migration_opens_a_legacy_events_table (self) -> None:
        _close_db()
        legacy_path = self.root / "legacy.db"
        connection = sqlite3.connect(legacy_path)
        connection.execute(
            "CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, "
            "repo_id TEXT NOT NULL, ts TEXT NOT NULL, tool TEXT NOT NULL, "
            "file TEXT NOT NULL, task_ref TEXT, mode TEXT NOT NULL, "
            "candidates_json TEXT, commit_hash TEXT, swept INTEGER NOT NULL DEFAULT 0, "
            "session_id TEXT, branch TEXT)"
        )
        connection.close()
        db.DB_PATH, db.DATA_DIR = legacy_path, self.root
        db.init_db([SimpleNamespace(id="Repo_A", name="Repo A", path=self.repo_a)])
        columns = {row["name"] for row in db.get_conn().execute("PRAGMA table_info(events)")}
        self.assertTrue({
            "provider", "turn_id", "agent_id", "tool_use_id", "operation",
            "plan_file", "task_id",
        }.issubset(columns))
        self.assertIsNotNone(db.get_conn().execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='activity_events'"
        ).fetchone())


class GlobSemanticsTests(unittest.TestCase):
    def test_double_star_directory_segment_preserves_boundaries (self) -> None:
        nested = glob_to_regex("src/**/test.py")
        self.assertIsNotNone(nested.match("src/test.py"))
        self.assertIsNotNone(nested.match("src/a/b/test.py"))
        self.assertIsNone(nested.match("src/contest.py"))
        self.assertIsNone(nested.match("src/a/not-test.py"))

        plan = glob_to_regex("plans/**/SPEC_?.txt")
        self.assertIsNotNone(plan.match("plans/SPEC_A.txt"))
        self.assertIsNotNone(plan.match("plans/deep/SPEC_A.txt"))
        self.assertIsNone(plan.match("plans/notSPEC_A.txt"))


if __name__ == "__main__":
    unittest.main()
