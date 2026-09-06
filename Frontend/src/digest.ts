// v0.1.5.0 D7 (D.3): daily digest — ONE self-contained HTML file of TODAY
// (the LOCAL day, UF4 convention), assembled client-side and downloaded via
// Blob. Inline CSS from theme hexes; the same Google-Fonts <link> + fallback
// stacks as the app (offline-safe); NO external JS; no diffs (parked).
// A fetch failure at any page THROWS — the caller shows the inline note and
// nothing downloads (RV20). Labels come from theme.ts MODE_BADGE (RV19 — an
// App.tsx import here would create an App<->digest cycle).

import { api } from "./api";
import type { Repo, Task, TrackedEvent } from "./api";
import type { PreparedDownload } from "./download";
import { fmtMinutes } from "./format";
import { scopeFileToken } from "./navigation";
import { MODE_BADGE, MODE_COLOR, sessionColor } from "./theme";
import { getBoundedPageWindow } from "./ui";

const PAGE = 500, MAX_PAGES = 3; // explicit cap — truncation is footnoted, never silent

const pad = (n: number): string => String(n).padStart(2, "0");
const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function badge (mode: TrackedEvent["mode"]): string {
  return `<span style="background:${MODE_COLOR[mode]};color:#fff;border-radius:3px;` +
    `padding:1px 5px;font-size:10px;font-weight:700">${esc(MODE_BADGE[mode].label)}</span>`;
}

function kpi (value: string, label: string): string {
  return `<div style="border:1px solid #334155;border-radius:6px;padding:10px 14px">` +
    `<div style="font-family:'Azeret Mono',ui-monospace,monospace;font-size:26px;font-weight:700">${value}</div>` +
    `<div style="font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8">${label}</div></div>`;
}

export interface DigestFileSummary {
  repoId: string;
  taskRef: string;
  why: string | null;
  file: string;
  count: number;
  modeLabel: string;
  modeTip: string;
  modeColor: string;
  sessionShort: string | null;
  sessionDotColor: string | null;
}

/** D20's one bounded-page calculation pre-partitions the complete digest model. */
export function partitionDigestRows (rows: readonly DigestFileSummary[], pageSize = 50):
  DigestFileSummary[][] {
  if (rows.length === 0) return [];
  const first = getBoundedPageWindow(rows.length, 1, pageSize);
  return Array.from({ length: first.pageCount }, (_, index) => {
    const page = getBoundedPageWindow(rows.length, index + 1, pageSize);
    return rows.slice(page.start, page.end);
  });
}

