// v0.1.13.0 D2 (B.2): Kat, the workspace pet — a MIRROR of repo truth,
// not a game (no persistence, no feeding, no interaction). moodOf is a
// pure function over data App already holds live (repos + combo).
// "excited" requires the combo to be LIVE per the ComboMeter's EXACT
// visibility window (RV2 — comboCount never time-decays in App, it only
// resets on the next non-chained event; a stale combo must never excite).
// Motion is pure CSS (pet-* classes); the ONE index.css
// prefers-reduced-motion media block is the kill switch (RV4) — the
// curious head tilt is a STATIC transform and deliberately survives it.
// v0.2.7.0 D4 (B.1, R-BF): the WARDROBE keeps the mirror law whole —
// accessories are EARNED, derived fresh every render from the served
// unscoped 365d calendar (delete the DB, lose the wardrobe: honest by
// construction; zero persistence, zero interaction, zero localStorage).

import type { Repo } from "./api";
import type { StatsData } from "./charts";
import { bestRolling7, maxStreakOf } from "./records";
import { EFFORT_GAP_MAX_MIN, UNCOMMITTED_AGE_H } from "./theme";

type CalDay = StatsData["activity_calendar"][number];

export type Mood = "excited" | "sleeping" | "content" | "anxious" | "curious";

export function moodOf (repos: Repo[], comboCount: number,
  comboLastMs: number, nowMs: number): Mood {
  if (comboCount >= 5 && nowMs - comboLastMs <= EFFORT_GAP_MAX_MIN * 60_000) {
    return "excited";
  }
  const online = repos.filter((r) => !r.offline);
  if (online.length === 0) return "sleeping";
  if (online.reduce((s, r) => s + r.count, 0) === 0) return "content";
  const aged = online.some((r) => r.oldest_uncommitted_ts !== null &&
    nowMs - new Date(r.oldest_uncommitted_ts).getTime() > UNCOMMITTED_AGE_H * 3_600_000);
  return aged ? "anxious" : "curious";
}

const MOOD_TIP: Record<Mood, string> = {
  excited: "Kat is excited — a live capture combo is running!",
  sleeping: "Kat is asleep — every repo is offline",
  content: "Kat is content — everything committed ✓",
  anxious: `Kat is anxious — uncommitted work is aging (${UNCOMMITTED_AGE_H}h+)`,
  curious: "Kat is curious — fresh uncommitted work in progress",
};

// v0.2.7.0 B.1 (R-BF): the wardrobe tiers — ONE home, battery-read.
// The array order IS the display order, and "next" = the FIRST locked
// tier in it (RV20: thresholds span three UNITS — streak days, week
// events, day events — so no cross-axis "lowest" exists).
export interface Wardrobe {
  collar: boolean; bandana: boolean; crown: boolean;
  scarf: boolean; star: boolean;
}

export const WARDROBE_TIERS = [
  { piece: "collar" as const, min: 7, unlock: "a 7-day streak" },
  { piece: "bandana" as const, min: 21, unlock: "a 21-day streak" },
  { piece: "crown" as const, min: 50, unlock: "a 50-day streak" },
  { piece: "scarf" as const, min: 500, unlock: "500 captures in a rolling week" },
  { piece: "star" as const, min: 300, unlock: "300 captures in a day" },
];

export function wardrobeOf (calendar: CalDay[]): Wardrobe {
  const streak = maxStreakOf(calendar).len; // records.tsx — one truth
  const week = bestRolling7(calendar).sum;
  const day = calendar.reduce((m, d) => Math.max(m, d.events), 0);
  return {
    collar: streak >= WARDROBE_TIERS[0].min,
    bandana: streak >= WARDROBE_TIERS[1].min,
    crown: streak >= WARDROBE_TIERS[2].min,
    scarf: week >= WARDROBE_TIERS[3].min,
    star: day >= WARDROBE_TIERS[4].min,
  };
}

/** The tip line: earned pieces + the RV20-deterministic next locked
 *  tier; zero earned -> the bare next-clause, all earned -> no next. */
export function wardrobeTip (w: Wardrobe): string {
  const earned = WARDROBE_TIERS.filter((t) => w[t.piece]).map((t) => `${t.piece} ✓`);
  const next = WARDROBE_TIERS.find((t) => !w[t.piece]);
  const parts: string[] = [];
  if (earned.length > 0) parts.push(earned.join(" "));
  if (next) parts.push(`next: ${next.piece} at ${next.unlock}`);
  return parts.join(" — ");
}

