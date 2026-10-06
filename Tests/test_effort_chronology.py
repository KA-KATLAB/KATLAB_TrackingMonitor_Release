"""Actual effort aggregation and narrow original-source preservation regressions."""

import ast
import copy
from contextlib import ExitStack
import hashlib
import itertools
import json
from pathlib import Path
import sqlite3
import struct
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from fastapi import Request

from Backend.app import db
from Backend.app.api import routes


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "Backend/app/db.py"
NOW = "2026-10-06T12:00:00Z"
ORIGINAL_RAW = "d01338267c60c8aa2d5eae163f4ae46c457c4d62d8c633d5c5ced6f118ede2c7"
ORIGINAL_LF = "8d6b7684ae18f46373ae6080802e7c2cfbde1857725e2573404df60d3ef9d45f"
ORIGINAL_CLUSTER = "fc5d9f6767bfda2169dc292e15d8b27044adccf1dfb528b40db47d8dc51eb53d"
ORIGINAL_OUTSIDE = "c7eabea169950e3caed1b242230007e96e7e48e4f312cc190816cb642f9ad573"
ORIGINAL_MODULE_AST = "9876c781963893b58ecd4ab78f0e39d2ce28bacecc12249bf4cfc0e94c76a6f6"
ORIGINAL_CLUSTER_AST = "4b3304f77599bfe02eb00293a216929f763f960fc814d3d1df419bcc40cdc71d"
ORIGINAL_STATS_AST = "ae3bdb10a8595cdb634b9879e99392a366f1bdb05a9cba7a26ba08a327323bc6"
SORT_LINE = "    sorted_epochs = sorted(sorted_epochs)\n"
SORT_LINE_SHA = "2650fd3d821577657592d9c7d2c28f9e5cfd412a0f1965116062600d2d7155f2"
OLD_COMMENT = "    # SELECT is ORDER BY ts, so every per-group list stays sorted.\n"
NEW_COMMENT = (
    "    # SQL timestamp spelling is not chronology across mixed precision.\n"
    "    # _cluster_minutes orders a copy of each parsed epoch group.\n"
)
NEW_COMMENT_SHA = "017d5f9b86f70a2db48f8396a830f877c2c286931477dc9b8db1f1f0b0a45dc7"


def sha (value):
    return hashlib.sha256(value).hexdigest()


def ast_value (value):
    """Keep all ordered fields except exactly empty-list type_params."""
    if isinstance(value, ast.AST):
        return [type(value).__name__, [
            [name, ast_value(field)] for name, field in ast.iter_fields(value)
            if not (name == "type_params" and isinstance(field, list) and field == [])]]
    if isinstance(value, list):
        return [ast_value(item) for item in value]
    if value is Ellipsis:
        return ["Ellipsis"]
    return value


def ast_sha (value):
    return sha(json.dumps(ast_value(value), ensure_ascii=True,
                          separators=(",", ":")).encode("utf-8"))


def function (tree, name):
    matches = [node for node in tree.body
               if isinstance(node, ast.FunctionDef) and node.name == name]
    if len(matches) != 1:
        raise ValueError("Expected one actual top-level function")
    return matches[0]


def decoded_source (raw):
    if raw.startswith(b"\xef\xbb\xbf"):
        raise ValueError("Unexpected source BOM")
    text = raw.decode("utf-8")
    newline = "\r\n" if "\r\n" in text else "\n"
    if "\r" in text.replace("\r\n", ""):
        raise ValueError("Unexpected source carriage return")
    if newline == "\r\n" and "\n" in text.replace("\r\n", ""):
        raise ValueError("Mixed source newlines")
    return text.replace("\r\n", "\n"), newline


def original_pins (text):
    """Validate the complete real original, not a copied clustering model."""
    tree = ast.parse(text)
    cluster = function(tree, "_cluster_minutes")
    stats = function(tree, "get_stats")
    segment = ast.get_source_segment(text, cluster)
    start = sum(len(line) for line in text.splitlines(keepends=True)[:cluster.lineno - 1])
    outside = text[:start] + text[start + len(segment):]
    actual = (sha(text.encode()), sha(segment.encode()), sha(outside.encode()),
              ast_sha(tree), ast_sha(cluster), ast_sha(stats))
    expected = (ORIGINAL_LF, ORIGINAL_CLUSTER, ORIGINAL_OUTSIDE,
                ORIGINAL_MODULE_AST, ORIGINAL_CLUSTER_AST, ORIGINAL_STATS_AST)
    if actual != expected or sha(text.replace("\n", "\r\n").encode()) != ORIGINAL_RAW:
        raise ValueError("An immutable complete original-source fingerprint changed")
    return tree


