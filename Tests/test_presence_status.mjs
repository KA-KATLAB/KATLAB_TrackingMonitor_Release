import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(resolve(root, "Frontend/package.json"));
const ts = require("typescript");
const read = (name) => readFileSync(resolve(root, "Frontend/src", name), "utf8");
const emit = (text) => ts.transpileModule(text, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
} }).outputText;
const load = (text) => import(`data:text/javascript;base64,${Buffer.from(emit(text)).toString("base64")}`);
const ast = ts.createSourceFile("App.tsx", read("App.tsx"), ts.ScriptTarget.Latest, true);
const body = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "App").body;
const calls = body.statements.filter((node) => ts.isExpressionStatement(node)
  && ts.isCallExpression(node.expression) && node.expression.expression.getText(ast) === "useEffect");
function effect (needle) {
  const matches = calls.filter((node) => node.expression.arguments[0].getText(ast).includes(needle));
  assert.equal(matches.length, 1, `one actual ${needle} effect`);
  return matches[0].expression;
}
const badge = effect("navigator.setAppBadge"), favicon = effect("drawStatusFavicon(");
const actual = await load(read("favicon.ts"));
const { createSubject } = await load(`export function createSubject(env) {
  const { repos, workspaceReady, error, navigator, document, workspacePresence, drawStatusFavicon } = env;
  return {
    badge: ${badge.arguments[0].getText(ast)},
    favicon: ${favicon.arguments[0].getText(ast)},
  };
}`);

// Execute actual callbacks/module; only platform/DOM/canvas boundaries are spies.
// These operations are not native favicon rendering or OS badge delivery evidence.
function harness (repos, options = {}) {
  const operations = [], badges = [], labels = [], strokes = [];
  const link = options.link === false ? null : options.link
    ?? { href: options.href ?? "/favicon.svg", type: "image/svg+xml" };
  const context = {
    beginPath: () => operations.push(["beginPath"]),
    roundRect: (...args) => operations.push(["roundRect", ...args]),
    arc: (...args) => operations.push(["arc", ...args]),
    fill() { operations.push(["fill", this.fillStyle]); },
    stroke() { strokes.push(this.strokeStyle); operations.push(["stroke", this.strokeStyle]); },
    fillText: (...args) => { labels.push(args[0]); operations.push(["fillText", ...args]); },
  };
  const canvas = {
    width: 0, height: 0,
    getContext: (kind) => { assert.equal(kind, "2d"); return options.context === false ? null : context; },
    toDataURL: (kind) => { assert.equal(kind, "image/png"); return "data:image/png;controlled," + JSON.stringify(operations); },
  };
  const document = {
    createElement: (name) => { assert.equal(name, "canvas"); return canvas; },
    querySelector: (selector) => { assert.equal(selector, 'link[rel="icon"]'); return link; },
  };
  const navigator = options.navigator ?? {
    setAppBadge: (count) => { badges.push(["set", count]); return Promise.resolve(); },
    clearAppBadge: () => { badges.push(["clear"]); return Promise.resolve(); },
  };
  const subject = createSubject({ repos, workspaceReady: options.ready ?? true,
    error: options.error ?? "", navigator, document, ...actual });
  const draw = () => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
    Object.defineProperty(globalThis, "document", { configurable: true, value: document });
    try { subject.favicon(); }
    finally {
      if (previous) Object.defineProperty(globalThis, "document", previous);
      else delete globalThis.document;
    }
  };
  return { subject, badges, link, labels, strokes, operations, context, canvas,
    run() { subject.badge(); draw(); }, draw };
}
const repo = (extra = {}) => ({ offline: false, status_valid: true, count: 0, ...extra });
const unknown = (h) => {
  h.run();
  assert.deepEqual(h.badges, [["clear"]], "unknown cannot publish a retained numeric count");
  assert.deepEqual(h.labels, ["?"], "unknown cannot be rendered as CLEAN");
  assert.deepEqual(h.strokes, ["#64748b"]);
};

test("pending, accepted-empty and all-offline snapshots do not claim CLEAN", () => {
  for (const [repos, options] of [[[], { ready: false }], [[], {}],
    [[repo({ offline: true, count: 777 })], {}]]) unknown(harness(repos, options));
});

test("invalid zero and retained invalid counts are not current presence facts", () => {
  for (const count of [0, 777]) unknown(harness([repo({ status_valid: false, count })]));
  unknown(harness([repo({ count: 3 }), repo({ status_valid: false, count: 777 })]));
});

test("failed refresh cannot preserve a stale numeric or CLEAN presence claim", () => {
  for (const count of [0, 7]) unknown(harness([repo({ count })], { error: "synthetic sync failure" }));
});

test("retained invalid positive status must clear the numeric badge", () => {
  unknown(harness([repo({ status_valid: false, count: 777 })]));
});

test("mixed known and invalid repositories cannot publish a workspace total", () => {
  unknown(harness([repo({ count: 3 }), repo({ status_valid: false, count: 777 })]));
});

test("both actual effects rerun for accepted workspace and sync error changes", () => {
  for (const call of [badge, favicon]) {
    assert.ok(ts.isArrayLiteralExpression(call.arguments[1]));
    assert.deepEqual(call.arguments[1].elements.map((node) => node.getText(ast)),
      ["repos", "workspaceReady", "error"]);
  }
});

