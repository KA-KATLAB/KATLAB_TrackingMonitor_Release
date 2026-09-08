import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { api, createActionDeadline, isAbortError } from "./api";
import type { HealthPayload } from "./api";
import { DialogShell } from "./dialog";
import { fmtMinutes, fmtRel, fmtTs } from "./format";
import { CollectionPager, useBoundedPage } from "./ui";

function fmtBytes (bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function Row ({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(7rem,10rem)_minmax(0,1fr)] gap-2 py-1">
      <span className="text-ui-muted">{label}</span>
      <span className="min-w-0 break-words text-ui-text">{children}</span>
    </div>
  );
}

export function HealthBody ({ data }: { data: HealthPayload }): JSX.Element {
  const { server, repos, activity, providers } = data;
  const watchersOk = server.watchers_alive === server.watchers_total;
  const uptimeMin = Math.max(0, Math.round(
    (Date.now() - new Date(server.started_ts).getTime()) / 60_000,
  ));
  const pager = useBoundedPage({
    identity: ["health-repos"],
    totalItems: repos.length,
    pageSize: 50,
  });
  const visibleRepos = repos.slice(pager.start, pager.end);

  return (
    <div className="min-w-0 text-xs">
      <h3 className="mb-1 font-semibold text-slate-300">Server</h3>
      <Row label="version">{server.version}</Row>
      <Row label="uptime">{fmtMinutes(uptimeMin)}</Row>
      <Row label="database">
        {server.db_bytes === null ? "—" : fmtBytes(server.db_bytes)}
      </Row>
      <Row label="watchers">
        <span className={watchersOk ? "text-teal-300" : "text-rose-300"}>
          {server.watchers_alive}/{server.watchers_total} alive
        </span>
      </Row>
      <Row label="hook">
        <span
          title={server.hook_settings_path}
          className={server.hook_registered ? "text-teal-300" : "text-rose-300"}
        >
          {server.hook_registered ? "line present ✓" : "line missing ✕"}
        </span>
      </Row>

      <h3 className="mb-1 mt-3 font-semibold text-slate-300">Activity inbox</h3>
      <Row label="pending">{activity.pending}</Row>
      <Row label="rejected">{activity.rejected}</Row>
      <Row label="unscoped">{activity.ignored_unscoped} ignored</Row>
      <Row label="registry mismatch">
        <span className={activity.registry_revision_mismatch > 0
          ? "text-amber-300" : "text-ui-text"}>
          {activity.registry_revision_mismatch}
        </span>
      </Row>

      <h3 className="mb-1 mt-3 font-semibold text-slate-300">Providers</h3>
      {providers.map((provider) => (
        <div key={provider.provider}
          className="mb-2 rounded-control border border-ui-border/60 px-2 py-1 last:mb-0">
          <Row label="provider">{provider.provider}</Row>
          <Row label="adapter">
            <span className={provider.adapter_present ? "text-teal-300" : "text-rose-300"}>
              {provider.adapter_present ? "present" : "missing"}
            </span>
          </Row>
          <Row label="configuration">
            <span className={provider.configuration_valid ? "text-teal-300" : "text-amber-300"}>
              {provider.configuration_state.replaceAll("_", " ")}
            </span>
          </Row>
          <Row label="observed">
            <span className={provider.recently_observed ? "text-teal-300" : "text-ui-muted"}>
              {provider.last_observed_at ? fmtRel(provider.last_observed_at) : "never"}
              {provider.recently_observed ? " · recent" : ""}
            </span>
          </Row>
        </div>
      ))}

      <h3 className="mb-1 mt-3 font-semibold text-slate-300">Repositories</h3>
      <div id="health-repos">
        {visibleRepos.map((repo) => (
          <div
            key={repo.id}
            className="grid min-w-0 grid-cols-[minmax(7rem,1fr)_auto] gap-x-2 border-b border-ui-border/50 py-1.5 last:border-0"
          >
            <span className="min-w-0 break-all text-ui-muted">
              {repo.id}
              {repo.offline && (
                <span className="ml-1 rounded bg-ui-raised px-1 text-xs text-amber-300">
                  offline
                </span>
              )}
            </span>
            <span className="text-ui-text">
              {repo.last_event_ts ? fmtRel(repo.last_event_ts) : "never"}
            </span>
            <span
              className="text-ui-muted"
              {...(repo.events_jsonl_mtime
                ? { title: "last log write: " + fmtTs(repo.events_jsonl_mtime) }
                : {})}
            >
              {repo.events_jsonl_bytes === null ? "—" : fmtBytes(repo.events_jsonl_bytes)}
            </span>
            <span className={repo.warning_count > 0 ? "text-amber-300" : "text-slate-500"}>
              {repo.warning_count} warning{repo.warning_count === 1 ? "" : "s"}
            </span>
          </div>
        ))}
      </div>
      {repos.length > 50 && (
        <CollectionPager
          collectionLabel="Health repositories"
          controlsId="health-repos"
          page={pager}
          onPageChange={pager.setPage}
          className="mt-3 border-t border-ui-border pt-3"
        />
      )}
    </div>
  );
}

export function HealthButton ({ onClick }: { onClick: () => void }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="System health"
      title="System health"
      className="ui-control border-0 bg-transparent text-ui-muted hover:bg-ui-raised hover:text-ui-text"
    >
      sys
    </button>
  );
}

export function HealthModal ({ onClose, onStatus }: {
  onClose: () => void;
  onStatus: (message: string) => void;
}): JSX.Element {
  const [data, setData] = useState<HealthPayload | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [retryNonce, setRetryNonce] = useState(0);
  const retryPendingRef = useRef(false);

  useEffect(() => {
    let alive = true;
    const action = createActionDeadline();
    retryPendingRef.current = false;
    setBusy(true);
    setError("");
    void api.health(action.signal).then((payload) => {
      if (!alive || action.signal.aborted) return;
      setData(payload);
      if (retryNonce > 0) onStatus("System health recovered.");
    }, (errorValue) => {
      if (!alive || (isAbortError(errorValue) && !action.didTimeout())) return;
      const message = action.didTimeout()
        ? "System health timed out after 10 seconds."
        : `System health failed: ${String(errorValue).slice(0, 120)}`;
      setError(message);
      onStatus(`${message} Retry is available.`);
    }).finally(() => {
      action.clear();
      if (alive) setBusy(false);
    });
    return () => {
      alive = false;
      action.controller.abort();
      action.clear();
    };
  }, [onStatus, retryNonce]);

  const retry = (): void => {
    if (busy || retryPendingRef.current) return;
    retryPendingRef.current = true;
    setBusy(true);
    setRetryNonce((value) => value + 1);
  };

  return (
    <DialogShell
      title="System health"
      description="Watcher, capture, and repository status at open time."
      onClose={onClose}
      backdropClose
      closeLabel="Close system health"
      panelClassName="max-w-md"
    >
      {error && (
        <div className="rounded-control border border-rose-700 bg-rose-950/30 p-3 text-xs text-rose-200">
          <p>{error}</p>
          <button type="button" className="ui-control mt-2 bg-ui-raised"
            disabled={busy} aria-busy={busy}
            onClick={retry}>
            Retry
          </button>
        </div>
      )}
      {busy && !data && <p className="text-xs text-ui-muted">Loading system health…</p>}
      {data && <HealthBody data={data} />}
    </DialogShell>
  );
}
