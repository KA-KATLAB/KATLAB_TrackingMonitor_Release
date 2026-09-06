import { useEffect, useRef, useState } from "react";
import { api, createActionDeadline, isAbortError } from "./api";
import type { TrackedEvent } from "./api";
import { DialogShell } from "./dialog";
import { fmtMinutes, fmtTs } from "./format";
import {
  EFFORT_GAP_MAX_MIN,
  EFFORT_TAIL_MIN,
  MODE_BADGE,
  MODE_COLOR,
  sessionColor,
} from "./theme";
import { CollectionPager, useBoundedPage } from "./ui";

const API_PAGE = 500;
const MAX_PAGES = 3;

export function SessionTimeline ({
  session,
  onClose,
  onStatus,
}: {
  session: string;
  onClose: () => void;
  onStatus: (message: string) => void;
}): JSX.Element {
  const [rows, setRows] = useState<TrackedEvent[] | null>(null);
  const [error, setError] = useState("");
  const [truncated, setTruncated] = useState(false);
  const [busy, setBusy] = useState(true);
  const [retryNonce, setRetryNonce] = useState(0);
  const retryPendingRef = useRef(false);

  useEffect(() => {
    let alive = true;
    const action = createActionDeadline();
    retryPendingRef.current = false;
    setBusy(true);
    setError("");
    (async () => {
      try {
        const all: TrackedEvent[] = [];
        for (let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex++) {
          const page = await api.events({
            session,
            limit: API_PAGE,
            offset: pageIndex * API_PAGE,
          }, action.signal);
          all.push(...page);
          if (page.length < API_PAGE) {
            if (alive) setTruncated(false);
            break;
          }
          if (pageIndex === MAX_PAGES - 1 && alive) setTruncated(true);
        }
        all.sort((a, b) => a.ts.localeCompare(b.ts));
        if (alive && !action.signal.aborted) {
          setRows(all);
          if (retryNonce > 0) onStatus("Session timeline recovered.");
        }
      } catch (errorValue) {
        if (!alive || (isAbortError(errorValue) && !action.didTimeout())) return;
        const message = action.didTimeout()
          ? "Session timeline timed out after 10 seconds."
          : `Session timeline failed: ${String(errorValue).slice(0, 120)}`;
        setError(message);
        onStatus(`${message} Retry is available.`);
      } finally {
        action.clear();
        if (alive) setBusy(false);
      }
    })();
    return () => {
      alive = false;
      action.controller.abort();
      action.clear();
    };
  }, [onStatus, retryNonce, session]);

  const retry = (): void => {
    if (busy || retryPendingRef.current) return;
    retryPendingRef.current = true;
    setBusy(true);
    setRetryNonce((value) => value + 1);
  };

  const pager = useBoundedPage({
    identity: ["session-timeline", session],
    totalItems: rows?.length ?? 0,
    pageSize: 50,
  });
  const visibleRows = rows?.slice(pager.start, pager.end) ?? [];
  const gapMs = EFFORT_GAP_MAX_MIN * 60_000;
  let effortMin = 0;
  if (rows && rows.length > 0) {
    let total = 0;
    let blockStart = new Date(rows[0].ts).getTime();
    let previous = blockStart;
    for (const event of rows.slice(1)) {
      const timestamp = new Date(event.ts).getTime();
      if (timestamp - previous > gapMs) {
        total += previous - blockStart + EFFORT_TAIL_MIN * 60_000;
        blockStart = timestamp;
      }
      previous = timestamp;
    }
    total += previous - blockStart + EFFORT_TAIL_MIN * 60_000;
    effortMin = Math.round(total / 60_000);
  }

  return (
    <DialogShell
      title={
        <span className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden="true"
            className="h-3 w-3 shrink-0 rounded-full"
            style={{ backgroundColor: sessionColor(session) }}
          />
          <span className="break-all font-mono">session {session.slice(0, 8)}</span>
        </span>
      }
      description={rows
        ? (
          <>
            {rows.length} event{rows.length === 1 ? "" : "s"} · {fmtMinutes(effortMin)}
            {truncated ? " (fetched window)" : ""}
          </>
        )
        : "Cross-repository captured activity"}
      onClose={onClose}
      backdropClose
      closeLabel="Close session timeline"
    >
      <div id="session-timeline-events" className="min-w-0 text-xs">
        {busy && !rows && <p className="text-ui-muted">Loading session timeline…</p>}
        {error && (
          <div className="rounded-control border border-rose-700 bg-rose-950/30 p-3 text-rose-200">
            <p>{error}</p>
            <button type="button" className="ui-control mt-2 bg-ui-raised"
              disabled={busy} aria-busy={busy}
              onClick={retry}>
              Retry
            </button>
          </div>
        )}
        {rows?.length === 0 && <p className="text-ui-muted">No events for this session.</p>}
        {visibleRows.map((event, localIndex) => {
          const absoluteIndex = pager.start + localIndex;
          const previous = rows?.[absoluteIndex - 1];
          const gap = previous
            ? new Date(event.ts).getTime() - new Date(previous.ts).getTime()
            : 0;
          const taskChanged = !previous || previous.task_ref !== event.task_ref;
          const continuation = localIndex === 0 && absoluteIndex > 0 && !taskChanged;
          return (
            <div key={event.id}>
              {previous && gap > gapMs && (
                <div className="my-2 text-center text-xs text-ui-muted">
                  — {fmtMinutes(Math.round(gap / 60_000))} gap —
                </div>
              )}
              {(taskChanged || continuation) && (
                <div className="mt-2 break-words border-l-4 border-sky-600 pl-2 font-mono text-xs text-sky-300">
                  {event.task_ref ?? "(unresolved — pick queue)"}
                  {continuation ? " — continued" : ""}
                </div>
              )}
              <div className="flex min-w-0 flex-wrap items-center gap-2 py-1 pl-3">
                <span className="text-ui-muted" title={event.ts}>{fmtTs(event.ts)}</span>
                <span className="break-all text-ui-muted">{event.repo_id}</span>
                <span
                  className="rounded px-1.5 py-0.5 text-xs font-bold text-white"
                  style={{ backgroundColor: MODE_COLOR[event.mode] }}
                >
                  {MODE_BADGE[event.mode].label}
                </span>
                <span className="min-w-0 break-all font-mono">{event.file}</span>
              </div>
            </div>
          );
        })}
      </div>
      {rows && rows.length > 50 && (
        <CollectionPager
          collectionLabel="Session timeline events"
          controlsId="session-timeline-events"
          page={pager}
          onPageChange={pager.setPage}
          className="mt-3 border-t border-ui-border pt-3"
        />
      )}
      {truncated && (
        <p className="mt-3 text-xs text-amber-300">
          ⚠ Truncated: only the newest {API_PAGE * MAX_PAGES} events were fetched
          — this session had more.
        </p>
      )}
    </DialogShell>
  );
}
