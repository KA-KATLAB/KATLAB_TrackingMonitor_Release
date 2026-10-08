import { changesBriefPreservation } from "./helpers/changesTaskReviewBrief.mjs";
import { historyStationPreservation } from "./helpers/historyReviewStation.mjs";
import { purposeNavigationPreservation } from "./helpers/purposeLedNavigation.mjs";
import { mastheadPreservation } from "./helpers/workspaceCommandMasthead.mjs";
import { deskPreservation } from "./helpers/changesReviewLanes.mjs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { restoreGitGraphBoundaryCopy, restoreGitGraphOracleAdapters,
  OLD_GIT_GRAPH_TITLE, NEW_GIT_GRAPH_TITLE, OLD_GIT_GRAPH_CAPTION, NEW_GIT_GRAPH_CAPTION,
  GIT_GRAPH_ORACLE_ADAPTERS } from "./helpers/gitGraphMergeSeed.mjs";
import { restoreChangesWorkbench, restoreChangesWorkbenchOracleAdapters } from "./helpers/changesWorkbench.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const frontend = resolve(root, "Frontend");
const require = createRequire(resolve(frontend, "package.json")), ts = require("typescript");
const read = name => readFileSync(resolve(root, name), "utf8");
const sha = value => createHash("sha256").update(value).digest("hex");
const lf = text => text.replace(/\r\n/g, "\n");
const parse = (text, name = "actual.tsx") => {
  const ast = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true);
  assert.equal(ast.parseDiagnostics.length, 0, "valid complete actual source");
  return ast;
};
const all = node => {
  const found = [node];
  ts.forEachChild(node, child => { found.push(...all(child)); });
  return found;
};
const one = (nodes, predicate, label) => {
  const found = nodes.filter(predicate);
  assert.equal(found.length, 1, label);
  return found[0];
};
const owner = (ast, name) => one(ast.statements, node => ts.isFunctionDeclaration(node)
  ? node.name?.text === name : ts.isVariableStatement(node)
    && node.declarationList.declarations.some(item => ts.isIdentifier(item.name) && item.name.text === name),
name);
const replaceOnce = (text, before, after) => {
  assert.equal(text.split(before).length, 2, "one exact physical source window");
  return text.replace(before, after);
};
const OLD_GUARD = "    if (parents.length >= 2) {";
const NEW_GUARD = "    // Seed the oldest visible commit before decorating later merges.\n"
  + "    if (parents.length >= 2 && i > 0) {";
const ORIGINAL_GRAPH_RAW = "1b68173a0e8848d315f975624aca2a599105971d6a43b1d7832af6f9e7b2aa4b";
const ORIGINAL_GRAPH_LF = "8e645a81efea63c89aadf02e40ac64de9121ad801b41bfefa2166b67b574e96e";
const ORIGINAL_BUILD_RAW = "e5f48b59ed6721a9945aa16f65975020b333466ad7a5f07328ab899f1536edf1";
const ORIGINAL_BUILD_LF = "9964b459a82a09d82891951e6db6595cfc481307cf94cacc8ab8a713385cbb56";
const ORIGINAL_OUTSIDE_LF = "a5e11c2049ca1a32fd0a1121815334c28eabb8f9fa519ec53970b8ce82c4850e";

