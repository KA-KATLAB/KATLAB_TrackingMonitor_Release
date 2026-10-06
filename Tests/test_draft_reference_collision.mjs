import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const requireFrontend = createRequire(resolve(root, "Frontend/package.json"));
const ts = requireFrontend("typescript");
const path = resolve(root, "Frontend/src/draft.ts");
const current = readFileSync(path, "utf8");
const load = async (source) => import(`data:text/javascript;base64,${Buffer.from(
  ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText,
).toString("base64")}`);
// Actual complete module; structural preservation checks run only in their tests.
const draft = await load(current);
const freeze = (value) => {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
const task = (plan, id, title, extra = {}) => ({
  repo: "Repo_A", plan_file: plan, task_id: id, task_ref: `${plan} - ${id}`,
  title, status: "done", files: [], why: title, last_event_ts: null, ...extra,
});
const event = (id, row, extra = {}) => ({
  id, repo_id: row?.repo ?? "Repo_A", ts: "2026-10-06T00:00:00Z", tool: "Edit",
  file: "src/first.ts", task_ref: row?.task_ref ?? null, mode: row ? "B" : "UNKNOWN",
  candidates_json: null, commit_hash: null, swept: 0, session_id: null,
  branch: null, provider: "codex", turn_id: null, agent_id: null,
  tool_use_id: null, operation: "update", plan_file: row?.plan_file ?? null,
  task_id: row?.task_id ?? null, ...extra,
});
// This order is the actual SQL plan_file/task_id order, not insertion order.
const collisionTasks = freeze([
  task("temp/Plan/PLAN_A.txt", "PLAN_B.txt - A.1", "Touched task", { files: ["src/first.ts"] }),
  task("temp/Plan/PLAN_A.txt - PLAN_B.txt", "A.1", "Untouched task", { files: ["src/second.ts"] }),
]);
const collisionEvents = freeze([event(1, collisionTasks[0])]);
const rawRef = collisionTasks[0].task_ref;
const subject = (summary, repo = "Repo_A") => `KATLAB ${repo}: vX.Y.Z.W - ${summary} - vX.Y.Z.W`;

test("OLD semantic: an admitted collision cannot name an untouched task", () => {
  assert.equal(collisionTasks[0].task_ref, collisionTasks[1].task_ref);
  assert.notDeepEqual([collisionTasks[0].plan_file, collisionTasks[0].task_id],
    [collisionTasks[1].plan_file, collisionTasks[1].task_id]);
  assert.equal(draft.buildCommitDraft("Repo_A", collisionEvents, collisionTasks), subject(rawRef),
    "A compatibility display collision must keep the bare reference, not claim another task title");
});

test("OLD semantic: task ordering cannot change a collision subject", () => {
  assert.equal(draft.buildCommitDraft("Repo_A", collisionEvents, collisionTasks),
    draft.buildCommitDraft("Repo_A", collisionEvents, freeze([...collisionTasks].reverse())),
    "Reordering the same current tasks must not change the claimed draft reason");
});

test("two and three duplicate references stay bare through every task permutation", () => {
  const sameTitle = collisionTasks.map((row) => ({ ...row, title: "Same title" }));
  const three = [
    task("temp/Plan/PLAN_A.txt", "PLAN_B.txt - PLAN_C.txt - A.1", "First title"),
    task("temp/Plan/PLAN_A.txt - PLAN_B.txt", "PLAN_C.txt - A.1", "Second title"),
    task("temp/Plan/PLAN_A.txt - PLAN_B.txt - PLAN_C.txt", "A.1", "Third title"),
  ];
  for (const list of [collisionTasks, sameTitle, three]) {
    const events = freeze([event(1, list[0])]);
    for (let shift = 0; shift < list.length; shift += 1) {
      const shifted = [...list.slice(shift), ...list.slice(0, shift)];
      for (const tasks of [freeze(shifted), freeze([...shifted].reverse())]) {
        assert.equal(draft.buildCommitDraft("Repo_A", events, tasks), subject(list[0].task_ref));
      }
    }
  }
});

test("cross-repository duplicates do not poison a unique matching title", () => {
  const mine = freeze(task("temp/Plan/PLAN_U.txt", "A.1", "Unique title"));
  const other = freeze({ ...mine, repo: "Repo_B", title: "Other repo" });
  for (const tasks of [freeze([mine, other, other]), freeze([other, other, mine])]) {
    assert.equal(draft.buildCommitDraft("Repo_A", freeze([event(1, mine)]), tasks), subject("Unique title"));
  }
});

test("raw labels, chronology, null counts and frozen inputs retain exact subjects", () => {
  const distinct = task("temp/Plan/PLAN_R.txt", "PLAN_S.txt - same label", "Unique\nreason");
  const duplicate = [task("temp/Plan/PLAN_R.txt", "PLAN_S.txt - same\nlabel", "Do not choose"),
    task("temp/Plan/PLAN_R.txt - PLAN_S.txt", "same\nlabel", "Do not choose")];
  const stale = task("stale", "stale\r\n\tref", "stale");
  const events = freeze([event(7, distinct), event(6, null), event(5, stale),
    event(4, duplicate[0]), event(3, null), event(2, distinct), event(1, duplicate[0])]);
  const tasks = freeze([...duplicate, distinct]);
  const before = structuredClone({ events, tasks });
  assert.equal(draft.buildCommitDraft("Repo_A", events, tasks),
    subject("temp/Plan/PLAN_R.txt - PLAN_S.txt - same label + Unique reason + stale - stale ref (+2 unattributed)"));
  assert.deepEqual({ events, tasks }, before);
  assert.deepEqual(events.map((row) => row.id), [7, 6, 5, 4, 3, 2, 1]);
});

test("empty pools and references, stale references and placeholder tags stay exact", () => {
  assert.equal(draft.buildCommitDraft("Repo_A", freeze([]), collisionTasks), "");
  assert.equal(draft.buildCommitDraft("Repo_B", collisionEvents, collisionTasks), "");
  assert.equal(draft.buildCommitDraft("EA_Dev", freeze([event(1, null, { repo_id: "EA_Dev" })]), freeze([])),
    subject("(+1 unattributed)", "EA"));
  const empty = freeze(task("p", "A", "", { task_ref: "" }));
  assert.equal(draft.buildCommitDraft("Repo_A", freeze([event(1, empty)]), freeze([empty])),
    "KATLAB Repo_A: vX.Y.Z.W - - vX.Y.Z.W");
  assert.equal(draft.buildCommitDraft("Repo_A", collisionEvents, freeze([])), subject(rawRef));
});

async function withGlobal (name, descriptor, run) {
  const original = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable: true, ...descriptor });
  try { return await run(); }
  finally {
    if (original) Object.defineProperty(globalThis, name, original);
    else delete globalThis[name];
  }
}

