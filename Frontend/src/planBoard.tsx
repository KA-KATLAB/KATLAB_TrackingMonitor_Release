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
    <Surface data-reveal>
      <SectionHeading level={4} title="Active plans"
        description="The missions currently in motion." />
      <div className="space-y-3">
        {plans.slice(pager.start, pager.end).map((p) => (
          <div key={JSON.stringify([p.repo, p.planFile])}>
            <div className="flex items-baseline gap-2 text-sm">
              <span className="font-bold text-slate-100">{p.base}</span>
              <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[11px] text-slate-300">
                {p.repo}
              </span>
              <span className="ml-auto text-[11px] text-slate-400">
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
              <div key={t.task_ref} className="mt-2 rounded bg-slate-800/60 px-3 py-2 text-sm">
                <div>
                  <span className="font-mono text-[11px] text-amber-300"
                    title={t.task_ref}>{shortId(t.task_ref)}</span>{" "}
                  <span className="font-bold text-slate-100">{t.title}</span>
                </div>
                {t.why && (
                  <p className="mt-0.5 break-words text-xs text-slate-400">
                    {t.why}
                  </p>
                )}
                {t.files.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {t.files.slice(0, 4).map((f, fileOrdinal) => (
                      <button key={JSON.stringify([f, fileOrdinal])} type="button"
                        onClick={() => onOpenFileStory(t.repo, f)}
                        aria-label={`${f} — open file story`}
                        title={`${f} — open the file story`}
                        className="rounded bg-slate-800 px-1.5 py-0.5 text-[11px] text-sky-300 hover:bg-slate-700">
                        {basename(f)}
                      </button>
                    ))}
                    {t.files.length > 4 && (
                      <span className="self-center text-[11px] text-slate-500">
                        +{t.files.length - 4}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
            {p.inProgress.length === 0 && (
              <p className="mt-1 text-xs text-slate-500">no task in progress</p>
            )}
            {p.nextUp && (
              <p className="mt-1 text-xs text-slate-400">
                next up:{" "}
                <span className="font-mono text-[11px]"
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
          { key: "files", label: "Declared files", render: (task) => task.files.length === 0
            ? "—"
            : <span className="flex max-w-xl flex-wrap gap-1">{task.files.map((file, fileOrdinal) => (
              <button key={JSON.stringify([file, fileOrdinal])} type="button"
                onClick={() => onOpenFileStory(task.repo, file)}
                className="ui-focus-ring inline-flex min-h-6 min-w-6 items-center rounded font-mono text-sky-300 hover:underline">
                {file}
              </button>
            ))}</span> },
        ]}
        className="mt-3 border-t border-slate-800 pt-3"
      />
    </Surface>
  );
}
