// v0.2.0.1 D1 (B.1): the report — one click, a self-contained KATLAB
// document (the digest.ts recipe grown up: string builder, dark inline
// CSS, the same Google-Fonts link + fallback stacks, Blob download).
// The report consumes STATS + SCOPE ONLY (RV7) and needs NO fetch.
// Ranges: 7d / 30d — hero, momentum, and the calendar strip are
// RANGE-TRUE calendar-tail projections (RV5: the hero's commits figure
// reads sum(calendar[-N:].commits), NEVER the all-time stats.commits);
// rhythm, identity, and the top tables are served ALL-TIME by design and
// carry explicit "(all-time)" heading markers (RV2); wrapped appears on
// the 7d report ONLY (it is served as last-7-UTC-days, never stretched).
// The footer is "KATLAB TrackingMonitor — generated <local ts>" — no
// version claim (RV3).

import { RAMP, rampBucket } from "./calendarHeatmap";
import type { StatsData } from "./charts";
import { startBlobDownload } from "./download";
import { fmtMinutes } from "./format";
import { scopeFileToken } from "./navigation";
import { buildIdentityData } from "./identityData";

const pad = (n: number) => String(n).padStart(2, "0");
const fmt = (n: number) => n.toLocaleString("en-US");
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const CARD = "border:1px solid #334155;border-radius:8px;padding:12px 16px;margin:10px 0;background:#0f172a";
const H2 = "font-size:14px;margin:20px 0 4px;color:#e2e8f0";
const SUB = "color:#94a3b8;font-size:11px";

function kpi (value: string, label: string): string {
  return `<div style="border:1px solid #334155;border-radius:8px;padding:10px 16px;background:#0f172a">` +
    `<div style="font-size:20px;font-weight:700;color:#f1f5f9">${value}</div>` +
    `<div style="${SUB}">${label}</div></div>`;
}

// the momentum delta rule VERBATIM (prev==0 && cur>0 -> "new ▲"; both
// 0 -> "—"; ▼ slate never red)
function delta (cur: number, prev: number): string {
  if (prev === 0) {
    return cur > 0 ? `<span style="color:#5eead4">new ▲</span>`
      : `<span style="color:#94a3b8">—</span>`;
  }
  const pct = Math.round(((cur - prev) / prev) * 100);
  if (pct > 0) return `<span style="color:#5eead4">▲ ${pct}%</span>`;
  if (pct < 0) return `<span style="color:#94a3b8">▼ ${-pct}%</span>`;
  return `<span style="color:#94a3b8">= 0%</span>`;
}

// 2N-point sparkline, prior half dimmed 0.35 (the momentum strip's look)
function spark (values: number[]): string {
  // CFT-1: n < 2 would divide by zero in the x-step (NaN points) — the
  // live calendar is always 365, but the defended-empty precedent holds.
  if (values.length < 2) {
    return `<svg width="240" height="34" aria-hidden="true" focusable="false"></svg>`;
  }
  const max = Math.max(...values, 0);
  const n = values.length;
  const pt = (v: number, i: number) =>
    `${(i * (240 / (n - 1))).toFixed(1)},${(max === 0 ? 30 : 30 - (v / max) * 26).toFixed(1)}`;
  const half = n / 2;
  const prior = values.slice(0, half + 1).map(pt).join(" ");
  const cur = values.slice(half).map((v, i) => pt(v, i + half)).join(" ");
  return `<svg width="240" height="34" viewBox="0 0 240 34" aria-hidden="true" focusable="false">` +
    `<polyline points="${prior}" fill="none" stroke="#14b8a6" stroke-width="1.5" opacity="0.35"/>` +
    `<polyline points="${cur}" fill="none" stroke="#14b8a6" stroke-width="1.5"/></svg>`;
}