// Mood faces on one mini SVG cat-blob (~48x40): only the eyes/mouth/
// extras swap per mood — the body is shared. v0.2.7.0 B.1: earned
// accessories layer on the body group (they ride pet-breathe); the tip
// gains the wardrobe line when the feed is threaded.
export function Pet ({ mood, big, wardrobe }:
  { mood: Mood; big?: boolean; wardrobe?: Wardrobe }) {
  const tip = wardrobe
    ? `${MOOD_TIP[mood]}\n${wardrobeTip(wardrobe)}`
    : MOOD_TIP[mood];
  return (
    <span role="img" aria-label={tip} title={tip}
      className={`inline-block self-center ${big ? "h-24 w-28" : "h-8 w-10"}`}>
      <svg viewBox="0 0 48 40" aria-hidden="true"
        className={`h-full w-full ${mood === "excited" ? "pet-bounce" : ""}`}
        opacity={mood === "sleeping" ? 0.6 : 1}>
        <g transform={mood === "curious" ? "rotate(4 24 24)" : undefined}>
          {/* ears + body (breathing) */}
          <g className="pet-breathe" style={{ transformOrigin: "24px 26px" }}>
            <path d="M 12 14 L 15 4 L 21 12 Z" fill="#1e293b" stroke="#334155" />
            <path d="M 36 14 L 33 4 L 27 12 Z" fill="#1e293b" stroke="#334155" />
            <ellipse cx="24" cy="24" rx="16" ry="14"
              fill="#1e293b" stroke="#334155" strokeWidth="1.5" />
            {/* v0.2.7.0 B.1 (R-BF): earned accessories — in the breathe
                group so motion stays coherent; the star sits LEFT chest
                (RV15: clear of every mouth variant's x21-27/y29-32). */}
            {wardrobe?.scarf && (
              <g stroke="#0d9488" fill="none">
                <path d="M 13 33 Q 24 39 35 33" strokeWidth="3" />
                <path d="M 31 35 L 33 39" strokeWidth="2.5" />
              </g>
            )}
            {wardrobe?.collar && (
              <path d="M 12 31 Q 24 36.5 36 31" stroke="#14b8a6"
                strokeWidth="2" fill="none" />
            )}
            {wardrobe?.bandana && (
              <path d="M 19 33.5 L 24 39.5 L 29 33.5 Z" fill="#fbbf24" />
            )}
            {wardrobe?.crown && (
              <path d="M 20.5 9.5 L 20.5 5.5 L 22.8 7.5 L 24 4.5 L 25.2 7.5 L 27.5 5.5 L 27.5 9.5 Z"
                fill="#eab308" />
            )}
            {wardrobe?.star && (
              <text x="13.5" y="34.5" fontSize="6" fontWeight="bold"
                fill="#eab308">✦</text>
            )}
          </g>
          {/* eyes per mood (blink lives on the eye group) */}
          <g className="pet-blink" style={{ transformOrigin: "24px 22px" }}>
            {mood === "content" && (
              <g stroke="#5eead4" strokeWidth="1.5" fill="none">
                <path d="M 15 22 Q 18 19 21 22" />
                <path d="M 27 22 Q 30 19 33 22" />
              </g>
            )}
            {mood === "curious" && (
              <g fill="#5eead4">
                <circle cx="18" cy="22" r="2.2" />
                <circle cx="30" cy="22" r="2.2" />
              </g>
            )}
            {mood === "anxious" && (
              <g>
                <g stroke="#94a3b8" strokeWidth="1.2">
                  <line x1="14" y1="17" x2="20" y2="19" />
                  <line x1="34" y1="17" x2="28" y2="19" />
                </g>
                <g fill="#cbd5e1">
                  <circle cx="18" cy="23" r="2" />
                  <circle cx="30" cy="23" r="2" />
                </g>
              </g>
            )}
            {mood === "sleeping" && (
              <g stroke="#64748b" strokeWidth="1.5" fill="none">
                <path d="M 15 22 L 21 22" />
                <path d="M 27 22 L 33 22" />
              </g>
            )}
            {mood === "excited" && (
              <g fill="#2dd4bf" fontSize="7" fontWeight="bold">
                <text x="14.5" y="25">✦</text>
                <text x="26.5" y="25">✦</text>
              </g>
            )}
          </g>
          {/* mouth */}
          {mood === "content" || mood === "excited" ? (
            <path d="M 21 29 Q 24 32 27 29" stroke="#5eead4"
              strokeWidth="1.2" fill="none" />
          ) : mood === "anxious" ? (
            <path d="M 21 31 Q 24 29 27 31" stroke="#94a3b8"
              strokeWidth="1.2" fill="none" />
          ) : (
            <line x1="22" y1="30" x2="26" y2="30" stroke="#64748b"
              strokeWidth="1.2" />
          )}
        </g>
        {/* extras outside the tilt group */}
        {mood === "anxious" && (
          <text x="40" y="10" fill="#fbbf24" fontSize="10" fontWeight="bold">!</text>
        )}
        {mood === "sleeping" && (
          <text x="37" y="12" fill="#64748b" fontSize="8">z z</text>
        )}
      </svg>
    </span>
  );
}
