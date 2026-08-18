# KATLAB TrackingMonitor v0.2.11.0 — "The Provenance Ledger"

**Theme: the industry's hottest 2026 number, and everyone is guessing
it.** "What share of the code is AI-written?" is answered today by
counting `Co-Authored-By` trailers, scraping commit metadata, or running
detectors over diffs — git-metadata approaches are cited at 60-70%
accuracy, and GitHub reports roughly half of committed code as
AI-assisted without being able to say *which* half. The tracker has
never had to guess: every Claude file-change is captured per file, with
its reason, and linked to the commit that carried it. This release does
the one thing that data makes possible — it composes the number instead
of estimating it. The fourth moat inversion, after the Chronicle, the
Scribe and the Commit Draft.

## Highlights

- **Provenance card** (Overview, full width below the arcade shelf) —
  the share of committed **file changes** that carry captured Claude
  events, as one large percentage over a two-tone bar. At ship, the
  workspace reads **73%** — 288 of 397 file-slots across 29 observed
  commits. Not a lines-of-code metric and it never claims to be: the
  tooltip states the basis in one sentence, and the phrase "code written
  by AI" is forbidden from the card by test.
- **The observation gate** — the tracker backfills about 20 commits per
  repo when it first meets them, and those predate any capture. Counting
  them would have quietly reported "0% AI" for real work. Every commit
  is therefore measured only from its **own repo's first capture**
  onward; the earlier ones are excluded *and counted in the open*
  ("40 earlier excluded"), so the honesty is visible rather than
  implied.
- **Per-file truth, including the unflattering kind** — the top eight
  files each show their AI-touched ratio and open the existing File
  Story on click. The mix is the point: `Version_Notes.md` reads 12/14,
  `katlab_lib_applcfg.mqh` 14/14, and the compiled `.ex5` artifacts read
  **0/14**, because Claude never edits binaries. A row of all-100% would
  have meant the metric was broken.
- **Honest at both ends** — 100% and 0% are reserved for the exact
  cases. 396 of 397 prints 99%, never a rounded-up "100%"; one of 400
  prints 1%, never a rounded-down "0%". The bar keeps the true unclamped
  ratio, because geometry is not a claim.
- **The book chip retires** — the 📖 header chip did exactly what the
  Chronicle tab does, so it is gone. The tab, both command-palette
  entries and the Chronicle itself are untouched.
- **The composite-key law** — a commit's identity is the pair
  `(repo_id, hash)`, the commits table's own primary key. Two repos
  really can share a hash through common upstream history — the tracker's
  database holds 16 such pairings today — and keying the event map by
  hash alone would leak one repo's Claude events into another repo's
  commit and inflate its share the moment both are tracked together.
- **One documented distortion, stated rather than hidden** — the CLEAN
  sweep attaches leftover events to HEAD, so in one narrow case (an edit
  reverted, never committed, nothing else linking it, and a later human
  commit touching that same file while it is HEAD) a file can read
  AI-touched in a commit Claude did not shape. Rare, self-healing, and
  written down, because a card about honesty cannot ship an absolute it
  can violate.
- **Demo mode reads 0% by design** — the demo's commits are this
  repository's real git history (its scratch repo lives inside this
  working tree) while its events are synthetic paths, so the two sets
  cannot intersect. Documented so it is never mistaken for a bug.
- **Engineering discipline** — a 64-pass CDD plan review (82 findings
  fixed before implementation; the heaviest: the composite key, an
  assertion that would have failed a correct implementation, and an
  aggregate that was built but never returned), and the design was
  executed rather than only read — the aggregate ran against the live
  database and against a fixture battery that also defeats the two
  plausible wrong implementations, while the card was built from the
  plan text, rendered, and type-checked under the project's own strict
  configuration
- **Product untouched where it counts** — backend diff = `db.py` + the
  version constant; no schema, endpoint, hook, or git-call change; zero
  new dependencies; zero new localStorage keys (still seven); no new
  WebSocket message. The card rides the existing `/api/stats` payload
  and refetch, so a new commit updates it in about a third of a second

## Cross-repo

Nothing to install in monitored repos — the contract is unchanged.
EA/UM gain a number they never had to earn: every commit they have made
since the tracker met them is already measured, so EA_Dev opens at 69%
and UM_Dev at 75% the moment you switch tabs. Their per-file ratios are
browsable too — click any row to open the File Story behind it, and note
which files read 0/N, because that is the metric telling the truth about
work Claude never touched.
