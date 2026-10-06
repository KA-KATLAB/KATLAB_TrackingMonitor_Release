import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(new URL("../../Frontend/package.json", import.meta.url));
const ts = require("typescript");
export const CHRONOLOGY_WINDOW = [
  "        all.sort((a, b) => {",
  "          const left = new Date(a.ts).getTime(), right = new Date(b.ts).getTime();",
  "          return (Number.isFinite(left) ? left : Infinity)",
  "            - (Number.isFinite(right) ? right : Infinity) || a.id - b.id;",
  "        });",
  "",
].join("\n");
export const CHRONOLOGY_WINDOW_SHA = "57d4bc3866c08634724740a6bc0222e2c920cce04ee8d0706ea9c421458c5fd1";
assert.equal(createHash("sha256").update(CHRONOLOGY_WINDOW).digest("hex"), CHRONOLOGY_WINDOW_SHA);
const ORIGINAL_SORT = "        all.sort((a, b) => a.ts.localeCompare(b.ts));\n";

// Narrow inverse only: unrelated edits must reach the older full-owner oracles.
export function restoreDialogChronology (text, name) {
  assert.ok(["FileStory", "SessionTimeline"].includes(name), "reviewed dialog owner");
  const lf = text.replace(/\r\n/g, "\n");
  const ast = ts.createSourceFile(`${name}.tsx`, lf, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  assert.equal(ast.parseDiagnostics.length, 0, "valid dialog syntax");
  const owners = ast.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.equal(owners.length, 1, "one complete named dialog");
  const sorts = [], effects = [];
  const visit = node => {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === "all.sort") sorts.push(node);
    if (ts.isCallExpression(node) && node.expression.getText(ast) === "useEffect") effects.push(node);
    ts.forEachChild(node, visit);
  };
  visit(owners[0]);
  assert.equal(sorts.length, 1, "one owned buffer sort");
  const sort = sorts[0], collecting = effects.filter(effect =>
    sort.getStart(ast) > effect.getStart(ast) && sort.end < effect.end);
  assert.equal(collecting.length, 1, "sort belongs to one collecting effect");
  const statement = sort.parent;
  assert.ok(ts.isExpressionStatement(statement) && ts.isBlock(statement.parent)
    && ts.isTryStatement(statement.parent.parent), "sort is directly in the collector try block");
  const siblings = statement.parent.statements, index = siblings.indexOf(statement);
  assert.ok(index > 0 && ts.isForStatement(siblings[index - 1]), "sort follows page collection");
  assert.ok(index + 1 < siblings.length && ts.isIfStatement(siblings[index + 1]), "sort precedes acceptance");
  assert.equal(lf.split(CHRONOLOGY_WINDOW).length - 1, 1, "one exact reviewed module window");
  const start = lf.indexOf(CHRONOLOGY_WINDOW);
  assert.equal(start + 8, statement.getStart(ast), "reviewed indentation belongs to the owned sort");
  assert.equal(start + CHRONOLOGY_WINDOW.length - 1, statement.end, "complete statement and final newline");
  const restored = lf.slice(0, start) + ORIGINAL_SORT + lf.slice(start + CHRONOLOGY_WINDOW.length);
  return text.includes("\r\n") ? restored.replace(/\n/g, "\r\n") : restored;
}
