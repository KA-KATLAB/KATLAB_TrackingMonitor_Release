"""Windows-bound Chronicle I/O, local capability, and transport primitives.

This module is deliberately stdlib-only.  Native helpers bind security and
mutation decisions to retained Windows handles.  The local capability is
trusted same-owner coordination; it is not hostile same-owner isolation.
"""

from __future__ import annotations

import base64
import ctypes
from enum import Enum
import hashlib
import hmac
import http.client
import json
import math
import os
import posixpath
import queue
import re
import secrets
import socket
import ssl
import sys
import threading
import time
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path, PureWindowsPath
from types import MappingProxyType
from typing import Collection, Iterable, Mapping, Sequence
from urllib.parse import urlsplit


MERMAID_VERSION = "11.17.2"
MERMAID_NAME = "mermaid-11.17.2.min.js"
MERMAID_URL = (
    "https://cdn.jsdelivr.net/npm/mermaid@11.17.2/dist/mermaid.min.js"
)
MERMAID_LENGTH = 3_572_661
MERMAID_SHA256 = "581ed7d74bd9048d0e3a91363927d72ef22942d7722546b27f7cc29e35390eb8"

BOOTSWATCH_NAME = "bootswatch-darkly.css"
BOOTSWATCH_URL = (
    "https://cdn.jsdelivr.net/npm/bootswatch@5.3.3/dist/darkly/bootstrap.min.css"
)
BOOTSWATCH_SOURCE_LENGTH = 232_704
BOOTSWATCH_SOURCE_SHA256 = (
    "c4a7dc2470ce949905bd8375ae6986870c28f65959d8ceb1077d520344437580"
)
BOOTSWATCH_LOCAL_LENGTH = 232_604
BOOTSWATCH_LOCAL_SHA256 = (
    "c6189ef734e808572084ebbd439a44bda3d6d266f529a30180e3f5e0bccd7447"
)
BOOTSWATCH_FONT_IMPORT = (
    b"@import url(https://fonts.googleapis.com/css2?family=Lato:ital,wght@0,400;"
    b"0,700;1,400&display=swap);"
)

CDN_CONNECT_TIMEOUT_SECONDS = 15
CDN_TRANSFER_DEADLINE_SECONDS = 120
TRACKER_REQUEST_DEADLINE_SECONDS = 30
TRACKER_SESSION_DEADLINE_SECONDS = 120
TRACKER_RESPONSE_LIMIT = 16_777_216
TRACKER_SESSION_REQUEST_LIMIT = 4_096
TRACKER_SESSION_BYTE_LIMIT = 134_217_728
SOURCE_FILE_LIMIT = 16_777_216
SOURCE_COUNT_LIMIT = 4_096
SOURCE_AGGREGATE_LIMIT = 134_217_728

_PATH_DIGEST_DOMAIN = b"KATLAB-WINDOWS-CANONICAL-PATH-v1\x00"
_SOURCE_DIGEST_DOMAIN = b"KATLAB-CHRONICLE-SOURCE-SNAPSHOT-v1\x00"
CHRONICLE_REPO_ID_MAX = 250  # longest id that still forms a 255-unit `<id>.html`
_RID_PATTERN = rf"[A-Za-z0-9_-]{{1,{CHRONICLE_REPO_ID_MAX}}}"
_RID_RX = re.compile(rf"^{_RID_PATTERN}$")
_MKDOCS_MARKDOWN_SUFFIXES = (".markdown", ".mdown", ".mkdn", ".mkd", ".md")
_HEADER_NAME_RX = re.compile(rb"[!#$%&'*+.^_`|~0-9A-Za-z-]+")
_VOLUME_PATH_RX = re.compile(
    r"^(\\\\\?\\Volume\{)([0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-"
    r"[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12})(\})(\\.*)?$"
)


class SafeIOError(RuntimeError):
    """A fail-closed native/path/transport validation error."""

    def __init__ (self, message: str, *, winerror: int | None = None):
        super().__init__(message)
        self.winerror = winerror


class PrerequisiteError(SafeIOError):
    """A required external trust/runtime prerequisite is unavailable."""


class TransportUnavailable(PrerequisiteError):
    """An authenticated local tracker transport operation could not complete."""


@dataclass(frozen=True)
class FileIdentity:
    volume_serial: str
    file_id: str
    canonical_path_digest: str

    def __post_init__ (self) -> None:
        if re.fullmatch(r"[0-9a-f]{16}", self.volume_serial) is None:
            raise ValueError("volume_serial must be 16 lowercase hex characters")
        if re.fullmatch(r"[0-9a-f]{32}", self.file_id) is None:
            raise ValueError("file_id must be 32 lowercase hex characters")
        if re.fullmatch(r"[0-9a-f]{64}", self.canonical_path_digest) is None:
            raise ValueError("canonical_path_digest must be 64 lowercase hex characters")

    def as_dict (self) -> dict[str, str]:
        return {
            "volume_serial": self.volume_serial,
            "file_id": self.file_id,
            "canonical_path_digest": self.canonical_path_digest,
        }


@dataclass(frozen=True)
class BoundFile:
    identity: FileIdentity
    data: bytes
    canonical_path: str
    sha256: str


@dataclass(frozen=True)
class ProcessStamp:
    """The PID-reuse-safe identity serialized in a Chronicle capability."""

    pid: int
    creation_filetime: int

    def __post_init__ (self) -> None:
        if type(self.pid) is not int or not 1 <= self.pid <= 0xFFFFFFFF:
            raise ValueError("pid must fit a positive Windows DWORD")
        if (type(self.creation_filetime) is not int
                or not 1 <= self.creation_filetime <= 0xFFFFFFFFFFFFFFFF):
            raise ValueError("creation_filetime must fit a positive Windows FILETIME")


class ProcessState(Enum):
    LIVE = "live"
    DEAD = "dead"
    AMBIGUOUS = "ambiguous"


# Compatibility name for callers that describe the PID/creation pair as an
# identity.  The serialized capability remains the exact two-field ProcessStamp.
ProcessIdentity = ProcessStamp


@dataclass(frozen=True)
class AssetSpec:
    token: str
    name: str
    url: str
    length: int
    sha256: str


ASSETS: Mapping[str, AssetSpec] = MappingProxyType({
    "fetch-mermaid": AssetSpec(
        "fetch-mermaid", MERMAID_NAME, MERMAID_URL,
        MERMAID_LENGTH, MERMAID_SHA256,
    ),
    "fetch-bootswatch": AssetSpec(
        "fetch-bootswatch", BOOTSWATCH_NAME, BOOTSWATCH_URL,
        BOOTSWATCH_SOURCE_LENGTH, BOOTSWATCH_SOURCE_SHA256,
    ),
})


@dataclass(frozen=True)
class TrackerOrigin:
    url: str
    host: str
    port: int
    family: int


@dataclass(frozen=True)
class SourceEntry:
    relative_path: str
    identity: FileIdentity
    data: bytes
    sha256: str


@dataclass(frozen=True)
class SourceSnapshot:
    entries: tuple[SourceEntry, ...]
    snapshot_digest: str
    aggregate_bytes: int


if os.name == "nt":
    from ctypes import wintypes

    _kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    _INVALID_HANDLE_VALUE = ctypes.c_void_p(-1).value
    _GENERIC_READ = 0x80000000
    _GENERIC_WRITE = 0x40000000
    _DELETE = 0x00010000
    _FILE_READ_ATTRIBUTES = 0x00000080
    _FILE_LIST_DIRECTORY = 0x00000001
    _FILE_ADD_FILE = 0x00000002
    _FILE_ADD_SUBDIRECTORY = 0x00000004
    _FILE_TRAVERSE = 0x00000020
    _SYNCHRONIZE = 0x00100000
    _FILE_SHARE_READ = 0x00000001
    _FILE_SHARE_WRITE = 0x00000002
    _READ_CONTROL = 0x00020000
    _CREATE_NEW = 1
    _OPEN_EXISTING = 3
    _FILE_ATTRIBUTE_NORMAL = 0x00000080
    _FILE_ATTRIBUTE_REPARSE_POINT = 0x00000400
    _FILE_FLAG_OPEN_REPARSE_POINT = 0x00200000
    _FILE_FLAG_BACKUP_SEMANTICS = 0x02000000
    _FILE_FLAG_SEQUENTIAL_SCAN = 0x08000000
    _FILE_NAME_NORMALIZED = 0x0
    _VOLUME_NAME_GUID = 0x1
    _FILE_STANDARD_INFO_CLASS = 1
    _FILE_STREAM_INFO_CLASS = 7
    _FILE_ATTRIBUTE_TAG_INFO_CLASS = 9
    _FILE_ID_INFO_CLASS = 18
    _FILE_DISPOSITION_INFO_EX_CLASS = 21
    _FILE_RENAME_INFO_EX_CLASS = 22
    _NT_FILE_RENAME_INFORMATION_EX_CLASS = 65
    _FILE_DISPOSITION_FLAG_DELETE = 0x1
    _FILE_DISPOSITION_FLAG_POSIX_SEMANTICS = 0x2
    _FILE_RENAME_FLAG_POSIX_SEMANTICS = 0x2
    _PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
    _WAIT_OBJECT_0 = 0
    _WAIT_TIMEOUT = 258
    _WAIT_FAILED = 0xFFFFFFFF
    _TOKEN_QUERY = 0x0008
    _TOKEN_USER = 1
    _ERROR_INSUFFICIENT_BUFFER = 122
    _ERROR_INVALID_PARAMETER = 87
    _SE_FILE_OBJECT = 1
    _DACL_SECURITY_INFORMATION = 0x00000004
    _PROTECTED_DACL_SECURITY_INFORMATION = 0x80000000
    _SE_DACL_PROTECTED = 0x1000
    _SDDL_REVISION_1 = 1

    class _FILE_ID_128(ctypes.Structure):
        _fields_ = [("Identifier", ctypes.c_ubyte * 16)]

    class _FILE_ID_INFO(ctypes.Structure):
        _fields_ = [
            ("VolumeSerialNumber", ctypes.c_ulonglong),
            ("FileId", _FILE_ID_128),
        ]

    class _FILE_STANDARD_INFO(ctypes.Structure):
        _fields_ = [
            ("AllocationSize", ctypes.c_longlong),
            ("EndOfFile", ctypes.c_longlong),
            ("NumberOfLinks", wintypes.DWORD),
            ("DeletePending", wintypes.BOOLEAN),
            ("Directory", wintypes.BOOLEAN),
        ]

    class _FILE_ATTRIBUTE_TAG_INFO(ctypes.Structure):
        _fields_ = [
            ("FileAttributes", wintypes.DWORD),
            ("ReparseTag", wintypes.DWORD),
        ]

    class _FILE_DISPOSITION_INFO_EX(ctypes.Structure):
        _fields_ = [("Flags", wintypes.DWORD)]

    class _FILE_RENAME_INFO_EX(ctypes.Structure):
        _fields_ = [
            ("Flags", wintypes.DWORD),
            ("RootDirectory", wintypes.HANDLE),
            ("FileNameLength", wintypes.DWORD),
            ("FileName", wintypes.WCHAR * 1),
        ]

    class _IO_STATUS_BLOCK(ctypes.Structure):
        _fields_ = [
            ("Status", ctypes.c_longlong),
            ("Information", ctypes.c_size_t),
        ]

    class _SECURITY_ATTRIBUTES(ctypes.Structure):
        _fields_ = [
            ("nLength", wintypes.DWORD),
            ("lpSecurityDescriptor", wintypes.LPVOID),
            ("bInheritHandle", wintypes.BOOL),
        ]

    class _SID_AND_ATTRIBUTES(ctypes.Structure):
        _fields_ = [
            ("Sid", wintypes.LPVOID),
            ("Attributes", wintypes.DWORD),
        ]

    class _TOKEN_USER_VALUE(ctypes.Structure):
        _fields_ = [("User", _SID_AND_ATTRIBUTES)]

    _kernel32.CreateFileW.argtypes = [
        wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD, wintypes.LPVOID,
        wintypes.DWORD, wintypes.DWORD, wintypes.HANDLE,
    ]
    _kernel32.CreateFileW.restype = wintypes.HANDLE
    _kernel32.CloseHandle.argtypes = [wintypes.HANDLE]
    _kernel32.CloseHandle.restype = wintypes.BOOL
    _kernel32.GetFileInformationByHandleEx.argtypes = [
        wintypes.HANDLE, ctypes.c_int, wintypes.LPVOID, wintypes.DWORD,
    ]
    _kernel32.GetFileInformationByHandleEx.restype = wintypes.BOOL
    _kernel32.GetFinalPathNameByHandleW.argtypes = [
        wintypes.HANDLE, wintypes.LPWSTR, wintypes.DWORD, wintypes.DWORD,
    ]
    _kernel32.GetFinalPathNameByHandleW.restype = wintypes.DWORD
    _kernel32.ReadFile.argtypes = [
        wintypes.HANDLE, wintypes.LPVOID, wintypes.DWORD,
        ctypes.POINTER(wintypes.DWORD), wintypes.LPVOID,
    ]
    _kernel32.ReadFile.restype = wintypes.BOOL
    _kernel32.WriteFile.argtypes = [
        wintypes.HANDLE, wintypes.LPCVOID, wintypes.DWORD,
        ctypes.POINTER(wintypes.DWORD), wintypes.LPVOID,
    ]
    _kernel32.WriteFile.restype = wintypes.BOOL
    _kernel32.FlushFileBuffers.argtypes = [wintypes.HANDLE]
    _kernel32.FlushFileBuffers.restype = wintypes.BOOL
    _kernel32.SetFileInformationByHandle.argtypes = [
        wintypes.HANDLE, ctypes.c_int, wintypes.LPVOID, wintypes.DWORD,
    ]
    _kernel32.SetFileInformationByHandle.restype = wintypes.BOOL
    _kernel32.LocalFree.argtypes = [wintypes.HLOCAL]
    _kernel32.LocalFree.restype = wintypes.HLOCAL
    _kernel32.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
    _kernel32.OpenProcess.restype = wintypes.HANDLE
    _kernel32.WaitForSingleObject.argtypes = [wintypes.HANDLE, wintypes.DWORD]
    _kernel32.WaitForSingleObject.restype = wintypes.DWORD
    _advapi32 = ctypes.WinDLL("advapi32", use_last_error=True)
    _advapi32.OpenProcessToken.argtypes = [
        wintypes.HANDLE, wintypes.DWORD, ctypes.POINTER(wintypes.HANDLE),
    ]
    _advapi32.OpenProcessToken.restype = wintypes.BOOL
    _advapi32.GetTokenInformation.argtypes = [
        wintypes.HANDLE, ctypes.c_int, wintypes.LPVOID, wintypes.DWORD,
        ctypes.POINTER(wintypes.DWORD),
    ]
    _advapi32.GetTokenInformation.restype = wintypes.BOOL
    _advapi32.ConvertSidToStringSidW.argtypes = [
        wintypes.LPVOID, ctypes.POINTER(wintypes.LPWSTR),
    ]
    _advapi32.ConvertSidToStringSidW.restype = wintypes.BOOL
    _advapi32.ConvertStringSecurityDescriptorToSecurityDescriptorW.argtypes = [
        wintypes.LPCWSTR, wintypes.DWORD, ctypes.POINTER(wintypes.LPVOID),
        ctypes.POINTER(wintypes.ULONG),
    ]
    _advapi32.ConvertStringSecurityDescriptorToSecurityDescriptorW.restype = wintypes.BOOL
    _advapi32.GetSecurityInfo.argtypes = [
        wintypes.HANDLE, ctypes.c_int, wintypes.DWORD,
        ctypes.POINTER(wintypes.LPVOID), ctypes.POINTER(wintypes.LPVOID),
        ctypes.POINTER(wintypes.LPVOID), ctypes.POINTER(wintypes.LPVOID),
        ctypes.POINTER(wintypes.LPVOID),
    ]
    _advapi32.GetSecurityInfo.restype = wintypes.DWORD
    _advapi32.GetSecurityDescriptorControl.argtypes = [
        wintypes.LPVOID, ctypes.POINTER(wintypes.WORD),
        ctypes.POINTER(wintypes.DWORD),
    ]
    _advapi32.GetSecurityDescriptorControl.restype = wintypes.BOOL
    _advapi32.GetSecurityDescriptorDacl.argtypes = [
        wintypes.LPVOID, ctypes.POINTER(wintypes.BOOL),
        ctypes.POINTER(wintypes.LPVOID), ctypes.POINTER(wintypes.BOOL),
    ]
    _advapi32.GetSecurityDescriptorDacl.restype = wintypes.BOOL
    _ntdll = ctypes.WinDLL("ntdll")
    _ntdll.NtSetInformationFile.argtypes = [
        wintypes.HANDLE, ctypes.POINTER(_IO_STATUS_BLOCK), wintypes.LPVOID,
        wintypes.ULONG, ctypes.c_int,
    ]
    _ntdll.NtSetInformationFile.restype = ctypes.c_long
    _ntdll.RtlNtStatusToDosError.argtypes = [ctypes.c_long]
    _ntdll.RtlNtStatusToDosError.restype = wintypes.ULONG


def _require_windows () -> None:
    if os.name != "nt":
        raise SafeIOError("Windows native safe I/O is required")


def _native_error (operation: str) -> SafeIOError:
    code = ctypes.get_last_error()
    return SafeIOError(f"{operation} failed (Windows error {code})", winerror=code)


