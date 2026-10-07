# KATLAB TrackingMonitor v0.4.1.4 - History Commit Ledger

## A quieter captured-commit ledger

History's existing captured commits gain separate, readable panels rather than
one connected work list. The existing heading, online-repository chooser and
Commit graph action retain their owners. This is presentation of captured data,
not reconstructed ancestry, a live stream or a new freshness/health claim.

The direct Captured commits region becomes a transparent, borderless grid with
16px gaps. Its direct commit cards use one zero-minimum column, 16px inner gaps,
20px padding, a 1px shared border, 8px corners and the shared surface. No shadow,
status tint, timeline connector or inferred ancestry is added.

Hash, h3 title and timestamp retain their DOM and reading order. Below 640px
they stack with 8px gaps. At 640-1439px hash and title use two columns with 12px
gaps; timestamp spans the next row. From 1440px they use three columns, with a
zero-minimum timestamp track capped at 12rem. Long titles and timestamps wrap
instead of being scaled, truncated or forced onto one line. Title remains
16px/24px; hash/metadata sizes, colors and monospace stay, with tabular hash/time.

The native full-ID disclosure gains a quiet divider and 12px top padding. Its
default-closed state, exact selectable read-only field and identity remain.
Existing fine/coarse target minima and focus/keyboard foundations are unchanged.

## Preserved data, state and interaction

One side-effect import of the scoped stylesheet follows ApplicationBrand in
AppShell. Every other shell byte stays unchanged. App, bootstrap, original
shared CSS, the Mission gallery, Overview deck, System panels and old suites
remain untouched; no lazy-view-dependent stylesheet owner is introduced.

Selectors use the existing History attribute's presence, not its true value,
and direct region/card/header/disclosure ownership. Accepted and retained
same-repository rows therefore keep the same appearance without claiming a
fresh capture. Graph, error, skeleton and empty-guidance siblings, other views,
nested EventRows and shared controls are outside the new selector scope.

Exact commit keys, scope/repository/full-hash disclosure identity, linked
events, remembered 50-event pages and visible 50-commit pages remain unchanged.
Fetch depth stays separate from visible paging. Request generations, deadlines,
aborts, initial loading, later-page failure/Retry, online fallback and all-offline
guidance retain their existing owners. Same-repository retained data stay
distinct from a successful empty read; prior-repository data are not reused.

The bounded newest-twenty commit graph remains a sequence, not reconstructed
ancestry. Its structured parent-data alternative, render failures, ordinary
Retry and cached-module Reload path are preserved. CSS does not change graph
data, SVG ownership or its honest loading/preparation/unavailable/empty states.

Grid uses the existing elements. No new DOM wrapper, fixed height, clipping,
scrolling owner, positioning, CSS containment, animation, control, metric,
filter, request, API, storage or global design token is introduced.

## Verification boundaries and known limitations

The new verification contract checks the complete literal stylesheet, selector
and declaration allowlists, strict actual one-import AST inverse and whole
original/result RAW/LF pins. Old source is preservation-only, never executed.
Whole unchanged view/bootstrap/style/health and old-suite pins, actual private
History JSX boundaries and current shell SSR/state/callback behavior retain
independent checks. Existing tests and helpers are not adjusted to hide changes.
Separate build/live checks inspect effective responsive declarations, retained
view styling, release identity and actual referenced assets.

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
`temp/Plan/PLAN_v0.4.1.4_History_Commit_Ledger.txt`, not invented results here.

Use the [safe upgrade procedure](../../Installation_Guideline.md#safe-stop-and-restart).
Stop Tracker and demo before rebuilding matching frontend source. Use the
standard hidden restart and reload existing tabs; restarting Python alone does
not update served or already-loaded assets.

Previous [v0.4.1.3 notes](TrackingMonitor_v0.4.1.3_Release_Notes.md)
retain every historical byte except their two move-affected Markdown URLs.
