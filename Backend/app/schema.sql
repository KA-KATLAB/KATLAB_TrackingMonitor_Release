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

CREATE TABLE IF NOT EXISTS plan_snapshots (
    repo_id         TEXT NOT NULL,
    plan_file       TEXT NOT NULL,
    content_sha256  TEXT NOT NULL,
    revision_at     TEXT NOT NULL,
    parse_state     TEXT NOT NULL,       -- valid | warning | fatal
    warning_codes_json TEXT NOT NULL,    -- bounded safe codes, never source text
    last_seen_at    TEXT NOT NULL,
    PRIMARY KEY (repo_id, plan_file)
);

CREATE TABLE IF NOT EXISTS plan_requirements (
    repo_id         TEXT NOT NULL,
    plan_file       TEXT NOT NULL,
    check_id        TEXT NOT NULL,
    streak_target   INTEGER,
    source_order    INTEGER NOT NULL,
    requirement_revision TEXT NOT NULL,
    revision_at     TEXT NOT NULL,
    PRIMARY KEY (repo_id, plan_file, check_id)
);

CREATE INDEX IF NOT EXISTS idx_plan_requirements_check
    ON plan_requirements (repo_id, check_id, plan_file);

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
    session_id      TEXT,               -- v0.1.5.0 D1: provider session (NULL = pre-upgrade/unknown)
    branch          TEXT,               -- v0.1.6.0 D2: git branch at capture (NULL = pre-upgrade/unknown)
    provider        TEXT,
    turn_id         TEXT,
    agent_id        TEXT,
    tool_use_id     TEXT,
    operation       TEXT,
    plan_file       TEXT,
    task_id         TEXT
);

CREATE TABLE IF NOT EXISTS activity_events (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    uid                  TEXT NOT NULL UNIQUE,
    record_sha256        TEXT NOT NULL,
    schema_version       INTEGER NOT NULL,
    provider             TEXT NOT NULL,
    evidence_source      TEXT NOT NULL,
    kind                 TEXT NOT NULL,
    ts                   TEXT NOT NULL,
    delivery_class       TEXT NOT NULL,
    session_id           TEXT,
    turn_id              TEXT,
    agent_id             TEXT,
    parent_agent_id      TEXT,
    agent_type           TEXT,
    model                TEXT,
    permission_mode      TEXT,
    tool_use_id          TEXT,
    tool_name            TEXT,
    tool_class           TEXT,
    plan_repo_id         TEXT,
    plan_file            TEXT,
    task_ref             TEXT,
    assignment_mode      TEXT NOT NULL,
    outcome              TEXT,
    duration_ms          INTEGER,
    check_id             TEXT,
    check_revision       TEXT,
    requirement_revision TEXT,
    plan_revision        TEXT,
    created_at           TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS activity_repo_links (
    activity_id INTEGER NOT NULL REFERENCES activity_events(id),
    repo_id     TEXT NOT NULL REFERENCES repos(id),
    PRIMARY KEY (activity_id, repo_id)
);

CREATE TABLE IF NOT EXISTS activity_counters (
    name  TEXT PRIMARY KEY,
    value INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS activity_assignments (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    activity_id          INTEGER NOT NULL REFERENCES activity_events(id),
    repo_id              TEXT NOT NULL REFERENCES repos(id),
    action               TEXT NOT NULL,
    plan_file            TEXT,
    requirement_revision TEXT,
    plan_revision        TEXT,
    assigned_at          TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_activity_provider_session
    ON activity_events (provider, session_id, id);
CREATE INDEX IF NOT EXISTS idx_activity_kind_time
    ON activity_events (kind, ts, id);
CREATE INDEX IF NOT EXISTS idx_activity_plan_check
    ON activity_events (plan_repo_id, plan_file, check_id, id);
CREATE INDEX IF NOT EXISTS idx_activity_attempt
    ON activity_events (provider, session_id, tool_use_id, check_id, check_revision, id);
CREATE INDEX IF NOT EXISTS idx_activity_repo_link
    ON activity_repo_links (repo_id, activity_id);
CREATE INDEX IF NOT EXISTS idx_activity_assignments_activity
    ON activity_assignments (activity_id, id);
CREATE INDEX IF NOT EXISTS idx_activity_assignments_plan
    ON activity_assignments (repo_id, plan_file, id);

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