def _current_user_sid_string () -> str:
    _require_windows()
    token = wintypes.HANDLE()
    if not _advapi32.OpenProcessToken(
            _kernel32.GetCurrentProcess(), _TOKEN_QUERY, ctypes.byref(token)):
        raise _native_error("OpenProcessToken")
    try:
        needed = wintypes.DWORD()
        if _advapi32.GetTokenInformation(
                token, _TOKEN_USER, None, 0, ctypes.byref(needed)):
            raise SafeIOError("GetTokenInformation size query unexpectedly succeeded")
        if ctypes.get_last_error() != _ERROR_INSUFFICIENT_BUFFER or not needed.value:
            raise _native_error("GetTokenInformation size query")
        buffer = ctypes.create_string_buffer(needed.value)
        if not _advapi32.GetTokenInformation(
                token, _TOKEN_USER, buffer, len(buffer), ctypes.byref(needed)):
            raise _native_error("GetTokenInformation")
        user = _TOKEN_USER_VALUE.from_buffer(buffer)
        shown = wintypes.LPWSTR()
        if not _advapi32.ConvertSidToStringSidW(
                user.User.Sid, ctypes.byref(shown)):
            raise _native_error("ConvertSidToStringSidW")
        try:
            result = shown.value
            if not result or re.fullmatch(r"S-[0-9-]+", result) is None:
                raise SafeIOError("current token user SID is invalid")
            return result
        finally:
            _kernel32.LocalFree(ctypes.cast(shown, wintypes.HLOCAL))
    finally:
        _close_handle(int(token.value or 0))


def _private_sddl () -> str:
    user = _current_user_sid_string()
    if user == "S-1-5-18":
        return "D:P(A;;FA;;;SY)"
    return f"D:P(A;;FA;;;SY)(A;;FA;;;{user})"


def _security_descriptor_from_sddl (sddl: str) -> wintypes.LPVOID:
    descriptor = wintypes.LPVOID()
    if not _advapi32.ConvertStringSecurityDescriptorToSecurityDescriptorW(
            sddl, _SDDL_REVISION_1, ctypes.byref(descriptor), None):
        raise _native_error("ConvertStringSecurityDescriptorToSecurityDescriptorW")
    return descriptor


def _descriptor_acl_bytes (descriptor: wintypes.LPVOID) -> bytes:
    present = wintypes.BOOL()
    defaulted = wintypes.BOOL()
    acl = wintypes.LPVOID()
    if not _advapi32.GetSecurityDescriptorDacl(
            descriptor, ctypes.byref(present), ctypes.byref(acl),
            ctypes.byref(defaulted)):
        raise _native_error("GetSecurityDescriptorDacl")
    if not present.value or not acl.value or defaulted.value:
        raise SafeIOError("private file DACL is absent or defaulted")
    header = ctypes.string_at(acl, 8)
    acl_size = int.from_bytes(header[2:4], "little")
    if acl_size < 8 or acl_size > 65_535:
        raise SafeIOError("private file DACL has an invalid size")
    return ctypes.string_at(acl, acl_size)


def _verify_private_dacl (handle: int) -> None:
    """Require one protected ACL containing only current-user and SYSTEM full ACEs."""
    expected = _security_descriptor_from_sddl(_private_sddl())
    actual = wintypes.LPVOID()
    dacl = wintypes.LPVOID()
    try:
        result = _advapi32.GetSecurityInfo(
            handle, _SE_FILE_OBJECT,
            _DACL_SECURITY_INFORMATION | _PROTECTED_DACL_SECURITY_INFORMATION,
            None, None, ctypes.byref(dacl), None, ctypes.byref(actual),
        )
        if result:
            raise SafeIOError(
                f"GetSecurityInfo failed (Windows error {int(result)})",
                winerror=int(result),
            )
        control = wintypes.WORD()
        revision = wintypes.DWORD()
        if not _advapi32.GetSecurityDescriptorControl(
                actual, ctypes.byref(control), ctypes.byref(revision)):
            raise _native_error("GetSecurityDescriptorControl")
        if not control.value & _SE_DACL_PROTECTED:
            raise SafeIOError("private file DACL is not protected")
        if _descriptor_acl_bytes(actual) != _descriptor_acl_bytes(expected):
            raise SafeIOError("private file DACL is not the exact owner/SYSTEM ACL")
    finally:
        if actual.value:
            _kernel32.LocalFree(actual)
        if expected.value:
            _kernel32.LocalFree(expected)


def _create_private_native (path: str) -> int:
    """CREATE_NEW with the protected DACL present before any secret byte exists."""
    _require_windows()
    descriptor = _security_descriptor_from_sddl(_private_sddl())
    attributes = _SECURITY_ATTRIBUTES(
        ctypes.sizeof(_SECURITY_ATTRIBUTES), descriptor, False)
    try:
        handle = _kernel32.CreateFileW(
            path,
            _GENERIC_READ | _GENERIC_WRITE | _DELETE | _READ_CONTROL
            | _FILE_READ_ATTRIBUTES,
            0,
            ctypes.byref(attributes),
            _CREATE_NEW,
            _FILE_ATTRIBUTE_NORMAL | _FILE_FLAG_OPEN_REPARSE_POINT
            | _FILE_FLAG_SEQUENTIAL_SCAN,
            None,
        )
        if handle == _INVALID_HANDLE_VALUE:
            raise _native_error("CreateFileW(private)")
        return int(handle)
    finally:
        _kernel32.LocalFree(descriptor)


def _close_handle (handle: int) -> None:
    if os.name == "nt" and handle not in (0, None, _INVALID_HANDLE_VALUE):
        _kernel32.CloseHandle(handle)


def _absolute_path (path: os.PathLike[str] | str) -> str:
    raw = os.fspath(path)
    if not isinstance(raw, str) or not raw or "\x00" in raw:
        raise SafeIOError("path must be a nonempty NUL-free string")
    candidate = PureWindowsPath(raw)
    if not candidate.is_absolute():
        raise SafeIOError("path must be absolute and traversal-free")
    normalized_slashes = raw.replace("/", "\\")
    anchor = candidate.anchor
    tail = normalized_slashes[len(anchor):]
    if "\\\\" in tail:
        raise SafeIOError("path contains an empty component")
    _validate_components(tuple(tail.split("\\")) if tail else ())
    return os.path.normpath(raw)


def _validate_components (parts: Sequence[str]) -> None:
    reserved = {"con", "prn", "aux", "nul"}
    reserved.update(f"com{index}" for index in range(1, 10))
    reserved.update(f"lpt{index}" for index in range(1, 10))
    for part in parts:
        try:
            encoded = part.encode("utf-16le", errors="strict")
        except UnicodeError as exc:
            raise SafeIOError("path component is not valid Unicode") from exc
        if (not part or part in (".", "..") or part.endswith((" ", "."))
                or len(encoded) > 510
                or any(ord(character) < 0x20 or character in '<>:"|?*'
                       for character in part)):
            raise SafeIOError("path contains an ambiguous or unsafe component")
        device = part.split(".", 1)[0].casefold()
        if device in reserved:
            raise SafeIOError("reserved Windows device path is forbidden")


def _open_native (path: str, *, directory: bool, write: bool = False,
                  delete: bool = False, create_new: bool = False,
                  mutate_directory: bool = False) -> int:
    _require_windows()
    desired = _FILE_READ_ATTRIBUTES | _SYNCHRONIZE
    if directory:
        desired |= _FILE_LIST_DIRECTORY | _FILE_TRAVERSE
        if mutate_directory:
            desired |= _FILE_ADD_FILE | _FILE_ADD_SUBDIRECTORY
    if write:
        desired |= _GENERIC_READ | _GENERIC_WRITE
    elif not directory:
        desired |= _GENERIC_READ
    if delete:
        desired |= _DELETE
    flags = _FILE_FLAG_OPEN_REPARSE_POINT
    flags |= _FILE_FLAG_BACKUP_SEMANTICS if directory else _FILE_FLAG_SEQUENTIAL_SCAN
    flags |= _FILE_ATTRIBUTE_NORMAL
    handle = _kernel32.CreateFileW(
        path, desired, 0 if write else (
            _FILE_SHARE_READ | _FILE_SHARE_WRITE if directory else _FILE_SHARE_READ), None,
        _CREATE_NEW if create_new else _OPEN_EXISTING, flags, None,
    )
    if handle == _INVALID_HANDLE_VALUE:
        raise _native_error("CreateFileW")
    return int(handle)


def _query (handle: int, info_class: int, value) -> None:
    if not _kernel32.GetFileInformationByHandleEx(
            handle, info_class, ctypes.byref(value), ctypes.sizeof(value)):
        raise _native_error("GetFileInformationByHandleEx")


def _canonical_path_from_handle (handle: int, *, directory: bool) -> str:
    needed = _kernel32.GetFinalPathNameByHandleW(
        handle, None, 0, _FILE_NAME_NORMALIZED | _VOLUME_NAME_GUID)
    if not needed:
        raise _native_error("GetFinalPathNameByHandleW")
    buffer = ctypes.create_unicode_buffer(needed + 1)
    result = _kernel32.GetFinalPathNameByHandleW(
        handle, buffer, len(buffer), _FILE_NAME_NORMALIZED | _VOLUME_NAME_GUID)
    if not result or result >= len(buffer):
        raise _native_error("GetFinalPathNameByHandleW")
    path = buffer.value
    if "\x00" in path:
        raise SafeIOError("native canonical path contains NUL")
    match = _VOLUME_PATH_RX.fullmatch(path)
    if match is None:
        raise SafeIOError("native path is not an absolute GUID-volume path")
    suffix = match.group(4) or ""
    canonical = f"{match.group(1)}{match.group(2).lower()}{match.group(3)}{suffix}"
    volume_root = suffix in ("", "\\")
    if volume_root:
        canonical = canonical.rstrip("\\") + "\\"
    elif directory:
        canonical = canonical.rstrip("\\")
    elif canonical.endswith("\\"):
        raise SafeIOError("leaf canonical path has a trailing separator")
    return canonical


def _identity_for_path (info, canonical_path: str) -> FileIdentity:
    encoded = canonical_path.encode("utf-16le", errors="strict")
    digest = hashlib.sha256(
        _PATH_DIGEST_DOMAIN + len(encoded).to_bytes(4, "big") + encoded
    ).hexdigest()
    return FileIdentity(
        f"{int(info.VolumeSerialNumber):016x}",
        bytes(info.FileId.Identifier).hex(),
        digest,
    )


def _handle_facts (handle: int, *, expect_directory: bool | None = None):
    _require_windows()
    identity_info = _FILE_ID_INFO()
    standard = _FILE_STANDARD_INFO()
    attributes = _FILE_ATTRIBUTE_TAG_INFO()
    _query(handle, _FILE_ID_INFO_CLASS, identity_info)
    _query(handle, _FILE_STANDARD_INFO_CLASS, standard)
    _query(handle, _FILE_ATTRIBUTE_TAG_INFO_CLASS, attributes)
    is_directory = bool(standard.Directory)
    if expect_directory is not None and is_directory != expect_directory:
        raise SafeIOError("handle object type does not match expectation")
    if attributes.FileAttributes & _FILE_ATTRIBUTE_REPARSE_POINT:
        raise SafeIOError("reparse points are not permitted")
    canonical = _canonical_path_from_handle(handle, directory=is_directory)
    return _identity_for_path(identity_info, canonical), canonical, standard


def _assert_single_unnamed_stream (handle: int) -> None:
    _require_windows()
    size = 4096
    while size <= 1_048_576:
        buffer = ctypes.create_string_buffer(size)
        if _kernel32.GetFileInformationByHandleEx(
                handle, _FILE_STREAM_INFO_CLASS, buffer, size):
            break
        if ctypes.get_last_error() not in (122, 234):
            raise _native_error("FileStreamInfo query")
        size *= 2
    else:
        raise SafeIOError("stream inventory exceeds its bound")
    names: list[str] = []
    offset = 0
    while True:
        if offset + 24 > size:
            raise SafeIOError("invalid native stream inventory")
        next_offset = int.from_bytes(buffer.raw[offset:offset + 4], "little")
        name_length = int.from_bytes(buffer.raw[offset + 4:offset + 8], "little")
        if name_length % 2 or offset + 24 + name_length > size:
            raise SafeIOError("invalid native stream name")
        names.append(buffer.raw[offset + 24:offset + 24 + name_length].decode("utf-16le"))
        if next_offset == 0:
            break
        if next_offset < 24 or offset + next_offset >= size:
            raise SafeIOError("invalid native stream offset")
        offset += next_offset
    if names != ["::$DATA"]:
        raise SafeIOError("alternate or unexpected data stream is present")


def file_identity_from_handle (handle: int) -> FileIdentity:
    if type(handle) is not int or handle <= 0:
        raise SafeIOError("handle must be a positive native handle value")
    return _handle_facts(handle)[0]


def file_identity_from_fd (fd: int) -> FileIdentity:
    _require_windows()
    if type(fd) is not int or fd < 0:
        raise SafeIOError("file descriptor must be a nonnegative integer")
    import msvcrt
    return file_identity_from_handle(int(msvcrt.get_osfhandle(fd)))


def _open_directory_chain (path: str, *, mutate_last: bool = False) -> list[int]:
    target = Path(path)
    anchor = target.anchor
    if not anchor:
        raise SafeIOError("directory path lacks an absolute anchor")
    handles: list[int] = []
    current = Path(anchor)
    try:
        handles.append(_open_native(
            str(current), directory=True,
            mutate_directory=mutate_last and len(target.parts) == 1))
        parent_canonical = _handle_facts(handles[-1], expect_directory=True)[1]
        for index, component in enumerate(target.parts[1:], start=1):
            current = current / component
            handle = _open_native(
                str(current), directory=True,
                mutate_directory=mutate_last and index == len(target.parts) - 1)
            handles.append(handle)
            canonical = _handle_facts(handle, expect_directory=True)[1]
            prefix = parent_canonical.rstrip("\\") + "\\"
            if not canonical.casefold().startswith(prefix.casefold()):
                raise SafeIOError("directory component escaped its retained parent")
            parent_canonical = canonical
        return handles
    except Exception:
        for handle in reversed(handles):
            _close_handle(handle)
        raise


def _ensure_directory_path (path: str) -> None:
    """Create missing components one at a time under retained validated parents."""
    target = Path(path)
    anchor = target.anchor
    if not anchor:
        raise SafeIOError("directory path lacks an absolute anchor")
    current = Path(anchor)
    handles = [_open_native(str(current), directory=True)]
    try:
        parent_canonical = _handle_facts(handles[-1], expect_directory=True)[1]
        for component in target.parts[1:]:
            current = current / component
            try:
                child_handle = _open_native(str(current), directory=True)
            except SafeIOError as exc:
                if exc.winerror not in (2, 3):
                    raise
                try:
                    os.mkdir(current)
                except OSError as create_exc:
                    raise SafeIOError("directory component creation failed") from create_exc
                child_handle = _open_native(str(current), directory=True)
            handles.append(child_handle)
            canonical = _handle_facts(child_handle, expect_directory=True)[1]
            prefix = parent_canonical.rstrip("\\") + "\\"
            if not canonical.casefold().startswith(prefix.casefold()):
                raise SafeIOError("created directory escaped its retained parent")
            parent_canonical = canonical
    finally:
        for handle in reversed(handles):
            _close_handle(handle)


def _read_handle (handle: int, size: int) -> bytes:
    chunks: list[bytes] = []
    remaining = size
    while remaining:
        count = min(remaining, 1_048_576)
        buffer = ctypes.create_string_buffer(count)
        read = wintypes.DWORD()
        if not _kernel32.ReadFile(handle, buffer, count, ctypes.byref(read), None):
            raise _native_error("ReadFile")
        if read.value == 0:
            raise SafeIOError("file ended before its retained-handle length")
        chunks.append(buffer.raw[:read.value])
        remaining -= read.value
    extra = ctypes.create_string_buffer(1)
    read = wintypes.DWORD()
    if not _kernel32.ReadFile(handle, extra, 1, ctypes.byref(read), None):
        raise _native_error("ReadFile")
    if read.value:
        raise SafeIOError("file grew during retained-handle acquisition")
    return b"".join(chunks)


def read_bound_file (path: os.PathLike[str] | str, *, max_bytes: int,
                     expected_identity: FileIdentity | None = None) -> BoundFile:
    if type(max_bytes) is not int or not 0 <= max_bytes <= 1_073_741_824:
        raise SafeIOError("max_bytes must be a bounded nonnegative integer")
    absolute = _absolute_path(path)
    parents = _open_directory_chain(str(Path(absolute).parent))
    handle = 0
    try:
        handle = _open_native(absolute, directory=False)
        before, canonical, standard = _handle_facts(handle, expect_directory=False)
        if int(standard.NumberOfLinks) != 1:
            raise SafeIOError("file must have exactly one link")
        _assert_single_unnamed_stream(handle)
        length = int(standard.EndOfFile)
        if length < 0 or length > max_bytes:
            raise SafeIOError("file length exceeds its acquisition bound")
        parent_canonical = _handle_facts(parents[-1], expect_directory=True)[1]
        if not canonical.casefold().startswith(
                (parent_canonical.rstrip("\\") + "\\").casefold()):
            raise SafeIOError("leaf escaped its retained parent")
        if expected_identity is not None and before != expected_identity:
            raise SafeIOError("file identity does not match the expected identity")
        data = _read_handle(handle, length)
        after, after_path, after_standard = _handle_facts(handle, expect_directory=False)
        if (after != before or after_path != canonical
                or int(after_standard.EndOfFile) != length
                or int(after_standard.NumberOfLinks) != 1):
            raise SafeIOError("file changed during retained-handle acquisition")
        _assert_single_unnamed_stream(handle)
        return BoundFile(before, data, canonical, hashlib.sha256(data).hexdigest())
    finally:
        _close_handle(handle)
        for parent in reversed(parents):
            _close_handle(parent)


