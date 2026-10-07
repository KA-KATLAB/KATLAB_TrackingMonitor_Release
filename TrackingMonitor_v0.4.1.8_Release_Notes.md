# KATLAB TrackingMonitor v0.4.1.8 - Chronicle Reader Canvas

## One quiet canvas for the actual generated reader

Chronicle's existing generated div.col-md-9[role=main] gains one panel-toned
reading canvas with a shared 1px border, 8px corners and 24px padding above
640px. At or below 640px, padding becomes 16px. Existing minimum-width and
anywhere wrapping remain. This does not create a new article, wrapper or card
for every paragraph, or reorder navbar, TOC, headings and actual content.

Only direct p/ul/ol/blockquote receive max-width:72ch. Top-level headings,
tables, pre, diagrams and images receive no new 72ch declaration. Media,
code or tables inside bounded prose obey that parent's available width;
existing pre-wrap, fixed native tables, media bounds and wrapping remain.
This is not a promise that every descendant retains the full canvas width.
ch measures a font's zero-glyph advance, not an exact character/glyph count.
The chosen measure is not a WCAG 1.4.8/AAA or native-reflow certificate.

## Narrow source scope and preserved ownership

One exact 14-LF-line/366-byte literal is inserted into build_extra_css's
returned constant immediately before the unique footer comment, after the
existing reduced-motion block. The addition has four root nodes: one leading
comment, two rules and one 640px media with one direct main-padding rule.
No other pages.py source byte changes; historical inverse source is never run.

The pure Markdown/YAML builders, escaping, served-data calculations, static
version-free FOOTER, navigation accordion and freshness JavaScript remain.
Existing grid/classes/box-sizing, headings, native tables, bounded pre/code/
diagrams/images, TOC/search, local fonts, focus, contrast and reduced motion
retain their owners. No new position, order, hide, animation or scroller occurs.
No dependency, API/storage request, data/schema/configuration or vendor change
is introduced. All React owners and existing regression suites remain untouched.

The existing safe generator writer emits assets/extra.css. Its dirty latch,
strict candidate build, failure preservation, signed runtime, pinned/sanitized
vendor assets and site swap keep their current boundaries. Runtime files are
not hand-edited. The actual generated document and stylesheet must be inspected;
the iframe host or React entry stylesheet alone is not delivery proof.

The unchanged host retains checking/missing/unavailable/ready states, bounded
probe/retry cleanup, stopping probes after success and its real new-tab link.
Reader freshness remains generated-page-owned. Focused iframe activity and
the existing background/overlay/navigation behavior remain unchanged.

## Verification boundaries and known limitations

The new contract checks an independent full CSS block, strict PostCSS root/
direct-child/selector/declaration allowlists and actual Python AST ownership.
It verifies a unique source insertion, complete original/result RAW/LF pins,
outside-byte preservation and emitted-CSS inverse without executing restored
history. Only the actual current pure CSS function may generate its result.
No configured DB/server/generator/clock/network initialization belongs in it.

Separate focused/full, documentation, compile, build and live checks must
record actual results. The bounded offline strict build must inspect actual
generated main/link markup and emitted assets/extra.css. Live checks must verify
the exact current served stylesheet alongside canonical UI identity and all
referenced React assets, including retained eager Picker and lazy Gallery CSS.
Matching assets or source/SSR checks do not certify native paint, geometry,
keyboard, focus, AT, zoom, coarse input, safe areas, state presentation or
subjective beauty. Native v0.4 H.1 and operator visual acceptance remain open.

The recorded large Connection: close response failure remains unresolved.
Bounded keep-alive diagnostics are not a repair. The prior high build-only
braces advisory (recorded alert #15) and chunk notice are not addressed.
Historical GitHub push notices are not a fresh detailed advisory audit.
No transport, environment, security or browser workaround is introduced.

The user accepts limited publication with those recorded constraints. Actual
review, CFT, test, build, restart, live, commit and remote-ref evidence belongs
in `temp/Plan/PLAN_v0.4.1.8_Chronicle_Reader_Canvas.txt`; no completed results or
historical test counts are invented here. New blocking regressions stop delivery.

Use the [safe upgrade procedure](Docs/Installation_Guideline.md#safe-stop-and-restart).
Stop Tracker and demo before rebuilding matching React entry assets. Although
React source is unchanged, canonical version 0.4.1.8 requires a matching build.
Use the standard hidden restart, let the normal Chronicle generator/build/swap
deliver its stylesheet, and reload existing tabs. Restarting Python alone does
not rebuild frontend assets; never hand-edit Chronicle/runtime to change CSS.

Previous [v0.4.1.7 notes](Docs/Release_Notes/Archive/TrackingMonitor_v0.4.1.7_Release_Notes.md)
retain every historical byte except their two move-affected Markdown URLs.
