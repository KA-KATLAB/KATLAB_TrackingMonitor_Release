"""Actual warning producer precision and raw projection, without startup or DB."""

import ast
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
import unittest


ROOT = Path(__file__).resolve().parents[1]


def source_tree (relative):
    return ast.parse((ROOT / relative).read_text(encoding="utf-8"))


def named (nodes, kind, name):
    matches = [node for node in nodes if isinstance(node, kind) and node.name == name]
    if len(matches) != 1:
        raise AssertionError(f"one complete actual source owner: {name}")
    return matches[0]


class WarningTimestampContractTests(unittest.TestCase):
    def producer (self, values):
        tree = source_tree("Backend/app/watcher.py")
        now = named(tree.body, ast.FunctionDef, "_now_z")
        tracker = named(tree.body, ast.ClassDef, "Tracker")
        warn = named(tracker.body, ast.FunctionDef, "_warn")
        iterator = iter(values)

        class ControlledClock:
            @classmethod
            def now (cls, tz):
                self.assertIs(tz, timezone.utc)
                value = next(iterator)
                self.assertIs(value.tzinfo, timezone.utc)
                return value

        messages = []
        env = {"datetime": ControlledClock, "timezone": timezone, "deque": deque,
               "log": SimpleNamespace(warning=lambda *args: messages.append(args))}
        exec(compile(ast.Module(body=[now, warn], type_ignores=[]), "actual_warning_producer", "exec"), env)
        return env["_warn"], SimpleNamespace(warnings={}), messages

    def test_complete_actual_producer_preserves_bare_and_six_microsecond_digits (self):
        values = [datetime(2026, 10, 6, 12, 34, 56, microsecond, tzinfo=timezone.utc)
                  for microsecond in (0, 1, 4, 100000, 999999)]
        warn, tracker, messages = self.producer(values)
        for index in range(len(values)):
            warn(tracker, "Fixture", f"warning {index}")
        self.assertEqual(list(tracker.warnings["Fixture"]), [
            {"ts": f"2026-10-06T12:34:56{suffix}", "message": f"warning {index}"}
            for index, suffix in enumerate(("Z", ".000001Z", ".000004Z", ".100000Z", ".999999Z"))
        ])
        self.assertEqual(tracker.warnings["Fixture"].maxlen, 50)
        self.assertEqual(len(messages), 5)

    def test_complete_actual_warning_queue_retains_latest_fifty_per_repository (self):
        clock = datetime(2026, 10, 6, tzinfo=timezone.utc)
        warn, tracker, _ = self.producer([clock] * 55)
        for index in range(54):
            warn(tracker, "A", str(index))
        warn(tracker, "B", "independent")
        self.assertEqual([row["message"] for row in tracker.warnings["A"]], list(map(str, range(4, 54))))
        self.assertEqual({row["ts"] for row in tracker.warnings["A"]}, {"2026-10-06T00:00:00Z"})
        self.assertEqual(list(tracker.warnings["B"]), [{"ts": "2026-10-06T00:00:00Z", "message": "independent"}])

    def test_actual_plan_revision_chain_and_repos_projection_keep_raw_timestamps (self):
        watcher = source_tree("Backend/app/watcher.py")
        tracker = named(watcher.body, ast.ClassDef, "Tracker")
        parse = named(tracker.body, ast.FunctionDef, "_parse_one_plan")
        calls = [node for node in ast.walk(parse) if isinstance(node, ast.Call)
                 and ast.unparse(node.func) == "db.sync_plan_snapshot"]
        self.assertEqual(len(calls), 1)
        self.assertEqual(ast.unparse(calls[0].args[4]), "_now_z()")
        db = source_tree("Backend/app/db.py")
        sync = named(db.body, ast.FunctionDef, "sync_plan_snapshot")
        assignment = [node for node in sync.body if isinstance(node, ast.Assign)
                      and any(isinstance(target, ast.Name) and target.id == "revision_at" for target in node.targets)]
        self.assertEqual(len(assignment), 1)
        self.assertEqual(ast.unparse(assignment[0].value),
                         "existing['revision_at'] if existing and existing['content_sha256'] == content_sha256 else last_seen_at")
        readiness = named(source_tree("Backend/app/readiness.py").body, ast.FunctionDef, "evaluate_plan")
        revision_fields = [value for node in ast.walk(readiness) if isinstance(node, ast.Dict)
                           for key, value in zip(node.keys, node.values)
                           if isinstance(key, ast.Constant) and key.value == "revision_at"]
        self.assertEqual(len(revision_fields), 1)
        self.assertEqual(ast.unparse(revision_fields[0]), "snapshot['revision_at']")
        route = named(source_tree("Backend/app/api/routes.py").body, ast.FunctionDef, "list_repos")
        timestamp_fields = [value for node in ast.walk(route) if isinstance(node, ast.Dict)
                            for key, value in zip(node.keys, node.values)
                            if isinstance(key, ast.Constant) and key.value == "ts"]
        self.assertEqual(len(timestamp_fields), 1)
        self.assertEqual(ast.unparse(timestamp_fields[0]), "plan['revision_at']")
        warning_fields = [value for node in ast.walk(route) if isinstance(node, ast.Dict)
                          for key, value in zip(node.keys, node.values)
                          if isinstance(key, ast.Constant) and key.value == "warnings"]
        self.assertEqual(len(warning_fields), 1)
        self.assertEqual(ast.unparse(warning_fields[0]),
                         "(list(tracker.warnings.get(repo.id, [])) + parser_warnings.get(repo.id, []))[-200:]")


if __name__ == "__main__":
    unittest.main()
