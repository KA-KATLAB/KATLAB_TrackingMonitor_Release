// v0.1.9.0 D3 (C.2): live capture combo — a pure presentational chip. ALL
// state math lives in App's WS handler (refs — the RV7 stale-closure rule);
// App also gates burst FIRING (hidden tab / reduced motion), and the ONE
// index.css reduced-motion block kills the animations besides. Visibility
// is derived AT RENDER (the pulse recipe): WS setState turns it on
// promptly, the P8 60s tick re-render expires it.

import type { CSSProperties } from "react";
import { EFFORT_GAP_MAX_MIN } from "./theme";

export function ComboMeter ({ count, lastMs, burst }: {
  count: number;          // mirrored combo count (render feed)
  lastMs: number;         // ref-read at render — fresh on every re-render
  burst: number | null;   // milestone nonce; null = no burst mounted
}) {
  const active = count >= 3 && Date.now() - lastMs <= EFFORT_GAP_MAX_MIN * 60_000;
  if (!active) return null;
  return (
    <span
      className="relative self-center rounded bg-amber-900/40 px-2 py-0.5 text-xs font-semibold text-amber-300"
      title={`${count} captures in this work block (all repos; resets after ${EFFORT_GAP_MAX_MIN} min idle)`}>
      <span key={burst ?? -1} className={burst !== null ? "combo-pop inline-block" : "inline-block"}>
        🔥 ×{count}
      </span>
      {burst !== null && (
        // ~8 particles — the celebration .burst-p recipe (nonce-keyed spans;
        // App clears the nonce after ~900ms with the nonce-compare guard).
        <span key={`b${burst}`} aria-hidden="true">
          {Array.from({ length: 8 }, (_, i) => {
            const angle = (i / 8) * 2 * Math.PI;
            const dist = 16 + (i % 3) * 5;
            return (
              <span key={i} className="burst-p"
                style={{
                  "--dx": `${Math.round(Math.cos(angle) * dist)}px`,
                  "--dy": `${Math.round(Math.sin(angle) * dist)}px`,
                  backgroundColor: "#fbbf24",
                } as CSSProperties} />
            );
          })}
        </span>
      )}
    </span>
  );
}
