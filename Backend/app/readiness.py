"""Single conservative verification and mission-readiness engine."""

from __future__ import annotations

import json
from datetime import datetime, timezone

from . import db
from .resolver import glob_to_regex


MISSION_STATES = (
    "not_configured", "planning", "implementation", "verification",
    "blocked", "ready_to_commit", "verified_committed",
)
REQUIREMENT_STATES = (
    "missing", "stale", "incomplete", "failed", "unknown", "finding",
    "partial", "passed",
)

REQUIREMENT_REASON = {
    "missing": "EVIDENCE_MISSING",
    "stale": "EVIDENCE_STALE",
    "incomplete": "EVIDENCE_INCOMPLETE",
    "failed": "EVIDENCE_FAILED",
    "unknown": "EVIDENCE_UNKNOWN",
    "finding": "REVIEW_FINDING",
    "partial": "REVIEW_PARTIAL",
    "passed": None,
}

REASON_TEXT = {
    "PLAN_PARSE_FATAL": "The current plan cannot be parsed.",
    "PLAN_PARSE_WARNING": "The current plan has parser warnings.",
    "REPO_OFFLINE": "The repository is offline.",
    "REPO_STATUS_UNKNOWN": "A current complete repository status is unavailable.",
    "MULTIPLE_TASKS_IN_PROGRESS": "More than one task is in progress.",
    "UNRESOLVED_CURRENT_WORK": "Current unassigned file activity needs resolution.",
    "UNCAPTURED_PLAN_DIRTY": "Plan-scoped dirty paths lack captured plan activity.",
    "INVALID_CHECK_DEFINITION": "A declared check has no valid definition for this repository.",
    "EVIDENCE_MISSING": "Required evidence has not been recorded.",
    "EVIDENCE_STALE": "Required evidence is older than the current work or revision.",
    "EVIDENCE_INCOMPLETE": "The newest check attempt is incomplete.",
    "EVIDENCE_FAILED": "The newest check result failed or was cancelled.",
    "EVIDENCE_UNKNOWN": "The newest check result could not prove an outcome.",
    "REVIEW_FINDING": "The newest review sequence contains a finding.",
    "REVIEW_PARTIAL": "The required consecutive clean review streak is incomplete.",
    "VERIFICATION_NOT_CONFIGURED": "The plan declares no verification requirements.",
    "TASKS_PENDING": "Plan tasks remain pending.",
    "IMPLEMENTATION_EVIDENCE_MISSING": "No current-task implementation activity is recorded.",
    "SWEPT_IMPLEMENTATION_EVIDENCE": "Swept activity cannot prove a direct implementation commit.",
    "NO_CURRENT_PLAN_DIFF": "No attributed uncommitted event matches a current dirty path.",
    "REPO_DIRTY_OTHER_WORK": "The repository also contains dirty work outside this plan's scope.",
}

PARSER_WARNING_TEXT = {
    "VERIFICATION_NESTED": "A nested verification block was ignored.",
    "VERIFICATION_STRAY_CLOSE": "A stray verification closing tag was ignored.",
    "VERIFICATION_MALFORMED_OPEN": "A malformed verification opening tag was ignored.",
    "VERIFICATION_UNCLOSED": "An unclosed verification block was ignored.",
    "VERIFICATION_MULTIPLE": "Only the first valid verification block was used.",
    "VERIFICATION_MALFORMED_LINE": "A malformed verification line was ignored.",
    "VERIFICATION_INVALID_ID": "An invalid verification ID was ignored.",
    "VERIFICATION_STREAK_NON_REVIEW": "A streak on a non-review check was ignored.",
    "VERIFICATION_STREAK_RANGE": "An out-of-range review streak was ignored.",
    "VERIFICATION_DUPLICATE_ID": "A duplicate verification ID was ignored.",
    "TASK_DUPLICATE_ID": "A duplicate task ID was ignored.",
    "TASK_MISSING_REQUIRED": "A task missing required fields was ignored.",
    "TASK_INVALID_STATUS": "A task with an invalid status was ignored.",
    "TASK_ABSOLUTE_PATTERN": "An absolute-looking task file pattern was ignored.",
    "PLAN_NOT_UTF8": "The current plan is not valid UTF-8.",
    "PLAN_UNREADABLE": "The current plan could not be read.",
}


