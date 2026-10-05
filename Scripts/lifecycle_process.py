"""Bounded Windows ownership proof; terminate only retained, verified handles."""

from contextlib import contextmanager, ExitStack
import ctypes
from ctypes import wintypes
from dataclasses import dataclass
import json
import math
import ntpath
import os
from pathlib import Path
import subprocess
import sys
import time
from typing import Iterator


MAX_PROCESSES = 4096
MAX_SELECTED_PROCESSES = 128
MAX_TREE_DEPTH = 32
MAX_SNAPSHOT_BYTES = 4 * 1024 * 1024
MAX_ERROR_BYTES = 16 * 1024
MAX_PATH_CHARS = 32767
_QUERY_ACCESS = 0x1000 | 0x00100000 | 0x0001
_WAIT_SIGNALED = 0
_WAIT_RUNNING = 258
_ERROR_INVALID_PARAMETER = 87
_ERROR_BROKEN_PIPE = 109
_monotonic = time.monotonic
_sleep = time.sleep


class ProcessOwnershipError(Exception):
    """A static, public-safe reason that process ownership is not established."""


if os.name == "nt":
    import msvcrt

    _kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    _shell = ctypes.WinDLL("shell32", use_last_error=True)
    _kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
    _kernel.OpenProcess.restype = wintypes.HANDLE
    _kernel.CloseHandle.argtypes = [wintypes.HANDLE]
    _kernel.CloseHandle.restype = wintypes.BOOL
    _kernel.GetProcessTimes.argtypes = [wintypes.HANDLE] + [
        ctypes.POINTER(wintypes.FILETIME)] * 4
    _kernel.GetProcessTimes.restype = wintypes.BOOL
    _kernel.QueryFullProcessImageNameW.argtypes = [
        wintypes.HANDLE, wintypes.DWORD, wintypes.LPWSTR,
        ctypes.POINTER(wintypes.DWORD)]
    _kernel.QueryFullProcessImageNameW.restype = wintypes.BOOL
    _kernel.WaitForSingleObject.argtypes = [wintypes.HANDLE, wintypes.DWORD]
    _kernel.WaitForSingleObject.restype = wintypes.DWORD
    _kernel.TerminateProcess.argtypes = [wintypes.HANDLE, wintypes.UINT]
    _kernel.TerminateProcess.restype = wintypes.BOOL
    _kernel.GetSystemDirectoryW.argtypes = [wintypes.LPWSTR, wintypes.UINT]
    _kernel.GetSystemDirectoryW.restype = wintypes.UINT
    _kernel.PeekNamedPipe.argtypes = [
        wintypes.HANDLE, ctypes.c_void_p, wintypes.DWORD,
        ctypes.c_void_p, ctypes.POINTER(wintypes.DWORD), ctypes.c_void_p]
    _kernel.PeekNamedPipe.restype = wintypes.BOOL
    _shell.CommandLineToArgvW.argtypes = [wintypes.LPCWSTR, ctypes.POINTER(ctypes.c_int)]
    _shell.CommandLineToArgvW.restype = ctypes.POINTER(wintypes.LPWSTR)
    _kernel.LocalFree.argtypes = [ctypes.c_void_p]
    _kernel.LocalFree.restype = ctypes.c_void_p


def _require_windows () -> None:
    if os.name != "nt":
        raise ProcessOwnershipError("Owned process checks require Windows")


def _remaining (deadline: float) -> float:
    if (isinstance(deadline, bool) or not isinstance(deadline, (int, float))
            or not math.isfinite(deadline)):
        raise ProcessOwnershipError("Process deadline is invalid")
    remaining = deadline - _monotonic()
    if remaining <= 0:
        raise ProcessOwnershipError("Owned process deadline expired")
    return remaining


def _path_key (value: str) -> str:
    if (not isinstance(value, str) or not value or len(value) > MAX_PATH_CHARS
            or "\0" in value or not ntpath.isabs(value)):
        raise ProcessOwnershipError("Process image path is unavailable")
    # QueryFullProcessImageName and pathlib may use different extended prefixes.
    if value.startswith("\\\\?\\UNC\\"):
        value = "\\\\" + value[8:]
    elif value.startswith("\\\\?\\"):
        value = value[4:]
    return ntpath.normcase(ntpath.normpath(value))


