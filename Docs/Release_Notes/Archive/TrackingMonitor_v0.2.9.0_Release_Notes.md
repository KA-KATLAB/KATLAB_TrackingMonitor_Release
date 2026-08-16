# KATLAB TrackingMonitor v0.2.9.0 — "Drafts & Daydreams"

**Theme: the tracker writes your commit message — and daydreams when
you're away.** The third moat inversion: where AI commit tools guess
your message from the diff, the tracker already KNOWS why every file
changed, so it composes the message from attribution — deterministic,
instant, no AI, no API. Add a rainbow when a rainy district finally
clears, and an attract mode that gently cycles the living views after
ten idle minutes, and the tracker now works with you, celebrates with
you, and keeps itself company when you step away.

## Highlights

- **Commit Draft** — every dirty repo's status entry gains a
  **draft 📋** chip: one click copies a commit message composed from
  that repo's uncommitted attribution — linked task titles in
  first-touch order (the first-started mission leads, riders follow),
  stale refs kept honest as bare refs, and a "+N unattributed" suffix
  that never hides what the tracker couldn't attribute. The frame is
  your own convention (`KATLAB <TAG>: vX.Y.Z.W - <summary> -
  vX.Y.Z.W`) with both version slots left as placeholders — versioning
  stays your call, and the placeholder can never trip the release
  fireworks. Palette actions per dirty repo included. The thriving AI
  commit-tool class (aicommits ~9k stars) guesses from diffs via an
  LLM; this is the Chronicle-vs-git-cliff move a third time — known
  attribution beats inference, at zero cost. And the tracker still
  never runs git: clipboard only, forever
- **Rainbow After Rain** — when a district's aged uncommitted work
  (the rain) is finally committed and the sun comes out, a four-band
  rainbow arcs over it for a couple of seconds — the recovery
  celebration, in physical color order, stacking with the commit
  fireworks as one sequence. Transient decoration: never in snapshots,
  hidden under reduced motion
- **Attract Mode** — after 10 idle minutes the tracker daydreams:
  City → Overview → Chronicle, a slow 25-second carousel under a
  transparent touch-guard — any click or key wakes it and restores
  exactly the tab and view you left (the wake click can never land on
  something underneath). It never arms over open dialogs, hidden
  tabs, or while you're reading the Chronicle (input inside the
  embedded site is invisible to the app — so it honestly never
  guesses there). Default on; one palette toggle turns it off
- **Engineering discipline** — a 19-pass CDD plan review (12 findings
  fixed pre-implementation, the heaviest being the Chronicle-iframe
  blind spot and the click-catcher's unmount click-through) + a
  machine battery on the real sources (15/15 — including a
  cross-repo-leak row and the mission-arc ordering over the served
  newest-first pool) + a 6-pass CFT loop (2 findings: the documented
  seam-wording correction and a note-timer nonce fix), closing 5/5
  clean with the served bundle artifact-proven
- **Product untouched where it counts** — backend diff = the version
  constant only; no schema, endpoint, hook, or git-call change; zero
  new dependencies; one new localStorage key (the attract opt-out)

## Cross-repo

Nothing to install in monitored repos — the contract is unchanged.
EA/UM gain the most practical feature yet: their commit messages now
draft themselves from the attribution the tracker has been keeping all
along — copy, fill in the version, commit. And when that commit clears
a long-standing rain, watch the City for the rainbow.
