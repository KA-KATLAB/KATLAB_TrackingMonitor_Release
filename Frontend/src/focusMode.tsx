// v0.1.10.0 D3 (C.1): ambient focus mode — the wall display. Frontend-only,
// zero fetches: renders state App already holds live via WS. Six elements
// (the ambient-north-star pattern): giant status hero, minute clock, the
// "in flight" feed (newest 6 UNCOMMITTED events of the snapshot scope —
// RV1/RV8: App.events IS the uncommitted pool, so a commit drains it to
// "All clear ✨"), session pulse, today/streak line, Skyline strip.
// Scope SNAPSHOT at mount (RV3); focus TRAPPED on ✕ (RV6 — the only stop);
// the open effect = the GraphShell recipe (RV5: Esc listener + body flag,
// BOTH cleaned in the teardown) + focus restore on exit. Esc/✕ exit ONLY —
// deliberately NO click-out (a wall must not die to a stray click).

import { useEffect, useRef, useState } from "react";
import { Repo, TrackedEvent } from "./api";
import { StatsData } from "./charts";
import { Skyline } from "./skyline";
import { streakOf } from "./calendarHeatmap";
import { fmtMinutes } from "./format";
import { MODE_BADGE, MODE_COLOR } from "./theme";

export function FocusMode ({ scope: scopeProp, repos, events, stats, onClose }: {
  scope: string | undefined; // undefined = ALL
  repos: Repo[];
  events: TrackedEvent[];    // the uncommitted pool (RV1)
  stats: StatsData | null;
  onClose: () => void;       // STABLE identity (the v0.1.7.0 CFT-3 rule)
}) {
  // RV3: scope fixed while open — init-once snapshot at mount.
  const [scope] = useState(scopeProp);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const [clock, setClock] = useState(() => new Date());

  // RV5: the GraphShell recipe — listener + overlay flag set while open,
  // BOTH cleaned in the teardown (exit AND unmount). RV6: focus trap —
  // ✕ is the only stop, Tab cycles in place. Restore on exit.
  useEffect(() => {
    document.body.dataset.overlayOpen = "1";
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") { e.preventDefault(); closeRef.current?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      delete document.body.dataset.overlayOpen;
      window.removeEventListener("keydown", onKey);
      prev?.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Kiosk clock — minute precision, own interval, cleaned on unmount.
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const scoped = scope ? repos.filter((r) => r.id === scope) : repos;
  const clean = scoped.filter((r) => r.clean).length;
  const one = scope ? scoped[0] : undefined;
  // RV8: the feed matches the hero's scope (all repos on ALL).
  const feed = (scope ? events.filter((e) => e.repo_id === scope) : events)
    .slice(0, 6);
  const lastTs = scoped.reduce<string | null>((acc, r) =>
    r.last_event_ts && (!acc || r.last_event_ts > acc) ? r.last_event_ts : acc,
    null);
  const alive = lastTs !== null && Date.now() - Date.parse(lastTs) < 5 * 60_000;
  const todayMin =
    stats?.activity_calendar[stats.activity_calendar.length - 1]?.minutes ?? 0;
  const streak = stats ? streakOf(stats.activity_calendar) : 0;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 p-8"
      role="dialog" aria-label="focus mode">
      <div className="flex items-center text-sm text-slate-400">
        <span>{scope ?? "ALL repos"}</span>
        <span className="mx-auto font-mono text-lg text-slate-300">
          {clock.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
        <button ref={closeRef} onClick={onClose} aria-label="exit focus mode"
          className="rounded bg-slate-800 px-3 py-1 text-xs hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">
          ✕
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-6">
        {one ? (
          one.clean ? (
            <div className="text-8xl font-bold text-teal-400">CLEAN ✓</div>
          ) : (
            <div className="text-7xl font-bold text-amber-400">
              {one.count} uncommitted
            </div>
          )
        ) : (
          <>
            <div className={`text-8xl font-bold ${clean === scoped.length && scoped.length > 0 ? "text-teal-400" : "text-slate-200"}`}>
              {clean}/{scoped.length} clean
            </div>
            <div className="flex flex-wrap justify-center gap-2 text-sm">
              {scoped.map((r) => (
                <span key={r.id}
                  className={`rounded px-2 py-0.5 ${r.clean ? "bg-teal-900/50 text-teal-300" : "bg-amber-900/40 text-amber-300"}`}>
                  {r.id} {r.clean ? "✓" : r.count}
                </span>
              ))}
            </div>
          </>
        )}

        <div className="w-full max-w-xl">
          <div className="mb-1 text-[11px] uppercase tracking-wide text-slate-500">
            in flight
          </div>
          {feed.length === 0 ? (
            <p className="text-sm text-slate-400">All clear ✨</p>
          ) : (
            <div className="space-y-1">
              {feed.map((e) => (
                <div key={e.id} className="flex items-center gap-2 text-sm text-slate-300">
                  <span className="font-mono text-[11px] text-slate-500">
                    {new Date(e.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span className="text-slate-400">{e.repo_id}</span>
                  <span className="truncate font-mono text-[12px]">
                    {e.file.split("/").pop()}
                  </span>
                  <span className="ml-auto rounded px-1 text-[10px] font-semibold text-white"
                    style={{ backgroundColor: MODE_COLOR[e.mode] }}
                    title={MODE_BADGE[e.mode].tip}>
                    {MODE_BADGE[e.mode].label}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 text-sm text-slate-400">
          {alive && <span className="pulse-dot inline-block h-2 w-2 rounded-full bg-teal-400" />}
          <span>
            {todayMin > 0 ? `${fmtMinutes(todayMin)} today (UTC)` : "quiet so far today"}
            {streak >= 2 && ` · 🔥 ${streak}-day streak`}
          </span>
        </div>
      </div>

      {stats && (
        <div className="flex justify-center overflow-hidden opacity-70">
          <Skyline calendar={stats.activity_calendar} />
        </div>
      )}
    </div>
  );
}
