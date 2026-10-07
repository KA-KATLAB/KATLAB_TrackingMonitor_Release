import { deskPreservation } from "./helpers/changesReviewLanes.mjs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { canonicalPrintedText } from "./helpers/printed_source.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(resolve(root, "Frontend/package.json"));
const ts = require("typescript");
const read = (name) => readFileSync(resolve(root, "Frontend/src", name), "utf8");
const parse = (name, text = read(name)) => ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true);
const appText = read("App.tsx"), app = parse("App.tsx", appText), theme = parse("theme.ts");
const descendants = (node) => {
  const result = [node];
  ts.forEachChild(node, (child) => { result.push(...descendants(child)); });
  return result;
};
const unique = (rows, label) => { assert.equal(rows.length, 1, label); return rows[0]; };
function declaration (ast, name) {
  return unique(ast.statements.filter((node) =>
    (ts.isFunctionDeclaration(node) && node.name?.text === name)
    || (ts.isVariableStatement(node) && node.declarationList.declarations.some(
      (entry) => entry.name.getText(ast) === name))), `actual declaration ${name}`);
}
function commitBlock (ast) {
  return unique(descendants(declaration(ast, "App")).filter((node) =>
    ts.isIfStatement(node) && node.expression.getText(ast) === 'msg.type === "commit_detected"'),
  "actual complete commit_detected block");
}
const block = commitBlock(app);
const seed = unique(descendants(declaration(app, "App")).filter((node) => ts.isCallExpression(node)
  && node.expression.getText(app) === "useEffect"
  && node.arguments[0]?.getText(app).includes("releaseSeededRef.current")), "actual baseline seed effect");
