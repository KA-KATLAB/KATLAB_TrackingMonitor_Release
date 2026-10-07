# TrackingMonitor UI Design System

This document is the normative UI contract for the React application and owned
Chronicle stylesheet generator. It governs the application shell and every
product view; feature-specific behavior remains authoritative in the implementation
and release plan. Generated runtime files are never edited directly.

## 1. Product profile and authority

- Product: local developer operations and observability dashboard.
- Style: Operations Workbench, a quiet dark canvas with restrained KATLAB personality.
- Design dials: variance 4/10, motion 3/10, density 7/10.
- Content order: status first, action second, explanation third.
- Language: English.
- Theme: dark only.

The advisory research source was `nextlevelbuilder/ui-ux-pro-max-skill` at commit `f3ac195224eac1eb0dfe1a3059c2a6add78ffbe3`, reviewed on 2026-09-03. It is provenance, not a dependency. Do not run its installer, vendor its files, add its companion skills, or copy generated CSS into this repository. A later upstream revision requires a fresh applicability, version, license, security, and stack audit.

The supported frontend remains React 18.3, ReactDOM 18.3, Tailwind 3.4, TypeScript 5 (currently locked to 5.9), Vite 6.4, Chart.js 4.5, and Mermaid 11. Do not import React 19, Tailwind 4, Next.js, native/mobile, or GSAP guidance into this stack.

## 2. Foundations

### 2.1 Semantic colors

Use semantic roles for shell, shared controls, overlays, and panels. Visualization-specific categorical ramps remain in their existing authoritative modules.

| Token | Value | Use |
|---|---:|---|
| `canvas` | `#020617` | application background |
| `surface` | `#0f172a` | standard panel |
| `surface-raised` | `#1e293b` | raised or selected surface |
| `border` | `#334155` | boundaries and dividers |
| `control-border` | `#64748b` | interactive boundary; 3:1 minimum |
| `text` | `#f8fafc` | primary text |
| `text-muted` | `#94a3b8` | secondary text |
| `primary` | `#0369a1` | primary action |
| `primary-hover` | `#075985` | primary hover, retaining normal-text contrast |
| `focus` | `#38bdf8` | focus indicator |
| `live` | `#14b8a6` | live activity |
| `success` | `#059669` | successful/clean state |
| `warning` | `#f59e0b` | attention state |
| `danger` | `#e11d48` | failure/destructive warning |

Normal text must reach 4.5:1 contrast. Large text, control boundaries, state indicators, and focus indicators must reach 3:1 against adjacent colors. Color never carries meaning alone; pair it with text, value, icon shape, or another marker.

Historical palette calculations from v0.2.12.0, not current rendered acceptance:

| Pair | Ratio | Required |
|---|---:|---:|
| text / canvas | 19.28:1 | 4.5:1 |
| muted text / canvas | 7.87:1 | 4.5:1 |
| muted text / surface | 6.96:1 | 4.5:1 |
| control border / surface | 3.75:1 | 3:1 |
| focus / canvas | 9.42:1 | 3:1 |
| text / primary | 5.67:1 | 4.5:1 |
| success / canvas | 5.35:1 | 4.5:1 |

The v0.4 foundations retain the slate/sky/teal palette and remove the operational
canvas's decorative dot grid and radial glow. Primary hover uses sky-800
(`#075985`); danger hover uses rose-700 (`#be123c`). White text calculates to
7.56:1 and 6.29:1 respectively. The danger action uses white, not the off-white
primary text token. Token calculations do not replace checking rendered pairs,
including alpha composition, focus, and every enabled control state.

Attribution badges use the unchanged `MODE_COLOR` palette with the matching
`MODE_BADGE.foreground`, including exported Digest rows. White is not a safe
foreground for every category. Outline badges retain readable neutral text.

### 2.2 Typography

- Preserve Plus Jakarta Sans for UI copy and Azeret Mono for code, paths, counters, timers, and tabular numbers.
- Keep offline-safe system fallbacks and `font-display: swap`.
- Primary copy is 16px. Metadata never falls below 12px.
- Body copy uses at least 1.5 line height.
- Small SVG/canvas ticks may be smaller only when non-interactive and fully duplicated by an accessible alternative.
- Use tabular figures for changing numeric values.
- Natural wrapping must remain correct without `text-wrap: balance`.
- Page titles use 28–32px, section titles 18px, and panel titles 16px. Their
  semantic heading level remains independent of visual size. Page descriptions
  use 16px; supporting descriptions use 14px; metadata keeps the 12px floor.
- Numeric emphasis uses tabular mono figures around 32px. Wrap long values and
  preserve exact information; never transform-scale text to make a metric fit.

### 2.3 Shape, spacing, and elevation

- Base spacing rhythm: 4px.
- Panel padding: 12px compact, 16px standard.
- Section separation: 16px compact, 24px standard.
- Controls: 6px radius.
- Panels: 8px radius.
- Boundaries: one pixel.
- Elevation is restrained; use border and tonal separation before shadow.

### 2.4 Breakpoints

| Width | Contract |
|---:|---|
| 360px | supported minimum |
| 390px | phone reference |
| 768px | tablet reference |
| 1024px | compact navigation drawer reference |
| 1280px | persistent 14rem view-navigation switch |
| 1440px | desktop reference |

At every width, document `scrollWidth` must not exceed `clientWidth`. Horizontal scrolling is allowed only in an explicitly labelled local data or navigation scroller.

### 2.5 Global layers

| Layer | z-index |
|---|---:|
| base content | 0 |
| local sticky surfaces | 20 |
| non-modal disclosures and toasts | 30 |
| release banners | 40 |
| attract-mode catcher | 50 |
| dialogs and drawers | 100 |

Use these values only for global layers. Descendants use local stacking within their owner; do not invent competing global z-index values.
At very short viewport heights, an explicitly opened warning detail panel may share layer 40 and paint over a release banner so its scroller and pager stay operable. Closing it restores the normal release-banner priority; attract mode and dialogs remain above it.

## 3. Page and shell contract

- Use a `100vh` fallback followed by a `100dvh` bounded app height.
- Every flex/grid boundary that can shrink needs `min-width: 0` and/or `min-height: 0`.
- Do not clip `body` or the document to conceal an overflowing child.
- Preserve the `#main-content` skip target and make the landmark programmatically focusable.
- The header separates brand/build version, Repository, Commands, transport
  status, Attention, System and Tools. Allow identity and controls to wrap.
- The shared Workspace Command Frame styles only the existing direct primary,
  action-group and context owners. Primary uses 16px vertical padding and top
  alignment. Utilities use 8px vertical/12px horizontal padding and 8px gaps;
  context uses 12px padding and 8px vertical/16px horizontal gaps. Both zones
  use a shared 1px border, 8px corners and canvas tone. Preserve natural flex
  wrapping, narrow 100% basis, safe areas, slot order and utility control sizes.
  Do not add fixed height, hiding, truncation, positioning, reordering or owners.
- The complete product identity uses 22–26px text with an aria-hidden decorative
  K monogram. Keep one actual h1 and a visibly bordered/accented mono build
  badge beside it. Wrap the full name and badge without truncation; keep
  `min-width: 0`, safe areas and every labelled utility reachable. Quieter controls
  and a tonally distinct context line do not change their owner callbacks.
- Desktop view navigation occupies a 14rem left rail at 1280px and above.
  Below that, a labelled Navigation control opens the shared modal drawer.
- Label the rail Workspace. Inactive primary navigation rests transparent;
  the active item has a current border marker plus aria-current and text, not
  color alone. Preserve all six labels and existing focus/disabled feedback.
- The same six-view navigation styling applies in the desktop rail and modal
  drawer: 8px list gaps, 16px/24px labels, 12px vertical/16px horizontal padding,
  a declared 3rem minimum height for fine input, 8px corners and the existing
  3px left marker. The scoped 8px navigation corners are a local shape exception,
  not a global control-token change. Existing coarse 44px important minima keep
  priority; do not claim a computed 48px minimum or native geometry there.
  Inactive labels remain muted/transparent; enabled inactive hover uses raised
  surface and primary text. Current uses the focus-token full border, raised
  surface, primary text and 600 weight, and stays raised on enabled hover.
  Preserve focus rings, disabled opacity and pointer/scroll/visibility owners.
  Keep exact label/order/type/aria-current/onSelect behavior; only Mission,
  Overview and History are disabled before membership readiness. Source/SSR/
  compiled declarations do not certify native reflow, focus, targets or AT.
- Repository selection and detailed repository status each use a named drawer.
  The compact context line remains visible; do not rebuild a permanent status rail.
- Installed-PWA header, drawers, dialogs, and bottom/right notices respect safe-area insets.
- Sticky/fixed surfaces provide enough scroll padding that focus and hash targets remain visible.
- The complete shell must reflow at 200% zoom and enlarged default text in portrait and landscape.

Repo scopes are a labelled selection group with `aria-pressed`. The workspace control is visibly “All repos” and named “Scope: all repos.” A configured repo retains its exact visible id and is named “Scope: repo <id>”; a repo literally named `ALL` remains distinguishable.

The Repository Scope Picker styles only the existing panel marked
`repository-scope-picker`, its direct scope summary/search label and actual
named scope group/native buttons. One eager stylesheet import belongs to
RepositorySwitcher; App, DialogShell, shared UI and navigation remain unchanged.
The existing summary wraps with 8px gaps/top alignment, 16px bottom margin,
12px padding, a shared 1px border, 8px corners and canvas tone. Its second span
shows the full actual selected identity on one flex line at 16px/24px/anywhere
wrap, overriding ellipsis without a copied value or new state. The first label
and validating text remain 12px. Search's label uses 14px/21px primary text and
16px bottom margin. The native search value and choice labels use 16px/24px,
12px padding and normal 44px minimum-height declarations; the existing coarse
44px-important minima retain priority. Choice gaps are 8px with top/left text.
Keep selected primary fill/white text, focus-token border and enabled
primary-hover feedback. Do not override unpressed backgrounds/shared hover,
focus rings, disabled opacity, pressed state, cursor or touch-action owners.
Control corners remain 6px; panel corners remain 8px, with unchanged max-w-lg,
modal outer/body scroll owners, labelled focusable options region and pager.
Search prominence never means initial Search focus: Close remains the shared
default target. Preserve source order, Close/Escape/backdrop, overlay lease,
inertness, safe-area/reduced-motion and stale-safe focus return. Membership
validation does not disable existing choices or imply complete/fresh data.
No new wrapper, route/data owner, request, width/height cap, clipping, order,
positioning or scroll owner is introduced. The picker CSS is eager; the Active
Plan Gallery remains lazy Overview-owned. Verify actual entry and reachable
lazy CSS separately; source/SSR/assets do not certify native UI or AT acceptance.

Scope choices use a bounded 50-choice pager. Manual browsing must not snap back
to the selected scope's page; the selected scope label remains visible even
when its button is off-page. Without a remembered scope page, follow the selected
choice, including delayed membership hydration. Explicit scope navigation clears
only the rail's same-view page memory; view changes retain their existing full
page-memory reset. Back/Forward restores the saved page, not forced selection
visibility. Preserve valid explicit pages on refresh/reordering and clamp after
list shrink without changing the shared pager or other collection policies.
Search is local to the open picker. Its query-keyed pager never writes the
unfiltered page memory. Clearing search or reopening restores that position.
Do not claim an empty workspace until its first complete snapshot is accepted.
Before that snapshot, Changes/History show loading or failure and Focus/Digest
activation is unavailable. Overview masks workspace-fed metrics/relationships,
but independent accepted statistics, reports and dated snapshots remain usable.
After acceptance, refresh failures retain the last snapshot with explicit context;
they do not reset it to bootstrap-empty data. Keep pick navigation waiting during
hydration under one generation-owned route-focus request. An accepted missing
target falls back to the page heading; a hydration failure consumes the request.
Never resurrect that jump later or let a retired frame steal dialog focus.
Lazy-view error boundaries also own their failure node and pending focus frame.
Revoke/cancel on replacement or unmount; consume the handoff before focusing only
a connected, non-inert owned target without an active overlay. Never use a global
failure ID to focus another boundary or replay blocked focus after a dialog closes.
Track failure occurrence separately from the caught value: JavaScript may throw
falsey or non-Error values. Select fallback for every caught failure without
retaining, inspecting or rendering that raw value.