def _relative_parts (relative: os.PathLike[str] | str) -> tuple[str, ...]:
    raw = os.fspath(relative)
    if not isinstance(raw, str) or not raw or "\x00" in raw:
        raise SafeIOError("relative path must be a nonempty NUL-free string")
    normalized = raw.replace("/", "\\")
    if normalized.startswith("\\") or normalized.endswith("\\") or "\\\\" in normalized:
        raise SafeIOError("relative path must be contained and traversal-free")
    path = PureWindowsPath(normalized)
    if path.is_absolute() or path.drive or path.root:
        raise SafeIOError("relative path must be contained and traversal-free")
    parts = tuple(normalized.split("\\"))
    _validate_components(parts)
    return parts


def _random_sibling_name (role: str) -> str:
    """Return a bounded target-independent leaf for an atomic-write role."""
    if role not in ("tmp", "backup", "rejected"):
        raise SafeIOError("atomic-write sibling role is invalid")
    name = ".chronicle-" + secrets.token_hex(16) + "." + role
    _validate_components((name,))
    return name


def _write_all (handle: int, data: bytes) -> None:
    offset = 0
    while offset < len(data):
        chunk = data[offset:offset + 1_048_576]
        written = wintypes.DWORD()
        buffer = ctypes.create_string_buffer(chunk)
        if not _kernel32.WriteFile(
                handle, buffer, len(chunk), ctypes.byref(written), None):
            raise _native_error("WriteFile")
        if written.value != len(chunk):
            raise SafeIOError("short native file write")
        offset += written.value
    if not _kernel32.FlushFileBuffers(handle):
        raise _native_error("FlushFileBuffers")


def _rename_handle (handle: int, root_handle: int, destination: str) -> None:
    encoded = destination.encode("utf-16le", errors="strict")
    if not encoded or len(encoded) > 65_534:
        raise SafeIOError("rename destination is invalid or too long")
    offset = _FILE_RENAME_INFO_EX.FileName.offset
    # FileNameLength excludes the terminator.  Reserve the complete fixed
    # structure plus the variable name and terminator; Windows validates the
    # full information buffer size independently from FileNameLength.
    raw = ctypes.create_string_buffer(
        ctypes.sizeof(_FILE_RENAME_INFO_EX) + len(encoded) + 2)
    header = _FILE_RENAME_INFO_EX.from_buffer(raw)
    header.Flags = 0
    header.RootDirectory = root_handle
    header.FileNameLength = len(encoded)
    ctypes.memmove(ctypes.addressof(raw) + offset, encoded, len(encoded))
    status_block = _IO_STATUS_BLOCK()
    status = _ntdll.NtSetInformationFile(
        handle, ctypes.byref(status_block), raw, len(raw),
        _NT_FILE_RENAME_INFORMATION_EX_CLASS)
    if status < 0:
        code = int(_ntdll.RtlNtStatusToDosError(status))
        raise SafeIOError(
            f"NtSetInformationFile(FileRenameInformationEx) failed "
            f"(Windows error {code})", winerror=code)


def _delete_handle (handle: int) -> None:
    disposition = _FILE_DISPOSITION_INFO_EX(
        _FILE_DISPOSITION_FLAG_DELETE | _FILE_DISPOSITION_FLAG_POSIX_SEMANTICS
    )
    if not _kernel32.SetFileInformationByHandle(
            handle, _FILE_DISPOSITION_INFO_EX_CLASS,
            ctypes.byref(disposition), ctypes.sizeof(disposition)):
        raise _native_error("FileDispositionInfoEx")


class SafeRoot:
    """A retained, non-reparse Windows directory capability."""

    def __init__ (self, path: os.PathLike[str] | str, *, create: bool = False):
        absolute = _absolute_path(path)
        if create:
            _ensure_directory_path(absolute)
        self._path = absolute
        self._handles = _open_directory_chain(absolute, mutate_last=True)
        self._handle = self._handles[-1]
        self.identity, self.canonical_path, _ = _handle_facts(
            self._handle, expect_directory=True)
        self._closed = False

    @property
    def path (self) -> Path:
        return Path(self._path)

    def close (self) -> None:
        if not self._closed:
            for handle in reversed(self._handles):
                _close_handle(handle)
            self._handles.clear()
            self._closed = True

    def __enter__ (self) -> "SafeRoot":
        if self._closed:
            raise SafeIOError("root capability is closed")
        return self

    def __exit__ (self, _type, _value, _traceback) -> None:
        self.close()

    def _absolute (self, relative: os.PathLike[str] | str) -> tuple[str, str]:
        if self._closed:
            raise SafeIOError("root capability is closed")
        parts = _relative_parts(relative)
        native_relative = "\\".join(parts)
        return str(self.path.joinpath(*parts)), native_relative

    def read (self, relative: os.PathLike[str] | str, *, max_bytes: int,
              expected_identity: FileIdentity | None = None) -> BoundFile:
        absolute, _ = self._absolute(relative)
        result = read_bound_file(
            absolute, max_bytes=max_bytes, expected_identity=expected_identity)
        prefix = self.canonical_path.rstrip("\\") + "\\"
        if not result.canonical_path.casefold().startswith(prefix.casefold()):
            raise SafeIOError("bound read escaped the root capability")
        return result

    def ensure_directory (self, relative: os.PathLike[str] | str) -> None:
        absolute, _ = self._absolute(relative)
        _ensure_directory_path(absolute)
        handles = _open_directory_chain(absolute)
        try:
            canonical = _handle_facts(handles[-1], expect_directory=True)[1]
            prefix = self.canonical_path.rstrip("\\") + "\\"
            if not canonical.casefold().startswith(prefix.casefold()):
                raise SafeIOError("created directory escaped the root capability")
        finally:
            for handle in reversed(handles):
                _close_handle(handle)

    def rename_no_replace (self, source_relative: os.PathLike[str] | str,
                           destination_relative: os.PathLike[str] | str,
                           *, expect_directory: bool | None = None) -> None:
        source_parts = _relative_parts(source_relative)
        destination_parts = _relative_parts(destination_relative)
        source, _ = self._absolute(source_relative)
        self._absolute(destination_relative)
        source_parents = _open_directory_chain(
            str(self.path.joinpath(*source_parts[:-1])))
        destination_parents: list[int] = []
        handle = 0
        try:
            destination_parents = _open_directory_chain(
                str(self.path.joinpath(*destination_parts[:-1])),
                mutate_last=True)
            handle = _open_native(
                source, directory=bool(expect_directory), delete=True)
            _handle_facts(handle, expect_directory=expect_directory)
            _rename_handle(
                handle, destination_parents[-1], destination_parts[-1])
            _, canonical, _ = _handle_facts(handle, expect_directory=expect_directory)
            prefix = self.canonical_path.rstrip("\\") + "\\"
            if not canonical.casefold().startswith(prefix.casefold()):
                raise SafeIOError("renamed object escaped the root capability")
        finally:
            _close_handle(handle)
            for parent in reversed(destination_parents):
                _close_handle(parent)
            for parent in reversed(source_parents):
                _close_handle(parent)

    def _remove_exact (self, relative: str, identity: FileIdentity) -> None:
        parts = _relative_parts(relative)
        absolute, _ = self._absolute(relative)
        parents = _open_directory_chain(
            str(self.path.joinpath(*parts[:-1])))
        handle = 0
        try:
            handle = _open_native(absolute, directory=False, delete=True)
            current, _, standard = _handle_facts(handle, expect_directory=False)
            if current != identity or int(standard.NumberOfLinks) != 1:
                raise SafeIOError("delete target changed after observation")
            _assert_single_unnamed_stream(handle)
            _delete_handle(handle)
        finally:
            _close_handle(handle)
            for parent in reversed(parents):
                _close_handle(parent)

    def write_if_changed (self, relative: os.PathLike[str] | str, data: bytes,
                          *, max_bytes: int = SOURCE_FILE_LIMIT) -> bool:
        if not isinstance(data, bytes) or len(data) > max_bytes:
            raise SafeIOError("write data must be bounded immutable bytes")
        target, target_relative = self._absolute(relative)
        existing: BoundFile | None = None
        try:
            existing = self.read(relative, max_bytes=max_bytes)
            if existing.data == data:
                return False
        except SafeIOError as exc:
            if exc.winerror not in (2, 3):
                raise
        parent = Path(target).parent
        target_parts = _relative_parts(target_relative)
        parent_parts = target_parts[:-1]
        if parent_parts:
            self.ensure_directory("/".join(parent_parts))
        parent_handles = _open_directory_chain(str(parent), mutate_last=True)
        temp_name = _random_sibling_name("tmp")
        temp = str(parent / temp_name)
        temp_handle = 0
        backup_handle = 0
        backup_name = ""
        backup_moved = False
        promoted = False
        try:
            parent_canonical = _handle_facts(
                parent_handles[-1], expect_directory=True)[1]
            expected_path = parent_canonical.rstrip("\\") + "\\" + target_parts[-1]
            temp_handle = _open_native(
                temp, directory=False, write=True, delete=True, create_new=True)
            _write_all(temp_handle, data)
            identity, _, standard = _handle_facts(temp_handle, expect_directory=False)
            if int(standard.EndOfFile) != len(data) or int(standard.NumberOfLinks) != 1:
                raise SafeIOError("temporary write postcondition failed")
            _assert_single_unnamed_stream(temp_handle)
            if existing is not None:
                backup_name = _random_sibling_name("backup")
                backup_handle = _open_native(target, directory=False, delete=True)
                current, _, current_standard = _handle_facts(
                    backup_handle, expect_directory=False)
                if (current != existing.identity
                        or int(current_standard.EndOfFile) != len(existing.data)
                        or int(current_standard.NumberOfLinks) != 1):
                    raise SafeIOError("write target changed after observation")
                _assert_single_unnamed_stream(backup_handle)
                prior_data = _read_handle(backup_handle, len(existing.data))
                after, after_path, after_standard = _handle_facts(
                    backup_handle, expect_directory=False)
                if (after != current or after_path != existing.canonical_path
                        or int(after_standard.EndOfFile) != len(existing.data)
                        or int(after_standard.NumberOfLinks) != 1
                        or prior_data != existing.data
                        or hashlib.sha256(prior_data).hexdigest() != existing.sha256):
                    raise SafeIOError("write target content changed after observation")
                _assert_single_unnamed_stream(backup_handle)
                _rename_handle(backup_handle, parent_handles[-1], backup_name)
                backup_moved = True
            _rename_handle(temp_handle, parent_handles[-1], target_parts[-1])
            promoted = True
            promoted_identity, promoted_path, promoted_standard = _handle_facts(
                temp_handle, expect_directory=False)
            if (promoted_identity.volume_serial != identity.volume_serial
                    or promoted_identity.file_id != identity.file_id
                    or promoted_path.casefold() != expected_path.casefold()
                    or int(promoted_standard.EndOfFile) != len(data)
                    or int(promoted_standard.NumberOfLinks) != 1):
                raise SafeIOError("promoted write postcondition failed")
            _assert_single_unnamed_stream(temp_handle)
            if backup_handle:
                _delete_handle(backup_handle)
            return True
        except Exception as failure:
            if promoted:
                rejected_name = _random_sibling_name("rejected")
                try:
                    _rename_handle(temp_handle, parent_handles[-1], rejected_name)
                except Exception as containment_error:
                    raise SafeIOError(
                        "promoted write could not be moved aside; state is ambiguous"
                    ) from containment_error
                if backup_handle:
                    try:
                        _rename_handle(
                            backup_handle, parent_handles[-1], target_parts[-1])
                        restored, restored_path, restored_standard = _handle_facts(
                            backup_handle, expect_directory=False)
                        if (restored.volume_serial != existing.identity.volume_serial
                                or restored.file_id != existing.identity.file_id
                                or restored_path.casefold() != expected_path.casefold()
                                or int(restored_standard.EndOfFile) != len(existing.data)
                                or int(restored_standard.NumberOfLinks) != 1):
                            raise SafeIOError("restored prior write postcondition failed")
                    except Exception as restore_error:
                        raise SafeIOError(
                            "rejected write is contained but the prior state was not restored"
                        ) from restore_error
                try:
                    _delete_handle(temp_handle)
                except Exception as cleanup_error:
                    raise SafeIOError(
                        "prior state was restored but rejected write cleanup failed"
                    ) from cleanup_error
                raise failure
            if backup_moved:
                try:
                    _rename_handle(
                        backup_handle, parent_handles[-1], target_parts[-1])
                except Exception as restore_error:
                    raise SafeIOError(
                        "write failed before promotion and the prior state was not restored"
                    ) from restore_error
            if temp_handle:
                try:
                    _delete_handle(temp_handle)
                except Exception as cleanup_error:
                    raise SafeIOError(
                        "write failed before promotion and temporary cleanup failed"
                    ) from cleanup_error
            raise
        finally:
            _close_handle(backup_handle)
            _close_handle(temp_handle)
            for handle in reversed(parent_handles):
                _close_handle(handle)

    def sweep_files (self, relative_directory: os.PathLike[str] | str,
                     expected: Collection[str]) -> tuple[str, ...]:
        if isinstance(expected, (str, bytes)):
            raise SafeIOError("expected set must contain simple basenames")
        try:
            expected_set = set(expected)
        except (TypeError, ValueError) as exc:
            raise SafeIOError("expected set must contain simple basenames") from exc
        if any(not isinstance(name, str)
               or len(_relative_parts(name)) != 1 for name in expected_set):
            raise SafeIOError("expected set must contain simple basenames")
        if len({name.casefold() for name in expected_set}) != len(expected_set):
            raise SafeIOError("expected set has a case-insensitive collision")
        return sweep_runtime_tree(self, relative_directory, expected_set)

    def swap_directories (self, new_relative: os.PathLike[str] | str,
                          target_relative: os.PathLike[str] | str,
                          backup_relative: os.PathLike[str] | str) -> None:
        target_moved = False
        try:
            self.rename_no_replace(
                target_relative, backup_relative, expect_directory=True)
            target_moved = True
        except SafeIOError as exc:
            if exc.winerror not in (2, 3):
                raise
        try:
            self.rename_no_replace(new_relative, target_relative, expect_directory=True)
        except Exception as promotion_error:
            if target_moved:
                try:
                    self.rename_no_replace(
                        backup_relative, target_relative, expect_directory=True)
                except Exception as restore_error:
                    raise SafeIOError(
                        "directory promotion failed and prior target restoration failed"
                    ) from restore_error
            raise promotion_error


def bind_root (path: os.PathLike[str] | str, *, create: bool = False) -> SafeRoot:
    return SafeRoot(path, create=create)


def asset_spec (token: str) -> AssetSpec:
    try:
        return ASSETS[token]
    except (KeyError, TypeError) as exc:
        raise SafeIOError("unknown Chronicle asset token") from exc


def validate_asset (token: str, data: bytes) -> bytes:
    spec = asset_spec(token)
    if not isinstance(data, bytes):
        raise SafeIOError("asset payload must be immutable bytes")
    if len(data) != spec.length or hashlib.sha256(data).hexdigest() != spec.sha256:
        raise SafeIOError("asset length or digest mismatch")
    return data


def sanitize_bootswatch (data: bytes) -> bytes:
    source = validate_asset("fetch-bootswatch", data)
    if source.count(BOOTSWATCH_FONT_IMPORT) != 1:
        raise SafeIOError("Bootswatch font import occurrence mismatch")
    output = source.replace(BOOTSWATCH_FONT_IMPORT, b"")
    if (len(output) != BOOTSWATCH_LOCAL_LENGTH
            or hashlib.sha256(output).hexdigest() != BOOTSWATCH_LOCAL_SHA256):
        raise SafeIOError("sanitized Bootswatch output mismatch")
    return output


def _deadline_remaining (deadline: float) -> float:
    remaining = deadline - time.monotonic()
    if not math.isfinite(remaining) or remaining <= 0:
        raise SafeIOError("asset transfer deadline expired")
    return remaining


def _resolve_https_host (host: str, port: int, deadline: float):
    """Bound platform DNS without granting a lingering resolver mutation path."""
    result: queue.Queue[object] = queue.Queue(maxsize=1)

    def resolve () -> None:
        try:
            result.put(socket.getaddrinfo(
                host, port, type=socket.SOCK_STREAM, proto=socket.IPPROTO_TCP))
        except Exception as exc:
            result.put(exc)

    worker = threading.Thread(
        target=resolve, name="chronicle-asset-dns", daemon=True)
    worker.start()
    worker.join(_deadline_remaining(deadline))
    if worker.is_alive():
        raise SafeIOError("asset DNS resolution exceeded its absolute deadline")
    try:
        value = result.get_nowait()
    except queue.Empty as exc:
        raise SafeIOError("asset DNS resolution produced no result") from exc
    if isinstance(value, Exception):
        raise SafeIOError("asset DNS resolution failed") from value
    if not isinstance(value, list) or not value:
        raise SafeIOError("asset DNS resolution returned no address")
    return value


def _connect_https (host: str, port: int, deadline: float) -> ssl.SSLSocket:
    addresses = _resolve_https_host(host, port, deadline)
    last_error: BaseException | None = None
    for family, socktype, protocol, _canonical, address in addresses:
        raw: socket.socket | None = None
        try:
            raw = socket.socket(family, socktype, protocol)
            raw.settimeout(min(
                float(CDN_CONNECT_TIMEOUT_SECONDS),
                _deadline_remaining(deadline),
            ))
            raw.connect(address)
            raw.settimeout(_deadline_remaining(deadline))
            context = ssl.create_default_context()
            wrapped = context.wrap_socket(raw, server_hostname=host)
            raw = None
            wrapped.settimeout(_deadline_remaining(deadline))
            return wrapped
        except (OSError, ssl.SSLError, SafeIOError) as exc:
            last_error = exc
        finally:
            if raw is not None:
                raw.close()
    raise SafeIOError("asset HTTPS connection failed") from last_error


