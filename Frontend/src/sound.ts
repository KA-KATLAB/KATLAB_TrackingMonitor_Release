// v0.2.8.0 D2-D5 (A.1, R-BH): the audio twin of notify.ts — ALL
// synthesis, zero audio files, zero deps. Opt-in via katlab.sound
// (default OFF — the katlab.notify precedent), visibility-INDEPENDENT
// (audio is the background-awareness channel: the v0.1.7.0 channel
// matrix's 4th column; you HEAR Claude working while reading
// elsewhere). Every play* is a no-op unless soundWanted() AND the
// context is running — never throws, never queues (a missed sound is
// a missed sound; the mirror law's audio form). RV5: no AudioContext
// in the browser -> the toggle honestly stays off (the v0.1.12.0
// setAppBadge feature-detect precedent).

import { readPreference, writePreference } from "./preferences";
import type { PreferenceToggleResult } from "./preferences";
import { raceWithSignal } from "./api";

export interface SoundToggleResult extends PreferenceToggleResult {
  preferenceUnconfirmed?: boolean;
}

const KEY = "katlab.sound";
const MASTER_GAIN = 0.15;   // calm-tech: peripheral, never startling
const TICK_MIN_GAP_MS = 80; // D4: bursts patter — the limiter DROPS

// RV13: pinned pitches — ONE key (RV4: the A-major family, so any
// same-moment overlap — a release ALSO cleans its repo — is consonant
// BY CONSTRUCTION, no channel coupling needed). Exported for the
// battery (RV12 — the WARDROBE_TIERS readability precedent).
export const NOTES: Record<string, number> = {
  A4: 440, B4: 493.88, "C#5": 554.37, E5: 659.25, "F#5": 739.99, A5: 880,
};
// The tick's quintet (RV13): the octave that sits WITH the chime.
export const TICK_STEPS = ["A4", "B4", "C#5", "E5", "F#5"] as const;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let lastTickMs = -Infinity;
let offVeto = false;
let preferenceGeneration = 0;

function persistSound (value: "on" | "off"): boolean {
  return writePreference(KEY, value) && readPreference(KEY) === value;
}

export function soundWanted (): boolean {
  return !offVeto && readPreference(KEY) === "on";
}

/** RV6/RV10 pitch step (exported PURE for the battery): the HIGH-BITS
 *  Knuth hash — bare id%5 ladders on sequential rowids, and the
 *  LOW-bits hash mod 5 is STILL near-linear (K ≡ 1 ≡ 2^32, both mod
 *  5 — live-proven); the high bits are the mixed ones (>>> 27 then
 *  % 5, numerically verified uniform). Math.imul keeps the multiply
 *  exact 32-bit at any id; non-number -> 0 (RV1 — never a NaN pitch,
 *  and the enable CONFIRMATION deliberately rides step 0 = A4). */
export function tickStep (id: number): number {
  return (Math.imul(Number.isFinite(id) ? id : 0, 2654435761) >>> 27) % 5;
}

/** D4 rate-limit decision (exported PURE for the battery): min 80ms
 *  between ticks — a 20-file Claude turn patters, a 50-event catch-up
 *  burst is ~2 ticks (drop, never queue). */
export function tickAllowed (nowMs: number, lastMs: number): boolean {
  return nowMs - lastMs >= TICK_MIN_GAP_MS;
}

function contextRunning (): boolean {
  return ctx !== null && ctx.state === "running";
}

function retireContext (candidate: AudioContext | null, output: GainNode | null): void {
  if (!candidate) return;
  if (ctx === candidate) {
    ctx = null;
    master = null;
  }
  try { output?.disconnect(); } catch { /* best-effort output isolation */ }
  // Native shutdown must not hold the toggle or mutate a newer context.
  try { void Promise.resolve(candidate.close()).catch(() => {}); }
  catch { /* best-effort resource release */ }
}

async function activateContext (owner: number, signal?: AbortSignal): Promise<boolean> {
  if (owner !== preferenceGeneration || signal?.aborted) return false;
  let candidate: AudioContext | null = null;
  let candidateMaster: GainNode | null = null;
  try {
    if (typeof AudioContext === "undefined") return false;
    candidate = new AudioContext();
    candidateMaster = candidate.createGain();
    candidateMaster.gain.value = MASTER_GAIN;
    candidateMaster.connect(candidate.destination);
    const resume = candidate.resume;
    if (owner !== preferenceGeneration || signal?.aborted) {
      retireContext(candidate, candidateMaster);
      return false;
    }
    let resolveResume!: (value: void | PromiseLike<void>) => void;
    let rejectResume!: (error: unknown) => void;
    const pending = new Promise<void>((resolve, reject) => {
      resolveResume = resolve;
      rejectResume = reject;
    });
    // Attach observation before calling, while preserving the original gesture.
    const observed = raceWithSignal(pending, signal);
    try { resolveResume(resume.call(candidate)); }
    catch (error) { rejectResume(error); }
    await observed;
    const running = candidate.state === "running";
    if (owner !== preferenceGeneration || signal?.aborted || !running) {
      retireContext(candidate, candidateMaster);
      return false;
    }
    ctx = candidate;
    master = candidateMaster;
    return true;
  } catch {
    retireContext(candidate, candidateMaster);
    return false;
  }
}