// This inverse is preservation-only. Semantic tests below compile raw current
// production owners, and the OLD subject compiles its exact original inverse.
function restoreMergeSeed (text) {
  assert.ok(!text.startsWith("\uFEFF"), "no graph source BOM");
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  assert.ok(!text.replace(/\r\n/g, "").includes("\r"), "no bare graph CR");
  if (eol === "\r\n") assert.ok(!text.replace(/\r\n/g, "").includes("\n"), "uniform graph EOL");
  const ast = parse(text, "mermaidGraph.ts"), build = owner(ast, "buildGitGraph");
  const loop = one(all(build), node => ts.isCallExpression(node)
    && ts.isPropertyAccessExpression(node.expression) && node.expression.getText(ast) === "walk.forEach",
  "one actual graph walk");
  assert.equal(loop.arguments.length, 1);
  const callback = loop.arguments[0];
  assert.ok(ts.isArrowFunction(callback) && ts.isBlock(callback.body));
  assert.deepEqual(callback.parameters.map(item => item.getText(ast)), ["c", "i"]);
  const guard = callback.body.statements[2];
  assert.ok(ts.isIfStatement(guard), "original direct guard position");
  assert.equal(guard.expression.getText(ast), "parents.length >= 2 && i > 0");
  const window = NEW_GUARD.replace(/\n/g, eol);
  const at = guard.getStart(ast) - window.indexOf("if (");
  assert.equal(text.slice(at, at + window.length), window, "complete physical seed window");
  assert.equal(text.slice(callback.body.statements[1].end, at), eol, "exact parents-to-guard adjacency");
  assert.equal(text.slice(at - eol.length, at), eol, "physical guard line start");
  assert.equal(lf(text).split(NEW_GUARD).length - 1, 1, "unique reviewed guard window");
  const restored = text.slice(0, at) + OLD_GUARD + text.slice(at + window.length);
  const oldAst = parse(restored, "mermaidGraph.ts"), oldBuild = owner(oldAst, "buildGitGraph");
  assert.equal(restored.slice(0, oldBuild.getStart(oldAst)), text.slice(0, build.getStart(ast)));
  assert.equal(restored.slice(oldBuild.end), text.slice(build.end), "outside-builder bytes pass through");
  return restored;
}

function compileBuilder (text) {
  const ast = parse(text, "mermaidGraph.ts");
  const actual = ["safe", "GIT_CAP", "buildGitGraph"].map(name => owner(ast, name).getText(ast)).join("\n");
  const emitted = ts.transpileModule(actual, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
  } }).outputText;
  const exports = {};
  new Function("exports", emitted)(exports);
  assert.equal(typeof exports.buildGitGraph, "function");
  return exports.buildGitGraph;
}