def download_pinned_asset (token: str) -> bytes:
    """Download one fixed HTTPS asset under a non-resettable absolute deadline."""
    spec = asset_spec(token)
    parsed = urlsplit(spec.url)
    if (parsed.scheme != "https" or parsed.username is not None
            or parsed.password is not None or parsed.fragment
            or not parsed.hostname or parsed.port not in (None, 443)
            or parsed.netloc != parsed.hostname
            or not parsed.path.startswith("/") or "\\" in parsed.path):
        raise SafeIOError("asset authority URL is not canonical fixed HTTPS")
    target = parsed.path + (f"?{parsed.query}" if parsed.query else "")
    deadline = time.monotonic() + float(CDN_TRANSFER_DEADLINE_SECONDS)
    connection = http.client.HTTPSConnection(
        parsed.hostname, 443, timeout=float(CDN_CONNECT_TIMEOUT_SECONDS),
        context=ssl.create_default_context())
    response = None
    transport_socket: ssl.SSLSocket | None = None
    deadline_timer: threading.Timer | None = None
    try:
        transport_socket = _connect_https(parsed.hostname, 443, deadline)
        connection.sock = transport_socket
        transport_socket.settimeout(_deadline_remaining(deadline))

        def expire_transport () -> None:
            try:
                transport_socket.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass

        deadline_timer = threading.Timer(
            _deadline_remaining(deadline), expire_transport)
        deadline_timer.daemon = True
        deadline_timer.start()
        connection.request(
            "GET", target,
            headers={
                "Accept": "application/javascript,text/css,*/*;q=0.1",
                "Accept-Encoding": "identity",
                "Connection": "close",
                "User-Agent": "KATLAB-Chronicle/0.3.0.3",
            },
        )
        transport_socket.settimeout(_deadline_remaining(deadline))
        response = connection.getresponse()
        headers = response.getheaders()
        if len(headers) > 128 or sum(len(name) + len(value) for name, value in headers) > 65_536:
            raise SafeIOError("asset response headers exceed their bound")
        content_lengths = [
            value.strip() for name, value in headers
            if name.lower() == "content-length"
        ]
        encodings = [
            value.strip().lower() for name, value in headers
            if name.lower() == "content-encoding"
        ]
        transfers = [value for name, value in headers
                     if name.lower() == "transfer-encoding"]
        locations = [value for name, value in headers if name.lower() == "location"]
        if response.status != 200 or locations:
            raise SafeIOError("asset server did not return one direct 200 response")
        if (len(content_lengths) != 1
                or content_lengths[0] != str(spec.length)):
            raise SafeIOError("asset response content length is not exact")
        if transfers or len(encodings) > 1 or (
                encodings and encodings[0] != "identity"):
            raise SafeIOError("asset response encoding is not identity-length framed")
        chunks: list[bytes] = []
        remaining = spec.length
        while remaining:
            transport_socket.settimeout(_deadline_remaining(deadline))
            chunk = response.read(min(1_048_576, remaining))
            if not chunk:
                break
            chunks.append(chunk)
            remaining -= len(chunk)
        data = b"".join(chunks)
        return validate_asset(token, data)
    except SafeIOError:
        raise
    except (OSError, ssl.SSLError, http.client.HTTPException,
            ValueError, OverflowError) as exc:
        raise SafeIOError("asset HTTPS transfer failed") from exc
    finally:
        if deadline_timer is not None:
            deadline_timer.cancel()
        try:
            if response is not None:
                response.close()
        finally:
            try:
                connection.close()
            finally:
                if transport_socket is not None:
                    transport_socket.close()


def fetch_pinned_asset (token: str, root: SafeRoot | None = None) -> BoundFile:
    """Download and atomically promote one raw vendor source asset."""
    spec = asset_spec(token)

    def fetch_and_promote (authority: SafeRoot) -> BoundFile:
        data = download_pinned_asset(token)
        relative = f"assets/vendor/{spec.name}"
        # A bounded invalid prior asset is repairable; the promoted bytes are
        # still checked against the exact much smaller pinned length below.
        authority.write_if_changed(relative, data, max_bytes=SOURCE_FILE_LIMIT)
        result = authority.read(relative, max_bytes=spec.length)
        validate_asset(token, result.data)
        return result

    if root is not None:
        if not isinstance(root, SafeRoot):
            raise SafeIOError("asset destination root is invalid")
        return fetch_and_promote(root)
    with bind_root(Path(os.path.abspath(__file__)).parent) as script_root:
        return fetch_and_promote(script_root)


def origin_from_bind (host: str, port: int) -> TrackerOrigin | None:
    if (not isinstance(host, str) or host != host.strip()
            or type(port) is not int or not 1 <= port <= 65_535):
        return None
    mapped = {
        "127.0.0.1": ("127.0.0.1", socket.AF_INET),
        "localhost": ("127.0.0.1", socket.AF_INET),
        "0.0.0.0": ("127.0.0.1", socket.AF_INET),
        "::1": ("::1", socket.AF_INET6),
        "::": ("::1", socket.AF_INET6),
    }.get(host.lower())
    if mapped is None:
        return None
    numeric, family = mapped
    shown = f"[{numeric}]" if family == socket.AF_INET6 else numeric
    return TrackerOrigin(f"http://{shown}:{port}", numeric, port, family)


def normalize_tracker_origin (raw: str) -> TrackerOrigin:
    if (not isinstance(raw, str) or not raw or raw != raw.strip()
            or not raw.isascii() or any(ord(char) < 0x20 or ord(char) == 0x7f for char in raw)
            or "\\" in raw or "%" in raw or "@" in raw):
        raise SafeIOError("tracker origin is not canonical")
    match = re.fullmatch(r"http://(127\.0\.0\.1|\[::1\]):([1-9][0-9]{0,4})(/?)", raw)
    if match is None:
        raise SafeIOError("tracker origin must be an explicit numeric loopback HTTP origin")
    port = int(match.group(2))
    if port > 65_535:
        raise SafeIOError("tracker origin port is out of range")
    host = "::1" if match.group(1) == "[::1]" else "127.0.0.1"
    result = origin_from_bind(host, port)
    assert result is not None
    return result


def _day (value: str) -> date:
    if not isinstance(value, str) or re.fullmatch(r"\d{4}-\d{2}-\d{2}", value) is None:
        raise SafeIOError("day must be canonical YYYY-MM-DD")
    try:
        parsed = date.fromisoformat(value)
    except ValueError as exc:
        raise SafeIOError("day must be a real calendar date") from exc
    if parsed.isoformat() != value:
        raise SafeIOError("day must be canonical YYYY-MM-DD")
    return parsed


def build_tracker_target (token: str, *, repo_id: str | None = None,
                          offset: int | None = None, day: str | None = None,
                          next_day: str | None = None) -> bytes:
    if repo_id is not None and (
            not isinstance(repo_id, str) or _RID_RX.fullmatch(repo_id) is None):
        raise SafeIOError("repository id is invalid")
    if token in ("repos", "tasks"):
        if any(value is not None for value in (repo_id, offset, day, next_day)):
            raise SafeIOError("endpoint received unsupported parameters")
        return f"/api/{token}".encode("ascii")
    if token == "stats":
        if any(value is not None for value in (offset, day, next_day)):
            raise SafeIOError("stats received unsupported parameters")
        return (b"/api/stats" if repo_id is None
                else f"/api/stats?repo={repo_id}".encode("ascii"))
    if token == "history":
        if repo_id is None or type(offset) is not int or offset not in range(0, 10_000, 500):
            raise SafeIOError("history requires a valid repo and paged offset")
        if day is not None or next_day is not None:
            raise SafeIOError("history received unsupported parameters")
        return (f"/api/history?repo={repo_id}&limit=500&offset={offset}").encode("ascii")
    if token == "events":
        if (repo_id is None or type(offset) is not int
                or offset not in range(0, 10_000, 500)
                or day is None or next_day is None):
            raise SafeIOError("events requires repo, day window, and paged offset")
        start = _day(day)
        end = _day(next_day)
        if end != start + timedelta(days=1):
            raise SafeIOError("events day window must be exactly one day")
        return (
            f"/api/events?repo={repo_id}&since={day}T00%3A00%3A00Z&"
            f"until={next_day}T00%3A00%3A00Z&limit=500&offset={offset}"
        ).encode("ascii")
    raise SafeIOError("unknown tracker endpoint token")


def _chronicle_auth_helpers ():
    try:
        from Backend.app.chronicle_auth import canonical_nonce, response_mac
    except Exception as exc:
        raise SafeIOError("Chronicle response-proof helper is unavailable") from exc
    return canonical_nonce, response_mac


def verify_authenticated_response (
        key: bytes, nonce: bytes, target: bytes, status: int,
        headers: Sequence[tuple[bytes, bytes]], body: bytes) -> object:
    canonical_nonce, response_mac = _chronicle_auth_helpers()
    if not isinstance(key, bytes) or len(key) != 32 or not canonical_nonce(nonce):
        raise SafeIOError("response proof key or nonce is invalid")
    if type(status) is not int or status != 200:
        raise SafeIOError("tracker response status is not 200")
    if not isinstance(target, bytes) or target != build_tracker_target_from_bytes(target):
        raise SafeIOError("tracker response target is not canonical")
    if not isinstance(body, bytes) or len(body) > TRACKER_RESPONSE_LIMIT:
        raise SafeIOError("tracker response exceeds its byte bound")
    content_types: list[bytes] = []
    content_encodings: list[bytes] = []
    proofs: list[bytes] = []
    original: list[tuple[bytes, bytes]] = []
    for pair in headers:
        if (not isinstance(pair, tuple) or len(pair) != 2
                or not isinstance(pair[0], bytes) or not isinstance(pair[1], bytes)
                or _HEADER_NAME_RX.fullmatch(pair[0]) is None
                or any(byte < 0x20 and byte != 0x09 or byte == 0x7f for byte in pair[1])):
            raise SafeIOError("tracker response header grammar is invalid")
        name = pair[0].lower()
        if name == b"x-katlab-chronicle-mac":
            proofs.append(pair[1])
        else:
            original.append(pair)
        if name == b"content-type":
            content_types.append(pair[1])
        elif name == b"content-encoding":
            content_encodings.append(pair[1])
    if len(proofs) != 1 or re.fullmatch(rb"[0-9a-f]{64}", proofs[0]) is None:
        raise SafeIOError("tracker response proof header is missing or invalid")
    if len(content_types) != 1:
        raise SafeIOError("tracker response must have one content-type")
    media_parts = [part.strip().lower() for part in content_types[0].split(b";")]
    if media_parts[0] != b"application/json" or any(
            part != b"charset=utf-8" for part in media_parts[1:]) or len(media_parts) > 2:
        raise SafeIOError("tracker response content-type is not canonical JSON UTF-8")
    if len(content_encodings) > 1 or (
            content_encodings and content_encodings[0].strip().lower() != b"identity"):
        raise SafeIOError("tracker response content encoding is not identity")
    expected = response_mac(key, nonce, target, status, original, body)
    if not hmac.compare_digest(expected, proofs[0]):
        raise SafeIOError("tracker response proof mismatch")
    if body.startswith(b"\xef\xbb\xbf"):
        raise SafeIOError("tracker JSON must not contain a BOM")

    def pairs (items: Iterable[tuple[str, object]]) -> dict[str, object]:
        result: dict[str, object] = {}
        for name, value in items:
            if name in result:
                raise SafeIOError("tracker JSON contains a duplicate key")
            result[name] = value
        return result

    def reject_constant (_value: str):
        raise SafeIOError("tracker JSON contains a non-finite number")

    try:
        payload = json.loads(body.decode("utf-8", errors="strict"),
                             object_pairs_hook=pairs, parse_constant=reject_constant)
    except SafeIOError:
        raise
    except (UnicodeError, json.JSONDecodeError, RecursionError,
            ValueError, OverflowError) as exc:
        raise SafeIOError("tracker JSON is not strict UTF-8 JSON") from exc
    if (not isinstance(payload, dict) or set(payload) != {
            "success", "data", "message", "timestamp"}
            or payload["success"] is not True or payload["message"] != ""
            or not isinstance(payload["timestamp"], str)):
        raise SafeIOError("tracker envelope is not the exact successful shape")
    try:
        timestamp_bytes = payload["timestamp"].encode("utf-8", errors="strict")
        timestamp = datetime.fromisoformat(payload["timestamp"].replace("Z", "+00:00"))
    except (UnicodeError, ValueError, OverflowError) as exc:
        raise SafeIOError("tracker envelope timestamp is not valid UTC-Z") from exc
    if (len(timestamp_bytes) > 64 or not payload["timestamp"].endswith("Z")
            or timestamp.utcoffset() != timedelta(0)):
        raise SafeIOError("tracker envelope timestamp is not valid UTC-Z")
    _assert_json_bounds(payload)
    return payload["data"]


def build_tracker_target_from_bytes (target: bytes) -> bytes:
    """Validate one already-built target by round-tripping the exact grammar."""
    if not isinstance(target, bytes) or not target.isascii():
        raise SafeIOError("tracker target must be ASCII bytes")
    text = target.decode("ascii")
    if text in ("/api/repos", "/api/tasks", "/api/stats"):
        return text.encode("ascii")
    match = re.fullmatch(rf"/api/stats\?repo=({_RID_PATTERN})", text)
    if match:
        result = build_tracker_target("stats", repo_id=match.group(1))
        if result == target:
            return result
    match = re.fullmatch(
        rf"/api/history\?repo=({_RID_PATTERN})&limit=500&offset=([0-9]+)", text)
    if match:
        result = build_tracker_target("history", repo_id=match.group(1),
                                      offset=int(match.group(2)))
        if result == target:
            return result
    match = re.fullmatch(
        rf"/api/events\?repo=({_RID_PATTERN})&since=(\d{{4}}-\d{{2}}-\d{{2}})"
        r"T00%3A00%3A00Z&until=(\d{4}-\d{2}-\d{2})T00%3A00%3A00Z&"
        r"limit=500&offset=([0-9]+)", text)
    if match:
        result = build_tracker_target(
            "events", repo_id=match.group(1), offset=int(match.group(4)),
            day=match.group(2), next_day=match.group(3))
        if result == target:
            return result
    raise SafeIOError("tracker target does not match an allowlisted grammar")


def _assert_json_bounds (value: object, *, depth: int = 0) -> None:
    if depth > 32:
        raise SafeIOError("tracker JSON nesting exceeds its bound")
    if isinstance(value, str):
        try:
            encoded = value.encode("utf-8", errors="strict")
        except UnicodeError as exc:
            raise SafeIOError("tracker JSON string is not valid Unicode") from exc
        if len(encoded) > 1_048_576:
            raise SafeIOError("tracker JSON string exceeds its bound")
    elif isinstance(value, list):
        if len(value) > 100_000:
            raise SafeIOError("tracker JSON array exceeds its bound")
        for item in value:
            _assert_json_bounds(item, depth=depth + 1)
    elif isinstance(value, dict):
        if len(value) > 256:
            raise SafeIOError("tracker JSON object exceeds its key bound")
        for name, item in value.items():
            _assert_json_bounds(name, depth=depth + 1)
            _assert_json_bounds(item, depth=depth + 1)
    elif type(value) is float and not math.isfinite(value):
        raise SafeIOError("tracker JSON contains a non-finite number")
    elif value is not None and type(value) not in (bool, int, float):
        raise SafeIOError("tracker JSON contains an unsupported value")


