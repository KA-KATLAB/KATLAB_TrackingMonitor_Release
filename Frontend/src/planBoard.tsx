// v0.2.2.0 D1 (B.1): the plan board — missions with faces (the Live_arch
// developing.md/now.md concept mapped onto the served tasks). Groups the
// tab-scoped tasks prop by (repo, plan_file); a plan is ACTIVE when it
// has >= 1 non-done task (done-only plans never render — the board is
// the PRESENT; history lives in the sidebar/History). Zero actives ->
// the card hides (the coupling hidden-at-0 precedent). Sort: most-
// recently-active first (max last_event_ts DESC, nulls LAST, ties by
// repo then basename — deterministic). Task ids render SHORT via
// split(" - ").pop() (the KpiRow busiest-task precedent; the full ref
// rides title attrs — it embeds the plan path, which the row header
// already names). The tracker is a MIRROR (the pet law): statuses flip
// in the plan files, never here.

import type { Task } from "./api";
import { DisclosureTable } from "./accessibleData";
import { CollectionPager, SectionHeading, Surface, useBoundedPage } from "./ui";

const shortId = (ref: string) => ref.split(" - ").pop() ?? ref;
const basename = (p: string) => p.replace(/\\/g, "/").split("/").pop() ?? p;

export interface PlanGroup {
  repo: string;
  planFile: string;
  base: string;
  tasks: Task[];        // served (plan) order
  done: number;
  inProgress: Task[];
  nextUp: Task | null;  // the first pending
  maxTs: string;        // "" when every last_event_ts is null
}

export function groupActivePlans (tasks: Task[]): PlanGroup[] {
  const map = new Map<string, Task[]>();
  for (const t of tasks) {
    const k = JSON.stringify([t.repo, t.plan_file]);
    map.set(k, [...(map.get(k) ?? []), t]);
  }
  const groups: PlanGroup[] = [];
  for (const list of map.values()) {
    if (!list.some((t) => t.status !== "done")) continue; // done-only: never
    const t0 = list[0];
    groups.push({
      repo: t0.repo,
      planFile: t0.plan_file,
      base: basename(t0.plan_file),
      tasks: list,
      done: list.filter((t) => t.status === "done").length,
      inProgress: list.filter((t) => t.status === "in-progress"),
      nextUp: list.find((t) => t.status === "pending") ?? null,
      maxTs: list.reduce(
        (a, t) => (t.last_event_ts && t.last_event_ts > a ? t.last_event_ts : a), ""),
    });
  }
  groups.sort((a, b) => {
    if (a.maxTs !== b.maxTs) {
      if (a.maxTs === "") return 1;  // nulls LAST
      if (b.maxTs === "") return -1;
      return b.maxTs.localeCompare(a.maxTs); // DESC
    }
    return a.repo === b.repo
      ? a.base.localeCompare(b.base)
      : a.repo.localeCompare(b.repo);
  });
  return groups;
}

// Scope patterns are declarations, not literal File Story destinations.
function DeclaredFile ({ repo, file, compact = false, onOpenFileStory }: {
  repo: string;
  file: string;
  compact?: boolean;
  onOpenFileStory: (repo: string, file: string) => void;
}) {
  if (/[*?]/.test(file)) {
    return (
      <span className="min-w-0 break-all rounded bg-ui-raised px-1.5 py-0.5 font-mono text-xs text-ui-muted">
        <span className="font-sans">pattern</span>{" "}{file}
      </span>
    );
  }
  const label = `Open file story for ${file} in ${repo}`;
  return (
    <button type="button" onClick={() => onOpenFileStory(repo, file)}
      aria-label={label} title={label}
      className={compact
        ? "min-w-0 break-all rounded bg-ui-raised px-1.5 py-0.5 text-xs text-sky-300 hover:bg-ui-border"
        : "ui-focus-ring inline-flex min-h-6 min-w-6 max-w-full break-all items-center rounded font-mono text-sky-300 hover:underline"}>
      {compact ? basename(file) : file}
    </button>
  );
}

function DeclaredFiles ({ task, onOpenFileStory }: {
  task: Task;
  onOpenFileStory: (repo: string, file: string) => void;
}) {
  const pager = useBoundedPage({
    identity: ["active-plan-declared-files", task.repo, task.plan_file, task.task_ref],
    totalItems: task.files.length,
    pageSize: 50,
  });
  if (task.files.length === 0) return <>—</>;
  return (
    <div className="min-w-0 max-w-xl">
      <div className="flex min-w-0 flex-wrap gap-1">
        {task.files.slice(pager.start, pager.end).map((file, fileOrdinal) => (
          <DeclaredFile key={JSON.stringify([file, pager.start + fileOrdinal])}
            repo={task.repo} file={file} onOpenFileStory={onOpenFileStory} />
        ))}
      </div>
      {task.files.length > 50 && (
        <CollectionPager collectionLabel={`Declared files for ${task.repo}: ${task.task_ref}`}
          page={pager} onPageChange={pager.setPage} className="mt-2" />
      )}
    </div>
  );
}

const SEG: Record<Task["status"], string> = {
  done: "#14b8a6", "in-progress": "#f59e0b", pending: "#334155",
};

