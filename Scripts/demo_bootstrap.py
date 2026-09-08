"""Build the isolated v0.3 Mission/flight-recorder demo under Demo/runtime.

The generated repositories use empty ``.git`` marker directories, never real Git
repositories. Their status is accepted only behind the backend's three-part demo
gate: KATLAB_TRACKER_DEMO=1, ``demo: true``, and an explicit ``static_status``.
"""

from __future__ import annotations

import json
import shutil
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
RUNTIME = REPO_ROOT / "Demo" / "runtime"
PLAN_REL = "temp/Plan/PLAN_v0.3.0.0_Demo.txt"
CHECK_ID = "demo-check"

if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

STATE_SPECS = (
    {
        "id": "Demo_NotConfigured", "slug": "not-configured",
        "state": "not_configured", "task_status": "pending",
        "requirements": (), "file": None, "dirty": (),
    },
    {
        "id": "Demo_Planning", "slug": "planning",
        "state": "planning", "task_status": "pending",
        "requirements": (CHECK_ID,), "file": None, "dirty": (),
    },
    {
        "id": "Demo_Implementation", "slug": "implementation",
        "state": "implementation", "task_status": "in-progress",
        "requirements": (CHECK_ID,), "file": "src/implementation.py",
        "dirty": ("src/implementation.py",),
    },
    {
        "id": "Demo_Verification", "slug": "verification",
        "state": "verification", "task_status": "done",
        "requirements": ("review:cft@3",), "file": "src/verification.py",
        "dirty": ("src/verification.py",),
    },
    {
        "id": "Demo_Blocked", "slug": "blocked",
        "state": "blocked", "task_status": "done",
        "requirements": (CHECK_ID,), "file": None, "dirty": (),
    },
    {
        "id": "Demo_Ready", "slug": "ready-to-commit",
        "state": "ready_to_commit", "task_status": "done",
        "requirements": (CHECK_ID,), "file": "src/ready.py",
        "dirty": ("src/ready.py",),
    },
    {
        "id": "Demo_Committed", "slug": "verified-committed",
        "state": "verified_committed", "task_status": "done",
        "requirements": (CHECK_ID,), "file": "src/committed.py", "dirty": (),
    },
    {
        "id": "Demo_Empty", "slug": "empty",
        "state": None, "task_status": None,
        "requirements": (), "file": None, "dirty": (),
    },
)


def _z (value: datetime) -> str:
    return value.replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _safe_reset (runtime: Path, workspace_root: Path) -> None:
    resolved = runtime.resolve(strict=False)
    demo_root = (workspace_root / "Demo").resolve(strict=False)
    try:
        relative = resolved.relative_to(demo_root)
    except ValueError as exc:
        raise RuntimeError("Demo runtime must stay below the workspace Demo directory") from exc
    if not relative.parts:
        raise RuntimeError("Refusing to reset the Demo directory itself")
    if runtime.exists():
        try:
            shutil.rmtree(runtime)
        except PermissionError:
            print("[ABORT] Demo/runtime is locked - a demo server is still running. "
                  "Stop it and retry.")
            raise SystemExit(1)
    runtime.mkdir(parents=True)


def _plan_text (repo_id: str, status: str,
                requirements: tuple[str, ...], file: str | None) -> str:
    files = f"<files>\n{file}\n</files>\n" if file else ""
    verification = (
        "<verification>\n" + "\n".join(requirements) + "\n</verification>\n"
        if requirements else ""
    )
    return f"""================================================================================
PLAN: v0.3.0.0  {repo_id} synthetic Mission state
================================================================================
Generated metadata-only demo data. No provider content or credentials.
================================================================================

<task id="A.1">
<title>{repo_id} task</title>
<status>{status}</status>
{files}<why>Exercise the {repo_id} Mission state deterministically.</why>
</task>

{verification}================================================================================
END OF PLAN
================================================================================
"""


def _repo_relative (path: Path, workspace_root: Path) -> str:
    try:
        return path.resolve(strict=False).relative_to(
            workspace_root.resolve(strict=False),
        ).as_posix()
    except ValueError as exc:
        raise RuntimeError("Generated demo paths must remain inside the workspace") from exc


