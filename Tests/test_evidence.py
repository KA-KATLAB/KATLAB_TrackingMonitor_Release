"""Focused C.2 tests for trusted checks, binding, pairing, and manual evidence."""

import io
import json
import os
import tempfile
import unittest
import uuid
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from unittest.mock import patch

from Backend.app import db
from Backend.app.activity import ActivityIngestor
from Backend.app.config import (
    AppConfig,
    ConfigAuthoringError,
    RepoConfig,
    ServerConfig,
    load_check_registry,
)
from Backend.app.plan_parser import parse_plan_bytes, raw_plan_sha256
from Hook.katlab_activity import load_hook_checks, load_registered_repos, match_hook_check
from Hook.provider_adapters import activity_record, check_record
from Scripts import record_evidence


BASE_TS = "2026-09-07T00:00:00Z"
PLAN_A = "temp/Plan/PLAN_Synthetic_A.txt"


def _close_db () -> None:
    connection = getattr(db._local, "conn", None)
    if connection is not None:
        connection.close()
        del db._local.conn


def _task (status: str, task_id: str = "A.1") -> str:
    return f"""<task id=\"{task_id}\">
<title>Synthetic task</title>
<status>{status}</status>
<files>
src/**
</files>
<why>Exercise evidence binding.</why>
</task>
"""


def _plan_text (status: str, requirements: tuple[str, ...] = ("backend-test",),
                suffix: str = "") -> str:
    block = "\n".join(requirements)
    return f"{_task(status)}<verification>\n{block}\n</verification>\n{suffix}"


