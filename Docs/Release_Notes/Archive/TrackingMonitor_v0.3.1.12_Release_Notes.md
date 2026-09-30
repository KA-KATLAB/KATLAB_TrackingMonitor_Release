# KATLAB TrackingMonitor v0.3.1.12 — Day Lanes DST Replay

Day Lanes now uses each local day's actual elapsed duration for sparse
positions and replay, including short and long daylight-saving days.

## Changed

- Variable-day axes show bounded elapsed-time ticks with numeric UTC offsets.
  Repeated local times remain distinguishable in event, block and replay labels.
- Replay seek/end and Play again reach every fetched event. The 1x speed still
  traverses the selected day in 30 seconds, with the existing frame-delta cap.
- Visual block tails clip at the day boundary without changing approximate
  effort calculations. The ordinary 24-hour day keeps its familiar axis.
- Density remains 48 wall-time half-hour bins and the standard clock remains
  24 hourly wedges; a short note explains their different time projection.
- API, capture, bounded fetching, ownership, storage and dependencies are
  unchanged.

## Limits

- A repeated hour combines into the same wall-time density bin even though
  sparse positions and replay distinguish its two instants. Time-zone rules
  come from the runtime; historical second-level accuracy is not promised.
- Captured offset-paged rows are not complete or snapshot-consistent history.
  Controlled helper/TZ/static tests do not replace real browser replay,
  keyboard, assistive-technology or viewport verification.
