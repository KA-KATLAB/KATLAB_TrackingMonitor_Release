// Calendar rows are server-supplied UTC snapshots, not proof of today's data.
export function utcDayKey (now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function calendarDayLabel (day: string | undefined, now: Date = new Date()): string {
  if (!day) return "unavailable (UTC)";
  return day === utcDayKey(now) ? "today (UTC)" : `${day} (UTC)`;
}
