"""SQLite data layer (PLAN v0.1.0.0 C.2). stdlib sqlite3 + WAL, no ORM."""

import hashlib
import json
import os
import sqlite3
import threading
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
# KATLAB_TRACKER_DB env override: demo mode uses its own DB so demo events
# never pollute the real tracking database.
DB_PATH = Path(os.environ.get("KATLAB_TRACKER_DB",
                              str(REPO_ROOT / "data" / "tracking.db")))
DATA_DIR = DB_PATH.parent
SCHEMA_PATH = Path(__file__).resolve().parent / "schema.sql"

_local = threading.local()


def _connect () -> sqlite3.Connection:
    # F56: data/ is gitignored -> absent on fresh clones; create it or the
    # very first run crashes with "unable to open database file".
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def get_conn () -> sqlite3.Connection:
    conn = getattr(_local, "conn", None)
    if conn is None:
        conn = _connect()
        _local.conn = conn
    return conn


def init_db (repos: list) -> None:
    conn = get_conn()
    conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
    # v0.1.5.0 D1 + v0.1.6.0 D2 + v0.1.9.0 A.1: additive migrations for
    # pre-existing databases - CREATE IF NOT EXISTS above never alters an
    # existing table. Idempotent needed-columns loop, generalized per table:
    # PRAGMA-guarded, one ALTER per missing column.
    needed: dict[str, dict[str, str]] = {
        "events": {
            "session_id": "TEXT", "branch": "TEXT", "provider": "TEXT",
            "turn_id": "TEXT", "agent_id": "TEXT", "tool_use_id": "TEXT",
            "operation": "TEXT", "plan_file": "TEXT", "task_id": "TEXT",
        },
        "commits": {"parents": "TEXT"},
    }
    for table, wanted in needed.items():
        columns = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})")}
        for column, definition in wanted.items():
            if column not in columns:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")
    for repo in repos:
        conn.execute(
            "INSERT INTO repos (id, name, path) VALUES (?, ?, ?) "
            "ON CONFLICT(id) DO UPDATE SET name = excluded.name, path = excluded.path",
            (repo.id, repo.name, str(repo.path)),
        )
    # These indexes must be created after the additive event-column migration;
    # schema.sql runs against old tables that CREATE TABLE IF NOT EXISTS cannot alter.
    event_columns = {
        row["name"] for row in conn.execute("PRAGMA table_info(events)")
    }
    if {"repo_id", "plan_file", "task_id", "commit_hash", "id"}.issubset(event_columns):
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_events_plan_commit "
            "ON events (repo_id, plan_file, task_id, commit_hash, id)"
        )
    if {"repo_id", "file", "commit_hash", "id"}.issubset(event_columns):
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_events_file_commit "
            "ON events (repo_id, file, commit_hash, id)"
        )
    conn.commit()


# --- tasks (F11/F16: atomic per-plan sync) ----------------------------------

def _canonical_sha256 (value: dict) -> str:
    encoded = json.dumps(
        value, sort_keys=True, separators=(",", ":"), ensure_ascii=False,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def requirement_revision (check_id: str, streak_target: int | None,
                          evidence_sources: list[str] | None = None,
                          check_revision: str | None = None) -> str:
    """Canonical requirement revision; C.2 supplies registry-derived values."""
    if evidence_sources is None:
        evidence_sources = ["manual"] if check_id.startswith("review:") else []
    return _canonical_sha256({
        "check_id": check_id,
        "streak_target": streak_target,
        "evidence_sources": sorted(set(evidence_sources)),
        "check_revision": check_revision,
    })


def sync_plan_snapshot (repo_id: str, plan_file: str, content_sha256: str,
                        result, last_seen_at: str,
                        check_definitions=()) -> str:
    """Atomically publish one exact-buffer parse and return its revision time.

    A fatal parse updates only the current snapshot. Last-valid tasks and
    requirements remain available for compatible display but readiness sees the
    snapshot's fatal state. Any sqlite failure rolls the whole transaction back.
    """
    conn = get_conn()
    existing = conn.execute(
        "SELECT content_sha256, revision_at FROM plan_snapshots "
        "WHERE repo_id = ? AND plan_file = ?",
        (repo_id, plan_file),
    ).fetchone()
    revision_at = (
        existing["revision_at"]
        if existing and existing["content_sha256"] == content_sha256
        else last_seen_at
    )
    warning_codes = list(dict.fromkeys(result.warning_codes))[:50]
    parse_state = "fatal" if result.fatal else ("warning" if warning_codes else "valid")
    definitions = {definition.id: definition for definition in check_definitions}
    with conn:
        conn.execute(
            "INSERT INTO plan_snapshots "
            "(repo_id, plan_file, content_sha256, revision_at, parse_state, "
            "warning_codes_json, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?) "
            "ON CONFLICT(repo_id, plan_file) DO UPDATE SET "
            "content_sha256 = excluded.content_sha256, "
            "revision_at = excluded.revision_at, parse_state = excluded.parse_state, "
            "warning_codes_json = excluded.warning_codes_json, "
            "last_seen_at = excluded.last_seen_at",
            (repo_id, plan_file, content_sha256, revision_at, parse_state,
             json.dumps(warning_codes), last_seen_at),
        )
        if not result.fatal:
            conn.execute(
                "DELETE FROM tasks WHERE repo_id = ? AND plan_file = ?",
                (repo_id, plan_file),
            )
            conn.execute(
                "DELETE FROM plan_requirements WHERE repo_id = ? AND plan_file = ?",
                (repo_id, plan_file),
            )
            conn.executemany(
                "INSERT INTO tasks "
                "(repo_id, plan_file, task_id, title, status, files_json, why) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                [
                    (repo_id, plan_file, task.id, task.title, task.status,
                     json.dumps(task.files), task.why)
                    for task in result.tasks
                ],
            )
            conn.executemany(
                "INSERT INTO plan_requirements "
                "(repo_id, plan_file, check_id, streak_target, source_order, "
                "requirement_revision, revision_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                [
                    (repo_id, plan_file, req.id, req.streak_target, ordinal,
                     requirement_revision(
                         req.id,
                         req.streak_target,
                         ["manual"] if req.id.startswith("review:") else list(
                             definitions[req.id].evidence_sources
                         ) if req.id in definitions else [],
                         definitions[req.id].revision if req.id in definitions else None,
                     ),
                     revision_at)
                    for ordinal, req in enumerate(result.requirements)
                ],
            )
    return revision_at


def delete_plan_state (repo_id: str, plan_file: str) -> None:
    """Delete a plan only after the watcher confirms two-manifest absence."""
    conn = get_conn()
    with conn:
        conn.execute(
            "DELETE FROM tasks WHERE repo_id = ? AND plan_file = ?",
            (repo_id, plan_file),
        )
        conn.execute(
            "DELETE FROM plan_requirements WHERE repo_id = ? AND plan_file = ?",
            (repo_id, plan_file),
        )
        conn.execute(
            "DELETE FROM plan_snapshots WHERE repo_id = ? AND plan_file = ?",
            (repo_id, plan_file),
        )


def get_plan_snapshots (repo_id: str | None = None) -> list[sqlite3.Row]:
    if repo_id:
        return get_conn().execute(
            "SELECT * FROM plan_snapshots WHERE repo_id = ? ORDER BY plan_file",
            (repo_id,),
        ).fetchall()
    return get_conn().execute(
        "SELECT * FROM plan_snapshots ORDER BY repo_id, plan_file"
    ).fetchall()


def get_plan_snapshot (repo_id: str, plan_file: str) -> sqlite3.Row | None:
    return get_conn().execute(
        "SELECT * FROM plan_snapshots WHERE repo_id = ? AND plan_file = ?",
        (repo_id, plan_file),
    ).fetchone()


def get_plan_requirements (repo_id: str | None = None,
                           plan_file: str | None = None) -> list[sqlite3.Row]:
    query = "SELECT * FROM plan_requirements WHERE 1=1"
    params: list = []
    if repo_id is not None:
        query += " AND repo_id = ?"
        params.append(repo_id)
    if plan_file is not None:
        query += " AND plan_file = ?"
        params.append(plan_file)
    query += " ORDER BY repo_id, plan_file, source_order"
    return get_conn().execute(query, params).fetchall()


