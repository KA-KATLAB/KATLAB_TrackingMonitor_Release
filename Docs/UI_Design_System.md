# TrackingMonitor UI Design System

This document is the normative UI contract for the React application. It governs the application shell and every product view; feature-specific behavior remains authoritative in the implementation and release plan.

## 1. Product profile and authority

- Product: local developer operations and observability dashboard.
- Style: dark precision dashboard with restrained KATLAB personality.
- Design dials: variance 4/10, motion 3/10, density 7/10.
- Content order: status first, action second, explanation third.
- Language: English.
- Theme: dark only.

The advisory research source was `nextlevelbuilder/ui-ux-pro-max-skill` at commit `f3ac195224eac1eb0dfe1a3059c2a6add78ffbe3`, reviewed on 2026-09-03. It is provenance, not a dependency. Do not run its installer, vendor its files, add its companion skills, or copy generated CSS into this repository. A later upstream revision requires a fresh applicability, version, license, security, and stack audit.

The supported frontend remains React 18.3, ReactDOM 18.3, Tailwind 3.4, TypeScript 5.6, Vite 5.4, Chart.js 4.5, and Mermaid 11. Do not import React 19, Tailwind 4, Next.js, native/mobile, or GSAP guidance into this stack.

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
| `primary-hover` | `#0284c7` | primary hover |
| `focus` | `#38bdf8` | focus indicator |
| `live` | `#14b8a6` | live activity |
| `success` | `#059669` | successful/clean state |
| `warning` | `#f59e0b` | attention state |
| `danger` | `#e11d48` | failure/destructive warning |

Normal text must reach 4.5:1 contrast. Large text, control boundaries, state indicators, and focus indicators must reach 3:1 against adjacent colors. Color never carries meaning alone; pair it with text, value, icon shape, or another marker.

As-built WCAG contrast verification for v0.2.12.0:

| Pair | Ratio | Required |
|---|---:|---:|
| text / canvas | 19.28:1 | 4.5:1 |
| muted text / canvas | 7.87:1 | 4.5:1 |
| muted text / surface | 6.96:1 | 4.5:1 |
| control border / surface | 3.75:1 | 3:1 |
| focus / canvas | 9.42:1 | 3:1 |
| text / primary | 5.67:1 | 4.5:1 |
| success / canvas | 5.35:1 | 4.5:1 |

### 2.2 Typography

- Preserve Plus Jakarta Sans for UI copy and Azeret Mono for code, paths, counters, timers, and tabular numbers.
- Keep offline-safe system fallbacks and `font-display: swap`.
- Primary copy is 16px. Metadata never falls below 12px.
- Body copy uses at least 1.5 line height.
- Small SVG/canvas ticks may be smaller only when non-interactive and fully duplicated by an accessible alternative.
- Use tabular figures for changing numeric values.
- Natural wrapping must remain correct without `text-wrap: balance`.

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
| 1024px | persistent-sidebar shell switch |
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

## 3. Page and shell contract

- Use a `100vh` fallback followed by a `100dvh` bounded app height.
- Every flex/grid boundary that can shrink needs `min-width: 0` and/or `min-height: 0`.
- Do not clip `body` or the document to conceal an overflowing child.
- Preserve the `#main-content` skip target and make the landmark programmatically focusable.
- The header separates brand/scope, view navigation, status, and utilities.
- Repo scope and view collections become labelled horizontal scrollers when they cannot wrap.
- The status rail scrolls independently on narrow screens.
- Installed-PWA header, drawers, dialogs, and bottom/right notices respect safe-area insets.
- Sticky/fixed surfaces provide enough scroll padding that focus and hash targets remain visible.
- The complete shell must reflow at 200% zoom and enlarged default text in portrait and landscape.

Repo scopes are a labelled selection group with `aria-pressed`. The workspace control is visibly “All repos” and named “Scope: all repos.” A configured repo retains its exact visible id and is named “Scope: repo <id>”; a repo literally named `ALL` remains distinguishable.

