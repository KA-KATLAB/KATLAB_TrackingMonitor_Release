# KATLAB TrackingMonitor v0.4.1.2 - Mission Plan Gallery

## Visible plan gallery

Mission's existing Plan scope becomes a calmer gallery of native plan-choice
buttons. Names gain clearer hierarchy, row cards stretch naturally, and exact
task-count footers align at the bottom. Selected Now remains primary; the
gallery is still the secondary choice surface, not another summary or dashboard.

The gallery stacks below 768px, uses two columns from 768px and three from
1280px, with 16px gaps. Cards use 20px padding and 12px corners; existing name
labels use 18px type and 28px leading. Count footers keep 12px metadata text,
add a divider and 12px top padding, and use auto top margin, tabular figures
and explicit uninterrupted-token wrapping.

These are view-local shape/type exceptions, not global token changes. No new
fixed/min/max height, clipping, scaling, motion, color/status override, focus
or scroll owner is added. Existing selected border/background, state tones,
fine/coarse targets, 32px control/44px coarse minima, safe areas and reduced
motion remain intact. DOM/read order stays meaningful; no ARIA grid or roving
focus is introduced.

## Preserved owners and delivery

One separate stylesheet is scoped only to the actual Mission plan-card grid,
its direct native buttons, name labels and count footers. Main adds one CSS
side-effect import immediately after shared index.css. React bootstrap,
StrictMode, service-worker registration and every other bootstrap byte stay.
MissionView, original shared CSS and existing regression owners are unchanged.

Native selection callbacks, exact repository/relative-plan identity,
aria-pressed, backend readiness labels/tones and existing done/total/progress
text remain verbatim. Plan scope still requires a positive accepted plan count
and shows 12 choices per page. Unique-active spotlight, explicit selection,
ambiguous guidance and page-following behavior retain their existing owners.

Loading, unavailable and accepted-empty Mission states remain distinct from
the additive Forecast, session, timeline and evidence states. Read-owner
retirement, refresh generations, deadlines, selection deferrals and Retry
remain unchanged. Now, Forecast, other Mission sections and the remaining
canonical views keep their existing data and interaction owners.

## Verification boundaries and known limitations

The new regression suite checks the complete literal stylesheet, scoped rules,
media/declarations, actual bootstrap import/site and strict whole-bootstrap
inverse. Original Mission/shared-CSS/Overview-deck and Mission regression bytes
remain pinned. Raw-current PlanCard/StateBadge/presentation fixtures exercise
backend states, selection, task counts, long/special identities and callback
forwarding without copying production behavior or rebasing old assertions.

The delivery workflow separately requires isolated/production build checks of
compiled gallery selectors, media and footer rules, matching release identity
and actual served assets. Source/SSR/static or compiled-asset checks do not
certify native paint, geometry, keyboard, focus, assistive technology, zoom,
coarse input, safe areas or loading/empty/error/stale/reduced-motion behavior.
Native v0.4 H.1 remains pending.

The recorded large Connection: close response failure remains open. Bounded
keep-alive diagnostics are not a repair. The previous high build-only braces
advisory and build chunk notice are not addressed. Historical GitHub push alert
notices are not a fresh advisory-detail audit or remediation. No API, schema,
backend runtime, configuration, stored-data, dependency, security, transport,
environment or browser workaround is introduced.

The user accepts limited publication with these recorded native and transport
limitations. They are not claimed fixed; new blocking regressions must stop
publication. Actual review, CFT, test, build, live, commit and remote-ref evidence
belongs in `temp/Plan/PLAN_v0.4.1.2_Mission_Plan_Gallery.txt`, not guessed results
or counts here.

Use the [safe upgrade procedure](../../Installation_Guideline.md#safe-stop-and-restart).
Stop tracker and demo before rebuilding matching frontend source; use the
standard hidden restart and reload existing tabs. A Python restart alone does
not update served or already-loaded frontend assets.

Previous [v0.4.1.1 notes](TrackingMonitor_v0.4.1.1_Release_Notes.md)
retain every historical byte except their two move-affected Markdown URLs.
