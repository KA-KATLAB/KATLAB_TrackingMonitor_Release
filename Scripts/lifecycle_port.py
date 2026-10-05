"""Fail-closed local port and health checks for the Windows launchers."""

import http.client
import ipaddress
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import time
from dataclasses import dataclass
from urllib import request
import webbrowser

from Backend.app.version import __version__
from Scripts.frontend_build import FrontendBuildError, validate_frontend
from Scripts.lifecycle_process import ProcessOwnershipError, prepare_owned_processes


REPO_ROOT = Path(__file__).resolve().parents[1]
DEMO_PORT = 8101
STOP_TIMEOUT_SECONDS = 15
READY_TIMEOUT_SECONDS = 45
POLL_SECONDS = 0.5
COMMAND_TIMEOUT_SECONDS = 10
HTTP_TIMEOUT_SECONDS = 2
MAX_HEALTH_BYTES = 1_048_576
MAX_NETSTAT_CHARS = 8_388_608
MAX_LISTENER_PIDS = 16
_PRODUCTION_OVERRIDES = (
    "KATLAB_TRACKER_CONFIG", "KATLAB_TRACKER_DB",
    "KATLAB_TRACKER_ACTIVITY_DIR", "KATLAB_TRACKER_DEMO",
)
_HOSTNAME = re.compile(r"^[A-Za-z0-9._-]+$")
_PORT_NUMBER = re.compile(r"^[0-9]{1,5}$")
_PID_NUMBER = re.compile(r"^[0-9]{1,10}$")
_NON_LISTENING_STATES = frozenset({
    "BOUND", "CLOSED", "CLOSE_WAIT", "CLOSING", "DELETE_TCB",
    "ESTABLISHED", "FIN_WAIT_1", "FIN_WAIT_2", "LAST_ACK",
    "SYN_RECEIVED", "SYN_SENT", "TIME_WAIT",
})
_monotonic = time.monotonic
_sleep = time.sleep


class LifecycleError(Exception):
    """A launcher cannot establish the requested lifecycle state safely."""


class _NoRedirect(request.HTTPRedirectHandler):
    def redirect_request (self, req, fp, code, msg, headers, newurl):
        return None


@dataclass(frozen=True)
class Profile:
    host: str
    port: int
    repo_ids: tuple[str, ...]
    config_exists: bool = True

    @property
    def origin (self) -> str:
        host = self.host
        if host.startswith("[") and host.endswith("]"):
            host = host[1:-1]
        try:
            address = ipaddress.ip_address(host)
        except ValueError:
            if ":" in host or not _HOSTNAME.fullmatch(host):
                raise LifecycleError("Configured HTTP host is invalid")
        else:
            if address.is_unspecified:
                host = "::1" if address.version == 6 else "127.0.0.1"
        if ":" in host:
            host = f"[{host}]"
        return f"http://{host}:{self.port}"


def load_profile (mode: str) -> Profile:
    """Read the backend's validated profile, never an inherited config path."""
    if mode == "tracker":
        if any(key in os.environ for key in _PRODUCTION_OVERRIDES):
            raise LifecycleError("Production launcher environment is overridden")
        config_path = REPO_ROOT / "Config" / "repos.yaml"
    elif mode == "demo":
        # Static demo_status rows are valid only under the backend's demo flag.
        os.environ["KATLAB_TRACKER_DEMO"] = "1"
        config_path = REPO_ROOT / "Demo" / "runtime" / "repos.demo.yaml"
        try:
            config_stat = config_path.lstat()
        except FileNotFoundError:
            return Profile("127.0.0.1", DEMO_PORT, (), False)
        if (stat.S_ISLNK(config_stat.st_mode)
                or getattr(config_stat, "st_file_attributes", 0) & getattr(
                    stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0)):
            raise LifecycleError("Demo config must be a regular file")
    else:
        raise LifecycleError("Unknown launcher mode")

    try:
        from Backend.app.config import ConfigAuthoringError, load_config_snapshot
    except ImportError as exc:
        raise LifecycleError("Backend configuration dependency is unavailable") from exc
    try:
        snapshot = load_config_snapshot(config_path)
    except (ConfigAuthoringError, RecursionError) as exc:
        raise LifecycleError("Configuration is unavailable or invalid") from exc
    config = snapshot.config
    if mode == "demo" and config.server.port != DEMO_PORT:
        raise LifecycleError("Demo config must use port 8101")
    profile = Profile(
        config.server.host, config.server.port,
        tuple(repo.id for repo in config.repos),
    )
    # An invalid HTTP origin must fail before a stop can kill any listener.
    profile.origin
    return profile


