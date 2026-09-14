"""Positive isolated tests for the Chronicle capability and HTTP runtime."""

import json
import os
import tempfile
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest.mock import MagicMock, patch

from Backend.app.chronicle_auth import response_mac
from Scripts.Chronicle import runtime, safe_io


KEY = bytes(range(32))
SESSION = "0123456789abcdef0123456789abcdef"


def repo_payload () -> list[dict]:
    return [{
        "id": "EA", "name": "EA", "path": "C:/isolated", "clean": True,
        "offline": False, "paths_complete": True, "status_valid": True,
        "count": 0, "branch": None, "observed_at": "2026-09-14T00:00:00Z",
        "last_event_ts": None, "oldest_uncommitted_ts": None,
        "activity_buckets": [0] * 12, "warnings": [],
    }]


def envelope (data) -> bytes:
    return json.dumps({
        "success": True, "data": data, "message": "",
        "timestamp": "2026-09-14T00:00:00Z",
    }, separators=(",", ":")).encode("utf-8")


class QuietServer(ThreadingHTTPServer):
    daemon_threads = True

    def handle_error (self, _request, _client_address):
        pass


class SignedHandler(BaseHTTPRequestHandler):
    body = envelope(repo_payload())
    header_delay = 0.0
    body_delay = 0.0
    include_proof = True
    proof_key = KEY

    def do_GET (self):
        if self.header_delay:
            time.sleep(self.header_delay)
        nonce = self.headers.get("X-KATLAB-Chronicle-Nonce", "").encode("ascii")
        proof_headers = [(b"Content-Type", b"application/json")]
        proof = response_mac(
            self.proof_key, nonce, self.path.encode("ascii"), 200,
            proof_headers, self.body)
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(self.body)))
        self.send_header("Connection", "close")
        if self.include_proof:
            self.send_header("X-KATLAB-Chronicle-Mac", proof.decode("ascii"))
        self.end_headers()
        if self.body_delay:
            self.wfile.write(self.body[:1])
            self.wfile.flush()
            time.sleep(self.body_delay)
            self.wfile.write(self.body[1:])
        else:
            self.wfile.write(self.body)

    def log_message (self, _format, *_args):
        pass


class ServerContext:
    def __init__ (self, handler=SignedHandler):
        self.server = QuietServer(("127.0.0.1", 0), handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)

    def __enter__ (self):
        self.thread.start()
        return self.server.server_address[1]

    def __exit__ (self, _type, _value, _traceback):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)


