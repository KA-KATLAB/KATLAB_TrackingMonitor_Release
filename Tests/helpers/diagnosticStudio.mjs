import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";

const ts = createRequire(new URL("../../Frontend/package.json", import.meta.url))("typescript");
const sha = value => createHash("sha256").update(value).digest("hex");
// Independent preservation literals. Restored HTML and JavaScript are never executed.
const CSS = String.raw`/* Diagnostic Studio: named snapshot sections; health behavior stays. */
.ui-safe-dialog > [role="dialog"] section[aria-labelledby="health-server-heading"],
.ui-safe-dialog > [role="dialog"] section[aria-labelledby="health-activity-heading"],
.ui-safe-dialog > [role="dialog"] section[aria-labelledby="health-providers-heading"],
.ui-safe-dialog > [role="dialog"] section[aria-labelledby="health-repositories-heading"] {
  padding: 1.25rem;
  border-radius: 8px;
}
.ui-safe-dialog > [role="dialog"] section[aria-labelledby="health-server-heading"] > h3,
.ui-safe-dialog > [role="dialog"] section[aria-labelledby="health-activity-heading"] > h3,
.ui-safe-dialog > [role="dialog"] section[aria-labelledby="health-providers-heading"] > h3,
.ui-safe-dialog > [role="dialog"] section[aria-labelledby="health-repositories-heading"] > h3 {
  margin-bottom: 1rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid rgb(var(--ui-border));
  font-size: 1.25rem;
  line-height: 1.4;
}
.ui-safe-dialog > [role="dialog"] section[aria-labelledby="health-server-heading"] > div.grid {
  padding-top: 0.375rem;
  padding-bottom: 0.375rem;
  border-bottom: 1px solid rgb(var(--ui-border));
}
.ui-safe-dialog > [role="dialog"] section[aria-labelledby="health-activity-heading"] {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0.75rem;
}
.ui-safe-dialog > [role="dialog"] section[aria-labelledby="health-activity-heading"] > h3 {
  grid-column: 1 / -1;
  margin-bottom: 0;
}
.ui-safe-dialog > [role="dialog"] section[aria-labelledby="health-activity-heading"] > div.grid {
  grid-template-columns: minmax(0, 1fr);
  gap: 0.5rem;
  padding: 1rem;
  border: 1px solid rgb(var(--ui-border));
  border-radius: 8px;
  background: rgb(var(--ui-canvas));
}
.ui-safe-dialog > [role="dialog"] section[aria-labelledby="health-activity-heading"] > div.grid > span:first-child {
  font-size: 0.875rem;
  line-height: 1.4;
}
.ui-safe-dialog > [role="dialog"] section[aria-labelledby="health-activity-heading"] > div.grid > span:last-child {
  font-family: "Azeret Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 1.75rem;
  line-height: 1.25;
  font-weight: 600;
}
.ui-safe-dialog > [role="dialog"] section[aria-labelledby="health-providers-heading"] > div.mb-3 {
  padding: 1rem;
  border-radius: 8px;
}
.ui-safe-dialog > [role="dialog"] section[aria-labelledby="health-repositories-heading"] > #health-repos > div {
  margin-top: 0.75rem;
  padding: 0.75rem;
  border: 1px solid rgb(var(--ui-border));
  border-radius: 8px;
  background: rgb(var(--ui-canvas));
}
.ui-safe-dialog > [role="dialog"] section[aria-labelledby="health-repositories-heading"] > #health-repos > div > span:first-child {
  color: rgb(var(--ui-text));
  font-weight: 600;
}
.ui-safe-dialog > [role="dialog"] section[aria-labelledby="health-providers-heading"] > div.mb-3 > div.grid {
  padding-top: 0.375rem;
  padding-bottom: 0.375rem;
}
@media (min-width: 640px) {
  .ui-safe-dialog > [role="dialog"] section[aria-labelledby="health-activity-heading"] {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
`;
const WINDOW = '    <style id="katlab-diagnostic-studio">\n'
  + CSS.split("\n").slice(0, -1).map(line => "      " + line + "\n").join("") + "    </style>\n";
