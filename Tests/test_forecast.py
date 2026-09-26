"""Bounded, read-only Mission attribution forecast regression tests."""

import json
import sqlite3
import unittest
from pathlib import Path
from unittest.mock import patch

from Backend.app import db, forecast
from Backend.app.resolver import glob_to_regex


TS = "2026-09-25T12:34:56.123456Z"
PLAN = "temp/Plan/PLAN_Test.txt"
SCOPE = {"total_repos": 1, "returned_repos": 1, "truncated": False}


def prepared (paths=(), *, repo="Repo_A", source="working_tree",
              branch="develop") -> forecast.PreparedRepo:
    return forecast.prepare_repo(
        repo,
        {"status_valid": True, "paths_complete": True,
         "observed_at": TS, "branch": branch},
        tuple(paths), offline=False, source=source,
    )


def context (tasks=(), *, plans=None) -> db.ForecastContext:
    if plans is None:
        plans = ({"plan_file": PLAN, "parse_state": "valid"},)
    return db.ForecastContext(
        plans=tuple(plans),
        tasks=tuple({"plan_file": row.get("plan_file", PLAN),
                     "task_id": row["task_id"], "status": row["status"],
                     "files_json": json.dumps(row["files"])}
                    for row in tasks),
    )


def task (task_id: str, status: str, files: list[str],
          plan_file: str = PLAN) -> dict:
    return {"plan_file": plan_file, "task_id": task_id,
            "status": status, "files": files}


def build (paths, tasks=(), *, plans=None) -> dict:
    batch = forecast.ForecastBatch(SCOPE, [prepared(paths)])
    batch.build_ready(0, context(tasks, plans=plans), TS)
    return batch.finish()["forecast"][0]


