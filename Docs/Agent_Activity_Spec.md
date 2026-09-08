# KATLAB Agent Activity Contract v1

This document is the normative transport and privacy contract for the
provider-neutral activity ledger introduced in TrackingMonitor v0.3.0.0.
It supplements, and does not replace, the existing `events.jsonl` v1 file-event
plane.

## 1. Trust boundary

- Capture is limited to repositories proved by the startup registry.
- Provider execution must never be blocked by a capture failure.
- Capture itself is fail-closed: an unreadable, invalid, or empty repository
  registry produces no file, activity, or check record.
- The root and repository rows are closed mappings. Duplicate YAML mapping keys at
  any backend config depth, any noncanonical/second top-level `repos` spelling,
  unsupported root syntax/settings, nested ID/path lookalikes, or unknown row
  settings invalidate capture instead of widening the allowlist.
- Absolute repository paths are used transiently for containment checks only.
- A session that has never been linked to a registered repository is outside the
  ledger, even when a provider invokes a lifecycle hook for it.

## 2. Runtime transport

The default runtime root is `data/` beneath the TrackingMonitor repository:

```text
data/activity_inbox/<uid>.json
data/activity_rejected/<rejection-id>.json
```

`KATLAB_TRACKER_ACTIVITY_DIR` may replace that root only for an explicitly
isolated test or demo process. A runtime root may neither be inside nor contain a
monitored source tree.

The maximum encoded record size is 65,536 bytes (`MAX_ACTIVITY_BYTES`). A record
contains one JSON object encoded as UTF-8 without a BOM. Unknown keys make the
record invalid; the consumer never stores a generic payload or metadata map.

## 3. Allowed transport record

All string limits are measured after normalization in Unicode code points.
Whitespace-only optional strings normalize to null. Optional provider metadata
containing ASCII control characters is omitted by the adapter and rejected if it
reaches the consumer through another writer.

| Field | Type and bound | Required | Rules |
|---|---|---:|---|
| `schema_version` | integer | yes | Exactly `1`. |
| `uid` | string, 36 | yes | Canonical lowercase UUID v4 text. |
| `provider` | enum | yes | `claude`, `codex`, or `manual`. |
| `evidence_source` | enum | yes | `hook` or `manual`; must agree with provider. |
| `kind` | enum | yes | One completed/boundary kind from Section 4. |
| `ts` | string, 32 | yes | UTC ISO-8601 with `Z`; consumer canonicalizes to six fractional digits. |
| `delivery_class` | enum | yes | `durable` or `best_effort`. |
| `repo_ids` | array | yes | At most 16 unique registered IDs; sorted by writer. |
| `session_id` | string, 256 | conditional | Required for hook lifecycle records with no repo link. |
| `turn_id` | string, 256 | no | Opaque provider identifier. |
| `agent_id` | string, 256 | no | Opaque provider identifier. |
| `parent_agent_id` | string, 256 | no | Opaque provider identifier; no inferred parent. |
| `agent_type` | string, 128 | no | Bounded provider-supplied type name. |
| `model` | string, 128 | no | Bounded provider-supplied model name. |
| `permission_mode` | string, 64 | no | Bounded provider-supplied mode name. |
| `tool_use_id` | string, 256 | no | Opaque provider identifier. |
| `tool_name` | string, 128 | no | Bounded structural tool name only. |
| `tool_class` | string, 64 | no | Adapter-normalized class, not raw input. |
| `outcome` | enum | conditional | From Section 4; never inferred from a tool name. |
| `duration_ms` | integer | no | `0..86,400,000`; only when trustworthy. |
| `check_id` | string, 128 | conditional | Required for check/review kinds; verification-ID grammar. |
| `check_revision` | lowercase hex, 64 | conditional | Required for hook check rows. |
| `plan_repo_id` | string, 128 | manual only | Registered explicit evidence target. |
| `plan_file` | string, 1,024 | manual only | Normalized repo-relative forward-slash path. |
| `task_ref` | string, 1,024 | no | Compatibility display value; never a relational key. |

`repo_ids` is transport-only. After validation it is projected into normalized
repository links and discarded. `plan_repo_id`, `plan_file`, and `task_ref` are
accepted only from the explicit manual evidence producer. Provider hooks cannot
claim plan ownership. Assignment mode and all requirement/plan revisions are
backend-derived and therefore are not transport fields.