const TITLE = "    <title>KATLAB Tracking Monitor</title>\n";
const STATION = 'import { restoreAttributionStationHtml } from "./helpers/attributionStation.mjs";\n';
const STATION_BOTH = 'import { restoreAttributionStationHtml, restoreAttributionWorkbenchSuite } from "./helpers/attributionStation.mjs";\n';
const ORIGINAL_READER = 'const read = name => new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(readFileSync(resolve(root, name)));\n';
const DESK_READER = String.raw`const read = name => {
  const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(readFileSync(resolve(root, name)));
  if (name === "Frontend/index.html") return restoreAttributionStationHtml(text);
  if (name === "Tests/test_workbench_2_0.mjs") return restoreAttributionWorkbenchSuite(text);
  return text;
};
`;
const CURRENT_DESK_READER = String.raw`const read = name => {
  const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(readFileSync(resolve(root, name)));
  if (name === "Frontend/index.html") return restoreAttributionStationHtml(studioHtml(text));
  if (name === "Tests/test_workbench_2_0.mjs") return restoreAttributionWorkbenchSuite(studioWorkbench(text));
  return text;
};
`;
const CURRENT_STATION_READER = String.raw`const read = name => {
  const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(readFileSync(resolve(root, name)));
  if (name === "Frontend/index.html") return studioHtml(text);
  if (name === "Tests/test_workbench_2_0.mjs") return studioWorkbench(text);
  if (name === "Tests/test_changes_review_desk.mjs") return studioChanges(text);
  return text;
};
`;
const ADAPTERS = {
  workbench: {
    prior: STATION,
    imported: 'import { studioHtml } from "./helpers/diagnosticStudio.mjs";\n',
    current: 'const html = restoreChangesReviewDeskHtml(restoreAttributionStationHtml(studioHtml(read("Frontend/index.html"))));\n',
    original: 'const html = restoreChangesReviewDeskHtml(restoreAttributionStationHtml(read("Frontend/index.html")));\n',
    owner: "html", functions: ["studioHtml"],
  },
  changes: {
    prior: STATION_BOTH,
    imported: 'import { studioHtml, studioWorkbench } from "./helpers/diagnosticStudio.mjs";\n',
    current: CURRENT_DESK_READER, original: DESK_READER,
    owner: "read", functions: ["studioHtml", "studioWorkbench"],
  },
  station: {
    prior: STATION_BOTH,
    imported: 'import { studioHtml, studioWorkbench, studioChanges } from "./helpers/diagnosticStudio.mjs";\n',
    current: CURRENT_STATION_READER, original: ORIGINAL_READER,
    owner: "read", functions: ["studioHtml", "studioWorkbench", "studioChanges"],
  },
};
function normalize (text) {
  assert.equal(typeof text, "string", "UTF8 text");
  assert.equal(Buffer.from(text, "utf8").toString("utf8"), text, "valid Unicode");
  assert.ok(!text.startsWith("\uFEFF") && !text.includes("\0"), "no BOM or NUL");
  const eol = text.includes("\r\n") ? "\r\n" : "\n", rest = text.replace(/\r\n/g, "");
  assert.ok(!rest.includes("\r") && (eol === "\n" || !rest.includes("\n")), "uniform LF or CRLF");
  const value = text.replace(/\r\n/g, "\n");
  assert.ok(value.endsWith("\n") && !value.endsWith("\n\n"), "single EOF");
  assert.doesNotMatch(value, /[\t ]+$/m, "no trailing whitespace");
  return { value, eol };
}
const count = (value, needle) => value.split(needle).length - 1;
const physical = (value, eol) => eol === "\r\n" ? value.replace(/\n/g, eol) : value;
const one = (values, predicate, label) => {
  const found = values.filter(predicate); assert.equal(found.length, 1, label); return found[0];
};
function parse (value) {
  const ast = ts.createSourceFile("preservation.mjs", value, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  assert.equal(ast.parseDiagnostics.length, 0, "valid complete preservation JavaScript"); return ast;
}
export function studioHtml (text) {
  const { value, eol } = normalize(text), start = value.indexOf(WINDOW);
  assert.equal(count(value, WINDOW), 1, "one complete fourth window");
  assert.equal(count(value, TITLE), 1, "one unchanged title");
  assert.equal((value.match(/<style\b/g) ?? []).length, 4, "four style owners");
  assert.equal((value.match(/<\/style>/g) ?? []).length, 4, "four closed styles");
  assert.equal((value.match(/<head>/g) ?? []).length, 1, "one direct head");
  assert.ok(start > value.indexOf("<head>") && start < value.indexOf("</head>"), "direct head site");
  assert.ok(value.slice(0, start).endsWith("    </style>\n"), "after unchanged Station");
  assert.ok(value.slice(start + WINDOW.length).startsWith(TITLE), "immediately before title");
  assert.equal(sha(value), "98b8ebb28a50a8575ee5d99347c41cc4334812b2f7cca77f5fd9b77f3212a330", "entire current HTML");
  const original = value.replace(WINDOW, "");
  assert.equal(sha(original), "4dbd135da0398e5c399724cc7ad4547d216f70b393bb5d5f3210002842d40e2b", "entire original HTML");
  return physical(original, eol);
}
function restoreSuite (text, kind) {
  const { value, eol } = normalize(text), spec = ADAPTERS[kind], ast = parse(value);
  assert.equal(count(value, spec.imported), 1, "one physical import");
  assert.equal(count(value, spec.prior + spec.imported), 1, "immediate import site");
  assert.equal(count(value, spec.current), 1, "one physical reader window");
  const imported = one(ast.statements, node => ts.isImportDeclaration(node)
    && node.moduleSpecifier.text === "./helpers/diagnosticStudio.mjs", "one top-level Studio import");
  assert.equal(imported.getText(ast) + "\n", spec.imported, "exact named import");
  const reader = one(ast.statements, node => ts.isVariableStatement(node)
    && node.declarationList.declarations.some(item => item.name.getText(ast) === spec.owner), "one top-level reader");
  assert.equal(reader.getText(ast) + "\n", spec.current, "exact owning reader");
  for (const name of spec.functions) {
    let identifiers = 0;
    const visit = node => { if (ts.isIdentifier(node) && node.text === name) identifiers++; ts.forEachChild(node, visit); };
    visit(ast); assert.equal(identifiers, 2, "only the import and approved call for " + name);
  }
  const original = value.replace(spec.imported, "").replace(spec.current, spec.original);
  parse(original); // Syntax validation only; never execute historic owners.
  return physical(original, eol);
}
export const studioWorkbench = text => restoreSuite(text, "workbench");
export const studioChanges = text => restoreSuite(text, "changes");
export const studioStation = text => restoreSuite(text, "station");
