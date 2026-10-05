import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(resolve(root, "Frontend/package.json"));
const ts = require("typescript");
const source = readFileSync(resolve(root, "Frontend/src/ws.ts"), "utf8");
const emitted = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { connectWs } = await import(`data:text/javascript;base64,${Buffer.from(emitted).toString("base64")}`);

// Actual source, controlled boundaries. Saved callback replays are adversarial,
// not a claim that native browsers emit duplicate close or obsolete messages.
async function withTransport (run, protocol = "http:") {
  const originals = new Map();
  const sockets = [], timers = new Map(), intervals = new Map(), stops = [];
  const clearedTimers = [], clearedIntervals = [];
  let timeoutId = 0, intervalId = 100;
  class Socket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    constructor(url) {
      this.url = url;
      this.readyState = Socket.CONNECTING;
      this.closeCalls = 0;
      this.sent = [];
      this.closeThrows = false;
      this.closeSynchronously = false;
      this.onopen = this.onmessage = this.onerror = this.onclose = null;
      sockets.push(this);
    }
    open() { this.readyState = Socket.OPEN; this.onopen?.(); }
    message(data) { this.onmessage?.({ data }); }
    remoteClose() { this.readyState = Socket.CLOSED; this.onclose?.(); }
    error() { this.onerror?.(); }
    send(value) { this.sent.push(value); }
    close() {
      this.closeCalls++;
      if (this.closeThrows) throw new Error("private native close failure");
      this.readyState = Socket.CLOSING;
      if (this.closeSynchronously) this.remoteClose();
    }
  }
  const globals = {
    WebSocket: Socket,
    location: { protocol, host: "fixture.invalid:8765" },
    setTimeout(callback, delay) {
      const id = timeoutId++;
      timers.set(id, { id, callback, delay });
      return id;
    },
    clearTimeout(id) { clearedTimers.push(id); timers.delete(id); },
    setInterval(callback, delay) {
      const id = intervalId++;
      intervals.set(id, { id, callback, delay });
      return id;
    },
    clearInterval(id) { clearedIntervals.push(id); intervals.delete(id); },
  };
  for (const [key, value] of Object.entries(globals)) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, value });
  }
  const fixture = {
    sockets, timers, intervals, clearedTimers, clearedIntervals, Socket,
    connect(onMessage = () => {}, onSync = () => {}, onStatus) {
      const stop = connectWs(onMessage, onSync, onStatus);
      stops.push(stop);
      return stop;
    },
    fireRetry() {
      assert.equal(timers.size, 1, "exactly one retry must be owned");
      const record = timers.values().next().value;
      timers.delete(record.id);
      record.callback();
      return record;
    },
  };
  try { return await run(fixture); }
  finally {
    try { for (const stop of stops) stop(); }
    finally {
      for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
      }
    }
  }
}

function savedHandlers (socket) {
  const saved = {};
  for (const kind of ["open", "message", "error", "close"]) {
    assert.equal(typeof socket[`on${kind}`], "function");
    saved[kind] = socket[`on${kind}`];
  }
  return saved;
}

function assertDetached (socket) {
  for (const kind of ["open", "message", "error", "close"]) {
    assert.equal(socket[`on${kind}`], null, `${kind} handler must be detached`);
  }
}

test("WS selects same-origin ws/wss and synchronously creates one subscription", async () => {
  for (const protocol of ["http:", "https:"]) {
    await withTransport(f => {
      const messages = [];
      let syncs = 0;
      const stop = f.connect(message => messages.push(message), () => syncs++);
      assert.equal(f.sockets.length, 1);
      assert.equal(f.sockets[0].url, `${protocol === "https:" ? "wss" : "ws"}://fixture.invalid:8765/ws`);
      assert.equal(syncs, 0);
      assert.equal(f.timers.size, 0);
      assert.equal(f.intervals.size, 1);
      f.sockets[0].open();
      assert.equal(syncs, 1);
      const frame = { type: "event_resolved", id: "fixture", data: { id: 42 } };
      f.sockets[0].message(JSON.stringify(frame));
      assert.deepEqual(messages, [frame]);
      stop();
      assert.equal(f.intervals.size, 0);
    }, protocol);
  }
});

