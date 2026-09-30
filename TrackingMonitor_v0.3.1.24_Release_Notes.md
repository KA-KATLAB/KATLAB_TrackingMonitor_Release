# KATLAB TrackingMonitor v0.3.1.24 — Repository Scope Paging

Browse every repository scope without the rail jumping back automatically.

## Fixed

- With more than 50 scope choices, manual Next/Previous now remains on the
  requested page instead of snapping to the selected repo's page.
- Remembered browsing pages win over selected-choice fallback, including saved
  Back/Forward pages. The selected scope label remains visible off-page.
- Without a remembered page, initial selection and delayed membership hydration
  follow the selected choice. Explicit scope changes clear only the rail's
  same-view page memory; view changes keep the existing full memory reset.
- Preserve exact ids, All repos versus a repo named ALL, labels/pressed states,
  missing-selection placeholder, 50-choice rendering and shrink clamping.
  Other collections, shared pager, focus and history restoration are unchanged.

## Verification boundaries

- Actual-source controlled hook/effect and navigation checks reproduce the old
  snap-back and cover the changed policy. These are not a mounted React DOM or
  native browser pagination/Back/Forward test.
- Native browser, keyboard/AT, visual/zoom and pointer checks remain unrun.
  No monitored repository/configuration change is needed for the fixtures.
- Optional Mermaid chunk size and separate GitHub default-branch alerts remain
  outside this fix. No dependency or backend/API contract change.
