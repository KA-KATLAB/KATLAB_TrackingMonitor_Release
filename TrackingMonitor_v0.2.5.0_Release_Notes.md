# KATLAB TrackingMonitor v0.2.5.0 — "The Scribe"

**Theme: the tracker WRITES about your work — by itself, every day.** The
Chronicle (v0.2.4.0) generates mechanical docs from ground truth; v0.2.5.0
adds the missing voice: a Scribe that invokes Claude Code headless
(`claude -p`, your subscription login) once a day and turns the tracker's
KNOWN why — task refs, whys, files, served minutes, commits — into honest
English prose. Commit-guessing devlog tools summarize diffs; the Scribe is
fed attribution.

## Highlights

- **Three AI-written page kinds** land in the Chronicle's new 📖 **Story**
  section (`Chronicle/runtime/docs/story/`, gitignored):
  - **Daily diary** — one page per completed UTC day: what was worked and
    why, notable files, that day's commits (~150-250 words)
  - **Weekly retro** — the completed ISO week's arc: what shipped, what
    stayed open (ISO-year filenames — the Jan-1 straddle law)
  - **Release-notes drafts** — a skeleton draft (Theme → intro →
    Highlights → Cross-repo) whenever a version commit lands in a
    monitored repo, ready to copy into that repo's release flow
- **Autopilot, once daily**: the Chronicle live loop writes yesterday's
  diary on the first tick after UTC midnight — zero clicks, zero prompts;
  `Scripts/Chronicle/scribe.bat` = the manual drain, `scribe.py --day /
  --week / --release [--force]` = surgical runs
- **Money guards everywhere** (quota is treated like money): once-ever by
  existence (delete or `--force` to regenerate — completeness is never
  overridable), ≤1 invocation per loop tick, 3 attempts per target, 7-day
  horizon, and a global **5-runs-per-UTC-day cap** in a fail-CLOSED counter
  (assemble → reserve → invoke, no refunds); validated-result-or-nothing —
  a failed run never fabricates a page
- **Honesty laws in the prose itself**: per-repo ≈minutes are NEVER summed
  (the proven 58-vs-67 non-additivity can't reach prose — totals read the
  unscoped calendar), no invention beyond the data, no links/HTML (a
  hallucinated link would break the strict site build — gated), and every
  page ends with its `AI-written (model) - generated <ts>` footer: AI prose
  never masquerades as ground truth
- **Battle-tested engine**: drain-safe `communicate`-retry spawn (immune to
  the Windows 64KB pipe deadlock), per-retry lock heartbeat (a long AI run
  can never let a second loop steal the single-instance lock), UTF-8
  everywhere, tolerant cost logging (console only)
- **Engineering discipline**: a 32-pass CDD plan review (48 findings fixed
  pre-implementation) + a 7-pass post-implementation CFT loop (2 findings,
  live-proven fixes); machine batteries 36/36 + 15/15 with ZERO quota
  (fake-CLI shim), plus one witnessed live run — yesterday's real diary,
  grounded to the actual commits
- **Product untouched**: no UI change, no new endpoint, no schema/hook/git
  change; backend diff = the version constant only; zero new pip
  dependencies (the claude CLI is a system tool)

## Cross-repo

Nothing to install in monitored repos — the contract is unchanged. The
Scribe narrates EA/UM automatically from the tracker's served attribution,
and drafts their release notes the day a version commit lands.
