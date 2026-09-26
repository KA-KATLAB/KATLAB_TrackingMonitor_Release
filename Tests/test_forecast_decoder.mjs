import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const frontendRequire = createRequire(resolve(root, "Frontend/package.json"));
const ts = frontendRequire("typescript");
const source = readFileSync(resolve(root, "Frontend/src/forecastDecoder.ts"), "utf8");
const emitted = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { decodeForecast, forecastCandidateKey } = await import(
  `data:text/javascript;base64,${Buffer.from(emitted).toString("base64")}`
);

const modes = ["B", "A_SCOPED", "A_GLOBAL", "AMBIGUOUS", "UNKNOWN"];
const limit = 2 * 1024 * 1024;
const identity = (plan_file = "temp/Plan/PLAN_A.txt", task_id = "A.1") => ({
  plan_file, task_id,
});

function readyRepo (repo = "EA_Dev") {
  return {
    repo, source: "working_tree", state: "ready", reason: null,
    observed_at: "2026-09-25T08:30:00Z",
    plan_context_at: "2026-09-25T08:30:00.123456Z",
    plan_context_state: "valid", branch: "release/v0.3.0",
    total_paths: 0,
    mode_counts: { B: 0, A_SCOPED: 0, A_GLOBAL: 0, AMBIGUOUS: 0, UNKNOWN: 0 },
    items: [],
  };
}

function base (repo = readyRepo()) {
  return {
    scope: { kind: "repo", repo: repo.repo },
    summary: { total: 0, states: {} }, plans: [],
    forecast_scope: { total_repos: 1, returned_repos: 1, truncated: false },
    forecast: [repo],
  };
}

function setItems (repo, items) {
  repo.items = items;
  repo.total_paths = items.length;
  repo.mode_counts = Object.fromEntries(modes.map((mode) => [mode,
    items.filter((item) => item.mode === mode).length]));
}

function item (file, mode = "B") {
  return {
    file, mode, target: mode === "AMBIGUOUS" || mode === "UNKNOWN" ? null : identity(),
    candidate_count: mode === "AMBIGUOUS" ? 2 : 0,
    candidates: mode === "AMBIGUOUS" ? [identity(), identity("temp/Plan/PLAN_B.txt", "B.1")] : [],
    candidates_truncated: false,
  };
}

function expectUnavailable (payload) {
  assert.doesNotThrow(() => decodeForecast(payload));
  assert.equal(decodeForecast(payload).tag, "unavailable");
}

function mutate (change) {
  const payload = base();
  change(payload);
  expectUnavailable(payload);
}

test("old server pair, valid empty scope, and unrelated Mission root fields", () => {
  assert.equal(decodeForecast({ scope: { kind: "all", repo: null }, plans: [] }).tag, "old-server");
  const empty = {
    scope: { kind: "all", repo: null }, forecast_scope: {
      total_repos: 0, returned_repos: 0, truncated: false,
    }, forecast: [], future_mission_field: "accepted",
  };
  assert.equal(decodeForecast(empty).tag, "ready");
  mutate((p) => { delete p.forecast_scope; });
  mutate((p) => { delete p.forecast; });
  const malformed = base();
  malformed.plans = [{ repo: "EA_Dev", plan_file: "temp/Plan/PLAN_A.txt" }];
  malformed.forecast[0].source = "unknown";
  expectUnavailable(malformed);
  assert.deepEqual(malformed.plans, [{ repo: "EA_Dev", plan_file: "temp/Plan/PLAN_A.txt" }]);
});

test("five forecast modes, zero clean paths, and exact candidate relational keys", () => {
  assert.equal(decodeForecast(base()).tag, "ready");
  const payload = base();
  setItems(payload.forecast[0], modes.map((mode, index) => item(`src/f${index}.ts`, mode)));
  assert.equal(decodeForecast(payload).tag, "ready");
  const first = identity("aa::b", "c");
  const second = identity("aa", "b::c");
  assert.equal(`${first.plan_file}::${first.task_id}`, `${second.plan_file}::${second.task_id}`);
  assert.notEqual(forecastCandidateKey(first), forecastCandidateKey(second));
  assert.equal(forecastCandidateKey(first), forecastCandidateKey({ ...first }));
  assert.notEqual(forecastCandidateKey(first), forecastCandidateKey(second));
  payload.forecast[0].items[3].candidates = [first, second];
  assert.equal(decodeForecast(payload).tag, "ready");
  payload.forecast[0].items[3].candidates.reverse();
  assert.equal(decodeForecast(payload).tag, "ready");
  assert.deepEqual(new Set(payload.forecast[0].items[3].candidates.map(forecastCandidateKey)),
    new Set([forecastCandidateKey(first), forecastCandidateKey(second)]));
});

