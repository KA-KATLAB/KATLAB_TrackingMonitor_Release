import { changesBriefPreservation } from "./helpers/changesTaskReviewBrief.mjs";
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
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const frontend = resolve(root, "Frontend");
const require = createRequire(resolve(frontend, "package.json"));
const ts = require("typescript"), postcss = require("postcss"), selectors = require("postcss-selector-parser");
const React = require("react"), { renderToStaticMarkup } = require("react-dom/server");
const read = path => readFileSync(resolve(root, path), "utf8");
const sha = value => createHash("sha256").update(value).digest("hex"), lf = value => value.replace(/\r\n/g, "\n");
const source = read("Frontend/src/momentum.tsx");
const ANCHOR = 'import { SectionHeading, Surface } from "./ui";';
const IMPORT = 'import "./momentumComparison.css";';
const OLD_SURFACE = "<Surface data-reveal>";
const NEW_SURFACE = '<Surface data-reveal data-momentum-deck="true">';
const ORIGINAL_RAW = "a23186a700e5a15e87cd3908f0f5a6cf4098a513ac7ec12b45dafe9ccce34665";
const ORIGINAL_LF = "37c0be2e5624437c7508f5e7f83c29eb2724131fc0215a08e3cb1fe26d43b6ac";
const REVIEWED_RAW = "030a2eb4148a1be39c57254dbe112d0f9571514fd6ac45f41adf4db372d2b0a3";
const REVIEWED_LF = "a38e9ca14e0061b29c0a4f8238c550a18a8b9dd94d0b98650d8b86bd625c7c29";
const CSS_HASH = "19905b16379674a292331f43dbdc280573c7270c90453409b1a53655aebc8941";
const MONO = '"Azeret Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
const GRID = '.ui-surface[data-momentum-deck="true"] > .ui-local-scroller > .grid';
const CARD = GRID + " > div", TEXT = CARD + " > div:first-child";
// Independent reviewed source expectations, never loaded from the ignored plan.
const CSS = [
  "/* Momentum comparison hierarchy only; data, dates and source order stay. */",
  GRID + " {",
  "  min-width: 0;",
  "  gap: 16px;",
  "}",
  CARD + " {",
  "  min-width: 0;",
  "  display: grid;",
  "  grid-template-columns: minmax(0, 1fr);",
  "  gap: 16px;",
  "  padding: 16px;",
  "  border: 1px solid rgb(var(--ui-border));",
  "  border-radius: 8px;",
  "  background-color: rgb(var(--ui-surface-raised));",
  "}",
  TEXT + " > div:first-child {",
  "  font-size: 16px;",
  "  line-height: 24px;",
  "}",
  TEXT + " > div.flex {",
  "  flex-wrap: wrap;",
  "}",
  TEXT + " > div.flex > span:first-child {",
  "  min-width: 0;",
  "  font-family: " + MONO + ";",
  "  font-size: 32px;",
  "  line-height: 40px;",
  "  font-variant-numeric: tabular-nums;",
  "  overflow-wrap: anywhere;",
  "}",
  TEXT + " > div.flex > span:nth-child(2) {",
  "  min-width: 0;",
  "  font-size: 14px;",
  "  line-height: 21px;",
  "  overflow-wrap: anywhere;",
  "}",
  TEXT + " > div:last-child {",
  "  font-size: 14px;",
  "  line-height: 21px;",
  "  overflow-wrap: anywhere;",
  "}",
  CARD + " > div:nth-child(2) {",
  "  margin-left: 0;",
  "}", "",
].join("\n");
const RULES = [
  [GRID, [["min-width", "0"], ["gap", "16px"]]],
  [CARD, [["min-width", "0"], ["display", "grid"], ["grid-template-columns", "minmax(0, 1fr)"], ["gap", "16px"], ["padding", "16px"], ["border", "1px solid rgb(var(--ui-border))"], ["border-radius", "8px"], ["background-color", "rgb(var(--ui-surface-raised))"]]],
  [TEXT + " > div:first-child", [["font-size", "16px"], ["line-height", "24px"]]],
  [TEXT + " > div.flex", [["flex-wrap", "wrap"]]],
  [TEXT + " > div.flex > span:first-child", [["min-width", "0"], ["font-family", MONO], ["font-size", "32px"], ["line-height", "40px"], ["font-variant-numeric", "tabular-nums"], ["overflow-wrap", "anywhere"]]],
  [TEXT + " > div.flex > span:nth-child(2)", [["min-width", "0"], ["font-size", "14px"], ["line-height", "21px"], ["overflow-wrap", "anywhere"]]],
  [TEXT + " > div:last-child", [["font-size", "14px"], ["line-height", "21px"], ["overflow-wrap", "anywhere"]]],
  [CARD + " > div:nth-child(2)", [["margin-left", "0"]]],
];
const PINS = [
  ["Frontend/src/App.tsx","945c8879e94b5d7a8410d2a143ed2e127e2653dd1a123d2d8b4cd306758a6f3e","c7c568b346c7ddf00d86b93325b97854e59f3f625f6fd916b056e85ccf069b1a"],
  ["Frontend/src/OverviewView.tsx","98f77fe8a3f97033f5a2084439f8da6dcb203547d7b1f8409aca11892598d214","9d42a6c52828018f6bb0ab7f3f668e0040e0a190de144517715460f93b84410a"],
  ["Frontend/src/ui.tsx","b5650b9e2a3529ff1ca033ed077d7b806f0cc9341c9733b4b3a52c107ab99974","e1c2ad05398cf771ee17ba576b7feecf03829459379b9e02e35c58aea5004c46"],
  ["Frontend/src/calendarDay.ts","033b0720f32521d8fd2549923955867523749f28532505e43b53f2177f45dd7e","401d957f4312819b1beeb3ff0e9e5810dc18cdf38f6a0799013d63be3e7511bb"],
  ["Frontend/src/charts.ts","121d9c4ff6d9a1d6befa7b19d19f2eecb44820f08728e922b9c3a8d630dfca1b","2c9291d1dbe47863d5ecad800ef5427ad855ec257e19b28ebc7220a2dfe29a53"],
  ["Frontend/src/format.ts","4c7f1cb040c38a5ef75787c6f7325db6fc162a6890df0fb693e916aa62d8c87f","4c7f1cb040c38a5ef75787c6f7325db6fc162a6890df0fb693e916aa62d8c87f"],
  ["Frontend/src/index.css","9371bc04cba0b62e8a8e5e3b4a9251deea9273be58f4b9735982e0649527ba81","788436e9def1e7109fe98d4bfa5e0add49a5f0ca301b17416279c03f18ede0f5"],
  ["Frontend/tailwind.config.js","cdb058b068e26db24bcce71d68939611bc4ce651d1bfbaa49907dbb8ffa5ed76","cdb058b068e26db24bcce71d68939611bc4ce651d1bfbaa49907dbb8ffa5ed76"],
  ["Frontend/src/theme.ts","7c39c4ea3bf479216edc7776fac113f0d05bfeaba3d411ca8ba1ea1fc2ba6022","03ed88e814b0a12af207f462819731127f2346def58af01259ccc36c0556b286"],
  ["Frontend/src/reveal.ts","f6e88e85bd5690333845443786f3ee6b7e51eafd2773e510b2296f750ffc65df","f6e88e85bd5690333845443786f3ee6b7e51eafd2773e510b2296f750ffc65df"],
  ["Frontend/src/planBoard.tsx","1e3a6a74fc5c6ef038fde019e98afd2b5951cd0a75830d86e98acac52dfa0170","ab494423ca66233ed6848392976b05a5d52ecb3797722477da921e133a651288"],
  ["Frontend/src/activePlanGallery.css","12a7163ac9b28d2a251f9011889287f70b72f7aa1bc78624f587f24692100242","12a7163ac9b28d2a251f9011889287f70b72f7aa1bc78624f587f24692100242"],
  ["Frontend/src/chronicleView.tsx","3130fff181f79401e7c90d486a48ba7a91a63c9dab80eaff990a587470aa75c5","0ec47d759e070a566b13f868bcf10775fc89dfe478cda5eddd731d0f1550856b"],
  ["Frontend/src/chronicleProbe.ts","46251107af8daacc252c0db78df9f5c7212748b13f43e7f22fc98683cfca842a","278de3c0b6aae473e4ee2bfc4e1853883190f0594af208e584f22b001ce56379"],
  ["Scripts/Chronicle/pages.py","b44afb03c5af17b083e17ad5e0b24b1d827e66f32ead3b47db147685a0da2858","451b0a4b356e5ce46b4403b396146cd9debce50492b2e6a3de708f619982c06a"],
  ["Scripts/Chronicle/generate.py","84bad82cae964d66a14a874fa79b27b6548a3c19b11f2e730ee444c4f61534e9","06afd185980b9dcebbd165a7f82a73e19f2271a6728754d0af6ac2bb1ba9879d"],
  ["Scripts/Chronicle/runtime.py","2e1bd56435c2e52c0681d320a5d8b23405c7575b1d1296748b2af796f9bbbbfd","78fe39b021cb775a23b96cd3da8ea514f3fd2973052a6f415a8d89f0e5b5e372"],
  ["Scripts/Chronicle/safe_io.py","d34c8103c65af65c0c611df40f762677684a4a20765b8b75e24fa1a0a6fb6b42","9ac8271967447a23579741640fe0c7e86d36243547dcddbeb6bca16f8a7c3d17"],
  ["Scripts/lifecycle_process.py","7a7f41651599b273e2dbc7f8015dd1725beac08fa7a8e68a5b48e7a9a28e196e","308127c79d45d301e1139afc9564dba77e2b02e4f447f3e9e6c1106c54d247f9"],
  ["Scripts/start_tracking_monitor.bat","d88189b035a848b983e1854f19ad7ed89dfb6ae45d6cd1a1af37fb93c4dbfac5","358bf7feb9190463d4058740b7fd129918167b7d6440496362fb1d613fc211fa"],
  ["Scripts/stop_tracking_monitor.bat","eca8ee2f14de0c1c2b8a982bd96ecedf562926a3cb19e0d5207f83f7de0f5855","774c0eff439ff5d2a148b2db615a29707f6630a2e850e7ec0ae7dab0199d58fc"],
  ["Scripts/restart_tracking_monitor.bat","78e6a37f5bda6cb32da031556e6ae3d378fda2af6aa066b893dbc93ff0072c7b","97c199fb4eb68fbde1367d417e5bc4e9dd70ee4e6e2839e848a0898837e85ecc"],
  ["Scripts/frontend_build.py","34dbacbec4b5a72507754c165af7e7edf12a067dbfe1dde9f7d3578f3172c8a9","a45da02e604be582eb03429d94b33825d19190db52070e9138bff33458b07437"],
  ["Tests/test_weekly_snapshot.mjs","f478220eb7aaaabd68ede3dd97ad171a18221baaa1c38c8258a292110d2eeac3","4e665761fd114cd3d59717217558b850aaede8772e59ec6c0fbe3c8604b61b57"],
  ["Tests/test_mode_badge.mjs","2f05975fa87ad3aa862190e4b76a6e2d00c07f4e5d55493ec22eee58cf8fd135","085d216299ec4be30d5ae9fc9ad972984318a5aa155fbf2452864665ea9fa3ec"],
  ["Tests/test_read_surfaces.mjs","264aefcfbc7ff84d37c449c6c6817e8c1b86e5aa189d0e87075e897f25fc7cfa","b270f7191446f0281040d53625e43603c25c566e5b67cc283d78914113d9574c"],
  ["Tests/test_overview_hierarchy.mjs","faf3b593f97021df8509f896c28adcecfb15e5438221bb9f87f6a0cdd95bc238","d1adb0cb04dec60045173f4c47334b00b71519018bd4bee835125f5fcf1c9840"],
  ["Tests/test_overview_operations_deck.mjs","4c4b2fb8ed83321a1c696e99b102b3611a5f81902967b070a934cd43126421b9","4c4b2fb8ed83321a1c696e99b102b3611a5f81902967b070a934cd43126421b9"],
  ["Tests/test_active_plan_gallery.mjs","ffd3c9b18d1ad35ba7dd2875af404ab4ac9638e935c1027d9b5bf1f83ccbf260","ffd3c9b18d1ad35ba7dd2875af404ab4ac9638e935c1027d9b5bf1f83ccbf260"],
  ["Tests/test_chronicle_reader_canvas.mjs","d3f108fc0358a4de6ba1e51dd34deefebf9fd27a9fa696daf59c91d40b1d040b","d3f108fc0358a4de6ba1e51dd34deefebf9fd27a9fa696daf59c91d40b1d040b"],
  ["Tests/test_app_version.mjs","d86fa77843bdf4f552fc7e97bec8f5ecea839f98080451325bef4cd81674d6c3","c5cc037e582d0ff5066d959b76ccb804e58c452cfcb1f92c23a0fba8786b15f5"],
  ["Tests/test_repository_scope_picker.mjs","e895bdbd48be23b8cd43d4bb2d864b66689a8da45ee3a976c974a11bdd1c8a3d","e895bdbd48be23b8cd43d4bb2d864b66689a8da45ee3a976c974a11bdd1c8a3d"],
  ["Tests/test_workspace_command_frame.mjs","c46140e06176cc3781d8e1acf17c5e9eee11989524e6341a3d15d0f810e7c247","c46140e06176cc3781d8e1acf17c5e9eee11989524e6341a3d15d0f810e7c247"],
  ["Tests/test_history_commit_ledger.mjs","66944cd059bc1714d10aa377a5c372c7f47213a21acd7952ad14e75e476a8e75","66944cd059bc1714d10aa377a5c372c7f47213a21acd7952ad14e75e476a8e75"],
  ["Tests/test_system_snapshot_panels.mjs","2d84f20f7194de62d0656b7220a37c367c37696a33a6a12d673bce0c55c25a65","2d84f20f7194de62d0656b7220a37c367c37696a33a6a12d673bce0c55c25a65"],
  ["Frontend/package.json","b131be7e90ba2500b01371e594e10c482b94cf651ab425ddf7efaea76b759b9d","541a787d69fa512a53de01b53240e2e94ac22f068da882e0c2496f68ee5bf1a1"],
  ["Frontend/package-lock.json","0c39bf19779991e4565e00845a061fc954afdfe988d9026c6c356957e2b02258","d5ccfda11d2d07b4a707b18aca87b866a135182a3bd33ce2380c21730809ce75"],
  ["Frontend/tsconfig.json","97997252d286ecf7a8a4b12a51ac2fdd9199f3b9bf5e14e8d4f7d4e5e60d3f3f","97997252d286ecf7a8a4b12a51ac2fdd9199f3b9bf5e14e8d4f7d4e5e60d3f3f"],
  ["Frontend/vite.config.ts","6f25836874cc3ca4c97781dd0140ab1e7fee796b3b0c67a67ffdb8600e67cd6b","4631f5c7380fa909b5b361bf8eb7fdac29a665144ca260f9ac30be30ce83f107"],
  ["Backend/requirements.txt","f750d19859ca5621eea836592d2038857f73e8857bcace96752ce6dadf004ea3","f24979c56dd6d095f18541462485fb62229cfddf0fa8784d7c7dd9fbb535d0b5"],
  ["Scripts/Chronicle/requirements.txt","9d91436f670aac600f39beb184f7278774dc94e470dfca37f092bb0e3d461722","562f66ed699de7d73e464c6be1a0938b6b19a8c2f69fe4b955209f0981986a2d"],
];

