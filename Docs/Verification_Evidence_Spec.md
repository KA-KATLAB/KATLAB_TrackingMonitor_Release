# KATLAB Verification Evidence Contract v1

This document defines trusted checks, explicit review evidence, attempt pairing,
plan binding, and freshness for TrackingMonitor v0.3.0.0. Read it with
[`Plan_Format_Spec.md`](Plan_Format_Spec.md) and
[`Agent_Activity_Spec.md`](Agent_Activity_Spec.md).

## 1. Declared plan requirements

An enhanced plan may contain at most one column-zero block:

```text
<verification>
review:cdd@5
backend-compile
frontend-build
review:cft@5
</verification>
```

Each non-empty line is `CHECK_ID` or `CHECK_ID@N`. IDs match
`^[a-z][a-z0-9-]*(?::[a-z][a-z0-9-]*)?$`. A streak target is legal only for
`review:*` and is an integer from 1 through 99. The parser uses the first valid
occurrence of an ID; later duplicates warn and cannot override it. Nested or
multiple verification blocks warn under the deterministic policy in the plan
format specification.

`review:*` IDs are implicit manual-only checks. Every other declared ID must have
one valid committed definition in `Config/checks.json`. A missing/invalid
definition blocks verification; it does not become an implicit manual check.

## 2. Registry shape

The whole JSON document is:

```json
{
  "schema_version": 1,
  "checks": [
    {
      "id": "backend-compile",
      "label": "Compile backend modules",
      "repo_ids": ["Repo_A"],
      "cwd": ".",
      "commands": ["python -m compileall Backend"],
      "accepted_exit_codes": [0],
      "evidence_sources": ["hook", "manual"]
    }
  ]
}
```

Rules:

- Root keys and check keys are exact; unknown keys are authoring errors.
- `schema_version` is exactly `1`; `checks` is an array with at most 256 rows.
- `id` follows the verification-ID grammar, is at most 128 characters, is unique,
  and must not use the reserved `review:` namespace.
- `label` is non-empty, trimmed, contains no control character, and is at most 128
  characters.
- `repo_ids` contains 1..16 unique IDs present in `repos.yaml`.
- `cwd` is one normalized repo-relative forward-slash path (`.` is repository
  root), at most 1,024 characters, with no drive, leading slash, empty segment,
  `.` segment, or `..` segment.
- `commands` contains 1..16 unique, non-empty strings of at most 2,048 characters.
  Outer whitespace is removed and CRLF/CR normalize to LF before validation.
- `accepted_exit_codes` defaults to `[0]`; otherwise it contains 1..32 unique
  integers in `0..255`.
- `evidence_sources` contains one or both of `hook` and `manual`, without duplicates.

The committed initial registry may be valid and empty. Exact EA/UM commands must
be operator-approved; historical prose is not authority to invent them.

## 3. Unsafe-command rejection

Command matching is exact after outer trim and CRLF normalization. There is no
regex, token rewriting, alias inference, case folding, environment expansion, or
substring match.

A definition is rejected when a command contains any newline or any unquoted or
quoted representation of a pipeline, redirection, command substitution, or
compound-command separator. The conservative forbidden character/token set is:
newline, `|`, `>`, `<`, backtick, `$(`, `&&`, `||`, semicolon, NUL, and PowerShell
statement separators. This contract intentionally rejects some harmless quoted
commands to keep classification reviewable. Use a direct invocation or a committed
trusted wrapper instead.

The hook compares raw command content transiently and stores only check ID,
revision, timing, outcome, and structural identifiers. Command content and process
output never enter diagnostics or evidence.

## 4. Canonical check revision

Validation creates this effective object with keys in exactly this semantic set:

```json
{"accepted_exit_codes":[0],"commands":["python -m compileall Backend"],"cwd":".","evidence_sources":["hook","manual"],"id":"backend-compile","repo_ids":["Repo_A"]}
```

Lists that represent sets (`accepted_exit_codes`, `evidence_sources`, `repo_ids`)
are sorted. Command order is preserved after duplicate rejection. `label` is
excluded because changing display prose does not alter execution trust. Serialize
with UTF-8, sorted keys, compact separators, `ensure_ascii=false`, and no trailing
newline; `check_revision` is the lowercase SHA-256 hex digest of those bytes.

The backend validates one registry snapshot at startup. A registry edit requires a
TrackingMonitor restart before the check is run. Hook evidence carrying a revision
unknown to the running backend stays unassigned/non-passing with the safe reason
`REGISTRY_REVISION_MISMATCH`; it is never silently rebound.

## 5. Source policy

- Hook evidence requires the definition to allow `hook`.
- Manual pass/fail/cancelled requires the definition to allow `manual`.
- `review:*` is always manual-only; hook rows cannot impersonate it.
- Configuration failure in the backend is a startup authoring error.
- Configuration failure in a provider hook disables check classification only;
  safe generic activity and legacy file capture continue when repo membership is
  still provable.
- Two hook-enabled checks may not claim the same repository, relative working
  directory, and normalized command; overlapping routes invalidate the registry.
- Empty registry means no automatic checks, not capture-all and not an error.

## 6. Automated attempts

