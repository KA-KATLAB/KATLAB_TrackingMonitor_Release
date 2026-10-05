import { useEffect, useState } from "react";
import type { Repo, TrackedEvent } from "./api";
import type { StatsData } from "./charts";
import { streakOf } from "./calendarHeatmap";
import { DialogShell } from "./dialog";
import { fmtMinutes } from "./format";
import { calendarDayLabel, utcDayKey } from "./calendarDay";
import { GoalRings } from "./goalRings";
import { Pet } from "./pet";
import type { Mood, Wardrobe } from "./pet";
import { Skyline } from "./skyline";
import { MODE_BADGE, MODE_COLOR } from "./theme";
import { CollectionPager, useBoundedPage } from "./ui";

export function FocusMode({
  scope: scopeProp,
  repos,
  events,
  stats,
  mood,
  wardrobe,
  onClose,
}: {
  scope: string | undefined;
  repos: Repo[];
  events: TrackedEvent[];
  stats: StatsData | null;
  mood: Mood;
  wardrobe: Wardrobe;
  onClose: () => void;
}) {
  // Focus mode deliberately snapshots its scope for the lifetime of the dialog.
  const [scope] = useState(scopeProp);
  const [clock, setClock] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const scoped = scope ? repos.filter((repo) => repo.id === scope) : repos;
  const repoPager = useBoundedPage({
    identity: ["focus-repositories", scope ? `repo:${scope}` : "all"],
    totalItems: scoped.length,
    pageSize: 50,
  });
  const visibleScoped = scoped.slice(repoPager.start, repoPager.end);
  const known = scoped.filter((repo) => !repo.offline && repo.status_valid === true);
  const clean = known.filter((repo) => repo.clean).length;
  const one = scope ? scoped[0] : undefined;
  const feed = (scope ? events.filter((event) => event.repo_id === scope) : events).slice(0, 6);
  const lastTimestamp = scoped.reduce<string | null>(
    (latest, repo) =>
      repo.last_event_ts && (!latest || repo.last_event_ts > latest)
        ? repo.last_event_ts
        : latest,
    null,
  );
  const alive =
    lastTimestamp !== null && Date.now() - Date.parse(lastTimestamp) < 5 * 60_000;
  const latestDay = stats?.activity_calendar[stats.activity_calendar.length - 1];
  const dayLabel = calendarDayLabel(latestDay?.day, clock);
  const streak = stats ? streakOf(stats.activity_calendar) : 0;

  return (
    <DialogShell
      title="Focus mode"
      description={scope ?? "All repos"}
      onClose={onClose}
      closeLabel="Exit focus mode"
      headerActions={(
        <span className="font-mono text-sm text-ui-muted sm:text-lg">
          {clock.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      )}
      panelClassName="h-full max-w-none rounded-none border-0 bg-ui-canvas"
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 sm:p-8"
    >
      <div className="flex min-h-full flex-col">
        <div className="flex flex-1 flex-col items-center justify-center gap-6 py-8">
          {one ? (
            one.offline || one.status_valid !== true ? (
              <div className="text-center">
                <p className="text-3xl font-semibold text-ui-muted sm:text-5xl">
                  {one.offline ? "Repository offline" : "Git status unavailable"}
                </p>
                <p className="mt-3 text-sm text-ui-muted">Retained Git values are not current status.</p>
              </div>
            ) : one.clean ? (
              <div className="text-center text-5xl font-bold text-teal-400 sm:text-8xl">
                CLEAN ✓
              </div>
            ) : (
              <div className="text-center text-4xl font-bold text-amber-400 sm:text-7xl">
                {one.count} uncommitted
              </div>
            )
          ) : (
            <>
              <div
                className={`text-center text-5xl font-bold sm:text-8xl ${
                  clean === scoped.length && scoped.length > 0
                    ? "text-teal-400"
                    : "text-ui-text"
                }`}
              >
                {known.length > 0 ? `${clean}/${known.length} clean` : "Git status unavailable"}
              </div>
              <p className="text-center text-sm text-ui-muted">
                {scope && scoped.length === 0 ? "Selected repository is no longer available."
                  : `${known.length} of ${scoped.length} repositories have current Git status.`}
              </p>
              <div className="flex max-w-full flex-wrap justify-center gap-2 text-sm">
                {visibleScoped.map((repo) => (
                  <span
                    key={repo.id}
                    className={`break-all rounded px-2 py-1 ${
                      repo.offline || repo.status_valid !== true
                        ? "bg-slate-800 text-slate-300"
                        : repo.clean
                        ? "bg-teal-900/50 text-teal-300"
                        : "bg-amber-900/40 text-amber-300"
                    }`}
                  >
                    {repo.id} {repo.offline ? "offline" : repo.status_valid !== true
                      ? "status unavailable" : repo.clean ? "clean" : `${repo.count} uncommitted`}
                  </span>
                ))}
                {scoped.length > 50 && (
                  <CollectionPager collectionLabel="Focus repositories" page={repoPager}
                    onPageChange={repoPager.setPage} />
                )}
              </div>
            </>
          )}

          <section className="w-full max-w-xl" aria-labelledby="focus-in-flight">
            <h3
              id="focus-in-flight"
              className="ui-section-title mb-3"
            >
              In flight
            </h3>
            {feed.length === 0 ? (
              <p className="text-sm text-ui-muted">No captured changes in this scope.</p>
            ) : (
              <div className="space-y-1">
                {feed.map((event) => (
                  <div
                    key={event.id}
                    className="ui-work-row flex min-w-0 flex-wrap items-center gap-2 text-base text-ui-text"
                  >
                    <span className="font-mono text-xs text-ui-muted">
                      {new Date(event.ts).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <span className="break-all text-xs text-ui-muted">
                      {event.repo_id}
                    </span>
                    <span className="min-w-0 basis-full break-all font-mono sm:basis-auto sm:flex-1">
                      {event.file}
                    </span>
                    <span
                      className="rounded px-1.5 py-0.5 text-xs font-semibold"
                      style={{ backgroundColor: MODE_COLOR[event.mode], color: MODE_BADGE[event.mode].foreground }}
                      title={MODE_BADGE[event.mode].tip}
                    >
                      {MODE_BADGE[event.mode].label}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {stats && (
            <GoalRings compact scope={scope} calendar={stats.activity_calendar} />
          )}

          <div className="flex flex-wrap items-center justify-center gap-3">
            <Pet mood={mood} big wardrobe={wardrobe} />
            <div className="flex min-w-0 items-center gap-2 text-sm text-ui-muted">
              {alive && (
                <span className="pulse-dot inline-block h-2 w-2 shrink-0 rounded-full bg-teal-400" />
              )}
              <span className="break-words">
                {!latestDay ? "Effort unavailable (UTC)"
                  : latestDay.minutes > 0 ? `${fmtMinutes(latestDay.minutes)} ${dayLabel}`
                  : latestDay.day === utcDayKey(clock) ? "quiet so far today (UTC)"
                  : `no effort recorded for ${dayLabel}`}
                {streak >= 2 && ` · 🔥 ${streak}-day streak`}
              </span>
            </div>
          </div>
        </div>

        {stats && (
          <div className="flex shrink-0 justify-center overflow-hidden opacity-70">
            <Skyline calendar={stats.activity_calendar} />
          </div>
        )}
      </div>
    </DialogShell>
  );
}
