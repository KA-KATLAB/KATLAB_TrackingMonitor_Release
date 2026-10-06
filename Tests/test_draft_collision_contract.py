"""Admitted display collisions through actual parsing, resolver, SQL and API."""

from contextlib import contextmanager
from dataclasses import asdict
import json
from pathlib import PurePosixPath
import sqlite3
import unittest
from unittest.mock import patch

from Backend.app import db
from Backend.app.api import routes
from Backend.app.plan_parser import parse_plan_text
from Backend.app.resolver import resolve, task_ref


PLAN_FIRST = "temp/Plan/PLAN_A.txt"
PLAN_SECOND = "temp/Plan/PLAN_A.txt - PLAN_B.txt"
SPECS = (
    (PLAN_FIRST, "PLAN_B.txt - A.1", "Touched task", "src/first.ts"),
    (PLAN_SECOND, "A.1", "Untouched task", "src/second.ts"),
)


def parsed_tasks ():
    rows = []
    for plan, task_id, title, file in SPECS:
        text = (f'<task id="{task_id}">\n<title>{title}</title>\n'
                f'<status>done</status>\n<files>\n{file}\n</files>\n</task>\n')
        parsed = parse_plan_text(text, source=plan)
        if parsed.fatal or parsed.warnings or len(parsed.tasks) != 1:
            raise AssertionError("Both collision plans must be admitted without warnings")
        rows.append((plan, parsed.tasks[0]))
    return rows


@contextmanager
def memory_contract ():
    """Patch only the two approved reads; never create the configured connection."""
    connection = sqlite3.connect(":memory:")
    connection.row_factory = sqlite3.Row
    original_conn, original_activity = db.get_conn, db.get_task_activity
    try:
        connection.executescript(db.SCHEMA_PATH.read_text(encoding="utf-8"))
        with patch.object(db, "get_conn", return_value=connection), patch.object(
                db, "get_task_activity", return_value={}):
            yield connection
    finally:
        connection.close()
        if db.get_conn is not original_conn or db.get_task_activity is not original_activity:
            raise AssertionError("Controlled patches were not restored")


class DraftCollisionContractTests(unittest.TestCase):
    def test_actual_parser_admits_both_txt_paths_and_nonconventional_ids (self):
        rows = parsed_tasks()
        self.assertTrue(all(PurePosixPath(plan).match("temp/Plan/PLAN_*.txt")
                            for plan, _ in rows))
        self.assertEqual([task.id for _, task in rows], ["PLAN_B.txt - A.1", "A.1"])
        self.assertEqual(len({(plan, task.id) for plan, task in rows}), 2)
        # Letter-group IDs are a convention, not a parser validation boundary.
        self.assertEqual(task_ref({"plan_file": rows[0][0], "task_id": rows[0][1].id}),
                         task_ref({"plan_file": rows[1][0], "task_id": rows[1][1].id}))

    def test_unique_resolver_keys_coexist_with_equal_actual_api_labels_and_db_order (self):
        parsed = parsed_tasks()
        resolver_rows = [{"plan_file": plan, "task_id": task.id,
                          "status": task.status, "files": task.files}
                         for plan, task in parsed]
        before = json.dumps(resolver_rows, sort_keys=True)
        with memory_contract ():
            # Reverse insertion deliberately; the actual SQL controls API order.
            for plan, task in reversed(parsed):
                db.sync_plan_tasks("Repo_A", plan, [asdict(task)])
            actual_db = db.get_tasks("Repo_A")
            self.assertEqual([(row["plan_file"], row["task_id"]) for row in actual_db],
                             [(PLAN_FIRST, "PLAN_B.txt - A.1"), (PLAN_SECOND, "A.1")])
            response = routes.list_tasks(None, repo="Repo_A")
            self.assertIs(response["success"], True)
            tasks = response["data"]
            self.assertEqual(len(tasks), 2)
            self.assertEqual(tasks[0]["task_ref"], tasks[1]["task_ref"])
            self.assertEqual([row["title"] for row in tasks], ["Touched task", "Untouched task"])
            self.assertEqual([row["why"] for row in tasks], ["Touched task", "Untouched task"])
            self.assertTrue(all(row["last_event_ts"] is None for row in tasks))
            for index, file in enumerate(("src/first.ts", "src/second.ts")):
                resolved = resolve(file, resolver_rows)
                self.assertEqual(resolved.mode, "B")
                self.assertIsNone(resolved.candidates)
                self.assertIsNone(resolved.candidate_keys)
                self.assertEqual((resolved.plan_file, resolved.task_id),
                                 (tasks[index]["plan_file"], tasks[index]["task_id"]))
                self.assertEqual(resolved.task_ref, tasks[index]["task_ref"])
        self.assertEqual(json.dumps(resolver_rows, sort_keys=True), before)

    def test_actual_sql_and_api_keep_repository_scope_and_empty_shape (self):
        with memory_contract ():
            for plan, task in parsed_tasks():
                db.sync_plan_tasks("Repo_A", plan, [asdict(task)])
            foreign = asdict(parsed_tasks()[0][1])
            foreign["title"] = "Other repository"
            db.sync_plan_tasks("Repo_B", PLAN_FIRST, [foreign])
            scoped = routes.list_tasks(None, repo="Repo_A")["data"]
            self.assertEqual(len(scoped), 2)
            self.assertTrue(all(row["repo"] == "Repo_A" for row in scoped))
            self.assertEqual(routes.list_tasks(None, repo="unknown")["data"], [])
            all_rows = routes.list_tasks(None)["data"]
            self.assertEqual([row["repo"] for row in all_rows], ["Repo_A", "Repo_A", "Repo_B"])

    def test_memory_connection_closes_and_patches_restore_even_on_failure (self):
        original_conn, original_activity = db.get_conn, db.get_task_activity
        with self.assertRaisesRegex(RuntimeError, "Controlled failure"):
            with memory_contract () as connection:
                self.assertIs(db.get_conn(), connection)
                raise RuntimeError("Controlled failure")
        self.assertIs(db.get_conn, original_conn)
        self.assertIs(db.get_task_activity, original_activity)
        with self.assertRaises(sqlite3.ProgrammingError):
            connection.execute("SELECT 1")


if __name__ == "__main__":
    unittest.main()
