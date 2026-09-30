# KATLAB TrackingMonitor v0.3.1.20 — Frontend Sanitizer Patch

Patch the frontend sanitizer dependency without changing graph behavior.

## Changed

- DOMPurify 3.4.15 to 3.4.16 for the low-severity
  [GHSA-p98j-92pf-mc4p advisory](https://github.com/cure53/DOMPurify/security/advisories/GHSA-p98j-92pf-mc4p).
  Only its lock entry's version, registry URL and integrity change.
- Mermaid 11.17.2, all other dependency entries, strict nested-lazy loading,
  graph generation and SVG consumers remain unchanged. No new dependency,
  direct import, override or sanitizer bypass.

## Limits

- The reviewed app path does not show the advisory's IN_PLACE plus
  node-removing hook combination. This is dependency remediation, not evidence
  of application exploitation or proof of complete security.
- Frontend audit results describe the queried tree at check time, not GitHub's
  separate default-branch alerts. Chronicle's independently pinned Mermaid
  bundle and product Python dependencies are unchanged.
- Native browser graph/rendering and sanitizer exploit checks remain unrun.
  DOM-less Node parsing is not rendering or XSS verification; GitGraph parsing
  requires DOM-backed sanitizer support. Optional Mermaid chunk size advisory
  remains outside this patch.
