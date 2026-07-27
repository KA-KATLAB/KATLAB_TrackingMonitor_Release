# KATLAB TrackingMonitor v0.1.9.0 — Release Notes

**Theme:** Skyline & Arcade — see your year as a city, earn your ranks, feel every capture, and read the branches.

Sixth research harvest (gh-skyline-class isometric cities, ryo-ma-class trophy ranks, vscode-power-mode-class combo meters, and mermaid's built-in gitGraph): the skyline parked in v0.1.8.0 finally lands — as a pure-SVG isometric projection, zero new dependencies — alongside a gamified trophy case, a live capture combo, and the release's one utility item: a real commit graph fed by real parent hashes. The plan survived a 12-pass CDD review loop (11 findings RV1–RV11 fixed in place, ending 5/5 consecutive clean), and the graph builder was fixture-tested against the real bundled code before going live.

## Highlights

- **Isometric skyline (your year as a city):** the 365-day activity calendar re-rendered as a 2:1 dimetric city — building heights follow a square-root scale of each day's events (one huge day never flattens the rest), top faces share the exact teal ramp and quartile bucketing of the flat view, side faces are shaded for depth, and commit days keep their light dot. Tooltips are identical to the flat calendar's. A `flat | city` toggle sits in the card header (city is the new default — one click back, remembered across reloads).
- **Trophy case (ranks you can brag about):** seven ranked achievements — Collector, Streak Keeper, Shipper, Night Owl, Weekend Warrior, Marathoner, Finisher — each climbing C → B → A → S → SS → SSS with a progress bar to the next rank, plus two SECRET trophies that stay "???" until you discover them. Computed entirely in the browser from stats the tracker already serves; ranks re-compute per repo tab (per-repo trophies are a feature).
- **Live capture combo (feel the flow):** while Claude Code works, a "🔥 ×N" chip counts every live capture in the current work block (the same 15-minute-gap rule as every effort estimate; resets after idle). Crossing 5 / 10 / 25 / 50 / 100 / 250 pops the chip with a small particle burst. Ephemeral by design — a flow meter, not a statistic; reduced-motion and hidden tabs stay quiet.
- **Commit graph (read the branches):** every detected commit now records its real parent hashes — captured by extending the ONE existing `git show` format with `%P`, so zero new git invocations. The History tab gains a "⎇ graph" toggle rendering the latest 20 commits as a mermaid gitGraph on the repo's actual branch name, with merge side branches summarized to their tip (marked `*`); pre-upgrade rows without parents chain linearly, honestly.

## Cross-repo

Nothing to install in monitored repos: the capture contract, hook, and event version are all untouched. One additive database column (`commits.parents`, auto-migrated idempotently at startup — pre-upgrade rows stay NULL beyond the last-20 backfill window, which self-heals on the first restart); `/api/history` rows carry the new field, no other endpoint changes; no new git calls, `package.json` untouched (zero new dependencies).