class ForecastInputTests(unittest.TestCase):
    def test_all_five_modes_and_structured_candidates (self) -> None:
        first = task("A", "pending", ["b/*", "scoped/*", "amb/*"])
        active = task("B", "in-progress", ["scoped/*"])
        second = task("C", "pending", ["amb/*"])
        row = build(
            ("b/one", "scoped/one", "amb/one", "elsewhere/one"),
            (first, active, second),
        )
        self.assertEqual([item["mode"] for item in row["items"]],
                         ["B", "A_SCOPED", "AMBIGUOUS", "A_GLOBAL"])
        self.assertEqual(row["mode_counts"], {
            "B": 1, "A_SCOPED": 1, "A_GLOBAL": 1,
            "AMBIGUOUS": 1, "UNKNOWN": 0,
        })
        self.assertEqual(row["items"][0]["target"],
                         {"plan_file": PLAN, "task_id": "A"})
        self.assertEqual(row["items"][2]["candidate_count"], 2)
        self.assertEqual(row["items"][2]["candidates"], [
            {"plan_file": PLAN, "task_id": "A"},
            {"plan_file": PLAN, "task_id": "C"},
        ])
        self.assertIsNone(row["items"][2]["target"])
        self.assertEqual(build(("unknown",))["items"][0]["mode"], "UNKNOWN")

    def test_ambiguous_candidate_limit_and_collision (self) -> None:
        collision = (
            task("A", "pending", ["src/*"], "temp/P - Q"),
            task("Q - A", "pending", ["src/*"], "temp/P"),
        )
        row = build(("src/a",), collision, plans=(
            {"plan_file": "temp/P - Q", "parse_state": "valid"},
            {"plan_file": "temp/P", "parse_state": "valid"},
        ))
        keys = [(c["plan_file"], c["task_id"])
                for c in row["items"][0]["candidates"]]
        self.assertEqual(len(set(keys)), 2)
        self.assertEqual([" - ".join(key) for key in keys],
                         ["temp/P - Q - A", "temp/P - Q - A"])

        many = [task(f"A.{i:02d}", "pending", ["src/*"])
                for i in range(11)]
        item = build(("src/a",), many)["items"][0]
        self.assertEqual(item["candidate_count"], 11)
        self.assertEqual(len(item["candidates"]), 10)
        self.assertTrue(item["candidates_truncated"])

    def test_clean_zero_plan_skips_tasks_and_warning_health (self) -> None:
        value = db.ForecastContext(plans=(), tasks=None)
        batch = forecast.ForecastBatch(SCOPE, [prepared(())])
        batch.build_ready(0, value, TS)
        row = batch.finish()["forecast"][0]
        self.assertEqual(row["state"], "ready")
        self.assertEqual(row["plan_context_state"], "valid")
        self.assertEqual(row["total_paths"], 0)
        self.assertEqual(row["items"], [])
        self.assertEqual(sum(row["mode_counts"].values()), 0)

        warning = build((), plans=({"plan_file": PLAN,
                                    "parse_state": "warning"},))
        self.assertEqual(warning["state"], "ready")
        self.assertEqual(warning["plan_context_state"], "warning")
        fatal = build((), plans=({"plan_file": PLAN,
                                  "parse_state": "fatal"},))
        self.assertEqual(fatal["reason"], "plan_context_unavailable")
        self.assertIsNone(fatal["total_paths"])

    def test_status_path_and_timestamp_gates (self) -> None:
        cases = [
            ({"status_valid": False, "paths_complete": True,
              "observed_at": TS}, ("src/a",), "status_unavailable"),
            ({"status_valid": True, "paths_complete": False,
              "observed_at": TS}, ("src/a",), "status_unavailable"),
            ({"status_valid": True, "paths_complete": True,
              "observed_at": "2026-02-30T00:00:00Z"}, ("src/a",),
             "status_unavailable"),
        ]
        for status, paths, reason in cases:
            value = forecast.prepare_repo(
                "Repo_A", status, paths, offline=False, source="working_tree",
            )
            self.assertEqual(value.row["reason"], reason)
            self.assertIsNone(value.row["observed_at"])
            self.assertIsNone(value.row["branch"])

        value = forecast.prepare_repo(
            "Repo_A", None, ("src/a",), offline=True, source="working_tree",
        )
        self.assertEqual(value.row["reason"], "offline")
        self.assertFalse(value.eligible)
        self.assertEqual(prepared(()).row["source"], "working_tree")
        self.assertEqual(prepared((), source="demo").row["source"], "demo")

        many = prepared(tuple(f"src/{i}" for i in range(1001)))
        self.assertEqual(many.row["reason"], "too_many_paths")
        self.assertEqual(prepared(("a" * 4097,)).row["reason"],
                         "too_much_work")
        # The cheap code-point prebound wins before lexical checks on an
        # oversized path; an in-bound absolute path is invalid status.
        self.assertEqual(prepared(("/" + "a" * 4096,)).row["reason"],
                         "too_much_work")
        self.assertEqual(prepared(("/a",)).row["reason"],
                         "status_unavailable")
        self.assertEqual(prepared(("é" * 2049,)).row["reason"],
                         "too_much_work")
        self.assertTrue(prepared(("é" * 2048,)).eligible)
        self.assertEqual(prepared(("a//b",)).row["reason"],
                         "status_unavailable")

    def test_path_identity_and_time_validation (self) -> None:
        for bad in ("", "/a", "C:/a", "a\\b", "a/../b", "a/./b",
                    "a//b", "a/", "a\x7fb", "a\x00b", "\ud800"):
            self.assertFalse(forecast._valid_path(bad, 4096), repr(bad))
        self.assertTrue(forecast._valid_path("tài liệu/📈.txt", 4096))
        self.assertTrue(forecast._valid_task_id("Q - A"))
        for bad in ("", " A", "A ", "A\nB", "\ud800"):
            self.assertFalse(forecast._valid_task_id(bad))
        for value in ("0001-01-01T00:00:00Z", "0099-12-31T23:59:59Z",
                      "0100-01-01T00:00:00Z", "9999-12-31T23:59:59Z",
                      "2024-02-29T12:34:56.123456Z"):
            self.assertTrue(forecast.valid_timestamp(value), value)
        for value in ("0000-01-01T00:00:00Z", "10000-01-01T00:00:00Z",
                      "2025-02-29T00:00:00Z", "2026-01-01T24:00:00Z",
                      "2026-01-01T00:00:00+00:00",
                      "2026-01-01T00:00:00.1234567Z"):
            self.assertFalse(forecast.valid_timestamp(value), value)

    def test_pattern_compatibility_and_fail_closed_context (self) -> None:
        admitted = ["../x", "./x", "a//b", "a\\b", "src/*"]
        row = build(("src/x",), (task("A", "pending", admitted),))
        self.assertEqual(row["items"][0]["mode"], "B")
        for bad in ("", " src/*", "src/* ", "/abs", "C:/abs",
                    "src/\nx", "\ud800"):
            row = build(("src/x",), (task("A", "pending", [bad]),))
            self.assertEqual(row["reason"], "plan_context_unavailable", bad)
        row = build(("src/x",),
                    (task("A", "pending", ["a" * 513]),))
        self.assertEqual(row["reason"], "too_much_work")
        row = build(("src/x",), (task("A", "pending", ["src/*"],
                                      "temp/Other.txt"),))
        self.assertEqual(row["reason"], "plan_context_unavailable")
        row = build(("src/x",), (task("A", "in_progress", ["src/*"]),))
        self.assertEqual(row["reason"], "plan_context_unavailable")
        row = build(("src/x",), (task("", "done", ["src/*"]),))
        self.assertEqual(row["reason"], "plan_context_unavailable")
        row = build(("src/x",), (task("A", "done", ["src/*"]),),
                    plans=())
        self.assertEqual(row["reason"], "plan_context_unavailable")

    def test_guard_time_and_reprice_after_partial_rows (self) -> None:
        batch = forecast.ForecastBatch(SCOPE, [prepared(("src/x",))])
        batch.build_ready(0, context((task("A", "done", ["src/*"]),)), TS)
        self.assertEqual(batch.finish()["forecast"][0]["total_paths"], 1)
        batch.mark_unavailable(0, "plan_context_unavailable")
        first = batch.finish()
        self.assertEqual(first, batch.finish())
        self.assertEqual(first["forecast"][0]["items"], [])
        self.assertIsNone(first["forecast"][0]["total_paths"])

        batch = forecast.ForecastBatch(SCOPE, [prepared(())])
        batch.build_ready(0, db.ForecastContext(plans=()), "not-a-time")
        self.assertEqual(batch.finish()["forecast"][0]["reason"],
                         "plan_context_unavailable")
        self.assertEqual(batch.finish()["forecast"][0]["observed_at"], TS)

    def test_preflight_budget_rejects_before_resolve (self) -> None:
        exact_rows = [task(f"A.{i:03d}", "pending", ["src/*"])
                      for i in range(25)]
        exact_paths = tuple(f"src/{i}" for i in range(1000))
        self.assertEqual(len(exact_paths) * (3 * len(exact_rows) + 25),
                         100000)
        with patch.object(forecast, "resolve", wraps=forecast.resolve) as resolver:
            batch = forecast.ForecastBatch(SCOPE, [prepared(exact_paths)])
            batch.build_ready(0, context(exact_rows), TS)
            self.assertEqual(batch.finish()["forecast"][0]["state"], "ready")
            self.assertEqual(resolver.call_count, 1000)

        over_rows = [task(f"A.{i:03d}", "pending", ["src/*"] * 32)
                     for i in range(255)]
        over_rows.append(task("A.255", "pending", ["src/*"] * 163))
        over_paths = tuple(f"src/{i}" for i in range(11))
        self.assertEqual(len(over_paths) * (
            3 * len(over_rows) + sum(len(row["files"]) for row in over_rows)
        ), 100001)
        with patch.object(forecast, "resolve") as resolver:
            batch = forecast.ForecastBatch(SCOPE, [prepared(over_paths)])
            batch.build_ready(0, context(over_rows), TS)
            self.assertEqual(batch.finish()["forecast"][0]["reason"],
                             "too_much_work")
            resolver.assert_not_called()

    def test_exact_size_accounting_and_fallback (self) -> None:
        one = prepared(("src/x",))
        reference = forecast.ForecastBatch(SCOPE, [one])
        reference.build_ready(0, context((task("A", "done", ["src/*"]),)), TS)
        exact = reference._size
        with patch.object(forecast, "MAX_JSON_BYTES", exact):
            accepted = forecast.ForecastBatch(SCOPE, [one])
            accepted.build_ready(0, context((task("A", "done", ["src/*"]),)), TS)
            self.assertEqual(accepted.finish()["forecast"][0]["state"],
                             "ready")
        with patch.object(forecast, "MAX_JSON_BYTES", exact - 1):
            rejected = forecast.ForecastBatch(SCOPE, [one])
            rejected.build_ready(0, context((task("A", "done", ["src/*"]),)), TS)
            self.assertEqual(rejected.finish()["forecast"][0]["reason"],
                             "too_much_work")

        empty_branch_size = forecast.ForecastBatch(
            SCOPE, [prepared((), branch="")],
        )._size
        boundary_length = forecast.MAX_JSON_BYTES - empty_branch_size
        at_cap = forecast.ForecastBatch(
            SCOPE, [prepared((), branch="x" * boundary_length)],
        )
        self.assertEqual(at_cap._size, forecast.MAX_JSON_BYTES)
        self.assertEqual(at_cap.finish()["forecast"][0]["reason"], "busy")
        over_cap = forecast.ForecastBatch(
            SCOPE, [prepared((), branch="x" * (boundary_length + 1))],
        )
        with self.assertRaises(forecast.ForecastPayloadError):
            over_cap.finish()
        inconsistent = forecast.ForecastBatch(SCOPE, [prepared(())])
        inconsistent._size += 1
        with self.assertRaises(forecast.ForecastPayloadError):
            inconsistent.finish()

    def test_decimal_count_transitions_keep_exact_charge (self) -> None:
        for count in (9, 10, 99, 100, 999, 1000):
            paths = tuple(f"src/{i}" for i in range(count))
            batch = forecast.ForecastBatch(SCOPE, [prepared(paths)])
            batch.build_ready(0, db.ForecastContext(plans=(), tasks=()), TS)
            result = batch.finish()
            self.assertEqual(result["forecast"][0]["total_paths"], count)
            self.assertEqual(result["forecast"][0]["mode_counts"]["UNKNOWN"],
                             count)
            self.assertEqual(batch._size, forecast._json_size(result))

    def test_matcher_budget_exact_cap_and_lowered_cap (self) -> None:
        path = "a" * 3999
        patterns = ["*" + "z" * 498] * 5
        projected = (len(path.encode("utf-8")) + 1) * sum(
            len(pattern.encode("utf-8")) + 1 for pattern in patterns
        )
        self.assertEqual(projected, 10_000_000)
        value = context((task("A", "pending", patterns),))
        batch = forecast.ForecastBatch(SCOPE, [prepared((path,))])
        batch.build_ready(0, value, TS)
        self.assertEqual(batch.finish()["forecast"][0]["state"], "ready")
        with patch.object(forecast, "MAX_MATCHER_VISITS", projected - 1):
            batch = forecast.ForecastBatch(SCOPE, [prepared((path,))])
            with patch.object(forecast, "resolve") as resolver:
                batch.build_ready(0, value, TS)
                resolver.assert_not_called()
            self.assertEqual(batch.finish()["forecast"][0]["reason"],
                             "too_much_work")

    def test_literal_heavy_context_preserves_resolution (self) -> None:
        declared, scoped, ambiguous, global_path = (
            "src/" + marker * 496 for marker in "bsmg"
        )
        tasks = (
            task("B", "done", [declared]),
            task("S", "pending", [scoped]),
            task("A", "in-progress", [scoped]),
            task("M1", "done", [ambiguous]),
            task("M2", "pending", [ambiguous]),
        )
        paths = (declared, scoped, ambiguous, global_path) + tuple(
            "other/" + str(index) + "q" * 993 for index in range(6)
        )
        old_projection = sum(len(path.encode("utf-8")) + 1 for path in paths) * sum(
            len(pattern.encode("utf-8")) + 1
            for entry in tasks for pattern in entry["files"]
        )
        self.assertGreater(old_projection, forecast.MAX_MATCHER_VISITS)

        with patch.object(forecast, "deterministic_glob_match") as nfa:
            row = build(paths, tasks)
            nfa.assert_not_called()
        self.assertEqual(row["state"], "ready")
        self.assertEqual([item["mode"] for item in row["items"]],
                         ["B", "A_SCOPED", "AMBIGUOUS"]
                         + ["A_GLOBAL"] * 7)
        self.assertEqual([row["items"][i]["target"]["task_id"] for i in (0, 1, 3)],
                         ["B", "A", "A"])
        self.assertEqual([item["task_id"] for item in row["items"][2]["candidates"]],
                         ["M1", "M2"])

    def test_literal_regex_metacharacters_and_unicode (self) -> None:
        paths = ("src/[x].py", "src/(x)+$.py", "src/é📈.py", "src/other.py")
        tasks = tuple(task(f"A.{index}", "done", [path])
                      for index, path in enumerate(paths[:3]))
        for entry in tasks:
            pattern = entry["files"][0]
            for path in paths:
                self.assertEqual(pattern == path,
                                 bool(glob_to_regex(pattern).match(path)))
        with patch.object(forecast, "deterministic_glob_match") as nfa:
            row = build(paths, tasks)
            nfa.assert_not_called()
        self.assertEqual([item["mode"] for item in row["items"]],
                         ["B", "B", "B", "UNKNOWN"])

    def test_mixed_literal_wildcard_budget_and_cumulative_reservation (self) -> None:
        path = "src/x"
        tasks = (task("A", "pending", ["src/y", "src/*"]),)
        projected = (len("src/y".encode("utf-8")) + 1) + (
            (len(path.encode("utf-8")) + 1)
            * (len("src/*".encode("utf-8")) + 1)
        )
        self.assertEqual(projected, 42)
        with patch.object(forecast, "MAX_MATCHER_VISITS", projected):
            row = build((path,), tasks)
            self.assertEqual(row["items"][0]["mode"], "B")
        with patch.object(forecast, "MAX_MATCHER_VISITS", projected - 1):
            with patch.object(forecast, "resolve") as resolver:
                row = build((path,), tasks)
                resolver.assert_not_called()
            self.assertEqual(row["reason"], "too_much_work")

        scope = {"total_repos": 2, "returned_repos": 2, "truncated": False}
        repos = [prepared((path,), repo="Repo_A"),
                 prepared((path,), repo="Repo_B")]
        with patch.object(forecast, "MAX_MATCHER_VISITS", 2 * projected):
            batch = forecast.ForecastBatch(scope, repos)
            batch.build_ready(0, context(tasks), TS)
            batch.build_ready(1, context(tasks), TS)
            self.assertEqual([row["state"] for row in batch.finish()["forecast"]],
                             ["ready", "ready"])
            self.assertEqual(batch._matcher_visits, 2 * projected)
        with patch.object(forecast, "MAX_MATCHER_VISITS", 2 * projected - 1):
            batch = forecast.ForecastBatch(scope, repos)
            with patch.object(forecast, "resolve", wraps=forecast.resolve) as resolver:
                batch.build_ready(0, context(tasks), TS)
                batch.build_ready(1, context(tasks), TS)
                self.assertEqual(resolver.call_count, 1)
            self.assertEqual([row["state"] for row in batch.finish()["forecast"]],
                             ["ready", "unavailable"])
            self.assertEqual(batch.rows[1]["reason"], "too_much_work")