Accepted timestamps have zero through six fractional digits. Before hashing,
persistence, pairing, or pagination, the consumer normalizes them to the fixed
`YYYY-MM-DDTHH:MM:SS.ffffffZ` form. This makes SQLite text ordering identical to
chronological ordering, including events captured within the same second.

## 4. Kinds, outcomes, and delivery

Allowed `kind` values are:

- `session_start`, `session_end`;
- `turn_stop`, `turn_interrupt`;
- `agent_start`, `agent_stop`;
- `tool_finished`;
- `check_started`, `check_finished`;
- `review_result`.

Hook `check_started` requires provider, session, tool-use ID, check ID, and check
revision; it has no outcome. Hook `check_finished` requires the same attempt keys
and an outcome of `pass`, `fail`, `cancelled`, or `unknown`. If an installed-version
fixture does not prove success, the adapter emits `unknown`.

Manual `check_finished` uses provider `manual`, evidence source `manual`, durable
delivery, an explicit plan target, and `pass`, `fail`, or `cancelled`. Manual
`review_result` has the same ownership fields and uses `clean` or `finding`.
Manual evidence may have no session.

Only synchronous file and check capture, plus explicit manual evidence, are
`durable`. General asynchronous provider activity is `best_effort`. The UI must
not describe best-effort activity as an exhaustive transcript.

## 5. Provider normalization

The command-line entry point accepts only:

```text
--provider claude|codex
--channel file|activity|check
```

No arguments retains the legacy Claude file-channel behavior. Provider adapters
may inspect the exact installed-version payload in memory, ignore unknown fields,
and emit only Section 3 fields. Missing facts remain null. Provider timestamps are
used only when their fixture contract proves the format; otherwise capture time is
used. This contract claims no OpenTelemetry, OTLP, or GenAI semantic-convention
conformance.

The implementation baseline is Claude Code `2.1.258` and Codex CLI `0.153.4`.
Their supported input events normalize as follows; adapters ignore all content
fields named in Section 9:

| Provider input | KATLAB kind | Structural facts used |
|---|---|---|
| Claude `SessionStart` / `SessionEnd` | `session_start` / `session_end` | session, transient cwd membership, model/mode when supplied |
| Claude `Stop` | `turn_stop` | session and agent identifiers when supplied |
| Claude `SubagentStart` / `SubagentStop` | `agent_start` / `agent_stop` | session, agent ID/type, optional parent ID |
| Claude `PostToolUse` | `tool_finished` | tool name/use ID, duration, `success` outcome |
| Claude `PostToolUseFailure` | `tool_finished` | tool name/use ID, duration, `failure` or `cancelled` from `is_interrupt` |
| Codex `SessionStart` / `SessionEnd` | `session_start` / `session_end` | session, model, permission mode; source/reason are not persisted |
| Codex `Stop` / `Interrupt` | `turn_stop` / `turn_interrupt` | session, turn, model, permission mode |
| Codex `SubagentStart` / `SubagentStop` | `agent_start` / `agent_stop` | parent session, turn, agent ID/type, model/mode |
| Codex `PostToolUse` | `tool_finished` | session, turn, agent/type, tool name/use ID; outcome is `unknown` unless a pinned fixture proves a safe structural result |
| Either provider check `PreToolUse` / completion | `check_started` / `check_finished` | exact in-memory command match, attempt identifiers, safe outcome only |

Generic `tool_finished` outcomes are `success`, `failure`, `cancelled`, or
`unknown`; they never satisfy verification. Check and review outcome enums remain
the narrower sets in Section 4. Unsupported provider events create no record.

File-channel correlation fields are optional additions to `events.jsonl` v1:
`provider`, `turn_id`, `agent_id`, `tool_use_id`, and `operation`. One provider
action writes at most one event for each distinct normalized registered path.
Separate activity/check registrations must not duplicate those file events.

## 6. Atomic writer protocol

1. Read at most `MAX_ACTIVITY_BYTES + 1` bytes from stdin before JSON parsing.
2. Validate registry membership and build one bounded metadata-only record.
3. Generate a random UUID v4 for this logical invocation.
4. Serialize canonical JSON: UTF-8, sorted keys, compact separators, no NaN.
5. Write a unique temporary file inside `activity_inbox`, flush it, attempt
   `os.fsync`, and close it.
6. Publish with `os.replace(temp, <uid>.json)` in the same directory.
7. Remove a leftover temporary file after failure when possible.
8. A provider-hook invocation exits zero after every failure. The explicit manual
   CLI instead reports operator-input errors with a nonzero exit.

