// v0.1.3.0 D4: per-plan attribution BACKBONE graph (task[+file count] ->
// commit / uncommitted sink). Files are NOT plan-level nodes (R5 — the naive
// task->file->commit model explodes ~2x the cap). mermaid@11 is dynamically
// imported ONLY here (R9 render pattern) so Vite code-splits it into its own
// chunk and the initial bundle stays lean.

import { DIAGRAM } from "./theme";
import { abortError, isAbortError, raceWithSignal } from "./api";
import type { HistoryEntry, Task, TrackedEvent } from "./api";

const NODE_CAP = 12; // R5 backstop: only 12+ TASK plans trip this
let initialized = false;
let seq = 0; // R9: a FRESH render id each call (mermaid throws on a duplicate)

export interface GraphInput {
  planFile: string;
  tasks: Task[];              // this plan's tasks (declared files -> counts)
  history: HistoryEntry[];    // committed events carry task_ref + commit_hash (R17)
  uncommitted: TrackedEvent[]; // client events state -> which tasks hit the sink (R17)
}

export interface GraphWorkContext {
  origin: "foreground" | "background";
  key: string;
  generation: number;
  signal: AbortSignal;
  deadlineAt?: number;
}

export class MermaidModuleLoadError extends Error {
  constructor (cause: unknown) {
    super(`Mermaid module failed to load: ${String(cause)}`);
    this.name = "MermaidModuleLoadError";
  }
}

function assertContextActive (context: GraphWorkContext): void {
  if (context.signal.aborted
      || (context.deadlineAt !== undefined && Date.now() >= context.deadlineAt)) {
    throw abortError();
  }
}

function safe (s: string): string {
  // Mermaid label quoting: strip/replace shape chars, collapse whitespace.
  return s.replace(/["/\\()<>{}|]/g, " ").replace(/\s+/g, " ").trim();
}

export interface BackboneRow {
  taskRef: string;
  taskId: string;
  title: string;
  files: string[];
  commits: string[];
  uncommitted: boolean;
}

export interface BuildResult {
  def: string | null;
  capped: number;
  shown: number;
  total: number;
  rows: BackboneRow[];
}

export function buildBackbone (input: GraphInput): BuildResult {
  const { planFile, tasks, history, uncommitted } = input;
  const planTasks = tasks.filter((t) => t.plan_file === planFile);
  const total = planTasks.length;
  const shown = Math.min(total, NODE_CAP - 2); // leave room for commit/sink nodes
  const use = planTasks.slice(0, shown);
  if (use.length === 0) {
    return { def: null, capped: 0, shown: 0, total, rows: [] };
  }

  // Build the complete structured alternative before Mermaid is imported.
  // The decorative graph stays capped, while its table remains lossless.
  const refs = new Set(planTasks.map((t) => t.task_ref));
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
  const rows: BackboneRow[] = planTasks.map((task) => ({
    taskRef: task.task_ref,
    taskId: task.task_id,
    title: task.title,
    files: [...task.files],
    commits: [...(taskCommits.get(task.task_ref) ?? [])],
    uncommitted: taskUncommitted.has(task.task_ref),
  }));

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

  return { def: lines.join("\n"), capped: total - shown, shown, total, rows };
}

async function ensureMermaid (context: GraphWorkContext) {
  // R9: mermaid stays a dynamic import (its own Vite chunk); ONE initialize
  // shared by the backbone flowchart AND the v0.1.9.0 gitGraph.
  assertContextActive(context);
  let imported: typeof import("mermaid");
  try {
    imported = await raceWithSignal(import("mermaid"), context.signal);
  } catch (errorValue) {
    if (isAbortError(errorValue)) throw errorValue;
    throw new MermaidModuleLoadError(errorValue);
  }
  assertContextActive(context);
  const mermaid = imported.default;
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
        // v0.1.9.0 D4 (B.2): gitGraph vars ride the SAME single initialize —
        // teal main line, amber/purple/sky side branches, house label colors.
        git0: DIAGRAM.accent, git1: "#f59e0b", git2: "#9333ea", git3: "#0284c7",
        gitBranchLabel0: DIAGRAM.bg,
        commitLabelColor: DIAGRAM.text, commitLabelBackground: DIAGRAM.bg,
        tagLabelColor: DIAGRAM.text, tagLabelBackground: DIAGRAM.surface,
        tagLabelBorder: DIAGRAM.accent,
      },
    });
    initialized = true;
  }
  return mermaid;
}

