# KATLAB TrackingMonitor v0.4.0.8 - Slow WebSocket Client Isolation

## Fixed

One slow WebSocket client no longer makes the broadcaster wait on network I/O.
Previously it could hold watchers or an API response after persistence. Each
client now has a bounded FIFO and one writer; each endpoint owns and joins its
reader/writer cleanup. Healthy peers can continue receiving independently.

Queue overflow, send timeout or ordinary transport failure retires the affected
client. The endpoint attempts close and ends so the ASGI server can finish cleanup.
Existing browser reconnection triggers authoritative REST synchronization. Frame
types, the shared per-broadcast UUID, JSON shape and text keepalive stay unchanged.

## Boundaries and operation

The queue holds at most 64 messages plus one in-flight send, not a byte or total
memory budget. A burst can evict an otherwise healthy client. Send/close deadlines
(2 seconds/1 second) require cooperative cancellation and a responsive event loop.
An explicit close frame is best effort; enqueue success is not acknowledgement or
delivery. There is no durable replay, missed-effect replay or cross-worker fanout.

No frontend layout, dependency, settings, REST/DB or Git behavior changes. Isolated
actual-source/ASGI tests reproduce the stall and verify recovery; no production
client is intentionally stalled. Native v0.4 acceptance remains pending, separately
from API/asset/Chronicle checks. Existing chunk/dependency notices and the earlier
unconfirmed native launcher-fixture transient are not resolved by this change.

Follow the [safe upgrade procedure](../../Installation_Guideline.md#safe-stop-and-restart)
to rebuild/restart, then reload existing tabs. CDD/CFT, verification and publication
evidence is recorded in `temp/Plan/PLAN_v0.4.0.8_Slow_WebSocket_Client_Isolation.txt`.

Previous [v0.4.0.7 notes](TrackingMonitor_v0.4.0.7_Release_Notes.md)
retain their historical scope, with only move-affected links rebased.