def validate_tracker_data (token: str, data: object, *, repo_id: str | None = None,
                           since: str | None = None, until: str | None = None) -> object:
    """D4 consumer schemas after proof verification; never authorize a request.

    Page/session ownership, authenticated repo/calendar membership, and cumulative
    request/row/byte budgets belong to the calling TrackerModelSession. This pure
    validator strips additive fields and returns detached immutable data.
    """
    from datetime import datetime

    _assert_json_bounds(data)
    ceiling = (1 << 63) - 1

    def fail ():
        raise SafeIOError("tracker consumer schema is invalid")

    def string (value, *, maximum=1_048_576, nonempty=False):
        if not isinstance(value, str) or (nonempty and not value):
            fail()
        try:
            if len(value.encode("utf-8")) > maximum:
                fail()
        except UnicodeError:
            fail()
        return value

    def integer (value, *, minimum=0, maximum=ceiling):
        if type(value) is not int or not minimum <= value <= maximum:
            fail()
        return value

    def boolean (value):
        if type(value) is not bool:
            fail()
        return value

    def timestamp (value, *, nullable=False):
        if value is None and nullable:
            return None
        string(value, maximum=64, nonempty=True)
        if re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]+)?Z", value) is None:
            fail()
        try:
            return datetime.fromisoformat(value[:-1] + "+00:00")
        except ValueError:
            fail()

    def nullable_string (value):
        return None if value is None else string(value)

    def relative_file (value):
        string(value, maximum=32_768, nonempty=True)
        if ("\\" in value or ":" in value or any(ord(char) < 32 for char in value)
                or any(part in ("", ".", "..") for part in value.split("/"))):
            fail()
        return value

    def repo (value):
        if not isinstance(value, str) or _RID_RX.fullmatch(value) is None:
            fail()
        return value

    def rows (value, maximum):
        if not isinstance(value, list) or len(value) > maximum:
            fail()
        return value

    def record (value, fields, *, exact=False):
        if not isinstance(value, dict) or not set(fields).issubset(value):
            fail()
        if exact and set(value) != set(fields):
            fail()
        return {name: value[name] for name in fields}

    def frozen (value):
        if isinstance(value, dict):
            return MappingProxyType({name: frozen(item) for name, item in value.items()})
        if isinstance(value, list):
            return tuple(frozen(item) for item in value)
        return value

    def event (value, *, history=False, commit_hash=None):
        required = ("id", "repo_id", "ts", "tool", "file", "task_ref", "candidates_json",
                    "commit_hash", "session_id", "branch", "turn_id", "agent_id",
                    "tool_use_id", "plan_file", "task_id", "mode", "swept", "operation", "provider")
        row = record(value, required)
        integer(row["id"], minimum=1)
        if repo(row["repo_id"]) != repo_id:
            fail()
        parsed_ts = timestamp(row["ts"])
        string(row["tool"])
        relative_file(row["file"])
        for name in required[5:15]:
            nullable_string(row[name])
        if (row["mode"] not in ("B", "A_SCOPED", "A_GLOBAL", "AMBIGUOUS", "UNKNOWN", "MANUAL")
                or row["operation"] not in ("add", "update", "delete", "move", "write", None)
                or row["provider"] not in (("claude", "codex", None) if history else ("claude", "codex"))):
            fail()
        integer(row["swept"], maximum=1)
        if history:
            if row["commit_hash"] != commit_hash:
                fail()
        elif not timestamp(since) <= parsed_ts < timestamp(until):
            fail()
        return row

    result = []
    if token == "repos":
        seen = set()
        for value in rows(data, 256):
            row = record(value, ("id", "name", "path", "clean", "offline", "paths_complete",
                                 "status_valid", "count", "branch", "observed_at", "last_event_ts",
                                 "oldest_uncommitted_ts", "activity_buckets", "warnings"))
            identity = repo(row["id"])
            if identity in seen:
                fail()
            seen.add(identity)
            string(row["name"], nonempty=True)
            string(row["path"], maximum=32_768)
            for name in ("clean", "offline", "paths_complete", "status_valid"):
                boolean(row[name])
            integer(row["count"])
            nullable_string(row["branch"])
            timestamp(row["observed_at"])
            timestamp(row["last_event_ts"], nullable=True)
            timestamp(row["oldest_uncommitted_ts"], nullable=True)
            if len(rows(row["activity_buckets"], 12)) != 12:
                fail()
            for value in row["activity_buckets"]:
                integer(value)
            warnings = []
            for value in rows(row["warnings"], 200):
                warning = record(value, ("ts", "message"))
                timestamp(warning["ts"])
                string(warning["message"])
                if "source" in value or "code" in value:
                    if value.get("source") != "plan" or "code" not in value:
                        fail()
                    warning.update(source="plan", code=string(value["code"]))
                warnings.append(warning)
            row["warnings"] = warnings
            result.append(row)
    elif token == "tasks":
        for value in rows(data, 100_000):
            row = record(value, ("repo", "plan_file", "task_id", "title", "why", "task_ref",
                                 "status", "files", "last_event_ts"))
            repo(row["repo"])
            relative_file(row["plan_file"])
            string(row["task_id"], maximum=128, nonempty=True)
            string(row["title"])
            string(row["why"])
            if (row["task_ref"] != row["plan_file"] + " - " + row["task_id"]
                    or row["status"] not in ("pending", "in-progress", "done")):
                fail()
            for value in rows(row["files"], 4096):
                string(value, maximum=32_768, nonempty=True)
            timestamp(row["last_event_ts"], nullable=True)
            result.append(row)
    elif token == "stats":
        source = record(data, ("activity_calendar",))
        calendar = rows(source["activity_calendar"], 365)
        if len(calendar) != 365:
            fail()
        previous = None
        for value in calendar:
            row = record(value, ("day", "events", "commits", "minutes"), exact=True)
            parsed = _day(row["day"])
            if previous is not None and (parsed - previous).days != 1:
                fail()
            previous = parsed
            for name in ("events", "commits", "minutes"):
                integer(row[name])
            result.append(row)
        return frozen({"activity_calendar": result})
    elif token == "events":
        repo(repo_id)
        if timestamp(since) >= timestamp(until):
            fail()
        previous_id = None
        for value in rows(data, 500):
            row = event(value)
            if previous_id is not None and row["id"] >= previous_id:
                fail()
            previous_id = row["id"]
            result.append(row)
    elif token == "history":
        repo(repo_id)
        previous_ts = None
        hashes = set()
        event_count = 0
        for value in rows(data, 500):
            row = record(value, ("commit", "events"), exact=True)
            commit = record(row["commit"], ("repo_id", "hash", "message", "ts", "files_json", "parents"))
            digest = string(commit["hash"])
            if (repo(commit["repo_id"]) != repo_id
                    or re.fullmatch(r"(?:[0-9a-f]{40}|[0-9a-f]{64})", digest) is None
                    or digest in hashes):
                fail()
            hashes.add(digest)
            parsed_ts = timestamp(commit["ts"])
            if previous_ts is not None and parsed_ts > previous_ts:
                fail()
            previous_ts = parsed_ts
            string(commit["message"])
            string(commit["files_json"])
            nullable_string(commit["parents"])
            events = []
            previous_event_ts = None
            for value in rows(row["events"], 10_000):
                item = event(value, history=True, commit_hash=digest)
                parsed = timestamp(item["ts"])
                if previous_event_ts is not None and parsed < previous_event_ts:
                    fail()
                previous_event_ts = parsed
                events.append(item)
            event_count += len(events)
            if event_count > 10_000:
                fail()
            result.append({"commit": commit, "events": events})
    else:
        fail()
    return frozen(result)


@dataclass(frozen=True)
class TrackerRequest:
    token: str
    target: bytes
    nonce: bytes
    repo_id: str | None
    offset: int | None
    day: str | None
    next_day: str | None
    deadline: float


class TrackerModelSession:
    """Pure bounded response ledger; this object never opens a socket or a file.

    The transport caller must enforce these deadlines while streaming, bind the
    capability and origin, and provide duplicate-preserving raw headers.
    Completion-time checks here do not replace the caller's cancellation bound.
    """

    def __init__ (self, key: bytes, *, clock=time.monotonic):
        if not isinstance(key, bytes) or len(key) != 32:
            raise SafeIOError("tracker session key is invalid")
        self._key = key
        self._clock = clock
        self._failed = False
        self._pending: TrackerRequest | None = None
        self._requests = 0
        self._bytes = 0
        self._nonces: set[bytes] = set()
        self._repos: frozenset[str] | None = None
        self._calendars: dict[str, frozenset[str]] = {}
        self._singles: set[tuple[str, str | None]] = set()
        self._pages: dict[tuple, tuple[int, bool, object]] = {}
        self._history_count = 0
        self._history_event_count = 0
        self._event_count = 0
        self._commits: set[tuple[str, str]] = set()
        start = self._now()
        self._deadline = start + TRACKER_SESSION_DEADLINE_SECONDS

    def _now (self) -> float:
        value = self._clock()
        if type(value) not in (int, float) or not math.isfinite(value):
            self._failed = True
            raise SafeIOError("tracker session clock is invalid")
        return value

    def _check_live (self) -> float:
        if self._failed:
            raise SafeIOError("tracker session is closed")
        now = self._now()
        if now >= self._deadline:
            self._failed = True
            raise SafeIOError("tracker session deadline expired")
        return now

    def begin (self, token: str, *, repo_id: str | None = None,
               offset: int | None = None, day: str | None = None,
               next_day: str | None = None) -> TrackerRequest:
        try:
            now = self._check_live()
            if self._pending is not None or self._requests >= TRACKER_SESSION_REQUEST_LIMIT:
                raise SafeIOError("tracker session request bound exceeded")
            target = build_tracker_target(token, repo_id=repo_id, offset=offset,
                                          day=day, next_day=next_day)
            if token != "repos" and self._repos is None:
                raise SafeIOError("tracker repositories have not been authenticated")
            if repo_id is not None and repo_id not in (self._repos or ()):
                raise SafeIOError("tracker repository is outside the authenticated set")
            if token in ("repos", "tasks", "stats"):
                if (token, repo_id) in self._singles:
                    raise SafeIOError("tracker singleton response repeated")
            else:
                if token == "events" and day not in self._calendars.get(repo_id, ()):
                    raise SafeIOError("tracker event day is outside its authenticated calendar")
                page_key = (token, repo_id, day)
                expected, complete, _ = self._pages.get(page_key, (0, False, None))
                if complete or offset != expected:
                    raise SafeIOError("tracker page order is invalid")
            nonce = base64.urlsafe_b64encode(secrets.token_bytes(32)).rstrip(b"=")
            if nonce in self._nonces:
                raise SafeIOError("tracker session nonce reuse")
            self._nonces.add(nonce)
            self._requests += 1
            self._pending = TrackerRequest(
                token, target, nonce, repo_id, offset, day, next_day,
                min(self._deadline, now + TRACKER_REQUEST_DEADLINE_SECONDS))
            return self._pending
        except Exception:
            self._failed = True
            raise

    def accept (self, request: TrackerRequest, status: int,
                headers: Sequence[tuple[bytes, bytes]], body: bytes) -> object:
        try:
            now = self._check_live()
            if request is not self._pending or self._pending is None:
                raise SafeIOError("tracker response has no matching request")
            if now >= request.deadline:
                raise SafeIOError("tracker response deadline expired")
            if not isinstance(body, bytes) or self._bytes + len(body) > TRACKER_SESSION_BYTE_LIMIT:
                raise SafeIOError("tracker session response byte bound exceeded")
            self._bytes += len(body)
            data = verify_authenticated_response(
                self._key, request.nonce, request.target, status, headers, body)
            model = validate_tracker_data(
                request.token, data, repo_id=request.repo_id,
                since=f"{request.day}T00:00:00Z" if request.day else None,
                until=f"{request.next_day}T00:00:00Z" if request.next_day else None)
            if request.token == "repos":
                self._repos = frozenset(row["id"] for row in model)
            elif request.token == "tasks":
                if any(row["repo"] not in self._repos for row in model):
                    raise SafeIOError("tracker task references an unauthenticated repository")
            elif request.token == "stats" and request.repo_id is not None:
                self._calendars[request.repo_id] = frozenset(
                    row["day"] for row in model["activity_calendar"])
            elif request.token in ("events", "history"):
                page_key = (request.token, request.repo_id, request.day)
                _, _, previous = self._pages.get(page_key, (0, False, None))
                if request.token == "events":
                    if model and previous is not None and model[0]["id"] >= previous:
                        raise SafeIOError("tracker event page ordering changed")
                    self._event_count += len(model)
                    if self._event_count > 10_000:
                        raise SafeIOError("tracker session event count exceeded")
                    last = model[-1]["id"] if model else previous
                else:
                    first_ts = (datetime.fromisoformat(model[0]["commit"]["ts"].replace("Z", "+00:00"))
                                if model else None)
                    if first_ts is not None and previous is not None and first_ts > previous:
                        raise SafeIOError("tracker history page ordering changed")
                    self._history_count += len(model)
                    self._history_event_count += sum(len(row["events"]) for row in model)
                    if self._history_count > 10_000 or self._history_event_count > 10_000:
                        raise SafeIOError("tracker session history count exceeded")
                    for row in model:
                        identity = (request.repo_id, row["commit"]["hash"])
                        if identity in self._commits:
                            raise SafeIOError("tracker history commit repeated")
                        self._commits.add(identity)
                    last = (datetime.fromisoformat(model[-1]["commit"]["ts"].replace("Z", "+00:00"))
                            if model else previous)
                self._pages[page_key] = (
                    request.offset + 500, len(model) < 500 or request.offset == 9500, last)
            if request.token in ("repos", "tasks", "stats"):
                self._singles.add((request.token, request.repo_id))
            # Verification/parsing also consumes the same non-resettable deadline.
            if self._check_live() >= request.deadline:
                raise SafeIOError("tracker response validation deadline expired")
            self._pending = None
            return model
        except Exception:
            self._failed = True
            self._pending = None
            raise


def require_transport_runtime () -> None:
    """Compatibility hook: the scoped same-owner transport has no external gate."""
    return None


def require_expected_interpreter () -> BoundFile:
    """Bind this process to the optional once-resolved launcher interpreter."""
    expected = os.environ.get("KATLAB_CHRONICLE_PYTHON")
    running_path = _absolute_path(sys.executable)
    running_file = read_bound_file(running_path, max_bytes=67_108_864)
    if not expected:
        return running_file
    expected_path = _absolute_path(expected)
    expected_file = read_bound_file(expected_path, max_bytes=67_108_864)
    if (expected_file.identity != running_file.identity
            or expected_file.canonical_path != running_file.canonical_path):
        raise PrerequisiteError("running interpreter does not match the supplied interpreter")
    return running_file


def capture_chronicle_sources (repo_root: os.PathLike[str] | str) -> SourceSnapshot:
    root_path = Path(_absolute_path(repo_root))
    with bind_root(root_path) as root:
        required = frozenset({"README.md", "LICENSE", "AGENTS.md"})

        def discover () -> tuple[
                tuple[tuple[str, FileIdentity, int], ...], tuple[object, ...]]:
            candidates: dict[str, tuple[FileIdentity, int]] = {}
            observations: list[object] = []

            def record_leaf (relative: str, path: str, parent_canonical: str) -> None:
                if relative == "CLAUDE.md":
                    raise SafeIOError("CLAUDE.md is outside the Chronicle source authority")
                handle = _open_native(path, directory=False)
                try:
                    identity, canonical, standard = _handle_facts(
                        handle, expect_directory=False)
                    expected_prefix = parent_canonical.rstrip("\\") + "\\"
                    length = int(standard.EndOfFile)
                    if (not canonical.casefold().startswith(expected_prefix.casefold())
                            or int(standard.NumberOfLinks) != 1
                            or bool(standard.DeletePending)
                            or length < 0 or length > SOURCE_FILE_LIMIT):
                        raise SafeIOError("Chronicle source leaf is unsafe or oversized")
                    _assert_single_unnamed_stream(handle)
                    if relative in candidates:
                        raise SafeIOError("Chronicle source inventory contains a duplicate")
                    candidates[relative] = (identity, length)
                finally:
                    _close_handle(handle)

            def scan_directory (relative_directory: str, *, recursive: bool,
                                suffix: str) -> None:
                directory = root.path.joinpath(*_relative_parts(relative_directory))
                handles = _open_directory_chain(str(directory))
                try:
                    directory_identity, canonical, standard = _handle_facts(
                        handles[-1], expect_directory=True)
                    if (int(standard.NumberOfLinks) != 1
                            or bool(standard.DeletePending)):
                        raise SafeIOError("Chronicle source directory is unsafe")
                    _assert_directory_has_no_streams(handles[-1])

                    def visit (handle: int, path: str, directory_canonical: str,
                               prefix: str, depth: int) -> None:
                        if depth > _RUNTIME_MAX_DEPTH:
                            raise SafeIOError("Chronicle source inventory is too deep")
                        before_identity, before_path, before_standard = _handle_facts(
                            handle, expect_directory=True)
                        if (before_path != directory_canonical
                                or int(before_standard.NumberOfLinks) != 1
                                or bool(before_standard.DeletePending)):
                            raise SafeIOError("Chronicle source directory changed")
                        names = _directory_items_from_handle(handle)
                        observations.append((prefix, before_identity, names))
                        for name, directory_hint in names:
                            relative = f"{prefix}/{name}" if prefix else name
                            child_path = str(Path(path) / name)
                            matches = name.endswith(suffix)
                            if directory_hint:
                                if matches:
                                    raise SafeIOError(
                                        "Chronicle source pattern matched a directory")
                                if recursive:
                                    child = _open_native(child_path, directory=True)
                                    try:
                                        _, child_canonical, child_standard = _handle_facts(
                                            child, expect_directory=True)
                                        expected_prefix = directory_canonical.rstrip("\\") + "\\"
                                        if (not child_canonical.casefold().startswith(
                                                expected_prefix.casefold())
                                                or int(child_standard.NumberOfLinks) != 1
                                                or bool(child_standard.DeletePending)):
                                            raise SafeIOError(
                                                "Chronicle source directory escaped its parent")
                                        _assert_directory_has_no_streams(child)
                                        visit(child, child_path, child_canonical,
                                              relative, depth + 1)
                                    finally:
                                        _close_handle(child)
                            elif matches:
                                record_leaf(relative, child_path, directory_canonical)
                        after_identity, after_path, after_standard = _handle_facts(
                            handle, expect_directory=True)
                        if (after_identity != before_identity or after_path != before_path
                                or int(after_standard.NumberOfLinks) != 1
                                or bool(after_standard.DeletePending)
                                or _directory_items_from_handle(handle) != names):
                            raise SafeIOError(
                                "Chronicle source directory changed during inventory")

                    visit(handles[-1], str(directory), canonical,
                          relative_directory.replace("\\", "/"), 0)
                    observations.append((
                        relative_directory, directory_identity,
                        int(standard.NumberOfLinks)))
                finally:
                    for handle in reversed(handles):
                        _close_handle(handle)

            root_names = _directory_items_from_handle(root._handle)
            observations.append(("", root.identity, root_names))
            root_map = {name: is_directory for name, is_directory in root_names}
            missing = required - root_map.keys()
            if missing:
                raise SafeIOError("required Chronicle root source is missing")
            for name in sorted(required):
                if root_map[name]:
                    raise SafeIOError("required Chronicle root source is not a file")
                record_leaf(name, str(root.path / name), root.canonical_path)
            release_pattern = re.compile(
                r"^TrackingMonitor_v.*_Release_Notes\.md$")
            for name, directory_hint in root_names:
                if release_pattern.fullmatch(name):
                    if directory_hint:
                        raise SafeIOError("Chronicle release-note pattern matched a directory")
                    record_leaf(name, str(root.path / name), root.canonical_path)

            for folder in ("Claude_Info", "Codex_Info", "Docs"):
                if folder not in root_map or not root_map[folder]:
                    raise SafeIOError("required Chronicle source directory is missing")
                scan_directory(folder, recursive=folder == "Docs", suffix=".md")

            if "temp" in root_map:
                if not root_map["temp"]:
                    raise SafeIOError("Chronicle temp source parent is not a directory")
                temp_path = root.path / "temp"
                temp_handles = _open_directory_chain(str(temp_path))
                try:
                    temp_identity, temp_canonical, temp_standard = _handle_facts(
                        temp_handles[-1], expect_directory=True)
                    if (int(temp_standard.NumberOfLinks) != 1
                            or bool(temp_standard.DeletePending)):
                        raise SafeIOError("Chronicle temp source parent is unsafe")
                    temp_names = _directory_items_from_handle(temp_handles[-1])
                    observations.append(("temp", temp_identity, temp_names))
                    temp_map = {name: is_directory for name, is_directory in temp_names}
                    if "Ref" in temp_map:
                        if not temp_map["Ref"]:
                            raise SafeIOError("Chronicle Ref source is not a directory")
                        scan_directory("temp/Ref", recursive=False, suffix=".mermaid")
                finally:
                    for handle in reversed(temp_handles):
                        _close_handle(handle)

            ordered_candidates = tuple(sorted(
                ((relative, *facts) for relative, facts in candidates.items()),
                key=lambda value: (value[0].casefold(), value[0])))
            if len(ordered_candidates) > SOURCE_COUNT_LIMIT:
                raise SafeIOError("Chronicle source inventory exceeds its file-count bound")
            if len({item[0].casefold() for item in ordered_candidates}) != len(
                    ordered_candidates):
                raise SafeIOError("Chronicle source inventory has a case collision")
            return ordered_candidates, tuple(observations)

        first, first_inventory = discover()
        entries: list[SourceEntry] = []
        leaf_handles: list[int] = []
        retained_parents: list[list[int]] = []
        total = 0
        try:
            for relative, observed_identity, observed_length in first:
                parts = _relative_parts(relative)
                parents = _open_directory_chain(
                    str(root.path.joinpath(*parts[:-1])))
                retained_parents.append(parents)
                handle = _open_native(
                    str(root.path.joinpath(*parts)), directory=False)
                leaf_handles.append(handle)
                identity, canonical_path, standard = _handle_facts(
                    handle, expect_directory=False)
                if (identity != observed_identity
                        or int(standard.EndOfFile) != observed_length
                        or int(standard.NumberOfLinks) != 1
                        or bool(standard.DeletePending)):
                    raise SafeIOError("Chronicle source changed after inventory")
                _assert_single_unnamed_stream(handle)
                data = _read_handle(handle, observed_length)
                after, after_path, after_standard = _handle_facts(
                    handle, expect_directory=False)
                if (after != identity or after_path != canonical_path
                        or int(after_standard.EndOfFile) != observed_length
                        or int(after_standard.NumberOfLinks) != 1
                        or bool(after_standard.DeletePending)):
                    raise SafeIOError("Chronicle source changed during retained read")
                _assert_single_unnamed_stream(handle)
                total += len(data)
                if total > SOURCE_AGGREGATE_LIMIT:
                    raise SafeIOError("Chronicle source inventory exceeds its byte bound")
                if relative.endswith(".mermaid"):
                    try:
                        data.decode("utf-8", errors="strict")
                    except UnicodeError as exc:
                        raise SafeIOError(
                            "Chronicle diagram source is not strict UTF-8") from exc
                entries.append(SourceEntry(
                    relative, identity, data, hashlib.sha256(data).hexdigest()))

            second, second_inventory = discover()
            if first != second or first_inventory != second_inventory:
                raise SafeIOError("Chronicle source inventory changed during capture")
            for entry, handle, (_, identity, length) in zip(
                    entries, leaf_handles, second, strict=True):
                final, final_path, final_standard = _handle_facts(
                    handle, expect_directory=False)
                if (entry.identity != identity or final != entry.identity
                        or final_path.casefold() != root.canonical_path.rstrip(
                            "\\").casefold() + ("\\" + entry.relative_path).replace(
                                "/", "\\").casefold()
                        or len(entry.data) != length
                        or int(final_standard.EndOfFile) != length
                        or int(final_standard.NumberOfLinks) != 1
                        or bool(final_standard.DeletePending)
                        or hashlib.sha256(entry.data).hexdigest() != entry.sha256):
                    raise SafeIOError("Chronicle source changed after retained read")
                _assert_single_unnamed_stream(handle)
            metadata = [{
                "path": entry.relative_path,
                "length": len(entry.data),
                "sha256": entry.sha256,
                "file_identity": entry.identity.as_dict(),
            } for entry in entries]
            canonical = json.dumps(
                metadata, ensure_ascii=False, allow_nan=False,
                sort_keys=True, separators=(",", ":")).encode("utf-8")
            digest = hashlib.sha256(_SOURCE_DIGEST_DOMAIN + canonical).hexdigest()
            return SourceSnapshot(tuple(entries), digest, total)
        finally:
            for handle in reversed(leaf_handles):
                _close_handle(handle)
            for parents in reversed(retained_parents):
                for handle in reversed(parents):
                    _close_handle(handle)