def _split_command (value: str) -> tuple[str, ...]:
    _require_windows()
    if (not isinstance(value, str) or not value.strip()
            or len(value) > MAX_PATH_CHARS or "\0" in value):
        raise ProcessOwnershipError("Process command is unavailable")
    count = ctypes.c_int()
    arguments = _shell.CommandLineToArgvW(value, ctypes.byref(count))
    if not arguments:
        raise ProcessOwnershipError("Process command could not be parsed")
    try:
        if not 1 <= count.value <= 64:
            raise ProcessOwnershipError("Process command has unexpected arguments")
        return tuple(arguments[index] for index in range(count.value))
    finally:
        _kernel.LocalFree(arguments)


@dataclass(frozen=True)
class _Authority:
    root_image: str
    base_image: str


def _authority (repo_root: Path) -> _Authority:
    _require_windows()
    try:
        root = Path(repo_root).resolve(strict=True)
        scripts = root / ".venv" / "Scripts"
        caller = _path_key(str(Path(sys.executable).resolve(strict=True)))
        allowed = {_path_key(str((scripts / name).resolve(strict=True)))
                   for name in ("python.exe", "pythonw.exe")}
        if caller not in allowed:
            raise ProcessOwnershipError("Stop interpreter is not the repository venv")
        root_image = _path_key(str((scripts / "pythonw.exe").resolve(strict=True)))
        base = Path(sys._base_executable).with_name("pythonw.exe").resolve(strict=True)
        base_image = _path_key(str(base))
        if not root.is_dir() or not base.is_file() or root_image == base_image:
            raise ProcessOwnershipError("Repository interpreter authority is ambiguous")
        return _Authority(root_image, base_image)
    except (OSError, ValueError, TypeError, AttributeError, RuntimeError) as exc:
        raise ProcessOwnershipError("Repository interpreter authority is unavailable") from exc


@dataclass(frozen=True)
class _Process:
    pid: int
    parent: int
    created: int | None
    image: str | None
    command: str | None


def _pid (value: object) -> bool:
    return type(value) is int and 0 <= value <= 0xFFFFFFFF


def _unique_pairs (pairs: list[tuple[str, object]]) -> dict:
    result = {}
    for key, value in pairs:
        if key in result:
            raise ProcessOwnershipError("Process snapshot has duplicate fields")
        result[key] = value
    return result


def _invalid_constant (_value: str) -> None:
    raise ProcessOwnershipError("Process snapshot contains a non-finite number")


def _parse_snapshot (data: bytes, pids: set[int]) -> dict[int, _Process]:
    if not data or len(data) > MAX_SNAPSHOT_BYTES:
        raise ProcessOwnershipError("Process snapshot size is invalid")
    try:
        rows = json.loads(data.decode("utf-8"), object_pairs_hook=_unique_pairs,
                          parse_constant=_invalid_constant)
    except (UnicodeError, ValueError, RecursionError) as exc:
        raise ProcessOwnershipError("Process snapshot is not valid JSON") from exc
    if not isinstance(rows, list) or not 1 <= len(rows) <= MAX_PROCESSES:
        raise ProcessOwnershipError("Process snapshot count is invalid")
    result = {}
    for row in rows:
        if (not isinstance(row, dict)
                or set(row) != {"pid", "parent", "created", "image", "command"}
                or not _pid(row["pid"]) or not _pid(row["parent"])
                or row["pid"] in result):
            raise ProcessOwnershipError("Process snapshot identity is invalid")
        created = row["created"]
        if created is not None and (type(created) is not int or not 0 < created < 2**64):
            raise ProcessOwnershipError("Process snapshot creation time is invalid")
        for key in ("image", "command"):
            value = row[key]
            if value is not None and (not isinstance(value, str)
                                      or len(value) > MAX_PATH_CHARS or "\0" in value):
                raise ProcessOwnershipError("Process snapshot text is invalid")
        result[row["pid"]] = _Process(**row)
    command_pids = pids | {result[pid].parent for pid in pids if pid in result}
    if any(row.command is not None and row.pid not in command_pids
           for row in result.values()):
        raise ProcessOwnershipError("Process snapshot exposed unrelated commands")
    return result


