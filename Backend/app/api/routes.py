"""REST routes (PLAN v0.1.0.0 G.1). UM message standard: every response is
{success, data, message, timestamp} with ISO-8601 UTC-Z timestamps."""

import json
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from .. import db, git_module

router = APIRouter(prefix="/api")


def envelope (data, success: bool = True, message: str = "") -> dict:
    return {
        "success": success,
        "data": data,
        "message": message,
        "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
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
        }
        for repo in tracker.config.repos
    ]
    return envelope(data)


@router.get("/tasks")
def list_tasks (request: Request, repo: str | None = None):
    rows = db.get_tasks(repo)
    return envelope([
        {
            "repo": r["repo_id"], "plan_file": r["plan_file"], "task_id": r["task_id"],
            "task_ref": f"{r['plan_file']} - {r['task_id']}",
            "title": r["title"], "status": r["status"],
            "files": json.loads(r["files_json"]),
            "why": r["why"] or r["title"],  # F53: why falls back to title
        }
        for r in rows
    ])


@router.get("/events")
def list_events (request: Request, repo: str | None = None, mode: str | None = None,
                 uncommitted: bool = False, limit: int = 500, offset: int = 0):
    limit = min(max(1, limit), 2000)  # F38 pagination bounds
    rows = db.get_events(repo, mode, uncommitted, limit, offset)
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
