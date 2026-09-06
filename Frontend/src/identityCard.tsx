// v0.1.10.0 D1 (B.1): repo identity card — a pure-SVG stroke-dasharray
// donut of the top-8 extensions (no Chart.js: static identity, not a live
// chart) + a facts line. Colors are a module-private categorical palette
// assigned by RANK (decorative categories, never MODE_COLOR — the
// DIAGRAM-vs-mode separation precedent); the "other" remainder is always
// slate. Empty state (RV4): ext_total === 0 swaps the DONUT AREA only —
// the facts line stays (real data even when every capture is an excluded
// plan edit).

import type { StatsData } from "./charts";
import { fmtMinutes, fmtTs } from "./format";
import { buildIdentityData } from "./identityData";
import { SectionHeading } from "./ui";

const R = 42, C = 2 * Math.PI * R; // donut radius / circumference
const fmt = (n: number) => n.toLocaleString("en-US");

export function IdentityCard ({ identity, calendar, scope }: {
  identity: StatsData["identity"];
  calendar: StatsData["activity_calendar"];
  scope: string | undefined; // undefined = ALL (stats arrive server-scoped)
}) {
  const data = buildIdentityData(identity);
  const { slices, total: ext_total } = data;
  let acc = 0; // running offset for the dasharray segments
  const effort = calendar.reduce((a, d) => a + d.minutes, 0);
  return (
    <div>
      <SectionHeading level={4} title="Repo identity"
        description={scope ?? "All repos"} />
      {ext_total === 0 ? (
        <p className="py-6 text-sm text-slate-400">No captures classified yet.</p>
      ) : (
        <figure>
          <figcaption className="mb-2 text-[11px] text-slate-400">
            File type distribution — {data.presentation === "bar" ? "horizontal bars" : "donut"}
          </figcaption>
          <div className={data.presentation === "bar"
            ? "space-y-1.5"
            : "flex min-w-0 flex-wrap items-center gap-4"}>
            {data.presentation === "donut" && (
              <svg width={110} height={110} viewBox="0 0 110 110"
                aria-hidden="true" focusable="false">
                {slices.map((slice) => {
                  const len = (slice.count / ext_total) * C;
                  const segment = (
                    <circle key={slice.key} cx={55} cy={55} r={R} fill="none"
                      stroke={slice.color} strokeWidth={16}
                      strokeDasharray={`${len} ${C - len}`}
                      strokeDashoffset={-acc}
                      transform="rotate(-90 55 55)" />
                  );
                  acc += len;
                  return segment;
                })}
              </svg>
            )}
            {data.presentation === "bar" && (
              <div className="space-y-1" aria-hidden="true">
                {slices.map((slice) => (
                  <div key={slice.key} className="h-2 overflow-hidden rounded bg-slate-800">
                    <div className="h-full rounded" style={{
                      width: `${Math.max(1, (slice.count / ext_total) * 100)}%`,
                      backgroundColor: slice.color,
                    }} />
                  </div>
                ))}
              </div>
            )}
            <div className="min-w-0 space-y-0.5 text-[11px] text-slate-300">
            {slices.map((s) => (
              <div key={s.key} className="flex min-w-0 flex-wrap items-center gap-1.5">
                <span className="inline-block h-2 w-2 shrink-0 rounded-sm"
                  style={{ backgroundColor: s.color }} aria-hidden="true" />
                <span className="break-all font-mono">{s.label}</span>
                <span className="text-slate-400">
                  · {fmt(s.count)} ({Math.round((s.count / ext_total) * 100)}%)
                </span>
              </div>
            ))}
            </div>
          </div>
        </figure>
      )}
      <p className="mt-2 text-[11px] text-slate-400">
        {fmt(identity.sessions)} session{identity.sessions === 1 ? "" : "s"}
        {identity.first_event_ts &&
          ` · first capture ${fmtTs(identity.first_event_ts).slice(0, 10)}`}
        {" · "}{fmt(identity.commits)} commit{identity.commits === 1 ? "" : "s"} (all-time)
        {effort > 0 && ` · ${fmtMinutes(effort)} effort (365d, UTC)`}
      </p>
    </div>
  );
}
