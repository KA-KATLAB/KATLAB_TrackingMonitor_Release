# KATLAB TrackingMonitor v0.4.6.0 - History Review Station

## Choose a commit, inspect its evidence

History changes from a repeated expanded commit-evidence stack into one uniform
choose-and-inspect workflow. A searchable current-page commit chooser and
previous/next controls lead to one inspected original HistoryCommitCard.
The same interaction is used at every width, without duplicate hidden navigation,
a new scroller or an added stylesheet. Chooser labels use Commit ordinal and the
short ten-character hash, with full message, full ID and timestamp in descriptions.

The selected card keeps its full captured subject, timestamp and selectable
exact commit ID, together with the existing linked-event actions and remembered
50-event pager. The repository chooser, graph, loading, recovery, fetched depth
and outer 50-commit page keep their existing owners and positions.

## Exact selection, honest coverage

Each selection identifies the accepted occurrence by scope, repository, full
commit hash and absolute fetched ordinal. Repeated hashes from offset appends
are not deduplicated or treated as interchangeable entries. Position and coverage
describe the CURRENT PAGE of fetched commits, not complete repository history,
freshness or a successful verification result.

Keep the last explicit occurrence in local context. If it is absent, derive the
first available row without replacing that choice; resume the exact occurrence
if it returns within the same context. Reset context on scope/repository/page
changes and History remount. Accepted same-page rows stay available during later loading or
failure. An empty slice during restored-depth hydration is pending, never an
accepted-empty History result. Default/fallback selection neither announces nor
moves focus.

Switching the inspected occurrence unmounts local event/diff and native
disclosure state. Returning restores the existing remembered event page, not
those local states. Full captured models, graph input and endpoint limits stay
unchanged; do not infer a globally virtualized or complete-history view.

## Focus and preservation

Explicit selection, actual chooser-trigger opening and manual outer-page changes
cancel pending App route focus. Automatic fallback/clamp does not. Capture
guards use real DOM containment so portal events are excluded. Never focus the
inspector while the dialog owns its overlay lease.

Add no requests, API/schema changes, URL state, storage, timer, clipboard action,
dependencies or shared-dialog edits. Preserve the original commit card and
ledger stylesheet. Verify actual CSS emission and compiled ownership; absence
of a stylesheet edit alone is not proof that Tailwind output is unchanged.

Require whole CDD5/CFT5, strict historical assertion-input inverses, current-only
runtime regressions and negative cases, formal focused/full Node/Python checks,
builds, retained/new compiled gates and full isolated/production parity.
Actual outcomes and the full commit ID belong in the detailed plan after the
checks run. No future verification or native acceptance is claimed here.

Follow the [safe upgrade procedure](../../Installation_Guideline.md#safe-stop-and-restart).
Reprove the old v0.4.5.0 instance and its native owned process forest, stop it
normally and confirm tracker/demo ports clear before the production build.
Use the standard Hidden restart and verify canonical version, complete reachable
assets, APIs, watchers, Chronicle pages, current notes and exact reader CSS.
Reload existing browser tabs to load the new UI build.

## Declared limits

Native operator aesthetics, paint, first-viewport fit, responsive geometry,
keyboard/focus, coarse input, zoom and assistive technology remain OPEN.
Source, controlled rendering, compiled assets and keep-alive diagnostics do
not establish native acceptance. The known large HTTP Connection:close body
fault, existing high dependency alerts and inherited chunk, Tailwind and SSR
diagnostics remain OPEN. Accepted limits never waive a new failure or authorize
an ad-hoc dependency, browser, OS or transport workaround.

Previous [v0.4.5.0 notes](TrackingMonitor_v0.4.5.0_Release_Notes.md)
remain archived with only their moved relative documentation URLs corrected.
