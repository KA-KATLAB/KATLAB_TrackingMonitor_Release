import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { api, createActionDeadline } from "./api";
import type { HealthPayload } from "./api";
import { DialogShell } from "./dialog";
import { DialogStatus } from "./dialogStatus";
import { fmtMinutes, fmtRel, fmtTs } from "./format";
import { decodeChronicleHealth, hookRegistrationLabel } from "./healthModel";
import { startHealthRequest } from "./healthRequest";
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

export function HealthBody ({ data, receivedAt }: {
  data: HealthPayload;
  receivedAt: string;
}): JSX.Element {
  const { server, repos, activity, providers } = data;
  const chronicle = decodeChronicleHealth(data);
  const activityAvailable = activity !== undefined && activity !== null;
  const providersAvailable = Array.isArray(providers);
  const missingNames = [
    activityAvailable ? null : "activity inbox",
    providersAvailable ? null : "provider health",
    chronicle.kind === "missing" ? "Chronicle worker health" : null,
  ].filter((value): value is string => value !== null);
  const missingExtensions = missingNames.length > 1
    ? `${missingNames.slice(0, -1).join(", ")} and ${missingNames[missingNames.length - 1]}`
    : missingNames[0] ?? "";
  const chronicleText = chronicle.kind !== "state"
    ? chronicle.kind === "missing" ? "not reported" : "health data invalid"
    : chronicle.state === "running" ? "worker running"
    : chronicle.state === "disabled" ? "disabled for this mode"
    : "worker unavailable";
  const chronicleColor = chronicle.kind === "state" && chronicle.state === "running"
    ? "text-teal-300"
    : chronicle.kind === "state" && chronicle.state === "disabled"
    ? "text-ui-muted" : "text-amber-300";
  const watchersOk = server.watchers_alive === server.watchers_total;
  const uptimeMin = Math.max(0, Math.round(
    (new Date(receivedAt).getTime() - new Date(server.started_ts).getTime()) / 60_000,
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
      <Row label="Chronicle">
        <span className={chronicleColor}>{chronicleText}</span>
      </Row>
      <Row label="hook">
        <span
          title={server.hook_settings_path}
          className={server.hook_registered ? "text-teal-300" : "text-rose-300"}
        >
          {hookRegistrationLabel(server.hook_registered)}
        </span>
      </Row>

      {missingExtensions && (
        <div className="mt-3 rounded-control border border-amber-700 bg-amber-950/30 p-3 text-amber-200">
          <p className="font-semibold">Additional health data unavailable</p>
          <p className="mt-1">
            Server v{server.version} did not provide {missingExtensions}. Restart
            TrackingMonitor to load matching backend and frontend code.
          </p>
        </div>
      )}

      {chronicle.kind === "invalid" && (
        <div className="mt-3 rounded-control border border-amber-700 bg-amber-950/30 p-3 text-amber-200">
          Chronicle health data has an unexpected shape; worker state cannot be confirmed.
        </div>
      )}

      {activityAvailable && (
        <>
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
        </>
      )}

      {providersAvailable && (
        <>
          <h3 className="mb-1 mt-3 font-semibold text-slate-300">Providers</h3>
          {providers.length === 0 ? (
            <p className="text-ui-muted">No provider health records.</p>
          ) : providers.map((provider) => (
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
        </>
      )}

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

export interface HealthSnapshot {
  data: HealthPayload;
  receivedAt: string;
}

export function HealthSnapshotContent ({ snapshot, error, busy, onRefresh }: {
  snapshot: HealthSnapshot | null;
  error: string;
  busy: boolean;
  onRefresh: () => void;
}): JSX.Element {
  const status = busy
    ? snapshot ? "Refreshing system health; showing the last successful response." : "Loading system health."
    : error ? `${error} Retry is available.${snapshot ? " Showing the last successful response." : ""}`
    : snapshot ? `System health updated. Received locally: ${fmtTs(snapshot.receivedAt)}.` : "";
  return (
    <>
      <DialogStatus>{status}</DialogStatus>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 break-words text-xs text-ui-muted">
          {snapshot ? <>Received locally: <time dateTime={snapshot.receivedAt}>
            {fmtTs(snapshot.receivedAt)}</time></> : "No health response received yet."}
        </p>
        <button type="button" className="ui-control shrink-0 bg-ui-raised"
          disabled={busy} aria-busy={busy} onClick={onRefresh}>
          {busy ? snapshot ? "Refreshing…" : "Loading…" : error ? "Retry" : "Refresh"}
        </button>
      </div>
      {error && (
        <div className="mb-3 rounded-control border border-rose-700 bg-rose-950/30 p-3 text-xs text-rose-200">
          <p className="break-words">{error}</p>
        </div>
      )}
      {snapshot && (busy || error) && (
        <p className="mb-3 text-xs text-amber-300">
          {busy ? "Refreshing. " : "Refresh failed. "}
          Showing the last successful response; it has not been updated.
        </p>
      )}
      {busy && !snapshot && <p className="text-xs text-ui-muted">Loading system health…</p>}
      {snapshot && <HealthBody data={snapshot.data} receivedAt={snapshot.receivedAt} />}
    </>
  );
}

export function HealthModal ({ onClose, onStatus }: {
  onClose: () => void;
  onStatus: (message: string) => void;
}): JSX.Element {
  const [snapshot, setSnapshot] = useState<HealthSnapshot | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [retryNonce, setRetryNonce] = useState(0);
  const retryPendingRef = useRef(false);

  useEffect(() => {
    retryPendingRef.current = true;
    setBusy(true);
    setError("");
    return startHealthRequest({
      action: createActionDeadline(),
      request: api.health,
      onResult: (result) => {
        retryPendingRef.current = false;
        setBusy(false);
        if (result.ok) {
          setSnapshot({ data: result.data, receivedAt: new Date().toISOString() });
          if (retryNonce > 0) onStatus("System health updated.");
        } else {
          setError(result.error);
          onStatus(`${result.error} Retry is available.`);
        }
      },
    });
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
      description="Watcher, Chronicle worker, capture, and repository snapshot. Refresh to check again."
      onClose={onClose}
      backdropClose
      closeLabel="Close system health"
      panelClassName="max-w-md"
    >
      <HealthSnapshotContent snapshot={snapshot} error={error} busy={busy} onRefresh={retry} />
    </DialogShell>
  );
}
