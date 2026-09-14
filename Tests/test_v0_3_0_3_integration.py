"""Opt-in real Chronicle pipeline; all data/output live in a temporary fixture.

Run with KATLAB_CHRONICLE_NETWORK_TESTS=1. The test fetches only the two pinned
assets and uses the already-installed Chronicle Python/MkDocs, never pip or a
production tracker. Normal offline unit-test runs explicitly skip this case.
"""

import gc
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import threading
import time
import unittest
from datetime import datetime, timedelta, timezone
from urllib.parse import urlsplit
from unittest.mock import patch

from Backend.app.chronicle_auth import response_mac
from Scripts.Chronicle import runtime, safe_io


SOURCE = Path(__file__).resolve().parents[1]


@unittest.skipUnless(
    os.name == "nt" and os.environ.get("KATLAB_CHRONICLE_NETWORK_TESTS") == "1",
    "opt-in real Windows/MkDocs/pinned-asset integration",
)
class ChroniclePipelineTests(unittest.TestCase):
    def _populate_fixture (self, fixture: Path,
                           source_files: dict[str, bytes]) -> Path:
        scripts = fixture / "Scripts" / "Chronicle"
        scripts.mkdir(parents=True)
        for name in ("generate.py", "pages.py", "safe_io.py", "runtime.py"):
            shutil.copyfile(SOURCE / "Scripts" / "Chronicle" / name, scripts / name)
        (fixture / "Backend" / "app").mkdir(parents=True)
        shutil.copyfile(
            SOURCE / "Backend" / "app" / "chronicle_auth.py",
            fixture / "Backend" / "app" / "chronicle_auth.py",
        )
        for folder in ("Claude_Info", "Codex_Info", "Docs"):
            (fixture / folder).mkdir()
        for relative, content in source_files.items():
            target = fixture / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(content)

        vendor = scripts / "assets" / "vendor"
        vendor.mkdir(parents=True)
        with safe_io.bind_root(scripts) as asset_root:
            for token in ("fetch-mermaid", "fetch-bootswatch"):
                safe_io.fetch_pinned_asset(token, asset_root)
        return scripts

    def _exercise_pipeline (self, source_files: dict[str, bytes], *,
                            mirror_relative: str, mirror_bytes: bytes):
        with tempfile.TemporaryDirectory(prefix="katlab-chronicle-pipeline-") as temporary:
            fixture = Path(temporary)
            # Fetch the real pinned bytes outside the workspace. This independently
            # checks the downloader and the source-vendor/runtime-derivative contract.
            scripts = self._populate_fixture(fixture, source_files)

            now = datetime.now(timezone.utc).replace(microsecond=0)
            today = now.date()
            stamp = now.isoformat().replace("+00:00", "Z")
            calendar = [{"day": (today - timedelta(days=364 - index)).isoformat(),
                         "events": int(index == 364), "commits": int(index == 364),
                         "minutes": 2 if index == 364 else 0}
                        for index in range(365)]
            plan_file = "temp/Plan/PLAN_fixture.txt"
            reference = plan_file + " - A.1"
            digest = "a" * 40
            event = {
                "id": 1, "repo_id": "Fixture", "ts": stamp, "tool": "apply_patch",
                "file": "src/main.py", "task_ref": reference, "candidates_json": None,
                "commit_hash": digest, "session_id": "fixture-session", "branch": "fixture",
                "turn_id": None, "agent_id": None, "tool_use_id": None,
                "plan_file": plan_file, "task_id": "A.1", "mode": "B", "swept": 0,
                "operation": "update", "provider": "codex",
            }
            responses = {
                "/api/repos": [{
                    "id": "Fixture", "name": "Fixture", "path": "D:/fixture",
                    "clean": True, "offline": False, "paths_complete": True,
                    "status_valid": True, "count": 0, "branch": "fixture",
                    "observed_at": stamp, "last_event_ts": stamp,
                    "oldest_uncommitted_ts": None, "activity_buckets": [0] * 12,
                    "warnings": [],
                }],
                "/api/tasks": [{
                    "repo": "Fixture", "plan_file": plan_file, "task_id": "A.1",
                    "title": "Fixture <safe>", "why": "Exercise signed real HTTP",
                    "task_ref": reference, "status": "done", "files": ["src/main.py"],
                    "last_event_ts": stamp,
                }],
                "/api/stats": {"activity_calendar": calendar},
                "/api/history": [{"commit": {
                    "repo_id": "Fixture", "hash": digest, "message": "Fixture commit",
                    "ts": stamp, "files_json": '["src/main.py"]', "parents": None,
                }, "events": [event]}],
                "/api/events": [event],
            }
            key = os.urandom(32)
            state = {"valid_proof": True, "requests": []}

            class Handler(BaseHTTPRequestHandler):
                protocol_version = "HTTP/1.1"

                def log_message (self, *_args):
                    pass

                def do_GET (self):
                    state["requests"].append(self.path)
                    route = urlsplit(self.path).path
                    if route not in responses:
                        self.send_error(404)
                        return
                    body = json.dumps({
                        "success": True, "data": responses[route], "message": "",
                        "timestamp": stamp,
                    }, separators=(",", ":")).encode("utf-8")
                    nonce = self.headers.get("X-KATLAB-Chronicle-Nonce", "").encode("ascii")
                    headers = [(b"content-type", b"application/json")]
                    proof = response_mac(
                        key if state["valid_proof"] else b"x" * 32,
                        nonce, self.path.encode("ascii"), 200, headers, body)
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Content-Length", str(len(body)))
                    self.send_header("X-KATLAB-Chronicle-Mac", proof.decode("ascii"))
                    self.send_header("Connection", "close")
                    self.end_headers()
                    self.wfile.write(body)

            server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
            server.daemon_threads = True
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                clean_environment = os.environ.copy()
                for name in ("KATLAB_TRACKER_CONFIG", "KATLAB_TRACKER_DEMO",
                             runtime.CAPABILITY_SESSION_ENV):
                    clean_environment.pop(name, None)
                with patch.dict(os.environ, clean_environment, clear=True):
                    interpreter = runtime.select_chronicle_python()
                clean_environment[runtime.PYTHON_ENV] = interpreter.path
                record = runtime.CapabilityRecord(
                    f"http://127.0.0.1:{server.server_port}", key,
                    os.urandom(16).hex(), safe_io.current_process_stamp())
                with safe_io.bind_root(fixture / "Chronicle" / "runtime", create=True) as root:
                    capability = safe_io.create_private_owned_file(
                        root, runtime.CAPABILITY_RELATIVE, record.canonical_bytes(),
                        max_bytes=runtime.CAPABILITY_LIMIT)
                    try:
                        def command (*arguments):
                            return subprocess.run(
                                interpreter.argv("-I", "-B", str(scripts / "generate.py"),
                                                 *arguments),
                                cwd=fixture, env=clean_environment,
                                capture_output=True, text=True, encoding="utf-8",
                                timeout=120, creationflags=subprocess.CREATE_NO_WINDOW,
                            )

                        generated = command("--build")
                        self.assertEqual(generated.returncode, 0,
                                         generated.stdout + generated.stderr)
                        built = root.read("site/index.html", max_bytes=16_777_216)
                        self.assertIn(b"Fixture", built.data)
                        self.assertTrue((root.path / "docs" / "devlog" /
                                         f"{today.isoformat()}.md").is_file())
                        self.assertEqual(root.read(
                            f"docs/mirror/{mirror_relative}", max_bytes=16_777_216,
                        ).data, mirror_bytes)
                        for relative, expected in (
                            (f"docs/assets/vendor/{safe_io.MERMAID_NAME}", safe_io.MERMAID_SHA256),
                            (f"docs/assets/vendor/{safe_io.BOOTSWATCH_NAME}",
                             safe_io.BOOTSWATCH_LOCAL_SHA256),
                        ):
                            asset = root.read(relative, max_bytes=5_000_000)
                            self.assertEqual(hashlib.sha256(asset.data).hexdigest(), expected)
                        verified = command("--verify")
                        self.assertEqual(verified.returncode, 0,
                                         verified.stdout + verified.stderr)
                        self.assertIn("PARITY OK", verified.stdout)
                        self.assertTrue(any("since=" in value for value in state["requests"]))
                        self.assertNotIn(key.hex(), generated.stdout + generated.stderr)

                        before_docs = root.read("docs/index.md", max_bytes=16_777_216)
                        state["valid_proof"] = False
                        rejected = command("--build")
                        self.assertNotEqual(rejected.returncode, 0)
                        self.assertEqual(root.read("site/index.html", max_bytes=16_777_216).data,
                                         built.data)
                        self.assertEqual(root.read("docs/index.md", max_bytes=16_777_216).data,
                                         before_docs.data)
                    finally:
                        capability.remove()
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=5)
                self.assertFalse(thread.is_alive())

    def test_signed_model_build_and_bad_proof_preserve_previous_output (self):
        sources = {
            "README.md": b"# Fixture\n\n[Guide](Codex_Info/Repository_Guide.md)\n",
            "LICENSE": b"Fixture only\n",
            "AGENTS.md": b"# Fixture guidance\n",
            "Codex_Info/Repository_Guide.md": b"# Repository guide\n",
            "Claude_Info/Architecture_Notes.md": b"# Architecture\n",
            "Docs/Guide.md": b"# Guide\n",
            "TrackingMonitor_v0.3.0.3_Release_Notes.md": b"# Fixture release\n",
        }
        self._exercise_pipeline(
            sources,
            mirror_relative="Codex_Info/Repository_Guide.md",
            mirror_bytes=sources["Codex_Info/Repository_Guide.md"],
        )

    def test_actual_bounded_source_mirror_strict_build (self):
        snapshot = safe_io.capture_chronicle_sources(SOURCE)
        sources = {entry.relative_path: entry.data for entry in snapshot.entries}
        self.assertEqual(len(sources), len(snapshot.entries))
        self.assertIn("AGENTS.md", sources)
        self._exercise_pipeline(
            sources,
            mirror_relative="AGENTS.md",
            mirror_bytes=sources["AGENTS.md"],
        )

    def test_backend_lifespan_owns_signed_loop_build_and_exact_cleanup (self):
        import uvicorn
        from Backend.app import db, main
        from Backend.app.config import AppConfig, ServerConfig

        sources = {
            "README.md": b"# Fixture\n\n[Guide](Codex_Info/Repository_Guide.md)\n",
            "LICENSE": b"Fixture only\n",
            "AGENTS.md": b"# Fixture guidance\n",
            "Codex_Info/Repository_Guide.md": b"# Repository guide\n",
            "Claude_Info/Architecture_Notes.md": b"# Architecture\n",
            "Docs/Guide.md": b"# Guide\n",
            "TrackingMonitor_v0.3.0.3_Release_Notes.md": b"# Fixture release\n",
        }
        with tempfile.TemporaryDirectory(
                prefix="katlab-chronicle-lifespan-") as temporary:
            fixture = Path(temporary)
            self._populate_fixture(fixture, sources)
            clean_environment = os.environ.copy()
            for name in ("KATLAB_TRACKER_CONFIG", "KATLAB_TRACKER_DEMO",
                         runtime.CAPABILITY_SESSION_ENV, runtime.PYTHON_ENV):
                clean_environment.pop(name, None)
            with patch.dict(os.environ, clean_environment, clear=True):
                interpreter = runtime.select_chronicle_python()
            clean_environment[runtime.PYTHON_ENV] = interpreter.path

            listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            listener.bind(("127.0.0.1", 0))
            listener.listen(128)
            port = listener.getsockname()[1]
            snapshot = type("Snapshot", (), {
                "config": AppConfig(
                    ServerConfig("127.0.0.1", port, 5), (),
                    fixture / "activity-runtime",
                ),
            })()
            runtime_root = fixture / "Chronicle" / "runtime"
            capability_path = runtime_root / runtime.CAPABILITY_RELATIVE
            app = None
            server = None
            thread = None
            owned = None
            process = None
            database_connections = []
            native_sqlite_connect = db.sqlite3.connect

            def test_sqlite_connect (*arguments, **keywords):
                # Retain the real per-thread SQLite connections so this test can
                # close them after Uvicorn retires all request workers.  Cross-
                # thread use remains absent; the flag permits teardown only.
                keywords["check_same_thread"] = False
                connection = native_sqlite_connect(*arguments, **keywords)
                database_connections.append(connection)
                return connection

            with patch.dict(os.environ, clean_environment, clear=True), \
                 patch.object(main, "REPO_ROOT", fixture), \
                 patch.object(main, "CHRONICLE_SITE", runtime_root / "site"), \
                 patch.object(main, "FRONTEND_DIST", fixture / "Frontend" / "dist"), \
                 patch.object(db, "DB_PATH", fixture / "data" / "tracking.db"), \
                 patch.object(db, "DATA_DIR", fixture / "data"), \
                 patch.object(db.sqlite3, "connect", side_effect=test_sqlite_connect), \
                 patch.object(runtime, "LOOP_SECONDS", "10"):
                try:
                    app = main.create_app(snapshot)
                    configuration = uvicorn.Config(
                        app, log_level="warning", lifespan="on")
                    server = uvicorn.Server(configuration)
                    thread = threading.Thread(
                        target=server.run, kwargs={"sockets": [listener]},
                        name="chronicle-integration-uvicorn", daemon=True)
                    thread.start()

                    startup_deadline = time.monotonic() + 20
                    while (not server.started and thread.is_alive()
                           and time.monotonic() < startup_deadline):
                        time.sleep(0.05)
                    self.assertTrue(server.started, "Uvicorn lifespan did not start")
                    owned = app.state.chronicle_runtime
                    self.assertIsNotNone(owned)
                    process = owned.process
                    self.assertIsNone(process.poll())
                    self.assertIsNotNone(app.state.chronicle_signer.snapshot())
                    self.assertTrue(capability_path.is_file())

                    build_deadline = time.monotonic() + 35
                    index = runtime_root / "site" / "index.html"
                    while (not index.is_file() and process.poll() is None
                           and time.monotonic() < build_deadline):
                        time.sleep(0.1)
                    if not index.is_file():
                        log_path = fixture / "data" / "logs" / "chronicle.log"
                        detail = (log_path.read_text(encoding="utf-8", errors="replace")[-4000:]
                                  if log_path.is_file() else "<no child log>")
                        self.fail(
                            f"owned Chronicle did not build the site; "
                            f"exit={process.poll()} log={detail}")
                    self.assertIn(b"KATLAB Chronicle", index.read_bytes())
                finally:
                    if server is not None:
                        server.should_exit = True
                    if thread is not None:
                        thread.join(timeout=20)
                        self.assertFalse(thread.is_alive())
                        for connection in database_connections:
                            connection.close()
                        # sqlite connections created in the retired Uvicorn
                        # thread are finalized only after their thread-local
                        # cycle is collected; release the temporary DB now.
                        gc.collect()
                    try:
                        listener.close()
                    except OSError:
                        pass

            self.assertIsNotNone(app)
            self.assertIsNotNone(owned)
            self.assertIsNotNone(process)
            self.assertIsNotNone(process.poll())
            self.assertFalse(capability_path.exists())
            self.assertIsNone(app.state.chronicle_signer.snapshot())
            self.assertIsNone(app.state.chronicle_runtime)
            self.assertIsNone(app.state.chronicle_proc)


if __name__ == "__main__":
    unittest.main()
