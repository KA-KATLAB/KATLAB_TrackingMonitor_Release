import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";

const ts = createRequire(new URL("../../Frontend/package.json", import.meta.url))("typescript");
const sha = text => createHash("sha256").update(text).digest("hex");
// Independent preservation literal. Restored HTML/JavaScript is never executed.
const CSS = String.raw`/* Attribution Station: queue hierarchy; existing assignment behavior stays. */
#root #main-content > div > .changes-workbench > #sec-pick > section[aria-label="Manual attribution queue"] {
  padding: 1.25rem;
  border: 1px solid rgb(var(--ui-warning) / 0.5);
  border-radius: 8px;
  background: rgb(var(--ui-surface));
}
#root #main-content > div > .changes-workbench > #sec-pick > section[aria-label="Manual attribution queue"] > .ui-section-heading {
  margin-bottom: 1.25rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid rgb(var(--ui-border));
}
#root #main-content > div > .changes-workbench > #sec-pick > section[aria-label="Manual attribution queue"] > fieldset {
  gap: 0.75rem;
  margin-bottom: 1.25rem;
  padding: 1rem;
  border: 1px solid rgb(var(--ui-border));
  border-radius: 8px;
  background: rgb(var(--ui-canvas));
}
#root #main-content > div > .changes-workbench > #sec-pick > section[aria-label="Manual attribution queue"] > fieldset > label {
  gap: 0.5rem;
  min-height: 44px;
}
#root #main-content > div > .changes-workbench > #sec-pick > section[aria-label="Manual attribution queue"] > fieldset > button {
  min-height: 44px;
  padding: 0.5rem 1rem;
}
#root #main-content > div > .changes-workbench > #sec-pick > section[aria-label="Manual attribution queue"] > fieldset > button[aria-haspopup="dialog"] {
  flex: 1 1 14rem;
}
#root #main-content > div > .changes-workbench > #sec-pick > section[aria-label="Manual attribution queue"] > .ui-work-row {
  align-items: center;
  gap: 0.75rem;
  margin-top: 0.75rem;
  padding: 1rem;
  border: 1px solid rgb(var(--ui-border));
  border-radius: 8px;
  background: rgb(var(--ui-canvas));
}
#root #main-content > div > .changes-workbench > #sec-pick > section[aria-label="Manual attribution queue"] > .ui-work-row > label {
  gap: 0.5rem;
  min-height: 44px;
}
#root #main-content > div > .changes-workbench > #sec-pick > section[aria-label="Manual attribution queue"] > .ui-work-row > span.font-mono {
  flex-basis: 100%;
}
#root #main-content > div > .changes-workbench > #sec-pick > section[aria-label="Manual attribution queue"] > .ui-work-row > button {
  min-height: 44px;
  padding: 0.5rem 1rem;
}
#root #main-content > div > .changes-workbench > #sec-pick > section[aria-label="Manual attribution queue"] > .ui-work-row > button[aria-haspopup="dialog"] {
  flex: 1 1 14rem;
}
#root #main-content > div > .changes-workbench > #sec-pick > section[aria-label="Manual attribution queue"] > fieldset > span.text-slate-400:not(.sr-only) {
  flex-basis: 100%;
  overflow-wrap: anywhere;
}
#root #main-content > div > .changes-workbench > #sec-pick > section[aria-label="Manual attribution queue"] > .ui-work-row > span.basis-full.text-xs.text-slate-400 {
  padding-top: 0.25rem;
  overflow-wrap: anywhere;
}
#root #main-content > div > .changes-workbench > #sec-pick > section[aria-label="Manual attribution queue"] > .ui-work-row > span.italic {
  flex-basis: 100%;
  padding: 0.75rem;
  border: 1px solid rgb(var(--ui-border));
  border-radius: 8px;
  background: rgb(var(--ui-surface));
  overflow-wrap: anywhere;
}
`;
const WINDOW = '    <style id="katlab-attribution-station">\n'
  + CSS.split("\n").slice(0, -1).map(line => "      " + line + "\n").join("") + "    </style>\n";
