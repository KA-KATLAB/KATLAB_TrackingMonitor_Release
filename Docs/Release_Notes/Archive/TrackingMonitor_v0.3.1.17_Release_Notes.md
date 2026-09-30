# KATLAB TrackingMonitor v0.3.1.17 — Background Preference Feedback

Reported background preference failures no longer leave controls showing on.

## Changed

- Saved-on sound restoration and notification access/delivery failures update
  existing controls to off and show fixed recovery guidance. Failed off saving
  warns that an older opt-in may return after reload. Retry remains explicit.
- One bounded immutable failure fact per channel covers failures before App
  mounts. Current facts take priority over older explicit completion feedback;
  an accepted new choice clears only its own channel, not the other preference.
- Missing, non-granted or throwing notification capability fails closed without
  prompting. Granted permission with a visible page stays a no-op. Foreground
  deadlines, user gestures, notification coalescing, sounds and layout remain.

## Limits

- Only module-reported same-page failures are synchronized. There is no new
  cross-tab/storage-policy/permission watcher or guarantee of native delivery.
- Background first-gesture activation remains unbounded; native cleanup is
  best effort and synthesis/context-state drift is not redesigned.
- Controlled/static checks do not replace real browser audio, notifications,
  keyboard, viewport or assistive-technology checks, which remain unrun.
- Existing optional Mermaid chunk-size advisory and 14 default-branch
  Dependabot alerts remain; this release does not claim to resolve them.
