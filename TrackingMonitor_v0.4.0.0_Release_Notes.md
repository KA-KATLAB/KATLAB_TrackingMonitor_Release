# KATLAB TrackingMonitor v0.4.0.0 — Operational UI Redesign

Activated locally on 2026-10-05 at the user's explicit request. Native rendered
acceptance remains open; activation does not mean the full visual redesign has
been accepted. Remote publication evidence is recorded separately in the plan.

## Changed

- Visible UI build version beside KATLAB Tracking Monitor. The badge and System
  button open the same existing health dialog. Server identity is separate;
  unknown/malformed values and known mismatches are explained without new polling.
- Work-first shell with desktop view navigation, narrow Navigation drawer,
  searchable Repository scope, all-width Tasks/status drawers and visible Commands.
  Tools retains reports, preferences and bounded Experience features.
- Clearer Changes, Mission and History hierarchy. Mission pages every blocker
  and warning with exact repository/plan identity instead of hiding rows after 50.
- Four primary Overview metrics with secondary capture facts. Readable typography,
  quieter panels, wrapping values and shared control/heading roles across views.
- Initial workspace loading/failure is separate from accepted empty data across
  operational views and actions. Independently loaded statistics, reports,
  Mission, System and Chronicle are not blocked by workspace hydration.
- Honest Git-status coverage: offline/unvalidated retained values do not appear
  currently clean or zero in shell, Overview, Focus, City or Digest.
- Live Git validity survives WebSocket updates and pending REST reconciliation.
  Attention/Kat disclose incomplete status; recovery across an unknown gap does
  not produce a false clean celebration. Existing capture-based facts remain.
- Shared attribution badge foregrounds, consistent dialogs/reports/Digest, and
  Chronicle typography, contrast, focus and reduced-motion CSS from its generator.

## Preserved

- All six views and existing actions, pagers, exact-data alternatives, reports,
  preferences and celebrations. No dependency installation or feature removal.
- Snapshot dates, full-model calculations, scope/session identities, request
  deadlines/cancellation, stale ownership and the network-only service worker.
- Capture/hooks, database/API contracts, readiness algorithms and read-only Git.
  Chronicle signed runtime, pinned assets, navigation and build lifecycle.

## Verification and activation boundaries

- Actual-source component/helper tests, controlled async lifecycle tests,
  Python regression and isolated production builds cover the owned changes.
  They do not establish native layout, keyboard focus, assistive technology,
  perceived visual quality or completed browser downloads.
- Three isolated signed Chronicle/MkDocs/lifecycle cases pass with locally
  installed vendor bytes validated against exact pinned length/hash. The direct
  CDN variant stopped because response Content-Length did not match pinned
  authority. The transport guard was not weakened; CDN transfer remains unverified.
- Native acceptance remains open across six views and 360/390/768/1024/1440px,
  200% zoom, coarse pointer, reduced motion and long/empty/error/stale states.
  The generated Chronicle document must be inspected separately from its host.
- Explicit activation rebuilt `Frontend/dist/`, ran the repository restart script
  after listener/process-ownership preflight, and verified server0.4.0.0,
  watchers6/6, Chronicle running and served index/JS/CSS byte equality. Health,
  repository, task, statistics and Mission envelopes succeeded; Chronicle served
  HTML. These checks are not native UI interaction or browser-reload evidence.
- Existing browser tabs must reload to receive the new version badge and UI.
  Restarting Python alone cannot update already loaded JavaScript. Existing
  Mermaid chunk-size advisories remain; they are not runtime failures or a
  security assessment. Source versioning alone never proves remote publication.

Detailed implementation/review/verification evidence is kept in the ignored plan:
`temp/Plan/PLAN_v0.4.0.0_Operational_UI_Redesign.txt`.

Prior release notes are preserved byte-identically in the
[v0.3.1.32 archive](Docs/Release_Notes/Archive/TrackingMonitor_v0.3.1.32_Release_Notes.md).
