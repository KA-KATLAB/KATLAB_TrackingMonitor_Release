"""Owned Chronicle capability, interpreter, and signed loopback transport.

This module is the one runtime boundary shared by the Backend-owned loop and
the Chronicle CLI.  It is deliberately stdlib-only and imports ``safe_io`` by
its package name so every caller observes the same exception and schema types.
"""

from __future__ import annotations

import http.client
import json
import math
import os
import re
import shutil
import socket
import subprocess
import sys
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import BinaryIO

from Scripts.Chronicle import safe_io


CAPABILITY_RELATIVE = ".chronicle_capability.json"
CAPABILITY_LIMIT = 16_384
CAPABILITY_SESSION_ENV = "KATLAB_CHRONICLE_SESSION"
PYTHON_ENV = "KATLAB_CHRONICLE_PYTHON"
LOOP_SECONDS = "60"
PROCESS_STOP_SECONDS = 10.0
PROBE_TIMEOUT_SECONDS = 15.0
EXECUTABLE_LIMIT = 67_108_864
_READ_CHUNK = 65_536
_LIVENESS_DEADLINE_SECONDS = 2.0
_SESSION_RX = re.compile(r"[0-9a-f]{32}")
_KEY_RX = re.compile(r"[0-9a-f]{64}")


def ensure_production_mode () -> None:
    """Reject every production Chronicle entrypoint before optional I/O."""
    if os.environ.get("KATLAB_TRACKER_CONFIG") or os.environ.get(
            "KATLAB_TRACKER_DEMO") == "1":
        raise safe_io.TransportUnavailable(
            "production Chronicle is disabled for demo or explicit config mode")


@dataclass(frozen=True)
class BoundPython:
    path: str
    identity: safe_io.FileIdentity
    canonical_path: str

    def recheck (self) -> None:
        current = safe_io.read_bound_file(
            self.path, max_bytes=EXECUTABLE_LIMIT,
            expected_identity=self.identity)
        if current.canonical_path != self.canonical_path:
            raise safe_io.PrerequisiteError(
                "selected Chronicle interpreter path changed")

    def argv (self, *arguments: str) -> list[str]:
        if any(not isinstance(value, str) or "\x00" in value for value in arguments):
            raise safe_io.PrerequisiteError("Chronicle interpreter arguments are invalid")
        self.recheck()
        return [self.path, *arguments]


def select_chronicle_python () -> BoundPython:
    """Resolve and bind the one Chronicle interpreter for this operation."""
    ensure_production_mode()
    override = os.environ.get(PYTHON_ENV)
    if override:
        if not os.path.isabs(override) or "\x00" in override:
            raise safe_io.PrerequisiteError(
                "KATLAB_CHRONICLE_PYTHON must be an absolute path")
        selected = os.path.abspath(override)
    else:
        discovered = shutil.which("python")
        if not discovered:
            raise safe_io.PrerequisiteError(
                "no Chronicle Python is available on PATH")
        selected = os.path.abspath(discovered)
    bound = safe_io.read_bound_file(selected, max_bytes=EXECUTABLE_LIMIT)
    return BoundPython(selected, bound.identity, bound.canonical_path)


def require_current_chronicle_python () -> BoundPython:
    """Bind the selected interpreter and prove this process is that file."""
    selected = select_chronicle_python()
    running = safe_io.read_bound_file(sys.executable, max_bytes=EXECUTABLE_LIMIT)
    if (running.identity != selected.identity
            or running.canonical_path != selected.canonical_path):
        raise safe_io.PrerequisiteError(
            "running interpreter is not the selected Chronicle Python")
    return selected


def probe_chronicle_python (interpreter: BoundPython) -> None:
    """Prove the selected ordinary interpreter has the Chronicle dependency set."""
    probe = (
        "import importlib.metadata as m,site;site.main();"
        "v=lambda n:tuple(int(x) for x in m.version(n).split('.')[:2]);"
        "assert m.version('mkdocs')=='1.6.1';"
        "assert m.version('mkdocs-mermaid2-plugin')=='1.2.3';"
        "assert m.version('mkdocs-panzoom-plugin')=='0.5.2';"
        "assert v('pymdown-extensions')>=(10,7);"
        "assert v('click')<(8,2);"
        "import click,mermaid2,mkdocs,mkdocs_panzoom_plugin,pymdownx"
    )
    creationflags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
    try:
        completed = subprocess.run(
            interpreter.argv("-I", "-S", "-B", "-c", probe),
            stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL, timeout=PROBE_TIMEOUT_SECONDS,
            creationflags=creationflags, check=False)
    except (OSError, subprocess.SubprocessError) as exc:
        raise safe_io.PrerequisiteError(
            "Chronicle Python dependency probe failed") from exc
    if completed.returncode != 0:
        raise safe_io.PrerequisiteError(
            "Chronicle Python dependencies are unavailable or incompatible")


