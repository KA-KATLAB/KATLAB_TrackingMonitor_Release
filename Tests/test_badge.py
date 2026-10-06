"""Local badge truth through the actual builder, route and isolated COUNT."""

import ast
import copy
import datetime
import hashlib
import inspect
import json
import sqlite3
import unittest
import xml.etree.ElementTree as ET
from contextlib import ExitStack
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from Backend.app import badge, db, git_module, main
from Backend.app.activity import ActivityIngestor
from Backend.app.config import AppConfig, RepoConfig, ServerConfig


ROOT = Path(__file__).resolve().parents[1]
NS = "{http://www.w3.org/2000/svg}"
ROUTE_SHA = "a6c8824021e4e33a64a5d2b75b3569627dc14c5f31df861ec83449395b2efdb3"
MAIN_SHA = "038f5ceba6795b942e92ad5f526f52d2fb4620a5571bdb06af3886c3147e9364"
COUNT_SHA = "919e152cff7e7b194abad3733c4d0adfa9d59c45edfbe4de734b5e318203a575"


def chip (svg):
    root = ET.fromstring(svg)
    return root.findall(NS + "text")[2].text


def ast_value (node):
    """Retain every AST field except Python 3.12's optional empty type_params."""
    if isinstance(node, ast.AST):
        return [type(node).__name__, [
            [name, ast_value(value)] for name, value in ast.iter_fields(node)
            if not (name == "type_params" and value == [])]]
    if isinstance(node, list):
        return [ast_value(value) for value in node]
    return node