test("pure coverage is strict, unscoped and does not infer validity from clean or paths", () => {
  const rows = Object.freeze([Object.freeze(repo({ count: 3, clean: true, paths_complete: false })),
    Object.freeze(repo({ count: 4, clean: false, paths_complete: true }))]);
  assert.deepEqual(actual.workspacePresence(rows, true, ""), { kind: "dirty", count: 7 });
  assert.deepEqual(actual.workspacePresence([repo({ clean: false })], true, ""), { kind: "clean", count: 0 });
  for (const status_valid of [false, undefined, null, 1, "true"]) {
    unknown(harness([repo({ status_valid, count: 7 })]));
  }
  unknown(harness([repo({ count: 7 })], { ready: false }));
  unknown(harness([repo({ count: 3 }), repo({ offline: true })]));
});

test("invalid numeric inputs and unsafe workspace sums cannot reach the badge", () => {
  for (const count of [-1, 0.5, NaN, Infinity, undefined, "3", Number.MAX_SAFE_INTEGER + 1]) {
    unknown(harness([repo({ count })]));
  }
  unknown(harness([repo({ count: Number.MAX_SAFE_INTEGER }), repo({ count: 1 })]));
});

test("fully known dirty status requests exact totals and clamps only the favicon label", () => {
  for (const [counts, label] of [[[3, 4], "7"], [[99], "99"], [[100], "99+"]]) {
    const h = harness(counts.map((count) => repo({ count })));
    h.run();
    assert.deepEqual(h.badges, [["set", counts.reduce((sum, count) => sum + count, 0)]]);
    assert.deepEqual(h.labels, [label]); assert.deepEqual(h.strokes, ["#14b8a6"]);
    assert.ok(h.operations.some((row) => row[0] === "fill" && row[1] === "#f59e0b"));
    assert.equal(h.link.type, "image/png");
    assert.equal(h.context.font, `bold ${label.length > 2 ? 7 : 9}px ui-sans-serif, system-ui, sans-serif`);
  }
});

test("fully known zero preserves the existing clean ring and canvas geometry", () => {
  const h = harness([repo(), repo()]); h.run();
  assert.deepEqual(h.badges, [["clear"]]); assert.deepEqual(h.labels, []);
  assert.deepEqual(h.strokes, ["#14b8a6"]);
  assert.equal(h.canvas.width, 32); assert.equal(h.canvas.height, 32);
  assert.ok(h.operations.some((row) => row.join() === ["roundRect", 0, 0, 32, 32, 7].join()));
  assert.ok(h.operations.some((row) => row.join() === ["arc", 15, 17, 9, 0, 2 * Math.PI].join()));
  assert.equal(h.context.lineWidth, 4);
  assert.equal(h.link.type, "image/png");
});

test("dirty to unavailable to clean replaces one existing icon without stale status", () => {
  const link = { href: "/favicon.svg", type: "image/svg+xml" };
  const dirty = harness([repo({ count: 7 })], { link }); dirty.run();
  const dirtyURL = link.href;
  const unavailable = harness([repo({ count: 7, status_valid: false })], { link });
  unknown(unavailable); assert.notEqual(link.href, dirtyURL);
  const clean = harness([repo()], { link }); clean.run();
  assert.notEqual(link.href, dirtyURL); assert.deepEqual(clean.labels, []);
  assert.deepEqual(clean.strokes, ["#14b8a6"]);
  assert.deepEqual(clean.badges, [["clear"]]);
});

test("missing icon is a no-op and unavailable canvas restores the static brand", () => {
  const missing = harness([repo({ count: 7 })], { link: false }); missing.run();
  assert.deepEqual(missing.operations, []); assert.deepEqual(missing.badges, [["set", 7]]);
  for (const rows of [[repo({ count: 7 })], [repo({ status_valid: false })], [repo()]]) {
    const h = harness(rows, { href: "data:image/png;stale-status", context: false }); h.run();
    assert.equal(h.link.href, "/favicon.svg"); assert.equal(h.link.type, "image/svg+xml");
    assert.deepEqual(h.operations, []);
  }
});

test("unsupported or partial badge APIs do not prevent favicon updates", () => {
  const unexpected = () => { assert.fail("a partial platform must not be called"); };
  for (const navigator of [{}, { setAppBadge: unexpected }, { clearAppBadge: unexpected },
    { setAppBadge: null, clearAppBadge: unexpected }]) {
    const h = harness([repo({ status_valid: false })], { navigator }); h.run();
    assert.deepEqual(h.labels, ["?"]);
  }
});

test("asynchronous badge refusals are caught for dirty, clean and unavailable", async () => {
  const calls = [];
  const navigator = {
    setAppBadge: (count) => { calls.push(["set", count]); return Promise.reject(new Error("synthetic refusal")); },
    clearAppBadge: () => { calls.push(["clear"]); return Promise.reject(new Error("synthetic refusal")); },
  };
  for (const row of [repo({ count: 7 }), repo(), repo({ status_valid: false })]) {
    harness([row], { navigator }).run();
    await Promise.resolve();
  }
  assert.deepEqual(calls, [["set", 7], ["clear"], ["clear"]]);
});