# ---------------------------------------------------------------------------
# Retained runtime inventory and expected-set sweeping

_RUNTIME_DIRECTORY_BUFFER_SIZE = 65_536
_RUNTIME_MAX_DEPTH = 64
_RUNTIME_ENTRY_LIMIT = 65_536
_RUNTIME_TOTAL_LIMIT = 1_073_741_824
_WINDOWS_RESERVED_BASENAMES = frozenset({
    "CON", "PRN", "AUX", "NUL",
    *(f"COM{index}" for index in range(1, 10)),
    *(f"LPT{index}" for index in range(1, 10)),
})


@dataclass(frozen=True)
class RuntimeEntry:
    relative_path: str
    kind: str
    identity: FileIdentity
    length: int | None
    sha256: str | None


@dataclass(frozen=True)
class RuntimeInventory:
    root_identity: FileIdentity
    entries: tuple[RuntimeEntry, ...]


if os.name == "nt":
    _FILE_ID_BOTH_DIRECTORY_INFO_CLASS = 10
    _FILE_ID_BOTH_DIRECTORY_RESTART_INFO_CLASS = 11
    _FILE_ATTRIBUTE_DIRECTORY = 0x00000010
    _ERROR_NO_MORE_FILES = 18
    _ERROR_HANDLE_EOF = 38

    class _FILE_ID_BOTH_DIRECTORY_INFO(ctypes.Structure):
        _fields_ = [
            ("NextEntryOffset", wintypes.DWORD),
            ("FileIndex", wintypes.DWORD),
            ("CreationTime", ctypes.c_longlong),
            ("LastAccessTime", ctypes.c_longlong),
            ("LastWriteTime", ctypes.c_longlong),
            ("ChangeTime", ctypes.c_longlong),
            ("EndOfFile", ctypes.c_longlong),
            ("AllocationSize", ctypes.c_longlong),
            ("FileAttributes", wintypes.DWORD),
            ("FileNameLength", wintypes.DWORD),
            ("EaSize", wintypes.DWORD),
            ("ShortNameLength", ctypes.c_byte),
            ("ShortName", wintypes.WCHAR * 12),
            ("FileId", ctypes.c_longlong),
            ("FileName", wintypes.WCHAR * 1),
        ]

    _RUNTIME_NAME_OFFSET = _FILE_ID_BOTH_DIRECTORY_INFO.FileName.offset


def _runtime_relative_parts (relative: os.PathLike[str] | str) -> tuple[str, ...]:
    """Validate one unambiguous Windows-relative runtime path."""
    try:
        raw = os.fspath(relative)
    except TypeError as exc:
        raise SafeIOError("runtime path must be string-like") from exc
    if (not isinstance(raw, str) or not raw or "\x00" in raw
            or raw.startswith(("/", "\\"))):
        raise SafeIOError("runtime path must be nonempty, relative, and NUL-free")
    normalized = raw.replace("\\", "/")
    parts = tuple(normalized.split("/"))
    if any(not part or part in (".", "..") for part in parts):
        raise SafeIOError("runtime path contains an empty or traversal component")
    for part in parts:
        try:
            encoded_length = len(part.encode("utf-16le", errors="strict"))
        except UnicodeError as exc:
            raise SafeIOError("runtime path is not valid UTF-16") from exc
        if (part[-1] in (" ", ".")
                or any(ord(character) < 0x20 or character in '<>:"|?*'
                       for character in part)
                or encoded_length > 510
                or part.split(".", 1)[0].upper() in _WINDOWS_RESERVED_BASENAMES):
            raise SafeIOError("runtime path contains an ambiguous Windows component")
    return parts


def _runtime_relative (relative: os.PathLike[str] | str) -> str:
    return "/".join(_runtime_relative_parts(relative))


def validate_runtime_relative (relative: os.PathLike[str] | str) -> str:
    """Expose the exact Windows runtime-path grammar for pre-write planning."""
    return _runtime_relative(relative)


def project_markdown_runtime_relative (
        relative: os.PathLike[str] | str) -> tuple[str, str]:
    """Validate one Markdown source and its MkDocs 1.6 flat HTML destination."""
    source = _runtime_relative(relative)
    if not source.endswith(".md"):
        raise SafeIOError("Chronicle Markdown source must use the .md suffix")
    return project_mkdocs_runtime_relative(source)


def project_mkdocs_runtime_relative (
        relative: os.PathLike[str] | str) -> tuple[str, str]:
    """Project one MkDocs 1.6 source into its flat-build destination."""
    source = _runtime_relative(relative)
    parent, separator, leaf = source.rpartition("/")
    if not leaf.endswith(_MKDOCS_MARKDOWN_SUFFIXES):
        return source, source
    # Match MkDocs 1.6's splitext behavior, including the dot-only `.md` leaf.
    stem, _suffix = posixpath.splitext(leaf)
    destination_leaf = ("index" if stem == "README" else stem) + ".html"
    destination = _runtime_relative(
        f"{parent}/{destination_leaf}" if separator else destination_leaf)
    return source, destination


def _validate_runtime_bounds (max_entries: int, max_file_bytes: int,
                              max_total_bytes: int) -> None:
    if (type(max_entries) is not int or not 1 <= max_entries <= _RUNTIME_ENTRY_LIMIT
            or type(max_file_bytes) is not int
            or not 0 <= max_file_bytes <= 1_073_741_824
            or type(max_total_bytes) is not int
            or not 0 <= max_total_bytes <= _RUNTIME_TOTAL_LIMIT):
        raise SafeIOError("runtime inventory bounds are invalid")


def _directory_items_from_handle (handle: int) -> tuple[tuple[str, bool], ...]:
    """Enumerate names through an already-retained directory handle."""
    _require_windows()
    result: list[tuple[str, bool]] = []
    restart = True
    while True:
        buffer = ctypes.create_string_buffer(_RUNTIME_DIRECTORY_BUFFER_SIZE)
        info_class = (_FILE_ID_BOTH_DIRECTORY_RESTART_INFO_CLASS if restart
                      else _FILE_ID_BOTH_DIRECTORY_INFO_CLASS)
        if not _kernel32.GetFileInformationByHandleEx(
                handle, info_class, buffer, len(buffer)):
            error = ctypes.get_last_error()
            if error in (_ERROR_NO_MORE_FILES, _ERROR_HANDLE_EOF):
                break
            raise _native_error("directory inventory query")
        restart = False
        offset = 0
        while True:
            if offset + ctypes.sizeof(_FILE_ID_BOTH_DIRECTORY_INFO) > len(buffer):
                raise SafeIOError("invalid native directory inventory")
            header = _FILE_ID_BOTH_DIRECTORY_INFO.from_buffer_copy(
                buffer.raw, offset)
            name_length = int(header.FileNameLength)
            if (name_length <= 0 or name_length % 2
                    or name_length > 510
                    or offset + _RUNTIME_NAME_OFFSET + name_length > len(buffer)):
                raise SafeIOError("invalid native directory entry name")
            try:
                name = buffer.raw[
                    offset + _RUNTIME_NAME_OFFSET:
                    offset + _RUNTIME_NAME_OFFSET + name_length
                ].decode("utf-16le", errors="strict")
            except UnicodeError as exc:
                raise SafeIOError(
                    "native directory entry name is not valid UTF-16"
                ) from exc
            if name not in (".", ".."):
                if len(_runtime_relative_parts(name)) != 1:
                    raise SafeIOError("native directory entry is not a simple basename")
                if len(result) >= _RUNTIME_ENTRY_LIMIT:
                    raise SafeIOError("native directory inventory exceeds its bound")
                result.append((
                    name, bool(int(header.FileAttributes) & _FILE_ATTRIBUTE_DIRECTORY),
                ))
            next_offset = int(header.NextEntryOffset)
            if next_offset == 0:
                break
            if (next_offset < _RUNTIME_NAME_OFFSET or next_offset % 4
                    or offset + next_offset >= len(buffer)):
                raise SafeIOError("invalid native directory entry offset")
            offset += next_offset
    ordered = tuple(sorted(result, key=lambda item: (item[0].casefold(), item[0])))
    folded = [name.casefold() for name, _ in ordered]
    if len(folded) != len(set(folded)):
        raise SafeIOError("runtime directory has a case-insensitive collision")
    return ordered


def _assert_directory_has_no_streams (handle: int) -> None:
    """Reject named directory streams; an empty stream inventory is normal."""
    size = 4096
    while size <= 1_048_576:
        buffer = ctypes.create_string_buffer(size)
        if _kernel32.GetFileInformationByHandleEx(
                handle, _FILE_STREAM_INFO_CLASS, buffer, size):
            raise SafeIOError("runtime directory has an unexpected stream")
        error = ctypes.get_last_error()
        if error in (_ERROR_NO_MORE_FILES, _ERROR_HANDLE_EOF):
            return
        if error not in (122, 234):
            raise _native_error("directory stream inventory query")
        size *= 2
    raise SafeIOError("directory stream inventory exceeds its bound")


def _checked_runtime_directory (handle: int):
    identity, canonical, standard = _handle_facts(handle, expect_directory=True)
    if int(standard.NumberOfLinks) != 1 or bool(standard.DeletePending):
        raise SafeIOError("runtime directory link/delete state is unsafe")
    _assert_directory_has_no_streams(handle)
    return identity, canonical, standard


def read_existing_file (root: SafeRoot, relative: os.PathLike[str] | str, *,
                        max_bytes: int) -> BoundFile | None:
    """Read an exact safe runtime leaf, returning None only for true absence."""
    normalized = _runtime_relative(relative)
    try:
        return root.read(normalized, max_bytes=max_bytes)
    except SafeIOError as exc:
        if exc.winerror in (2, 3):
            return None
        raise


def _inventory_runtime_tree_once (
        root: SafeRoot, relative_directory: str, *, max_entries: int,
        max_file_bytes: int, max_total_bytes: int) -> RuntimeInventory:
    directory, _ = root._absolute(relative_directory)
    handles = _open_directory_chain(directory)
    entries: list[RuntimeEntry] = []
    aggregate = 0
    try:
        root_identity, root_canonical, _ = _checked_runtime_directory(handles[-1])
        prefix = root.canonical_path.rstrip("\\") + "\\"
        if not root_canonical.casefold().startswith(prefix.casefold()):
            raise SafeIOError("runtime inventory root escaped its capability")

        def visit (directory_handle: int, directory_path: str,
                   directory_canonical: str, parent_relative: str,
                   depth: int) -> None:
            nonlocal aggregate
            if depth > _RUNTIME_MAX_DEPTH:
                raise SafeIOError("runtime inventory exceeds its depth bound")
            before_identity, before_path, _ = _checked_runtime_directory(
                directory_handle)
            if before_path != directory_canonical:
                raise SafeIOError("runtime directory canonical path changed")
            before_names = _directory_items_from_handle(directory_handle)
            for name, directory_hint in before_names:
                relative = f"{parent_relative}/{name}" if parent_relative else name
                if len(entries) >= max_entries:
                    raise SafeIOError("runtime inventory exceeds its entry bound")
                child_path = str(Path(directory_path) / name)
                child_handle = _open_native(child_path, directory=directory_hint)
                try:
                    identity, canonical, standard = _handle_facts(
                        child_handle, expect_directory=directory_hint)
                    expected_prefix = directory_canonical.rstrip("\\") + "\\"
                    if not canonical.casefold().startswith(expected_prefix.casefold()):
                        raise SafeIOError("runtime entry escaped its retained parent")
                    if (int(standard.NumberOfLinks) != 1
                            or bool(standard.DeletePending)):
                        raise SafeIOError("runtime entry link/delete state is unsafe")
                    if directory_hint:
                        _assert_directory_has_no_streams(child_handle)
                        entries.append(RuntimeEntry(
                            relative, "directory", identity, None, None))
                        visit(child_handle, child_path, canonical, relative, depth + 1)
                    else:
                        _assert_single_unnamed_stream(child_handle)
                        length = int(standard.EndOfFile)
                        if length < 0 or length > max_file_bytes:
                            raise SafeIOError(
                                "runtime file exceeds its per-file bound")
                        data = _read_handle(child_handle, length)
                        after, after_path, after_standard = _handle_facts(
                            child_handle, expect_directory=False)
                        if (after != identity or after_path != canonical
                                or int(after_standard.EndOfFile) != length
                                or int(after_standard.NumberOfLinks) != 1
                                or bool(after_standard.DeletePending)):
                            raise SafeIOError("runtime file changed during inventory")
                        _assert_single_unnamed_stream(child_handle)
                        aggregate += length
                        if aggregate > max_total_bytes:
                            raise SafeIOError(
                                "runtime inventory exceeds its aggregate-byte bound")
                        entries.append(RuntimeEntry(
                            relative, "file", identity, length,
                            hashlib.sha256(data).hexdigest()))
                finally:
                    _close_handle(child_handle)
            after_identity, after_path, _ = _checked_runtime_directory(
                directory_handle)
            after_names = _directory_items_from_handle(directory_handle)
            if (after_identity != before_identity or after_path != before_path
                    or after_names != before_names):
                raise SafeIOError("runtime directory changed during inventory")

        visit(handles[-1], directory, root_canonical, "", 0)
        ordered = tuple(sorted(
            entries, key=lambda entry: (entry.relative_path.casefold(),
                                        entry.relative_path)))
        return RuntimeInventory(root_identity, ordered)
    finally:
        for handle in reversed(handles):
            _close_handle(handle)


