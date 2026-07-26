"""Git module (PLAN v0.1.0.0 F.1) - STRICTLY READ-ONLY.

Allowed commands: status, diff, log, show, rev-parse (user-approved D5).
NO mutation command, ever.

Failure isolation (F41/F42): every call site tolerates transient git
failures (e.g. index.lock held while the user is mid-commit) - callers keep
the last known state and retry on the next cycle; nothing crashes, no
background task dies.
"""

import subprocess
from datetime import datetime, timezone
from pathlib import Path


class GitError(Exception):
    """Transient or permanent git failure - callers keep last known state."""


def _run (repo: Path, *args: str) -> str:
    try:
        proc = subprocess.run(
            ["git", "-C", str(repo), *args],
            capture_output=True, text=True, encoding="utf-8", errors="replace",
            timeout=15,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise GitError(str(exc))
    if proc.returncode != 0:
        raise GitError(proc.stderr.strip() or f"git {' '.join(args)} failed")
    return proc.stdout


def uncommitted_count (repo: Path) -> int:
    """`git status --porcelain` entry count; 0 -> CLEAN."""
    out = _run(repo, "status", "--porcelain")
    return sum(1 for line in out.splitlines() if line.strip())


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
    return _run(repo, "rev-parse", "HEAD").strip()


def current_branch (repo: Path) -> str:
    """v0.1.6.0 D2 (B.2): current branch via rev-parse --abbrev-ref HEAD
    (read-only, blessed above). Detached HEAD reports "HEAD" - fall back
    to the short hash so the UI still shows WHERE the repo sits."""
    name = _run(repo, "rev-parse", "--abbrev-ref", "HEAD").strip()
    if name == "HEAD":
        return head_hash(repo)[:8]
    return name


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


def new_commits_since (repo: Path, known_hashes: set[str], limit: int = 20) -> list[dict]:
    """Newest-first hashes from `git log`, filtered to unknown ones, oldest first."""
    out = _run(repo, "log", f"-{limit}", "--format=%H")
    hashes = [h.strip() for h in out.splitlines() if h.strip()]
    fresh = [h for h in hashes if h not in known_hashes]
    fresh.reverse()  # oldest first so linking happens in commit order
    return [commit_info(repo, h) for h in fresh]
