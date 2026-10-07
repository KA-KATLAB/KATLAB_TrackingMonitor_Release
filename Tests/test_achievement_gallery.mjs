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
const frontend = resolve(root, "Frontend"), require = createRequire(resolve(frontend, "package.json"));
const ts = require("typescript"), postcss = require("postcss"), selectors = require("postcss-selector-parser");
const React = require("react"), { renderToStaticMarkup } = require("react-dom/server");
const read = name => readFileSync(resolve(root, name), "utf8");
const sha = value => createHash("sha256").update(value).digest("hex");
const lf = value => value.replace(/\r\n/g, "\n");
const source = read("Frontend/src/trophies.tsx");
const ANCHOR = 'import { SectionHeading, Surface } from "./ui";';
const IMPORT = 'import "./achievementGallery.css";';
const OLD_TAG = '<Surface data-reveal tone="quiet">';
const NEW_TAG = '<Surface data-reveal tone="quiet" data-achievement-gallery="true">';
const OLD_COLOR = 'color: crossed === 0 ? "#cbd5e1" : "#0f172a"';
const NEW_COLOR = 'color: crossed === 0 ? "#cbd5e1"\n                    : crossed === 1 ? "#ffffff" : crossed === 2 ? "#020617" : "#0f172a"';
const OLD_RAW = "33faa10a1ca19ee128af6a51bed21346fb55833f9513c51976ee8fb48b2f10dc";
const OLD_LF = "7610e55a8b315e56089e22bf5db491c7ed83923c738ce73399c8b100976cb5b0";
const NEW_RAW = "6d41ba0d47831baa86d77c48fa4d24f463e4caf2ba5607c539f9f418614b0f5f";
const NEW_LF = "45e9f9014eba7ace3a08dafb4cf89456bef3d39c1f83dcc2cf1bff4df92edd59";
const CSS_SHA = "82abe46e5b2576a2d2846ae8601d28a892f545421d114b4b5ac38129bd9d3245";
const MONO = '"Azeret Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
const GRID = '.ui-surface[data-achievement-gallery="true"] > .grid', CARD = GRID + " > div";
// Independent complete reviewed literal; no ignored plan or product-derived oracle.
const CSS = [
  "/* Earned progress presentation; thresholds, scope and secret owners stay. */",
  GRID + " {", "  gap: 16px;", "}",
  CARD + " {", "  min-width: 0;", "  padding: 16px;",
  "  border: 1px solid rgb(var(--ui-border));", "  border-radius: 8px;",
  "  background-color: rgb(var(--ui-surface));", "}",
  CARD + " > div.text-xl {", "  min-width: 0;", "  font-family: " + MONO + ";",
  "  font-size: 32px;", "  line-height: 40px;", "  font-variant-numeric: tabular-nums;",
  "  overflow-wrap: anywhere;", "}",
  CARD + " > div.leading-relaxed {", "  font-size: 14px;", "  line-height: 21px;",
  "  overflow-wrap: anywhere;", "}",
  CARD + " > div:nth-child(4) {", "  font-size: 12px;", "  line-height: 18px;",
  "  overflow-wrap: anywhere;", "}",
  CARD + " > .flex > span:nth-child(2) {", "  min-width: 0;", "  overflow-wrap: anywhere;", "}",
  CARD + " > .flex > span:nth-child(3) {", "  border-radius: 6px;", "  padding: 4px 8px;",
  "  font-size: 12px;", "  line-height: 18px;", "}", "",
].join("\n");
const RULES = [
  [GRID, [["gap", "16px"]]],
  [CARD, [["min-width", "0"], ["padding", "16px"], ["border", "1px solid rgb(var(--ui-border))"], ["border-radius", "8px"], ["background-color", "rgb(var(--ui-surface))"]]],
  [CARD + " > div.text-xl", [["min-width", "0"], ["font-family", MONO], ["font-size", "32px"], ["line-height", "40px"], ["font-variant-numeric", "tabular-nums"], ["overflow-wrap", "anywhere"]]],
  [CARD + " > div.leading-relaxed", [["font-size", "14px"], ["line-height", "21px"], ["overflow-wrap", "anywhere"]]],
  [CARD + " > div:nth-child(4)", [["font-size", "12px"], ["line-height", "18px"], ["overflow-wrap", "anywhere"]]],
  [CARD + " > .flex > span:nth-child(2)", [["min-width", "0"], ["overflow-wrap", "anywhere"]]],
  [CARD + " > .flex > span:nth-child(3)", [["border-radius", "6px"], ["padding", "4px 8px"], ["font-size", "12px"], ["line-height", "18px"]]],
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
  ["Frontend/src/records.tsx","d9c3244f4d6ec9344bee7c7d6b39b3993cb19bef800c9d2440e8fda0e7f70793","b84ed071b07eef185bccedd51f8a0132b36d5f15a6309405fc181d04db55ed5f"],
  ["Frontend/src/personalRecordsDeck.css","15fc5cced9dda9e1c491dd9df02574d61a7ea2650a80bb05817a8d554eb3b8fd","15fc5cced9dda9e1c491dd9df02574d61a7ea2650a80bb05817a8d554eb3b8fd"],
  ["Tests/test_personal_records_showcase.mjs","7c02d2daffa142b1a38722a18ff6067ac7739af2325237df5eaf28fbe070d537","7c02d2daffa142b1a38722a18ff6067ac7739af2325237df5eaf28fbe070d537"],
];