def _powershell_path () -> str:
    _require_windows()
    buffer = ctypes.create_unicode_buffer(MAX_PATH_CHARS + 1)
    length = _kernel.GetSystemDirectoryW(buffer, len(buffer))
    if not 0 < length < len(buffer):
        raise ProcessOwnershipError("System process query runtime is unavailable")
    return str(Path(buffer.value) / "WindowsPowerShell" / "v1.0" / "powershell.exe")


def _query_script (pids: set[int]) -> str:
    # Only validated integers enter this fixed script; paths and argv never do.
    wanted = ",".join(str(pid) for pid in sorted(pids))
    return (
        "$ErrorActionPreference='Stop';"
        "[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false);try{"
        "$rows=[Collections.Generic.List[object]]::new();"
        "Get-CimInstance -ClassName Win32_Process -Property "
        "ProcessId,ParentProcessId,CreationDate,ExecutablePath,CommandLine "
        "-ErrorAction Stop | ForEach-Object {"
        f"if($rows.Count -ge {MAX_PROCESSES}){{throw 'limit'}};"
        "$rows.Add($_)};"
        f"$initial=@({wanted});$commands=@{{}};"
        "foreach($id in $initial){$commands[[long]$id]=$true};"
        "foreach($row in $rows){if($initial -contains $row.ProcessId){"
        "$commands[[long]$row.ParentProcessId]=$true}};"
        "$output=[Collections.Generic.List[object]]::new();"
        "foreach($row in $rows){"
        "$created=$null;if($null -ne $row.CreationDate){"
        "$created=$row.CreationDate.ToUniversalTime().ToFileTimeUtc()};"
        "$command=$null;if($commands.ContainsKey([long]$row.ProcessId)){"
        "$command=$row.CommandLine};"
        "$output.Add([ordered]@{pid=[long]$row.ProcessId;"
        "parent=[long]$row.ParentProcessId;created=$created;"
        "image=$row.ExecutablePath;command=$command})};"
        "$json=ConvertTo-Json -InputObject @($output.ToArray()) -Depth 3 -Compress;"
        "[Console]::Out.Write($json)"
        "}catch{[Console]::Error.Write('Process snapshot unavailable');exit 1}"
    )


def _drain_pipe (pipe, target: bytearray, limit: int) -> bool:
    """Read available bytes only; bound memory before appending pipe output."""
    available = wintypes.DWORD()
    handle = msvcrt.get_osfhandle(pipe.fileno())
    if not _kernel.PeekNamedPipe(handle, None, 0, None, ctypes.byref(available), None):
        if ctypes.get_last_error() == _ERROR_BROKEN_PIPE:
            return False
        raise ProcessOwnershipError("Process query pipe could not be read")
    if not available.value:
        return False
    data = os.read(pipe.fileno(), min(available.value, 8192, limit - len(target) + 1))
    if len(target) + len(data) > limit:
        raise ProcessOwnershipError("Process query output exceeded its limit")
    target.extend(data)
    return bool(data)


def _capture_query (argv: list[str], deadline: float) -> bytes:
    _remaining(deadline)
    child = None
    try:
        child = subprocess.Popen(
            argv, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, bufsize=0, shell=False, close_fds=True,
            creationflags=subprocess.CREATE_NO_WINDOW)
        output, errors = bytearray(), bytearray()
        while True:
            _remaining(deadline)
            read_out = _drain_pipe(child.stdout, output, MAX_SNAPSHOT_BYTES)
            read_err = _drain_pipe(child.stderr, errors, MAX_ERROR_BYTES)
            code = child.poll()
            if code is not None:
                # Final writes may arrive between the first drain and poll.
                while True:
                    _remaining(deadline)
                    final_out = _drain_pipe(child.stdout, output, MAX_SNAPSHOT_BYTES)
                    final_err = _drain_pipe(child.stderr, errors, MAX_ERROR_BYTES)
                    if not final_out and not final_err:
                        break
                if code != 0 or errors:
                    raise ProcessOwnershipError("Process metadata query failed")
                return bytes(output)
            if not read_out and not read_err:
                _sleep(min(0.01, _remaining(deadline)))
    except OSError as exc:
        raise ProcessOwnershipError("Process metadata query is unavailable") from exc
    finally:
        if child is not None:
            try:
                if child.poll() is None:
                    # This is our own query child, never a discovered process.
                    child.kill()
                try:
                    child.wait(timeout=max(0.0, deadline - _monotonic()))
                except subprocess.TimeoutExpired:
                    pass
            finally:
                if child.stdout is not None:
                    child.stdout.close()
                if child.stderr is not None:
                    child.stderr.close()