function ending (text) {
  assert.ok(!text.startsWith("\uFEFF") && !text.includes("\0"), "no BOM/NUL");
  const rest = text.replace(/\r\n/g, ""), eol = text.includes("\r\n") ? "\r\n" : "\n";
  assert.ok(!rest.includes("\r"), "no bare CR");
  if (eol === "\r\n") assert.ok(!rest.includes("\n"), "uniform EOL");
  assert.ok(text.endsWith(eol) && !text.endsWith(eol + eol), "single EOF");
  assert.doesNotMatch(text, /[ \t]+$/m); return eol;
}
function parse (text) {
  const ast = ts.createSourceFile("actual.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  assert.equal(ast.parseDiagnostics.length, 0, "complete valid TSX"); return ast;
}
function all (node) {
  const nodes = [node]; ts.forEachChild(node, child => { nodes.push(...all(child)); }); return nodes;
}
function one (nodes, predicate, label) {
  const found = nodes.filter(predicate); assert.equal(found.length, 1, label); return found[0];
}
function replaceOnce (text, old, next) {
  assert.equal(text.split(old).length - 1, 1, "unique physical fixture window"); return text.replace(old, next);
}
function restoreMomentum (text) {
  const eol = ending(text), ast = parse(text), imports = ast.statements.filter(ts.isImportDeclaration);
  const added = one(imports, n => n.moduleSpecifier.text === "./momentumComparison.css", "one top-level stylesheet import");
  const anchor = one(imports, n => n.getText(ast) === ANCHOR, "one exact ui import anchor");
  assert.equal(added.importClause, undefined); assert.equal(added.getText(ast), IMPORT);
  assert.equal(text.split(IMPORT).length - 1, 1); assert.equal(text.split(ANCHOR).length - 1, 1);
  assert.equal(added.getStart(ast), anchor.end + eol.length, "immediate next physical line");
  assert.equal(text.slice(added.getStart(ast), added.end + eol.length), IMPORT + eol);
  const owner = one(ast.statements, n => ts.isFunctionDeclaration(n) && n.name?.text === "MomentumStrip", "actual top-level owner");
  const returned = owner.body.statements.at(-1); assert.ok(ts.isReturnStatement(returned));
  let value = returned.expression; while (ts.isParenthesizedExpression(value)) value = value.expression;
  assert.ok(ts.isJsxElement(value), "direct final-return Surface, not a wrapper");
  const opening = value.openingElement;
  assert.equal(opening.tagName.getText(ast), "Surface"); assert.equal(opening.getText(ast), NEW_SURFACE);
  assert.equal(value.closingElement.tagName.getText(ast), "Surface");
  const marker = one(all(ast), n => ts.isJsxAttribute(n) && n.name.getText(ast) === "data-momentum-deck", "one actual marker");
  assert.ok(opening.attributes.properties.includes(marker)); assert.ok(ts.isStringLiteral(marker.initializer));
  assert.equal(marker.initializer.text, "true"); assert.equal(text.split(NEW_SURFACE).length - 1, 1);
  const restoredTag = text.slice(0, opening.getStart(ast)) + OLD_SURFACE + text.slice(opening.end);
  const original = restoredTag.slice(0, added.getStart(ast)) + restoredTag.slice(added.end + eol.length);
  parse(original); assert.equal(ending(original), eol); return original;
}
function checkCss (text) {
  assert.equal(ending(text), "\n", "new stylesheet is LF only");
  const ast = postcss.parse(text); assert.deepEqual(ast.nodes.map(n => n.type), ["comment", ...Array(8).fill("rule")]);
  assert.equal(ast.nodes[0].text, "Momentum comparison hierarchy only; data, dates and source order stay.");
  RULES.forEach(([selector, declarations], index) => {
    const node = ast.nodes[index + 1], parsed = selectors().astSync(node.selector);
    assert.equal(parsed.nodes.length, 1, "no selector-list escape");
    assert.equal(parsed.toString(), selectors().astSync(selector).toString());
    assert.ok(node.nodes.every(n => n.type === "decl"), "all direct children are declarations");
    assert.deepEqual(node.nodes.map(n => [n.prop, n.value, Boolean(n.important)]), declarations.map(([p, v]) => [p, v, false]));
  });
}

test("independent complete stylesheet freezes scoped hierarchy, configured mono and all eight rules", () => {
  const actual = read("Frontend/src/momentumComparison.css");
  assert.equal(CSS.split("\n").length - 1, 44); assert.equal(Buffer.byteLength(CSS), 1638);
  assert.equal(sha(CSS), CSS_HASH); assert.equal(actual, CSS); checkCss(actual);
  assert.equal(MONO, ['"Azeret Mono"', ...require("tailwindcss/defaultTheme").fontFamily.mono].join(", "));
});
test("strict CSS oracle rejects every root, nested, declaration, selector and physical-byte escape", () => {
  const variants = [
    ...["body { color: red; }\n", "@media (min-width: 1px) { body { color: red; } }\n", "@font-face { font-family: x; }\n", "@import 'x';\n", "/* other */\n"].map(v => CSS + v),
    ...["& div { color: red; }", "@supports (display: grid) { color: red; }", "@font-face { font-family: x; }", "/* nested */"].map(v => CSS.replace("  min-width: 0;", "  min-width: 0;\n  " + v)),
    ...["gap: 16px !important;", "gap: 16px; gap: 16px;", "width: 420px;", "height: 1px;", "overflow: hidden;", "order: 1;", "position: absolute;", "animation: pulse 1s;", "background: url(https://invalid.example/x);", "gap: 15px;"].map(v => CSS.replace("gap: 16px;", v)),
    CSS.replace(GRID, "body"), CSS.replace(GRID, GRID + ", body"), CSS.replace("span:first-child", "span:last-child"),
    CSS.replace("minmax(0, 1fr)", "1fr"), CSS.replace("32px", "18px"), CSS.replace("40px", "41px"),
    CSS.replace(MONO, "sans-serif"), CSS.replace("tabular-nums", "normal"), CSS.replace("anywhere", "normal"),
    CSS.replace("}", ""), CSS.replace("\n", "\r"), CSS.replace("\n", "\r\n"), CSS.replace(/\n/g, "\r\n"),
    "\uFEFF" + CSS, CSS + "\0", CSS + "\n", CSS.slice(0, -1), CSS.replace("min-width: 0;", "min-width: 0; "),
  ];
  variants.forEach(value => assert.throws(() => checkCss(value)));
});
test("actual TSX-owned two-window inverse preserves complete original and reviewed RAW/LF bytes", () => {
  assert.equal(ending(source), "\r\n"); assert.equal(Buffer.byteLength(source), 6061);
  assert.equal(sha(source), REVIEWED_RAW); assert.equal(sha(lf(source)), REVIEWED_LF);
  const original = restoreMomentum(source); assert.equal(Buffer.byteLength(original), 5999);
  assert.equal(sha(original), ORIGINAL_RAW); assert.equal(sha(lf(original)), ORIGINAL_LF);
  for (const eol of ["\n", "\r\n"]) {
    const converted = lf(source).replace(/\n/g, eol), restored = restoreMomentum(converted);
    assert.equal(sha(lf(restored)), ORIGINAL_LF);
    assert.equal(restored, converted.replace(IMPORT + eol, "").replace(NEW_SURFACE, OLD_SURFACE));
  }
});
test("source inverse rejects missing, duplicate, moved, comment, wrong-owner and malformed windows", () => {
  const current = lf(source), removedImport = current.replace(IMPORT + "\n", "");
  const variants = [
    removedImport, current.replace(IMPORT, IMPORT + "\n" + IMPORT),
    current.replace(IMPORT, "// " + IMPORT), current.replace(IMPORT, 'import style from "./momentumComparison.css";'),
    removedImport.replace('import type { StatsData } from "./charts";', 'import type { StatsData } from "./charts";\n' + IMPORT),
    current.replace(ANCHOR + "\n" + IMPORT, ANCHOR + "\n\n" + IMPORT),
    current.replace(NEW_SURFACE, OLD_SURFACE), current.replace(NEW_SURFACE, '<Surface data-reveal data-momentum-deck={true}>'),
    current.replace(NEW_SURFACE, '<Surface data-reveal data-momentum-deck="false">'),
    current.replace(NEW_SURFACE, '<Surface data-reveal data-momentum-deck="true" data-extra="x">'),
    current.replace(NEW_SURFACE, '<Surface data-reveal data-momentum-deck="true" data-momentum-deck="true">'),
    current.replace(NEW_SURFACE, OLD_SURFACE).replace('<SectionHeading level={4}', '<SectionHeading data-momentum-deck="true" level={4}'),
    current.replace(NEW_SURFACE, "<div>" + NEW_SURFACE).replace("</Surface>", "</Surface></div>"),
    current.replace("export function MomentumStrip", "export function OtherOwner"),
    current.replace(NEW_SURFACE, OLD_SURFACE).trimEnd() + "\nconst fake = " + JSON.stringify(NEW_SURFACE) + ";\n",
    current.replace('data-momentum-deck="true"', '/* data-momentum-deck="true" */'),
    current.slice(0, -6), current + "\n", current.slice(0, -1), "\uFEFF" + current, current + "\0",
    current.replace("\n", "\r\n"), current.replace("\n", "\r"),
  ];
  variants.forEach(value => assert.throws(() => restoreMomentum(value)));
});
test("valid unrelated source and calculation changes survive the inverse and fail original whole pins", () => {
  const current = lf(source), original = restoreMomentum(current);
  for (const [old, next] of [["// v0.1.12.0 D1 (B.1): momentum strip", "// Unrelated module documentation changed"],
    ["const cur = calendar.slice(-7)", "const cur = calendar.slice(-6)"]]) {
    const changed = replaceOnce(current, old, next), restored = restoreMomentum(changed);
    assert.equal(restored, replaceOnce(original, old, next)); assert.notEqual(sha(restored), ORIGINAL_LF);
  }
});
test("unchanged caller, helpers, tokens, gallery, Chronicle, lifecycle, prior suites and dependencies keep RAW/LF pins", () => {
  for (const [path, raw, normalized] of PINS) {
    const bytes = deskPreservation(path, mastheadPreservation(path, cityBriefPreservation(path, purposeNavigationPreservation(path, activePlanDocketPreservation(path, historyStationPreservation(path, changesBriefPreservation(path, readFileSync(resolve(root, path))))))))); assert.equal(sha(bytes), raw, path + " RAW");
    assert.equal(sha(lf(bytes.toString("utf8"))), normalized, path + " LF");
  }
});

function calendar (count, end = "2026-09-15") {
  const last = Date.parse(end + "T00:00:00Z");
  return Array.from({ length: count }, (_, index) => ({
    day: new Date(last - (count - index - 1) * 86_400_000).toISOString().slice(0, 10),
    events: 2, minutes: 3, commits: 1,
  }));
}
function freeze (value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}
const selectedClass = "text-lg font-bold text-slate-100";
const textClass = "text-xs text-slate-400", cardClass = "flex items-center gap-3 rounded bg-slate-800/60 px-3 py-2";
const selectedKeys = ["events", "minutes", "commits"], labels = ["captures", "effort", "commits"];
const xPrior = ["0.0", "7.7", "15.4", "23.1", "30.8", "38.5", "46.2"];
const xCurrent = ["46.2", "53.8", "61.5", "69.2", "76.9", "84.6", "92.3", "100.0"];
const constantPoints = (xs, y) => xs.map(x => x + "," + y).join(" ");

test("actual current Vite SSR and Surface retain complete supplied-data structure and behavior", { timeout: 30_000 }, async t => {
  const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
  const vite = await createServer({ root: frontend,
    server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom",
    optimizeDeps: { noDiscovery: true, entries: [] } });
  try {
    const { MomentumStrip } = await vite.ssrLoadModule("/src/momentum.tsx");
    const { Surface, SectionHeading } = await vite.ssrLoadModule("/src/ui.tsx");
    const children = node => React.Children.toArray(node.props.children);
    const inspect = (rows, scope, values, preceding, deltas) => {
      const before = JSON.stringify(rows); freeze(rows);
      const tree = MomentumStrip({ calendar: rows, scope });
      assert.equal(tree.type, Surface); assert.equal(tree.props["data-reveal"], true);
      assert.equal(tree.props["data-momentum-deck"], "true");
      const body = children(tree), heading = body[0], region = body.at(-1);
      assert.equal(heading.type, SectionHeading); assert.equal(heading.props.level, 4); assert.equal(heading.props.title, "Momentum");
      assert.equal(region.type, "div"); assert.equal(region.props.className, "ui-local-scroller overflow-x-auto");
      assert.equal(region.props.role, "region"); assert.equal(region.props["aria-label"], "Momentum metrics"); assert.equal(region.props.tabIndex, 0);
      const grid = children(region)[0]; assert.equal(grid.props.className, "grid min-w-[420px] gap-3 sm:grid-cols-3");
      const cards = grid.props.children; assert.equal(cards.length, 3);
      assert.deepEqual(cards.map(card => card.key), selectedKeys);
      cards.forEach((card, index) => {
        assert.equal(card.props.className, cardClass);
        const content = children(card), group = content[0], lines = children(group);
        assert.equal(group.props.className, "min-w-0"); assert.equal(lines.length, 3);
        assert.equal(lines[0].props.className, textClass); assert.equal(lines[0].props.children, labels[index]);
        assert.equal(lines[1].props.className, "flex items-baseline gap-2");
        const spans = children(lines[1]); assert.equal(spans[0].props.className, selectedClass);
        assert.equal(spans[0].props.children, values[index]);
        assert.equal(lines[2].props.className, textClass); assert.equal(React.Children.toArray(lines[2].props.children).join(""), "Preceding " + preceding[index]);
        assert.equal(spans.length, deltas ? 2 : 1);
        if (deltas) {
          assert.equal(spans[1].props.children, deltas[index][0]);
          assert.equal(spans[1].props.className, "text-xs font-semibold " + (deltas[index][1] ? "text-teal-300" : "text-slate-400"));
          assert.equal(content.length, 2); assert.equal(content[1].props.className, "ml-auto w-full max-w-[130px]");
        } else assert.equal(content.length, 1, "absent spark stays absent, without a replacement wrapper");
        assert.ok(card.props.title.includes("Selected: " + values[index] + ", "));
        assert.ok(card.props.title.includes(" \u00b7 Preceding: " + preceding[index] + ", "));
      });
      const html = renderToStaticMarkup(React.createElement(MomentumStrip, { calendar: rows, scope }));
      assert.equal((html.match(/data-momentum-deck="true"/g) ?? []).length, 1, "real Surface forwards the literal marker");
      assert.match(html, /class="ui-surface"/); assert.match(html, /aria-label="Momentum metrics" tabindex="0"/);
      assert.equal((html.match(/<svg\b/g) ?? []).length, deltas ? 3 : 0);
      assert.equal((html.match(/<polyline\b/g) ?? []).length, deltas ? 6 : 0);
      assert.equal((html.match(/Comparison unavailable/g) ?? []).length, deltas ? 0 : 1);
      assert.doesNotMatch(html, /this week|last week|NaN|Infinity|<script\b/i);
      assert.equal(JSON.stringify(rows), before); return { html, heading, cards };
    };
    await t.test("zero, partial and complete supplied windows preserve sums, missing sides and six comparison segments", () => {
      for (const count of [0, 1, 6, 7, 13, 14, 365]) {
        const selected = Math.min(count, 7), prior = Math.min(Math.max(count - 7, 0), 7);
        const values = selected ? [String(selected * 2), "\u2248 " + selected * 3 + "m", String(selected)] : Array(3).fill("Unavailable");
        const preceding = prior ? [String(prior * 2), "\u2248 " + prior * 3 + "m", String(prior)] : Array(3).fill("Unavailable");
        const result = inspect(calendar(count), undefined, values, preceding, count >= 14 ? Array.from({ length: 3 }, () => ["= 0%", false]) : null);
        assert.ok(result.heading.props.description.includes(selected + "/7 days."));
        assert.ok(result.heading.props.description.includes(prior + "/7 days. Scope: All repos."));
        if (count === 0) assert.ok(result.heading.props.description.includes("Dates unavailable (UTC)"));
        if (count >= 7) assert.ok(result.heading.props.description.includes("Selected: 2026-09-09 to 2026-09-15 (UTC)"));
        if (count >= 14) assert.ok(result.heading.props.description.includes("Preceding: 2026-09-02 to 2026-09-08 (UTC)"));
      }
    });
    await t.test("full measured zeros remain values with neutral chips and flat split sparks", () => {
      const rows = calendar(365).map(row => ({ ...row, events: 0, minutes: 0, commits: 0 }));
      const { html } = inspect(rows, "Quiet", ["0", "\u2248 0m", "0"], ["0", "\u2248 0m", "0"], Array.from({ length: 3 }, () => ["\u2014", false]));
      assert.doesNotMatch(html, /Unavailable|new \u25b2/);
      const points = [...html.matchAll(/<polyline points="([^"]*)"/g)].map(match => match[1]);
      assert.deepEqual(points, Array.from({ length: 3 }, () => [constantPoints(xPrior, "26.0"), constantPoints(xCurrent, "26.0")]).flat());
    });
    await t.test("current and stale snapshots retain new, increasing and neutral decreasing deltas with true spark boundaries", () => {
      for (const end of ["2026-09-15", "2026-10-01"]) {
        const rows = calendar(14, end).map((row, index) => ({ ...row, events: index < 7 ? 0 : 2, minutes: index < 7 ? 1 : 2, commits: index < 7 ? 2 : 1 }));
        const { html, heading } = inspect(rows, "Probe", ["14", "\u2248 14m", "7"], ["0", "\u2248 7m", "14"], [["new \u25b2", true], ["\u25b2 100%", true], ["\u25bc 50%", false]]);
        assert.ok(heading.props.description.includes(end + " (UTC)"));
        const points = [...html.matchAll(/<polyline points="([^"]*)"/g)].map(match => match[1]);
        assert.deepEqual(points, [
          constantPoints(xPrior, "26.0"), xCurrent[0] + ",26.0 " + constantPoints(xCurrent.slice(1), "2.0"),
          constantPoints(xPrior, "14.0"), xCurrent[0] + ",14.0 " + constantPoints(xCurrent.slice(1), "2.0"),
          constantPoints(xPrior, "2.0"), xCurrent[0] + ",2.0 " + constantPoints(xCurrent.slice(1), "14.0"),
        ]);
        for (const tag of html.match(/<svg[^>]*>/g)) {
          assert.match(tag, /viewBox="0 0 100 28"/); assert.match(tag, /class="h-7 w-full max-w-\[130px\]"/); assert.match(tag, /aria-hidden="true"/);
        }
        assert.equal((html.match(/opacity="0.35"/g) ?? []).length, 3);
      }
    });
    await t.test("long exact values and escaped scopes, supplied dates and titles stay in source order without mutation", () => {
      const rows = calendar(14).map(row => ({ ...row, events: 1234567890, minutes: 120, commits: 987654321 }));
      rows[0].day = '<prior>"&'; rows[7].day = '<selected>"&';
      const scope = '<scope>"&' + "LongRepository".repeat(40);
      const { html, heading, cards } = inspect(rows, scope, ["8,641,975,230", "\u2248 14h 0m", "6,913,580,247"],
        ["8,641,975,230", "\u2248 14h 0m", "6,913,580,247"], Array.from({ length: 3 }, () => ["= 0%", false]));
      for (const expected of ["&lt;scope&gt;&quot;&amp;", "&lt;prior&gt;&quot;&amp;", "&lt;selected&gt;&quot;&amp;"]) assert.ok(html.includes(expected));
      assert.doesNotMatch(html, /<scope>|<prior>|<selected>/); assert.ok(heading.props.description.endsWith("Scope: " + scope + "."));
      assert.deepEqual(cards.map(card => children(children(card)[0])[0].props.children), labels);
      assert.ok(cards.every(card => card.props.title.includes('<selected>"&') && card.props.title.includes('<prior>"&')));
    });
  } finally { await vite.close(); }
});
