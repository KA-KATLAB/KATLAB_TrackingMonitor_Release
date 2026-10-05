import type { TrackedEvent } from "./api";

/** Keep first observations in the caller's initially empty, owned buffer. */
export function appendUniqueEvents (
  target: TrackedEvent[],
  incoming: readonly TrackedEvent[],
): void {
  const seen = new Set<number>(target.map((event) => event.id));
  for (const event of incoming) {
    if (!seen.has(event.id)) {
      seen.add(event.id);
      target.push(event);
    }
  }
}
