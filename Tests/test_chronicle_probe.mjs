import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const frontendRequire = createRequire(resolve(root, "Frontend/package.json"));
const ts = frontendRequire("typescript");
const source = readFileSync(resolve(root, "Frontend/src/chronicleProbe.ts"), "utf8");
const emitted = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { startChronicleProbe } = await import(
  `data:text/javascript;base64,${Buffer.from(emitted).toString("base64")}`
);

function deferred () {
  let resolvePromise;
  let rejectPromise;
  const promise = new Promise((resolveValue, rejectValue) => {
    resolvePromise = resolveValue;
    rejectPromise = rejectValue;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

function fakeRuntime () {
  let now = 0;
  let nextHandle = 1;
  const timers = new Map();
  const requests = [];
  const runtime = {
    fetch(input, init) {
      const response = deferred();
      requests.push({ input, init, ...response });
      return response.promise;
    },
    setTimeout(callback, delay) {
      const handle = nextHandle++;
      timers.set(handle, { at: now + delay, callback });
      return handle;
    },
    clearTimeout(handle) {
      timers.delete(handle);
    },
  };
  function advance (duration) {
    const end = now + duration;
    while (true) {
      const next = [...timers.entries()]
        .filter(([, timer]) => timer.at <= end)
        .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!next) break;
      now = next[1].at;
      timers.delete(next[0]);
      next[1].callback();
    }
    now = end;
  }
  return { runtime, requests, timers, advance };
}

async function flush () {
  for (let index = 0; index < 6; index++) await Promise.resolve();
}

test("HEAD probe uses no-store and an abortable per-attempt deadline", async () => {
  const clock = fakeRuntime();
  const states = [];
  const stop = startChronicleProbe((state) => states.push(state), clock.runtime);
  assert.equal(clock.requests.length, 1);
  assert.equal(clock.requests[0].input, "/chronicle/");
  assert.equal(clock.requests[0].init.method, "HEAD");
  assert.equal(clock.requests[0].init.cache, "no-store");
  assert.ok(clock.requests[0].init.signal instanceof AbortSignal);
  assert.deepEqual(states, []);
  clock.advance(9_999);
  await flush();
  assert.deepEqual(states, []);
  assert.equal(clock.requests.length, 1);
  stop();
  assert.equal(clock.requests[0].init.signal.aborted, true);
  assert.equal(clock.timers.size, 0);
});

test("404 recovers to 200 after settlement, then stops polling", async () => {
  const clock = fakeRuntime();
  const states = [];
  const stop = startChronicleProbe((state) => states.push(state), clock.runtime);
  clock.requests[0].resolve({ status: 404 });
  await flush();
  assert.deepEqual(states, ["missing"]);
  clock.advance(9_999);
  assert.equal(clock.requests.length, 1);
  clock.advance(1);
  assert.equal(clock.requests.length, 2);
  clock.requests[1].resolve({ status: 200 });
  await flush();
  assert.deepEqual(states, ["missing", "ready"]);
  assert.equal(clock.timers.size, 0);
  clock.advance(60_000);
  assert.equal(clock.requests.length, 2);
  stop();
});

test("retry waits ten seconds after a delayed response, not from request start", async () => {
  const clock = fakeRuntime();
  const states = [];
  const stop = startChronicleProbe((state) => states.push(state), clock.runtime);
  clock.advance(4_000);
  assert.equal(clock.requests.length, 1);
  clock.requests[0].resolve({ status: 404 });
  await flush();
  assert.deepEqual(states, ["missing"]);
  clock.advance(9_999);
  assert.equal(clock.requests.length, 1);
  clock.advance(1);
  assert.equal(clock.requests.length, 2);
  stop();
});

test("only exact 404 is missing; other statuses and rejections are unavailable", async () => {
  for (const outcome of [{ status: 500 }, { status: 204 }, new Error("offline")]) {
    const clock = fakeRuntime();
    const states = [];
    const stop = startChronicleProbe((state) => states.push(state), clock.runtime);
    if (outcome instanceof Error) clock.requests[0].reject(outcome);
    else clock.requests[0].resolve(outcome);
    await flush();
    assert.deepEqual(states, ["unavailable"]);
    assert.equal(clock.requests.length, 1);
    clock.advance(10_000);
    assert.equal(clock.requests.length, 2);
    stop();
  }
});

test("deadline settles independently of abort and ignores a late success", async () => {
  const clock = fakeRuntime();
  const states = [];
  const stop = startChronicleProbe((state) => states.push(state), clock.runtime);
  clock.advance(10_000);
  await flush();
  assert.deepEqual(states, ["unavailable"]);
  assert.equal(clock.requests[0].init.signal.aborted, true);
  assert.equal(clock.requests.length, 1);
  clock.requests[0].resolve({ status: 200 });
  await flush();
  assert.deepEqual(states, ["unavailable"]);
  clock.advance(9_999);
  assert.equal(clock.requests.length, 1);
  clock.advance(1);
  assert.equal(clock.requests.length, 2);
  clock.requests[1].resolve({ status: 200 });
  await flush();
  assert.deepEqual(states, ["unavailable", "ready"]);
  stop();
});

test("old timed-out outcomes cannot remove an accepted reader", async () => {
  for (const lateOutcome of ["missing", "rejection"]) {
    const clock = fakeRuntime();
    const states = [];
    const stop = startChronicleProbe((state) => states.push(state), clock.runtime);
    clock.advance(10_000);
    await flush();
    assert.deepEqual(states, ["unavailable"]);
    assert.equal(clock.requests[0].init.signal.aborted, true);
    clock.advance(10_000);
    assert.equal(clock.requests.length, 2);
    clock.requests[1].resolve({ status: 200 });
    await flush();
    assert.deepEqual(states, ["unavailable", "ready"]);
    if (lateOutcome === "missing") clock.requests[0].resolve({ status: 404 });
    else clock.requests[0].reject(new Error("late abort rejection"));
    await flush();
    assert.deepEqual(states, ["unavailable", "ready"]);
    assert.equal(clock.timers.size, 0);
    clock.advance(30_000);
    assert.equal(clock.requests.length, 2);
    stop();
  }
});

test("cleanup during a pending request or retry is idempotent", async () => {
  const pending = fakeRuntime();
  const pendingStates = [];
  const stopPending = startChronicleProbe(
    (state) => pendingStates.push(state), pending.runtime,
  );
  stopPending();
  stopPending();
  assert.equal(pending.requests[0].init.signal.aborted, true);
  assert.equal(pending.timers.size, 0);
  pending.requests[0].resolve({ status: 200 });
  await flush();
  pending.advance(30_000);
  assert.deepEqual(pendingStates, []);
  assert.equal(pending.requests.length, 1);

  const retry = fakeRuntime();
  const retryStates = [];
  const stopRetry = startChronicleProbe(
    (state) => retryStates.push(state), retry.runtime,
  );
  retry.requests[0].resolve({ status: 404 });
  await flush();
  assert.deepEqual(retryStates, ["missing"]);
  stopRetry();
  stopRetry();
  assert.equal(retry.timers.size, 0);
  retry.advance(30_000);
  assert.equal(retry.requests.length, 1);
  assert.deepEqual(retryStates, ["missing"]);
});

test("StrictMode replay cannot publish the cleaned-up instance's result", async () => {
  const clock = fakeRuntime();
  const states = [];
  const stopOld = startChronicleProbe(
    (state) => states.push(`old:${state}`), clock.runtime,
  );
  stopOld();
  const stopNew = startChronicleProbe(
    (state) => states.push(`new:${state}`), clock.runtime,
  );
  assert.equal(clock.requests.length, 2);
  clock.requests[0].resolve({ status: 200 });
  clock.requests[1].resolve({ status: 404 });
  await flush();
  assert.deepEqual(states, ["new:missing"]);
  stopNew();
});

test("a synchronous fetch failure reports unavailable and retries", async () => {
  const clock = fakeRuntime();
  const states = [];
  let calls = 0;
  clock.runtime.fetch = () => {
    calls++;
    throw new Error("synchronous failure");
  };
  const stop = startChronicleProbe((state) => states.push(state), clock.runtime);
  await flush();
  assert.deepEqual(states, ["unavailable"]);
  clock.advance(9_999);
  assert.equal(calls, 1);
  clock.advance(1);
  await flush();
  assert.equal(calls, 2);
  assert.deepEqual(states, ["unavailable", "unavailable"]);
  stop();
});

test("rendered Chronicle states retain the host and show only the ready iframe", {
  timeout: 30_000,
}, async () => {
  const React = frontendRequire("react");
  const { renderToStaticMarkup } = frontendRequire("react-dom/server");
  const { createServer } = await import(
    pathToFileURL(frontendRequire.resolve("vite")).href
  );
  const vite = await createServer({
    root: resolve(root, "Frontend"),
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
    optimizeDeps: { noDiscovery: true, entries: [] },
  });
  try {
    const { ChronicleBody } = await vite.ssrLoadModule("/src/chronicleView.tsx");
    const markup = Object.fromEntries(
      ["checking", "missing", "unavailable", "ready"].map((state) => [
        state, renderToStaticMarkup(React.createElement(ChronicleBody, { state })),
      ]),
    );
    for (const html of Object.values(markup)) {
      assert.match(html, /<section[^>]*aria-labelledby="chronicle-heading"/);
      assert.match(html, /<h2[^>]*id="chronicle-heading"[^>]*>Chronicle<\/h2>/);
      assert.match(html, /data-view-heading/);
      const heading = html.match(/<h2[^>]*id="chronicle-heading"[^>]*>/)?.[0];
      assert.match(heading, /ui-page-title/);
      assert.match(heading, /tabindex="-1"/);
      assert.doesNotMatch(heading, /sr-only/);
      assert.match(html, /<a[^>]*href="\/chronicle\/"[^>]*target="_blank"[^>]*rel="noopener noreferrer"[^>]*>Open in new tab<\/a>/);
      assert.doesNotMatch(html, /within (a|one|1) minute/i);
    }
    assert.match(markup.checking, /Checking Chronicle availability/);
    assert.match(markup.missing, /No Chronicle page available yet/);
    assert.match(markup.missing, /Scripts\/Chronicle\/generate\.bat/);
    assert.match(markup.missing, /Scripts\/Chronicle\/install\.bat/);
    assert.match(markup.missing, /check System for the Chronicle worker status/);
    assert.match(markup.unavailable, /Chronicle check unavailable/);
    assert.match(markup.unavailable, /failed or timed out/);
    for (const state of ["missing", "unavailable"]) {
      assert.match(markup[state], /Retrying automatically in 10 seconds/);
    }
    for (const state of ["checking", "missing", "unavailable"]) {
      assert.match(markup[state], /role="status"/);
      assert.doesNotMatch(markup[state], /<iframe/);
    }
    assert.match(markup.ready, /<iframe[^>]*src="\/chronicle\/"/);
    assert.match(markup.ready, /title="KATLAB Chronicle"/);
    assert.match(markup.ready, /min-h-0 w-full flex-1/);
    assert.doesNotMatch(markup.ready, /role="status"/);
    const viewSource = readFileSync(resolve(root, "Frontend/src/chronicleView.tsx"), "utf8");
    assert.match(viewSource, /useEffect\(\(\) => startChronicleProbe\(setState\), \[\]\)/);
    assert.doesNotMatch(viewSource, /window\.open|setInterval|setTimeout|calc\(/);
  } finally {
    await vite.close();
  }
});
