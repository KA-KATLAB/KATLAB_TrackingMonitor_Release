# KATLAB TrackingMonitor v0.4.1.3 - System Snapshot Panels

## Readable System snapshot

System's existing accepted snapshot gains four quiet, named native sections:
Server, conditional Activity inbox, conditional Providers and Repositories.
Each section has an h3 and its own exact health-*-heading label relationship.
The single System modal still renders one snapshot, not another health source.

Body copy, values and section headings use 16px type with 24px leading. Row
labels remain 12px; label/value spans stay adjacent and retain meaningful order.
Rows stack below 640px and use two columns from 640px, with 8px top/bottom
padding and 12px desktop gaps. Values use tabular figures and anywhere wrapping.
Primary panels use 16px padding and 8px corners; nested provider panels use
12px horizontal/8px vertical padding and the same 8px corners.

Repository rows preserve all four original spans, values, offline badges and
log-write titles. They stack below 640px and use two columns with a zero-minimum
value track from 640px. Long identities and values wrap rather than being scaled
or clipped. The existing 50-repository pager and exact repository keys remain.

The System dialog cap becomes 672px, matching the shared DialogShell. Viewport
and safe-area limits, maximum height, existing body scrolling, overlay lease,
Escape, backdrop/explicit close, keyboard containment and focus restoration
remain owned by that foundation. No fixed height, new scrolling/sticky layer,
clipping, font scaling, movement, control or health inference is introduced.

## Preserved state and data owners

Only three health-render windows change: Row's final return, HealthBody's final
return and HealthModal's final-return width attribute. Imports, constants,
formatters, pre-render logic and complete HealthButton/HealthSnapshotContent
remain unchanged, as do requests, API/model decoders, hooks and callbacks.
App/bootstrap/shared CSS, the Mission gallery, Overview deck and old suites stay.

System remains a manually refreshed snapshot, not a live stream. UI build is
visible during loading and failure as well as accepted states, using the larger
Row value styling. Refresh/Retry stays disabled while one request is pending;
closing remains available and silently cancels that request. A failed refresh
retains the accepted data and local browser receipt time with explicit wording.
Uptime remains based on that receipt, not a new freshness or health guarantee.

Malformed consumed fields keep the static failure/Retry path without being
echoed or replacing the prior snapshot. Current/legacy/null/missing optional
fields, empty providers/repositories, Unknown server versions, known mismatch,
Chronicle's three states and malformed Chronicle data keep their independent
decoders. Overlapping warnings still show conditional upgrade guidance once.
Count validation and finite/nonfinite duration formatting keep their owners.

## Verification boundaries and known limitations

The new source/SSR verification contract checks the complete old/new render
windows, exact width site, strict three-window inverse and whole RAW/LF source
pins. Old windows are preservation fixtures only and are never executed.
Actual current health modules, models and paging supply state/callback fixtures;
existing source and regression assertions are not rewritten to conceal changes.
Separate build/live checks inspect compiled responsive/type/wrap/spacing/width
utilities, retained view styling, matching release identity and actual assets.

Source, SSR, classes, static checks and built assets do not certify native
paint, geometry, keyboard, focus, assistive technology, zoom, coarse input,
safe areas or native loading/empty/error/stale/reduced-motion behavior. Native
v0.4 H.1 remains pending, and no subjective beauty or accessibility certification
is claimed.

The recorded large Connection: close response failure remains open. Bounded
keep-alive diagnostics are not a repair. The previous high build-only braces
advisory and chunk notice are not addressed; historical GitHub push alert
notices are not a fresh advisory-detail audit or remediation. No API, schema,
backend runtime, configuration, stored-data, dependency, environment, security,
transport or browser workaround is introduced.

The user accepts limited publication with the recorded constraints. They are
not claimed fixed; new blocking regressions must stop delivery. Actual review,
CFT, tests, build, live, commit and remote-ref evidence belongs in
`temp/Plan/PLAN_v0.4.1.3_System_Snapshot_Panels.txt`, not invented results here.

Use the [safe upgrade procedure](Docs/Installation_Guideline.md#safe-stop-and-restart).
Stop Tracker and demo before rebuilding matching frontend source. Use the
standard hidden restart and reload existing tabs; restarting Python alone does
not update served or already-loaded assets.

Previous [v0.4.1.2 notes](Docs/Release_Notes/Archive/TrackingMonitor_v0.4.1.2_Release_Notes.md)
retain every historical byte except their two move-affected Markdown URLs.
