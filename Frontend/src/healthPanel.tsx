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
import { decodeAppVersion, UI_BUILD_VERSION } from "./appVersion";

const UPGRADE_GUIDANCE = "If updating: stop Tracker and demo, rebuild the UI, restart Tracker, then reload this tab.";

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
    <div className="grid min-w-0 grid-cols-1 gap-1 py-2 sm:grid-cols-[minmax(7rem,10rem)_minmax(0,1fr)] sm:gap-3">
      <span className="min-w-0 text-xs text-ui-muted [overflow-wrap:anywhere]">{label}</span>
      <span className="min-w-0 text-base leading-6 tabular-nums text-ui-text [overflow-wrap:anywhere]">{children}</span>
    </div>
  );
}

export function HealthBody ({ data, receivedAt }: {
  data: HealthPayload;
  receivedAt: string;
}): JSX.Element {
  const { server, repos, activity, providers } = data;
  const serverVersion = decodeAppVersion(server.version);
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
    <div className="min-w-0 space-y-4 text-base leading-6">
      <section aria-labelledby="health-server-heading" className="min-w-0 rounded-panel border border-ui-border bg-ui-surface p-4">
        <h3 id="health-server-heading" className="mb-3 text-base font-semibold text-ui-text">Server</h3>
        <Row label="server version">{serverVersion ?? "Unknown"}</Row>
        {serverVersion !== null && serverVersion !== UI_BUILD_VERSION && (
          <p className="my-3 rounded-control border border-ui-border bg-ui-raised p-3 text-sky-200">
            UI build and server versions differ. This does not indicate which is newer
            or healthy.{!missingExtensions && <> {UPGRADE_GUIDANCE}</>}
          </p>
        )}
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
              Server version {serverVersion ?? "Unknown"} did not provide {missingExtensions}.
              {" "}Missing fields do not establish a version mismatch. {UPGRADE_GUIDANCE}
            </p>
          </div>
        )}

        {chronicle.kind === "invalid" && (
          <div className="mt-3 rounded-control border border-amber-700 bg-amber-950/30 p-3 text-amber-200">
            Chronicle health data has an unexpected shape; worker state cannot be confirmed.
          </div>
        )}
      </section>

      {activityAvailable && (
        <section aria-labelledby="health-activity-heading" className="min-w-0 rounded-panel border border-ui-border bg-ui-surface p-4">
          <h3 id="health-activity-heading" className="mb-3 text-base font-semibold text-ui-text">Activity inbox</h3>
          <Row label="pending">{activity.pending}</Row>
          <Row label="rejected">{activity.rejected}</Row>
          <Row label="unscoped">{activity.ignored_unscoped} ignored</Row>
          <Row label="registry mismatch">
            <span className={activity.registry_revision_mismatch > 0
              ? "text-amber-300" : "text-ui-text"}>
              {activity.registry_revision_mismatch}
            </span>
          </Row>
        </section>
      )}

      {providersAvailable && (
        <section aria-labelledby="health-providers-heading" className="min-w-0 rounded-panel border border-ui-border bg-ui-surface p-4">
          <h3 id="health-providers-heading" className="mb-3 text-base font-semibold text-ui-text">Providers</h3>
          {providers.length === 0 ? (
            <p className="text-ui-muted">No provider health records.</p>
          ) : providers.map((provider) => (
            <div key={provider.provider}
              className="mb-3 min-w-0 rounded-panel border border-ui-border/60 bg-ui-canvas px-3 py-2 last:mb-0">
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
        </section>
      )}

      <section aria-labelledby="health-repositories-heading" className="min-w-0 rounded-panel border border-ui-border bg-ui-surface p-4">
        <h3 id="health-repositories-heading" className="mb-3 text-base font-semibold text-ui-text">Repositories</h3>
        <div id="health-repos">
          {visibleRepos.map((repo) => (
            <div
              key={repo.id}
              className="grid min-w-0 grid-cols-1 gap-x-3 gap-y-2 border-b border-ui-border/50 py-3 last:border-0 [overflow-wrap:anywhere] sm:grid-cols-[minmax(7rem,1fr)_minmax(0,1fr)]"
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
              <span className={repo.warning_count > 0 ? "text-amber-300" : "text-slate-400"}>
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
      </section>
    </div>
  );
}

export function HealthButton ({ onClick }: { onClick: () => void }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="System health"
      aria-haspopup="dialog"
      title="System health"
      className="ui-control border-0 bg-transparent text-ui-muted hover:bg-ui-raised hover:text-ui-text"
    >
      System
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
      <div className="mb-4 rounded-panel bg-ui-canvas px-3 py-2 text-sm">
        <Row label="UI build">v{UI_BUILD_VERSION}</Row>
        <p className="text-xs text-ui-muted">The version of the interface loaded in this tab.</p>
      </div>
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
      panelClassName="max-w-2xl"
    >
      <HealthSnapshotContent snapshot={snapshot} error={error} busy={busy} onRefresh={retry} />
    </DialogShell>
  );
}
