"""Git module - the repository-wide, strictly read-only subprocess boundary.

Only ``status``, ``diff``, ``log``, and ``show`` may reach the Git executable.
The allowlist is enforced immediately before every subprocess invocation.

Failure isolation (F41/F42): every call site tolerates transient git
failures (e.g. index.lock held while the user is mid-commit) - callers keep
the last known state and retry on the next cycle; nothing crashes, no
background task dies.
"""

import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ALLOWED_GIT_VERBS = frozenset({"status", "diff", "log", "show"})


class GitError(Exception):
    """Transient or permanent git failure - callers keep last known state."""


def _run (repo: Path, *args: str) -> str:
    if not args or args[0] not in ALLOWED_GIT_VERBS:
        verb = args[0] if args else "<missing>"
        raise GitError(f"Git verb {verb!r} is outside the read-only allowlist")
    try:
        proc = subprocess.run(
            ["git", "-C", str(repo), *args],
            capture_output=True, text=True, encoding="utf-8", errors="replace",
            timeout=15,
            # v0.2.6.0 R-BD: the server is windowless pythonw - an
            # unflagged console child FLASHES a conhost window on every
            # git poll (the "blinking windows" bug).
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise GitError(str(exc))
    if proc.returncode != 0:
        raise GitError(proc.stderr.strip() or f"git {' '.join(args)} failed")
    return proc.stdout


def _now_z () -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _status_path (record: str, fields_before_path: int) -> str:
    parts = record.split(" ", fields_before_path)
    if len(parts) != fields_before_path + 1 or not parts[-1]:
        raise GitError("Malformed porcelain-v2 status path record")
    return parts[-1].replace("\\", "/")


def parse_status_porcelain_v2 (out: str, observed_at: str | None = None) -> dict[str, Any]:
    """Parse one complete ``status --porcelain=v2 -z --branch`` snapshot.

    Rename/copy records contain a second NUL-delimited source path. Both source
    and destination are retained so readiness can conservatively intersect the
    complete dirty-path set with plan declarations and captured events.
    """
    records = out.split("\0")
    if records and records[-1] == "":
        records.pop()

    branch_head: str | None = None
    branch_oid: str | None = None
    dirty_paths: list[str] = []
    count = 0
    index = 0
    while index < len(records):
        record = records[index]
        index += 1
        if not record:
            continue
        if record.startswith("# branch.oid "):
            branch_oid = record[len("# branch.oid "):].strip()
            continue
        if record.startswith("# branch.head "):
            branch_head = record[len("# branch.head "):].strip()
            continue
        if record.startswith("# "):
            continue

        kind = record[0]
        if kind == "1":
            dirty_paths.append(_status_path(record, 8))
        elif kind == "2":
            dirty_paths.append(_status_path(record, 9))
            if index >= len(records) or not records[index]:
                raise GitError("Malformed porcelain-v2 rename/copy record")
            dirty_paths.append(records[index].replace("\\", "/"))
            index += 1
        elif kind == "u":
            dirty_paths.append(_status_path(record, 10))
        elif kind in {"?", "!"}:
            if len(record) < 3 or record[1] != " ":
                raise GitError("Malformed porcelain-v2 untracked/ignored record")
            dirty_paths.append(record[2:].replace("\\", "/"))
        else:
            raise GitError(f"Unknown porcelain-v2 status record {kind!r}")
        count += 1

    if branch_head in {None, "(unknown)"}:
        branch = None
    elif branch_head == "(detached)":
        branch = branch_oid[:8] if branch_oid and branch_oid != "(initial)" else None
    else:
        branch = branch_head

    # Preserve record order while removing the duplicate path a tool may report
    # for unusual copy/rename combinations.
    paths = list(dict.fromkeys(dirty_paths))
    return {
        "clean": count == 0,
        "count": count,
        "branch": branch,
        "dirty_paths": paths,
        "paths_complete": True,
        "status_valid": True,
        "observed_at": observed_at or _now_z(),
    }


def repo_status (repo: Path) -> dict[str, Any]:
    """Return a complete, machine-readable working-tree snapshot."""
    out = _run(
        repo, "status", "--porcelain=v2", "-z", "--branch",
        "--untracked-files=all",
    )
    return parse_status_porcelain_v2(out)


def uncommitted_count (repo: Path) -> int:
    """Compatibility wrapper over the complete status snapshot."""
    return int(repo_status(repo)["count"])


def file_diff (repo: Path, file_path: str) -> str:
    """F21: diff vs HEAD so STAGED changes stay visible after `git add`."""
    return _run(repo, "diff", "HEAD", "--", file_path)


def commit_file_diff (repo: Path, commit_hash: str, file_path: str) -> str:
    """v0.1.2.0 D3: ONE commit's change for ONE file. Empty --format
    suppresses the commit header (P7) so the output is a pure diff like the
    HEAD path. Empty output = file not part of that commit (swept events)."""
    return _run(repo, "show", "--format=", commit_hash, "--", file_path)


def file_state (repo: Path, file_path: str) -> str:
    """v0.1.2.0 D3: 'ignored' | 'untracked' | 'tracked' for empty-diff
    classification. PREFIX match only (P1): a file inside an ignored dir
    reports the DIR ("!! temp/"), never the file path itself."""
    out = _run(repo, "status", "--porcelain", "--ignored", "--", file_path)
    for line in out.splitlines():
        if line.startswith("!!"):
            return "ignored"
        if line.startswith("??"):
            return "untracked"
    return "tracked"


def head_hash (repo: Path) -> str:
    return _run(repo, "show", "-s", "--format=%H", "HEAD").strip()


def current_branch (repo: Path) -> str:
    """Compatibility wrapper over porcelain-v2 branch metadata."""
    branch = repo_status(repo)["branch"]
    if not branch:
        raise GitError("Current branch is unavailable")
    return str(branch)


def _to_utc_z (iso_with_offset: str) -> str:
    dt = datetime.fromisoformat(iso_with_offset.strip())
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def commit_info (repo: Path, ref: str = "HEAD") -> dict:
    """F36: the ONE commit-reading path (hash, parents, message, ts, files)
    via `git show`. v0.1.9.0 A.1: %P rides the SAME call - the raw value is
    space-separated full parent hashes; "" for a root commit (known-empty,
    distinct from the pre-upgrade NULL rows)."""
    out = _run(
        repo, "show", "--name-only", "--no-renames",
        "--format=%H%n%P%n%cI%n%s", ref,
    )
    lines = out.splitlines()
    commit_hash = lines[0]
    parents = lines[1] if len(lines) > 1 else ""
    committer_iso = lines[2]
    message = lines[3] if len(lines) > 3 else ""
    files = [ln.strip().replace("\\", "/") for ln in lines[4:] if ln.strip()]
    return {
        "hash": commit_hash,
        "parents": parents,
        "ts": _to_utc_z(committer_iso),
        "message": message,
        "files": files,
    }


def _commit_hash_pages (repo: Path, revision: str,
                        page_size: int):
    """Yield one stable revision's history in bounded topological pages."""
    offset = 0
    while True:
        out = _run(
            repo, "log", "--topo-order", f"--max-count={page_size}",
            f"--skip={offset}", "--format=%H", revision,
        )
        page = [value.strip() for value in out.splitlines() if value.strip()]
        yield page
        if len(page) < page_size:
            return
        offset += len(page)


def new_commits_since (repo: Path, known_hashes: set[str], limit: int = 20,
                       head: str | None = None) -> list[dict]:
    """Walk a stable HEAD through a known boundary, then return oldest first.

    An empty database deliberately seeds only one recent page. Once a persisted
    boundary exists, its exact ``boundary..HEAD`` range is re-read so a merged
    sibling listed after the boundary in topological output cannot be omitted.
    """
    page_size = min(max(1, limit), 2_000)
    head_ref = head or head_hash(repo)
    fresh: list[str] = []
    boundary: str | None = None
    for page in _commit_hash_pages(repo, head_ref, page_size):
        for commit_hash in page:
            if commit_hash in known_hashes:
                boundary = commit_hash
                break
            fresh.append(commit_hash)
        if not known_hashes or boundary is not None:
            break

    if boundary is not None:
        fresh = []
        revision = f"{boundary}..{head_ref}"
        for page in _commit_hash_pages(repo, revision, page_size):
            fresh.extend(
                commit_hash for commit_hash in page
                if commit_hash not in known_hashes
            )

    # Defensive de-duplication also protects a scan from unusual replacement refs.
    fresh = list(dict.fromkeys(fresh))
    fresh.reverse()  # oldest first so linking happens in commit order
    return [commit_info(repo, h) for h in fresh]
