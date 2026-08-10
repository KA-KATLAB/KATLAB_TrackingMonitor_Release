# KATLAB TrackingMonitor v0.2.4.0 — "The Chronicle"

**Theme: the tracker writes its own docs site.** Your workspace already knows
*what* changed and *why* (task attribution) — v0.2.4.0 turns that ground truth
into a living MkDocs documentation site: an auto-written devlog, plan status
pages, a reason-grouped changelog no commit-message tool can produce, and a
mirrored Docs section — dark, searchable, live-reloading, generated with zero
AI and zero typing.

## Highlights

- **The Chronicle site** (`Scripts/Chronicle/`, MkDocs 1.6.1 — the Live_arch
  stack): double-click and browse `http://127.0.0.1:8200`
  - 🏠 **Overview** — per-repo status cards (CLEAN ✓ / N uncommitted /
    OFFLINE), workspace totals (last 365d, UTC), the data-through stamp
  - 📓 **Devlog** — one page per active UTC day: tasks worked with their
    whys, files touched, ≈effort (served calendar minutes), that day's
    commits; honest "(unattributed)" bucket
  - 📋 **Plans** — one page per plan: task blocks with status chips
    (✓ done / … in-progress / • pending), whys, declared files; active
    plans first
  - 📜 **Changelog by reason** — commits newest-first, events grouped under
    the task/why that caused them; stale refs render "(plan no longer
    present)" honestly
  - 🏛 **Docs** — byte-verbatim mirror of README + Claude_Info + Docs +
    release notes, plus the real `temp/Ref` design diagrams rendered
    zoomable (mermaid + alt-scroll pan/zoom)
- **One double-click for everything**: `Scripts/_start_all.bat` — starts
  the TrackingMonitor server (skipped if already running) and then the
  Chronicle living site; the underscore keeps it sorted on top of
  `Scripts\`
- **Five focused double-clicks** (`Scripts/Chronicle/`): `install.bat`
  (one-time, plain pip + vendor fetch) · `generate.bat` (one-shot) ·
  `serve.bat` (live-reload) · `live.bat` (**the living site** — a 60s
  regen loop; new captures/commits appear in the browser by themselves) ·
  `view.bat` (offline `file://`, no server)
- **The KATLAB look**: the site wears the app's own design language —
  slate-950 with a soft teal glow, the product fonts (Plus Jakarta Sans +
  Azeret Mono, offline-safe fallbacks), dark sidebar/search/modals,
  card-styled lists
- **Engineering laws baked in** (19-pass CDD review, 37 findings fixed
  pre-implementation): write-only-if-changed atomic sink + stale-page sweep,
  calendar-diff incremental ticks (offline-capture catch-up safe), effort
  additivity law (scoped vs unscoped never mixed), md/YAML escape surfaces,
  single-instance loop with self-exit (no orphan processes), UTF-8 + HTTP
  timeouts everywhere
- **Product untouched**: no UI change, no new endpoint, no schema/hook/git
  change; backend diff = the version constant only; Chronicle dependencies
  live in their own `requirements.txt` (plain pip, per user ruling)

## Cross-repo

Nothing to install in monitored repos — the contract is unchanged. The
Chronicle documents EA/UM automatically from the tracker's served data.
