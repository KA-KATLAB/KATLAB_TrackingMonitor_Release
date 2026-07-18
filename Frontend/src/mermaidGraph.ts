// v0.1.3.0 D4: per-plan attribution BACKBONE graph (task[+file count] ->
// commit / uncommitted sink). Files are NOT plan-level nodes (R5 — the naive
// task->file->commit model explodes ~2x the cap). mermaid@11 is dynamically
// imported ONLY here (R9 render pattern) so Vite code-splits it into its own
// chunk and the initial bundle stays lean.

import { DIAGRAM } from "./theme";
import { HistoryEntry, Task, TrackedEvent } from "./api";

const NODE_CAP = 12; // R5 backstop: only 12+ TASK plans trip this
let initialized = false;
let seq = 0; // R9: a FRESH render id each call (mermaid throws on a duplicate)

export interface GraphInput {
  planFile: string;
  tasks: Task[];              // this plan's tasks (declared files -> counts)
  history: HistoryEntry[];    // committed events carry task_ref + commit_hash (R17)
  uncommitted: TrackedEvent[]; // client events state -> which tasks hit the sink (R17)
}

function safe (s: string): string {
  // Mermaid label quoting: strip/replace shape chars, collapse whitespace.
  return s.replace(/["/\\()<>{}|]/g, " ").replace(/\s+/g, " ").trim();
}

export interface BuildResult { def: string | null; capped: number; shown: number; total: number; }

export function buildBackbone (input: GraphInput): BuildResult {
  const { planFile, tasks, history, uncommitted } = input;
  const planTasks = tasks.filter((t) => t.plan_file === planFile);
  const total = planTasks.length;
  const shown = Math.min(total, NODE_CAP - 2); // leave room for commit/sink nodes
  const use = planTasks.slice(0, shown);
  if (use.length === 0) return { def: null, capped: 0, shown: 0, total };

  const refs = new Set(use.map((t) => t.task_ref));
  // task_ref -> set of commit hashes (from committed history events, R17)
  const taskCommits = new Map<string, Set<string>>();
  for (const { events } of history) {
    for (const e of events) {
      if (e.task_ref && refs.has(e.task_ref) && e.commit_hash) {
        (taskCommits.get(e.task_ref) ?? taskCommits.set(e.task_ref, new Set()).get(e.task_ref)!)
          .add(e.commit_hash);
      }
    }
  }
  const taskUncommitted = new Set(
    uncommitted.filter((e) => e.task_ref && refs.has(e.task_ref)).map((e) => e.task_ref),
  );

  const lines = ["flowchart TD"];
  let hasSink = false;
  use.forEach((t, i) => {
    const nFiles = t.files.length;
    lines.push(`  T${i}["${safe(t.task_id)}<br/>${safe(t.title).slice(0, 40)}<br/>+${nFiles} files"]`);
    for (const h of taskCommits.get(t.task_ref) ?? []) {
      lines.push(`  T${i} --> C_${h.slice(0, 7)}(["${h.slice(0, 7)}"])`);
    }
    // D7 (v0.1.4.0): dashed = not-yet-final (uncommitted); commits stay solid.
    if (taskUncommitted.has(t.task_ref)) { lines.push(`  T${i} -.-> SINK`); hasSink = true; }
  });
  if (hasSink) lines.push('  SINK{{"uncommitted"}}');
  lines.push("  classDef task fill:#134e4a55,stroke:#14b8a6,color:#e2e8f0;");
  lines.push(`  class ${use.map((_, i) => `T${i}`).join(",")} task;`);

  return { def: lines.join("\n"), capped: total - shown, shown, total };
}

export async function renderBackbone (input: GraphInput): Promise<{ svg: string; meta: BuildResult }> {
  const meta = buildBackbone(input);
  if (!meta.def) return { svg: "", meta };
  const mermaid = (await import("mermaid")).default;
  if (!initialized) {
    mermaid.initialize({
      startOnLoad: false, theme: "base", securityLevel: "strict",
      themeVariables: {
        background: DIAGRAM.bg, primaryColor: DIAGRAM.surface,
        primaryBorderColor: DIAGRAM.accent, primaryTextColor: DIAGRAM.text,
        lineColor: DIAGRAM.textDim, secondaryColor: DIAGRAM.surface,
        fontSize: "12px",
        // A.1/D3 (v0.1.4.0): SVG text ignores page CSS — the graph must
        // adopt the pairing here (fallback stack keeps it offline-safe).
        fontFamily: '"Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif',
      },
    });
    initialized = true;
  }
  const { svg } = await mermaid.render(`ve-graph-${seq++}`, meta.def); // R9: fresh id
  return { svg, meta };
}
