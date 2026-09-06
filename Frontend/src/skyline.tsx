// v0.1.9.0 D1 (B.1): isometric "city" view of the SAME 365-day calendar —
// pure SVG (2:1 dimetric projection), zero deps. Top faces use the
// calendar's exported RAMP via the shared rampBucket (single source); side
// faces are fixed darkenings of that hex (per-face lighting, not a second
// ramp). Sqrt height scale so one outlier day never flattens the city.

import type { StatsData } from "./charts";
import { fmtMinutes } from "./format";
import { RAMP, rampBucket } from "./calendarHeatmap";

type CalDay = StatsData["activity_calendar"][number];

const ISO_X = 7, ISO_Y = 3.5, HMAX = 40; // D1 pins: 2:1 dimetric + max height
const OX = 7 * ISO_X + 4;                // di=6 pushes x left by 6*ISO_X + west corner
const OY = 4;                            // gy below bakes HMAX in, so tops never clip

function darken (hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (shift: number) => Math.round(((n >> shift) & 0xff) * f);
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
}

export function Skyline ({ calendar }: { calendar: CalDay[] }) {
  if (calendar.length === 0) return null;
  // Sunday-first alignment — the flat calendar's lead-pad rule REUSED.
  const first = new Date(`${calendar[0].day}T00:00:00Z`);
  const lead = isNaN(first.getTime()) ? 0 : first.getUTCDay(); // 0 = Sunday
  const cells: (CalDay | null)[] = [...Array<null>(lead).fill(null), ...calendar];
  const weeks = Math.ceil(cells.length / 7);
  const max = Math.max(0, ...calendar.map((d) => d.events));

  // Painter order: ascending (wi + di) = back-to-front (D1) — a taller back
  // building never overpaints a front one; same-depth tiles never overlap.
  const order: { c: CalDay; wi: number; di: number }[] = [];
  cells.forEach((c, i) => {
    if (c) order.push({ c, wi: Math.floor(i / 7), di: i % 7 });
  });
  order.sort((a, b) => (a.wi + a.di) - (b.wi + b.di));

  const width = OX + weeks * ISO_X + 4;
  const height = OY + HMAX + (weeks + 5) * ISO_Y + ISO_Y + 4;
  return (
    <svg width={width} height={height} aria-hidden="true" focusable="false">
      {order.map(({ c, wi, di }) => {
        const gx = OX + (wi - di) * ISO_X;
        const gy = OY + HMAX + (wi + di) * ISO_Y;
        const h = c.events === 0
          ? 0 : Math.max(3, Math.round(HMAX * Math.sqrt(c.events / max)));
        const top = RAMP[rampBucket(c.events, max)];
        // Same tooltip string as the flat view (D1) — incl. the v0.1.6.0
        // RV13 rule: effort only when > 0.
        const tip = `${c.day} (UTC) — ${c.events} event${c.events === 1 ? "" : "s"} · ${c.commits} commit${c.commits === 1 ? "" : "s"}${c.minutes > 0 ? ` · ${fmtMinutes(c.minutes)}` : ""}`;
        return (
          <g key={c.day}>
            <title>{tip}</title>
            {h > 0 && (
              <>
                <polygon
                  points={`${gx - ISO_X},${gy - h} ${gx},${gy - h + ISO_Y} ${gx},${gy + ISO_Y} ${gx - ISO_X},${gy}`}
                  fill={darken(top, 0.75)} />
                <polygon
                  points={`${gx},${gy - h + ISO_Y} ${gx + ISO_X},${gy - h} ${gx + ISO_X},${gy} ${gx},${gy + ISO_Y}`}
                  fill={darken(top, 0.55)} />
              </>
            )}
            <polygon
              points={`${gx},${gy - h - ISO_Y} ${gx + ISO_X},${gy - h} ${gx},${gy - h + ISO_Y} ${gx - ISO_X},${gy - h}`}
              fill={top} />
            {c.commits > 0 && (
              <circle cx={gx} cy={gy - h} r={1.2} fill="#e2e8f0" />
            )}
          </g>
        );
      })}
    </svg>
  );
}