The six top-level views are Changes, Mission, Overview, History, City, and Chronicle. Put them in a `nav` landmark and mark the active link/control with `aria-current="page"`. Do not claim tab semantics without a complete tab/tabpanel model.

Below 1024px, replace the 18rem task sidebar with a labelled Tasks button and modal drawer. Keep repo scope, current view, Tasks, Attention, and More reachable. More owns secondary utilities once each; no responsive mode may show the same utility twice.

Do:

> Let labelled navigation or data rails scroll locally while the page itself remains viewport-wide.

Do not:

> Hide document overflow, keep the desktop sidebar on a phone, or remove the only visible route to a utility.

## 4. Shared component contract

Shared primitives are small implementation helpers, not a component framework. They forward native props and refs, preserve native disabled/focus behavior, and accept `className` only for local layout.

### 4.1 Surfaces and headings

- `Surface` supplies the common panel background, border, radius, and padding.
- `SectionHeading` establishes section name, concise supporting text, and owning actions.
- Owning actions sit beside the heading and wrap below it at phone width.

Do:

> Put one clear heading and its directly related actions inside a standard Surface.

Do not:

> Nest several unrelated cards under an unlabeled panel or use a unique border/shadow recipe for each card.

### 4.2 Controls

`ControlButton`, `IconButton`, and `SegmentedControl` expose default, hover, active, focus-visible, disabled, and busy states.

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
- Banner/toast previews are bounded; a labelled “+N” disclosure pages the same full model instead of mounting a second copy.

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

Command Palette, File Story, Session Timeline, Health, Wrapped, relationship-graph expansion, task drawer, and Focus Mode use this foundation. Focus Mode keeps its explicit-close fullscreen behavior.

More, Attention, Legend, and goal settings are disclosures, not ARIA menus. Use `aria-expanded` and `aria-controls` with ordinary buttons/links. Escape/outside close restores the connected opener. During disclosure-to-disclosure or disclosure-to-dialog handoff, suppress outgoing focus restoration until the destination owns focus. Never leave two header disclosures open.

Do:

> Move focus into the destination dialog before releasing the shared overlay lease.

Do not:

> Copy a focus trap into each modal, use `role="menu"` for ordinary actions, or restore focus to an unmounted trigger.

## 6. View-specific composition

These rules extend the global shell; they do not replace it.

### 6.1 Changes

- Desktop uses the persistent task sidebar; narrower layouts use the shared task drawer.
- Task, session, grouping, section-navigation, manual-pick, event, file-tree, and diff-line collections use bounded presentation when their source can exceed 50.
- Filtering, select-all, assignment, counts, and exports always use the complete loaded model.
- Classify a complete diff before paging lines, so hunk/header color and order remain correct across pages.
- Long paths and diffs scroll only inside labelled local containers.

### 6.2 Overview

Preserve every shipped module and group them in this order:

1. Now — KPI row, Plan Board, momentum.
2. Trends — charts, calendar, day lanes, coupling, punch card.
3. Explore — goals, identity, churn, trophies, records, provenance.
4. Relationships — task/commit graph.

Use one SectionHeading and one Surface vocabulary. Chart canvases and informative graphics need concise summaries and exact-data alternatives. Overview and its graph reserve stable loading/error footprints.

### 6.3 History

- Keep API fetch depth separate from the visible 50-row page.
- Bound commit rows and per-commit event rows without changing endpoint limits.
- The repo chooser uses the shared bounded choice dialog.
- Changing repo clears stale rows, graph, loading, exhausted, and error state before the new load.
- The Mermaid graph retains a structured alternative and an honest Reload path for cached module-load failure.

### 6.4 City

- City remains workspace-wide and preserves configured-repo order and full-model calculations.
- Render six districts per page and rebase the visible slice to page-local ordinals 0–5.
- Full-model scales remain comparable; actions retain exact repo ids.
- Cancel/remove prior-page rain/reward transients and timers on page change. Off-page events never queue for replay.
- The SVG name and pager state the visible repo range.
- Snapshot only the visible page; include its range in the document title, description, and collision-safe filename.
- Retained SVG building/district operations have names, visible focus, Enter/Space parity, and dedicated non-overlapping 44x44 pointer target zones; the paged exact-data disclosure remains their structured alternative.
- Reserve the no-data footprint and show an honest stale/unavailable state with Retry.