def reverse_windows (raw):
    """Reverse only the exact reviewed assignment and owner-local comment."""
    text, newline = decoded_source(raw)
    tree = ast.parse(text)
    cluster = function(tree, "_cluster_minutes")
    stats = function(tree, "get_stats")
    expected = ast.parse("sorted_epochs = sorted(sorted_epochs)").body[0]
    empty = ast.parse("if not sorted_epochs:\n    return 0\n").body[0]
    total = ast.parse("total = 0.0").body[0]
    if (len(cluster.body) < 4 or ast_value(cluster.body[1]) != ast_value(empty)
            or ast_value(cluster.body[2]) != ast_value(expected)
            or ast_value(cluster.body[3]) != ast_value(total)):
        raise ValueError("Expected exact assignment after the empty fastpath")
    matches = [node for node in ast.walk(tree)
               if isinstance(node, ast.Assign) and ast_value(node) == ast_value(expected)]
    if len(matches) != 1:
        raise ValueError("Expected exactly one reviewed assignment")
    lines = text.splitlines(keepends=True)
    assignment = cluster.body[2]
    if assignment.end_lineno != assignment.lineno or lines[assignment.lineno - 1] != SORT_LINE:
        raise ValueError("Expected exact reviewed assignment line")
    stats_segment = ast.get_source_segment(text, stats)
    if (text.count(NEW_COMMENT) != 1 or stats_segment.count(NEW_COMMENT) != 1
            or OLD_COMMENT in text
            or any(text.count(line) != 1 for line in NEW_COMMENT.splitlines(keepends=True))):
        raise ValueError("Expected exact two-line comment inside get_stats")
    del lines[assignment.lineno - 1]
    restored = "".join(lines).replace(NEW_COMMENT, OLD_COMMENT)
    return restored.replace("\n", newline).encode("utf-8")


def actual_original_source ():
    raw = SOURCE.read_bytes()
    text, _ = decoded_source(raw)
    if sha(text.encode()) != ORIGINAL_LF:
        text, _ = decoded_source(reverse_windows(raw))
    original_pins(text)
    return text


def actual_original_cluster ():
    """Compile actual original constants/function; never repeat its arithmetic."""
    tree = original_pins(actual_original_source())
    constants = [node for node in tree.body if isinstance(node, ast.Assign)
                 and any(isinstance(target, ast.Name)
                         and target.id in {"EFFORT_GAP_MAX_S", "EFFORT_TAIL_S"}
                         for target in node.targets)]
    if len(constants) != 2:
        raise ValueError("Expected both actual original clustering constants")
    module = ast.Module(body=constants + [function(tree, "_cluster_minutes")], type_ignores=[])
    namespace = {}
    exec(compile(module, str(SOURCE), "exec"), namespace)
    return namespace["_cluster_minutes"]


def reviewed_source ():
    text, _ = decoded_source(SOURCE.read_bytes())
    if sha(text.encode()) == ORIGINAL_LF:
        original_pins(text)
        if text.count("    total = 0.0\n") != 1 or text.count(OLD_COMMENT) != 1:
            raise ValueError("Expected both original insertion anchors")
        return text.replace("    total = 0.0\n", SORT_LINE + "    total = 0.0\n").replace(
            OLD_COMMENT, NEW_COMMENT)
    restored, _ = decoded_source(reverse_windows(text.encode()))
    original_pins(restored)
    return text


def event (ts, task="primary", provider="codex", session="same", file="src/a.py"):
    return {"ts": ts, "tool": "Edit", "file": file, "task_ref": task, "mode": "B",
            "provider": provider, "session_id": session}


def primary_rows (whole_second="Z"):
    return [event("2026-10-06T01:00:00.900Z", provider="codex"),
            event("2026-10-06T01:00:00" + whole_second, provider=None),
            event("2026-10-06T01:15:00.100Z", provider="claude")]


