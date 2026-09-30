export interface LocalDayWindow {
  day: string;
  startMs: number;
  endMs: number;
  since: string;
  until: string;
}

export function localDayLabel (now: Date): string {
  const year = now.getFullYear();
  const month = now.getMonth();
  const date = now.getDate();
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${String(year).padStart(4, "0")}-${pad(month + 1)}-${pad(date)}`;
}

/** Shift a calendar label without local DST normalization swallowing a skipped day. */
export function shiftDayLabel (day: string, delta: number): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || (delta !== -1 && delta !== 1)) return null;
  const next = new Date(`${day}T12:00:00Z`);
  if (!Number.isFinite(next.getTime()) || next.toISOString().slice(0, 10) !== day) return null;
  next.setUTCDate(next.getUTCDate() + delta);
  if (next.getUTCFullYear() < 0 || next.getUTCFullYear() > 9999) return null;
  return next.toISOString().slice(0, 10);
}

/** One local calendar day, with precision-safe bounds for the UTC-Z TEXT query. */
export function localDayWindow (now: Date): LocalDayWindow {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  // A midnight gap may normalize start to 01:00; the next day still starts at 00:00.
  end.setHours(0, 0, 0, 0);
  return {
    day: localDayLabel(now),
    startMs: start.getTime(),
    endMs: end.getTime(),
    // Hook records use microseconds. Three-digit bounds misorder exact midnight.
    since: start.toISOString().replace(".000Z", ".000000Z"),
    until: end.toISOString().replace(".000Z", ".000000Z"),
  };
}
