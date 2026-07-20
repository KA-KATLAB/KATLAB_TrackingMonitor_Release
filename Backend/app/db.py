"""SQLite data layer (PLAN v0.1.0.0 C.2). stdlib sqlite3 + WAL, no ORM."""

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
    # v0.1.5.0 D1 + v0.1.6.0 D2 (A.2): additive migrations for pre-existing
    # databases - CREATE IF NOT EXISTS above never alters an existing events
    # table. Idempotent needed-columns loop: PRAGMA-guarded, one ALTER per
    # missing column, covers v0.1.4.0-era AND v0.1.5.0-era databases.
    columns = {row["name"] for row in conn.execute("PRAGMA table_info(events)")}
    for column in ("session_id", "branch"):
        if column not in columns:
            conn.execute(f"ALTER TABLE events ADD COLUMN {column} TEXT")
    for repo in repos:
        conn.execute(
            "INSERT INTO repos (id, name, path) VALUES (?, ?, ?) "
            "ON CONFLICT(id) DO UPDATE SET name = excluded.name, path = excluded.path",
            (repo.id, repo.name, str(repo.path)),
        )
    conn.commit()


# --- tasks (F11/F16: atomic per-plan sync) ----------------------------------

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
                "INSERT INTO events (repo_id, ts, tool, file, task_ref, mode, candidates_json, session_id, branch) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (repo_id, e["ts"], e["tool"], e["file"], e.get("task_ref"),
                 e["mode"], json.dumps(e["candidates"]) if e.get("candidates") else None,
                 e.get("session_id"), e.get("branch")),
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
                file: str | None = None) -> list[sqlite3.Row]:
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
    query += " ORDER BY id DESC LIMIT ? OFFSET ?"  # F38 pagination
    params += [limit, offset]
    return get_conn().execute(query, params).fetchall()


def get_event (event_id: int) -> sqlite3.Row | None:
    return get_conn().execute("SELECT * FROM events WHERE id = ?", (event_id,)).fetchone()


def set_manual_task (event_id: int, task_ref: str) -> None:
    with get_conn() as conn:
        conn.execute(
            "UPDATE events SET task_ref = ?, mode = 'MANUAL' WHERE id = ?",
            (task_ref, event_id),
        )


# --- commits + linking (F9/F32/F35/F36 sweep) --------------------------------

def upsert_commit (repo_id: str, commit: dict) -> None:
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO commits (repo_id, hash, message, ts, files_json) VALUES (?, ?, ?, ?, ?) "
            "ON CONFLICT(repo_id, hash) DO UPDATE SET message = excluded.message, "
            "ts = excluded.ts, files_json = excluded.files_json",
            (repo_id, commit["hash"], commit["message"], commit["ts"],
             json.dumps(commit["files"])),
        )


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
                "file_coupling": []}  # v0.1.7.0 A.1: fixed shape (RV28 rule)
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
    # non-null session_id) and the per-UTC-day minutes (all events; a block
    # crossing midnight splits at the bucket boundary - accepted). The
    # SELECT is ORDER BY ts, so every per-group list stays sorted.
    # v0.1.7.0 D3 (A.1): the punch card rides the SAME scan — 7x24 counts in
    # SERVER-LOCAL hours; row = (weekday() + 1) % 7 (Sunday-first; Python
    # weekday() is MONDAY=0 — the RV2 trap). Labelled "(local time)" in UI.
    punch_card = [[0] * 24 for _ in range(7)]
    task_events: dict = {}
    day_epochs: dict = {}
    for r in conn.execute(
            f"SELECT ts, task_ref, repo_id, session_id FROM events "
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
                sessions.add(r["session_id"])
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
        if (r["repo_id"], r["file"]) in plan_files:
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

    return {"mode_counts": mode_counts, "events_per_task": events_per_task,
            "activity_daily": activity_daily,
            "activity_calendar": activity_calendar,
            "effort_per_task": effort_per_task,
            "punch_card": punch_card,
            "file_coupling": file_coupling}


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
