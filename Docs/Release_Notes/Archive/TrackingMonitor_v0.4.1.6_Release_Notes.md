# KATLAB TrackingMonitor v0.4.1.6 - Active Plan Gallery

## Active work becomes a readable gallery

Overview's existing Active plans become distinct cards with a full plan name,
repository and exact done/total count, every active-task spotlight and the first
pending task. This is a bounded presentation refinement, not a task editor,
new readiness calculation, metric, status or freshness signal.

The direct list uses one zero-minimum column below 1024px and two equal
zero-minimum columns from 1024px, with 16px gaps and the original source order.
Its old enclosing border/background are removed. Each original card, including
the last, uses 20px padding, a shared 1px border, 8px corners and surface tone.
The existing header retains flex wrapping, with 12px gaps and top alignment.
Its full basename takes a complete flex line at 18px/27px with anywhere wrapping;
repository and exact progress metadata remain 12px on the following line.

Existing active-task spotlights use 16px padding, a 3px warning-token left
boundary, 8px corners and raised tone. They still represent only tasks whose
actual status is in-progress. Existing direct explanatory/next-up paragraphs
use 14px/21px with anywhere wrapping. No text or data is inferred from color.
No new DOM wrapper, fixed height, clipping, positioning, reordering, animation
or scroll owner is introduced. Shared design tokens are unchanged.

## Preserved owners and lazy delivery

Only two reviewed PlanBoard windows change: one side-effect stylesheet import
immediately after the shared UI import and one marker on the existing Surface.
Every other Board byte remains. Grouping, event sort/null-last/ties, composite
repository/plan/task identities, served task order, all active tasks and first
pending task keep their original algorithms. Zero/done-only plans still hide.

PlanBoard's only caller is lazy Overview under its existing stats/workspace
gate. Its gallery is independent of positive event count, not a Tasks-drawer
or initially eager application feature. Pending/failed first workspace and
stats states, accepted retained refresh/error warnings and recovery keep their
existing owners. The stylesheet remains harmless after leaving Overview
because every selector requires this board's exact marker and direct owners.

Progress segments and their existing motion remain unchanged. The four-entry
file preview and remaining count, literal path callbacks, visibly labelled
non-interactive wildcard declarations and all underlying exact data remain.
Plan cards, exact-data rows and full declaration cells retain their existing
50-item bounded paging and composite identities. No new API/storage request,
backend runtime, configuration, schema or dependency change is introduced.

App, Overview, bootstrap, shared UI/CSS, Brand/shell, command frame, Mission
gallery, Overview deck, System panels, History ledger and prior tests remain
unchanged. No older source/test fingerprint is rebased to hide a regression.

## Verification boundaries and known limitations

The new verification contract checks an independent exact stylesheet literal,
complete PostCSS root/rule/media selector/declaration allowlists and strict
two-window TypeScript AST inverse with original/result RAW/LF preservation.
Historical source remains preservation data, never executed. Actual current
Board SSR and callbacks cover zero/done-only, active/pending/multiple-active,
long escaped names, composite repositories, exact ratios, served segments,
spotlights/next-up and literal/glob declarations. Controlled shared page-window
checks cover first/last bounded pages without claiming mounted paging effects.

The stylesheet has six root rules and one 1024px media rule. Separate build/live
checks must discover its actual compiled CSS asset and main-reachable lazy
reference, then compare all referenced served CSS and existing core lazy assets.
The entry stylesheet alone is not proof of gallery delivery; a fixed five-asset
inventory is insufficient. Existing compiled frame/ledger/System contracts and
canonical entry identity remain separate checks.

Source, SSR, static checks and matching assets do not certify native paint,
geometry, subjective beauty, keyboard, focus, assistive technology, zoom,
coarse input, safe areas or loading/empty/error/stale/reduced-motion acceptance.
Native v0.4 H.1 remains open for the operator; no native acceptance is claimed.

The recorded large Connection: close response failure remains unresolved.
Bounded keep-alive diagnostics are not a repair. The prior high build-only
braces advisory (recorded alert #15) and chunk notice are not addressed.
Historical GitHub push notices are not a fresh detailed advisory audit.
No transport, environment, security or browser workaround is introduced.

The user accepts limited publication with those recorded constraints. Actual
review, CFT, focused/full checks, build, restart, live, commit and remote-ref
evidence belongs in `temp/Plan/PLAN_v0.4.1.6_Active_Plan_Gallery.txt`; this document
does not invent completed results. New blocking regressions must stop delivery.

Use the [safe upgrade procedure](../../Installation_Guideline.md#safe-stop-and-restart).
Stop Tracker and demo before rebuilding matching source. Use the standard hidden
restart and reload existing tabs; restarting Python alone does not update UI assets.

Previous [v0.4.1.5 notes](TrackingMonitor_v0.4.1.5_Release_Notes.md)
retain every historical byte except their two move-affected Markdown URLs.
