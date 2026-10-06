# KATLAB TrackingMonitor v0.4.0.19 - Trustworthy Local Badges

## Fixed

Optional local SVG cards show UNAVAILABLE when Git status is missing or invalid,
including retained CLEAN/count values after a failed read. OFFLINE takes
precedence; only strictly valid observations enable CLEAN or uncommitted totals.
The independent UTC capture count, deterministic XML escaping and card structure
remain. CLEAN's white text uses emerald-700 instead of emerald-600: calculated
contrast improves from 3.77:1 to 5.48:1, above the ordinary-text threshold in
[W3C contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).
That color calculation is not whole-product accessibility certification.

## Scope and verification

Actual guarded HTTP fixtures exercise the real builder, route and tracker
failure/recovery owners without lifespan startup, live DB access or real Git.
The original UTC COUNT query is checked only against isolated in-memory data.
Original complete source fingerprints protect unrelated main lifecycle/handlers
and the COUNT function; strict restoration permits only the intended argument.

The badge remains local-only: GitHub's proxy cannot reach loopback. Five-minute
caching is preserved, not automatic refresh or a freshness/transaction guarantee.
Live HTTP/XML/identity/state/cache smoke does not compare independent Git reads;
the repository API actively refreshes status on each request. Controlled semantic
tests and native font/layout/assistive preview acceptance remain distinct.
Native v0.4 acceptance is still pending under the continuing delivery override.
No schema, endpoint, fresh Git probe, event, dependency or global UI owner changes.

One unused synthetic runtime repository row from an earlier agent probe remains
held for separately authorized cleanup. It is not configured for monitoring;
no associated activity/event/task/commit records were found. This release leaves
runtime data intact rather than silently deleting it.

The build-only `braces` issue remains open with no direct patched version in the
[primary advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
No Tailwind major migration, security remediation or chunk-notice suppression is
bundled. Existing earlier unconfirmed launcher-fixture limits remain explicit.

Use the [safe upgrade procedure](../../Installation_Guideline.md#safe-stop-and-restart).
Evidence and publication details are recorded in
`temp/Plan/PLAN_v0.4.0.19_Trustworthy_Local_Badges.txt`.

Previous [v0.4.0.18 notes](TrackingMonitor_v0.4.0.18_Release_Notes.md)
retain their historical scope, with only move-affected links rebased.