function ending (text) {
  assert.ok(!text.startsWith("\uFEFF") && !text.includes("\0"), "no BOM/NUL");
  const rest = text.replace(/\r\n/g, ""), eol = text.includes("\r\n") ? "\r\n" : "\n";
  assert.ok(!rest.includes("\r"), "no bare CR");
  if (eol === "\r\n") assert.ok(!rest.includes("\n"), "uniform physical EOL");
  assert.ok(text.endsWith(eol) && !text.endsWith(eol + eol), "single EOF");
  assert.doesNotMatch(text, /[ \t]+$/m); return eol;
}
function parse (text) {
  const ast = ts.createSourceFile("trophies.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  assert.equal(ast.parseDiagnostics.length, 0, "valid complete TSX"); return ast;
}
function all (node) {
  const result = [node]; ts.forEachChild(node, child => { result.push(...all(child)); }); return result;
}
function one (nodes, predicate, label) {
  const result = nodes.filter(predicate); assert.equal(result.length, 1, label); return result[0];
}
function replaceOnce (text, old, next) {
  assert.equal(text.split(old).length - 1, 1, "unique fixture window"); return text.replace(old, next);
}
function restore (text) {
  const eol = ending(text), ast = parse(text), imports = ast.statements.filter(ts.isImportDeclaration);
  const added = one(imports, n => n.moduleSpecifier.text === "./achievementGallery.css", "one top-level CSS import");
  const anchor = one(imports, n => n.getText(ast) === ANCHOR, "one exact UI import anchor");
  assert.equal(added.importClause, undefined); assert.equal(added.getText(ast), IMPORT);
  assert.equal(text.split(IMPORT).length - 1, 1); assert.equal(text.split(ANCHOR).length - 1, 1);
  assert.equal(added.getStart(ast), anchor.end + eol.length, "immediate physical line");
  assert.equal(text.slice(added.getStart(ast), added.end + eol.length), IMPORT + eol);
  const owner = one(ast.statements, n => ts.isFunctionDeclaration(n) && n.name?.text === "TrophyCase", "actual top-level owner");
  const returned = owner.body.statements.at(-1); assert.ok(ts.isReturnStatement(returned));
  let jsx = returned.expression; while (ts.isParenthesizedExpression(jsx)) jsx = jsx.expression;
  assert.ok(ts.isJsxElement(jsx), "no new wrapper"); const opening = jsx.openingElement;
  assert.equal(opening.getText(ast), NEW_TAG); assert.equal(jsx.closingElement.tagName.getText(ast), "Surface");
  const marker = one(all(ast), n => ts.isJsxAttribute(n) && n.name.getText(ast) === "data-achievement-gallery", "one marker");
  assert.ok(opening.attributes.properties.includes(marker));
  assert.ok(ts.isStringLiteral(marker.initializer)); assert.equal(marker.initializer.text, "true");
  assert.equal(text.split(NEW_TAG).length - 1, 1);
  const ranked = one(all(jsx), n => ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)
    && n.expression.expression.getText(ast) === "TROPHIES" && n.expression.name.text === "map", "actual ordinary tile map");
  assert.equal(ranked.arguments.length, 1); const callback = ranked.arguments[0];
  assert.ok(ts.isArrowFunction(callback) && ts.isBlock(callback.body));
  const color = one(all(callback.body), n => ts.isPropertyAssignment(n) && n.name.getText(ast) === "color", "ordinary foreground only");
  assert.ok(ts.isObjectLiteralExpression(color.parent));
  const style = color.parent.parent.parent;
  assert.ok(ts.isJsxAttribute(style) && style.name.getText(ast) === "style");
  assert.equal(style.parent.parent.tagName.getText(ast), "span");
  const literal = NEW_COLOR.replace(/\n/g, eol);
  assert.equal(color.getText(ast), literal); assert.equal(text.split(literal).length - 1, 1);
  const windows = [[added.getStart(ast), added.end + eol.length, ""],
    [opening.getStart(ast), opening.end, OLD_TAG], [color.getStart(ast), color.end, OLD_COLOR]];
  let original = text;
  for (const [start, end, replacement] of windows.sort((a, b) => b[0] - a[0])) original = original.slice(0, start) + replacement + original.slice(end);
  parse(original); assert.equal(ending(original), eol); return original;
}
function checkCss (text) {
  assert.equal(ending(text), "\n", "new stylesheet LF only");
  const ast = postcss.parse(text);
  assert.deepEqual(ast.nodes.map(n => n.type), ["comment", ...Array(7).fill("rule")]);
  assert.equal(ast.nodes[0].text, "Earned progress presentation; thresholds, scope and secret owners stay.");
  ast.nodes.slice(1).forEach((node, index) => {
    const [selector, declarations] = RULES[index], parsed = selectors().astSync(node.selector);
    assert.equal(parsed.nodes.length, 1); assert.equal(parsed.toString(), selectors().astSync(selector).toString());
    assert.ok(node.nodes.every(n => n.type === "decl"), "every direct child is a declaration");
    assert.deepEqual(node.nodes.map(n => [n.prop, n.value, Boolean(n.important)]), declarations.map(([p, v]) => [p, v, false]));
  });
}

