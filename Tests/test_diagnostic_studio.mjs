import { historyStationPreservation } from "./helpers/historyReviewStation.mjs";
import { activePlanDocketPreservation } from "./helpers/activePlanDocket.mjs";
import { purposeNavigationPreservation } from "./helpers/purposeLedNavigation.mjs";
import { cityBriefPreservation } from "./helpers/cityDistrictBrief.mjs";
import { mastheadPreservation } from "./helpers/workspaceCommandMasthead.mjs";
import { deskPreservation } from "./helpers/changesReviewLanes.mjs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { studioHtml, studioWorkbench, studioChanges, studioStation } from "./helpers/diagnosticStudio.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), ".."), frontend = resolve(root, "Frontend");
const require = createRequire(resolve(frontend, "package.json"));
const ts = require("typescript"), postcss = require("postcss"), selectors = require("postcss-selector-parser"), React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const read = name => new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(readFileSync(resolve(root, name)));
const sha = value => createHash("sha256").update(value).digest("hex"), lf = text => text.replace(/\r\n/g, "\n");
// Independently frozen oracles. Neither adapters, product code nor ignored plans supply them.
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
const BEFORE_HTML = "4dbd135da0398e5c399724cc7ad4547d216f70b393bb5d5f3210002842d40e2b";
const CURRENT_HTML = "98b8ebb28a50a8575ee5d99347c41cc4334812b2f7cca77f5fd9b77f3212a330";
const CSS_SHA = "973304f7ebf31cc39aff9978c482da652b4a718eb70beea341743df8448ad54a";
const WINDOW_SHA = "6e2442cd262fe3c1e42836c1d54a49046e086b3948db687a6b54ae4a8f9144f9";
const base = '.ui-safe-dialog > [role="dialog"] section[aria-labelledby="health-';
const server = base + 'server-heading"]', activity = base + 'activity-heading"]';
const providers = base + 'providers-heading"]', repositories = base + 'repositories-heading"]';
const sectionSelectors = [server, activity, providers, repositories];
const mono = '"Azeret Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
const RULES = [
  [null, sectionSelectors, [["padding", "1.25rem"], ["border-radius", "8px"]]],
  [null, sectionSelectors.map(value => value + " > h3"), [["margin-bottom", "1rem"],
    ["padding-bottom", "0.75rem"], ["border-bottom", "1px solid rgb(var(--ui-border))"],
    ["font-size", "1.25rem"], ["line-height", "1.4"]]],
  [null, [server + " > div.grid"], [["padding-top", "0.375rem"], ["padding-bottom", "0.375rem"],
    ["border-bottom", "1px solid rgb(var(--ui-border))"]]],
  [null, [activity], [["display", "grid"], ["grid-template-columns", "minmax(0, 1fr)"], ["gap", "0.75rem"]]],
  [null, [activity + " > h3"], [["grid-column", "1 / -1"], ["margin-bottom", "0"]]],
  [null, [activity + " > div.grid"], [["grid-template-columns", "minmax(0, 1fr)"], ["gap", "0.5rem"],
    ["padding", "1rem"], ["border", "1px solid rgb(var(--ui-border))"],
    ["border-radius", "8px"], ["background", "rgb(var(--ui-canvas))"]]],
  [null, [activity + " > div.grid > span:first-child"], [["font-size", "0.875rem"], ["line-height", "1.4"]]],
  [null, [activity + " > div.grid > span:last-child"], [["font-family", mono], ["font-size", "1.75rem"],
    ["line-height", "1.25"], ["font-weight", "600"]]],
  [null, [providers + " > div.mb-3"], [["padding", "1rem"], ["border-radius", "8px"]]],
  [null, [repositories + " > #health-repos > div"], [["margin-top", "0.75rem"], ["padding", "0.75rem"],
    ["border", "1px solid rgb(var(--ui-border))"], ["border-radius", "8px"], ["background", "rgb(var(--ui-canvas))"]]],
  [null, [repositories + " > #health-repos > div > span:first-child"], [["color", "rgb(var(--ui-text))"], ["font-weight", "600"]]],
  [null, [providers + " > div.mb-3 > div.grid"], [["padding-top", "0.375rem"], ["padding-bottom", "0.375rem"]]],
  ["(min-width: 640px)", [activity], [["grid-template-columns", "repeat(2, minmax(0, 1fr))"]]],
];
const ORIGINAL_READ = 'const read = name => new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(readFileSync(resolve(root, name)));\n';
const OLD_DESK_READ = String.raw`const read = name => {
  const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(readFileSync(resolve(root, name)));
  if (name === "Frontend/index.html") return restoreAttributionStationHtml(text);
  if (name === "Tests/test_workbench_2_0.mjs") return restoreAttributionWorkbenchSuite(text);
  return text;
};
`;
const CURRENT_DESK_READ = String.raw`const read = name => {
  const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(readFileSync(resolve(root, name)));
  if (name === "Frontend/index.html") return restoreAttributionStationHtml(studioHtml(text));
  if (name === "Tests/test_workbench_2_0.mjs") return restoreAttributionWorkbenchSuite(studioWorkbench(text));
  return text;
};
`;
const CURRENT_STATION_READ = String.raw`const read = name => {
  const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(readFileSync(resolve(root, name)));
  if (name === "Frontend/index.html") return studioHtml(text);
  if (name === "Tests/test_workbench_2_0.mjs") return studioWorkbench(text);
  if (name === "Tests/test_changes_review_desk.mjs") return studioChanges(text);
  return text;
};
`;
const STATION_IMPORT = 'import { restoreAttributionStationHtml } from "./helpers/attributionStation.mjs";\n';
const STATION_BOTH = 'import { restoreAttributionStationHtml, restoreAttributionWorkbenchSuite } from "./helpers/attributionStation.mjs";\n';
const SUITES = [
  ["workbench", "Tests/test_workbench_2_0.mjs", studioWorkbench, 43805, 513,
    "1876f3df56b16efb3f27c4da1fddd4fc6907433921183679b8456ad2199e6c53", STATION_IMPORT,
    'import { studioHtml } from "./helpers/diagnosticStudio.mjs";\n',
    'const html = restoreChangesReviewDeskHtml(restoreAttributionStationHtml(studioHtml(read("Frontend/index.html"))));\n',
    'const html = restoreChangesReviewDeskHtml(restoreAttributionStationHtml(read("Frontend/index.html")));\n'],
  ["changes", "Tests/test_changes_review_desk.mjs", studioChanges, 38759, 534,
    "64ef4b2f393a5529864f602ce1047dec7aba44ea67b67877a83b3a5e3ed8b26b", STATION_BOTH,
    'import { studioHtml, studioWorkbench } from "./helpers/diagnosticStudio.mjs";\n', CURRENT_DESK_READ, OLD_DESK_READ],
  ["station", "Tests/test_attribution_station.mjs", studioStation, 41380, 527,
    "850f0265c27a3832ec49f74438f059a5bd630e674be5d8575b53a777b0cf503f", STATION_BOTH,
    'import { studioHtml, studioWorkbench, studioChanges } from "./helpers/diagnosticStudio.mjs";\n',
    CURRENT_STATION_READ, ORIGINAL_READ],
];
const PINS = [
  [
    "Frontend/src/App.tsx",
    "945c8879e94b5d7a8410d2a143ed2e127e2653dd1a123d2d8b4cd306758a6f3e",
    "c7c568b346c7ddf00d86b93325b97854e59f3f625f6fd916b056e85ccf069b1a"
  ],
  [
    "Frontend/src/healthPanel.tsx",
    "6cc894aa760ed66eada96511a3494f64f4b317cf15d74ad0a03ae7631d802173",
    "10a230292425ab64fc1fc378771026727138565f708b0b637345edaab870dbd5"
  ],
  [
    "Frontend/src/dialog.tsx",
    "aaeda6eec7080c96b4992d6944444d21ab518ba5987e8a5abd8100423dd136b0",
    "86f96a3c1454baf8337409995abb81f11ad57ce74d8f4288cbe5ac350991715a"
  ],
  [
    "Frontend/src/healthRequest.ts",
    "98ca3e30bd5725789060df12a9e49d3e1aaf03aaba243351e5a54e6c3ae24baa",
    "63d6d8bd41c52ff86f973b5d8c5f46da061ce335b5dd97521217d82644166f98"
  ],
  [
    "Frontend/src/healthModel.ts",
    "bf3f6425b5920677ca854692af3712af9a099492bec9a5433845b44bff68a824",
    "7927c2898c6e1cf4dedb71a48de92fbd04d9e9cfd5a8e5253e34925bf0b746a2"
  ],
  [
    "Frontend/src/api.ts",
    "b21da4367bb2c9007a62b9ed097fd943286ffb3c863de23ee565acd01b2323a0",
    "2bdccf5c79ccf5a72f9696df00a924ff918a82c6cf8e4f15ba2a69b39e7cd2b8"
  ],
  [
    "Frontend/src/ui.tsx",
    "b5650b9e2a3529ff1ca033ed077d7b806f0cc9341c9733b4b3a52c107ab99974",
    "e1c2ad05398cf771ee17ba576b7feecf03829459379b9e02e35c58aea5004c46"
  ],
  [
    "Frontend/src/index.css",
    "9371bc04cba0b62e8a8e5e3b4a9251deea9273be58f4b9735982e0649527ba81",
    "788436e9def1e7109fe98d4bfa5e0add49a5f0ca301b17416279c03f18ede0f5"
  ],
  [
    "Frontend/tailwind.config.js",
    "cdb058b068e26db24bcce71d68939611bc4ce651d1bfbaa49907dbb8ffa5ed76",
    "cdb058b068e26db24bcce71d68939611bc4ce651d1bfbaa49907dbb8ffa5ed76"
  ],
  [
    "Frontend/src/dialogStatus.tsx",
    "b508e129c131925e3fcdf42162c82db1290d19dd5d8cf715f2f4aca8c05e000e",
    "b8bd287f0aa948278a86e211dbc945ed555a17d62c377c85667efcd5c5c7a13d"
  ],
  [
    "Frontend/src/appVersion.ts",
    "7ff2c3778d17c04858ff9113efdd94c7992dc2f9f440f7a190e17e7a5369f3eb",
    "78186b0c0e4bf982be9b7a6eed48ac54379f79764de6df88df5cc0bdccc489db"
  ],
  [
    "Frontend/src/format.ts",
    "4c7f1cb040c38a5ef75787c6f7325db6fc162a6890df0fb693e916aa62d8c87f",
    "4c7f1cb040c38a5ef75787c6f7325db6fc162a6890df0fb693e916aa62d8c87f"
  ],
  [
    "Tests/test_health_ui.mjs",
    "20a5e4cf3b3f7edb5d326dd3c02e4772caca16b37ec7a77d056f34e619b24f54",
    "3263357417db04ceabdc8b42bad9aa644419a414fcb595feed8b9958a2eb1bb2"
  ],
  [
    "Tests/test_health_request.mjs",
    "17f2e2c75ca4e96940ca5fdb5528d9bfb577d63c9d989c51fa1e028bb95e1523",
    "0c7baecab76765eb99ae65c73aed0ca051e2a4cbc9ba55d017ad5bb6a13e08eb"
  ],
  [
    "Tests/test_system_snapshot_panels.mjs",
    "2d84f20f7194de62d0656b7220a37c367c37696a33a6a12d673bce0c55c25a65",
    "2d84f20f7194de62d0656b7220a37c367c37696a33a6a12d673bce0c55c25a65"
  ],
  [
    "Tests/helpers/changesReviewDesk.mjs",
    "ee93e4f9c31026e24b9c42071ed10cd63b3181d75d5423c5a0a0c60ddc3a98a6",
    "ee93e4f9c31026e24b9c42071ed10cd63b3181d75d5423c5a0a0c60ddc3a98a6"
  ],
  [
    "Tests/helpers/attributionStation.mjs",
    "67d9956debeb82a67b51aa68c73b6864915ef49e596f0cb1c7c8b0917c72c647",
    "67d9956debeb82a67b51aa68c73b6864915ef49e596f0cb1c7c8b0917c72c647"
  ],
  [
    "Frontend/package.json",
    "b131be7e90ba2500b01371e594e10c482b94cf651ab425ddf7efaea76b759b9d",
    "541a787d69fa512a53de01b53240e2e94ac22f068da882e0c2496f68ee5bf1a1"
  ],
  [
    "Frontend/package-lock.json",
    "0c39bf19779991e4565e00845a061fc954afdfe988d9026c6c356957e2b02258",
    "d5ccfda11d2d07b4a707b18aca87b866a135182a3bd33ce2380c21730809ce75"
  ],
  [
    "Frontend/tsconfig.json",
    "97997252d286ecf7a8a4b12a51ac2fdd9199f3b9bf5e14e8d4f7d4e5e60d3f3f",
    "97997252d286ecf7a8a4b12a51ac2fdd9199f3b9bf5e14e8d4f7d4e5e60d3f3f"
  ],
  [
    "Frontend/vite.config.ts",
    "6f25836874cc3ca4c97781dd0140ab1e7fee796b3b0c67a67ffdb8600e67cd6b",
    "4631f5c7380fa909b5b361bf8eb7fdac29a665144ca260f9ac30be30ce83f107"
  ],
  [
    "Backend/requirements.txt",
    "f750d19859ca5621eea836592d2038857f73e8857bcace96752ce6dadf004ea3",
    "f24979c56dd6d095f18541462485fb62229cfddf0fa8784d7c7dd9fbb535d0b5"
  ],
  [
    "Scripts/Chronicle/requirements.txt",
    "9d91436f670aac600f39beb184f7278774dc94e470dfca37f092bb0e3d461722",
    "562f66ed699de7d73e464c6be1a0938b6b19a8c2f69fe4b955209f0981986a2d"
  ]
];
const one = (items, predicate, label = "one owner") => {
  const found = items.filter(predicate); assert.equal(found.length, 1, label); return found[0];
};
const count = (text, needle) => text.split(needle).length - 1;
const physical = (text, eol) => eol === "\r\n" ? text.replace(/\n/g, eol) : text;
const replaceOnce = (text, before, after) => { assert.equal(count(text, before), 1); return text.replace(before, after); };
function ending (text) {
  assert.equal(Buffer.from(text, "utf8").toString("utf8"), text);
  assert.ok(!text.startsWith("\uFEFF") && !text.includes("\0"));
  const rest = text.replace(/\r\n/g, ""), eol = text.includes("\r\n") ? "\r\n" : "\n";
  assert.ok(!rest.includes("\r") && (eol === "\n" || !rest.includes("\n")));
  assert.ok(lf(text).endsWith("\n") && !lf(text).endsWith("\n\n"));
  assert.doesNotMatch(text, /[\t ]+$/m); return eol;
}
function parse (text, name = "actual.tsx") {
  const ast = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true,
    name.endsWith(".mjs") ? ts.ScriptKind.JS : ts.ScriptKind.TSX);
  assert.equal(ast.parseDiagnostics.length, 0, name); return ast;
}
const all = node => { const out = []; const visit = value => { out.push(value); ts.forEachChild(value, visit); }; visit(node); return out; };
const owner = (ast, name) => one(ast.statements, node => ts.isFunctionDeclaration(node) && node.name?.text === name
  || ts.isVariableStatement(node) && node.declarationList.declarations.some(item => item.name.getText(ast) === name), name);
