# KATLAB TrackingMonitor v0.3.1.28 — Overview Stats Recovery

Recover Overview statistics without leaving the current scope or reloading.

## Changed

- A stable Refresh/Retry stats action remains available after an initial error.
  Busy state is explicit; accepted same-scope data stays visible with a retained-
  response notice during refresh/failure.
- Every manual attempt owns a fresh 10-second deadline and duplicate guard.
  Old automatic/manual responses cannot overwrite newer ownership. Committed
  scope/view changes, membership loss, unmount and supersession cancel silently.
- Canceled initial loading becomes neutral unavailable with retry, not endless
  Loading. Scope exit preserves accepted target-scope cache. Same-context history
  navigation and reselecting the same repo remain valid; obsolete cleanup cannot
  release a newer attempt. Background requests use semantic scope identity.
- Bounded removed-error focus recovery respects temporary busy state, the
  current focus target, inert content and modal ownership. Long error tokens wrap.

## Verification boundaries

- This reads stats only; it does not rescan Git, refresh every view, invalidate
  wardrobe or regenerate Chronicle. Existing background and UTC triggers remain.
- Accepted responses are not a guarantee that every observed source is current.
  No new dependency, API mutation, polling loop or automatic retry is added.
- Actual-source request/hook and component SSR checks are controlled evidence,
  not native network-outage, history, keyboard, focus or screen-reader tests.
  Live HTTP/artifact checks remain separate from those native interactions.