def get_plan_requirement_binding (repo_id: str, plan_file: str,
                                  check_id: str) -> dict | None:
    row = get_conn().execute(
        "SELECT r.*, s.content_sha256 AS plan_revision, s.parse_state "
        "FROM plan_requirements r JOIN plan_snapshots s "
        "ON s.repo_id = r.repo_id AND s.plan_file = r.plan_file "
        "WHERE r.repo_id = ? AND r.plan_file = ? AND r.check_id = ?",
        (repo_id, plan_file, check_id),
    ).fetchone()
    if row is None or row["parse_state"] != "valid":
        return None
    return dict(row)


def automatic_plan_bindings (repo_id: str, check_id: str) -> list[dict]:
    rows = get_conn().execute(
        "SELECT r.*, s.content_sha256 AS plan_revision, s.parse_state "
        "FROM plan_requirements r JOIN plan_snapshots s "
        "ON s.repo_id = r.repo_id AND s.plan_file = r.plan_file "
        "WHERE r.repo_id = ? AND r.check_id = ? AND s.parse_state = 'valid' "
        "ORDER BY r.plan_file",
        (repo_id, check_id),
    ).fetchall()
    bindings: list[dict] = []
    for row in rows:
        statuses = [task["status"] for task in get_conn().execute(
            "SELECT status FROM tasks WHERE repo_id = ? AND plan_file = ?",
            (repo_id, row["plan_file"]),
        )]
        value = dict(row)
        value["in_progress_count"] = statuses.count("in-progress")
        value["all_done"] = all(status == "done" for status in statuses)
        bindings.append(value)
    return bindings


def sync_plan_tasks (repo_id: str, plan_file: str, tasks: list[dict]) -> None:
    """Replace ALL tasks of one plan file atomically. tasks=[] removes them (F16)."""
    conn = get_conn()
    with conn:
        conn.execute(
            "DELETE FROM tasks WHERE repo_id = ? AND plan_file = ?",
            (repo_id, plan_file),
        )
        conn.executemany(
            "INSERT INTO tasks (repo_id, plan_file, task_id, title, status, files_json, why) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            [
                (repo_id, plan_file, t["id"], t["title"], t["status"],
                 json.dumps(t["files"]), t["why"])
                for t in tasks
            ],
        )


def get_tasks (repo_id: str | None = None) -> list[sqlite3.Row]:
    conn = get_conn()
    if repo_id:
        return conn.execute(
            "SELECT * FROM tasks WHERE repo_id = ? ORDER BY plan_file, task_id",
            (repo_id,),
        ).fetchall()
    return conn.execute("SELECT * FROM tasks ORDER BY repo_id, plan_file, task_id").fetchall()


# --- events (F13: insert + offset in ONE transaction) ------------------------

def insert_events_with_offset (repo_id: str, events: list[dict], new_offset: int) -> list[int]:
    """Exactly-once ingest: event rows + offset update commit atomically."""
    conn = get_conn()
    ids: list[int] = []
    with conn:
        for e in events:
            cur = conn.execute(
                "INSERT INTO events (repo_id, ts, tool, file, task_ref, mode, "
                "candidates_json, session_id, branch, provider, turn_id, agent_id, "
                "tool_use_id, operation, plan_file, task_id) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (repo_id, e["ts"], e["tool"], e["file"], e.get("task_ref"),
                 e["mode"], json.dumps(e["candidates"]) if e.get("candidates") else None,
                 e.get("session_id"), e.get("branch"), e.get("provider"),
                 e.get("turn_id"), e.get("agent_id"), e.get("tool_use_id"),
                 e.get("operation"), e.get("plan_file"), e.get("task_id")),
            )
            ids.append(cur.lastrowid)
        conn.execute(
            "INSERT INTO ingest_state (repo_id, events_offset) VALUES (?, ?) "
            "ON CONFLICT(repo_id) DO UPDATE SET events_offset = excluded.events_offset",
            (repo_id, new_offset),
        )
    return ids


def get_offset (repo_id: str) -> int:
    row = get_conn().execute(
        "SELECT events_offset FROM ingest_state WHERE repo_id = ?", (repo_id,)
    ).fetchone()
    return row["events_offset"] if row else 0


def get_events (repo_id: str | None = None, mode: str | None = None,
                uncommitted_only: bool = False, limit: int = 500, offset: int = 0,
                session: str | None = None,
                file: str | None = None,
                since: str | None = None,
                until: str | None = None,
                provider: str | None = None) -> list[sqlite3.Row]:
    query = "SELECT * FROM events WHERE 1=1"
    params: list = []
    if repo_id:
        query += " AND repo_id = ?"
        params.append(repo_id)
    if mode:
        query += " AND mode = ?"
        params.append(mode)
    if uncommitted_only:
        query += " AND commit_hash IS NULL"
    if session:  # v0.1.6.0 D3 (B.2): exact-match session filter (timeline)
        query += " AND session_id = ?"
        params.append(session)
    if file:  # v0.1.7.0 D2 (A.2): exact-match file filter (file story)
        query += " AND file = ?"
        params.append(file)
    # v0.1.8.0 D1 (A.1): ts window for the day-lanes fetch — TEXT compare
    # (ISO-Z lexicographic == chronological; ts >= since AND ts < until).
    if since:
        query += " AND ts >= ?"
        params.append(since)
    if until:
        query += " AND ts < ?"
        params.append(until)
    if provider == "claude":
        query += " AND (provider = 'claude' OR provider IS NULL)"
    elif provider is not None:
        query += " AND provider = ?"
        params.append(provider)
    query += " ORDER BY id DESC LIMIT ? OFFSET ?"  # F38 pagination
    params += [limit, offset]
    return get_conn().execute(query, params).fetchall()


def get_event (event_id: int) -> sqlite3.Row | None:
    return get_conn().execute("SELECT * FROM events WHERE id = ?", (event_id,)).fetchone()


def set_manual_task (event_id: int, task_ref: str) -> None:
    """Set legacy display + normalized keys from one exact current-task match."""
    conn = get_conn()
    event = conn.execute(
        "SELECT repo_id FROM events WHERE id = ?", (event_id,),
    ).fetchone()
    if event is None:
        raise ValueError("unknown event")
    matches = [
        row for row in conn.execute(
            "SELECT plan_file, task_id FROM tasks WHERE repo_id = ?",
            (event["repo_id"],),
        )
        if f"{row['plan_file']} - {row['task_id']}" == task_ref
    ]
    if len(matches) != 1:
        raise ValueError("task reference is not one exact current task")
    with conn:
        conn.execute(
            "UPDATE events SET task_ref = ?, mode = 'MANUAL', "
            "plan_file = ?, task_id = ? WHERE id = ?",
            (task_ref, matches[0]["plan_file"], matches[0]["task_id"], event_id),
        )


def backfill_event_task_keys (repo_id: str) -> int:
    """Bind legacy display refs only when one current task constructs that ref."""
    conn = get_conn()
    by_ref: dict[str, list[sqlite3.Row]] = {}
    for row in conn.execute(
            "SELECT plan_file, task_id FROM tasks WHERE repo_id = ?", (repo_id,)):
        by_ref.setdefault(f"{row['plan_file']} - {row['task_id']}", []).append(row)
    updates = [
        (matches[0]["plan_file"], matches[0]["task_id"], row["id"])
        for row in conn.execute(
            "SELECT id, task_ref FROM events WHERE repo_id = ? AND task_ref IS NOT NULL "
            "AND (plan_file IS NULL OR task_id IS NULL)",
            (repo_id,),
        )
        if len(matches := by_ref.get(row["task_ref"], [])) == 1
    ]
    with conn:
        conn.executemany(
            "UPDATE events SET plan_file = ?, task_id = ? WHERE id = ?",
            updates,
        )
    return len(updates)