test("scope, identities, counts, and closed enums fail closed", () => {
  const cases = [
    (p) => { p.forecast_scope.total_repos = 2; },
    (p) => { p.forecast_scope.returned_repos = 2; },
    (p) => { p.forecast_scope.truncated = true; },
    (p) => { p.forecast = {}; },
    (p) => { p.scope.repo = "UM_Dev"; },
    (p) => { p.forecast[0].repo = "bad/repo"; p.scope.repo = "bad/repo"; },
    (p) => { p.forecast[0].repo = ""; p.scope.repo = ""; },
    (p) => { p.forecast[0].repo = " a"; p.scope.repo = " a"; },
    (p) => { p.forecast[0].repo = "a\n"; p.scope.repo = "a\n"; },
    (p) => { p.forecast[0].source = "git"; },
    (p) => { delete p.forecast[0].source; },
    (p) => { p.forecast[0].state = "busy"; },
    (p) => { p.forecast[0].reason = "busy"; },
    (p) => { p.forecast[0].plan_context_state = "fatal"; },
    (p) => { p.forecast[0].mode_counts.MANUAL = 0; },
    (p) => { p.forecast[0].mode_counts.B = 1; },
    (p) => { p.forecast[0].items = {}; },
    (p) => { p.forecast_scope.total_repos = Number.MAX_SAFE_INTEGER + 1; },
  ];
  for (const change of cases) mutate(change);
  const workspace = base();
  workspace.scope = { kind: "all", repo: null };
  workspace.forecast_scope = { total_repos: 5, returned_repos: 4, truncated: true };
  workspace.forecast = ["A", "B", "C", "D"].map(readyRepo);
  assert.equal(decodeForecast(workspace).tag, "ready");
  workspace.forecast[3].repo = "C";
  expectUnavailable(workspace);
});

test("ready and unavailable states enforce nullability and observation trust", () => {
  for (const reason of ["offline", "status_unavailable", "too_many_paths",
    "too_much_work", "plan_context_unavailable", "busy"]) {
    const p = base();
    Object.assign(p.forecast[0], {
      state: "unavailable", reason, plan_context_at: null, plan_context_state: null,
      total_paths: null, mode_counts: null, items: [],
      ...(reason === "offline" || reason === "status_unavailable"
        ? { observed_at: null, branch: null } : {}),
    });
    assert.equal(decodeForecast(p).tag, "ready");
    p.forecast[0].plan_context_at = "2026-09-25T08:30:00Z";
    expectUnavailable(p);
  }
  mutate((p) => { p.forecast[0].observed_at = null; });
  mutate((p) => { p.forecast[0].plan_context_at = null; });
  mutate((p) => { p.forecast[0].plan_context_state = null; });
  mutate((p) => {
    Object.assign(p.forecast[0], { state: "unavailable", reason: "offline",
      plan_context_at: null, plan_context_state: null, total_paths: null,
      mode_counts: null, observed_at: null });
  });
});

test("exact calendar and UTC-Z grammar accepts historical years", () => {
  for (const ts of ["0001-01-01T00:00:00Z", "0099-12-31T23:59:59Z",
    "0100-02-28T12:00:00Z", "9999-12-31T23:59:59.123456Z",
    "2000-02-29T00:00:00Z"]) {
    const p = base();
    p.forecast[0].observed_at = ts;
    assert.equal(decodeForecast(p).tag, "ready", ts);
  }
  for (const ts of ["0000-01-01T00:00:00Z", "10000-01-01T00:00:00Z",
    "1900-02-29T00:00:00Z", "2026-02-30T00:00:00Z",
    "2026-13-01T00:00:00Z", "2026-09-25T24:00:00Z",
    "2026-09-25T08:60:00Z", "2026-09-25T08:30:60Z",
    "2026-09-25T08:30:00+00:00", "2026-09-25T08:30:00.1234567Z"]) {
    mutate((p) => { p.forecast[0].observed_at = ts; });
  }
});