const compiled = ts.transpileModule(`export function createSubject(env) {
  const { lastVersionRef, seenReleasesRef, releaseSeededRef, releaseN, dreamingRef,
    wakeCoordinatorRef, setReleases, announceStatus, window, notifyRelease,
    navigateToRepo, playFanfare, prefersReducedMotion, api } = env;
  ${["RELEASE_RX", "prefix3"].map((name) => declaration(theme, name).getText(theme).replace(/^export\s+/, "")).join("\n")}
  return {
    handle(msg) { ${block.getText(app)} },
    seed(repos) { return (${seed.arguments[0].getText(app)})(); },
  };
}`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { createSubject } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

// Only output/transport boundaries are controlled. No native audio, notification,
// browser, network, or copied release/seed algorithm is exercised by this suite.
function harness (baselines = [], options = {}) {
  const h = {
    lastVersionRef: { current: new Map(baselines) }, seenReleasesRef: { current: new Set() },
    releaseSeededRef: { current: false }, releaseN: { current: 0 },
    dreamingRef: { current: options.dreaming ?? false }, reduced: options.reduced ?? false,
    releases: [], announcements: [], notifications: [], navigation: [], timers: new Map(),
    history: [], fanfares: 0, wakes: 0,
  };
  let timerId = 0;
  const env = {
    ...h,
    setReleases: (update) => { h.releases = update(h.releases); },
    announceStatus: (message) => h.announcements.push(message),
    notifyRelease: (repo, version, navigate) => h.notifications.push({ repo, version, navigate }),
    navigateToRepo: (...args) => h.navigation.push(args),
    playFanfare: () => { h.fanfares += 1; },
    prefersReducedMotion: () => h.reduced,
    wakeCoordinatorRef: { current: () => { h.wakes += 1; h.dreamingRef.current = false; } },
    window: { setTimeout: (fn, ms) => { const id = timerId++; h.timers.set(id, { fn, ms }); return id; } },
    api: { history: (repo, limit) => new Promise((resolve, reject) => h.history.push({ repo, limit, resolve, reject })) },
  };
  const subject = createSubject(env);
  return Object.assign(h, subject, {
    send(repo, hash, version, extra = {}) {
      subject.handle({ type: "commit_detected", data: { repo, hash, message: `KATLAB release ${version}`, ...extra } });
    },
    fireTimer(id) { const timer = h.timers.get(id); assert.ok(timer); h.timers.delete(id); timer.fn(); },
  });
}
const hash = (character) => character.repeat(40);
const flush = async () => { for (let index = 0; index < 6; index++) await Promise.resolve(); };

// v0.4.0.16 changes only these two presence effects. Restore their reviewed
// pre-change calls, not a newly generated whole-App baseline or a broad carve-out.
function restorePresenceEffects (text) {
  const ast = parse("App.tsx", text);
  const statements = declaration(ast, "App").body.statements;
  const calls = statements.filter((node) => ts.isExpressionStatement(node)
    && ts.isCallExpression(node.expression) && node.expression.expression.getText(ast) === "useEffect");
  const changed = calls.filter((node) => node.getText(ast).includes("workspacePresence("));
  if (changed.length === 0) return text; // Actual old source needs no restoration.
  assert.equal(changed.length, 2, "only two exact presence effects are restored");
  const previous = [
    ["navigator.setAppBadge", "68081d7a9e5fed987ac90fed7ac74eb5eb75954740ee3cc87a38b84de04cc590", `useEffect(() => {
    if (!("setAppBadge" in navigator)) return;
    const n = repos.filter((r) => !r.offline).reduce((s, r) => s + r.count, 0);
    (n > 0 ? navigator.setAppBadge(n) : navigator.clearAppBadge()).catch(() => {});
  }, [repos]);`],
    ["drawStatusFavicon(", "bfb874b1d171a14b6ffd6898662f83845927ba29dce0684bd737d6ce3d4d2da1", `useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) return;
    const n = repos.filter((r) => !r.offline).reduce((s, r) => s + r.count, 0);
    const url = drawStatusFavicon(n === 0, n);
    if (url) {
      link.href = url;
      link.type = "image/png";
    }
  }, [repos]);`],
  ];
  const printer = ts.createPrinter({ removeComments: true });
  const edits = previous.map(([needle, expected, original]) => {
    const node = unique(changed.filter((call) => call.getText(ast).includes(needle)), `exact ${needle} call`);
    const printed = canonicalPrintedText(printer.printNode(ts.EmitHint.Unspecified, node, ast));
    assert.equal(createHash("sha256").update(printed).digest("hex"), expected,
      "presence restoration cannot hide any unreviewed callback or dependency edit");
    return { start: node.getStart(ast), end: node.end, original };
  });
  for (const edit of edits.sort((left, right) => right.start - left.start)) {
    text = text.slice(0, edit.start) + edit.original + text.slice(edit.end);
  }
  return text;
}

function baselineHash (text) {
  text = restorePresenceEffects(text);
  let ast = parse("App.tsx", text), actual = commitBlock(ast), body = actual.getText(ast);
  const local = "const releaseKey = JSON.stringify([d.repo, d.hash]);";
  const count = (needle) => body.split(needle).length - 1;
  if (count(local) !== 0) {
    assert.equal(count(local), 1, "exactly one added composite key declaration");
    for (const operation of ["has", "add"]) {
      assert.equal(count(`seenReleasesRef.current.${operation}(releaseKey)`), 1);
      assert.equal(count(`seenReleasesRef.current.${operation}(d.hash)`), 0);
    }
    body = body.replace(local, "");
    for (const operation of ["has", "add"]) {
      body = body.replace(`seenReleasesRef.current.${operation}(releaseKey)`,
        `seenReleasesRef.current.${operation}(d.hash)`);
    }
    assert.doesNotMatch(body, /\breleaseKey\b/, "no unrelated releaseKey use is silently reversed");
    ast = parse("App.tsx", text.slice(0, actual.getStart(ast)) + body + text.slice(actual.end));
  } else {
    assert.doesNotMatch(body, /\breleaseKey\b/, "old-source oracle needs no reversal");
    for (const operation of ["has", "add"]) assert.equal(count(`seenReleasesRef.current.${operation}(d.hash)`), 1);
  }
  const statements = [...declaration(ast, "App").body.statements];
  assert.ok(ts.isReturnStatement(statements.pop()), "whole App pre-render boundary");
  const printer = ts.createPrinter({ removeComments: true });
  const normalized = canonicalPrintedText(statements.map((node) =>
    printer.printNode(ts.EmitHint.Unspecified, node, ast)).join("\n"));
  return createHash("sha256").update(normalized).digest("hex");
}

test("whole App pre-render permits only the exact identity and fingerprinted presence edits", () => {
  for (const text of [appText.replace(/\r\n/g, "\n"), appText.replace(/\r?\n/g, "\r\n")]) {
    assert.equal(baselineHash(deskPreservation("Frontend/src/App.tsx", text)), "b8c39e9e4bcf9ce970e4ab56be4b627d776522c580929277eba946368ffbeefb");
  }
});

test("the oracle still accepts the captured pre-presence source without a new baseline", () => {
  const previous = restorePresenceEffects(deskPreservation("Frontend/src/App.tsx", appText));
  assert.doesNotMatch(previous, /workspacePresence\(/);
  assert.equal(baselineHash(previous), "b8c39e9e4bcf9ce970e4ab56be4b627d776522c580929277eba946368ffbeefb");
});

test("presence restoration rejects altered behavior, dependencies and partial restoration", () => {
  for (const [before, after] of [["status.kind === \"dirty\"", "status.kind === \"clean\""],
    ["[repos, workspaceReady, error]", "[repos, workspaceReady]"],
    ["const status = workspacePresence(repos, workspaceReady, error);", "const status = otherPresence();"]]) {
    assert.ok(appText.includes(before));
    assert.throws(() => baselineHash(deskPreservation("Frontend/src/App.tsx", appText).replace(before, after)), assert.AssertionError);
  }
});

test("presence restoration cannot conceal an unrelated App statement change", () => {
  const before = "setWorkspaceReady(true);";
  assert.equal(appText.split(before).length - 1, 1);
  assert.notEqual(baselineHash(deskPreservation("Frontend/src/App.tsx", appText).replace(before, "setWorkspaceReady(false);")),
    "b8c39e9e4bcf9ce970e4ab56be4b627d776522c580929277eba946368ffbeefb");
});

for (const order of [["Clone_A", "Clone_B"], ["Clone_B", "Clone_A"]]) {
  test(`same commit announces each repository independently: ${order.join(" then ")}`, () => {
    const h = harness([["Clone_A", "v1.0.0.0"], ["Clone_B", "v1.1.0.0"]]);
    for (const repo of order) h.send(repo, hash("a"), "v2.0.0.0");
    assert.deepEqual(h.notifications.map((row) => row.repo), order);
    assert.deepEqual(h.releases.map((row) => row.repo), [...order].reverse());
    assert.equal(h.fanfares, 2);
    for (const repo of order) assert.equal(h.lastVersionRef.current.get(repo), "v2.0.0.0");
    for (const notice of h.notifications) notice.navigate();
    assert.deepEqual(h.navigation, order.map((repo) => [repo, false]));
  });
}

test("a clone's following fourth-part rider cannot falsely become a release", () => {
  const h = harness([["Clone_A", "v1.0.0.0"], ["Clone_B", "v1.1.0.0"]]);
  h.send("Clone_A", hash("a"), "v2.0.0.0"); h.send("Clone_B", hash("a"), "v2.0.0.0");
  const before = h.notifications.length;
  h.send("Clone_B", hash("b"), "v2.0.0.1");
  assert.equal(h.notifications.length, before, "the actual B baseline prevents a false rider announcement");
  assert.equal(h.lastVersionRef.current.get("Clone_B"), "v2.0.0.1");
});

test("same-repo replay and patch riders preserve the latest baseline without repeated effects", () => {
  const h = harness([["Repo_A", "v1.0.0.0"]]);
  h.send("Repo_A", hash("a"), "v2.0.0.0");
  h.send("Repo_A", hash("a"), "v2.0.0.0");
  h.send("Repo_A", hash("b"), "v2.0.0.1");
  assert.equal(h.lastVersionRef.current.get("Repo_A"), "v2.0.0.1");
  assert.equal(h.notifications.length, 1);
  h.send("Repo_A", hash("c"), "v3.0.0.0");
  h.send("Repo_A", hash("a"), "v2.0.0.0");
  assert.equal(h.lastVersionRef.current.get("Repo_A"), "v3.0.0.0");
  assert.equal(h.seenReleasesRef.current.size, 3);
  assert.equal(h.notifications.length, 2);
  assert.equal(h.announcements.length, 2);
  assert.equal(h.fanfares, 2);
  assert.equal(h.timers.size, 2);
  assert.deepEqual(h.releases.map((row) => row.version), ["v3.0.0.0"]);
});

test("distinct full hashes sharing a displayed prefix remain distinct releases", () => {
  const h = harness([["Repo_A", "v1.0.0.0"]]);
  const first = "a".repeat(39) + "0", second = "a".repeat(39) + "1";
  h.send("Repo_A", first, "v2.0.0.0"); h.send("Repo_A", second, "v3.0.0.0");
  assert.deepEqual(h.notifications.map((row) => row.version), ["v2.0.0.0", "v3.0.0.0"]);
  assert.deepEqual([...h.seenReleasesRef.current], [
    JSON.stringify(["Repo_A", first]), JSON.stringify(["Repo_A", second]),
  ]);
});

test("unknown baselines seed silently per repository even for one shared commit", () => {
  const h = harness();
  for (const repo of ["Clone_A", "clone_a"]) h.send(repo, hash("a"), "v2.0.0.0");
  assert.deepEqual([...h.lastVersionRef.current], [["Clone_A", "v2.0.0.0"], ["clone_a", "v2.0.0.0"]]);
  assert.equal(h.seenReleasesRef.current.size, 2);
  assert.deepEqual(h.releases, []); assert.deepEqual(h.notifications, []);
  assert.deepEqual(h.announcements, []); assert.equal(h.fanfares, 0); assert.equal(h.timers.size, 0);
});

test("actual history seed waits for repositories, runs once and never replaces a newer WS baseline", async () => {
  const h = harness();
  h.seed([]); assert.equal(h.releaseSeededRef.current, false); assert.equal(h.history.length, 0);
  h.seed([{ id: "Clone_A" }, { id: "Clone_B" }]);
  h.seed([{ id: "Clone_A" }, { id: "Clone_B" }, { id: "Later" }]);
  assert.equal(h.releaseSeededRef.current, true);
  assert.deepEqual(h.history.map(({ repo, limit }) => [repo, limit]), [["Clone_A", 1], ["Clone_B", 1]]);
  h.send("Clone_A", hash("a"), "v2.0.0.0");
  h.history[0].resolve([{ commit: { message: "KATLAB prior v1.0.0.0" } }]);
  h.history[1].resolve([{ commit: { message: "KATLAB prior v1.1.0.0" } }]);
  await flush();
  assert.equal(h.lastVersionRef.current.get("Clone_A"), "v2.0.0.0");
  assert.equal(h.lastVersionRef.current.get("Clone_B"), "v1.1.0.0");
  assert.equal(h.notifications.length, 0, "history and the first WS observation seed silently");
  h.send("Clone_B", hash("a"), "v2.0.0.0");
  assert.deepEqual(h.notifications.map((row) => row.repo), ["Clone_B"]);
  assert.equal(h.lastVersionRef.current.get("Clone_B"), "v2.0.0.0");
});

test("failed, empty and non-version history stay unseeded until a valid observed commit", async () => {
  const h = harness();
  h.seed([{ id: "Failed" }, { id: "Empty" }, { id: "Plain" }]);
  h.history[0].reject(new Error("synthetic read failure")); h.history[1].resolve([]);
  h.history[2].resolve([{ commit: { message: "ordinary commit" } }]);
  await flush();
  assert.equal(h.lastVersionRef.current.size, 0);
  for (const repo of ["Failed", "Empty", "Plain"]) h.send(repo, hash("a"), "v2.0.0.0");
  assert.equal(h.lastVersionRef.current.size, 3);
  assert.equal(h.notifications.length, 0);
  h.send("Failed", hash("b"), "v3.0.0.0");
  assert.deepEqual(h.notifications.map((row) => row.repo), ["Failed"]);
});

test("swept, missing and non-version frames retain existing guards without spending identities", () => {
  const h = harness([["Repo_A", "v1.0.0.0"]]);
  const valid = { repo: "Repo_A", hash: hash("a"), message: "KATLAB release v2.0.0.0" };
  for (const change of [{ swept: true }, { repo: undefined }, { repo: "" }, { hash: undefined },
    { hash: "" }, { message: undefined }, { message: 7 }, { message: "ordinary commit" },
    { message: "KATLAB v2.0.0.0 not at the end" }, { message: "KATLAB v2.0.0" }]) {
    h.handle({ type: "commit_detected", data: { ...valid, ...change } });
  }
  h.handle({ type: "warning", data: valid });
  assert.equal(h.seenReleasesRef.current.size, 0);
  assert.equal(h.lastVersionRef.current.get("Repo_A"), "v1.0.0.0");
  assert.deepEqual(h.releases, []); assert.deepEqual(h.announcements, []);
  assert.deepEqual(h.notifications, []); assert.equal(h.fanfares, 0); assert.equal(h.timers.size, 0);
  h.handle({ type: "commit_detected", data: { ...valid, swept: false, message: "KATLAB release v2.0.0.0 \n" } });
  assert.equal(h.lastVersionRef.current.get("Repo_A"), "v2.0.0.0");
  assert.equal(h.notifications.length, 1, "valid suffix can follow ignored frames with the same identity");
});

test("newest-three stack and same-repo replacement retain independent twelve-second nonce dismissal", () => {
  const h = harness(["A", "B", "C", "D"].map((repo) => [repo, "v1.0.0.0"]));
  for (const [index, repo] of ["A", "B", "C", "D"].entries()) h.send(repo, hash(String(index)), "v2.0.0.0");
  assert.deepEqual(h.releases.map((row) => row.repo), ["D", "C", "B"]);
  assert.ok([...h.timers.values()].every((timer) => timer.ms === 12000));
  h.fireTimer(0); // Already evicted A cannot affect another repository.
  assert.deepEqual(h.releases.map((row) => row.repo), ["D", "C", "B"]);
  h.send("B", hash("e"), "v3.0.0.0");
  const replacement = h.releases[0];
  assert.equal(replacement.repo, "B"); assert.equal(replacement.version, "v3.0.0.0");
  assert.deepEqual(h.releases.map((row) => row.repo), ["B", "D", "C"]);
  h.fireTimer(1); assert.equal(h.releases[0], replacement, "older B timeout cannot dismiss its replacement");
  h.fireTimer(4); assert.deepEqual(h.releases.map((row) => row.repo), ["D", "C"]);
  h.fireTimer(2); assert.deepEqual(h.releases.map((row) => row.repo), ["D"]);
  h.fireTimer(3); assert.deepEqual(h.releases, []); assert.equal(h.timers.size, 0);
  assert.equal(h.notifications.length, 5); assert.equal(h.fanfares, 5);
});

test("accepted transitions retain wake, reduced-motion and channel invocation boundaries", () => {
  const h = harness([["Repo_A", "v1.0.0.0"]], { dreaming: true, reduced: true });
  h.send("Repo_A", hash("a"), "v2.0.0.0");
  assert.equal(h.wakes, 1); assert.equal(h.releases[0].animate, false);
  assert.deepEqual(h.announcements, ["Repo_A released v2.0.0.0."]);
  assert.equal(h.notifications.length, 1); assert.equal(h.fanfares, 1);
  h.dreamingRef.current = true; h.reduced = false;
  h.send("Repo_A", hash("a"), "v2.0.0.0");
  assert.equal(h.wakes, 1, "a replay does not wake or rerun channels");
  h.send("Repo_A", hash("b"), "v3.0.0.0");
  assert.equal(h.wakes, 2); assert.equal(h.releases[0].animate, true);
  assert.equal(h.notifications.length, 2); assert.equal(h.fanfares, 2);
});