# --- provider-neutral activity ledger --------------------------------------

ACTIVITY_CAPTURE_COLUMNS = (
    "schema_version", "provider", "evidence_source", "kind", "ts",
    "delivery_class", "session_id", "turn_id", "agent_id", "parent_agent_id",
    "agent_type", "model", "permission_mode", "tool_use_id", "tool_name",
    "tool_class", "outcome", "duration_ms", "check_id",
)
ACTIVITY_COUNTER_NAMES = frozenset({
    "ignored_unscoped", "registry_revision_mismatch",
})


def _increment_activity_counter (conn: sqlite3.Connection, name: str) -> None:
    if name not in ACTIVITY_COUNTER_NAMES:
        raise ValueError("unknown activity counter")
    conn.execute(
        "INSERT INTO activity_counters (name, value) VALUES (?, 1) "
        "ON CONFLICT(name) DO UPDATE SET value = value + 1",
        (name,),
    )


def classify_existing_activity (uid: str,
                                record_sha256: str) -> tuple[str, int] | None:
    """Classify a committed transport identity without mutable plan state."""
    row = get_conn().execute(
        "SELECT id, record_sha256 FROM activity_events WHERE uid = ?", (uid,),
    ).fetchone()
    if row is None:
        return None
    status = "duplicate" if row["record_sha256"] == record_sha256 else "conflict"
    return status, int(row["id"])


def insert_activity (transport: dict, record_sha256: str, repo_ids: list[str],
                     derived: dict, created_at: str) -> tuple[str, int]:
    """Insert immutable activity and normalized links, or classify one retry."""
    conn = get_conn()
    with conn:
        existing = conn.execute(
            "SELECT id, record_sha256 FROM activity_events WHERE uid = ?",
            (transport["uid"],),
        ).fetchone()
        if existing is not None:
            status = "duplicate" if existing["record_sha256"] == record_sha256 else "conflict"
            return status, existing["id"]

        columns = ["uid", "record_sha256", *ACTIVITY_CAPTURE_COLUMNS,
                   "plan_repo_id", "plan_file", "task_ref", "assignment_mode",
                   "check_revision", "requirement_revision", "plan_revision", "created_at"]
        values = [
            transport["uid"], record_sha256,
            *(transport.get(column) for column in ACTIVITY_CAPTURE_COLUMNS),
            derived.get("plan_repo_id"), derived.get("plan_file"),
            derived.get("task_ref"), derived["assignment_mode"],
            derived.get("check_revision"), derived.get("requirement_revision"),
            derived.get("plan_revision"), created_at,
        ]
        placeholders = ",".join("?" for _ in columns)
        cursor = conn.execute(
            f"INSERT INTO activity_events ({','.join(columns)}) VALUES ({placeholders})",
            values,
        )
        activity_id = cursor.lastrowid
        conn.executemany(
            "INSERT INTO activity_repo_links (activity_id, repo_id) VALUES (?, ?)",
            [(activity_id, repo_id) for repo_id in repo_ids],
        )
        health_counter = derived.get("_health_counter")
        if health_counter is not None:
            _increment_activity_counter(conn, health_counter)
    return "inserted", activity_id


def activity_session_repo_ids (provider: str, session_id: str,
                               current_repo_ids: set[str]) -> set[str]:
    if not current_repo_ids:
        return set()
    rows = get_conn().execute(
        "SELECT DISTINCT l.repo_id FROM activity_events a JOIN activity_repo_links l "
        "ON l.activity_id = a.id WHERE a.provider = ? AND a.session_id = ?",
        (provider, session_id),
    )
    return {row["repo_id"] for row in rows if row["repo_id"] in current_repo_ids}


def activity_session_is_admitted (provider: str, session_id: str,
                                  current_repo_ids: set[str]) -> bool:
    return bool(activity_session_repo_ids(provider, session_id, current_repo_ids))


def increment_activity_counter (name: str) -> None:
    with get_conn() as conn:
        _increment_activity_counter(conn, name)


def get_activity_counter (name: str) -> int:
    row = get_conn().execute(
        "SELECT value FROM activity_counters WHERE name = ?", (name,),
    ).fetchone()
    return int(row["value"]) if row else 0


def get_activity_events () -> list[sqlite3.Row]:
    return get_conn().execute("SELECT * FROM activity_events ORDER BY id").fetchall()


def get_activity_event (activity_id: int) -> sqlite3.Row | None:
    return get_conn().execute(
        "SELECT * FROM activity_events WHERE id = ?", (activity_id,),
    ).fetchone()


def get_latest_activity_id () -> int | None:
    row = get_conn().execute("SELECT MAX(id) AS id FROM activity_events").fetchone()
    return int(row["id"]) if row and row["id"] is not None else None


def get_activity_links (activity_id: int | None = None) -> list[sqlite3.Row]:
    if activity_id is None:
        return get_conn().execute(
            "SELECT * FROM activity_repo_links ORDER BY activity_id, repo_id"
        ).fetchall()
    return get_conn().execute(
        "SELECT * FROM activity_repo_links WHERE activity_id = ? ORDER BY repo_id",
        (activity_id,),
    ).fetchall()


def _activity_scope_sql (repo_id: str | None) -> tuple[str, list]:
    if repo_id is None:
        return "", []
    return (
        " AND (EXISTS (SELECT 1 FROM activity_repo_links direct "
        "WHERE direct.activity_id = a.id AND direct.repo_id = ?) "
        "OR (a.session_id IS NOT NULL "
        "AND NOT EXISTS (SELECT 1 FROM activity_repo_links own "
        "WHERE own.activity_id = a.id) "
        "AND EXISTS (SELECT 1 FROM activity_events context "
        "JOIN activity_repo_links context_link ON context_link.activity_id = context.id "
        "WHERE context.provider = a.provider AND context.session_id = a.session_id "
        "AND context_link.repo_id = ?)))",
        [repo_id, repo_id],
    )


def get_activity_page (*, repo_id: str | None = None,
                       provider: str | None = None,
                       session_id: str | None = None,
                       kind: str | None = None,
                       check_id: str | None = None,
                       plan_file: str | None = None,
                       order: str = "desc", limit: int = 50,
                       offset: int = 0) -> tuple[list[tuple[sqlite3.Row, dict]], int]:
    """Return one bounded activity page; effective-plan filtering streams rows."""
    clauses = ["1=1"]
    params: list = []
    for column, value in (
        ("provider", provider), ("session_id", session_id),
        ("kind", kind), ("check_id", check_id),
    ):
        if value is not None:
            clauses.append(f"a.{column} = ?")
            params.append(value)
    scope_sql, scope_params = _activity_scope_sql(repo_id)
    direction = "ASC" if order == "asc" else "DESC"
    query = (
        "SELECT a.* FROM activity_events a WHERE " + " AND ".join(clauses)
        + scope_sql + f" ORDER BY a.ts {direction}, a.id {direction}"
    )
    all_params = [*params, *scope_params]
    conn = get_conn()
    if plan_file is None:
        # Timeline/general-ledger paging must remain proportional to the requested
        # page. Effective assignment is needed for response projection, but not to
        # select an unfiltered row, so never resolve it across the whole ledger.
        total = conn.execute(
            "SELECT COUNT(*) AS count FROM activity_events a WHERE "
            + " AND ".join(clauses) + scope_sql,
            all_params,
        ).fetchone()["count"]
        rows = conn.execute(
            query + " LIMIT ? OFFSET ?", [*all_params, limit, offset],
        ).fetchall()
        return [(row, effective_activity_binding(row)) for row in rows], int(total)

    page: list[tuple[sqlite3.Row, dict]] = []
    total = 0
    for row in conn.execute(query, all_params):
        effective = effective_activity_binding(row)
        if plan_file is not None and (
            effective["plan_repo_id"] != repo_id
            or effective["plan_file"] != plan_file
        ):
            continue
        if offset <= total < offset + limit:
            page.append((row, effective))
        total += 1
    return page, total


