import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { getEventListeners } from "node:events";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const frontendRequire = createRequire(resolve(root, "Frontend/package.json"));
const ts = frontendRequire("typescript");
const compiled = ts.transpileModule(readFileSync(resolve(root, "Frontend/src/api.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const apiUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`;
const { raceWithSignal } = await import(apiUrl);

function deferred () {
  let resolvePromise, rejectPromise;
  const promise = new Promise((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

function isEstablishedAbort (error) {
  assert.ok(error instanceof DOMException);
  assert.equal(error.name, "AbortError");
  assert.equal(error.message, "The operation was aborted.");
  return true;
}

const nextTurn = () => new Promise((resolve) => setImmediate(resolve));

test("no signal returns the exact supplied promise and preserves success or failure", async () => {
  const value = { accepted: true };
  const fulfilled = Promise.resolve(value);
  assert.equal(raceWithSignal(fulfilled), fulfilled);
  assert.equal(await raceWithSignal(fulfilled, undefined), value);

  const reason = new Error("original failure");
  const rejected = Promise.reject(reason);
  const observed = raceWithSignal(rejected);
  assert.equal(observed, rejected);
  await assert.rejects(observed, (error) => error === reason);
});

test("preabort settles independently of pending work without an abort listener", async () => {
  const owner = new AbortController();
  const customReason = new Error("custom cancellation reason");
  owner.abort(customReason);
  for (const pending of [deferred().promise, Promise.resolve({ ignored: true })]) {
    const before = getEventListeners(owner.signal, "abort");
    const observed = raceWithSignal(pending, owner.signal);
    assert.notEqual(observed, pending);
    await assert.rejects(observed, (error) => {
      assert.notEqual(error, customReason);
      return isEstablishedAbort(error);
    });
    assert.deepEqual(getEventListeners(owner.signal, "abort"), before);
  }
});

for (const mode of ["immediate", "late"]) {
  test(`preabort observes ${mode} supplied rejection in a strict isolated process`, { timeout: 15_000 }, () => {
    // No global rejection handler: an orphan rejection must fail this child process.
    const script = `
      import assert from "node:assert/strict";
      const { raceWithSignal } = await import(${JSON.stringify(apiUrl)});
      const owner = new AbortController();
      owner.abort(new Error("custom reason"));
      let rejectStage;
      const stage = ${mode === "immediate"
        ? 'Promise.reject(new Error("supplied-stage-immediate"))'
        : 'new Promise((resolve, reject) => { rejectStage = reject; })'};
      await assert.rejects(raceWithSignal(stage, owner.signal), (error) => {
        assert.ok(error instanceof DOMException);
        assert.equal(error.name, "AbortError");
        assert.equal(error.message, "The operation was aborted.");
        return true;
      });
      ${mode === "late" ? 'rejectStage(new Error("supplied-stage-late"));' : ""}
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));
      console.log(JSON.stringify({ mode: ${JSON.stringify(mode)}, completed: true }));
    `;
    const child = spawnSync(process.execPath, ["--unhandled-rejections=strict", "--input-type=module"], {
      input: script, encoding: "utf8", windowsHide: true, timeout: 10_000, maxBuffer: 1_048_576,
    });
    assert.equal(child.error, undefined, child.error?.message);
    assert.equal(child.signal, null);
    const failure = child.stderr.match(/Error: supplied-stage-(?:immediate|late)/)?.[0]
      ?? child.stderr.slice(0, 300);
    assert.equal(child.status, 0, `strict child rejected: ${failure}`);
    assert.equal(child.stderr, "");
    assert.deepEqual(JSON.parse(child.stdout.trim()), { mode, completed: true });
  });
}

test("active success and rejection preserve identities and remove only their listener", async () => {
  for (const outcome of ["resolve", "reject"]) {
    const owner = new AbortController();
    let otherCalls = 0;
    const unrelated = () => { otherCalls += 1; };
    owner.signal.addEventListener("abort", unrelated);
    const pending = deferred();
    const observed = raceWithSignal(pending.promise, owner.signal);
    const listeners = getEventListeners(owner.signal, "abort");
    assert.equal(listeners.length, 2);
    assert.ok(listeners.includes(unrelated));
    const value = { outcome };
    if (outcome === "resolve") {
      pending.resolve(value);
      assert.equal(await observed, value);
    } else {
      pending.reject(value);
      await assert.rejects(observed, (error) => error === value);
    }
    assert.deepEqual(getEventListeners(owner.signal, "abort"), [unrelated]);
    owner.abort();
    owner.abort();
    assert.equal(otherCalls, 1);
    owner.signal.removeEventListener("abort", unrelated);
    assert.deepEqual(getEventListeners(owner.signal, "abort"), []);
  }
});

test("synchronous abort wins before an already-fulfilled input's reaction microtask", async () => {
  const owner = new AbortController();
  const observed = raceWithSignal(Promise.resolve({ ignored: true }), owner.signal);
  owner.abort("custom reason");
  await assert.rejects(observed, isEstablishedAbort);
  assert.deepEqual(getEventListeners(owner.signal, "abort"), []);
});

test("already-settled observer success and failure survive later cancellation", async () => {
  for (const outcome of ["resolve", "reject"]) {
    const owner = new AbortController();
    const value = { retained: true };
    const pending = deferred();
    const observed = raceWithSignal(pending.promise, owner.signal);
    const check = () => outcome === "resolve"
      ? observed.then((result) => assert.equal(result, value))
      : assert.rejects(observed, (error) => error === value);
    if (outcome === "resolve") pending.resolve(value);
    else pending.reject(value);
    await check();
    assert.deepEqual(getEventListeners(owner.signal, "abort"), []);
    owner.abort();
    await check();
  }
});

test("abort observes late success and failure without a second result or listener loss", async () => {
  for (const outcome of ["resolve", "reject"]) {
    const owner = new AbortController();
    let otherCalls = 0;
    const unrelated = () => { otherCalls += 1; };
    owner.signal.addEventListener("abort", unrelated);
    const pending = deferred();
    const observed = raceWithSignal(pending.promise, owner.signal);
    const outcomes = [];
    const observer = observed.then(
      () => { outcomes.push("unexpected success"); },
      (error) => { isEstablishedAbort(error); outcomes.push(error.name); },
    );
    owner.abort(new Error("first reason"));
    owner.abort(new Error("ignored later reason"));
    await observer;
    assert.deepEqual(getEventListeners(owner.signal, "abort"), [unrelated]);
    assert.equal(otherCalls, 1);
    if (outcome === "resolve") pending.resolve({ tooLate: true });
    else pending.reject(new Error("late supplied failure"));
    await nextTurn();
    assert.deepEqual(outcomes, ["AbortError"]);
    await assert.rejects(observed, isEstablishedAbort);
    assert.deepEqual(getEventListeners(owner.signal, "abort"), [unrelated]);
    owner.signal.removeEventListener("abort", unrelated);
  }
});
