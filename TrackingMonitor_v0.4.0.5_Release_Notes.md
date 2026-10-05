# KATLAB TrackingMonitor v0.4.0.5 - Bounded Provider Health

## Fixed

- Backend provider-settings health and the legacy marker scan now share a bounded
  strict UTF-8 reader. Files above 1 MiB are refused before decoding; no truncated
  prefix is accepted, and settings are never modified.
- Expected JSON decoder value/depth failures return `settings_invalid` instead of
  failing the entire health endpoint. Missing files remain `settings_missing`.
  Each provider keeps independent configuration, adapter and recent-activity
  facts; other health fields remain available after expected settings failures.

The actual health HTTP500 was reproduced with isolated fixtures, including deeply
nested JSON and an integer beyond the runtime's decoder limit. Production provider
settings were not changed to reproduce or test the defect.

## Boundaries and operation

The cap is for Tracker health observation, not a provider settings limit. The legacy
hook marker remains text presence, not JSON validation or proof of hook execution.
Readable malformed JSON can contain the marker while configuration is invalid.
No added I/O deadline, no-follow filesystem authority, memory-allocation ceiling or
atomic cross-field snapshot is claimed. The preflight CLI is unchanged.

No dependencies, schema, capture behavior, UI layout or API shape changed. Follow
the [safe upgrade procedure](Docs/Installation_Guideline.md#safe-stop-and-restart)
to rebuild and restart, then reload existing tabs. Owned-process protection,
frontend identity validation and the Git revision guard remain intact.

CDD/CFT, focused/full tests, build, activation and publication evidence is recorded
in `temp/Plan/PLAN_v0.4.0.5_Bounded_Provider_Health.txt`. Native v0.4 visual and
interaction acceptance remains pending. Existing chunk-size notices and
default-branch dependency alerts are not resolved by this change.

Previous [v0.4.0.4 notes](Docs/Release_Notes/Archive/TrackingMonitor_v0.4.0.4_Release_Notes.md)
are archived with only move-affected links rebased.