class ClusterChronologyTests(unittest.TestCase):
    def test_six_permutations_use_actual_original_ascending_result (self):
        original = actual_original_cluster()
        ordered = [0.0, 0.9, 900.1]
        self.assertEqual(original(ordered), 17)
        for values in itertools.permutations(ordered):
            with self.subTest(values=values):
                self.assertEqual(db._cluster_minutes(list(values)), original(ordered))

    def test_finite_ascending_outputs_match_actual_original (self):
        original = actual_original_cluster()
        cases = [[], [0.0], [-0.0], [1.1], [-1200.0, -300.0, -299.9],
                 [-900.0, 0.0], [0.0, 0.0, 0.0], [-0.0, 0.0, -0.0],
                 [0.0, 30.0], [0.0, 90.0], [0.0, 900.0], [0.0, 900.000001],
                 [0.0, 899.999999], [0.5, 2.2, 3.1], [1e12, 1e12 + 900.0],
                 [-1e12, -1e12 + 60.5], [0.0, 900.0, 1800.000001]]
        for values in cases:
            with self.subTest(values=values):
                self.assertEqual(db._cluster_minutes(values), original(values))

    def test_tail_rounding_and_strict_gap_threshold_stay_original (self):
        for values, expected in [([], 0), ([0.0], 2), ([0.0, 30.0], 2),
                                 ([0.0, 90.0], 4), ([0.0, 900.0], 17),
                                 ([0.0, 900.000001], 4), ([0.0, 899.999999], 17)]:
            with self.subTest(values=values):
                self.assertEqual(db._cluster_minutes(values), expected)

    def test_sort_never_mutates_the_callers_list_or_signed_zero (self):
        values = [900.1, 0.9, -0.0, 0.0]
        before = b"".join(struct.pack("!d", value) for value in values)
        self.assertEqual(db._cluster_minutes(values), 17)
        self.assertEqual(b"".join(struct.pack("!d", value) for value in values), before)