def _write_config (runtime: Path, workspace_root: Path) -> Path:
    lines = [
        "server:",
        "  host: 127.0.0.1",
        "  port: 8101",
        "  status_poll_seconds: 30",
        "repos:",
    ]
    for spec in STATE_SPECS:
        repo_dir = runtime / "repos" / spec["slug"]
        relative = _repo_relative(repo_dir, workspace_root)
        dirty = list(spec["dirty"])
        lines.extend([
            f"  - id: {spec['id']}",
            f"    name: \"{spec['id']} synthetic repo\"",
            f"    path: '{relative}'",
            "    demo: true",
            "    plan_globs:",
            "      - \"temp/Plan/PLAN_*.txt\"",
            "    static_status:",
            f"      clean: {'true' if not dirty else 'false'}",
            f"      count: {len(dirty)}",
            "      branch: main",
        ])
        if dirty:
            lines.append("      dirty_paths:")
            lines.extend(f"        - \"{item}\"" for item in dirty)
        else:
            lines.append("      dirty_paths: []")
    path = runtime / "repos.demo.yaml"
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return path


def _write_checks (runtime: Path) -> Path:
    eligible = [
        spec["id"] for spec in STATE_SPECS
        if spec["id"] != "Demo_Empty" and CHECK_ID in spec["requirements"]
    ]
    payload = {
        "schema_version": 1,
        "checks": [{
            "id": CHECK_ID,
            "label": "Synthetic verification check",
            "repo_ids": eligible,
            "cwd": ".",
            "commands": ["python Scripts/demo_verification.py"],
            "accepted_exit_codes": [0],
            "evidence_sources": ["hook", "manual"],
        }],
    }
    path = runtime / "checks.json"
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return path


def _write_repositories (runtime: Path) -> dict[str, Path]:
    roots: dict[str, Path] = {}
    for spec in STATE_SPECS:
        root = runtime / "repos" / spec["slug"]
        roots[spec["id"]] = root
        (root / ".git").mkdir(parents=True)
        (root / ".katlab_tracking").mkdir()
        if spec["task_status"] is not None:
            plan_path = root / PLAN_REL
            plan_path.parent.mkdir(parents=True)
            plan_path.write_text(_plan_text(
                spec["id"], spec["task_status"], spec["requirements"], spec["file"],
            ), encoding="utf-8")
        if spec["file"]:
            source = root / spec["file"]
            source.parent.mkdir(parents=True, exist_ok=True)
            source.write_text("# Synthetic demo file; no executable behavior.\n", encoding="utf-8")
    return roots


def _close_db (db_module) -> None:
    connection = getattr(db_module._local, "conn", None)
    if connection is not None:
        connection.close()
        del db_module._local.conn


