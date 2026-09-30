# KATLAB TrackingMonitor v0.3.1.13 — Commit Draft Recovery

Commit-draft copy now distinguishes an empty captured window from a clipboard
problem and gives visible recovery feedback when confirmation is uncertain.

## Changed

- Copy reports copied, no captured events in the current fetched window,
  clipboard unavailable, or failed write. Empty drafts do not access clipboard.
- One App-level owner covers StatusBar and palette actions. All draft controls
  are disabled while a copy observer is pending, with a visible reason on
  other-repo buttons. Repo-labelled failure details have bounded keyboard
  scrolling; passive success notes show the result first and clamp long text.
- A 10-second deadline releases an unresponsive observer. Timeout says the
  browser may still finish writing; check clipboard before manually retrying.
  Other failures stay visible until a new draft, scope change or Dismiss.
- Draft composition and the global 500-event snapshot remain unchanged. Copy
  starts in the original click, without an extra fetch, permissions query,
  clipboard read or automatic retry.

## Limits

- The deadline does not abort a native clipboard write. A later manual retry
  may overlap an older timed-out write; final clipboard ordering is not promised.
- Controlled request/SSR/static checks do not replace actual browser clipboard,
  keyboard, viewport or assistive-technology verification.
