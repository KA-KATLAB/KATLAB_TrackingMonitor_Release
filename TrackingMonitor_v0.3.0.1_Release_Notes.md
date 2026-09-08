# KATLAB TrackingMonitor v0.3.0.1 — "System Health Version-Skew Hotfix"

This patch fixes a critical blank-page failure when the `sys` button is opened
during a live frontend/backend version mismatch.

## Fixed

- An existing v0.2.12 server can keep serving static files while a v0.3 frontend
  build replaces `Frontend/dist`. Its valid health response has `server` and
  `repos`, but predates the v0.3 `activity` and `providers` additions.
- The v0.3.0 frontend treated those additive fields as immediately mandatory and
  dereferenced them during dialog rendering. The uncaught React error removed the
  application UI.
- The client now treats only those two rollout additions as optional. System
  health preserves Server and Repositories, labels unavailable extensions, and
  tells the operator to restart TrackingMonitor. It never substitutes misleading
  zero counters or an empty provider list.
- Matched v0.3 behavior is unchanged. Partial extension responses keep the
  available section, and a valid empty provider array has an explicit empty state.

## Scope

- Frontend compatibility guard and patch-version/release documentation only.
- No endpoint, schema, database, capture, readiness, hook, watcher, WebSocket,
  Git, dependency, service-worker, storage, polling, or monitored-repository
  behavior changed.

## Activation

Run `Scripts/restart_tracking_monitor.bat` after installing the patch. The normal
start script intentionally does not replace an already-running listener.

## Verification scope

Release acceptance covers the exact old-backend/new-frontend reproduction, the
matched v0.3.0.1 path, dialog close/focus recovery, narrow/desktop containment,
the production frontend build, the full committed Python suite and compilation,
and source/document consistency checks. Exact executed evidence is retained in
the v0.3.0.1 detailed plan.

## Rollback

Restore the v0.3.0.0 frontend sources and version documentation, rebuild the
frontend, and restart TrackingMonitor. Preserve runtime databases, inbox files,
and provider settings; this patch changes none of them.
