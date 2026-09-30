# KATLAB TrackingMonitor v0.3.1.5 — Browser Preference Recovery

Blocked or full browser storage no longer prevents optional preferences from
loading safely or makes their controls throw.

## Changed

- A shared guarded storage boundary preserves the existing keys and defaults.
  Failed visual saves keep the current choice and report its limited lifetime.
- Sound and OS alerts fail off when an opt-in cannot be saved and verified.
  An explicit disable blocks new playback/alerts for the current page even if
  the old stored setting cannot be overwritten.
- Toggle feedback distinguishes persistence failure from browser capability
  or permission failure. Failure feedback remains visible for palette actions
  on small screens, not only inside desktop menus.
- Audio setup and automatic gesture resume handle failure safely; stale
  gesture completion cannot overwrite a newer explicit preference.
- No new dependency, storage key, backend API, database or monitored-repository
  change is introduced.

## Limits

- If saving fails, a choice can reset on view remount or page reload. A failed
  opt-out cannot erase an older saved opt-in for future pages; the current-page
  veto prevents new playback/alerts here. Audio suspension remains best effort.
- Browser permissions/capabilities can change later; this is not cross-tab
  preference synchronization. Automated fixtures and SSR are not a real-browser
  storage-policy, audio, permission or viewport interaction test.