### 6.5 Chronicle

- This contract owns only the React host, iframe sizing/name, fallback, and shell interaction.
- The iframe fills the measured flex remainder; never subtract a hard-coded header height.
- A focused same-origin iframe counts as activity and blocks attract-mode arming.
- New-tab actions are real anchors with `target="_blank" rel="noopener"`.
- The generated MkDocs theme/content under `Chronicle/runtime/` is outside this design scope and is never hand-edited.

### 6.6 Mission

- Compose the view in this order: Now, plan scope, Verification Rail, Evidence
  Queue, Session Flight Recorder, and Exact Data.
- Spotlight a plan only when the current data proves one unique active plan or the
  operator explicitly selects an exact repository + relative-plan pair.
- Render backend readiness verbatim. The UI may format state labels but never
  infer, upgrade, or suppress a readiness state or blocker.
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
- Assignment uses the shared modal foundation, lists only currently eligible
  direct-link plan targets, and reports completion through the shared polite status
  channel.
- Timeline and table width overflow stays inside labelled local scrollers. Every
  outer grid/flex boundary remains shrinkable at 360px and 200% zoom.

## 7. Data and visualization accessibility

- Every Chart.js canvas sits in a labelled figure with a concise text summary and an operable exact-payload table.
- Attribution modes use the shared six-item order, labels, values, and colors in a horizontal bar.
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

- Give every input/select/range/checkbox a visible label or fieldset/legend.
- Connect persistent help/error text with `aria-describedby`.
- Validate after blur or submit, preserve entered values, and state cause plus recovery.
- Disable every mutable control during a batch action and expose `aria-busy` where appropriate.
- Prevent silent duplicate submission for assignments, reads, graphs, exports, clipboard, permission, sound, and notification actions.
- User-triggered REST work owns one absolute 10-second deadline for the complete activation. Retry gets a fresh controller/deadline.
- Close, unmount, scope change, or supersession aborts silently; only timer-owned abort reports timeout.
- Background work never inherits a foreground deadline.
- Bulk assignment is non-atomic: stop on first request failure/timeout and report saved, validation-skipped, failed, and unattempted counts separately.
- Direct downloads use the shared Blob helper in the original user activation. Report “download started,” not completion.
- Digest preparation is async; the prepared Blob is downloaded by a second synchronous user activation and remains App-session-only for the same effective scope.
- New-tab actions use real noopener anchors; palette-only launches synchronously create/click/remove an equivalent anchor, never `window.open`.

## 11. Long content, empty states, and errors

- Repo ids, branches, task titles, paths, and commit messages use shrink containment plus wrap/ellipsis.
- Preserve full accessible text or provide an adjacent operable disclosure; `title` is supplemental only.
- Tables, diffs, timelines, charts, and maps scroll inside labelled local containers.
- Cards impose no global minimum width.
- Empty states say what is empty and, when useful, the next action.
- Offline/stale states keep accepted data when safe and label it honestly.
- Error panels name the cause class and offer only a recovery that can work. A cached lazy-import failure says Reload, not Retry.
- Never hide an error by substituting empty data or let stale async completion overwrite a newer scope.

Do:

> “City data is unavailable. Last accepted data is shown. Retry.”

Do not:

> Render a blank card, generic “Something went wrong,” or old-scope data under a new scope label.

For long content, do preserve the full path in selectable/wrapping text or an operable disclosure. Do not make a hover-only `title` the only route to a truncated value.

### 11.1 Numeric and time formatting

- Reuse repository formatters rather than creating surface-specific abbreviations.
- Use the existing approximate marker for derived effort and avoid false precision.
- Label UTC/local bases wherever a date, day, or hour can be misread.
- Keep exact values in tables, accessible names, or tooltips when a compact visual abbreviates them.
- Use locale-aware thousands separators for human-facing counts and tabular figures for changing columns.
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