def get_session_page (*, current_repo_ids: set[str],
                      repo_id: str | None = None,
                      provider: str | None = None,
                      session_id: str | None = None,
                      order: str = "desc", limit: int = 50,
                      offset: int = 0) -> tuple[list[dict], int]:
    clauses = ["a.session_id IS NOT NULL"]
    params: list = []
    if provider is not None:
        clauses.append("a.provider = ?")
        params.append(provider)
    if session_id is not None:
        clauses.append("a.session_id = ?")
        params.append(session_id)
    scope_sql, scope_params = _activity_scope_sql(repo_id)
    where = " AND ".join(clauses) + scope_sql
    grouped = (
        "SELECT a.provider, a.session_id, MIN(a.ts) AS started_at, "
        "MAX(a.ts) AS ended_at, MAX(a.id) AS last_id, COUNT(*) AS event_count, "
        "COUNT(DISTINCT CASE WHEN a.agent_id IS NOT NULL THEN a.agent_id END) "
        "AS agent_count, "
        "COUNT(DISTINCT CASE WHEN a.tool_use_id IS NOT NULL THEN a.tool_use_id END) "
        "AS tool_count, "
        "SUM(CASE WHEN a.kind IN ('check_finished','review_result') THEN 1 ELSE 0 END) "
        "AS check_count, "
        "SUM(CASE WHEN a.delivery_class = 'durable' THEN 1 ELSE 0 END) AS durable_count, "
        "SUM(CASE WHEN a.delivery_class = 'best_effort' THEN 1 ELSE 0 END) "
        "AS best_effort_count FROM activity_events a WHERE " + where
        + " GROUP BY a.provider, a.session_id"
    )
    all_params = [*params, *scope_params]
    total = get_conn().execute(
        "SELECT COUNT(*) AS count FROM (" + grouped + ")", all_params,
    ).fetchone()["count"]
    direction = "ASC" if order == "asc" else "DESC"
    rows = get_conn().execute(
        grouped + f" ORDER BY ended_at {direction}, last_id {direction}, "
        f"provider {direction}, session_id {direction} LIMIT ? OFFSET ?",
        [*all_params, limit, offset],
    ).fetchall()
    items = []
    for row in rows:
        durable = int(row["durable_count"])
        best_effort = int(row["best_effort_count"])
        delivery = "mixed" if durable and best_effort else (
            "durable" if durable else "best_effort"
        )
        item = {
            "provider": row["provider"],
            "session_id": row["session_id"],
            "started_at": row["started_at"],
            "ended_at": row["ended_at"],
            "event_count": int(row["event_count"]),
            "agent_count": int(row["agent_count"]),
            "tool_count": int(row["tool_count"]),
            "check_count": int(row["check_count"]),
            "delivery": delivery,
            "repo_ids": sorted(activity_session_repo_ids(
                row["provider"], row["session_id"], current_repo_ids,
            )),
        }
        item["repo_count"] = len(item["repo_ids"])
        items.append(item)
    return items, int(total)


def get_provider_last_activity (provider: str) -> str | None:
    row = get_conn().execute(
        "SELECT MAX(ts) AS ts FROM activity_events WHERE provider = ?",
        (provider,),
    ).fetchone()
    return row["ts"] if row and row["ts"] else None


def get_manual_evidence (check_id: str) -> list[sqlite3.Row]:
    return get_conn().execute(
        "SELECT * FROM activity_events WHERE evidence_source = 'manual' "
        "AND check_id = ? ORDER BY ts, id",
        (check_id,),
    ).fetchall()


def get_attributed_plan_events (repo_id: str, plan_file: str) -> list[sqlite3.Row]:
    """Current-task attribution only; plan-file edits are never implementation."""
    return get_conn().execute(
        "SELECT e.* FROM events e JOIN tasks t ON t.repo_id = e.repo_id "
        "AND t.plan_file = e.plan_file AND t.task_id = e.task_id "
        "WHERE e.repo_id = ? AND e.plan_file = ? AND e.file <> e.plan_file "
        "ORDER BY e.ts, e.id",
        (repo_id, plan_file),
    ).fetchall()


def get_unresolved_uncommitted_count (repo_id: str) -> int:
    row = get_conn().execute(
        "SELECT COUNT(*) AS count FROM events WHERE repo_id = ? "
        "AND commit_hash IS NULL AND mode IN ('AMBIGUOUS', 'UNKNOWN')",
        (repo_id,),
    ).fetchone()
    return int(row["count"])


def first_attempt_start (provider: str, session_id: str, tool_use_id: str,
                         check_id: str, check_revision: str) -> sqlite3.Row | None:
    return get_conn().execute(
        "SELECT * FROM activity_events WHERE evidence_source = 'hook' "
        "AND provider = ? AND session_id = ? "
        "AND tool_use_id = ? AND check_id = ? AND check_revision = ? "
        "AND kind = 'check_started' ORDER BY ts, id LIMIT 1",
        (provider, session_id, tool_use_id, check_id, check_revision),
    ).fetchone()


def canonical_check_attempts (check_id: str | None = None) -> list[dict]:
    query = (
        "SELECT * FROM activity_events WHERE evidence_source = 'hook' "
        "AND kind IN ('check_started', 'check_finished') "
        "AND session_id IS NOT NULL AND tool_use_id IS NOT NULL "
        "AND check_id IS NOT NULL AND check_revision IS NOT NULL"
    )
    params: list = []
    if check_id is not None:
        query += " AND check_id = ?"
        params.append(check_id)
    query += " ORDER BY ts, id"
    grouped: dict[tuple, dict[str, sqlite3.Row | None]] = {}
    for row in get_conn().execute(query, params):
        key = (
            row["provider"], row["session_id"], row["tool_use_id"],
            row["check_id"], row["check_revision"],
        )
        attempt = grouped.setdefault(key, {"start": None, "finish": None})
        slot = "start" if row["kind"] == "check_started" else "finish"
        if attempt[slot] is None:
            attempt[slot] = row
    return [
        {"key": key, "start": value["start"], "finish": value["finish"]}
        for key, value in grouped.items()
    ]


def _canonical_pair_ids (row: sqlite3.Row) -> set[int]:
    if row["evidence_source"] != "hook":
        return {row["id"]}
    if (row["kind"] not in {"check_started", "check_finished"}
            or not all(row[key] for key in (
                "session_id", "tool_use_id", "check_id", "check_revision",
            ))):
        return set()
    for attempt in canonical_check_attempts(row["check_id"]):
        if attempt["key"] == (
                row["provider"], row["session_id"], row["tool_use_id"],
                row["check_id"], row["check_revision"]):
            return {
                item["id"] for item in (attempt["start"], attempt["finish"])
                if item is not None
            }
    return set()


def canonical_evidence_id (row: sqlite3.Row) -> int:
    """Return the stable UI/API identity for one canonical evidence attempt."""
    pair_ids = _canonical_pair_ids(row)
    if not pair_ids:
        return int(row["id"])
    if row["evidence_source"] == "hook":
        for attempt in canonical_check_attempts(row["check_id"]):
            if attempt["key"] == (
                    row["provider"], row["session_id"], row["tool_use_id"],
                    row["check_id"], row["check_revision"]):
                evidence = attempt["finish"] or attempt["start"]
                if evidence is not None:
                    return int(evidence["id"])
    return min(pair_ids)


def canonical_evidence_repo_ids (row: sqlite3.Row,
                                 current_repo_ids: set[str]) -> list[str]:
    """Direct repository union for the canonical evidence attempt."""
    pair_ids = _canonical_pair_ids(row) or {row["id"]}
    placeholders = ",".join("?" for _ in pair_ids)
    linked = get_conn().execute(
        f"SELECT DISTINCT repo_id FROM activity_repo_links "
        f"WHERE activity_id IN ({placeholders}) ORDER BY repo_id",
        sorted(pair_ids),
    ).fetchall()
    return [item["repo_id"] for item in linked
            if item["repo_id"] in current_repo_ids]


