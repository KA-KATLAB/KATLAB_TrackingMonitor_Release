"""Independent wire vectors and ASGI pass-through tests for Chronicle proofs."""

import asyncio
import base64
import copy
from datetime import date, timedelta
import hashlib
import hmac
import json
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from Backend.app.chronicle_auth import (ChronicleProofMiddleware, MAC_HEADER,
                                        NONCE_HEADER, SignerState, canonical_nonce,
                                        response_mac)

KEY = bytes(range(32))
NONCE = base64.urlsafe_b64encode(bytes(range(32, 64))).rstrip(b"=")
HEADERS = [(b"Content-Type", b"application/json"), (b"X-Test", b"preserved")]


def scope (**changes):
    result = {"type": "http", "method": "GET", "root_path": "",
              "raw_path": b"/api/stats", "path": "/wrong-decoded-path",
              "query_string": b"repo=EA", "headers": [(NONCE_HEADER, NONCE)]}
    result.update(changes)
    return result


class ChronicleAuthTests(unittest.TestCase):
    def setUp (self):
        self.signer = SignerState()
        self.signer.publish(KEY, lambda: True)
        self.messages = [
            {"type": "http.response.start", "status": 200, "headers": HEADERS},
            {"type": "http.response.body", "body": b'{"data":', "more_body": True},
            {"type": "http.response.body", "body": b'[]}', "more_body": False},
        ]

    def run_app (self, request=None, *, before_return=None, messages=None, error=None):
        sent = []
        baseline = self.messages if messages is None else messages

        async def app (_scope, _receive, send):
            for message in baseline:
                await send(message)
            if before_return:
                before_return()
            if error:
                raise error

        async def send (message):
            sent.append(message)

        async def receive ():
            return {"type": "http.disconnect"}

        async def execute ():
            await ChronicleProofMiddleware(app, self.signer)(
                scope() if request is None else request, receive, send)

        try:
            asyncio.run(execute())
        except RuntimeError:
            if error is None:
                raise
        return sent

    def test_independent_literal_wire_vector (self):
        # Intentionally reconstruct without the production LP/header helpers.
        def field (value):
            return bytes((len(value) >> 24, (len(value) >> 16) & 255,
                          (len(value) >> 8) & 255, len(value) & 255)) + value
        representation = b"\x00\x00\x00\x01" + field(b"content-type") + field(b"application/json")
        wire = b"KATLAB-CHRONICLE-v1" + b"".join(map(field, (
            NONCE, b"GET", b"/api/stats?repo=EA", b"200", representation, b'{"data":[]}')))
        expected = hmac.new(KEY, wire, hashlib.sha256).hexdigest().encode("ascii")
        self.assertEqual(response_mac(KEY, NONCE, b"/api/stats?repo=EA", 200,
                                      HEADERS, b'{"data":[]}'), expected)
        output = self.run_app()
        self.assertEqual(output[0]["headers"], HEADERS + [(MAC_HEADER, expected)])
        self.assertEqual(output[1:], self.messages[1:])
        self.assertEqual(self.messages[0]["headers"], HEADERS)

    def test_header_occurrences_order_and_empty_are_distinct (self):
        variants = [[], [(b"content-type", b"")], HEADERS,
                    HEADERS + [(b"content-type", b"application/json")],
                    HEADERS + [(b"content-encoding", b"identity")],
                    [(b"content-encoding", b"identity")] + HEADERS]
        proofs = {response_mac(KEY, NONCE, b"/api/repos", 200, hs, b"{}") for hs in variants}
        self.assertEqual(len(proofs), len(variants))

    def test_nonce_canonicalization (self):
        self.assertTrue(canonical_nonce(NONCE))
        for nonce in (b"", NONCE + b"=", b" " + NONCE, NONCE[:-1], b"!" * 43,
                      b"A" * 42 + b"B", "A" * 43):
            with self.subTest(nonce=nonce):
                self.assertFalse(canonical_nonce(nonce))

    def test_ineligible_requests_are_exact_passthrough (self):
        for changes in ({"method": "HEAD"}, {"method": "POST"}, {"root_path": "/x"},
                        {"raw_path": None}, {"raw_path": b"/api/%73tats"},
                        {"raw_path": b"/api/health"}, {"headers": []},
                        {"headers": [(NONCE_HEADER, NONCE + b"=")]},
                        {"headers": [(NONCE_HEADER, NONCE), (NONCE_HEADER.upper(), NONCE)]}):
            with self.subTest(changes=changes):
                self.assertEqual(self.run_app(scope(**changes)), self.messages)

    def test_no_signer_does_not_read_files_or_reject_any_nonce (self):
        self.signer.revoke()
        with patch("builtins.open", side_effect=AssertionError("unexpected file access")):
            for headers in ([], [(NONCE_HEADER, NONCE)], [(NONCE_HEADER, b"invalid")],
                            [(NONCE_HEADER, NONCE), (NONCE_HEADER, NONCE)]):
                self.assertEqual(self.run_app(scope(headers=headers)), self.messages)

    def test_revoke_or_replace_during_response_drops_proof (self):
        self.assertEqual(self.run_app(before_return=self.signer.revoke), self.messages)
        self.signer.publish(KEY, lambda: True)
        self.assertEqual(self.run_app(before_return=lambda: self.signer.publish(
            bytes(reversed(KEY)), lambda: True)), self.messages)

    def test_dead_or_failed_child_liveness_drops_proof (self):
        for callback in (lambda: False, lambda: 1 / 0):
            self.signer.publish(KEY, callback)
            self.assertEqual(self.run_app(), self.messages)
            self.assertIsNone(self.signer.snapshot())

    def test_overflow_replays_chunk_sequence (self):
        with patch("Backend.app.chronicle_auth.MAX_RESPONSE_BYTES", 2):
            self.assertEqual(self.run_app(), self.messages)

    def test_invalid_sequences_and_extensions_replay_unsigned (self):
        variants = [self.messages[1:], self.messages[:2],
                    [self.messages[0], self.messages[0], *self.messages[1:]],
                    [dict(self.messages[0], trailers=True), *self.messages[1:]],
                    [dict(self.messages[0], headers=HEADERS + [(MAC_HEADER, b"existing")]),
                     *self.messages[1:]],
                    self.messages + [{"type": "http.response.trailers", "headers": []}],
                    [self.messages[0], {"type": "http.response.pathsend", "path": "unopened"}]]
        for messages in variants:
            with self.subTest(messages=messages):
                self.assertEqual(self.run_app(messages=messages), messages)

    def test_exception_replays_then_reraises (self):
        self.assertEqual(self.run_app(error=RuntimeError("failure")), self.messages)

    def test_query_and_body_substitution_changes_proof (self):
        actual = self.run_app()[0]["headers"][-1][1]
        for target, body in ((b"/api/stats?repo=UM", b'{"data":[]}'),
                             (b"/api/stats?repo=EA", b'{"data":[1]}')):
            self.assertNotEqual(actual, response_mac(KEY, NONCE, target, 200, HEADERS, body))


