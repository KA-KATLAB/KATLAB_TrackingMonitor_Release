import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const frontendRequire = createRequire(resolve(root, "Frontend/package.json"));
const ts = frontendRequire("typescript");
const source = readFileSync(resolve(root, "Frontend/src/healthModel.ts"), "utf8");
const emitted = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { decodeChronicleHealth } = await import(
  `data:text/javascript;base64,${Buffer.from(emitted).toString("base64")}`
);

test("Chronicle worker states are exact and retain forward-compatible fields", () => {
  for (const state of ["disabled", "running", "unavailable"]) {
    assert.deepEqual(decodeChronicleHealth({ chronicle: { state } }),
      { kind: "state", state });
  }
  assert.deepEqual(decodeChronicleHealth({ chronicle: {
    state: "running", future_field: true,
  } }), { kind: "state", state: "running" });
});

test("an older backend is missing, not a disabled or failed worker", () => {
  assert.deepEqual(decodeChronicleHealth({ server: { version: "0.3.1.1" } }),
    { kind: "missing" });
});

test("null and malformed responses never report a running worker", () => {
  const invalid = [
    null, undefined, "running", [],
    { chronicle: null }, { chronicle: "running" }, { chronicle: [] },
    { chronicle: {} }, { chronicle: { state: null } },
    { chronicle: { state: "healthy" } }, { chronicle: { state: 1 } },
  ];
  for (const payload of invalid) {
    assert.deepEqual(decodeChronicleHealth(payload), { kind: "invalid" });
  }
});
