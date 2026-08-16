// v0.2.10.0 D5 (A.2, R-BN): the flow chip — the effort law's LIVE face.
// PURE presentational (the pulse recipe, the comboMeter.tsx law): ALL
// chain math lives in App's WS handler refs; this derives AT RENDER
// with Date.now(), and the P8 60s tick re-render grows the minutes and
// expires the chip — no internal interval, no state, zero hooks. The
// combo counts events; flow measures TIME-IN-CHAIN. Seat: immediately
// RIGHT of ComboMeter (the Pet adjacency law keeps the left seat);
// sky/water vs the combo's amber/fire — distinct at a glance,
// structurally identical siblings. fmtMinutes: the ONE effort humanizer
// (the ≈ lives on the value). Session-live by design (D4): a reload
// restarts the chain at the next capture.

import { fmtMinutes } from "./format";
import { EFFORT_GAP_MAX_MIN, flowState } from "./theme";

export function FlowChip ({ count, startMs, lastMs }: {
  count: number;    // mirrored combo count (render feed)
  startMs: number;  // ref-read at render — the current chain's first event
  lastMs: number;   // ref-read at render — fresh on every re-render
}) {
  const { on, minutes } = flowState(count, startMs, lastMs, Date.now());
  if (!on) return null;
  return (
    <span
      className="self-center rounded bg-sky-900/40 px-2 py-0.5 text-xs font-semibold text-sky-300"
      title={`unbroken work chain — captures under ${EFFORT_GAP_MAX_MIN} min apart`}>
      🌊 flow {fmtMinutes(minutes)}
    </span>
  );
}