test("WS preserves capped retry delays and resets only after an accepted open", async () => {
  await withTransport(f => {
    let syncs = 0;
    f.connect(() => {}, () => syncs++);
    for (const expected of [1000, 2000, 4000, 8000, 15000, 15000]) {
      const socket = f.sockets.at(-1);
      socket.remoteClose();
      assert.equal(socket.closeCalls, 0, "a close event must not call native close again");
      assertDetached(socket);
      assert.equal(f.timers.values().next().value.delay, expected);
      f.fireRetry();
    }
    assert.equal(f.sockets.length, 7);
    assert.equal(syncs, 0);
    f.sockets.at(-1).open();
    assert.equal(syncs, 1);
    f.sockets.at(-1).remoteClose();
    assert.equal(f.timers.values().next().value.delay, 1000);
    f.fireRetry(); f.sockets.at(-1).open();
    assert.equal(syncs, 2, "reconnection retains the REST resnapshot callback");
  });
});

test("WS keepalive sends text ping every 25 seconds only through the current OPEN socket", async () => {
  await withTransport(f => {
    const stop = f.connect();
    const tick = f.intervals.values().next().value;
    assert.equal(tick.delay, 25000);
    tick.callback();
    assert.deepEqual(f.sockets[0].sent, []);
    f.sockets[0].open(); tick.callback();
    assert.deepEqual(f.sockets[0].sent, ["ping"]);
    f.sockets[0].readyState = f.Socket.CLOSING; tick.callback();
    f.sockets[0].remoteClose(); tick.callback();
    assert.deepEqual(f.sockets[0].sent, ["ping"]);
    f.fireRetry(); f.sockets[1].open(); tick.callback();
    assert.deepEqual(f.sockets[1].sent, ["ping"]);
    stop(); tick.callback();
    assert.deepEqual(f.sockets[1].sent, ["ping"], "saved interval callback is inert after cleanup");
    assert.equal(f.intervals.size, 0);
  });
});

test("WS cleanup cancels a pending retry including a zero-valued timer handle", async () => {
  await withTransport(f => {
    const stop = f.connect();
    f.sockets[0].remoteClose();
    const retry = f.timers.values().next().value;
    assert.equal(retry.id, 0);
    stop();
    assert.deepEqual(f.clearedTimers, [0]);
    assert.equal(f.timers.size, 0);
    assert.equal(f.intervals.size, 0);
    retry.callback();
    assert.equal(f.sockets.length, 1, "saved canceled retry cannot create a socket");
    assert.equal(f.sockets[0].closeCalls, 0, "already-retired socket is not closed again");
    stop();
    assert.deepEqual(f.clearedTimers, [0]);
    assert.equal(f.clearedIntervals.length, 1);
  });
});

test("a saved old retry cannot consume a later pending retry record", async () => {
  await withTransport(f => {
    f.connect();
    f.sockets[0].remoteClose();
    const old = f.fireRetry();
    f.sockets[1].remoteClose();
    const current = f.timers.values().next().value;
    old.callback();
    assert.equal(f.sockets.length, 2);
    assert.equal(f.timers.size, 1);
    assert.equal(f.timers.get(current.id), current);
    assert.equal(current.delay, 2000);
    f.fireRetry();
    assert.equal(f.sockets.length, 3);
  });
});

