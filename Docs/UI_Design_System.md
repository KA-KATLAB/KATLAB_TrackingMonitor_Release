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
- Page titles use 24–28px, section titles 18px, and panel titles 16px. Their
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
- Desktop view navigation occupies a 14rem left rail at 1280px and above.
  Below that, a labelled Navigation control opens the shared modal drawer.
- Repository selection and detailed repository status each use a named drawer.
  The compact context line remains visible; do not rebuild a permanent status rail.
- Installed-PWA header, drawers, dialogs, and bottom/right notices respect safe-area insets.
- Sticky/fixed surfaces provide enough scroll padding that focus and hash targets remain visible.
- The complete shell must reflow at 200% zoom and enlarged default text in portrait and landscape.

Repo scopes are a labelled selection group with `aria-pressed`. The workspace control is visibly “All repos” and named “Scope: all repos.” A configured repo retains its exact visible id and is named “Scope: repo <id>”; a repo literally named `ALL` remains distinguishable.

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

Tools, Attention, Legend, and goal settings are disclosures, not ARIA menus. Use
`aria-expanded` and `aria-controls` with ordinary buttons/links. Escape closes and
restores the connected opener; outside activation must not steal the destination's
focus. During disclosure/dialog handoff, suppress outgoing focus restoration until
the destination owns focus. Never leave two header disclosures open. Palette-to-
Tools/Legend handoff waits for overlay teardown and checks the current owner.

Do:

> Move focus into the destination dialog before releasing the shared overlay lease.

Do not:

> Copy a focus trap into each modal, use `role="menu"` for ordinary actions, or restore focus to an unmounted trigger.

## 6. View-specific composition

These rules extend the global shell; they do not replace it.

### 6.1 Changes

- Tasks is available through the shared drawer at every width.
- Keep unresolved attribution ahead of the grouped work list, with task/session
  filters and clear actions visible in both task and folder modes.
- Task, session, grouping, section-navigation, manual-pick, event, file-tree, and diff-line collections use bounded presentation when their source can exceed 50.
- Filtering, select-all, assignment, counts, and exports always use the complete loaded model.
- Classify a complete diff before paging lines, so hunk/header color and order remain correct across pages.
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

Now has four primary metrics: attribution needs, known uncommitted changes,
known clean repositories and dated effort. Captured events, auto-attribution and
busiest task remain secondary. No status data means unavailable, not zero.
Never scale down metric text; wrap while retaining exact values and snapshot dates.

### 6.3 History

- Keep the compact commit header and expose its full captured ID through a
  default-closed native disclosure with a labelled, selectable read-only field.
  The exact value is not truncated or transformed; long values scroll inside
  the field. Scope/repo/full-hash changes remount the disclosure closed, while
  unchanged identity and event paging retain native state. Do not fetch, write
  the clipboard, autofocus or auto-select. The hover title is supplemental only.
- Keep API fetch depth separate from the visible 50-row page.
- Bound commit rows and per-commit event rows without changing endpoint limits.
- The repo chooser uses the shared bounded choice dialog.
- Changing repo clears stale rows, graph, loading, exhausted, and error state before the new load.
- The Mermaid graph retains a structured alternative and an honest Reload path for cached module-load failure.
- Git graph init configuration must decode to the exact sanitized main name used by merge checkouts, including apostrophes. Serialize the directive as JSON and unicode-escape apostrophes before Mermaid's quote normalization; keep existing label normalization and strict rendering unchanged.

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
- Generated MkDocs runtime under `Chronicle/runtime/` is never hand-edited.
  Harmonize its CSS through the generator: local Segoe UI/Consolas, quiet slate
  canvas, readable muted text, focus-visible, reduced-motion and bounded long
  content. Preserve pinned assets, signed runtime, sanitizer, navigation and
  build/swap lifecycle. Inspect the generated document, not only its iframe host.

### 6.6 Mission

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
