"""Focused D.1 matrices for authoritative verification and mission readiness."""

import json
import tempfile
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch

from Backend.app import db, git_module, readiness
from Backend.app.config import (
    AppConfig,
    RepoConfig,
    ServerConfig,
    load_check_registry,
)
from Backend.app.plan_parser import parse_plan_bytes, raw_plan_sha256
from Backend.app.watcher import Tracker


PLAN = "temp/Plan/PLAN_Readiness.txt"
BASE_TS = "2026-09-07T00:00:00Z"
CHECK_IDS = (
    "backend-test", "check-missing", "check-stale", "check-incomplete",
    "check-failed", "check-unknown", "check-pass",
)


def _close_db () -> None:
    connection = getattr(db._local, "conn", None)
    if connection is not None:
        connection.close()
        del db._local.conn


def _plan (statuses: tuple[str, ...], requirements: tuple[str, ...],
           suffix: str = "") -> bytes:
    tasks = []
    for index, status in enumerate(statuses, start=1):
        tasks.append(f"""<task id=\"A.{index}\">
<title>Task {index}</title>
<status>{status}</status>
<files>
src/**
</files>
<why>Synthetic.</why>
</task>
""")
    verification = "\n".join(requirements)
    return ("".join(tasks) + f"<verification>\n{verification}\n</verification>\n"
            + suffix).encode("utf-8")


