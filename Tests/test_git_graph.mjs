import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const frontendRoot = resolve(root, "Frontend");
const frontendRequire = createRequire(resolve(frontendRoot, "package.json"));
const hash = (value) => value.toString(16).padStart(7, "0") + "a".repeat(33);
const short = (value) => hash(value).slice(0, 7);
const entry = (value, parents = null, eventCount = 0) => ({
  commit: {
    hash: hash(value), message: `Commit ${value}`, ts: `2026-10-01T00:00:${String(value).padStart(2, "0")}Z`,
    files_json: "[]", parents,
  },
  events: Array.from({ length: eventCount }, (_, index) => ({ id: index + 1 })),
});

function freezeDeep (value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
}

async function importParser () {
  // This package exports ESM only. Resolve its public import entry, not a hashed chunk.
  const packageRoot = resolve(frontendRoot, "node_modules/@mermaid-js/parser");
  const manifest = JSON.parse(readFileSync(resolve(packageRoot, "package.json"), "utf8"));
  return import(pathToFileURL(resolve(packageRoot, manifest.exports["."].import)).href);
}

test("actual Git graph preserves branch configuration and bounded history grammar", {
  timeout: 30_000,
}, async (t) => {
  const { createServer } = await import(pathToFileURL(frontendRequire.resolve("vite")).href);
  const vite = await createServer({
    root: frontendRoot, server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom", optimizeDeps: { noDiscovery: true, entries: [] },
  });
  try {
    const { buildGitGraph } = await vite.ssrLoadModule("/src/mermaidGraph.ts");
    const { default: mermaid } = await import(pathToFileURL(frontendRequire.resolve("mermaid")).href);
    const { parse } = await importParser();

    async function inspect (result, expectedMain) {
      assert.equal(typeof result.def, "string");
      const [header, ...bodyLines] = result.def.split("\n");
      const match = /^%%\{init: (.*)\}%%$/.exec(header);
      assert.ok(match, "the actual first line is an init directive");
      const payload = match[1];
      assert.deepEqual(JSON.parse(payload), { gitGraph: { mainBranchName: expectedMain } });
      assert.doesNotMatch(payload, /'/, "Mermaid normalizes every literal apostrophe before JSON.parse");
      assert.equal((payload.match(/\\u0027/g) ?? []).length, (expectedMain.match(/'/g) ?? []).length);

      // Config parsing needs no DOM with an empty body. This is not a native SVG render.
      mermaid.initialize({ startOnLoad: false, securityLevel: "strict", logLevel: "fatal" });
      assert.notEqual(await mermaid.parse(`${header}\ngitGraph`), false);
      const config = mermaid.mermaidAPI.getConfig();
      assert.equal(config.gitGraph.mainBranchName, expectedMain);
      assert.equal(config.securityLevel, "strict");
      assert.equal(bodyLines[0], "gitGraph");
      // Parse the complete real body independently; do not bypass DOM-backed sanitization.
      const ast = await parse("gitGraph", bodyLines.join("\n"));
      return { ast, header, payload, main: config.gitGraph.mainBranchName };
    }

    await t.test("public config and checkout agree for ordinary and quoted branch labels", async () => {
      const fixtures = [
        ["main", "main"],
        ["feature/plain", "feature_plain"],
        ["123abcd", "123abcd"],
        ["研究/nhánh", "研究_nhánh"],
        ["feature/o'brien", "feature_o'brien"],
        ["'team'/o''brien'", "'team'_o''brien'"],
        ["", "main"],
        ["  /\\()<>\"{}|  ", "main"],
        ["  feature/one (two) <three> {four}|five\\six\"seven  ", "feature_one_two_three_four_five_six_seven"],
        ["release/plain-again", "release_plain-again"],
      ];
      for (const [branch, expectedMain] of fixtures) {
        for (const merge of [false, true]) {
          const rows = freezeDeep([entry(3, merge ? `${hash(1)} ${hash(2)}` : hash(1)), entry(1, "")]);
          const before = structuredClone(rows);
          const result = buildGitGraph(rows, branch);
          const { ast, main } = await inspect(result, expectedMain);
          assert.deepEqual(ast.statements.filter((node) => node.$type === "Checkout").map((node) => node.branch),
            merge ? [`b_${short(3)}`, main] : []);
          assert.deepEqual(ast.statements.filter((node) => node.$type === "Branch").map((node) => node.name),
            merge ? [`b_${short(3)}`] : []);
          assert.deepEqual(ast.statements.filter((node) => node.tags?.includes("HEAD")).map((node) => node.id), [short(3)]);
          assert.deepEqual(rows, before, "frozen source rows are not changed");
          assert.equal(result.shown, 2);
          assert.equal(result.total, 2);
        }
      }
    });

    await t.test("empty input remains an empty graph without a directive", () => {
      for (const branch of ["", "main", "feature/o'brien"]) {
        assert.deepEqual(buildGitGraph(Object.freeze([]), branch), {
          def: null, shown: 0, total: 0, rows: [],
        });
      }
    });

    await t.test("the cap preserves newest rows and reverses only the graph walk", async () => {
      const rows = freezeDeep(Array.from({ length: 25 }, (_, index) => {
        const value = 25 - index;
        return entry(value, value > 1 ? hash(value - 1) : null, index % 3);
      }));
      const before = structuredClone(rows);
      const result = buildGitGraph(rows, "feature/o'brien");
      const { ast } = await inspect(result, "feature_o'brien");
      assert.equal(result.total, 25);
      assert.equal(result.shown, 20);
      assert.deepEqual(result.rows, rows.slice(0, 20).map(({ commit, events }) => ({
        hash: commit.hash, message: commit.message, timestamp: commit.ts,
        parents: [commit.parents], eventCount: events.length,
      })));
      const commits = ast.statements.filter((node) => node.$type === "Commit");
      assert.equal(ast.statements.length, 20);
      assert.deepEqual(commits.map((node) => node.id), rows.slice(0, 20).reverse().map(({ commit }) => commit.hash.slice(0, 7)));
      assert.deepEqual(commits.filter((node) => node.tags.includes("HEAD")).map((node) => node.id), [short(25)]);
      assert.equal(commits.at(-1).id, short(25));
      assert.deepEqual(rows, before);
      assert.notEqual(result.rows, rows);
    });

    await t.test("merge decoration retains repeated tips, merge IDs, octopus rows and HEAD", async () => {
      const rows = freezeDeep([
        entry(6, `${hash(5)} ${hash(2)} ${hash(9)}`, 3),
        entry(5, `${hash(4)} ${hash(2)}`, 2),
        entry(4, `${hash(1)} ${hash(2)}`, 1),
        entry(2, hash(1)), entry(1, ""),
      ]);
      const before = structuredClone(rows);
      const result = buildGitGraph(rows, "team/o'brien");
      const { ast, main } = await inspect(result, "team_o'brien");
      const branches = [4, 5, 6].map((value) => `b_${short(value)}`);
      assert.deepEqual(ast.statements.filter((node) => node.$type === "Branch").map((node) => node.name), branches);
      assert.deepEqual(ast.statements.filter((node) => node.$type === "Checkout").map((node) => node.branch),
        branches.flatMap((branch) => [branch, main]));
      assert.deepEqual(ast.statements.filter((node) => node.$type === "Commit").map((node) => node.id),
        [short(1), short(2), `${short(2)}*`, `${short(2)}*2`, `${short(2)}*3`]);
      const merges = ast.statements.filter((node) => node.$type === "Merge");
      assert.deepEqual(merges.map((node) => ({ branch: node.branch, id: node.id, tags: node.tags })),
        [4, 5, 6].map((value) => ({ branch: `b_${short(value)}`, id: short(value), tags: value === 6 ? ["HEAD"] : [] })));
      assert.deepEqual(result.rows[0].parents, [hash(5), hash(2), hash(9)]);
      assert.deepEqual(result.rows.map((row) => row.eventCount), [3, 2, 1, 0, 0]);
      assert.ok(!result.def.includes(short(9)), "the third parent remains list-only");
      assert.deepEqual(rows, before);
    });

    await t.test("null, empty and spaced parent fields keep the plain chain and exact row values", async () => {
      const rows = freezeDeep([entry(4, `  ${hash(3)}  `), entry(3, "  "), entry(2, ""), entry(1, null)]);
      const result = buildGitGraph(rows, "123abcd");
      const { ast } = await inspect(result, "123abcd");
      assert.deepEqual(ast.statements.map((node) => node.$type), ["Commit", "Commit", "Commit", "Commit"]);
      assert.deepEqual(ast.statements.map((node) => node.id), [1, 2, 3, 4].map(short));
      assert.deepEqual(result.rows.map((row) => row.parents), [[hash(3)], [], [], []]);
      assert.deepEqual(result.rows.map((row) => row.hash), [4, 3, 2, 1].map(hash));
    });
  } finally {
    await vite.close();
  }
});