def effective_activity_binding (row: sqlite3.Row) -> dict:
    pair_ids = _canonical_pair_ids(row) or {row["id"]}
    placeholders = ",".join("?" for _ in pair_ids)
    assignment = get_conn().execute(
        f"SELECT * FROM activity_assignments WHERE activity_id IN ({placeholders}) "
        "ORDER BY id DESC LIMIT 1",
        sorted(pair_ids),
    ).fetchone()
    if assignment is not None:
        if assignment["action"] == "clear":
            return {"assignment_mode": "UNASSIGNED", "plan_repo_id": None,
                    "plan_file": None, "requirement_revision": None,
                    "plan_revision": None}
        return {"assignment_mode": "MANUAL_ASSIGNMENT",
                "plan_repo_id": assignment["repo_id"],
                "plan_file": assignment["plan_file"],
                "requirement_revision": assignment["requirement_revision"],
                "plan_revision": assignment["plan_revision"]}

    if row["evidence_source"] == "hook":
        start = first_attempt_start(
            row["provider"], row["session_id"], row["tool_use_id"],
            row["check_id"], row["check_revision"],
        )
        if start is not None:
            row = start
    return {key: row[key] for key in (
        "assignment_mode", "plan_repo_id", "plan_file",
        "requirement_revision", "plan_revision",
    )}


def append_activity_assignment (activity_id: int, repo_id: str,
                                plan_file: str | None, action: str,
                                check_definitions, assigned_at: str) -> int:
    if action not in {"assign", "clear"}:
        raise ValueError("invalid assignment action")
    row = get_conn().execute(
        "SELECT * FROM activity_events WHERE id = ?", (activity_id,),
    ).fetchone()
    if row is None or row["kind"] not in {"check_started", "check_finished", "review_result"}:
        raise ValueError("activity is not assignable evidence")
    canonical_ids = _canonical_pair_ids(row)
    if activity_id not in canonical_ids:
        raise ValueError("duplicate evidence row is not assignable")
    placeholders = ",".join("?" for _ in canonical_ids)
    if get_conn().execute(
        f"SELECT 1 FROM activity_repo_links WHERE activity_id IN ({placeholders}) "
        "AND repo_id = ? LIMIT 1",
        [*sorted(canonical_ids), repo_id],
    ).fetchone() is None:
        raise ValueError("repository is not directly linked to the canonical evidence")

    requirement_revision_value = None
    plan_revision = None
    if action == "assign":
        if plan_file is None:
            raise ValueError("assign requires a plan")
        binding = get_plan_requirement_binding(repo_id, plan_file, row["check_id"])
        if binding is None:
            raise ValueError("plan does not declare a usable requirement")
        definitions = {item.id: item for item in check_definitions}
        if row["check_id"].startswith("review:"):
            source_allowed = row["evidence_source"] == "manual"
        else:
            definition = definitions.get(row["check_id"])
            source_allowed = (
                definition is not None and repo_id in definition.repo_ids
                and row["evidence_source"] in definition.evidence_sources
                and row["check_revision"] == definition.revision
            )
        if not source_allowed:
            raise ValueError("evidence source is not allowed")
        requirement_revision_value = binding["requirement_revision"]
        plan_revision = binding["plan_revision"]
    else:
        if plan_file is not None:
            raise ValueError("clear must not name a plan")
        effective = effective_activity_binding(row)
        if (effective["plan_repo_id"] != repo_id
                or effective["assignment_mode"] in {"NONE", "UNASSIGNED"}):
            raise ValueError("clear must name the current effective repository")

    with get_conn() as conn:
        cursor = conn.execute(
            "INSERT INTO activity_assignments "
            "(activity_id, repo_id, action, plan_file, requirement_revision, "
            "plan_revision, assigned_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (activity_id, repo_id, action, plan_file,
             requirement_revision_value, plan_revision, assigned_at),
        )
    return cursor.lastrowid


def requirement_has_current_pass (binding: dict) -> bool:
    """Conservative current-pass probe used only for AUTO_VERIFYING selection."""
    floor_values = [binding["revision_at"]]
    floor_values.extend(
        row["ts"] for row in get_conn().execute(
            "SELECT ts FROM events WHERE repo_id = ? AND plan_file = ? AND file <> ?",
            (binding["repo_id"], binding["plan_file"], binding["plan_file"]),
        )
    )
    floor_epochs = [epoch for value in floor_values if (epoch := _ts_epoch(value)) is not None]
    if not floor_epochs:
        return False
    floor = max(floor_epochs)

    manual_rows = get_conn().execute(
        "SELECT * FROM activity_events WHERE evidence_source = 'manual' "
        "AND kind = 'check_finished' AND check_id = ? AND outcome = 'pass'",
        (binding["check_id"],),
    ).fetchall()
    candidates: list[tuple[sqlite3.Row, str]] = [
        (row, row["ts"]) for row in manual_rows
    ]
    for attempt in canonical_check_attempts(binding["check_id"]):
        start = attempt["start"]
        finish = attempt["finish"]
        if (start is not None and finish is not None
                and finish["outcome"] == "pass"):
            candidates.append((finish, finish["ts"]))
    for row, evidence_ts in candidates:
        effective = effective_activity_binding(row)
        if (
            effective["plan_repo_id"] == binding["repo_id"]
            and effective["plan_file"] == binding["plan_file"]
            and effective["requirement_revision"] == binding["requirement_revision"]
            and effective["plan_revision"] == binding["plan_revision"]
            and (_ts_epoch(evidence_ts) is not None)
            and _ts_epoch(evidence_ts) > floor
        ):
            return True
    return False


# --- commits + linking (F9/F32/F35/F36 sweep) --------------------------------

def upsert_commit (repo_id: str, commit: dict) -> None:
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO commits (repo_id, hash, message, ts, files_json, parents) "
            "VALUES (?, ?, ?, ?, ?, ?) "
            "ON CONFLICT(repo_id, hash) DO UPDATE SET message = excluded.message, "
            "ts = excluded.ts, files_json = excluded.files_json, "
            "parents = excluded.parents",
            (repo_id, commit["hash"], commit["message"], commit["ts"],
             json.dumps(commit["files"]), commit["parents"]),
        )


def get_commit_hashes (repo_id: str) -> set[str]:
    return {
        row["hash"] for row in get_conn().execute(
            "SELECT hash FROM commits WHERE repo_id = ?", (repo_id,),
        )
    }


def link_events_to_commit (repo_id: str, commit_hash: str, commit_ts: str,
                           files: list[str]) -> int:
    if not files:
        return 0
    conn = get_conn()
    placeholders = ",".join("?" * len(files))
    with conn:
        cur = conn.execute(
            f"UPDATE events SET commit_hash = ? WHERE repo_id = ? AND commit_hash IS NULL "
            f"AND ts <= ? AND file IN ({placeholders})",
            [commit_hash, repo_id, commit_ts, *files],
        )
    return cur.rowcount


def sweep_unlinked_events (repo_id: str, head_hash: str) -> int:
    """F9/F32: on CLEAN, attach remaining unlinked events to HEAD with swept=1."""
    conn = get_conn()
    with conn:
        cur = conn.execute(
            "UPDATE events SET commit_hash = ?, swept = 1 "
            "WHERE repo_id = ? AND commit_hash IS NULL",
            (head_hash, repo_id),
        )
    return cur.rowcount


def get_last_event_ts (repo_id: str) -> str | None:
    """v0.1.2.0 D9: newest capture timestamp for the heartbeat chip."""
    row = get_conn().execute(
        "SELECT MAX(ts) AS ts FROM events WHERE repo_id = ?", (repo_id,)
    ).fetchone()
    return row["ts"] if row and row["ts"] else None


def get_oldest_uncommitted_ts (repo_id: str) -> str | None:
    """v0.1.6.0 D4 (B.2): MIN(ts) over uncommitted events - exact source
    for the uncommitted-age nudge (never page-limited)."""
    row = get_conn().execute(
        "SELECT MIN(ts) AS ts FROM events WHERE repo_id = ? AND commit_hash IS NULL",
        (repo_id,),
    ).fetchone()
    return row["ts"] if row and row["ts"] else None