def _activity_records (base: datetime, check_revision: str) -> list[dict]:
    records: list[dict] = []
    counter = 0

    def add (provider: str, kind: str, minutes: int, repo_ids: list[str],
             *, delivery: str = "best_effort", **extra) -> None:
        nonlocal counter
        counter += 1
        uid = f"30000000-0000-4000-8000-{counter:012x}"
        records.append({
            "schema_version": 1,
            "uid": uid,
            "provider": provider,
            "evidence_source": "manual" if provider == "manual" else "hook",
            "kind": kind,
            "ts": _z(base + timedelta(minutes=minutes)),
            "delivery_class": delivery,
            "repo_ids": sorted(repo_ids),
            **extra,
        })

    shared_session = "shared-demo-session"
    for provider, repo_id, offset, model in (
        ("claude", "Demo_Implementation", 180, "claude-demo"),
        ("codex", "Demo_Ready", 210, "codex-demo"),
    ):
        add(provider, "session_start", offset, [repo_id],
            session_id=shared_session, model=model, permission_mode="demo")
        add(provider, "agent_start", offset + 2, [repo_id],
            session_id=shared_session, agent_id=f"{provider}-subagent-1",
            parent_agent_id=f"{provider}-main", agent_type="worker", model=model)
        add(provider, "tool_finished", offset + 4, [repo_id],
            session_id=shared_session, agent_id=f"{provider}-subagent-1",
            parent_agent_id=f"{provider}-main", tool_use_id=f"{provider}-tool-1",
            tool_name="Read", tool_class="read", outcome="success", duration_ms=420)
        add(provider, "agent_stop", offset + 6, [repo_id],
            session_id=shared_session, agent_id=f"{provider}-subagent-1",
            parent_agent_id=f"{provider}-main", agent_type="worker", model=model)
        add(provider, "session_end", offset + 8, [repo_id],
            session_id=shared_session, model=model, permission_mode="demo")

    def manual (repo_id: str, check_id: str, outcome: str, minutes: int) -> None:
        add("manual", "review_result" if check_id.startswith("review:")
            else "check_finished", minutes, [repo_id], delivery="durable",
            plan_repo_id=repo_id, plan_file=PLAN_REL,
            check_id=check_id, outcome=outcome)

    manual("Demo_Planning", CHECK_ID, "pass", -30)
    manual("Demo_Blocked", CHECK_ID, "fail", 90)
    manual("Demo_Ready", CHECK_ID, "pass", 90)
    manual("Demo_Committed", CHECK_ID, "pass", 90)
    for outcome, minute in (
        ("clean", 90), ("clean", 100), ("finding", 110),
        ("clean", 120), ("clean", 130),
    ):
        manual("Demo_Verification", "review:cft", outcome, minute)

    multi = ["Demo_Blocked", "Demo_Verification"]
    add("codex", "check_started", 145, multi, delivery="durable",
        session_id="unassigned-demo-session", tool_use_id="unassigned-check-1",
        check_id=CHECK_ID, check_revision=check_revision)
    add("codex", "check_finished", 146, multi, delivery="durable",
        session_id="unassigned-demo-session", tool_use_id="unassigned-check-1",
        check_id=CHECK_ID, check_revision=check_revision, outcome="fail",
        duration_ms=750)
    return records


