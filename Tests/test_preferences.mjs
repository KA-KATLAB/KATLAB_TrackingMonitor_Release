import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const frontendRoot = resolve(root, "Frontend");
const frontendRequire = createRequire(resolve(frontendRoot, "package.json"));
const ts = frontendRequire("typescript");
let moduleSerial = 0;

function transpile (name) {
  const source = readFileSync(resolve(frontendRoot, "src", name), "utf8");
  return ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

function dataUrl (code) {
  return `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
}

const preferenceUrl = dataUrl(transpile("preferences.ts"));
const preferences = await import(preferenceUrl);
const apiUrl = dataUrl(transpile("api.ts"));
const api = await import(apiUrl);

async function freshModule (name) {
  const emitted = transpile(name);
  const imports = emitted.match(/from ["']\.\/preferences["']/g) ?? [];
  assert.equal(imports.length, 1, `${name} must use the shared preference boundary`);
  let linked = emitted.replace(imports[0], `from "${preferenceUrl}"`);
  if (name === "notify.ts" || name === "sound.ts") {
    const apiImports = linked.match(/from ["']\.\/api["']/g) ?? [];
    assert.equal(apiImports.length, 1, `${name} must reuse the shared observation race`);
    linked = linked.replace(apiImports[0], `from "${apiUrl}"`);
  }
  return import(`${dataUrl(linked)}#fixture-${++moduleSerial}`);
}

async function withGlobals (descriptors, run) {
  const originals = new Map();
  for (const [key, descriptor] of Object.entries(descriptors)) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, ...descriptor });
  }
  try {
    return await run();
  } finally {
    for (const [key, original] of originals) {
      if (original) Object.defineProperty(globalThis, key, original);
      else delete globalThis[key];
    }
  }
}

function storageFixture (initial = {}) {
  const values = new Map(Object.entries(initial));
  const calls = [];
  const failure = { read: false, write: false, onWrite: false, silent: false };
  const storage = {
    getItem(key) {
      calls.push(`read:${key}`);
      if (failure.read) throw new DOMException("blocked", "SecurityError");
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      calls.push(`write:${key}:${value}`);
      if (failure.write || (failure.onWrite && value === "on")) {
        throw new DOMException("full", "QuotaExceededError");
      }
      if (!failure.silent) values.set(key, value);
    },
  };
  return { storage, values, calls, failure };
}

function windowFixture () {
  const listeners = new Map();
  return {
    listeners,
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    dispatch(type) {
      for (const listener of [...(listeners.get(type) ?? [])]) listener({ type });
    },
    focus() {},
  };
}

function deadlineWindowFixture () {
  const window = windowFixture();
  let now = 0, serial = 0;
  const timers = new Map();
  window.setTimeout = (callback, delay) => {
    const id = ++serial;
    timers.set(id, { callback, at: now + delay });
    return id;
  };
  window.clearTimeout = id => timers.delete(id);
  return { window, timers, advance(milliseconds) {
    now += milliseconds;
    for (const [id, timer] of [...timers]) {
      if (timer.at <= now) { timers.delete(id); timer.callback(); }
    }
  } };
}

