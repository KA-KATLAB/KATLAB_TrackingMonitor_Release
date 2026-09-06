import { useState } from "react";
import type { Task } from "./api";
import type { StatsData } from "./charts";
import { streakOf } from "./calendarHeatmap";
import { DialogShell } from "./dialog";
import { fmtMinutes } from "./format";
import { DAYS } from "./punchCard";
import { DisclosureTable } from "./accessibleData";

export function WrappedCard ({
  stats,
  tasks,
  onClose,
}: {
  stats: StatsData;
  tasks: Task[];
  onClose: () => void;
}): JSX.Element {
  // The story is a static snapshot. Close/reopen is its explicit refresh.
  const [snapshot] = useState(() => ({
    wrapped: stats.wrapped,
    streak: streakOf(stats.activity_calendar),
    tasks,
  }));
  const wrapped = snapshot.wrapped;
  const empty = wrapped.days.every((day) => day.events === 0);
  const maxDay = Math.max(1, ...wrapped.days.map((day) => day.events));
  const top = wrapped.top_task;
  const topTitle = top
    ? snapshot.tasks.find(
      (task) => task.repo === top.repo && task.task_ref === top.task_ref,
    )?.title ?? top.task_ref.split(" - ").pop()
    : null;

  return (
    <DialogShell
      title="Your week ✨"
      description="Last 7 days (UTC), captured when this dialog opened."
      onClose={onClose}
      backdropClose
      closeLabel="Close weekly wrapped"
      panelClassName="max-w-lg"
    >
      <div className="space-y-4 text-sm">
        {empty && <p className="text-ui-muted">A quiet week — nothing captured.</p>}
        {!empty && (
          <>
            <figure>
              <figcaption className="sr-only">Events per day, last 7 UTC days</figcaption>
              <div className="flex min-w-0 items-end gap-1.5" aria-hidden="true">
                {wrapped.days.map((day) => (
                  <div key={day.day} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                    <span className="text-xs text-ui-muted">{day.events}</span>
                    <div
                      className="w-full rounded-t bg-teal-600"
                      style={{ height: 4 + (day.events / maxDay) * 56 + "px" }}
                      title={
                        day.day + " (UTC) — " + day.events + " events"
                        + (day.minutes > 0 ? " · " + fmtMinutes(day.minutes) : "")
                      }
                    />
                    <span className="text-xs text-ui-muted">{day.day.slice(5)}</span>
                  </div>
                ))}
              </div>
            </figure>
            <DisclosureTable
              label="Weekly activity"
              summary={`${wrapped.days.reduce((sum, day) => sum + day.events, 0).toLocaleString("en-US")} `
                + "events across the last seven UTC days."}
              rows={wrapped.days}
              rowKey={(day) => day.day}
              identity={["weekly-wrapped-days", ...wrapped.days.map((day) => day.day)]}
              columns={[
                { key: "day", label: "UTC day", render: (day) => day.day },
                { key: "events", label: "Events", render: (day) => day.events,
                  cellClassName: "text-right tabular-nums", headerClassName: "text-right" },
                { key: "effort", label: "Effort", render: (day) => fmtMinutes(day.minutes),
                  cellClassName: "text-right tabular-nums", headerClassName: "text-right" },
              ]}
            />
            {top && (
              <div>
                <div className="text-xs uppercase tracking-wide text-ui-muted">Top task</div>
                <div className="break-words font-semibold text-sky-300">{topTitle}</div>
                <div
                  className="break-words text-xs text-ui-muted"
                  title="estimated from capture timestamps — 15-min gap rule"
                >
                  {top.repo} · {fmtMinutes(top.minutes)} · {top.sessions} session
                  {top.sessions === 1 ? "" : "s"}
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 gap-3 text-center sm:grid-cols-3">
              <div className="rounded-panel border border-ui-border bg-ui-raised/60 p-2">
                <div className="text-xl font-bold tabular-nums text-ui-text">
                  {wrapped.files_touched}
                </div>
                <div className="text-xs text-ui-muted">files touched</div>
              </div>
              <div className="rounded-panel border border-ui-border bg-ui-raised/60 p-2">
                <div className="text-xl font-bold tabular-nums text-ui-text">
                  {wrapped.commits}
                </div>
                <div className="text-xs text-ui-muted">commits</div>
              </div>
              <div className="rounded-panel border border-ui-border bg-ui-raised/60 p-2">
                <div className="text-xl font-bold tabular-nums text-amber-300">
                  {snapshot.streak >= 2 ? "🔥 " + snapshot.streak : "—"}
                </div>
                <div
                  className="text-xs text-ui-muted"
                  title="consecutive UTC days with captured activity"
                >
                  day streak
                </div>
              </div>
            </div>
            {wrapped.busiest_hour && (
              <div className="break-words text-xs text-slate-300">
                <span className="text-ui-muted">Busiest hour: </span>
                <span className="font-semibold">
                  {DAYS[wrapped.busiest_hour.dow]}{" "}
                  {String(wrapped.busiest_hour.hour).padStart(2, "0")}:00
                </span>
                <span className="text-ui-muted">
                  {" "}(local time) — {wrapped.busiest_hour.events} events
                </span>
              </div>
            )}
            {wrapped.top_pair && (
              <div className="break-words text-xs text-slate-300">
                <span className="text-ui-muted">Pair of the week: </span>
                <span className="break-all font-mono">{wrapped.top_pair.file_a}</span>
                <span className="text-ui-muted"> ↔ </span>
                <span className="break-all font-mono">{wrapped.top_pair.file_b}</span>
                <span className="text-ui-muted">
                  {" "}— together in {wrapped.top_pair.shared} task
                  {wrapped.top_pair.shared === 1 ? "" : "s"} ({wrapped.top_pair.repo})
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </DialogShell>
  );
}