def _seed_database (runtime: Path, workspace_root: Path, roots: dict[str, Path],
                    checks_path: Path, now: datetime) -> dict[str, str]:
    from Backend.app import db, readiness
    from Backend.app.activity import ActivityIngestor
    from Backend.app.config import AppConfig, RepoConfig, ServerConfig, load_check_registry
    from Backend.app.plan_parser import parse_plan_bytes, raw_plan_sha256
    from Backend.app.resolver import resolve

    old_db_path, old_data_dir = db.DB_PATH, db.DATA_DIR
    _close_db(db)
    db.DB_PATH = runtime / "demo.db"
    db.DATA_DIR = runtime
    try:
        repos = []
        for spec in STATE_SPECS:
            dirty = list(spec["dirty"])
            repos.append(RepoConfig(
                spec["id"], f"{spec['id']} synthetic repo",
                Path(_repo_relative(roots[spec["id"]], workspace_root)),
                demo_status={
                    "clean": not dirty, "count": len(dirty), "branch": "main",
                    "dirty_paths": dirty,
                },
            ))
        known_ids = {repo.id for repo in repos}
        checks = load_check_registry(checks_path, known_ids)
        config = AppConfig(ServerConfig(port=8101), repos, runtime / "activity", checks)
        db.init_db(repos)

        revision_at = _z(now - timedelta(hours=8))
        for spec in STATE_SPECS:
            if spec["task_status"] is None:
                continue
            raw = (roots[spec["id"]] / PLAN_REL).read_bytes()
            parsed = parse_plan_bytes(raw, PLAN_REL)
            if parsed.fatal or parsed.warnings:
                raise RuntimeError(f"Generated plan failed validation: {spec['id']}")
            db.sync_plan_snapshot(
                spec["id"], PLAN_REL, raw_plan_sha256(raw), parsed,
                revision_at, checks,
            )

        event_ts = _z(now - timedelta(hours=7))
        for index, spec in enumerate(STATE_SPECS):
            tracking_file = roots[spec["id"]] / ".katlab_tracking" / "events.jsonl"
            if not spec["file"]:
                tracking_file.write_text("", encoding="utf-8")
                continue
            provider = "claude" if index % 2 == 0 else "codex"
            payload = {
                "v": 1, "ts": event_ts, "tool": "Edit", "file": spec["file"],
                "session_id": f"{provider}-{spec['slug']}-session",
                "branch": "main", "provider": provider,
                "turn_id": f"{provider}-{spec['slug']}-turn",
                "tool_use_id": f"{provider}-{spec['slug']}-tool",
                "operation": "update",
            }
            encoded = (json.dumps(payload, sort_keys=True) + "\n").encode("utf-8")
            tracking_file.write_bytes(encoded)
            tasks = [{
                "plan_file": row["plan_file"], "task_id": row["task_id"],
                "status": row["status"], "files": json.loads(row["files_json"]),
            } for row in db.get_tasks(spec["id"])]
            resolution = resolve(spec["file"], tasks)
            db.insert_events_with_offset(spec["id"], [{
                "ts": event_ts, "tool": "Edit", "file": spec["file"],
                "task_ref": resolution.task_ref, "mode": resolution.mode,
                "candidates": resolution.candidates,
                "session_id": payload["session_id"], "branch": "main",
                "provider": provider, "turn_id": payload["turn_id"],
                "agent_id": None, "tool_use_id": payload["tool_use_id"],
                "operation": "update", "plan_file": resolution.plan_file,
                "task_id": resolution.task_id,
            }], len(encoded))

        records = _activity_records(now - timedelta(hours=8), checks[0].revision)
        ingestor = ActivityIngestor(config)
        ingestor.initialize()
        for record in records:
            (ingestor.inbox / f"{record['uid']}.json").write_text(
                json.dumps(record, sort_keys=True, separators=(",", ":")) + "\n",
                encoding="utf-8",
            )
        result = ingestor.ingest_batch(limit=1_000)
        if (result.inserted != len(records) or result.rejected
                or result.ignored_unscoped or ingestor.pending_count()):
            raise RuntimeError("Generated activity did not ingest cleanly")

        commit_ts = _z(now - timedelta(hours=6, minutes=15))
        commit_hash = "d" * 40
        db.upsert_commit("Demo_Committed", {
            "hash": commit_hash,
            "message": "KATLAB DEMO: directly committed proof - v0.3.0.0",
            "ts": commit_ts,
            "files": ["src/committed.py"],
            "parents": "",
        })
        if db.link_events_to_commit(
                "Demo_Committed", commit_hash, commit_ts,
                ["src/committed.py"],
        ) != 1:
            raise RuntimeError("Generated direct-commit proof did not link")

        statuses = {
            spec["id"]: {
                "clean": not spec["dirty"], "count": len(spec["dirty"]),
                "offline": False, "branch": "main", "status_valid": True,
                "paths_complete": True, "observed_at": _z(now),
                "dirty_paths": list(spec["dirty"]),
            }
            for spec in STATE_SPECS
        }
        mission = readiness.evaluate_all(config, statuses, generated_at=_z(now))
        observed = {plan["repo"]: plan["state"] for plan in mission["plans"]}
        expected = {
            spec["id"]: spec["state"] for spec in STATE_SPECS
            if spec["state"] is not None
        }
        if observed != expected:
            raise RuntimeError(f"Generated Mission states disagree: {observed!r}")
        return observed
    finally:
        _close_db(db)
        db.DB_PATH, db.DATA_DIR = old_db_path, old_data_dir


def main (runtime: Path = RUNTIME, workspace_root: Path = REPO_ROOT) -> None:
    _safe_reset(runtime, workspace_root)
    roots = _write_repositories(runtime)
    config_path = _write_config(runtime, workspace_root)
    checks_path = _write_checks(runtime)
    states = _seed_database(
        runtime, workspace_root, roots, checks_path, datetime.now(timezone.utc),
    )
    print("Demo generated at Demo/runtime")
    print("Mission states:")
    for repo_id, state in states.items():
        print(f"  {repo_id:24s} -> {state}")
    print("  Demo_Empty               -> empty mission/activity/session shapes")
    print("Claude + Codex root/subagent sessions, pass/fail/stale/reset evidence, and")
    print("unassigned automated evidence are ready. No Git repository was created.")
    print(f"Config: {_repo_relative(config_path, workspace_root)}")


if __name__ == "__main__":
    main()