class ReadinessTests(unittest.TestCase):
    def setUp (self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.repo_root = self.root / "repo"
        (self.repo_root / ".git").mkdir(parents=True)
        self.repo = RepoConfig("Repo_A", "Repo A", self.repo_root)
        registry = self.root / "checks.json"
        registry.write_text(json.dumps({
            "schema_version": 1,
            "checks": [{
                "id": check_id,
                "label": check_id.replace("-", " ").title(),
                "repo_ids": ["Repo_A"],
                "cwd": ".",
                "commands": [f"python {check_id}.py"],
                "accepted_exit_codes": [0],
                "evidence_sources": ["hook", "manual"],
            } for check_id in CHECK_IDS],
        }), encoding="utf-8")
        self.definitions = load_check_registry(registry, {"Repo_A"})
        self.by_id = {item.id: item for item in self.definitions}
        self.config = AppConfig(
            ServerConfig(), [self.repo], self.root / "runtime", self.definitions,
        )

        self.old_db_path, self.old_data_dir = db.DB_PATH, db.DATA_DIR
        _close_db()
        db.DB_PATH = self.root / "tracking.db"
        db.DATA_DIR = self.root
        db.init_db([self.repo])
        self.status = {
            "clean": True, "count": 0, "offline": False, "branch": "main",
            "dirty_paths": [], "paths_complete": True, "status_valid": True,
            "observed_at": "2026-09-07T00:10:00Z",
        }

    def tearDown (self) -> None:
        _close_db()
        db.DB_PATH, db.DATA_DIR = self.old_db_path, self.old_data_dir
        self.temp.cleanup()

    def sync (self, statuses=("in-progress",), requirements=("backend-test",),
             seen_at=BASE_TS, suffix="") -> str:
        raw = _plan(tuple(statuses), tuple(requirements), suffix)
        result = parse_plan_bytes(raw, "synthetic")
        self.assertFalse(result.fatal)
        db.sync_plan_snapshot(
            "Repo_A", PLAN, raw_plan_sha256(raw), result, seen_at,
            self.definitions,
        )
        return raw_plan_sha256(raw)

    def evaluate (self, status=None) -> dict:
        return readiness.evaluate_plan(
            self.repo, PLAN, self.status if status is None else status,
            self.definitions,
        )

    def event (self, *, ts="2026-09-07T01:00:00Z", file="src/a.py",
              mode="B", plan_file=PLAN, task_id="A.1",
              commit_hash=None, swept=0) -> int:
        cursor = db.get_conn().execute(
            "INSERT INTO events "
            "(repo_id, ts, tool, file, task_ref, mode, commit_hash, swept, "
            "plan_file, task_id) VALUES (?, ?, 'Edit', ?, NULL, ?, ?, ?, ?, ?)",
            ("Repo_A", ts, file, mode, commit_hash, swept, plan_file, task_id),
        )
        db.get_conn().commit()
        return cursor.lastrowid

    def manual (self, check_id: str, outcome: str, ts: str,
               *, plan_revision: str | None = None,
               requirement_revision: str | None = None) -> int:
        binding = db.get_plan_requirement_binding("Repo_A", PLAN, check_id)
        self.assertIsNotNone(binding)
        review = check_id.startswith("review:")
        transport = {
            "uid": str(uuid.uuid4()), "schema_version": 1,
            "provider": "manual", "evidence_source": "manual",
            "kind": "review_result" if review else "check_finished",
            "ts": ts, "delivery_class": "durable", "check_id": check_id,
            "outcome": outcome,
        }
        derived = {
            "assignment_mode": "EXPLICIT_TARGET", "plan_repo_id": "Repo_A",
            "plan_file": PLAN, "task_ref": None,
            "check_revision": None if review else self.by_id[check_id].revision,
            "requirement_revision": (
                binding["requirement_revision"]
                if requirement_revision is None else requirement_revision
            ),
            "plan_revision": (
                binding["plan_revision"] if plan_revision is None else plan_revision
            ),
        }
        status, activity_id = db.insert_activity(
            transport, uuid.uuid4().hex, ["Repo_A"], derived, ts,
        )
        self.assertEqual(status, "inserted")
        return activity_id

    def hook (self, check_id: str, *, tool_use_id: str, start_ts: str,
             finish_ts: str | None = None, outcome: str | None = None) -> tuple[int, int | None]:
        binding = db.get_plan_requirement_binding("Repo_A", PLAN, check_id)
        definition = self.by_id[check_id]
        derived = {
            "assignment_mode": "AUTO_ACTIVE", "plan_repo_id": "Repo_A",
            "plan_file": PLAN, "task_ref": None,
            "check_revision": definition.revision,
            "requirement_revision": binding["requirement_revision"],
            "plan_revision": binding["plan_revision"],
        }

        def insert (kind: str, ts: str, result: str | None) -> int:
            transport = {
                "uid": str(uuid.uuid4()), "schema_version": 1,
                "provider": "codex", "evidence_source": "hook", "kind": kind,
                "ts": ts, "delivery_class": "durable", "session_id": "session",
                "tool_use_id": tool_use_id, "check_id": check_id,
                "check_revision": definition.revision, "outcome": result,
            }
            inserted, activity_id = db.insert_activity(
                transport, uuid.uuid4().hex, ["Repo_A"], derived, ts,
            )
            self.assertEqual(inserted, "inserted")
            return activity_id

        start_id = insert("check_started", start_ts, None)
        finish_id = insert("check_finished", finish_ts, outcome) if finish_ts else None
        return start_id, finish_id

    def test_all_seven_mission_states (self) -> None:
        self.sync(statuses=("pending",), requirements=())
        self.assertEqual(self.evaluate()["state"], "not_configured")

        self.sync(statuses=("pending",), seen_at="2026-09-07T00:01:00Z")
        self.assertEqual(self.evaluate()["state"], "planning")

        self.sync(statuses=("in-progress",), seen_at="2026-09-07T00:02:00Z")
        self.assertEqual(self.evaluate()["state"], "implementation")

        self.sync(statuses=("done",), seen_at="2026-09-07T00:03:00Z")
        self.assertEqual(self.evaluate()["state"], "verification")

        self.hook(
            "backend-test", tool_use_id="unknown", start_ts="2026-09-07T01:00:00Z",
            finish_ts="2026-09-07T01:01:00Z", outcome="unknown",
        )
        self.assertEqual(self.evaluate()["state"], "blocked")

        self.event(ts="2026-09-07T02:00:00Z")
        self.manual("backend-test", "pass", "2026-09-07T03:00:00Z")
        dirty = {**self.status, "clean": False, "count": 1,
                 "dirty_paths": ["src/a.py"]}
        self.assertEqual(self.evaluate(dirty)["state"], "ready_to_commit")

        db.get_conn().execute(
            "UPDATE events SET commit_hash = 'direct', swept = 0 WHERE file = 'src/a.py'"
        )
        db.get_conn().commit()
        self.assertEqual(self.evaluate()["state"], "verified_committed")

    def test_zero_task_plan_remains_conservative (self) -> None:
        self.sync(statuses=(), requirements=("backend-test",))
        self.assertEqual(self.evaluate()["state"], "verification")
        self.manual("backend-test", "pass", "2026-09-07T01:00:00Z")
        result = self.evaluate()
        self.assertEqual(result["state"], "blocked")
        self.assertEqual(result["task_counts"], {
            "total": 0, "pending": 0, "in_progress": 0, "done": 0,
        })
        self.assertIn("IMPLEMENTATION_EVIDENCE_MISSING",
                      [row["code"] for row in result["blockers"]])

    def test_all_requirement_states_and_review_streak_reset (self) -> None:
        requirements = (
            "check-missing", "check-stale", "check-incomplete", "check-failed",
            "check-unknown", "check-pass", "review:finding", "review:partial@3",
            "review:passed@2",
        )
        self.sync(requirements=requirements)
        self.manual("check-stale", "pass", "2026-09-06T23:59:00Z")
        self.hook(
            "check-incomplete", tool_use_id="incomplete",
            start_ts="2026-09-07T01:00:00Z",
        )
        self.manual("check-failed", "cancelled", "2026-09-07T01:00:00Z")
        self.hook(
            "check-unknown", tool_use_id="unknown",
            start_ts="2026-09-07T01:00:00Z",
            finish_ts="2026-09-07T01:01:00Z", outcome="unknown",
        )
        self.manual("check-pass", "pass", "2026-09-07T01:00:00Z")
        self.manual("review:finding", "finding", "2026-09-07T01:00:00Z")
        self.manual("review:partial", "finding", "2026-09-07T00:30:00Z")
        self.manual("review:partial", "clean", "2026-09-07T01:00:00Z")
        self.manual("review:partial", "clean", "2026-09-07T01:01:00Z")
        self.manual("review:passed", "clean", "2026-09-07T01:00:00Z")
        self.manual("review:passed", "clean", "2026-09-07T01:01:00Z")

        rows = {row["check_id"]: row for row in self.evaluate()["requirements"]}
        self.assertEqual({key: rows[key]["state"] for key in rows}, {
            "check-missing": "missing",
            "check-stale": "stale",
            "check-incomplete": "incomplete",
            "check-failed": "failed",
            "check-unknown": "unknown",
            "check-pass": "passed",
            "review:finding": "finding",
            "review:partial": "partial",
            "review:passed": "passed",
        })
        self.assertEqual((rows["review:partial"]["current"],
                          rows["review:partial"]["target"]), (2, 3))
        self.assertEqual(rows["check-pass"]["evidence_sources"], ["hook", "manual"])
        self.assertEqual(rows["check-pass"]["check_revision"],
                         self.by_id["check-pass"].revision)
        self.assertEqual(rows["review:partial"]["evidence_sources"], ["manual"])
        self.assertIsNone(rows["review:partial"]["check_revision"])

        self.manual("review:partial", "clean", "2026-09-07T01:02:00Z")
        partial = {row["check_id"]: row for row in self.evaluate()["requirements"]}
        self.assertEqual(partial["review:partial"]["state"], "passed")
        self.manual("review:partial", "finding", "2026-09-07T01:03:00Z")
        reset = {row["check_id"]: row for row in self.evaluate()["requirements"]}
        self.assertEqual((reset["review:partial"]["state"],
                          reset["review:partial"]["current"]), ("finding", 0))

    def test_implementation_floor_and_plan_edit_stale_expected_evidence (self) -> None:
        self.sync(requirements=("review:cdd", "backend-test", "review:cft"))
        self.manual("review:cdd", "clean", "2026-09-07T01:00:00Z")
        self.manual("backend-test", "pass", "2026-09-07T01:00:00Z")
        self.manual("review:cft", "clean", "2026-09-07T01:00:00Z")
        self.event(ts="2026-09-07T02:00:00Z")

        rows = {row["check_id"]: row for row in self.evaluate()["requirements"]}
        self.assertEqual(rows["review:cdd"]["state"], "passed")
        self.assertEqual(rows["backend-test"]["state"], "stale")
        self.assertEqual(rows["review:cft"]["state"], "stale")
        self.assertEqual(rows["backend-test"]["freshness_floor"],
                         "2026-09-07T02:00:00Z")

        self.sync(
            requirements=("review:cdd", "backend-test", "review:cft"),
            seen_at="2026-09-07T03:00:00Z", suffix="edited\n",
        )
        edited = {row["check_id"]: row for row in self.evaluate()["requirements"]}
        self.assertEqual(set(row["state"] for row in edited.values()), {"stale"})

    def test_changed_check_revision_stales_prior_pass (self) -> None:
        raw_hash = self.sync()
        self.manual("backend-test", "pass", "2026-09-07T01:00:00Z")
        registry = self.root / "changed-checks.json"
        registry.write_text(json.dumps({
            "schema_version": 1,
            "checks": [{
                "id": "backend-test", "label": "Backend Test",
                "repo_ids": ["Repo_A"], "cwd": ".",
                "commands": ["python changed.py"], "accepted_exit_codes": [0],
                "evidence_sources": ["hook", "manual"],
            }],
        }), encoding="utf-8")
        changed = load_check_registry(registry, {"Repo_A"})
        raw = _plan(("in-progress",), ("backend-test",))
        db.sync_plan_snapshot(
            "Repo_A", PLAN, raw_hash, parse_plan_bytes(raw, "synthetic"),
            "2026-09-07T02:00:00Z", changed,
        )
        result = readiness.evaluate_plan(self.repo, PLAN, self.status, changed)
        self.assertEqual(result["requirements"][0]["state"], "stale")
        self.assertEqual(result["requirements"][0]["latest_outcome"], "pass")

    def test_newest_fresh_attempt_controls_check_state (self) -> None:
        self.sync()
        self.manual("backend-test", "pass", "2026-09-07T01:00:00Z")
        self.hook(
            "backend-test", tool_use_id="later",
            start_ts="2026-09-07T02:00:00Z",
        )
        requirement = self.evaluate()["requirements"][0]
        self.assertEqual(requirement["state"], "incomplete")
        self.hook(
            "backend-test", tool_use_id="latest",
            start_ts="2026-09-07T03:00:00Z",
            finish_ts="2026-09-07T03:01:00Z", outcome="fail",
        )
        requirement = self.evaluate()["requirements"][0]
        self.assertEqual((requirement["state"], requirement["latest_outcome"]),
                         ("failed", "fail"))

    def test_dirty_path_and_direct_commit_proofs_are_exact (self) -> None:
        self.sync(statuses=("done",))
        self.manual("backend-test", "pass", "2026-09-07T03:00:00Z")
        missing = self.evaluate()
        self.assertEqual(missing["state"], "blocked")
        self.assertIn("IMPLEMENTATION_EVIDENCE_MISSING",
                      [row["code"] for row in missing["blockers"]])

        event_id = self.event(ts="2026-09-07T01:00:00Z")
        dirty_exact = {**self.status, "clean": False, "count": 1,
                       "dirty_paths": ["src/a.py"]}
        self.assertEqual(self.evaluate(dirty_exact)["state"], "ready_to_commit")

        unrelated = {**dirty_exact, "dirty_paths": ["notes/readme.txt"]}
        reverted = self.evaluate(unrelated)
        self.assertEqual(reverted["state"], "blocked")
        self.assertIn("NO_CURRENT_PLAN_DIFF", [row["code"] for row in reverted["blockers"]])
        self.assertIn("REPO_DIRTY_OTHER_WORK", [row["code"] for row in reverted["warnings"]])

        uncaptured = {**dirty_exact, "dirty_paths": ["src/other.py"]}
        blocked = self.evaluate(uncaptured)
        self.assertEqual(blocked["state"], "blocked")
        self.assertIn("UNCAPTURED_PLAN_DIRTY", [row["code"] for row in blocked["blockers"]])

        db.get_conn().execute(
            "UPDATE events SET commit_hash = 'direct', swept = 0 WHERE id = ?",
            (event_id,),
        )
        db.get_conn().commit()
        self.assertEqual(self.evaluate()["state"], "verified_committed")
        committed_dirty = self.evaluate(unrelated)
        self.assertEqual(committed_dirty["state"], "verified_committed")
        self.assertIn("REPO_DIRTY_OTHER_WORK",
                      [row["code"] for row in committed_dirty["warnings"]])

        self.event(
            ts="2026-09-07T01:30:00Z", file="src/swept.py",
            commit_hash="head", swept=1,
        )
        swept = self.evaluate()
        self.assertEqual(swept["state"], "blocked")
        self.assertIn("SWEPT_IMPLEMENTATION_EVIDENCE",
                      [row["code"] for row in swept["blockers"]])

    def test_unresolved_scope_and_normalized_keys_are_conservative (self) -> None:
        self.sync(statuses=("done",))
        self.manual("backend-test", "pass", "2026-09-07T03:00:00Z")
        # A legacy-looking display reference without normalized keys is not proof.
        self.event(file="src/display-only.py", plan_file=None, task_id=None,
                   commit_hash="direct")
        self.assertIn("IMPLEMENTATION_EVIDENCE_MISSING",
                      [row["code"] for row in self.evaluate()["blockers"]])

        linked = self.event(file="other/old.py", mode="AMBIGUOUS",
                            plan_file=None, task_id=None, commit_hash="old")
        self.assertEqual(self.evaluate()["unresolved_count"], 0)
        self.event(file="other/current.py", mode="UNKNOWN",
                   plan_file=None, task_id=None)
        unresolved = self.evaluate()
        self.assertEqual(unresolved["state"], "blocked")
        self.assertEqual(unresolved["unresolved_count"], 1)
        self.assertIn("UNRESOLVED_CURRENT_WORK",
                      [row["code"] for row in unresolved["blockers"]])
        self.assertGreater(linked, 0)

    def test_parser_status_task_and_check_configuration_fail_closed (self) -> None:
        self.sync(statuses=("in-progress", "in-progress"))
        multiple = self.evaluate()
        self.assertEqual(multiple["state"], "blocked")
        self.assertIn("MULTIPLE_TASKS_IN_PROGRESS",
                      [row["code"] for row in multiple["blockers"]])

        invalid_status = {**self.status, "status_valid": False, "paths_complete": False}
        self.assertIn("REPO_STATUS_UNKNOWN",
                      [row["code"] for row in self.evaluate(invalid_status)["blockers"]])
        self.repo.offline = True
        self.assertIn("REPO_OFFLINE", [row["code"] for row in self.evaluate()["blockers"]])
        self.repo.offline = False

        warned = _plan(("in-progress",), ("backend-test",), "<verification\n")
        parsed = parse_plan_bytes(warned, "synthetic")
        self.assertTrue(parsed.warnings)
        db.sync_plan_snapshot(
            "Repo_A", PLAN, raw_plan_sha256(warned), parsed,
            "2026-09-07T02:00:00Z", self.definitions,
        )
        self.assertEqual(self.evaluate()["state"], "blocked")
        self.assertIn("PLAN_PARSE_WARNING",
                      [row["code"] for row in self.evaluate()["blockers"]])

        fatal = parse_plan_bytes(b"\xff\xfe", "synthetic")
        db.sync_plan_snapshot(
            "Repo_A", PLAN, raw_plan_sha256(b"\xff\xfe"), fatal,
            "2026-09-07T03:00:00Z", self.definitions,
        )
        self.assertIn("PLAN_PARSE_FATAL", [row["code"] for row in self.evaluate()["blockers"]])

        self.sync(requirements=("missing-definition",), seen_at="2026-09-07T04:00:00Z")
        invalid = self.evaluate()
        self.assertEqual(invalid["state"], "blocked")
        self.assertIn("INVALID_CHECK_DEFINITION",
                      [row["code"] for row in invalid["blockers"]])

    def test_status_failure_retains_display_values_but_invalidates_readiness (self) -> None:
        tracker = Tracker(self.config)
        tracker.status["Repo_A"] = {
            key: value for key, value in self.status.items() if key != "dirty_paths"
        }
        tracker.dirty_paths["Repo_A"] = []
        observed = {
            **self.status, "clean": False, "count": 2,
            "dirty_paths": ["src/a.py", "src/b.py"],
            "observed_at": "2026-09-07T01:00:00Z",
        }
        with patch("Backend.app.watcher.git_module.repo_status", return_value=observed):
            self.assertTrue(tracker._refresh_status(self.repo))
        with patch("Backend.app.watcher.git_module.repo_status",
                   side_effect=git_module.GitError("synthetic")):
            self.assertTrue(tracker._refresh_status(self.repo))
        retained = tracker.status["Repo_A"]
        self.assertEqual((retained["clean"], retained["count"], retained["branch"]),
                         (False, 2, "main"))
        self.assertEqual(tracker.dirty_paths["Repo_A"], ["src/a.py", "src/b.py"])
        self.assertNotIn("dirty_paths", retained)
        self.assertFalse(retained["status_valid"])
        self.assertFalse(retained["paths_complete"])

    def test_startup_commit_catchup_links_before_any_sweep (self) -> None:
        self.sync()
        event_id = self.event(ts="2026-09-07T01:00:00Z")
        db.upsert_commit("Repo_A", {
            "hash": "known", "message": "Known", "ts": "2026-09-06T00:00:00Z",
            "files": ["old.py"], "parents": "",
        })
        tracker = Tracker(self.config)
        tracker.known_commits["Repo_A"] = set()
        fresh = {
            "hash": "fresh", "message": "Fresh", "ts": "2026-09-07T02:00:00Z",
            "files": ["src/a.py"], "parents": "known",
        }
        with patch("Backend.app.watcher.git_module.head_hash",
                   side_effect=["fresh", "fresh"]), \
             patch("Backend.app.watcher.git_module.new_commits_since",
                   return_value=[fresh]) as mocked:
            self.assertTrue(tracker._catch_up_commits(self.repo))
        self.assertEqual(mocked.call_args.args[1], {"known"})
        self.assertEqual(mocked.call_args.kwargs["head"], "fresh")
        self.assertEqual(tracker.reconciled_heads["Repo_A"], "fresh")
        event = db.get_event(event_id)
        self.assertEqual((event["commit_hash"], event["swept"]), ("fresh", 0))

    def test_moving_head_invalidates_commit_scan_before_linking (self) -> None:
        event_id = db.insert_events_with_offset("Repo_A", [{
            "ts": "2026-09-07T01:30:00Z", "tool": "Edit", "file": "src/a.py",
            "task_ref": None, "mode": "UNKNOWN", "candidates": [],
        }], 1)[0]
        tracker = Tracker(self.config)
        tracker.known_commits["Repo_A"] = set()
        fresh = {
            "hash": "first", "message": "First", "ts": "2026-09-07T02:00:00Z",
            "files": ["src/a.py"], "parents": "known",
        }
        with patch("Backend.app.watcher.git_module.head_hash",
                   side_effect=["first", "second"]), \
             patch("Backend.app.watcher.git_module.new_commits_since",
                   return_value=[fresh]):
            self.assertFalse(tracker._catch_up_commits(self.repo))
        self.assertIsNone(db.get_event(event_id)["commit_hash"])
        self.assertIsNone(tracker.reconciled_heads.get("Repo_A"))

    def test_failed_commit_catchup_cannot_authorize_clean_sweep (self) -> None:
        tracker = Tracker(self.config)
        tracker.status["Repo_A"] = {
            "clean": True, "status_valid": True,
        }
        tracker.known_commits["Repo_A"] = set()
        with patch("Backend.app.watcher.git_module.head_hash",
                   side_effect=git_module.GitError("synthetic")), \
             patch("Backend.app.watcher.git_module.new_commits_since") as scan:
            commit_scan_ok = tracker._catch_up_commits(self.repo)
        self.assertFalse(commit_scan_ok)
        scan.assert_not_called()
        with patch("Backend.app.watcher.git_module.commit_info") as commit_info:
            self.assertEqual(
                tracker._sweep(self.repo, commit_scan_ok=commit_scan_ok), 0,
            )
            commit_info.assert_not_called()

    def test_sweep_requires_a_current_valid_clean_status (self) -> None:
        tracker = Tracker(self.config)
        tracker.known_commits["Repo_A"] = set()
        for status in (
            {"clean": True, "status_valid": False},
            {"clean": False, "status_valid": True},
        ):
            tracker.status["Repo_A"] = status
            with patch("Backend.app.watcher.git_module.commit_info") as commit_info:
                self.assertEqual(tracker._sweep(self.repo, commit_scan_ok=True), 0)
                commit_info.assert_not_called()

    def test_sweep_requires_the_same_head_as_the_successful_scan (self) -> None:
        event_id = db.insert_events_with_offset("Repo_A", [{
            "ts": "2026-09-07T01:30:00Z", "tool": "Edit", "file": "src/a.py",
            "task_ref": None, "mode": "UNKNOWN", "candidates": [],
        }], 1)[0]
        tracker = Tracker(self.config)
        tracker.status["Repo_A"] = {"clean": True, "status_valid": True}
        tracker.known_commits["Repo_A"] = set()
        tracker.reconciled_heads["Repo_A"] = "scanned"
        moved = {
            "hash": "moved", "message": "Moved", "ts": "2026-09-07T02:00:00Z",
            "files": ["src/a.py"], "parents": "scanned",
        }
        with patch("Backend.app.watcher.git_module.commit_info", return_value=moved):
            self.assertEqual(tracker._sweep(self.repo, commit_scan_ok=True), 0)
        self.assertIsNone(db.get_event(event_id)["commit_hash"])

    def test_evaluate_all_has_fixed_zero_filled_state_summary (self) -> None:
        self.sync()
        result = readiness.evaluate_all(
            self.config, {"Repo_A": self.status}, "2026-09-07T05:00:00Z",
        )
        self.assertEqual(result["generated_at"], "2026-09-07T05:00:00Z")
        self.assertEqual(set(result["summary"]["states"]), set(readiness.MISSION_STATES))
        self.assertEqual(sum(result["summary"]["states"].values()), 1)
        self.assertEqual(len(result["plans"]), 1)

    def test_scoped_recompute_replaces_only_the_affected_cached_repo (self) -> None:
        tracker = Tracker(self.config)
        tracker.status["Repo_A"] = {
            key: value for key, value in self.status.items() if key != "dirty_paths"
        }
        tracker.dirty_paths["Repo_A"] = []
        retained = {"repo": "Repo_B", "plan_file": "PLAN_B", "state": "planning"}
        tracker.missions = {
            "generated_at": "old",
            "summary": {"total": 2, "states": {}},
            "plans": [
                {"repo": "Repo_A", "plan_file": "PLAN_OLD", "state": "blocked"},
                retained,
            ],
        }
        replacement = {
            "repo": "Repo_A", "plan_file": "PLAN_NEW", "state": "implementation",
        }
        partial = {
            "generated_at": "new",
            "summary": {"total": 1, "states": {}},
            "plans": [replacement],
        }
        with patch("Backend.app.watcher.readiness.evaluate_all",
                   return_value=partial) as evaluate:
            tracker._recompute_readiness({"Repo_A"})
        self.assertEqual(evaluate.call_args.kwargs["repo_ids"], {"Repo_A"})
        self.assertEqual(tracker.missions["plans"], [replacement, retained])
        self.assertEqual(tracker.missions["summary"]["total"], 2)
        self.assertEqual(tracker.missions["summary"]["states"]["implementation"], 1)
        self.assertEqual(tracker.missions["summary"]["states"]["planning"], 1)


if __name__ == "__main__":
    unittest.main()
