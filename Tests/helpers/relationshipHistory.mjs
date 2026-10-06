import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(new URL("../../Frontend/package.json", import.meta.url));
const ts = require("typescript");
const sha = (text) => createHash("sha256").update(text).digest("hex");
export const ORIGINAL_OVERVIEW_LF_SHA = "a04a045724a31514c8511e5bf4d809a76843739ab6a946cba4b55e4d17bb7cc7";

// Explicit reviewed replacements. These are preservation fixtures, never runtime
// substitutes for the actual component's observation or rendering algorithms.
export const RELATIONSHIP_CHANGES = [
  { name: "state", count: 1,
    before: '  const [graphRows, setGraphRows] = useState<BackboneRow[]>([]);',
    after: ['  const [graphRows, setGraphRows] = useState<{',
      '    selectionKey: string; historyObserved: boolean; rows: BackboneRow[];',
      '  }>({ selectionKey: "", historyObserved: false, rows: [] });'].join("\n") },
  { name: "observation", count: 1,
    before: ['        const history: HistoryEntry[] = reposRef.current.some(',
      '          (repo) => repo.id === selectionValue.repoId,', '        )'].join("\n"),
    after: ['        const historyObserved = reposRef.current.some(',
      '          (repo) => repo.id === selectionValue.repoId,', '        );',
      '        const history: HistoryEntry[] = historyObserved'].join("\n") },
  { name: "accepted publication", count: 1,
    before: '        setGraphRows(prepared.rows);',
    after: '        setGraphRows({ selectionKey, historyObserved, rows: prepared.rows });' },
  { name: "clear", count: 2,
    before: 'setGraphRows([]);',
    after: 'setGraphRows({ selectionKey: "", historyObserved: false, rows: [] });' },
  { name: "current derivation", count: 1,
    before: '  const accessibleRows = graphRows.length > 0 ? graphRows : taskOnlyRows;',
    after: ['  const currentGraphRows = graphRows.selectionKey === selectedValue ? graphRows.rows : [];',
      '  const historyObserved = graphRows.selectionKey === selectedValue && graphRows.historyObserved;',
      '  const accessibleRows = currentGraphRows.length > 0 ? currentGraphRows : taskOnlyRows;'].join("\n") },
  { name: "provenance paragraph", count: 1, before: "",
    after: ['      {selected && (',
      '        <p className="mb-2 text-xs leading-5 text-ui-muted">',
      '          {historyObserved',
      '            ? "Commit links describe the last accepted History response (up to 500 commits)."',
      '            : !repos.some((repo) => repo.id === selected.repoId)',
      '              ? "Commit history unavailable for this offline or missing repository. Task details are shown."',
      '              : failure',
      '                ? "Commit history unavailable. Task details are shown."',
      '                : "Commit history not loaded yet. Task details are shown."}',
      '          {failure',
      '            ? " Latest map update failed; any visible diagram is from its previous accepted render."',
      '            : busy || settledKey !== semanticKey',
      '              ? " Map update pending; any visible diagram is from its previous accepted render."',
      '              : ""}',
      '        </p>', '      )}', ''].join("\n") },
  { name: "summary", count: 1,
    before: '            : `${accessibleRows.length} tasks; ${linkedCommits} commit link${linkedCommits === 1 ? "" : "s"}; `',
    after: ['            : `${accessibleRows.length} tasks; `',
      '              + (historyObserved ? `${linkedCommits} commit link${linkedCommits === 1 ? "" : "s"}; `',
      '                : "commit links unavailable; ")'].join("\n") },
  { name: "commit cell", count: 1,
    before: '              row.commits.length > 0 ? row.commits.map((hash) => hash.slice(0, 10)).join(", ") : "—" },',
    after: ['              !historyObserved ? "Unavailable"',
      '                : row.commits.length > 0 ? row.commits.map((hash) => hash.slice(0, 10)).join(", ") : "—" },'].join("\n") },
  { name: "footer", count: 1,
    before: ['      ) : !busy && selected && !note && !failure && (',
      '        <p className="text-sm text-slate-400">No committed history for this plan yet.</p>'].join("\n"),
    after: ['      ) : !busy && selected && historyObserved && !note && !failure && (',
      '        <p className="text-sm text-slate-400">No relationship diagram is available for this accepted History response.</p>'].join("\n") },
];
export const RELATIONSHIP_CHANGES_SHA = "c66a238891a19dca33482e4c7c6c975b1439bf050335572a5c33e5aea7528645";
assert.equal(sha(JSON.stringify(RELATIONSHIP_CHANGES)), RELATIONSHIP_CHANGES_SHA,
  "separately pinned complete reviewed replacement fixture");

export function restoreRelationshipHistory (text) {
  const normalized = text.replace(/\r\n/g, "\n");
  const source = ts.createSourceFile("OverviewView.tsx", normalized, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  assert.equal(source.parseDiagnostics.length, 0, "actual file parses");
  const owners = source.statements.filter((node) => ts.isFunctionDeclaration(node) && node.name?.text === "GraphPanel");
  assert.equal(owners.length, 1, "one complete GraphPanel owner");
  const owner = owners[0], start = owner.getStart(source), end = owner.end;
  let original = normalized.slice(start, end);
  for (const change of RELATIONSHIP_CHANGES) {
    assert.equal(original.split(change.after).length - 1, change.count, `exact ${change.name} cardinality`);
    original = original.split(change.after).join(change.before);
  }
  const restored = normalized.slice(0, start) + original + normalized.slice(end);
  assert.equal(sha(restored), ORIGINAL_OVERVIEW_LF_SHA, "entire original file, including every owner and outside GraphPanel");
  return text.includes("\r\n") ? restored.replace(/\n/g, "\r\n") : restored;
}