def _now_z () -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _epoch (value: object) -> float | None:
    if not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
    except (ValueError, OverflowError, OSError):
        return None


def _reason (code: str, *, check_id: str | None = None,
             count: int | None = None) -> dict:
    return {
        "code": code,
        "message": REASON_TEXT[code],
        "check_id": check_id,
        "count": count,
    }


def _candidate_order (candidate: dict) -> tuple[float, int]:
    epoch = _epoch(candidate["ts"])
    return (float("-inf") if epoch is None else epoch, candidate["order_id"])


def _effective_candidates (check_id: str) -> list[dict]:
    candidates: list[dict] = []
    for row in db.get_manual_evidence(check_id):
        if row["kind"] not in {"check_finished", "review_result"}:
            continue
        candidates.append({
            "source": "manual",
            "complete": True,
            "outcome": row["outcome"],
            "ts": row["ts"],
            "order_id": row["id"],
            "evidence_id": row["id"],
            "check_revision": row["check_revision"],
            "binding": db.effective_activity_binding(row),
        })
    for attempt in db.canonical_check_attempts(check_id):
        start, finish = attempt["start"], attempt["finish"]
        evidence = finish or start
        if evidence is None:
            continue
        candidates.append({
            "source": "hook",
            "complete": start is not None and finish is not None,
            "outcome": finish["outcome"] if start is not None and finish is not None else None,
            "ts": evidence["ts"],
            "order_id": evidence["id"],
            "evidence_id": evidence["id"],
            "check_revision": attempt["key"][4],
            "binding": db.effective_activity_binding(evidence),
        })
    return candidates


def _freshness_floor (requirement, plan_events: list, review: bool) -> tuple[str, float | None]:
    floor_ts = requirement["revision_at"]
    floor_epoch = _epoch(floor_ts)
    implementation_sensitive = not review or requirement["check_id"] == "review:cft"
    if implementation_sensitive:
        for event in plan_events:
            event_epoch = _epoch(event["ts"])
            if event_epoch is not None and (floor_epoch is None or event_epoch > floor_epoch):
                floor_ts, floor_epoch = event["ts"], event_epoch
    return floor_ts, floor_epoch


def evaluate_requirement (requirement, snapshot, repo_id: str,
                          check_definitions, plan_events: list) -> dict:
    check_id = requirement["check_id"]
    review = check_id.startswith("review:")
    definitions = {item.id: item for item in check_definitions}
    definition = definitions.get(check_id)
    configuration_valid = review or (
        definition is not None and repo_id in definition.repo_ids
    )
    label = check_id if review or definition is None else definition.label
    target = int(requirement["streak_target"] or 1) if review else None
    floor_ts, floor_epoch = _freshness_floor(requirement, plan_events, review)
    expected_revision = None if review or definition is None else definition.revision
    allowed_sources = {"manual"} if review else (
        set(definition.evidence_sources) if definition is not None else set()
    )

    historical = []
    for candidate in _effective_candidates(check_id):
        binding = candidate["binding"]
        if (binding["plan_repo_id"] == repo_id
                and binding["plan_file"] == snapshot["plan_file"]):
            historical.append(candidate)

    fresh = []
    for candidate in historical:
        binding = candidate["binding"]
        candidate_epoch = _epoch(candidate["ts"])
        if (
            configuration_valid
            and candidate["source"] in allowed_sources
            and binding["requirement_revision"] == requirement["requirement_revision"]
            and binding["plan_revision"] == snapshot["content_sha256"]
            and candidate["check_revision"] == expected_revision
            and floor_epoch is not None and candidate_epoch is not None
            and candidate_epoch > floor_epoch
        ):
            fresh.append(candidate)
    historical.sort(key=_candidate_order)
    fresh.sort(key=_candidate_order)

    state = "missing" if not historical else "stale"
    current = 0 if review else None
    latest_outcome = historical[-1]["outcome"] if historical else None
    evidence_id = historical[-1]["evidence_id"] if historical else None
    observed_at = historical[-1]["ts"] if historical else None
    if fresh:
        newest = fresh[-1]
        evidence_id = newest["evidence_id"]
        observed_at = newest["ts"]
        latest_outcome = newest["outcome"]
        if review:
            if newest["outcome"] == "finding":
                state = "finding"
            else:
                for candidate in reversed(fresh):
                    if candidate["outcome"] != "clean":
                        break
                    current += 1
                state = "passed" if current >= target else "partial"
        elif not newest["complete"]:
            state = "incomplete"
        elif newest["outcome"] == "pass":
            state = "passed"
        elif newest["outcome"] in {"fail", "cancelled"}:
            state = "failed"
        else:
            state = "unknown"

    return {
        "check_id": check_id,
        "label": label,
        "state": state,
        "configuration_valid": configuration_valid,
        "evidence_sources": sorted(allowed_sources),
        "check_revision": expected_revision,
        "current": current,
        "target": target,
        "latest_outcome": latest_outcome,
        "evidence_id": evidence_id,
        "observed_at": observed_at,
        "freshness_floor": floor_ts,
        "reason_code": (
            "INVALID_CHECK_DEFINITION" if not configuration_valid
            else REQUIREMENT_REASON[state]
        ),
    }


