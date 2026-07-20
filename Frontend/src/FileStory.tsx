// v0.1.7.0 D2 (B.2): the life of ONE file — the SessionTimeline recipe.
// STATIC snapshot fetched at open (the v0.1.6.0 RV17 rule; close/reopen
// refreshes); rows sorted ts-ASC client-side (the v0.1.6.0 RV7 lesson);
// DATE separators between UTC days (a file's life spans days — day
// boundaries beat gap markers here). Up to 3 pages of 500; a full 3rd page
// adds a truncation note and the header effort reads "(fetched window)"
// (the v0.1.6.0 RV13 rule). The header effort is presentation-only
// arithmetic over the fetched rows — the algorithm home stays in
// Backend/app/db.py (the v0.1.6.0 RV4 mirror contract).

import { useEffect, useRef, useState } from "react";
import { api, TrackedEvent } from "./api";
import { fmtMinutes, fmtTs } from "./format";
import { EFFORT_GAP_MAX_MIN, EFFORT_TAIL_MIN, MODE_BADGE, MODE_COLOR, sessionColor } from "./theme";

const PAGE = 500, MAX_PAGES = 3;

export function FileStory ({ repo, file, repoBranch, onClose }:
  { repo: string; file: string; repoBranch: string | null; onClose: () => void }) {
  const [rows, setRows] = useState<TrackedEvent[] | null>(null);
  const [error, setError] = useState("");
  const [truncated, setTruncated] = useState(false);
  const prevFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const all: TrackedEvent[] = [];
        for (let p = 0; p < MAX_PAGES; p++) {
          const page = await api.events({ repo, file, limit: PAGE, offset: p * PAGE });
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
  }, [repo, file]);

  // Single-overlay rule + Esc + focus restore (the modal-recipe trio).
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
      if (t - prev > gapMs) { total += prev - blockStart + EFFORT_TAIL_MIN * 60_000; blockStart = t; }
      prev = t;
    }
    total += prev - blockStart + EFFORT_TAIL_MIN * 60_000;
    effortMin = Math.round(total / 60_000);
  }
  const commits = rows ? new Set(rows.map((e) => e.commit_hash).filter(Boolean)).size : 0;

  return (
    <div className="fixed inset-0 z-40 bg-slate-950/70 p-4 pt-[8vh]" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="mx-auto flex max-h-[80vh] w-full max-w-2xl flex-col rounded border border-slate-700 bg-slate-900 shadow-xl">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-700 px-4 py-2 text-sm">
          <span className="truncate font-mono font-semibold text-slate-100" title={file}>{file}</span>
          <span className="text-[11px] text-slate-500">{repo}</span>
          {rows && rows.length > 0 && (
            <span className="text-[11px] text-slate-400"
              title="estimated from capture timestamps — 15-min gap rule">
              {rows.length} event{rows.length === 1 ? "" : "s"} · {fmtTs(rows[0].ts)} → {fmtTs(rows[rows.length - 1].ts)}
              · {commits} commit{commits === 1 ? "" : "s"} · {fmtMinutes(effortMin)}
              {truncated ? " (fetched window)" : ""}
            </span>
          )}
          <button className="ml-auto text-slate-400 hover:text-white" onClick={onClose}>✕</button>
        </div>
        <div className="overflow-y-auto p-3 text-xs">
          {error && <p className="text-rose-300">{error}</p>}
          {rows && rows.length === 0 && <p className="text-slate-400">No events for this file.</p>}
          {rows && rows.map((e, i) => {
            const prev = rows[i - 1];
            const dayChanged = !prev || prev.ts.slice(0, 10) !== e.ts.slice(0, 10);
            return (
              <div key={e.id}>
                {dayChanged && (
                  <div className="mt-2 border-l-4 border-teal-600 pl-2 text-[11px] font-semibold text-teal-300">
                    {e.ts.slice(0, 10)} (UTC)
                  </div>
                )}
                <div className="flex items-center gap-2 py-0.5 pl-3">
                  <span className="text-slate-400" title={e.ts}>{fmtTs(e.ts)}</span>
                  <span className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white"
                    style={{ backgroundColor: MODE_COLOR[e.mode] }}>
                    {MODE_BADGE[e.mode].label}
                  </span>
                  {e.task_ref && (
                    <span className="truncate text-[11px] text-sky-300">{e.task_ref.split(" - ").pop()}</span>
                  )}
                  {e.session_id && (
                    <span title={`session ${e.session_id.slice(0, 8)}`}
                      className="inline-block h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: sessionColor(e.session_id) }} />
                  )}
                  {/* the v0.1.6.0 differs-suffix rule: only when BOTH known and differing */}
                  {e.branch && repoBranch && e.branch !== repoBranch && (
                    <span className="text-[11px] text-amber-300/80"
                      title="captured on a different branch than the repo is on now">
                      ⎇ {e.branch}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          {truncated && (
            <p className="mt-2 text-[11px] text-amber-300">
              ⚠ Truncated: only the newest {PAGE * MAX_PAGES} events were fetched — this file had more.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
