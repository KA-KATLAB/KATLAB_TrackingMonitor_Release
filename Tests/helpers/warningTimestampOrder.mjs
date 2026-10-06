import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(new URL("../../Frontend/package.json", import.meta.url));
const ts = require("typescript"), sha = text => createHash("sha256").update(text).digest("hex");
const parse = text => ts.createSourceFile("App.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const all = node => {
  const found = [node];
  ts.forEachChild(node, child => { found.push(...all(child)); });
  return found;
};
export const ORIGINAL_WARNING_ARROW = "(left, right) =>\n"
  + "    left.ts < right.ts ? -1 : left.ts > right.ts ? 1 : 0";
export const WARNING_TIMESTAMP_ARROW = [
  "(left, right) => {",
  '    const leftTs = left.ts.replace(/(T\\d{2}:\\d{2}:\\d{2})Z$/, "$1.000000Z");',
  '    const rightTs = right.ts.replace(/(T\\d{2}:\\d{2}:\\d{2})Z$/, "$1.000000Z");',
  "    return leftTs < rightTs ? -1 : leftTs > rightTs ? 1 : 0;",
  "  }",
].join("\n");
export const WARNING_TIMESTAMP_ARROW_SHA = "31458c1547f9b6ab9c6fac03542267c61e6482750a1f870fc602f119177d2927";
export const WARNING_TIMESTAMP_PRINTED_SHA = "85e318218bd54e7e1a8fd7d6aaa12898e8790e0204bbd61eee7925a7987ca8f9";
assert.equal(sha(WARNING_TIMESTAMP_ARROW), WARNING_TIMESTAMP_ARROW_SHA, "separately pinned full warning arrow");

// Test-only inverse of one reviewed arrow. Unrelated source edits deliberately
// remain visible to the immutable complete-source and ancestor oracle hashes.
export function restoreWarningTimestampOrder (text) {
  assert.equal(typeof text, "string");
  assert.ok(!text.startsWith("\uFEFF"), "warning source has no BOM");
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  assert.ok(!text.replace(/\r\n/g, "").includes("\r"), "no bare warning source CR");
  if (eol === "\r\n") assert.ok(!text.replace(/\r\n/g, "").includes("\n"), "uniform warning source EOL");
  const ast = parse(text);
  assert.equal(ast.parseDiagnostics.length, 0, "valid actual warning TSX");
  const owners = ast.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === "WarningsBanner");
  assert.equal(owners.length, 1, "one top-level WarningsBanner owner");
  const owner = owners[0];
  const items = all(owner).filter(node => ts.isVariableDeclaration(node) && node.name.getText(ast) === "items");
  assert.equal(items.length, 1, "one actual warning items declaration");
  const statement = owner.body.statements[14];
  assert.ok(ts.isVariableStatement(statement) && !statement.modifiers?.length, "direct warning items statement");
  assert.equal(statement.declarationList.flags, ts.NodeFlags.Const, "ordinary const warning items");
  assert.equal(statement.declarationList.declarations.length, 1);
  assert.ok(statement.declarationList.declarations[0] === items[0], "original warning items position");
  assert.ok(!items[0].type && !items[0].exclamationToken, "untyped original warning items");
  const sort = items[0].initializer;
  assert.ok(ts.isCallExpression(sort) && ts.isPropertyAccessExpression(sort.expression)
    && sort.expression.name.text === "sort" && !sort.questionDotToken && !sort.expression.questionDotToken
    && !sort.typeArguments?.length && sort.arguments.length === 1, "one ordinary warning sort call");
  const filter = sort.expression.expression;
  assert.ok(ts.isCallExpression(filter) && ts.isPropertyAccessExpression(filter.expression)
    && filter.expression.name.text === "filter" && filter.arguments.length === 1, "actual warning filter chain");
  const flatMap = filter.expression.expression;
  assert.ok(ts.isCallExpression(flatMap) && ts.isPropertyAccessExpression(flatMap.expression)
    && flatMap.expression.name.text === "flatMap" && flatMap.expression.expression.getText(ast) === "repos"
    && flatMap.arguments.length === 1, "actual scoped warning flatMap chain");
  assert.equal(all(owner).filter(node => ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
    && node.expression.name.text === "sort").length, 1, "sole warning sort boundary");
  const arrow = sort.arguments[0];
  assert.ok(ts.isArrowFunction(arrow) && !arrow.modifiers?.length && !arrow.typeParameters?.length
    && !arrow.type && ts.isBlock(arrow.body), "ordinary complete warning comparator arrow");
  assert.equal(arrow.parameters.length, 2);
  for (const [index, name] of ["left", "right"].entries()) {
    const parameter = arrow.parameters[index];
    assert.ok(ts.isIdentifier(parameter.name) && parameter.name.text === name
      && !parameter.type && !parameter.initializer && !parameter.questionToken
      && !parameter.dotDotDotToken && !parameter.modifiers?.length, "exact warning comparator parameters");
  }
  assert.equal(arrow.body.statements.length, 3, "only two local copies and one return");
  const printed = ts.createPrinter({ removeComments: true })
    .printNode(ts.EmitHint.Unspecified, arrow, ast).replace(/\r\n/g, "\n");
  assert.equal(sha(printed), WARNING_TIMESTAMP_PRINTED_SHA, "complete warning comparator printer pin");
  const start = arrow.getStart(ast), end = arrow.end;
  assert.equal(text.slice(start, end), WARNING_TIMESTAMP_ARROW.replace(/\n/g, eol), "exact physical warning arrow");
  const prefix = "  ).filter((w) => !dismissed.has(w.key)).sort(";
  assert.equal(text.slice(start - prefix.length, start), prefix, "complete original warning sort prefix");
  assert.ok(start === prefix.length || text.slice(start - prefix.length - eol.length, start - prefix.length) === eol,
    "original warning sort physical line start");
  assert.equal(text.slice(end, end + 2 + eol.length), ");" + eol, "complete original warning sort suffix");
  return text.slice(0, start) + ORIGINAL_WARNING_ARROW.replace(/\n/g, eol) + text.slice(end);
}