function scriptSafeJson (value: unknown): string {
  return JSON.stringify(value)
    .replace(/&/g, "\\u0026")
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/** Fetch today's events (local day) — up to MAX_PAGES newest-first pages. */
async function fetchToday (scope: string | undefined, signal: AbortSignal):
  Promise<{ todays: TrackedEvent[]; truncated: boolean }> {
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const todays: TrackedEvent[] = [];
  for (let p = 0; p < MAX_PAGES; p++) {
    const page = await api.events({ repo: scope, limit: PAGE, offset: p * PAGE }, signal);
    const fresh = page.filter((e) => new Date(e.ts).getTime() >= midnight);
    todays.push(...fresh);
    if (page.length < PAGE || fresh.length < page.length) return { todays, truncated: false };
  }
  return { todays, truncated: true }; // page 3 came back full and all-today
}

export async function prepareDigest (scope: string | undefined, repos: Repo[],
  tasks: Task[], uncommitted: TrackedEvent[], signal: AbortSignal): Promise<PreparedDownload> {
  const { todays, truncated } = await fetchToday(scope, signal); // throws -> caller aborts (RV20)
  // v0.1.6.0 D1 (C.1): effort KPI reads the SAME backend value as the
  // Overview (calendar last UTC day) - never re-clusters in TS; the
  // fetch sits BEFORE the Blob build so a failure aborts (RV20).
  const stats = await api.stats(scope, signal);
  const todayMinutes = stats.activity_calendar[stats.activity_calendar.length - 1]?.minutes ?? 0;

  const now = new Date();
  const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const generated = `${day} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const scopeLabel = scope ?? "All repos";

  const auto = todays.filter((e) =>
    e.mode === "B" || e.mode === "A_SCOPED" || e.mode === "A_GLOBAL").length;
  const autoPct = todays.length > 0 ? Math.round((auto / todays.length) * 100) : 0;
  const picksNow = uncommitted.filter((e) =>
    e.mode === "AMBIGUOUS" || e.mode === "UNKNOWN").length;
  const clean = repos.filter((r) => r.clean).length;
  const sessions = new Set(todays.map((e) => e.session_id).filter(Boolean)).size;

  const whyByRef = new Map(tasks.map((t) => [JSON.stringify([t.repo, t.task_ref]), t.why]));
  const repoIds = [...new Set(todays.map((e) => e.repo_id))];
  const summaries: DigestFileSummary[] = [];
  for (const repoId of repoIds) {
    const repoEvents = todays.filter((e) => e.repo_id === repoId);
    const byRef = new Map<string, TrackedEvent[]>();
    for (const e of repoEvents) {
      const key = e.task_ref ?? "(unresolved — pick queue)";
      byRef.set(key, [...(byRef.get(key) ?? []), e]);
    }
    for (const [ref, list] of byRef) {
      const why = whyByRef.get(JSON.stringify([repoId, ref]));
      const files = new Map<string, TrackedEvent[]>();
      for (const e of list) files.set(e.file, [...(files.get(e.file) ?? []), e]);
      for (const [file, eventsForFile] of files) {
        // Preserve the existing representative-event choice and source order.
        const representative = eventsForFile[eventsForFile.length - 1];
        summaries.push({
          repoId,
          taskRef: ref,
          why: why || null,
          file,
          count: eventsForFile.length,
          modeLabel: MODE_BADGE[representative.mode].label,
          modeTip: MODE_BADGE[representative.mode].tip,
          modeColor: MODE_COLOR[representative.mode],
          sessionShort: representative.session_id?.slice(0, 8) ?? null,
          sessionDotColor: representative.session_id
            ? sessionColor(representative.session_id)
            : null,
        });
      }
    }
  }
  const digestPages = partitionDigestRows(summaries);
  const digestPagesJson = scriptSafeJson(digestPages);

  const legend = (Object.keys(MODE_BADGE) as TrackedEvent["mode"][])
    .map((m) => `${badge(m)} <span style="color:#94a3b8">${esc(MODE_BADGE[m].tip)}</span>`)
    .join("<br>");

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>TrackingMonitor digest ${day} — ${esc(scopeLabel)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link id="digest-fonts" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Azeret+Mono:wght@400;500;600;700&display=swap" rel="preload" as="style">
<noscript><link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Azeret+Mono:wght@400;500;600;700&display=swap" rel="stylesheet"></noscript>
<style>
*{box-sizing:border-box}html,body{max-width:100%}
body{width:100%;line-height:1.5;overflow-wrap:anywhere}
code{white-space:normal;word-break:break-word;color:#7dd3fc}
button,select{min-height:44px;border:1px solid #475569;border-radius:6px;background:#0f172a;color:#e2e8f0;padding:6px 10px;font:inherit}
button{touch-action:manipulation;transition:opacity 120ms ease-out,transform 120ms ease-out}
button:active:not(:disabled){opacity:.72;transform:scale(.98)}
button:focus-visible,select:focus-visible{outline:2px solid #38bdf8;outline-offset:2px}
button:disabled,select:disabled{opacity:.5}.digest-controls{display:flex;flex-wrap:wrap;align-items:end;gap:8px;margin:12px 0}
.digest-controls label{display:grid;gap:3px;color:#94a3b8;font-size:11px}.digest-range{min-width:180px;color:#94a3b8;font-size:12px}
.digest-page{min-width:0}.repo-heading{font-size:15px;margin:18px 0 4px}.task-card{border:1px solid #334155;border-radius:6px;padding:10px 14px;margin:8px 0;background:#0f172a}
.task-card h3{margin:0;color:#7dd3fc;font-family:'Azeret Mono',ui-monospace,monospace;font-size:13px}.why{color:#94a3b8;font-size:11px;margin:2px 0 0}
.file-list{list-style:none;padding:0;margin:6px 0 0;font-size:12px}.file-row{display:flex;min-width:0;flex-wrap:wrap;align-items:center;gap:5px;margin:4px 0}
.file-row code{min-width:0}.mode-badge{border-radius:3px;padding:1px 5px;color:#fff;font-size:10px;font-weight:700}.session-dot{display:inline-block;width:8px;height:8px;border-radius:99px}.session-label{color:#94a3b8;font-size:10px}
@media(max-width:480px){body{font-size:14px}.task-card{padding:9px}.digest-controls>*{max-width:100%}}
@media(prefers-reduced-motion:reduce){button{transition-duration:.01ms}}
</style>
</head>
<body style="background:#020617;color:#e2e8f0;font-family:'Plus Jakarta Sans',ui-sans-serif,system-ui,sans-serif;max-width:860px;margin:0 auto;padding:clamp(16px,4vw,24px)">
<main>
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
<section aria-labelledby="digest-details-heading">
<h2 id="digest-details-heading" style="font-size:16px;margin:22px 0 4px">File summaries</h2>
<p style="color:#94a3b8;font-size:11px;margin:0">Complete fetched order, grouped by repository and task; at most 50 file summaries are mounted per page.</p>
<div class="digest-controls" aria-label="Digest file-summary pages">
<button id="digest-prev" type="button">Previous</button>
<label for="digest-page">Page<select id="digest-page" aria-controls="digest-page-root"></select></label>
<button id="digest-next" type="button">Next</button>
<span id="digest-range" class="digest-range" role="status" aria-live="polite"></span>
</div>
<div id="digest-page-root" class="digest-page" tabindex="-1"></div>
<noscript><p style="color:#fbbf24">The embedded page selector requires JavaScript; no external script is used.</p></noscript>
</section>
<h2 style="font-size:13px;margin:22px 0 4px;color:#94a3b8">Legend</h2>
<p style="font-size:11px;line-height:1.9">${legend}</p>
${truncated ? '<p style="color:#fbbf24;font-size:11px">⚠ Truncated: only the newest ' +
    String(PAGE * MAX_PAGES) + " events were fetched — today had more.</p>" : ""}
</main>
<script id="digest-data" type="application/json">${digestPagesJson}</script>
<script>
(function(){
  "use strict";
  var dataNode=document.getElementById("digest-data");
  var pages=JSON.parse(dataNode.textContent||"[]");
  var root=document.getElementById("digest-page-root");
  var select=document.getElementById("digest-page");
  var previousButton=document.getElementById("digest-prev");
  var nextButton=document.getElementById("digest-next");
  var rangeNode=document.getElementById("digest-range");
  var total=pages.reduce(function(sum,page){return sum+page.length;},0);
  var current=0;
  function node(tag,className,textValue){
    var element=document.createElement(tag);
    if(className)element.className=className;
    if(textValue!==undefined)element.textContent=textValue;
    return element;
  }
  function sameTask(left,right){
    return !!left&&!!right&&left.repoId===right.repoId&&left.taskRef===right.taskRef;
  }
  function render(){
    root.replaceChildren();
    var rows=pages[current]||[];
    var before=current>0&&pages[current-1].length>0
      ?pages[current-1][pages[current-1].length-1]:null;
    if(rows.length===0){root.append(node("p","why","No tracked file summaries today."));}
    var activeRepo=null,activeTask=null,list=null;
    rows.forEach(function(row,index){
      if(row.repoId!==activeRepo){
        var continued=index===0&&before&&before.repoId===row.repoId;
        root.append(node("h2","repo-heading",row.repoId+(continued?" — continued":"")));
        activeRepo=row.repoId;activeTask=null;list=null;
      }
      var taskKey=JSON.stringify([row.repoId,row.taskRef]);
      if(taskKey!==activeTask){
        var card=node("section","task-card");
        var taskContinued=index===0&&sameTask(before,row);
        card.append(node("h3","",row.taskRef+(taskContinued?" — continued":"")));
        if(row.why)card.append(node("p","why","Why: "+row.why));
        list=node("ul","file-list");card.append(list);root.append(card);activeTask=taskKey;
      }
      var item=node("li","file-row");
      item.append(node("code","",row.file));
      item.append(document.createTextNode(" ×"+String(row.count)+" "));
      var badgeNode=node("span","mode-badge",row.modeLabel);
      badgeNode.title=row.modeTip;badgeNode.style.backgroundColor=row.modeColor;item.append(badgeNode);
      if(row.sessionShort){
        var dotNode=node("span","session-dot");dotNode.setAttribute("aria-hidden","true");
        dotNode.style.backgroundColor=row.sessionDotColor;item.append(dotNode);
        item.append(node("span","session-label","session "+row.sessionShort));
      }
      list.append(item);
    });
    var start=rows.length===0?0:pages.slice(0,current).reduce(function(sum,page){return sum+page.length;},0)+1;
    var end=rows.length===0?0:start+rows.length-1;
    rangeNode.textContent=total===0?"0 of 0":String(start)+"–"+String(end)+" of "+String(total)+" · page "+String(current+1)+" of "+String(pages.length);
    select.value=String(current);select.disabled=pages.length<=1;
    previousButton.disabled=current<=0;nextButton.disabled=current>=pages.length-1;
  }
  pages.forEach(function(page,index){
    var start=pages.slice(0,index).reduce(function(sum,item){return sum+item.length;},0)+1;
    var option=node("option","","Page "+String(index+1)+" · "+String(start)+"–"+String(start+page.length-1));
    option.value=String(index);select.append(option);
  });
  if(pages.length===0){var option=node("option","","0 of 0");option.value="0";select.append(option);}
  select.addEventListener("change",function(){current=Number(select.value)||0;render();});
  previousButton.addEventListener("click",function(){if(current>0){current-=1;render();}});
  nextButton.addEventListener("click",function(){if(current<pages.length-1){current+=1;render();}});
  render();
  var fontLink=document.getElementById("digest-fonts");
  if(fontLink){fontLink.rel="stylesheet";fontLink.removeAttribute("as");}
})();
</script>
</body></html>`;

  const fileScope = scopeFileToken(scope === undefined
    ? { kind: "all" }
    : { kind: "repo", id: scope });
  return {
    blob: new Blob([html], { type: "text/html" }),
    filename: `TrackingMonitor_Digest_${fileScope}_${day}.html`,
  };
}
