# KATLAB TrackingMonitor v0.2.6.0 — "One System"

**Theme: everything becomes ONE system — one port, one process, one start,
zero windows.** The Chronicle stops being a sidecar on 8200 and becomes a
true sub-system of the tracker: the server itself serves the built site at
`/chronicle/`, its lifespan owns the regen loop, and the living docs arrive
in the product UI as the 5th top-level view. Born from two user rulings in
one breath — "combine everything into one" and "the cmd window spam makes
me tired": the tracker now runs completely HIDDEN, and every last console
flash (down to the git-poll strobe caught live) is gone.

## Highlights

- **One port** — the tracker serves the built Chronicle at `/chronicle/`
  through a per-request resolver: traversal-guarded (404, never 500 — raw,
  encoded, double-encoded and backslash vectors all battery-proven live),
  bare-dir URLs 307 to their slashed form (relative links stay correct),
  mkdocs' absolute-path `404.html` never served, uniform no-cache, and a
  self-healing "not built yet" page that enters the site the moment the
  first build lands
- **One process** — the tracker's lifespan spawns and owns the regen loop
  (`mkdocs serve` is RETIRED and its whole all-404 failure class dies with
  it): builds go to `site.new`, then swap ATOMICALLY rename-first — the old
  site serves WHOLE through any failure; the single-instance lock gains a
  crash-window retry (~30s × 15min) so a crashed tracker's orphan can never
  leave a restarted tracker loop-less — the full retry → staleness →
  acquisition chain live-proven during the CFT loop
- **Living freshness** — livereload replaced by a generated `refresh.js`:
  a 15s visible-tab HEAD poll of the site index's Last-Modified; a mid-swap
  404 can never reload into a dead end (null-guarded), file:// no-ops keep
  the offline path silent
- **The 5th view** — 📖 Chronicle joins Changes / History / Overview /
  City: a same-origin iframe with the honest not-built card that re-probes
  every 10s and flips itself when the first build lands; header 📖 chip +
  two palette entries ("Open Chronicle view", "Open in a new tab ↗");
  the Legend documents the iframe focus boundary
- **Silent ops** — the server starts HIDDEN via `pythonw` (the load-bearing
  `start "" /b cmd /c` incantation), logs to `data\logs\` with one-previous
  rotation, guards double-starts, and opens the browser at the config-read
  port; the demo trio silenced identically; uvicorn access logs retired
  (pure-signal logs); and the live-caught law: hidden ≠ silent —
  `CREATE_NO_WINDOW` now rides EVERY child spawn (git polls, the mkdocs
  probe and build, the Scribe's claude) — a desktop window-watcher proved
  ZERO console windows through startup, git cycles and a full site build
- **Scripts diet** — `serve.bat`, `live.bat`, `_start_all.bat` DELETED;
  start / stop / restart are the whole surface; `view.bat` (offline,
  --strict) decoupled to its own `site.view` so it can never touch the
  served site; port 8200 is history
- **Engineering discipline** — a 48-pass CDD plan review (32 findings
  fixed pre-implementation, three ships-dead traps live-proven early) plus
  an 18-pass post-implementation CFT loop ending 5/5 consecutive clean:
  14 findings fixed in place, including two real code bugs the review
  never saw — the lock retry's TOCTOU crash on the orphan's designed
  unlink gap, and an unguarded pre-yield spawn that could have killed the
  tracker over its OPTIONAL child
- **Product scope** — backend diff = `main.py` + `git_module.py` (the
  no-window flag) + the version constant; zero new pip dependencies; no
  schema, hook or endpoint change

## Cross-repo

Nothing to install in monitored repos — the contract is unchanged. EA/UM
gain the one-URL experience for free: their devlog, plans, changelog and
AI-written story now live at `http://127.0.0.1:8100/chronicle/`, inside
the tracker UI and behind a single silent double-click.
