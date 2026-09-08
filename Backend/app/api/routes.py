"""REST routes (PLAN v0.1.0.0 G.1). UM message standard: every response is
{success, data, message, timestamp} with ISO-8601 UTC-Z timestamps."""

import json
import re
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict

from .. import db, git_module, provider_health
from ..version import __version__

router = APIRouter(prefix="/api")

# v0.2.3.0 A.1: stamped once at import time == server start (uvicorn
# imports this module inside the single serving process).
STARTED_TS = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

# The hook line the Installation_Guideline registers (user-scope).
_HOOK_MARKER = "katlab_tracking_hook.py"
PROVIDERS = {"claude", "codex", "manual"}
FILE_PROVIDERS = {"claude", "codex"}
ACTIVITY_KINDS = {
    "session_start", "session_end", "turn_stop", "turn_interrupt",
    "agent_start", "agent_stop", "tool_finished", "check_started",
    "check_finished", "review_result",
}
EVENT_MODES = {"B", "A_SCOPED", "A_GLOBAL", "AMBIGUOUS", "UNKNOWN", "MANUAL"}
CHECK_ID_PATTERN = re.compile(r"^[a-z][a-z0-9-]*(?::[a-z][a-z0-9-]*)?$")


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


def _known_repo (tracker, repo_id: str):
    match = next((repo for repo in tracker.config.repos if repo.id == repo_id), None)
    if match is None:
        raise HTTPException(404, "unknown repository")
    return match


def _page_bounds (limit: int, offset: int, order: str) -> tuple[int, int, str]:
    if offset < 0:
        raise HTTPException(400, "offset must be non-negative")
    if order not in {"asc", "desc"}:
        raise HTTPException(400, "order must be asc or desc")
    return min(max(1, limit), 2000), offset, order


def _assignment (value: dict, task_ref: str | None = None) -> dict:
    return {
        "mode": value["assignment_mode"],
        "repo": value["plan_repo_id"],
        "plan_file": value["plan_file"],
        "task_ref": task_ref,
        "requirement_revision": value["requirement_revision"],
        "plan_revision": value["plan_revision"],
    }


def _activity_item (row, effective: dict, configured_repo_ids: set[str]) -> dict:
    repo_ids = [
        link["repo_id"] for link in db.get_activity_links(row["id"])
        if link["repo_id"] in configured_repo_ids
    ]
    original = {key: row[key] for key in (
        "assignment_mode", "plan_repo_id", "plan_file",
        "requirement_revision", "plan_revision",
    )}
    effective_task = row["task_ref"] if (
        effective["plan_repo_id"] == row["plan_repo_id"]
        and effective["plan_file"] == row["plan_file"]
    ) else None
    return {
        "id": row["id"], "evidence_id": db.canonical_evidence_id(row),
        "uid": row["uid"],
        "schema_version": row["schema_version"],
        "provider": row["provider"], "evidence_source": row["evidence_source"],
        "kind": row["kind"], "ts": row["ts"],
        "delivery_class": row["delivery_class"],
        "session_id": row["session_id"], "turn_id": row["turn_id"],
        "agent_id": row["agent_id"], "parent_agent_id": row["parent_agent_id"],
        "agent_type": row["agent_type"], "model": row["model"],
        "permission_mode": row["permission_mode"],
        "tool_use_id": row["tool_use_id"], "tool_name": row["tool_name"],
        "tool_class": row["tool_class"], "outcome": row["outcome"],
        "duration_ms": row["duration_ms"], "check_id": row["check_id"],
        "check_revision": row["check_revision"], "repo_ids": repo_ids,
        "assignment_repo_ids": db.canonical_evidence_repo_ids(
            row, configured_repo_ids,
        ),
        "original_assignment": _assignment(original, row["task_ref"]),
        "effective_assignment": _assignment(effective, effective_task),
        "created_at": row["created_at"],
    }


@router.get("/repos")
def list_repos (request: Request):
    tracker = _tracker(request)
    for repo in tracker.config.repos:
        if not repo.offline:
            tracker._refresh_status(repo)  # F22: on-demand refresh
    mission = tracker.mission_snapshot()
    parser_warnings: dict[str, list[dict]] = {}
    for plan in mission["plans"]:
        for warning in plan["warnings"]:
            parser_warnings.setdefault(plan["repo"], []).append({
                "ts": plan["revision_at"],
                "message": f"{plan['plan_file']}: {warning['message']}",
                "code": warning["code"],
                "source": "plan",
            })
    data = [
        {
            "id": repo.id,
            "name": repo.name,
            "path": str(repo.path),
            **tracker.status[repo.id],
            "warnings": (
                list(tracker.warnings.get(repo.id, []))
                + parser_warnings.get(repo.id, [])
            )[-200:],
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
        "activity": tracker.activity.health_counts(),
        "providers": provider_health.provider_health(),
    })


@router.get("/mission")
def mission (request: Request, repo: str | None = None):
    tracker = _tracker(request)
    targets = tracker.config.repos
    if repo is not None:
        targets = [_known_repo(tracker, repo)]
    for item in targets:
        if not item.offline:
            tracker._refresh_status(item)
    return envelope(tracker.mission_snapshot(repo))