class EffortAggregationTests(unittest.TestCase):
    def setUp (self):
        self.stack = ExitStack()
        self.addCleanup(self.stack.close)
        self.stack.enter_context(patch.object(db, "_connect", side_effect=AssertionError(
            "Production connection is forbidden in this suite")))
        self.stack.enter_context(patch.object(db, "init_db", side_effect=AssertionError(
            "Runtime initialization is forbidden in this suite")))
        self.conn = sqlite3.connect(":memory:")
        self.addCleanup(self.conn.close)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA foreign_keys=ON")
        self.stack.enter_context(patch.object(db, "get_conn", return_value=self.conn))
        self.conn.executescript(db.SCHEMA_PATH.read_text(encoding="utf-8"))
        self.conn.executemany("INSERT INTO repos (id, name, path) VALUES (?, ?, ?)",
                              [(name, name, name) for name in ("A", "B", "Retired")])
        self.conn.commit()

    def insert (self, rows, repo="A", offset=123):
        return db.insert_events_with_offset(repo, rows, offset)

    def persisted (self):
        return [dict(row) for row in self.conn.execute("SELECT * FROM events ORDER BY id")]

    def with_original (self, repos=None, now=NOW):
        original = actual_original_cluster()
        with patch.object(db, "_cluster_minutes", original):
            return db.get_stats(["A"] if repos is None else repos, now)

    def add_second_task (self):
        self.insert([event("2026-10-06T02:00:00Z", "second", file="src/b.py"),
                     event("2026-10-06T02:05:00Z", "second", file="src/b.py")])

    def test_actual_get_stats_mixed_precision_effort (self):
        ids = self.insert(primary_rows())
        before = self.persisted()
        result = db.get_stats(["A"], NOW)
        self.assertEqual(result["effort_per_task"], [
            {"repo": "A", "task_ref": "primary", "minutes": 17, "sessions": 2}])
        self.assertEqual(result["activity_calendar"][-1]["minutes"], 17)
        self.assertEqual(result["wrapped"]["days"][-1]["minutes"], 17)
        self.assertEqual(result["wrapped"]["top_task"]["minutes"], 17)
        self.assertEqual(ids, [1, 2, 3])
        self.assertEqual(db.get_offset("A"), 123)
        self.assertEqual(self.persisted(), before)

    def test_actual_get_stats_mixed_precision_ranking (self):
        self.insert(primary_rows())
        self.add_second_task()
        result = db.get_stats(["A"], NOW)
        self.assertEqual([(row["task_ref"], row["minutes"])
                          for row in result["effort_per_task"]], [("primary", 17), ("second", 7)])
        self.assertEqual(result["wrapped"]["top_task"],
                         {"repo": "A", "task_ref": "primary", "minutes": 17, "sessions": 2})
        self.assertEqual(result["activity_calendar"][-1]["minutes"], 24)
        self.assertEqual(result["wrapped"]["days"][-1]["minutes"], 24)

    def test_equivalent_inside_window_spellings_have_identical_effort (self):
        self.insert(primary_rows())
        mixed = db.get_stats(["A"], NOW)
        self.conn.execute("DELETE FROM events")
        self.conn.commit()
        self.insert(primary_rows(".000Z"))
        normalized = db.get_stats(["A"], NOW)
        self.assertEqual(mixed["effort_per_task"], normalized["effort_per_task"])
        self.assertEqual(mixed["activity_calendar"], normalized["activity_calendar"])
        self.assertEqual(mixed["wrapped"], normalized["wrapped"])
        self.assertEqual(self.persisted()[1]["ts"], "2026-10-06T01:00:00.000Z")

    def test_complete_dto_changes_only_reviewed_minutes_and_ranking (self):
        self.insert(primary_rows())
        self.add_second_task()
        self.insert([event("malformed", None, session=None, file="src/raw.py")])
        self.conn.execute("INSERT INTO commits (repo_id, hash, message, ts, files_json) "
                          "VALUES ('A', 'hash', 'message', '2026-10-06T03:00:00Z', '[\"src/a.py\"]')")
        self.conn.commit()
        persisted = self.persisted()
        before = self.with_original()
        expected = copy.deepcopy(before)
        primary = next(row for row in expected["effort_per_task"] if row["task_ref"] == "primary")
        primary["minutes"] = 17
        expected["effort_per_task"].sort(key=lambda row: -row["minutes"])
        expected["activity_calendar"][-1]["minutes"] = 24
        expected["wrapped"]["days"][-1]["minutes"] = 24
        expected["wrapped"]["top_task"] = copy.deepcopy(primary)
        self.assertEqual(db.get_stats(["A"], NOW), expected)
        self.assertEqual(self.persisted(), persisted)
        self.assertEqual(db.get_offset("A"), 123)

    def test_repo_task_provider_null_and_malformed_scopes_stay_exact (self):
        self.insert(primary_rows())
        self.insert([event("2026-10-06T03:00:00Z", None, session=None),
                     event("not-a-time", "bad", session="bad"),
                     event("2026-10-06T04:00:00Z", "alone", session=None)])
        self.insert([event("2026-10-06T05:00:00Z", "primary")], repo="B", offset=88)
        result = db.get_stats(["A"], NOW)
        self.assertEqual(result["effort_per_task"], [
            {"repo": "A", "task_ref": "primary", "minutes": 17, "sessions": 2},
            {"repo": "A", "task_ref": "alone", "minutes": 2, "sessions": 0}])
        self.assertEqual(result["mode_counts"]["B"], 6)
        self.assertEqual(result["identity"]["sessions"], 3)
        self.assertEqual(result["activity_calendar"][-1]["events"], 5)
        self.assertEqual(result["activity_calendar"][-1]["minutes"], 21)
        self.assertEqual(result["wrapped"]["days"][-1]["minutes"], 21)
        self.assertEqual(db.get_stats(["B"], NOW)["effort_per_task"], [
            {"repo": "B", "task_ref": "primary", "minutes": 2, "sessions": 1}])
        self.assertEqual(db.get_offset("B"), 88)
        self.assertEqual(self.persisted()[4]["ts"], "not-a-time")

    def test_empty_and_top_ten_tie_policy_match_actual_original (self):
        self.assertEqual(db.get_stats([], NOW), self.with_original([]))
        self.assertEqual(db.get_stats(["A"], NOW), self.with_original())
        self.insert([event("2026-10-06T05:00:00Z", f"T{index:02d}") for index in range(12)])
        result = db.get_stats(["A"], NOW)
        self.assertEqual(result, self.with_original())
        self.assertEqual(len(result["effort_per_task"]), 10)
        self.assertEqual(result["wrapped"]["top_task"]["task_ref"], "T00")

    def test_negative_epochs_keep_windows_bucket_guard_and_arithmetic (self):
        self.insert([event("1969-12-31T01:05:00Z"), event("1969-12-31T01:00:00Z")])
        now = "1969-12-31T12:00:00Z"
        result = db.get_stats(["A"], now)
        self.assertEqual(result, self.with_original(now=now))
        self.assertEqual(result["effort_per_task"][0]["minutes"], 7)
        self.assertEqual(result["activity_calendar"][-1]["minutes"], 7)
        self.assertEqual(result["wrapped"]["days"][-1]["minutes"], 7)

    def test_actual_route_all_single_unknown_use_only_configured_repos (self):
        self.insert(primary_rows())
        self.insert([event("2026-10-06T05:00:00Z")], repo="B")
        self.insert([event("2026-10-06T06:00:00Z", "retired")], repo="Retired")
        tracker = SimpleNamespace(config=SimpleNamespace(repos=[
            SimpleNamespace(id="A"), SimpleNamespace(id="B")]))
        request = Request({"type": "http", "app": SimpleNamespace(
            state=SimpleNamespace(tracker=tracker))})
        for scope, repos in [(None, ["A", "B"]), ("A", ["A"]), ("B", ["B"]),
                             ("Retired", []), ("unknown", []), ("", ["A", "B"])]:
            with self.subTest(scope=scope), patch.object(routes, "_now_z", return_value=NOW):
                response = routes.stats(request, scope)
                self.assertEqual(response, {"success": True, "data": db.get_stats(repos, NOW),
                                            "message": "", "timestamp": NOW})
                self.assertFalse(any(row["repo"] == "Retired"
                                     for row in response["data"]["effort_per_task"]))


