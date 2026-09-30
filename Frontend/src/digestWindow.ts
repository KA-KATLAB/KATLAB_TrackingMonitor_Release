export interface DigestDayWindow {
  day: string;
  startMs: number;
  endMs: number;
  since: string;
  until: string;
}

/** One local calendar day, with precision-safe bounds for the UTC-Z TEXT query. */
export function digestDayWindow (now: Date): DigestDayWindow {
  const year = now.getFullYear();
  const month = now.getMonth();
  const date = now.getDate();
  const start = new Date(year, month, date);
  const end = new Date(year, month, date + 1);
  const pad = (value: number): string => String(value).padStart(2, "0");
  return {
    day: `${year}-${pad(month + 1)}-${pad(date)}`,
    startMs: start.getTime(),
    endMs: end.getTime(),
    // Hook records use microseconds. Three-digit bounds misorder exact midnight.
    since: start.toISOString().replace(".000Z", ".000000Z"),
    until: end.toISOString().replace(".000Z", ".000000Z"),
  };
}
