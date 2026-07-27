// v0.1.10.0 D2 (B.2): churn treemap — where the work lives. Hand-rolled
// SQUARIFIED layout (Bruls/Huizing/van Wijk 2000; dry-run-proven on the
// paper's canonical fixture during review): sorted input (the API order),
// grow the current row while adding the next item IMPROVES the row's worst
// aspect ratio, else fix the row along the shorter side and recurse.
// Canvas: a FIXED 400x180 viewBox with width="100%" (RV7 — the layout and
// the label fit rule stay deterministic in viewBox units while the map
// scales with its half-row card). Tile fill = RECENCY bands over last_ts
// (size already encodes churn); RAMP[0] never applies — every tile has
// events. Tiles open the EXISTING FileStory (the v0.1.7.0 opener zone).

import { StatsData } from "./charts";
import { RAMP } from "./calendarHeatmap";

type ChurnRow = StatsData["file_churn"][number];
interface Tile { x: number; y: number; w: number; h: number; row: ChurnRow; }

const VW = 400, VH = 180; // RV7: fixed viewBox units

function recencyFill (lastTs: string): string {
  const age = Date.now() - Date.parse(lastTs);
  if (age < 24 * 3_600_000) return RAMP[4];
  if (age < 7 * 24 * 3_600_000) return RAMP[3];
  if (age < 30 * 24 * 3_600_000) return RAMP[2];
  return RAMP[1];
}

// Worst aspect ratio of a row of areas laid along `side`.
function worstAspect (row: number[], side: number): number {
  const thick = row.reduce((a, b) => a + b, 0) / side;
  let worst = 0;
  for (const a of row) {
    const len = a / thick;
    worst = Math.max(worst, thick / len, len / thick);
  }
  return worst;
}

function squarify (rows: ChurnRow[], areas: number[],
  x: number, y: number, w: number, h: number, out: Tile[]): void {
  if (rows.length === 0) return;
  const side = Math.min(w, h);
  let take = 1;
  while (take < rows.length &&
    worstAspect(areas.slice(0, take + 1), side) <= worstAspect(areas.slice(0, take), side)) {
    take += 1;
  }
  const rowAreas = areas.slice(0, take);
  const thick = rowAreas.reduce((a, b) => a + b, 0) / side;
  let cx = x, cy = y;
  for (let i = 0; i < take; i++) {
    const len = rowAreas[i] / thick;
    if (w <= h) { // lay along the top edge (width is the shorter side)
      out.push({ x: cx, y, w: len, h: thick, row: rows[i] });
      cx += len;
    } else {      // lay along the left edge (height is the shorter side)
      out.push({ x, y: cy, w: thick, h: len, row: rows[i] });
      cy += len;
    }
  }
  if (w <= h) squarify(rows.slice(take), areas.slice(take), x, y + thick, w, h - thick, out);
  else squarify(rows.slice(take), areas.slice(take), x + thick, y, w - thick, h, out);
}

function midTruncate (s: string, max: number): string {
  if (s.length <= max) return s;
  const half = Math.floor((max - 1) / 2);
  return `${s.slice(0, half)}…${s.slice(s.length - half)}`;
}

export function ChurnMap ({ churn, onOpenFileStory }: {
  churn: ChurnRow[];
  onOpenFileStory?: (repo: string, file: string) => void;
}) {
  if (churn.length === 0) return null; // the coupling-card precedent
  const total = churn.reduce((a, r) => a + r.events, 0);
  const areas = churn.map((r) => (r.events / total) * VW * VH);
  const tiles: Tile[] = [];
  squarify(churn, areas, 0, 0, VW, VH, tiles);
  return (
    <div>
      <div className="mb-2 text-xs font-semibold text-slate-300">
        Codebase heat — where the work lives
      </div>
      <svg viewBox={`0 0 ${VW} ${VH}`} width="100%" role="img"
        aria-label="file churn treemap">
        {tiles.map(({ x, y, w, h, row }) => {
          const base = row.file.split("/").pop() ?? row.file;
          return (
            <g key={`${row.repo}|${row.file}`}
              onClick={() => onOpenFileStory?.(row.repo, row.file)}
              className={onOpenFileStory ? "cursor-pointer" : undefined}>
              <title>{`${row.repo}/${row.file} · ${row.events} event${row.events === 1 ? "" : "s"} · last ${row.last_ts}`}</title>
              <rect x={x + 0.5} y={y + 0.5} width={Math.max(0, w - 1)}
                height={Math.max(0, h - 1)} rx={2}
                fill={recencyFill(row.last_ts)} stroke="#0f172a" strokeWidth={1} />
              {/* label only when the tile fits — RV7 viewBox units */}
              {w >= 60 && h >= 14 && (
                <text x={x + 4} y={y + 12} fontSize={9} fill="#0f172a"
                  className="pointer-events-none select-none font-semibold">
                  {midTruncate(base, Math.floor((w - 8) / 5.5))}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="mt-1 text-[11px] text-slate-400">
        size = captures · color = recency · (top 20)
      </div>
    </div>
  );
}