General activity may be invoked asynchronously by the provider. File/check
delivery remains synchronous. Atomic publication, not process scheduling, defines
consumer visibility.

## 7. Consumer and recovery protocol

The consumer is single-process and serialized. It processes bounded batches,
directly linked records before zero-link lifecycle records.

1. Ignore temporary and unknown-suffix files.
2. Reject a final larger than 65,536 bytes without parsing it.
3. Before and after one bounded byte read, compare file identity, size, and
   nanosecond modification time. A changing file remains for bounded retry.
4. Validate UTF-8, object type, exact key allowlist, every bound/enum, UUID grammar,
   and exact filename-stem equality with `uid`.
5. Canonicalize the validated transport fields, including sorted/deduplicated
   `repo_ids`, then SHA-256 that canonical UTF-8 representation.
6. Classify any already committed UID/fingerprint before mutable plan-derived
   evidence validation or zero-link session admission, so an exact recovery retry
   cannot become invalid or newly unscoped later.
7. Insert a new immutable row and direct repository links in one transaction
   guarded by unique `uid`.
8. Delete the final only after commit, or after proving an existing row has the
   identical canonical fingerprint.
9. Reject a repeated UID with a different fingerprint as `UID_CONFLICT`; never
   overwrite the stored row.
10. Admit a zero-link lifecycle row only when its provider/session already has a
   direct registered link or gains one elsewhere in the same batch. Otherwise
   delete it without insertion and increment only `ignored_unscoped`.

A crash after publish leaves a replayable final. A crash after database commit
leaves an exact duplicate that is deleted on retry. Partial temporary files are
never consumed.

## 8. Sanitized rejection receipts

Permanent invalid-final reason codes are closed and safe, including:
`OVERSIZED`, `INVALID_JSON`, `INVALID_SCHEMA`, `INVALID_UID`, `UID_MISMATCH`,
`UID_CONFLICT`, `UNREGISTERED_REPO`, and `INVALID_FIELD`.

A receipt contains only:

```json
{"byte_count":77,"observed_at":"2026-09-07T00:00:00Z","reason_code":"INVALID_JSON","rejection_id":"<64 lowercase hex>","sample_sha256":"<64 lowercase hex>"}
```

The bounded sample hashes at most 65,537 bytes. `rejection_id` is SHA-256 over a
domain-separated encoding of reason code, statted byte count, sample digest, and a
separate domain-separated hash of the final basename. The basename hash is not a
receipt field. Receipts use the same temp-write, flush/fsync, atomic-replace
protocol. An existing receipt permits raw-final deletion only when its exact safe
fields match; corrupt/mismatched receipts leave the raw final for bounded retry.
The first receipt's observation time remains stable across retry.

Health exposes only pending/rejected/ignored-unscoped counts. APIs and WebSockets
never expose receipt names, digests, or contents.

## 9. Forbidden content

None of the following may enter inbox files, database fields, logs, APIs,
WebSockets, demo data, DOM, or rejection diagnostics:

- prompts, assistant responses, transcripts, or environment values;
- `tool_input`, `tool_response`, raw commands, stdout, stderr, or error text;
- source contents, diffs, patches, clipboard data, or arbitrary metadata maps;
- credentials, tokens, or URLs that may contain secrets;
- raw malformed records or their filenames.

Raw command text may exist briefly in memory solely for exact trusted-check
comparison and must be discarded without appearing in an exception.

## 10. Examples

Valid best-effort activity:

```json
{"agent_id":"agent-synthetic-2","delivery_class":"best_effort","evidence_source":"hook","kind":"agent_stop","parent_agent_id":"agent-synthetic-1","provider":"codex","repo_ids":["Repo_A"],"schema_version":1,"session_id":"session-synthetic","ts":"2026-09-07T00:00:00Z","uid":"10000000-0000-4000-8000-000000000001"}
```

Valid durable manual review:

```json
{"check_id":"review:cdd","delivery_class":"durable","evidence_source":"manual","kind":"review_result","outcome":"clean","plan_file":"temp/Plan/PLAN_v1.0.0.0_Synthetic.txt","plan_repo_id":"Repo_A","provider":"manual","repo_ids":["Repo_A"],"schema_version":1,"ts":"2026-09-07T00:01:00Z","uid":"10000000-0000-4000-8000-000000000002"}
```

Invalid records include a lifecycle row with empty `repo_ids` and no session, a
provider hook that supplies `plan_file`, a non-UUID filename, an unknown key, an
unregistered repo ID, a `tool_finished` row containing a command, or a review
outcome of `pass`.
