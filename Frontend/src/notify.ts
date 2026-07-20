// v0.1.5.0 D5 (D.1): opt-in OS notifications — fire ONLY while the tab is
// hidden (a visible tab already shows everything live). Page-open only (no
// service worker). NEVER called from inside a React state updater (RV9 —
// StrictMode double-invokes updaters in dev, which would double-fire); the
// WS handler calls these directly and maintains the transition map itself.
// Transitions masked by an F29 reconnect re-snapshot do not notify (RV10 —
// accepted, documented).

const KEY = "katlab.notify";
const COALESCE_MS = 5000;

const pickBursts = new Map<string, { count: number }>(); // repo -> 5s burst
const prevClean = new Map<string, boolean>();            // RV9 transition map

export function notifyWanted (): boolean {
  return localStorage.getItem(KEY) === "on";
}

function canFire (): boolean {
  return notifyWanted() && typeof Notification !== "undefined" &&
    Notification.permission === "granted";
}

/** Enable/disable; returns the effective state. RV21: anything other than
 *  "granted" — denied OR a dismissed prompt ("default") — snaps off. */
export async function setNotifyEnabled (on: boolean): Promise<boolean> {
  if (!on || typeof Notification === "undefined") {
    localStorage.setItem(KEY, "off");
    return false;
  }
  const permission = await Notification.requestPermission();
  const granted = permission === "granted";
  localStorage.setItem(KEY, granted ? "on" : "off");
  return granted;
}

function fire (tag: string, body: string, onclick: () => void): void {
  if (!canFire() || !document.hidden) return; // background-only (D5)
  const n = new Notification("KATLAB Tracking Monitor", { body, tag });
  n.onclick = () => { window.focus(); onclick(); };
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
