import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { canonicalPrintedText } from "./printed_source.mjs";

const require = createRequire(new URL("../../Frontend/package.json", import.meta.url));
const ts = require("typescript");
const printer = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed });
const sha = (value) => createHash("sha256").update(value).digest("hex");
export const OLD_TASK_EXPRESSION = "!previous || previous.task_ref !== event.task_ref";
export const NEW_TASK_EXPRESSION = "!previous || previous.repo_id !== event.repo_id || previous.task_ref !== event.task_ref";
export const OLD_TASK_LINE = "          const taskChanged = " + OLD_TASK_EXPRESSION + ";\n";
export const NEW_TASK_LINE = "          const taskChanged = " + NEW_TASK_EXPRESSION + ";\n";
export const NEW_TASK_EXPRESSION_SHA = "6245d6cf2e7620bdceb20fe47db50c75885f69441b7b0ec5b09bfe9acdfd3a22";
assert.equal(sha(OLD_TASK_LINE), "0f94e4381fb0d2334e81989e63014d68dc9542439d7397caeca9aefb3ffd70a7");
assert.equal(sha(NEW_TASK_LINE), "0a90bf9106fc779cc2dd6688ba9d9f8a526ae9685afa56bd7864e7c23fd4cf10");

// Source-only inverse: never use this expression as a runtime grouping model.
export function sessionTaskGroupsInitializer (text) {
  const source = ts.createSourceFile("SessionTimeline.tsx", text,
    ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  assert.equal(source.parseDiagnostics.length, 0, "valid complete SessionTimeline syntax");
  const functions = source.statements.filter((node) =>
    ts.isFunctionDeclaration(node) && node.name?.text === "SessionTimeline");
  assert.equal(functions.length, 1, "one actual SessionTimeline owner");
  const fn = functions[0];
  assert.ok(fn.body && ts.isBlock(fn.body), "complete function body");
  const returns = fn.body.statements.filter(ts.isReturnStatement);
  assert.equal(returns.length, 1, "one top-level render return");
  assert.equal(fn.body.statements.at(-1), returns[0], "render remains the final statement");
  const maps = [], declarations = [];
  const findDeclarations = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)
      && node.name.text === "taskChanged") declarations.push(node);
    ts.forEachChild(node, findDeclarations);
  };
  findDeclarations(fn);
  const findMaps = (node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && ts.isIdentifier(node.expression.expression)
      && node.expression.expression.text === "visibleRows"
      && node.expression.name.text === "map") maps.push(node);
    ts.forEachChild(node, findMaps);
  };
  findMaps(returns[0]);
  assert.equal(maps.length, 1, "one visibleRows.map in the actual render");
  const map = maps[0];
  assert.equal(map.expression.getText(source), "visibleRows.map");
  assert.equal(map.arguments.length, 1, "one map callback");
  const callback = map.arguments[0];
  assert.ok(ts.isArrowFunction(callback) && ts.isBlock(callback.body), "block-arrow callback");
  assert.ok(!callback.typeParameters?.length && !callback.modifiers?.length, "ordinary callback");
  assert.deepEqual(callback.parameters.map((node) => node.getText(source)), ["event", "localIndex"]);
  assert.equal(declarations.length, 1, "sole taskChanged declaration in the owner");
  const declaration = declarations[0], list = declaration.parent, statement = list.parent;
  assert.ok(ts.isVariableDeclarationList(list) && list.declarations.length === 1
    && (list.flags & ts.NodeFlags.Const) && ts.isVariableStatement(statement), "one const declaration");
  assert.equal(statement.parent, callback.body, "declaration belongs directly to the map");
  assert.equal(callback.body.statements[3], statement, "reviewed fourth map statement");
  const initializer = declaration.initializer;
  assert.ok(initializer, "complete reviewed initializer");
  assert.equal(initializer.getText(source), NEW_TASK_EXPRESSION, "only the reviewed expression");
  assert.equal(sha(canonicalPrintedText(
    printer.printNode(ts.EmitHint.Unspecified, initializer, source))), NEW_TASK_EXPRESSION_SHA);
  assert.equal(canonicalPrintedText(text).split(NEW_TASK_LINE).length - 1, 1, "unique literal line");
  const lineStart = text.lastIndexOf("\n", statement.getStart(source) - 1) + 1;
  const lineEnd = text.indexOf("\n", statement.end);
  assert.ok(lineEnd >= 0, "reviewed complete line ends in a newline");
  const line = text.slice(lineStart, lineEnd + 1);
  assert.ok(line === NEW_TASK_LINE || line === NEW_TASK_LINE.replace(/\n/g, "\r\n"),
    "exact ten-space physical line, not an eleven-space suffix");
  assert.equal(lineStart + 10, statement.getStart(source), "physical line start");
  assert.equal(statement.end, lineEnd - (text[lineEnd - 1] === "\r" ? 1 : 0), "complete statement boundary");
  return { source, fn, map, callback, statement, initializer,
    start: initializer.getStart(source), end: initializer.end };
}

export function restoreSessionTaskGroups (text) {
  const { start, end } = sessionTaskGroupsInitializer(text);
  // Splice original text directly; preserve even unrelated mixed physical newlines.
  return text.slice(0, start) + OLD_TASK_EXPRESSION + text.slice(end);
}
