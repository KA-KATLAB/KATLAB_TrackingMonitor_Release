// v0.1.5.0 D5 (D.1): opt-in OS notifications — fire ONLY while the tab is
// hidden (a visible tab already shows everything live). Page-open only (no
// service worker). NEVER called from inside a React state updater (RV9 —
// StrictMode double-invokes updaters in dev, which would double-fire); the
// WS handler calls these directly and maintains the transition map itself.
// Transitions masked by an F29 reconnect re-snapshot do not notify (RV10 —
// accepted, documented).

import { readPreference, writePreference } from "./preferences";
import type { PreferenceToggleResult } from "./preferences";
import { raceWithSignal } from "./api";

const KEY = "katlab.notify";
const COALESCE_MS = 5000;

const pickBursts = new Map<string, { count: number }>(); // repo -> 5s burst
const prevClean = new Map<string, boolean>();            // RV9 transition map
let offVeto = false;
let preferenceGeneration = 0;

function persistNotify (value: "on" | "off"): boolean {
  return writePreference(KEY, value) && readPreference(KEY) === value;
}

export function notifyWanted (): boolean {
  return !offVeto && readPreference(KEY) === "on";
}

function canFire (): boolean {
  if (!notifyWanted() || typeof Notification === "undefined") return false;
  try {
    return Notification.permission === "granted";
  } catch {
    offVeto = true;
    persistNotify("off");
    return false;
  }
}

/** Opt-in only after storage and permission are both verified. RV21:
 *  denied or dismissed permission leaves alerts off. */
export async function setNotifyEnabled (on: boolean,
  signal?: AbortSignal): Promise<PreferenceToggleResult> {
  if (signal?.aborted) return { enabled: notifyWanted(), persisted: false };
  const owner = ++preferenceGeneration;
  offVeto = true;
  if (!on) {
    return { enabled: false, persisted: persistNotify("off") };
  }
  // A failed storage preflight must never open a browser permission prompt.
  if (!persistNotify("off")) {
    persistNotify("off");
    return { enabled: false, persisted: false };
  }
  let granted = false;
  try {
    if (typeof Notification === "undefined") return { enabled: false, persisted: true };
    const capability = Notification;
    const request = capability.requestPermission;
    if (signal?.aborted) return { enabled: false, persisted: persistNotify("off") };
    let resolvePermission!: (value: NotificationPermission | PromiseLike<NotificationPermission>) => void;
    let rejectPermission!: (error: unknown) => void;
    const pending = new Promise<NotificationPermission>((resolve, reject) => {
      resolvePermission = resolve;
      rejectPermission = reject;
    });
    // Observe before invoking, without moving the browser prompt out of the click.
    const observed = raceWithSignal(pending, signal);
    try { resolvePermission(request.call(capability)); }
    catch (error) { rejectPermission(error); }
    const permission = await observed;
    if (owner !== preferenceGeneration) return { enabled: notifyWanted(), persisted: false };
    granted = !signal?.aborted && permission === "granted" && capability.permission === "granted";
  } catch { /* unavailable, rejected or application observation canceled */ }
  if (owner !== preferenceGeneration) return { enabled: notifyWanted(), persisted: false };
  if (!granted || signal?.aborted) {
    return { enabled: false, persisted: persistNotify("off") };
  }
  if (!persistNotify("on")) {
    persistNotify("off");
    return { enabled: false, persisted: false };
  }
  offVeto = false;
  return { enabled: true, persisted: true };
}

export function notifyToggleMessage (on: boolean, result: PreferenceToggleResult,
  timedOut = false): string {
  const saveFailure = "Saving failed. An older opt-in may return after reload.";
  if (timedOut) {
    return "OS alerts remain off for this page: permission was not confirmed within 10 seconds. "
      + "The browser prompt may still finish. Complete or dismiss it, then retry to opt in."
      + (result.persisted ? "" : ` ${saveFailure}`);
  }
  if (!result.persisted) {
    return result.enabled
      ? "OS alert preference could not be verified. Check the current setting before retrying."
      : `OS alerts are off for this page. ${saveFailure}`;
  }
  return on
    ? result.enabled ? "OS alerts enabled." : "OS alert permission was not confirmed or alerts are unavailable; alerts remain off."
    : "OS alerts disabled.";
}

function fire (tag: string, body: string, onclick: () => void): void {
  if (!canFire() || !document.hidden) return; // background-only (D5)
  try {
    const n = new Notification("KATLAB Tracking Monitor", { body, tag });
    n.onclick = () => { window.focus(); onclick(); };
  } catch {
    offVeto = true;
    persistNotify("off");
  }
}

/** Trigger (1): queue-lander — coalesced per repo in a 5s window. */
export function notifyPickNeeded (repo: string, navigate: () => void): void {
  const burst = pickBursts.get(repo);
  if (burst) { burst.count += 1; return; }
  pickBursts.set(repo, { count: 1 });
  window.setTimeout(() => {
    const count = pickBursts.get(repo)?.count ?? 1;
    pickBursts.delete(repo);
    fire(`pick|${repo}`,
      `${count} change${count === 1 ? "" : "s"} need${count === 1 ? "s" : ""} a pick — ${repo}`,
      navigate);
  }, COALESCE_MS);
}

/** Trigger (2): dirty -> CLEAN transition (map maintained here, RV9).
 *  v0.1.7.0 D6 (C.3): RETURNS true on that transition so App can route the
 *  in-app celebration channels (toast always, burst while visible — the RV1
 *  matrix); OS-notification behavior is unchanged (fire() stays hidden-only). */
export function notifyStatusChange (repo: string, clean: boolean, navigate: () => void): boolean {
  const was = prevClean.get(repo);
  prevClean.set(repo, clean);
  const transitioned = clean && was === false;
  if (transitioned) fire(`clean|${repo}`, `${repo} is CLEAN ✓`, navigate);
  return transitioned;
}

/** Trigger (3): server warning. */
export function notifyWarning (repo: string, message: string, navigate: () => void): void {
  fire(`warn|${repo}`, `${repo}: ${message.slice(0, 80)}`, navigate);
}

/** Trigger (4), v0.2.7.0 C.1 (R-BG): a NEW release line landed (the
 *  3-part-prefix law — App decides, this just delivers). Rides the
 *  private fire(), hidden-only by the D5 background-only law: the
 *  visible tab shows the z-40 banner instead — the two channels never
 *  double on one screen. A same-moment CLEAN card (clean|repo) may
 *  accompany it on a hidden tab: different tag, different information
 *  (the v0.2.7.0 RV9 documented acceptance). */
export function notifyRelease (repo: string, version: string, navigate: () => void): void {
  fire(`release|${repo}`, `🚀 ${repo} ${version} released`, navigate);
}
