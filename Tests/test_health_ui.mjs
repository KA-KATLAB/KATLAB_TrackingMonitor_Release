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
const { decodeHealthPayload, decodeChronicleHealth, hookRegistrationLabel } = await import(
  `data:text/javascript;base64,${Buffer.from(emitted).toString("base64")}`
);

function healthFixture () {
  return {
    server: { version: "0.4.0.7", started_ts: "2026-10-05T00:00:00Z",
      db_bytes: 0, watchers_alive: 1, watchers_total: 1,
      hook_registered: false, hook_settings_path: "" },
    repos: [{ id: "fixture", offline: false, last_event_ts: null,
      events_jsonl_bytes: null, events_jsonl_mtime: null, warning_count: 0 }],
    activity: { pending: 0, rejected: 0, ignored_unscoped: 0, registry_revision_mismatch: 0 },
    providers: [{ provider: "claude", adapter_present: true, configuration_valid: false,
      configuration_state: "settings_missing", recently_observed: false, last_observed_at: null }],
    chronicle: { state: "running" },
  };
}

test("health decoding accepts current, legacy, nullable and future display values without mutation", () => {
  const current = healthFixture();
  const legacy = { server: current.server, repos: [] };
  const values = [current, legacy,
    { ...legacy, activity: null, providers: null },
    { ...legacy, activity: undefined, providers: [], future: { nested: true } },
  ];
  for (const version of [undefined, null, {}, [], 42, "", "future", "0.4.0.7"]) {
    values.push({ ...current, server: { ...current.server, version } });
  }
  for (const chronicle of [undefined, null, [], {}, "running", { state: "future" }]) {
    values.push({ ...current, chronicle });
  }
  const future = healthFixture();
  future.providers[0].provider = "future-provider";
  future.providers[0].configuration_state = "future_state";
  future.providers[0].last_observed_at = "unparseable text";
  future.repos[0].last_event_ts = "unparseable text";
  future.repos[0].events_jsonl_mtime = "unparseable text";
  future.repos[0].events_jsonl_bytes = Number.MAX_SAFE_INTEGER;
  future.server.db_bytes = null;
  future.server.watchers_alive = 2; // No invented equality/order constraint.
  values.push(future);
  for (const value of values) {
    const before = structuredClone(value);
    assert.equal(decodeHealthPayload(value), value);
    assert.deepEqual(value, before);
  }
});

test("health decoding rejects every unsafe required field and collection shape", () => {
  for (const value of [undefined, null, [], "", 1, true, {}, { server: {}, repos: [] }]) {
    assert.equal(decodeHealthPayload(value), null);
  }
  const fields = [
    [["server"], [undefined, null, [], 1, "server"]],
    [["repos"], [undefined, null, {}, "repos", [null], [[]], [{}]]],
    [["activity"], [[], false, "activity", {}]],
    [["providers"], [{}, false, "providers", [null], [[]], [{}]]],
    [["server", "started_ts"], [undefined, null, [], {}, 0, "", "not a date"]],
    [["server", "hook_registered"], [undefined, null, 0, 1, "false", {}]],
    [["server", "hook_settings_path"], [undefined, null, {}, 0, false]],
    [["repos", 0, "id"], [undefined, null, {}, [], 0, ""]],
    [["repos", 0, "offline"], [undefined, null, 0, 1, "false", {}]],
    [["providers", 0, "provider"], [undefined, null, {}, [], 0, ""]],
    [["providers", 0, "configuration_state"], [undefined, null, {}, [], 42]],
  ];
  for (const field of ["adapter_present", "configuration_valid", "recently_observed"]) {
    fields.push([["providers", 0, field], [undefined, null, 0, 1, "false", {}]]);
  }
  for (const path of [["repos", 0, "last_event_ts"], ["repos", 0, "events_jsonl_mtime"],
    ["providers", 0, "last_observed_at"]]) {
    fields.push([path, [undefined, {}, [], false, 123]]);
  }
  const invalidCounts = [undefined, null, {}, [], "0", false, -1, 0.5, NaN, Infinity,
    -Infinity, Number.MAX_SAFE_INTEGER + 1];
  for (const path of [["server", "watchers_alive"], ["server", "watchers_total"],
    ["repos", 0, "warning_count"], ...Object.keys(healthFixture().activity).map(key => ["activity", key])]) {
    fields.push([path, invalidCounts]);
  }
  for (const path of [["server", "db_bytes"], ["repos", 0, "events_jsonl_bytes"]]) {
    fields.push([path, invalidCounts.filter(value => value !== null)]);
  }
  let checked = 0;
  for (const [path, invalid] of fields) {
    for (const value of invalid) {
      const fixture = healthFixture();
      const target = path.slice(0, -1).reduce((parent, key) => parent[key], fixture);
      target[path.at(-1)] = value;
      assert.equal(decodeHealthPayload(fixture), null, `${path.join(".")}: ${String(value)}`);
      checked++;
    }
  }
  assert.ok(checked > 150, "all nested field cases must execute");
});

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

test("hook marker labels distinguish presence from an unverified result", () => {
  assert.equal(hookRegistrationLabel(true), "line present ✓");
  assert.equal(hookRegistrationLabel(false), "line not verified");
});