def inventory_runtime_tree (
        root: SafeRoot, relative_directory: os.PathLike[str] | str, *,
        allow_missing: bool = False, max_entries: int = SOURCE_COUNT_LIMIT,
        max_file_bytes: int = SOURCE_FILE_LIMIT,
        max_total_bytes: int = SOURCE_AGGREGATE_LIMIT,
        ) -> RuntimeInventory | None:
    """Return two-identical-pass recursive inventory under a retained root."""
    relative = _runtime_relative(relative_directory)
    _validate_runtime_bounds(max_entries, max_file_bytes, max_total_bytes)

    def observe () -> RuntimeInventory | None:
        try:
            return _inventory_runtime_tree_once(
                root, relative, max_entries=max_entries,
                max_file_bytes=max_file_bytes, max_total_bytes=max_total_bytes)
        except SafeIOError as exc:
            if allow_missing and exc.winerror in (2, 3):
                return None
            raise

    first = observe()
    second = observe()
    if first != second:
        raise SafeIOError("runtime inventory changed between observations")
    return first


def _runtime_parent_handles (root: SafeRoot, relative: str) -> tuple[str, list[int]]:
    parts = _runtime_relative_parts(relative)
    absolute, _ = root._absolute("/".join(parts))
    parent = root.path.joinpath(*parts[:-1]) if len(parts) > 1 else root.path
    handles = _open_directory_chain(str(parent))
    try:
        _, canonical, _ = _checked_runtime_directory(handles[-1])
        root_path = root.canonical_path.rstrip("\\")
        if (canonical.casefold() != root_path.casefold()
                and not canonical.casefold().startswith(
                    (root_path + "\\").casefold())):
            raise SafeIOError("runtime removal parent escaped its capability")
        return absolute, handles
    except Exception:
        for parent_handle in reversed(handles):
            _close_handle(parent_handle)
        raise


def _bound_private_handle (
        root: SafeRoot, handle: int, *, max_bytes: int,
        expected_identity: FileIdentity | None = None) -> BoundFile:
    _verify_private_dacl(handle)
    before, canonical, standard = _handle_facts(handle, expect_directory=False)
    length = int(standard.EndOfFile)
    if (int(standard.NumberOfLinks) != 1 or bool(standard.DeletePending)
            or length < 0 or length > max_bytes):
        raise SafeIOError("private file is unsafe or exceeds its acquisition bound")
    if expected_identity is not None and before != expected_identity:
        raise SafeIOError("private file identity does not match expectation")
    prefix = root.canonical_path.rstrip("\\") + "\\"
    if not canonical.casefold().startswith(prefix.casefold()):
        raise SafeIOError("private file escaped its retained root")
    _assert_single_unnamed_stream(handle)
    data = _read_handle(handle, length)
    after, after_path, after_standard = _handle_facts(
        handle, expect_directory=False)
    _verify_private_dacl(handle)
    if (after != before or after_path != canonical
            or int(after_standard.EndOfFile) != length
            or int(after_standard.NumberOfLinks) != 1
            or bool(after_standard.DeletePending)):
        raise SafeIOError("private file changed during retained-handle acquisition")
    _assert_single_unnamed_stream(handle)
    return BoundFile(before, data, canonical, hashlib.sha256(data).hexdigest())


class PrivateOwnedFile:
    """A newly created private leaf held open read-only until exact removal."""

    def __init__ (self, root: SafeRoot, relative: str, handle: int,
                  bound: BoundFile):
        self._root = root
        self.relative = relative
        self._handle = handle
        self.bound = bound
        self.identity = bound.identity
        self.data = bound.data
        self.canonical_path = bound.canonical_path
        self.sha256 = bound.sha256
        self._removed = False

    def __enter__ (self) -> "PrivateOwnedFile":
        if self._removed or not self._handle:
            raise SafeIOError("private owned file is closed")
        return self

    def __exit__ (self, _type, _value, _traceback) -> None:
        self.remove()

    def close (self) -> None:
        """Close the retained reader without deleting; primarily for recovery tests."""
        if self._handle:
            _close_handle(self._handle)
            self._handle = 0

    def remove (self) -> None:
        if self._removed:
            return
        self.close()
        remove_private_existing_file(self._root, self.relative, self.bound)
        self._removed = True


class PrivateCreationCleanup:
    """Exact retained cleanup authority for a failed private-file creation."""

    def __init__ (self, root: SafeRoot, relative: str, *, max_bytes: int,
                  writer: int = 0, complete: BoundFile | None = None):
        if not writer and complete is None:
            raise SafeIOError("private creation cleanup has no exact authority")
        self._root = root
        self.relative = relative
        self._max_bytes = max_bytes
        self._writer = writer
        self._complete = complete
        self._removed = False

    def remove (self) -> None:
        if self._removed:
            return
        if self._writer:
            # The original exclusive writer is the strongest possible identity
            # binding for a partial/invalid create.  Retain it on every failed
            # delete; do not rerun the failed content/DACL postcondition.
            _delete_handle(self._writer)
            _close_handle(self._writer)
            self._writer = 0
        elif self._complete is not None:
            remove_private_existing_file(
                self._root, self.relative, self._complete)
        # Exact same-handle/path deletion completed our ownership.  A new file
        # may legitimately take the fixed locator after close; never adopt it.
        self._complete = None
        self._removed = True


class PrivateCreationError(SafeIOError):
    """Private creation failed and exact cleanup remains caller-owned."""

    def __init__ (self, cleanup: PrivateCreationCleanup,
                  operation_error: BaseException):
        super().__init__(
            "private file creation failed and exact rollback did not complete")
        self.cleanup = cleanup
        self.operation_error = operation_error


def read_private_owned_file (
        root: SafeRoot, relative: os.PathLike[str] | str, *,
        max_bytes: int) -> BoundFile | None:
    """Read an exact protected owner/SYSTEM leaf, or return None for absence."""
    if type(max_bytes) is not int or not 0 <= max_bytes <= 1_073_741_824:
        raise SafeIOError("max_bytes must be a bounded nonnegative integer")
    normalized = _runtime_relative(relative)
    handle = 0
    parent_handles: list[int] = []
    try:
        absolute, parent_handles = _runtime_parent_handles(root, normalized)
        handle = _open_native(absolute, directory=False)
        return _bound_private_handle(root, handle, max_bytes=max_bytes)
    except SafeIOError as exc:
        if exc.winerror in (2, 3):
            return None
        raise
    finally:
        _close_handle(handle)
        for parent_handle in reversed(parent_handles):
            _close_handle(parent_handle)


def remove_private_existing_file (
        root: SafeRoot, relative: os.PathLike[str] | str,
        expected: BoundFile) -> None:
    """Delete one previously read private leaf after same-handle ACL/content proof."""
    if not isinstance(expected, BoundFile):
        raise SafeIOError("private removal expectation is invalid")
    normalized = _runtime_relative(relative)
    absolute, parent_handles = _runtime_parent_handles(root, normalized)
    handle = 0
    try:
        handle = _open_native(absolute, directory=False, delete=True)
        current = _bound_private_handle(
            root, handle, max_bytes=len(expected.data),
            expected_identity=expected.identity)
        if (current.canonical_path != expected.canonical_path
                or current.data != expected.data
                or current.sha256 != expected.sha256):
            raise SafeIOError("private file content changed after observation")
        _delete_handle(handle)
    finally:
        _close_handle(handle)
        for parent_handle in reversed(parent_handles):
            _close_handle(parent_handle)


def create_private_owned_file (
        root: SafeRoot, relative: os.PathLike[str] | str, data: bytes, *,
        max_bytes: int) -> PrivateOwnedFile:
    """CREATE_NEW a protected file, then retain a read-compatible owner handle."""
    if (not isinstance(data, bytes) or type(max_bytes) is not int
            or not 0 <= max_bytes <= 1_073_741_824 or len(data) > max_bytes):
        raise SafeIOError("private file data must be bounded immutable bytes")
    normalized = _runtime_relative(relative)
    parts = _relative_parts(normalized)
    if len(parts) > 1:
        root.ensure_directory("/".join(parts[:-1]))
    absolute, parent_handles = _runtime_parent_handles(root, normalized)
    writer = 0
    reader = 0
    created = False
    complete: BoundFile | None = None
    try:
        writer = _create_private_native(absolute)
        created = True
        _verify_private_dacl(writer)
        before, canonical, standard = _handle_facts(writer, expect_directory=False)
        if (int(standard.NumberOfLinks) != 1 or int(standard.EndOfFile) != 0
                or bool(standard.DeletePending)):
            raise SafeIOError("new private file failed its pre-write checks")
        prefix = root.canonical_path.rstrip("\\") + "\\"
        if not canonical.casefold().startswith(prefix.casefold()):
            raise SafeIOError("new private file escaped its retained root")
        _assert_single_unnamed_stream(writer)
        _write_all(writer, data)
        after, after_path, after_standard = _handle_facts(
            writer, expect_directory=False)
        _verify_private_dacl(writer)
        if (after != before or after_path != canonical
                or int(after_standard.EndOfFile) != len(data)
                or int(after_standard.NumberOfLinks) != 1
                or bool(after_standard.DeletePending)):
            raise SafeIOError("private file failed its post-write checks")
        _assert_single_unnamed_stream(writer)
        complete = BoundFile(before, data, canonical, hashlib.sha256(data).hexdigest())
        _close_handle(writer)
        writer = 0
        reader = _open_native(absolute, directory=False)
        rebound = _bound_private_handle(
            root, reader, max_bytes=max_bytes, expected_identity=before)
        if rebound != complete:
            raise SafeIOError("private file changed before owner-reader retention")
        owned = PrivateOwnedFile(root, normalized, reader, rebound)
        reader = 0
        return owned
    except Exception as failure:
        _close_handle(reader)
        if writer:
            try:
                _delete_handle(writer)
            except Exception as exc:
                cleanup = PrivateCreationCleanup(
                    root, normalized, max_bytes=max_bytes, writer=writer)
                writer = 0
                raise PrivateCreationError(cleanup, failure) from exc
        elif created and complete is not None:
            try:
                remove_private_existing_file(root, normalized, complete)
            except Exception as exc:
                cleanup = PrivateCreationCleanup(
                    root, normalized, max_bytes=max_bytes, complete=complete)
                raise PrivateCreationError(cleanup, failure) from exc
        raise failure
    finally:
        _close_handle(writer)
        for parent_handle in reversed(parent_handles):
            _close_handle(parent_handle)


def _remove_exact_runtime_file (
        root: SafeRoot, relative: str, expected_identity: FileIdentity,
        expected_length: int, expected_sha256: str) -> None:
    """Delete only bytes revalidated under the same retained delete handle."""
    if (type(expected_length) is not int or expected_length < 0
            or re.fullmatch(r"[0-9a-f]{64}", expected_sha256) is None):
        raise SafeIOError("runtime file removal expectation is invalid")
    absolute, parent_handles = _runtime_parent_handles(root, relative)
    handle = 0
    try:
        handle = _open_native(absolute, directory=False, delete=True)
        current, canonical, standard = _handle_facts(
            handle, expect_directory=False)
        if (current != expected_identity
                or int(standard.EndOfFile) != expected_length
                or int(standard.NumberOfLinks) != 1
                or bool(standard.DeletePending)):
            raise SafeIOError("runtime file changed after observation")
        _assert_single_unnamed_stream(handle)
        data = _read_handle(handle, expected_length)
        after, after_path, after_standard = _handle_facts(
            handle, expect_directory=False)
        if (after != current or after_path != canonical
                or int(after_standard.EndOfFile) != expected_length
                or int(after_standard.NumberOfLinks) != 1
                or bool(after_standard.DeletePending)
                or hashlib.sha256(data).hexdigest() != expected_sha256):
            raise SafeIOError("runtime file content changed after observation")
        _assert_single_unnamed_stream(handle)
        _delete_handle(handle)
    finally:
        _close_handle(handle)
        for parent_handle in reversed(parent_handles):
            _close_handle(parent_handle)


def _remove_exact_runtime_directory (root: SafeRoot, relative: str,
                                     identity: FileIdentity) -> None:
    absolute, parent_handles = _runtime_parent_handles(root, relative)
    handle = 0
    try:
        handle = _open_native(absolute, directory=True, delete=True)
        current, _, _ = _checked_runtime_directory(handle)
        if current != identity:
            raise SafeIOError("runtime directory changed after observation")
        if _directory_items_from_handle(handle):
            raise SafeIOError("runtime directory is not empty at removal")
        _delete_handle(handle)
    finally:
        _close_handle(handle)
        for parent_handle in reversed(parent_handles):
            _close_handle(parent_handle)


def sweep_runtime_tree (
        root: SafeRoot, relative_directory: os.PathLike[str] | str,
        expected_files: Collection[str], *,
        max_entries: int = SOURCE_COUNT_LIMIT,
        max_file_bytes: int = SOURCE_FILE_LIMIT,
        max_total_bytes: int = SOURCE_AGGREGATE_LIMIT,
        ) -> tuple[str, ...]:
    """Remove only exact stale safe entries and prove the expected tree remains."""
    relative = _runtime_relative(relative_directory)
    _validate_runtime_bounds(max_entries, max_file_bytes, max_total_bytes)
    if isinstance(expected_files, (str, bytes)):
        raise SafeIOError("expected runtime files must be a collection of paths")
    try:
        expected = tuple(sorted(
            (_runtime_relative(value) for value in expected_files),
            key=lambda value: (value.casefold(), value)))
    except TypeError as exc:
        raise SafeIOError(
            "expected runtime files must be an iterable of paths"
        ) from exc
    if len(expected) != len(set(expected)):
        raise SafeIOError("expected runtime files contain a duplicate")
    folded_expected = [value.casefold() for value in expected]
    if len(folded_expected) != len(set(folded_expected)):
        raise SafeIOError("expected runtime files have a case-insensitive collision")
    expected_set = set(expected)
    expected_directories = {
        "/".join(parts[:index])
        for value in expected
        for parts in (_runtime_relative_parts(value),)
        for index in range(1, len(parts))
    }
    if expected_set & expected_directories:
        raise SafeIOError("expected runtime path is both a file and a directory")

    first = inventory_runtime_tree(
        root, relative, allow_missing=True, max_entries=max_entries,
        max_file_bytes=max_file_bytes, max_total_bytes=max_total_bytes)
    if first is None:
        if expected:
            raise SafeIOError("expected runtime tree is absent")
        return ()
    actual_by_fold = {
        entry.relative_path.casefold(): entry.relative_path
        for entry in first.entries
    }
    for value in (*expected, *expected_directories):
        actual = actual_by_fold.get(value.casefold())
        if actual is not None and actual != value:
            raise SafeIOError("runtime expected path has different preserved casing")

    actual_entries = {entry.relative_path: entry for entry in first.entries}
    if any(actual_entries.get(value) is None
           or actual_entries[value].kind != "file" for value in expected):
        raise SafeIOError("expected runtime file is absent or has the wrong type")
    if any(value in actual_entries
           and actual_entries[value].kind != "directory"
           for value in expected_directories):
        raise SafeIOError("expected runtime directory has the wrong type")

    removed: list[str] = []
    files = [entry for entry in first.entries if entry.kind == "file"]
    directories = [entry for entry in first.entries if entry.kind == "directory"]
    for entry in sorted(
            files, key=lambda item: (-item.relative_path.count("/"),
                                     item.relative_path.casefold(),
                                     item.relative_path)):
        if entry.relative_path not in expected_set:
            target = f"{relative}/{entry.relative_path}"
            assert entry.length is not None and entry.sha256 is not None
            _remove_exact_runtime_file(
                root, target, entry.identity, entry.length, entry.sha256)
            removed.append(entry.relative_path)
    for entry in sorted(
            directories, key=lambda item: (-item.relative_path.count("/"),
                                           item.relative_path.casefold(),
                                           item.relative_path)):
        if entry.relative_path not in expected_directories:
            target = f"{relative}/{entry.relative_path}"
            _remove_exact_runtime_directory(root, target, entry.identity)

    final = inventory_runtime_tree(
        root, relative, max_entries=max_entries,
        max_file_bytes=max_file_bytes, max_total_bytes=max_total_bytes)
    assert final is not None
    final_files = {
        entry.relative_path for entry in final.entries if entry.kind == "file"
    }
    final_directories = {
        entry.relative_path for entry in final.entries if entry.kind == "directory"
    }
    if final_files != expected_set or final_directories != expected_directories:
        raise SafeIOError("post-sweep runtime tree does not equal the expected set")
    return tuple(removed)


def remove_runtime_tree (
        root: SafeRoot, relative_directory: os.PathLike[str] | str, *,
        allow_missing: bool = False, max_entries: int = SOURCE_COUNT_LIMIT,
        max_file_bytes: int = SOURCE_FILE_LIMIT,
        max_total_bytes: int = SOURCE_AGGREGATE_LIMIT,
        ) -> tuple[str, ...]:
    """Delete one stable bounded runtime subtree, including its exact root."""
    relative = _runtime_relative(relative_directory)
    _validate_runtime_bounds(max_entries, max_file_bytes, max_total_bytes)
    observed = inventory_runtime_tree(
        root, relative, allow_missing=allow_missing, max_entries=max_entries,
        max_file_bytes=max_file_bytes, max_total_bytes=max_total_bytes)
    if observed is None:
        return ()
    removed: list[str] = []
    files = [entry for entry in observed.entries if entry.kind == "file"]
    directories = [entry for entry in observed.entries if entry.kind == "directory"]
    for entry in sorted(
            files, key=lambda item: (-item.relative_path.count("/"),
                                     item.relative_path.casefold(),
                                     item.relative_path)):
        assert entry.length is not None and entry.sha256 is not None
        _remove_exact_runtime_file(
            root, f"{relative}/{entry.relative_path}", entry.identity,
            entry.length, entry.sha256)
        removed.append(entry.relative_path)
    for entry in sorted(
            directories, key=lambda item: (-item.relative_path.count("/"),
                                           item.relative_path.casefold(),
                                           item.relative_path)):
        _remove_exact_runtime_directory(
            root, f"{relative}/{entry.relative_path}", entry.identity)
    _remove_exact_runtime_directory(root, relative, observed.root_identity)
    if inventory_runtime_tree(
            root, relative, allow_missing=True, max_entries=max_entries,
            max_file_bytes=max_file_bytes,
            max_total_bytes=max_total_bytes) is not None:
        raise SafeIOError("removed runtime tree name was replaced during cleanup")
    return tuple(removed)