def ast_sha (node):
    encoded = json.dumps(ast_value(node), ensure_ascii=True,
                         separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def badge_call (tree):
    handlers = [node for node in ast.walk(tree)
                if isinstance(node, ast.FunctionDef) and node.name == "badge"]
    if len(handlers) != 1:
        raise ValueError("Expected exactly one actual badge handler")
    calls = [node for node in ast.walk(handlers[0])
             if isinstance(node, ast.Call) and isinstance(node.func, ast.Name)
             and node.func.id == "build_badge"]
    if len(calls) != 1:
        raise ValueError("Expected exactly one actual builder call")
    return handlers[0], calls[0]


def restore_main (tree):
    """Reverse only the reviewed keyword, never other route or owner changes."""
    restored = copy.deepcopy(tree)
    handler, call = badge_call(restored)
    added = [item for item in call.keywords if item.arg == "status_valid"]
    expected = ast.parse('status.get("status_valid") is True', mode="eval").body
    if len(added) != 1 or ast_value(added[0].value) != ast_value(expected):
        raise ValueError("Expected exactly one strict status_valid expression")
    call.keywords.remove(added[0])
    return restored, handler


def contrast (left, right):
    def luminance (color):
        rgb = [int(color[index:index + 2], 16) / 255 for index in (1, 3, 5)]
        linear = [value / 12.92 if value <= 0.04045 else
                  ((value + 0.055) / 1.055) ** 2.4 for value in rgb]
        return sum(value * weight for value, weight in
                   zip(linear, (0.2126, 0.7152, 0.0722)))
    values = sorted((luminance(left), luminance(right)))
    return (values[1] + 0.05) / (values[0] + 0.05)


class BadgeRouteTests(unittest.TestCase):
    def setUp (self):
        self.stack = ExitStack()
        self.addCleanup(self.stack.close)
        self.guards = []
        for owner, name, asynchronous in (
                (main.Tracker, "startup", True),
                (main.Tracker, "shutdown", True),
                (db, "init_db", False), (db, "get_conn", False),
                (badge, "get_conn", False),
                (ActivityIngestor, "initialize", False),
                (git_module, "_run", False),
                (main, "load_config_snapshot", False),
                (main, "spawn_chronicle_loop", False)):
            failure = AssertionError("Forbidden badge fixture boundary: " + name)
            replacement = (AsyncMock(side_effect=failure) if asynchronous
                           else None)
            mocked = self.stack.enter_context(
                patch.object(owner, name, new=replacement) if asynchronous
                else patch.object(owner, name, side_effect=failure))
            self.guards.append(mocked)
        self.addCleanup(self.assert_boundaries_unused)
        fixture = ROOT / "temp" / "badge-fixture-not-created"
        self.assertFalse(fixture.exists())
        self.fixture = fixture
        self.repo = RepoConfig("Repo_A", "Synthetic", fixture / "repo")
        config = AppConfig(ServerConfig(), (self.repo,),
                           activity_root=fixture / "activity")
        self.stack.enter_context(patch.object(
            main, "FRONTEND_DIST", fixture / "absent-dist"))
        self.stack.enter_context(patch.dict(
            main.os.environ, {"KATLAB_TRACKER_DEMO": "1"}))
        self.count = self.stack.enter_context(patch.object(
            main, "events_last_7d", return_value=123))
        self.app = main.create_app(SimpleNamespace(config=config))
        self.tracker = self.app.state.tracker
        # Never enter TestClient: lifespan must not initialize DB/watchers.
        self.client = TestClient(self.app)
        self.addCleanup(self.client.close)

    def assert_boundaries_unused (self):
        for guard in self.guards:
            guard.assert_not_called()
        if hasattr(self, "fixture"):
            self.assertFalse(self.fixture.exists())

    def observe (self, clean, count):
        self.tracker.status.setdefault(self.repo.id, {})
        self.tracker.dirty_paths.setdefault(self.repo.id, [])
        observed = dict(clean=clean, count=count, branch="main",
                        dirty_paths=[] if clean else ["changed.txt"],
                        status_valid=True, paths_complete=True,
                        observed_at="2026-10-06T00:00:00Z")
        with patch.object(git_module, "repo_status", return_value=observed) as read:
            self.tracker._refresh_status(self.repo)
        read.assert_called_once_with(self.repo.path)

    def fail_observation (self):
        with patch.object(git_module, "repo_status", side_effect=
                          git_module.GitError("synthetic Git failure")) as read:
            self.tracker._refresh_status(self.repo)
        read.assert_called_once_with(self.repo.path)
        self.assertIs(self.tracker.status[self.repo.id]["status_valid"], False)

    def request_chip (self):
        self.count.reset_mock()
        response = self.client.get("/badge/Repo_A.svg")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["content-type"], "image/svg+xml")
        self.assertEqual(response.headers["cache-control"], "max-age=300")
        self.count.assert_called_once_with(self.repo.id)
        self.assertIn("123 events", response.text)
        return chip(response.text)

    def test_invalid_retained_clean_is_unavailable (self):
        self.observe(True, 0)
        self.assertEqual(self.request_chip(), "CLEAN \u2713")
        self.fail_observation()
        self.assertTrue(self.tracker.status[self.repo.id]["clean"])
        self.assertEqual(self.request_chip(), "UNAVAILABLE")

    def test_invalid_retained_dirty_is_unavailable (self):
        self.observe(False, 7)
        self.assertEqual(self.request_chip(), "7 uncommitted")
        self.fail_observation()
        self.assertEqual(self.tracker.status[self.repo.id]["count"], 7)
        self.assertEqual(self.request_chip(), "UNAVAILABLE")

    def test_route_validity_is_strict_and_missing_is_unavailable (self):
        for value in (False, None, 1, "true", [], {}, True):
            with self.subTest(value=value):
                self.tracker.status[self.repo.id] = dict(
                    clean=True, count=0, offline=False, status_valid=value)
                self.assertEqual(self.request_chip(),
                                 "CLEAN \u2713" if value is True else "UNAVAILABLE")
        del self.tracker.status[self.repo.id]["status_valid"]
        self.assertEqual(self.request_chip(), "UNAVAILABLE")
        self.tracker.status[self.repo.id] = dict(
            clean=False, count=0, offline=False, status_valid=False)
        self.assertEqual(self.request_chip(), "UNAVAILABLE")

    def test_actual_refresh_recovers_clean_and_dirty_snapshots (self):
        for clean, count in ((True, 0), (False, 12345), (False, 0)):
            with self.subTest(clean=clean, count=count):
                self.observe(clean, count)
                expected = "CLEAN \u2713" if clean else f"{count:,} uncommitted"
                self.assertEqual(self.request_chip(), expected)
                self.fail_observation()
                self.assertEqual(self.request_chip(), "UNAVAILABLE")
                self.observe(clean, count)
                before = copy.deepcopy(self.tracker.status)
                self.assertEqual(self.request_chip(), expected)
                self.assertEqual(self.tracker.status, before)

    def test_offline_precedes_all_validity_flags (self):
        for value in (True, False, None, 1, "true", [], {}):
            with self.subTest(value=value):
                self.tracker.status[self.repo.id] = dict(
                    clean=True, count=7, offline=True, status_valid=value)
                self.assertEqual(self.request_chip(), "OFFLINE")
        del self.tracker.status[self.repo.id]["status_valid"]
        self.assertEqual(self.request_chip(), "OFFLINE")

    def test_unknown_repository_is_404_without_count (self):
        response = self.client.get("/badge/Unknown.svg")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json(), {"detail": "unknown repo: Unknown"})
        self.count.assert_not_called()


