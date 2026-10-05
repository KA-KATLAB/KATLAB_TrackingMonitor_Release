import { abortError, api } from "./api";
import type { TrackedEvent } from "./api";
import { appendUniqueEvents } from "./eventPages";
import { localDayWindow } from "./dayWindow";

const PAGE = 500, MAX_PAGES = 3;

export interface DayEventsResult {
  rows: TrackedEvent[];
  limitReached: boolean;
}

/** Keep the bounded ingestion window in numeric time order for replay. */
export async function loadDayEvents (scope: string | undefined, day: string,
  signal: AbortSignal): Promise<DayEventsResult> {
  if (signal.aborted) throw abortError();
  const window = localDayWindow(new Date(`${day}T12:00:00`));
  if (window.day !== day) throw new Error("The selected local calendar day does not exist.");
  const rows: TrackedEvent[] = [];
  let limitReached = false;
  for (let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex += 1) {
    if (signal.aborted) throw abortError();
    const page = await api.events({
      repo: scope, since: window.since, until: window.until,
      limit: PAGE, offset: pageIndex * PAGE,
    }, signal);
    if (signal.aborted) throw abortError();
    appendUniqueEvents(rows, page.filter((row) => {
      const timestamp = new Date(row.ts).getTime();
      return timestamp >= window.startMs && timestamp < window.endMs;
    }));
    if (page.length < PAGE) break;
    if (pageIndex === MAX_PAGES - 1) limitReached = true;
  }
  rows.sort((left, right) => new Date(left.ts).getTime() - new Date(right.ts).getTime()
    || left.id - right.id);
  return { rows, limitReached };
}