class ChronicleRuntimeTests(unittest.TestCase):
    def record (self, port: int) -> runtime.CapabilityRecord:
        return runtime.CapabilityRecord(
            f"http://127.0.0.1:{port}", KEY, SESSION,
            safe_io.current_process_stamp())

    def test_capability_schema_is_exact_canonical_and_boolean_safe (self):
        record = self.record(8100)
        self.assertEqual(runtime.parse_capability(record.canonical_bytes()), record)
        value = json.loads(record.canonical_bytes())
        variants = [
            dict(value, extra=1), dict(value, v=True),
            dict(value, key=value["key"].upper()), dict(value, parent_pid=True),
        ]
        for variant in variants:
            data = json.dumps(
                variant, sort_keys=True, separators=(",", ":")).encode("ascii") + b"\n"
            with self.subTest(variant=variant), self.assertRaises(safe_io.SafeIOError):
                runtime.parse_capability(data)
        duplicate = record.canonical_bytes().replace(b'{"key":', b'{"v":1,"key":')
        with self.assertRaises(safe_io.SafeIOError):
            runtime.parse_capability(duplicate)
        with self.assertRaises(safe_io.SafeIOError):
            runtime.parse_capability(record.canonical_bytes().rstrip())

    def test_private_capability_to_real_signed_loopback_response (self):
        with ServerContext() as port, tempfile.TemporaryDirectory() as temporary:
            repo = Path(temporary)
            runtime_dir = repo / "Chronicle" / "runtime"
            with safe_io.bind_root(runtime_dir, create=True) as root:
                owned = safe_io.create_private_owned_file(
                    root, runtime.CAPABILITY_RELATIVE,
                    self.record(port).canonical_bytes(),
                    max_bytes=runtime.CAPABILITY_LIMIT)
                try:
                    with patch.dict(os.environ, {
                            runtime.CAPABILITY_SESSION_ENV: SESSION,
                            "KATLAB_TRACKER_CONFIG": "",
                            "KATLAB_TRACKER_DEMO": "0",
                    }, clear=False):
                        with runtime.load_session(repo) as client:
                            self.assertEqual(client.origin, f"http://127.0.0.1:{port}")
                            rows = client.request("repos")
                            self.assertEqual(rows[0]["id"], "EA")
                            self.assertTrue(client.tracker_alive())
                            self.assertTrue(client.tracker_alive())
                finally:
                    owned.remove()
            self.assertFalse((runtime_dir / runtime.CAPABILITY_RELATIVE).exists())

    def test_unsigned_response_never_reaches_json_consumer (self):
        class Unsigned(SignedHandler):
            include_proof = False

        with ServerContext(Unsigned) as port, \
             patch.object(safe_io, "observe_process",
                          return_value=safe_io.ProcessState.LIVE):
            client = runtime.TrackerClient(self.record(port))
            with self.assertRaises(safe_io.SafeIOError):
                client.request("repos")

    def test_liveness_requires_a_fresh_valid_authenticated_response (self):
        class Unsigned(SignedHandler):
            include_proof = False

        class WrongProof(SignedHandler):
            proof_key = bytes(reversed(KEY))

        for handler in (Unsigned, WrongProof):
            with self.subTest(handler=handler.__name__), ServerContext(handler) as port, \
                 patch.object(safe_io, "observe_process",
                              return_value=safe_io.ProcessState.LIVE):
                client = runtime.TrackerClient(self.record(port))
                self.assertFalse(client.tracker_alive())
                self.assertFalse(client.tracker_alive())

    def test_absolute_deadline_interrupts_slow_headers_and_body (self):
        class SlowHeaders(SignedHandler):
            header_delay = 0.5

        class SlowBody(SignedHandler):
            body_delay = 0.5

        for handler in (SlowHeaders, SlowBody):
            with self.subTest(handler=handler.__name__), ServerContext(handler) as port, \
                 patch.object(safe_io, "observe_process",
                              return_value=safe_io.ProcessState.LIVE), \
                 patch.object(safe_io, "TRACKER_REQUEST_DEADLINE_SECONDS", 0.1):
                started = time.monotonic()
                with self.assertRaises(safe_io.TransportUnavailable):
                    runtime.TrackerClient(self.record(port)).request("repos")
                self.assertLess(time.monotonic() - started, 0.4)

    def test_demo_and_explicit_config_guard_precedes_runtime_access (self):
        for environment in ({"KATLAB_TRACKER_DEMO": "1"},
                            {"KATLAB_TRACKER_CONFIG": "isolated.yaml"}):
            with self.subTest(environment=environment), \
                 patch.dict(os.environ, environment, clear=False), \
                 patch.object(safe_io, "bind_root",
                              side_effect=AssertionError("runtime I/O occurred")):
                with self.assertRaises(safe_io.TransportUnavailable):
                    runtime.load_session("C:/must-not-be-read")

    def test_python_selection_and_probe_happen_before_runtime_root (self):
        selected = runtime.select_chronicle_python()
        runtime.probe_chronicle_python(selected)
        with patch.dict(os.environ, {runtime.PYTHON_ENV: "relative/python.exe"}), \
             self.assertRaises(safe_io.PrerequisiteError):
            runtime.select_chronicle_python()
        with patch.object(runtime, "probe_chronicle_python",
                          side_effect=safe_io.PrerequisiteError("missing")), \
             patch.object(runtime, "select_chronicle_python",
                          return_value=selected), \
             patch.object(safe_io, "bind_root",
                          side_effect=AssertionError("runtime root created")):
            with self.assertRaises(safe_io.PrerequisiteError):
                runtime.start_chronicle("127.0.0.1", 8100, "C:/unused")

    def test_spawn_failure_removes_capability_and_closes_root (self):
        selected = runtime.select_chronicle_python()
        root = MagicMock()
        root.__enter__.return_value = root
        capability = MagicMock()
        with tempfile.TemporaryDirectory() as temporary, \
             patch.object(runtime, "select_chronicle_python", return_value=selected), \
             patch.object(runtime, "probe_chronicle_python"), \
             patch.object(safe_io, "bind_root", return_value=root), \
             patch.object(safe_io, "read_private_owned_file", return_value=None), \
             patch.object(safe_io, "create_private_owned_file",
                          return_value=capability), \
             patch.object(runtime.subprocess, "Popen", side_effect=OSError("spawn")):
            with self.assertRaises(OSError):
                runtime.start_chronicle("127.0.0.1", 8100, temporary)
        capability.remove.assert_called_once_with()
        root.close.assert_called_once_with()

    def test_partial_startup_acquisitions_are_rolled_back (self):
        selected = MagicMock(path="C:/isolated/python.exe")
        selected.argv.return_value = [selected.path, "generate.py"]
        for stage in ("log_open", "capability", "argv", "immediate_exit"):
            with self.subTest(stage=stage), tempfile.TemporaryDirectory() as temporary:
                root = MagicMock()
                log = MagicMock()
                capability = MagicMock()
                process = MagicMock()
                process.poll.return_value = 1 if stage == "immediate_exit" else None
                open_effect = OSError("log") if stage == "log_open" else log
                cap_effect = (OSError("capability") if stage == "capability"
                              else capability)
                argv_effect = (safe_io.PrerequisiteError("argv")
                               if stage == "argv" else [selected.path, "generate.py"])
                with patch.object(runtime, "select_chronicle_python",
                                  return_value=selected), \
                     patch.object(runtime, "probe_chronicle_python"), \
                     patch.object(safe_io, "bind_root", return_value=root), \
                     patch.object(safe_io, "read_private_owned_file",
                                  return_value=None), \
                     patch.object(runtime.Path, "open",
                                  side_effect=(open_effect
                                               if isinstance(open_effect, Exception)
                                               else None),
                                  return_value=(None if isinstance(open_effect, Exception)
                                                else open_effect)), \
                     patch.object(safe_io, "create_private_owned_file",
                                  side_effect=(cap_effect
                                               if isinstance(cap_effect, Exception)
                                               else None),
                                  return_value=(None if isinstance(cap_effect, Exception)
                                                else cap_effect)), \
                     patch.object(selected, "argv", side_effect=(argv_effect
                                                                  if isinstance(argv_effect, Exception)
                                                                  else None),
                                  return_value=(None if isinstance(argv_effect, Exception)
                                                else argv_effect)), \
                     patch.object(runtime.subprocess, "Popen", return_value=process):
                    with self.assertRaises((OSError, safe_io.PrerequisiteError)):
                        runtime.start_chronicle(
                            "127.0.0.1", 8100, temporary)
                root.close.assert_called_once_with()
                if stage != "log_open":
                    log.close.assert_called_once_with()
                if stage not in ("log_open", "capability"):
                    capability.remove.assert_called_once_with()
                if stage == "immediate_exit":
                    process.terminate.assert_not_called()

    def test_pending_cleanup_retains_each_failed_stage_for_retry (self):
        cases = ("terminate", "kill", "wait", "log", "capability", "root")
        for stage in cases:
            with self.subTest(stage=stage):
                process = MagicMock()
                process.poll.return_value = None
                log = MagicMock()
                capability = MagicMock()
                root = MagicMock()
                if stage == "terminate":
                    process.terminate.side_effect = [OSError("terminate"), None]
                    process.kill.side_effect = [OSError("kill after terminate"), None]
                elif stage == "kill":
                    process.terminate.side_effect = OSError("terminate")
                    process.kill.side_effect = [OSError("kill"), None]
                elif stage == "wait":
                    process.wait.side_effect = [
                        runtime.subprocess.TimeoutExpired("child", 1),
                        OSError("wait"), None]
                else:
                    process.poll.return_value = 0
                if stage == "log":
                    log.close.side_effect = [OSError("log"), None]
                if stage == "capability":
                    capability.remove.side_effect = [OSError("capability"), None]
                if stage == "root":
                    root.close.side_effect = [OSError("root"), None]
                cleanup = runtime.PendingChronicleCleanup(
                    process, log, capability, root)
                with self.assertRaises(safe_io.SafeIOError):
                    cleanup.stop()
                cleanup.stop()
                self.assertIsNone(cleanup.process)
                self.assertIsNone(cleanup._log)
                self.assertIsNone(cleanup._capability)
                self.assertIsNone(cleanup._runtime_root)

    def test_startup_cleanup_failure_exposes_typed_retry_ledger (self):
        selected = MagicMock(path="C:/isolated/python.exe")
        selected.argv.return_value = [selected.path, "generate.py"]
        root = MagicMock()
        log = MagicMock()
        capability = MagicMock()
        capability.remove.side_effect = [OSError("sharing"), None]
        with tempfile.TemporaryDirectory() as temporary, \
             patch.object(runtime, "select_chronicle_python", return_value=selected), \
             patch.object(runtime, "probe_chronicle_python"), \
             patch.object(safe_io, "bind_root", return_value=root), \
             patch.object(safe_io, "read_private_owned_file", return_value=None), \
             patch.object(runtime.Path, "open", return_value=log), \
             patch.object(safe_io, "create_private_owned_file",
                          return_value=capability), \
             patch.object(selected, "argv",
                          side_effect=safe_io.PrerequisiteError("argv")):
            with self.assertRaises(runtime.ChronicleStartupError) as raised:
                runtime.start_chronicle("127.0.0.1", 8100, temporary)
        pending = raised.exception.cleanup
        self.assertIs(pending._capability, capability)
        self.assertIs(pending._runtime_root, root)
        root.close.assert_not_called()
        pending.stop()
        self.assertEqual(capability.remove.call_count, 2)
        root.close.assert_called_once_with()

    def test_private_create_rollback_is_composed_into_startup_retry_ledger (self):
        selected = MagicMock(path="C:/isolated/python.exe")
        root = MagicMock()
        log = MagicMock()
        nested = MagicMock()
        nested.remove.side_effect = [safe_io.SafeIOError("sharing"), None]
        operation_error = safe_io.SafeIOError("private create")
        private_error = safe_io.PrivateCreationError(nested, operation_error)
        with tempfile.TemporaryDirectory() as temporary, \
             patch.object(runtime, "select_chronicle_python", return_value=selected), \
             patch.object(runtime, "probe_chronicle_python"), \
             patch.object(safe_io, "bind_root", return_value=root), \
             patch.object(safe_io, "read_private_owned_file", return_value=None), \
             patch.object(runtime.Path, "open", return_value=log), \
             patch.object(safe_io, "create_private_owned_file",
                          side_effect=private_error):
            with self.assertRaises(runtime.ChronicleStartupError) as raised:
                runtime.start_chronicle("127.0.0.1", 8100, temporary)
        pending = raised.exception.cleanup
        self.assertIs(pending._private_creation_cleanup, nested)
        root.close.assert_not_called()
        pending.stop()
        self.assertEqual(nested.remove.call_count, 2)
        root.close.assert_called_once_with()

    def test_owned_stop_is_idempotent_and_exact (self):
        process = MagicMock()
        process.poll.return_value = None
        log = MagicMock()
        capability = MagicMock()
        root = MagicMock()
        owned = runtime.OwnedChronicle(
            process, log, capability, root, self.record(8100))
        owned.stop()
        owned.stop()
        process.terminate.assert_called_once_with()
        process.wait.assert_called_once_with(timeout=runtime.PROCESS_STOP_SECONDS)
        capability.remove.assert_called_once_with()
        log.close.assert_called_once_with()
        root.close.assert_called_once_with()
        with self.assertRaises(safe_io.SafeIOError):
            _ = owned.response_key
        self.assertIsNone(owned._capability)
        self.assertIsNone(owned._log)
        self.assertIsNone(owned._runtime_root)

    def test_owned_stop_retains_exact_cleanup_ledger_until_retry_succeeds (self):
        process = MagicMock()
        process.poll.return_value = 0
        log = MagicMock()
        capability = MagicMock()
        capability.remove.side_effect = [OSError("sharing"), None]
        root = MagicMock()
        record = self.record(8100)
        owned = runtime.OwnedChronicle(process, log, capability, root, record)

        with self.assertRaises(safe_io.SafeIOError):
            owned.stop()
        self.assertIs(owned._capability, capability)
        self.assertIs(owned._runtime_root, root)
        self.assertEqual(owned.response_key, record.key)
        root.close.assert_not_called()

        owned.stop()
        self.assertEqual(capability.remove.call_count, 2)
        root.close.assert_called_once_with()
        self.assertIsNone(owned._capability)
        self.assertIsNone(owned._record)


if __name__ == "__main__":
    unittest.main()