def _task_scope (tasks: list) -> list:
    patterns = []
    for task in tasks:
        try:
            values = json.loads(task["files_json"])
        except (TypeError, json.JSONDecodeError):
            continue
        if isinstance(values, list):
            patterns.extend(
                glob_to_regex(value) for value in values
                if isinstance(value, str) and value
            )
    return patterns


def _public_status (status: dict | None, offline: bool) -> dict:
    value = status or {}
    return {
        "clean": bool(value.get("clean", False)),
        "count": int(value.get("count", 0)),
        "offline": bool(offline or value.get("offline", False)),
        "branch": value.get("branch") if isinstance(value.get("branch"), str) else None,
        "status_valid": bool(value.get("status_valid", False)),
        "observed_at": (
            value.get("observed_at")
            if isinstance(value.get("observed_at"), str) else None
        ),
    }


def evaluate_plan (repo, plan_file: str, repo_status: dict | None,
                   check_definitions) -> dict:
    snapshot = db.get_plan_snapshot(repo.id, plan_file)
    if snapshot is None:
        raise ValueError("unknown plan snapshot")
    tasks = [row for row in db.get_tasks(repo.id) if row["plan_file"] == plan_file]
    requirements = db.get_plan_requirements(repo.id, plan_file)
    plan_events = db.get_attributed_plan_events(repo.id, plan_file)
    status = _public_status(repo_status, repo.offline)

    task_counts = {
        "total": len(tasks),
        "pending": sum(row["status"] == "pending" for row in tasks),
        "in_progress": sum(row["status"] == "in-progress" for row in tasks),
        "done": sum(row["status"] == "done" for row in tasks),
    }
    active = [row for row in tasks if row["status"] == "in-progress"]
    current_task = (
        {"id": active[0]["task_id"], "title": active[0]["title"]}
        if len(active) == 1 else None
    )
    requirement_rows = [
        evaluate_requirement(row, snapshot, repo.id, check_definitions, plan_events)
        for row in requirements
    ]

    blockers: list[dict] = []
    warnings: list[dict] = []
    hard_blocked = False

    def block (code: str, *, check_id: str | None = None,
               count: int | None = None, hard: bool = True) -> None:
        nonlocal hard_blocked
        blockers.append(_reason(code, check_id=check_id, count=count))
        hard_blocked = hard_blocked or hard

    if snapshot["parse_state"] == "fatal":
        block("PLAN_PARSE_FATAL")
    elif snapshot["parse_state"] == "warning":
        block("PLAN_PARSE_WARNING")
    try:
        parser_codes = json.loads(snapshot["warning_codes_json"])
    except (TypeError, json.JSONDecodeError):
        parser_codes = []
    if isinstance(parser_codes, list):
        for raw_code in parser_codes[:50]:
            code = raw_code if raw_code in PARSER_WARNING_TEXT else "PLAN_PARSE_WARNING"
            warnings.append({
                "code": code,
                "message": PARSER_WARNING_TEXT.get(
                    code, "The plan parser reported a current warning.",
                ),
                "check_id": None,
                "count": None,
            })

    if status["offline"]:
        block("REPO_OFFLINE")
    elif not status["status_valid"] or not bool((repo_status or {}).get("paths_complete")):
        block("REPO_STATUS_UNKNOWN")
    if task_counts["in_progress"] > 1:
        block("MULTIPLE_TASKS_IN_PROGRESS", count=task_counts["in_progress"])

    unresolved = db.get_unresolved_uncommitted_count(repo.id)
    if unresolved:
        block("UNRESOLVED_CURRENT_WORK", count=unresolved)

    dirty_paths = {
        path for path in (repo_status or {}).get("dirty_paths", [])
        if isinstance(path, str)
    } if status["status_valid"] and (repo_status or {}).get("paths_complete") else set()
    scope = _task_scope(tasks)
    scoped_dirty = {
        path for path in dirty_paths if any(pattern.match(path) for pattern in scope)
    }
    uncommitted_paths = {
        row["file"] for row in plan_events if row["commit_hash"] is None
    }
    uncaptured = scoped_dirty - uncommitted_paths
    if uncaptured:
        block("UNCAPTURED_PLAN_DIRTY", count=len(uncaptured))
    unrelated = dirty_paths - scoped_dirty
    if unrelated:
        warnings.append(_reason("REPO_DIRTY_OTHER_WORK", count=len(unrelated)))

    for requirement in requirement_rows:
        if not requirement["configuration_valid"]:
            block("INVALID_CHECK_DEFINITION", check_id=requirement["check_id"])
            continue
        reason_code = requirement["reason_code"]
        if reason_code is not None:
            block(
                reason_code,
                check_id=requirement["check_id"],
                hard=requirement["state"] in {
                    "failed", "finding", "incomplete", "unknown",
                },
            )

    all_tasks_done = task_counts["done"] == task_counts["total"]
    all_requirements_passed = bool(requirement_rows) and all(
        row["state"] == "passed" for row in requirement_rows
    )
    current_plan_diff = bool(dirty_paths & uncommitted_paths)
    directly_committed = bool(plan_events) and all(
        row["commit_hash"] is not None and row["swept"] == 0
        for row in plan_events
    )

    if all_tasks_done and all_requirements_passed:
        if not plan_events:
            block("IMPLEMENTATION_EVIDENCE_MISSING")
        elif any(row["swept"] for row in plan_events):
            block("SWEPT_IMPLEMENTATION_EVIDENCE")
        elif not directly_committed and not current_plan_diff and status["status_valid"]:
            block("NO_CURRENT_PLAN_DIFF")

    if hard_blocked:
        state = "blocked"
    elif not requirement_rows:
        state = "not_configured"
        block("VERIFICATION_NOT_CONFIGURED", hard=False)
    elif not all_tasks_done and task_counts["in_progress"] == 0:
        state = "planning"
        block("TASKS_PENDING", count=task_counts["pending"], hard=False)
    elif task_counts["in_progress"] == 1:
        state = "implementation"
    elif not all_requirements_passed:
        state = "verification"
    elif directly_committed:
        state = "verified_committed"
    elif current_plan_diff:
        state = "ready_to_commit"
    else:
        state = "blocked"

    return {
        "repo": repo.id,
        "plan_file": plan_file,
        "label": f"{repo.name} — {plan_file.rsplit('/', 1)[-1]}",
        "revision": snapshot["content_sha256"],
        "revision_at": snapshot["revision_at"],
        "parse_state": snapshot["parse_state"],
        "task_counts": task_counts,
        "current_task": current_task,
        "state": state,
        "repo_status": status,
        "requirements": requirement_rows,
        "blockers": blockers,
        "warnings": warnings,
        "unresolved_count": unresolved,
    }


def evaluate_all (config, statuses: dict[str, dict],
                  generated_at: str | None = None,
                  repo_ids: set[str] | None = None) -> dict:
    repos = {repo.id: repo for repo in config.repos}
    plans = [
        evaluate_plan(repos[row["repo_id"]], row["plan_file"],
                      statuses.get(row["repo_id"]), config.checks)
        for row in db.get_plan_snapshots()
        if (row["repo_id"] in repos
            and (repo_ids is None or row["repo_id"] in repo_ids))
    ]
    counts = {state: 0 for state in MISSION_STATES}
    for plan in plans:
        counts[plan["state"]] += 1
    return {
        "generated_at": generated_at or _now_z(),
        "summary": {"total": len(plans), "states": counts},
        "plans": plans,
    }