class EffortSourcePreservationTests(unittest.TestCase):
    def test_actual_two_window_inverse_matches_every_immutable_pin (self):
        raw = SOURCE.read_bytes()
        text, _ = decoded_source(raw)
        self.assertEqual(sha(SORT_LINE.encode()), SORT_LINE_SHA)
        self.assertEqual(sha(NEW_COMMENT.encode()), NEW_COMMENT_SHA)
        self.assertEqual(raw.count(b"\n"), raw.count(b"\r\n"))
        self.assertTrue(raw.endswith(b"\r\n") and not raw.endswith(b"\r\n\r\n"))
        for newline, expected in [("\n", ORIGINAL_LF), ("\r\n", ORIGINAL_RAW)]:
            with self.subTest(newline=repr(newline)):
                restored = reverse_windows(text.replace("\n", newline).encode())
                self.assertEqual(sha(restored), expected)
                original_pins(decoded_source(restored)[0])
        self.assertEqual(ast_sha(function(ast.parse(text), "get_stats")), ORIGINAL_STATS_AST)

    def test_structural_and_partial_edits_are_rejected_in_both_encodings (self):
        text = reviewed_source()
        first, second = NEW_COMMENT.splitlines(keepends=True)
        variants = {
            "missing-sort": text.replace(SORT_LINE, ""),
            "duplicate-sort": text.replace(SORT_LINE, SORT_LINE * 2),
            "before-fastpath": text.replace(SORT_LINE, "").replace(
                "    if not sorted_epochs:\n", SORT_LINE + "    if not sorted_epochs:\n"),
            "after-total": text.replace(SORT_LINE, "").replace(
                "    total = 0.0\n", "    total = 0.0\n" + SORT_LINE),
            "changed-target": text.replace(SORT_LINE, SORT_LINE.replace("sorted_epochs =", "epochs =")),
            "changed-argument": text.replace(SORT_LINE, SORT_LINE.replace("sorted(sorted_epochs)", "sorted([])")),
            "in-place": text.replace(SORT_LINE, "    sorted_epochs.sort()\n"),
            "reverse": text.replace(SORT_LINE, "    sorted_epochs = sorted(sorted_epochs, reverse=True)\n"),
            "wrong-owner": text.replace(SORT_LINE, "").replace(
                "    now = datetime.fromisoformat(now_iso.replace(\"Z\", \"+00:00\"))\n",
                SORT_LINE + "    now = datetime.fromisoformat(now_iso.replace(\"Z\", \"+00:00\"))\n", 1),
            "line-comment": text.replace(SORT_LINE, SORT_LINE.rstrip("\n") + "  # moved contract\n"),
            "missing-comment": text.replace(NEW_COMMENT, ""),
            "old-comment-only": text.replace(NEW_COMMENT, OLD_COMMENT),
            "duplicate-comment": text.replace(NEW_COMMENT, NEW_COMMENT * 2),
            "partial-comment": text.replace(second, ""),
            "reversed-comment": text.replace(NEW_COMMENT, second + first),
            "changed-comment": text.replace(NEW_COMMENT, NEW_COMMENT.replace("mixed precision", "uniform spelling")),
            "wrong-comment-owner": text.replace(NEW_COMMENT, "").replace(
                "    total = 0.0\n", NEW_COMMENT + "    total = 0.0\n"),
        }
        for name, variant in variants.items():
            self.assertNotEqual(variant, text, name)
            for newline in ("\n", "\r\n"):
                with self.subTest(name=name, newline=repr(newline)), self.assertRaises(ValueError):
                    reverse_windows(variant.replace("\n", newline).encode())

    def test_unrelated_edits_remain_visible_to_complete_original_pins (self):
        text = reviewed_source()
        variants = {
            "gap-constant": text.replace("EFFORT_GAP_MAX_S = 15 * 60", "EFFORT_GAP_MAX_S = 14 * 60"),
            "tail-constant": text.replace("EFFORT_TAIL_S = 2 * 60", "EFFORT_TAIL_S = 3 * 60"),
            "rounding": text.replace("return round(total / 60)", "return int(total / 60)"),
            "extra-statement": text.replace("    return round(total / 60)\n", "    total += 1\n    return round(total / 60)\n"),
            "outside-import": text.replace("import hashlib\n", "import hashlib as hashlib\n"),
            "sql": text.replace("GROUP BY mode\", repo_ids)", "GROUP BY mode ORDER BY mode\", repo_ids)"),
            "source-comment": text.replace("# --- commits + linking", "# --- unrelated commits + linking"),
            "docstring": text.replace("gap-rule blocks -> whole minutes", "gap-rule blocks -> changed minutes"),
            "signature": text.replace("def _cluster_minutes (sorted_epochs: list[float])", "def _cluster_minutes (sorted_epochs: list)"),
        }
        for name, variant in variants.items():
            self.assertNotEqual(variant, text, name)
            for newline in ("\n", "\r\n"):
                with self.subTest(name=name, newline=repr(newline)):
                    restored, _ = decoded_source(reverse_windows(variant.replace("\n", newline).encode()))
                    with self.assertRaises(ValueError):
                        original_pins(restored)

    def test_portable_ast_retains_nonempty_nonlist_fields_and_ellipsis (self):
        node = ast.parse("def sample():\n    return ...\n").body[0]
        if "type_params" not in node._fields:
            node._fields += ("type_params",)
        node.type_params = []
        empty_hash = ast_sha(node)
        absent = copy.deepcopy(node)
        absent._fields = tuple(name for name in absent._fields if name != "type_params")
        self.assertEqual(ast_sha(absent), empty_hash)
        for value in [None, False, 0, (), "", [ast.Name(id="T", ctx=ast.Load())]]:
            with self.subTest(value=repr(value)):
                changed = copy.deepcopy(node)
                changed.type_params = value
                self.assertNotEqual(ast_sha(changed), empty_hash)
        extra = copy.deepcopy(node)
        extra._fields += ("additional_field",)
        extra.additional_field = []
        self.assertNotEqual(ast_sha(extra), empty_hash)
        self.assertEqual(ast_value(Ellipsis), ["Ellipsis"])
        self.assertNotEqual(ast_sha(ast.Constant(value=Ellipsis)), ast_sha(ast.Constant(value=None)))


if __name__ == "__main__":
    unittest.main()
