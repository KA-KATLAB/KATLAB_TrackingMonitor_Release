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
const frontend = resolve(root, "Frontend"), require = createRequire(resolve(frontend, "package.json"));
const ts = require("typescript"), postcss = require("postcss"), selectors = require("postcss-selector-parser");
const React = require("react"), { renderToStaticMarkup } = require("react-dom/server");
const read = path => readFileSync(resolve(root, path), "utf8");
const sha = value => createHash("sha256").update(value).digest("hex"), lf = value => value.replace(/\r\n/g, "\n");
const source = read("Frontend/src/records.tsx");
const ANCHOR = 'import { SectionHeading, Surface } from "./ui";';
const IMPORT = 'import "./personalRecordsDeck.css";';
const OLD_SURFACE = '<Surface data-reveal tone="quiet">';
const NEW_SURFACE = '<Surface data-reveal tone="quiet" data-personal-records="true">';
const OLD_RAW = "f0fec43ee56c4ddbadb7a65c3e67cfbd17eba13ecec8f90685e14670ff412ae4";
const OLD_LF = "2796ddd5824d9c64a9a64512d6c7b31e553c098c46e4051932db4ddb1254a46d";
const NEW_RAW = "d9c3244f4d6ec9344bee7c7d6b39b3993cb19bef800c9d2440e8fda0e7f70793";
const NEW_LF = "b84ed071b07eef185bccedd51f8a0132b36d5f15a6309405fc181d04db55ed5f";
const CSS_HASH = "15fc5cced9dda9e1c491dd9df02574d61a7ea2650a80bb05817a8d554eb3b8fd";
const MONO = '"Azeret Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
const LIST = '.ui-surface[data-personal-records="true"] > ul', CARD = LIST + " > li";
// Independent reviewed expectations; never read the ignored plan.
const CSS = [
  "/* Personal records hierarchy only; snapshot and celebration owners stay. */",
  LIST + " {",
  "  display: grid;",
  "  grid-template-columns: minmax(0, 1fr);",
  "  gap: 16px;",
  "}",
  CARD + " {",
  "  min-width: 0;",
  "  padding: 16px;",
  "  border: 1px solid rgb(var(--ui-border));",
  "  border-radius: 8px;",
  "  background-color: rgb(var(--ui-surface));",
  "  row-gap: 0;",
  "}",
  CARD + " > span:nth-child(1) {",
  "  flex-basis: 100%;",
  "  min-width: 0;",
  "  font-size: 16px;",
  "  line-height: 24px;",
  "  margin-bottom: 8px;",
  "  overflow-wrap: anywhere;",
  "}",
  CARD + " > span:nth-child(2) {",
  "  flex-basis: 100%;",
  "  min-width: 0;",
  "  font-family: " + MONO + ";",
  "  font-size: 32px;",
  "  line-height: 40px;",
  "  font-variant-numeric: tabular-nums;",
  "  margin-bottom: 8px;",
  "  overflow-wrap: anywhere;",
  "}",
  CARD + " > span:nth-child(3) {",
  "  flex-basis: 100%;",
  "  min-width: 0;",
  "  font-size: 12px;",
  "  line-height: 18px;",
  "  margin-left: 0;",
  "  overflow-wrap: anywhere;",
  "}",
  "@media (min-width: 640px) {",
  "  " + LIST + " {",
  "    grid-template-columns: repeat(2, minmax(0, 1fr));",
  "  }",
  "}", "",
].join("\n");
const RULES = [
  [LIST, [["display", "grid"], ["grid-template-columns", "minmax(0, 1fr)"], ["gap", "16px"]]],
  [CARD, [["min-width", "0"], ["padding", "16px"], ["border", "1px solid rgb(var(--ui-border))"], ["border-radius", "8px"], ["background-color", "rgb(var(--ui-surface))"], ["row-gap", "0"]]],
  [CARD + " > span:nth-child(1)", [["flex-basis", "100%"], ["min-width", "0"], ["font-size", "16px"], ["line-height", "24px"], ["margin-bottom", "8px"], ["overflow-wrap", "anywhere"]]],
  [CARD + " > span:nth-child(2)", [["flex-basis", "100%"], ["min-width", "0"], ["font-family", MONO], ["font-size", "32px"], ["line-height", "40px"], ["font-variant-numeric", "tabular-nums"], ["margin-bottom", "8px"], ["overflow-wrap", "anywhere"]]],
  [CARD + " > span:nth-child(3)", [["flex-basis", "100%"], ["min-width", "0"], ["font-size", "12px"], ["line-height", "18px"], ["margin-left", "0"], ["overflow-wrap", "anywhere"]]],
  [LIST, [["grid-template-columns", "repeat(2, minmax(0, 1fr))"]]],
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
  ["Frontend/src/pet.tsx","cdf154c1c90b210af04e9fa8ab35678477d4f699b700f0958402041ebf2cdf3a","ea035d48a1ab80921d9921d0914be887d2c629ece925c0363f8205445b487236"],
  ["Frontend/src/momentum.tsx","030a2eb4148a1be39c57254dbe112d0f9571514fd6ac45f41adf4db372d2b0a3","a38e9ca14e0061b29c0a4f8238c550a18a8b9dd94d0b98650d8b86bd625c7c29"],
  ["Frontend/src/momentumComparison.css","19905b16379674a292331f43dbdc280573c7270c90453409b1a53655aebc8941","19905b16379674a292331f43dbdc280573c7270c90453409b1a53655aebc8941"],
  ["Tests/test_year_snapshot.mjs","89c3369c6ffebde5d574671a8cf630b5d916f9ba6462d0262280ca4037936777","bbd59afcf70e5cebcd546282b512f649028fdb0ce3ef665429f23fb23c7ade97"],
  ["Tests/test_momentum_comparison_deck.mjs","e7ea2bc5ced58860057a87c37b62756b4f018dcd4d703d0efaf1ae3c2a5ef5d9","e7ea2bc5ced58860057a87c37b62756b4f018dcd4d703d0efaf1ae3c2a5ef5d9"],
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
  const ast = ts.createSourceFile("records.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  assert.equal(ast.parseDiagnostics.length, 0, "valid complete TSX"); return ast;
}
function all (node) {
  const nodes = [node]; ts.forEachChild(node, child => { nodes.push(...all(child)); }); return nodes;
}
function one (nodes, predicate, label) {
  const found = nodes.filter(predicate); assert.equal(found.length, 1, label); return found[0];
}
function replaceOnce (text, old, next) {
  assert.equal(text.split(old).length - 1, 1, "one fixture window"); return text.replace(old, next);
}
function restoreRecords (text) {
  const eol = ending(text), ast = parse(text), imports = ast.statements.filter(ts.isImportDeclaration);
  const added = one(imports, n => n.moduleSpecifier.text === "./personalRecordsDeck.css", "one top-level CSS import");
  const anchor = one(imports, n => n.getText(ast) === ANCHOR, "one exact UI anchor");
  assert.equal(added.importClause, undefined); assert.equal(added.getText(ast), IMPORT);
  assert.equal(text.split(IMPORT).length - 1, 1); assert.equal(text.split(ANCHOR).length - 1, 1);
  assert.equal(added.getStart(ast), anchor.end + eol.length, "immediately following physical line");
  assert.equal(text.slice(added.getStart(ast), added.end + eol.length), IMPORT + eol);
  const owner = one(ast.statements, n => ts.isFunctionDeclaration(n) && n.name?.text === "Records", "current top-level Records");
  const returned = owner.body.statements.at(-1); assert.ok(ts.isReturnStatement(returned));
  let result = returned.expression; while (ts.isParenthesizedExpression(result)) result = result.expression;
  assert.ok(ts.isJsxElement(result), "no added wrapper");
  const opening = result.openingElement; assert.equal(opening.tagName.getText(ast), "Surface");
  assert.equal(opening.getText(ast), NEW_SURFACE); assert.equal(result.closingElement.tagName.getText(ast), "Surface");
  const marker = one(all(ast), n => ts.isJsxAttribute(n) && n.name.getText(ast) === "data-personal-records", "one literal owned marker");
  assert.ok(opening.attributes.properties.includes(marker)); assert.ok(ts.isStringLiteral(marker.initializer));
  assert.equal(marker.initializer.text, "true"); assert.equal(text.split(NEW_SURFACE).length - 1, 1);
  const originalTag = text.slice(0, opening.getStart(ast)) + OLD_SURFACE + text.slice(opening.end);
  const original = originalTag.slice(0, added.getStart(ast)) + originalTag.slice(added.end + eol.length);
  parse(original); assert.equal(ending(original), eol); return original;
}
function checkCss (text) {
  assert.equal(ending(text), "\n", "new CSS is LF only");
  const ast = postcss.parse(text);
  assert.deepEqual(ast.nodes.map(n => n.type), ["comment", ...Array(5).fill("rule"), "atrule"]);
  assert.equal(ast.nodes[0].text, "Personal records hierarchy only; snapshot and celebration owners stay.");
  const media = ast.nodes.at(-1); assert.equal(media.name, "media"); assert.equal(media.params, "(min-width: 640px)");
  assert.deepEqual(media.nodes.map(n => n.type), ["rule"], "one direct media rule only");
  [...ast.nodes.slice(1, 6), media.nodes[0]].forEach((node, index) => {
    const [selector, declarations] = RULES[index], parsed = selectors().astSync(node.selector);
    assert.equal(parsed.nodes.length, 1); assert.equal(parsed.toString(), selectors().astSync(selector).toString());
    assert.ok(node.nodes.every(n => n.type === "decl"), "all direct children are declarations");
    assert.deepEqual(node.nodes.map(n => [n.prop, n.value, Boolean(n.important)]), declarations.map(([p, v]) => [p, v, false]));
  });
}

test("independent full stylesheet preserves six strict rules, mono and the text-only span boundary", () => {
  assert.equal(CSS.split("\n").length - 1, 45); assert.equal(Buffer.byteLength(CSS), 1317);
  assert.equal(sha(CSS), CSS_HASH); const actual = read("Frontend/src/personalRecordsDeck.css");
  assert.equal(actual, CSS); checkCss(actual);
  assert.equal(MONO, ['"Azeret Mono"', ...require("tailwindcss/defaultTheme").fontFamily.mono].join(", "));
  assert.ok(RULES.every(([selector]) => !selector.includes("nth-child(4)") && !selector.includes(".burst-p")));
});
test("CSS oracle rejects roots, media/nested escapes, selectors, values, priorities and physical-byte corruption", () => {
  const mediaEnd = "    grid-template-columns: repeat(2, minmax(0, 1fr));\n";
  const variants = [
    ...["body { color: red; }\n", "@import 'x';\n", "@font-face { font-family: x; }\n", "/* extra */\n"].map(v => CSS + v),
    ...["& span { color: red; }", "@supports (display: grid) { color: red; }", "/* nested */", "@font-face { font-family: x; }"].map(v => CSS.replace("  display: grid;", "  display: grid;\n  " + v)),
    ...["  @font-face { font-family: x; }\n", "  @supports (display: grid) { body { color: red; } }\n", "  color: red;\n", "  /* extra */\n"].map(v => CSS.replace("@media (min-width: 640px) {\n", "@media (min-width: 640px) {\n" + v)),
    CSS.replace(mediaEnd, mediaEnd + "    & span { color: red; }\n"), CSS.replace("640px", "641px"),
    ...["padding: 16px !important;", "padding: 16px; padding: 16px;", "height: 1px;", "width: 1px;", "position: absolute;", "order: 1;", "overflow: hidden;", "animation: pulse 1s;", "background: url(https://invalid.example/x);"].map(v => CSS.replace("padding: 16px;", v)),
    CSS.replace(LIST, "body"), CSS.replace(LIST, LIST + ", body"), CSS.replace("span:nth-child(3)", "span:nth-child(4)"),
    CSS.replace(" > span:nth-child(1)", " span:nth-child(1)"), CSS.replace("row-gap: 0;", "row-gap: 4px;"),
    CSS.replace("flex-basis: 100%;", "flex-basis: auto;"), CSS.replace("32px", "18px"), CSS.replace("40px", "41px"),
    CSS.replace(MONO, "sans-serif"), CSS.replace("tabular-nums", "normal"), CSS.replace("anywhere", "normal"),
    CSS.replace("}", ""), "\uFEFF" + CSS, CSS + "\0", CSS + "\n", CSS.slice(0, -1),
    CSS.replace("\n", "\r"), CSS.replace("\n", "\r\n"), CSS.replace(/\n/g, "\r\n"), CSS.replace("row-gap: 0;", "row-gap: 0; "),
  ];
  variants.forEach(value => assert.throws(() => checkCss(value)));
});
test("actual owned two-window inverse matches whole original/result RAW and LF identities", () => {
  assert.equal(ending(source), "\r\n"); assert.equal(Buffer.byteLength(source), 7409);
  assert.equal(sha(source), NEW_RAW); assert.equal(sha(lf(source)), NEW_LF);
  const restored = restoreRecords(source); assert.equal(Buffer.byteLength(restored), 7343);
  assert.equal(sha(restored), OLD_RAW); assert.equal(sha(lf(restored)), OLD_LF);
  for (const eol of ["\n", "\r\n"]) {
    const fixture = lf(source).replace(/\n/g, eol), original = restoreRecords(fixture);
    assert.equal(sha(lf(original)), OLD_LF);
    assert.equal(original, fixture.replace(IMPORT + eol, "").replace(NEW_SURFACE, OLD_SURFACE));
  }
});
test("source inverse rejects missing, duplicate, relocated, commented and wrong-owner fixtures", () => {
  const current = lf(source), removed = current.replace(IMPORT + "\n", "");
  const variants = [
    removed, current.replace(IMPORT, IMPORT + "\n" + IMPORT), current.replace(IMPORT, "// " + IMPORT),
    current.replace(IMPORT, 'import sheet from "./personalRecordsDeck.css";'),
    current.replace(IMPORT, "import './personalRecordsDeck.css';"), current.replace(IMPORT, IMPORT + " // comment"),
    removed.replace('import { useEffect, useRef, useState } from "react";', 'import { useEffect, useRef, useState } from "react";\n' + IMPORT),
    current.replace(ANCHOR + "\n" + IMPORT, ANCHOR + "\n\n" + IMPORT),
    current.replace(IMPORT, "function Nested () { " + IMPORT + " }"), current + "// " + IMPORT + "\n",
    current.replace(NEW_SURFACE, OLD_SURFACE), current.replace(NEW_SURFACE, NEW_SURFACE.replace('"true"', "{true}")),
    current.replace(NEW_SURFACE, NEW_SURFACE.replace('"true"', '"false"')),
    current.replace(NEW_SURFACE, NEW_SURFACE.replace(">", ' data-extra="x">')),
    current.replace(NEW_SURFACE, NEW_SURFACE.replace(">", ' data-personal-records="true">')),
    current.replace(NEW_SURFACE, OLD_SURFACE).replace('<ul className=', '<ul data-personal-records="true" className='),
    current.replace(NEW_SURFACE, "<div>" + NEW_SURFACE).replace("</Surface>", "</Surface></div>"),
    current.replace("export function Records", "export function Other"), current.replace('data-personal-records="true"', '/* data-personal-records="true" */'),
    current.replace(NEW_SURFACE, OLD_SURFACE).trimEnd() + "\nconst fake = " + JSON.stringify(NEW_SURFACE) + ";\n",
    current.slice(0, -6), "\uFEFF" + current, current + "\0", current + "\n", current.slice(0, -1),
    current.replace("\n", "\r\n"), current.replace("\n", "\r"),
  ];
  variants.forEach(value => assert.throws(() => restoreRecords(value)));
});
test("valid unrelated prose, calculations and list edits survive inverse and fail complete original pins", () => {
  const current = lf(source), original = restoreRecords(current);
  for (const [old, next] of [["// Personal records span", "// Unrelated documentation: records span"],
    ["const prior = calendar.slice(0, -1)", "const prior = calendar.slice(0, -2)"],
    ['className="min-w-0 text-base"', 'className="min-w-0 text-sm"']]) {
    const restored = restoreRecords(replaceOnce(current, old, next));
    assert.equal(restored, replaceOnce(original, old, next)); assert.notEqual(sha(restored), OLD_LF);
  }
});
test("unchanged caller, pet, helpers, motion, styles, Chronicle, lifecycle, suites and six dependencies retain RAW/LF pins", () => {
  assert.equal(PINS.length, 46);
  for (const [path, raw, normalized] of PINS) {
    const bytes = deskPreservation(path, mastheadPreservation(path, cityBriefPreservation(path, purposeNavigationPreservation(path, readFileSync(resolve(root, path)))))); assert.equal(sha(bytes), raw, path + " RAW");
    assert.equal(sha(lf(bytes.toString("utf8"))), normalized, path + " LF");
  }
});

const KEYS = ["dayEvents", "dayMinutes", "streak", "week"];
const LABELS = ["best day \u2014 captures", "best day \u2014 effort", "longest streak", "best week (rolling 7d)"];
const ROW_CLASS = "relative flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-ui-border py-3 last:border-b-0";
const SPAN_CLASSES = ["min-w-0 break-words text-ui-muted", "font-semibold tabular-nums text-ui-text", "ml-auto text-xs text-ui-muted"];
const children = node => React.Children.toArray(node.props.children);
function freeze (value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}
function calendar (count, end = "2026-09-15") {
  const last = Date.parse(end + "T00:00:00Z");
  return Array.from({ length: count }, (_, index) => ({ day: new Date(last - (count - index - 1) * 86_400_000).toISOString().slice(0, 10),
    events: 2, minutes: 3, commits: 1 }));
}
// Only CURRENT source is transpiled. Inverse/history/negative fixtures remain data.
function controlledRecords (deps, seededBursts, seededBanner, reduced = false) {
  const ast = parse(source);
  const code = ts.transpileModule(ast.statements.filter(n => !ts.isImportDeclaration(n)).map(n => n.getText(ast)).join("\n"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  let slot = 0;
  const useState = () => [slot++ === 0 ? seededBursts : seededBanner, () => {}];
  const values = [require, {}, () => {}, initial => ({ current: initial }), useState, () => reduced,
    deps.calendarRangeLabel, deps.fmtMinutes, deps.Surface, deps.SectionHeading];
  return new Function("require", "exports", "useEffect", "useRef", "useState", "usePrefersReducedMotion",
    "calendarRangeLabel", "fmtMinutes", "Surface", "SectionHeading", code + "\nreturn exports.Records;")(...values);
}

test("current Vite SSR/real Surface preserve four rows, supplied records, helpers and controlled decorative rendering", { timeout: 30_000 }, async t => {
  const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
  const vite = await createServer({ root: frontend, server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom", optimizeDeps: { noDiscovery: true, entries: [] } });
  try {
    const actual = await vite.ssrLoadModule("/src/records.tsx"), ui = await vite.ssrLoadModule("/src/ui.tsx");
    const dates = await vite.ssrLoadModule("/src/calendarDay.ts"), format = await vite.ssrLoadModule("/src/format.ts");
    const { wardrobeOf } = await vite.ssrLoadModule("/src/pet.tsx");
    const inspect = (rows, values, expectedDays) => {
      const before = JSON.stringify(rows); freeze(rows); let tree;
      function Capture () { tree = actual.Records({ calendar: rows }); return tree; }
      const html = renderToStaticMarkup(React.createElement(Capture));
      assert.equal(tree.type, ui.Surface); assert.equal(tree.props.tone, "quiet");
      assert.equal(tree.props["data-reveal"], true); assert.equal(tree.props["data-personal-records"], "true");
      const [heading, list] = children(tree);
      assert.equal(heading.type, ui.SectionHeading); assert.equal(heading.props.level, 4); assert.equal(heading.props.title, "Personal records");
      assert.equal(heading.props.description, dates.calendarRangeLabel(rows) + "; " + rows.length + "/365 days supplied.");
      assert.equal(heading.props.actions, undefined); assert.equal(list.type, "ul"); assert.equal(list.props.className, "min-w-0 text-base");
      const records = list.props.children; assert.equal(records.length, 4); assert.deepEqual(records.map(row => row.key), KEYS);
      records.forEach((row, index) => {
        assert.equal(row.type, "li"); assert.equal(row.props.className, ROW_CLASS); const text = children(row);
        assert.equal(text.length, 3); assert.deepEqual(text.map(span => span.type), Array(3).fill("span"));
        assert.deepEqual(text.map(span => span.props.className), SPAN_CLASSES);
        assert.deepEqual(text.map(span => span.props.children), [LABELS[index], values[index], expectedDays[index] || "\u2014"]);
      });
      assert.match(html, /class="ui-surface ui-surface-quiet"/);
      assert.equal((html.match(/data-personal-records="true"/g) ?? []).length, 1);
      assert.equal((html.match(/<li\b/g) ?? []).length, 4); assert.doesNotMatch(html, /burst-p|NEW RECORD|Last 365 days|current year|<script\b/i);
      assert.equal(JSON.stringify(rows), before); return { html, tree, records };
    };
    await t.test("absent, partial, complete and positive supplied windows keep current numbers and earliest dates", () => {
      for (const count of [0, 1, 6, 7, 14, 365]) {
        const rows = calendar(count), start = rows[0]?.day || "", end = rows.at(-1)?.day || "";
        inspect(rows, [count ? "2" : "0", count ? "\u2248 3m" : "\u2248 0m", count + (count === 1 ? " day" : " days"),
          count >= 7 ? "14 captures" : "0 captures"], [start, start, end, count >= 7 ? rows[6].day : ""]);
      }
      const zeros = calendar(365).map(row => ({ ...row, events: 0, minutes: 0, commits: 0 }));
      const { html } = inspect(zeros, ["0", "\u2248 0m", "0 days", "0 captures"], ["", "", "", ""]);
      assert.doesNotMatch(html, /Unavailable|new record/i);
    });
    await t.test("tied maxima, full-calendar helpers and actual wardrobe keep original results without mutation", () => {
      const rows = calendar(365).map(row => ({ ...row, events: 0, minutes: 0 }));
      for (let index = 0; index < 7; index++) rows[index].events = 2;
      rows[20].events = 300; rows[21].events = 300; rows[22].minutes = 90; rows[23].minutes = 90;
      const before = JSON.stringify(rows); freeze(rows);
      inspect(rows, ["300", "\u2248 1h 30m", "7 days", "600 captures"], [rows[20].day, rows[22].day, rows[6].day, rows[21].day]);
      assert.deepEqual(actual.maxStreakOf(rows), { len: 7, endDay: rows[6].day });
      assert.deepEqual(actual.bestRolling7(rows), { sum: 600, endDay: rows[21].day });
      assert.deepEqual(wardrobeOf(rows), { collar: true, bandana: false, crown: false, scarf: true, star: true });
      assert.equal(JSON.stringify(rows), before);
    });
    await t.test("stale and year-boundary calendars retain their own absolute UTC period, not a fresh-year claim", () => {
      for (const end of ["2026-09-15", "2026-10-01", "2026-01-03", "2024-03-02"]) {
        const rows = calendar(365, end), first = rows[0].day;
        const { html } = inspect(rows, ["2", "\u2248 3m", "365 days", "14 captures"], [first, first, end, rows[6].day]);
        assert.ok(html.includes(first + " to " + end + " (UTC)")); assert.ok(html.includes("365/365 days supplied."));
      }
    });
    await t.test("long finite values and escaped supplied dates stay complete, ordered and immutable", () => {
      const rows = calendar(14).map(row => ({ ...row, events: 1234567890, minutes: 120 }));
      rows[0].day = '<first>"&' + "LongDate".repeat(25); rows[13].day = '<last>"&';
      const { html } = inspect(rows, ["1,234,567,890", "\u2248 2h 0m", "14 days", "8,641,975,230 captures"],
        [rows[0].day, rows[0].day, rows[13].day, rows[6].day]);
      assert.ok(html.includes("&lt;first&gt;&quot;&amp;" + "LongDate".repeat(25)));
      assert.ok(html.includes("&lt;last&gt;&quot;&amp;")); assert.doesNotMatch(html, /<first>|<last>/);
    });
    await t.test("controlled current hook rendering preserves banner and fourth-child twelve-particle recipe, not native effects", () => {
      const rowData = freeze(calendar(7)), deps = { ...ui, ...dates, ...format };
      const render = controlledRecords(deps, [{ row: "dayEvents", n: 41 }], 41);
      const tree = render({ calendar: rowData }), [heading, list] = children(tree);
      assert.equal(tree.type, ui.Surface); assert.equal(heading.type, ui.SectionHeading);
      assert.equal(heading.props.actions.type, "span");
      assert.equal(heading.props.actions.props.className, "rounded bg-amber-900/50 px-2 py-1 text-xs font-bold text-amber-300");
      assert.equal(heading.props.actions.props.children, "NEW RECORD \uD83C\uDFC6");
      const rows = list.props.children, fourth = children(rows[0])[3];
      assert.equal(fourth.type, "span"); assert.equal(fourth.props["aria-hidden"], "true");
      assert.equal(rows[0].props.children[3][0].key, "41");
      assert.deepEqual(Object.keys(fourth.props).sort(), ["aria-hidden", "children"]);
      const particles = fourth.props.children; assert.equal(particles.length, 12);
      assert.deepEqual(particles.map(p => p.key), Array.from({ length: 12 }, (_, index) => String(index)));
      const offsets = [[26, 0], [33, 19], [13, 23], [0, 38], [-13, 23], [-33, 19], [-26, 0], [-33, -19], [-13, -23], [0, -38], [13, -23], [33, -19]];
      particles.forEach((particle, index) => {
        assert.equal(particle.type, "span"); assert.equal(particle.props.className, "burst-p"); assert.equal(particle.props.children, undefined);
        assert.deepEqual(particle.props.style, { backgroundColor: ["#14b8a6", "#10b981", "#f59e0b"][index % 3],
          "--dx": offsets[index][0] + "px", "--dy": offsets[index][1] + "px" });
      });
      assert.ok(rows.slice(1).every(row => children(row).length === 3));
      const html = renderToStaticMarkup(tree); assert.equal((html.match(/class="burst-p"/g) ?? []).length, 12);
      assert.equal((html.match(/aria-hidden="true"/g) ?? []).length, 1); assert.match(html, /NEW RECORD/);
      const quiet = controlledRecords(deps, [], null, true)({ calendar: rowData });
      assert.equal(children(quiet)[0].props.actions, undefined); assert.ok(children(quiet)[1].props.children.every(row => children(row).length === 3));
      assert.doesNotMatch(renderToStaticMarkup(quiet), /burst-p|NEW RECORD/);
      // Effects are intentionally not run: no timer, motion, geometry or mounted acceptance claim.
    });
  } finally { await vite.close(); }
});
