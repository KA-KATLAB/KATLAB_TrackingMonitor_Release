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
const preferenceFailureUrl = dataUrl(transpile("preferenceFailure.ts"));
const preferenceFailure = await import(preferenceFailureUrl);

async function freshModule (name) {
  const emitted = transpile(name);
  const imports = emitted.match(/from ["']\.\/preferences["']/g) ?? [];
  assert.equal(imports.length, 1, `${name} must use the shared preference boundary`);
  let linked = emitted.replace(imports[0], `from "${preferenceUrl}"`);
  if (name === "notify.ts" || name === "sound.ts") {
    const apiImports = linked.match(/from ["']\.\/api["']/g) ?? [];
    assert.equal(apiImports.length, 1, `${name} must reuse the shared observation race`);
    linked = linked.replace(apiImports[0], `from "${apiUrl}"`);
    const failureImports = linked.match(/from ["']\.\/preferenceFailure["']/g) ?? [];
    assert.equal(failureImports.length, 1, `${name} must use its independent failure store`);
    linked = linked.replace(failureImports[0], `from "${preferenceFailureUrl}"`);
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

// Controlled native boundaries only; no real audio context or timer is created.
function liveAudioFixture () {
  const audio = audioFixture();
  const events = [];
  const frequencies = [];
  let fault = null;
  const hit = stage => {
    events.push(stage);
    if (!fault || fault.stage !== stage || --fault.remaining !== 0) return;
    const current = fault;
    fault = null;
    current.before?.();
    if (current.throws) throw new Error(`private native ${stage} failure`);
  };
  class LiveAudioContext extends audio.AudioContextFake {
    get state() { hit("state"); return this.savedState; }
    set state(value) { this.savedState = value; }
    get currentTime() { hit("time"); return this.savedTime; }
    set currentTime(value) { this.savedTime = value; }
    createOscillator() {
      hit("oscillator");
      const oscillator = super.createOscillator();
      Object.defineProperty(oscillator, "type", { set() { hit("type"); } });
      Object.defineProperty(oscillator.frequency, "value", {
        set(value) { hit("frequency"); frequencies.push(value); },
      });
      oscillator.connect = () => hit("oscillatorConnect");
      const start = oscillator.start;
      oscillator.start = () => { hit("start"); start(); };
      oscillator.stop = () => hit("stop");
      return oscillator;
    }
    createGain() {
      this.gainCount = (this.gainCount ?? 0) + 1;
      if (this.gainCount > 1) hit("gain");
      const gain = super.createGain();
      gain.gain.setValueAtTime = () => hit("envelope");
      gain.gain.linearRampToValueAtTime = () => hit("attack");
      gain.gain.exponentialRampToValueAtTime = () => hit("release");
      if (this.gainCount > 1) gain.connect = () => hit("gainConnect");
      const disconnect = gain.disconnect;
      gain.disconnect = () => { hit("disconnect"); disconnect(); };
      return gain;
    }
  }
  return { ...audio, AudioContextFake: LiveAudioContext, events, frequencies, hit,
    arm(stage, { nth = 1, before, throws = true } = {}) {
      fault = { stage, remaining: nth, before, throws };
    } };
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

test("sound completion revalidates opt-in without reasserting on after storage drift", async () => {
  for (const drift of ["read-denied", "off", "missing", "unknown"]) {
    for (const rollbackFails of [false, true]) {
      const store = storageFixture();
      const audio = audioFixture();
      const pending = deferred();
      audio.behavior.resume = context => pending.promise.then(() => { context.state = "running"; });
      audio.behavior.close = () => new Promise(() => {});
      await withGlobals({ localStorage: { value: store.storage },
        AudioContext: { value: audio.AudioContextFake } }, async () => {
        const sound = await freshModule("sound.ts");
        const enabling = sound.setSoundEnabled(true);
        if (drift === "read-denied") store.failure.read = true;
        else if (drift === "missing") store.values.delete("katlab.sound");
        else store.values.set("katlab.sound", drift);
        store.failure.write = rollbackFails;
        pending.resolve();
        const result = await enabling;
        assert.deepEqual(result, { enabled: false,
          persisted: !rollbackFails && drift !== "read-denied", preferenceUnconfirmed: true });
        assert.equal(audio.calls.notes, 0);
        assert.equal(audio.calls.disconnected, 1);
        assert.equal(audio.calls.closed, 1, "hanging close must not delay completion");
        assert.equal(store.calls.filter(call => call === "write:katlab.sound:on").length, 1);
        store.failure.read = false;
        store.failure.write = false;
        store.values.set("katlab.sound", "on");
        assert.equal(sound.soundWanted(), false, "recovered storage cannot bypass the veto");
        sound.playChime();
        assert.equal(audio.calls.notes, 0);
        audio.behavior.resume = null;
        assert.deepEqual(await sound.setSoundEnabled(true), { enabled: true, persisted: true });
        assert.equal(sound.soundWanted(), true);
        assert.equal(audio.calls.created, 2);
      });
    }
  }
});

test("sound final preference read rechecks cancellation and newer ownership", async () => {
  for (const interruption of ["abort", "new-owner"]) {
    const store = storageFixture();
    const audio = audioFixture();
    const pending = deferred();
    const owner = new AbortController();
    audio.behavior.resume = (context, call) => {
      if (call === 1) return pending.promise.then(() => { context.state = "running"; });
      context.state = "running";
      return Promise.resolve();
    };
    await withGlobals({ localStorage: { value: store.storage },
      AudioContext: { value: audio.AudioContextFake } }, async () => {
      const sound = await freshModule("sound.ts");
      const first = sound.setSoundEnabled(true, owner.signal);
      const originalRead = store.storage.getItem;
      let armed = true, newer;
      store.storage.getItem = key => {
        if (armed) {
          armed = false;
          if (interruption === "abort") owner.abort();
          else newer = sound.setSoundEnabled(true);
          return "off";
        }
        return originalRead(key);
      };
      pending.resolve();
      const result = await first;
      assert.equal(result.preferenceUnconfirmed, undefined);
      if (interruption === "abort") {
        assert.deepEqual(result, { enabled: false, persisted: true });
        assert.equal(sound.soundWanted(), false);
        assert.equal(audio.calls.notes, 0);
        assert.equal(audio.calls.closed, 1);
      } else {
        assert.equal(result.persisted, false);
        assert.deepEqual(await newer, { enabled: true, persisted: true });
        assert.equal(sound.soundWanted(), true);
        assert.equal(store.values.get("katlab.sound"), "on");
        assert.equal(store.calls.filter(call => call === "write:katlab.sound:off").length, 0);
        assert.equal(audio.calls.instances[1].state, "running");
        assert.equal(audio.calls.closed, 1, "old final read must not retire the new context");
      }
    });
  }
});

test("sound storage-revalidation feedback is distinct and timeout retains precedence", async () => {
  const sound = await freshModule("sound.ts");
  for (const persisted of [false, true]) {
    const result = { enabled: false, persisted, preferenceUnconfirmed: true };
    const message = sound.soundToggleMessage(true, result);
    assert.match(message, /saved sound choice could not be verified at activation/);
    assert.match(message, /off for this page/);
    assert.match(message, /Retry explicitly/);
    assert.equal(message.includes("older opt-in"), !persisted);
    assert.doesNotMatch(message, /audio is unavailable|denied|Sounds enabled/);
    const timeout = sound.soundToggleMessage(true, result, true);
    assert.match(timeout, /10 seconds/);
    assert.doesNotMatch(timeout, /saved sound choice/);
    assert.equal(timeout.includes("older opt-in"), !persisted);
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

test("background failure stores are bounded, immutable and exception-isolated", () => {
  const first = preferenceFailure.createPreferenceFailureStore();
  const second = preferenceFailure.createPreferenceFailureStore();
  const snapshots = [];
  let throwingCalls = 0;
  const stopThrowing = first.subscribe(() => { throwingCalls++; throw new Error("private listener error"); });
  const stop = first.subscribe(() => snapshots.push(first.getSnapshot()));
  assert.equal(first.getSnapshot(), null);
  first.clear();
  assert.equal(throwingCalls, 0, "clearing null must not publish");
  first.publish(false);
  const initial = first.getSnapshot();
  assert.deepEqual(initial, { persisted: false });
  assert.equal(Object.isFrozen(initial), true);
  assert.throws(() => { initial.persisted = true; }, TypeError);
  assert.equal(first.getSnapshot(), initial);
  assert.equal(snapshots[0], initial, "publication precedes listener notification");
  assert.equal(second.getSnapshot(), null);
  first.publish(true);
  assert.notEqual(first.getSnapshot(), initial);
  assert.deepEqual(first.getSnapshot(), { persisted: true });
  first.clear();
  assert.equal(snapshots.at(-1), null);
  stop(); stop(); stopThrowing(); stopThrowing();
  const count = snapshots.length;
  first.publish(false);
  assert.equal(snapshots.length, count);
  assert.equal(throwingCalls, 3);
});

test("background observation reads cached and current snapshots and tears down safely", () => {
  const store = preferenceFailure.createPreferenceFailureStore();
  store.publish(false);
  const order = [], received = [];
  const traced = {
    ...store,
    subscribe(listener) { order.push("subscribe"); return store.subscribe(listener); },
    getSnapshot() { order.push("read"); return store.getSnapshot(); },
  };
  const stop = preferenceFailure.observePreferenceFailure(traced, value => received.push(value));
  assert.deepEqual(order.slice(0, 2), ["subscribe", "read"]);
  assert.deepEqual(received, [{ persisted: false }]);
  store.clear();
  assert.equal(received.length, 1, "null clear must not replay feedback");
  store.publish(true);
  assert.deepEqual(received.at(-1), { persisted: true });
  stop(); stop();
  store.publish(false);
  assert.equal(received.length, 2);
  const remounted = [];
  const stopRemount = preferenceFailure.observePreferenceFailure(store, value => remounted.push(value));
  assert.deepEqual(remounted, [{ persisted: false }]);
  const stopThrowing = preferenceFailure.observePreferenceFailure(store, () => { throw new Error("private consumer error"); });
  assert.doesNotThrow(() => store.publish(true));
  assert.deepEqual(remounted.at(-1), { persisted: true });
  stopThrowing(); stopRemount();

  const cleared = preferenceFailure.createPreferenceFailureStore();
  const stopClearer = cleared.subscribe(() => { if (cleared.getSnapshot()) cleared.clear(); });
  const obsolete = [];
  const stopObserver = preferenceFailure.observePreferenceFailure(cleared, value => obsolete.push(value));
  cleared.publish(false);
  assert.deepEqual(obsolete, [], "a later observer reads current null, not the outer publish record");
  stopClearer(); stopObserver();
});

test("background feedback is private, channel-specific and wins over normal completion", () => {
  for (const channel of ["sound", "notify"]) {
    for (const persisted of [false, true]) {
      const failure = { persisted };
      const feedback = preferenceFailure.backgroundPreferenceFeedback(channel, failure);
      assert.equal(feedback.enabled, false);
      assert.equal(feedback.failed, true);
      assert.match(feedback.message, /off for this page/i);
      assert.match(feedback.message, /retry/i);
      assert.equal(/older opt-in.*reload/i.test(feedback.message), !persisted);
      assert.doesNotMatch(feedback.message, /private|denied|revoked|physical silence/i);
      for (const normal of [
        { enabled: true, failed: false, message: "Enabled." },
        { enabled: false, failed: true, message: "Generic explicit failure." },
      ]) {
        assert.deepEqual(preferenceFailure.withBackgroundPreferenceFailure(channel, failure, normal), feedback);
        assert.deepEqual(preferenceFailure.withBackgroundPreferenceFailure(channel, null, normal), normal);
      }
    }
  }
});

test("sound background failures publish verified off truth to an observed sink", async () => {
  for (const failure of ["read", "setup", "resume"]) {
    for (const failedSave of [false, true]) {
      const store = storageFixture({ "katlab.sound": "on" });
      const audio = audioFixture();
      const win = windowFixture();
      if (failure === "setup") audio.behavior.gainFailures = 1;
      if (failure === "resume") audio.behavior.resume = () => Promise.reject(new Error("private native failure"));
      await withGlobals({ localStorage: { value: store.storage },
        AudioContext: { value: audio.AudioContextFake }, window: { value: win } }, async () => {
        const sound = await freshModule("sound.ts");
        const updates = [], wantedAtReport = [];
        const stop = preferenceFailure.observePreferenceFailure(sound.soundBackgroundFailure,
          value => {
            wantedAtReport.push(sound.soundWanted());
            updates.push(preferenceFailure.backgroundPreferenceFeedback("sound", value));
          });
        assert.equal(audio.calls.created, 0, "subscription must not activate audio");
        assert.deepEqual(updates, []);
        store.failure.read = failure === "read";
        store.failure.write = failedSave;
        win.dispatch("pointerdown");
        await flush();
        assert.deepEqual(sound.soundBackgroundFailure.getSnapshot(), {
          persisted: !failedSave && failure !== "read",
        });
        assert.equal(updates.length, 1);
        assert.equal(updates[0].enabled, false);
        assert.equal(updates[0].failed, true);
        assert.deepEqual(wantedAtReport, [false], "page veto precedes publication");
        assert.equal(audio.calls.notes, 0);
        assert.equal(sound.soundWanted(), false);
        const cached = sound.soundBackgroundFailure.getSnapshot();
        const aborted = new AbortController(); aborted.abort();
        await sound.setSoundEnabled(true, aborted.signal);
        assert.equal(sound.soundBackgroundFailure.getSnapshot(), cached);
        store.failure.read = false; store.failure.write = false;
        audio.behavior.resume = null;
        assert.deepEqual(await sound.setSoundEnabled(true), { enabled: true, persisted: true });
        assert.equal(sound.soundBackgroundFailure.getSnapshot(), null);
        assert.equal(updates.length, 1, "accepted clear is not another background report");
        stop();
      });
    }
  }
});

test("stale initial sound failure cannot publish after a newer explicit choice", async () => {
  const store = storageFixture({ "katlab.sound": "on" });
  const audio = audioFixture();
  const win = windowFixture();
  const old = deferred();
  audio.behavior.resume = (context, call) => {
    if (call === 1) return old.promise;
    context.state = "running";
    return Promise.resolve();
  };
  await withGlobals({ localStorage: { value: store.storage },
    AudioContext: { value: audio.AudioContextFake }, window: { value: win } }, async () => {
    const sound = await freshModule("sound.ts");
    const failures = [];
    const stop = preferenceFailure.observePreferenceFailure(sound.soundBackgroundFailure, value => failures.push(value));
    win.dispatch("keydown");
    assert.deepEqual(await sound.setSoundEnabled(true), { enabled: true, persisted: true });
    old.reject(new Error("private obsolete failure"));
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(failures, []);
    assert.equal(sound.soundBackgroundFailure.getSnapshot(), null);
    assert.equal(sound.soundWanted(), true);
    assert.equal(store.values.get("katlab.sound"), "on");
    stop();
  });
});

test("background notification failures fail closed and report off-save truth once", async () => {
  for (const failure of ["missing", "denied", "default", "capability", "permission", "constructor", "visibility"]) {
    for (const failedSave of [false, true]) {
      const store = storageFixture({ "katlab.notify": "on" });
      const notify = notificationFixture(failure === "denied" || failure === "default" ? failure : "granted");
      notify.behavior.permissionError = failure === "permission";
      notify.behavior.constructorError = failure === "constructor";
      store.failure.write = failedSave;
      const capability = failure === "capability"
        ? { get() { throw new Error("private capability failure"); } }
        : { value: failure === "missing" ? undefined : notify.NotificationFake };
      await withGlobals({ localStorage: { value: store.storage }, Notification: capability,
        document: { value: failure === "visibility"
          ? { get hidden() { throw new Error("private visibility failure"); } } : { hidden: true } },
        window: { value: windowFixture() } }, async () => {
        const module = await freshModule("notify.ts");
        const updates = [], wantedAtReport = [];
        const stop = preferenceFailure.observePreferenceFailure(module.notifyBackgroundFailure, value => {
          wantedAtReport.push(module.notifyWanted());
          updates.push(value);
        });
        assert.equal(notify.calls.prompts, 0);
        assert.equal(notify.calls.shown, 0, "subscription does not request native delivery");
        assert.doesNotThrow(() => module.notifyWarning("fixture", "fixture", () => {}));
        assert.deepEqual(updates, [{ persisted: !failedSave }]);
        assert.deepEqual(wantedAtReport, [false], "page veto precedes publication");
        assert.equal(module.notifyWanted(), false);
        assert.equal(store.values.get("katlab.notify"), failedSave ? "on" : "off");
        module.notifyWarning("fixture", "fixture", () => {});
        assert.equal(updates.length, 1, "veto prevents repeated failure publication");
        assert.equal(notify.calls.prompts, 0);
        stop();
      });
    }
  }
});

test("obsolete background notification failure cannot publish over a newer explicit choice", async () => {
  const store = storageFixture({ "katlab.notify": "on" });
  let module, newer;
  const capability = { get permission() {
    newer = module.setNotifyEnabled(false);
    throw new Error("private obsolete permission failure");
  } };
  await withGlobals({ localStorage: { value: store.storage }, Notification: { value: capability },
    document: { value: { hidden: true } }, window: { value: windowFixture() } }, async () => {
    module = await freshModule("notify.ts");
    const updates = [];
    const stop = preferenceFailure.observePreferenceFailure(module.notifyBackgroundFailure, value => updates.push(value));
    assert.doesNotThrow(() => module.notifyWarning("fixture", "fixture", () => {}));
    assert.deepEqual(await newer, { enabled: false, persisted: true });
    assert.equal(module.notifyBackgroundFailure.getSnapshot(), null);
    assert.deepEqual(updates, []);
    assert.equal(store.calls.filter(call => call === "write:katlab.notify:off").length, 1,
      "obsolete failure must not persist a second off choice");
    stop();
  });
});

test("background off verification cannot publish over a newer accepted enable", async () => {
  for (const channel of ["sound", "notify"]) {
    const key = `katlab.${channel}`;
    const store = storageFixture({ [key]: "on" });
    const audio = audioFixture();
    audio.behavior.gainFailures = 1;
    const notify = notificationFixture();
    notify.behavior.constructorError = true;
    const win = windowFixture();
    await withGlobals({ localStorage: { value: store.storage },
      AudioContext: { value: audio.AudioContextFake }, Notification: { value: notify.NotificationFake },
      document: { value: { hidden: true } }, window: { value: win } }, async () => {
      const module = await freshModule(`${channel}.ts`);
      const failures = channel === "sound" ? module.soundBackgroundFailure : module.notifyBackgroundFailure;
      const setEnabled = channel === "sound" ? module.setSoundEnabled : module.setNotifyEnabled;
      const wanted = channel === "sound" ? module.soundWanted : module.notifyWanted;
      const reports = [];
      const stop = preferenceFailure.observePreferenceFailure(failures, value => reports.push(value));
      const originalRead = store.storage.getItem;
      let armed = true, newer;
      store.storage.getItem = requestedKey => {
        const value = originalRead(requestedKey);
        if (armed && requestedKey === key && value === "off") {
          armed = false;
          newer = setEnabled(true);
        }
        return value;
      };
      if (channel === "sound") win.dispatch("pointerdown");
      else module.notifyWarning("fixture", "fixture", () => {});
      await new Promise(resolve => setImmediate(resolve));
      assert.ok(newer, "the new choice must start inside the old off-verification read");
      const result = await newer;
      assert.deepEqual(result, { enabled: true, persisted: true });
      assert.equal(wanted(), true);
      assert.equal(store.values.get(key), "on");
      assert.equal(failures.getSnapshot(), null);
      assert.deepEqual(reports, [], "obsolete off verification cannot publish after the new cache clear");
      const normal = { enabled: true, failed: false, message: "Enabled." };
      assert.deepEqual(preferenceFailure.withBackgroundPreferenceFailure(channel,
        failures.getSnapshot(), normal), normal);
      stop();
    });
  }
});

test("notification preflight reads cannot deliver after accepting a newer off choice", async () => {
  for (const interruption of ["preference", "capability", "permission", "visibility"]) {
    const store = storageFixture({ "katlab.notify": "on" });
    const notify = notificationFixture();
    let module, newer;
    const chooseOff = () => { newer = module.setNotifyEnabled(false); };
    if (interruption === "permission") {
      Object.defineProperty(notify.NotificationFake, "permission", { configurable: true,
        get() { chooseOff(); return "granted"; } });
    }
    await withGlobals({ localStorage: { value: store.storage },
      Notification: interruption === "capability"
        ? { get() { chooseOff(); return notify.NotificationFake; } }
        : { value: notify.NotificationFake },
      document: { value: interruption === "visibility"
        ? { get hidden() { chooseOff(); return true; } } : { hidden: true } },
      window: { value: windowFixture() } }, async () => {
      module = await freshModule("notify.ts");
      if (interruption === "preference") {
        const originalRead = store.storage.getItem;
        let armed = true;
        store.storage.getItem = key => {
          const value = originalRead(key);
          if (armed) { armed = false; chooseOff(); }
          return value;
        };
      }
      const reports = [];
      const stop = preferenceFailure.observePreferenceFailure(module.notifyBackgroundFailure,
        failure => reports.push(failure));
      assert.doesNotThrow(() => module.notifyWarning("fixture", "fixture", () => {}));
      assert.deepEqual(await newer, { enabled: false, persisted: true });
      assert.equal(module.notifyWanted(), false);
      assert.equal(store.values.get("katlab.notify"), "off");
      assert.equal(notify.calls.shown, 0, "obsolete delivery must stop before construction");
      assert.equal(notify.calls.prompts, 0);
      assert.equal(module.notifyBackgroundFailure.getSnapshot(), null);
      assert.deepEqual(reports, []);
      stop();
    });
  }
});

test("valid visible notification delivery is inert and captures capability once", async () => {
  const store = storageFixture({ "katlab.notify": "on" });
  const notify = notificationFixture();
  const document = { hidden: false };
  let reads = 0;
  await withGlobals({ localStorage: { value: store.storage },
    Notification: { get() { reads++; return notify.NotificationFake; } },
    document: { value: document }, window: { value: windowFixture() } }, async () => {
    const module = await freshModule("notify.ts");
    module.notifyWarning("fixture", "fixture", () => {});
    assert.equal(reads, 1);
    assert.equal(notify.calls.shown, 0);
    assert.equal(module.notifyBackgroundFailure.getSnapshot(), null);
    assert.equal(module.notifyWanted(), true);
    assert.ok(!store.calls.some(call => call.startsWith("write:")));
    document.hidden = true;
    module.notifyWarning("fixture", "fixture", () => {});
    assert.equal(reads, 2);
    assert.equal(notify.calls.shown, 1);
    assert.equal(module.notifyBackgroundFailure.getSnapshot(), null);
  });
});

test("accepted preference retries clear only their own cached failure", async () => {
  const store = storageFixture();
  const audio = audioFixture();
  const notify = notificationFixture();
  await withGlobals({ localStorage: { value: store.storage },
    AudioContext: { value: audio.AudioContextFake }, Notification: { value: notify.NotificationFake } }, async () => {
    const sound = await freshModule("sound.ts");
    const module = await freshModule("notify.ts");
    sound.soundBackgroundFailure.publish(false);
    module.notifyBackgroundFailure.publish(false);
    const notificationFailure = module.notifyBackgroundFailure.getSnapshot();
    const aborted = new AbortController(); aborted.abort();
    await module.setNotifyEnabled(false, aborted.signal);
    assert.equal(module.notifyBackgroundFailure.getSnapshot(), notificationFailure);
    await sound.setSoundEnabled(true);
    assert.equal(sound.soundBackgroundFailure.getSnapshot(), null);
    assert.equal(module.notifyBackgroundFailure.getSnapshot(), notificationFailure);
    sound.soundBackgroundFailure.publish(true);
    const soundFailure = sound.soundBackgroundFailure.getSnapshot();
    await module.setNotifyEnabled(true);
    assert.equal(module.notifyBackgroundFailure.getSnapshot(), null);
    assert.equal(sound.soundBackgroundFailure.getSnapshot(), soundFailure);
  });
});

test("new background notification failure wins between explicit completion and consumer continuation", async () => {
  const store = storageFixture();
  const notify = notificationFixture();
  await withGlobals({ localStorage: { value: store.storage }, Notification: { value: notify.NotificationFake },
    document: { value: { hidden: true } }, window: { value: windowFixture() } }, async () => {
    const module = await freshModule("notify.ts");
    const enabling = module.setNotifyEnabled(true);
    const background = enabling.then(() => {
      notify.behavior.constructorError = true;
      module.notifyWarning("fixture", "fixture", () => {});
    });
    const feedback = await enabling.then(result => preferenceFailure.withBackgroundPreferenceFailure(
      "notify", module.notifyBackgroundFailure.getSnapshot(), {
        enabled: result.enabled, failed: !result.persisted || !result.enabled,
        message: module.notifyToggleMessage(true, result),
      }));
    await background;
    assert.equal(feedback.enabled, false);
    assert.equal(feedback.failed, true);
    assert.doesNotMatch(feedback.message, /alerts enabled/i);
    assert.equal(module.notifyWanted(), false);
    assert.notEqual(module.notifyBackgroundFailure.getSnapshot(), null);
  });
});

test("App statically observes both background channels and gives current failures completion priority", () => {
  // Static wiring and pure-helper evidence, not React lifecycle or native delivery verification.
  const app = readFileSync(resolve(frontendRoot, "src/App.tsx"), "utf8");
  assert.equal((app.match(/observePreferenceFailure\(/g) ?? []).length, 2);
  for (const channel of ["sound", "notify"]) {
    const store = `${channel}BackgroundFailure`;
    assert.match(app, new RegExp(`observePreferenceFailure\\(${store},`));
    assert.equal((app.match(new RegExp(`withBackgroundPreferenceFailure\\(\\s*"${channel}",\\s*${store}\\.getSnapshot\\(\\)`, "g")) ?? []).length, 2,
      `${channel} success and rejection continuations must both read the current cache`);
    assert.match(app, new RegExp(`observePreferenceFailure\\(${store}, \\(failure\\) => \\{\\s*if \\(!${channel}MountedRef\\.current\\) return`));
    assert.ok(app.indexOf(`${channel}MountedRef.current = true`) < app.indexOf(`observePreferenceFailure(${store},`));
  }
  assert.match(app, /return \(\) => \{ stopNotify\(\); stopSound\(\); \};\s*\}, \[announceStatus\]\)/);
});

test("all live sound cues isolate native synthesis stages and publish one owned failure", async () => {
  const stages = ["state", "oscillator", "gain", "type", "frequency", "time", "envelope",
    "attack", "release", "oscillatorConnect", "gainConnect", "start", "stop"];
  for (const cue of ["playTick", "playChime", "playFanfare"]) {
    for (const stage of [...stages, ...(cue === "playTick" ? ["clock"] : [])]) {
      const store = storageFixture();
      const audio = liveAudioFixture();
      let now = 0;
      await withGlobals({ localStorage: { value: store.storage },
        AudioContext: { value: audio.AudioContextFake },
        performance: { value: { now() { audio.hit("clock"); return now; } } } }, async () => {
        const sound = await freshModule("sound.ts");
        assert.deepEqual(await sound.setSoundEnabled(true), { enabled: true, persisted: true });
        const reports = [];
        const stop = preferenceFailure.observePreferenceFailure(sound.soundBackgroundFailure,
          failure => reports.push({ failure, wanted: sound.soundWanted() }));
        const before = audio.events.filter(value => value === stage).length;
        now = 100;
        audio.arm(stage);
        assert.doesNotThrow(() => sound[cue](17), `${cue}: ${stage}`);
        assert.equal(audio.events.filter(value => value === stage).length, before + 1,
          `${cue}: the armed native fault must actually be reached`);
        assert.equal(sound.soundWanted(), false);
        assert.equal(store.values.get("katlab.sound"), "off");
        assert.deepEqual(reports, [{ failure: { persisted: true }, wanted: false }]);
        assert.equal(audio.calls.closed, 1);
        assert.equal(audio.calls.disconnected, 1);
        const count = audio.events.length;
        sound.playTick(3); sound.playChime(); sound.playFanfare();
        assert.equal(audio.events.length, count, "page veto prevents further native work");
        assert.equal(reports.length, 1, "subsequent cues do not republish");
        stop();
      });
    }
  }
});

test("live sound failure retains off-save truth, preabort cache and explicit retry", async () => {
  for (const cue of ["playTick", "playChime", "playFanfare"]) {
    for (const failedSave of [false, true]) {
      const store = storageFixture();
      const audio = liveAudioFixture();
      let now = 0;
      await withGlobals({ localStorage: { value: store.storage },
        AudioContext: { value: audio.AudioContextFake }, performance: { value: { now: () => now } } }, async () => {
        const sound = await freshModule("sound.ts");
        await sound.setSoundEnabled(true);
        now = 100; store.failure.write = failedSave;
        audio.arm("oscillator");
        sound[cue](1);
        assert.equal(sound.soundWanted(), false);
        assert.deepEqual(sound.soundBackgroundFailure.getSnapshot(), { persisted: !failedSave });
        assert.equal(store.values.get("katlab.sound"), failedSave ? "on" : "off");
        const cached = sound.soundBackgroundFailure.getSnapshot();
        const message = preferenceFailure.backgroundPreferenceFeedback("sound", cached).message;
        assert.match(message, /audio activation or playback could not be confirmed/i);
        assert.equal(message.includes("older opt-in"), failedSave);
        assert.doesNotMatch(message, /private native|fixture|oscillator|restored/);
        const aborted = new AbortController(); aborted.abort();
        await sound.setSoundEnabled(true, aborted.signal);
        assert.equal(sound.soundBackgroundFailure.getSnapshot(), cached);
        store.failure.write = false; now = 200;
        assert.deepEqual(await sound.setSoundEnabled(true), { enabled: true, persisted: true });
        assert.equal(sound.soundBackgroundFailure.getSnapshot(), null);
        assert.equal(sound.soundWanted(), true);
        assert.equal(audio.calls.instances[1].state, "running");
        const notes = audio.calls.notes;
        now = 300; sound[cue](2);
        assert.equal(audio.calls.notes - notes, cue === "playTick" ? 1 : cue === "playChime" ? 2 : 3);
      });
    }
  }
});

test("partial multi-note failure stops remaining notes and cleanup never blocks the caller", async () => {
  for (const cue of ["playChime", "playFanfare"]) {
    for (const cleanup of ["normal", "disconnect", "throw", "reject", "pending"]) {
      const store = storageFixture();
      const audio = liveAudioFixture();
      await withGlobals({ localStorage: { value: store.storage },
        AudioContext: { value: audio.AudioContextFake }, performance: { value: { now: () => 0 } } }, async () => {
        const sound = await freshModule("sound.ts");
        await sound.setSoundEnabled(true);
        if (cleanup === "throw") audio.behavior.close = () => { throw new Error("private close failure"); };
        if (cleanup === "reject") audio.behavior.close = () => Promise.reject(new Error("private close rejection"));
        if (cleanup === "pending") audio.behavior.close = () => new Promise(() => {});
        const notes = audio.calls.notes;
        const oscillators = audio.events.filter(value => value === "oscillator").length;
        audio.arm("oscillator", { nth: 2,
          before: cleanup === "disconnect" ? () => audio.arm("disconnect") : undefined });
        let continued = false;
        assert.doesNotThrow(() => { sound[cue](); continued = true; });
        assert.equal(continued, true, `${cleanup}: no native cleanup await`);
        assert.equal(audio.calls.notes - notes, 1, "the first note may already have started");
        assert.equal(audio.events.filter(value => value === "oscillator").length - oscillators, 2);
        assert.equal(audio.calls.closed, 1);
        assert.equal(sound.soundWanted(), false);
        assert.deepEqual(sound.soundBackgroundFailure.getSnapshot(), { persisted: true });
        await flush(); // Observe rejected cleanup without native timers or unhandled rejection.
      });
    }
  }
});

test("live sound failure cannot roll back newer choices at cue, cleanup or off verification", async () => {
  for (const boundary of ["cue", "cleanup", "offRead"]) {
    for (const next of [false, true]) {
      const store = storageFixture();
      const audio = liveAudioFixture();
      let now = 0;
      await withGlobals({ localStorage: { value: store.storage },
        AudioContext: { value: audio.AudioContextFake }, performance: { value: { now: () => now } } }, async () => {
        const sound = await freshModule("sound.ts");
        await sound.setSoundEnabled(true);
        let newer, accepted = false;
        const choose = () => {
          if (accepted) return;
          accepted = true; now += 100;
          newer = sound.setSoundEnabled(next);
        };
        if (boundary === "cleanup") audio.behavior.close = context => {
          choose(); context.state = "closed"; return Promise.resolve();
        };
        if (boundary === "offRead") {
          const get = store.storage.getItem;
          store.storage.getItem = key => {
            const value = get(key);
            if (key === "katlab.sound" && value === "off") choose();
            return value;
          };
        }
        audio.arm("oscillator", { before: boundary === "cue" ? choose : undefined });
        now = 100; sound.playFanfare();
        assert.equal(accepted, true, `${boundary}: newer choice must be exercised`);
        assert.deepEqual(await newer, { enabled: next, persisted: true });
        assert.equal(sound.soundWanted(), next);
        assert.equal(store.values.get("katlab.sound"), next ? "on" : "off");
        assert.equal(sound.soundBackgroundFailure.getSnapshot(), null);
        assert.equal(audio.calls.closed, 1, "obsolete cleanup cannot close the replacement context");
      });
    }
  }
});

test("explicit confirmation synthesis failure remains foreground and reports off-save truth", async () => {
  for (const failedSave of [false, true]) {
    const store = storageFixture();
    const audio = liveAudioFixture();
    const write = store.storage.setItem;
    store.storage.setItem = (key, value) => {
      if (failedSave && value === "off") throw new Error("private failed off save");
      write(key, value);
    };
    audio.arm("oscillator");
    await withGlobals({ localStorage: { value: store.storage },
      AudioContext: { value: audio.AudioContextFake }, performance: { value: { now: () => 0 } } }, async () => {
      const sound = await freshModule("sound.ts");
      assert.deepEqual(await sound.setSoundEnabled(true), { enabled: false, persisted: !failedSave });
      assert.equal(audio.events.filter(value => value === "oscillator").length, 1);
      assert.equal(sound.soundWanted(), false);
      assert.equal(store.values.get("katlab.sound"), failedSave ? "on" : "off");
      assert.equal(sound.soundBackgroundFailure.getSnapshot(), null);
      assert.equal(audio.calls.closed, 1);
    });
  }
});

test("explicit confirmation fences newer intent across success, failure, cleanup and off persistence", async () => {
  for (const boundary of ["failure", "success", "cleanup", "offRead"]) {
    for (const next of [false, true]) {
      const store = storageFixture();
      const audio = liveAudioFixture();
      let now = 0;
      await withGlobals({ localStorage: { value: store.storage },
        AudioContext: { value: audio.AudioContextFake }, performance: { value: { now: () => now } } }, async () => {
        const sound = await freshModule("sound.ts");
        let newer, accepted = false;
        const choose = () => {
          if (accepted) return;
          accepted = true; now = 100;
          newer = sound.setSoundEnabled(next);
        };
        if (boundary === "cleanup") audio.behavior.close = context => {
          choose(); context.state = "closed"; return Promise.resolve();
        };
        if (boundary === "offRead") {
          const get = store.storage.getItem;
          store.storage.getItem = key => {
            const value = get(key);
            if (key === "katlab.sound" && value === "off") choose();
            return value;
          };
        }
        // Stop is the last native operation, so the success case genuinely returns normally.
        audio.arm(boundary === "success" ? "stop" : "oscillator", {
          before: boundary === "success" || boundary === "failure" ? choose : undefined,
          throws: boundary !== "success",
        });
        const old = await sound.setSoundEnabled(true);
        assert.equal(accepted, true, `${boundary}: newer choice must be exercised`);
        assert.equal(old.persisted, false, "superseded confirmation cannot report ownership of a save");
        assert.equal(old.preferenceUnconfirmed, undefined);
        assert.deepEqual(await newer, { enabled: next, persisted: true });
        assert.equal(sound.soundWanted(), next);
        assert.equal(store.values.get("katlab.sound"), next ? "on" : "off");
        assert.equal(sound.soundBackgroundFailure.getSnapshot(), null);
        assert.equal(audio.calls.closed, 1);
      });
    }
  }
});

test("cancellation during successful or throwing confirmation rolls its owner off", async () => {
  for (const throws of [false, true]) {
    for (const failedSave of [false, true]) {
      const store = storageFixture();
      const audio = liveAudioFixture();
      const owner = new AbortController();
      audio.arm("stop", { throws, before() { owner.abort(); store.failure.write = failedSave; } });
      await withGlobals({ localStorage: { value: store.storage },
        AudioContext: { value: audio.AudioContextFake }, performance: { value: { now: () => 0 } } }, async () => {
        const sound = await freshModule("sound.ts");
        assert.deepEqual(await sound.setSoundEnabled(true, owner.signal), {
          enabled: false, persisted: !failedSave,
        });
        assert.equal(owner.signal.aborted, true);
        assert.equal(audio.calls.notes, 1, "already-started work is not claimed to be canceled");
        assert.equal(audio.calls.closed, 1);
        assert.equal(sound.soundWanted(), false);
        assert.equal(sound.soundBackgroundFailure.getSnapshot(), null);
      });
    }
  }
});

test("live cue wrapping preserves defaults, non-running no-ops, pitches, counts and tick drop limits", async () => {
  const store = storageFixture();
  const audio = liveAudioFixture();
  let now = 0;
  await withGlobals({ localStorage: { value: store.storage },
    AudioContext: { value: audio.AudioContextFake }, performance: { value: { now: () => now } } }, async () => {
    const sound = await freshModule("sound.ts");
    sound.playTick(1); sound.playChime(); sound.playFanfare();
    assert.equal(audio.calls.created, 0);
    await sound.setSoundEnabled(true);
    assert.equal(audio.calls.notes, 1);
    sound.playTick(1); now = 79; sound.playTick(2);
    assert.equal(audio.calls.notes, 1);
    now = 80; sound.playTick(3);
    assert.equal(audio.calls.notes, 2);
    sound.playChime(); sound.playFanfare();
    assert.equal(audio.calls.notes, 7);
    assert.deepEqual(audio.frequencies, [sound.NOTES.A4,
      sound.NOTES[sound.TICK_STEPS[sound.tickStep(3)]], sound.NOTES.E5, sound.NOTES.A5,
      sound.NOTES.A4, sound.NOTES["C#5"], sound.NOTES.E5]);
    for (const state of ["suspended", "closed", "interrupted"]) {
      audio.calls.instances[0].state = state;
      now += 100; sound.playTick(1); sound.playChime(); sound.playFanfare();
      assert.equal(audio.calls.notes, 7);
      assert.equal(sound.soundWanted(), true, "silent context drift remains explicitly out of scope");
      assert.equal(sound.soundBackgroundFailure.getSnapshot(), null);
    }
    assert.deepEqual(sound.NOTES, { A4: 440, B4: 493.88, "C#5": 554.37, E5: 659.25, "F#5": 739.99, A5: 880 });
    assert.deepEqual(sound.TICK_STEPS, ["A4", "B4", "C#5", "E5", "F#5"]);
    assert.equal(audio.calls.closed, 0);
  });
});

test("actual WS callback continues after each isolated live audio failure", async () => {
  for (const cue of ["playTick", "playChime", "playFanfare"]) {
    const store = storageFixture();
    const audio = liveAudioFixture();
    const sockets = [], intervals = new Map(), timeouts = new Map();
    let now = 0, timer = 0;
    class FakeWebSocket {
      static OPEN = 1;
      constructor() { this.readyState = 1; this.closed = false; sockets.push(this); }
      send() {}
      close() { this.closed = true; this.onclose?.(); }
    }
    await withGlobals({ localStorage: { value: store.storage },
      AudioContext: { value: audio.AudioContextFake }, performance: { value: { now: () => now } },
      WebSocket: { value: FakeWebSocket }, location: { value: { protocol: "http:", host: "fixture.invalid" } },
      setInterval: { value: fn => { intervals.set(++timer, fn); return timer; } },
      clearInterval: { value: id => intervals.delete(id) },
      setTimeout: { value: fn => { timeouts.set(++timer, fn); return timer; } },
      clearTimeout: { value: id => timeouts.delete(id) } }, async () => {
      const sound = await freshModule("sound.ts");
      const ws = await import(`${dataUrl(transpile("ws.ts"))}#ws-${++moduleSerial}`);
      await sound.setSoundEnabled(true);
      let before = 0, after = 0, syncs = 0;
      const stop = ws.connectWs(message => {
        assert.equal(message.type, "event_resolved");
        before++; sound[cue](42); after++;
      }, () => { syncs++; });
      try {
        assert.equal(sockets.length, 1);
        sockets[0].onopen();
        assert.equal(syncs, 1);
        now = 100; audio.arm("oscillator");
        const previous = audio.events.filter(value => value === "oscillator").length;
        assert.doesNotThrow(() => sockets[0].onmessage({ data: JSON.stringify({
          type: "event_resolved", id: "fixture", data: { id: 42 },
        }) }));
        assert.equal(audio.events.filter(value => value === "oscillator").length, previous + 1);
        assert.equal(before, 1);
        assert.equal(after, 1, "the real ws callback must reach work after its failed audio cue");
        assert.equal(sound.soundWanted(), false);
        assert.deepEqual(sound.soundBackgroundFailure.getSnapshot(), { persisted: true });
      } finally { stop(); }
      assert.equal(sockets[0].closed, true);
      assert.equal(intervals.size, 0);
      assert.equal(timeouts.size, 0, "teardown must not schedule reconnect");
    });
  }
});

test("App static sound ordering identifies core work protected by the live boundary", () => {
  // Static caller evidence only; the WS probe above is not a mounted React/browser test.
  const app = readFileSync(resolve(frontendRoot, "src/App.tsx"), "utf8");
  const handler = app.slice(app.indexOf("const close = connectWs((msg) => {"));
  const eventStart = handler.indexOf('if (msg.type === "event_resolved")');
  const statusStart = handler.indexOf('if (msg.type === "repo_status_changed")');
  const warningStart = handler.indexOf('if (msg.type === "warning")');
  assert.ok(eventStart >= 0 && statusStart > eventStart && warningStart > statusStart);
  const event = handler.slice(eventStart, statusStart);
  const status = handler.slice(statusStart, warningStart);
  for (const token of ["playTick(", "setComboCount(next)", "setGuardEvent(",
    "playChime()", "window.setTimeout(() => setOdoNote"]) assert.ok(event.includes(token), token);
  for (const token of ["playChime()", "setRepos((prev)"]) assert.ok(status.includes(token), token);
  assert.ok(event.indexOf("playTick(") < event.indexOf("setComboCount(next)"));
  assert.ok(event.indexOf("playTick(") < event.indexOf("setGuardEvent("));
  assert.ok(event.indexOf("playChime()") < event.indexOf("window.setTimeout(() => setOdoNote"));
  assert.ok(status.indexOf("playChime()") < status.indexOf("setRepos((prev)"));
  assert.match(handler, /if \(msg\.type === "event_resolved" \|\| msg\.type === "commit_detected"\) debouncedSync\(\)/);
  assert.doesNotMatch(status, /debouncedSync\(/);
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
      assert.match(goalHtml, /Daily rings/);
      assert.match(goalHtml, /unavailable \(UTC\)/);
      assert.match(goalHtml, /<svg/);
      assert.match(goalHtml, /captures[\s\S]{0,180}Unavailable \/ 30/);
      assert.match(goalHtml, /effort[\s\S]{0,180}Unavailable \/ ≈ 2h 0m/);
      assert.match(goalHtml, /commits[\s\S]{0,180}Unavailable \/ 2/);
      assert.doesNotMatch(goalHtml, /\(0%\)/);
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
      assert.match(goalHtml, /captures[\s\S]{0,180}Unavailable \/ 41/);
      assert.match(goalHtml, /effort[\s\S]{0,180}Unavailable \/ ≈ 1h 17m/);
      assert.match(goalHtml, /commits[\s\S]{0,180}Unavailable \/ 5/);
      assert.doesNotMatch(goalHtml, /\(0%\)/);
      assert.match(renderDay(), /aria-pressed="true"[^>]*>clock<\/button>/);
    });
    const malformed = storageFixture({ "katlab.goals": "{not-json" });
    await withGlobals({ localStorage: { value: malformed.storage } }, async () => {
      const goalHtml = renderGoal();
      assert.match(goalHtml, /captures[\s\S]{0,180}Unavailable \/ 30/);
      assert.match(goalHtml, /effort[\s\S]{0,180}Unavailable \/ ≈ 2h 0m/);
      assert.match(goalHtml, /commits[\s\S]{0,180}Unavailable \/ 2/);
      assert.doesNotMatch(goalHtml, /\(0%\)/);
    });
  } finally {
    await vite.close();
  }
});