def get_task_activity () -> dict:
    """v0.1.6.0 D4 (B.2): (repo_id, task_ref) -> MAX(ts) map for the
    idle-task nudge (merged into /api/tasks rows by the route)."""
    return {
        (r["repo_id"], r["task_ref"]): r["ts"]
        for r in get_conn().execute(
            "SELECT repo_id, task_ref, MAX(ts) AS ts FROM events "
            "WHERE task_ref IS NOT NULL GROUP BY repo_id, task_ref")
    }


def has_unlinked_events (repo_id: str) -> bool:
    row = get_conn().execute(
        "SELECT 1 FROM events WHERE repo_id = ? AND commit_hash IS NULL LIMIT 1",
        (repo_id,),
    ).fetchone()
    return row is not None


# --- v0.1.3.0 stats (D5): read-only aggregates for the Overview dashboard ---

ALL_MODES = ["B", "A_SCOPED", "A_GLOBAL", "AMBIGUOUS", "UNKNOWN", "MANUAL"]

# v0.1.6.0 D1 (B.1): effort clustering - the ONE algorithm home. Mirrored
# in Frontend/src/theme.ts (EFFORT_GAP_MAX_MIN / EFFORT_TAIL_MIN, minutes)
# for the timeline's gap markers - keep in sync (v0.1.6.0 RV4 contract).
EFFORT_GAP_MAX_S = 15 * 60
EFFORT_TAIL_S = 2 * 60


