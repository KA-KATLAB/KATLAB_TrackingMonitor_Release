# Mission API contract — v0.3.0.0

All REST responses use the existing envelope:

```json
{"success":true,"data":{},"message":"","timestamp":"2026-09-07T00:00:00Z"}
```

Errors use HTTP 4xx/5xx. Clients must treat REST as authoritative; WebSocket
messages are bounded invalidation signals, not a replicated data store.

## Shared rules

- Timestamps are ISO-8601 UTC strings ending in `Z`.
- `limit` is clamped to `1..2000`; defaults are `50` for new paged routes.
- `offset` must be non-negative.
- `order` is `asc` or `desc`; rows use timestamp and then database ID.
- Provider is `claude`, `codex`, or `manual` for activity. File events allow
  `claude` or `codex`; a legacy NULL file-event provider projects as `claude`.
- Session identity is always `(provider, session_id)`.
- Repository IDs and plan paths must refer to current configured data.
- No activity response includes prompts, commands, output, source content,
  rejected filenames/content, absolute monitored paths, or record hashes.

## `GET /api/mission`

Query: optional `repo`. Unknown repositories return 404.

Data root:

```text
{
  scope: {kind: "all"|"repo", repo: string|null},
  generated_at: string,
  summary: {total: integer, states: {<all seven mission states>: integer}},
  plans: MissionPlan[]
}
```

All seven summary keys are always present: `not_configured`, `planning`,
`implementation`, `verification`, `blocked`, `ready_to_commit`, and
`verified_committed`.

`MissionPlan`:

```text
{
  repo: string, plan_file: string, label: string,
  revision: string, revision_at: string,
  parse_state: "valid"|"warning"|"fatal",
  task_counts: {total: integer, pending: integer, in_progress: integer, done: integer},
  current_task: {id: string, title: string}|null,
  state: MissionState,
  repo_status: {
    clean: boolean, count: integer, offline: boolean, branch: string|null,
    status_valid: boolean, observed_at: string|null
  },
  requirements: Requirement[], blockers: Reason[], warnings: Reason[],
  unresolved_count: integer
}
```

`Requirement` contains `check_id`, `label`, `state`, `configuration_valid`,
`evidence_sources`, nullable `check_revision`, nullable `current`, nullable `target`,
nullable `latest_outcome`, nullable `evidence_id`, nullable `observed_at`,
`freshness_floor`, and nullable `reason_code`. `evidence_sources` is the sorted
current subset of `hook` and `manual`; `check_revision` is the current automated
registry revision or NULL for review requirements. These safe policy facts keep
assignment choices aligned with backend validation. Requirement state is one of
`missing`, `stale`, `incomplete`, `failed`, `unknown`, `finding`, `partial`, or
`passed`.

`Reason` is `{code:string,message:string,check_id:string|null,count:integer|null}`.
Readiness and reasons are computed only by the backend.

## `GET /api/activity`

Optional exact filters: `repo`, `provider`, `session`, `kind`, `check`, `plan`,
`order`, `limit`, and `offset`. `session` requires `provider`; `plan` requires
`repo`. A combined plan/check query requires that the current valid plan declares
that check. Activity kind is one of `session_start`, `session_end`, `turn_stop`,
`turn_interrupt`, `agent_start`, `agent_stop`, `tool_finished`, `check_started`,
`check_finished`, or `review_result`.

Data root is always:

```text
{items: Activity[], total: integer, limit: integer, offset: integer,
 order: "asc"|"desc"}
```

Each `Activity` has:

```text
id: integer                    evidence_id: integer
uid: string                    schema_version: integer
provider: Provider             evidence_source: "hook"|"manual"
kind: ActivityKind             ts: string
delivery_class: "durable"|"best_effort"
session_id: string|null        turn_id: string|null
agent_id: string|null          parent_agent_id: string|null
agent_type: string|null        model: string|null
permission_mode: string|null   tool_use_id: string|null
tool_name: string|null         tool_class: string|null
outcome: string|null           duration_ms: integer|null
check_id: string|null          check_revision: string|null
repo_ids: string[]             assignment_repo_ids: string[]
created_at: string
original_assignment: Assignment
effective_assignment: Assignment
```

