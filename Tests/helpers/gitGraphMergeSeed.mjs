import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(new URL("../../Frontend/package.json", import.meta.url));
const ts = require("typescript");
const all = node => {
  const nodes = [node];
  ts.forEachChild(node, child => { nodes.push(...all(child)); });
  return nodes;
};
const one = (nodes, predicate, message) => {
  const found = nodes.filter(predicate);
  assert.equal(found.length, 1, message);
  return found[0];
};
const ending = text => {
  assert.equal(typeof text, "string");
  assert.ok(!text.startsWith("\uFEFF"), "graph inverse source has no BOM");
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const bare = text.replace(/\r\n/g, "");
  assert.ok(!bare.includes("\r"), "no bare graph inverse source CR");
  if (eol === "\r\n") assert.ok(!bare.includes("\n"), "uniform graph inverse source EOL");
  return eol;
};
const parse = (text, name, kind) => {
  const ast = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, kind);
  assert.equal(ast.parseDiagnostics.length, 0, "valid actual graph inverse syntax");
  return ast;
};

export const OLD_GIT_GRAPH_TITLE = "toggle the commit graph (latest 20 commits, real parents)";
export const NEW_GIT_GRAPH_TITLE = "Toggle the bounded commit sequence (latest 20 commits; parent data in the table)";
export const OLD_GIT_GRAPH_CAPTION = "latest {graphShown} of {shownEntries.length} fetched commits \u00b7 merge side branches summarized to their tip (*)";
export const NEW_GIT_GRAPH_CAPTION = "latest {graphShown} of {shownEntries.length} fetched commits \u00b7 bounded sequence; oldest visible commit seeds the sequence; later merge tips summarized (*); parent data in the table";
const titleWindow = title => [
  "        <ControlButton disabled={!repoId} onClick={toggleGraph}",
  `          aria-pressed={showGraph} title="${title}"`,
  '          tone={showGraph ? "primary" : "neutral"}>',
  "          Commit graph",
  "        </ControlButton>",
].join("\n");
const captionWindow = caption => [
  "          {graphSvg && !!repoId && loadedRepoRef.current === repoId && (",
  '            <p className="mt-1 text-xs text-slate-400">',
  `              ${caption}`,
  "            </p>",
  "          )}",
].join("\n");

// Test-only inverse of two reviewed copy lines, not a substitute implementation.
// Original owner, computation and every unrelated byte pass to the old oracles.
export function restoreGitGraphBoundaryCopy (text) {
  const eol = ending(text), ast = parse(text, "App.tsx", ts.ScriptKind.TSX);
  const history = one(ast.statements, node => ts.isFunctionDeclaration(node)
    && node.name?.text === "HistoryView", "one top-level HistoryView copy owner");
  const finalReturn = history.body.statements.at(-1);
  assert.ok(ts.isReturnStatement(finalReturn), "original History final return");
  const rendered = all(finalReturn);
  const button = one(rendered, node => ts.isJsxElement(node)
    && node.openingElement.tagName.getText(ast) === "ControlButton"
    && node.openingElement.attributes.properties.some(attribute => ts.isJsxAttribute(attribute)
      && attribute.name.getText(ast) === "onClick" && ts.isJsxExpression(attribute.initializer)
      && attribute.initializer.expression?.getText(ast) === "toggleGraph"), "one actual graph toggle button");
  const title = one(button.openingElement.attributes.properties, attribute =>
    ts.isJsxAttribute(attribute) && attribute.name.getText(ast) === "title", "one graph toggle title");
  assert.ok(ts.isStringLiteral(title.initializer), "plain graph toggle title value");
  assert.equal(title.initializer.text, NEW_GIT_GRAPH_TITLE, "complete new graph toggle copy");
  const fragment = button.parent;
  assert.ok(ts.isJsxFragment(fragment) && ts.isJsxExpression(fragment.parent)
    && ts.isJsxAttribute(fragment.parent.parent)
    && fragment.parent.parent.name.getText(ast) === "actions", "graph toggle remains a heading action");
  const heading = fragment.parent.parent.parent.parent;
  assert.ok(ts.isJsxSelfClosingElement(heading) && heading.tagName.getText(ast) === "SectionHeading",
    "actual History heading owns the graph action");
  const graph = one(rendered, node => ts.isJsxExpression(node)
    && node.expression?.getText(ast).startsWith("showGraph &&"), "one actual History graph render gate");
  const caption = one(all(graph), node => ts.isJsxExpression(node)
    && node.expression?.getText(ast).startsWith("graphSvg && !!repoId && loadedRepoRef.current === repoId &&"),
  "one accepted same-repository SVG caption gate");
  const edits = [
    [button, titleWindow(NEW_GIT_GRAPH_TITLE), titleWindow(OLD_GIT_GRAPH_TITLE), 8],
    [caption, captionWindow(NEW_GIT_GRAPH_CAPTION), captionWindow(OLD_GIT_GRAPH_CAPTION), 10],
  ].map(([node, current, original, indent]) => {
    current = current.replace(/\n/g, eol); original = original.replace(/\n/g, eol);
    const start = node.getStart(ast) - indent, end = node.end;
    assert.ok(start >= history.getStart(ast) && end <= history.end, "copy window stays inside its original owner");
    assert.equal(text.slice(start, end), current, "complete graph role/site/physical copy window");
    assert.equal(text.slice(start - eol.length, start), eol, "original graph copy line start");
    assert.equal(text.slice(end, end + eol.length), eol, "original graph copy line end");
    return { start, end, original };
  }).sort((left, right) => right.start - left.start);
  let restored = text;
  for (const edit of edits) restored = restored.slice(0, edit.start) + edit.original + restored.slice(edit.end);
  return restored;
}