// One enveloped oscillator note into the master gain (craft latitude:
// 12ms attack, exponential release — soft, never clicky).
function note (freq: number, startS: number, durS: number, peak: number,
  type: OscillatorType = "sine"): void {
  const o = ctx!.createOscillator();
  const g = ctx!.createGain();
  o.type = type;
  o.frequency.value = freq;
  const t0 = ctx!.currentTime + startS;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + durS);
  o.connect(g);
  g.connect(master!);
  o.start(t0);
  o.stop(t0 + durS + 0.05);
}

/** Persist before activation; only a running context may confirm opt-in. */
export async function setSoundEnabled (on: boolean,
  signal?: AbortSignal): Promise<SoundToggleResult> {
  if (signal?.aborted) return { enabled: soundWanted(), persisted: false };
  const owner = ++preferenceGeneration;
  offVeto = true;
  retireContext(ctx, master);
  if (!on) {
    return { enabled: false, persisted: persistSound("off") };
  }
  if (!persistSound("on")) {
    persistSound("off");
    return { enabled: false, persisted: false };
  }
  const running = await activateContext(owner, signal);
  if (owner !== preferenceGeneration) {
    return { enabled: soundWanted(), persisted: false };
  }
  if (!running || signal?.aborted) {
    retireContext(ctx, master);
    return { enabled: false, persisted: persistSound("off") };
  }
  // Activation can outlast the saved opt-in; never reassert on after drift.
  const savedOn = readPreference(KEY) === "on";
  if (owner !== preferenceGeneration) {
    return { enabled: soundWanted(), persisted: false };
  }
  if (signal?.aborted || !savedOn) {
    retireContext(ctx, master);
    const persisted = persistSound("off");
    return signal?.aborted
      ? { enabled: false, persisted }
      : { enabled: false, persisted, preferenceUnconfirmed: true };
  }
  offVeto = false;
  try {
    playTick(0); // confirmation = A4, after persistence and activation
  } catch {
    offVeto = true;
    retireContext(ctx, master);
    return { enabled: false, persisted: persistSound("off") };
  }
  return { enabled: true, persisted: true };
}

export function soundToggleMessage (on: boolean, result: SoundToggleResult,
  timedOut = false): string {
  const saveFailure = "Saving failed. An older opt-in may return after reload.";
  if (timedOut) {
    return "Sounds remain off for this page: activation was not confirmed within 10 seconds. "
      + "Retry explicitly to opt in."
      + (result.persisted ? "" : ` ${saveFailure}`);
  }
  if (result.preferenceUnconfirmed) {
    return "The saved sound choice could not be verified at activation. "
      + "Sounds remain off for this page. Retry explicitly to opt in."
      + (result.persisted ? "" : ` ${saveFailure}`);
  }
  if (!result.persisted) {
    return result.enabled
      ? "Sound preference could not be verified. Check the current setting before retrying."
      : `Sounds are off for this page. ${saveFailure}`;
  }
  return on
    ? result.enabled ? "Sounds enabled." : "Audio activation was not confirmed or audio is unavailable; sounds remain off."
    : "Sounds disabled.";
}

/** The capture rain-drop: a ~50ms pluck, pitch by tickStep (the
 *  stars law — deterministic, never Math.random). */
export function playTick (id: number): void {
  if (!soundWanted() || !contextRunning()) return;
  const now = performance.now();
  if (!tickAllowed(now, lastTickMs)) return; // D4: drop, never queue
  lastTickMs = now;
  note(NOTES[TICK_STEPS[tickStep(id)]], 0, 0.05, 1);
}

/** CLEAN ✓ — two warm notes, E5 -> A5 (~400ms; the RV4 A family). */
export function playChime (): void {
  if (!soundWanted() || !contextRunning()) return;
  note(NOTES.E5, 0, 0.28, 0.8);
  note(NOTES.A5, 0.12, 0.3, 0.8);
}

/** The release moment — A4 -> C#5 -> E5 (the A-major triad, ~600ms,
 *  triangle = slightly brighter; a desk fanfare, not a stadium). */
export function playFanfare (): void {
  if (!soundWanted() || !contextRunning()) return;
  note(NOTES.A4, 0, 0.22, 0.9, "triangle");
  note(NOTES["C#5"], 0.14, 0.22, 0.9, "triangle");
  note(NOTES.E5, 0.28, 0.34, 0.9, "triangle");
}

// RV14 gesture path (2): a persisted-on reload starts SUSPENDED until
// the browser sees a gesture — ONE first-interaction listener resumes
// (the autoplay-policy honest degrade). RV2: typeof-window guarded —
// inert in node (the battery imports this module).
if (typeof window !== "undefined" && soundWanted()) {
  const owner = preferenceGeneration;
  const resumeOnce = () => {
    window.removeEventListener("pointerdown", resumeOnce);
    window.removeEventListener("keydown", resumeOnce);
    if (owner !== preferenceGeneration) return;
    if (!soundWanted()) {
      offVeto = true;
      persistSound("off");
      return;
    }
    void activateContext(owner).then((running) => {
      if (owner !== preferenceGeneration || running) return;
      offVeto = true;
      persistSound("off");
    }, () => {
      if (owner !== preferenceGeneration) return;
      offVeto = true;
      persistSound("off");
    });
  };
  window.addEventListener("pointerdown", resumeOnce);
  window.addEventListener("keydown", resumeOnce);
}
