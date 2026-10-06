import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { canonicalPrintedText } from "./printed_source.mjs";

const require = createRequire(new URL("../../Frontend/package.json", import.meta.url));
const ts = require("typescript");
const printer = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed });
export const SESSION_DISCLOSURE_SHA = "27d93bac9528b6467eaebc23ef0c5749016475ff1c34b015ef6fd9974f3db5ae";

// Reviewed D1 insertion, not an encoding implementation used by runtime tests.
export const SESSION_DISCLOSURE = [
  '<details key={JSON.stringify(["session-full-id", session.provider, session.sessionId])}',
  '        className="mb-3 min-w-0">',
  '        <summary tabIndex={0}',
  '          className="ui-control list-item w-fit max-w-full cursor-pointer bg-ui-raised text-left">',
  '          Full session ID',
  '        </summary>',
  '        <label className="block text-sm text-ui-muted">',
  '          Session ID for {session.provider} (JSON string)',
  '          <input type="text" readOnly spellCheck={false} autoComplete="off"',
  '            aria-describedby="session-timeline-id-help"',
  '            className="ui-field mt-2 block w-full min-w-0 font-mono text-base"',
  '            value={JSON.stringify(session.sessionId).replace(/[\\u007f-\\uffff]/g, (unit) =>',
  '              `\\\\u${unit.charCodeAt(0).toString(16).padStart(4, "0")}`)} />',
  '        </label>',
  '        <p id="session-timeline-id-help" className="mt-2 text-xs text-ui-muted">',
  '          Includes quotes and escapes. Decode JSON to recover the original ID.',
  '        </p>',
  '      </details>',
].join("\n");

const parse = (text) => ts.createSourceFile("SessionTimeline.tsx", text,
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const printed = (node, source) => canonicalPrintedText(
  printer.printNode(ts.EmitHint.Unspecified, node, source));
const sha = (value) => createHash("sha256").update(value).digest("hex");
const expectedSource = parse(`const expected = (${SESSION_DISCLOSURE});`);
const expected = expectedSource.statements[0].declarationList.declarations[0].initializer.expression;
const expectedPrint = printed(expected, expectedSource);
assert.equal(sha(expectedPrint), SESSION_DISCLOSURE_SHA, "reviewed full disclosure literal is pinned");

export function sessionIdentityInsertion (text) {
  const source = parse(text);
  assert.equal(source.parseDiagnostics.length, 0, "valid actual SessionTimeline syntax");
  const functions = source.statements.filter((node) =>
    ts.isFunctionDeclaration(node) && node.name?.text === "SessionTimeline");
  assert.equal(functions.length, 1, "one actual SessionTimeline owner");
  const fn = functions[0], returns = fn.body.statements.filter(ts.isReturnStatement);
  assert.equal(returns.length, 1, "one top-level render return");
  assert.ok(fn.body.statements.at(-1) === returns[0], "render return remains last");
  let shell = returns[0].expression;
  while (ts.isParenthesizedExpression(shell)) shell = shell.expression;
  assert.ok(ts.isJsxElement(shell));
  assert.equal(shell.openingElement.tagName.getText(source), "DialogShell");
  const details = [];
  const visit = (node) => {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(source) === "details") details.push(node);
    ts.forEachChild(node, visit);
  };
  visit(fn);
  assert.equal(details.length, 1, "one complete disclosure, never repeated or nested");
  const detail = details[0], [before, direct, after, events] = shell.children;
  assert.ok(direct === detail, "disclosure is the first direct child before existing events");
  assert.ok(ts.isJsxText(before) && ts.isJsxText(after), "exact whitespace neighbors remain");
  const leading = before.getFullText(source), trailing = after.getFullText(source);
  assert.ok(leading === "\n      " || leading === "\r\n      ", "original six-space return indentation");
  assert.equal(trailing, leading, "remove only the insertion's identical newline and indentation");
  assert.ok(ts.isJsxElement(events));
  assert.equal(events.openingElement.tagName.getText(source), "div");
  const eventId = events.openingElement.attributes.properties.filter((node) =>
    ts.isJsxAttribute(node) && node.name.getText(source) === "id");
  assert.equal(eventId.length, 1);
  assert.equal(eventId[0].initializer?.text, "session-timeline-events");
  assert.equal(printed(detail, source), expectedPrint, "entire reviewed disclosure subtree, not selected props");
  return { source, fn, detail, start: detail.getStart(source), end: events.getStart(source) };
}

export function restoreSessionIdentity (text) {
  const { start, end } = sessionIdentityInsertion(text);
  return text.slice(0, start) + text.slice(end);
}