def parse_listening_pids (output: str, port: int) -> set[int]:
    """Parse exact TCP local endpoints from one netstat -ano snapshot."""
    if not isinstance(output, str):
        raise LifecycleError("Port enumeration returned no usable output")
    if len(output) > MAX_NETSTAT_CHARS:
        raise LifecycleError("Port enumeration exceeded the output limit")
    if not output.strip():
        raise LifecycleError("Port enumeration returned no usable output")
    pids: set[int] = set()
    saw_header = False
    saw_tcp = False
    for line in output.splitlines():
        fields = line.split()
        if not fields:
            continue
        if fields[0].lower() == "proto" or "active connections" in line.lower():
            saw_header = True
        if fields[0].upper() != "TCP":
            continue
        saw_tcp = True
        if len(fields) != 5:
            raise LifecycleError("Port enumeration returned a malformed TCP row")
        _, local, _, state, pid_text = fields
        endpoint, separator, local_port_text = local.rpartition(":")
        if not separator or not endpoint or not _PORT_NUMBER.fullmatch(local_port_text):
            raise LifecycleError("Port enumeration returned a malformed local endpoint")
        local_port = int(local_port_text)
        if not 1 <= local_port <= 65_535:
            raise LifecycleError("Port enumeration returned an invalid local port")
        if local_port != port:
            continue
        if state.upper() != "LISTENING":
            if state.upper() not in _NON_LISTENING_STATES:
                raise LifecycleError("Port enumeration returned an unknown TCP state")
            continue
        if not _PID_NUMBER.fullmatch(pid_text) or int(pid_text) > 4_294_967_295:
            raise LifecycleError("Port enumeration returned an invalid listener PID")
        pids.add(int(pid_text))
        if len(pids) > MAX_LISTENER_PIDS:
            raise LifecycleError("Too many listener processes occupy the port")
    if not saw_header and not saw_tcp:
        raise LifecycleError("Port enumeration returned no recognizable TCP table")
    return pids


def _run_command (argv: list[str], *,
                  timeout: float = COMMAND_TIMEOUT_SECONDS) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        argv, capture_output=True, text=True, encoding="utf-8",
        errors="replace", check=False, timeout=timeout,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )


def _listening_pids (port: int, *,
                     timeout: float = COMMAND_TIMEOUT_SECONDS) -> set[int]:
    result = _run_command(["netstat", "-ano"], timeout=timeout)
    if result.returncode != 0:
        raise LifecycleError("Port enumeration failed")
    return parse_listening_pids(result.stdout, port)


def _fetch_health (profile: Profile) -> object:
    url = profile.origin + "/api/health"
    opener = request.build_opener(request.ProxyHandler({}), _NoRedirect())
    http_request = request.Request(url, headers={"Accept": "application/json"})
    with opener.open(http_request, timeout=HTTP_TIMEOUT_SECONDS) as response:
        if response.status != 200:
            raise LifecycleError("Health endpoint returned a non-success status")
        payload = response.read(MAX_HEALTH_BYTES + 1)
    if len(payload) > MAX_HEALTH_BYTES:
        raise LifecycleError("Health response is too large")
    return json.loads(payload.decode("utf-8"))


def _health_matches (profile: Profile) -> bool:
    if not profile.config_exists:
        return False
    try:
        payload = _fetch_health(profile)
    except (OSError, ValueError, UnicodeError, RecursionError, LifecycleError,
            http.client.HTTPException):
        return False
    if (not isinstance(payload, dict) or payload.get("success") is not True
            or not isinstance(payload.get("message"), str)
            or not isinstance(payload.get("timestamp"), str)):
        return False
    data = payload.get("data")
    if not isinstance(data, dict):
        return False
    server = data.get("server")
    repos = data.get("repos")
    if not isinstance(server, dict) or not isinstance(repos, list):
        return False
    alive = server.get("watchers_alive")
    total = server.get("watchers_total")
    if (server.get("version") != __version__
            or type(alive) is not int or type(total) is not int
            or total <= 0 or alive != total):
        return False
    if any(not isinstance(repo, dict) or not isinstance(repo.get("id"), str)
           for repo in repos):
        return False
    return tuple(repo["id"] for repo in repos) == profile.repo_ids


def _open_browser (profile: Profile) -> bool:
    try:
        return bool(webbrowser.open(profile.origin, new=2))
    except (OSError, webbrowser.Error):
        return False