const copyImport = 'import { restoreGitGraphBoundaryCopy } from "./helpers/gitGraphMergeSeed.mjs";\n';
const bothImport = 'import { restoreGitGraphBoundaryCopy, restoreGitGraphOracleAdapters } from "./helpers/gitGraphMergeSeed.mjs";\n';
const warningImport = 'import { restoreWarningTimestampOrder } from "./helpers/warningTimestampOrder.mjs";\n';
const warningImportsEnd = '  WARNING_TIMESTAMP_ARROW_SHA } from "./helpers/warningTimestampOrder.mjs";\n';
const originalLf = 'const lf = source.replace(/\\r\\n/g, "\\n")';
const restoredLf = 'const lf = restoreGitGraphBoundaryCopy(source).replace(/\\r\\n/g, "\\n")';
const originalReader = 'const text = readFileSync(resolve(root, "Tests", name), "utf8").replace(/\\r\\n/g, "\\n");';
const restoredReader = 'const text = restoreGitGraphOracleAdapters(name, readFileSync(resolve(root, "Tests", name), "utf8")).replace(/\\r\\n/g, "\\n");';
const warningLfHeaders = [
  'test("strict one-arrow inverse preserves complete original App/owner/pre-render/outside in LF and CRLF", () => {\n  assert.equal(sha(WARNING_TIMESTAMP_ARROW), WARNING_TIMESTAMP_ARROW_SHA);\n  ',
  'test("strict comparator inverse rejects missing, duplicate, wrong-site and partial structural/physical changes", () => {\n  ',
  'test("comparator inverse leaves unrelated valid owner and outside mutations visible to original hashes", () => {\n  ',
];
const warningReaderHeaders = [
  'test("only exact oracle adapters invert to both complete HEAD34 suites without rebasing any old assertion", () => {\n  for (const [name, expected] of oldTests) {\n    ',
  'test("test adapter inverse rejects malformed windows and retains unrelated old-test changes", () => {\n  for (const [name, expected] of oldTests) {\n    ',
];
const adapter = (before, after) => Object.freeze({ before, after });
export const GIT_GRAPH_ORACLE_ADAPTERS = Object.freeze({
  "test_history_graph_read_states.mjs": Object.freeze([
    adapter(warningImport, warningImport + copyImport),
    adapter('function checkPreservation (text) {\n  const ast = parse(restoreDiffDisclosureState(restoreWarningTimestampOrder(text)));\n',
      'function checkPreservation (text) {\n  const ast = parse(restoreDiffDisclosureState(restoreWarningTimestampOrder(restoreGitGraphBoundaryCopy(text))));\n'),
  ]),
  "test_warning_timestamp_order.mjs": Object.freeze([
    adapter(warningImportsEnd, warningImportsEnd + bothImport),
    ...warningLfHeaders.map(header => adapter(header + originalLf, header + restoredLf)),
    ...warningReaderHeaders.map(header => adapter(header + originalReader, header + restoredReader)),
  ]),
  "test_diff_availability.mjs": Object.freeze([
    adapter('// The complete original 311-line test prefix above remains byte-identical.\n',
      '// The complete original 311-line test prefix above remains byte-identical.\n' + bothImport),
    adapter('  const lf = restoreWarningTimestampOrder(read("App.tsx")).replace(/\\r\\n/g, "\\n");\n',
      '  const lf = restoreWarningTimestampOrder(restoreGitGraphBoundaryCopy(read("App.tsx"))).replace(/\\r\\n/g, "\\n");\n'),
    adapter('  const historyLF = readFileSync(resolve(root, "Tests/test_history_graph_read_states.mjs"), "utf8").replace(/\\r\\n/g, "\\n");\n',
      '  const historyLF = restoreGitGraphOracleAdapters("test_history_graph_read_states.mjs", readFileSync(resolve(root, "Tests/test_history_graph_read_states.mjs"), "utf8")).replace(/\\r\\n/g, "\\n");\n'),
  ]),
});

// Reverse only reviewed adapter sites before the unchanged ancestral test chain.
export function restoreGitGraphOracleAdapters (name, text) {
  assert.ok(Object.hasOwn(GIT_GRAPH_ORACLE_ADAPTERS, name), "one recognized graph oracle suite");
  const eol = ending(text), ast = parse(text, name, ts.ScriptKind.JS);
  const imports = ast.statements.filter(node => ts.isImportDeclaration(node)
    && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === "./helpers/gitGraphMergeSeed.mjs");
  assert.equal(imports.length, 1, "one new graph adapter import");
  const expectedCalls = name === "test_history_graph_read_states.mjs" ? [1, 0]
    : name === "test_warning_timestamp_order.mjs" ? [3, 2] : [1, 1];
  for (const [index, fn] of ["restoreGitGraphBoundaryCopy", "restoreGitGraphOracleAdapters"].entries()) {
    assert.equal(all(ast).filter(node => ts.isCallExpression(node)
      && ts.isIdentifier(node.expression) && node.expression.text === fn).length, expectedCalls[index],
    "exact graph adapter call count");
  }
  let restored = text;
  for (const { before, after } of [...GIT_GRAPH_ORACLE_ADAPTERS[name]].reverse()) {
    const current = after.replace(/\n/g, eol), original = before.replace(/\n/g, eol);
    assert.equal(restored.split(current).length - 1, 1, "one exact contextual graph adapter window");
    restored = restored.replace(current, original);
  }
  return restored;
}
