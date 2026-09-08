import { useEffect, useRef, useState } from "react";
import { api, createActionDeadline, isAbortError } from "./api";
import type { TrackedEvent } from "./api";
import { DialogShell } from "./dialog";
import { ExternalLinkIcon } from "./icons";
import { fmtMinutes, fmtTs } from "./format";
import {
  EFFORT_GAP_MAX_MIN,
  EFFORT_TAIL_MIN,
  MODE_BADGE,
  MODE_COLOR,
  eventSessionIdentity,
  sessionColor,
} from "./theme";
import { CollectionPager, useBoundedPage } from "./ui";

const API_PAGE = 500;
const MAX_PAGES = 3;

interface FileStoryProps {
  repo: string;
  file: string;
  repoPath: string | null;
  repoBranch: string | null;
  onClose: () => void;
  onStatus: (message: string) => void;
}

export function FileStory ({
  repo,
  file,
  repoPath,
  repoBranch,
  onClose,
  onStatus,
}: FileStoryProps): JSX.Element {
  const [rows, setRows] = useState<TrackedEvent[] | null>(null);
  const [error, setError] = useState("");
  const [truncated, setTruncated] = useState(false);
  const [busy, setBusy] = useState(true);
  const [retryNonce, setRetryNonce] = useState(0);
  const retryPendingRef = useRef(false);

  useEffect(() => {
    let alive = true;
    const action = createActionDeadline();
    retryPendingRef.current = false;
    setBusy(true);
    setError("");
    (async () => {
      try {
        const all: TrackedEvent[] = [];
        for (let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex++) {
          const page = await api.events({
            repo,
            file,
            limit: API_PAGE,
            offset: pageIndex * API_PAGE,
          }, action.signal);
          all.push(...page);
          if (page.length < API_PAGE) {
            if (alive) setTruncated(false);
            break;
          }
          if (pageIndex === MAX_PAGES - 1 && alive) setTruncated(true);
        }
        all.sort((a, b) => a.ts.localeCompare(b.ts));
        if (alive && !action.signal.aborted) {
          setRows(all);
          if (retryNonce > 0) onStatus("File story recovered.");
        }
      } catch (errorValue) {
        if (!alive || (isAbortError(errorValue) && !action.didTimeout())) return;
        const message = action.didTimeout()
          ? "File story timed out after 10 seconds."
          : `File story failed: ${String(errorValue).slice(0, 120)}`;
        setError(message);
        onStatus(`${message} Retry is available.`);
      } finally {
        action.clear();
        if (alive) setBusy(false);
      }
    })();
    return () => {
      alive = false;
      action.controller.abort();
      action.clear();
    };
  }, [file, onStatus, repo, retryNonce]);

  const retry = (): void => {
    if (busy || retryPendingRef.current) return;
    retryPendingRef.current = true;
    setBusy(true);
    setRetryNonce((value) => value + 1);
  };

  const pager = useBoundedPage({
    identity: ["file-story", repo, file],
    totalItems: rows?.length ?? 0,
    pageSize: 50,
  });
  const visibleRows = rows?.slice(pager.start, pager.end) ?? [];

  const gapMs = EFFORT_GAP_MAX_MIN * 60_000;
  let effortMin = 0;
  if (rows && rows.length > 0) {
    let total = 0;
    let blockStart = new Date(rows[0].ts).getTime();
    let previous = blockStart;
    for (const event of rows.slice(1)) {
      const timestamp = new Date(event.ts).getTime();
      if (timestamp - previous > gapMs) {
        total += previous - blockStart + EFFORT_TAIL_MIN * 60_000;
        blockStart = timestamp;
      }
      previous = timestamp;
    }
    total += previous - blockStart + EFFORT_TAIL_MIN * 60_000;
    effortMin = Math.round(total / 60_000);
  }
  const commits = rows
    ? new Set(rows.map((event) => event.commit_hash).filter(Boolean)).size
    : 0;
  const summary = rows && rows.length > 0
    ? (
      <>
        <span>{repo}</span>
        <span aria-hidden="true"> · </span>
        <span>
          {rows.length} event{rows.length === 1 ? "" : "s"} · {fmtTs(rows[0].ts)}
          {" → "}{fmtTs(rows[rows.length - 1].ts)} · {commits} commit
          {commits === 1 ? "" : "s"} · {fmtMinutes(effortMin)}
          {truncated ? " (fetched window)" : ""}
        </span>
      </>
    )
    : repo;
  const editorHref = repoPath
    ? "vscode://file/" + encodeURI(
      (repoPath + "/" + file).replace(/\\/g, "/"),
    ).replace(/#/g, "%23")
    : null;

  return (
    <DialogShell
      title={<span className="break-all font-mono">{file}</span>}
      description={summary}
      onClose={onClose}
      backdropClose
      closeLabel="Close file story"
      headerActions={editorHref && (
        <a
          href={editorHref}
          title="Open in VS Code"
          className="ui-control bg-ui-raised text-sky-300 hover:bg-ui-border"
        >
          <ExternalLinkIcon />
          <span>editor</span>
        </a>
      )}
    >
      <div id="file-story-events" className="min-w-0 text-xs">
        {busy && !rows && <p className="text-ui-muted">Loading file story…</p>}
        {error && (
          <div className="rounded-control border border-rose-700 bg-rose-950/30 p-3 text-rose-200">
            <p>{error}</p>
            <button type="button" className="ui-control mt-2 bg-ui-raised"
              disabled={busy} aria-busy={busy}
              onClick={retry}>
              Retry
            </button>
          </div>
        )}
        {rows?.length === 0 && <p className="text-ui-muted">No events for this file.</p>}
        {visibleRows.map((event, localIndex) => {
          const absoluteIndex = pager.start + localIndex;
          const previous = rows?.[absoluteIndex - 1];
          const session = eventSessionIdentity(event);
          const dayChanged = !previous
            || previous.ts.slice(0, 10) !== event.ts.slice(0, 10);
          const continuation = localIndex === 0 && absoluteIndex > 0 && !dayChanged;
          return (
            <div key={event.id}>
              {(dayChanged || continuation) && (
                <div className="mt-2 border-l-4 border-teal-600 pl-2 text-xs font-semibold text-teal-300">
                  {event.ts.slice(0, 10)} (UTC){continuation ? " — continued" : ""}
                </div>
              )}
              <div className="flex min-w-0 flex-wrap items-center gap-2 py-1 pl-3">
                <span className="text-ui-muted" title={event.ts}>{fmtTs(event.ts)}</span>
                <span
                  className="rounded px-1.5 py-0.5 text-xs font-bold text-white"
                  style={{ backgroundColor: MODE_COLOR[event.mode] }}
                >
                  {MODE_BADGE[event.mode].label}
                </span>
                {event.task_ref && (
                  <span className="min-w-0 break-words text-sky-300">
                    {event.task_ref.split(" - ").pop()}
                  </span>
                )}
                {session && (
                  <span
                    title={`${session.provider} session ${session.sessionId.slice(0, 8)}`}
                    className="inline-block h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: sessionColor(session.provider, session.sessionId) }}
                  />
                )}
                {event.branch && repoBranch && event.branch !== repoBranch && (
                  <span
                    className="min-w-0 break-all text-amber-300/80"
                    title="captured on a different branch than the repo is on now"
                  >
                    ⎇ {event.branch}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {rows && rows.length > 50 && (
        <CollectionPager
          collectionLabel="File story events"
          controlsId="file-story-events"
          page={pager}
          onPageChange={pager.setPage}
          className="mt-3 border-t border-ui-border pt-3"
        />
      )}
      {truncated && (
        <p className="mt-3 text-xs text-amber-300">
          ⚠ Truncated: only the newest {API_PAGE * MAX_PAGES} events were fetched
          — this file had more.
        </p>
      )}
    </DialogShell>
  );
}