def _query_snapshot (pids: set[int], deadline: float) -> dict[int, _Process]:
    data = _capture_query([
        _powershell_path(), "-NoLogo", "-NoProfile", "-NonInteractive",
        "-Command", _query_script(pids)], deadline)
    return _parse_snapshot(data, pids)


def _record_identity (row: _Process) -> None:
    if row.pid in (0, 4) or row.created is None:
        raise ProcessOwnershipError("Selected process identity is unavailable")
    _path_key(row.image)


def _tracker_command (row: _Process, authority: _Authority) -> bool:
    arguments = _split_command(row.command)
    return (len(arguments) == 4 and _path_key(arguments[0]) == authority.root_image
            and arguments[1:] == ("-u", "-m", "Backend.app.main"))


def _select_processes (rows: dict[int, _Process], pids: set[int],
                       authority: _Authority) -> tuple[tuple[int, ...], tuple[_Process, ...]]:
    roots = set()
    for pid in sorted(pids):
        row = rows.get(pid)
        if row is None:
            raise ProcessOwnershipError("Listener process is absent from the snapshot")
        _record_identity(row)
        image = _path_key(row.image)
        if image == authority.root_image and _tracker_command(row, authority):
            roots.add(pid)
            continue
        parent = rows.get(row.parent)
        if (image != authority.base_image or parent is None
                or _path_key(parent.image) != authority.root_image
                or not _tracker_command(row, authority)
                or not _tracker_command(parent, authority)):
            raise ProcessOwnershipError("Listener is not a supported repository tracker")
        _record_identity(parent)
        if row.created < parent.created:
            raise ProcessOwnershipError("Tracker parent identity was replaced")
        roots.add(parent.pid)
    children: dict[int, list[_Process]] = {}
    for row in rows.values():
        children.setdefault(row.parent, []).append(row)
    selected: dict[int, _Process] = {}
    visiting = set()

    def visit (row: _Process, depth: int) -> None:
        if row.pid in visiting or depth > MAX_TREE_DEPTH:
            raise ProcessOwnershipError("Owned process tree is cyclic or too deep")
        if row.pid in selected:
            return
        _record_identity(row)
        if row.pid == os.getpid():
            raise ProcessOwnershipError("Stop process cannot target itself")
        selected[row.pid] = row
        if len(selected) > MAX_SELECTED_PROCESSES:
            raise ProcessOwnershipError("Owned process tree exceeds its limit")
        visiting.add(row.pid)
        for child in sorted(children.get(row.pid, []), key=lambda item: item.pid):
            _record_identity(child)
            if child.created < row.created:
                raise ProcessOwnershipError("Owned descendant parent was replaced")
            visit(child, depth + 1)
        visiting.remove(row.pid)

    for pid in sorted(roots):
        visit(rows[pid], 0)
    return tuple(sorted(roots)), tuple(selected.values())


def _handle_identity (handle: int) -> tuple[str, int]:
    created, exited, kernel, user = (wintypes.FILETIME() for _ in range(4))
    if not _kernel.GetProcessTimes(handle, ctypes.byref(created), ctypes.byref(exited),
                                   ctypes.byref(kernel), ctypes.byref(user)):
        raise ProcessOwnershipError("Native process creation time is unavailable")
    buffer = ctypes.create_unicode_buffer(MAX_PATH_CHARS + 1)
    size = wintypes.DWORD(len(buffer))
    if not _kernel.QueryFullProcessImageNameW(handle, 0, buffer, ctypes.byref(size)):
        raise ProcessOwnershipError("Native process image is unavailable")
    return _path_key(buffer.value), (created.dwHighDateTime << 32) | created.dwLowDateTime


