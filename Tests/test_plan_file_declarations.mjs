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
const ts = require("typescript"), React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const read = (name) => readFileSync(resolve(root, "Frontend/src", name), "utf8");
const parse = (name, text = read(name)) => ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true);
const boardText = read("planBoard.tsx"), ast = parse("planBoard.tsx", boardText), ui = parse("ui.tsx");
const declaration = (tree, name) => {
  const matches = tree.statements.filter((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.equal(matches.length, 1, `one actual ${name}`); return matches[0];
};
const text = (node, tree) => node.getText(tree).replace(/^export\s+/, "");
const code = ts.transpileModule(`export function createSubject(env) {
  const { React, Surface, SectionHeading, DisclosureTable, CollectionPager, useBoundedPage } = env;
  ${ast.statements.filter((node) => !ts.isImportDeclaration(node)).map((node) => text(node, ast)).join("\n")}
  ${text(declaration(ui, "getBoundedPageWindow"), ui)}
  return { PlanBoard, groupActivePlans, getBoundedPageWindow };
}`, { compilerOptions: { target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React } }).outputText;
const { createSubject } = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);

const task = (files, extra = {}) => ({ repo: "Repo_A", plan_file: "temp/Plan/one.txt",
  task_ref: "temp/Plan/one.txt - A.1", task_id: "A.1", title: "Fixture work",
  status: "in-progress", files, why: "Declared scope", last_event_ts: null, ...extra });
const boundary = () => null;
function harness (tasks, requestedPage = 1) {
  const opened = [], configs = [], changes = [];
  const env = { React, Surface: boundary, SectionHeading: () => null,
    DisclosureTable: () => null, CollectionPager: () => null,
    useBoundedPage(options) {
      configs.push(options);
      const page = subject.getBoundedPageWindow(options.totalItems,
        options.identity[0] === "active-plan-declared-files" ? requestedPage : 1, options.pageSize);
      return { ...page, setPage: (next) => changes.push(next) };
    },
  };
  const subject = createSubject(env);
  const rootNode = subject.PlanBoard({ tasks, onOpenFileStory: (...args) => opened.push(args) });
  const nodes = (node) => {
    if (Array.isArray(node)) return node.flatMap(nodes);
    if (!React.isValidElement(node)) return [];
    // Resolve real local helpers, not framework owners or copied UI algorithms.
    if (typeof node.type === "function" && !Object.values(env).includes(node.type)) {
      return [node, ...nodes(node.type(node.props))];
    }
    return [node, ...nodes(node.props.children)];
  };
  const all = nodes(rootNode);
  const table = all.find((node) => node.type === env.DisclosureTable);
  const preview = all.filter((node) => node.type === "button");
  const column = table?.props.columns.find((entry) => entry.key === "files");
  return { subject, opened, configs, changes, rootNode, all, table, preview, nodes,
    column(row) { assert.ok(column); return nodes(column.render(row)); },
    html(row) { assert.ok(column); return renderToStaticMarkup(React.createElement("div", null, column.render(row))); } };
}
const buttons = (nodes) => nodes.filter((node) => node.type === "button");
const plainText = (node) => {
  if (Array.isArray(node)) return node.map(plainText).join("");
  if (React.isValidElement(node)) return plainText(node.props.children);
  return node === null || node === undefined || typeof node === "boolean" ? "" : String(node);
};
const patterns = ["Backend/app/*.py", "Libraries/**/katlab_?.mqh", "src/literal.ts"];

test("actual preview sends only concrete file paths to File Story", () => {
  const h = harness([task(patterns)]);
  for (const button of h.preview) button.props.onClick();
  assert.deepEqual(h.opened, [["Repo_A", "src/literal.ts"]]);
  assert.equal(h.preview.length, 1);
});

test("actual exact-data column sends only concrete file paths to File Story", () => {
  const row = task(patterns), h = harness([row]);
  for (const button of buttons(h.column(row))) button.props.onClick();
  assert.deepEqual(h.opened, [["Repo_A", "src/literal.ts"]]);
});

const patternNodes = (nodes) => nodes.filter((node) => node.type === "span"
  && node.props.className?.includes("font-mono text-xs text-ui-muted"));
const declarationNodes = (nodes) => nodes.filter((node) => typeof node.type === "function"
  && node.type.name === "DeclaredFile");

test("both sites show full pattern declarations with no fake action or focus target", () => {
  const files = ["Backend/app/*.py", "Libraries/**/katlab_?.mqh", "src/a?.ts"];
  const row = task(files), h = harness([row]);
  for (const nodes of [h.all, h.column(row)]) {
    const chips = patternNodes(nodes);
    assert.deepEqual(chips.map(plainText), files.map((file) => `pattern ${file}`));
    for (const chip of chips) {
      for (const attribute of ["onClick", "tabIndex", "role", "href", "aria-disabled"]) {
        assert.equal(chip.props[attribute], undefined, attribute);
      }
      assert.match(chip.props.className, /min-w-0 break-all/);
    }
    assert.equal(buttons(nodes).length, 0);
  }
});

test("literal brackets, spaces and Unicode retain exact callbacks and full accessible identity", () => {
  const files = ["src/[brackets].ts", "src/a b.ts", "src/tiếng.ts", "src/q#1&x.ts"];
  const row = task(files, { repo: "Repo_B" }), h = harness([row]);
  for (const set of [h.preview, buttons(h.column(row))]) {
    assert.equal(set.length, files.length);
    for (const [index, button] of set.entries()) {
      assert.equal(button.props.type, "button");
      assert.equal(button.props["aria-label"], `Open file story for ${files[index]} in Repo_B`);
      assert.equal(button.props.title, button.props["aria-label"]);
      button.props.onClick();
    }
  }
  assert.deepEqual(h.opened, [...files, ...files].map((file) => ["Repo_B", file]));
  assert.deepEqual(h.preview.map(plainText), files.map((file) => file.split("/").pop()));
  assert.deepEqual(buttons(h.column(row)).map(plainText), files);
});

test("four-entry preview and remaining count never truncate the underlying declaration model", () => {
  const files = ["src/*.ts", ...Array.from({ length: 8 }, (_, index) => `src/file_${index}.ts`)];
  const row = task(files), h = harness([row]);
  assert.equal(declarationNodes(h.all).length, 4);
  assert.equal(h.preview.length, 3);
  assert.ok(h.all.some((node) => node.type === "span" && plainText(node) === "+5"));
  assert.equal(declarationNodes(h.column(row)).length, 9);
  assert.equal(h.table.props.rows[0], row);
  assert.equal(h.table.props.rows[0].files, files);
});

test("duplicate declarations preserve source order and distinct original ordinal keys", () => {
  const files = Object.freeze(["src/*.ts", "src/*.ts", "src/a.ts", "src/a.ts"]);
  const row = Object.freeze(task(files)), h = harness([row]);
  for (const nodes of [h.all, h.column(row)]) {
    assert.deepEqual(declarationNodes(nodes).map((node) => node.props.file), files);
    assert.deepEqual(declarationNodes(nodes).map((node) => node.key),
      files.map((file, index) => JSON.stringify([file, index])));
  }
  assert.equal(h.table.props.rows[0].files, files);
});

test("actual table cell bounds first and last pages using the real shared page window", () => {
  const files = Object.freeze(Array.from({ length: 103 }, (_, index) => `src/file_${index}.ts`));
  const row = Object.freeze(task(files));
  for (const [requested, start, end] of [[1, 0, 50], [3, 100, 103], [99, 100, 103]]) {
    const h = harness([row], requested), nodes = h.column(row), shown = buttons(nodes);
    assert.deepEqual(shown.map(plainText), files.slice(start, end));
    assert.ok(shown.length <= 50);
    assert.deepEqual(declarationNodes(nodes).map((node) => node.key),
      files.slice(start, end).map((file, index) => JSON.stringify([file, start + index])));
    const config = h.configs.at(-1);
    assert.equal(config.totalItems, 103); assert.equal(config.pageSize, 50);
    assert.deepEqual(config.identity, ["active-plan-declared-files", row.repo, row.plan_file, row.task_ref]);
    const pager = nodes.find((node) => node.props.collectionLabel?.startsWith("Declared files for "));
    assert.ok(pager); assert.equal(pager.props.page.start, start); assert.equal(pager.props.page.end, end);
    assert.equal(pager.props.collectionLabel, `Declared files for ${row.repo}: ${row.task_ref}`);
    pager.props.onPageChange(2); assert.deepEqual(h.changes, [2]);
    for (const button of shown) button.props.onClick();
    assert.deepEqual(h.opened, files.slice(start, end).map((file) => [row.repo, file]));
    assert.equal(h.table.props.rows[0].files, files);
  }
});

test("pattern declarations stay non-interactive and bounded while empty and small cells omit paging", () => {
  for (const size of [0, 1, 50, 51, 103]) {
    const files = Array.from({ length: size }, (_, index) => `src/pattern_${index}/*.ts`);
    const row = task(files), h = harness([row]), nodes = h.column(row);
    assert.equal(declarationNodes(nodes).length, Math.min(size, 50));
    assert.equal(buttons(nodes).length, 0);
    assert.equal(nodes.filter((node) => node.props.collectionLabel?.startsWith("Declared files for ")).length,
      size > 50 ? 1 : 0);
    if (size === 0) assert.equal(h.html(row), "<div>—</div>");
  }
});

test("long and HTML-bearing declarations stay full, wrapping React text", () => {
  const long = "src/" + "long_".repeat(100) + "/*.ts", escaped = "src/<script>&*.ts";
  const row = task([long, escaped, "src/literal&name.ts"]), h = harness([row]);
  assert.deepEqual(patternNodes(h.all).map(plainText), [`pattern ${long}`, `pattern ${escaped}`]);
  const html = h.html(row);
  assert.ok(html.includes(long)); assert.match(html, /&lt;script&gt;&amp;\*\.ts/);
  assert.match(html, /literal&amp;name\.ts/); assert.doesNotMatch(html, /<script/);
  assert.ok(buttons(h.column(row)).every((button) => button.props.className.includes("max-w-full break-all")));
});

test("active grouping and original repositories remain independent of declaration presentation", () => {
  const first = task(["src/a.ts"]), second = task(["src/a.ts"], { repo: "Repo_B" });
  const pending = task(["src/*.ts"], { task_id: "B.1", task_ref: "temp/Plan/one.txt - B.1", status: "pending" });
  const doneOnly = task(["src/a.ts"], { repo: "DoneOnly", status: "done" });
  const h = harness([first, second, pending, doneOnly]);
  assert.deepEqual(h.subject.groupActivePlans([first, second, pending, doneOnly]).map((row) => row.repo),
    ["Repo_A", "Repo_B"]);
  assert.deepEqual(h.table.props.rows, [first, pending, second]);
  for (const button of h.preview) button.props.onClick();
  assert.deepEqual(h.opened, [["Repo_A", "src/a.ts"], ["Repo_B", "src/a.ts"]]);
  assert.equal(harness([doneOnly]).rootNode, null);
  assert.equal(harness([]).rootNode, null);
});

test("grouping and complete PlanBoard pre-render preserve captured LF/CRLF source fingerprints", () => {
  for (const variant of [boardText.replace(/\r\n/g, "\n"), boardText.replace(/\r?\n/g, "\r\n")]) {
    const tree = parse("planBoard.tsx", variant), printer = ts.createPrinter({ removeComments: true });
    const hash = (source) => createHash("sha256").update(canonicalPrintedText(source)).digest("hex");
    const group = declaration(tree, "groupActivePlans");
    assert.equal(hash(printer.printNode(ts.EmitHint.Unspecified, group, tree)),
      "01917b880b7a38b71cf13fcbce0b27e441c28ba390626a0aa938f5146d79492d");
    const statements = [...declaration(tree, "PlanBoard").body.statements];
    assert.ok(ts.isReturnStatement(statements.pop()));
    assert.equal(hash(statements.map((node) => printer.printNode(ts.EmitHint.Unspecified, node, tree)).join("\n")),
      "a40383225fd8e2a0093793fb211f69b79093e8581d753e1ca56adc872f4946e8");
  }
});