test("actual copy invokes one same-stack write with receiver, exact bare fallback and no reads", async () => {
  let settle;
  const pending = new Promise((resolvePromise) => { settle = resolvePromise; });
  const calls = [];
  const clipboard = {
    writeText (text) { calls.push({ receiver: this, text }); return pending; },
    read () { throw new Error("No clipboard read"); },
    readText () { throw new Error("No clipboard readText"); },
  };
  await withGlobal("fetch", { value() { throw new Error("No fetch"); } }, async () => {
    await withGlobal("navigator", { value: { clipboard } }, async () => {
      let fulfilled = false;
      const running = draft.copyCommitDraft("Repo_A", collisionEvents, collisionTasks);
      assert.equal(calls.length, 1, "Native invocation must precede returning to the click caller");
      assert.equal(calls[0].receiver, clipboard);
      assert.equal(calls[0].text, subject(rawRef));
      running.then(() => { fulfilled = true; });
      await Promise.resolve();
      assert.equal(fulfilled, false, "Pending write is not copied yet");
      settle();
      assert.equal(await running, "copied");
      assert.equal(calls.length, 1);
    });
  });
});

test("actual deferred rejection and unavailable capabilities keep truthful copy outcomes", async () => {
  let reject;
  const pending = new Promise((_, rejectPromise) => { reject = rejectPromise; });
  await withGlobal("navigator", { value: { clipboard: { writeText: () => pending } } }, async () => {
    const running = draft.copyCommitDraft("Repo_A", collisionEvents, collisionTasks);
    reject(new Error("Controlled native failure"));
    assert.equal(await running, "failed");
  });
  await withGlobal("navigator", { value: {} }, async () => {
    assert.equal(await draft.copyCommitDraft("Repo_A", collisionEvents, collisionTasks), "unavailable");
  });
  await withGlobal("navigator", { get() { throw new Error("Empty pool must not inspect clipboard"); } }, async () => {
    assert.equal(await draft.copyCommitDraft("Repo_A", freeze([]), collisionTasks), "empty");
  });
});

