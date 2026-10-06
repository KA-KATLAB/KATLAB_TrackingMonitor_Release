import type { ReactNode } from "react";
import type { Repo } from "./api";
import { fmtRel } from "./format";
import { scopeLabel } from "./navigation";
import type { Scope } from "./navigation";
import { ControlButton } from "./ui";
import type { WsConnectionState } from "./ws";
import { ApplicationBrand } from "./ApplicationBrand";

/** Presentation only; App retains navigation, requests and action ownership. */
export function AppShell ({ actions, context, children, onSystem }: {
  actions: ReactNode;
  context: ReactNode;
  children?: ReactNode;
  onSystem: () => void;
}): JSX.Element {
  return (
    <header className="ui-safe-header app-shell-header shrink-0 border-b border-ui-border bg-ui-surface">
      <div className="app-header-primary">
        <ApplicationBrand onSystem={onSystem} />
        <div className="app-header-actions">{actions}</div>
      </div>
      {context}
      {children}
    </header>
  );
}

export function AppShellNavigation ({ children }: { children: ReactNode }): JSX.Element {
  return (
    <aside className="app-shell-navigation" aria-label="Workspace navigation">
      <p className="app-navigation-label">Workspace</p>
      {children}
    </aside>
  );
}

export function ConnectionStatus ({ state }: { state: WsConnectionState }): JSX.Element {
  const label = state === "connected" ? "Connected" : state === "reconnecting" ? "Reconnecting" : "Connecting";
  return (
    <span className="app-connection text-xs text-ui-muted"
      title="WebSocket connection only; not proof of fresh data or verification readiness.">
      <span aria-hidden="true" className={"h-2 w-2 shrink-0 rounded-full "
        + (state === "connected" ? "bg-ui-live" : "bg-ui-warning")} />
      {label}
    </span>
  );
}

export function WorkspaceContext ({ scope, repos, ready, error, violationOf, onDetails }: {
  scope: Scope;
  repos: readonly Repo[];
  ready: boolean;
  error: string;
  violationOf: (repo: string) => number | null;
  onDetails: () => void;
}): JSX.Element {
  const online = repos.filter((repo) => !repo.offline);
  const known = online.filter((repo) => repo.status_valid === true);
  const unknown = online.length - known.length;
  const unavailable = repos.length - online.length;
  const selected = scope.kind === "repo" ? repos.find((repo) => repo.id === scope.id) : undefined;
  const violations = repos.map((repo) => ({ id: repo.id, count: violationOf(repo.id) }))
    .filter((item) => item.count !== null);
  const summary = !ready
    ? error ? "Workspace snapshot unavailable" : "Waiting for workspace snapshot"
    : scope.kind === "repo" && !selected ? "Selected repository unavailable"
    : repos.length === 0 ? "No repositories configured"
    : scope.kind === "repo" && selected?.offline ? "Repository unavailable"
    : online.length === 0 ? "No online repositories"
    : known.length === 0 ? "Git status unavailable"
    : `${known.filter((repo) => repo.clean).length}/${known.length} known statuses clean · ${known.reduce((sum, repo) => sum + repo.count, 0)} known uncommitted changes`;
  return (
    <div className="app-workspace-context text-xs text-ui-muted">
      <span className="min-w-0 break-words [overflow-wrap:anywhere] font-medium text-ui-text">{scopeLabel(scope)}</span>
      <span>{summary}</span>
      {ready && error && <span className="text-amber-300">Refresh failed; showing the last workspace snapshot</span>}
      {ready && unavailable > 0 && <span className="text-amber-300">{unavailable} unavailable</span>}
      {ready && unknown > 0 && <span className="text-amber-300">{unknown} Git status unknown</span>}
      {ready && selected?.branch && <span className="min-w-0 break-words [overflow-wrap:anywhere]">{!selected.offline && selected.status_valid === true ? "Branch" : "Last-known branch"}: {selected.branch}</span>}
      {ready && selected && <span>{selected.last_event_ts ? `Last capture ${fmtRel(selected.last_event_ts)}` : "No captures yet"}</span>}
      {ready && violations.length > 0 && <span className="text-amber-300">{violations.length} discipline warning{violations.length === 1 ? "" : "s"}</span>}
      <ControlButton onClick={onDetails} className="ml-auto text-xs">Repository status</ControlButton>
    </div>
  );
}
