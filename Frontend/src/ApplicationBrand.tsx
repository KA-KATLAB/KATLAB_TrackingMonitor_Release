import { UI_BUILD_VERSION } from "./appVersion";

export function ApplicationBrand ({ onSystem }: { onSystem: () => void }): JSX.Element {
  return (
    <div className="app-brand">
      <h1 className="min-w-0 text-base font-semibold text-sky-200 sm:text-lg">
        KATLAB Tracking Monitor
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
