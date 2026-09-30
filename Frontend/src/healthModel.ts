/** The backend reports only owned-worker state, not generated-site freshness. */
export type ChronicleWorkerState = "disabled" | "running" | "unavailable";

export type ChronicleHealthStatus =
  | { kind: "state"; state: ChronicleWorkerState }
  | { kind: "missing" }
  | { kind: "invalid" };

/** A false marker check cannot distinguish a missing line from unreadable settings. */
export function hookRegistrationLabel (registered: boolean): string {
  return registered ? "line present ✓" : "line not verified";
}

/** Decode the untrusted JSON boundary before displaying a positive state. */
export function decodeChronicleHealth (payload: unknown): ChronicleHealthStatus {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return { kind: "invalid" };
  }
  if (!Object.hasOwn(payload, "chronicle")) return { kind: "missing" };
  const chronicle = (payload as Record<string, unknown>).chronicle;
  if (chronicle === null || typeof chronicle !== "object" || Array.isArray(chronicle)) {
    return { kind: "invalid" };
  }
  const state = (chronicle as Record<string, unknown>).state;
  if (state === "disabled" || state === "running" || state === "unavailable") {
    return { kind: "state", state };
  }
  return { kind: "invalid" };
}
