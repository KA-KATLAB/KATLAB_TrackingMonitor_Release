import { localDayLabel, localDayWindow } from "./dayWindow";
import type { LocalDayWindow } from "./dayWindow";

export const WALL_DAY_SECONDS = 86_400;

export interface DayReplayWindow extends LocalDayWindow {
  durationSeconds: number;
  variableDay: boolean;
}

export interface DayAxisTick {
  fraction: number;
  label: string;
  offset: string;
  title: string;
}

/** Invalid/skipped labels belong to the loader's error UI, not a render throw. */
export function dayReplayWindow (day: string): DayReplayWindow | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const date = new Date(`${day}T12:00:00`);
  if (!Number.isFinite(date.getTime()) || localDayLabel(date) !== day) return null;
  const window = localDayWindow(date);
  const durationSeconds = (window.endMs - window.startMs) / 1_000;
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return null;
  const start = new Date(window.startMs);
  return { ...window, durationSeconds,
    variableDay: durationSeconds !== WALL_DAY_SECONDS || start.getHours() !== 0
      || start.getMinutes() !== 0 || start.getSeconds() !== 0
      || start.getTimezoneOffset() !== new Date(window.endMs - 1).getTimezoneOffset() };
}

export function clampReplaySeconds (seconds: number, durationSeconds: number): number {
  return Number.isFinite(seconds) ? Math.max(0, Math.min(durationSeconds, seconds)) : 0;
}

export function replaySeekStep (durationSeconds: number): number {
  return durationSeconds % 30 === 0 ? 30 : 1;
}

export function elapsedDayFraction (window: DayReplayWindow, timestamp: number): number {
  return clampReplaySeconds((timestamp - window.startMs) / 1_000,
    window.durationSeconds) / window.durationSeconds;
}

/** Wall bins revisit repeated time; the completed cursor must not wrap to zero. */
export function wallDayFraction (window: DayReplayWindow, seconds: number): number {
  const bounded = clampReplaySeconds(seconds, window.durationSeconds);
  if (bounded >= window.durationSeconds) return 1;
  const date = new Date(window.startMs + bounded * 1_000);
  return (date.getHours() * 3_600 + date.getMinutes() * 60 + date.getSeconds()
    + date.getMilliseconds() / 1_000) / WALL_DAY_SECONDS;
}

function utcOffset (timestamp: number): string {
  const minutes = -new Date(timestamp).getTimezoneOffset();
  const absolute = Math.abs(minutes);
  return `UTC${minutes < 0 ? "-" : "+"}${String(Math.floor(absolute / 60)).padStart(2, "0")}`
    + `:${String(absolute % 60).padStart(2, "0")}`;
}

export function dayTimeText (timestamp: number, withOffset: boolean, full = false): string {
  const date = new Date(timestamp);
  const pad = (value: number): string => String(value).padStart(2, "0");
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return (full ? `${localDayLabel(date)} ${time}:${pad(date.getSeconds())}` : time)
    + (withOffset ? ` ${utcOffset(timestamp)}` : "");
}

export function replayTimeText (window: DayReplayWindow, seconds: number, full = false): string {
  const bounded = clampReplaySeconds(seconds, window.durationSeconds);
  if (bounded >= window.durationSeconds) {
    return full ? `End of day (${dayTimeText(window.endMs, true, true)})` : "End of day";
  }
  return dayTimeText(window.startMs + bounded * 1_000, window.variableDay || full, full);
}

/** Fixed drawing width; sparse ticks represent instants, never fictitious wall hours. */
export function dayAxisTicks (window: DayReplayWindow): DayAxisTick[] {
  if (!window.variableDay) {
    return Array.from({ length: 9 }, (_, index) => ({
      fraction: index / 8, label: String(index * 3).padStart(2, "0"), offset: "",
      title: dayTimeText(window.startMs + index * 3 * 3_600_000, false, true),
    }));
  }
  const ticks: DayAxisTick[] = [];
  const stepSeconds = Math.ceil(window.durationSeconds / (9 * 3 * 3_600)) * 3 * 3_600;
  const endGapSeconds = Math.max(2 * 3_600, window.durationSeconds / 12);
  for (let index = 0; index <= 16; index += 1) {
    const seconds = index * stepSeconds;
    if (seconds >= window.durationSeconds) break;
    if (index > 0 && window.durationSeconds - seconds < endGapSeconds) continue;
    const timestamp = window.startMs + seconds * 1_000;
    ticks.push({ fraction: seconds / window.durationSeconds,
      label: dayTimeText(timestamp, false), offset: utcOffset(timestamp),
      title: dayTimeText(timestamp, true, true) });
  }
  ticks.push({ fraction: 1, label: "End", offset: utcOffset(window.endMs),
    title: `End of day (${dayTimeText(window.endMs, true, true)})` });
  return ticks;
}

export function dayBlockGeometry (window: DayReplayWindow, startMs: number,
  rawEndMs: number, tailMs: number, plotWidth: number): {
    left: number; width: number; endMs: number; clipped: boolean;
  } {
  const endMs = Math.min(window.endMs, rawEndMs + tailMs);
  const left = elapsedDayFraction(window, startMs) * plotWidth;
  const right = elapsedDayFraction(window, endMs) * plotWidth;
  return { left, width: Math.min(plotWidth - left, Math.max(2, right - left)),
    endMs, clipped: rawEndMs + tailMs > window.endMs };
}

export function advanceReplay (seconds: number, deltaMs: number,
  durationSeconds: number, speed: 1 | 2 | 4): number {
  const delta = Number.isFinite(deltaMs) ? Math.max(0, Math.min(100, deltaMs)) : 0;
  return clampReplaySeconds(seconds + (delta / 1_000) * (durationSeconds / 30) * speed,
    durationSeconds);
}

/** Upper bound over the loader's numeric-ascending millisecond timestamps. */
export function replayPointer (eventSeconds: readonly number[], seconds: number): number {
  let lo = 0, hi = eventSeconds.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (eventSeconds[mid] <= seconds) lo = mid + 1; else hi = mid;
  }
  return lo;
}