class BadgeBuilderTests(unittest.TestCase):
    def test_default_and_nonboolean_flags_fail_closed (self):
        parameter = inspect.signature(badge.build_badge).parameters["status_valid"]
        self.assertEqual(parameter.kind, inspect.Parameter.KEYWORD_ONLY)
        self.assertIs(parameter.default, False)
        self.assertEqual(chip(badge.build_badge("Repo", True, False, 0, 3)),
                         "UNAVAILABLE")
        for value in (False, None, 1, "true", [], {}):
            for clean, count in ((True, 0), (False, 7)):
                with self.subTest(value=value, clean=clean):
                    self.assertEqual(chip(badge.build_badge(
                        "Repo", clean, False, count, 3, status_valid=value)),
                        "UNAVAILABLE")
                    self.assertEqual(chip(badge.build_badge(
                        "Repo", clean, True, count, 3, status_valid=value)),
                        "OFFLINE")

    def test_known_counts_and_offline_precedence (self):
        self.assertEqual(chip(badge.build_badge(
            "Repo", True, False, 0, 5, status_valid=True)), "CLEAN \u2713")
        self.assertEqual(chip(badge.build_badge(
            "Repo", True, True, 0, 5, status_valid=True)), "OFFLINE")
        for count in (0, 7, 1234567):
            with self.subTest(count=count):
                self.assertEqual(chip(badge.build_badge(
                    "Repo", False, False, count, 5, status_valid=True)),
                    f"{count:,} uncommitted")

    def test_xml_escaping_unicode_determinism_and_card_geometry (self):
        repo_id = "Repo<&\"'> Vi\u1ec7t \u03a9"
        for clean, offline, valid, label, width in (
                (True, False, True, "CLEAN \u2713", 64),
                (False, False, True, "7 uncommitted", 115),
                (True, True, False, "OFFLINE", 64),
                (True, False, False, "UNAVAILABLE", 101)):
            with self.subTest(label=label):
                args = (repo_id, clean, offline, 7, 12345)
                svg = badge.build_badge(*args, status_valid=valid)
                self.assertEqual(svg, badge.build_badge(*args, status_valid=valid))
                root = ET.fromstring(svg)
                self.assertEqual(root.attrib, dict(width="380", height="80",
                                                  viewBox="0 0 380 80"))
                self.assertEqual([child.tag.removeprefix(NS) for child in root],
                                 ["rect", "circle", "text", "text", "rect", "text", "text"])
                self.assertEqual(root[1].attrib, dict(cx="40", cy="40", r="17",
                                 fill="none", stroke="#14b8a6", **{"stroke-width": "7"}))
                self.assertEqual(root[2].text, repo_id)
                self.assertEqual(root[3].text, "12,345 events \u00b7 last 7d (UTC)")
                self.assertEqual(root[6].text, "KATLAB TrackingMonitor")
                self.assertEqual(root[4].get("width"), str(width))
                self.assertEqual(root[4].get("height"), "20")
                self.assertEqual(root[4].get("x"), str(372 - width))
                self.assertEqual(root[5].get("x"), str(372 - width / 2))
                self.assertEqual(root[5].get("font-size"), "10")
                self.assertEqual(root[5].text, label)
                self.assertIn("&lt;", svg)
                self.assertIn("&amp;", svg)

    def test_actual_chip_colors_have_normal_text_contrast (self):
        for clean, offline, valid, fill in (
                (True, False, True, "#047857"),
                (False, False, True, "#f59e0b"),
                (False, True, False, "#52525b"),
                (True, False, False, "#52525b")):
            svg = ET.fromstring(badge.build_badge(
                "Repo", clean, offline, 7, 0, status_valid=valid))
            with self.subTest(state=svg[5].text):
                self.assertEqual(svg[4].get("fill"), fill)
                self.assertGreaterEqual(contrast(svg[4].get("fill"),
                                                 svg[5].get("fill")), 4.5)