`Assignment` is `{mode,repo,plan_file,task_ref,requirement_revision,plan_revision}`;
all fields except `mode` are nullable. Mode is `NONE`, `UNASSIGNED`,
`AUTO_ACTIVE`, `AUTO_VERIFYING`, `EXPLICIT_TARGET`, or `MANUAL_ASSIGNMENT`.
Plan filtering uses `effective_assignment`. `repo_ids` contains the immutable
row's direct links; `assignment_repo_ids` contains the sorted, currently configured
direct-link union across its canonical evidence pair. Paired check rows share the
finish row's `evidence_id`, or the start row's ID while incomplete.

A repo-scoped query includes directly linked rows plus zero-link lifecycle rows
for a composite session that has a direct link to that repo. Each activity ID is
returned once.

## `GET /api/sessions`

Optional exact filters: `repo`, `provider`, `session`, `order`, `limit`, and
`offset`. `session` requires `provider`. Manual evidence without a session is
excluded.

Data root has the same paging keys as activity. Each item is:

```text
{
  provider: Provider, session_id: string,
  started_at: string, ended_at: string,
  event_count: integer, agent_count: integer, tool_count: integer,
  check_count: integer, repo_count: integer,
  delivery: "durable"|"best_effort"|"mixed",
  repo_ids: string[]
}
```

Rows are grouped by provider plus session ID. Repo scope follows the same admitted
zero-link rule as activity.

## `PATCH /api/activity/{id}/plan`

Strict body (unknown keys are rejected):

```json
{"repo":"Repo_A","plan_file":"temp/Plan/PLAN_X.txt"}
```

Set `plan_file` to NULL to append a clear action. The target must be canonical,
assignable check/review evidence, directly linked to the repository by either row
of its canonical pair, allowed by the check's evidence-source policy, and
compatible with the current valid plan requirement. Clear must name the current
effective repository. The immutable activity row is never rewritten. For a
canonical start/finish pair, the newest assignment across the pair wins.

Data root:

```text
{activity_id: integer, assignment_id: integer,
 effective_assignment: Assignment}
```

`activity_id` is the canonical `evidence_id`. The database transaction commits
before `evidence_updated`, followed by `readiness_updated`. Both signals name the
union of prior and new effective repository scopes.

## Existing `GET /api/events`

The existing array-shaped data root is retained. It adds optional `provider` and
the nullable fields `provider`, `turn_id`, `agent_id`, `tool_use_id`, `operation`,
`plan_file`, and `task_id`. Its legacy session-only filter remains valid across
providers.

## `GET /api/health` additions

Existing `server` and `repos` fields remain. The data root also contains:

```text
activity: {pending: integer, rejected: integer, ignored_unscoped: integer,
           registry_revision_mismatch: integer}
providers: [{
  provider: "claude"|"codex", adapter_present: boolean,
  configuration_valid: boolean, configuration_state: string,
  recently_observed: boolean, last_observed_at: string|null
}]
```

`configuration_valid` requires each registered command to contain the exact
quoted adapter path, the complete provider/channel argument vector with no extra
arguments, and a boolean `async` value matching the generated registration.

Provider facts are independent. Configuration validation is a read-only exact
registration check against the resolved local hook path and required signatures;
recent observation means a stored event within 24 hours.
Health never returns settings content or provider identifiers such as sessions.
`registry_revision_mismatch` is a monotonic safe count of newly ingested hook
records whose check revision is unknown to the running backend; retries do not
increment it twice.

## WebSocket invalidations

The established `{type,id,data}` frame stays compatible. New types are:

- `activity_recorded`: `{repo_ids:string[],count:integer,latest_id:integer|null}`;
- `evidence_updated`: `{repo_ids:string[],activity_id:integer,assignment_id:integer}`;
- `readiness_updated`: `{repo_ids:string[]}`.

Existing `event_resolved`, `task_updated`, `repo_status_changed`,
`commit_detected`, and `warning` frames remain supported. Clients debounce and
refetch the applicable REST resource after any invalidation or reconnect.
