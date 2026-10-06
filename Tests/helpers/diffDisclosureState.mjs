import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(new URL("../../Frontend/package.json", import.meta.url));
const ts = require("typescript"), sha = (text) => createHash("sha256").update(text).digest("hex");
export const DIFF_DISCLOSURE_LINE = "            aria-expanded={diff !== null}\n";
export const DIFF_DISCLOSURE_WINDOW = "            disabled={diffBusy} aria-busy={diffBusy}\n"
  + DIFF_DISCLOSURE_LINE + "            aria-label={diffBusy\n";
export const DIFF_DISCLOSURE_WINDOW_SHA = "47a647e8804289d42de1e7c2a5b91f58c658a698dbeb78f2f5f4b9362d114b2c";
export const ORIGINAL_EVENT_ROW_LF_SHA = "8fa1fe0abab91da81d1be8b48990f04075fc1589af81a77aed10c748eac87a44";
assert.equal(sha(DIFF_DISCLOSURE_WINDOW), DIFF_DISCLOSURE_WINDOW_SHA, "separately pinned complete insertion window");

// Restore only the reviewed EventRow insertion. Other App functions deliberately
// pass through unchanged so their existing preservation negatives still run.
export function restoreDiffDisclosureState (text) {
  const source = ts.createSourceFile("App.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  assert.equal(source.parseDiagnostics.length, 0, "valid actual App syntax");
  const owners = source.statements.filter((node) => ts.isFunctionDeclaration(node) && node.name?.text === "EventRow");
  assert.equal(owners.length, 1, "one complete EventRow owner");
  const owner = owners[0], start = owner.getStart(source), end = owner.end;
  const raw = text.slice(start, end), normalized = raw.replace(/\r\n/g, "\n");
  const attributes = [];
  const visit = (node) => {
    if (ts.isJsxAttribute(node) && node.name.getText(source) === "aria-expanded") attributes.push(node);
    ts.forEachChild(node, visit);
  };
  visit(owner);
  assert.equal(attributes.length, 1, "one exact EventRow expanded attribute");
  assert.equal(normalized.split(DIFF_DISCLOSURE_LINE).length - 1, 1, "one exact disclosure insertion");
  assert.equal(normalized.split(DIFF_DISCLOSURE_WINDOW).length - 1, 1, "reviewed disclosure placement");
  const restored = normalized.replace(DIFF_DISCLOSURE_LINE, "");
  assert.equal(sha(restored), ORIGINAL_EVENT_ROW_LF_SHA, "entire original EventRow including all owners and render paths");
  return text.slice(0, start) + (raw.includes("\r\n") ? restored.replace(/\n/g, "\r\n") : restored) + text.slice(end);
}
