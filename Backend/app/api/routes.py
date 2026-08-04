"""REST routes (PLAN v0.1.0.0 G.1). UM message standard: every response is
{success, data, message, timestamp} with ISO-8601 UTC-Z timestamps."""

import json
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from .. import db, git_module
from ..version import __version__

router = APIRouter(prefix="/api")

# v0.2.3.0 A.1: stamped once at import time == server start (uvicorn
# imports this module inside the single serving process).
STARTED_TS = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

# The hook line the Installation_Guideline registers (user-scope).
_HOOK_MARKER = "katlab_tracking_hook.py"


def _now_z () -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def envelope (data, success: bool = True, message: str = "") -> dict:
    return {
        "success": success,
        "data": data,
        "message": message,
        "timestamp": _now_z(),
    }


def _tracker (request: Request):
    return request.app.state.tracker


@router.get("/repos")
def list_repos (request: Request):
    tracker = _tracker(request)
    for repo in tracker.config.repos:
        if not repo.offline:
            tracker._refresh_status(repo)  # F22: on-demand refresh
    data = [
        {
            "id": repo.id,
            "name": repo.name,
            "path": str(repo.path),
            **tracker.status[repo.id],
            "warnings": list(tracker.warnings.get(repo.id, [])),  # F47 snapshot
            "last_event_ts": db.get_last_event_ts(repo.id),      # D9 heartbeat
            "oldest_uncommitted_ts": db.get_oldest_uncommitted_ts(repo.id),  # v0.1.6.0 D4 (B.2)
            "activity_buckets": db.get_activity_buckets(repo.id, _now_z()),  # v0.1.3.0 D3/R8
        }
        for repo in tracker.config.repos
    ]
    return envelope(data)


@router.get("/health")
def health (request: Request):
    """v0.2.3.0 A.1: read-only self-audit — zero git calls, zero DB
    writes. The hook check is a TEXT presence scan, not schema
    validation (surfaced honestly in the UI as "line present")."""
    tracker = _tracker(request)
    try:
        db_bytes = db.DB_PATH.stat().st_size
    except OSError:
        db_bytes = None
    settings_path = Path.home() / ".claude" / "settings.json"
    try:
        hook_registered = _HOOK_MARKER in settings_path.read_text(encoding="utf-8")
    except OSError:
        hook_registered = False
    repos = []
    for repo in tracker.config.repos:
        try:
            st = repo.events_file.stat()
            jsonl_bytes: int | None = st.st_size
            jsonl_mtime: str | None = datetime.fromtimestamp(
                st.st_mtime, tz=timezone.utc).isoformat().replace("+00:00", "Z")
        except OSError:
            jsonl_bytes = None
            jsonl_mtime = None
        repos.append({
            "id": repo.id,
            "offline": repo.offline,
            "last_event_ts": db.get_last_event_ts(repo.id),  # the D9 heartbeat read
            "events_jsonl_bytes": jsonl_bytes,
            "events_jsonl_mtime": jsonl_mtime,  # ISO-Z — comparable with last_event_ts
            "warning_count": len(tracker.warnings.get(repo.id, [])),
        })
    return envelope({
        "server": {
            "version": __version__,
            "started_ts": STARTED_TS,
            "db_bytes": db_bytes,
            "watchers_alive": sum(1 for t in tracker._tasks if not t.done()),
            "watchers_total": len(tracker._tasks),
            "hook_registered": hook_registered,
            "hook_settings_path": str(settings_path),
        },
        "repos": repos,
    })


@router.get("/stats")
def stats (request: Request, repo: str | None = None):
    """v0.1.3.0 D5: Overview dashboard aggregates. repo absent -> ALL scope,
    scoped to the CONFIGURED repos only (R23), never every repo_id in the DB."""
    tracker = _tracker(request)
    if repo:
        repo_ids = [repo] if any(r.id == repo for r in tracker.config.repos) else []
    else:
        repo_ids = [r.id for r in tracker.config.repos]  # R23: configured only
    return envelope(db.get_stats(repo_ids, _now_z()))


@router.get("/tasks")
def list_tasks (request: Request, repo: str | None = None):
    rows = db.get_tasks(repo)
    activity = db.get_task_activity()  # v0.1.6.0 D4 (B.2): idle-nudge source
    return envelope([
        {
            "repo": r["repo_id"], "plan_file": r["plan_file"], "task_id": r["task_id"],
            "task_ref": f"{r['plan_file']} - {r['task_id']}",
            "title": r["title"], "status": r["status"],
            "files": json.loads(r["files_json"]),
            "why": r["why"] or r["title"],  # F53: why falls back to title
            "last_event_ts": activity.get((r["repo_id"], f"{r['plan_file']} - {r['task_id']}")),
        }
        for r in rows
    ])


@router.get("/events")
def list_events (request: Request, repo: str | None = None, mode: str | None = None,
                 uncommitted: bool = False, limit: int = 500, offset: int = 0,
                 session: str | None = None, file: str | None = None,
                 since: str | None = None, until: str | None = None):
    limit = min(max(1, limit), 2000)  # F38 pagination bounds
    rows = db.get_events(repo, mode, uncommitted, limit, offset, session, file,
                         since, until)
    return envelope([dict(r) for r in rows])


@router.get("/history")
def history (request: Request, repo: str, limit: int = 500, offset: int = 0):
    limit = min(max(1, limit), 2000)  # F38
    return envelope(db.get_history(repo, limit, offset))


@router.get("/diff")
def diff (request: Request, repo: str, file: str, commit: str | None = None):
    tracker = _tracker(request)
    match = next((r for r in tracker.config.repos if r.id == repo and not r.offline), None)
    if match is None:
        raise HTTPException(404, "unknown or offline repo")
    try:
        if commit:
            text = git_module.commit_file_diff(match.path, commit, file)
            if not text.strip():
                # P5: swept events attach to HEAD without being in the commit.
                text = ("(file not part of this commit — auto-linked events "
                        "land here when the repo went CLEAN)")
        else:
            text = git_module.file_diff(match.path, file)
            if not text.strip():
                state = git_module.file_state(match.path, file)  # D3 empty-diff classification
                text = {
                    "ignored": "gitignored file — git never sees it, no diff exists",
                    "untracked": "new untracked file — no diff vs HEAD yet",
                }.get(state, "(no changes vs HEAD)")
    except git_module.GitError as exc:
        return envelope(None, success=False, message=f"git diff failed: {exc}")  # F42
    return envelope({"file": file, "diff": text})


class ManualPick(BaseModel):
    task_ref: str


@router.patch("/events/{event_id}/task")
async def manual_pick (event_id: int, body: ManualPick, request: Request):
    row = db.get_event(event_id)
    if row is None:
        raise HTTPException(404, "unknown event id")
    db.set_manual_task(event_id, body.task_ref)  # mode=MANUAL, final
    updated = db.get_event(event_id)
    await _tracker(request)._push("event_resolved", dict(updated))
    return envelope(dict(updated), message="manual pick saved")
