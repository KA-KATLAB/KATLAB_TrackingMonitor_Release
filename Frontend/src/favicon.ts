import type { Repo } from "./api";

export type PresenceStatus =
  | { kind: "unavailable"; count: null }
  | { kind: "clean" | "dirty"; count: number };

// Presence cannot disclose partial/retained coverage beside a numeric claim.
export function workspacePresence (repos: readonly Pick<Repo, "offline" | "status_valid" | "count">[],
  workspaceReady: boolean, workspaceError: string): PresenceStatus {
  if (!workspaceReady || workspaceError || repos.length === 0
      || repos.some((repo) => repo.offline || repo.status_valid !== true
        || !Number.isSafeInteger(repo.count) || repo.count < 0)) {
    return { kind: "unavailable", count: null };
  }
  const count = repos.reduce((total, repo) => total + repo.count, 0);
  if (!Number.isSafeInteger(count)) return { kind: "unavailable", count: null };
  return { kind: count === 0 ? "clean" : "dirty", count };
}

export function clampCount (n: number): string {
  return n > 99 ? "99+" : String(n);
}

// Keep the static cold-load brand and manifest icons independent of live status.
export function drawStatusFavicon (status: PresenceStatus): string | null {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null; // App restores the static brand instead of stale status.
  ctx.fillStyle = "#020617"; // slate-950 card
  ctx.beginPath();
  ctx.roundRect(0, 0, 32, 32, 7);
  ctx.fill();
  ctx.strokeStyle = status.kind === "unavailable" ? "#64748b" : "#14b8a6";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(15, 17, 9, 0, 2 * Math.PI);
  ctx.stroke();
  if (status.kind !== "clean") {
    const label = status.kind === "unavailable" ? "?" : clampCount(status.count);
    ctx.fillStyle = status.kind === "unavailable" ? "#94a3b8" : "#f59e0b";
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
