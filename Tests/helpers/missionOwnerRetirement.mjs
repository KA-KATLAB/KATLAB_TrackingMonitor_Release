import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(new URL("../../Frontend/package.json", import.meta.url));
const ts = require("typescript");
const sha = (text) => createHash("sha256").update(text).digest("hex");
export const ORIGINAL_MISSION_LF_SHA = "9d30b22f761a9224af95dd42aa64144e84c47d4ad8317678e2ec898141b3edb7";

// Reviewed preservation literals, not replacement implementations used by the
// runtime owner/effect tests. No callback or render subtree is excluded.
export const MISSION_OWNER_CHANGES = [
  { name: "retirement state", before: "    let settled = false;",
    after: "    let settled = false;\n    let retired = false;" },
  { name: "timeout authority", before: "      timedOut: () => run?.action.didTimeout() ?? false,",
    after: "      timedOut: () => !retired && (run?.action.didTimeout() ?? false)," },
  { name: "cleanup retirement", before: "      abort: () => {\n        run?.action.signal.removeEventListener(\"abort\", abortForDeadline);",
    after: "      abort: () => {\n        retired = true;\n        run?.action.signal.removeEventListener(\"abort\", abortForDeadline);" },
  { name: "Mission rejection", before: "      if (isAbortError(errorValue) && !timedOut) return;\n      failed = true;\n      setMissionError(timedOut",
    after: "      if ((owner.controller.signal.aborted || isAbortError(errorValue)) && !timedOut) return;\n      failed = true;\n      setMissionError(timedOut" },
];
export const MISSION_OWNER_CHANGES_SHA = "c24a121e1a14b38dd9ac4cb0769546b5852d78b5a88c9fdda8f3242b882ad089";
assert.equal(sha(JSON.stringify(MISSION_OWNER_CHANGES)), MISSION_OWNER_CHANGES_SHA,
  "complete separately pinned four-edit fixture");

export function restoreMissionOwnerRetirement (text) {
  const normalized = text.replace(/\r\n/g, "\n");
  const source = ts.createSourceFile("MissionView.tsx", normalized, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  assert.equal(source.parseDiagnostics.length, 0, "valid actual Mission syntax");
  const owners = source.statements.filter((node) => ts.isFunctionDeclaration(node) && node.name?.text === "MissionView");
  assert.equal(owners.length, 1, "one complete Mission owner");
  const owner = owners[0], start = owner.getStart(source), end = owner.end;
  let original = normalized.slice(start, end);
  for (const change of MISSION_OWNER_CHANGES) {
    assert.equal(original.split(change.after).length - 1, 1, `exact ${change.name} cardinality`);
    original = original.replace(change.after, change.before);
  }
  const restored = normalized.slice(0, start) + original + normalized.slice(end);
  assert.equal(sha(restored), ORIGINAL_MISSION_LF_SHA, "whole original Mission file including JSX and outside owners");
  return text.includes("\r\n") ? restored.replace(/\n/g, "\r\n") : restored;
}
