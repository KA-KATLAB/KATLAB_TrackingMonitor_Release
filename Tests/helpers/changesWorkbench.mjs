import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(new URL("../../Frontend/package.json", import.meta.url));
const ts = require("typescript");
const all = node => {
  const nodes = [node];
  ts.forEachChild(node, child => { nodes.push(...all(child)); });
  return nodes;
};
const one = (nodes, predicate, label) => {
  const matches = nodes.filter(predicate);
  assert.equal(matches.length, 1, label);
  return matches[0];
};
const ending = text => {
  assert.equal(typeof text, "string");
  assert.ok(!text.startsWith("\uFEFF"), "no workbench inverse BOM");
  const eol = text.includes("\r\n") ? "\r\n" : "\n", bare = text.replace(/\r\n/g, "");
  assert.ok(!bare.includes("\r"), "no bare workbench inverse CR");
  if (eol === "\r\n") assert.ok(!bare.includes("\n"), "uniform workbench inverse EOL");
  return eol;
};
const parse = (text, name, kind) => {
  const ast = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, kind);
  assert.equal(ast.parseDiagnostics.length, 0, "valid complete workbench inverse syntax");
  return ast;
};

export const OLD_CHANGES_ROOT = '    <div className="min-w-0 space-y-6">';
export const NEW_CHANGES_ROOT = '    <div className="changes-workbench min-w-0 space-y-6" data-has-picks={needsPick.length > 0}>';
export const CHANGES_HEADING = [
  '      <SectionHeading title="Changes" kind="page"',
  '        description="Resolve attribution, then inspect captured work by task or folder."',
  '        headingProps={{ "data-view-heading": true, tabIndex: -1 }} />',
].join("\n");
export const CHANGES_COMMAND_DECK = [
  '      <dl className="changes-command-deck" aria-label="Captured work summary">',
  '        <div className="changes-command-metric changes-command-metric-action">',
  '          <dt>Needs attribution</dt>',
  '          <dd>{needsPick.length.toLocaleString()}<span className="changes-command-description">Unfiltered captured edits requiring a task choice</span></dd>',
  '        </div>',
  '        <div className="changes-command-metric">',
  '          <dt>Captured edits</dt>',
  '          <dd>{events.length.toLocaleString()}<span className="changes-command-description">Loaded uncommitted capture window</span></dd>',
  '        </div>',
  '        <div className="changes-command-metric">',
  '          <dt>Task groups</dt>',
  '          <dd>{groupEntries.length.toLocaleString()}<span className="changes-command-description">{groupMode === "folder" ? "With saved task filters" : "In the current task filter"}</span></dd>',
  '        </div>',
  '      </dl>',
].join("\n");

// Preservation only: execute raw current production owners in behavioral tests.
// Reverse the two reviewed Changes render windows, not their surrounding owner.
export function restoreChangesWorkbench (text) {
  const eol = ending(text), ast = parse(text, "App.tsx", ts.ScriptKind.TSX);
  const owner = one(ast.statements, node => ts.isFunctionDeclaration(node)
    && node.name?.text === "ChangesView", "one top-level ChangesView workbench owner");
  const finalReturn = owner.body.statements.at(-1);
  assert.ok(ts.isReturnStatement(finalReturn), "actual Changes final return");
  let root = finalReturn.expression;
  while (root && ts.isParenthesizedExpression(root)) root = root.expression;
  assert.ok(root && ts.isJsxElement(root) && root.openingElement.tagName.getText(ast) === "div",
    "actual Changes root div");
  const attributes = root.openingElement.attributes.properties;
  assert.equal(attributes.length, 2, "only the reviewed Changes root attributes");
  assert.deepEqual(attributes.map(node => node.name?.getText(ast)), ["className", "data-has-picks"]);
  assert.ok(ts.isStringLiteral(attributes[0].initializer));
  assert.equal(attributes[0].initializer.text, "changes-workbench min-w-0 space-y-6");
  assert.ok(ts.isJsxExpression(attributes[1].initializer));
  assert.equal(attributes[1].initializer.expression?.getText(ast), "needsPick.length > 0");
  const children = root.children.filter(node => !ts.isJsxText(node) || node.text.trim());
  const heading = one(children, node => ts.isJsxSelfClosingElement(node)
    && node.tagName.getText(ast) === "SectionHeading"
    && node.attributes.properties.some(attribute => ts.isJsxAttribute(attribute)
      && attribute.name.getText(ast) === "title" && ts.isStringLiteral(attribute.initializer)
      && attribute.initializer.text === "Changes"), "one direct Changes page heading");
  assert.ok(children[0] === heading, "unchanged page heading is first");
  const deck = one(children, node => ts.isJsxElement(node)
    && node.openingElement.tagName.getText(ast) === "dl", "one direct workbench summary dl");
  assert.ok(children[1] === deck, "deck immediately follows the unchanged Changes heading");
  const headingText = CHANGES_HEADING.replace(/\n/g, eol), deckText = CHANGES_COMMAND_DECK.replace(/\n/g, eol);
  const rootStart = root.openingElement.getStart(ast) - 4, rootEnd = root.openingElement.end;
  const headingStart = heading.getStart(ast) - 6, deckStart = deck.getStart(ast) - 6, deckEnd = deck.end;
  assert.equal(text.slice(rootStart, rootEnd), NEW_CHANGES_ROOT, "complete physical root window");
  assert.equal(text.slice(headingStart, heading.end), headingText, "complete unchanged physical heading");
  assert.equal(heading.end + eol.length, deckStart, "exact heading-to-deck adjacency");
  assert.equal(text.slice(deckStart, deckEnd), deckText, "complete physical summary expressions/copy");
  for (const [start, end] of [[rootStart, rootEnd], [deckStart, deckEnd]]) {
    assert.ok(start >= owner.getStart(ast) && end <= owner.end, "window remains in its actual owner");
    assert.equal(text.slice(start - eol.length, start), eol, "original physical line start");
    assert.equal(text.slice(end, end + eol.length), eol, "original physical line end");
  }
  const lf = text.replace(/\r\n/g, "\n");
  for (const window of [NEW_CHANGES_ROOT, CHANGES_COMMAND_DECK]) {
    assert.equal(lf.split(window).length - 1, 1, "one complete reviewed workbench window");
  }
  const restored = text.slice(0, rootStart) + OLD_CHANGES_ROOT + text.slice(rootEnd, deckStart)
    + text.slice(deckEnd + eol.length);
  parse(restored, "App.tsx", ts.ScriptKind.TSX);
  return restored;
}