@dataclass(frozen=True)
class CapabilityRecord:
    origin: str
    key: bytes
    session: str
    parent: safe_io.ProcessStamp

    def __post_init__ (self) -> None:
        normalized = safe_io.normalize_tracker_origin(self.origin)
        if normalized.url != self.origin:
            raise ValueError("capability origin is not canonical")
        if not isinstance(self.key, bytes) or len(self.key) != 32:
            raise ValueError("capability key must contain 32 bytes")
        if not isinstance(self.session, str) or _SESSION_RX.fullmatch(
                self.session) is None:
            raise ValueError("capability session is invalid")

    def canonical_bytes (self) -> bytes:
        value = {
            "key": self.key.hex(),
            "origin": self.origin,
            "parent_created": self.parent.creation_filetime,
            "parent_pid": self.parent.pid,
            "session": self.session,
            "v": 1,
        }
        encoded = json.dumps(
            value, ensure_ascii=True, allow_nan=False, sort_keys=True,
            separators=(",", ":")).encode("ascii") + b"\n"
        if len(encoded) > CAPABILITY_LIMIT:
            raise safe_io.SafeIOError("Chronicle capability exceeds its byte bound")
        return encoded


def parse_capability (data: bytes) -> CapabilityRecord:
    if not isinstance(data, bytes) or not data or len(data) > CAPABILITY_LIMIT:
        raise safe_io.SafeIOError("Chronicle capability size is invalid")
    if data.startswith(b"\xef\xbb\xbf"):
        raise safe_io.SafeIOError("Chronicle capability must not contain a BOM")

    def pairs (items):
        result = {}
        for name, value in items:
            if name in result:
                raise safe_io.SafeIOError(
                    "Chronicle capability contains a duplicate field")
            result[name] = value
        return result

    try:
        value = json.loads(
            data.decode("utf-8", errors="strict"), object_pairs_hook=pairs,
            parse_constant=lambda _value: (_ for _ in ()).throw(
                safe_io.SafeIOError(
                    "Chronicle capability contains a non-finite number")))
    except safe_io.SafeIOError:
        raise
    except (UnicodeError, json.JSONDecodeError, ValueError, OverflowError,
            RecursionError) as exc:
        raise safe_io.SafeIOError(
            "Chronicle capability is not strict UTF-8 JSON") from exc
    fields = {"v", "origin", "key", "session", "parent_pid", "parent_created"}
    if not isinstance(value, dict) or set(value) != fields:
        raise safe_io.SafeIOError("Chronicle capability fields are invalid")
    if (type(value["v"]) is not int or value["v"] != 1
            or type(value["parent_pid"]) is not int
            or value["parent_pid"] <= 0
            or type(value["parent_created"]) is not int
            or value["parent_created"] <= 0
            or not isinstance(value["key"], str)
            or _KEY_RX.fullmatch(value["key"]) is None
            or not isinstance(value["session"], str)
            or _SESSION_RX.fullmatch(value["session"]) is None
            or not isinstance(value["origin"], str)):
        raise safe_io.SafeIOError("Chronicle capability values are invalid")
    try:
        record = CapabilityRecord(
            value["origin"], bytes.fromhex(value["key"]), value["session"],
            safe_io.ProcessStamp(value["parent_pid"], value["parent_created"]))
    except (ValueError, TypeError) as exc:
        raise safe_io.SafeIOError("Chronicle capability values are invalid") from exc
    if record.canonical_bytes() != data:
        raise safe_io.SafeIOError("Chronicle capability is not canonical JSON")
    return record


def _remaining (deadline: float) -> float:
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise safe_io.TransportUnavailable("tracker request deadline expired")
    return remaining