test("saved obsolete socket handlers cannot consume messages, resync or change the replacement", async () => {
  await withTransport(f => {
    let messages = 0, syncs = 0;
    f.connect(() => messages++, () => syncs++);
    const old = f.sockets[0], saved = savedHandlers(old);
    old.remoteClose(); f.fireRetry();
    const current = f.sockets[1];
    current.open();
    saved.open(); saved.message({ data: '{"type":"warning","data":{}}' });
    saved.error(); saved.close(); saved.close();
    assert.equal(messages, 0);
    assert.equal(syncs, 1);
    assert.equal(current.closeCalls, 0);
    assert.equal(old.closeCalls, 0);
    assert.equal(f.timers.size, 0);
    current.remoteClose();
    assert.equal(f.timers.values().next().value.delay, 1000,
      "obsolete callbacks cannot alter the replacement's backoff");
  });
});

test("duplicate close callbacks retire one candidate and schedule only one retry", async () => {
  await withTransport(f => {
    f.connect();
    const socket = f.sockets[0], saved = savedHandlers(socket);
    socket.remoteClose(); saved.close(); saved.close();
    assert.equal(f.timers.size, 1);
    assert.equal(f.timers.values().next().value.delay, 1000);
    f.fireRetry();
    assert.equal(f.sockets.length, 2);
    f.sockets[1].remoteClose();
    assert.equal(f.timers.values().next().value.delay, 2000);
  });
});

test("current error closes only its candidate and native-order close owns the retry", async () => {
  await withTransport(f => {
    f.connect();
    const first = f.sockets[0], savedError = first.onerror;
    first.error();
    assert.equal(first.closeCalls, 1);
    assert.equal(f.timers.size, 0, "error itself does not create a competing retry");
    first.remoteClose(); f.fireRetry();
    const second = f.sockets[1];
    savedError();
    assert.equal(second.closeCalls, 0);
    second.error();
    assert.equal(second.closeCalls, 1);
    second.remoteClose();
    assert.equal(f.timers.size, 1);
  });
});

test("connecting and open cleanup detach handlers and make all saved callbacks inert", async () => {
  for (const opened of [false, true]) {
    for (const throwClose of [false, true]) {
      await withTransport(f => {
        let messages = 0, syncs = 0;
        const stop = f.connect(() => messages++, () => syncs++);
        const socket = f.sockets[0], saved = savedHandlers(socket);
        if (opened) socket.open();
        socket.closeThrows = throwClose;
        socket.closeSynchronously = true; // Adversarial boundary, not native timing.
        assert.doesNotThrow(stop);
        assertDetached(socket);
        saved.open(); saved.message({ data: "{}" }); saved.error(); saved.close();
        assert.equal(messages, 0);
        assert.equal(syncs, Number(opened));
        assert.equal(f.timers.size, 0);
        assert.equal(f.intervals.size, 0);
        assert.equal(socket.closeCalls, 1);
        assert.doesNotThrow(stop);
        assert.equal(socket.closeCalls, 1);
      });
    }
  }
});

test("consumer and onSync callbacks may synchronously tear down without resurrection", async () => {
  for (const callback of ["open", "message"]) {
    await withTransport(f => {
      let calls = 0, stop;
      const finish = () => { calls++; stop(); };
      stop = f.connect(callback === "message" ? finish : () => {},
        callback === "open" ? finish : () => {});
      const socket = f.sockets[0], saved = savedHandlers(socket);
      socket.open();
      if (callback === "message") socket.message("{}");
      assert.equal(calls, 1);
      assertDetached(socket);
      saved.open(); saved.message({ data: "{}" }); saved.close(); saved.error();
      assert.equal(calls, 1);
      assert.equal(socket.closeCalls, 1);
      assert.equal(f.timers.size, 0);
      assert.equal(f.intervals.size, 0);
    });
  }
});

test("independent WS subscriptions do not cancel or mutate each other's lifecycle", async () => {
  await withTransport(f => {
    let firstMessages = 0, secondMessages = 0;
    const firstStop = f.connect(() => firstMessages++);
    const secondStop = f.connect(() => secondMessages++);
    const first = f.sockets[0], second = f.sockets[1];
    first.remoteClose(); second.open();
    firstStop();
    assert.equal(f.timers.size, 0);
    assert.equal(f.intervals.size, 1);
    assert.equal(second.closeCalls, 0);
    second.message("{}");
    assert.equal(firstMessages, 0);
    assert.equal(secondMessages, 1);
    second.remoteClose();
    assert.equal(f.timers.values().next().value.delay, 1000);
    f.fireRetry();
    assert.equal(f.sockets.length, 3);
    secondStop();
    assert.equal(f.intervals.size, 0);
  });
});