const copyImport = 'import { restoreChangesWorkbench } from "./helpers/changesWorkbench.mjs";\n';
const bothImport = 'import { restoreChangesWorkbench, restoreChangesWorkbenchOracleAdapters } from "./helpers/changesWorkbench.mjs";\n';
const graphCopyImport = 'import { restoreGitGraphBoundaryCopy } from "./helpers/gitGraphMergeSeed.mjs";\n';
const graphBothImport = 'import { restoreGitGraphBoundaryCopy, restoreGitGraphOracleAdapters } from "./helpers/gitGraphMergeSeed.mjs";\n';
const graphImportsEnd = '  GIT_GRAPH_ORACLE_ADAPTERS } from "./helpers/gitGraphMergeSeed.mjs";\n';
const warningLfHeaders = [
  'test("strict one-arrow inverse preserves complete original App/owner/pre-render/outside in LF and CRLF", () => {\n  assert.equal(sha(WARNING_TIMESTAMP_ARROW), WARNING_TIMESTAMP_ARROW_SHA);\n  ',
  'test("strict comparator inverse rejects missing, duplicate, wrong-site and partial structural/physical changes", () => {\n  ',
  'test("comparator inverse leaves unrelated valid owner and outside mutations visible to original hashes", () => {\n  ',
];
const warningReaderHeaders = [
  'test("only exact oracle adapters invert to both complete HEAD34 suites without rebasing any old assertion", () => {\n  for (const [name, expected] of oldTests) {\n    ',
  'test("test adapter inverse rejects malformed windows and retains unrelated old-test changes", () => {\n  for (const [name, expected] of oldTests) {\n    ',
];
const adapter = (before, after, fn = null) => Object.freeze({ before, after, fn });
export const CHANGES_WORKBENCH_ORACLE_ADAPTERS = Object.freeze({
  "test_history_graph_read_states.mjs": Object.freeze([
    adapter(graphCopyImport, graphCopyImport + copyImport),
    adapter('function checkPreservation (text) {\n  const ast = parse(restoreDiffDisclosureState(restoreWarningTimestampOrder(restoreGitGraphBoundaryCopy(text))));\n',
      'function checkPreservation (text) {\n  const ast = parse(restoreDiffDisclosureState(restoreWarningTimestampOrder(restoreGitGraphBoundaryCopy(restoreChangesWorkbench(text)))));\n', "restoreChangesWorkbench"),
  ]),
  "test_warning_timestamp_order.mjs": Object.freeze([
    adapter(graphBothImport, graphBothImport + bothImport),
    ...warningLfHeaders.map(header => adapter(header + 'const lf = restoreGitGraphBoundaryCopy(source).replace(/\\r\\n/g, "\\n")',
      header + 'const lf = restoreGitGraphBoundaryCopy(restoreChangesWorkbench(source)).replace(/\\r\\n/g, "\\n")', "restoreChangesWorkbench")),
    ...warningReaderHeaders.map(header => adapter(header + 'const text = restoreGitGraphOracleAdapters(name, readFileSync(resolve(root, "Tests", name), "utf8")).replace(/\\r\\n/g, "\\n");',
      header + 'const text = restoreGitGraphOracleAdapters(name, restoreChangesWorkbenchOracleAdapters(name, readFileSync(resolve(root, "Tests", name), "utf8"))).replace(/\\r\\n/g, "\\n");', "restoreChangesWorkbenchOracleAdapters")),
  ]),
  "test_diff_availability.mjs": Object.freeze([
    adapter(graphBothImport, graphBothImport + bothImport),
    adapter('  const lf = restoreWarningTimestampOrder(restoreGitGraphBoundaryCopy(read("App.tsx"))).replace(/\\r\\n/g, "\\n");\n',
      '  const lf = restoreWarningTimestampOrder(restoreGitGraphBoundaryCopy(restoreChangesWorkbench(read("App.tsx")))).replace(/\\r\\n/g, "\\n");\n', "restoreChangesWorkbench"),
    adapter('  const historyLF = restoreGitGraphOracleAdapters("test_history_graph_read_states.mjs", readFileSync(resolve(root, "Tests/test_history_graph_read_states.mjs"), "utf8")).replace(/\\r\\n/g, "\\n");\n',
      '  const historyLF = restoreGitGraphOracleAdapters("test_history_graph_read_states.mjs", restoreChangesWorkbenchOracleAdapters("test_history_graph_read_states.mjs", readFileSync(resolve(root, "Tests/test_history_graph_read_states.mjs"), "utf8"))).replace(/\\r\\n/g, "\\n");\n', "restoreChangesWorkbenchOracleAdapters"),
  ]),
  "test_git_graph_merge_seed.mjs": Object.freeze([
    adapter(graphImportsEnd, graphImportsEnd + bothImport),
    adapter('const appSource = read("Frontend/src/App.tsx");\n',
      'const appSource = restoreChangesWorkbench(read("Frontend/src/App.tsx"));\n', "restoreChangesWorkbench"),
    adapter('test("exact adapters retain all three whole HEAD35 suites, old GitGraph/helpers and original Diff prefix", () => {\n  for (const [name, expected] of Object.entries(oldSuites)) for (const eol of ["\\n", "\\r\\n"]) {\n    const text = lf(read(`Tests/${name}`)).replace(/\\n/g, eol);\n',
      'test("exact adapters retain all three whole HEAD35 suites, old GitGraph/helpers and original Diff prefix", () => {\n  for (const [name, expected] of Object.entries(oldSuites)) for (const eol of ["\\n", "\\r\\n"]) {\n    const text = lf(restoreChangesWorkbenchOracleAdapters(name, read(`Tests/${name}`))).replace(/\\n/g, eol);\n', "restoreChangesWorkbenchOracleAdapters"),
    adapter('test("adapter inverses reject missing/duplicate/wrong windows and retain unrelated original assertions", () => {\n  for (const [name, expected] of Object.entries(oldSuites)) {\n    const source = lf(read(`Tests/${name}`));\n',
      'test("adapter inverses reject missing/duplicate/wrong windows and retain unrelated original assertions", () => {\n  for (const [name, expected] of Object.entries(oldSuites)) {\n    const source = lf(restoreChangesWorkbenchOracleAdapters(name, read(`Tests/${name}`)));\n', "restoreChangesWorkbenchOracleAdapters"),
  ]),
});