@router.get("/activity")
def activity (request: Request, repo: str | None = None,
              provider: str | None = None, session: str | None = None,
              kind: str | None = None, check: str | None = None,
              plan: str | None = None, order: str = "desc",
              limit: int = 50, offset: int = 0):
    tracker = _tracker(request)
    limit, offset, order = _page_bounds(limit, offset, order)
    if repo is not None:
        _known_repo(tracker, repo)
    if provider is not None and provider not in PROVIDERS:
        raise HTTPException(400, "invalid provider")
    if session is not None and provider is None:
        raise HTTPException(400, "provider is required with session")
    if kind is not None and kind not in ACTIVITY_KINDS:
        raise HTTPException(400, "invalid activity kind")
    if check is not None and not CHECK_ID_PATTERN.fullmatch(check):
        raise HTTPException(400, "invalid check ID")
    if plan is not None:
        if repo is None:
            raise HTTPException(400, "repository is required with plan")
        if db.get_plan_snapshot(repo, plan) is None:
            raise HTTPException(404, "unknown plan")
        if check is not None and db.get_plan_requirement_binding(repo, plan, check) is None:
            raise HTTPException(400, "plan does not declare a usable check")
    rows, total = db.get_activity_page(
        repo_id=repo, provider=provider, session_id=session, kind=kind,
        check_id=check, plan_file=plan, order=order, limit=limit, offset=offset,
    )
    repo_ids = {item.id for item in tracker.config.repos}
    return envelope({
        "items": [_activity_item(row, effective, repo_ids)
                  for row, effective in rows],
        "total": total, "limit": limit, "offset": offset, "order": order,
    })


@router.get("/sessions")
def sessions (request: Request, repo: str | None = None,
              provider: str | None = None, session: str | None = None,
              order: str = "desc", limit: int = 50, offset: int = 0):
    tracker = _tracker(request)
    limit, offset, order = _page_bounds(limit, offset, order)
    if repo is not None:
        _known_repo(tracker, repo)
    if provider is not None and provider not in PROVIDERS:
        raise HTTPException(400, "invalid provider")
    if session is not None and provider is None:
        raise HTTPException(400, "provider is required with session")
    configured = {item.id for item in tracker.config.repos}
    items, total = db.get_session_page(
        current_repo_ids=configured, repo_id=repo, provider=provider,
        session_id=session, order=order, limit=limit, offset=offset,
    )
    return envelope({
        "items": items, "total": total, "limit": limit,
        "offset": offset, "order": order,
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
                 since: str | None = None, until: str | None = None,
                 provider: str | None = None):
    if offset < 0:
        raise HTTPException(400, "offset must be non-negative")
    if mode is not None and mode not in EVENT_MODES:
        raise HTTPException(400, "invalid event mode")
    if provider is not None and provider not in FILE_PROVIDERS:
        raise HTTPException(400, "invalid provider")
    limit = min(max(1, limit), 2000)  # F38 pagination bounds
    rows = db.get_events(repo, mode, uncommitted, limit, offset, session, file,
                         since, until, provider)
    data = []
    for row in rows:
        item = dict(row)
        # Legacy file rows predate the provider column and are Claude.
        item["provider"] = item.get("provider") or "claude"
        data.append(item)
    return envelope(data)


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
    if match.demo_status is not None:
        return envelope({
            "file": file,
            "diff": "(synthetic demo status — repository diff is intentionally disabled)",
        })
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
    try:
        db.set_manual_task(event_id, body.task_ref)  # mode=MANUAL, final
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    updated = db.get_event(event_id)
    tracker = _tracker(request)
    await tracker._push("event_resolved", dict(updated))
    await tracker._push_readiness_update({row["repo_id"]})
    return envelope(dict(updated), message="manual pick saved")


class EvidenceAssignment(BaseModel):
    model_config = ConfigDict(extra="forbid")

    repo: str
    plan_file: str | None


@router.patch("/activity/{activity_id}/plan")
async def assign_evidence (activity_id: int, body: EvidenceAssignment,
                           request: Request):
    tracker = _tracker(request)
    _known_repo(tracker, body.repo)
    row = db.get_activity_event(activity_id)
    if row is None:
        raise HTTPException(404, "unknown activity id")
    previous = db.effective_activity_binding(row)
    try:
        assignment_id = db.append_activity_assignment(
            activity_id, body.repo, body.plan_file,
            "assign" if body.plan_file is not None else "clear",
            tracker.config.checks, _now_z(),
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    # The append transaction commits before either invalidation is emitted.
    effective = db.effective_activity_binding(row)
    evidence_id = db.canonical_evidence_id(row)
    affected_repo_ids = {body.repo}
    for binding in (previous, effective):
        bound_repo = binding.get("plan_repo_id")
        if isinstance(bound_repo, str):
            affected_repo_ids.add(bound_repo)
    await tracker._push("evidence_updated", {
        "repo_ids": sorted(affected_repo_ids),
        "activity_id": evidence_id,
        "assignment_id": assignment_id,
    })
    await tracker._push_readiness_update(affected_repo_ids)
    return envelope({
        "activity_id": evidence_id,
        "assignment_id": assignment_id,
        "effective_assignment": _assignment(effective),
    }, message="evidence assignment saved")
