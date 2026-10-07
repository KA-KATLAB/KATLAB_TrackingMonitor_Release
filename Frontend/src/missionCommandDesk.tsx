import type { ReactNode } from "react";
import { hasOverlayLease } from "./dialog";
import { ControlButton, Surface } from "./ui";
import "./missionCommandDesk.css";

const MISSION_SECTIONS = [
  { id: "mission-now-heading", label: "Now" },
  { id: "mission-plans-heading", label: "Plans" },
  { id: "mission-forecast-heading", label: "Forecast" },
  { id: "mission-verification-heading", label: "Verification" },
  { id: "mission-evidence-heading", label: "Evidence" },
  { id: "mission-flight-heading", label: "Flight recorder" },
] as const;

/** A user-requested jump within the same owned Mission scroller, or no jump. */
export function jumpToMissionSection (
  trigger: HTMLElement,
  id: string,
  onSectionNavigation?: () => void,
): boolean {
  if (!MISSION_SECTIONS.some((section) => section.id === id)) return false;
  if (typeof HTMLElement === "undefined" || !(trigger instanceof HTMLElement)) return false;
  const document = trigger.ownerDocument;
  const view = document.defaultView;
  const desk = trigger.closest<HTMLElement>("[data-mission-command-desk]");
  const main = trigger.closest<HTMLElement>("main[data-app-scroll]");
  const matches = document.querySelectorAll<HTMLElement>(`#${id}`);
  if (!view || !(desk instanceof HTMLElement) || !(main instanceof HTMLElement)
      || matches.length !== 1) return false;
  const target = matches[0];

  const visible = (element: HTMLElement): boolean => {
    if (!element.isConnected || element.ownerDocument !== document
        || element.closest("[inert], [hidden], [aria-hidden='true']")) return false;
    let reachedMain = false;
    for (let ancestor: HTMLElement | null = element; ancestor; ancestor = ancestor.parentElement) {
      if (!ancestor.isConnected || ancestor.ownerDocument !== document
          || ancestor.matches("[inert], [hidden], [aria-hidden='true'], :disabled, [aria-disabled='true']")) return false;
      const style = view.getComputedStyle(ancestor);
      if (style.display === "none" || style.visibility === "hidden"
          || style.visibility === "collapse" || Number(style.opacity) === 0) return false;
      if (ancestor === main) {
        reachedMain = true;
      }
    }
    if (!reachedMain) return false;
    const bounds = element.getBoundingClientRect();
    return element.getClientRects().length > 0 && bounds.width > 0 && bounds.height > 0
      && [bounds.top, bounds.right, bounds.bottom, bounds.left, bounds.width, bounds.height]
        .every(Number.isFinite);
  };
  const owned = (): boolean => {
    if (hasOverlayLease() || !(target instanceof HTMLElement)
        || target.tagName !== "H3" || target.getAttribute("tabindex") !== "-1"
        || target.tabIndex !== -1 || !desk.isConnected || !main.isConnected
        || desk.ownerDocument !== document || main.ownerDocument !== document
        || trigger.closest("[data-mission-command-desk]") !== desk
        || target.closest("[data-mission-command-desk]") !== desk
        || trigger.closest("main[data-app-scroll]") !== main
        || target.closest("main[data-app-scroll]") !== main
        || desk.closest("main[data-app-scroll]") !== main
        || !desk.contains(trigger) || !desk.contains(target)
        || !main.contains(desk) || !main.contains(trigger) || !main.contains(target)) return false;
    const current = document.querySelectorAll<HTMLElement>(`#${id}`);
    return current.length === 1 && current[0] === target
      && [desk, main, trigger, target].every(visible);
  };
  const destination = (): number | null => {
    if (!owned()) return null;
    const mainBounds = main.getBoundingClientRect();
    const targetBounds = target.getBoundingClientRect();
    const values = [main.scrollTop, main.scrollHeight, main.clientHeight, main.clientTop,
      mainBounds.top, mainBounds.height, targetBounds.top, targetBounds.height];
    if (!values.every(Number.isFinite) || main.clientHeight <= 0
        || main.scrollHeight < 0 || main.clientTop < 0) return null;
    const maximum = Math.max(0, main.scrollHeight - main.clientHeight);
    const position = main.scrollTop + targetBounds.top - mainBounds.top - main.clientTop;
    if (!Number.isFinite(maximum) || !Number.isFinite(position)) return null;
    return Math.max(0, Math.min(maximum, position));
  };

  try {
    if (destination() === null) return false;
    onSectionNavigation?.();
    // The callback may synchronously flush route state or replace/remove nodes.
    if (destination() === null) return false;
    target.focus({ preventScroll: true });
    // Focus handlers may open an overlay, move focus, or replace the destination.
    if (document.activeElement !== target) return false;
    const position = destination();
    if (position === null || document.activeElement !== target) return false;
    main.scrollTop = position;
    return owned() && document.activeElement === target && Number.isFinite(main.scrollTop);
  } catch {
    return false;
  }
}

export function MissionCommandDesk ({ children, showPlans, onSectionNavigation }: {
  children: ReactNode;
  showPlans: boolean;
  onSectionNavigation?: () => void;
}): JSX.Element {
  return (
    <div className="mission-command-desk" data-mission-command-desk>
      <Surface tone="quiet" className="mission-command-navigation">
        <nav aria-label="Mission sections">
          <h3 className="mission-command-title">Command desk</h3>
          <p className="mission-command-description">
            Jump within the current Mission.
          </p>
          <div className="mission-command-links">
            {MISSION_SECTIONS.filter((section) => showPlans || section.id !== "mission-plans-heading")
              .map((section) => (
                <ControlButton key={section.id} className="mission-command-link"
                  aria-controls={section.id}
                  onClick={(event) => { jumpToMissionSection(event.currentTarget, section.id, onSectionNavigation); }}>
                  {section.label}
                </ControlButton>
              ))}
          </div>
        </nav>
      </Surface>
      <div className="mission-command-content min-w-0 space-y-6">{children}</div>
    </div>
  );
}
