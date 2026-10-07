# KATLAB TrackingMonitor v0.4.1.7 - Repository Scope Picker

## Readable identity, search and native choices

The existing Repository scope modal gains clearer hierarchy without becoming
a new chooser, combobox, navigation system or truth source. Source order stays:
dialog heading/description/Close, selected scope, labelled search, actual
hydration/count/no-match text, bounded native choices and the existing pager.
Search prominence does not change initial focus; Close remains the default.

The existing summary wraps with 8px gaps and top alignment, 16px bottom margin,
12px padding, a shared 1px border, 8px corners and canvas tone. Its second span
shows the full selected scope on one flex line at 16px/24px with anywhere wrap,
overriding visual ellipsis without copying or changing the actual scope value.
The summary's first label and validating text retain their 12px type/colors.

Search's existing label uses 14px/21px primary text and 16px bottom margin.
The native search field and choices use 12px padding, 16px/24px values/labels
and normal 44px minimum-height declarations. Existing coarse 44px-important
min-height/min-width rules retain priority; computed native target geometry
is not certified. Shared 6px control corners and focus rings remain unchanged.

Choice gaps are 8px, with top/left native label alignment. Actual selected
choices retain primary fill/white text, gain a focus-token border and use
primary-hover on enabled hover. Unpressed backgrounds and shared hover stay
untouched. Native aria-pressed/type/names/callbacks, disabled/active/cursor and
touch-action behavior keep their existing owners. Color is not a new status.

## Preserved modal, routing and page ownership

Only two RepositorySwitcher windows change: one side-effect stylesheet import
immediately after DialogShell and one class added to its existing panel class.
Every other wrapper byte, title, description, onClose, closeLabel, backdrop and
children remains. The plain eight-rule stylesheet has 56 LF lines/1,583 bytes,
with no at-rule, network/font/image import, generated content or new motion.
App imports the wrapper eagerly, so picker CSS belongs in the entry stylesheet;
the Overview Active Plan Gallery remains separately lazy and must be discovered.

The existing max-w-lg, panel corners, outer/body scrolling and labelled focusable
options region remain. Shared DialogShell retains its programmatic name, Close,
Escape/backdrop handling, overlay lease/background inertness, dynamic Tab
containment, safe areas, reduced motion and stale-safe focus restoration.
No real document/portal acceptance is claimed from controlled source checks.

App still renders this wrapper only for the scope panel with no active dialog
or open command palette. Its actual native selection calls the existing route
owner with the exact scope and indirect-navigation flag. A workspace scope and
a repository literally named ALL remain distinct. Selected-missing choices,
validation and incomplete-workspace warnings retain their original meanings;
validation does not newly disable these buttons or claim freshness/completeness.

NFKC/en-US token search, source ordering, 50-choice bounds, both mounted pager
hooks and separate query/unfiltered entry memory remain. Clearing search or
reopening restores browsing position. Back/Forward, delayed membership,
reordering and shrink retain existing selection/page policy. The pager stays
outside the styled choice group; its labels/callbacks/disabled states remain.

App, dialog, shared UI, navigation, bootstrap/shared CSS, Brand/shell, all six
views, prior styling owners and existing regression suites remain untouched.
No old source/test fingerprint is rebased. No new DOM wrapper, route/data owner,
API/storage request, backend runtime, configuration, dependency, positioning,
reordering, clipping, width/height cap or scroll owner is introduced.

## Verification boundaries and known limitations

The new verification contract checks an independent complete stylesheet literal,
selector/direct-declaration allowlists and strict two-window TypeScript AST
inverse with full original/result RAW/LF preservation. Restored historical
source is preservation data, never executed. Actual current wrapper forwarding
and controlled current dialog/source checks remain separate from unchanged
executable scope-paging/shared modal regressions. Native effects are not mocked
into a claim of browser acceptance, and no historical markup replaces the owner.

Separate focused/full, documentation, build and live checks must verify actual
results, canonical identity, eager picker CSS, retained Gallery/frame/ledger/
System contracts and all matching referenced served assets. Source, SSR, static
checks and asset hashes do not certify native paint, geometry, subjective
beauty, keyboard, focus, assistive technology, zoom, coarse input, safe areas or
loading/empty/error/stale/reduced-motion acceptance. Native v0.4 H.1 remains open.

The recorded large Connection: close response failure remains unresolved.
Bounded keep-alive diagnostics are not a repair. The prior high build-only
braces advisory (recorded alert #15) and chunk notice are not addressed.
Historical GitHub push notices are not a fresh detailed advisory audit.
No transport, environment, security or browser workaround is introduced.

The user accepts limited publication with those recorded constraints. Actual
review, CFT, test, build, restart, live, commit and remote-ref evidence belongs
in `temp/Plan/PLAN_v0.4.1.7_Repository_Scope_Picker.txt`; no completed results are
invented here. New blocking regressions must stop delivery.

Use the [safe upgrade procedure](Docs/Installation_Guideline.md#safe-stop-and-restart).
Stop Tracker and demo before rebuilding matching source. Use the standard hidden
restart and reload existing tabs; restarting Python alone does not update UI assets.

Previous [v0.4.1.6 notes](Docs/Release_Notes/Archive/TrackingMonitor_v0.4.1.6_Release_Notes.md)
retain every historical byte except their two move-affected Markdown URLs.
