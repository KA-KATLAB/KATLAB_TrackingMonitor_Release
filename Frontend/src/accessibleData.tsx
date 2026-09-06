import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { StatsData } from "./charts";
import { MODE_CHART_LABEL, MODE_ORDER } from "./theme";
import { CollectionPager, ControlButton, useBoundedPage } from "./ui";
import type { CollectionIdentityPart } from "./ui";

type SortValue = string | number | null | undefined;
type SortDirection = "ascending" | "descending";

export interface DisclosureColumn<Row> {
  key: string;
  label: string;
  render: (row: Row) => ReactNode;
  sortValue?: (row: Row) => SortValue;
  headerClassName?: string;
  cellClassName?: string;
}

export interface DisclosureTableProps<Row> {
  label: string;
  summary: ReactNode;
  rows: readonly Row[];
  rowKey: (row: Row, sourceIndex: number) => string;
  columns: readonly DisclosureColumn<Row>[];
  identity: readonly CollectionIdentityPart[];
  emptyMessage?: string;
  initiallyOpen?: boolean;
  className?: string;
}

interface IndexedRow<Row> {
  row: Row;
  ordinal: number;
}

function compareValues (left: SortValue, right: SortValue): number {
  const leftEmpty = left === null || left === undefined
    || (typeof left === "number" && Number.isNaN(left));
  const rightEmpty = right === null || right === undefined
    || (typeof right === "number" && Number.isNaN(right));
  if (leftEmpty || rightEmpty) return leftEmpty === rightEmpty ? 0 : leftEmpty ? 1 : -1;
  if (typeof left === "number" && typeof right === "number") return left - right;
  const a = String(left);
  const b = String(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

function identityKey (identity: readonly CollectionIdentityPart[]): string {
  return JSON.stringify(identity.map((part) => [typeof part, part]));
}

export function DisclosureTable<Row> ({
  label,
  summary,
  rows,
  rowKey,
  columns,
  identity,
  emptyMessage = "No exact-data rows are available.",
  initiallyOpen = false,
  className,
}: DisclosureTableProps<Row>): JSX.Element {
  const generatedId = useId().replace(/:/g, "-");
  const bodyId = `${generatedId}-body`;
  const tableId = `${generatedId}-table`;
  const nextIdentityKey = identityKey(identity);
  const priorIdentityRef = useRef(nextIdentityKey);
  const identityChanged = priorIdentityRef.current !== nextIdentityKey;
  const [open, setOpen] = useState(initiallyOpen);
  const [sort, setSort] = useState<{
    key: string;
    direction: SortDirection;
  } | null>(null);
  const effectiveOpen = identityChanged ? false : open;
  const effectiveSort = identityChanged ? null : sort;

  useEffect(() => {
    if (!identityChanged) return;
    priorIdentityRef.current = nextIdentityKey;
    setOpen(false);
    setSort(null);
  }, [identityChanged, nextIdentityKey]);

  const ordered = useMemo(() => {
    const indexed: IndexedRow<Row>[] = rows.map((row, ordinal) => ({ row, ordinal }));
    if (!effectiveSort) return indexed;
    const column = columns.find((candidate) => candidate.key === effectiveSort.key);
    if (!column?.sortValue) return indexed;
    const direction = effectiveSort.direction === "ascending" ? 1 : -1;
    return [...indexed].sort((left, right) => {
      const compared = compareValues(column.sortValue!(left.row), column.sortValue!(right.row));
      return compared === 0 ? left.ordinal - right.ordinal : compared * direction;
    });
  }, [columns, effectiveSort, rows]);

  const pager = useBoundedPage({
    identity: ["disclosure-table", ...identity,
      effectiveSort?.key ?? "source", effectiveSort?.direction ?? "source"],
    totalItems: ordered.length,
    pageSize: 50,
  });
  const visible = effectiveOpen ? ordered.slice(pager.start, pager.end) : [];

  const toggleSort = (column: DisclosureColumn<Row>): void => {
    if (!column.sortValue) return;
    setSort((current) => current?.key === column.key
      ? { key: column.key, direction: current.direction === "ascending"
        ? "descending" : "ascending" }
      : { key: column.key, direction: "ascending" });
  };

  return (
    <div className={className}>
      <p className="text-xs leading-5 text-ui-muted">{summary}</p>
      <ControlButton
        aria-expanded={effectiveOpen}
        aria-controls={bodyId}
        onClick={() => setOpen((current) => !current)}
        className="mt-2"
      >
        {effectiveOpen ? "Hide" : "Show"} exact data · {rows.length.toLocaleString("en-US")} row
        {rows.length === 1 ? "" : "s"}
      </ControlButton>
      {effectiveOpen && (
        <div id={bodyId} className="mt-2 min-w-0">
          <div role="region" aria-label={`${label}: exact data`}
            className="ui-local-scroller max-w-full overflow-x-auto" tabIndex={0}>
            <table id={tableId} className="w-full min-w-max border-collapse text-left text-xs">
              <caption className="sr-only">{label}: exact data</caption>
              <thead>
                <tr className="border-b border-ui-border text-ui-muted">
                  {columns.map((column) => {
                    const active = effectiveSort?.key === column.key;
                    return (
                      <th key={column.key} scope="col"
                        aria-sort={active ? effectiveSort.direction : undefined}
                        className={`px-2 py-1.5 font-semibold ${column.headerClassName ?? ""}`}>
                        {column.sortValue ? (
                          <button type="button" aria-pressed={active}
                            onClick={() => toggleSort(column)}
                            className="ui-focus-ring inline-flex min-h-6 min-w-6 items-center rounded-control underline decoration-dotted underline-offset-2">
                            {column.label}{active ? effectiveSort.direction === "ascending" ? " ↑" : " ↓" : ""}
                          </button>
                        ) : column.label}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {visible.map(({ row, ordinal }) => (
                  <tr key={rowKey(row, ordinal)} className="border-b border-ui-border/60 last:border-0">
                    {columns.map((column) => (
                      <td key={column.key}
                        className={`max-w-prose px-2 py-1.5 align-top text-ui-text ${column.cellClassName ?? ""}`}>
                        {column.render(row)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {ordered.length === 0 && <p className="mt-2 text-xs text-ui-muted">{emptyMessage}</p>}
          <CollectionPager collectionLabel={`${label} exact data`} controlsId={tableId}
            page={pager} onPageChange={pager.setPage} className="mt-2" />
        </div>
      )}
    </div>
  );
}

export function modeDistributionSummary (stats: StatsData): string {
  const rows = MODE_ORDER.map((mode) => ({ mode, count: stats.mode_counts[mode] ?? 0 }));
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const top = rows.reduce((best, row) => row.count > best.count ? row : best, rows[0]);
  if (total === 0) return "No attributed events are available.";
  return `${total.toLocaleString("en-US")} attributed events; ${MODE_CHART_LABEL[top.mode]} is largest at `
    + `${top.count.toLocaleString("en-US")} (${Math.round((top.count / total) * 100)}%).`;
}

export function eventsPerTaskSummary (stats: StatsData, allScope: boolean): string {
  const rows = stats.events_per_task;
  if (rows.length === 0) return "No task-attributed events are available.";
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const top = rows[0];
  const name = `${allScope ? `${top.repo} · ` : ""}${top.task_ref}`;
  return `${rows.length} ranked task${rows.length === 1 ? "" : "s"} account for `
    + `${total.toLocaleString("en-US")} events; ${name} leads with ${top.count.toLocaleString("en-US")}.`;
}

export function activitySummary (stats: StatsData): string {
  const rows = stats.activity_daily;
  if (rows.length === 0) return "No daily activity is available.";
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const active = rows.filter((row) => row.count > 0).length;
  const peak = rows.reduce((best, row) => row.count > best.count ? row : best, rows[0]);
  return `${total.toLocaleString("en-US")} events across ${active} active UTC day`
    + `${active === 1 ? "" : "s"}; peak ${peak.day} with ${peak.count.toLocaleString("en-US")}.`;
}
