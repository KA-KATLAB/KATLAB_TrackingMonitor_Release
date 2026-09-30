// Calendar rows are server-supplied UTC snapshots, not proof of today's data.
export function utcDayKey (now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function calendarDayLabel (day: string | undefined, now: Date = new Date()): string {
  if (!day) return "unavailable (UTC)";
  return day === utcDayKey(now) ? "today (UTC)" : `${day} (UTC)`;
}

export function calendarRangeLabel (rows: readonly { day: string }[]): string {
  if (rows.length === 0) return "Dates unavailable (UTC)";
  const first = rows[0].day;
  const last = rows[rows.length - 1].day;
  return first === last ? `${first} (UTC)` : `${first} to ${last} (UTC)`;
}