test("independent full CSS has seven scoped root rules and configured mono without unrelated owners", () => {
  assert.equal(CSS.split("\n").length - 1, 39); assert.equal(Buffer.byteLength(CSS), 1289); assert.equal(sha(CSS), CSS_SHA);
  const current = read("Frontend/src/achievementGallery.css"); assert.equal(current, CSS); checkCss(current);
  assert.equal(MONO, ['"Azeret Mono"', ...require("tailwindcss/defaultTheme").fontFamily.mono].join(", "));
  assert.ok(RULES.every(([s]) => s.startsWith(GRID) && !/Records|momentum|work-list|h-1/.test(s)));
});
test("CSS adversaries reject roots, nested nodes, globals, values, priorities, colors, motion and physical corruption", () => {
  const variants = [
    ...["body { color: red; }\n", "@media (min-width: 640px) { body { color: red; } }\n",
      "@font-face { font-family: x; }\n", "@import 'x';\n", "/* extra */\n"].map(x => CSS + x),
    ...["& span { color: red; }", "@supports (display: grid) { color: red; }",
      "@media (min-width: 640px) { color: red; }", "/* nested */", "@font-face { font-family: x; }"]
      .map(x => CSS.replace("  gap: 16px;", "  gap: 16px;\n  " + x)),
    ...["padding: 16px !important;", "padding: 16px; padding: 16px;", "color: red;",
      "opacity: .5;", "height: 1px;", "max-height: 1px;", "overflow: hidden;", "order: 1;",
      "position: absolute;", "animation: pulse 1s;", "background: url(https://invalid.example/x);"]
      .map(x => CSS.replace("padding: 16px;", x)),
    CSS.replace(GRID, "body"), CSS.replace(GRID, GRID + ", body"), CSS.replace(" > .grid", " .grid"),
    CSS.replace("div.text-xl", "div"), CSS.replace("div.leading-relaxed", "div.text-xl"),
    CSS.replace("div:nth-child(4)", "div:nth-child(5)"), CSS.replace("span:nth-child(3)", "span"),
    CSS.replace("gap: 16px", "gap: 17px"), CSS.replace("32px", "20px"), CSS.replace("40px", "41px"),
    CSS.replace(MONO, "sans-serif"), CSS.replace("tabular-nums", "normal"), CSS.replace("anywhere", "normal"),
    CSS.replace("}", ""), "\uFEFF" + CSS, CSS + "\0", CSS + "\n", CSS.slice(0, -1),
    CSS.replace("\n", "\r"), CSS.replace("\n", "\r\n"), CSS.replace(/\n/g, "\r\n"), CSS.replace("gap: 16px;", "gap: 16px; "),
  ];
  variants.forEach(value => assert.throws(() => checkCss(value)));
});
test("actual three owned source windows preserve complete original and result RAW/LF in LF and CRLF fixtures", () => {
  assert.equal(ending(source), "\r\n"); assert.equal(Buffer.byteLength(source), 7361);
  assert.equal(sha(source), NEW_RAW); assert.equal(sha(lf(source)), NEW_LF);
  const original = restore(source); assert.equal(Buffer.byteLength(original), 7216);
  assert.equal(sha(original), OLD_RAW); assert.equal(sha(lf(original)), OLD_LF);
  for (const eol of ["\n", "\r\n"]) {
    const fixture = lf(source).replace(/\n/g, eol), restored = restore(fixture);
    assert.equal(sha(lf(restored)), OLD_LF);
    assert.equal(restored, fixture.replace(IMPORT + eol, "").replace(NEW_TAG, OLD_TAG).replace(NEW_COLOR.replace(/\n/g, eol), OLD_COLOR));
  }
});
test("source inverse rejects missing, duplicated, relocated, commented, wrong-owner and malformed windows", () => {
  const current = lf(source), removed = current.replace(IMPORT + "\n", "");
  const variants = [
    removed, current.replace(IMPORT, IMPORT + "\n" + IMPORT), current.replace(IMPORT, "// " + IMPORT),
    current.replace(IMPORT, 'import sheet from "./achievementGallery.css";'),
    current.replace(IMPORT, "import './achievementGallery.css';"), current.replace(IMPORT, IMPORT + " // comment"),
    removed.replace(ANCHOR, IMPORT + "\n" + ANCHOR), current.replace(ANCHOR + "\n" + IMPORT, ANCHOR + "\n\n" + IMPORT),
    current.replace(IMPORT, "function Nested () { " + IMPORT + " }"), current + "// " + IMPORT + "\n",
    current.replace(NEW_TAG, OLD_TAG), current.replace(NEW_TAG, NEW_TAG.replace('"true"', "{true}")),
    current.replace(NEW_TAG, NEW_TAG.replace('"true"', '"false"')),
    current.replace(NEW_TAG, NEW_TAG.replace(">", ' data-extra="x">')),
    current.replace(NEW_TAG, NEW_TAG.replace(">", ' data-achievement-gallery="true">')),
    current.replace(NEW_TAG, OLD_TAG).replace('<div className="grid', '<div data-achievement-gallery="true" className="grid'),
    current.replace(NEW_TAG, "<div>" + NEW_TAG).replace("</Surface>", "</Surface></div>"),
    current.replace("export function TrophyCase", "export function Other"),
    current.replace(NEW_TAG, OLD_TAG).trimEnd() + "\nconst fake = " + JSON.stringify(NEW_TAG) + ";\n",
    current.replace(NEW_COLOR, OLD_COLOR), current.replace(NEW_COLOR, NEW_COLOR.replace("#ffffff", "#fff")),
    current.replace(NEW_COLOR, NEW_COLOR.replace("crossed === 1", "crossed === 2")),
    current.replace(NEW_COLOR, NEW_COLOR.replace("\n", " /* comment */\n")),
    current.replace(NEW_COLOR, OLD_COLOR).replace('color: un ? "#0f172a" : "#cbd5e1"', NEW_COLOR),
    current.replace("TROPHIES.map", "SECRETS.map"), current + "/* " + NEW_COLOR + " */\n",
    current.slice(0, -6), "\uFEFF" + current, current + "\0", current + "\n", current.slice(0, -1),
    current.replace("\n", "\r\n"), current.replace("\n", "\r"),
  ];
  variants.forEach(value => assert.throws(() => restore(value)));
});
test("valid unrelated source changes survive the inverse but fail complete historical preservation pins", () => {
  const current = lf(source), original = restore(current);
  for (const [old, next] of [["// v0.1.9.0 D2", "// Unrelated prose D2"],
    ["thresholds: [50, 250", "thresholds: [51, 250"],
    ['className="grid min-w-0', 'className="grid min-w-1'],
    ['story: "a single day', 'story: "another day']]) {
    const restored = restore(replaceOnce(current, old, next));
    assert.equal(restored, replaceOnce(original, old, next)); assert.notEqual(sha(restored), OLD_LF);
  }
});
test("all unchanged caller, data, shared UI, previous suites, Chronicle, lifecycle and six dependency pins retain RAW/LF", () => {
  assert.equal(PINS.length, 49); assert.equal(new Set(PINS.map(([name]) => name)).size, 49);
  for (const [name, raw, normalized] of PINS) {
    const bytes = deskPreservation(name, mastheadPreservation(name, cityBriefPreservation(name, purposeNavigationPreservation(name, activePlanDocketPreservation(name, readFileSync(resolve(root, name))))))); assert.equal(sha(bytes), raw, name + " RAW");
    assert.equal(sha(lf(bytes.toString("utf8"))), normalized, name + " LF");
  }
});
// Independent W3C sRGB/relative-luminance oracle. Never round a threshold comparison.
function luminance (hex) {
  assert.match(hex, /^#[0-9a-f]{6}$/i);
  const channels = [1, 3, 5].map(start => parseInt(hex.slice(start, start + 2), 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
function contrast (foreground, background) {
  const a = luminance(foreground), b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
const RANKS = ["C", "B", "A", "S", "SS", "SSS"];
const BACKGROUNDS = ["#64748b", "#0284c7", "#14b8a6", "#fbbf24", "#a855f7", "#f43f5e"];
const FOREGROUNDS = ["#ffffff", "#020617", "#0f172a", "#0f172a", "#0f172a", "#0f172a"];
test("unrounded independent contrast corrects only C/B and preserves every other ranked, secret and unranked pair", () => {
  assert.equal(contrast("#000000", "#ffffff"), 21); assert.equal(contrast("#ffffff", "#ffffff"), 1);
  assert.ok(contrast("#0f172a", BACKGROUNDS[0]) < 4.5); assert.ok(contrast("#0f172a", BACKGROUNDS[1]) < 4.5);
  assert.equal(contrast(FOREGROUNDS[0], BACKGROUNDS[0]), 4.758842787868666);
  assert.equal(contrast(FOREGROUNDS[1], BACKGROUNDS[1]), 4.925815585974154);
  FOREGROUNDS.forEach((foreground, index) => assert.ok(contrast(foreground, BACKGROUNDS[index]) >= 4.5));
  assert.ok(contrast("#cbd5e1", "#334155") >= 4.5); assert.ok(contrast("#0f172a", "#f43f5e") >= 4.5);
});

const IDS = ["collector", "streak", "shipper", "night-owl", "weekend", "marathoner", "finisher", "century", "six-of-six"];
const TITLES = ["Collector", "Streak Keeper", "Shipper", "Night Owl", "Weekend Warrior", "Marathoner", "Finisher"];
const THRESHOLDS = [[50, 250, 1000, 5000, 20000, 50000], [2, 5, 10, 20, 35, 60],
  [5, 25, 100, 300, 800, 2000], [10, 50, 200, 600, 1500, 4000],
  [25, 100, 400, 1200, 3000, 8000], [60, 120, 240, 420, 600, 900], [5, 15, 40, 100, 250, 600]];
const BASIS = ["captured events (all-time)", "longest run of active days (365d, UTC)", "commits (365d, UTC)",
  "events 00:00\u201305:59 (all-time, local time)", "Sat+Sun events (all-time, local time)",
  "max single-day effort minutes (365d, UTC)", "tasks done (live plans)"];
const elements = node => [node.props.children].flat(Infinity).filter(React.isValidElement);
function freeze (value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}
function fixture (count = 365, end = "2020-01-01") {
  const last = Date.parse(end + "T00:00:00Z");
  return { stats: { mode_counts: { B: 0, A_SCOPED: 0, A_GLOBAL: 0, MANUAL: 0, AMBIGUOUS: 0, UNKNOWN: 0 },
    activity_calendar: Array.from({ length: count }, (_, index) => ({
      day: new Date(last - (count - index - 1) * 86_400_000).toISOString().slice(0, 10),
      events: 0, minutes: 0, commits: 0,
    })), punch_card: Array.from({ length: 7 }, () => Array(24).fill(0)) }, tasks: [], scope: "Probe" };
}
function targeted (index, value) {
  const props = fixture(), days = props.stats.activity_calendar, punch = props.stats.punch_card;
  if (index === 0) props.stats.mode_counts.B = value;
  if (index === 1) for (let i = 0; i < value; i += 1) days[i].events = 1;
  if (index === 2) days[0].commits = value;
  if (index === 3) { punch[2][0] = value; punch[2][6] = 999; }
  if (index === 4) { punch[0][12] = Math.floor(value / 2); punch[6][12] = value - Math.floor(value / 2); punch[3][12] = 999; }
  if (index === 5) { days[3].minutes = value; days[9].minutes = Math.max(0, value - 1); }
  if (index === 6) props.tasks = [...Array.from({ length: value }, () => ({ repo: "Probe", status: "done" })),
    { repo: "Probe", status: "pending" }, ...Array.from({ length: 8 }, () => ({ repo: "Other", status: "done" }))];
  return props;
}
test("actual current Vite SSR preserves nine tiles, thresholds, scoped facts, secrets, source order and immutable inputs",
  { timeout: 30_000 }, async t => {
    const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
    const vite = await createServer({ root: frontend, server: { middlewareMode: true, hmr: false, ws: false },
      appType: "custom", optimizeDeps: { noDiscovery: true, entries: [] } });
    try {
      const { TrophyCase } = await vite.ssrLoadModule("/src/trophies.tsx");
      const { Surface, SectionHeading } = await vite.ssrLoadModule("/src/ui.tsx");
      function view (props) {
        const before = JSON.stringify(props); freeze(props); const tree = TrophyCase(props);
        assert.equal(JSON.stringify(props), before); assert.equal(tree.type, Surface);
        assert.equal(tree.props.tone, "quiet"); assert.equal(tree.props["data-achievement-gallery"], "true");
        assert.ok(Object.hasOwn(tree.props, "data-reveal"));
        const [heading, grid] = elements(tree); assert.equal(heading.type, SectionHeading);
        assert.equal(heading.props.level, 4); assert.equal(heading.props.title, "Trophy case");
        assert.equal(heading.props.description, props.scope ?? "All repos");
        assert.equal(grid.props.className, "grid min-w-0 gap-x-6 gap-y-4 sm:grid-cols-2 2xl:grid-cols-3");
        const tiles = elements(grid); assert.deepEqual(tiles.map(tile => tile.key), IDS);
        for (const tile of tiles) {
          assert.equal(tile.type, "div"); assert.equal(tile.props.className, "min-w-0 border-b border-ui-border pb-4");
          const header = elements(tile)[0]; assert.equal(header.props.className, "flex min-w-0 flex-wrap items-center gap-2 text-base");
          const [icon, title, badge] = elements(header); assert.equal(icon.props["aria-hidden"], "true");
          assert.equal(badge.props.className, "ml-auto rounded px-1.5 text-xs font-bold");
          assert.equal(badge.props.style.opacity, undefined); assert.ok(title);
        }
        const html = renderToStaticMarkup(tree);
        assert.match(html, /ui-surface-quiet/); assert.match(html, /data-achievement-gallery="true"/);
        assert.doesNotMatch(html, /NaN|Infinity|<button\b|<input\b/); assert.equal(JSON.stringify(props), before);
        return { tiles, html };
      }
      function facts (tile) {
        const [header, numeric, basis, next, progress] = elements(tile), badge = elements(header)[2];
        assert.equal(numeric.props.className, "mt-2 text-xl font-semibold tabular-nums text-ui-text");
        assert.equal(basis.props.className, "mt-1 text-xs leading-relaxed text-ui-muted");
        assert.equal(next.props.className, "mt-1 text-xs text-ui-muted");
        assert.equal(progress.props.className, "mt-1 h-1 rounded bg-slate-700"); assert.equal(progress.props["aria-hidden"], "true");
        const fill = elements(progress)[0]; assert.equal(fill.props.className, "h-1 rounded");
        assert.equal(fill.props.style.opacity, 0.85); assert.equal(fill.props.style.backgroundColor, badge.props.style.backgroundColor);
        return { title: elements(header)[1].props.children, value: numeric.props.children, basis: basis.props.children,
          next: next.props.children, rank: badge.props.children, style: badge.props.style, width: fill.props.style.width };
      }
      await t.test("empty, partial, zero and stale calendars preserve existing labels and do not invent dates or fresh periods", () => {
        for (const count of [0, 1, 6, 7, 14, 365]) {
          const { tiles, html } = view(fixture(count));
          assert.deepEqual(tiles.slice(0, 7).map(tile => facts(tile).title), TITLES);
          assert.deepEqual(tiles.slice(0, 7).map(tile => facts(tile).basis), BASIS);
          for (const tile of tiles.slice(0, 7)) {
            const f = facts(tile); assert.equal(f.value, "0"); assert.equal(f.rank, "\u2014");
            assert.deepEqual(f.style, { backgroundColor: "#334155", color: "#cbd5e1" }); assert.equal(f.width, "0%");
          }
          assert.equal((html.match(/keep working to discover<\/div>/g) ?? []).length, 2);
          assert.doesNotMatch(html, /Century Day|Six of Six|100\+ captured events|every attribution mode seen|2020-01-01/);
        }
      });
      await t.test("all 126 inclusive below/at/above threshold cases retain values, ranks, colors, next/max text and progress", () => {
        let checked = 0;
        THRESHOLDS.forEach((thresholds, index) => thresholds.forEach((threshold, ordinal) => {
          for (const delta of [-1, 0, 1]) {
            const value = threshold + delta, crossed = delta < 0 ? ordinal : ordinal + 1;
            const f = facts(view(targeted(index, value)).tiles[index]), next = thresholds[crossed];
            assert.equal(f.value, value.toLocaleString("en-US")); assert.equal(f.title, TITLES[index]); assert.equal(f.basis, BASIS[index]);
            assert.equal(f.rank, crossed === 0 ? "\u2014" : RANKS[crossed - 1]);
            assert.deepEqual(f.style, { backgroundColor: crossed === 0 ? "#334155" : BACKGROUNDS[crossed - 1],
              color: crossed === 0 ? "#cbd5e1" : FOREGROUNDS[crossed - 1] });
            assert.ok(contrast(f.style.color, f.style.backgroundColor) >= 4.5);
            assert.equal(f.next, next === undefined ? "maximum rank reached" : "next rank at " + next.toLocaleString("en-US"));
            assert.equal(f.width, (next === undefined ? 100 : Math.min(100, Math.floor(value * 100 / next + 0.5))) + "%");
            checked += 1;
          }
        }));
        assert.equal(checked, 126);
      });
      await t.test("server-scoped statistics and repo-filtered live tasks retain distinct bases and pending tasks never count", () => {
        const props = targeted(6, 5); props.stats.mode_counts.B = 50;
        const scoped = view(props), all = view({ ...props, scope: undefined });
        assert.equal(facts(scoped.tiles[6]).value, "5"); assert.equal(facts(all.tiles[6]).value, "13");
        assert.equal(facts(scoped.tiles[0]).value, "50"); assert.equal(facts(all.tiles[0]).value, "50");
        assert.ok(scoped.tiles[6].props.title.includes("tasks done (live plans): 5 \u00b7 next rank at 15"));
        assert.equal(facts(view({ ...props, scope: "Missing" }).tiles[6]).value, "0");
      });
      await t.test("secret conditions preserve exact locked privacy, inclusive Century threshold and all six modes", () => {
        for (const [events, modes, unlocked] of [[99, [1, 1, 1, 1, 1, 0], [false, false]],
          [100, [1, 1, 1, 1, 1, 0], [true, false]], [99, [1, 1, 1, 1, 1, 1], [false, true]],
          [100, [1, 1, 1, 1, 1, 1], [true, true]]]) {
          const props = fixture(); props.stats.activity_calendar[0].events = events;
          Object.keys(props.stats.mode_counts).forEach((key, index) => { props.stats.mode_counts[key] = modes[index]; });
          const { tiles } = view(props);
          for (let index = 0; index < 2; index += 1) {
            const tile = tiles[index + 7], [header, story] = elements(tile), [icon, title, badge] = elements(header);
            assert.equal(elements(tile).length, 2); assert.equal(story.props.className, "mt-2 text-xs leading-relaxed text-ui-muted");
            assert.equal(title.props.children, unlocked[index] ? ["Century Day", "Six of Six"][index] : "???");
            assert.equal(badge.props.children, unlocked[index] ? "SECRET" : "?");
            assert.deepEqual(badge.props.style, { backgroundColor: unlocked[index] ? "#f43f5e" : "#334155",
              color: unlocked[index] ? "#0f172a" : "#cbd5e1" });
            if (!unlocked[index]) {
              assert.equal(icon.props.children, "\uD83D\uDD12"); assert.equal(story.props.children, "keep working to discover");
              assert.equal(tile.props.title, "secret trophy \u2014 keep working to discover");
            } else {
              assert.equal(story.props.children, index === 0 ? "a single day with 100+ captured events" : "every attribution mode seen \u2014 including your own picks");
              assert.equal(tile.props.title, story.props.children);
            }
          }
        }
      });
      await t.test("long values cap maximum progress and scope/title markup is escaped without input mutation", () => {
        const props = targeted(0, 1_000_000_000_000_000); props.scope = '<repo>"&' + "x".repeat(256);
        props.stats.activity_calendar[0].day = '<date>"&';
        const { tiles, html } = view(props), f = facts(tiles[0]);
        assert.equal(f.value, "1,000,000,000,000,000"); assert.equal(f.rank, "SSS"); assert.equal(f.width, "100%");
        assert.equal(f.next, "maximum rank reached"); assert.ok(tiles[0].props.title.includes(f.value));
        assert.ok(html.includes("&lt;repo&gt;&quot;&amp;")); assert.doesNotMatch(html, /<repo>|<date>/);
        assert.equal(facts(view(targeted(0, 49)).tiles[0]).width, "98%");
      });
    } finally { await vite.close(); }
  });