class TrackerConsumerSchemaTests(unittest.TestCase):
    def setUp (self):
        from Scripts.Chronicle.safe_io import SafeIOError, validate_tracker_data
        self.validate = validate_tracker_data
        self.invalid = SafeIOError
        self.repo = {"id": "EA", "name": "EA", "path": "C:/test", "clean": True,
                     "offline": False, "paths_complete": True, "status_valid": True,
                     "count": 0, "branch": None, "observed_at": "2026-09-14T00:00:00Z",
                     "last_event_ts": None, "oldest_uncommitted_ts": None,
                     "activity_buckets": [0] * 12, "warnings": []}
        self.task = {"repo": "EA", "plan_file": "temp/Plan/PLAN_test.txt", "task_id": "A.1",
                     "title": "Test", "why": "Test", "task_ref": "temp/Plan/PLAN_test.txt - A.1",
                     "status": "pending", "files": ["src/**"], "last_event_ts": None}
        self.event = {"id": 2, "repo_id": "EA", "ts": "2026-09-14T00:00:00Z", "tool": "Edit",
                      "file": "src/test.py", "task_ref": None, "candidates_json": None,
                      "commit_hash": None, "session_id": None, "branch": None, "turn_id": None,
                      "agent_id": None, "tool_use_id": None, "plan_file": None, "task_id": None,
                      "mode": "B", "swept": 0, "operation": "update", "provider": "codex"}
        self.window = {"repo_id": "EA", "since": "2026-09-14T00:00:00Z", "until": "2026-09-15T00:00:00Z"}

    def test_valid_models_are_detached_immutable_and_strip_additions (self):
        self.repo["additional"] = {"safe": [1]}
        actual = self.validate("repos", [self.repo])
        self.assertIsInstance(actual, tuple)
        self.assertNotIn("additional", actual[0])
        self.repo["activity_buckets"][0] = 9
        self.assertEqual(actual[0]["activity_buckets"][0], 0)
        with self.assertRaises(TypeError):
            actual[0]["count"] = 9
        self.assertEqual(self.validate("tasks", [self.task])[0]["files"], ("src/**",))
        self.assertEqual(self.validate("events", [self.event], **self.window)[0]["id"], 2)

    def test_repo_type_shape_and_warning_negatives (self):
        for key, value in (("id", "../escape"), ("count", True), ("clean", 1),
                           ("activity_buckets", [0] * 11), ("observed_at", "badZ"),
                           ("warnings", [{"ts": "2026-09-14T00:00:00Z", "message": "bad", "code": "x"}])):
            row = dict(self.repo, **{key: value})
            with self.subTest(key=key), self.assertRaises(self.invalid):
                self.validate("repos", [row])
        with self.assertRaises(self.invalid):
            self.validate("repos", [self.repo, self.repo])
        row = dict(self.repo)
        del row["branch"]
        with self.assertRaises(self.invalid):
            self.validate("repos", [row])

    def test_repo_id_bound_matches_the_native_changelog_leaf (self):
        from Scripts.Chronicle import safe_io

        for length in (129, safe_io.CHRONICLE_REPO_ID_MAX):
            with self.subTest(length=length):
                repo_id = "R" * length
                accepted = self.validate(
                    "repos", [dict(self.repo, id=repo_id, name=repo_id)])
                self.assertEqual(accepted[0]["id"], repo_id)
        with self.assertRaises(self.invalid):
            self.validate("repos", [dict(
                self.repo,
                id="R" * (safe_io.CHRONICLE_REPO_ID_MAX + 1),
            )])

    def test_task_reference_status_and_path_negatives (self):
        for key, value in (("task_ref", "wrong"), ("status", "ready"), ("task_id", ""),
                           ("plan_file", "../outside"), ("files", [""])):
            with self.subTest(key=key), self.assertRaises(self.invalid):
                self.validate("tasks", [dict(self.task, **{key: value})])

    def test_stats_exact_calendar_order_count_and_integers (self):
        rows = [{"day": (date(2025, 9, 15) + timedelta(days=index)).isoformat(),
                 "events": 0, "commits": 0, "minutes": 0} for index in range(365)]
        self.assertEqual(len(self.validate("stats", {"activity_calendar": rows})["activity_calendar"]), 365)
        variants = [rows[:-1], list(reversed(rows)), [rows[0]] * 365]
        gapped = [dict(row, day=(date.fromisoformat(row["day"]) + timedelta(
            days=1 if index >= 100 else 0)).isoformat())
                  for index, row in enumerate(rows)]
        variants.append(gapped)
        poison = copy.deepcopy(rows)
        poison[0]["minutes"] = True
        variants.append(poison)
        for value in variants:
            with self.assertRaises(self.invalid):
                self.validate("stats", {"activity_calendar": value})

    def test_events_identity_order_window_enum_and_boolean_negatives (self):
        for key, value in (("repo_id", "UM"), ("provider", None), ("swept", True),
                           ("id", False), ("operation", "execute"), ("file", "C:/outside"),
                           ("ts", "2026-09-15T00:00:00Z")):
            with self.subTest(key=key), self.assertRaises(self.invalid):
                self.validate("events", [dict(self.event, **{key: value})], **self.window)
        with self.assertRaises(self.invalid):
            self.validate("events", [self.event, self.event], **self.window)

    def test_history_composite_identity_hash_and_event_order (self):
        digest = "a" * 40
        commit = {"repo_id": "EA", "hash": digest, "message": "test", "ts": "2026-09-14T00:00:00Z",
                  "files_json": "[]", "parents": None}
        historical = dict(self.event, provider=None, commit_hash=digest)
        data = [{"commit": commit, "events": [historical]}]
        self.assertEqual(self.validate("history", data, repo_id="EA")[0]["commit"]["hash"], digest)
        for change in ({"repo_id": "UM"}, {"hash": "A" * 40}, {"hash": "a" * 39}):
            with self.assertRaises(self.invalid):
                self.validate("history", [{"commit": dict(commit, **change), "events": []}], repo_id="EA")
        with self.assertRaises(self.invalid):
            self.validate("history", [{"commit": commit, "events": [dict(historical, commit_hash="b" * 40)]}], repo_id="EA")
        with self.assertRaises(self.invalid):
            self.validate("history", [{"commit": commit, "events": [dict(historical, commit_hash=None)]}], repo_id="EA")