test("item mode, candidate, and exact-key laws", () => {
  const changes = [
    (r) => { r.mode = "MANUAL"; },
    (r) => { r.mode = "A_GLOBAL"; r.target = null; },
    (r) => { r.target = null; },
    (r) => { r.candidates = null; },
    (r) => { r.candidate_count = 1; },
    (r) => { r.candidates_truncated = true; },
    (r) => { delete r.mode; },
    (r) => { r.future = "unknown"; },
    (r) => { r.target.plan_file = "../PLAN.txt"; },
    (r) => { r.target.task_id = " A.1"; },
    (r) => { r.target.task_id = "A.1\u007f"; },
    (r) => { r.target = { ...r.target, future: "bad" }; },
    (r) => { r.file = "src/f.ts"; },
  ];
  for (const change of changes) {
    const p = base();
    setItems(p.forecast[0], [item("src/f.ts"), item("src/g.ts")]);
    change(p.forecast[0].items[1]);
    expectUnavailable(p);
  }
  const p = base();
  const many = item("src/ambiguous.ts", "AMBIGUOUS");
  many.candidate_count = 256;
  many.candidates = Array.from({ length: 10 }, (_, i) => identity(`plans/P${i}.txt`, `T${i}`));
  many.candidates_truncated = true;
  setItems(p.forecast[0], [many]);
  assert.equal(decodeForecast(p).tag, "ready");
  many.candidate_count = 257;
  expectUnavailable(p);
  many.candidate_count = Number.MAX_SAFE_INTEGER + 1;
  expectUnavailable(p);
  many.candidate_count = 10;
  many.candidates_truncated = false;
  assert.equal(decodeForecast(p).tag, "ready");
  many.candidates[1] = many.candidates[0];
  expectUnavailable(p);
});

test("path and task identity byte caps use UTF-8, not UTF-16", () => {
  const validPaths = ["a".repeat(4096), "é".repeat(2048),
    "中".repeat(1365), "😀".repeat(1024), "src/µ/flow.ts"];
  for (const file of validPaths) {
    const p = base();
    setItems(p.forecast[0], [item(file)]);
    assert.equal(decodeForecast(p).tag, "ready", file.slice(0, 20));
  }
  const invalidPaths = ["a".repeat(4097), "é".repeat(2049),
    "中".repeat(1366), "😀".repeat(1025), "a\ud800b", "/abs/x",
    "C:/abs/x", "a\\b", "a/../b", "a/./b", "a//b", "a\u0000b", "a\u007fb"];
  for (const file of invalidPaths) {
    mutate((p) => { setItems(p.forecast[0], [item(file)]); });
  }
  for (const plan_file of ["a".repeat(2048), "é".repeat(1024),
    "中".repeat(682), "😀".repeat(512)]) {
    const p = base();
    setItems(p.forecast[0], [item("src/f.ts")]);
    p.forecast[0].items[0].target.plan_file = plan_file;
    assert.equal(decodeForecast(p).tag, "ready");
  }
  for (const plan_file of ["a".repeat(2049), "é".repeat(1025),
    "中".repeat(683), "😀".repeat(513), "a\ud800b", "a/./b"]) {
    mutate((p) => {
      setItems(p.forecast[0], [item("src/f.ts")]);
      p.forecast[0].items[0].target.plan_file = plan_file;
    });
  }
  for (const task_id of ["a".repeat(128), "é".repeat(64),
    "中".repeat(42), "😀".repeat(32), "A.1 :: B"]) {
    const p = base();
    setItems(p.forecast[0], [item("src/f.ts")]);
    p.forecast[0].items[0].target.task_id = task_id;
    assert.equal(decodeForecast(p).tag, "ready");
  }
  for (const task_id of ["a".repeat(129), "é".repeat(65),
    "中".repeat(43), "😀".repeat(33), "a\ud800b", " ", " A", "A ", "A\nB"]) {
    mutate((p) => {
      setItems(p.forecast[0], [item("src/f.ts")]);
      p.forecast[0].items[0].target.task_id = task_id;
    });
  }
});

test("large malformed identities fail before UTF-8 encoding", () => {
  const original = TextEncoder.prototype.encode;
  let encodedHuge = false;
  TextEncoder.prototype.encode = function (value) {
    if (value.length > limit) encodedHuge = true;
    return original.call(this, value);
  };
  try {
    mutate((p) => { p.scope.repo = "x".repeat(limit + 1); });
    mutate((p) => { p.forecast[0].branch = "x".repeat(limit + 1); });
    assert.equal(encodedHuge, false);
  } finally {
    TextEncoder.prototype.encode = original;
  }
  // Nested identity lengths are rejected before their surrogate/path scan or encoding.
  for (const key of ["file", "plan_file", "task_id"]) {
    const p = base();
    setItems(p.forecast[0], [item("src/f.ts")]);
    const oversized = "x".repeat(key === "file" ? 4097 : key === "plan_file" ? 2049 : 129);
    if (key === "file") p.forecast[0].items[0].file = oversized;
    else p.forecast[0].items[0].target[key] = oversized;
    let encodedOversized = false;
    TextEncoder.prototype.encode = function (value) {
      if (value === oversized) encodedOversized = true;
      return original.call(this, value);
    };
    try {
      expectUnavailable(p);
      assert.equal(encodedOversized, false, key);
    } finally {
      TextEncoder.prototype.encode = original;
    }
  }
});