def _stop_budget (deadline: float) -> float:
    remaining = deadline - _monotonic()
    if remaining <= 0:
        raise LifecycleError("Stop deadline expired; stopped state is unconfirmed")
    return min(COMMAND_TIMEOUT_SECONDS, remaining)


def stop (mode: str) -> int:
    # Codes identify the last attempted caller phase, not a native root cause.
    phase = "STOP_CONFIG"
    try:
        profile = load_profile(mode)
        phase = "STOP_DISCOVERY"
        deadline = _monotonic() + STOP_TIMEOUT_SECONDS
        initial = _listening_pids(profile.port, timeout=_stop_budget(deadline))
        if not initial:
            print(f"Port {profile.port} is clear.")
            return 0
        if mode == "demo" and not profile.config_exists:
            raise LifecycleError("Demo port is occupied without a verifiable config")
        if 0 in initial or 4 in initial:
            raise LifecycleError("System-owned listener cannot be stopped")
        phase = "STOP_OWNERSHIP"
        with prepare_owned_processes(REPO_ROOT, initial, deadline) as owned:
            # A port is discovery, never process authority. Every captured handle
            # is verified before any mutation, and no replacement PID is added.
            phase = "STOP_RECHECK"
            current = _listening_pids(profile.port, timeout=_stop_budget(deadline))
            if current != initial:
                raise LifecycleError("Tracker listener changed before stop; nothing was stopped")
            _stop_budget(deadline)
            phase = "STOP_TERMINATE"
            owned.terminate_and_wait(deadline)
            phase = "STOP_CONFIRM"
            while True:
                current = _listening_pids(profile.port, timeout=_stop_budget(deadline))
                if not current:
                    break
                _sleep(min(POLL_SECONDS, _stop_budget(deadline)))
            # Set only on normal completion; cleanup may mask a body failure.
            phase = "STOP_CLEANUP"
        print(f"Port {profile.port} is clear.")
        return 0
    except (LifecycleError, ProcessOwnershipError, OSError, subprocess.TimeoutExpired) as exc:
        if isinstance(exc, LifecycleError):
            reason = str(exc)
        elif isinstance(exc, ProcessOwnershipError):
            reason = "Tracker process ownership or stopped state could not be verified"
        else:
            reason = "Configuration or OS check failed"
        raise LifecycleError(f"[{phase}] {reason}") from exc


def _require_frontend () -> None:
    try:
        validate_frontend(REPO_ROOT, __version__)
    except FrontendBuildError as exc:
        raise LifecycleError(
            "Frontend build is missing, invalid or not current; stop tracker and demo, "
            "run npm run build in Frontend, then restart and reload existing tabs"
        ) from exc


def preflight (mode: str) -> int:
    profile = load_profile(mode)
    listeners = _listening_pids(profile.port)
    if not listeners:
        return 0
    if 0 in listeners or 4 in listeners:
        raise LifecycleError("System-owned listener occupies the configured port")
    if not _health_matches(profile):
        raise LifecycleError("Occupied port is not a ready matching tracker")
    _require_frontend()
    if not _open_browser(profile):
        raise LifecycleError("Ready tracker found, but the browser did not open")
    print(f"Already running: {profile.origin}")
    return 10


def ready (mode: str) -> int:
    profile = load_profile(mode)
    if not profile.config_exists:
        raise LifecycleError("Demo config is not ready")
    deadline = _monotonic() + READY_TIMEOUT_SECONDS
    while True:
        if _health_matches(profile):
            _require_frontend()
            if not _open_browser(profile):
                raise LifecycleError("Tracker is ready, but the browser did not open")
            print(f"Ready: {profile.origin}")
            return 0
        remaining = deadline - _monotonic()
        if remaining <= 0:
            raise LifecycleError("Tracker health did not become ready; child may still be starting")
        _sleep(min(POLL_SECONDS, remaining))


def main (argv: list[str] | None = None) -> int:
    arguments = list(sys.argv[1:] if argv is None else argv)
    if len(arguments) != 2 or arguments[0] not in {"stop", "preflight", "ready"} \
            or arguments[1] not in {"tracker", "demo"}:
        print("[ABORT] Usage: python -m Scripts.lifecycle_port "
              "{stop|preflight|ready} {tracker|demo}", file=sys.stderr)
        return 1
    action, mode = arguments
    try:
        return {"stop": stop, "preflight": preflight, "ready": ready}[action](mode)
    except (LifecycleError, OSError, subprocess.TimeoutExpired) as exc:
        # Do not print exception text from a private config or subprocess.
        reason = str(exc) if isinstance(exc, LifecycleError) else "Configuration or OS check failed"
        print(f"[ABORT] {reason}.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
