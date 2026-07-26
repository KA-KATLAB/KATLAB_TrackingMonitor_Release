-- KATLAB TrackingMonitor schema (PLAN v0.1.0.0 C.2)

CREATE TABLE IF NOT EXISTS repos (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    path        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
    repo_id     TEXT NOT NULL,
    plan_file   TEXT NOT NULL,          -- plan filename (repo-relative path)
    task_id     TEXT NOT NULL,          -- e.g. "B.1"
    title       TEXT NOT NULL,
    status      TEXT NOT NULL,          -- pending | in-progress | done
    files_json  TEXT NOT NULL,          -- JSON array of glob patterns
    why         TEXT NOT NULL,          -- reason text ('' -> UI falls back to title, F53)
    PRIMARY KEY (repo_id, plan_file, task_id)
);

CREATE TABLE IF NOT EXISTS events (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    repo_id         TEXT NOT NULL,
    ts              TEXT NOT NULL,      -- ISO 8601 UTC-Z
    tool            TEXT NOT NULL,
    file            TEXT NOT NULL,      -- repo-relative, forward slashes
    task_ref        TEXT,               -- "<plan filename> - <task id>" or NULL
    mode            TEXT NOT NULL,      -- B|A_SCOPED|A_GLOBAL|AMBIGUOUS|UNKNOWN|MANUAL
    candidates_json TEXT,               -- F12: AMBIGUOUS pick list
    commit_hash     TEXT,               -- linked commit or NULL (uncommitted)
    swept           INTEGER NOT NULL DEFAULT 0, -- F9: 1 = linked indirectly at CLEAN
    session_id      TEXT,               -- v0.1.5.0 D1: Claude session (NULL = pre-upgrade/unknown)
    branch          TEXT                -- v0.1.6.0 D2: git branch at capture (NULL = pre-upgrade/unknown)
);

CREATE TABLE IF NOT EXISTS commits (
    repo_id     TEXT NOT NULL,
    hash        TEXT NOT NULL,
    message     TEXT NOT NULL,
    ts          TEXT NOT NULL,          -- ISO 8601 UTC-Z
    files_json  TEXT NOT NULL,          -- JSON array of touched files
    parents     TEXT,                   -- v0.1.9.0: space-separated parent hashes ("" = root, NULL = pre-upgrade)
    PRIMARY KEY (repo_id, hash)
);

CREATE TABLE IF NOT EXISTS ingest_state (
    repo_id       TEXT PRIMARY KEY,
    events_offset INTEGER NOT NULL DEFAULT 0   -- F8: byte offset into events.jsonl
);