export function buildReportHtml (stats: StatsData, scope: string | undefined,
  range: 7 | 30, now: Date): string {
  const cal = stats.activity_calendar;
  const tail = cal.slice(-range);
  const prior = cal.slice(-2 * range, -range);
  const scopeLabel = scope ?? "All repos";
  const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const generated = `${day} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

  // HERO — all four figures are the range's calendar-tail sums (RV5)
  const events = tail.reduce((s, d) => s + d.events, 0);
  const minutes = tail.reduce((s, d) => s + d.minutes, 0);
  const commits = tail.reduce((s, d) => s + d.commits, 0);
  const active = tail.filter((d) => d.events > 0).length;

  // MOMENTUM — range window vs the prior window
  const prevEvents = prior.reduce((s, d) => s + d.events, 0);
  const prevMinutes = prior.reduce((s, d) => s + d.minutes, 0);
  const prevCommits = prior.reduce((s, d) => s + d.commits, 0);
  const sparkValues = cal.slice(-2 * range).map((d) => d.events);

  // CALENDAR STRIP — range days, RAMP-bucketed vs the RANGE max
  const rangeMax = Math.max(0, ...tail.map((d) => d.events));
  const strip = tail.map((d, i) =>
    `<rect x="${i * 12}" y="0" width="10" height="10" rx="2" ` +
    `fill="${RAMP[rampBucket(d.events, rangeMax)]}"><title>${esc(d.day)} (UTC) — ` +
    `${d.events} event${d.events === 1 ? "" : "s"}</title></rect>`).join("");
  const calendarRows = tail.map((day) =>
    `<tr><th scope="row">${esc(day.day)}</th><td>${fmt(day.events)}</td>` +
    `<td>${fmtMinutes(day.minutes)}</td><td>${fmt(day.commits)}</td></tr>`).join("");

  // RHYTHM (all-time) — the served 7x24 punch card as scaled dots
  const punchMax = Math.max(0, ...stats.punch_card.flat());
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const punch = stats.punch_card.map((row, d) =>
    row.map((c, h) => {
      const r = punchMax === 0 || c === 0 ? 0 : 1 + (c / punchMax) * 4;
      return r === 0 ? "" :
        `<circle cx="${28 + h * 13}" cy="${10 + d * 13}" r="${r.toFixed(1)}" fill="#14b8a6"/>`;
    }).join("")).join("") +
    DAYS.map((lbl, d) =>
      `<text x="0" y="${14 + d * 13}" font-size="8" fill="#94a3b8">${lbl}</text>`).join("");
  const punchHead = Array.from({ length: 24 }, (_, hour) =>
    `<th scope="col">${pad(hour)}</th>`).join("");
  const punchRows = stats.punch_card.map((row, dayIndex) =>
    `<tr><th scope="row">${DAYS[dayIndex]}</th>` +
    row.map((count) => `<td>${fmt(count)}</td>`).join("") + "</tr>").join("");

  // IDENTITY (all-time) — one shared slice/palette/presentation decision.
  const identity = buildIdentityData(stats.identity);
  const C = 2 * Math.PI * 40;
  let acc = 0;
  const arcs = identity.slices.map((slice) => {
    const frac = identity.total > 0 ? slice.count / identity.total : 0;
    const seg = `<circle r="40" cx="50" cy="50" fill="none" stroke="${slice.color}" ` +
      `stroke-width="16" stroke-dasharray="${(frac * C).toFixed(1)} ${C.toFixed(1)}" ` +
      `stroke-dashoffset="${(-acc * C).toFixed(1)}" transform="rotate(-90 50 50)"/>`;
    acc += frac;
    return seg;
  }).join("");
  const identityVisual = identity.presentation === "bar"
    ? `<div class="identity-bars" aria-hidden="true">${identity.slices.map((slice) => {
      const pct = identity.total > 0 ? (slice.count / identity.total) * 100 : 0;
      return `<div class="identity-bar"><span style="background:${slice.color};width:${pct.toFixed(1)}%"></span></div>`;
    }).join("")}</div>`
    : `<svg width="100" height="100" viewBox="0 0 100 100" aria-hidden="true" focusable="false">${arcs}</svg>`;
  const identityRows = identity.slices.map((slice) => {
    const pct = identity.total > 0 ? Math.round((slice.count / identity.total) * 100) : 0;
    return `<tr><th scope="row">${esc(slice.label)}</th><td>${fmt(slice.count)}</td><td>${pct}%</td></tr>`;
  }).join("");

  // TOP TABLES (all-time)
  const topTasks = stats.effort_per_task.slice(0, 5);
  const taskRows = topTasks.map((t) =>
    `<tr><td>${esc(t.repo)}</td><td>${esc(t.task_ref)}</td>` +
    `<td style="text-align:right">${fmtMinutes(t.minutes)}</td></tr>`).join("");
  const scopedChurn = stats.file_churn.filter((r) => scope === undefined || r.repo === scope);
  const topChurn = scopedChurn.slice(0, 5);
  const churnRows = topChurn.map((r) =>
      `<tr><td>${esc(r.repo)}</td><td><code>${esc(r.file)}</code></td>` +
      `<td style="text-align:right">${fmt(r.events)}</td></tr>`).join("");

  // WRAPPED (7d report only — served as last-7-UTC-days)
  const w = stats.wrapped;
  const wrappedDayRows = w.days.map((day) =>
    `<tr><th scope="row">${esc(day.day)}</th><td>${fmt(day.events)}</td>` +
    `<td>${fmtMinutes(day.minutes)}</td></tr>`).join("");
  const wrappedBlock = range !== 7 ? "" : `
<h2 style="${H2}">Your week (UTC)</h2>
<div style="${CARD}">
${w.top_task ? `<div>Top task: <b>${esc(w.top_task.task_ref)}</b> (${esc(w.top_task.repo)}) — ${fmtMinutes(w.top_task.minutes)}</div>` : ""}
${w.busiest_hour ? `<div>Busiest hour: <b>${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][w.busiest_hour.dow]} ${pad(w.busiest_hour.hour)}:00</b> — ${fmt(w.busiest_hour.events)} events</div>` : ""}
${w.top_pair ? `<div>Files that moved together: <code>${esc(w.top_pair.file_a)}</code> + <code>${esc(w.top_pair.file_b)}</code> ×${w.top_pair.shared}</div>` : ""}
<div>${fmt(w.files_touched)} files touched · ${fmt(w.commits)} commits</div>
<div class="table-scroll" role="region" aria-label="Wrapped daily values" tabindex="0"><table>
<caption>Daily values in this weekly snapshot</caption><thead><tr><th scope="col">UTC day</th><th scope="col">Events</th><th scope="col">Effort</th></tr></thead>
<tbody>${wrappedDayRows}</tbody></table></div>
</div>`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>KATLAB Report — ${esc(scopeLabel)} — ${range}d — ${day}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Azeret+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box}
html,body{max-width:100%}
body{background:#020617;color:#e2e8f0;font-family:'Plus Jakarta Sans',ui-sans-serif,system-ui,sans-serif;width:100%;max-width:860px;margin:0 auto;padding:clamp(16px,4vw,28px);line-height:1.5;overflow-wrap:anywhere}
  code{font-family:'Azeret Mono',ui-monospace,monospace;font-size:11px;color:#7dd3fc;white-space:normal;word-break:break-word}
  svg{display:block;max-width:100%;height:auto}
  figure{margin:0}.visual-summary{margin:0 0 8px;color:#94a3b8;font-size:11px}
  .table-scroll{max-width:100%;overflow:auto;overscroll-behavior:contain;margin-top:10px}
  .table-scroll:focus-visible{outline:2px solid #38bdf8;outline-offset:2px}
  table{width:100%;border-collapse:collapse;table-layout:auto;font-size:12px}
  caption{text-align:left;color:#94a3b8;font-size:11px;padding:0 0 5px}
  th,td{padding:5px 8px;border-bottom:1px solid #1e293b;overflow-wrap:anywhere;vertical-align:top;text-align:left}
  thead th{color:#94a3b8;font-weight:600}.matrix{min-width:760px;text-align:right}.matrix th:first-child{text-align:left}
  .identity-bars{display:grid;width:min(100%,520px);gap:6px}.identity-bar{height:16px;border-radius:4px;background:#1e293b;overflow:hidden}.identity-bar span{display:block;height:100%;min-width:1px}
  @media(max-width:480px){th,td{padding:4px;font-size:11px}}
</style></head>
<body>
<h1 style="font-size:22px;margin:0">KATLAB Report <span style="color:#14b8a6">— ${range === 7 ? "your week" : "your month"}</span></h1>
<p style="${SUB};margin:4px 0 18px">${esc(scopeLabel)} · last ${range} days (UTC day buckets) · generated ${generated} (local)</p>
<div style="display:flex;flex-wrap:wrap;gap:10px">
${kpi(fmt(events), "events")}
${kpi(fmtMinutes(minutes), "effort")}
${kpi(fmt(commits), "commits")}
${kpi(`${active}/${range}`, "active days")}
</div>
<h2 style="${H2}">Momentum — this ${range === 7 ? "week" : "month"} vs the prior</h2>
<div style="${CARD}">
<div style="display:flex;gap:24px;flex-wrap:wrap;align-items:center">
<div>captures ${fmt(events)} ${delta(events, prevEvents)}</div>
<div>effort ${fmtMinutes(minutes)} ${delta(minutes, prevMinutes)}</div>
<div>commits ${fmt(commits)} ${delta(commits, prevCommits)}</div>
${spark(sparkValues)}
</div></div>
<h2 style="${H2}">Daily activity — last ${range} days (UTC)</h2>
<div style="${CARD}"><figure><figcaption class="visual-summary">${fmt(events)} events across ${active} active day${active === 1 ? "" : "s"}.</figcaption>
<svg width="${range * 12}" height="12" aria-hidden="true" focusable="false">${strip}</svg></figure>
<div class="table-scroll" role="region" aria-label="Daily activity exact values" tabindex="0"><table>
<caption>Exact daily activity values</caption><thead><tr><th scope="col">UTC day</th><th scope="col">Events</th><th scope="col">Effort</th><th scope="col">Commits</th></tr></thead>
<tbody>${calendarRows || '<tr><td colspan="4">No daily values.</td></tr>'}</tbody></table></div></div>
<h2 style="${H2}">Rhythm — server-local hours (all-time)</h2>
<div style="${CARD}"><figure><figcaption class="visual-summary">Activity by weekday and hour; exact zero and non-zero values follow.</figcaption>
<svg width="345" height="105" aria-hidden="true" focusable="false">${punch}</svg></figure>
<div class="table-scroll" role="region" aria-label="Rhythm exact values" tabindex="0"><table class="matrix">
<caption>Captured events by server-local weekday and hour</caption><thead><tr><th scope="col">Day / hour</th>${punchHead}</tr></thead>
<tbody>${punchRows}</tbody></table></div></div>
<h2 style="${H2}">Identity (all-time)</h2>
<div style="${CARD}">
<div style="display:flex;gap:20px;align-items:center;flex-wrap:wrap">
${identityVisual}
<div style="font-size:12px"><span style="${SUB}">${fmt(stats.identity.sessions)} sessions · ${fmt(stats.identity.commits)} commits · ${fmt(identity.total)} identified files (all-time)</span></div>
</div><div class="table-scroll" role="region" aria-label="Identity exact values" tabindex="0"><table>
<caption>${identity.presentation === "bar" ? "Horizontal-bar" : "Donut"} identity data</caption><thead><tr><th scope="col">Extension</th><th scope="col">Files</th><th scope="col">Share</th></tr></thead>
<tbody>${identityRows || '<tr><td colspan="3">No identity slices.</td></tr>'}</tbody></table></div></div>
<h2 style="${H2}">Top tasks by effort (all-time)</h2>
<div style="${CARD}"><div class="table-scroll" role="region" aria-label="Top tasks by effort" tabindex="0"><table>
<caption>Showing ${topTasks.length} of ${stats.effort_per_task.length} served tasks</caption><thead><tr><th scope="col">Repository</th><th scope="col">Task</th><th scope="col">Effort</th></tr></thead>
<tbody>${taskRows || '<tr><td colspan="3">No task-effort rows.</td></tr>'}</tbody></table></div></div>
<h2 style="${H2}">Top files by churn (all-time)</h2>
<div style="${CARD}"><div class="table-scroll" role="region" aria-label="Top files by churn" tabindex="0"><table>
<caption>Showing ${topChurn.length} of ${scopedChurn.length} served churn rows</caption><thead><tr><th scope="col">Repository</th><th scope="col">File</th><th scope="col">Captures</th></tr></thead>
<tbody>${churnRows || '<tr><td colspan="3">No file-churn rows.</td></tr>'}</tbody></table></div></div>
${wrappedBlock}
<p style="${SUB};margin-top:24px">KATLAB TrackingMonitor — generated ${generated}</p>
</body></html>`;
}

// Blob mechanics = the digest VERBATIM (no fetch — stats must be
// non-null at every call site; entries are disabled while it is).
export function exportReport (stats: StatsData, scope: string | undefined,
  range: 7 | 30): void {
  const now = new Date();
  const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const html = buildReportHtml(stats, scope, range, now);
  const fileScope = scopeFileToken(scope === undefined
    ? { kind: "all" }
    : { kind: "repo", id: scope });
  startBlobDownload({
    blob: new Blob([html], { type: "text/html" }),
    filename: `KATLAB_Report_${fileScope}_${range}d_${day}.html`,
  });
}
