# KATLAB TrackingMonitor v0.4.0.21 - Exact Session Identity

## Improved

Session Timeline retains its compact provider/short-ID header and exposes the
complete ID through a default-closed Full session ID disclosure. Two sessions
with the same visible prefix and color can be distinguished on demand.

The labelled read-only field contains printable ASCII JSON, including quotes
and escapes. Decode JSON to recover the original ID. This representation keeps
legacy controls, Unicode and literal escape text distinct; it is not the raw API
argument or a new clipboard action. Long values remain complete within the field,
without a new length cap. JSON expansion is linear and can reach six times the
raw UTF-16 length plus two characters.

## Scope and verification

Only Session Timeline's presentation adds a native disclosure using existing
control/field styles. Its provider/full-ID key is stable across event paging;
the summary's tabIndex0 integrates with the existing modal focus trap. No new
product helper, import, state, effect, request, selection/autofocus handler or
role/live region. Raw query identity, sorting, Retry, cancellation, deadline,
50-row visible paging and three 500-event raw fetch pages remain unchanged.

Controlled tests execute the actual complete component and modal Tab/Escape
callback. Encoding checks include all UTF-16 units and hostile/long IDs; defensive
frontend cases do not imply every string is admitted by the backend. A strict
test-only insertion restoration protects the original complete-source and
collector fingerprints rather than excluding a whole render from review.

These checks do not certify native disclosure state, default Tab movement,
selection, geometry, clipboard bytes or assistive reading. Native v0.4 H.1 stays
pending under the continuing independent-delivery override. Earlier launcher
fixture limits remain explicit. The unused synthetic runtime row remains held
for separately authorized cleanup; no runtime data is hand-edited here.

The build-only `braces` issue remains open in the
[primary advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
No dependency major migration, patched-version claim or chunk-notice suppression.

Use the [safe upgrade procedure](../../Installation_Guideline.md#safe-stop-and-restart).
Rebuild after version changes; restarting Python alone leaves the old UI assets.
Evidence and publication details are in
`temp/Plan/PLAN_v0.4.0.21_Exact_Session_Identity.txt`.

Previous [v0.4.0.20 notes](TrackingMonitor_v0.4.0.20_Release_Notes.md)
retain their historical content with only the two move-affected links rebased.