def _headers (response: http.client.HTTPResponse) -> list[tuple[bytes, bytes]]:
    result: list[tuple[bytes, bytes]] = []
    for name, value in response.getheaders():
        try:
            result.append((name.encode("ascii"), value.encode("latin-1")))
        except UnicodeError as exc:
            raise safe_io.SafeIOError(
                "tracker returned a non-wire-compatible header") from exc
    return result


class TrackerClient:
    """One capability-bound, single-model authenticated REST session."""

    def __init__ (self, record: CapabilityRecord, *,
                  request_deadline_cap: float | None = None):
        if not isinstance(record, CapabilityRecord):
            raise TypeError("TrackerClient requires a validated capability")
        if (request_deadline_cap is not None
                and (type(request_deadline_cap) not in (int, float)
                     or not math.isfinite(request_deadline_cap)
                     or request_deadline_cap <= 0)):
            raise ValueError("TrackerClient request deadline cap is invalid")
        self._record: CapabilityRecord | None = record
        self._origin = safe_io.normalize_tracker_origin(record.origin)
        self._ledger = safe_io.TrackerModelSession(record.key)
        self._request_deadline_cap = request_deadline_cap
        self._closed = False

    @property
    def origin (self) -> str:
        return self._origin.url

    def __enter__ (self) -> "TrackerClient":
        self.ensure_live()
        return self

    def __exit__ (self, _type, _value, _traceback) -> None:
        self.close()

    def close (self) -> None:
        self._closed = True
        self._ledger = None
        self._record = None

    def ensure_live (self) -> None:
        if self._closed or self._record is None:
            raise safe_io.TransportUnavailable("Chronicle tracker session is closed")
        state = safe_io.observe_process(self._record.parent)
        if state is not safe_io.ProcessState.LIVE:
            self.close()
            raise safe_io.TransportUnavailable(
                "Chronicle tracker parent is not the exact live process")

    def _connect (self, deadline: float) -> http.client.HTTPConnection:
        self.ensure_live()
        connection = http.client.HTTPConnection(
            self._origin.host, self._origin.port, timeout=_remaining(deadline))
        connection.connect()
        if connection.sock is None:
            raise safe_io.TransportUnavailable("tracker connection has no socket")
        connection.sock.settimeout(_remaining(deadline))
        return connection

    def request (self, token: str, *, repo_id: str | None = None,
                 offset: int | None = None, day: str | None = None,
                 next_day: str | None = None) -> object:
        self.ensure_live()
        ledger = self._ledger
        if ledger is None:
            raise safe_io.TransportUnavailable("Chronicle tracker session is closed")
        request = ledger.begin(token, repo_id=repo_id, offset=offset,
                               day=day, next_day=next_day)
        deadline = request.deadline
        if self._request_deadline_cap is not None:
            deadline = min(
                deadline, time.monotonic() + self._request_deadline_cap)
        connection = None
        response = None
        deadline_socket = None
        deadline_timer = None
        try:
            connection = self._connect(deadline)
            deadline_socket = connection.sock
            assert deadline_socket is not None

            def expire_socket () -> None:
                try:
                    deadline_socket.shutdown(socket.SHUT_RDWR)
                except OSError:
                    pass
                try:
                    deadline_socket.close()
                except OSError:
                    pass

            # A socket timeout is per recv and a slow trickle can continually reset
            # it.  Retain the actual socket independently from HTTPConnection (which
            # clears ``sock`` after Connection: close) and shut it down at the one
            # effective absolute request deadline.
            deadline_timer = threading.Timer(
                _remaining(deadline), expire_socket)
            deadline_timer.daemon = True
            deadline_timer.start()
            target = request.target.decode("ascii", errors="strict")
            connection.putrequest(
                "GET", target, skip_host=False, skip_accept_encoding=True)
            connection.putheader("Accept-Encoding", "identity")
            connection.putheader(
                "X-KATLAB-Chronicle-Nonce", request.nonce.decode("ascii"))
            if connection.sock is not None:
                connection.sock.settimeout(_remaining(deadline))
            connection.endheaders()
            if connection.sock is not None:
                connection.sock.settimeout(_remaining(deadline))
            response = connection.getresponse()
            headers = _headers(response)
            content_length = response.getheader("Content-Length")
            if content_length is not None:
                try:
                    declared = int(content_length, 10)
                except ValueError as exc:
                    raise safe_io.SafeIOError(
                        "tracker content-length is invalid") from exc
                if declared < 0 or declared > safe_io.TRACKER_RESPONSE_LIMIT:
                    raise safe_io.SafeIOError(
                        "tracker response exceeds its byte bound")
            body = bytearray()
            while True:
                if connection.sock is not None:
                    connection.sock.settimeout(_remaining(deadline))
                chunk = response.read(min(
                    _READ_CHUNK,
                    safe_io.TRACKER_RESPONSE_LIMIT + 1 - len(body)))
                if not chunk:
                    break
                body.extend(chunk)
                if len(body) > safe_io.TRACKER_RESPONSE_LIMIT:
                    raise safe_io.SafeIOError(
                        "tracker response exceeds its byte bound")
            self.ensure_live()
            return ledger.accept(
                request, response.status, headers, bytes(body))
        except safe_io.SafeIOError:
            self.close()
            raise
        except (OSError, http.client.HTTPException, UnicodeError,
                ValueError) as exc:
            self.close()
            raise safe_io.TransportUnavailable(
                "authenticated tracker request failed") from exc
        finally:
            if response is not None:
                try:
                    response.close()
                except OSError:
                    pass
            if deadline_timer is not None:
                deadline_timer.cancel()
            if connection is not None:
                connection.close()

    def tracker_alive (self) -> bool:
        probe = None
        try:
            self.ensure_live()
            record = self._record
            assert record is not None
            # A reachable port does not prove that the listener owns this
            # capability.  Use a fresh bounded ledger so repeat pre/post-view
            # probes each require a new nonce and authenticated response without
            # consuming or repeating a singleton in the caller's model ledger.
            probe = TrackerClient(
                record, request_deadline_cap=_LIVENESS_DEADLINE_SECONDS)
            probe.request("repos")
            return True
        except Exception:
            return False
        finally:
            if probe is not None:
                probe.close()