const graphSource = read("Frontend/src/mermaidGraph.ts");
const currentBuilder = compileBuilder(graphSource), oldBuilder = compileBuilder(restoreMergeSeed(graphSource));
const mermaidEntry = require.resolve("mermaid"), mermaidRoot = resolve(dirname(mermaidEntry), "..");
assert.equal(JSON.parse(readFileSync(resolve(mermaidRoot, "package.json"), "utf8")).version, "11.17.2");
const core = readFileSync(mermaidEntry, "utf8");
const graphImports = [...core.matchAll(/import\("(\.\/chunks\/mermaid\.core\/gitGraphDiagram-[^"]+\.mjs)"\)/g)];
assert.equal(graphImports.length, 1, "the actual public core selects one installed Git graph implementation");
const installedPath = resolve(dirname(mermaidEntry), graphImports[0][1]);
const installed = readFileSync(installedPath, "utf8");
assert.equal(sha(installed), "6b30b332a48b8c79fa936d60e3335ba5f481b3e6dda74f78bb6f4d9db6c69ad1");
const installedAst = parse(installed, "installed.mjs");
const stateImport = one(installedAst.statements, node => ts.isImportDeclaration(node)
  && node.importClause?.namedBindings?.elements?.some(item => item.name.text === "ImperativeState"),
"actual installed state dependency");
const stateSource = readFileSync(resolve(dirname(installedPath), stateImport.moduleSpecifier.text), "utf8");
assert.equal(sha(stateSource), "c2447ceacdaca8f5e9465d685f94c6d7faa17607e1003e9acdae4bd6039a63e5");
const closure = [owner(parse(stateSource, "state.mjs"), "ImperativeState").getText(),
  ...["commitType", "state", "commit", "branch", "merge", "checkout", "parseStatement", "parseCommit",
    "parseBranch", "parseMerge", "parseCheckout"].map(name => owner(installedAst, name).getText(installedAst))].join("\n");
assert.equal(sha(closure), "d1f8313b1915c2b20939de89cc01aad4364a6b4a6508478ec7c35ab527434984");
const semanticFactory = new Function("__name", "getConfig3", "common_default", "log", "getID", closure
  + "\nreturn {state,dispatch:statement=>parseStatement(statement,{commit,branch,merge,checkout})};");
const parserRoot = resolve(frontend, "node_modules/@mermaid-js/parser");
const parserManifest = JSON.parse(readFileSync(resolve(parserRoot, "package.json"), "utf8"));
const { parse: parseGrammar } = await import(pathToFileURL(resolve(parserRoot, parserManifest.exports["."].import)).href);

// Verbatim installed semantic owners with finite ASCII dependency fixtures.
// This local closure is not Mermaid sanitization, DOM/SVG or native acceptance;
// no installed module, browser facade or global sanitizer is changed.
function semantics (main) {
  const config = Object.freeze({ mainBranchName: main, mainBranchOrder: 0 });
  return semanticFactory(value => value, () => config, { sanitizeText(value, actualConfig) {
    assert.equal(typeof value, "string", "finite string-only semantic fixture");
    assert.ok(actualConfig === config, "only the local fixture configuration");
    assert.match(value, /^[A-Za-z0-9_*' -]*$/, "finite ASCII labels only, not a sanitizer oracle");
    return value;
  } }, { info() {}, debug() {}, warn() {}, error() { assert.fail("unexpected semantic dispatch"); } },
  () => assert.fail("all fixture commits and merges require explicit IDs"));
}

const hash = value => value.toString(16).padStart(7, "0") + "a".repeat(33);
const short = value => hash(value).slice(0, 7);
const entry = (value, parents = "", eventCount = 0) => ({ commit: {
  hash: hash(value), message: `Commit ${value}`, ts: `2026-10-06T00:00:${String(value).padStart(2, "0")}Z`,
  parents, files_json: "[]",
}, events: Array.from({ length: eventCount }, (_, index) => ({ id: index + 1 })) });
const freeze = value => {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
async function inspect (builder, entries, branch = "main") {
  const before = JSON.stringify(entries), result = builder(entries, branch);
  assert.equal(JSON.stringify(entries), before, "frozen actual input stays unchanged");
  if (!entries.length) { assert.deepEqual(result, { def: null, shown: 0, total: 0, rows: [] }); return { result }; }
  const [header, ...body] = result.def.split("\n"), match = /^%%\{init: (.*)\}%%$/.exec(header);
  assert.ok(match, "actual complete init directive");
  assert.doesNotMatch(match[1], /'/, "apostrophes remain JSON unicode escapes");
  const { gitGraph: { mainBranchName: main } } = JSON.parse(match[1]);
  const ast = await parseGrammar("gitGraph", body.join("\n")), subject = semantics(main);
  for (const statement of ast.statements) {
    assert.ok(["Commit", "Branch", "Checkout", "Merge"].includes(statement.$type), "finite actual grammar subset");
    subject.dispatch(statement);
  }
  assert.equal(subject.state.records.currBranch, main);
  assert.equal(result.total, entries.length); assert.equal(result.shown, Math.min(20, entries.length));
  assert.deepEqual(result.rows, entries.slice(0, 20).map(({ commit, events }) => ({
    hash: commit.hash, message: commit.message, timestamp: commit.ts,
    parents: (commit.parents ?? "").trim().split(/\s+/).filter(Boolean), eventCount: events.length,
  })), "full parent rows and metadata stay exact");
  return { result, ast, records: subject.state.records, main };
}

const pair = `${hash(1)} ${hash(2)}`;
const boundaries = [
  ["single merge", [entry(3, pair, 2)]],
  ["oldest visible merge", [entry(4, hash(3), 1), entry(3, pair, 2)]],
  ["twenty-of-twenty-five merge boundary", Array.from({ length: 25 }, (_, index) => {
    const value = 25 - index; return entry(value, value === 6 ? pair : value === 1 ? "" : hash(value - 1), index % 3);
  })],
  ["oldest octopus merge", [entry(4, hash(3)), entry(3, `${pair} ${hash(9)}`, 3)]],
];
for (const [name, values] of boundaries) test(`actual installed empty-main RED and current seed GREEN: ${name}`, async () => {
  const entries = freeze(values), visible = entries.slice(0, 20), oldest = visible.at(-1).commit.hash.slice(0, 7);
  await assert.rejects(inspect(oldBuilder, entries), error => error.message
    === 'Incorrect usage of "merge". Current branch (main)has no commits');
  const { result, records } = await inspect(currentBuilder, entries);
  const seed = records.commits.get(oldest);
  assert.ok(seed); assert.equal(seed.type, 0); assert.deepEqual(seed.parents, []);
  assert.equal(seed.branch, "main"); assert.equal(seed.seq, 0);
  assert.equal(records.commits.size, visible.length, "no synthetic ancestor or omitted-oldest side node");
  assert.deepEqual([...records.commits.keys()], [...visible].reverse().map(row => row.commit.hash.slice(0, 7)));
  assert.deepEqual([...records.commits.values()].filter(row => row.tags.includes("HEAD")).map(row => row.id),
    [entries[0].commit.hash.slice(0, 7)], "HEAD stays on newest own commit");
  assert.equal(result.rows.at(-1).hash, visible.at(-1).commit.hash);
  assert.ok(result.rows.at(-1).parents.length >= 2, "semantic seed is still a real merge in exact data");
});

test("empty/plain and ordinary-oldest controls retain byte-identical definitions and complete metadata", async () => {
  const controls = [[], [entry(1, null)], [entry(2, `  ${hash(1)}  `), entry(1, "  ")],
    [entry(3, pair, 1), entry(1)],
    [entry(6, `${hash(5)} ${hash(2)} ${hash(9)}`), entry(5, `${hash(4)} ${hash(2)}`),
      entry(4, `${hash(1)} ${hash(2)}`), entry(2, hash(1)), entry(1)]];
  for (const values of controls) for (const branch of ["main", "feature/plain", "123abcd", "team/o'brien", ""]) {
    const entries = freeze(values), old = await inspect(oldBuilder, entries, branch), current = await inspect(currentBuilder, entries, branch);
    assert.deepEqual(current.result, old.result, "ordinary-oldest output is unchanged");
    if (entries.length) assert.deepEqual([...current.records.commits], [...old.records.commits]);
  }
});

test("omitted oldest tip never consumes a suffix; later two/octopus merges and own HEAD remain decorated", async () => {
  const entries = freeze([entry(6, `${hash(5)} ${hash(2)} ${hash(9)}`, 3),
    entry(5, `${hash(4)} ${hash(2)}`, 2), entry(4, `${hash(3)} ${hash(2)}`, 1), entry(3, pair)]);
  for (const [branch, main] of [["main", "main"], ["123abcd", "123abcd"], ["team/o'brien", "team_o'brien"]]) {
    const { ast, records, result, main: actualMain } = await inspect(currentBuilder, entries, branch);
    assert.equal(actualMain, main);
    assert.deepEqual(ast.statements.filter(node => node.$type === "Commit").map(node => node.id),
      [short(3), `${short(2)}*`, `${short(2)}*2`, `${short(2)}*3`]);
    assert.deepEqual(ast.statements.filter(node => node.$type === "Merge").map(node => node.id), [4, 5, 6].map(short));
    assert.deepEqual(records.commits.get(short(4)).parents, [short(3), `${short(2)}*`]);
    assert.deepEqual(records.commits.get(short(5)).parents, [short(4), `${short(2)}*2`]);
    assert.deepEqual(records.commits.get(short(6)).parents, [short(5), `${short(2)}*3`]);
    assert.deepEqual([...records.commits.values()].filter(row => row.tags.includes("HEAD")).map(row => row.id), [short(6)]);
    assert.equal(records.head.id, short(6)); assert.equal(records.head.type, 3);
    assert.deepEqual(result.rows[0].parents, [hash(5), hash(2), hash(9)]);
    assert.ok(!result.def.includes(short(9)), "third parent remains list-only");
  }
  const laterOrdinary = await inspect(currentBuilder, freeze([entry(7, hash(6)), ...entries]));
  assert.deepEqual(laterOrdinary.records.commits.get(short(7)).tags, ["HEAD"]);
  assert.deepEqual(laterOrdinary.records.commits.get(short(6)).tags, []);
});

test("existing later branch-name collision remains observable, not silently sanitized or repaired", async () => {
  const entries = freeze([entry(3, pair), entry(1)]), branch = `b_${short(3)}`;
  for (const build of [oldBuilder, currentBuilder]) await assert.rejects(inspect(build, entries, branch),
    /Trying to create an existing branch/);
  const isolated = semantics("main");
  assert.throws(() => isolated.dispatch({ $type: "Commit", id: "<not finite>", tags: [] }), /finite ASCII/);
  assert.throws(() => semantics("main").dispatch({ $type: "Commit", id: "", tags: [] }), /explicit IDs/);
});

test("exact two-line inverse retains whole HEAD35 graph, complete builder and all outside bytes in LF/CRLF", () => {
  for (const eol of ["\n", "\r\n"]) {
    const restored = restoreMergeSeed(lf(graphSource).replace(/\n/g, eol)), ast = parse(restored, "mermaidGraph.ts");
    const build = owner(ast, "buildGitGraph");
    assert.equal(sha(lf(restored)), ORIGINAL_GRAPH_LF);
    assert.equal(sha(lf(build.getText(ast))), ORIGINAL_BUILD_LF);
    assert.equal(sha(lf(restored.slice(0, build.getStart(ast)) + restored.slice(build.end))), ORIGINAL_OUTSIDE_LF);
    if (eol === "\r\n") { assert.equal(sha(restored), ORIGINAL_GRAPH_RAW); assert.equal(sha(build.getText(ast)), ORIGINAL_BUILD_RAW); }
  }
});

test("seed inverse rejects missing/duplicate/wrong-owner/site/partial guards and retains unrelated edits", () => {
  const source = lf(graphSource), ast = parse(source, "mermaidGraph.ts"), build = owner(ast, "buildGitGraph");
  const variants = [
    replaceOnce(source, NEW_GUARD, OLD_GUARD),
    replaceOnce(source, NEW_GUARD, NEW_GUARD.replace("i > 0", "i >= 0")),
    replaceOnce(source, NEW_GUARD, NEW_GUARD.replace("parents.length >= 2", "parents.length > 2")),
    replaceOnce(source, NEW_GUARD, NEW_GUARD.replace("    //", "   //")),
    replaceOnce(source, NEW_GUARD, NEW_GUARD.replace("    if", "   if")),
    replaceOnce(source, NEW_GUARD, NEW_GUARD.replace("// Seed", "// Changed seed")),
    replaceOnce(source, "function buildGitGraph (", "function WrongBuildGitGraph ("),
    source + "\n" + build.getText(ast) + "\n",
    replaceOnce(source, NEW_GUARD, OLD_GUARD) + "\nfunction WrongSite(parents,i) {\n" + NEW_GUARD + "\n} }\n",
    replaceOnce(source, NEW_GUARD, NEW_GUARD.replace("    if", "    // Seed the oldest visible commit before decorating later merges.\n    if")),
  ];
  for (const value of variants) {
    parse(value, "mermaidGraph.ts");
    for (const eol of ["\n", "\r\n"]) assert.throws(() => restoreMergeSeed(value.replace(/\n/g, eol)), assert.AssertionError);
  }
  for (const [before, after] of [["const NODE_CAP = 12;", "const NODE_CAP = 13;"],
    ["const sideSeen = new Map<string, number>();", "const sideSeen = new Map<string, number>([]);"],
    ['return { svg: "", meta };', 'return { svg: "", meta: meta };']]) {
    const modified = before === 'return { svg: "", meta };'
      ? source.replace(before, after) : replaceOnce(source, before, after);
    const restored = restoreMergeSeed(modified);
    assert.ok(restored.includes(after)); assert.notEqual(sha(lf(restored)), ORIGINAL_GRAPH_LF);
  }
});

const ORIGINAL_APP_RAW = "980c2bd84687bc64cc19a50ac2034e3b758795a82d3786fb625e90d50116154d";
const ORIGINAL_APP_LF = "c75c8b8721ccd36259c6acf243717db91aad793f271d94ac954a4fc6f724a370";
const appSource = restoreChangesWorkbench(deskPreservation("Frontend/src/App.tsx", mastheadPreservation("Frontend/src/App.tsx", purposeNavigationPreservation("Frontend/src/App.tsx", historyStationPreservation("Frontend/src/App.tsx", changesBriefPreservation("Frontend/src/App.tsx", read("Frontend/src/App.tsx")))))));
const oldSuites = {
  "test_history_graph_read_states.mjs": "71315482955f5f32e22e7c72905b7652d6c576b3e039afaf29693ce3aa1f937b",
  "test_warning_timestamp_order.mjs": "6d0e94cda677e13d1df7fb9be9bfe419ce8ea6d92fda5347c855b8b33a7fc5fc",
  "test_diff_availability.mjs": "a0b3804c36b6e51a27d5fc7913e54ef10bada4b9b1303cc0ff5fc04b0684992a",
};
test("two physical History copy inverses preserve complete HEAD35 App and non-owner bytes in LF/CRLF", () => {
  for (const eol of ["\n", "\r\n"]) {
    const current = lf(appSource).replace(/\n/g, eol), restored = restoreGitGraphBoundaryCopy(current);
    assert.equal(sha(lf(restored)), ORIGINAL_APP_LF);
    if (eol === "\r\n") assert.equal(sha(restored), ORIGINAL_APP_RAW);
    const ast = parse(current), previous = parse(restored), currentOwner = owner(ast, "HistoryView"), oldOwner = owner(previous, "HistoryView");
    assert.equal(restored.slice(0, oldOwner.getStart(previous)), current.slice(0, currentOwner.getStart(ast)));
    assert.equal(restored.slice(oldOwner.end), current.slice(currentOwner.end));
  }
});

test("History copy inverse rejects physical/structural partial changes without hiding unrelated source edits", () => {
  const source = lf(appSource), ast = parse(source), history = owner(ast, "HistoryView");
  const title = `title="${NEW_GIT_GRAPH_TITLE}"`;
  const variants = [replaceOnce(source, NEW_GIT_GRAPH_TITLE, OLD_GIT_GRAPH_TITLE),
    replaceOnce(source, NEW_GIT_GRAPH_CAPTION, OLD_GIT_GRAPH_CAPTION),
    replaceOnce(source, title, title + " " + title),
    replaceOnce(source, title, `data-title="${NEW_GIT_GRAPH_TITLE}"`),
    replaceOnce(source, NEW_GIT_GRAPH_TITLE, NEW_GIT_GRAPH_TITLE + " "),
    replaceOnce(source, NEW_GIT_GRAPH_CAPTION, NEW_GIT_GRAPH_CAPTION + " changed"),
    replaceOnce(source, `          aria-pressed={showGraph} title="${NEW_GIT_GRAPH_TITLE}"`,
      `         aria-pressed={showGraph} title="${NEW_GIT_GRAPH_TITLE}"`),
    replaceOnce(source, "{graphSvg && !!repoId && loadedRepoRef.current === repoId && (",
      "{graphSvg && !!repoId && loadedRepoRef.current !== repoId && ("),
    replaceOnce(source, "function HistoryView (", "function WrongHistoryView ("),
    source + "\n" + history.getText(ast) + "\n"];
  for (const value of variants) {
    parse(value);
    for (const eol of ["\n", "\r\n"]) assert.throws(() => restoreGitGraphBoundaryCopy(value.replace(/\n/g, eol)), assert.AssertionError);
  }
  for (const [before, after] of [["Explore commit history and its linked captured events.", "Independent History sentinel."],
    ["function WarningsBanner (", "function IndependentWarningsBanner ("]]) {
    for (const eol of ["\n", "\r\n"]) {
      const modified = replaceOnce(source, before, after).replace(/\n/g, eol);
      const restored = restoreGitGraphBoundaryCopy(modified);
      assert.ok(restored.includes(after)); assert.notEqual(sha(lf(restored)), ORIGINAL_APP_LF);
    }
  }
});

test("exact adapters retain all three whole HEAD35 suites, old GitGraph/helpers and original Diff prefix", () => {
  for (const [name, expected] of Object.entries(oldSuites)) for (const eol of ["\n", "\r\n"]) {
    const text = lf(restoreChangesWorkbenchOracleAdapters(name, deskPreservation(`Tests/${name}`, mastheadPreservation(`Tests/${name}`, purposeNavigationPreservation(`Tests/${name}`, historyStationPreservation(`Tests/${name}`, changesBriefPreservation(`Tests/${name}`, read(`Tests/${name}`)))))))).replace(/\n/g, eol);
    assert.equal(sha(lf(restoreGitGraphOracleAdapters(name, text))), expected);
  }
  assert.equal(sha(readFileSync(resolve(root, "Tests/test_git_graph.mjs"))),
    "f2b00e4dc1b85f8d382f451e04e34feaa2f54a336aec3c679a87d5f889f8f7ed");
  const prefix = Buffer.from(lf(deskPreservation("Tests/test_diff_availability.mjs", mastheadPreservation("Tests/test_diff_availability.mjs", purposeNavigationPreservation("Tests/test_diff_availability.mjs", historyStationPreservation("Tests/test_diff_availability.mjs", changesBriefPreservation("Tests/test_diff_availability.mjs", read("Tests/test_diff_availability.mjs")))))))).subarray(0, 15449);
  assert.equal(sha(prefix), "83d4e95e949a912fdf73b708526f514ed5a73e7afcdd91b79fc4da6639a28bd5");
  assert.equal(prefix.toString("utf8").split("\n").length - 1, 311);
  for (const [name, expected] of [["warningTimestampOrder.mjs", "e7f462d41553c8475f294917d1746c58073294502ad71c3735a09446311a2606"],
    ["diffDisclosureState.mjs", "67846752be408a6cbe78eacda2ef9e09a762e164fb9164353a0b4dbc4c1958c7"],
    ["printed_source.mjs", "8061b014a52af239d9b37345941f68b0b41c1cb7e0b5d402353bf0dcfa84217d"]]) {
    assert.equal(sha(readFileSync(resolve(root, "Tests/helpers", name))), expected);
  }
});

test("adapter inverses reject missing/duplicate/wrong windows and retain unrelated original assertions", () => {
  for (const [name, expected] of Object.entries(oldSuites)) {
    const source = lf(restoreChangesWorkbenchOracleAdapters(name, deskPreservation(`Tests/${name}`, mastheadPreservation(`Tests/${name}`, purposeNavigationPreservation(`Tests/${name}`, historyStationPreservation(`Tests/${name}`, changesBriefPreservation(`Tests/${name}`, read(`Tests/${name}`))))))));
    for (const { before, after } of GIT_GRAPH_ORACLE_ADAPTERS[name]) {
      assert.ok(!after.includes("*/"), "bounded duplicate contextual window is valid comment text");
      const variants = [replaceOnce(source, after, before), source + "\n/*\n" + after + "\n*/\n",
        replaceOnce(source, after, after.replace(/restoreGitGraph(?:BoundaryCopy|OracleAdapters)/g, "wrongRestore"))];
      for (const modified of variants) {
        parse(modified, "negative.mjs");
        for (const eol of ["\n", "\r\n"]) assert.throws(() => restoreGitGraphOracleAdapters(name, modified.replace(/\n/g, eol)), assert.AssertionError);
      }
    }
    const sentinel = source + '\nassert.equal("unrelated original assertion", "changed");\n';
    const restored = restoreGitGraphOracleAdapters(name, sentinel);
    assert.ok(restored.includes('assert.equal("unrelated original assertion", "changed");'));
    assert.notEqual(sha(lf(restored)), expected);
  }
});