test("WS retains JSON and consumer exception policy without new payload validation", async () => {
  await withTransport(f => {
    const messages = [];
    f.connect(message => {
      messages.push(message);
      if (messages.length === 1) throw new Error("private consumer failure");
    });
    const socket = f.sockets[0];
    socket.open();
    assert.doesNotThrow(() => socket.message("{broken"));
    assert.deepEqual(messages, []);
    assert.doesNotThrow(() => socket.message('{"type":"warning"}'));
    assert.doesNotThrow(() => socket.message("null"));
    assert.doesNotThrow(() => socket.message("[]"));
    assert.deepEqual(messages, [{ type: "warning" }, null, []]);
    assert.equal(f.timers.size, 0);
    assert.equal(socket.closeCalls, 0);
  });
});

test("WS publishes owned connection transitions without changing retry or sync timing", async () => {
  await withTransport(f => {
    const states = [], events = [];
    const stop = f.connect(() => {}, () => events.push("sync"), state => {
      states.push(state); events.push(state);
    });
    assert.deepEqual(states, ["connecting"]);
    const old = f.sockets[0], saved = savedHandlers(old);
    old.open(); old.remoteClose();
    assert.deepEqual(events, ["connecting", "connected", "sync", "reconnecting"]);
    assert.equal(f.timers.values().next().value.delay, 1000);
    f.fireRetry(); f.sockets[1].remoteClose();
    assert.equal(f.timers.values().next().value.delay, 2000);
    assert.deepEqual(states, ["connecting", "connected", "reconnecting"], "retry attempts do not flicker status");
    f.fireRetry(); f.sockets[2].open();
    saved.open(); saved.close(); saved.error();
    assert.deepEqual(states, ["connecting", "connected", "reconnecting", "connected"]);
    assert.equal(events.filter(value => value === "sync").length, 2);
    const current = savedHandlers(f.sockets[2]);
    stop(); current.open(); current.close(); current.error();
    assert.equal(states.length, 4, "cleanup and obsolete callbacks cannot publish status");
    assert.equal(f.intervals.size, 0);
  });
});

test("WS observer failures cannot prevent connection, snapshot sync or retry", async () => {
  await withTransport(f => {
    const states = [];
    let syncs = 0;
    assert.doesNotThrow(() => f.connect(() => {}, () => syncs++, state => {
      states.push(state);
      throw new Error("private observer failure");
    }));
    assert.doesNotThrow(() => f.sockets[0].open());
    assert.equal(syncs, 1);
    assert.doesNotThrow(() => f.sockets[0].remoteClose());
    assert.equal(f.timers.size, 1);
    f.fireRetry(); f.sockets[1].open();
    assert.equal(syncs, 2);
    assert.deepEqual(states, ["connecting", "connected", "reconnecting", "connected"]);
  });
});

test("WS status observers may tear down on connected or reconnecting without resurrection", async () => {
  for (const teardownAt of ["connected", "reconnecting"]) {
    await withTransport(f => {
      let syncs = 0, stop;
      const states = [];
      stop = f.connect(() => {}, () => syncs++, state => {
        states.push(state);
        if (state === teardownAt) stop();
      });
      const socket = f.sockets[0], saved = savedHandlers(socket);
      socket.open();
      if (teardownAt === "reconnecting") socket.remoteClose();
      saved.open(); saved.close(); saved.error();
      assert.equal(syncs, Number(teardownAt === "reconnecting"));
      assert.equal(states.at(-1), teardownAt);
      assert.equal(f.timers.size, 0);
      assert.equal(f.intervals.size, 0);
      assertDetached(socket);
    });
  }
});