const finalReturn = (ast, name) => owner(ast, name).body.statements.at(-1);
function property (node, name, ast) {
  const attr = node.openingElement.attributes.properties.find(value => ts.isJsxAttribute(value) && value.name.getText(ast) === name);
  return attr?.initializer && ts.isStringLiteral(attr.initializer) ? attr.initializer.text : undefined;
}
function checkCss (text) {
  assert.equal(ending(text), "\n");
  const ast = postcss.parse(text); assert.equal(ast.nodes.length, 14);
  assert.equal(ast.nodes[0].type, "comment");
  assert.equal(ast.nodes[0].text, "Diagnostic Studio: named snapshot sections; health behavior stays.");
  const actual = [];
  for (const [index, node] of ast.nodes.slice(1).entries()) {
    let media = null, rules = [node];
    if (index === 12) {
      assert.equal(node.type, "atrule"); assert.equal(node.name, "media"); assert.equal(node.params, "(min-width: 640px)");
      assert.equal(node.nodes.length, 1); media = node.params; rules = node.nodes;
    }
    for (const rule of rules) {
      assert.equal(rule.type, "rule"); assert.equal(rule.parent, media ? node : ast);
      const parsed = selectors().astSync(rule.selector);
      actual.push([media, parsed.nodes.map(value => value.toString().trim()), rule.nodes.map(value => {
        assert.equal(value.type, "decl", "no nested node escape"); assert.equal(Boolean(value.important), false);
        return [value.prop, value.value];
      })]);
    }
  }
  assert.deepEqual(actual, RULES); assert.equal(text, CSS); return ast;
}
function independentHtmlInverse (text) {
  const eol = ending(text), value = lf(text), at = value.indexOf(WINDOW);
  assert.equal(count(value, WINDOW), 1); assert.equal(count(value, TITLE), 1);
  assert.deepEqual([...value.matchAll(/<style id="([^"]+)">/g)].map(match => match[1]),
    ["katlab-workbench-v2", "katlab-changes-review-desk", "katlab-attribution-station", "katlab-diagnostic-studio"]);
  assert.equal((value.match(/<\/style>/g) ?? []).length, 4);
  assert.ok(at > value.indexOf("<head>") && at < value.indexOf("</head>"));
  assert.ok(value.slice(0, at).endsWith("    </style>\n")); assert.ok(value.slice(at + WINDOW.length).startsWith(TITLE));
  assert.equal(sha(value), CURRENT_HTML);
  const restored = value.replace(WINDOW, ""); assert.equal(sha(restored), BEFORE_HTML);
  return physical(restored, eol);
}
function independentSuiteInverse (text, spec) {
  const eol = ending(text), value = lf(text), ast = parse(value, "actual.mjs");
  const [, , , , , , previous, imported, current, original] = spec;
  assert.equal(count(value, previous + imported), 1); assert.equal(count(value, imported), 1); assert.equal(count(value, current), 1);
  const node = one(ast.statements, value => ts.isImportDeclaration(value) && value.moduleSpecifier.text === "./helpers/diagnosticStudio.mjs");
  assert.equal(node.getText(ast) + "\n", imported);
  const reader = owner(ast, spec[0] === "workbench" ? "html" : "read");
  assert.equal(reader.getText(ast) + "\n", current);
  const restored = value.replace(imported, "").replace(current, original);
  parse(restored, "historic-preservation-only.mjs"); return physical(restored, eol);
}
test("independent twelve-root plus media CSS and complete fourth-window HTML inverses", () => {
  assert.equal(Buffer.byteLength(CSS), 3152); assert.equal(count(CSS, "\n"), 74); assert.equal(sha(CSS), CSS_SHA);
  assert.equal(Buffer.byteLength(WINDOW), 3651); assert.equal(sha(WINDOW), WINDOW_SHA); checkCss(CSS);
  const source = deskPreservation("Frontend/index.html", mastheadPreservation("Frontend/index.html", purposeNavigationPreservation("Frontend/index.html", read("Frontend/index.html")))); assert.equal(ending(source), "\n");
  assert.equal(Buffer.byteLength(source), 13548); assert.equal(count(source, "\n"), 295);
  for (const eol of ["\n", "\r\n"]) {
    const current = physical(lf(source), eol), original = independentHtmlInverse(current);
    assert.equal(studioHtml(current), original); assert.equal(Buffer.byteLength(lf(original)), 9897);
    assert.equal(count(lf(original), "\n"), 219); assert.equal(ending(original), eol);
    const at = current.indexOf(physical(WINDOW, eol));
    assert.equal(current.slice(0, at), original.slice(0, at));
    assert.equal(current.slice(at + physical(WINDOW, eol).length), original.slice(at));
    assert.equal(count(original, "\u2014"), count(current, "\u2014"), "all original Unicode retained");
  }
});
test("fourth-owner HTML rejects structural, identity, byte and outside-window mutations", () => {
  const source = deskPreservation("Frontend/index.html", mastheadPreservation("Frontend/index.html", purposeNavigationPreservation("Frontend/index.html", read("Frontend/index.html")))), original = independentHtmlInverse(source);
  const values = [original, source.replace(WINDOW, WINDOW + WINDOW), source.replace(WINDOW, "<!--" + WINDOW + "-->\n"),
    source.replace(WINDOW, "").replace("  </head>\n", WINDOW + "  </head>\n"),
    source.replace(WINDOW, "").replace("  </body>\n", WINDOW + "  </body>\n"),
    source.replace(WINDOW, '<div>' + WINDOW + '</div>\n'), source.replace(WINDOW, '<style>\n' + WINDOW + '</style>\n'),
    source.replace('id="katlab-diagnostic-studio"', 'id="different"'), source.replace("  font-weight: 600;", "  font-weight: 500;"),
    source.replace("    <title>", "    <!--title--> <title>"), source.replace('<html lang="en">', '<html lang="vi">')];
  for (const value of values) for (const eol of ["\n", "\r\n"]) {
    assert.throws(() => studioHtml(physical(lf(value), eol)));
    assert.throws(() => independentHtmlInverse(physical(lf(value), eol)));
  }
  for (const value of ["\uFEFF" + source, source + "\0", source + "\n", source.trimEnd(),
    source.replace("\n", "\r"), source.replace("\n", "\r\n"), source.replace("<head>", "<head> ")])
    assert.throws(() => studioHtml(value));
});
test("all ordered selector lists/direct declarations reject escapes and incomplete contracts", () => {
  const attacks = [
    CSS.replace(server + ",", "body,"), CSS.replace(sectionSelectors.join(",\n"), [...sectionSelectors].reverse().join(",\n")),
    CSS.replace("  padding: 1.25rem;", "  padding: 2rem;"), CSS.replace("  padding: 1.25rem;", "  padding: 1.25rem !important;"),
    CSS.replace("  padding: 1.25rem;", "  padding: 1.25rem;\n  & span { color: red; }"),
    CSS.replace("  padding: 1.25rem;", "  @supports (display: grid) { span { color: red; } }"),
    CSS.replace("  padding: 1.25rem;", "  /* hidden child */\n  padding: 1.25rem;"),
    CSS.replace("  padding: 1.25rem;", "  padding: 1.25rem;\n  overflow: hidden;"),
    CSS.replace("  font-weight: 600;", "  font-weight: 600;\n  transition: all 1s;"),
    CSS.replace("  font-weight: 600;", "  font-weight: 600;\n  transform: scale(0.9);"),
    CSS.replace(mono, "sans-serif"), CSS.replace("min-width: 640px", "min-width: 768px"),
    CSS.replace("    grid-template-columns: repeat(2, minmax(0, 1fr));", '    grid-template-columns: repeat(2, minmax(0, 1fr));\n    @font-face { font-family: extra; src: url("x"); }'),
    CSS.replace("\n  }\n}\n", '\n  }\n  @font-face { font-family: extra; src: url("x"); }\n}\n'),
    CSS.replace("\n  }\n}\n", "\n  }\n  @supports (display: grid) { body { color: red; } }\n}\n"),
    CSS.replace("\n  }\n}\n", "\n  }\n  color: red;\n}\n"),
    CSS + "body { color: red; }\n", "@import 'x';\n" + CSS, CSS + "@media print { body { color: red; } }\n",
    CSS.replace("background: rgb(var(--ui-canvas))", 'background: url("remote")'),
    CSS.replace(" > div.grid > span:last-child", " span:last-child"),
    CSS.replace(" > div.mb-3 > div.grid", " div.grid"),
  ];
  for (const value of attacks) { assert.notEqual(value, CSS); assert.throws(() => checkCss(value)); }
  for (const value of ["\uFEFF" + CSS, CSS + "\0", CSS + "\n", CSS.trimEnd(), CSS.replace("\n", "\r\n"), CSS.replace("\n", "\r")])
    assert.throws(() => checkCss(value));
});
test("three exact two-window suite adapters preserve all original RAW/LF bytes and outside assertions", () => {
  for (const spec of SUITES) {
    const source = deskPreservation(spec[1], mastheadPreservation(spec[1], cityBriefPreservation(spec[1], purposeNavigationPreservation(spec[1], activePlanDocketPreservation(spec[1], historyStationPreservation(spec[1], read(spec[1]))))))), [, , restore, bytes, lines, pin, , imported, current] = spec;
    for (const eol of ["\n", "\r\n"]) {
      const fixture = physical(lf(source), eol), original = independentSuiteInverse(fixture, spec);
      assert.equal(restore(fixture), original); assert.equal(sha(lf(original)), pin);
      assert.equal(Buffer.byteLength(lf(original)), bytes); assert.equal(count(lf(original), "\n"), lines);
      assert.equal(ending(original), eol);
      const sentinel = fixture + physical('assert.equal("outside", "visible");\n', eol);
      const expected = original + physical('assert.equal("outside", "visible");\n', eol);
      assert.equal(restore(sentinel), expected); assert.notEqual(sha(lf(expected)), pin);
      const invalid = [fixture.replace(physical(imported, eol), ""), fixture.replace(physical(imported, eol), physical(imported + imported, eol)),
        fixture.replace(physical(imported, eol), physical("/*" + imported.trimEnd() + "*/\n", eol)),
        fixture.replace(physical(imported, eol), "").replace(physical(current, eol), physical(imported + current, eol)),
        fixture.replace(physical(current, eol), physical(current + current, eol)),
        fixture.replace("studioHtml(text)", "studioHtml('outside')").replace('studioHtml(read("Frontend/index.html"))', "studioHtml('outside')"),
        fixture.replace(physical(current, eol), physical("{\n" + current + "}\n", eol)),
        fixture + physical("void studioHtml(null);\n", eol)];
      for (const value of invalid) { assert.notEqual(value, fixture); assert.throws(() => restore(value)); }
    }
    for (const value of ["\uFEFF" + source, source + "\0", source + "\n", source.trimEnd(),
      source.replace("\n", "\r"), source.replace("\n", "\r\n")]) assert.throws(() => restore(value));
  }
});
test("whole current diagnostic, capture, shared helper and six dependency pins remain distinct RAW/LF", () => {
  for (const [name, rawPin, lfPin] of PINS) {
    const raw = deskPreservation(name, mastheadPreservation(name, cityBriefPreservation(name, purposeNavigationPreservation(name, activePlanDocketPreservation(name, historyStationPreservation(name, readFileSync(resolve(root, name)))))))), text = deskPreservation(name, mastheadPreservation(name, cityBriefPreservation(name, purposeNavigationPreservation(name, activePlanDocketPreservation(name, historyStationPreservation(name, read(name)))))));
    assert.equal(sha(raw), rawPin, "whole actual RAW " + name); assert.equal(sha(lf(text)), lfPin, "whole LF " + name);
    for (const eol of ["\n", "\r\n"]) assert.equal(sha(lf(physical(lf(text), eol))), lfPin);
  }
});
const healthSource = read("Frontend/src/healthPanel.tsx"), healthAst = parse(healthSource);
const dialogSource = read("Frontend/src/dialog.tsx"), dialogAst = parse(dialogSource);
test("current TSX binds four named sections, direct adjacent rows, exact units and unchanged portal/request owners", () => {
  const returned = finalReturn(healthAst, "HealthBody"), elements = all(returned).filter(ts.isJsxElement);
  const sections = elements.filter(node => node.openingElement.tagName.getText(healthAst) === "section");
  assert.deepEqual(sections.map(node => property(node, "aria-labelledby", healthAst)),
    ["health-server-heading", "health-activity-heading", "health-providers-heading", "health-repositories-heading"]);
  const activitySection = sections[1], activityRows = all(activitySection).filter(node =>
    ts.isJsxElement(node) && node.openingElement.tagName.getText(healthAst) === "Row");
  assert.deepEqual(activityRows.map(node => property(node, "label", healthAst)), ["pending", "rejected", "unscoped", "registry mismatch"]);
  assert.match(activityRows[2].getText(healthAst), /\{activity\.ignored_unscoped\} ignored/);
  assert.match(activityRows[3].getText(healthAst), /activity\.registry_revision_mismatch > 0/);
  const row = one(all(finalReturn(healthAst, "Row")), node => ts.isJsxElement(node)
    && node.openingElement.tagName.getText(healthAst) === "div");
  assert.deepEqual(row.children.filter(ts.isJsxElement).map(node => node.openingElement.tagName.getText(healthAst)), ["span", "span"]);
  assert.match(row.getText(healthAst), /sm:grid-cols-\[minmax\(7rem,10rem\)_minmax\(0,1fr\)\]/);
  assert.match(row.getText(healthAst), /tabular-nums text-ui-text \[overflow-wrap:anywhere\]/);
  assert.match(sections[2].getText(healthAst), /key=\{provider\.provider\}/);
  assert.match(sections[3].getText(healthAst), /key=\{repo\.id\}/);
  assert.match(sections[3].getText(healthAst), /last:border-0/);
  assert.match(finalReturn(healthAst, "HealthModal").getText(healthAst), /panelClassName="max-w-2xl"/);
  const modal = owner(healthAst, "HealthModal").getText(healthAst);
  for (const text of ["return startHealthRequest({", "request: api.health", "if (busy || retryPendingRef.current) return;",
    "receivedAt: new Date().toISOString()", "onClose={onClose}", "backdropClose"]) assert.ok(modal.includes(text));
  const portal = finalReturn(dialogAst, "DialogShell").getText(dialogAst);
  for (const text of ["createPortal(", "document.body", 'role="dialog"', "ui-safe-dialog", "max-w-2xl",
    "max-h-[calc(100dvh-2rem)]", 'min-h-0 overflow-y-auto p-4']) assert.ok(portal.includes(text));
  assert.match(dialogSource, /onCloseRef\.current\(\)/); assert.match(dialogSource, /opener\.focus\(\{ preventScroll: true \}\)/);
  assert.match(read("Frontend/src/healthRequest.ts"), /action\.signal\.removeEventListener\("abort", onAbort\)/);
});
let vite, health, model, format, ui, versionApi, buildVersion;
before(async () => {
  const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
  vite = await createServer({ root: frontend, server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom", optimizeDeps: { noDiscovery: true, entries: [] } });
  [health, model, format, ui, versionApi] = await Promise.all([
    vite.ssrLoadModule("/src/healthPanel.tsx"), vite.ssrLoadModule("/src/healthModel.ts"),
    vite.ssrLoadModule("/src/format.ts"), vite.ssrLoadModule("/src/ui.tsx"), vite.ssrLoadModule("/src/appVersion.ts"),
  ]);
  buildVersion = versionApi.UI_BUILD_VERSION;
});
after(async () => { await vite?.close(); });
const freeze = value => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value;
};
const nodes = value => Array.isArray(value) ? value.flatMap(nodes)
  : React.isValidElement(value) ? [value, ...nodes(value.props.children)] : [];
const textOf = value => Array.isArray(value) ? value.map(textOf).join("")
  : React.isValidElement(value) ? textOf(value.props.children)
    : value === undefined || value === null || typeof value === "boolean" ? "" : String(value);
const RECEIVED = "2026-10-07T12:45:00Z";
function fixture () {
  return { server: { version: buildVersion, started_ts: "2026-10-07T12:00:00Z", db_bytes: 1024,
    watchers_alive: 6, watchers_total: 6, hook_registered: true, hook_settings_path: "fixture/settings.json" },
  repos: [{ id: "RepoFixture", offline: false, last_event_ts: null, events_jsonl_bytes: null, events_jsonl_mtime: null, warning_count: 0 }],
  activity: { pending: 0, rejected: 0, ignored_unscoped: 0, registry_revision_mismatch: 0 },
  providers: [{ provider: "codex", adapter_present: true, configuration_valid: false,
    configuration_state: "settings_missing", recently_observed: false, last_observed_at: null }],
  chronicle: { state: "running" } };
}
function render (component, props) {
  const before = structuredClone(props); freeze(props);
  const html = renderToStaticMarkup(React.createElement(component, props));
  assert.deepEqual(props, before, "actual rendering preserves accepted data"); return html;
}
const SECTION_IDS = ["health-server-heading", "health-activity-heading", "health-providers-heading", "health-repositories-heading"];
const sectionIds = html => [...html.matchAll(/<section aria-labelledby="([^"]+)"/g)].map(match => match[1]);
const body = data => render(health.HealthBody, { data, receivedAt: RECEIVED });
test("current SSR preserves complete/legacy/null/empty optional sections and overlap guidance exactly once", () => {
  const guidance = "If updating: stop Tracker and demo, rebuild the UI, restart Tracker, then reload this tab.";
  for (const mode of ["complete", "missing", "null", "empty"]) for (const version of [buildVersion, "99.98.97.96", undefined, null, {}, "future"]) {
    const data = fixture(); data.server.version = version; data.repos = [];
    if (mode === "missing") { delete data.activity; delete data.providers; delete data.chronicle; }
    if (mode === "null") { data.activity = null; data.providers = null; delete data.chronicle; }
    if (mode === "empty") data.providers = [];
    assert.equal(model.decodeHealthPayload(data), data);
    const html = body(data), full = mode === "complete" || mode === "empty";
    assert.deepEqual(sectionIds(html), full ? SECTION_IDS : [SECTION_IDS[0], SECTION_IDS[3]]);
    assert.equal(count(html, guidance), !full || version === "99.98.97.96" ? 1 : 0);
    assert.equal(html.includes("UI build and server versions differ"), version === "99.98.97.96");
    if (version !== buildVersion && version !== "99.98.97.96") assert.ok(html.includes("Unknown"));
    if (mode === "empty") assert.ok(html.includes("No provider health records."));
    if (!full) assert.ok(html.includes("Missing fields do not establish a version mismatch."));
  }
});
test("current Activity labels/adjacent values and Chronicle facts retain exact zero/positive units and colors", () => {
  for (const amount of [0, 1, Number.MAX_SAFE_INTEGER]) {
    const data = fixture();
    for (const key of Object.keys(data.activity)) data.activity[key] = amount;
    const html = body(data);
    for (const label of ["pending", "rejected", "unscoped", "registry mismatch"])
      assert.ok(html.includes(">" + label + "</span><span"));
    assert.ok(html.includes(">" + amount + " ignored</span>"));
    assert.ok(html.includes('class="' + (amount > 0 ? "text-amber-300" : "text-ui-text") + '">' + amount + "</span>"));
    assert.doesNotMatch(html, /undefined|NaN|Infinity/);
  }
  for (const [chronicle, expected, forbidden] of [
    [{ state: "running" }, "worker running", "unexpected shape"],
    [{ state: "disabled" }, "disabled for this mode", "worker running"],
    [{ state: "unavailable" }, "worker unavailable", "worker running"],
    [null, "health data invalid", "worker running"],
    [{ state: "future" }, "health data invalid", "worker running"],
    [[], "health data invalid", "worker running"],
  ]) {
    const data = fixture(); data.chronicle = chronicle;
    const html = body(data); assert.ok(html.includes(expected)); assert.ok(!html.includes(forbidden));
  }
  const missing = fixture(); delete missing.chronicle; assert.ok(body(missing).includes("not reported"));
  for (const group of ["server", "activity"]) {
    const data = fixture(); data[group][group === "server" ? "watchers_alive" : "pending"] = NaN;
    assert.equal(model.decodeHealthPayload(data), null, "required malformed values are not accepted");
  }
});
test("current hostile/long providers and offline repository data retain escaped exact facts", () => {
  const token = '<script>Long & "scope"</script>', data = fixture();
  data.server.hook_settings_path = token.repeat(15); data.server.db_bytes = null; data.server.hook_registered = false;
  data.providers[0].provider = token.repeat(9); data.providers[0].configuration_state = "future_state";
  data.providers[0].last_observed_at = token.repeat(7); data.providers[0].recently_observed = true;
  data.repos[0].id = token.repeat(15); data.repos[0].offline = true;
  data.repos[0].events_jsonl_mtime = token.repeat(8); data.repos[0].events_jsonl_bytes = 2048;
  data.repos[0].last_event_ts = token.repeat(10); data.repos[0].warning_count = 1;
  assert.equal(model.decodeHealthPayload(data), data);
  const html = body(data);
  assert.match(html, /&lt;script&gt;Long &amp; &quot;scope&quot;&lt;\/script&gt;/);
  assert.ok(html.includes('title="last log write: &lt;script&gt;')); assert.ok(html.includes("2.0 KB"));
  for (const fact of ["offline", "1 warning", "future state", "recent", "line not verified"]) assert.ok(html.includes(fact));
  assert.doesNotMatch(html, /<script>|scale\(|overflow-hidden|whitespace-nowrap/);
});
test("actual first-page zero/49/50/51 and controlled current last-page rows use real bounded helpers", () => {
  const declaration = name => owner(healthAst, name).getText(healthAst).replace(/^export\s+/, "");
  const code = ["fmtBytes", "Row", "HealthBody"].map(declaration).join("\n") + "\nreturn HealthBody;";
  const compiled = ts.transpileModule(code, { reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } });
  assert.equal(compiled.diagnostics.filter(value => value.category === ts.DiagnosticCategory.Error).length, 0);
  const make = new Function("React", "decodeAppVersion", "decodeChronicleHealth", "hookRegistrationLabel",
    "UI_BUILD_VERSION", "UPGRADE_GUIDANCE", "fmtMinutes", "fmtRel", "fmtTs", "useBoundedPage", "CollectionPager", compiled.outputText);
  const upgradeDeclaration = owner(healthAst, "UPGRADE_GUIDANCE").declarationList.declarations[0];
  assert.ok(ts.isStringLiteral(upgradeDeclaration.initializer));
  for (const total of [0, 49, 50, 51]) {
    const data = fixture(), template = data.repos[0];
    data.repos = Array.from({ length: total }, (_, index) => ({ ...template, id: "Repo_" + String(index).padStart(3, "0") }));
    const html = body(data);
    assert.equal(count(html, 'class="grid min-w-0 grid-cols-1 gap-x-3'), Math.min(total, 50));
    assert.equal(html.includes('aria-controls="health-repos"'), total > 50);
    if (total) assert.ok(html.includes("Repo_000"));
    if (total > 50) {
      assert.ok(!html.includes("Repo_050"));
      const calls = [], Controlled = make(React, versionApi.decodeAppVersion,
        model.decodeChronicleHealth, model.hookRegistrationLabel, buildVersion, upgradeDeclaration.initializer.text,
        format.fmtMinutes, format.fmtRel, format.fmtTs,
        options => ({ ...ui.getBoundedPageWindow(options.totalItems, 2, options.pageSize), setPage: value => calls.push(value) }), ui.CollectionPager);
      const last = render(Controlled, { data, receivedAt: RECEIVED });
      assert.ok(last.includes("Repo_050")); assert.ok(!last.includes("Repo_049")); assert.ok(last.includes("Page 2 of 2"));
      const page = ui.getBoundedPageWindow(total, 2, 50);
      const tree = ui.CollectionPager.render({ collectionLabel: "Health repositories", controlsId: "health-repos", page,
        onPageChange: value => calls.push(value) }, null);
      const previous = one(nodes(tree), node => node.props["aria-label"] === "Health repositories: previous page");
      previous.props.onClick(); assert.deepEqual(calls, [1]);
    }
  }
  // Controlled paging is not lifecycle, native focus or portal acceptance.
});
test("actual SnapshotContent retains build/receipt/status/refresh callbacks through all recovery states", () => {
  const snapshot = freeze({ data: fixture(), receivedAt: RECEIVED });
  const newer = freeze({ data: fixture(), receivedAt: "2026-10-07T13:05:00Z" });
  const error = 'System health failed: <script>safe & retry</script>';
  for (const [accepted, failure, busy, label] of [
    [null, "", true, "Loading\u2026"], [null, error, false, "Retry"], [snapshot, "", false, "Refresh"],
    [snapshot, "", true, "Refreshing\u2026"], [snapshot, error, false, "Retry"], [newer, "", false, "Refresh"],
  ]) {
    const calls = [], onRefresh = () => calls.push("refresh"), props = { snapshot: accepted, error: failure, busy, onRefresh };
    const tree = health.HealthSnapshotContent(props), button = one(nodes(tree), node => node.type === "button");
    assert.equal(button.props.onClick, onRefresh); assert.equal(button.props.disabled, busy);
    assert.equal(button.props["aria-busy"], busy); assert.equal(button.props.children, label);
    if (!busy) { button.props.onClick(); assert.deepEqual(calls, ["refresh"]); }
    const html = renderToStaticMarkup(React.createElement(health.HealthSnapshotContent, props));
    assert.ok(html.includes("v" + buildVersion)); assert.match(html, /role="status" aria-live="polite" aria-atomic="true"/);
    assert.doesNotMatch(html, /role="status"[^>]*aria-busy|<script>/);
    assert.equal(sectionIds(html).length, accepted ? 4 : 0);
    if (accepted) {
      assert.ok(html.includes('dateTime="' + accepted.receivedAt + '"')); assert.ok(html.includes(format.fmtTs(accepted.receivedAt)));
      assert.equal(html.includes("Showing the last successful response; it has not been updated."), Boolean(busy || failure));
    } else assert.ok(html.includes("No health response received yet."));
    if (failure) assert.ok(html.includes("&lt;script&gt;safe &amp; retry&lt;/script&gt;"));
  }
});
