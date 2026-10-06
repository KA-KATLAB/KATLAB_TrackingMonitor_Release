import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(new URL("../../Frontend/package.json", import.meta.url));
const ts = require("typescript"), sha = (text) => createHash("sha256").update(text).digest("hex");
export const ORIGINAL_PALETTE_LF_SHA = "dc34547921725d33d9dc7242b62a14efef261bd440eacae0d82772a2f44c30fa";

// Reviewed insertion literals are preservation fixtures, never substitute
// implementations for the actual component used by the behavior tests.
export const PALETTE_VISIBILITY_INSERTIONS = [
  { name: "list ref", count: 1, text: "  const listRef = useRef<HTMLUListElement | null>(null);\n" },
  { name: "local reveal helper", count: 1, text: [
    "  const revealOption = (id: string | null): void => {",
    "    const list = listRef.current;",
    "    if (!list?.isConnected || !id || list.clientHeight <= 0) return;",
    "    const optionId = paletteOptionDomId(id);",
    "    const option = Array.from(list.children).find((child) => child.id === optionId);",
    "    if (!(option instanceof HTMLElement) || !option.isConnected) return;",
    "    const row = option.getBoundingClientRect();",
    "    if (row.height <= 0) return;",
    "    const top = list.getBoundingClientRect().top + list.clientTop;",
    "    const bottom = top + list.clientHeight;",
    "    const delta = row.height > list.clientHeight",
    "      ? row.top - top",
    "      : row.top < top ? row.top - top",
    "        : row.bottom > bottom ? row.bottom - bottom : 0;",
    "    if (delta !== 0) list.scrollTop += delta;",
    "  };", "", "",
  ].join("\n") },
  { name: "reset reveal effect", count: 1, text: [
    "  useEffect(() => {",
    "    if (open) revealOption(visibleMatches[0]?.entry.id ?? null);",
    "  }, [open, query, resultIdentity, pager.page]);", "", "",
  ].join("\n") },
  { name: "list binding", count: 1, text: "        ref={listRef}\n" },
  { name: "arrow reveal calls", count: 2, text: "              revealOption(visibleMatches[next].entry.id);\n" },
];
export const PALETTE_VISIBILITY_INSERTIONS_SHA = "5e9005819e5c532f99c5b4a4a18fadf45151f34e8ad0362dbd7080aa83726663";
assert.equal(sha(JSON.stringify(PALETTE_VISIBILITY_INSERTIONS)), PALETTE_VISIBILITY_INSERTIONS_SHA,
  "complete separately pinned six-insertion fixture");

export function restorePaletteVisibility (text) {
  const normalized = text.replace(/\r\n/g, "\n");
  const source = ts.createSourceFile("CommandPalette.tsx", normalized, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  assert.equal(source.parseDiagnostics.length, 0, "valid actual palette syntax");
  const owners = source.statements.filter((node) => ts.isFunctionDeclaration(node) && node.name?.text === "CommandPalette");
  assert.equal(owners.length, 1, "one complete palette owner");
  const owner = owners[0], start = owner.getStart(source), end = owner.end;
  let original = normalized.slice(start, end);
  const [ref, helper, effect, binding, arrows] = PALETTE_VISIBILITY_INSERTIONS;
  for (const [anchor, count] of [
    ["  const inputRef = useRef<HTMLInputElement | null>(null);\n" + ref.text
      + "  const openRef = useRef(open);", 1],
    ["  }, [resultIdentity]);\n\n" + helper.text + effect.text
      + "  const closePalette = useCallback(() => changeOpenRef.current(false), []);", 1],
    ["      <ul\n" + binding.text + '        id="palette-list"', 1],
    ["              setActiveId(visibleMatches[next].entry.id);\n" + arrows.text, 2],
  ]) assert.equal(original.split(anchor).length - 1, count, "reviewed insertion placement");
  for (const insertion of PALETTE_VISIBILITY_INSERTIONS) {
    assert.equal(original.split(insertion.text).length - 1, insertion.count, `exact ${insertion.name} cardinality`);
    original = original.split(insertion.text).join("");
  }
  const restored = normalized.slice(0, start) + original + normalized.slice(end);
  assert.equal(sha(restored), ORIGINAL_PALETTE_LF_SHA, "entire original palette including every owner and render path");
  return text.includes("\r\n") ? restored.replace(/\n/g, "\r\n") : restored;
}