export async function renderBackbone (input: GraphInput, context: GraphWorkContext,
  prepared?: BuildResult): Promise<{ svg: string; meta: BuildResult }> {
  const meta = prepared ?? buildBackbone(input);
  if (!meta.def) return { svg: "", meta };
  const mermaid = await ensureMermaid(context);
  assertContextActive(context);
  const { svg } = await raceWithSignal(
    mermaid.render(`ve-graph-${seq++}`, meta.def),
    context.signal,
  ); // R9: fresh id
  assertContextActive(context);
  return { svg, meta };
}

// --- v0.1.9.0 D4 (B.2): commit graph — real parents, bounded decoration ---

export interface GitGraphRow {
  hash: string;
  message: string;
  timestamp: string;
  parents: string[];
  eventCount: number;
}

export interface GitGraphResult {
  def: string | null;
  shown: number;
  total: number;
  rows: GitGraphRow[];
}

const GIT_CAP = 20; // latest N of the fetched page

export function buildGitGraph (entries: HistoryEntry[], branchName: string): GitGraphResult {
  const total = entries.length;
  if (total === 0) return { def: null, shown: 0, total: 0, rows: [] }; // RV3: empty page
  // RV2: the main branch is RENAMED via the init directive — every checkout
  // must use this sanitized name, never a literal "main". CFT-1: checkout
  // statements QUOTE it — a detached-HEAD repo's main is the SHORT HASH
  // (digit-led) and the grammar's bare REFERENCE token requires a leading
  // letter (parse-proven both ways against @mermaid-js/parser).
  const main = safe(branchName || "main").replace(/\s+/g, "_") || "main";
  const page = entries.slice(0, GIT_CAP).map((e) => e.commit);
  const rows: GitGraphRow[] = entries.slice(0, GIT_CAP).map((entry) => ({
    hash: entry.commit.hash,
    message: entry.commit.message,
    timestamp: entry.commit.ts,
    parents: (entry.commit.parents ?? "").trim().split(/\s+/).filter(Boolean),
    eventCount: entry.events.length,
  }));
  const walk = [...page].reverse(); // oldest-first; main line = page order
  const short = (h: string) => h.slice(0, 7);
  const sideSeen = new Map<string, number>(); // RV4: same-tip repeats -> *2, *3
  const lines = [
    `%%{init: {'gitGraph': {'mainBranchName': '${main}'}}}%%`,
    "gitGraph",
  ];
  walk.forEach((c, i) => {
    const tag = i === walk.length - 1 ? ' tag: "HEAD"' : ""; // RV5: newest's OWN form
    const parents = (c.parents ?? "").trim() ? c.parents!.trim().split(/\s+/) : [];
    if (parents.length >= 2) {
      // RV4/RV5/RV6: a merge renders SOLELY via this decoration — one side
      // node (parent #2 tip, "*"-suffixed: the tip usually also sits on the
      // main line as its own page row), branch keyed by M's OWN short7, and
      // the merge statement carries M's id (mermaid auto-labels otherwise).
      // Parents beyond the 2nd stay list-only (octopus — RV6).
      const tip = short(parents[1]);
      const n = (sideSeen.get(tip) ?? 0) + 1;
      sideSeen.set(tip, n);
      const b = `b_${short(c.hash)}`;
      lines.push(`  branch ${b}`);
      lines.push(`  checkout ${b}`);
      lines.push(`  commit id: "${tip}${n === 1 ? "*" : `*${n}`}"`);
      lines.push(`  checkout "${main}"`); // CFT-1: quoted — digit-led mains
      lines.push(`  merge ${b} id: "${short(c.hash)}"${tag}`);
    } else {
      // 1 parent, "" (root) and NULL (pre-upgrade row) all chain plainly.
      lines.push(`  commit id: "${short(c.hash)}"${tag}`);
    }
  });
  return { def: lines.join("\n"), shown: page.length, total, rows };
}

export async function renderGitGraph (entries: HistoryEntry[], branchName: string,
  context: GraphWorkContext, prepared?: GitGraphResult):
  Promise<{ svg: string; meta: GitGraphResult }> {
  const meta = prepared ?? buildGitGraph(entries, branchName);
  if (!meta.def) return { svg: "", meta };
  const mermaid = await ensureMermaid(context);
  assertContextActive(context);
  const { svg } = await raceWithSignal(
    mermaid.render(`ve-graph-${seq++}`, meta.def),
    context.signal,
  ); // R9: fresh id
  assertContextActive(context);
  return { svg, meta };
}
