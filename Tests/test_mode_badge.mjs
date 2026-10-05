import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const frontend = resolve(root, "Frontend");
const require = createRequire(resolve(frontend, "package.json"));
const read = name => readFileSync(resolve(frontend, "src", name), "utf8");
const luminance = hex => {
  const rgb = hex.slice(1).match(/../g).map(part => parseInt(part, 16) / 255)
    .map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
};

test("every semantic mode keeps its palette and a normal-text contrasting badge foreground", async () => {
  const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
  const vite = await createServer({ root: frontend,
    server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom",
    optimizeDeps: { noDiscovery: true, entries: [] } });
  try {
    const { MODE_COLOR, MODE_BADGE, SWEPT_COLOR } = await vite.ssrLoadModule("/src/theme.ts");
    assert.deepEqual(MODE_COLOR, { B: "#059669", A_SCOPED: "#0284c7", A_GLOBAL: "#4f46e5",
      AMBIGUOUS: "#f59e0b", UNKNOWN: "#e11d48", MANUAL: "#9333ea" });
    for (const [mode, color] of Object.entries({ ...MODE_COLOR, SWEPT: SWEPT_COLOR })) {
      const a = luminance(color), b = luminance(mode === "SWEPT" ? "#ffffff" : MODE_BADGE[mode].foreground);
      assert.ok((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= 4.5, mode);
    }
  } finally { await vite.close(); }
});

test("visible badge consumers use the shared foreground and retain explanatory labels", () => {
  for (const file of ["App.tsx", "SessionTimeline.tsx", "FileStory.tsx", "dayLanes.tsx", "focusMode.tsx"]) {
    const source = read(file);
    assert.match(source, /color: (badge|MODE_BADGE\[[^\]]+\])\.foreground/, file);
    assert.match(source, /MODE_BADGE/, file);
  }
  assert.doesNotMatch(read("MissionView.tsx"), /color: MODE_COLOR\[entry.mode\]/);
  for (const file of ["dayLanes.tsx", "churnMap.tsx", "calendarHeatmap.tsx", "punchCard.tsx",
    "snakeGame.tsx", "momentum.tsx", "focusMode.tsx"]) {
    assert.doesNotMatch(read(file), /text-\[(9|10|11)px\]/, file);
  }
  assert.match(read("dayLanes.tsx"), /bg-teal-700[^\n]*text-white hover:bg-teal-800/);
  for (const color of ["#0f766e", "#115e59"]) {
    assert.ok(1.05 / (luminance(color) + 0.05) >= 4.5, "Replay enabled/hover text contrast");
  }
  assert.match(read("App.tsx"), /"in-progress": { text: "in-progress", cls: "bg-sky-600 text-slate-950"/);
  assert.match(read("App.tsx"), /"done": { text: "done ✓", cls: "bg-emerald-600 text-slate-950"/);
  for (const color of ["#0284c7", "#059669"]) {
    assert.ok((luminance(color) + 0.05) / (luminance("#020617") + 0.05) >= 4.5,
      "Task and clean status text contrast");
  }
  assert.match(read("App.tsx"), /bg-sky-700[^\n]*font-semibold text-white hover:bg-sky-800/);
  for (const color of ["#0369a1", "#075985"]) {
    assert.ok(1.05 / (luminance(color) + 0.05) >= 4.5, "Assignment enabled/hover contrast");
  }
});