A hook attempt key is:

```text
provider + session_id + tool_use_id + check_id + check_revision
```

All components are required. Pairing is independent of ingest order: the first
valid start and first valid finish by `(ts, database id)` form the attempt.
Duplicates remain immutable/visible but do not count twice. A finish inherits the
start's original plan/revision binding and never performs automatic selection
again. The canonical evidence ID is the first valid finish ID, or the first valid
start ID while incomplete. A newest unmatched start or finish is incomplete and
non-passing.

A start is classified only when command, cwd, direct repo, and registry revision
exactly match. The finish outcome comes from an installed-version success/failure
fixture: accepted exit -> `pass`, other known exit -> `fail`, interrupt ->
`cancelled`, and an unproved result -> `unknown`. Generic `tool_finished` activity
never satisfies a requirement.

The current Claude Code 2.1.258 and Codex CLI 0.153.4 hook payloads do not expose a
trustworthy structured Bash exit status. Their normal check finishes therefore stay
`unknown`; command output is never parsed to manufacture `pass`. Claude's explicit
failure callback may prove `fail` or `cancelled`. The accepted-exit rule applies only
when a future installed-version fixture proves a structured exit-status field.

## 7. Plan binding

Explicit manual evidence names registered `plan_repo_id`, repo-relative
`plan_file`, and a requirement declared by that current usable plan.

An automatic start must have exactly one directly linked check repository. Within
that repository it considers only usable plans declaring the exact check:

1. `AUTO_ACTIVE` when exactly one declaring plan has exactly one in-progress task.
2. Otherwise `AUTO_VERIFYING` when exactly one declaring plan has all tasks done
   and that requirement is not currently fresh/passed.
3. Otherwise `UNASSIGNED`.

It never chooses by newest timestamp, filename, branch, or non-declaring plan.
Other closed assignment modes are `NONE`, `EXPLICIT_TARGET`, and
`MANUAL_ASSIGNMENT`.

Manual assign/clear operations append an audit row. They do not mutate activity.
Assignment is allowed only for check/review evidence, a current parsed plan that
declares the check, and a definition that allows the evidence source. The newest
audit ID across a canonical start/finish pair wins; clear returns the pair to
`UNASSIGNED`.

## 8. Requirement and plan revisions

`plan_revision` is the lowercase SHA-256 of the plan's exact stable raw bytes.
Every plan-bound evidence row must carry the current value. A restart over unchanged
bytes keeps both the revision and its original revision time.

`requirement_revision` is SHA-256 of canonical UTF-8 JSON containing:

- requirement ID and optional streak target;
- sorted allowed evidence sources;
- effective automated `check_revision`, or null for `review:*`.

Any plan-byte edit stales all prior plan-bound evidence. A check-definition change
also stales evidence for that requirement. Build/test/review:cft evidence must be
newer than the latest captured non-plan event attributed to the plan. A newly seen
offline edit uses its conservative observation time as the floor.

## 9. Outcomes and streaks

Requirement states are the closed set:

- `missing`, `stale`, `incomplete`, `failed`, `unknown`, `finding`;
- `partial` with integer `current` and `target`;
- `passed`.

Evaluation first forms attempts and effective assignments, then applies source,
revision, and freshness rules. No historical row means missing; historical but no
fresh eligible row means stale. A fresh unmatched row is incomplete. The newest
eligible completed check maps pass/fail/cancelled/unknown directly.

Reviews are ordered by timestamp then database ID. A `finding` resets the trailing
clean count to zero, including a minor finding. Only the consecutive clean tail may
satisfy `@N`; callers cannot submit a streak count.

## 10. Explicit evidence CLI

`Scripts/record_evidence.py` accepts only a registered repository ID, contained
repo-relative plan path selected by that repository's configured `plan_globs`,
declared check ID, and normalized outcome. Reviews accept
`clean|finding`; other manually allowed checks accept `pass|fail|cancelled`. It
writes one durable manual record through the activity atomic publisher and stores
no notes, reasons, commands, output, source, or prompt. It never writes the
monitored repo or invokes Git. Invalid operator input exits nonzero.

Examples:

```text
python Scripts/record_evidence.py --repo Repo_A --plan temp/Plan/PLAN_v1.0.0.0_Synthetic.txt --check review:cdd --outcome clean
python Scripts/record_evidence.py --repo Repo_A --plan temp/Plan/PLAN_v1.0.0.0_Synthetic.txt --check backend-compile --outcome pass
```

## 11. Valid and invalid examples

A valid definition uses an exact direct command and known repo:

```json
{"accepted_exit_codes":[0],"commands":["python Scripts/verify_backend.py"],"cwd":".","evidence_sources":["hook"],"id":"backend-verify","label":"Verify backend","repo_ids":["Repo_A"]}
```

Invalid definitions include `review:cdd` in the registry, `python test.py && echo
ok`, cwd `../Repo_B`, duplicate IDs, an unknown repo, an empty source list, or an
exit code outside `0..255`.

A valid manual review targets a plan that currently declares `review:cdd`; it
cannot target a plan merely because that plan is newest. A hook finish with no
matching start, an old check revision, a disallowed source, or unknown outcome can
never pass.
