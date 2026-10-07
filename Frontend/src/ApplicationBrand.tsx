import { UI_BUILD_VERSION } from "./appVersion";
import "./workspaceCommandFrame.css";

export function ApplicationBrand ({ onSystem }: { onSystem: () => void }): JSX.Element {
  return (
    <div className="app-brand">
      <h1 className="app-brand-title min-w-0 font-semibold text-sky-200">
        <span className="app-brand-mark" aria-hidden="true">K</span>
        <span>KATLAB Tracking Monitor</span>
      </h1>
      <button type="button" className="ui-control app-version-badge text-xs font-mono"
        aria-label={`UI build v${UI_BUILD_VERSION}. Open System health`}
        title="Loaded UI build version. Open System health for server details."
        onClick={onSystem}>
        v{UI_BUILD_VERSION}
      </button>
    </div>
  );
}