class BadgeCountTests(unittest.TestCase):
    def test_actual_count_uses_utc_lower_bound_and_repo_not_upper_bound (self):
        clock_calls = []

        class FixedDatetime(datetime.datetime):
            @classmethod
            def now (cls, tz=None):
                clock_calls.append(tz)
                return cls(2026, 10, 6, 18, 15, tzinfo=datetime.timezone.utc)

        connection = sqlite3.connect(":memory:")
        self.addCleanup(connection.close)
        connection.execute("CREATE TABLE events (repo_id TEXT, ts TEXT)")
        connection.executemany("INSERT INTO events VALUES (?, ?)", (
            ("A", "2026-09-29T23:59:59Z"),
            ("A", "2026-09-30T00:00:00Z"),
            ("A", "2026-10-05T23:59:59Z"),
            ("A", "2026-10-06T00:00:00Z"),
            ("A", "2026-10-07T00:00:00Z"),
            ("B", "2026-10-06T12:00:00Z")))
        with patch.object(badge, "get_conn", return_value=connection) as get_conn, \
                patch.object(badge.datetime, "datetime", FixedDatetime), \
                patch.object(db, "get_conn", side_effect=AssertionError("real DB")), \
                patch.object(db, "init_db", side_effect=AssertionError("real DB init")):
            self.assertEqual(badge.events_last_7d("A"), 4)
            self.assertEqual(badge.events_last_7d("B"), 1)
            self.assertEqual(badge.events_last_7d("missing"), 0)
        self.assertEqual(get_conn.call_count, 3)
        self.assertEqual(clock_calls, [datetime.timezone.utc] * 3)


class BadgePreservationTests(unittest.TestCase):
    def test_exact_keyword_reversal_preserves_complete_main_and_count (self):
        source = (ROOT / "Backend/app/main.py").read_text(encoding="utf-8")
        count_source = (ROOT / "Backend/app/badge.py").read_text(encoding="utf-8")
        for newline in ("\n", "\r\n"):
            with self.subTest(newline=repr(newline)):
                tree, handler = restore_main(ast.parse(source.replace("\n", newline)))
                self.assertEqual(ast_sha(handler), ROUTE_SHA)
                self.assertEqual(ast_sha(tree), MAIN_SHA)
                functions = [node for node in ast.walk(ast.parse(
                    count_source.replace("\n", newline))) if
                    isinstance(node, ast.FunctionDef) and node.name == "events_last_7d"]
                self.assertEqual(len(functions), 1)
                self.assertEqual(ast_sha(functions[0]), COUNT_SHA)

    def test_reversal_rejects_missing_repeated_or_changed_keyword (self):
        source = ast.parse((ROOT / "Backend/app/main.py").read_text(encoding="utf-8"))
        for mutation in ("missing", "repeated", "changed"):
            with self.subTest(mutation=mutation):
                tree = copy.deepcopy(source)
                _, call = badge_call(tree)
                keyword = next(item for item in call.keywords if item.arg == "status_valid")
                if mutation == "missing":
                    call.keywords.remove(keyword)
                elif mutation == "repeated":
                    call.keywords.append(copy.deepcopy(keyword))
                else:
                    keyword.value = ast.parse('bool(status.get("status_valid"))', mode="eval").body
                with self.assertRaisesRegex(ValueError, "exactly one strict"):
                    restore_main(tree)

    def test_original_hashes_detect_unrelated_handler_and_owner_changes (self):
        source = ast.parse((ROOT / "Backend/app/main.py").read_text(encoding="utf-8"))
        handler, _ = badge_call(source)
        changed = [node for node in ast.walk(handler)
                   if isinstance(node, ast.Constant) and node.value == 404]
        self.assertEqual(len(changed), 1)
        changed[0].value = 405
        tree, handler = restore_main(source)
        self.assertNotEqual(ast_sha(handler), ROUTE_SHA)
        self.assertNotEqual(ast_sha(tree), MAIN_SHA)
        source = ast.parse((ROOT / "Backend/app/main.py").read_text(encoding="utf-8"))
        source.body.append(ast.Pass())
        tree, handler = restore_main(source)
        self.assertEqual(ast_sha(handler), ROUTE_SHA)
        self.assertNotEqual(ast_sha(tree), MAIN_SHA)

    def test_ast_portability_omits_only_empty_type_params (self):
        original = ast.parse("def fixture():\n    return 1\n").body[0]
        empty = copy.deepcopy(original)
        if "type_params" not in empty._fields:
            empty._fields += ("type_params",)
        empty.type_params = []
        self.assertEqual(ast_value(original), ast_value(empty))
        nonempty = copy.deepcopy(empty)
        nonempty.type_params = [ast.Name(id="T", ctx=ast.Load())]
        self.assertNotEqual(ast_value(original), ast_value(nonempty))
        for value in (None, False, 0):
            with self.subTest(type_params=value):
                nonlist = copy.deepcopy(empty)
                nonlist.type_params = value
                self.assertNotEqual(ast_value(original), ast_value(nonlist))
        empty.body[0].value.value = 2
        self.assertNotEqual(ast_value(original), ast_value(empty))


if __name__ == "__main__":
    unittest.main()