const ORIGINAL_RAW = "b05fd01fda7ed3a2562ffa9dead77d04fa035cd96793ac6793ad81dcd263c90f";
const ORIGINAL_LF = "d345d721359dd819f1073e99a74dc2adae92c6d1d803e8cff4070eb1e411dc98";
const ORIGINAL_OWNER = "66b34162bf90efb49efb2b45fa021d61b1d8ea977ccf760196fe3f561f962569";
const ORIGINAL_OUTSIDE = "6005583ce1c00277f488dd0bddf8e7edefa3e1ce39e8b8259d3b17186ce76a36";
const COMMENT = "  // A duplicate display reference stays bare; never choose a task title.";
const OLD_MAP = "  const byRef = new Map<string, Task>();";
const NEW_MAP = "  const byRef = new Map<string, Task | null>();";
const OLD_LOOP = "  for (const t of tasks) if (t.repo === repoId) byRef.set(t.task_ref, t);";
const NEW_LOOP = "  for (const t of tasks) if (t.repo === repoId) byRef.set(t.task_ref, byRef.has(t.task_ref) ? null : t);";
const sha = (value) => createHash("sha256").update(value).digest("hex");
const lf = (value) => value.replace(/\r\n/g, "\n");
function parse (text) {
  const source = ts.createSourceFile("draft.ts", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  if (source.parseDiagnostics.length) throw new Error("Invalid actual TypeScript syntax");
  return source;
}
function nodes (source, predicate) {
  const found = [];
  const visit = (node) => { if (predicate(node)) found.push(node); ts.forEachChild(node, visit); };
  visit(source);
  return found;
}
function restore (text) {
  if (text.startsWith("\ufeff")) throw new Error("Unexpected BOM");
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  if (/\r/.test(lf(text)) || (newline === "\r\n" && /\n/.test(text.replace(/\r\n/g, "")))) {
    throw new Error("Expected uniform LF or CRLF");
  }
  const source = parse(text);
  const owners = nodes(source, (node) => ts.isFunctionDeclaration(node) && node.name?.text === "buildCommitDraft");
  const owner = owners[0];
  if (owners.length !== 1 || !source.statements.includes(owner) || !owner.body) {
    throw new Error("Expected one complete top-level draft owner");
  }
  const declarations = nodes(source, (node) => ts.isVariableDeclaration(node)
    && ts.isIdentifier(node.name) && node.name.text === "byRef");
  const statement = owner.body.statements[2];
  if (declarations.length !== 1 || !ts.isVariableStatement(statement)
      || statement.declarationList.flags !== ts.NodeFlags.Const
      || statement.declarationList.declarations.length !== 1
      || statement.declarationList.declarations[0] !== declarations[0]
      || !ts.isNewExpression(declarations[0].initializer)
      || statement.getText(source) !== NEW_MAP.trim()) {
    throw new Error("Expected the sole exact owned const byRef Map type");
  }
  const loop = owner.body.statements[3];
  if (!ts.isForOfStatement(loop) || loop.awaitModifier
      || !ts.isVariableDeclarationList(loop.initializer)
      || loop.initializer.flags !== ts.NodeFlags.Const
      || loop.initializer.declarations.length !== 1
      || loop.initializer.declarations[0].getText(source) !== "t"
      || loop.expression.getText(source) !== "tasks"
      || !ts.isIfStatement(loop.statement) || loop.statement.elseStatement
      || loop.statement.expression.getText(source) !== "t.repo === repoId"
      || !ts.isExpressionStatement(loop.statement.thenStatement)
      || !ts.isCallExpression(loop.statement.thenStatement.expression)
      || loop.getText(source) !== NEW_LOOP.trim()) {
    throw new Error("Expected ordinary const-t loop with the exact direct repo guard and sticky-null set");
  }
  for (const method of ["set", "has"]) {
    const calls = nodes(source, (node) => ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && ts.isIdentifier(node.expression.expression) && node.expression.expression.text === "byRef"
      && node.expression.name.text === method);
    if (calls.length !== 1) throw new Error("Expected sole reviewed Map access");
  }
  const range = (node, expected) => {
    const start = text.lastIndexOf("\n", node.getStart(source) - 1) + 1;
    const end = node.end + newline.length;
    if (text.slice(start, end) !== expected + newline) throw new Error("Expected exact physical owned line");
    return { start, end };
  };
  const map = range(statement, NEW_MAP), iteration = range(loop, NEW_LOOP);
  const commentStart = map.start - COMMENT.length - newline.length;
  if (text.split(COMMENT).length !== 2 || commentStart < 0
      || text.slice(commentStart, map.start) !== COMMENT + newline
      || (commentStart !== 0 && text[commentStart - 1] !== "\n")) {
    throw new Error("Expected the exact sole comment immediately before the owned Map");
  }
  const edits = [
    { ...iteration, value: OLD_LOOP + newline },
    { ...map, value: OLD_MAP + newline },
    { start: commentStart, end: map.start, value: "" },
  ];
  let restored = text;
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    restored = restored.slice(0, edit.start) + edit.value + restored.slice(edit.end);
  }
  return restored;
}