// Undo new adapters before every unchanged ancestral oracle/negative fixture.
export function restoreChangesWorkbenchOracleAdapters (name, text) {
  assert.ok(Object.hasOwn(CHANGES_WORKBENCH_ORACLE_ADAPTERS, name), "one recognized workbench oracle suite");
  const eol = ending(text), ast = parse(text, name, ts.ScriptKind.JS), nodes = all(ast);
  const imported = one(ast.statements, node => ts.isImportDeclaration(node)
    && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === "./helpers/changesWorkbench.mjs",
  "one actual workbench adapter import");
  const fns = ["restoreChangesWorkbench", "restoreChangesWorkbenchOracleAdapters"];
  const expected = name === "test_history_graph_read_states.mjs" ? [1, 0]
    : name === "test_warning_timestamp_order.mjs" ? [3, 2]
    : name === "test_diff_availability.mjs" ? [1, 1] : [1, 2];
  const calls = fns.map((fn, index) => {
    const matches = nodes.filter(node => ts.isCallExpression(node)
      && ts.isIdentifier(node.expression) && node.expression.text === fn);
    assert.equal(matches.length, expected[index], "exact workbench adapter call count");
    return matches;
  });
  const edits = CHANGES_WORKBENCH_ORACLE_ADAPTERS[name].map(({ before, after, fn }) => {
    const current = after.replace(/\n/g, eol), original = before.replace(/\n/g, eol);
    assert.equal(text.split(current).length - 1, 1, "one exact contextual workbench adapter window");
    const start = text.indexOf(current), end = start + current.length;
    if (fn) {
      assert.equal(calls[fns.indexOf(fn)].filter(node => node.getStart(ast) >= start && node.end <= end).length, 1,
        "actual adapter call occupies its physical site, not a comment/string");
    } else {
      assert.ok(imported.getStart(ast) >= start && imported.end <= end, "actual import occupies its physical site");
    }
    return { start, end, original };
  }).sort((left, right) => right.start - left.start);
  let restored = text;
  for (const { start, end, original } of edits) restored = restored.slice(0, start) + original + restored.slice(end);
  parse(restored, name, ts.ScriptKind.JS);
  return restored;
}