The six top-level views are Changes, Mission, Overview, History, City, and Chronicle. Put them in a `nav` landmark and mark the active link/control with `aria-current="page"`. Do not claim tab semantics without a complete tab/tabpanel model.

Tasks uses a labelled button and the shared drawer at every width. Keep scope,
current view, Tasks, Attention and Tools reachable. Tools groups reports,
Experience and preferences once each at all widths, including Kat, Combo and
Flow. Preserve visible preference/digest failures when Tools is closed.

Brand version identifies the loaded UI build, read as validated data from the
canonical Python version during Vite configuration. Badge and System button
open the same existing health dialog. Never add a health request just to label
the header; no package-version or Git fallback is permitted.

Do:

> Let labelled navigation or data rails scroll locally while the page itself remains viewport-wide.

Do not:

> Hide document overflow, keep the desktop sidebar on a phone, or remove the only visible route to a utility.

### 3.1 Workbench 2.0 presentation overrides

The identified `katlab-workbench-v2` inline style in the source HTML entry is
the current, bounded shell/dashboard presentation owner. It deliberately
overrides only the historical command-frame outer boxes, desktop current
navigation backgrounds, main gutters, page divider and named Now regions.
Keep their original stylesheets and guards as retained declarations, not proof
of unchanged computed appearance. Verify the actual built inline style too.

The command header uses one zero-minimum grid column below 1024px and two
equal zero-minimum columns from 1024px. Preserve full identity, visible loaded
build badge, natural control wrapping, safe areas, source/focus order and
existing actions. Flatten only outer action/context framing; individual
controls and scope/status chips retain their boundaries and states.

Keep the header's surface tone and matching theme-color. The existing 14rem
desktop rail uses quiet graphite #0b1220; main uses #060b16. All semantic ui
and attribution tokens, fonts and meaning stay. Only the desktop current
navigation background changes to primary, with enabled primary-hover;
the existing current focus border, left marker, text, aria-current, disabled
opacity, target minima and event/press/focus owners remain. The mobile drawer
retains its original raised selection and behavior.

The existing #main-content scroll/focus owner has 1rem gutters, 1.5rem from
768px and 2rem from 1280px. Page headings get a decorative bottom divider.
Reconcile only the unique direct Mission max-w-[100rem] root's padding to
zero, preserving centering, width cap and section spacing. No new wrapper,
scroll owner, clipping, fixed height, order, positioning or motion is added.
Gutter geometry changes intentionally; old pixel positions are not promised.

Overview's actual Now region uses solid surface, 8px corners and 1rem padding,
1.5rem from 768px. Preserve every metric group, four primary metric positions
and first metric focus/primary-alpha emphasis. Other primary metrics use
canvas; captured activity becomes a quieter strip with only its top divider
and 1rem top padding. Plans/Momentum and Now/Trends/Explore/Relationships order
remain. The real selected Mission Now Surface uses surface and 1.25rem padding,
1.5rem from 768px; its 4px sky marker and verbatim backend readiness stay.
Empty/ambiguous/waiting/error/retained states and independent data owners stay.

Existing text/muted/control-border/focus arithmetic against rail is
17.89/7.30/3.93/8.74:1 and against main 18.81/7.67/4.13/9.19:1.
The structural border remains decorative, never a sole control/state cue.
Preserved sources and complete external CSS byte identity are not evidence
of unchanged appearance after these explicit ID-scoped overrides. Actual
source/SSR/compiled delivery is separate from still-open native reflow,
focus, keyboard, coarse input, zoom, AT and operator aesthetic acceptance.

### 3.2 Changes Review Desk presentation overrides

The identified `katlab-changes-review-desk` inline style follows the unchanged
Workbench 2.0 block in the HTML entry. It supersedes only the named Changes
summary and grouped-ledger presentation below. Keep every TSX/JS/global/private
stylesheet and semantic token unchanged. Retained stylesheet bytes prove
preservation, not unchanged computed appearance after these explicit overrides.

The actual captured-work dl becomes one surface panel with 20px padding, 1px
decorative border and 8px corners. Flatten its three metrics' outer framing,
retaining the original 16px gap, one column and three zero-minimum columns from
768px. Only data-has-picks=true restores the action metric's 3px warning border
and adds 16px left padding. Keep its conditional warning label color; false or
unset is neutral. Labels use 14px/20px and exact mono/tabular counters 36px/1.25.
Descriptions remain 14px/1.5. Retain every count, scope qualification and wrap.

Only Grouped uncommitted changes gets a decorative heading divider with 12px
bottom padding and 20px bottom margin. Its task/folder cards use solid surface,
20px padding and 8px corners. Only normal EventRows directly under a card's
div.mt-4 body lose horizontal padding; keep vertical padding, dividers, focus,
wrapping and all metadata/actions. Expanded plan-file rows retain original
padding and their nested 8px wrapper gutters. The TaskGroup's unique direct Why
paragraph uses 14px/1.5 and 8px top margin; nested recovery/continuation copy stays.

Exclude the attribution queue and assignment rows, active-filter panel, sticky
section navigation, History/other work lists, pagers, dialogs and local scrollers.
Retain the 1440px positive-pick queue/list split, saved task/session filters,
unfiltered queue/folder view, 50-item paging, reveal/reduced motion and current
diff/session/file-story recovery. No new wrapper, data/control/request/state,
motion, font, resource, cap, clipping, position/order or scroll owner is added.

Require the complete second-window inverse to Workbench 2.0 HTML, the old
Workbench suite's exact two-adapter inverse, independent current-source SSR/
AST and actual built nine-rule/two-style checks. Preserve all nineteen old
Workbench contexts, its compiled style body and full eager/lazy CSS identities.
Native reflow, focus, keyboard, targets, zoom, AT and operator beauty remain
open; source/SSR/compiled assets and HTTP shells are not native acceptance.

### 3.3 Attribution Station presentation overrides

The identified `katlab-attribution-station` inline style follows unchanged
Changes Review Desk. It supersedes ONLY the actual Manual attribution queue
presentation below; retain 3.1/3.2 and every remaining contract. Keep all App,
API, TSX/JS/stylesheets, semantic tokens and assignment owners unchanged.

The exact direct #sec-pick > named section uses 20px padding,8px corners and
surface background with a decorative half-alpha warning border. Its direct
heading uses a 12px-bottom divider/20px bottom margin. The direct bulk fieldset
uses 16px canvas padding,12px gap and 8px corners. Direct assignment rows use
separate 16px canvas cards/12px top gap/8px corners/decorative border.
Preserve flex/source order/wrap; direct labels min-height 44/gap 8 and direct
buttons min-height 44/padding 8px16px. Direct task-choice triggers flex 1 1 14rem,
retaining current min-width 0/max-width 100 and wrapping. Existing coarse 44
important/focus/disabled owners remain; minimum height is not native target proof.

Only the direct file span.font-mono takes full flex basis, retaining exact
path/mono/typography/break-all. Bulk visible feedback excludes sr-only; row
feedback requires its existing basis-full/text-xs/text-slate-400 context.
Only the existing italic zero-choice span becomes a readable padded panel.
The three exact overflow-wrap:anywhere declarations are allowed; never change
overflow/overflow-x/overflow-y clipping or scroll ownership. Existing caption,
choices, unfiltered queue, selection, partial/retry/deadline logic stays.

Exclude Mode/session/repo-time metadata from feedback styling, nested/portaled
chooser interiors, legend/sr help, queue pager, all grouped/History rows and
other surfaces. Preserve 1440 queue split/768 metrics/1280 rail and every focus,
paging/dialog/disclosure owner. No resource, media, motion, important, token,
font, cap, clipping, positioning/order, control, state, data or automation is added.

Require complete third-window HTML inverse, exact two-window adapters for each
old suite, actual-current SSR/AST, strict three ordered built styles and
independent 14 contexts. Validate the third style before old-style projection;
preserve old 19+9 contexts/bodies and full external CSS, with thirteen compiled
gates. Bytes prove preservation, not computed appearance. Native acceptance
and known transport/zero-choice wording/async limitations remain open.

### 3.4 Diagnostic Studio presentation overrides

The identified `katlab-diagnostic-studio` fourth inline style follows complete
Attribution Station and precedes the unchanged title. It supersedes ONLY the
named System snapshot presentation below; retain 3.1/3.2/3.3 and all remaining
contracts. System is portaled to document.body, not #root. Scope through
`.ui-safe-dialog > [role="dialog"]` and the four exact section aria-labelledby
values: health-server-heading, health-activity-heading, health-providers-heading
and health-repositories-heading. Dynamic modal title IDs are not style hooks.

Keep native section/h3 order and names. Activity and Providers are conditional,
not guaranteed panels. Named sections use 20px padding/8px corners. Direct h3s
use 20px/1.4, 16px bottom margin and 12px-bottom decorative divider. Direct Server
div.grid Rows use 6px vertical padding and decorative separators. Missing-field,
known-version-mismatch and invalid-Chronicle warning panels are excluded.

Activity uses a one-column grid/12px gap, two zero-minimum columns from 640px.
Its h3 spans 1/-1 with bottom margin 0. Its four direct Row grids remain adjacent
label/value pairs but stack even above 640px, with 8px gap/16px canvas padding,
one-pixel decorative border/8px corners. Labels use 14px/1.4; values 28px/1.25/600
use the exact existing configured Azeret Mono and installed mono fallback stack,
retaining tabular figures, anywhere wrapping and nested warning colors. Preserve
pending/rejected/unscoped ignored/registry mismatch text and units; no inferred
metric, availability, freshness or universal positive health indicator.

Existing direct provider div.mb-3 cards use 16px padding/8px corners; their direct
div.grid Rows use 6px vertical padding. Repository #health-repos >div cards use
12px top separation/12px padding, decorative border/8px corners/canvas background.
Their first repo-ID span uses semantic text/600; offline child color owns itself.
The new border intentionally overrides last:border-0 on the last card. Preserve
all four spans, exact timestamps/log-write titles/log sizes/warning counts, original 640px
two-column zero-minimum tracks, full wrapping and fifty-repository paging.

Keep UI-build/receipt/Refresh/Retry/status/loading/error/retained-stale notices
untouched. Retain the 672px cap, maxheight, safe areas, single existing body
scroller and all request/decoder/focus/close/background-inertness owners. Do not
add clipping, fixed dimensions, order, controls, state, API, token/MODE override,
font resource/dependency, motion or :has. Non-Activity Row value typography stays.

Require complete fourth-window HTML inverse and exactly two approved windows
in each of three old suites. Old pure helpers stay byte-identical. Actual-current
SSR/AST and an independent thirteen-rule CSS inventory prove source contracts;
the first two rules have four ordered selectors each. Fourteen compiled gates
validate four exact ordered direct-head styles, all new declarations/cascade and
the fourth body BEFORE projecting only the proven fourth node into retained
Station3/Changes2 checks. Retain complete prior bodies/eager/lazy CSS and all
historic assertions; unchanged bytes do not mean unchanged computed appearance.