test("strict three-window inverse preserves the complete immutable original and copy wrapper", () => {
  const actual = readFileSync(path);
  assert.equal(actual.subarray(0, 3).equals(Buffer.from([239, 187, 191])), false);
  for (const text of [lf(current), lf(current).replace(/\n/g, "\r\n")]) {
    const original = restore(text);
    assert.equal(sha(lf(original)), ORIGINAL_LF);
    assert.equal(sha(lf(original).replace(/\n/g, "\r\n")), ORIGINAL_RAW);
    const source = parse(lf(original));
    const owner = source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "buildCommitDraft");
    assert.equal(sha(source.text.slice(owner.getStart(source), owner.end)), ORIGINAL_OWNER);
    assert.equal(sha(source.text.slice(0, owner.getStart(source)) + source.text.slice(owner.end)), ORIGINAL_OUTSIDE);
  }
});

test("missing, duplicate, moved or altered owned windows fail closed in LF and CRLF", () => {
  const text = lf(current);
  const variants = [
    text.replace(COMMENT + "\n", ""),
    text.replace(COMMENT, COMMENT + " extra"),
    text.replace(COMMENT + "\n", COMMENT + "\n" + COMMENT + "\n"),
    text.replace(NEW_MAP, OLD_MAP),
    text.replace(NEW_MAP, NEW_MAP.replace("Task | null", "Task | undefined")),
    text.replace(NEW_MAP, NEW_MAP.replace("const byRef", "let byRef")),
    text.replace(NEW_MAP, NEW_MAP + "\n" + NEW_MAP),
    text.replace(NEW_MAP, " " + NEW_MAP),
    text.replace(NEW_LOOP, " " + NEW_LOOP),
    text.replace(NEW_LOOP, NEW_LOOP.replace("const t", "let t")),
    text.replace(NEW_LOOP, NEW_LOOP.replace("of tasks", "of events")),
    text.replace(NEW_LOOP, NEW_LOOP.replace("t.repo === repoId", "t.repo !== repoId")),
    text.replace(NEW_LOOP, NEW_LOOP.replace("t.repo === repoId", "repoId === t.repo")),
    text.replace(NEW_LOOP, NEW_LOOP.replace("byRef.has", "byRef?.has")),
    text.replace(NEW_LOOP, NEW_LOOP.replace("? null : t", "? t : null")),
    text.replace(NEW_LOOP, NEW_LOOP.replace("? null : t", "? null : { ...t }")),
    text.replace(NEW_LOOP, NEW_LOOP + "\n" + NEW_LOOP),
    text.replace(NEW_LOOP, NEW_LOOP + "\n  byRef.set(\"extra\", null);"),
    text.replace(COMMENT + "\n" + NEW_MAP + "\n", "")
      .replace("export function buildCommitDraft", COMMENT + "\n" + NEW_MAP + "\n\nexport function buildCommitDraft"),
    text.replace(NEW_LOOP + "\n", "").replace(COMMENT + "\n", NEW_LOOP + "\n" + COMMENT + "\n"),
    text.replace("export function buildCommitDraft", "export function anotherOwner"),
    text + "\nfunction extraOwner () { const byRef = new Map<string, Task | null>(); }\n",
  ];
  for (const [index, variant] of variants.entries()) {
    assert.notEqual(variant, text);
    for (const candidate of [variant, variant.replace(/\n/g, "\r\n")]) {
      parse(candidate);
      assert.throws(() => restore(candidate), Error, `Owned variant ${index}`);
    }
  }
});

test("unrelated valid changes remain visible to original hashes in LF and CRLF", () => {
  const text = lf(current);
  const variants = [
    text.replace('from "./api"', 'from "./anotherApi"'),
    text.replace('const VER = "vX.Y.Z.W"', 'const VER = "vA.B.C.D"'),
    text.replace("e.repo_id === repoId", "e.repo_id !== repoId"),
    text.replace("a.id - b.id", "b.id - a.id"),
    text.replace("seen.add(ref);", "seen.add(ref + \"changed\");"),
    text.replace("byRef.get(ref)?.title ?? ref", "byRef.get(ref)?.title ?? \"changed\""),
    text.replace("repoId.replace(/_Dev$/, \"\")", "repoId.replace(/_Changed$/, \"\")"),
    text.replace('return "copied";', 'return "failed";'),
    text.replace("await clipboard.writeText(draft);", "await clipboard.writeText(draft + \"changed\");"),
  ];
  for (const [index, variant] of variants.entries()) {
    assert.notEqual(variant, text);
    for (const candidate of [variant, variant.replace(/\n/g, "\r\n")]) {
      parse(candidate);
      assert.notEqual(sha(lf(restore(candidate))), ORIGINAL_LF, `Unrelated variant ${index}`);
    }
  }
});