def load_session (repo_root: os.PathLike[str] | str) -> TrackerClient:
    ensure_production_mode()
    with safe_io.bind_root(Path(repo_root) / "Chronicle" / "runtime") as root:
        try:
            bound = safe_io.read_private_owned_file(
                root, CAPABILITY_RELATIVE, max_bytes=CAPABILITY_LIMIT)
        except safe_io.SafeIOError as exc:
            raise safe_io.TransportUnavailable(
                "Chronicle capability is unavailable") from exc
    if bound is None:
        raise safe_io.TransportUnavailable("Chronicle capability is unavailable")
    record = parse_capability(bound.data)
    expected_session = os.environ.get(CAPABILITY_SESSION_ENV)
    if expected_session is not None and expected_session != record.session:
        raise safe_io.TransportUnavailable(
            "Chronicle capability session does not match the owned child")
    client = TrackerClient(record)
    client.ensure_live()
    return client


class PendingChronicleCleanup:
    """Exact resources retained until an incomplete cleanup can be retried."""

    def __init__ (self, process: subprocess.Popen | None, log: BinaryIO | None,
                  capability, runtime_root: safe_io.SafeRoot | None,
                  private_creation_cleanup=None):
        self.process = process
        self._log = log
        self._capability = capability
        self._runtime_root = runtime_root
        self._private_creation_cleanup = private_creation_cleanup

    def _stop_process (self) -> None:
        if self.process is None:
            return
        if self.process.poll() is not None:
            self.process = None
            return
        try:
            self.process.terminate()
            self.process.wait(timeout=PROCESS_STOP_SECONDS)
        except Exception:
            self.process.kill()
            self.process.wait(timeout=PROCESS_STOP_SECONDS)
        self.process = None

    def stop (self) -> None:
        failure = None
        try:
            self._stop_process()
        except Exception as exc:
            failure = exc
        if self._log is not None:
            try:
                self._log.close()
                self._log = None
            except Exception as exc:
                failure = failure or exc
        if self._capability is not None:
            try:
                self._capability.remove()
                self._capability = None
            except Exception as exc:
                failure = failure or exc
        if self._private_creation_cleanup is not None:
            try:
                self._private_creation_cleanup.remove()
                self._private_creation_cleanup = None
            except Exception as exc:
                failure = failure or exc
        if (self._capability is None
                and self._private_creation_cleanup is None
                and self._runtime_root is not None):
            try:
                self._runtime_root.close()
                self._runtime_root = None
            except Exception as exc:
                failure = failure or exc
        if failure is not None:
            raise safe_io.SafeIOError(
                "Chronicle cleanup was incomplete") from failure