Forward erratum: the deferred zero-choice caption change has a verified 21-suite
fixed-point closure in published 2.2, not 19. Current 2.3 closure is verified at 22:
15 direct App-pin owners, five historical owners and two transitive whole-test
owners. The new Studio suite adds the direct owner. Do not present the baseline
as the current total or claim the unchanged caption is repaired.
Retain historical release-note bytes. Native/operator paint, reflow, keyboard,
coarse input, zoom and AT acceptance remain open; source/SSR/built/HTTP evidence
does not certify them or repair the known large Connection:close body fault.

### 3.5 Mission Command Desk composition and focus

Mission Command Desk is a Mission-lazy composition, not a new route or readiness
model. Keep the existing page heading, Refresh, error/loading notices before the
desk and Assignment dialog outside and after it. All original Now, conditional
Plan scope, Attribution forecast, Verification rail, Evidence queue and Session
flight recorder children remain mounted in their original order. Preserve exact
plan/provider/session identities, backend states, independent errors and every
12-plan/50-item page, request, deadline, replay and Exact Data owner.

The named Mission sections nav precedes the content in normal flow. It offers
Now, conditional Plans, Forecast, Verification, Evidence and Flight recorder;
Plans uses exactly the existing Plan scope condition. Use native type=button
ControlButton controls and aria-controls for the existing section H3 headings.
Both mutually exclusive Now branches share one fixed heading ID; never mount
duplicates or reuse data-view-heading. Keep all six named targets at tabindex=-1.
No current-section inference, tabs, hidden panels, fragment links, history writes,
new entry state, persistence, requests, timers or automatic section navigation.

Scope the separate stylesheet to the new desk/nav/content owners. Use one
zero-minimum column and a 24px gap; from 1536px use a normal-flow 12rem rail beside
a zero-minimum content column. Smaller layouts wrap controls above the content.
No sticky/fixed position, new scroller, clipping or reordered DOM. Nav surface
uses 16px padding/8px corners and semantic surface/border/text. Its title uses
20px/1.4/600; supporting copy uses 12px/1.5 and natural anywhere wrapping. Desk
controls use 14px/1.5, 8px vertical/12px horizontal padding and a 44px minimum
height; preserve shared focus, disabled, coarse and reduced-motion ownership.
Content keeps 24px separation. Reapply ONLY selected Now's semantic surface and
20px padding, 24px from 768px, because the wrapper changes its direct parent.
Keep its existing readiness mark, text and every other Workbench/Studio rule.

A user section jump requires the same connected trigger, unique focusable H3,
desk and existing main[data-app-scroll]; reject hidden/disabled/inert ancestors,
active overlay leases, replacement/duplicate nodes and nonfinite geometry.
Invoke the optional callback only after valid preguards. The dedicated App
callback synchronously clears routeFocusRequest through existing flushSync,
then the jump revalidates ownership and geometry. Revalidate again after focus
with preventScroll:true; clamp ONLY current main.scrollTop to finite post-flush
geometry. The old App route-focus effect, generation, hydration/retry, history,
entry, snapshot and API owners stay unchanged. No deferred focus, scrollIntoView,
window/document scrolling or new motion. The callback alone never jumps.

Keep exact native RAW/LF inverses for the two App and eleven Mission windows.
Historical source/suite projection belongs ONLY in preservation assertions;
behavioral AST/SSR/effect hosts use actual current code. Keep historical helpers
and all old oracles, complete four inline styles, eager/Overview CSS and six
dependency files. Recompute transitive current preservation and caption closures
without confusing focused delivery paths or estimates with verified totals.
Include dynamically fingerprinted pre-render owners in affected-source review.
Distinguish the original assertion's bounded semantics from effective coupling:
a strict whole-App input projection also couples that suite to caption edits.
Count the complete current adapter path, preserving original assertions through
projection before fixture mutation; actual release behavior stays unprojected.
Require the fourteen retained compiled gates plus a strict desk/lazy CSS gate
and full isolated/production JSON parity. Installed ReactDOM18.3.1/createRoot
source predicates and controlled synchronous hosts are bounded evidence, not
native React/browser execution or a future-version cleanup guarantee.
Native paint, keyboard/focus, reflow, coarse input, zoom and AT acceptance remain
OPEN; source/SSR/compiled/HTTP checks cannot certify them or the known large
Connection:close fault. A new blocking regression prevents publication.

## 4. Shared component contract

Shared primitives are small implementation helpers, not a component framework. They forward native props and refs, preserve native disabled/focus behavior, and accept `className` only for local layout.

### 4.1 Surfaces and headings

- `Surface` supplies the common panel background, border, radius, and 16px padding.
  Its optional `tone` is `default`, `quiet`, or `raised`; quiet removes decorative
  framing, not names, focus, or interactive boundaries. Local compact padding is
  deliberate, not the default for every panel.
- `SectionHeading` establishes section name, concise supporting text, and owning
  actions. Optional `kind` selects `page`, `section`, or `panel` size without
  changing `level`. A `data-view-heading` heading defaults to page size; level 4
  defaults to panel size and other headings to section size. Presentation props
  never leak onto DOM attributes.
- Owning actions sit beside the heading and wrap below it at phone width.
- Shared CSS roles cover toolbar, metadata, status label, work list/row, metric,
  and empty state. Use the same role for the same intent; they introduce no state,
  request, listener, storage or animation ownership.

Do:

> Put one clear heading and its directly related actions inside a standard Surface.

Do not:

> Nest several unrelated cards under an unlabeled panel or use a unique border/shadow recipe for each card.

### 4.2 Controls

`ControlButton`, `IconButton`, and `SegmentedControl` expose default, hover, active, focus-visible, disabled, and busy states.

- `ControlButton` and `IconButton` preserve native `aria-busy`, including explicit false. Shorthand `busy=true` takes precedence and disables the control; native `aria-busy` alone does not change its disabled state.
- Primary actions use filled sky; ordinary secondary actions use the surface
  plane; explicit `tone="quiet"` uses text and a transparent resting boundary.
  Quiet controls retain visible labels and focus and cannot replace the only
  recognizable primary action. Warning and danger tones retain distinct meaning.
- Shared controls start at 32px in fine-pointer layouts, without changing the
  24px minimum for legacy compact targets. Hover fallback has low specificity so
  explicit semantic action tones retain their intended hover colors.
- Fine-pointer controls remain compact and meet the 24x24 WCAG target floor unless the spacing exception is proven.
- Coarse-pointer controls expose at least a 44x44 hit area without overlapping adjacent actions.
- Enabled controls use a pointer cursor on fine pointers; disabled controls use native disabled semantics and a non-action cursor.
- Use `touch-action: manipulation` for button-like controls without disabling scroll or pinch zoom.
- Pressed feedback starts within 100ms and settles in 80–150ms.
- Icon-only buttons require an accessible name.
- Inline links retain underline and visible focus styles.
- At phone widths, input/select/textarea value text computes to at least 16px.

Do:

> Disable the real button, retain its label, expose busy state, and announce the eventual result once.

Do not:

> Simulate disabled state with opacity alone, hide a control name in an icon, or rely on placeholder text as a label.

### 4.3 Status

- Live, success, warning, and failure states use semantic color plus explicit text/value.
- Frequently changing status rails are not live regions.
- One polite, deduplicated status region announces meaningful action results.
- A persistent CLEAN record is durable state, not an auto-expiring transient toast.
- Release-moment replay identity is the repository + full commit hash pair;
  shared history must not suppress another repository's own version baseline.
  Preserve version-END/three-part-prefix rules, silent seeding, per-repository
  banner ownership and the existing motion/optional notification/sound guards.
- Current clean/uncommitted summaries count only online repositories with valid
  Git status, with explicit known coverage. Retained invalid/offline values are
  unavailable, not zero or clean. WebSocket Connected describes transport only,
  not fresh data or verification readiness.