def _ts_epoch (ts: str) -> float | None:
    from datetime import datetime
    try:
        return datetime.fromisoformat(ts.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None


def _cluster_minutes (sorted_epochs: list[float]) -> int:
    """v0.1.6.0 D1: gap-rule blocks -> whole minutes. A block breaks where
    the gap exceeds EFFORT_GAP_MAX_S; each block adds (span + TAIL);
    minutes = round(seconds/60) - ONE rounding rule (v0.1.6.0 RV12).
    An ESTIMATE by construction - every UI surface renders it with '≈'."""
    if not sorted_epochs:
        return 0
    total = 0.0
    block_start = prev = sorted_epochs[0]
    for t in sorted_epochs[1:]:
        if t - prev > EFFORT_GAP_MAX_S:
            total += (prev - block_start) + EFFORT_TAIL_S
            block_start = t
        prev = t
    total += (prev - block_start) + EFFORT_TAIL_S
    return round(total / 60)


def get_activity_buckets (repo_id: str, now_iso: str, buckets: int = 12,
                          minutes: int = 5) -> list[int]:
    """D3/R8/R10: last `buckets`x`minutes` event counts, oldest->newest,
    anchored to now_iso (server time). number[buckets], zero-filled. The
    ONLY home is /api/repos (per-repo sparkline)."""
    from datetime import datetime, timedelta
    now = datetime.fromisoformat(now_iso.replace("Z", "+00:00"))
    start = now - timedelta(minutes=buckets * minutes)
    out = [0] * buckets
    rows = get_conn().execute(
        "SELECT ts FROM events WHERE repo_id = ? AND ts >= ?",
        (repo_id, start.isoformat().replace("+00:00", "Z")),
    ).fetchall()
    for r in rows:
        try:
            t = datetime.fromisoformat(r["ts"].replace("Z", "+00:00"))
        except ValueError:
            continue
        idx = int((t - start).total_seconds() // (minutes * 60))
        if 0 <= idx < buckets:
            out[idx] += 1
    return out


def _is_plan_file (plan_files: set, repo_id: str, file: str) -> bool:
    """v0.1.10.0 A.1 (Amendment A1): the DOUBLE plan-file exclusion - a file
    is plan-shaped if the parsed tasks table says so OR its basename follows
    the documented PLAN_*.txt naming (Plan_Format_Spec). Plans absent from
    the task cache (done/re-synced/legacy) escape the tasks-table set alone
    (RV2, dry-run-proven on the real DB); the basename arm is purely
    additive. Shared by coupling (BOTH call sites) + identity + churn."""
    if (repo_id, file) in plan_files:
        return True
    base = file.rsplit("/", 1)[-1]
    return base.startswith("PLAN_") and base.endswith(".txt")


def get_stats (repo_ids: list[str], now_iso: str) -> dict:
    """D5: fixed-shape aggregates over `repo_ids` (R23: caller passes the
    CONFIGURED ids for ALL scope, or a single id for a repo scope).
    R1 zero-fill: all 6 modes, exactly 14 UTC days oldest->newest."""
    from datetime import datetime, timedelta
    conn = get_conn()
    if not repo_ids:
        return {"mode_counts": {m: 0 for m in ALL_MODES},
                "events_per_task": [],
                "activity_daily": _empty_daily(now_iso),
                "activity_calendar": _empty_calendar(now_iso),  # RV28: fixed shape
                "effort_per_task": [],  # v0.1.6.0 B.1: fixed shape (RV28 rule)
                "punch_card": [[0] * 24 for _ in range(7)],  # v0.1.7.0 A.1
                "file_coupling": [],  # v0.1.7.0 A.1: fixed shape (RV28 rule)
                "wrapped": _empty_wrapped(now_iso),  # v0.1.8.0 A.2
                # v0.1.10.0 A.1: fixed shapes (RV28 rule)
                "identity": {"extensions": [], "ext_total": 0, "sessions": 0,
                             "first_event_ts": None, "commits": 0},
                "file_churn": [],
                # v0.2.11.0 A.1: fixed shape (RV28 rule)
                "provenance": {"commits_observed": 0, "commits_pre": 0,
                               "slots_total": 0, "slots_ai": 0,
                               "top_files": []}}
    placeholders = ",".join("?" * len(repo_ids))

    # mode_counts: zero-filled to all 6 (R1)
    raw_modes = {
        r["mode"]: r["c"]
        for r in conn.execute(
            f"SELECT mode, COUNT(*) c FROM events WHERE repo_id IN ({placeholders}) "
            f"GROUP BY mode", repo_ids)
    }
    mode_counts = {m: raw_modes.get(m, 0) for m in ALL_MODES}

    # events_per_task: (repo, task_ref), exclude NULL (R13), top 10 (R6)
    events_per_task = [
        {"repo": r["repo_id"], "task_ref": r["task_ref"], "count": r["c"]}
        for r in conn.execute(
            f"SELECT repo_id, task_ref, COUNT(*) c FROM events "
            f"WHERE task_ref IS NOT NULL AND repo_id IN ({placeholders}) "
            f"GROUP BY repo_id, task_ref ORDER BY c DESC LIMIT 10", repo_ids)
    ]

    # activity_daily: exactly 14 UTC days, oldest->newest, zero-filled (R1)
    raw_days = {
        r["d"]: r["c"]
        for r in conn.execute(
            f"SELECT substr(ts, 1, 10) d, COUNT(*) c FROM events "
            f"WHERE repo_id IN ({placeholders}) GROUP BY d", repo_ids)
    }
    today = datetime.fromisoformat(now_iso.replace("Z", "+00:00")).date()
    activity_daily = [
        {"day": (day := (today - timedelta(days=i)).isoformat()),
         "count": raw_days.get(day, 0)}
        for i in range(13, -1, -1)
    ]

    # v0.1.6.0 D1 (B.1): effort aggregates - one ordered scan feeds both
    # the per-task clustering (task_ref NOT NULL only; sessions = distinct
    # non-null (provider, session_id), with legacy NULL provider = Claude)
    # and the per-UTC-day minutes (all events; a block
    # crossing midnight splits at the bucket boundary - accepted). The
    # SELECT is ORDER BY ts, so every per-group list stays sorted.
    # v0.1.7.0 D3 (A.1): the punch card rides the SAME scan — 7x24 counts in
    # SERVER-LOCAL hours; row = (weekday() + 1) % 7 (Sunday-first; Python
    # weekday() is MONDAY=0 — the RV2 trap). Labelled "(local time)" in UI.
    punch_card = [[0] * 24 for _ in range(7)]
    task_events: dict = {}
    day_epochs: dict = {}
    for r in conn.execute(
            f"SELECT ts, task_ref, repo_id, provider, session_id FROM events "
            f"WHERE repo_id IN ({placeholders}) ORDER BY ts", repo_ids):
        epoch = _ts_epoch(r["ts"])
        if epoch is None:
            continue
        try:
            # CFT-1: fromtimestamp raises OSError on Windows for a NEGATIVE
            # epoch — an AWARE pre-1970 hand-crafted ts ("1969-...Z") passes
            # _ts_epoch (pure arithmetic) and would 500 /api/stats here.
            # Skip the BUCKET only; the row still feeds effort + calendar
            # (float arithmetic — the v0.1.6.0 behavior, unchanged).
            local = datetime.fromtimestamp(epoch)
            punch_card[(local.weekday() + 1) % 7][local.hour] += 1
        except (OSError, OverflowError, ValueError):
            pass
        day_epochs.setdefault(r["ts"][:10], []).append(epoch)
        if r["task_ref"]:
            epochs, sessions = task_events.setdefault(
                (r["repo_id"], r["task_ref"]), ([], set()))
            epochs.append(epoch)
            if r["session_id"]:
                sessions.add((r["provider"] or "claude", r["session_id"]))
    effort_per_task = sorted(
        ({"repo": repo, "task_ref": ref,
          "minutes": _cluster_minutes(epochs), "sessions": len(sessions)}
         for (repo, ref), (epochs, sessions) in task_events.items()),
        key=lambda e: -e["minutes"])[:10]  # top 10 (the R6 precedent)

    # v0.1.7.0 D1 (A.1): change coupling - task-level pair mining over
    # DISTINCT (repo, task_ref, file) triples. Noise guards: tasks with
    # >30 distinct files are skipped (a mega-task couples everything);
    # PLAN FILES are excluded via the already-parsed tasks table (they
    # ride along with most tasks - pure meta-coupling).
    plan_files = {
        (r["repo_id"], r["plan_file"])
        for r in conn.execute("SELECT DISTINCT repo_id, plan_file FROM tasks")
    }
    task_files: dict = {}
    for r in conn.execute(
            f"SELECT DISTINCT repo_id, task_ref, file FROM events "
            f"WHERE task_ref IS NOT NULL AND repo_id IN ({placeholders})",
            repo_ids):
        if _is_plan_file(plan_files, r["repo_id"], r["file"]):  # A1 retrofit
            continue
        task_files.setdefault((r["repo_id"], r["task_ref"]), set()).add(r["file"])
    pair_counts: dict = {}
    for (repo, _ref), files in task_files.items():
        if len(files) > 30:
            continue  # mega-task cap
        ordered = sorted(files)  # file_a < file_b - deterministic pair order
        for i, file_a in enumerate(ordered):
            for file_b in ordered[i + 1:]:
                key = (repo, file_a, file_b)
                pair_counts[key] = pair_counts.get(key, 0) + 1
    file_coupling = [
        {"repo": repo, "file_a": a, "file_b": b, "shared": n}
        for (repo, a, b), n in sorted(
            pair_counts.items(), key=lambda kv: (-kv[1], kv[0]))[:10]
    ]  # ties break by (repo, file_a, file_b) ascending - stable top-10

    # v0.1.10.0 A.1 (D1+D2): ONE file-level scan feeds identity + churn -
    # plan files excluded via the A1 double exclusion (the shared helper).
    file_rows = [
        r for r in conn.execute(
            f"SELECT repo_id, file, COUNT(*) c, MAX(ts) m FROM events "
            f"WHERE repo_id IN ({placeholders}) GROUP BY repo_id, file",
            repo_ids)
        if not _is_plan_file(plan_files, r["repo_id"], r["file"])
    ]
    # EXT RULE (D1): lowercase tail after the LAST "." of the BASENAME;
    # no dot / empty tail -> "" (the client labels it "(no ext)").
    ext_counts: dict[str, int] = {}
    for r in file_rows:
        base = r["file"].rsplit("/", 1)[-1]
        tail = base.rsplit(".", 1)[1].lower() if "." in base else ""
        ext_counts[tail] = ext_counts.get(tail, 0) + r["c"]
    identity = {
        "extensions": [
            {"ext": e, "count": c}
            for e, c in sorted(ext_counts.items(), key=lambda kv: (-kv[1], kv[0]))[:8]
        ],
        "ext_total": sum(ext_counts.values()),
        "sessions": conn.execute(
            f"SELECT COUNT(*) FROM (SELECT 1 FROM events "
            f"WHERE session_id IS NOT NULL AND repo_id IN ({placeholders}) "
            f"GROUP BY COALESCE(provider, 'claude'), session_id)",
            repo_ids).fetchone()[0],
        "first_event_ts": conn.execute(
            f"SELECT MIN(ts) FROM events WHERE repo_id IN ({placeholders})",
            repo_ids).fetchone()[0],
        # ALL-TIME commits - the 365d calendar is the wrong "since born" basis
        "commits": conn.execute(
            f"SELECT COUNT(*) FROM commits WHERE repo_id IN ({placeholders})",
            repo_ids).fetchone()[0],
    }
    file_churn = [
        {"repo": r["repo_id"], "file": r["file"], "events": r["c"], "last_ts": r["m"]}
        for r in sorted(file_rows, key=lambda r: (-r["c"], r["repo_id"], r["file"]))[:20]
    ]

    # v0.2.11.0 A.1 (D1-D5): AI-touch provenance. A commit is OBSERVED only
    # from its OWN repo's first capture onward (D2) - the startup backfill
    # seeds ~20 pre-tracking commits per repo, which would otherwise read
    # "0% AI" and be counted as a real measurement. A file-slot inside an
    # observed commit is AI-touched when that commit's OWN linked events
    # name it (D3): the map is keyed by the PAIR (repo_id, commit_hash),
    # never the hash alone - that pair is the commits PRIMARY KEY, and two
    # repos really can share a hash through common upstream history (the
    # DB holds 16 such, all EA_Dev<->EA_Exec; EA_Exec is de-configured, so
    # zero are shared among CONFIGURED repos today - this is a guard
    # against a proven-possible topology, not a fix for a live number).
    # Plan files are excluded on both sides via the A1 double exclusion
    # (a guard too: the configured repos gitignore their temp/ plan trees,
    # so it currently filters nothing - but a repo that COMMITS its plans
    # would otherwise inflate its own share with meta-edits).
    prov_first = {
        r["repo_id"]: r["m"]
        for r in conn.execute(
            f"SELECT repo_id, MIN(ts) m FROM events "
            f"WHERE repo_id IN ({placeholders}) GROUP BY repo_id", repo_ids)
    }
    prov_linked: dict = {}
    for r in conn.execute(
            f"SELECT repo_id, commit_hash, file FROM events "
            f"WHERE commit_hash IS NOT NULL AND repo_id IN ({placeholders})",
            repo_ids):
        prov_linked.setdefault((r["repo_id"], r["commit_hash"]), set()).add(r["file"])
    observed = pre = slots_total = slots_ai = 0
    per_file: dict = {}
    for c in conn.execute(
            f"SELECT repo_id, hash, ts, files_json FROM commits "
            f"WHERE repo_id IN ({placeholders})", repo_ids):
        first_ts = prov_first.get(c["repo_id"])
        if first_ts is None or c["ts"] < first_ts:   # D2 gate (ISO-Z text compare)
            pre += 1
            continue
        observed += 1
        touched = prov_linked.get((c["repo_id"], c["hash"]), set())  # D3 pair key
        for f in json.loads(c["files_json"]):
            if _is_plan_file(plan_files, c["repo_id"], f):           # D4 (A1)
                continue
            slots_total += 1
            hit = 1 if f in touched else 0
            slots_ai += hit
            t, a = per_file.get((c["repo_id"], f), (0, 0))
            per_file[(c["repo_id"], f)] = (t + 1, a + hit)
    provenance = {
        "commits_observed": observed, "commits_pre": pre,
        "slots_total": slots_total, "slots_ai": slots_ai,
        "top_files": [
            {"repo": repo, "file": file, "commits": t, "ai_commits": a}
            for (repo, file), (t, a) in sorted(
                per_file.items(),
                key=lambda kv: (-kv[1][0], kv[0][0], kv[0][1]))[:8]],
    }

    # v0.1.5.0 D2 (B.1): 365-day calendar - events reuse raw_days (already a
    # full-table day GROUP BY); commits bucketed identically. Zero-filled,
    # oldest->newest, UTC days. Present in BOTH return paths (RV28).
    # v0.1.6.0 D1: each day gains "minutes" (same fixed-shape rule).
    raw_commit_days = {
        r["d"]: r["c"]
        for r in conn.execute(
            f"SELECT substr(ts, 1, 10) d, COUNT(*) c FROM commits "
            f"WHERE repo_id IN ({placeholders}) GROUP BY d", repo_ids)
    }
    activity_calendar = [
        {"day": (day := (today - timedelta(days=i)).isoformat()),
         "events": raw_days.get(day, 0),
         "commits": raw_commit_days.get(day, 0),
         "minutes": _cluster_minutes(day_epochs.get(day, []))}
        for i in range(364, -1, -1)
    ]

    # v0.1.8.0 D3 (A.2): `wrapped` - the last-7-UTC-days story (today
    # inclusive). days = the calendar's last-7 PROJECTION (RV4 - the
    # calendar already computes per-day minutes, never recomputed); the
    # window algorithms mirror their all-time homes verbatim with
    # deterministic tie-breaks (RV5); nullable sub-objects, fixed shape
    # in BOTH return paths (the v0.1.5.0 RV28 rule).
    win_start = (today - timedelta(days=6)).isoformat() + "T00:00:00Z"
    win_task: dict = {}
    win_sessions: dict = {}
    for r in conn.execute(
            f"SELECT repo_id, task_ref, ts, provider, session_id FROM events "
            f"WHERE task_ref IS NOT NULL AND ts >= ? "
            f"AND repo_id IN ({placeholders}) ORDER BY ts",
            [win_start, *repo_ids]):
        epoch = _ts_epoch(r["ts"])
        if epoch is None:
            continue
        key = (r["repo_id"], r["task_ref"])
        win_task.setdefault(key, []).append(epoch)
        if r["session_id"]:
            win_sessions.setdefault(key, set()).add(
                (r["provider"] or "claude", r["session_id"]))
    top_task = min(
        ({"repo": k[0], "task_ref": k[1], "minutes": _cluster_minutes(v),
          "sessions": len(win_sessions.get(k, set()))}
         for k, v in win_task.items()),
        key=lambda e: (-e["minutes"], e["repo"], e["task_ref"]),
        default=None)
    win_cells: dict = {}
    for r in conn.execute(
            f"SELECT ts FROM events WHERE ts >= ? "
            f"AND repo_id IN ({placeholders})", [win_start, *repo_ids]):
        epoch = _ts_epoch(r["ts"])
        if epoch is None:
            continue
        try:
            # the v0.1.7.0 CFT-1 guard: Windows OSError on negative epochs
            local = datetime.fromtimestamp(epoch)
            cell = ((local.weekday() + 1) % 7, local.hour)
            win_cells[cell] = win_cells.get(cell, 0) + 1
        except (OSError, OverflowError, ValueError):
            pass
    busiest_hour = min(
        ({"dow": k[0], "hour": k[1], "events": n} for k, n in win_cells.items()),
        key=lambda c: (-c["events"], c["dow"], c["hour"]),
        default=None)
    win_files: dict = {}
    for r in conn.execute(
            f"SELECT DISTINCT repo_id, task_ref, file FROM events "
            f"WHERE task_ref IS NOT NULL AND ts >= ? "
            f"AND repo_id IN ({placeholders})", [win_start, *repo_ids]):
        if _is_plan_file(plan_files, r["repo_id"], r["file"]):  # A1 retrofit
            continue
        win_files.setdefault((r["repo_id"], r["task_ref"]), set()).add(r["file"])
    win_pairs: dict = {}
    for (repo, _ref), files in win_files.items():
        if len(files) > 30:
            continue  # the mega-task cap, window flavor
        ordered = sorted(files)
        for i, file_a in enumerate(ordered):
            for file_b in ordered[i + 1:]:
                pair = (repo, file_a, file_b)
                win_pairs[pair] = win_pairs.get(pair, 0) + 1
    top_pair = None
    if win_pairs:
        (repo, a, b), n = min(win_pairs.items(), key=lambda kv: (-kv[1], kv[0]))
        top_pair = {"repo": repo, "file_a": a, "file_b": b, "shared": n}
    files_touched = conn.execute(
        f"SELECT COUNT(*) c FROM (SELECT DISTINCT repo_id, file FROM events "
        f"WHERE ts >= ? AND repo_id IN ({placeholders}))",
        [win_start, *repo_ids]).fetchone()["c"]  # plan files INCLUDED (RV10)
    win_commits = conn.execute(
        f"SELECT COUNT(*) c FROM commits WHERE ts >= ? "
        f"AND repo_id IN ({placeholders})",
        [win_start, *repo_ids]).fetchone()["c"]
    wrapped = {
        "days": [{"day": d["day"], "events": d["events"], "minutes": d["minutes"]}
                 for d in activity_calendar[-7:]],
        "top_task": top_task, "busiest_hour": busiest_hour,
        "files_touched": files_touched, "commits": win_commits,
        "top_pair": top_pair,
    }

    return {"mode_counts": mode_counts, "events_per_task": events_per_task,
            "activity_daily": activity_daily,
            "activity_calendar": activity_calendar,
            "effort_per_task": effort_per_task,
            "punch_card": punch_card,
            "file_coupling": file_coupling,
            "wrapped": wrapped,
            "identity": identity,      # v0.1.10.0 A.1 (D1)
            "file_churn": file_churn,  # v0.1.10.0 A.1 (D2)
            "provenance": provenance}  # v0.2.11.0 A.1 (D1-D5)


def _empty_wrapped (now_iso: str) -> dict:
    """v0.1.8.0 A.2: fixed empty-scope `wrapped` shape (the v0.1.5.0 RV28
    rule) - 7 zero days (the calendar projection), null sub-objects."""
    return {"days": [{"day": d["day"], "events": 0, "minutes": 0}
                     for d in _empty_calendar(now_iso)[-7:]],
            "top_task": None, "busiest_hour": None,
            "files_touched": 0, "commits": 0, "top_pair": None}


def _empty_daily (now_iso: str) -> list[dict]:
    from datetime import datetime, timedelta
    today = datetime.fromisoformat(now_iso.replace("Z", "+00:00")).date()
    return [{"day": (today - timedelta(days=i)).isoformat(), "count": 0}
            for i in range(13, -1, -1)]


def _empty_calendar (now_iso: str) -> list[dict]:
    """v0.1.5.0 B.1 (RV28): zero-filled 365-day shape for the empty scope.
    v0.1.6.0 B.1: minutes joins the fixed shape."""
    from datetime import datetime, timedelta
    today = datetime.fromisoformat(now_iso.replace("Z", "+00:00")).date()
    return [{"day": (today - timedelta(days=i)).isoformat(),
             "events": 0, "commits": 0, "minutes": 0}
            for i in range(364, -1, -1)]


def get_history (repo_id: str, limit: int = 500, offset: int = 0) -> list[dict]:
    """History tab: commits (paginated, newest first) with their linked events."""
    conn = get_conn()
    commits = conn.execute(
        "SELECT * FROM commits WHERE repo_id = ? ORDER BY ts DESC LIMIT ? OFFSET ?",
        (repo_id, limit, offset),
    ).fetchall()
    result = []
    for c in commits:
        events = conn.execute(
            "SELECT * FROM events WHERE repo_id = ? AND commit_hash = ? ORDER BY ts",
            (repo_id, c["hash"]),
        ).fetchall()
        result.append({"commit": dict(c), "events": [dict(e) for e in events]})
    return result
