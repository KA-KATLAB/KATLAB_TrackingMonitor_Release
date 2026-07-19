// v0.1.5.0 D7 (D.3): daily digest — ONE self-contained HTML file of TODAY
// (the LOCAL day, UF4 convention), assembled client-side and downloaded via
// Blob. Inline CSS from theme hexes; the same Google-Fonts <link> + fallback
// stacks as the app (offline-safe); NO external JS; no diffs (parked).
// A fetch failure at any page THROWS — the caller shows the inline note and
// nothing downloads (RV20). Labels come from theme.ts MODE_BADGE (RV19 — an
// App.tsx import here would create an App<->digest cycle).

import { api, Repo, Task, TrackedEvent } from "./api";
import { fmtMinutes } from "./format";
import { MODE_BADGE, MODE_COLOR, sessionColor } from "./theme";

const PAGE = 500, MAX_PAGES = 3; // explicit cap — truncation is footnoted, never silent

const pad = (n: number): string => String(n).padStart(2, "0");
const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function badge (mode: TrackedEvent["mode"]): string {
  return `<span style="background:${MODE_COLOR[mode]};color:#fff;border-radius:3px;` +
    `padding:1px 5px;font-size:10px;font-weight:700">${esc(MODE_BADGE[mode].label)}</span>`;
}

function dot (sessionId: string | null): string {
  if (!sessionId) return "";
  return `<span title="session ${esc(sessionId.slice(0, 8))}" style="display:inline-block;` +
    `width:8px;height:8px;border-radius:99px;background:${sessionColor(sessionId)}"></span>`;
}

function kpi (value: string, label: string): string {
  return `<div style="border:1px solid #334155;border-radius:6px;padding:10px 14px">` +
    `<div style="font-family:'Azeret Mono',ui-monospace,monospace;font-size:26px;font-weight:700">${value}</div>` +
    `<div style="font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8">${label}</div></div>`;
}

/** Fetch today's events (local day) — up to MAX_PAGES newest-first pages. */
async function fetchToday (scope: string | undefined):
  Promise<{ todays: TrackedEvent[]; truncated: boolean }> {
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const todays: TrackedEvent[] = [];
  for (let p = 0; p < MAX_PAGES; p++) {
    const page = await api.events({ repo: scope, limit: PAGE, offset: p * PAGE });
    const fresh = page.filter((e) => new Date(e.ts).getTime() >= midnight);
    todays.push(...fresh);
    if (page.length < PAGE || fresh.length < page.length) return { todays, truncated: false };
  }
  return { todays, truncated: true }; // page 3 came back full and all-today
}

export async function exportDigest (scope: string | undefined, repos: Repo[],
  tasks: Task[], uncommitted: TrackedEvent[]): Promise<void> {
  const { todays, truncated } = await fetchToday(scope); // throws -> caller aborts (RV20)
  // v0.1.6.0 D1 (C.1): effort KPI reads the SAME backend value as the
  // Overview (calendar last UTC day) - never re-clusters in TS; the
  // fetch sits BEFORE the Blob build so a failure aborts (RV20).
  const stats = await api.stats(scope);
  const todayMinutes = stats.activity_calendar[stats.activity_calendar.length - 1]?.minutes ?? 0;

  const now = new Date();
  const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const generated = `${day} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const scopeLabel = scope ?? "ALL repos";

  const auto = todays.filter((e) =>
    e.mode === "B" || e.mode === "A_SCOPED" || e.mode === "A_GLOBAL").length;
  const autoPct = todays.length > 0 ? Math.round((auto / todays.length) * 100) : 0;
  const picksNow = uncommitted.filter((e) =>
    e.mode === "AMBIGUOUS" || e.mode === "UNKNOWN").length;
  const clean = repos.filter((r) => r.clean).length;
  const sessions = new Set(todays.map((e) => e.session_id).filter(Boolean)).size;

  const whyByRef = new Map(tasks.map((t) => [`${t.repo}|${t.task_ref}`, t.why]));
  const repoIds = [...new Set(todays.map((e) => e.repo_id))];
  const sections = repoIds.map((repoId) => {
    const repoEvents = todays.filter((e) => e.repo_id === repoId);
    const byRef = new Map<string, TrackedEvent[]>();
    for (const e of repoEvents) {
      const key = e.task_ref ?? "(unresolved — pick queue)";
      byRef.set(key, [...(byRef.get(key) ?? []), e]);
    }
    const groups = [...byRef.entries()].map(([ref, list]) => {
      const why = whyByRef.get(`${repoId}|${ref}`);
      const files = new Map<string, TrackedEvent[]>();
      for (const e of list) files.set(e.file, [...(files.get(e.file) ?? []), e]);
      const rows = [...files.entries()].map(([file, evs]) =>
        `<li style="margin:2px 0"><code>${esc(file)}</code> ×${evs.length} ` +
        `${badge(evs[evs.length - 1].mode)} ${dot(evs[evs.length - 1].session_id)}</li>`).join("");
      return `<div style="border:1px solid #334155;border-radius:6px;padding:10px 14px;margin:8px 0">` +
        `<div style="color:#7dd3fc;font-family:'Azeret Mono',ui-monospace,monospace;font-size:13px">${esc(ref)}</div>` +
        (why ? `<div style="color:#94a3b8;font-size:11px;margin-top:2px">Why: ${esc(why)}</div>` : "") +
        `<ul style="list-style:none;padding:0;margin:6px 0 0;font-size:12px">${rows}</ul></div>`;
    }).join("");
    return `<h2 style="font-size:15px;margin:18px 0 4px">${esc(repoId)}</h2>${groups}`;
  }).join("");

  const legend = (Object.keys(MODE_BADGE) as TrackedEvent["mode"][])
    .map((m) => `${badge(m)} <span style="color:#94a3b8">${esc(MODE_BADGE[m].tip)}</span>`)
    .join("<br>");

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>TrackingMonitor digest ${day}${scope ? ` — ${esc(scope)}` : ""}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Azeret+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body style="background:#020617;color:#e2e8f0;font-family:'Plus Jakarta Sans',ui-sans-serif,system-ui,sans-serif;max-width:860px;margin:0 auto;padding:24px">
<h1 style="font-size:20px;margin:0">KATLAB TrackingMonitor — daily digest</h1>
<p style="color:#94a3b8;font-size:12px;margin:4px 0 16px">
${day} (local day) · generated ${generated} · scope: ${esc(scopeLabel)}</p>
<div style="display:flex;flex-wrap:wrap;gap:10px">
${kpi(String(todays.length), "events today")}
${kpi(`${autoPct}%`, "auto-attributed today")}
${kpi(String(picksNow), "picks pending now")}
${kpi(`${clean}/${repos.length}`, "repos clean now")}
${kpi(String(sessions), "sessions today")}
${kpi(fmtMinutes(todayMinutes), "time today (UTC)")}
</div>
${sections || '<p style="color:#94a3b8">No tracked events today.</p>'}
<h2 style="font-size:13px;margin:22px 0 4px;color:#94a3b8">Legend</h2>
<p style="font-size:11px;line-height:1.9">${legend}</p>
${truncated ? '<p style="color:#fbbf24;font-size:11px">⚠ Truncated: only the newest ' +
    String(PAGE * MAX_PAGES) + " events were fetched — today had more.</p>" : ""}
</body></html>`;

  const blob = new Blob([html], { type: "text/html" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `TrackingMonitor_Digest_${day}${scope ? `_${scope}` : ""}.html`; // RV13 scope suffix
  a.click();
  URL.revokeObjectURL(a.href);
}