export function PlanBoard ({ tasks, onOpenFileStory }: {
  tasks: Task[];
  onOpenFileStory: (repo: string, file: string) => void;
}) {
  const plans = groupActivePlans(tasks);
  const pager = useBoundedPage({
    identity: ["active-plan-board", ...plans.map((plan) =>
      JSON.stringify([plan.repo, plan.planFile]))],
    totalItems: plans.length,
    pageSize: 50,
  });
  if (plans.length === 0) return null; // the hidden-at-0 precedent
  const planTasks = plans.flatMap((plan) => plan.tasks);
  return (
    <Surface data-reveal tone="quiet">
      <SectionHeading level={4} title="Active plans"
        description="The missions currently in motion." />
      <div className="ui-work-list">
        {plans.slice(pager.start, pager.end).map((p) => (
          <div key={JSON.stringify([p.repo, p.planFile])} className="min-w-0 border-b border-ui-border p-4 last:border-b-0">
            <div className="flex min-w-0 flex-wrap items-baseline gap-2 text-base">
              <span className="min-w-0 break-all font-semibold text-ui-text">{p.base}</span>
              <span className="min-w-0 break-all rounded bg-ui-raised px-1.5 py-0.5 text-xs text-ui-muted">
                {p.repo}
              </span>
              <span className="ml-auto text-xs text-ui-muted">
                {p.done}/{p.tasks.length} done
              </span>
            </div>
            {/* the segmented bar — one segment per task, served order */}
            <div className="mt-1 flex h-2 gap-0.5 overflow-hidden rounded" aria-hidden="true">
              {p.tasks.map((t) => (
                <span key={t.task_ref}
                  className={`h-full flex-1 ${t.status === "in-progress" ? "pulse-dot" : ""}`}
                  style={{ backgroundColor: SEG[t.status] }}
                  title={`${shortId(t.task_ref)} — ${t.status}`} />
              ))}
            </div>
            {/* the spotlight(s): normally ONE per repo (the discipline
                rule); the board renders whatever exists — the guard nags */}
            {p.inProgress.map((t) => (
              <div key={t.task_ref} className="mt-3 min-w-0 rounded-control bg-ui-raised/60 px-3 py-3 text-base">
                <div>
                  <span className="font-mono text-xs text-amber-300"
                    title={t.task_ref}>{shortId(t.task_ref)}</span>{" "}
                  <span className="break-words [overflow-wrap:anywhere] font-semibold text-ui-text">{t.title}</span>
                </div>
                {t.why && (
                  <p className="mt-0.5 break-words text-xs text-slate-400">
                    {t.why}
                  </p>
                )}
                {t.files.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {t.files.slice(0, 4).map((f, fileOrdinal) => (
                      <DeclaredFile key={JSON.stringify([f, fileOrdinal])}
                        repo={t.repo} file={f} compact onOpenFileStory={onOpenFileStory} />
                    ))}
                    {t.files.length > 4 && (
                      <span className="self-center text-xs text-ui-muted">
                        +{t.files.length - 4}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
            {p.inProgress.length === 0 && (
              <p className="mt-2 text-xs text-ui-muted">No task in progress</p>
            )}
            {p.nextUp && (
              <p className="mt-1 text-xs text-slate-400">
                next up:{" "}
                <span className="font-mono text-xs"
                  title={p.nextUp.task_ref}>{shortId(p.nextUp.task_ref)}</span>{" "}
                {p.nextUp.title}
              </p>
            )}
          </div>
        ))}
      </div>
      {plans.length > 50 && (
        <CollectionPager collectionLabel="Active plans" page={pager}
          onPageChange={pager.setPage} className="mt-3" />
      )}
      <DisclosureTable
        label="Active plan tasks"
        summary={`${plans.length} active plan${plans.length === 1 ? "" : "s"} contain `
          + `${planTasks.length} task${planTasks.length === 1 ? "" : "s"}.`}
        rows={planTasks}
        rowKey={(task) => JSON.stringify([task.repo, task.plan_file, task.task_ref])}
        identity={["active-plan-tasks", ...plans.map((plan) =>
          JSON.stringify([plan.repo, plan.planFile]))]}
        columns={[
          { key: "repo", label: "Repository", render: (task) => task.repo,
            sortValue: (task) => task.repo },
          { key: "plan", label: "Plan", render: (task) =>
            <span className="break-all font-mono">{task.plan_file}</span>,
            sortValue: (task) => task.plan_file },
          { key: "task", label: "Task", render: (task) =>
            <span className="break-words font-mono">{task.task_ref}</span>,
            sortValue: (task) => task.task_ref },
          { key: "title", label: "Title", render: (task) => task.title,
            sortValue: (task) => task.title },
          { key: "status", label: "Status", render: (task) => task.status,
            sortValue: (task) => task.status },
          { key: "files", label: "Declared files", render: (task) =>
            <DeclaredFiles task={task} onOpenFileStory={onOpenFileStory} /> },
        ]}
        className="mt-3 border-t border-slate-800 pt-3"
      />
    </Surface>
  );
}