class TrackerModelSessionTests(unittest.TestCase):
    """Authenticated cross-response invariants using the endpoint fixtures."""

    def setUp (self):
        TrackerConsumerSchemaTests.setUp(self)
        from Scripts.Chronicle.safe_io import TrackerModelSession
        self.elapsed = 0.0
        self.session = TrackerModelSession(KEY, clock=lambda: self.elapsed)

    def answer (self, request, data):
        body = json.dumps({"success": True, "data": data, "message": "",
                           "timestamp": "2026-09-14T00:00:00Z"},
                          separators=(",", ":")).encode("utf-8")
        headers = HEADERS + [(MAC_HEADER, response_mac(
            KEY, request.nonce, request.target, 200, HEADERS, body))]
        return self.session.accept(request, 200, headers, body)

    def prime (self, *, calendar=False):
        self.answer(self.session.begin("repos"), [self.repo])
        if calendar:
            days = [{"day": (date(2025, 9, 15) + timedelta(days=index)).isoformat(),
                     "events": 0, "commits": 0, "minutes": 0} for index in range(365)]
            self.answer(self.session.begin("stats", repo_id="EA"), {"activity_calendar": days})

    def events_request (self, offset=0):
        return self.session.begin("events", repo_id="EA", offset=offset,
                                  day="2026-09-14", next_day="2026-09-15")

    def test_authenticated_model_end_to_end (self):
        self.prime(calendar=True)
        task_request = self.session.begin("tasks")
        self.assertEqual(self.answer(task_request, [self.task])[0]["repo"], "EA")
        self.assertEqual(self.answer(self.events_request(), [self.event])[0]["id"], 2)

    def test_long_repo_ids_authorize_signed_scoped_targets_through_250 (self):
        from Scripts.Chronicle import safe_io

        calendar = [{
            "day": (date(2025, 9, 15) + timedelta(days=index)).isoformat(),
            "events": 0, "commits": 0, "minutes": 0,
        } for index in range(365)]
        for length in (129, safe_io.CHRONICLE_REPO_ID_MAX):
            with self.subTest(length=length):
                self.setUp()
                repo_id = "R" * length
                repo = dict(self.repo, id=repo_id, name=repo_id)
                self.answer(self.session.begin("repos"), [repo])
                request = self.session.begin("stats", repo_id=repo_id)
                self.assertEqual(
                    request.target,
                    f"/api/stats?repo={repo_id}".encode("ascii"),
                )
                accepted = self.answer(
                    request, {"activity_calendar": calendar})
                self.assertEqual(len(accepted["activity_calendar"]), 365)

    def test_requests_require_authenticated_membership (self):
        with self.assertRaises(self.invalid):
            self.session.begin("tasks")
        self.setUp()
        self.prime()
        with self.assertRaises(self.invalid):
            self.session.begin("stats", repo_id="UM")
        self.setUp()
        self.prime()
        with self.assertRaises(self.invalid):
            self.events_request()

    def test_task_repo_must_be_authenticated (self):
        self.prime()
        with self.assertRaises(self.invalid):
            self.answer(self.session.begin("tasks"), [dict(self.task, repo="UM")])

    def test_nonce_and_response_reuse_close_session (self):
        with patch("Scripts.Chronicle.safe_io.secrets.token_bytes", return_value=b"x" * 32):
            self.prime()
            with self.assertRaises(self.invalid):
                self.session.begin("tasks")
        self.setUp()
        request = self.session.begin("repos")
        self.answer(request, [self.repo])
        with self.assertRaises(self.invalid):
            self.answer(request, [self.repo])

    def test_single_inflight_and_short_page_finality (self):
        self.session.begin("repos")
        with self.assertRaises(self.invalid):
            self.session.begin("repos")
        self.setUp()
        self.prime(calendar=True)
        self.answer(self.events_request(), [self.event])
        with self.assertRaises(self.invalid):
            self.events_request(500)

    def test_response_and_nonresettable_session_deadlines (self):
        request = self.session.begin("repos")
        self.elapsed = 30.0
        with self.assertRaises(self.invalid):
            self.answer(request, [self.repo])
        self.setUp()
        self.prime()
        self.elapsed = 119.0
        request = self.session.begin("tasks")
        self.assertEqual(request.deadline, 120.0)
        self.elapsed = 120.0
        with self.assertRaises(self.invalid):
            self.answer(request, [self.task])

    def test_byte_and_request_budgets (self):
        with patch("Scripts.Chronicle.safe_io.TRACKER_SESSION_BYTE_LIMIT", 1):
            with self.assertRaises(self.invalid):
                self.prime()
        self.setUp()
        self.prime()
        with patch("Scripts.Chronicle.safe_io.TRACKER_SESSION_REQUEST_LIMIT", 1):
            with self.assertRaises(self.invalid):
                self.session.begin("tasks")

    def test_event_order_across_page_boundary (self):
        self.prime(calendar=True)
        rows = [dict(self.event, id=value) for value in range(1000, 500, -1)]
        self.answer(self.events_request(), rows)
        with self.assertRaises(self.invalid):
            self.answer(self.events_request(500), [dict(self.event, id=501)])

    def test_history_commit_replay_across_page_boundary (self):
        self.prime()
        commits = [{"commit": {"repo_id": "EA", "hash": format(value, "040x"),
                                "message": "test", "ts": "2026-09-14T00:00:00Z",
                                "files_json": "[]", "parents": None}, "events": []}
                   for value in range(500)]
        self.answer(self.session.begin("history", repo_id="EA", offset=0), commits)
        with self.assertRaises(self.invalid):
            self.answer(self.session.begin("history", repo_id="EA", offset=500), commits[:1])


