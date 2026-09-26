# KATLAB TrackingMonitor v0.3.0.3 — Dependency Security Hardening

This update moves directly from v0.3.0.1 to v0.3.0.3. It patches frontend
dependencies and completes the bounded, authenticated Chronicle pipeline.

## Changed

- Frontend: Mermaid 11.17.2 and Vite 6.4.3, with patched DOMPurify, esbuild,
  browserslist, baseline-browser-mapping and nanoid. React 18, Tailwind 3,
  TypeScript 5 and the six-view UI contract remain unchanged.
- Backend configuration is read once into a deeply immutable, bounded snapshot.
  Existing duplicate-YAML-key rejection is preserved.
- Chronicle uses a parent-owned child and a random per-start capability in an
  owner/SYSTEM-only file. Each bounded loopback response has a fresh nonce and
  authenticated proof checked before JSON parsing. Demo/config-override instances
  cannot access production Chronicle state.
- Native Windows file identity, no-follow reads, bounded inventories, exact
  dead-owner lock recovery and atomic file replacement protect generated output.
  Strict MkDocs builds use validated candidates; failed builds retry even on
  unchanged ticks or after restart. If promotion and rollback both fail, the
  prior-site backup is retained and its recovery path reported.
- The documentation mirror includes AGENTS.md and Codex_Info. Empty optional
  diagrams omit their navigation item; colliding plan-page names fail before
  generated-content writes. Optional Chronicle retains bounded model/session
  limits, supports up to 256 repositories and 250-character ASCII IDs, and
  refuses over-budget input without changing Backend configuration admission.
- Local Mermaid 11.17.2 and Bootswatch 5.3.3 assets have fixed lengths/hashes.
  The runtime Bootswatch derivative removes its external font import. Strict
  offline view checks actual local assets and generated configuration before
  building/opening, with fresh signed tracker probes at both boundaries.
  Normal generation can use a pinned CDN fallback, which is
  online-only. Theme CDN syntax highlighting is disabled; code remains readable.
- Scribe is intentionally disabled without launching Claude. The Python CLI exits
  3 for valid arguments or 2 for invalid syntax; the batch entrypoint always exits
  3. Existing story pages are preserved.
- Dependabot configuration covers Frontend, Backend and Chronicle with zero
  routine version-update PRs and security-only groups. Repository security
  settings and release-mirror settings are separate; this change does not enable
  them or prove that GitHub has no alerts.

## Operation and compatibility

Chronicle selects an absolute `KATLAB_CHRONICLE_PYTHON` override or one PATH
Python, independently of Backend's `.venv`, and checks its identity/dependencies.
Use `Scripts/Chronicle/install.bat` when dependencies/assets need installation;
`--mermaid-only` fetches just the pinned Mermaid asset and does not run pip.
Keep the tracker running, use `generate.bat` to generate/build, and `view.bat`
for strict offline build followed by opening the local `/chronicle/` site.

Old plain-text `.chronicle_loop.lock` files cannot prove ownership. After the
operator confirms all old tracker/Chronicle processes have stopped, inspect and
remove only that legacy lock in `Chronicle/runtime/` before starting the update.
Never delete a live or ambiguous structured lock or capability to bypass refusal.

The capability is trusted same-owner local state, not API login or isolation from
malicious same-owner code. External bootstrap/guardian, sealed runtime provenance,
host Python/Node upgrades, process-tree release supervision and VM attestation are
deferred. Runtime security clearance and production activation are not claimed.
No endpoint payload, database schema, hook, capture, attribution or readiness
semantics are intentionally changed.

## Verification and activation

`npm ci --ignore-scripts`, full/production npm audits (zero findings on
2026-09-14), and `npm run build` passed. The builder retains its non-fatal
over-500kB lazy-chunk warning. Isolated tests exercise real signed HTTP, pinned
downloads, actual repository mirrors, strict builds, parity and failure recovery.
See the ignored v0.3.0.3 detailed plan for exact CFT/full-suite status and evidence;
these checks do not certify deployment or the host runtime.

After review and publication, deployment requires an operator-controlled restart.
This implementation task does not restart the live tracker, install global
packages, commit, push, change GitHub settings or publish a release.