# ---------------------------------------------------------------------------
# Chronicle loop/writer leases

LOOP_LOCK_NAME = ".chronicle_loop.lock"
WRITER_LOCK_NAME = ".chronicle_writer.lock"
LEASE_RECORD_LIMIT = 16_384
_LEASE_KINDS = MappingProxyType({
    "loop": LOOP_LOCK_NAME,
    "writer": WRITER_LOCK_NAME,
})


class LeaseBusy(SafeIOError):
    """A Chronicle lease name is already occupied."""


class LeaseResidue(SafeIOError):
    """A prior lease is accessible but cannot yet be safely reclaimed."""


if os.name == "nt":
    _kernel32.GetCurrentProcess.argtypes = []
    _kernel32.GetCurrentProcess.restype = wintypes.HANDLE
    _kernel32.GetCurrentProcessId.argtypes = []
    _kernel32.GetCurrentProcessId.restype = wintypes.DWORD
    _kernel32.GetProcessTimes.argtypes = [
        wintypes.HANDLE,
        ctypes.POINTER(wintypes.FILETIME),
        ctypes.POINTER(wintypes.FILETIME),
        ctypes.POINTER(wintypes.FILETIME),
        ctypes.POINTER(wintypes.FILETIME),
    ]
    _kernel32.GetProcessTimes.restype = wintypes.BOOL
    _kernel32.GetSystemTimeAsFileTime.argtypes = [ctypes.POINTER(wintypes.FILETIME)]
    _kernel32.GetSystemTimeAsFileTime.restype = None
    _kernel32.SetFileTime.argtypes = [
        wintypes.HANDLE,
        ctypes.POINTER(wintypes.FILETIME),
        ctypes.POINTER(wintypes.FILETIME),
        ctypes.POINTER(wintypes.FILETIME),
    ]
    _kernel32.SetFileTime.restype = wintypes.BOOL


def _filetime_integer (value) -> int:
    return (int(value.dwHighDateTime) << 32) | int(value.dwLowDateTime)


def _current_process_creation_filetime () -> int:
    _require_windows()
    created = wintypes.FILETIME()
    exited = wintypes.FILETIME()
    kernel = wintypes.FILETIME()
    user = wintypes.FILETIME()
    if not _kernel32.GetProcessTimes(
            _kernel32.GetCurrentProcess(), ctypes.byref(created),
            ctypes.byref(exited), ctypes.byref(kernel), ctypes.byref(user)):
        raise _native_error("GetProcessTimes")
    return _filetime_integer(created)


def current_process_stamp () -> ProcessStamp:
    """Return the exact PID/creation pair for the calling process."""
    _require_windows()
    return ProcessStamp(
        int(_kernel32.GetCurrentProcessId()),
        _current_process_creation_filetime(),
    )


def current_process_identity () -> ProcessIdentity:
    """Compatibility spelling for callers using the identity terminology."""
    return current_process_stamp()


def observe_process (expected: ProcessStamp) -> ProcessState:
    """Classify one PID/creation pair without treating access failure as death."""
    _require_windows()
    if not isinstance(expected, ProcessStamp):
        raise SafeIOError("expected process stamp is invalid")
    ctypes.set_last_error(0)
    handle = _kernel32.OpenProcess(
        _PROCESS_QUERY_LIMITED_INFORMATION | _SYNCHRONIZE,
        False,
        expected.pid,
    )
    if not handle:
        return (ProcessState.DEAD
                if ctypes.get_last_error() == _ERROR_INVALID_PARAMETER
                else ProcessState.AMBIGUOUS)
    try:
        created = wintypes.FILETIME()
        exited = wintypes.FILETIME()
        kernel = wintypes.FILETIME()
        user = wintypes.FILETIME()
        if not _kernel32.GetProcessTimes(
                handle, ctypes.byref(created), ctypes.byref(exited),
                ctypes.byref(kernel), ctypes.byref(user)):
            return ProcessState.AMBIGUOUS
        if _filetime_integer(created) != expected.creation_filetime:
            return ProcessState.DEAD
        waited = int(_kernel32.WaitForSingleObject(handle, 0))
        if waited == _WAIT_OBJECT_0:
            return ProcessState.DEAD
        if waited == _WAIT_TIMEOUT:
            return ProcessState.LIVE
        return ProcessState.AMBIGUOUS
    finally:
        _close_handle(int(handle))


@dataclass(frozen=True)
class LeaseOwner:
    kind: str
    name: str
    nonce: str
    pid: int
    process_creation_filetime: int
    executable_identity: FileIdentity
    executable_path: str
    cwd_identity: FileIdentity
    cwd_path: str
    acquired_time_ns: int

    @staticmethod
    def _identity (value: object) -> FileIdentity:
        if not isinstance(value, dict) or set(value) != {
                "volume_serial", "file_id", "canonical_path_digest"}:
            raise SafeIOError("Chronicle lease contains an invalid file identity")
        try:
            return FileIdentity(
                value["volume_serial"], value["file_id"],
                value["canonical_path_digest"],
            )
        except (TypeError, ValueError) as exc:
            raise SafeIOError("Chronicle lease contains an invalid file identity") from exc

    @classmethod
    def from_bytes (cls, data: bytes, *, kind: str, name: str) -> "LeaseOwner":
        """Parse only the canonical record emitted by ``canonical_bytes``."""
        if (not isinstance(data, bytes) or not data.endswith(b"\n")
                or data.count(b"\n") != 1 or len(data) > LEASE_RECORD_LIMIT):
            raise SafeIOError("Chronicle lease record framing is invalid")

        def pairs (items: Iterable[tuple[str, object]]) -> dict[str, object]:
            result: dict[str, object] = {}
            for key, value in items:
                if key in result:
                    raise SafeIOError("Chronicle lease record has a duplicate key")
                result[key] = value
            return result

        try:
            value = json.loads(
                data[:-1].decode("ascii", errors="strict"),
                object_pairs_hook=pairs,
                parse_constant=lambda _value: (_ for _ in ()).throw(
                    SafeIOError("Chronicle lease record has a non-finite number")),
            )
        except SafeIOError:
            raise
        except (UnicodeError, json.JSONDecodeError, RecursionError,
                ValueError, OverflowError) as exc:
            raise SafeIOError("Chronicle lease record is not strict JSON") from exc
        expected_keys = {
            "v", "type", "kind", "name", "nonce", "pid",
            "process_creation_filetime", "executable_identity",
            "executable_path", "cwd_identity", "cwd_path", "acquired_time_ns",
        }
        if (not isinstance(value, dict) or set(value) != expected_keys
                or value["v"] != 1 or type(value["v"]) is not int
                or value["type"] != "KATLAB_CHRONICLE_LEASE"
                or value["kind"] != kind or value["name"] != name
                or not isinstance(value["nonce"], str)
                or re.fullmatch(r"[0-9a-f]{32}", value["nonce"]) is None
                or not isinstance(value["executable_path"], str)
                or _VOLUME_PATH_RX.fullmatch(value["executable_path"]) is None
                or not isinstance(value["cwd_path"], str)
                or _VOLUME_PATH_RX.fullmatch(value["cwd_path"]) is None
                or type(value["acquired_time_ns"]) is not int
                or not 1 <= value["acquired_time_ns"] <= 0x7FFFFFFFFFFFFFFF):
            raise SafeIOError("Chronicle lease record schema is invalid")
        try:
            stamp = ProcessStamp(
                value["pid"], value["process_creation_filetime"])
            result = cls(
                kind=kind,
                name=name,
                nonce=value["nonce"],
                pid=stamp.pid,
                process_creation_filetime=stamp.creation_filetime,
                executable_identity=cls._identity(value["executable_identity"]),
                executable_path=value["executable_path"],
                cwd_identity=cls._identity(value["cwd_identity"]),
                cwd_path=value["cwd_path"],
                acquired_time_ns=value["acquired_time_ns"],
            )
        except (TypeError, ValueError) as exc:
            raise SafeIOError("Chronicle lease record schema is invalid") from exc
        if result.canonical_bytes() != data:
            raise SafeIOError("Chronicle lease record is not canonical")
        return result

    def canonical_bytes (self) -> bytes:
        value = {
            "v": 1,
            "type": "KATLAB_CHRONICLE_LEASE",
            "kind": self.kind,
            "name": self.name,
            "nonce": self.nonce,
            "pid": self.pid,
            "process_creation_filetime": self.process_creation_filetime,
            "executable_identity": self.executable_identity.as_dict(),
            "executable_path": self.executable_path,
            "cwd_identity": self.cwd_identity.as_dict(),
            "cwd_path": self.cwd_path,
            "acquired_time_ns": self.acquired_time_ns,
        }
        encoded = json.dumps(
            value, ensure_ascii=True, allow_nan=False,
            sort_keys=True, separators=(",", ":"),
        ).encode("ascii") + b"\n"
        if len(encoded) > LEASE_RECORD_LIMIT:
            raise SafeIOError("Chronicle lease owner record exceeds its bound")
        return encoded


class ChronicleLease:
    """One exclusive fresh-created Chronicle lease held by native handle."""

    def __init__ (self, root: SafeRoot, relative: str, handle: int,
                  identity: FileIdentity, owner: LeaseOwner):
        self._root = root
        self.relative = relative
        self._handle = handle
        self.identity = identity
        self.owner = owner
        self._released = False

    def __enter__ (self) -> "ChronicleLease":
        if self._released:
            raise SafeIOError("Chronicle lease is already released")
        return self

    def __exit__ (self, _type, _value, _traceback) -> None:
        self.release()

    def _validate_owned_handle (self) -> None:
        if self._released:
            raise SafeIOError("Chronicle lease is already released")
        current, _, standard = _handle_facts(self._handle, expect_directory=False)
        if (current != self.identity or int(standard.NumberOfLinks) != 1
                or int(standard.EndOfFile) != len(self.owner.canonical_bytes())):
            raise SafeIOError("Chronicle lease handle identity changed")
        _assert_single_unnamed_stream(self._handle)

    def heartbeat (self) -> None:
        self._validate_owned_handle()
        now = wintypes.FILETIME()
        _kernel32.GetSystemTimeAsFileTime(ctypes.byref(now))
        if not _kernel32.SetFileTime(
                self._handle, None, None, ctypes.byref(now)):
            raise _native_error("SetFileTime")
        self._validate_owned_handle()

    def release (self) -> None:
        if self._released:
            return
        record = self.owner.canonical_bytes()
        if self._handle:
            try:
                self._validate_owned_handle()
                _delete_handle(self._handle)
            except Exception as exc:
                # Close the exclusive handle, but keep the exact identity and
                # record so the owner can retry without misclassifying its own
                # still-live residue as a dead lease.
                _close_handle(self._handle)
                self._handle = 0
                raise LeaseResidue(
                    "Chronicle lease release failed; exact cleanup is retryable"
                ) from exc
            _close_handle(self._handle)
            self._handle = 0
        else:
            try:
                existing = read_existing_file(
                    self._root, self.relative, max_bytes=LEASE_RECORD_LIMIT)
                if existing is not None:
                    if (existing.identity != self.identity
                            or existing.data != record
                            or existing.sha256 != hashlib.sha256(record).hexdigest()):
                        raise SafeIOError(
                            "Chronicle lease changed before release retry")
                    _remove_exact_runtime_file(
                        self._root, self.relative, self.identity,
                        len(record), existing.sha256)
            except Exception as exc:
                raise LeaseResidue(
                    "Chronicle lease exact cleanup retry failed"
                ) from exc
        try:
            self._root.read(self.relative, max_bytes=LEASE_RECORD_LIMIT)
        except SafeIOError as exc:
            if exc.winerror in (2, 3):
                self._released = True
                return
            raise LeaseResidue(
                "Chronicle lease absence proof failed after release") from exc
        raise LeaseResidue("released Chronicle lease remains present")


def acquire_chronicle_lease (root: SafeRoot, kind: str) -> ChronicleLease:
    """Acquire a fresh lease, reclaiming only an exact proved-dead owner record."""
    try:
        name = _LEASE_KINDS[kind]
    except (KeyError, TypeError) as exc:
        raise SafeIOError("unknown Chronicle lease kind") from exc
    target, _ = root._absolute(name)
    handle = 0
    for attempt in range(2):
        try:
            handle = _open_native(
                target, directory=False, write=True, delete=True, create_new=True)
            break
        except SafeIOError as create_error:
            if create_error.winerror not in (32, 80, 183):
                raise
            try:
                residue = read_existing_file(
                    root, name, max_bytes=LEASE_RECORD_LIMIT)
            except SafeIOError as observe_error:
                if observe_error.winerror in (32, 33):
                    raise LeaseBusy(
                        f"Chronicle {kind} lease is held by an exclusive owner",
                        winerror=observe_error.winerror,
                    ) from create_error
                raise LeaseResidue(
                    f"Chronicle {kind} lease residue cannot be safely classified",
                    winerror=observe_error.winerror,
                ) from create_error
            if residue is None:
                if attempt == 0:
                    continue
                raise LeaseResidue(
                    f"Chronicle {kind} lease name changed during acquisition"
                ) from create_error
            try:
                prior = LeaseOwner.from_bytes(residue.data, kind=kind, name=name)
            except SafeIOError as parse_error:
                raise LeaseResidue(
                    f"Chronicle {kind} lease residue is not an owned record"
                ) from parse_error
            state = observe_process(ProcessStamp(
                prior.pid, prior.process_creation_filetime))
            if state is ProcessState.LIVE:
                raise LeaseBusy(
                    f"Chronicle {kind} lease belongs to a live owner"
                ) from create_error
            if state is ProcessState.AMBIGUOUS:
                raise LeaseResidue(
                    f"Chronicle {kind} lease owner state is ambiguous"
                ) from create_error
            if attempt:
                raise LeaseResidue(
                    f"Chronicle {kind} lease repeatedly collided during recovery"
                ) from create_error
            try:
                _remove_exact_runtime_file(
                    root, name, residue.identity, len(residue.data), residue.sha256)
            except SafeIOError as removal_error:
                raise LeaseResidue(
                    f"Chronicle {kind} dead-owner residue changed during recovery"
                ) from removal_error
    else:
        raise LeaseResidue(f"Chronicle {kind} lease acquisition did not converge")

    try:
        executable = read_bound_file(sys.executable, max_bytes=67_108_864)
        with bind_root(os.path.abspath(os.getcwd())) as cwd:
            owner = LeaseOwner(
                kind=kind,
                name=name,
                nonce=secrets.token_hex(16),
                pid=os.getpid(),
                process_creation_filetime=_current_process_creation_filetime(),
                executable_identity=executable.identity,
                executable_path=executable.canonical_path,
                cwd_identity=cwd.identity,
                cwd_path=cwd.canonical_path,
                acquired_time_ns=time.time_ns(),
            )
        record = owner.canonical_bytes()
        _write_all(handle, record)
        identity, _, standard = _handle_facts(handle, expect_directory=False)
        if (int(standard.EndOfFile) != len(record)
                or int(standard.NumberOfLinks) != 1):
            raise SafeIOError("Chronicle lease creation postcondition failed")
        _assert_single_unnamed_stream(handle)
        return ChronicleLease(root, name, handle, identity, owner)
    except Exception as failure:
        if handle:
            rollback_error = None
            for _attempt in range(2):
                try:
                    _delete_handle(handle)
                    rollback_error = None
                    break
                except Exception as exc:
                    rollback_error = exc
            _close_handle(handle)
            handle = 0
            if rollback_error is not None:
                raise LeaseResidue(
                    "Chronicle lease acquisition failed and rollback residue was preserved"
                ) from rollback_error
        raise failure


def remove_existing_file (root: SafeRoot, relative: os.PathLike[str] | str,
                          *, max_bytes: int = SOURCE_FILE_LIMIT) -> bool:
    """Remove one safely observed regular runtime leaf, or report true absence."""
    normalized = _runtime_relative(relative)
    existing = read_existing_file(root, normalized, max_bytes=max_bytes)
    if existing is None:
        return False
    _remove_exact_runtime_file(
        root, normalized, existing.identity, len(existing.data), existing.sha256)
    if read_existing_file(root, normalized, max_bytes=max_bytes) is not None:
        raise SafeIOError("removed runtime file remains present")
    return True


def main (argv: Sequence[str] | None = None) -> int:
    arguments = list(sys.argv[1:] if argv is None else argv)
    if len(arguments) != 1 or arguments[0] not in ASSETS:
        print("Usage: safe_io.py {fetch-mermaid|fetch-bootswatch}", file=sys.stderr)
        return 2
    try:
        require_expected_interpreter()
        installed = fetch_pinned_asset(arguments[0])
    except SafeIOError as exc:
        print(f"[ABORT] Chronicle asset fetch failed ({exc.__class__.__name__})",
              file=sys.stderr)
        return 1
    print(f"Installed verified Chronicle asset: {asset_spec(arguments[0]).name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