class ChronicleStartupError(safe_io.SafeIOError):
    """Startup failed and ``cleanup`` retains exact resources for retry."""

    def __init__ (self, cleanup: PendingChronicleCleanup):
        super().__init__("Chronicle startup rollback was incomplete")
        self.cleanup = cleanup


class OwnedChronicle(PendingChronicleCleanup):
    """Parent-owned loop, private capability, log, and exact cleanup ledger."""

    def __init__ (self, process: subprocess.Popen, log: BinaryIO,
                  capability, runtime_root: safe_io.SafeRoot,
                  record: CapabilityRecord):
        super().__init__(process, log, capability, runtime_root)
        self._record = record
        self._stopped = False

    @property
    def response_key (self) -> bytes:
        if self._record is None:
            raise safe_io.SafeIOError("Chronicle owned loop is stopped")
        return self._record.key

    def is_live (self) -> bool:
        return (not self._stopped and self.process is not None
                and self.process.poll() is None)

    def stop (self) -> None:
        if self._stopped:
            return
        super().stop()
        self._record = None
        self._stopped = True


def _remove_stale_capability (root: safe_io.SafeRoot) -> None:
    try:
        existing = safe_io.read_private_owned_file(
            root, CAPABILITY_RELATIVE, max_bytes=CAPABILITY_LIMIT)
    except safe_io.SafeIOError as exc:
        if exc.winerror in (2, 3):
            return
        raise
    if existing is None:
        return
    record = parse_capability(existing.data)
    state = safe_io.observe_process(record.parent)
    if state is not safe_io.ProcessState.DEAD:
        raise safe_io.SafeIOError(
            "live or ambiguous Chronicle capability residue is preserved")
    safe_io.remove_private_existing_file(
        root, CAPABILITY_RELATIVE, existing)


def start_chronicle (host: str, port: int,
                     repo_root: os.PathLike[str] | str) -> OwnedChronicle:
    """Create the private capability and launch one exact owned loop."""
    ensure_production_mode()
    origin = safe_io.origin_from_bind(host, port)
    if origin is None:
        raise safe_io.PrerequisiteError(
            "Chronicle requires a supported loopback tracker bind")
    interpreter = select_chronicle_python()
    probe_chronicle_python(interpreter)
    parent = safe_io.current_process_stamp()
    record = CapabilityRecord(
        origin.url, os.urandom(32), os.urandom(16).hex(), parent)
    repo = Path(os.path.abspath(os.fspath(repo_root)))
    runtime_root = safe_io.bind_root(repo / "Chronicle" / "runtime", create=True)
    capability = None
    private_creation_cleanup = None
    log = None
    process = None
    try:
        _remove_stale_capability(runtime_root)
        log_directory = repo / "data" / "logs"
        log_directory.mkdir(parents=True, exist_ok=True)
        log = (log_directory / "chronicle.log").open("ab", buffering=0)
        try:
            capability = safe_io.create_private_owned_file(
                runtime_root, CAPABILITY_RELATIVE, record.canonical_bytes(),
                max_bytes=CAPABILITY_LIMIT)
        except safe_io.PrivateCreationError as exc:
            private_creation_cleanup = exc.cleanup
            raise
        environment = os.environ.copy()
        environment[PYTHON_ENV] = interpreter.path
        environment[CAPABILITY_SESSION_ENV] = record.session
        script = repo / "Scripts" / "Chronicle" / "generate.py"
        command = interpreter.argv(
            "-I", "-B", "-u", str(script), "--loop", LOOP_SECONDS, "--build")
        creationflags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
        process = subprocess.Popen(
            command, cwd=str(repo), env=environment, stdin=subprocess.DEVNULL,
            stdout=log, stderr=subprocess.STDOUT, creationflags=creationflags)
        if process.poll() is not None:
            raise safe_io.PrerequisiteError(
                "Chronicle loop exited during owned startup")
        return OwnedChronicle(process, log, capability, runtime_root, record)
    except Exception:
        cleanup = PendingChronicleCleanup(
            process, log, capability, runtime_root,
            private_creation_cleanup)
        try:
            cleanup.stop()
        except safe_io.SafeIOError as cleanup_error:
            raise ChronicleStartupError(cleanup) from cleanup_error
        raise