class ForecastDatabaseTests(unittest.TestCase):
    def setUp (self) -> None:
        self.conn = sqlite3.connect(":memory:")
        self.conn.row_factory = sqlite3.Row
        schema = Path(db.__file__).with_name("schema.sql")
        self.conn.executescript(schema.read_text(encoding="utf-8"))
        self.patcher = patch.object(db, "get_conn", return_value=self.conn)
        self.patcher.start()

    def tearDown (self) -> None:
        self.patcher.stop()
        self.conn.close()

    def add_plan (self, name=PLAN, state="valid") -> None:
        self.conn.execute(
            "INSERT INTO plan_snapshots VALUES (?, ?, ?, ?, ?, ?, ?)",
            ("Repo_A", name, "sha", TS, state, "[]", TS),
        )
        self.conn.commit()

    def add_task (self, task_id="A", files=None,
                  status="in-progress", plan_file=PLAN) -> None:
        self.conn.execute(
            "INSERT INTO tasks VALUES (?, ?, ?, ?, ?, ?, ?)",
            ("Repo_A", plan_file, task_id, "title", status,
             json.dumps(["src/*"] if files is None else files), "why"),
        )
        self.conn.commit()

    def test_one_snapshot_and_clean_task_skip (self) -> None:
        self.add_plan()
        self.add_task()
        clean = db.capture_forecast_contexts({"Repo_A": False})["Repo_A"]
        self.assertEqual(len(clean.plans), 1)
        self.assertIsNone(clean.tasks)
        self.assertFalse(self.conn.in_transaction)
        dirty = db.capture_forecast_contexts({"Repo_A": True})["Repo_A"]
        self.assertEqual(len(dirty.tasks or ()), 1)
        self.assertFalse(self.conn.in_transaction)

    def test_streaming_caps_and_projected_null (self) -> None:
        for i in range(257):
            self.add_plan(f"temp/Plan/{i:03d}.txt")
        self.assertEqual(db.capture_forecast_contexts({"Repo_A": False})[
            "Repo_A"].reason, "too_much_work")
        self.assertFalse(self.conn.in_transaction)
        self.conn.execute("DELETE FROM plan_snapshots")
        self.conn.commit()
        self.add_plan()
        self.add_task(files=["x" * 9000])
        value = db.capture_forecast_contexts({"Repo_A": True})["Repo_A"]
        self.assertEqual(value.reason, "plan_context_unavailable")
        self.assertFalse(self.conn.in_transaction)

    def test_early_corruption_wins_before_later_row_or_byte_excess (self) -> None:
        self.add_plan("temp/../bad.txt")
        for i in range(256):
            self.add_plan(f"temp/Plan/{i:03d}.txt")
        self.assertEqual(db.capture_forecast_contexts({"Repo_A": False})[
            "Repo_A"].reason, "plan_context_unavailable")
        self.conn.execute("DELETE FROM plan_snapshots")
        self.conn.commit()

        self.add_plan()
        self.add_task("A.000", status="in_progress")
        for i in range(1, 257):
            self.add_task(f"A.{i:03d}")
        self.assertEqual(db.capture_forecast_contexts({"Repo_A": True})[
            "Repo_A"].reason, "plan_context_unavailable")
        self.conn.execute("DELETE FROM tasks")
        self.conn.commit()

        self.add_task("A.000", status="in_progress")
        long_row = ["a" * 300] * 25
        for i in range(1, 36):
            self.add_task(f"A.{i:03d}", files=long_row)
        self.assertEqual(db.capture_forecast_contexts({"Repo_A": True})[
            "Repo_A"].reason, "plan_context_unavailable")
        self.assertFalse(self.conn.in_transaction)

    def test_task_cap_and_malformed_status (self) -> None:
        self.add_plan()
        for i in range(257):
            self.add_task(f"A.{i:03d}")
        self.assertEqual(db.capture_forecast_contexts({"Repo_A": True})[
            "Repo_A"].reason, "too_much_work")
        self.conn.execute("DELETE FROM tasks WHERE task_id = 'A.256'")
        self.conn.execute("UPDATE tasks SET status = 'in_progress' "
                          "WHERE task_id = 'A.000'")
        self.conn.commit()
        value = db.capture_forecast_contexts({"Repo_A": True})["Repo_A"]
        self.assertEqual(value.reason, "plan_context_unavailable")

    def test_task_json_aggregate_exact_cap_and_plus_one (self) -> None:
        self.add_plan()
        rows = []
        for i in range(31):
            rows.append(("Repo_A", PLAN, f"A.{i:03d}", "title", "done",
                         '["a"]' + " " * (8192 - 5), "why"))
        rows.extend([
            ("Repo_A", PLAN, "A.031", "title", "done",
             '["a"]' + " " * (8190 - 5), "why"),
            ("Repo_A", PLAN, "A.032", "title", "done", "[]", "why"),
        ])
        self.conn.executemany("INSERT INTO tasks VALUES (?, ?, ?, ?, ?, ?, ?)",
                              rows)
        self.conn.commit()
        value = db.capture_forecast_contexts({"Repo_A": True})["Repo_A"]
        self.assertIsNone(value.reason)
        self.assertEqual(len(value.tasks or ()), 33)
        self.conn.execute("UPDATE tasks SET files_json = files_json || ' ' "
                          "WHERE task_id = 'A.031'")
        self.conn.commit()
        over = db.capture_forecast_contexts({"Repo_A": True})["Repo_A"]
        self.assertEqual(over.reason, "too_much_work")
        self.assertFalse(self.conn.in_transaction)

    def test_per_repo_query_failure_is_isolated_and_releases_snapshot (self) -> None:
        self.add_plan()
        with patch.object(db, "_forecast_task_rows",
                          side_effect=sqlite3.OperationalError("test")):
            contexts = db.capture_forecast_contexts({
                "Repo_A": True, "Repo_B": False,
            })
        self.assertEqual(contexts["Repo_A"].reason,
                         "plan_context_unavailable")
        self.assertIsNone(contexts["Repo_B"].reason)
        self.assertFalse(self.conn.in_transaction)


if __name__ == "__main__":
    unittest.main()