- Optional local SVG badges use explicit UNAVAILABLE for missing/invalid Git
  observations, with OFFLINE taking precedence. Independent UTC capture counts
  remain separate. White CLEAN-chip text uses emerald-700 (#047857) for normal
  text contrast; the global success token is unchanged. Their five-minute cache
  permits retained snapshots, not automatic refresh or proof of current Git state.
- Workspace favicon/installed-PWA badges cannot disclose partial coverage beside
  a number. Require an accepted, error-free snapshot, nonempty repository list,
  every repository online with strictly valid Git status, nonnegative safe-integer
  counts and a safe total.
  Otherwise request badge clearing and render a neutral '?' favicon; if canvas is
  unavailable, restore the static brand. Clearing is best-effort absence of a
  numeric claim, not CLEAN. Keep known clean/dirty rendering and accepted data
  during ordinary background refresh; add no transport-expiry policy or requests.
- Preserve Git validity and observation metadata in existing WebSocket updates,
  including reconciliation against pending REST responses. Unknown/offline gaps
  invalidate the clean-notification transition baseline; recovery alone is not an
  observed dirty-to-clean event. Keep historical clean records distinct.
- Attention reports pending initial snapshots and unavailable Git status; only
  valid online values are current counts/branches. Captured picks and task nudges
  remain separate facts. Kat uses an uncertain state for incomplete Git coverage;
  live capture combos and earned wardrobe remain independent of Git status.
- Warning banners show one compact summary row by default for any positive count. Their explicit disclosure provides the complete loaded, undismissed list through a bounded 50-row pager and a viewport-limited local scroller; no warning detail rows mount while collapsed. If the shell is too short for a visible in-flow detail row, the non-modal panel opens above the summary without shrinking the main view. Other banner/toast previews remain bounded and use a labelled “+N” disclosure where applicable.

Do:

> Pair an amber indicator with “3 uncommitted” and keep the recovery action close to the message.

Do not:

> Announce every heartbeat through a live region or communicate clean/warning state by green/amber alone.

### 4.4 Icons

- Use consistent inline structural SVG icons at 16px or 20px.
- Decorative SVGs and personality emoji are `aria-hidden`.
- Emoji may support KATLAB personality but never replace the only label or state cue.
- Reuse the shared icon module; do not add raster UI assets or an icon dependency.

## 5. Dialogs and disclosures

All modal dialogs and drawers use the shared portal-based dialog foundation. It owns:

- `role="dialog"`, `aria-modal="true"`, and a programmatic name;
- initial focus and dynamic Tab/Shift+Tab containment;
- Escape handling and explicit labelled close control;
- optional backdrop close;
- background inertness, shared overlay lease, and app/body scroll containment;
- safe focus restoration to a connected, visibly focusable opener or the main-content fallback;
- layer 100 and safe-area padding.

Command Palette, File Story, Session Timeline, System, Wrapped, relationship-graph
expansion, Navigation/Repository/status/Tasks drawers and Focus Mode use this
foundation. Focus Mode keeps its explicit-close fullscreen behavior.

System always shows the UI build, including loading and failed health requests.
Accept only an exact four-part server version; missing/malformed versions are
Unknown. Explain a known UI/server mismatch without automatically reloading or
claiming that a backend restart updates an already loaded browser tab.
Missing optional health fields do not establish a version mismatch. When offering
update guidance, name stop Tracker/demo, rebuild UI, restart Tracker and reload
the tab conditionally; show that sequence once if warning conditions overlap.

System health is a manually refreshed snapshot, not a live stream. Its stable
Refresh/Retry control remains disabled while a single request is pending;
closing stays available and silently cancels that request. Keep the last
successful response during refresh/failure and label it explicitly. Show its
local browser receipt time, update it only on an accepted response, and base
the displayed uptime on that receipt time. This is not a server observation
timestamp or freshness guarantee. Health requests bypass browser cache.

Compose the accepted System HealthBody as four named native sections with h3
headings, in order: Server, conditional Activity inbox, conditional Providers
and Repositories. Their exact heading IDs are health-server-heading,
health-activity-heading, health-providers-heading and health-repositories-heading;
each section uses aria-labelledby. Keep one HealthBody under the single modal
snapshot owner. Use shared surface/border tokens, 16px panel padding, 8px corners
and 16px/24px body copy, values and headings. Nested provider panels use 8px
corners, 12px horizontal and 8px vertical padding without changing keys or text.
Row remains a div with adjacent label/value spans: 12px labels, 16px/24px values,
tabular figures, anywhere wrapping and 8px top/bottom padding. Stack below 640px;
from 640px use the original label/value two-column order with a 12px gap.
Repository rows keep four original spans in order, stack below 640px and use two
columns from 640px with a zero-minimum value track and inherited anywhere wrap.
Preserve exact values, offline badges, log-write titles and 50-repository paging.
Cap the System panel at 672px within the existing viewport/safe-area limits.
More vertical content must use DialogShell's existing body scroll; do not add
fixed heights, clipping, font scaling, a new scroll owner or freshness inference.
Keep UI build visible at all states, including its larger Row value styling.
Source/SSR/classes and compiled-asset checks are not native layout, keyboard,
focus, zoom, coarse-input or assistive-technology acceptance.

Validate consumed health fields before accepting a snapshot. Malformed successful
JSON uses the existing static failure/Retry path without echoing its contents or
replacing prior data/receipt time. Counts and byte sizes must be nonnegative safe
integers (nullable sizes remain valid); server start time must parse for uptime.
Other nullable timestamps retain string formatter fallbacks. Missing/null optional
activity/providers, empty collections and extra fields remain compatible. Version
and Chronicle keep their independent Unknown/missing/invalid decoders. This is a
display-data guard, not proof of server health or a global render error boundary.

Health's polite atomic status region lives inside the modal, outside the
inert application root. Do not rely only on the background status announcer
or mark the local status region busy while announcing a request. Refresh
does not programmatically move focus or replace the action button node.

File Story and Session Timeline also keep a stable local polite/atomic status
inside the active dialog. Announce loading before old data/error during retry,
then a bounded failure with recovery or the accepted captured-row count. Zero
rows is a successful empty result. A full final page means the fetch limit was
reached, not that additional matching rows are known to exist. Describe only the
fetched window and say "More may exist" in the local announcement and shared
visible cap note. Use accepted row counts; do not claim complete history or
event-timestamp ordering from an ingestion-ID-based window. Use the shared
dialog status primitive; do not change focus or fetch
lifecycle merely to announce a result. Keep visible error/retry feedback too.

File Story and Session Timeline order only their accepted captured rows by
finite parsed epoch milliseconds, then ascending global event ID. Unparseable
times remain last by ID; keep their raw text and row references. Same-ms and
sub-ms values tie by ID, not microsecond chronology. Do not silently discard
invalid rows or claim their effort estimate is repaired. Backend ingestion-ID
window selection and text timestamp filters remain unchanged.

Session Timeline qualifies adjacent display runs by repository and raw task
reference. Changing repository starts a new heading even when labels match;
a page boundary continues only the same repository/reference run. Preserve
existing unresolved text, rows, ordering, effort and paging. This is display
grouping, not canonical task identity, a relational join or attribution.

The shared duration formatter shows "Unavailable" for NaN and either infinity;
do not present nonfinite values as approximate durations or replace them with
zero. Finite formatting remains unchanged, including negative and fractional
values. This is a display fallback, not a timestamp, effort-estimator or stats
repair. Keep raw invalid date labels and admitted event rows. Existing caller
mount predicates remain authoritative; this does not promise every malformed
surface displays the fallback. The generic label also fits uptime and gaps.

Backend effort aggregation copy-sorts each parsed epoch group before applying
the unchanged strict 15-minute gap, two-minute tail and whole-minute rounding.
Mixed timestamp precision must not invent effort gaps or reorder task ranking.
Keep the approximate marker; calendar and Wrapped share the existing estimator.
Stored timestamps, raw date buckets and lexical time-window selection remain
unchanged. Do not present this bounded ordering fix as global UTC normalization.

Tools, Attention, Legend, and goal settings are disclosures, not ARIA menus. Use
`aria-expanded` and `aria-controls` with ordinary buttons/links. Escape closes and
restores the connected opener; outside activation must not steal the destination's
focus. During disclosure/dialog handoff, suppress outgoing focus restoration until
the destination owns focus. Never leave two header disclosures open. Palette-to-
Tools/Legend handoff waits for overlay teardown and checks the current owner.

Disclosure closed setup does not invalidate outgoing focus restoration; each
active setup still advances its lifecycle. After lifecycle and handoff-suppression
guards, non-Escape cleanup preserves connected focus outside its captured original
root, checked in the queued callback. This includes keyboard navigation before
warnings disappear or CLEAN records collapse. Explicit Escape still restores;
body, disconnected or internal focus follows the existing opener/main fallback.
Preserve warning-owned layout recovery, initial focus, latest close callback,
listeners, effect dependencies, reopen/StrictMode protection and dialog ownership.
Controlled focus-call tests do not establish native keyboard or focus acceptance.

Warning details sort ascending across the backend's bare-second and six-digit
UTC timestamps. Pad only local comparison copies of bare seconds with six zeros;
retain full microsecond precision and stable ties. Do not mutate raw timestamps,
JSON dismissal keys, messages, input arrays or repository scope. Counts, collapsed
summary, fifty-row paging and disclosure/focus recovery stay authoritative.
This fixes loaded warning order, not backend retention or global normalization.

Palette ArrowUp/ArrowDown reveal the selected command inside its existing local
list viewport without moving input focus or scrolling an outer container.
Opening, raw query edits, paging and result replacement reveal the first current
option. Hover alone does not scroll. Already-visible options cause no scroll
write; oversized options align their leading edge. This bounded rule does not
resolve outer-dialog clipping at very short viewport heights or establish native
keyboard, geometry or assistive acceptance.

Do:

> Move focus into the destination dialog before releasing the shared overlay lease.

Do not:

> Copy a focus trap into each modal, use `role="menu"` for ordinary actions, or restore focus to an unmounted trigger.

## 6. View-specific composition

These rules extend the global shell; they do not replace it.

### 6.1 Changes

- Tasks is available through the shared drawer at every width.
- Immediately after the unchanged Changes heading, a labelled definition list
  presents Needs attribution, Captured edits and Task groups. Use exact current
  loaded counts before paging: the unresolved queue ignores task/session
  filters, captured edits are the loaded uncommitted window, and task groups
  retain their task/session filters even in folder mode. Explicit captions
  describe these boundaries; never imply Git dirty-file totals, complete
  workspace coverage, readiness or clean status. Bootstrap/failure stays in
  the existing workspace gate, not a false zero-valued summary.
- Summary panels stack below 768px and use three equal `minmax(0,1fr)` columns
  from 768px, with 8px radius, 16px padding, 32px tabular numbers and wrapped copy.
  Only a positive unfiltered queue receives amber action emphasis.
- At 1440px with a positive queue, use two columns `minmax(0,0.9fr)` and
  `minmax(0,1.6fr)`, 24px gap and start alignment. All root children span both
  except the existing attribution root in column 1 and grouped section in
  column 2; reset space-y margins only inside this grid. Attribution remains
  first in DOM. Narrow/no-pick views stack; preserve section IDs, anchors,
  main scroll ownership, complete loaded models and 50-item presentation.
  Add no sticky/fixed/inner-overflow workbench, height clipping, reordered
  content or new request/state owner. Task work lists use scoped tonal
  separation rather than competing card emphasis.
- Keep unresolved attribution ahead of the grouped work list, with task/session
  filters and clear actions visible in both task and folder modes.
- Task, session, grouping, section-navigation, manual-pick, event, file-tree, and diff-line collections use bounded presentation when their source can exceed 50.
- Filtering, select-all, assignment, counts, and exports always use the complete loaded model.
- Classify a complete diff before paging lines, so hunk/header color and order remain correct across pages.
- The shared Changes/History inline Diff button reports `aria-expanded` from
  the existing accepted-content mount predicate. Accepted empty strings and
  offline retained content are expanded; closed/not-yet-accepted content is
  collapsed. Error/status paragraphs do not themselves expand DiffView. Keep
  existing names, disabled/busy feedback, requests, focus and local paging.
  This local semantic rule does not certify native keyboard or AT behavior.
- Long paths and diffs scroll only inside labelled local containers.
- Offline repositories cannot load/retry a diff, but an accepted diff keeps local
  Hide and explicit retained-data context. Pending/error copy must not promise an
  unavailable retry. Before offline Hide removes its own focused control, focus
  only its connected containing row, without scrolling, inertness or overlay
  interference. Availability updates alone never move focus.

### 6.2 Overview

Preserve every shipped module and group them in this order:

1. Now — KPI row, Plan Board, momentum.
2. Trends — charts, calendar, day lanes, coupling, punch card.
3. Explore — goals, identity, churn, trophies, records, provenance.
4. Relationships — task/commit graph.

Use one SectionHeading and one Surface vocabulary. Chart canvases and informative graphics need concise summaries and exact-data alternatives. Overview and its graph reserve stable loading/error footprints.

Attribution health summarizes the existing six-mode denominator as captured
events, including UNKNOWN and AMBIGUOUS with no task reference. Preserve mode
counts/order/labels, first-tie behavior, locale/rounding and chart/table data.
The zero-total helper is defensive; the Overview card still requires a positive
total. Events per task remains a separate task-attributed subset.

Relationships commit-link counts and cells require a matching accepted History
response, not task-only placeholders, row count or diagram settlement. Keep task
details independently available; unknown links are unavailable, not zero. Label
the last accepted window of up to 500 commits, not complete plan history. Publish
row provenance before diagram rendering at the original guarded point; offline
synthetic rows remain unobserved. Every provenance branch identifies pending or
failed map updates and any retained previous-render diagram. Preserve requests,
render owners, cancellation, deadlines, Retry/Reload, composite selection and
bounded exact-data paging. Controlled source/SSR checks are not native acceptance.

Now has four primary metrics: attribution needs, known uncommitted changes,
known clean repositories and dated effort. Captured events, auto-attribution and
busiest task remain secondary. No status data means unavailable, not zero.
Never scale down metric text; wrap while retaining exact values and snapshot dates.

The Overview Operations Deck is scoped CSS presentation of this existing Now
section, not a new summary or interaction owner. Frame its primary metric group
and a quieter captured-activity strip without changing semantic markup, source
data, hooks, callbacks, requests, timers or state. Below 768px both groups stack;
from 768px use two equal primary columns and three secondary columns. From 1024px
use three asymmetric primary columns: the first metric spans two rows; dated
effort spans columns 2-3 on the second row. Preserve DOM/read order and natural
height/wrapping. An absent busiest task remains absent, not a placeholder.
The first metric's sky accent is neutral across all states, including measured
zero and unavailable. Never infer readiness, warning, cleanliness or complete
coverage from that accent. Keep primary/secondary values 32px/20px, panel gaps
and padding 16-24px, heading-divider padding 12px, inner secondary-metric padding 0
and corners 8/12px. Preserve every exact date, coverage/retained-snapshot caption,
independent stats/workspace gate, PlanBoard and positive-event gate, count-up and
reduced-motion behavior. Do not add scale, clipped/fixed height, sticky layers,
motion or a scroll owner. CSS/source/SSR contracts do not certify native paint,
geometry, focus, keyboard, zoom, coarse input or assistive technology acceptance.

The Momentum Comparison Deck styles only the existing MomentumStrip Surface
marked `data-momentum-deck="true"`, its real local scroller and direct metric
card descendants. Its one stylesheet import is lazy Overview-owned alongside
the Active Plan Gallery; discover the actual built lazy CSS identity, which
changes even though Gallery source remains unchanged. Keep the original Now
position, caller gates, SectionHeading, region name, tab stop and reveal owner.
Remove only the outer grid's artificial 420px minimum; retain its existing
one-column/sm-three-column template with 16px gaps. Each original card becomes
one zero-minimum grid column with 16px padding/gaps, a shared 1px border,
8px corners and raised tone. Existing items-center stays; rows are intrinsic.
Use 16px/24px labels, 32px/40px tabular selected values in the existing Azeret
Mono stack and 14px/21px delta/preceding copy. Retain the value-line baseline
and 8px gap while allowing wrapping; long values and comparison copy wrap
anywhere. Preserve muted/up/down text and color meanings, not color-only state.
Only the optional second direct card child loses its automatic left margin;
the spark wrapper retains max-width 130px and the SVG retains h-7 (1.75rem,
nominally 28px at a 16px root), viewBox 100x28 and aria-hidden. Do not claim
full-line spark stretching.
Preserve supplied UTC periods/coverage, missing versus measured zero, partial
sums, two-complete-window delta/spark gating and the existing shared-boundary
normalization. No date, format, class, node, source order, hook, request, state,
dependency, font service, focus, motion or scrolling owner changes. Source,
SSR and assets do not certify native geometry, zoom, focus, keyboard or AT.

Repository Profile Readability changes only six className windows in the
existing IdentityCard. Keep its real level-4 Repo identity heading, scope
description, named keyboard-focusable local scroller, Surface/reveal owners
and one/two/three-column parent. Card width follows that containing block,
not the entire viewport. Use existing Tailwind utilities, without an import,
new stylesheet, wrapper, marker, breakpoint, motion, font or scroll owner.
Frame distribution, zero-distribution copy and facts with shared 1px borders,
8px corners and surface tone. Root spacing and panel padding use 1rem;
the empty paragraph keeps 1.5rem vertical padding. Caption/facts use
1rem/1.5rem type, nominally 16px/24px at a 16px root. Make the caption
semibold and let facts wrap anywhere; existing legend/count type stays.
The shared heading's existing !mb-0 override leaves root sibling spacing
in control. Preserve all labels, DOM order, keys, decorative SVG/bar geometry,
categorical rank colors, rounded percentages and raw count formatting.
The distribution counts captured file-edit events, not distinct files,
excludes plan files and keeps the server's top eight plus remainder. More
than five positive slices use bars; otherwise use the original donut.
Zero distribution retains facts when the existing Overview branch is mounted.
Sessions keep provider/session identity, first capture uses local fmtTs,
commits are all-time and positive effort is the supplied UTC-calendar estimate.
Preserve zero/nonfinite gates, empty-string scope and retained-data/request
owners. No new availability, productivity or fresh-snapshot claim is introduced.
Require exact six-window RAW/LF preservation and the unchanged original
class-stripped AST. Verify every utility in the approved class strings and
actual compiled IdentityCard ownership while retaining every eager/lazy CSS
byte and all previous compiled owners/historical inverses. Source/SSR/assets
are not native paint, geometry, reflow, keyboard, zoom, AT or aesthetic proof.

The Active Plan Gallery styles only the existing PlanBoard Surface marked
`data-active-plan-board="true"` and its direct list/card/header/spotlight owners.
Its stylesheet import belongs to PlanBoard, loaded with lazy Overview only;
do not present it as an eager application stylesheet or Tasks-drawer feature.
Below 1024px the gallery has one zero-minimum column; from 1024px it has two
equal zero-minimum columns with 16px gaps, preserving DOM and pager order.
The direct list is borderless/transparent with no corners. Each original card,
including the last, uses a shared 1px border, 20px padding, 8px corners and
surface tone. This local 20px padding does not change the standard panel token.
Keep the existing wrapping header with 12px gaps/top alignment. Its full
basename occupies one flex line at 18px/27px with anywhere wrapping; repository
and done/total remain 12px. Existing active-task spotlights use 16px padding,
a 3px warning-token left boundary, 8px corners and raised tone. Direct card
paragraphs and spotlight explanatory paragraphs use 14px/21px/anywhere wrap.
Preserve grouping/sort/composite identities, every active task/first pending,
zero/done-only hiding, independent stats/workspace gates and retained warnings.
No new wrapper, state, metric, request, fixed height, clipping, ordering, motion
or scroll owner is introduced. Progress segments, declared-file controls and
patterns, four-file previews/+N, exact-data table and all 50-item pagers retain
their source and interaction owners. Discover the actual built lazy CSS path;
entry CSS alone does not prove gallery delivery. Source/SSR/assets do not
certify native paint, geometry, focus, keyboard, zoom, coarse input or AT.

Active plans file declarations can be paths or custom-glob scope patterns. Show
'*'/'?' patterns in full with a visible 'pattern' label, without a button, link or
tab stop; only concrete paths open their exact repository/file Story. Brackets
are literal. Preserve the four-entry spotlight preview and complete source model.
Exact-data cells page declarations above50 using the existing 50-item local pager,
with kind/repository/plan/task identity and global ordinal keys. Do not expand
patterns, infer matching files or introduce new requests. Full declarations wrap
locally; controlled callback/SSR checks do not certify native acceptance.

The Personal Records Showcase styles only the existing quiet Records Surface
marked `data-personal-records="true"`, its direct ul/li and first three direct
text spans. Keep the complete list AST, pre-return detection/hooks, helpers,
classes, strings, four keys and source order unchanged. One records-owned CSS
import is eager through App -> pet -> records, not Overview-lazy. Keep its
Explore placement after trophies and typed repo/all remount ownership.
Use one zero-minimum list column below 640px and two equal columns from 640px,
with 16px gaps. Each original li keeps relative/flex/wrap/baseline/horizontal
gap behavior and uses 16px padding, a shared 1px border, 8px corners and surface
tone. Its scoped border overrides the last-row border utility without important.
Only the first three direct spans use full flex-basis, min-width 0 and anywhere
wrapping: label 16px/24px, value 32px/40px tabular figures in the configured
Azeret Mono stack, date 12px/18px with automatic left margin removed.
The first two text spans have 8px bottom margins; li row-gap is zero. Do not
style the optional fourth decorative wrapper or its twelve nested particles,
add spacing for it, or introduce positioning, clipping, animation or scrolling.
This does not certify native zero-jump geometry. Account for the half-width
Records pane beside trophies from 1280px, not just the viewport's total width.
Preserve supplied UTC bounds/coverage and dates, earliest ties, full-calendar
display versus prior-calendar detection, strict crossing/first-payload seed,
rolling-seven/streak/wardrobe calculations, nonce/timers and live reduced motion.
Empty-calendar numeric zeros remain explicitly deferred behavior with an
unavailable period; this presentation does not introduce Unavailable values,
certify complete partial windows or claim current/fresh records. Verify actual
eager CSS and a complete old-global-byte inverse after subtracting only validated
Records rules; existing Gallery/Momentum lazy CSS stays unchanged. Source,
SSR, controlled rendering and assets are not native geometry, focus, keyboard,
zoom, coarse-input, AT, motion or subjective acceptance evidence.

The Achievement Gallery styles only the existing quiet TrophyCase Surface
marked `data-achievement-gallery="true"`, its direct grid/tiles and direct
numeric/supporting/header owners. Its import is lazy Overview-owned beside
Gallery/Momentum, not eager Records. Keep seven ranked achievements and two
secrets, their nine keys/order, classes, margins, one/two/three columns at
640/1536px and half-width placement beside Records from 1280px.
Use 16px gaps and tile padding, a shared 1px border, 8px corners, surface tone
and min-width 0. Numeric children use 32px/40px tabular Azeret Mono with anywhere
wrapping; basis/secret stories use 14px/21px and next-rank copy 12px/18px.
Titles wrap with min-width 0. Rank badges use 6px corners, 4px/8px padding and
12px/18px. Do not restyle the shared heading, nested progress, adjacent panels
or motion/scrolling owners; no fixed height, clipping, ordering or new font.
Only ordinary C/B badge foregrounds change to #ffffff/#020617 on the original
#64748b/#0284c7 backgrounds. Require unrounded source-pair contrast at least
4.5, including all other rank/unranked/secret pairs; native rendered acceptance
remains separate. Keep all other colors, progress opacity, inclusive thresholds,
rank/next/max/rounding/cap, calendar and all-time/local-time bases, scoped tasks
versus server-scoped stats, locked ???/stories and React escaping unchanged.
Add no data, hooks, state, request, API/storage or clock behavior. Verify all
seven lazy compiled additions and restore the complete old lazy CSS bytes
after subtracting only validated rules; retain the entire eager stylesheet.
Current-only SSR/source/contrast/compiled assets do not certify native paint,
geometry, focus, keyboard, AT, zoom, state/motion or subjective acceptance.

The Provenance Evidence Desk styles only the existing quiet Provenance Surface
marked `data-provenance-evidence="true"` and its owned measurement/file ledger.
Keep its full-width Explore placement below Trophy/Records, real level-4
heading, scope description, reveal and positive-event/statistics gates.
Stack below 1024px viewport width; from that boundary use zero-minimum
0.7fr/1.3fr columns with 16px gaps. Both panels use 16px padding, shared 1px
borders, 8px corners and surface tone. Account for the navigation rail and
actual containing block rather than claiming viewport-wide panel space.
Use 32px/40px tabular configured Azeret Mono measurements, 16px/24px labels
and file actions, 14px/21px copy and 12px/18px row metadata. Full raw paths,
values and labels wrap anywhere. Rows have 12px vertical padding; ratio-only
auto margin does not move the meter or repo. Add no truncation, clipping,
fixed height, position, reordering, font resource, motion or scroll owner.
File actions retain shared controls, normal 44px minimum height and the
higher-priority coarse 44px-important minima, focus, hover and press owners.
Show repo-qualified accessible action names and pass exact repo/file to the
existing File Story callback. Without that callback render a static full path
with no focusable no-op or promise to open. Preserve server row order and
composite keys, ALL labels only for undefined scope, and empty-string scope.
Linked captured edit evidence is not authorship or lines of code; unlinked
changes do not prove human-only work. Preserve observed per-commit/per-file
counts, plan exclusions, earlier excluded copy, zero-slot hiding, exact
percentage policy and both raw one-decimal decorative bars. Positive slots
with no ranked rows explicitly describe snapshot absence. Correct only
card-local obsolete provider wording; existing App Legend is outside scope.
No data, hook, request, state, API/storage, clock or attribution owner changes.
The import is lazy Overview-owned. Validate all eleven new compiled Desk rules
before recovering every old1.11 lazy byte from a clone; Achievement's seven
validated rules then recover old1.10 from that proven clone. Retain actual
new-source/bundle checks, every old assertion and the independent unchanged
eager stylesheet/Records inverse. Source, SSR, CSS declarations and served
assets do not certify native paint, geometry, targets, focus, keyboard, AT,
zoom, motion or subjective acceptance.

### 6.3 History

- Style only the existing data-history-ready owner's direct Captured commits
  region and its direct card/header/disclosure elements. Attribute presence,
  not a true value, applies the same appearance to accepted and same-repo
  retained rows without suggesting freshness. Graph, error, skeleton, empty
  guidance, nested EventRows and shared controls are outside the selector scope.
- Use a transparent, borderless one-column region with 16px gaps. Each direct
  commit article uses a zero-minimum grid column, 16px inner gaps, 20px padding,
  a 1px shared border, 8px corners and the shared surface. No shadow, status
  tint, timeline connector or ancestry inference. Grid uses existing elements;
  do not add DOM wrappers, fixed height, clipping, scrolling owners, positioning
  or CSS containment. Import the scoped stylesheet once from AppShell, without
  changing App, bootstrap, shared CSS or existing view/state/control owners.
- Preserve hash, h3 title and timestamp DOM/read order. Below 640px stack them
  with 8px gaps; at 640-1439px use hash/title columns with 12px gaps and time
  spanning the next row. From 1440px use three columns with a zero-minimum
  timestamp track capped at 12rem. Title remains 16px/24px; hash/metadata type,
  colors and monospace stay, with tabular hash/time. Long titles and timestamps
  wrap instead of scaling, truncating or forcing nowrap. The native full-ID
  disclosure gains a quiet divider and 12px top padding without new behavior.
  Existing fine/coarse target minima and keyboard/focus owners remain intact.
  Source/SSR/compiled CSS checks do not certify native geometry, paint or AT.
- Keep the compact commit header and expose its full captured ID through a
  default-closed native disclosure with a labelled, selectable read-only field.
  The exact value is not truncated or transformed; long values scroll inside
  the field. Scope/repo/full-hash changes remount the disclosure closed, while
  unchanged identity and event paging retain native state. Do not fetch, write
  the clipboard, autofocus or auto-select. The hover title is supplemental only.
- Keep API fetch depth separate from the visible 50-row page.
- Commit graph loading, unavailable and preparation differ from accepted empty
  History. Show zero-row exact data and No commits only for the matching loaded
  repository after an accepted empty read. Cold hydration and automatic online
  fallback cannot reuse a previous repository's exhausted/empty state.
- Retain accepted same-repo graph rows/SVG on later History failure. Suppress
  previous-repo graph data, failure and caption before fallback completes;
  keep its existing host mounted but hidden for absent/mismatched repo or empty
  SVG, preserving the passive clear/adoption owner. Main-list empty copy also
  waits for hydration and loaded ownership; no-repo guidance stays explicit.
- Bound commit rows and per-commit event rows without changing endpoint limits.
- The repo chooser uses the shared bounded choice dialog.
- Changing repo clears stale rows, graph, loading, exhausted, and error state before the new load.
- The Mermaid graph retains a structured alternative and an honest Reload path for cached module-load failure.
- Git graph init configuration must decode to the exact sanitized main name used by merge checkouts, including apostrophes. Serialize the directive as JSON and unicode-escape apostrophes before Mermaid's quote normalization; keep existing label normalization and strict rendering unchanged.
- The Git graph is a bounded sequence of the newest twenty fetched commits,
  not reconstructed ancestry. Seed its oldest visible entry as its own commit,
  including a merge, before decorating later merges. Do not invent an ancestor
  or advance side-tip counters for that first entry. Keep full parent data in
  structured rows; the existing table abbreviates hashes. Explain sequence and
  later-tip summarization in the caption and keep render-error recovery honest.

### 6.4 City

- City remains workspace-wide and preserves configured-repo order and full-model calculations.
- Render six districts per page and rebase the visible slice to page-local ordinals 0–5.
- Full-model scales remain comparable; actions retain exact repo ids.
- Cancel/remove prior-page rain/reward transients and timers on page change. Off-page events never queue for replay.
- The SVG name and pager state the visible repo range.
- Snapshot only the visible page; include its range in the document title, description, and collision-safe filename.
- Retained SVG building/district operations have names, visible focus, Enter/Space parity, and dedicated non-overlapping 44x44 pointer target zones; the paged exact-data disclosure remains their structured alternative.
- Reserve the no-data footprint and show an honest stale/unavailable state with Retry.
- Invalid current Git status is labelled unavailable in plaques and exact data;
  do not decorate retained clean values as a current clean district.

### 6.5 Chronicle

- This contract owns the React host and `pages.py` generated stylesheet only.
  Keep a visible Chronicle heading and real new-tab link beside the reader.
- The iframe fills the measured flex remainder; never subtract a hard-coded header height.
- The host checks page availability with a bounded, abortable HEAD request.
  Before success, retry 10 seconds after each failed check, with a 10-second
  per-attempt deadline. Ignore settled or unmounted attempts' late results.
- Distinguish checking, no page (404), and an unavailable check (other status,
  network failure, or timeout). Do not promise a build deadline or infer worker
  health from page availability. Keep the section name and heading stable.
- Stop host probes after the first successful check so a transient response
  cannot remove the opened iframe. A new view entry checks again; the generated
  page retains its own existing freshness/navigation behavior.
- A focused same-origin iframe counts as activity and blocks attract-mode arming.
- New-tab actions are real anchors with `target="_blank" rel="noopener"`.
- The actual generated `div.col-md-9[role="main"]` uses one quiet reader
  canvas: panel tone, shared 1px border, 8px corners and 24px padding above
  640px, with 16px padding at or below 640px. Keep its existing minimum-width
  and anywhere-wrap owners; do not add a wrapper, scroller or clipping.
  Only direct paragraphs/lists/blockquotes receive a `72ch` maximum measure.
  Top-level headings/tables/pre/diagrams/images have no new 72ch declaration;
  media/code/tables inside bounded prose obey that containing block's width
  and retain existing wrapping/bounds. `ch` measures a font's zero-glyph
  advance, not a guaranteed count of characters. This choice certifies neither
  WCAG 1.4.8/AAA nor native reflow or subjective acceptance. Preserve the grid,
  native table semantics, local fonts, focus, reduced motion, TOC/search/nav,
  content and static version-free footer. Change only the pure generated CSS
  constant; deliver through the existing safe writer/strict candidate/swap and
  verify actual generated/served main markup, CSS link and exact stylesheet.
- Generated MkDocs runtime under `Chronicle/runtime/` is never hand-edited.
  Harmonize its CSS through the generator: local Segoe UI/Consolas, quiet slate
  canvas, readable muted text, focus-visible, reduced-motion and bounded long
  content. Preserve pinned assets, signed runtime, sanitizer, navigation and
  build/swap lifecycle. Inspect the generated document, not only its iframe host.

### 6.6 Mission

- Effect cleanup retires the corresponding read owner before aborting it.
  Queued failures and timed-out predecessors cannot overwrite a replacement's
  error/loading state or current Refresh result. A current deadline timeout
  remains visible, including owners created after that deadline expires and
  final-part settlement after the run reference clears. Preserve per-part
  generations, refresh tokens/accounting, selection deferrals and existing Retry.

- Compose the view in this order: Now, plan scope, Attribution Forecast,
  Verification Rail, Evidence Queue, Session Flight Recorder, and Exact Data.
- Spotlight a plan only when the current data proves one unique active plan or the
  operator explicitly selects an exact repository + relative-plan pair.
- Now, Verification Rail and Evidence Queue distinguish loading/unavailable base
  snapshots from accepted empty scopes. Ask for plan selection only when accepted
  plans exist; accepted summary data outranks a pending busy transition. Keep
  placeholders quiet and recovery in the existing Mission Refresh/Retry owner,
  independent of additive Forecast and session/timeline availability.
- Render backend readiness verbatim. The UI may format state labels but never
  infer, upgrade, or suppress a readiness state or blocker.
- Make the selected Now plan visually primary. Plan scope and Forecast stay
  secondary. Page all blockers and warnings at 50, with exact repository/plan
  identity and total counts; do not silently truncate after the first page.
- Mission Plan Gallery is a view-local shape/type exception on the existing
  #mission-plan-cards owner. Use one column below 768px, two from 768px and three
  from 1280px, with 16px gaps. Direct native plan-choice buttons use 20px padding
  and 12px corners; their existing name labels use 18px type and 28px leading.
  The existing 12px count footer spans the card width, uses auto top margin,
  a divider and 12px top padding, tabular figures and overflow-wrap:anywhere.
  Stretch naturally by grid row without adding fixed/min/max heights or clipping;
  keep existing 32px control and 44px coarse-target minima. Never scale or omit
  long identities/counts. Preserve all children and meaningful DOM/read order.
  Import this separate scoped stylesheet immediately after shared index.css in
  the existing bootstrap. Do not alter the shared stylesheet, Mission owners,
  selection callbacks, exact repository/plan keys, aria-pressed, state labels/
  tones, done/total/progress, 12-item paging, focus, hover, motion or scroll owners.
  Do not add ARIA grid semantics, roving focus, status inference or another data
  source. Source/SSR checks and separate compiled-asset checks are not native
  paint, geometry, focus, keyboard, zoom, coarse-input or AT acceptance.
- Attribution Forecast is a separate read-only preview from the last completed
  plan sync. Show the exact repo, Git/demo observation time, plan-context time,
  five mode totals, and actual dirty paths. Say that plan edits appear only after
  watcher sync. Never imply a refresh starts reconciliation or the preview
  establishes readiness. A plan warning stays visibly degraded.
- Select forecast only from an exact repo scope or the selected plan's repo;
  otherwise ask for selection. Show truncated workspace scope and direct the
  operator to exact repo scope for omitted repos. Loading, clean, temporary
  busy/Retry, offline, unavailable, old-server, malformed-forecast, and
  transport-error states remain distinct. Malformed additive forecast data
  must not blank Now, plan scope, or Verification Rail.
- Locally page the complete forecast at 50 mounted path rows. Wrap long paths,
  stack at narrow widths, and contain any overflow in a labelled local scroller.
  Show separate visible/accessibly named plan_file and task_id for each target
  and candidate. When candidate_count exceeds ten, say "10 of N shown" both
  visibly and accessibly. There is no candidate-selection action. Keyboard,
  200% zoom, reduced-motion, coarse-pointer, and the shared polite status
  channel remain usable without color-only distinctions or animation.
- Keep plan cards, requirements, evidence, sessions, timeline events, assignment
  choices, and exact-data rows at 50 mounted items or fewer. Use REST offsets for
  activity/session paging.
- Identify a session by provider + session ID everywhere. Missing agent or parent
  facts remain explicit; attach activity without an agent ID to the labelled
  Session root lane and never invent hierarchy.
- Order flight activity by timestamp then database ID. Playback moves only through
  that deterministic order; reduced motion removes autoplay and retains direct
  range/table selection.
- The timeline is an enhancement over the same bounded rows shown in a labelled,
  keyboard-operable Exact Data table.
- Failed evidence/session/timeline reads show their existing error/Retry, never
  successful-empty claims. Suppress empty timeline selection guidance after list
  failure. Exact data is hidden during timeline failure or failed session-list
  reads with no activity rows; independently accepted nonempty timeline data
  remains usable. Loading, unavailable and successful emptiness stay distinct.
- Assignment uses the shared modal foundation, lists only currently eligible
  direct-link plan targets, and reports acknowledged completion through the shared
  polite status channel. Pending/failure feedback also stays visible and locally
  announced inside the dialog, outside the inert application root. While pending,
  warn that closing may not cancel a submitted change; refresh Mission to verify
  before retrying. Failures retain the target and cannot imply server rollback.
  Close intent revokes the current observer immediately; deadline settlement and
  late responses cannot unlock a newer action. Never retry a write automatically.
- Timeline and table width overflow stays inside labelled local scrollers. Every
  outer grid/flex boundary remains shrinkable at 360px and 200% zoom.

## 7. Data and visualization accessibility

File Story, Session Timeline, Day Lanes and Digest accept each global captured-
event ID once into their fresh owned buffers. Preserve the first observed record
and source order before each caller's existing sort; local-day filtering precedes
identity handling. Stop/cap decisions still use raw response sizes, not unique
counts. A full final page retains the cap notice with the actual accepted count.
This removes overlapping observations, not missing events, stale mutable fields
or offset-read snapshot skew. Never claim complete/current history from deduping.

- Every Chart.js canvas sits in a labelled figure with a concise text summary and an operable exact-payload table.
- Event/history attribution charts and badges use the shared six-item order,
  labels, values, and colors, including MANUAL. The Mission Attribution Forecast
  is a separate five-mode presentation: B "Declared", A_SCOPED "Active among
  matches", A_GLOBAL "Undeclared fallback", AMBIGUOUS "Ambiguous", UNKNOWN
  "Unknown". Reuse mode colors/badge styling without implying manual assignment
  or displaying a MANUAL forecast mode.
- Identity uses a horizontal bar when non-zero extension/remainder slices exceed five; a donut is permitted at five or fewer.
- Calendar modes share one non-zero calendar alternative. Lanes/clock share one fetched-event alternative.
- Punch exposes non-zero cells. Coupling always keeps an accessible list. Churn and City keep HTML actions.
- Goal rings, Plan Board, trophies, records, Wrapped, provenance, sparklines, and Mermaid graphs expose adjacent text or structured equivalents from the same data.
- Trophy alternatives state basis, value/rank, and next threshold/max rank without revealing locked-secret criteria.
- Retained interactive SVG geometry needs a name, focusability, Enter/Space parity, and visible focus. Mark redundant graphics decorative.

Do:

> Give a chart a one-sentence finding and a collapsed, paged table built from the exact same ordered payload.

Do not:

> Treat a canvas tooltip, color legend, or visually hidden 365-row duplicate as the sole accessible alternative.

`DisclosureTable` mounts no more than 50 body rows, reports visible range and total, and has labelled Previous/Next controls. A stable identity resets a changed collection to page one, preserves a valid page on same-context refresh, and clamps after shrink. Empty state reads 0 of 0. Sortable columns use button headers and `aria-sort`; stable sorting uses original ordinal as the final tie-breaker. Meaningful time/priority sequences remain non-sortable.

For Day Lanes at 1,000 or more events, or more than 20 exact repo ids, use the pinned density model:

- sort ids by raw UTF-16 code-unit order;
- retain one band per repo through 20, otherwise map ordinal `i` to `floor(i * 20 / repoCount)`;
- bucket local-day seconds into 48 half-hour bins;
- render only non-zero band/bin cells, at most 960 marks;
- name each repo or repo-range and expose its count;
- keep calculations, replay, and the paged exact-event drill-down complete.

Day Lanes queries one selected local calendar day with six-digit UTC-Z bounds,
filters returned rows to that half-open numeric window, then orders accepted
events by timestamp milliseconds and ID. A short raw page ends the bounded
three-by-500 fetch; a full final raw page only proves the fetch cap was reached.
Show the shared wrapped cap notice with the actual accepted count, never a
"newest" or known-more claim. Sparse positions, seek and replay use actual
elapsed duration between local midnights, so late 25-hour-day events remain
reachable. Variable-day axes use bounded elapsed ticks and numeric UTC offsets;
the end tick names the exact boundary. Visual block tails clip at that boundary
without changing approximate effort. Replay at end consumes every fetched row,
and Play again restarts at zero. Density still combines repeated wall times in
48 half-hour bins; the standard clock keeps 24 hourly wedges. The density-lane
replay cursor revisits repeated wall time or jumps missing time, while exact replay
end stays at the right edge. A short variable-day note explains that distinction.
Day arrows shift date labels with UTC calendar arithmetic, while event bounds
stay local. A skipped local date shows the existing load error and remains
navigable in both directions; unsupported calendar-boundary arrows are disabled.

Day Replay speed buttons expose aria-pressed from the existing speed selection.
Exactly one of 1x/2x/4x is pressed for each valid current speed. Keep stable
labels, numeric callbacks, replay mount, requests, rAF cleanup, reduced-motion,
routing and native buttons unchanged. This local state attribute does not
certify native keyboard, focus or assistive behavior.

## 8. Bounded rendering and performance

Any semantic row/item collection whose source can exceed 50 must use the shared dependency-free pager. Scrolling, collapsing, `content-visibility`, or being offscreen does not bound mounted DOM.

Pager rules:

- page size is explicit and between 1 and 50; standard rows/choices use 50 and City uses six;
- source order and unique semantic item keys are deterministic;
- identity is value-derived from collection kind, collision-safe scope key, and every query/filter/group/sort value that changes page meaning;
- arrays, callbacks, and cosmetic labels are excluded from identity;
- changed identity resets, same-context refresh preserves, and shrink clamps;
- page activation retains connected control focus or deliberately focuses the new collection heading;
- grouping repeated across a page boundary gets a labelled continuation heading;
- all calculations, filtering, selection, mutation, export, and graph work use the complete model.

The shared bounded choice dialog shows at most 50 native button rows. Search normalizes with NFKC, `toLocaleLowerCase("en-US")`, trim, and whitespace tokens; every token must occur in the normalized label or description. Empty search restores source order. Choice and DOM identities use structured/injective values, never delimiter concatenation.

An exemption is allowed only when the authoritative source or pure constructor enforces a maximum of 50 semantic items. Record the source, exact cap, and behavior if the cap changes. A comment, current production count, CSS containment, or a caller-side slice without a contract is not evidence. If the source cap is removed or raised above 50, migrate the consumer to the shared pager in the same change.

Current source-backed `<=50` semantic caps:

| Collection | Cap/source |
|---|---|
| attribution modes | fixed six-mode model |
| activity trend | fixed 14 UTC days |
| wrapped period | fixed seven UTC days |
| effort-per-task stats | server top 10 |
| coupling pairs | server top 10 |
| identity extensions | server top 8 plus one remainder |
| file churn | server top 20 |
| trophy tiles | fixed nine definitions |
| record rows | fixed four definitions |
| goal rings | fixed three metrics |
| momentum tiles | fixed three metrics |
| relationship map | explicit 12-node cap |
| Git graph page | explicit 20-commit cap |
| City buildings | explicit eight per district; districts page by six |
| replay feed preview | explicit newest eight; exact events remain paged |
| release banners | explicit newest three |

Fixed/capped non-list geometries remain governed by the visualization contract, not mislabeled as list exemptions: 365-day calendar/skyline/snake, 7×24 punch card, 60-bucket sparklines, Day Lanes’ maximum 960 density marks, charts, goal rings, and City scene geometry. Their structured alternatives are independently bounded.

Heavy Overview and City modules load lazily at module scope. The import starts only on first render, has one private 10-second deadline, maps named exports to defaults, ignores late settlement, and exposes a view-confined failure panel whose module-load recovery is full-page Reload. Keep Mermaid nested-lazy. Add no initial fetch, recurring timer, polling loop, storage key, WebSocket subscription, raster asset, font, or dependency for visual polish.

Input response stays within 100ms. Animation-frame work targets 16ms. Coalesce only measured expensive input/resize work and main-scroll snapshot writes; never debounce direct press, input, focus, or navigation state.

## 9. Motion

- Use opacity, color, and transform only; avoid `transition: all` and layout motion.
- Disclosure/drawer transitions settle in 150–220ms and are interruptible/state-derived.
- Preserve one CSS reduced-motion kill switch and one reactive `matchMedia` source for JS/rAF/inline motion.
- A live reduce change cancels reveal, count-up, Chart.js motion, snake, replay, smooth scroll, goal transitions, View Transitions, attract rotation, and one-shot particles while preserving final information.
- Attract mode never arms while reduced motion, an overlay/disclosure, release banner, focused editing control, or focused Chronicle iframe is active.
- Motion cancellation never replaces generation/stale-callback guards.
- Loading expected beyond one second reserves space and may use a non-flashing skeleton; shimmer stops under reduced motion.

Do:

> Reveal the final state immediately when reduced motion becomes active.

Do not:

> Wait for `transitionend` for correctness, replay canceled celebrations, or animate large mobile backdrops during scroll.

## 10. Forms, async actions, and feedback

- Each live WebSocket subscription owns its current socket and at most one
  reconnect timer. Cancel pending retries and keepalive on cleanup; detach
  handlers and invalidate ownership before best-effort native close. Cleanup
  is idempotent. Saved obsolete handlers/timers cannot invoke consumers, close
  a replacement socket or reconnect a disposed subscription. Preserve capped
  1/2/4/8/15-second backoff, reset on accepted open, REST resnapshot on open and
  the existing 25-second text ping. This is lifecycle ownership, not runtime
  frame validation, a heartbeat/pong protocol or general transport recovery.
  Defensive saved-callback tests do not imply duplicate native browser events,
  and logical teardown does not prove immediate physical disconnection.
- Give every input/select/range/checkbox a visible label or fieldset/legend.
- Connect persistent help/error text with `aria-describedby`.
- Validate after blur or submit, preserve entered values, and state cause plus recovery.
- Disable every mutable control during a batch action and expose `aria-busy` where appropriate.
- Prevent silent duplicate submission for assignments, reads, graphs, exports, clipboard, permission, sound, and notification actions.
- Resolve a commit-draft display reference to a current title only when exactly
  one same-repository task has that label. Duplicate labels retain the bare
  reference; never choose the first/last title or parse normalized task keys.
  This conservative display fallback changes no stored attribution or identity.
- Commit-draft copy keeps the existing global captured-event window and starts
  with a compact single-line subject: collapse JavaScript whitespace runs to
  ASCII spaces and trim only the final composed text, including quoted text.
  Keep raw titles, identity, attribution, ordering and version placeholders
  unchanged; do not truncate or impose a subject-length cap. The copy starts
  one `writeText` call synchronously in the user gesture, with no extra fetch or
  clipboard read. Report distinct copied, empty-window, unavailable and failed
  outcomes; an empty draft is not a blocked clipboard. One App-level owner
  prevents overlapping StatusBar/palette copy observers across repositories.
  The shared 10-second deadline bounds observation only: a timed-out native
  write may still finish. Never claim cancellation, automatically retry or
  promise last-click-wins clipboard ordering. Keep a wrapped repo-labelled
  failure note visible at every shell width until another draft, scope change
  or Dismiss; timeout asks users to check the clipboard before retrying. The
  note is not a second live region and never takes focus on appearance.
  Bound failure details to min(8rem,25dvh) in a labelled keyboard-scrollable
  region, with Dismiss outside it. Successful notes are passive, start with
  the copied outcome, clamp long text to two lines and clear after three
  seconds; their full text remains in the existing announcer. Other-repo
  disabled draft controls visibly say "copying elsewhere", not just in a title.
  Failure notes alone have Dismiss. Explicit dismissal returns focus to the
  active status drawer's detail region when inside that modal, otherwise to
  main-content, rather than leaving focus on a removed button or inert target.
- Browser preference storage is optional. Guard both the storage getter and
  reads/writes; keep existing defaults when reading fails. A failed save keeps
  the current visual choice but must show visible feedback and announce that
  it may reset on view remount (or page reload for attract).
- Sound and OS alerts stay off if opt-in cannot be stored/verified. A failed
  disable still blocks new sound/alerts for the current page; explain that
  persistence failed and an older saved opt-in may remain after reload.
- Explicit sound activation owns the shared 10-second observation deadline.
  Create/resume a fresh context in the original gesture after verified opt-in.
  Retire prior output/context with best-effort disconnect and nonblocking close;
  do not reuse a context that older native work could still change. Timeout
  keeps the page off, reports whether off was saved and requires explicit
  retry. Never claim that observation cancellation stops native work or proves
  resource release/physical silence. Generation and mounted-owner checks fence
  publication, confirmation, feedback and busy release; navigation does not
  cancel a page-global preference. Initial saved-on gesture listeners capture
  their registration generation and cannot override an accepted explicit choice.
  Background first-gesture activation has no foreground deadline. Reported
  failures synchronize to existing preference controls and recovery feedback.
- Before confirming an otherwise successful explicit sound activation, verify
  saved on again while retaining the page veto. Recheck owner/cancellation after
  that read. An unverified snapshot retires its context and stays off without
  reasserting on; report the unverified saved choice separately from unavailable
  audio, whether off was saved, and explicit retry guidance. This is not
  continuous cross-tab synchronization or a guarantee against later changes.
- Public live tick/chime/fanfare calls isolate audio exceptions so optional
  sound cannot suppress downstream event processing. Current failures stop the
  remaining cue body, retain the page veto, retire output/context best effort
  and report fresh off-save truth through existing background feedback. Never
  replay failed notes or automatically retry. Non-running contexts still no-op;
  silent context-state drift is not newly detected. Existing cue content and
  tick rate/drop behavior remain unchanged. Explicit enable calls a private
  throwing confirmation path: a current failure must return disabled, not
  success after a swallowed exception. Fence owned rollback before/after cleanup
  and after persistence; recheck owner/cancellation after successful confirmation.
  Do not retire or overwrite a newer choice, and do not claim physical silence
  or native resource release from a best-effort cleanup attempt.
- OS-alert opt-in owns a shared 10-second observation deadline. Request browser
  permission synchronously in the user's gesture after verifying saved off.
  Timeout/unmount cannot cancel the native prompt or revoke origin permission;
  late results must not opt in or overwrite a newer choice. A current canceled
  operation keeps the page veto and freshly verifies off persistence before
  returning. Show timeout separately from other non-confirmation, never infer
  denial from a dismissed/default or failed request, include failed-save advice
  when needed, and require an explicit retry. App unmount revokes its owner;
  repo/view navigation does not cancel this page-global preference. Existing
  controls, persistent preference feedback and the single announcer share
  one busy/result owner; stale work cannot release a newer owner.
- Preference failures are visible from both direct controls and palette actions
  at all shell widths. Do not hide them behind another action's success note.
- Same-page sound-activation/playback and notification-access/delivery failures retain
  one immutable, non-private failure fact per channel, after current-owner
  validation, off veto, owned cleanup and a fresh off-save attempt. Publication
  rechecks ownership after persistence; sound also rechecks before persistence
  after cleanup. Capture notification ownership before reading wanted and
  reject supersession after that read. Fence construction after visibility so
  reentrant native/storage boundaries cannot override a newer choice. Notification
  capability is read once inside the guarded delivery path; non-granted or
  unavailable access fails closed without prompting. Granted/visible is a no-op.
  Subscribe before reading the cached fact; consume the current snapshot and
  clean up on unmount. Update existing off state, recovery note and announcer
  even while explicit observation is busy, without changing busy ownership.
  Both explicit success/error continuations give the current failure priority.
  Only the next accepted explicit choice clears its own channel's cache;
  preaborted choices and completion/finally never clear it. Failed off saving
  retains older-opt-in/reload guidance. No cross-tab/storage-policy/permission
  watcher, automatic retry or native delivery/physical-silence guarantee is added.
- User-triggered REST work owns one absolute 10-second deadline for the complete activation. Retry gets a fresh controller/deadline.
- Close, unmount, scope change, or supersession aborts silently; only timer-owned abort reports timeout.
- Shared promise observation must consume a supplied stage's later rejection even when its signal is already aborted. Return the existing AbortError immediately without waiting for or canceling native work; the caller still owns that returned rejection.
- Background work never inherits a foreground deadline.
- Bulk assignment is non-atomic: stop on first request failure/timeout and report saved, validation-skipped, failed, and unattempted counts separately.
- Direct downloads use the shared Blob helper in the original user activation. Report “download started,” not completion.
- Digest preparation is async; the prepared Blob is downloaded by a second synchronous user activation and remains App-session-only for the same effective scope.
- Digest captures one local calendar day at preparation start. Query bounds,
  report date, filename, event KPIs and empty-state copy stay bound to that day,
  including midnight crossings; generated-at uses completion time. The current
  UTC effort KPI remains separate and explicitly labelled.
- Digest filters every page by the same half-open day window and keeps the
  three-by-500 fetch bound. A full third page says "More may exist", never that
  unobserved rows definitely exist. Counts describe accepted captured events,
  not complete or snapshot-consistent history.
- New-tab actions use real noopener anchors; palette-only launches synchronously create/click/remove an equivalent anchor, never `window.open`.

## 11. Long content, empty states, and errors

- Repo ids, branches, task titles, paths, and commit messages use shrink containment plus wrap/ellipsis.
- Preserve full accessible text or provide an adjacent operable disclosure; `title` is supplemental only.
- Session Timeline keeps the compact provider/short-ID header and exposes full
  identity in a default-closed native disclosure. Its labelled read-only field
  contains printable ASCII JSON, including quotes and escapes, not a raw API
  argument. Decode JSON to recover the original ID; do not trim, normalize or
  truncate legacy IDs. Input/container CSS contains long values locally, without
  imposing a data-length cap. Provider/full-ID keys preserve same-session paging
  state and reset changed identity. The summary has tabIndex0 for the existing
  modal trap. No new request, clipboard action, autofocus or selection handler;
  controlled encoding/focus/SSR evidence is not native interaction acceptance.
- Tables, diffs, timelines, charts, and maps scroll inside labelled local containers.
- Cards impose no global minimum width.
- Empty states say what is empty and, when useful, the next action.
- Offline/stale states keep accepted data when safe and label it honestly.
- Error panels name the cause class and offer only a recovery that can work. A cached lazy-import failure says Reload, not Retry.
- Never hide an error by substituting empty data or let stale async completion overwrite a newer scope.
- Overview keeps a stable Refresh/Retry stats control, available without a prior
  snapshot. Manual attempts have their own 10-second deadline, duplicate guard
  and shared publication ownership with automatic stats requests. Retain and
  label accepted same-scope data during refresh/failure. Do not reset hydration
  settlement at start, trigger wardrobe/Git refresh or treat this as an all-view
  freshness guarantee. Same effective Overview context remains valid across
  history changes and reselecting an equal repo/all scope. Background triggers
  use semantic scope identity, not object identity. Committed scope/view exit, membership loss, unmount and
  supersession cancel silently. Exact-owner cleanup is separate from freshness.
  A canceled first load in the same scope settles to neutral unavailable with
  retry, not orphaned Loading; scope exit preserves any accepted target cache.
  If a remembered focused error is removed, recover to the stable enabled
  control only while focus is body/root/the removed node. Wait through temporary
  busy, never override another active target, inert ancestor or modal, and clear
  stale focus ownership. Wrap long unbroken error tokens inside the panel.
  This does not establish native assistive behavior.
- City automatic-round and foreground-retry trailing microtasks check current
  mounted ownership at dispatch. True view exit retires these continuations
  without starting new stats work after cleanup. Mounted trailing refresh,
  scope replacement, throttle, retry deadlines and accepted snapshots stay.
  Do not guard scheduler entry or imply universal request cancellation;
  controlled cleanup/setup replay is not native React acceptance.
- During a live frontend/backend rollout skew, keep accepted established fields
  visible, label unavailable additive fields, and give the operator a working
  restart path. Never coerce missing extensions into zero/empty success data or
  let their absence crash the application shell.

Do:

> “City data is unavailable. Last accepted data is shown. Retry.”

Do not:

> Render a blank card, generic “Something went wrong,” or old-scope data under a new scope label.

For long content, do preserve the full path in selectable/wrapping text or an operable disclosure. Do not make a hover-only `title` the only route to a truncated value.

### 11.1 Numeric and time formatting

- Reuse repository formatters rather than creating surface-specific abbreviations.
- Use the existing approximate marker for derived effort and avoid false precision.
- Label UTC/local bases wherever a date, day, or hour can be misread.
- Daily effort and goal rings use the supplied calendar row's UTC day. If it is
  not the current UTC day, show its absolute date; absent data is unavailable,
  not a fabricated zero. Prepared Digest effort always names its absolute day.
  The existing minute tick invalidates stats once per observed UTC-day change;
  delayed/failed refresh retains the dated snapshot, not a freshness guarantee.
  Historical rolling windows, reports and Wrapped retain their snapshot basis.
- Exported reports label selected, preceding and weekly wrapped periods with
  their own supplied absolute UTC bounds, separate from local generation time.
  Show supplied/requested calendar coverage. Empty selected rows mean unavailable
  hero/momentum values, not measured zero; partial rows retain their actual sums
  and active/supplied-day denominator. Deltas and the split comparison sparkline
  require two complete requested windows. Full zero-filled backend calendars
  remain measured zeros. Keep all-time sections, synchronous downloads and
  scope-safe generated filenames unchanged; exporting never fetches fresh stats.
- Keep exact values in tables, accessible names, or tooltips when a compact visual abbreviates them.
- Interactive Momentum names the selected and preceding supplied UTC periods
  and their coverage out of seven rows. Missing sides are unavailable; partial
  sides retain supplied sums. Delta chips and split sparklines require two
  complete windows. Keep the local scroller and full-window calculation rules.
- Weekly snapshot holds the already accepted data while open, not a fresh fetch.
  Use its own wrapped-day bounds and coverage for descriptions and exact-data
  summaries. Absent days differ from measured zero capture events. Available
  zero days still have a chart and table; supplied commits, files and nullable
  top facts remain visible independently of capture counts. Missing calendar
  streak is unavailable; an available streak describes its calendar snapshot,
  not current-day activity. Busiest-hour time remains server-local.
- Use locale-aware thousands separators for human-facing counts and tabular figures for changing columns.
- Year-calendar and personal-record headings name supplied UTC bounds and row
  coverage out of 365, not a current-year claim. Calendar exact-data summaries
  use the same bounds; missing day data differs from supplied all-zero rows.
  Preserve non-zero-day filtering, including commit-only and effort-only days.
  The calendar badge is a snapshot streak, not proof of today's activity. Keep
  record calculations, crossing detection, motion rules and calendar modes intact.
- Empty denominators render an honest empty/zero state; never display `NaN`, `Infinity`, or a percentage against an undefined basis.

## 12. Review checklist

Before accepting a UI change, verify:

- all six views, repo scope, Tasks, Attention, and utilities remain reachable at 360, 390, 768, 1024, and 1440px;
- no document-level horizontal overflow; every local scroller is labelled;
- keyboard order, Escape, focus trap/return, destination focus, and Back/Forward behavior;
- 44px coarse and 24px fine-pointer targets, immediate pressed state, and 16px phone form values;
- contrast, non-color state cues, accessible names, labels, summaries, and structured alternatives;
- 200% zoom, enlarged text, portrait/landscape, safe areas, long tokens, empty/offline/error paths;
- reduced motion at load and while motion is active;
- no semantic collection mounts more than 50 rows and every exemption still has source evidence;
- complete-model totals, filters, selections, actions, exports, and graph calculations remain unchanged by paging;
- async deadlines, abort ownership, stale guards, deduplicated feedback, and honest recovery;
- production build succeeds from `Frontend/` and rendered geometry—not source inspection alone—meets the acceptance matrix.

## 13. Explicitly not applicable

Authentication/password/autofill, destructive data deletion, multi-step forms, marketing/SEO/conversion landing pages, native mobile controls, light mode, RTL/localization, GSAP, and offline caching/degraded-data mode are absent or out of scope. Preserve the network-only service worker and honest reconnect/server-unavailable behavior. If one of these surfaces is introduced, amend and review the governing plan before expanding this contract.