class EvidenceTests(unittest.TestCase):
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
        self.config_dir = self.root / "config"
        self.config_dir.mkdir()
        self.repos_path = self.config_dir / "repos.yaml"
        self.repos_path.write_text(
            "repos:\n"
            "  - id: Repo_A\n"
            f"    path: '{self.repo_a}'\n"
            "  - id: Repo_B\n"
            f"    path: '{self.repo_b}'\n",
            encoding="utf-8",
        )
        self.checks_path = self.config_dir / "checks.json"
        self._write_checks([
            {
                "id": "backend-test",
                "label": "Backend test",
                "repo_ids": ["Repo_B", "Repo_A"],
                "cwd": ".",
                "commands": ["python -m unittest", "python verify.py"],
                "accepted_exit_codes": [2, 0],
                "evidence_sources": ["manual", "hook"],
            },
            {
                "id": "hook-only",
                "label": "Hook only",
                "repo_ids": ["Repo_A"],
                "cwd": "src",
                "commands": ["python hook_verify.py"],
                "accepted_exit_codes": [0],
                "evidence_sources": ["hook"],
            },
        ])
        self.definitions = load_check_registry(
            self.checks_path, {repo.id for repo in self.repos},
        )
        self.runtime = self.root / "runtime"
        self.config = AppConfig(
            ServerConfig(), self.repos, self.runtime, self.definitions,
        )

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

    def _write_checks (self, checks: list[dict]) -> None:
        self.checks_path.write_text(json.dumps({
            "schema_version": 1,
            "checks": checks,
        }), encoding="utf-8")

    def _sync_plan (self, relative: str = PLAN_A, status: str = "in-progress",
                    requirements: tuple[str, ...] = ("backend-test",),
                    revision_at: str = BASE_TS, suffix: str = "",
                    definitions=None) -> str:
        raw = _plan_text(status, requirements, suffix).encode("utf-8")
        path = self.repo_a / Path(*relative.split("/"))
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(raw)
        result = parse_plan_bytes(raw, "synthetic")
        self.assertFalse(result.fatal)
        self.assertEqual(result.warnings, [])
        db.sync_plan_snapshot(
            "Repo_A", relative, raw_plan_sha256(raw), result, revision_at,
            self.definitions if definitions is None else definitions,
        )
        return raw_plan_sha256(raw)

    def _hook_record (self, kind: str, *, repo_ids=None, revision: str | None = None,
                      tool_use_id: str = "tool-1", ts: str = "2026-09-07T01:00:00Z",
                      outcome: str | None = None, uid: str | None = None) -> dict:
        value = {
            "schema_version": 1,
            "uid": uid or str(uuid.uuid4()),
            "provider": "codex",
            "evidence_source": "hook",
            "kind": kind,
            "ts": ts,
            "delivery_class": "durable",
            "repo_ids": ["Repo_A"] if repo_ids is None else repo_ids,
            "session_id": "session-1",
            "tool_use_id": tool_use_id,
            "tool_name": "Bash",
            "tool_class": "shell",
            "check_id": "backend-test",
            "check_revision": revision or self.definitions[0].revision,
        }
        if outcome is not None:
            value["outcome"] = outcome
        return value

    def _publish_raw (self, value: dict) -> Path:
        path = self.ingestor.inbox / f"{value['uid']}.json"
        path.write_text(json.dumps(value), encoding="utf-8")
        return path

    def _ingest_one (self, value: dict):
        self._publish_raw(value)
        result = self.ingestor.ingest_batch()
        self.assertEqual(result.inserted, 1)
        return db.get_activity_events()[-1]

    def _run_recorder (self, *args: str) -> tuple[int, str, str]:
        stdout, stderr = io.StringIO(), io.StringIO()
        with patch.dict(os.environ, {
            "KATLAB_TRACKER_CONFIG": str(self.repos_path),
            "KATLAB_TRACKER_ACTIVITY_DIR": str(self.runtime),
        }, clear=False), redirect_stdout(stdout), redirect_stderr(stderr):
            code = record_evidence.main(list(args))
        return code, stdout.getvalue(), stderr.getvalue()

    @staticmethod
    def _source_snapshot (root: Path) -> dict[str, bytes]:
        return {
            path.relative_to(root).as_posix(): path.read_bytes()
            for path in root.rglob("*") if path.is_file()
        }

    def test_backend_and_hook_registry_projections_are_canonical_and_equal (self) -> None:
        registered = load_registered_repos(self.repos_path)
        hook_checks = load_hook_checks(registered, self.checks_path)
        self.assertEqual([repo.id for repo in registered], ["Repo_A", "Repo_B"])
        self.assertEqual(len(hook_checks), len(self.definitions))
        for backend, hook in zip(self.definitions, hook_checks):
            self.assertEqual(
                (backend.id, backend.repo_ids, backend.cwd, backend.commands,
                 backend.accepted_exit_codes, backend.evidence_sources, backend.revision),
                (hook.id, hook.repo_ids, hook.cwd, hook.commands,
                 hook.accepted_exit_codes, hook.evidence_sources, hook.revision),
            )
        self.assertEqual(self.definitions[0].repo_ids, ("Repo_A", "Repo_B"))
        self.assertEqual(self.definitions[0].accepted_exit_codes, (0, 2))
        self.assertEqual(registered[0].plan_globs, ("temp/Plan/PLAN_*.txt",))

        custom = self.config_dir / "custom-repos.yaml"
        custom.write_text(
            "repos:\n"
            "  - id: Repo_A\n"
            f"    path: '{self.repo_a}'\n"
            "    plan_globs:\n"
            "      - \"plans/**/SPEC_?.txt\"\n",
            encoding="utf-8",
        )
        self.assertEqual(
            load_registered_repos(custom)[0].plan_globs,
            ("plans/**/SPEC_?.txt",),
        )

    def test_registry_errors_fail_backend_and_disable_only_hook_check_matching (self) -> None:
        invalid_documents = [
            {"schema_version": True, "checks": []},
            {"schema_version": 1, "checks": [], "unknown": True},
            {"schema_version": 1, "checks": [{
                "id": "review:cdd", "label": "Reserved", "repo_ids": ["Repo_A"],
                "cwd": ".", "commands": ["python ok.py"],
                "accepted_exit_codes": [0], "evidence_sources": ["hook"],
            }]},
            {"schema_version": 1, "checks": [{
                "id": "bad-source", "label": "Bad source", "repo_ids": ["Repo_A"],
                "cwd": ".", "commands": ["python ok.py"],
                "accepted_exit_codes": [0], "evidence_sources": [[]],
            }]},
            {"schema_version": 1, "checks": [{
                "id": "first-check", "label": "First", "repo_ids": ["Repo_A"],
                "cwd": ".", "commands": ["python ok.py"],
                "accepted_exit_codes": [0], "evidence_sources": ["hook"],
            }, {
                "id": "second-check", "label": "Second", "repo_ids": ["Repo_A"],
                "cwd": ".", "commands": ["python ok.py"],
                "accepted_exit_codes": [0], "evidence_sources": ["hook"],
            }]},
        ]
        registered = load_registered_repos(self.repos_path)
        for document in invalid_documents:
            with self.subTest(document=document):
                self.checks_path.write_text(json.dumps(document), encoding="utf-8")
                with self.assertRaises(ConfigAuthoringError):
                    load_check_registry(self.checks_path, {"Repo_A", "Repo_B"})
                self.assertEqual(load_hook_checks(registered, self.checks_path), [])

        payload = {
            "hook_event_name": "PostToolUse", "tool_name": "Bash",
            "tool_input": {"command": "python -m unittest"},
            "cwd": str(self.repo_a), "session_id": "s", "tool_use_id": "u",
        }
        self.assertIsNone(check_record("codex", payload, registered, []))
        generic = activity_record("codex", payload, registered)
        self.assertIsNotNone(generic)
        self.assertEqual(generic["repo_ids"], ["Repo_A"])

    def test_check_match_is_exact_for_command_cwd_and_repository (self) -> None:
        registered = load_registered_repos(self.repos_path)
        checks = load_hook_checks(registered, self.checks_path)
        payload = {
            "tool_name": "Bash", "tool_input": {"command": " python -m unittest "},
            "cwd": str(self.repo_a),
        }
        matched = match_hook_check(payload, registered, checks)
        self.assertEqual((matched[0].id, matched[1].id), ("backend-test", "Repo_A"))
        for changes in (
            {"tool_input": {"command": "python -m unittest -v"}},
            {"cwd": str(self.repo_a / "src")},
            {"cwd": str(self.root)},
            {"tool_name": "exec_command"},
        ):
            with self.subTest(changes=changes):
                candidate = {**payload, **changes}
                self.assertIsNone(match_hook_check(candidate, registered, checks))

        projected = check_record("codex", {
            **payload, "hook_event_name": "PreToolUse",
            "session_id": "s", "tool_use_id": "u",
        }, registered, checks)
        self.assertEqual(projected["repo_ids"], ["Repo_A"])
        self.assertNotIn(str(self.repo_a), json.dumps(projected))

    def test_manual_cli_records_review_and_check_without_repo_mutation (self) -> None:
        plan_revision = self._sync_plan(
            requirements=("review:cdd@2", "backend-test"),
        )
        before = self._source_snapshot(self.repo_a)
        code, stdout, stderr = self._run_recorder(
            "--repo", "Repo_A", "--plan", PLAN_A,
            "--check", "review:cdd", "--outcome", "clean",
        )
        self.assertEqual((code, stderr), (0, ""))
        self.assertIn("Evidence recorded", stdout)
        self.assertEqual(self._source_snapshot(self.repo_a), before)
        finals = list(self.ingestor.inbox.glob("*.json"))
        self.assertEqual(len(finals), 1)
        self.assertNotIn(str(self.repo_a), finals[0].read_text(encoding="utf-8"))

        review = self._ingest_existing_final()
        self.assertEqual(
            (review["assignment_mode"], review["plan_repo_id"], review["plan_file"],
             review["check_id"], review["check_revision"], review["plan_revision"]),
            ("EXPLICIT_TARGET", "Repo_A", PLAN_A, "review:cdd", None, plan_revision),
        )

        code, _, stderr = self._run_recorder(
            "--repo", "Repo_A", "--plan", PLAN_A,
            "--check", "backend-test", "--outcome", "pass",
        )
        self.assertEqual((code, stderr), (0, ""))
        check = self._ingest_existing_final()
        self.assertEqual(check["check_revision"], self.definitions[0].revision)
        self.assertEqual(check["assignment_mode"], "EXPLICIT_TARGET")
        binding = db.get_plan_requirement_binding("Repo_A", PLAN_A, "backend-test")
        self.assertEqual(check["requirement_revision"], binding["requirement_revision"])
        self.assertEqual(self._source_snapshot(self.repo_a), before)

    def _ingest_existing_final (self):
        before = len(db.get_activity_events())
        result = self.ingestor.ingest_batch()
        self.assertEqual((result.inserted, result.rejected), (1, 0))
        rows = db.get_activity_events()
        self.assertEqual(len(rows), before + 1)
        return rows[-1]

    def test_manual_cli_rejects_invalid_target_check_outcome_and_source (self) -> None:
        self._sync_plan(requirements=("review:cdd", "backend-test", "hook-only"))
        outside = "notes/PLAN_Outside.txt"
        outside_path = self.repo_a / Path(*outside.split("/"))
        outside_path.parent.mkdir(parents=True)
        outside_path.write_text(
            _plan_text("done", ("review:cdd",)), encoding="utf-8",
        )
        cases = [
            ("Repo_X", PLAN_A, "review:cdd", "clean"),
            ("Repo_A", "../PLAN.txt", "review:cdd", "clean"),
            ("Repo_A", PLAN_A, "review:missing", "clean"),
            ("Repo_A", PLAN_A, "review:cdd", "pass"),
            ("Repo_A", PLAN_A, "hook-only", "pass"),
            ("Repo_A", PLAN_A, "backend-test", "success"),
            ("Repo_A", outside, "review:cdd", "clean"),
        ]
        for repo, plan, check, outcome in cases:
            with self.subTest(repo=repo, plan=plan, check=check, outcome=outcome):
                before = list(self.ingestor.inbox.glob("*.json"))
                code, stdout, stderr = self._run_recorder(
                    "--repo", repo, "--plan", plan,
                    "--check", check, "--outcome", outcome,
                )
                self.assertEqual(code, 2)
                self.assertEqual(stdout, "")
                self.assertIn("EVIDENCE ERROR", stderr)
                self.assertEqual(list(self.ingestor.inbox.glob("*.json")), before)

    def test_backend_rejects_forged_manual_source_before_database_insert (self) -> None:
        self._sync_plan(requirements=("hook-only",))
        value = {
            "schema_version": 1, "uid": str(uuid.uuid4()), "provider": "manual",
            "evidence_source": "manual", "kind": "check_finished",
            "ts": "2026-09-07T01:00:00Z", "delivery_class": "durable",
            "repo_ids": ["Repo_A"], "plan_repo_id": "Repo_A",
            "plan_file": PLAN_A, "check_id": "hook-only", "outcome": "pass",
        }
        self._publish_raw(value)
        result = self.ingestor.ingest_batch()
        self.assertEqual((result.inserted, result.rejected), (0, 1))
        self.assertEqual(db.get_activity_events(), [])

    def test_active_binding_finish_inheritance_and_registry_mismatch (self) -> None:
        plan_revision = self._sync_plan()
        start = self._ingest_one(self._hook_record("check_started"))
        self.assertEqual(
            (start["assignment_mode"], start["plan_repo_id"], start["plan_file"]),
            ("AUTO_ACTIVE", "Repo_A", PLAN_A),
        )
        self.assertEqual(start["plan_revision"], plan_revision)
        finish = self._ingest_one(self._hook_record(
            "check_finished", ts="2026-09-07T01:01:00Z", outcome="unknown",
        ))
        self.assertEqual(
            (finish["assignment_mode"], finish["plan_revision"], finish["outcome"]),
            ("AUTO_ACTIVE", plan_revision, "unknown"),
        )
        self.assertEqual(len(db.canonical_check_attempts("backend-test")), 1)

        mismatch_record = self._hook_record(
            "check_started", tool_use_id="tool-mismatch", revision="0" * 64,
        )
        mismatch = self._ingest_one(mismatch_record)
        self.assertEqual(mismatch["assignment_mode"], "UNASSIGNED")
        self.assertEqual(mismatch["check_revision"], "0" * 64)
        self.assertIsNone(mismatch["plan_file"])
        self.assertEqual(
            db.get_activity_counter("registry_revision_mismatch"), 1,
        )
        self._publish_raw(mismatch_record)
        duplicate = self.ingestor.ingest_batch()
        self.assertEqual(duplicate.duplicates, 1)
        self.assertEqual(
            db.get_activity_counter("registry_revision_mismatch"), 1,
        )

        multi = self._ingest_one(self._hook_record(
            "check_started", tool_use_id="tool-multi",
            repo_ids=["Repo_A", "Repo_B"],
        ))
        self.assertEqual(multi["assignment_mode"], "UNASSIGNED")

    def test_ambiguous_active_plans_remain_unassigned (self) -> None:
        self._sync_plan()
        self._sync_plan("temp/Plan/PLAN_Synthetic_B.txt")
        row = self._ingest_one(self._hook_record("check_started"))
        self.assertEqual(row["assignment_mode"], "UNASSIGNED")
        self.assertIsNone(row["plan_file"])

    def test_verifying_out_of_order_pair_dedup_and_append_only_assignment (self) -> None:
        self._sync_plan(status="done")
        finish = self._ingest_one(self._hook_record(
            "check_finished", ts="2026-09-07T01:02:00Z", outcome="pass",
        ))
        self.assertEqual(finish["assignment_mode"], "UNASSIGNED")
        start = self._ingest_one(self._hook_record(
            "check_started", ts="2026-09-07T01:01:00Z",
        ))
        self.assertEqual(start["assignment_mode"], "AUTO_VERIFYING")
        effective = db.effective_activity_binding(finish)
        self.assertEqual((effective["assignment_mode"], effective["plan_file"]),
                         ("AUTO_VERIFYING", PLAN_A))
        binding = db.get_plan_requirement_binding("Repo_A", PLAN_A, "backend-test")
        self.assertTrue(db.requirement_has_current_pass(binding))

        duplicate_start = self._ingest_one(self._hook_record(
            "check_started", ts="2026-09-07T01:03:00Z",
        ))
        duplicate_finish = self._ingest_one(self._hook_record(
            "check_finished", ts="2026-09-07T01:04:00Z", outcome="fail",
        ))
        attempt = db.canonical_check_attempts("backend-test")[0]
        self.assertEqual((attempt["start"]["id"], attempt["finish"]["id"]),
                         (start["id"], finish["id"]))
        with self.assertRaises(ValueError):
            db.append_activity_assignment(
                duplicate_start["id"], "Repo_A", PLAN_A, "assign",
                self.definitions, "2026-09-07T02:00:00Z",
            )
        with self.assertRaises(ValueError):
            db.append_activity_assignment(
                duplicate_finish["id"], "Repo_A", PLAN_A, "assign",
                self.definitions, "2026-09-07T02:00:00Z",
            )

        original = dict(finish)
        db.append_activity_assignment(
            finish["id"], "Repo_A", PLAN_A, "assign",
            self.definitions, "2026-09-07T02:01:00Z",
        )
        self.assertEqual(db.effective_activity_binding(start)["assignment_mode"],
                         "MANUAL_ASSIGNMENT")
        db.append_activity_assignment(
            start["id"], "Repo_A", None, "clear",
            self.definitions, "2026-09-07T02:02:00Z",
        )
        self.assertEqual(db.effective_activity_binding(finish)["assignment_mode"],
                         "UNASSIGNED")
        assignments = db.get_conn().execute(
            "SELECT * FROM activity_assignments ORDER BY id"
        ).fetchall()
        self.assertEqual([row["action"] for row in assignments], ["assign", "clear"])
        self.assertEqual(dict(db.get_conn().execute(
            "SELECT * FROM activity_events WHERE id = ?", (finish["id"],),
        ).fetchone()), original)

        later = self._ingest_one(self._hook_record(
            "check_started", tool_use_id="tool-2", ts="2026-09-07T03:00:00Z",
        ))
        self.assertEqual(later["assignment_mode"], "AUTO_VERIFYING")

    def test_current_pass_prevents_redundant_auto_verifying_selection (self) -> None:
        self._sync_plan(status="done")
        self._ingest_one(self._hook_record("check_started"))
        self._ingest_one(self._hook_record(
            "check_finished", ts="2026-09-07T01:01:00Z", outcome="pass",
        ))
        later = self._ingest_one(self._hook_record(
            "check_started", tool_use_id="tool-2", ts="2026-09-07T02:00:00Z",
        ))
        self.assertEqual(later["assignment_mode"], "UNASSIGNED")

    def test_assigned_finish_without_start_does_not_suppress_verification (self) -> None:
        self._sync_plan(status="done")
        finish = self._ingest_one(self._hook_record(
            "check_finished", ts="2026-09-07T01:01:00Z", outcome="pass",
        ))
        db.append_activity_assignment(
            finish["id"], "Repo_A", PLAN_A, "assign", self.definitions,
            "2026-09-07T01:02:00Z",
        )
        binding = db.get_plan_requirement_binding("Repo_A", PLAN_A, "backend-test")
        self.assertFalse(db.requirement_has_current_pass(binding))
        start = self._ingest_one(self._hook_record(
            "check_started", tool_use_id="tool-2", ts="2026-09-07T02:00:00Z",
        ))
        self.assertEqual(start["assignment_mode"], "AUTO_VERIFYING")

    def test_plan_and_check_revision_changes_leave_prior_evidence_staleable (self) -> None:
        first_plan_revision = self._sync_plan()
        row = self._ingest_one(self._hook_record("check_started"))
        old_requirement_revision = row["requirement_revision"]

        second_plan_revision = self._sync_plan(
            revision_at="2026-09-07T02:00:00Z", suffix="\n",
        )
        current = db.get_plan_requirement_binding("Repo_A", PLAN_A, "backend-test")
        self.assertNotEqual(first_plan_revision, second_plan_revision)
        self.assertEqual(row["plan_revision"], first_plan_revision)
        self.assertEqual(current["plan_revision"], second_plan_revision)

        changed = [{
            "id": "backend-test", "label": "Backend test",
            "repo_ids": ["Repo_A", "Repo_B"], "cwd": ".",
            "commands": ["python changed_verify.py"], "accepted_exit_codes": [0],
            "evidence_sources": ["hook", "manual"],
        }]
        self._write_checks(changed)
        new_definitions = load_check_registry(self.checks_path, {"Repo_A", "Repo_B"})
        self._sync_plan(
            revision_at="2026-09-07T03:00:00Z", suffix="\n",
            definitions=new_definitions,
        )
        newest = db.get_plan_requirement_binding("Repo_A", PLAN_A, "backend-test")
        self.assertNotEqual(row["check_revision"], new_definitions[0].revision)
        self.assertNotEqual(old_requirement_revision, newest["requirement_revision"])
        with self.assertRaises(ValueError):
            db.append_activity_assignment(
                row["id"], "Repo_A", PLAN_A, "assign", new_definitions,
                "2026-09-07T04:00:00Z",
            )


if __name__ == "__main__":
    unittest.main()
