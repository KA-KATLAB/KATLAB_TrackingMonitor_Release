// v0.1.11.0 D2 (B.2): coupling constellation — the shipped coupling pairs
// as a pure-SVG ARC DIAGRAM (the chord class simplified for readability).
// Nodes on a baseline ordered by total shared-weight; semicircle arcs whose
// stroke uses EXACTLY the list badge's bucket expression (the one strength
// rule) with couplingMax arriving as a PROP from OverviewView's single
// computation (RV1 — never recomputed here). The SVG is decorative because the
// adjacent exact-data table owns the native FileStory actions. Fixed 400x150
// viewBox, width 100% (the RV7-v0.1.10.0 class).

import type { StatsData } from "./charts";
import { RAMP } from "./calendarHeatmap";

type Pair = StatsData["file_coupling"][number];

const VW = 400, VH = 150, BASE_Y = 118, PAD = 24;

function midTruncate (s: string, max: number): string {
  if (s.length <= max) return s;
  const half = Math.floor((max - 1) / 2);
  return `${s.slice(0, half)}…${s.slice(s.length - half)}`;
}

export function CouplingArcs ({ pairs, couplingMax }: {
  pairs: Pair[];
  couplingMax: number; // RV1: OverviewView's one computation (max(1, ...))
}) {
  if (pairs.length === 0) return null;
  // Nodes ordered by total shared-weight desc, ties by repo then file.
  const weight = new Map<string, {
    key: string;
    repo: string;
    file: string;
    weight: number;
  }>();
  for (const p of pairs) {
    for (const f of [p.file_a, p.file_b]) {
      const key = JSON.stringify([p.repo, f]);
      weight.set(key, {
        key,
        repo: p.repo,
        file: f,
        weight: (weight.get(key)?.weight ?? 0) + p.shared,
      });
    }
  }
  const nodes = [...weight.values()].sort((a, b) => b.weight - a.weight
    || (a.repo < b.repo ? -1 : a.repo > b.repo ? 1 : 0)
    || (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
  const x = new Map<string, number>();
  nodes.forEach((node, i) => {
    x.set(node.key, nodes.length === 1
      ? VW / 2 : PAD + (i * (VW - 2 * PAD)) / (nodes.length - 1));
  });
  const bucket = (shared: number) =>
    RAMP[Math.min(4, Math.max(1, Math.ceil((shared / couplingMax) * 4)))];

  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} width="100%"
      aria-hidden="true" focusable="false">
      {pairs.map((p) => {
        const xa = x.get(JSON.stringify([p.repo, p.file_a]))!;
        const xb = x.get(JSON.stringify([p.repo, p.file_b]))!;
        const [x1, x2] = xa < xb ? [xa, xb] : [xb, xa];
        const r = (x2 - x1) / 2;
        return (
          <path key={JSON.stringify([p.repo, p.file_a, p.file_b])}
            d={`M ${x1} ${BASE_Y} A ${r} ${Math.min(r, BASE_Y - 8)} 0 0 1 ${x2} ${BASE_Y}`}
            fill="none" stroke={bucket(p.shared)} opacity={0.7}
            strokeWidth={1 + 3 * (p.shared / couplingMax)}>
            <title>{`${p.file_a.split("/").pop()} ↔ ${p.file_b.split("/").pop()} · changed together in ${p.shared} task${p.shared === 1 ? "" : "s"}`}</title>
          </path>
        );
      })}
      {nodes.map(({ key, repo, file }) => {
        const nx = x.get(key)!;
        const base = file.split("/").pop() ?? file;
        return (
          <g key={key}>
            <title>{`${repo}/${file}`}</title>
            <circle cx={nx} cy={BASE_Y} r={3} fill="#cbd5e1" />
            <text x={nx} y={BASE_Y + 14} textAnchor="middle" fontSize={8}
              className="select-none fill-slate-400 font-mono">
              {midTruncate(base, 12)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
