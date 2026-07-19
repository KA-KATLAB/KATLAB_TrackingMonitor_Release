# KATLAB TrackingMonitor v0.1.4.0 — Release Notes

**Theme:** Visual Polish — the v0.1.3.0 visuals now look and feel finished.

A second, deeper harvest from `nicobailon/visual-explainer`: v0.1.3.0 took the big primitives (colored diff, charts, sparkline, graph); this release takes the polish layer — real typography, headline numbers, an interactive diagram shell, and motion that respects your settings. Discovery ran loop-until-dry (4 passes, 2 consecutive dry); the plan then survived two full CDD review series (16 + 22 fresh rounds, 22 findings fixed, each series ending 5/5 consecutive clean) before a line of code was written.

## Highlights

- **Real typography:** "Plus Jakarta Sans" + "Azeret Mono" (visual-explainer's canon pairing for status/audit UIs) across the whole app — including the Mermaid graph and the Chart.js canvases, which ignore page CSS and needed their own wiring. Offline-safe: the fallback stacks render if the font CDN is unreachable.
- **KPI row:** six headline numbers above the charts — captured events, auto-attributed %, need-a-pick (always equals the manual-pick queue), repos clean, uncommitted changes, busiest task — with a subtle count-up and overflow-proof hero values.
- **Interactive relationship map:** the graph gains a real diagram shell — zoom (+/− buttons, ctrl/cmd+wheel at the cursor, keyboard +/−/0), drag-pan, smart-fit, and a fullscreen expand overlay (Esc / click-out). Uncommitted work now shows as dashed edges, with a one-line shape legend under the graph.
- **Changed files, by folder:** a new toggle renders each repo's uncommitted files as a monospace directory tree with per-file edit counts — churn hotspots at a glance. The manual-pick queue stays put either way.
- **Sticky section nav:** long Changes views get a scroll-spying mini-TOC — always know where you are, jump anywhere.
- **Motion done right:** one staggered reveal per view per session (switching tabs never re-staggers); `prefers-reduced-motion` disables every animation and hides nothing.
- **Atmosphere:** a faint radial glow + dot grid replace the flat background — depth at zero scroll cost.

## Cross-repo

UI-only release: all changes live in `Frontend/` (plus the version constant and docs). No backend logic, no new endpoint, no schema change, no new git calls, monitored repos untouched. Fonts load via `<link>` — the JS bundle stays lean (Mermaid remains its own lazy chunk).