class _ProcessLease:
    def __init__ (self, pid: int, handle: int, created: int):
        self.pid = pid
        self.handle = handle
        self.created = created

    def close (self) -> None:
        handle, self.handle = self.handle, None
        if handle is not None and not _kernel.CloseHandle(handle):
            raise ProcessOwnershipError("A process handle could not be closed")

    def alive (self) -> bool:
        if self.handle is None:
            raise ProcessOwnershipError("Owned process handle is closed")
        state = _kernel.WaitForSingleObject(self.handle, 0)
        if state not in (_WAIT_SIGNALED, _WAIT_RUNNING):
            raise ProcessOwnershipError("Owned process liveness is unavailable")
        return state == _WAIT_RUNNING

    def terminate (self) -> None:
        if not self.alive():
            return
        if not _kernel.TerminateProcess(self.handle, 1) and self.alive():
            raise ProcessOwnershipError("An owned process could not be terminated")

    def wait_exit (self, deadline: float) -> None:
        milliseconds = min(0xFFFFFFFE, int(_remaining(deadline) * 1000))
        if self.handle is None:
            raise ProcessOwnershipError("Owned process handle is closed")
        if _kernel.WaitForSingleObject(self.handle, milliseconds) != _WAIT_SIGNALED:
            raise ProcessOwnershipError("An owned process did not exit within the deadline")


def _open_verified (row: _Process, *, essential: bool,
                    allow_absent: bool = False) -> _ProcessLease | None:
    _require_windows()
    ctypes.set_last_error(0)
    handle = _kernel.OpenProcess(_QUERY_ACCESS, False, row.pid)
    if not handle:
        if (allow_absent and not essential
                and ctypes.get_last_error() == _ERROR_INVALID_PARAMETER):
            return None  # a captured short-lived descendant has already disappeared
        raise ProcessOwnershipError("A selected process could not be opened safely")
    lease = _ProcessLease(row.pid, handle, 0)
    try:
        image, created = _handle_identity(handle)
        if image != _path_key(row.image) or created // 10 != row.created // 10:
            raise ProcessOwnershipError("A selected process identity changed")
        lease.created = created
        if not lease.alive() and essential:
            raise ProcessOwnershipError("A required tracker process already exited")
        return lease
    except BaseException:
        lease.close()
        raise


class _OwnedProcesses:
    def __init__ (self, leases: tuple[_ProcessLease, ...], roots: tuple[int, ...],
                  deadline: float):
        by_pid = {lease.pid: lease for lease in leases}
        self._ordered = tuple(by_pid[pid] for pid in roots) + tuple(
            lease for lease in leases if lease.pid not in roots)
        self._deadline = deadline

    def terminate_and_wait (self, deadline: float) -> None:
        _remaining(deadline)
        deadline = min(deadline, self._deadline)
        _remaining(deadline)
        # Check every lease before the first mutation; a prior exit is benign.
        for lease in self._ordered:
            lease.alive()
        for lease in self._ordered:
            _remaining(deadline)
            lease.terminate()
        for lease in self._ordered:
            lease.wait_exit(deadline)


@contextmanager
def prepare_owned_processes (repo_root: Path, pids: set[int],
                             deadline: float) -> Iterator[_OwnedProcesses]:
    """Validate the complete selected forest before yielding any mutation API."""
    _require_windows()
    _remaining(deadline)
    if (not isinstance(pids, (set, frozenset)) or not pids
            or len(pids) > MAX_SELECTED_PROCESSES
            or any(not _pid(pid) or pid in (0, 4) for pid in pids)):
        raise ProcessOwnershipError("Listener identities are invalid")
    authority = _authority(repo_root)
    rows = _query_snapshot(pids, deadline)
    roots, selected = _select_processes(rows, pids, authority)
    captured_parents = {row.parent for row in selected}
    with ExitStack() as cleanup:
        leases: dict[int, _ProcessLease] = {}
        for row in selected:
            _remaining(deadline)
            essential = row.pid in pids or row.pid in roots
            lease = _open_verified(
                row, essential=essential,
                allow_absent=not essential and row.pid not in captured_parents)
            if lease is not None:
                cleanup.callback(lease.close)
                leases[row.pid] = lease
        for row in selected:
            if row.pid in leases and row.parent in leases:
                if leases[row.pid].created < leases[row.parent].created:
                    raise ProcessOwnershipError("Native process ancestry changed")
        _remaining(deadline)
        yield _OwnedProcesses(tuple(leases.values()), roots, deadline)