function deferred () {
  let resolvePromise;
  let rejectPromise;
  const promise = new Promise((resolveValue, rejectValue) => {
    resolvePromise = resolveValue;
    rejectPromise = rejectValue;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

async function flush () {
  for (let index = 0; index < 8; index++) await Promise.resolve();
}

function audioFixture () {
  const calls = { created: 0, gains: 0, resumed: 0, suspended: 0,
    closed: 0, disconnected: 0, notes: 0, instances: [] };
  const behavior = { constructorFailures: 0, gainFailures: 0,
    resume: null, suspend: null, close: null };
  class AudioContextFake {
    constructor() {
      calls.created++;
      if (behavior.constructorFailures-- > 0) throw new Error("audio constructor failed");
      this.state = "suspended";
      this.currentTime = 0;
      this.destination = {};
      calls.instances.push(this);
    }
    createGain() {
      calls.gains++;
      if (behavior.gainFailures-- > 0) throw new Error("gain setup failed");
      const gain = {
        gain: {
          value: 0,
          setValueAtTime() {},
          linearRampToValueAtTime() {},
          exponentialRampToValueAtTime() {},
        },
        connect() {},
        disconnect() { calls.disconnected++; },
      };
      this.masterGain = gain;
      return gain;
    }
    createOscillator() {
      return {
        frequency: { value: 0 },
        connect() {},
        start() { calls.notes++; },
        stop() {},
      };
    }
    resume() {
      calls.resumed++;
      if (behavior.resume) return behavior.resume(this, calls.resumed);
      this.state = "running";
      return Promise.resolve();
    }
    suspend() {
      calls.suspended++;
      this.state = "suspended";
      return behavior.suspend ? behavior.suspend(this) : Promise.resolve();
    }
    close() {
      calls.closed++;
      if (behavior.close) return behavior.close(this, calls.closed);
      this.state = "closed";
      return Promise.resolve();
    }
  }
  return { AudioContextFake, calls, behavior };
}

function notificationFixture (permission = "granted") {
  const calls = { prompts: 0, shown: 0 };
  const behavior = { permission, promptError: false, permissionError: false,
    constructorError: false };
  class NotificationFake {
    static get permission() {
      if (behavior.permissionError) throw new Error("permission unavailable");
      return behavior.permission;
    }
    static async requestPermission() {
      calls.prompts++;
      if (behavior.promptError) throw new Error("prompt blocked");
      return behavior.permission;
    }
    constructor() {
      calls.shown++;
      if (behavior.constructorError) throw new Error("notification unavailable");
    }
  }
  return { NotificationFake, calls, behavior };
}

test("preference helpers are inert until called and fail softly", async () => {
  const denied = { get() { throw new DOMException("blocked", "SecurityError"); } };
  await withGlobals({ localStorage: denied }, async () => {
    assert.ok(await import(`${preferenceUrl}#getter-${++moduleSerial}`));
    assert.equal(preferences.readPreference("katlab.sound"), null);
    assert.equal(preferences.writePreference("katlab.sound", "on"), false);
  });
  await withGlobals({ localStorage: { value: undefined } }, async () => {
    assert.equal(preferences.readPreference("missing"), null);
    assert.equal(preferences.writePreference("missing", "on"), false);
  });
  const store = storageFixture();
  await withGlobals({ localStorage: { value: store.storage } }, async () => {
    assert.equal(preferences.readPreference("missing"), null);
    assert.equal(preferences.writePreference("key", "value"), true);
    assert.equal(preferences.readPreference("key"), "value");
    store.failure.read = true;
    assert.equal(preferences.readPreference("key"), null);
    store.failure.read = false;
    store.failure.write = true;
    assert.equal(preferences.writePreference("key", "other"), false);
    assert.equal(store.values.get("key"), "value");
  });
});

test("only preferences.ts calls browser storage directly", () => {
  const violations = readdirSync(resolve(frontendRoot, "src"))
    .filter((name) => /\.tsx?$/.test(name) && name !== "preferences.ts")
    .filter((name) => /\blocalStorage\s*(?:\.|\[)/.test(
      readFileSync(resolve(frontendRoot, "src", name), "utf8"),
    ));
  assert.deepEqual(violations, []);
});

test("sound imports under denied storage without installing a gesture listener", async () => {
  const audio = audioFixture();
  const win = windowFixture();
  await withGlobals({
    localStorage: { get() { throw new DOMException("blocked", "SecurityError"); } },
    window: { value: win },
    AudioContext: { value: audio.AudioContextFake },
  }, async () => {
    const sound = await freshModule("sound.ts");
    assert.equal(sound.soundWanted(), false);
    assert.equal(win.listeners.get("pointerdown")?.size ?? 0, 0);
    assert.equal(audio.calls.created, 0);
  });
});

test("sound enables only after verified opt-in and then disables", async () => {
  const store = storageFixture();
  const audio = audioFixture();
  await withGlobals({
    localStorage: { value: store.storage },
    AudioContext: { value: audio.AudioContextFake },
  }, async () => {
    const sound = await freshModule("sound.ts");
    assert.deepEqual(await sound.setSoundEnabled(true), { enabled: true, persisted: true });
    assert.equal(store.values.get("katlab.sound"), "on");
    assert.equal(sound.soundWanted(), true);
    assert.equal(audio.calls.created, 1);
    assert.equal(audio.calls.resumed, 1);
    assert.ok(audio.calls.notes >= 1, "enable confirmation must play after resume");
    assert.deepEqual(await sound.setSoundEnabled(false), { enabled: false, persisted: true });
    assert.equal(sound.soundWanted(), false);
    assert.equal(store.values.get("katlab.sound"), "off");
    assert.equal(audio.calls.suspended, 0, "retirement never awaits native suspend");
    assert.equal(audio.calls.disconnected, 1);
    assert.equal(audio.calls.closed, 1);
  });
});

test("sound storage failure never creates audio and a failed disable vetoes old on", async () => {
  for (const failure of ["write", "read", "silent"]) {
    const store = storageFixture();
    const audio = audioFixture();
    store.failure[failure] = true;
    await withGlobals({
      localStorage: { value: store.storage },
      AudioContext: { value: audio.AudioContextFake },
    }, async () => {
      const sound = await freshModule("sound.ts");
      assert.deepEqual(await sound.setSoundEnabled(true), {
        enabled: false, persisted: false,
      });
      assert.equal(sound.soundWanted(), false);
      assert.equal(audio.calls.created, 0);
    });
  }
  const store = storageFixture({ "katlab.sound": "on" });
  const audio = audioFixture();
  store.failure.write = true;
  await withGlobals({
    localStorage: { value: store.storage },
    AudioContext: { value: audio.AudioContextFake },
  }, async () => {
    const sound = await freshModule("sound.ts");
    assert.deepEqual(await sound.setSoundEnabled(false), {
      enabled: false, persisted: false,
    });
    assert.equal(store.values.get("katlab.sound"), "on");
    assert.equal(sound.soundWanted(), false);
    sound.playChime();
    assert.equal(audio.calls.notes, 0);
    store.failure.write = false;
    assert.deepEqual(await sound.setSoundEnabled(true), {
      enabled: true, persisted: true,
    });
    assert.equal(sound.soundWanted(), true);
  });
});

test("missing AudioContext leaves sound off without throwing", async () => {
  const store = storageFixture();
  await withGlobals({
    localStorage: { value: store.storage },
    AudioContext: { value: undefined },
  }, async () => {
    const sound = await freshModule("sound.ts");
    assert.deepEqual(await sound.setSoundEnabled(true), {
      enabled: false, persisted: true,
    });
    assert.equal(store.values.get("katlab.sound"), "off");
    assert.equal(sound.soundWanted(), false);
  });
});

test("audio setup, resume, and close failures fail closed without poisoning retry", async () => {
  for (const failure of ["constructorFailures", "gainFailures"]) {
    const store = storageFixture();
    const audio = audioFixture();
    audio.behavior[failure] = 1;
    await withGlobals({
      localStorage: { value: store.storage },
      AudioContext: { value: audio.AudioContextFake },
    }, async () => {
      const sound = await freshModule("sound.ts");
      assert.deepEqual(await sound.setSoundEnabled(true), {
        enabled: false, persisted: true,
      });
      assert.equal(sound.soundWanted(), false);
      assert.equal(store.values.get("katlab.sound"), "off");
      if (failure === "gainFailures") assert.equal(audio.calls.closed, 1);
      assert.deepEqual(await sound.setSoundEnabled(true), {
        enabled: true, persisted: true,
      });
      assert.equal(audio.calls.created, 2);
    });
  }
  for (const outcome of ["reject", "not-running"]) {
    const store = storageFixture();
    const audio = audioFixture();
    audio.behavior.resume = outcome === "reject"
      ? () => Promise.reject(new Error("resume denied"))
      : () => Promise.resolve();
    await withGlobals({
      localStorage: { value: store.storage },
      AudioContext: { value: audio.AudioContextFake },
    }, async () => {
      const sound = await freshModule("sound.ts");
      assert.deepEqual(await sound.setSoundEnabled(true), {
        enabled: false, persisted: true,
      });
      assert.equal(sound.soundWanted(), false);
      assert.equal(store.values.get("katlab.sound"), "off");
    });
  }
  const store = storageFixture();
  const audio = audioFixture();
  audio.behavior.close = () => Promise.reject(new Error("close denied"));
  await withGlobals({
    localStorage: { value: store.storage },
    AudioContext: { value: audio.AudioContextFake },
  }, async () => {
    const sound = await freshModule("sound.ts");
    assert.deepEqual(await sound.setSoundEnabled(true), { enabled: true, persisted: true });
    assert.deepEqual(await sound.setSoundEnabled(false), { enabled: false, persisted: true });
    await flush();
    assert.equal(sound.soundWanted(), false);
    assert.equal(audio.calls.disconnected, 1);
    assert.equal(audio.calls.closed, 1);
    assert.equal(audio.calls.suspended, 0);
  });
});

test("persisted-on gesture failures remove listeners and remain off", async () => {
  for (const failure of ["setup", "resume"]) {
    const store = storageFixture({ "katlab.sound": "on" });
    const audio = audioFixture();
    const win = windowFixture();
    if (failure === "setup") audio.behavior.gainFailures = 1;
    else audio.behavior.resume = () => Promise.reject(new Error("resume denied"));
    await withGlobals({
      localStorage: { value: store.storage },
      window: { value: win },
      AudioContext: { value: audio.AudioContextFake },
    }, async () => {
      const sound = await freshModule("sound.ts");
      assert.equal(win.listeners.get("pointerdown")?.size, 1);
      win.dispatch("pointerdown");
      await flush();
      assert.equal(win.listeners.get("pointerdown")?.size, 0);
      assert.equal(win.listeners.get("keydown")?.size, 0);
      assert.equal(sound.soundWanted(), false);
      assert.equal(store.values.get("katlab.sound"), "off");
    });
  }
});

test("gesture read failure vetoes stale on even when off rollback cannot persist", async () => {
  const store = storageFixture({ "katlab.sound": "on" });
  const audio = audioFixture();
  const win = windowFixture();
  await withGlobals({
    localStorage: { value: store.storage },
    window: { value: win },
    AudioContext: { value: audio.AudioContextFake },
  }, async () => {
    const sound = await freshModule("sound.ts");
    assert.equal(win.listeners.get("pointerdown")?.size, 1);
    assert.equal(sound.soundWanted(), true);
    store.failure.read = true;
    store.failure.write = true;
    win.dispatch("pointerdown");
    await flush();
    assert.equal(audio.calls.created, 0);
    assert.equal(win.listeners.get("pointerdown")?.size, 0);
    assert.equal(win.listeners.get("keydown")?.size, 0);
    assert.ok(store.calls.includes("write:katlab.sound:off"));
    assert.equal(store.values.get("katlab.sound"), "on");
    store.failure.read = false;
    assert.equal(sound.soundWanted(), false);
  });
});

test("older gesture completion cannot undo a newer explicit sound choice", async () => {
  const store = storageFixture({ "katlab.sound": "on" });
  const audio = audioFixture();
  const win = windowFixture();
  const old = deferred();
  audio.behavior.resume = (context, call) => {
    if (call === 1) return old.promise;
    context.state = "running";
    return Promise.resolve();
  };
  await withGlobals({
    localStorage: { value: store.storage },
    window: { value: win },
    AudioContext: { value: audio.AudioContextFake },
  }, async () => {
    const sound = await freshModule("sound.ts");
    win.dispatch("pointerdown");
    assert.deepEqual(await sound.setSoundEnabled(false), {
      enabled: false, persisted: true,
    });
    assert.deepEqual(await sound.setSoundEnabled(true), {
      enabled: true, persisted: true,
    });
    old.reject(new Error("older resume rejected"));
    await flush();
    assert.equal(sound.soundWanted(), true);
    assert.equal(store.values.get("katlab.sound"), "on");
    assert.equal(win.listeners.get("pointerdown")?.size, 0);
  });

  const stale = storageFixture({ "katlab.sound": "on" });
  const delayed = deferred();
  const secondAudio = audioFixture();
  const secondWin = windowFixture();
  secondAudio.behavior.resume = (context) => delayed.promise.then(() => {
    context.state = "running";
  });
  await withGlobals({
    localStorage: { value: stale.storage },
    window: { value: secondWin },
    AudioContext: { value: secondAudio.AudioContextFake },
  }, async () => {
    const sound = await freshModule("sound.ts");
    secondWin.dispatch("keydown");
    stale.failure.write = true;
    assert.deepEqual(await sound.setSoundEnabled(false), {
      enabled: false, persisted: false,
    });
    delayed.resolve();
    await flush();
    assert.equal(stale.values.get("katlab.sound"), "on");
    assert.equal(sound.soundWanted(), false);
  });
});

test("pre-aborted sound choices do not mutate saved choice or generation", async () => {
  const store = storageFixture({ "katlab.sound": "on" });
  const audio = audioFixture();
  await withGlobals({ localStorage: { value: store.storage },
    AudioContext: { value: audio.AudioContextFake } }, async () => {
    const sound = await freshModule("sound.ts");
    const aborted = new AbortController(); aborted.abort();
    assert.deepEqual(await sound.setSoundEnabled(false, aborted.signal), {
      enabled: true, persisted: false,
    });
    assert.deepEqual(await sound.setSoundEnabled(true, aborted.signal), {
      enabled: true, persisted: false,
    });
    assert.equal(store.values.get("katlab.sound"), "on");
    assert.ok(!store.calls.some(call => call.startsWith("write:")));
    assert.equal(audio.calls.created, 0);
  });
});

test("failed requested sound-on save stays unpersisted after successful off rollback", async () => {
  const store = storageFixture();
  const audio = audioFixture();
  store.failure.onWrite = true;
  await withGlobals({ localStorage: { value: store.storage },
    AudioContext: { value: audio.AudioContextFake } }, async () => {
    const sound = await freshModule("sound.ts");
    assert.deepEqual(await sound.setSoundEnabled(true), { enabled: false, persisted: false });
    assert.equal(store.values.get("katlab.sound"), "off");
    assert.equal(sound.soundWanted(), false);
    assert.equal(audio.calls.created, 0);
  });
});

test("explicit sound resume starts synchronously with its context receiver", async () => {
  const store = storageFixture();
  const audio = audioFixture();
  audio.behavior.resume = context => {
    assert.equal(context, audio.calls.instances[0]);
    assert.equal(store.values.get("katlab.sound"), "on");
    context.state = "running";
    return Promise.resolve();
  };
  await withGlobals({ localStorage: { value: store.storage },
    AudioContext: { value: audio.AudioContextFake } }, async () => {
    const sound = await freshModule("sound.ts");
    const enabling = sound.setSoundEnabled(true);
    assert.equal(audio.calls.created, 1);
    assert.equal(audio.calls.resumed, 1, "resume must start in the initiating call stack");
    assert.equal(sound.soundWanted(), false, "pending activation retains page veto");
    assert.deepEqual(await enabling, { enabled: true, persisted: true });
    assert.ok(audio.calls.notes >= 1);
  });
});

test("sound deadline settles pending resume and ignores late native outcomes", async () => {
  for (const late of ["resolve", "reject"]) {
    for (const storageFailsAfterResume of [false, true]) {
      const store = storageFixture();
      const audio = audioFixture();
      const pending = deferred();
      audio.behavior.resume = context => pending.promise.then(() => {
        context.state = "running";
      });
      const clock = deadlineWindowFixture();
      await withGlobals({ localStorage: { value: store.storage },
        AudioContext: { value: audio.AudioContextFake },
        window: { value: clock.window } }, async () => {
        const sound = await freshModule("sound.ts");
        const owner = api.createActionDeadline();
        let settlements = 0;
        const enabling = sound.setSoundEnabled(true, owner.signal).then(result => {
          settlements++;
          return result;
        }).finally(() => owner.clear());
        assert.equal(audio.calls.resumed, 1);
        assert.equal(store.values.get("katlab.sound"), "on");
        clock.advance(9_999); await flush();
        assert.equal(settlements, 0);
        store.failure.write = storageFailsAfterResume;
        clock.advance(1);
        const result = await enabling;
        assert.deepEqual(result, { enabled: false, persisted: !storageFailsAfterResume });
        assert.equal(owner.didTimeout(), true);
        assert.equal(sound.soundWanted(), false);
        assert.equal(settlements, 1);
        assert.equal(clock.timers.size, 0);
        assert.equal(audio.calls.notes, 0);
        assert.equal(audio.calls.disconnected, 1);
        assert.equal(audio.calls.closed, 1);
        const writes = store.calls.filter(call => call.startsWith("write:")).length;
        if (late === "resolve") pending.resolve();
        else pending.reject(new Error("late native resume failure"));
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(settlements, 1);
        assert.equal(sound.soundWanted(), false);
        assert.equal(audio.calls.notes, 0);
        assert.equal(store.calls.filter(call => call.startsWith("write:")).length, writes);
      });
    }
  }
});

test("sound off does not wait for close and a late old close cannot mute new context", async () => {
  const store = storageFixture();
  const audio = audioFixture();
  const oldClose = deferred();
  audio.behavior.close = (context, call) => call === 1
    ? oldClose.promise.then(() => { context.state = "closed"; })
    : Promise.resolve();
  await withGlobals({ localStorage: { value: store.storage },
    AudioContext: { value: audio.AudioContextFake } }, async () => {
    const sound = await freshModule("sound.ts");
    assert.deepEqual(await sound.setSoundEnabled(true), { enabled: true, persisted: true });
    const original = audio.calls.instances[0];
    assert.deepEqual(await sound.setSoundEnabled(false), { enabled: false, persisted: true });
    assert.equal(audio.calls.disconnected, 1);
    assert.equal(audio.calls.closed, 1);
    assert.equal(audio.calls.suspended, 0);
    assert.deepEqual(await sound.setSoundEnabled(true), { enabled: true, persisted: true });
    assert.equal(audio.calls.instances.length, 2);
    const current = audio.calls.instances[1];
    assert.notEqual(current, original);
    const notes = audio.calls.notes;
    oldClose.resolve();
    await flush();
    assert.equal(original.state, "closed");
    assert.equal(current.state, "running");
    assert.equal(sound.soundWanted(), true);
    sound.playChime();
    assert.ok(audio.calls.notes > notes);
  });
});

test("a late old resume cannot replace a newer confirmed sound context", async () => {
  const store = storageFixture();
  const audio = audioFixture();
  const old = deferred();
  audio.behavior.resume = (context, call) => {
    if (call === 1) return old.promise.then(() => { context.state = "running"; });
    context.state = "running";
    return Promise.resolve();
  };
  await withGlobals({ localStorage: { value: store.storage },
    AudioContext: { value: audio.AudioContextFake } }, async () => {
    const sound = await freshModule("sound.ts");
    const owner = new AbortController();
    const first = sound.setSoundEnabled(true, owner.signal);
    owner.abort();
    assert.deepEqual(await first, { enabled: false, persisted: true });
    assert.deepEqual(await sound.setSoundEnabled(true), { enabled: true, persisted: true });
    assert.equal(audio.calls.instances.length, 2);
    const current = audio.calls.instances[1];
    const notes = audio.calls.notes;
    old.resolve();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(current.state, "running");
    assert.equal(sound.soundWanted(), true);
    assert.equal(audio.calls.notes, notes, "obsolete activation cannot confirm again");
    sound.playChime();
    assert.ok(audio.calls.notes > notes);
  });
});

test("failed audio setup never waits for a hanging native close", async () => {
  const store = storageFixture();
  const audio = audioFixture();
  audio.behavior.gainFailures = 1;
  audio.behavior.close = () => new Promise(() => {});
  await withGlobals({ localStorage: { value: store.storage },
    AudioContext: { value: audio.AudioContextFake } }, async () => {
    const sound = await freshModule("sound.ts");
    assert.deepEqual(await sound.setSoundEnabled(true), { enabled: false, persisted: true });
    assert.equal(sound.soundWanted(), false);
    assert.equal(store.values.get("katlab.sound"), "off");
    assert.equal(audio.calls.closed, 1);
    assert.deepEqual(await sound.setSoundEnabled(true), { enabled: true, persisted: true });
    assert.equal(audio.calls.created, 2);
  });
});

test("sound resume getter and synchronous call failures fail closed", async () => {
  for (const failure of ["getter-error", "getter-abort", "call-error", "call-abort"]) {
    const store = storageFixture();
    const audio = audioFixture();
    const owner = new AbortController();
    let calls = 0;
    Object.defineProperty(audio.AudioContextFake.prototype, "resume", {
      configurable: true,
      get() {
        if (failure === "getter-error") throw new Error("private resume getter error");
        if (failure === "getter-abort") owner.abort();
        return function () {
          calls++;
          if (failure === "call-abort") owner.abort();
          if (failure === "call-error" || failure === "call-abort") {
            throw new Error("private resume call error");
          }
          this.state = "running";
          return Promise.resolve();
        };
      },
    });
    await withGlobals({ localStorage: { value: store.storage },
      AudioContext: { value: audio.AudioContextFake } }, async () => {
      const sound = await freshModule("sound.ts");
      assert.deepEqual(await sound.setSoundEnabled(true, owner.signal), {
        enabled: false, persisted: true,
      });
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(calls, failure === "getter-abort" || failure === "getter-error" ? 0 : 1);
      assert.equal(getEventListeners(owner.signal, "abort").length, 0,
        "settled resume observation must detach its abort listener");
      assert.equal(sound.soundWanted(), false);
      assert.equal(store.values.get("katlab.sound"), "off");
      assert.equal(audio.calls.closed, 1);
    });
  }
});

test("abort between sound candidate publication and caller continuation prevents confirmation", async () => {
  const store = storageFixture();
  const audio = audioFixture();
  const owner = new AbortController();
  let armed = true;
  audio.behavior.resume = context => {
    let state = "running";
    Object.defineProperty(context, "state", {
      configurable: true,
      get() {
        if (armed) { armed = false; queueMicrotask(() => owner.abort()); }
        return state;
      },
      set(value) { state = value; },
    });
    return Promise.resolve();
  };
  await withGlobals({ localStorage: { value: store.storage },
    AudioContext: { value: audio.AudioContextFake } }, async () => {
    const sound = await freshModule("sound.ts");
    assert.deepEqual(await sound.setSoundEnabled(true, owner.signal), {
      enabled: false, persisted: true,
    });
    assert.equal(owner.signal.aborted, true);
    assert.equal(sound.soundWanted(), false);
    assert.equal(audio.calls.notes, 0);
    assert.equal(audio.calls.disconnected, 1);
    assert.equal(store.values.get("katlab.sound"), "off");
  });
});

test("first-gesture listener cannot interfere with a pending explicit enable", async () => {
  const store = storageFixture({ "katlab.sound": "on" });
  const audio = audioFixture();
  const win = windowFixture();
  const pending = deferred();
  audio.behavior.resume = context => pending.promise.then(() => { context.state = "running"; });
  await withGlobals({ localStorage: { value: store.storage },
    AudioContext: { value: audio.AudioContextFake }, window: { value: win } }, async () => {
    const sound = await freshModule("sound.ts");
    assert.equal(win.listeners.get("pointerdown")?.size, 1);
    const explicit = sound.setSoundEnabled(true);
    assert.equal(audio.calls.created, 1);
    const writes = store.calls.filter(call => call.startsWith("write:")).length;
    win.dispatch("pointerdown");
    await flush();
    assert.equal(win.listeners.get("pointerdown")?.size, 0);
    assert.equal(win.listeners.get("keydown")?.size, 0);
    assert.equal(audio.calls.created, 1);
    assert.equal(store.calls.filter(call => call.startsWith("write:")).length, writes);
    pending.resolve();
    assert.deepEqual(await explicit, { enabled: true, persisted: true });
    assert.equal(sound.soundWanted(), true);
  });
});

test("first-gesture listener captures registration owner across explicit choices", async () => {
  const store = storageFixture({ "katlab.sound": "on" });
  const audio = audioFixture();
  const win = windowFixture();
  await withGlobals({ localStorage: { value: store.storage },
    AudioContext: { value: audio.AudioContextFake }, window: { value: win } }, async () => {
    const sound = await freshModule("sound.ts");
    const aborted = new AbortController(); aborted.abort();
    await sound.setSoundEnabled(false, aborted.signal);
    assert.equal(win.listeners.get("pointerdown")?.size, 1,
      "pre-aborted no-op must not supersede the registered gesture");
    assert.deepEqual(await sound.setSoundEnabled(false), { enabled: false, persisted: true });
    assert.deepEqual(await sound.setSoundEnabled(true), { enabled: true, persisted: true });
    const writes = store.calls.filter(call => call.startsWith("write:")).length;
    const created = audio.calls.created;
    win.dispatch("keydown");
    await flush();
    assert.equal(win.listeners.get("keydown")?.size, 0);
    assert.equal(win.listeners.get("pointerdown")?.size, 0);
    assert.equal(audio.calls.created, created);
    assert.equal(store.calls.filter(call => call.startsWith("write:")).length, writes);
    assert.equal(sound.soundWanted(), true);
  });
});

test("pre-aborted choices preserve both the initial gesture and a pending explicit owner", async () => {
  const store = storageFixture({ "katlab.sound": "on" });
  const audio = audioFixture();
  const win = windowFixture();
  await withGlobals({ localStorage: { value: store.storage },
    AudioContext: { value: audio.AudioContextFake }, window: { value: win } }, async () => {
    const sound = await freshModule("sound.ts");
    const aborted = new AbortController(); aborted.abort();
    await sound.setSoundEnabled(false, aborted.signal);
    win.dispatch("keydown");
    await flush();
    assert.equal(audio.calls.resumed, 1, "preabort must not invalidate the initial owner");
    sound.playChime();
    assert.equal(audio.calls.notes, 2);
    const pending = deferred();
    audio.behavior.resume = context => pending.promise.then(() => { context.state = "running"; });
    const enabling = sound.setSoundEnabled(true);
    const writes = store.calls.filter(call => call.startsWith("write:")).length;
    await sound.setSoundEnabled(false, aborted.signal);
    pending.resolve();
    assert.deepEqual(await enabling, { enabled: true, persisted: true });
    assert.equal(store.calls.filter(call => call.startsWith("write:")).length, writes);
    assert.equal(sound.soundWanted(), true);
  });
});

test("throwing audio cleanup remains nonblocking and still attempts close", async () => {
  for (const failure of ["disconnect", "close"]) {
    const store = storageFixture();
    const audio = audioFixture();
    if (failure === "close") audio.behavior.close = () => { throw new Error("private close error"); };
    else {
      const original = audio.AudioContextFake.prototype.createGain;
      audio.AudioContextFake.prototype.createGain = function () {
        const gain = original.call(this);
        gain.disconnect = () => { throw new Error("private disconnect error"); };
        return gain;
      };
    }
    await withGlobals({ localStorage: { value: store.storage },
      AudioContext: { value: audio.AudioContextFake } }, async () => {
      const sound = await freshModule("sound.ts");
      assert.deepEqual(await sound.setSoundEnabled(true), { enabled: true, persisted: true });
      assert.deepEqual(await sound.setSoundEnabled(false), { enabled: false, persisted: true });
      assert.equal(audio.calls.closed, 1);
      assert.equal(sound.soundWanted(), false);
      assert.deepEqual(await sound.setSoundEnabled(true), { enabled: true, persisted: true });
      assert.equal(audio.calls.created, 2);
    });
  }
});

test("audio capability, running-state and confirmation exceptions fail closed", async () => {
  for (const failure of ["capability", "state", "confirmation"]) {
    const store = storageFixture();
    const audio = audioFixture();
    if (failure === "state") audio.behavior.resume = context => {
      Object.defineProperty(context, "state", { configurable: true,
        get() { throw new Error("private state error"); }, set() {} });
      return Promise.resolve();
    };
    if (failure === "confirmation") audio.AudioContextFake.prototype.createOscillator = () => {
      throw new Error("private confirmation error");
    };
    await withGlobals({ localStorage: { value: store.storage }, AudioContext: failure === "capability"
      ? { get() { throw new Error("private capability error"); } }
      : { value: audio.AudioContextFake } }, async () => {
      const sound = await freshModule("sound.ts");
      assert.deepEqual(await sound.setSoundEnabled(true), { enabled: false, persisted: true });
      assert.equal(sound.soundWanted(), false);
      assert.equal(store.values.get("katlab.sound"), "off");
      assert.equal(audio.calls.notes, 0);
      assert.equal(audio.calls.closed, failure === "capability" ? 0 : 1);
    });
  }
});

test("sound feedback distinguishes confirmation, timeout and failed persistence", async () => {
  const sound = await freshModule("sound.ts");
  assert.equal(sound.soundToggleMessage(true, { enabled: true, persisted: true }), "Sounds enabled.");
  assert.equal(sound.soundToggleMessage(false, { enabled: false, persisted: true }), "Sounds disabled.");
  assert.match(sound.soundToggleMessage(true, { enabled: false, persisted: true }), /unavailable|not confirmed/i);
  assert.match(sound.soundToggleMessage(true, { enabled: false, persisted: false }), /older opt-in may return after reload/i);
  const timeout = sound.soundToggleMessage(true, { enabled: false, persisted: true }, true);
  assert.match(timeout, /10 seconds|timed out/i);
  assert.match(timeout, /off for this page/i);
  assert.doesNotMatch(timeout, /closed|canceled|revoked|denied/i);
  assert.match(sound.soundToggleMessage(true, { enabled: false, persisted: false }, true),
    /older opt-in may return after reload/i);
});

test("App statically owns sound deadline, lifecycle and shared recovery surfaces", () => {
  // Wiring evidence only, not React-effect execution or audible browser verification.
  const app = readFileSync(resolve(frontendRoot, "src/App.tsx"), "utf8");
  assert.match(app, /if \(!soundMountedRef\.current \|\| soundOwnerRef\.current\) return/);
  assert.match(app, /soundOwnerRef\.current = null;\s*owner\?\.controller\.abort\(\);\s*owner\?\.clear\(\)/);
  assert.match(app, /soundMountedRef\.current && soundOwnerRef\.current === owner/);
  assert.match(app, /setSoundEnabled\(next, owner\.signal\)\.then\(\(result\) => \{\s*if \(!isCurrent\(\)\) return/);
  assert.match(app, /soundToggleMessage\(next, result, owner\.didTimeout\(\)\)/);
  assert.match(app, /owner\.clear\(\);\s*if \(isCurrent\(\)\) \{\s*soundOwnerRef\.current = null;\s*setSoundBusy\(false\)/);
  assert.match(app, /announceStatus\("Changing sounds\."\)/);
  assert.match(app, /disabledReason: soundBusy \?/);
  assert.equal((app.match(/disabled=\{soundBusy\}/g) ?? []).length, 2);
  assert.match(app, /Object\.entries\(preferenceFailures\)/);
  assert.doesNotMatch(app, /soundBusyRef/);
});

test("notification permission is requested only after storage preflight", async () => {
  const store = storageFixture();
  const notify = notificationFixture();
  const sequence = [];
  const originalWrite = store.storage.setItem;
  store.storage.setItem = (key, value) => {
    sequence.push(`write:${value}`);
    return originalWrite(key, value);
  };
  const originalPrompt = notify.NotificationFake.requestPermission;
  notify.NotificationFake.requestPermission = async () => {
    sequence.push("prompt");
    return originalPrompt.call(notify.NotificationFake);
  };
  await withGlobals({
    localStorage: { value: store.storage },
    Notification: { value: notify.NotificationFake },
    document: { value: { hidden: true } },
    window: { value: windowFixture() },
  }, async () => {
    const module = await freshModule("notify.ts");
    assert.deepEqual(await module.setNotifyEnabled(true), {
      enabled: true, persisted: true,
    });
    assert.deepEqual(sequence, ["write:off", "prompt", "write:on"]);
    assert.equal(module.notifyWanted(), true);
    module.notifyWarning("EA_Dev", "warning", () => {});
    assert.equal(notify.calls.shown, 1);
    assert.deepEqual(await module.setNotifyEnabled(false), {
      enabled: false, persisted: true,
    });
    module.notifyWarning("EA_Dev", "warning", () => {});
    assert.equal(notify.calls.shown, 1);
  });
});

test("notification storage failure never prompts and failed disable vetoes old on", async () => {
  for (const failure of ["write", "read", "silent"]) {
    const store = storageFixture();
    const notify = notificationFixture();
    store.failure[failure] = true;
    await withGlobals({
      localStorage: { value: store.storage },
      Notification: { value: notify.NotificationFake },
    }, async () => {
      const module = await freshModule("notify.ts");
      assert.deepEqual(await module.setNotifyEnabled(true), {
        enabled: false, persisted: false,
      });
      assert.equal(notify.calls.prompts, 0);
      assert.equal(module.notifyWanted(), false);
    });
  }
  const store = storageFixture({ "katlab.notify": "on" });
  const notify = notificationFixture();
  store.failure.write = true;
  await withGlobals({
    localStorage: { value: store.storage },
    Notification: { value: notify.NotificationFake },
    document: { value: { hidden: true } },
    window: { value: windowFixture() },
  }, async () => {
    const module = await freshModule("notify.ts");
    assert.deepEqual(await module.setNotifyEnabled(false), {
      enabled: false, persisted: false,
    });
    assert.equal(store.values.get("katlab.notify"), "on");
    assert.equal(module.notifyWanted(), false);
    module.notifyWarning("EA_Dev", "warning", () => {});
    assert.equal(notify.calls.shown, 0);
    store.failure.write = false;
    assert.deepEqual(await module.setNotifyEnabled(true), {
      enabled: true, persisted: true,
    });
    assert.equal(module.notifyWanted(), true);
  });
});

test("notification denial differs from failed final on persistence", async () => {
  for (const permission of ["denied", "default"]) {
    const deniedStore = storageFixture();
    const denied = notificationFixture(permission);
    await withGlobals({
      localStorage: { value: deniedStore.storage },
      Notification: { value: denied.NotificationFake },
    }, async () => {
      const module = await freshModule("notify.ts");
      const result = await module.setNotifyEnabled(true);
      assert.deepEqual(result, { enabled: false, persisted: true });
      assert.doesNotMatch(module.notifyToggleMessage(true, result), /denied/);
      assert.equal(denied.calls.prompts, 1);
      assert.equal(deniedStore.values.get("katlab.notify"), "off");
    });
  }
  const failedStore = storageFixture();
  const granted = notificationFixture("granted");
  failedStore.failure.onWrite = true;
  await withGlobals({
    localStorage: { value: failedStore.storage },
    Notification: { value: granted.NotificationFake },
  }, async () => {
    const module = await freshModule("notify.ts");
    assert.deepEqual(await module.setNotifyEnabled(true), {
      enabled: false, persisted: false,
    });
    assert.equal(granted.calls.prompts, 1);
    assert.equal(failedStore.values.get("katlab.notify"), "off");
    assert.equal(module.notifyWanted(), false);
  });
  const errorStore = storageFixture();
  const errorNotify = notificationFixture();
  errorNotify.behavior.promptError = true;
  await withGlobals({
    localStorage: { value: errorStore.storage },
    Notification: { value: errorNotify.NotificationFake },
  }, async () => {
    const module = await freshModule("notify.ts");
    assert.deepEqual(await module.setNotifyEnabled(true), {
      enabled: false, persisted: true,
    });
    assert.equal(errorStore.values.get("katlab.notify"), "off");
  });
});

test("missing or failing Notification capability leaves alerts off", async () => {
  const absentStore = storageFixture();
  await withGlobals({
    localStorage: { value: absentStore.storage },
    Notification: { value: undefined },
  }, async () => {
    const module = await freshModule("notify.ts");
    assert.deepEqual(await module.setNotifyEnabled(true), {
      enabled: false, persisted: true,
    });
    assert.equal(absentStore.values.get("katlab.notify"), "off");
  });
  for (const failure of ["permissionError", "constructorError"]) {
    const store = storageFixture();
    const notify = notificationFixture();
    await withGlobals({
      localStorage: { value: store.storage },
      Notification: { value: notify.NotificationFake },
      document: { value: { hidden: true } },
      window: { value: windowFixture() },
    }, async () => {
      const module = await freshModule("notify.ts");
      if (failure === "permissionError") {
        notify.behavior.permissionError = true;
        assert.deepEqual(await module.setNotifyEnabled(true), {
          enabled: false, persisted: true,
        });
      } else {
        assert.deepEqual(await module.setNotifyEnabled(true), {
          enabled: true, persisted: true,
        });
        notify.behavior.constructorError = true;
        module.notifyWarning("EA_Dev", "warning", () => {});
      }
      assert.equal(module.notifyWanted(), false);
      assert.equal(store.values.get("katlab.notify"), "off");
    });
  }
});

test("notification prompt starts synchronously with its receiver and supports a pre-abort no-op", async () => {
  const store = storageFixture({ "katlab.notify": "on" });
  const notify = notificationFixture();
  const pending = deferred();
  let calls = 0;
  notify.NotificationFake.requestPermission = function () {
    assert.equal(this, notify.NotificationFake);
    calls++;
    return pending.promise;
  };
  await withGlobals({ localStorage: { value: store.storage },
    Notification: { value: notify.NotificationFake } }, async () => {
    const module = await freshModule("notify.ts");
    const aborted = new AbortController(); aborted.abort();
    assert.deepEqual(await module.setNotifyEnabled(false, aborted.signal), {
      enabled: true, persisted: false,
    });
    assert.equal(calls, 0);
    assert.ok(!store.calls.some(call => call.startsWith("write:")));
    const enabling = module.setNotifyEnabled(true);
    assert.equal(calls, 1, "permission request must start in the original call stack");
    assert.equal(store.values.get("katlab.notify"), "off");
    // A canceled new call must not supersede the valid pending generation.
    await module.setNotifyEnabled(false, aborted.signal);
    pending.resolve("granted");
    assert.deepEqual(await enabling, { enabled: true, persisted: true });
  });
});

test("notification deadline settles once with fresh persistence and ignores late native outcomes", async () => {
  for (const late of ["granted", "rejected"]) {
    for (const storageFailsAfterPrompt of [false, true]) {
      const store = storageFixture();
      const notify = notificationFixture();
      const pending = deferred();
      notify.NotificationFake.requestPermission = () => pending.promise;
      let now = 0, serial = 0;
      const timers = new Map();
      const window = { ...windowFixture(),
        setTimeout(callback, delay) { const id = ++serial; timers.set(id, { callback, at: now + delay }); return id; },
        clearTimeout(id) { timers.delete(id); },
      };
      const advance = milliseconds => {
        now += milliseconds;
        for (const [id, timer] of [...timers]) {
          if (timer.at <= now) { timers.delete(id); timer.callback(); }
        }
      };
      await withGlobals({ localStorage: { value: store.storage },
        Notification: { value: notify.NotificationFake }, window: { value: window } }, async () => {
        const module = await freshModule("notify.ts");
        const owner = api.createActionDeadline();
        let settlements = 0;
        const running = module.setNotifyEnabled(true, owner.signal).then(result => {
          settlements++;
          return result;
        }).finally(() => owner.clear());
        advance(9_999); await flush(); assert.equal(settlements, 0);
        store.failure.write = storageFailsAfterPrompt;
        advance(1);
        const result = await running;
        assert.deepEqual(result, { enabled: false, persisted: !storageFailsAfterPrompt });
        assert.equal(owner.didTimeout(), true);
        assert.equal(module.notifyWanted(), false);
        assert.equal(settlements, 1);
        assert.equal(timers.size, 0);
        const message = module.notifyToggleMessage(true, result, owner.didTimeout());
        assert.match(message, /browser prompt may still finish/);
        assert.equal(message.includes("Saving failed"), storageFailsAfterPrompt);
        assert.doesNotMatch(message, /denied|canceled|revoked|enabled\./);
        const writes = store.calls.filter(call => call.startsWith("write:")).length;
        if (late === "granted") pending.resolve("granted");
        else pending.reject(new Error("late native rejection"));
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(settlements, 1);
        assert.equal(module.notifyWanted(), false);
        assert.equal(store.calls.filter(call => call.startsWith("write:")).length, writes);
      });
    }
  }
});

test("newer notification choices dominate stale grants, denials and rejections", async () => {
  for (const next of [false, true]) {
    for (const late of ["granted", "denied", "rejected"]) {
      const store = storageFixture();
      const notify = notificationFixture();
      const old = deferred();
      let calls = 0;
      notify.NotificationFake.requestPermission = () => ++calls === 1 ? old.promise : Promise.resolve("granted");
      await withGlobals({ localStorage: { value: store.storage },
        Notification: { value: notify.NotificationFake } }, async () => {
        const module = await freshModule("notify.ts");
        const older = module.setNotifyEnabled(true);
        assert.deepEqual(await module.setNotifyEnabled(next), { enabled: next, persisted: true });
        const writes = store.calls.filter(call => call.startsWith("write:")).length;
        if (late === "rejected") old.reject(new Error("obsolete"));
        else old.resolve(late);
        assert.deepEqual(await older, { enabled: next, persisted: false });
        assert.equal(module.notifyWanted(), next);
        assert.equal(store.values.get("katlab.notify"), next ? "on" : "off");
        assert.equal(store.calls.filter(call => call.startsWith("write:")).length, writes);
      });
    }
  }
});

test("notification cancellation observes synchronous abort/rejection and skips an aborted getter", async () => {
  for (const when of ["getter", "call"]) {
    const store = storageFixture();
    const owner = new AbortController();
    let calls = 0;
    const capability = { permission: "granted", get requestPermission() {
      if (when === "getter") owner.abort();
      return function () {
        calls++;
        owner.abort();
        return Promise.reject(new Error("rejected during abort"));
      };
    } };
    await withGlobals({ localStorage: { value: store.storage },
      Notification: { value: capability } }, async () => {
      const module = await freshModule("notify.ts");
      assert.deepEqual(await module.setNotifyEnabled(true, owner.signal), { enabled: false, persisted: true });
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(calls, when === "getter" ? 0 : 1);
      assert.equal(module.notifyWanted(), false);
    });
  }
});

test("notification capability getters and synchronous methods fail softly", async () => {
  for (const descriptor of [
    { get() { throw new Error("private capability error"); } },
    { value: { get requestPermission() { throw new Error("private getter error"); } } },
    { value: { requestPermission() { throw new Error("private method error"); } } },
    { value: { requestPermission: undefined } },
  ]) {
    const store = storageFixture();
    await withGlobals({ localStorage: { value: store.storage }, Notification: descriptor }, async () => {
      const module = await freshModule("notify.ts");
      assert.deepEqual(await module.setNotifyEnabled(true), { enabled: false, persisted: true });
      assert.equal(module.notifyWanted(), false);
    });
  }
});

test("notification feedback distinguishes normal results, storage failure and deadline", async () => {
  const module = await freshModule("notify.ts");
  assert.equal(module.notifyToggleMessage(true, { enabled: true, persisted: true }), "OS alerts enabled.");
  assert.equal(module.notifyToggleMessage(false, { enabled: false, persisted: true }), "OS alerts disabled.");
  assert.match(module.notifyToggleMessage(true, { enabled: false, persisted: true }), /permission was not confirmed or alerts are unavailable/);
  assert.match(module.notifyToggleMessage(false, { enabled: false, persisted: false }), /older opt-in may return after reload/);
  assert.doesNotMatch(module.notifyToggleMessage(true, { enabled: true, persisted: false }), /alerts are off/);
});

test("App statically owns notification deadline, lifecycle and recovery surfaces", () => {
  // Wiring evidence only, not React-effect execution or browser permission interaction.
  const app = readFileSync(resolve(frontendRoot, "src/App.tsx"), "utf8");
  assert.match(app, /if \(!notifyMountedRef\.current \|\| notifyOwnerRef\.current\) return/);
  assert.match(app, /notifyOwnerRef\.current = null;\s*owner\?\.controller\.abort\(\);\s*owner\?\.clear\(\)/);
  assert.match(app, /notifyMountedRef\.current && notifyOwnerRef\.current === owner/);
  assert.match(app, /setNotifyEnabled\(next, owner\.signal\)\.then\(\(result\) => \{\s*if \(!isCurrent\(\)\) return/);
  assert.match(app, /notifyToggleMessage\(next, result, owner\.didTimeout\(\)\)/);
  assert.match(app, /owner\.clear\(\);\s*if \(isCurrent\(\)\) \{\s*notifyOwnerRef\.current = null;\s*setNotifyBusy\(false\)/);
  assert.match(app, /announceStatus\("Changing OS alerts\."\)/);
  assert.match(app, /disabledReason: notifyBusy \?/);
  assert.equal((app.match(/disabled=\{notifyBusy\}/g) ?? []).length, 2);
  assert.match(app, /Object\.entries\(preferenceFailures\)/);
  assert.doesNotMatch(app, /notifyBusyRef/);
});

test("blocked storage still renders GoalRings, DayLanes, and empty Overview", {
  timeout: 30_000,
}, async () => {
  const React = frontendRequire("react");
  const { renderToStaticMarkup } = frontendRequire("react-dom/server");
  const { createServer } = await import(pathToFileURL(frontendRequire.resolve("vite")).href);
  const vite = await createServer({
    root: frontendRoot,
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
    optimizeDeps: { noDiscovery: true, entries: [] },
  });
  try {
    await withGlobals({
      localStorage: { get() { throw new DOMException("blocked", "SecurityError"); } },
    }, async () => {
      const [{ GoalRings }, { DayLanes }, { OverviewView }] = await Promise.all([
        vite.ssrLoadModule("/src/goalRings.tsx"),
        vite.ssrLoadModule("/src/dayLanes.tsx"),
        vite.ssrLoadModule("/src/OverviewView.tsx"),
      ]);
      const goalHtml = renderToStaticMarkup(React.createElement(GoalRings, {
        calendar: [], scope: undefined, onStatus() {},
      }));
      assert.match(goalHtml, /Today&#x27;s rings|Today.s rings/);
      assert.match(goalHtml, /<svg/);
      assert.match(goalHtml, /captures[\s\S]{0,180}0 \/ 30 \(0%\)/);
      assert.match(goalHtml, /effort[\s\S]{0,180}2h 0m \(0%\)/);
      assert.match(goalHtml, /commits[\s\S]{0,180}0 \/ 2 \(0%\)/);
      const dayHtml = renderToStaticMarkup(React.createElement(DayLanes, {
        scope: undefined, stats: null, day: "2026-09-30", speed: 1,
        onDayChange() {}, onSpeedChange() {}, onStatus() {},
      }));
      assert.match(dayHtml, /Your day/);
      assert.match(dayHtml, /aria-label="day view"/);
      assert.match(dayHtml, /aria-pressed="true"[^>]*>lanes<\/button>/);
      assert.match(dayHtml, /aria-pressed="false"[^>]*>clock<\/button>/);
      const overviewHtml = renderToStaticMarkup(React.createElement(OverviewView, {
        scope: undefined, tasks: [], uncommitted: [], repos: [], stats: null,
        statsError: "", onStatus() {},
        entryState: { relationship: null, day: "2026-09-30", speed: 1 },
        onEntryStateChange() {},
      }));
      assert.match(overviewHtml, /Overview/);
      assert.match(overviewHtml, /Loading overview data/);
    });
    const { GoalRings } = await vite.ssrLoadModule("/src/goalRings.tsx");
    const { DayLanes } = await vite.ssrLoadModule("/src/dayLanes.tsx");
    const renderGoal = () => renderToStaticMarkup(React.createElement(GoalRings, {
      calendar: [], scope: undefined, onStatus() {},
    }));
    const renderDay = () => renderToStaticMarkup(React.createElement(DayLanes, {
      scope: undefined, stats: null, day: "2026-09-30", speed: 1,
      onDayChange() {}, onSpeedChange() {}, onStatus() {},
    }));
    const saved = storageFixture({
      "katlab.goals": JSON.stringify({ events: 41, minutes: 77, commits: 5 }),
      "katlab.dayView": "clock",
    });
    await withGlobals({ localStorage: { value: saved.storage } }, async () => {
      const goalHtml = renderGoal();
      assert.match(goalHtml, /captures[\s\S]{0,180}0 \/ 41 \(0%\)/);
      assert.match(goalHtml, /effort[\s\S]{0,180}1h 17m \(0%\)/);
      assert.match(goalHtml, /commits[\s\S]{0,180}0 \/ 5 \(0%\)/);
      assert.match(renderDay(), /aria-pressed="true"[^>]*>clock<\/button>/);
    });
    const malformed = storageFixture({ "katlab.goals": "{not-json" });
    await withGlobals({ localStorage: { value: malformed.storage } }, async () => {
      const goalHtml = renderGoal();
      assert.match(goalHtml, /captures[\s\S]{0,180}0 \/ 30 \(0%\)/);
      assert.match(goalHtml, /effort[\s\S]{0,180}2h 0m \(0%\)/);
      assert.match(goalHtml, /commits[\s\S]{0,180}0 \/ 2 \(0%\)/);
    });
  } finally {
    await vite.close();
  }
});
