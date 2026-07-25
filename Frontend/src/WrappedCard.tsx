// v0.1.8.0 D3 (C.1): "your week" — the wrapped story modal. STATIC BY
// MECHANISM (RV22): wrapped + tasks + streak are copied into init-once
// state at MOUNT — a prop-fed modal would re-render the story mid-open on
// every WS sync; close/reopen refreshes (the v0.1.6.0 RV17 semantic).
// The top-task TITLE resolves CLIENT-side from the snapshotted tasks via
// the house repo|task_ref lookup (RV11; short-ref fallback when the task
// no longer exists); the busiest-hour day label comes from the EXPORTED
// punchCard DAYS (RV5); the streak from the imported streakOf (one home).
// Overlay recipe trio: Esc / click-out / data-overlay-open / focus
// restore; z-40; onClose is CFT-3-v0.1.7.0-stable at the App call site.

import { useEffect, useRef, useState } from "react";
import { Task } from "./api";
import { StatsData } from "./charts";
import { streakOf } from "./calendarHeatmap";
import { DAYS } from "./punchCard";
import { fmtMinutes } from "./format";

export function WrappedCard ({ stats, tasks, onClose }:
  { stats: StatsData; tasks: Task[]; onClose: () => void }) {
  // RV22: never re-read from props after mount.
  const [snap] = useState(() => ({
    wrapped: stats.wrapped,
    streak: streakOf(stats.activity_calendar),
    tasks,
  }));
  const prevFocus = useRef<HTMLElement | null>(null);

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

  const w = snap.wrapped;
  const empty = w.days.every((d) => d.events === 0);
  const maxDay = Math.max(1, ...w.days.map((d) => d.events));
  const top = w.top_task;
  const title = top
    ? snap.tasks.find((t) => t.repo === top.repo && t.task_ref === top.task_ref)?.title
      ?? top.task_ref.split(" - ").pop()
    : null;

  return (
    <div className="fixed inset-0 z-40 bg-slate-950/70 p-4 pt-[10vh]" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="mx-auto flex max-h-[76vh] w-full max-w-lg flex-col rounded border border-slate-700 bg-slate-900 shadow-xl">
        <div className="flex items-center gap-2 border-b border-slate-700 px-4 py-2 text-sm">
          <span className="font-semibold text-slate-100">Your week ✨</span>
          <span className="text-[11px] text-slate-500">last 7 days (UTC)</span>
          <button className="ml-auto text-slate-400 hover:text-white" onClick={onClose}>✕</button>
        </div>
        <div className="space-y-4 overflow-y-auto p-4 text-sm">
          {empty && (
            <p className="text-slate-400">A quiet week — nothing captured.</p>
          )}
          {!empty && (
            <>
              <div className="flex items-end gap-1.5" aria-label="events per day, last 7 UTC days">
                {w.days.map((d) => (
                  <div key={d.day} className="flex flex-1 flex-col items-center gap-1">
                    <span className="text-[10px] text-slate-400">{d.events}</span>
                    {/* CFT-2: the tooltip is the HTML title ATTRIBUTE — an
                        SVG-style <title> CHILD is inert inside a div */}
                    <div className="w-full rounded-t bg-teal-600"
                      style={{ height: `${4 + (d.events / maxDay) * 56}px` }}
                      title={`${d.day} (UTC) — ${d.events} events${d.minutes > 0 ? ` · ${fmtMinutes(d.minutes)}` : ""}`} />
                    <span className="text-[9px] text-slate-500">{d.day.slice(5)}</span>
                  </div>
                ))}
              </div>
              {top && (
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">Top task</div>
                  <div className="font-semibold text-sky-300">{title}</div>
                  <div className="text-xs text-slate-400"
                    title="estimated from capture timestamps — 15-min gap rule">
                    {top.repo} · {fmtMinutes(top.minutes)} · {top.sessions} session{top.sessions === 1 ? "" : "s"}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded border border-slate-700 bg-slate-800/60 p-2">
                  <div className="text-xl font-bold text-slate-100">{w.files_touched}</div>
                  <div className="text-[10px] text-slate-400">files touched</div>
                </div>
                <div className="rounded border border-slate-700 bg-slate-800/60 p-2">
                  <div className="text-xl font-bold text-slate-100">{w.commits}</div>
                  <div className="text-[10px] text-slate-400">commits</div>
                </div>
                <div className="rounded border border-slate-700 bg-slate-800/60 p-2">
                  <div className="text-xl font-bold text-amber-300">
                    {snap.streak >= 2 ? `🔥 ${snap.streak}` : "—"}
                  </div>
                  <div className="text-[10px] text-slate-400"
                    title="consecutive UTC days with captured activity">
                    day streak
                  </div>
                </div>
              </div>
              {w.busiest_hour && (
                <div className="text-xs text-slate-300">
                  <span className="text-slate-500">Busiest hour: </span>
                  <span className="font-semibold">
                    {DAYS[w.busiest_hour.dow]} {String(w.busiest_hour.hour).padStart(2, "0")}:00
                  </span>
                  <span className="text-slate-500"> (local time) — {w.busiest_hour.events} events</span>
                </div>
              )}
              {w.top_pair && (
                <div className="text-xs text-slate-300">
                  <span className="text-slate-500">Pair of the week: </span>
                  <span className="font-mono">{w.top_pair.file_a}</span>
                  <span className="text-slate-500"> ↔ </span>
                  <span className="font-mono">{w.top_pair.file_b}</span>
                  <span className="text-slate-500"> — together in {w.top_pair.shared} task{w.top_pair.shared === 1 ? "" : "s"} ({w.top_pair.repo})</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