class ChronicleAppIsolationTests(unittest.TestCase):
    def test_optional_spawn_gates_precede_runtime_and_fail_closed (self):
        from Backend.app import main
        from Backend.app.config import AppConfig, ServerConfig
        from Scripts.Chronicle import runtime
        snapshot = SimpleNamespace(config=AppConfig(ServerConfig(), ()))
        signer = SignerState()
        with patch.dict(main.os.environ, {"KATLAB_TRACKER_CONFIG": "",
                                          "KATLAB_TRACKER_DEMO": "0"}), \
             patch.object(runtime, "start_chronicle",
                          side_effect=runtime.safe_io.PrerequisiteError("missing")) as start:
            self.assertIsNone(main.spawn_chronicle_loop(snapshot, signer))
            start.assert_called_once()
            self.assertIsNone(signer.snapshot())
        for env in ({"KATLAB_TRACKER_CONFIG": "isolated.yaml"},
                    {"KATLAB_TRACKER_DEMO": "1"}):
            with self.subTest(env=env), patch.dict(main.os.environ, env), \
                 patch.object(runtime, "start_chronicle",
                              side_effect=AssertionError("guard evaluated too late")):
                self.assertIsNone(main.spawn_chronicle_loop(snapshot, signer))

    def test_signer_publication_failure_rolls_back_owned_loop (self):
        from Backend.app import main
        from Backend.app.config import AppConfig, ServerConfig
        from Scripts.Chronicle import runtime
        snapshot = SimpleNamespace(config=AppConfig(ServerConfig(), ()))

        class Owned:
            response_key = KEY

            def __init__ (self):
                self.stopped = False

            def is_live (self):
                return True

            def stop (self):
                self.stopped = True

        owned = Owned()
        signer = SignerState()
        with patch.dict(main.os.environ, {"KATLAB_TRACKER_CONFIG": "",
                                          "KATLAB_TRACKER_DEMO": "0"}), \
             patch.object(runtime, "start_chronicle", return_value=owned), \
             patch.object(signer, "publish", side_effect=RuntimeError("publish")):
            self.assertIsNone(main.spawn_chronicle_loop(snapshot, signer))
        self.assertTrue(owned.stopped)
        self.assertIsNone(signer.snapshot())

    def test_owned_loop_success_publishes_the_factory_signer (self):
        from Backend.app import main
        from Backend.app.config import AppConfig, ServerConfig
        from Scripts.Chronicle import runtime
        snapshot = SimpleNamespace(config=AppConfig(ServerConfig(), ()))

        class Owned:
            response_key = KEY
            process = SimpleNamespace()

            def is_live (self):
                return True

        owned = Owned()
        signer = SignerState()
        with patch.dict(main.os.environ, {"KATLAB_TRACKER_CONFIG": "",
                                          "KATLAB_TRACKER_DEMO": "0"}), \
             patch.object(runtime, "start_chronicle", return_value=owned):
            self.assertIs(main.spawn_chronicle_loop(snapshot, signer), owned)
        self.assertIsNotNone(signer.snapshot())

    def test_lifespan_shutdown_runs_if_optional_setup_escapes (self):
        from Backend.app import main
        from Backend.app.config import AppConfig, ServerConfig
        snapshot = SimpleNamespace(config=AppConfig(ServerConfig(), ()))
        with patch.dict(main.os.environ, {"KATLAB_TRACKER_CONFIG": "",
                                          "KATLAB_TRACKER_DEMO": "0"}):
            app = main.create_app(snapshot)
        tracker = app.state.tracker
        tracker.startup = AsyncMock()
        tracker.shutdown = AsyncMock()

        async def run ():
            with patch.object(main, "spawn_chronicle_loop",
                              side_effect=RuntimeError("unexpected")):
                with self.assertRaises(RuntimeError):
                    async with app.router.lifespan_context(app):
                        pass

        asyncio.run(run())
        tracker.startup.assert_awaited_once()
        tracker.shutdown.assert_awaited_once()

    def test_lifespan_retains_and_retries_incomplete_startup_cleanup (self):
        from Backend.app import main
        from Backend.app.config import AppConfig, ServerConfig
        from Scripts.Chronicle import runtime
        snapshot = SimpleNamespace(config=AppConfig(ServerConfig(), ()))
        pending = SimpleNamespace(stop=MagicMock())
        startup_error = runtime.ChronicleStartupError(pending)
        with patch.dict(main.os.environ, {"KATLAB_TRACKER_CONFIG": "",
                                          "KATLAB_TRACKER_DEMO": "0"}):
            app = main.create_app(snapshot)
        tracker = app.state.tracker
        tracker.startup = AsyncMock()
        tracker.shutdown = AsyncMock()

        async def run ():
            with patch.object(runtime, "start_chronicle",
                              side_effect=startup_error):
                async with app.router.lifespan_context(app):
                    self.assertIsNone(app.state.chronicle_runtime)
                    self.assertEqual(app.state.chronicle_cleanup, [pending])

        asyncio.run(run())
        pending.stop.assert_called_once_with()
        self.assertEqual(app.state.chronicle_cleanup, [])
        self.assertIsNone(app.state.chronicle_signer.snapshot())
        tracker.startup.assert_awaited_once()
        tracker.shutdown.assert_awaited_once()

    def test_failed_shutdown_retry_remains_reachable_without_blocking_tracker (self):
        from Backend.app import main
        from Backend.app.config import AppConfig, ServerConfig
        from Scripts.Chronicle import runtime, safe_io
        snapshot = SimpleNamespace(config=AppConfig(ServerConfig(), ()))
        pending = SimpleNamespace(stop=MagicMock(
            side_effect=safe_io.SafeIOError("still sharing")))
        with patch.dict(main.os.environ, {"KATLAB_TRACKER_CONFIG": "",
                                          "KATLAB_TRACKER_DEMO": "0"}):
            app = main.create_app(snapshot)
        tracker = app.state.tracker
        tracker.startup = AsyncMock()
        tracker.shutdown = AsyncMock()

        async def run ():
            with patch.object(
                    runtime, "start_chronicle",
                    side_effect=runtime.ChronicleStartupError(pending)):
                async with app.router.lifespan_context(app):
                    pass

        asyncio.run(run())
        pending.stop.assert_called_once_with()
        self.assertEqual(app.state.chronicle_cleanup, [pending])
        tracker.shutdown.assert_awaited_once()

    def test_factory_reuses_snapshot_and_demo_never_touches_site (self):
        from fastapi.testclient import TestClient
        from Backend.app import main
        from Backend.app.config import AppConfig, ServerConfig

        snapshot = SimpleNamespace(config=AppConfig(ServerConfig(), ()))

        class ForbiddenSite:
            def __truediv__ (self, _path):
                raise AssertionError("guarded request touched production site")

        with patch.dict(main.os.environ, {"KATLAB_TRACKER_CONFIG": "isolated-test.yaml"}), \
             patch.object(main, "load_config_snapshot", return_value=snapshot) as load, \
             patch.object(main, "CHRONICLE_SITE", ForbiddenSite()), \
             patch.object(main, "FRONTEND_DIST", main.REPO_ROOT / "absent-test-dist"):
            app = main.create_app(snapshot)
            self.assertIs(app.state.config_snapshot, snapshot)
            self.assertIs(app.state.tracker.config, snapshot.config)
            load.assert_not_called()
            # No context manager: startup/watchers/real DB are deliberately not run.
            client = TestClient(app)
            try:
                for method in (client.get, client.head):
                    for path in ("/chronicle/", "/chronicle/architecture.html"):
                        self.assertEqual(method(path).status_code, 404)
                self.assertEqual(client.get("/chronicle", follow_redirects=False).status_code, 307)
            finally:
                client.close()
            main.create_app()
            load.assert_called_once_with(main.CONFIG_PATH)


if __name__ == "__main__":
    unittest.main()
