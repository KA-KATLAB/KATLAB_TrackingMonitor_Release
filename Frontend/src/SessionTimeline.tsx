// v0.1.6.0 D3 (C.3): the story of ONE session — cross-repo chronological
// timeline, replay-lite. STATIC snapshot fetched at open (no live WS append;
// close/reopen refreshes — RV17). The API pages NEWEST-first, so rows are
// sorted ts-ASC client-side BEFORE gap markers / task separators are
// computed (RV7). Up to 3 pages of 500; a full 3rd page adds a truncation
// note and the header effort is labelled "(fetched window)" (RV13). The
// header effort sum is presentation-only arithmetic over the fetched rows —
// the algorithm home stays in Backend/app/db.py (RV4 mirror contract).

import { useEffect, useRef, useState } from "react";
import { api, TrackedEvent } from "./api";
import { fmtMinutes, fmtTs } from "./format";
import { EFFORT_GAP_MAX_MIN, EFFORT_TAIL_MIN, MODE_BADGE, MODE_COLOR, sessionColor } from "./theme";

const PAGE = 500, MAX_PAGES = 3;

export function SessionTimeline ({ session, onClose }:
  { session: string; onClose: () => void }) {
  const [rows, setRows] = useState<TrackedEvent[] | null>(null);
  const [error, setError] = useState("");
  const [truncated, setTruncated] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const prevFocus = useRef<HTMLElement | null>(null);

  // Static snapshot at open (RV17); ts-ASC sort before render (RV7).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const all: TrackedEvent[] = [];
        for (let p = 0; p < MAX_PAGES; p++) {
          const page = await api.events({ session, limit: PAGE, offset: p * PAGE });
          all.push(...page);
          if (page.length < PAGE) { if (alive) setTruncated(false); break; }
          if (p === MAX_PAGES - 1 && alive) setTruncated(true);
        }
        all.sort((a, b) => a.ts.localeCompare(b.ts));
        if (alive) setRows(all);
      } catch (exc) {
        if (alive) setError(String(exc));
      }
    })();
    return () => { alive = false; };
  }, [session]);

  // Single-overlay rule (suppresses Ctrl+K) + Esc close + focus restore.
  useEffect(() => {
    prevFocus.current = document.activeElement as HTMLElement | null;
    document.body.dataset.overlayOpen = "1";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => {
      delete document.body.dataset.overlayOpen;
      window.removeEventListener("keydown", onKey);
      prevFocus.current?.focus?.();
    };
  }, [onClose]);

  // Presentation-only effort over the fetched rows (mirrored constants).
  const gapMs = EFFORT_GAP_MAX_MIN * 60_000;
  let effortMin = 0;
  if (rows && rows.length > 0) {
    let total = 0, blockStart = new Date(rows[0].ts).getTime(), prev = blockStart;
    for (const e of rows.slice(1)) {
      const t = new Date(e.ts).getTime();
      if (t - prev > gapMs) { total += prev - blockStart; total += EFFORT_TAIL_MIN * 60_000; blockStart = t; }
      prev = t;
    }
    total += prev - blockStart + EFFORT_TAIL_MIN * 60_000;
    effortMin = Math.round(total / 60_000);
  }

  return (
    <div className="fixed inset-0 z-40 bg-slate-950/70 p-4 pt-[8vh]" onClick={onClose}>
      <div ref={wrapRef} onClick={(e) => e.stopPropagation()}
        className="mx-auto flex max-h-[80vh] w-full max-w-2xl flex-col rounded border border-slate-700 bg-slate-900 shadow-xl">
        <div className="flex items-center gap-2 border-b border-slate-700 px-4 py-2 text-sm">
          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: sessionColor(session) }} />
          <span className="font-mono font-semibold text-slate-100">session {session.slice(0, 8)}</span>
          {rows && (
            <span className="text-[11px] text-slate-400"
              title="estimated from capture timestamps — 15-min gap rule">
              {rows.length} event{rows.length === 1 ? "" : "s"} · {fmtMinutes(effortMin)}
              {truncated ? " (fetched window)" : ""}
            </span>
          )}
          <button className="ml-auto text-slate-400 hover:text-white" onClick={onClose}>✕</button>
        </div>
        <div className="overflow-y-auto p-3 text-xs">
          {error && <p className="text-rose-300">{error}</p>}
          {rows && rows.length === 0 && <p className="text-slate-400">No events for this session.</p>}
          {rows && rows.map((e, i) => {
            const prev = rows[i - 1];
            const gap = prev ? new Date(e.ts).getTime() - new Date(prev.ts).getTime() : 0;
            const taskChanged = prev !== undefined && prev.task_ref !== e.task_ref;
            return (
              <div key={e.id}>
                {prev && gap > gapMs && (
                  <div className="my-2 text-center text-[11px] text-slate-500">
                    — {fmtMinutes(Math.round(gap / 60_000))} gap —
                  </div>
                )}
                {(i === 0 || taskChanged) && (
                  <div className="mt-2 border-l-4 border-sky-600 pl-2 font-mono text-[11px] text-sky-300">
                    {e.task_ref ?? "(unresolved — pick queue)"}
                  </div>
                )}
                <div className="flex items-center gap-2 py-0.5 pl-3">
                  <span className="text-slate-400" title={e.ts}>{fmtTs(e.ts)}</span>
                  <span className="text-[11px] text-slate-500">{e.repo_id}</span>
                  <span className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white"
                    style={{ backgroundColor: MODE_COLOR[e.mode] }}>
                    {MODE_BADGE[e.mode].label}
                  </span>
                  <span className="truncate font-mono">{e.file}</span>
                </div>
              </div>
            );
          })}
          {truncated && (
            <p className="mt-2 text-[11px] text-amber-300">
              ⚠ Truncated: only the newest {PAGE * MAX_PAGES} events were fetched — this session had more.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
