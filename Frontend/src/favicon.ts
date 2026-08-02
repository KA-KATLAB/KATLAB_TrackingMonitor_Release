// v0.2.1.0 D2 (B.2): the live status favicon — the tab tells the truth
// in ANY tab, no PWA install needed (completes the v0.1.12.0 badge
// story). Hand-rolled canvas (~30 lines, no lib): the teal ring mark on
// slate-950 when CLEAN; dirty adds an amber dot with the clamped count.
// The App effect uses EXACTLY the app-badge basis (the non-offline sum,
// RV1-v0.1.12.0) — the presence surfaces never disagree. The static
// /favicon.svg stays in index.html for cold loads; the PWA manifest
// icons are untouched. Safari ignores dynamic favicons — documented,
// not worked around.

export function clampCount (n: number): string {
  return n > 99 ? "99+" : String(n);
}

export function drawStatusFavicon (clean: boolean, count: number): string | null {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null; // feature-detect: no 2d context -> no swap
  ctx.fillStyle = "#020617"; // slate-950 card
  ctx.beginPath();
  ctx.roundRect(0, 0, 32, 32, 7);
  ctx.fill();
  ctx.strokeStyle = "#14b8a6"; // the teal ring mark (the PWA icon motif)
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(15, 17, 9, 0, 2 * Math.PI);
  ctx.stroke();
  if (!clean) {
    const label = clampCount(count);
    ctx.fillStyle = "#f59e0b"; // amber dot, top-right
    ctx.beginPath();
    ctx.arc(23, 9, 8.5, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = "#020617";
    ctx.font = `bold ${label.length > 2 ? 7 : 9}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, 23, 10);
  }
  return canvas.toDataURL("image/png");
}
