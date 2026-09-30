import assert from "node:assert/strict";
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

async function freshModule (name) {
  const emitted = transpile(name);
  const imports = emitted.match(/from ["']\.\/preferences["']/g) ?? [];
  assert.equal(imports.length, 1, `${name} must use the shared preference boundary`);
  const linked = emitted.replace(imports[0], `from "${preferenceUrl}"`);
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
  const calls = { created: 0, gains: 0, resumed: 0, suspended: 0, closed: 0, notes: 0 };
  const behavior = { constructorFailures: 0, gainFailures: 0, resume: null, suspend: null };
  class AudioContextFake {
    constructor() {
      calls.created++;
      if (behavior.constructorFailures-- > 0) throw new Error("audio constructor failed");
      this.state = "suspended";
      this.currentTime = 0;
      this.destination = {};
    }
    createGain() {
      calls.gains++;
      if (behavior.gainFailures-- > 0) throw new Error("gain setup failed");
      return {
        gain: {
          value: 0,
          setValueAtTime() {},
          linearRampToValueAtTime() {},
          exponentialRampToValueAtTime() {},
        },
        connect() {},
      };
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
    assert.equal(audio.calls.suspended, 1);
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

test("audio setup, resume, and suspend failures fail closed without poisoning retry", async () => {
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
  audio.behavior.suspend = () => Promise.reject(new Error("suspend denied"));
  await withGlobals({
    localStorage: { value: store.storage },
    AudioContext: { value: audio.AudioContextFake },
  }, async () => {
    const sound = await freshModule("sound.ts");
    assert.deepEqual(await sound.setSoundEnabled(true), { enabled: true, persisted: true });
    assert.deepEqual(await sound.setSoundEnabled(false), { enabled: false, persisted: true });
    await flush();
    assert.equal(sound.soundWanted(), false);
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
  const deniedStore = storageFixture();
  const denied = notificationFixture("denied");
  await withGlobals({
    localStorage: { value: deniedStore.storage },
    Notification: { value: denied.NotificationFake },
  }, async () => {
    const module = await freshModule("notify.ts");
    assert.deepEqual(await module.setNotifyEnabled(true), {
      enabled: false, persisted: true,
    });
    assert.equal(denied.calls.prompts, 1);
    assert.equal(deniedStore.values.get("katlab.notify"), "off");
  });
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
