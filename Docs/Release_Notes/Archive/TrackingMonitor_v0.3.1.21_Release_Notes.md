# KATLAB TrackingMonitor v0.3.1.21 — Git Graph Branch Quoting

Keep Git graph branch configuration consistent with its merge checkouts.

## Fixed

- Branch names containing apostrophes, such as `feature/o'brien`, no longer
  invalidate the existing Mermaid init directive and silently revert its main
  label to `main`. JSON serialization plus unicode-escaped apostrophes preserves
  the intended label through Mermaid's quote normalization.
- The decoded main name matches the unchanged quoted merge checkout. Commit
  order, 20-commit cap, rows, parent decoration, HEAD tagging and graph recovery
  are preserved, as are strict nested-lazy loading and the backbone graph.

## Verification boundaries

- Focused regression coverage uses the actual builder, public Mermaid config
  parsing and installed Git graph grammar, without a new dependency or DOM shim.
- Incorrect config was reproduced without a browser; merge failure follows
  from the installed graph database's missing-branch check. Native SVG rendering,
  browser/keyboard/AT interaction and visual layout checks remain unrun.
- This is a label/config correctness fix, not a sanitizer or XSS claim. The
  previous DOMPurify patch and separate Chronicle pins remain unchanged.
  Optional Mermaid chunk size and separate GitHub default-branch alerts remain
  outside this patch.
