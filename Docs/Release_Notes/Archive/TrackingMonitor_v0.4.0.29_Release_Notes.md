# KATLAB TrackingMonitor v0.4.0.29 - Dialog Event Chronology

## Fixed

File Story and Session Timeline sort their accepted captured rows by parsed
epoch milliseconds rather than timestamp spelling. Valid mixed UTC precision
no longer reverses their display or invents an effort gap.

Finite timestamps come first; equal millisecond values use ascending event ID.
Malformed timestamps remain present, last by ID. Raw timestamps and record
references are unchanged. This does not provide microsecond chronology or
guarantee parsing of every nonstandard timestamp on every JavaScript engine.

Only two local sort statements change. Raw ingestion-ID-selected windows,
deduplication, request scope, deadlines, retry, paging, effort formulas,
session identity, dialog focus, announcements and styles remain intact.

## Scope and verification

Controlled tests run both complete actual dialog owners, including a reproduced
mixed-precision order, effort and false-gap defect. Narrow test-only comparator
reversal preserves original complete-module and coupled collector/identity
fingerprints; no original hash is rebased.

Existing malformed-time effort still renders a nonfinite duration.
Admission, backend text-window/statistics calculations and historical data are
not normalized by this change. Only the accepted captured window is ordered;
no complete history or event-time-selected API window is promised.

Controlled effects/SSR and live HTTP/assets do not establish native focus,
keyboard, geometry, assistive acceptance or accessibility compliance.
Native v0.4 H.1 remains pending under independent-delivery authority. Earlier
launcher fixture limits and the unused synthetic runtime row remain separate.
No cleanup or browser bypass is authorized.

The build-only `braces` issue remains open in the
[primary advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
No dependency migration or chunk-notice suppression.

Use the [safe upgrade procedure](../../Installation_Guideline.md#safe-stop-and-restart).
Rebuild after version changes; restarting Python alone leaves old UI assets.
Evidence and publication details are recorded separately in
`temp/Plan/PLAN_v0.4.0.29_Dialog_Event_Chronology.txt`.

Previous [v0.4.0.28 notes](TrackingMonitor_v0.4.0.28_Release_Notes.md)
retain their historical content with only two move-affected links rebased.