const TITLE = "    <title>KATLAB Tracking Monitor</title>\n";
const BEFORE = 'import { restoreChangesReviewDeskHtml } from "./helpers/changesReviewDesk.mjs";\n';
const IMPORT = 'import { restoreAttributionStationHtml } from "./helpers/attributionStation.mjs";\n';
const CURRENT_READ = 'const html = restoreChangesReviewDeskHtml(restoreAttributionStationHtml(read("Frontend/index.html")));\n';
const OLD_READ = 'const html = restoreChangesReviewDeskHtml(read("Frontend/index.html"));\n';

function normalize (text) {
  assert.equal(typeof text, "string", "UTF8 text required");
  assert.equal(Buffer.from(text, "utf8").toString("utf8"), text, "valid Unicode");
  assert.ok(!text.startsWith("\uFEFF") && !text.includes("\0"), "no BOM or NUL");
  const eol = text.includes("\r\n") ? "\r\n" : "\n", rest = text.replace(/\r\n/g, "");
  assert.ok(!rest.includes("\r") && (eol === "\n" || !rest.includes("\n")), "uniform LF or CRLF");
  const value = text.replace(/\r\n/g, "\n");
  assert.ok(value.endsWith("\n") && !value.endsWith("\n\n"), "single EOF");
  assert.doesNotMatch(value, /[\t ]+$/m, "no trailing whitespace");
  return { value, eol };
}
const count = (text, literal) => text.split(literal).length - 1;
const restoreEol = (text, eol) => eol === "\r\n" ? text.replace(/\n/g, "\r\n") : text;

export function restoreAttributionStationHtml (text) {
  const { value, eol } = normalize(text), start = value.indexOf(WINDOW);
  assert.equal(count(value, WINDOW), 1, "one exact third style");
  assert.equal(count(value, TITLE), 1, "one unchanged title");
  assert.equal((value.match(/<style\b/g) ?? []).length, 3, "three style owners");
  assert.equal((value.match(/<\/style>/g) ?? []).length, 3, "three closed styles");
  assert.ok(start > value.indexOf("<head>") && start < value.indexOf("</head>"), "direct head site");
  assert.ok(value.slice(0, start).endsWith("    </style>\n"), "after prior style");
  assert.ok(value.slice(start + WINDOW.length).startsWith(TITLE), "immediately before title");
  assert.equal(sha(value), "4dbd135da0398e5c399724cc7ad4547d216f70b393bb5d5f3210002842d40e2b", "entire current HTML");
  const original = value.replace(WINDOW, "");
  assert.equal(sha(original), "f8381b7e989a4cc38987c847182713517de6f524aa49efa5794a34b298b11ad3", "entire prior HTML");
  return restoreEol(original, eol);
}

export function restoreAttributionWorkbenchSuite (text) {
  const { value, eol } = normalize(text);
  assert.equal(count(value, IMPORT), 1, "one physical import window");
  assert.equal(count(value, BEFORE + IMPORT), 1, "immediate import site");
  assert.equal(count(value, CURRENT_READ), 1, "one physical initializer window");
  const ast = ts.createSourceFile("workbench.mjs", value, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  assert.equal(ast.parseDiagnostics.length, 0, "valid complete suite");
  const imported = ast.statements.filter(node => ts.isImportDeclaration(node)
    && node.moduleSpecifier.text === "./helpers/attributionStation.mjs");
  assert.equal(imported.length, 1, "one top-level adapter import");
  assert.equal(imported[0].getText(ast) + "\n", IMPORT, "exact named import");
  const declarations = ast.statements.filter(ts.isVariableStatement)
    .flatMap(node => [...node.declarationList.declarations])
    .filter(node => ts.isIdentifier(node.name) && node.name.text === "html");
  assert.equal(declarations.length, 1, "one top-level HTML owner");
  assert.equal(declarations[0].parent.parent.getText(ast) + "\n", CURRENT_READ, "exact owning initializer");
  // Do not swallow unrelated assertion changes; callers prove the complete prior hash.
  const original = value.replace(IMPORT, "").replace(CURRENT_READ, OLD_READ);
  return restoreEol(original, eol);
}
