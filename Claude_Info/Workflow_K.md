# Workflow K

"Workflow K" is the user's shorthand for a gated, end-to-end delivery cycle in
KATLAB TrackingMonitor. A topic, acceptance criterion, version, or detailed
constraint in the same request overrides autonomous topic selection. If no
topic is supplied, inspect current code, plans, incidents, and relevant
sources, then choose one bounded, evidence-backed improvement with a clear
user benefit. Do not create work solely to consume tokens.

## Sequence for each cycle

1. Research and analyze carefully, deeply, and in detail. Brainstorm an idea;
   for a defect, reproduce it and establish root cause. Verify source facts.
2. Create a new enhanced-format `temp/Plan/PLAN_*.txt` plan with exact scope,
   decisions, files, tests, release version, and known limitations.
3. Review the plan to five consecutive clean CDD passes. Each pass follows
   the four steps: read the plan, read the current relevant source, mentally
   merge the proposed change, and trace realistic execution paths. Correct
   every finding in the plan and reset the streak to zero, even for a minor
   finding. Do not insert artificial waits.
4. Implement only after the CDD gate. Keep exactly one plan task in progress;
   preserve unrelated changes and update coupled contracts/docs.
5. Run five consecutive clean CFT passes over changed code, data flow,
   errors, lifecycle, tests, documentation, and allowed Git diffs. Fix each
   finding in code and the corresponding plan point; reset the streak to zero.
6. Run focused and appropriate full verification. Distinguish automated,
   static, browser, and operator-only evidence; never report an unrun check as
   passed. If a safe restart is relevant, verify the configured listener and
   process identity before using the repository restart script, then smoke
   the real API/UI path. An HTTP 200 for the SPA shell is not a UI interaction
   test. Record live evidence and limitations in the plan.
7. Finalize the pre-publication plan, version, README, and release notes.
   Inspect staged/unstaged scope and carry out only authorized commit, push,
   and release operations. Append the commit ID and publication result to the
   ignored plan after publication.
8. Repeat with a fresh, valuable candidate only while the request, safety
   conditions, time/token budget, and current-turn authority allow it. Stop
   cleanly at a real blocker; never skip a gate to keep the loop moving.

## Authority and release boundary

- The alias describes desired work; it does not permanently grant Git rights.
  The repository's four-command default remains `git status`, `git diff`,
  `git log`, and `git show`. Require explicit current-turn authorization for
  each Git mutation. Staging is separate from commit/push authorization.
- Resolve the exact branch, remotes, staged files, version, and release target
  before publication. Do not infer branch creation, merge, tag, GitHub Release,
  default-branch change, force push, or branch deletion from "release".
- Restart only the identified TrackingMonitor instance after listener and
  configuration preflight. Do not alter monitored repositories, live trading
  systems, or unrelated processes as a side effect of this alias.
- The five clean reviews and five clean CFT passes are real, consecutive
  review results, not a counter advanced without new examination. Report the
  final streak and any unverified browser or live result honestly.