test("additive JSON byte cap is exact at boundary and fails one byte above", () => {
  const p = base();
  const encoded = (value) => Buffer.byteLength(JSON.stringify({
    forecast_scope: value.forecast_scope, forecast: value.forecast,
  }), "utf8");
  const headroom = limit - encoded(p);
  p.forecast[0].branch += "x".repeat(headroom);
  assert.equal(encoded(p), limit);
  assert.equal(decodeForecast(p).tag, "ready");
  p.forecast[0].branch += "x";
  assert.equal(encoded(p), limit + 1);
  expectUnavailable(p);
  p.forecast[0].branch = "é".repeat(700000);
  assert.equal(decodeForecast(p).tag, "ready");
});

test("exact JSON cap survives item-count digit transitions and long candidate pairs", () => {
  const encoded = (value) => Buffer.byteLength(JSON.stringify({
    forecast_scope: value.forecast_scope, forecast: value.forecast,
  }), "utf8");
  for (const count of [9, 10, 99, 100, 999, 1000]) {
    const p = base();
    setItems(p.forecast[0], Array.from({ length: count }, (_, i) => item(`f${i}`)));
    p.forecast[0].branch += "x".repeat(limit - encoded(p));
    assert.equal(encoded(p), limit);
    assert.equal(decodeForecast(p).tag, "ready", `${count} exact`);
    p.forecast[0].branch += "x";
    assert.equal(decodeForecast(p).tag, "unavailable", `${count} over`);
  }
  const p = base();
  const ambiguous = item("src/ambiguous.ts", "AMBIGUOUS");
  ambiguous.candidate_count = 11;
  ambiguous.candidates = Array.from({ length: 10 }, (_, i) =>
    identity(`plans/${"p".repeat(2000)}${i}`, `T${i}`));
  ambiguous.candidates_truncated = true;
  setItems(p.forecast[0], [ambiguous]);
  p.forecast[0].branch += "x".repeat(limit - encoded(p));
  assert.equal(decodeForecast(p).tag, "ready");
  p.forecast[0].branch += "x";
  expectUnavailable(p);
});

test("bounded items and cumulative ready count", () => {
  const payload = {
    scope: { kind: "all", repo: null },
    forecast_scope: { total_repos: 2, returned_repos: 2, truncated: false },
    forecast: [readyRepo("A"), readyRepo("B")],
  };
  setItems(payload.forecast[0], Array.from({ length: 1000 }, (_, i) => item(`a${i}`)));
  setItems(payload.forecast[1], Array.from({ length: 1000 }, (_, i) => item(`b${i}`)));
  assert.equal(decodeForecast(payload).tag, "ready");
  payload.forecast.push(readyRepo("C"));
  payload.forecast_scope.total_repos = 3;
  payload.forecast_scope.returned_repos = 3;
  setItems(payload.forecast[2], [item("c0")]);
  expectUnavailable(payload);
  setItems(payload.forecast[0], Array.from({ length: 1001 }, (_, i) => item(`a${i}`)));
  expectUnavailable(payload);
});

test("unknown additive keys reject before serializing huge extras", () => {
  const insertions = [
    (p) => { p.forecast_scope.extra = "x".repeat(limit + 1); },
    (p) => { p.forecast[0].extra = "x".repeat(limit + 1); },
    (p) => { p.forecast[0].mode_counts.extra = "x".repeat(limit + 1); },
    (p) => { setItems(p.forecast[0], [item("x")]); p.forecast[0].items[0].extra = "x".repeat(limit + 1); },
    (p) => { setItems(p.forecast[0], [item("x")]); p.forecast[0].items[0].target.extra = "x".repeat(limit + 1); },
    (p) => { setItems(p.forecast[0], [item("x", "AMBIGUOUS")]); p.forecast[0].items[0].candidates[0].extra = "x".repeat(limit + 1); },
  ];
  for (const insert of insertions) mutate(insert);
});
