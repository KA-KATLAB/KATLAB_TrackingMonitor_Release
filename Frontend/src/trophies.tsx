// v0.1.9.0 D2 (C.1): trophy case — ranked achievements computed FRONTEND-
// ONLY from stats/tasks the tracker already serves. Rank = thresholds
// crossed (>= semantics): 0 -> "—", 1..6 -> C, B, A, S, SS, SSS. Secrets
// render "???" until their condition holds (data-derived, no persistence;
// window-based trophies decay honestly as data ages out of the 365 days).

import { StatsData } from "./charts";
import { Task } from "./api";

const RANKS = ["C", "B", "A", "S", "SS", "SSS"] as const;
// slate-500 / sky-600 / teal-500 / amber-400 / purple-500 / rose-500
const RANK_COLOR = ["#64748b", "#0284c7", "#14b8a6", "#fbbf24", "#a855f7", "#f43f5e"];
const UNRANKED_BG = "#334155"; // slate-700

interface TrophyDef {
  id: string;
  emoji: string;
  title: string;
  basis: string; // honest per-tile basis label, incl. the time-window marker
  thresholds: number[];
  value: (s: StatsData, tasks: Task[]) => number;
}

interface SecretDef {
  id: string;
  emoji: string;
  title: string;
  story: string;
  unlocked: (s: StatsData) => boolean;
}

// Longest run of events>0 days in the calendar window — a DIFFERENT stat
// from the exported streakOf (the CURRENT streak, which keeps its one home).
function longestStreak (calendar: StatsData["activity_calendar"]): number {
  let best = 0, run = 0;
  for (const d of calendar) {
    run = d.events > 0 ? run + 1 : 0;
    if (run > best) best = run;
  }
  return best;
}

const TROPHIES: TrophyDef[] = [
  { id: "collector", emoji: "📦", title: "Collector",
    basis: "captured events (all-time)",
    thresholds: [50, 250, 1000, 5000, 20000, 50000],
    value: (s) => Object.values(s.mode_counts).reduce((a, b) => a + b, 0) },
  { id: "streak", emoji: "🔥", title: "Streak Keeper",
    basis: "longest run of active days (365d, UTC)",
    thresholds: [2, 5, 10, 20, 35, 60],
    value: (s) => longestStreak(s.activity_calendar) },
  { id: "shipper", emoji: "🚢", title: "Shipper",
    basis: "commits (365d, UTC)",
    thresholds: [5, 25, 100, 300, 800, 2000],
    value: (s) => s.activity_calendar.reduce((a, d) => a + d.commits, 0) },
  { id: "night-owl", emoji: "🦉", title: "Night Owl",
    basis: "events 00:00–05:59 (all-time, local time)",
    thresholds: [10, 50, 200, 600, 1500, 4000],
    value: (s) => s.punch_card.reduce(
      (a, row) => a + row.slice(0, 6).reduce((x, y) => x + y, 0), 0) },
  { id: "weekend", emoji: "⚔️", title: "Weekend Warrior",
    basis: "Sat+Sun events (all-time, local time)",
    thresholds: [25, 100, 400, 1200, 3000, 8000],
    value: (s) =>
      [...(s.punch_card[0] ?? []), ...(s.punch_card[6] ?? [])].reduce((a, b) => a + b, 0) },
  { id: "marathoner", emoji: "🏃", title: "Marathoner",
    basis: "max single-day effort minutes (365d, UTC)",
    thresholds: [60, 120, 240, 420, 600, 900],
    value: (s) => Math.max(0, ...s.activity_calendar.map((d) => d.minutes)) },
  { id: "finisher", emoji: "✅", title: "Finisher",
    basis: "tasks done (live plans)",
    thresholds: [5, 15, 40, 100, 250, 600],
    value: (_s, tasks) => tasks.filter((t) => t.status === "done").length },
];

const SECRETS: SecretDef[] = [
  { id: "century", emoji: "💯", title: "Century Day",
    story: "a single day with 100+ captured events",
    unlocked: (s) => s.activity_calendar.some((d) => d.events >= 100) },
  { id: "six-of-six", emoji: "🎭", title: "Six of Six",
    story: "every attribution mode seen — including your own picks",
    unlocked: (s) => Object.values(s.mode_counts).every((n) => n > 0) },
];

const fmt = (n: number) => n.toLocaleString("en-US");

export function TrophyCase ({ stats, tasks, scope }: {
  stats: StatsData;
  tasks: Task[];
  scope: string | undefined; // undefined = ALL (stats arrive server-scoped)
}) {
  const scoped = scope ? tasks.filter((t) => t.repo === scope) : tasks;
  return (
    <div data-reveal className="mt-4 rounded border border-slate-700 bg-slate-900 p-3">
      <div className="mb-2 text-xs font-semibold text-slate-300">
        Trophy case — {scope ?? "ALL repos"}
      </div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {TROPHIES.map((t) => {
          const v = t.value(stats, scoped);
          const crossed = t.thresholds.filter((th) => v >= th).length;
          const rank = crossed === 0 ? "—" : RANKS[crossed - 1];
          const color = crossed === 0 ? UNRANKED_BG : RANK_COLOR[crossed - 1];
          const next = crossed < t.thresholds.length ? t.thresholds[crossed] : null;
          const pct = next === null ? 100 : Math.min(100, Math.round((v / next) * 100));
          return (
            <div key={t.id} className="rounded bg-slate-800/60 p-2"
              title={`${t.basis}: ${fmt(v)}${next !== null ? ` · next rank at ${fmt(next)}` : " · max rank"}`}>
              <div className="flex items-center gap-1.5 text-xs">
                <span aria-hidden="true">{t.emoji}</span>
                <span className="truncate text-slate-200">{t.title}</span>
                <span className="ml-auto rounded px-1 text-[10px] font-bold"
                  style={{ backgroundColor: color,
                    color: crossed === 0 ? "#cbd5e1" : "#0f172a" }}>
                  {rank}
                </span>
              </div>
              <div className="mt-1 text-[11px] text-slate-400">{fmt(v)}</div>
              <div className="mt-1 h-1 rounded bg-slate-700">
                <div className="h-1 rounded"
                  style={{ width: `${pct}%`, backgroundColor: color, opacity: 0.85 }} />
              </div>
            </div>
          );
        })}
        {SECRETS.map((sec) => {
          const un = sec.unlocked(stats);
          return (
            <div key={sec.id} className="rounded bg-slate-800/60 p-2"
              title={un ? sec.story : "secret trophy — keep working to discover"}>
              <div className="flex items-center gap-1.5 text-xs">
                <span aria-hidden="true">{un ? sec.emoji : "🔒"}</span>
                <span className={un ? "text-slate-200" : "text-slate-500"}>
                  {un ? sec.title : "???"}
                </span>
                <span className="ml-auto rounded px-1 text-[10px] font-bold"
                  style={{ backgroundColor: un ? "#f43f5e" : UNRANKED_BG,
                    color: un ? "#0f172a" : "#cbd5e1" }}>
                  {un ? "SECRET" : "?"}
                </span>
              </div>
              <div className="mt-1 text-[11px] text-slate-400">
                {un ? sec.story : "keep working to discover"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
