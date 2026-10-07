import { mastheadPreservation } from "./helpers/workspaceCommandMasthead.mjs";
import { deskPreservation } from "./helpers/changesReviewLanes.mjs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { restoreAttributionStationHtml, restoreAttributionWorkbenchSuite } from "./helpers/attributionStation.mjs";
import { studioHtml, studioWorkbench, studioChanges } from "./helpers/diagnosticStudio.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), ".."), frontend = resolve(root, "Frontend");
const require = createRequire(resolve(frontend, "package.json"));
const ts = require("typescript"), postcss = require("postcss"), React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const read = name => {
  const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(readFileSync(resolve(root, name)));
  if (name === "Frontend/index.html") return studioHtml(deskPreservation(name, mastheadPreservation(name, text)));
  if (name === "Tests/test_workbench_2_0.mjs") return studioWorkbench(deskPreservation(name, mastheadPreservation(name, text)));
  if (name === "Tests/test_changes_review_desk.mjs") return studioChanges(deskPreservation(name, mastheadPreservation(name, text)));
  return text;
};
const sha = value => createHash("sha256").update(value).digest("hex"), lf = text => text.replace(/\r\n/g, "\n");
// Independent preservation literals. No adapter, production or ignored-plan oracle.
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
const RULES = [
  ["#root #main-content > div > .changes-workbench > #sec-pick > section[aria-label=\"Manual attribution queue\"]",[["padding","1.25rem"],["border","1px solid rgb(var(--ui-warning) / 0.5)"],["border-radius","8px"],["background","rgb(var(--ui-surface))"]]],
  ["#root #main-content > div > .changes-workbench > #sec-pick > section[aria-label=\"Manual attribution queue\"] > .ui-section-heading",[["margin-bottom","1.25rem"],["padding-bottom","0.75rem"],["border-bottom","1px solid rgb(var(--ui-border))"]]],
  ["#root #main-content > div > .changes-workbench > #sec-pick > section[aria-label=\"Manual attribution queue\"] > fieldset",[["gap","0.75rem"],["margin-bottom","1.25rem"],["padding","1rem"],["border","1px solid rgb(var(--ui-border))"],["border-radius","8px"],["background","rgb(var(--ui-canvas))"]]],
  ["#root #main-content > div > .changes-workbench > #sec-pick > section[aria-label=\"Manual attribution queue\"] > fieldset > label",[["gap","0.5rem"],["min-height","44px"]]],
  ["#root #main-content > div > .changes-workbench > #sec-pick > section[aria-label=\"Manual attribution queue\"] > fieldset > button",[["min-height","44px"],["padding","0.5rem 1rem"]]],
  ["#root #main-content > div > .changes-workbench > #sec-pick > section[aria-label=\"Manual attribution queue\"] > fieldset > button[aria-haspopup=\"dialog\"]",[["flex","1 1 14rem"]]],
  ["#root #main-content > div > .changes-workbench > #sec-pick > section[aria-label=\"Manual attribution queue\"] > .ui-work-row",[["align-items","center"],["gap","0.75rem"],["margin-top","0.75rem"],["padding","1rem"],["border","1px solid rgb(var(--ui-border))"],["border-radius","8px"],["background","rgb(var(--ui-canvas))"]]],
  ["#root #main-content > div > .changes-workbench > #sec-pick > section[aria-label=\"Manual attribution queue\"] > .ui-work-row > label",[["gap","0.5rem"],["min-height","44px"]]],
  ["#root #main-content > div > .changes-workbench > #sec-pick > section[aria-label=\"Manual attribution queue\"] > .ui-work-row > span.font-mono",[["flex-basis","100%"]]],
  ["#root #main-content > div > .changes-workbench > #sec-pick > section[aria-label=\"Manual attribution queue\"] > .ui-work-row > button",[["min-height","44px"],["padding","0.5rem 1rem"]]],
  ["#root #main-content > div > .changes-workbench > #sec-pick > section[aria-label=\"Manual attribution queue\"] > .ui-work-row > button[aria-haspopup=\"dialog\"]",[["flex","1 1 14rem"]]],
  ["#root #main-content > div > .changes-workbench > #sec-pick > section[aria-label=\"Manual attribution queue\"] > fieldset > span.text-slate-400:not(.sr-only)",[["flex-basis","100%"],["overflow-wrap","anywhere"]]],
  ["#root #main-content > div > .changes-workbench > #sec-pick > section[aria-label=\"Manual attribution queue\"] > .ui-work-row > span.basis-full.text-xs.text-slate-400",[["padding-top","0.25rem"],["overflow-wrap","anywhere"]]],
  ["#root #main-content > div > .changes-workbench > #sec-pick > section[aria-label=\"Manual attribution queue\"] > .ui-work-row > span.italic",[["flex-basis","100%"],["padding","0.75rem"],["border","1px solid rgb(var(--ui-border))"],["border-radius","8px"],["background","rgb(var(--ui-surface))"],["overflow-wrap","anywhere"]]],
];
const PINS = [
  ["Frontend/src/App.tsx", "945c8879e94b5d7a8410d2a143ed2e127e2653dd1a123d2d8b4cd306758a6f3e", "c7c568b346c7ddf00d86b93325b97854e59f3f625f6fd916b056e85ccf069b1a"],
  ["Frontend/src/AppShell.tsx", "8d36a4a928da4e6d7774cc112ab3cecfe8b5e654afe05de0480facc40f21eeee", "7a2ee984f185fbcc7ff0e5aa9017b2b1dd8e8e8667068ce2c371a5bf884448a9"],
  ["Frontend/src/ApplicationBrand.tsx", "a7102795274f1ba784f486d1ed5bd9dbaa78d829005d60fbd0275d6a13a44026", "0e6d42ee96b7c0899e8b329b8d5e85d52c01cdc19591bbf5189da65daf266d22"],
  ["Frontend/src/ui.tsx", "b5650b9e2a3529ff1ca033ed077d7b806f0cc9341c9733b4b3a52c107ab99974", "e1c2ad05398cf771ee17ba576b7feecf03829459379b9e02e35c58aea5004c46"],
  ["Frontend/src/OverviewView.tsx", "98f77fe8a3f97033f5a2084439f8da6dcb203547d7b1f8409aca11892598d214", "9d42a6c52828018f6bb0ab7f3f668e0040e0a190de144517715460f93b84410a"],
  ["Frontend/src/MissionView.tsx", "aa13ef82e543e58e2762568e0b1d430ef2622c0ab3f95aa5433edb5fb1a7bdab", "b2ebe76aa6ab6527dcf21bd90ad67d718f29ff8521a137262cfa4309c17be622"],
  ["Frontend/src/index.css", "9371bc04cba0b62e8a8e5e3b4a9251deea9273be58f4b9735982e0649527ba81", "788436e9def1e7109fe98d4bfa5e0add49a5f0ca301b17416279c03f18ede0f5"],
  ["Frontend/src/workspaceCommandFrame.css", "c1de68858cfd2c4a502ab02e8e0e8a7cefecb7931172ffd055feb8778b9f7592", "c1de68858cfd2c4a502ab02e8e0e8a7cefecb7931172ffd055feb8778b9f7592"],
  ["Frontend/src/theme.ts", "7c39c4ea3bf479216edc7776fac113f0d05bfeaba3d411ca8ba1ea1fc2ba6022", "03ed88e814b0a12af207f462819731127f2346def58af01259ccc36c0556b286"],
  ["Frontend/src/navigation.ts", "f22476d82cccafa88477d82cad9b831c9457310ccb6a508cb12cd66bcd110ff1", "3a43b26da1c951e04049ce0336aeaa71c86ea99a04d4bc4a9b4775ddd4258e11"],
  ["Frontend/src/main.tsx", "c0b126cdce533a00247006a8efbb72c51b073c638a5764e0cb54d180e5f3f588", "c0b126cdce533a00247006a8efbb72c51b073c638a5764e0cb54d180e5f3f588"],
  ["Frontend/src/missionModel.ts", "2f42d0e8740d3e4ff7451771f9521e65f77ac078d25c8dd4b5b4598cee436446", "2f42d0e8740d3e4ff7451771f9521e65f77ac078d25c8dd4b5b4598cee436446"],
  ["Frontend/src/format.ts", "4c7f1cb040c38a5ef75787c6f7325db6fc162a6890df0fb693e916aa62d8c87f", "4c7f1cb040c38a5ef75787c6f7325db6fc162a6890df0fb693e916aa62d8c87f"],
  ["Frontend/src/calendarDay.ts", "033b0720f32521d8fd2549923955867523749f28532505e43b53f2177f45dd7e", "401d957f4312819b1beeb3ff0e9e5810dc18cdf38f6a0799013d63be3e7511bb"],
  ["Frontend/src/planBoard.tsx", "1e3a6a74fc5c6ef038fde019e98afd2b5951cd0a75830d86e98acac52dfa0170", "ab494423ca66233ed6848392976b05a5d52ecb3797722477da921e133a651288"],
  ["Frontend/src/appVersion.ts", "7ff2c3778d17c04858ff9113efdd94c7992dc2f9f440f7a190e17e7a5369f3eb", "78186b0c0e4bf982be9b7a6eed48ac54379f79764de6df88df5cc0bdccc489db"],
  ["Tests/test_app_shell.mjs", "cfb3885d0035b91530fc6e397920036b0dc85e7b89876aaeb03029ddb47e40d0", "8d92c9461c4c164313c2f36a27381462a9ec47f907c7c050a2037c09cd388fd6"],
  ["Tests/test_workspace_command_frame.mjs", "c46140e06176cc3781d8e1acf17c5e9eee11989524e6341a3d15d0f810e7c247", "c46140e06176cc3781d8e1acf17c5e9eee11989524e6341a3d15d0f810e7c247"],
  ["Tests/test_mission_control_workbench.mjs", "d92813b96ba0206202d0b40f77aa7e622be438c8e9a9a68bd26290b2ee0577d3", "d92813b96ba0206202d0b40f77aa7e622be438c8e9a9a68bd26290b2ee0577d3"],
  ["Tests/test_overview_hierarchy.mjs", "faf3b593f97021df8509f896c28adcecfb15e5438221bb9f87f6a0cdd95bc238", "d1adb0cb04dec60045173f4c47334b00b71519018bd4bee835125f5fcf1c9840"],
  ["Tests/test_overview_operations_deck.mjs", "4c4b2fb8ed83321a1c696e99b102b3611a5f81902967b070a934cd43126421b9", "4c4b2fb8ed83321a1c696e99b102b3611a5f81902967b070a934cd43126421b9"],
  ["Tests/test_mission_plan_gallery.mjs", "6092dbb713be9151f8a80a567e09b09732ba96040336634cf659b5be80c94138", "6092dbb713be9151f8a80a567e09b09732ba96040336634cf659b5be80c94138"],
  ["Tests/test_mission_paging.mjs", "36ba19f99711a19f6534857c4be09fe28d9b8734df1a2113e78dc9e4cb8077b6", "1c111f8b2cef0c0b7a6e8870b4bcd791681e22bba77ab5bddb1f587c832851d7"],
  ["Tests/test_mission_owner_retirement.mjs", "9adaf72a29ba6e582d7a0fe0227863e4efbbb38d19ecdf8cc07293881231ca1f", "9adaf72a29ba6e582d7a0fe0227863e4efbbb38d19ecdf8cc07293881231ca1f"],
  ["Tests/test_mission_plan_snapshot.mjs", "03c937081caaeb713761b9f643c59a41c8490c26beab26abde3234c69d8137a3", "03c937081caaeb713761b9f643c59a41c8490c26beab26abde3234c69d8137a3"],
  ["Tests/test_read_surfaces.mjs", "264aefcfbc7ff84d37c449c6c6817e8c1b86e5aa189d0e87075e897f25fc7cfa", "b270f7191446f0281040d53625e43603c25c566e5b67cc283d78914113d9574c"],
  ["Tests/test_repository_profile.mjs", "4759cac6ca1d8e3a6881cc29bcb4d8a9f6f466704967da51e3eb19bcf32dec3e", "4759cac6ca1d8e3a6881cc29bcb4d8a9f6f466704967da51e3eb19bcf32dec3e"],
  ["Tests/helpers/relationshipHistory.mjs", "b4039b290fd906725c569fe67ef7d5c6f7832307d895e10739420f5608c401af", "b4039b290fd906725c569fe67ef7d5c6f7832307d895e10739420f5608c401af"],
  ["Tests/helpers/missionOwnerRetirement.mjs", "c6d800025d7a927cdb14746a901600bc0a39291ae1e039008a295bd7f69bfc36", "c6d800025d7a927cdb14746a901600bc0a39291ae1e039008a295bd7f69bfc36"],
  ["Tests/test_ui_foundations.mjs", "b3a7573802f06102be18bac0472dcfe5794b304aa3f99634d7acf1d6cc6080e6", "37197cef2e020275d25965112e90c030da40500a0451ee67c22bd559876055d6"],
  ["Tests/test_app_version.mjs", "d86fa77843bdf4f552fc7e97bec8f5ecea839f98080451325bef4cd81674d6c3", "c5cc037e582d0ff5066d959b76ccb804e58c452cfcb1f92c23a0fba8786b15f5"],
  ["Frontend/package.json", "b131be7e90ba2500b01371e594e10c482b94cf651ab425ddf7efaea76b759b9d", "541a787d69fa512a53de01b53240e2e94ac22f068da882e0c2496f68ee5bf1a1"],
  ["Frontend/package-lock.json", "0c39bf19779991e4565e00845a061fc954afdfe988d9026c6c356957e2b02258", "d5ccfda11d2d07b4a707b18aca87b866a135182a3bd33ce2380c21730809ce75"],
  ["Frontend/tsconfig.json", "97997252d286ecf7a8a4b12a51ac2fdd9199f3b9bf5e14e8d4f7d4e5e60d3f3f", "97997252d286ecf7a8a4b12a51ac2fdd9199f3b9bf5e14e8d4f7d4e5e60d3f3f"],
  ["Frontend/vite.config.ts", "6f25836874cc3ca4c97781dd0140ab1e7fee796b3b0c67a67ffdb8600e67cd6b", "4631f5c7380fa909b5b361bf8eb7fdac29a665144ca260f9ac30be30ce83f107"],
  ["Backend/requirements.txt", "f750d19859ca5621eea836592d2038857f73e8857bcace96752ce6dadf004ea3", "f24979c56dd6d095f18541462485fb62229cfddf0fa8784d7c7dd9fbb535d0b5"],
  ["Scripts/Chronicle/requirements.txt", "9d91436f670aac600f39beb184f7278774dc94e470dfca37f092bb0e3d461722", "562f66ed699de7d73e464c6be1a0938b6b19a8c2f69fe4b955209f0981986a2d"],
];
const ADDITIONAL_PINS = [
  ["Frontend/src/api.ts", "b21da4367bb2c9007a62b9ed097fd943286ffb3c863de23ee565acd01b2323a0", "2bdccf5c79ccf5a72f9696df00a924ff918a82c6cf8e4f15ba2a69b39e7cd2b8"],
  ["Frontend/src/dialog.tsx", "aaeda6eec7080c96b4992d6944444d21ab518ba5987e8a5abd8100423dd136b0", "86f96a3c1454baf8337409995abb81f11ad57ce74d8f4288cbe5ac350991715a"],
  ["Tests/helpers/changesReviewDesk.mjs", "ee93e4f9c31026e24b9c42071ed10cd63b3181d75d5423c5a0a0c60ddc3a98a6", "ee93e4f9c31026e24b9c42071ed10cd63b3181d75d5423c5a0a0c60ddc3a98a6"],
];
const WINDOW = '    <style id="katlab-attribution-station">\n'
  + CSS.split("\n").slice(0, -1).map(line => "      " + line + "\n").join("") + "    </style>\n";
const TITLE = "    <title>KATLAB Tracking Monitor</title>\n";
const OLD_HTML = "f8381b7e989a4cc38987c847182713517de6f524aa49efa5794a34b298b11ad3";
const NEW_HTML = "4dbd135da0398e5c399724cc7ad4547d216f70b393bb5d5f3210002842d40e2b";
const PRIOR_IMPORT = 'import { restoreChangesReviewDeskHtml } from "./helpers/changesReviewDesk.mjs";\n';
const WB_IMPORT = 'import { restoreAttributionStationHtml } from "./helpers/attributionStation.mjs";\n';
const DESK_IMPORT = 'import { restoreAttributionStationHtml, restoreAttributionWorkbenchSuite } from "./helpers/attributionStation.mjs";\n';
const WB_READ = 'const html = restoreChangesReviewDeskHtml(restoreAttributionStationHtml(read("Frontend/index.html")));\n';
const OLD_WB_READ = 'const html = restoreChangesReviewDeskHtml(read("Frontend/index.html"));\n';
const OLD_DESK_READ = 'const read = name => new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(readFileSync(resolve(root, name)));\n';
const DESK_READ = String.raw`const read = name => {
  const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(readFileSync(resolve(root, name)));
  if (name === "Frontend/index.html") return restoreAttributionStationHtml(text);
  if (name === "Tests/test_workbench_2_0.mjs") return restoreAttributionWorkbenchSuite(text);
  return text;
};
`;

function ending (text) {
  assert.equal(typeof text, "string");
  assert.equal(Buffer.from(text, "utf8").toString("utf8"), text);
  assert.ok(!text.startsWith("\uFEFF") && !text.includes("\0"));
  const rest = text.replace(/\r\n/g, ""), eol = text.includes("\r\n") ? "\r\n" : "\n";
  assert.ok(!rest.includes("\r") && (eol === "\n" || !rest.includes("\n")));
  const value = lf(text);
  assert.ok(value.endsWith("\n") && !value.endsWith("\n\n"), "single EOF");
  assert.doesNotMatch(value, /[\t ]+$/m);
  return eol;
}
const count = (text, needle) => text.split(needle).length - 1;
const physical = (text, eol) => eol === "\r\n" ? text.replace(/\n/g, "\r\n") : text;
const one = (list, predicate, label = "one owner") => {
  const result = list.filter(predicate); assert.equal(result.length, 1, label); return result[0];
};
function parse (text, name = "owner.tsx") {
  const ast = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true,
    name.endsWith(".mjs") ? ts.ScriptKind.JS : ts.ScriptKind.TSX);
  assert.equal(ast.parseDiagnostics.length, 0, name); return ast;
}
function all (node) {
  const result = []; const walk = value => { result.push(value); ts.forEachChild(value, walk); }; walk(node); return result;
}
function owner (ast, name) {
  return one(ast.statements, node => ts.isFunctionDeclaration(node) && node.name?.text === name
    || ts.isVariableStatement(node) && node.declarationList.declarations.some(d => d.name.text === name), name);
}
const extract = (ast, name) => owner(ast, name).getText(ast).replace(/^export\s+/, "");
function cssContract (text) {
  assert.equal(ending(text), "\n");
  const ast = postcss.parse(text); assert.equal(ast.nodes.length, 15);
  assert.equal(ast.nodes[0].type, "comment");
  assert.equal(ast.nodes[0].text, "Attribution Station: queue hierarchy; existing assignment behavior stays.");
  const matrix = ast.nodes.slice(1).map(rule => {
    assert.equal(rule.type, "rule");
    return [rule.selector, rule.nodes.map(decl => {
      assert.equal(decl.type, "decl"); assert.equal(Boolean(decl.important), false);
      return [decl.prop, decl.value];
    })];
  });
  assert.deepEqual(matrix, RULES); assert.equal(text, CSS);
}
function independentHtmlInverse (text) {
  const eol = ending(text), value = lf(text), site = value.indexOf(WINDOW);
  assert.equal(count(value, WINDOW), 1); assert.equal(count(value, TITLE), 1);
  assert.equal((value.match(/<style\b/g) ?? []).length, 3);
  assert.equal((value.match(/<\/style>/g) ?? []).length, 3);
  assert.ok(site > value.indexOf("<head>") && site < value.indexOf("</head>"));
  assert.ok(value.slice(0, site).endsWith("    </style>\n"));
  assert.ok(value.slice(site + WINDOW.length).startsWith(TITLE));
  assert.equal(sha(value), NEW_HTML);
  const original = value.replace(WINDOW, ""); assert.equal(sha(original), OLD_HTML);
  return physical(original, eol);
}
function suiteInverse (text, kind) {
  const eol = ending(text), value = lf(text), ast = parse(value, "suite.mjs");
  const imported = kind === "workbench" ? WB_IMPORT : DESK_IMPORT;
  const current = kind === "workbench" ? WB_READ : DESK_READ;
  const old = kind === "workbench" ? OLD_WB_READ : OLD_DESK_READ;
  assert.equal(count(value, PRIOR_IMPORT + imported), 1);
  assert.equal(count(value, imported), 1); assert.equal(count(value, current), 1);
  const node = one(ast.statements, n => ts.isImportDeclaration(n)
    && n.moduleSpecifier.text === "./helpers/attributionStation.mjs");
  assert.equal(node.getText(ast) + "\n", imported);
  assert.equal(owner(ast, kind === "workbench" ? "html" : "read").getText(ast) + "\n", current);
  const original = value.replace(imported, "").replace(current, old);
  parse(original, "historical-preservation.mjs"); // Parse only, never execute historical owners.
  return physical(original, eol);
}
const app = parse(read("Frontend/src/App.tsx")), ui = parse(read("Frontend/src/ui.tsx"));
const dialog = parse(read("Frontend/src/dialog.tsx"));
const elements = tree => Array.isArray(tree) ? tree.flatMap(elements)
  : React.isValidElement(tree) ? [tree, ...elements(tree.props.children)] : [];
const textOf = tree => Array.isArray(tree) ? tree.map(textOf).join("")
  : React.isValidElement(tree) ? textOf(tree.props.children)
    : tree === null || tree === undefined || typeof tree === "boolean" ? "" : String(tree);
const freeze = value => {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value;
};
const compile = async text => {
  const result = ts.transpileModule(text, { reportDiagnostics: true, compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React,
  } });
  assert.equal(result.diagnostics.filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
  return import("data:text/javascript;base64," + Buffer.from(result.outputText).toString("base64"));
};
// Controlled hook cells retain and dispose returned cleanup. No native or asynchronous mutation certification.
function hooks (seeds = []) {
  const cells = [], pending = []; let cursor = 0, stateCursor = 0;
  const changed = (a, b) => !a || !b || a.length !== b.length || b.some((v, i) => !Object.is(v, a[i]));
  const h = {
    reset() { cursor = stateCursor = 0; },
    useState(initial) {
      const i = cursor++, s = stateCursor++; cells[i] ??= {
        value: s < seeds.length ? seeds[s] : typeof initial === "function" ? initial() : initial };
      return [cells[i].value, v => { cells[i].value = typeof v === "function" ? v(cells[i].value) : v; }];
    },
    useRef(initial) { const i = cursor++; return cells[i] ??= { current: initial }; },
    useMemo(fn, deps) {
      const i = cursor++; if (changed(cells[i]?.deps, deps)) cells[i] = { deps, value: fn() };
      return cells[i].value;
    },
    useCallback(fn, deps) { return h.useMemo(() => fn, deps); },
    useEffect(fn, deps) {
      const i = cursor++; if (changed(cells[i]?.deps, deps)) pending.push(() => {
        cells[i]?.cleanup?.(); cells[i] = { deps, cleanup: fn() };
      });
    },
    flush() { pending.splice(0).forEach(fn => fn()); },
    dispose() { pending.length = 0; cells.forEach(cell => { cell?.cleanup?.(); if (cell) cell.cleanup = undefined; }); },
  }; return h;
}
const noop = () => {};
const event = (id, extra = {}) => ({ id, repo_id: "EA", task_ref: null, file: "src/file_" + id + ".ts",
  mode: "UNKNOWN", provider: "codex", session_id: "session-one", ts: "2026-10-01T08:00:00Z", tool: "Edit",
  branch: "develop", commit_hash: null, swept: 0, candidates_json: null, ...extra });
const tasks = freeze([{ repo: "EA", task_ref: "plan - A.1", title: '<task & "full">' },
  { repo: "Other", task_ref: "other - B.1", title: "Other task" }]);
const sectionProps = (events = [], extra = {}) => ({ events, tasks, scopeKeyValue: '["EA"]',
  state: { selectedIds: [], bulkChoice: "", choices: {} }, onStateChange: noop, onPicked: noop, onStatus: noop, ...extra });
const rowProps = (extra = {}) => ({ event: event(1), tasks, choice: "", checked: false, sectionDisabled: false,
  onPicked: noop, onStatus: noop, onChoiceChange: noop, onAssigned: noop, onToggle: noop,
  acquireMutation: () => false, releaseMutation: noop, ...extra });
let vite, actual, direct, deps;
before(async () => {
  const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
  vite = await createServer({ root: frontend, server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom", optimizeDeps: { noDiscovery: true, entries: [] } });
  deps = Object.assign({}, ...await Promise.all(["ui.tsx", "dialog.tsx", "theme.ts", "format.ts"]
    .map(name => vite.ssrLoadModule("/src/" + name))));
  const { createSubjects } = await compile([
    "export function createSubjects(React,deps,hooks=React){",
    "const {useState,useRef,useMemo,useCallback,useEffect}=hooks;",
    "const {SectionHeading,CollectionPager,useRememberedBoundedPage,BoundedChoiceDialog,MODE_BADGE,MODE_COLOR,",
    "SWEPT_COLOR,eventSessionIdentity,sessionColor,fmtRel}=deps;",
    'const api={pickTask(){throw new Error("Fixture forbids PATCH");}},createActionDeadline=()=>{throw new Error("Fixture forbids mutation");};',
    "const isAbortError=()=>false;",
    ...["assignmentCandidates", "swatch", "SWEPT_TIP", "SessionDot", "ModeBadge", "PickSection", "PickRow"].map(n => extract(app, n)),
    "return {PickSection,PickRow,SessionDot,assignmentCandidates};}",
  ].join("\n"));
  const { pagerSubject } = await compile([
    "export function pagerSubject(hooks,memory){const {useState,useRef,useCallback,useEffect}=hooks;",
    'const BoundedPageMemoryContext={},useContext=c=>{if(c!==BoundedPageMemoryContext)throw new Error("Wrong context");return memory;};',
    ...["getBoundedPageWindow", "collectionIdentityKey", "useBoundedPage", "useRememberedBoundedPage"].map(n => extract(ui, n)),
    "return {useRememberedBoundedPage};}",
  ].join("\n"));
  actual = createSubjects(React, deps);
  direct = (name, props, seeds = [], savedMemory) => {
    const h = hooks(seeds), memory = savedMemory ?? { pages: {}, setPage(k, v) { memory.pages[k] = v; } };
    const subjects = createSubjects(React, { ...deps, ...pagerSubject(h, memory) }, h);
    let tree, current = props;
    return { subjects, memory, render(next = current) { current = next; h.reset(); tree = subjects[name](current); h.flush(); return tree; },
      nodes() { return elements(tree); }, dispose() { h.dispose(); } };
  };
}, { timeout: 30_000 });
after(async () => { await vite?.close(); });
const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));

test("independent fourteen-rule literal and strict LF/CRLF HTML inverse", () => {
  assert.equal(Buffer.byteLength(CSS), 3097); assert.equal(CSS.split("\n").length - 1, 70);
  assert.equal(sha(CSS), "25ed646f09b0b110dbc82e8d8b9b0a4cb6822d6a8073e3bc717ec15319650176");
  assert.equal(Buffer.byteLength(WINDOW), 3574); assert.equal(WINDOW.split("\n").length - 1, 72);
  assert.equal(sha(WINDOW), "8805c4d23234d608b962dd0bfcc4145263f46fb1556d8906ff05231aec8f8749");
  cssContract(CSS);
  const html = read("Frontend/index.html");
  assert.equal(ending(html), "\n"); assert.equal(Buffer.byteLength(html), 9897);
  assert.equal(html.split("\n").length - 1, 219); assert.equal(sha(html), NEW_HTML);
  for (const fixture of [html, physical(html, "\r\n")]) {
    const original = independentHtmlInverse(fixture);
    assert.equal(restoreAttributionStationHtml(fixture), original);
    assert.equal(sha(lf(original)), OLD_HTML); assert.equal(ending(original), ending(fixture));
  }
});
test("HTML owner/site/structure and outside-byte adversaries never disappear", () => {
  const html = read("Frontend/index.html"), old = independentHtmlInverse(html);
  const bad = [old, html.replace(WINDOW, WINDOW + WINDOW), html.replace(WINDOW, "<!--\n" + WINDOW + "-->\n"),
    old.replace("</body>", WINDOW + "</body>"), old.replace('    <style id="katlab-workbench-v2">', WINDOW + '    <style id="katlab-workbench-v2">'),
    html.replace(WINDOW, WINDOW.replace("<style ", "<style><style ")), html.replace(WINDOW, WINDOW.slice(0, -1)),
    html.replace('id="katlab-attribution-station"', 'id="wrong"'), html.replace(TITLE, TITLE + TITLE),
    html.replace(WINDOW + TITLE, WINDOW + "\n" + TITLE), html.replace(WINDOW, WINDOW.replace("padding: 1.25rem", "padding: 9rem")),
    "\uFEFF" + html, html + "\n", html.slice(0, -1), html.replace("\n", "\r"), html.replace("\n", "\r\n"),
    html.replace("<head>", "<head>\0"), html.replace("</head>", " \n</head>")];
  for (const fixture of bad) {
    assert.throws(() => independentHtmlInverse(fixture)); assert.throws(() => restoreAttributionStationHtml(fixture));
  }
  const outside = html.replace('<body class="bg-slate-950 text-slate-100">',
    '<body class="bg-slate-950 text-slate-100" data-unrelated="visible">');
  assert.ok(outside.replace(WINDOW, "").includes('data-unrelated="visible"'));
  assert.notEqual(sha(outside.replace(WINDOW, "")), OLD_HTML);
  assert.throws(() => restoreAttributionStationHtml(outside));
});
test("ordered root declarations reject resources, nesting, widening, motion, clipping and priorities", () => {
  const rootSelector = RULES[0][0];
  const bad = [CSS + "body { color:red; }\n", CSS + "@media (min-width: 1px) { body{color:red;} }\n",
    CSS.replace("  padding: 1.25rem;", "  @supports(display:grid){padding:1.25rem;}"),
    CSS.replace("  padding: 1.25rem;", "  /* hidden */ padding: 1.25rem;"),
    CSS.replace("padding: 1.25rem", "padding: 1.25rem !important"),
    CSS.replace(rootSelector + " {", "body {"), CSS.replace(" > fieldset > label", " label"),
    CSS.replace("min-height: 44px", "min-height: 28px"), CSS.replace("flex-basis: 100%", "order: -1"),
    CSS.replace("overflow-wrap: anywhere", "overflow: hidden"), CSS.replace("overflow-wrap: anywhere", "overflow-y: auto"),
    CSS.replace("background: rgb(var(--ui-canvas))", "background: url(example.png)"),
    CSS.replace("border-radius: 8px", "animation: pulse 1s"), CSS.replace("  gap: 0.75rem;", ""),
    CSS.replace("  gap: 0.75rem;", "  gap: 0.75rem; gap: 0.75rem;"),
    "\uFEFF" + CSS, CSS.replace("\n", "\r\n"), CSS.replace("\n", "\r"), CSS + "\n", CSS.replace("stays.", "stays.\0")];
  const ast = postcss.parse(CSS), clone = ast.nodes[1].clone(); ast.nodes[1].remove(); ast.append(clone);
  bad.push(ast.toString()); for (const fixture of bad) assert.throws(() => cssContract(fixture));
  assert.equal(RULES.flatMap(([, decls]) => decls).filter(([prop]) => prop === "overflow-wrap").length, 3);
});
test("two-window adapters restore both whole prior suites and preserve unrelated assertions", () => {
  for (const [kind, name, digest, bytes, lines] of [
    ["workbench", "Tests/test_workbench_2_0.mjs", "385488ed369fd87e70990176922a069284669376d05d785a703dc066b5083722", 43692, 512],
    ["desk", "Tests/test_changes_review_desk.mjs", "3ddee7c042195285defe3904bb360c440d8d93329c11e436a7493d8a5f34514b", 38432, 528],
  ]) {
    const suite = read(name);
    for (const fixture of [suite, physical(suite, "\r\n")]) {
      const original = suiteInverse(fixture, kind);
      assert.equal(sha(lf(original)), digest); assert.equal(Buffer.byteLength(lf(original)), bytes);
      assert.equal(lf(original).split("\n").length - 1, lines); assert.equal(ending(original), ending(fixture));
      if (kind === "workbench") assert.equal(restoreAttributionWorkbenchSuite(fixture), original);
    }
    const imported = kind === "workbench" ? WB_IMPORT : DESK_IMPORT, current = kind === "workbench" ? WB_READ : DESK_READ;
    const bad = [suite.replace(imported, ""), suite.replace(imported, imported + imported),
      suite.replace(PRIOR_IMPORT + imported, imported + PRIOR_IMPORT), suite.replace(imported, "// " + imported),
      suite.replace(imported, imported.replace("{ ", "{ other as ")), suite.replace(current, "// " + current),
      suite.replace(current, current + current), suite.replace(current, current.replace("restoreAttribution", "wrongAttribution")),
      "\uFEFF" + suite, suite.replace("\n", "\r\n"), suite.replace("\n", "\r"), suite + "\n", suite.replace(current, current + "\0")];
    for (const fixture of bad) {
      assert.throws(() => suiteInverse(fixture, kind));
      if (kind === "workbench") assert.throws(() => restoreAttributionWorkbenchSuite(fixture));
    }
    const outside = suite.replace('assert.equal(', 'assert.notEqual(');
    const restored = suiteInverse(outside, kind);
    assert.ok(restored.includes("assert.notEqual(")); assert.notEqual(sha(lf(restored)), digest);
    if (kind === "workbench") assert.equal(restoreAttributionWorkbenchSuite(outside), restored);
  }
  assert.equal(PINS.length, 37);
  for (const [name, raw, normalized] of [...PINS, ...ADDITIONAL_PINS]) {
    const text = deskPreservation(name, mastheadPreservation(name, read(name))); assert.equal(sha(text), raw, name + " RAW"); assert.equal(sha(lf(text)), normalized, name + " LF");
  }
});
test("actual AST binds direct queue/row/feedback and excluded portal/pager owners", () => {
  const section = owner(app, "PickSection"), row = owner(app, "PickRow");
  const rootSection = one(all(section), n => ts.isJsxOpeningElement(n) && n.tagName.getText(app) === "section");
  assert.ok(rootSection.attributes.getText(app).includes('aria-label="Manual attribution queue"'));
  assert.equal(one(all(row), n => ts.isJsxOpeningElement(n) && n.tagName.getText(app) === "div").attributes.getText(app),
    'className="ui-work-row bg-ui-surface text-sm"');
  const file = one(all(row), n => ts.isJsxOpeningElement(n) && n.tagName.getText(app) === "span"
    && n.attributes.getText(app).includes("font-mono"));
  assert.equal(file.parent.children[0].expression.getText(app), "event.file");
  const notes = all(row).filter(n => ts.isJsxOpeningElement(n) && n.tagName.getText(app) === "span");
  assert.ok(notes.some(n => n.attributes.getText(app) === 'className="basis-full text-xs text-slate-400"'));
  assert.ok(notes.some(n => n.attributes.getText(app) === 'className="text-xs italic text-slate-400"'));
  const choice = owner(dialog, "BoundedChoiceDialog"), chooserButtons = all(choice).filter(n => ts.isJsxOpeningElement(n)
    && n.tagName.getText(dialog) === "button" && n.attributes.getText(dialog).includes('aria-haspopup="dialog"'));
  assert.equal(chooserButtons.length, 1); assert.ok(chooserButtons[0].attributes.getText(dialog).includes('aria-haspopup="dialog"'));
  assert.ok(ts.isJsxFragment(chooserButtons[0].parent.parent), "direct Fragment trigger");
  assert.match(owner(dialog, "DialogShell").getText(dialog), /createPortal\([\s\S]*document\.body/);
  assert.match(owner(app, "ChangesView").getText(app), /needsPick\.length > 0[\s\S]*id="sec-pick"[\s\S]*<PickSection/);
  const styles = lf(read("Frontend/src/index.css"));
  assert.match(styles, /min-height: 44px !important/); assert.match(styles, /@media \(min-width: 1440px\)/);
  assert.match(styles, /focus-visible/);
});
test("actual SSR mounts zero/49/50/51 bounded rows, full hostile paths and current labels", () => {
  assert.equal(render(actual.PickSection, sectionProps()), "");
  for (const count of [49, 50, 51]) {
    const rows = freeze(Array.from({ length: count }, (_, i) => event(i + 1)));
    const props = freeze(sectionProps(rows)), before = JSON.stringify(props), html = render(actual.PickSection, props);
    assert.equal((html.match(/class="ui-work-row /g) ?? []).length, Math.min(50, count));
    assert.equal((html.match(/type="checkbox"/g) ?? []).length, Math.min(50, count) + 1);
    assert.ok(html.includes("select all (" + count + ")")); assert.match(html, /aria-label="Manual attribution queue"/);
    assert.equal(html.includes("Manual-pick events"), count > 50); assert.equal(JSON.stringify(props), before);
  }
  const hostile = '<long & "full">/' + "segment/".repeat(35), html = render(actual.PickRow, rowProps({
    event: freeze(event(1, { file: hostile })), choice: "plan - A.1", checked: true }));
  assert.ok(html.includes('&lt;long &amp; &quot;full&quot;&gt;/' + "segment/".repeat(35)));
  assert.match(html, /aria-haspopup="dialog"/); assert.match(html, /codex session session-/);
  assert.doesNotMatch(html, /Filter by codex session/); assert.match(html, /title="2026-10-01T08:00:00Z"/);
  assert.ok(html.indexOf(">Select<") < html.indexOf("&lt;long")); assert.ok(html.indexOf("&lt;long") < html.indexOf("codex session"));
});
test("remembered page, unfiltered select-all and saved choices forward unchanged", () => {
  const events = freeze(Array.from({ length: 51 }, (_, i) => event(i + 1))), changes = [];
  const state = freeze({ selectedIds: [1, 51, 999], bulkChoice: "plan - A.1", choices: { "51": "plan - A.1", "999": "kept" } });
  const h = direct("PickSection", sectionProps(events, { state, onStateChange: v => changes.push(v) }));
  try {
    h.render(); const rows = () => h.nodes().filter(n => n.type.name === "PickRow");
    assert.equal(rows().length, 50); assert.equal(rows()[0].props.checked, true);
    one(h.nodes(), n => n.type === deps.CollectionPager).props.onPageChange(2); h.render();
    assert.equal(rows().length, 1); assert.equal(rows()[0].props.event, events[50]);
    assert.equal(rows()[0].props.choice, "plan - A.1"); assert.equal(rows()[0].props.checked, true);
    one(h.nodes(), n => n.type === "input").props.onChange({ target: { checked: true } });
    assert.deepEqual(changes.at(-1).selectedIds, events.map(e => e.id), "whole queue, not page");
    rows()[0].props.onToggle(); assert.deepEqual(changes.at(-1).selectedIds, [1, 999]);
    rows()[0].props.onChoiceChange("new"); assert.deepEqual(changes.at(-1).choices, { "51": "new", "999": "kept" });
    rows()[0].props.onAssigned(); assert.deepEqual(changes.at(-1), {
      ...state, selectedIds: [1, 999], choices: { "999": "kept" } });
    h.render(sectionProps(events, { state, scopeKeyValue: '["Other"]', onStateChange: v => changes.push(v) }));
    assert.equal(rows().length, 50); assert.equal(rows()[0].props.event.id, 1);
    const chooser = one(h.nodes(), n => n.type === deps.BoundedChoiceDialog);
    assert.equal(chooser.props.value, JSON.stringify(["task-ref", "plan - A.1"]));
    chooser.props.onChange(JSON.stringify(["task-ref", "plan - A.1"]));
    assert.equal(changes.at(-1).bulkChoice, "plan - A.1"); assert.deepEqual(changes.at(-1).selectedIds, state.selectedIds);
  } finally { h.dispose(); }
});
test("controlled bulk busy/retry/result states retain disabled actions and visible feedback", () => {
  const events = freeze([event(1), event(2)]), state = freeze({ selectedIds: [1], bulkChoice: "plan - A.1", choices: {} });
  for (const [note, busy, mutationBusy, retry] of [
    ["", false, false, []], ["Saved 0; failed 1; unattempted 1.", false, false, [1, 2]], ["Retained result", true, true, []],
  ]) {
    const h = direct("PickSection", sectionProps(events, { state }), [note, busy, mutationBusy, retry]);
    try {
      h.render(); assert.equal(one(h.nodes(), n => n.type === "fieldset").props.disabled, mutationBusy);
      const assign = one(h.nodes(), n => n.type === "button" && "aria-busy" in n.props);
      assert.equal(assign.props.disabled, mutationBusy); assert.equal(assign.props["aria-busy"], busy);
      assert.equal(textOf(assign), busy ? "Assigning\u2026" : "Assign 1");
      assert.equal(one(h.nodes(), n => n.type === deps.BoundedChoiceDialog).props.disabled, mutationBusy);
      assert.equal(h.nodes().filter(n => n.type.name === "PickRow").every(n => n.props.sectionDisabled === mutationBusy), true);
      assert.equal(h.nodes().filter(n => n.type === "button" && textOf(n).startsWith("Retry failed")).length,
        retry.length > 0 && !busy ? 1 : 0);
      if (note) assert.equal(one(h.nodes(), n => n.type === "span" && n.props.className === "text-slate-400").props.children, note);
    } finally { h.dispose(); }
  }
  const none = direct("PickSection", sectionProps(events)); try {
    none.render(); assert.equal(one(none.nodes(), n => n.type === deps.BoundedChoiceDialog).props.disabled, true);
    assert.equal(one(none.nodes(), n => n.type === "button" && "aria-busy" in n.props).props.disabled, true);
  } finally { none.dispose(); }
});
test("candidates, row callbacks, retry/busy states and truthful zero-choice guidance", () => {
  for (const [json, expected] of [[null, ["plan - A.1"]], ["[\"plan - A.1\",7,\"missing\"]", ["plan - A.1", "missing"]],
    ["[]", []], ["{}", []], ["bad", []]]) {
    assert.deepEqual(actual.assignmentCandidates(event(1, { candidates_json: json }), tasks), expected);
  }
  const calls = [], captured = freeze(event(1, { candidates_json: '["plan - A.1"]' }));
  for (const [busy, note, label] of [[false, "", "Assign"], [false, "Assignment failed: fixture. Retry.", "Retry"], [true, "", "Assigning\u2026"]]) {
    const h = direct("PickRow", rowProps({ event: captured, choice: "plan - A.1", checked: true,
      onToggle: () => calls.push("toggle"), onChoiceChange: v => calls.push(v) }), [busy, note]);
    try {
      h.render(); const input = one(h.nodes(), n => n.type === "input");
      assert.equal(input.props.checked, true); input.props.onChange(); assert.equal(calls.at(-1), "toggle");
      const chooser = one(h.nodes(), n => n.type === deps.BoundedChoiceDialog);
      assert.equal(chooser.props.contextKey, JSON.stringify(["event-task", "EA", 1]));
      chooser.props.onChange(JSON.stringify(["task-ref", "EA", "plan - A.1"]));
      assert.equal(calls.at(-1), "plan - A.1");
      const button = one(h.nodes(), n => n.type === "button");
      assert.equal(textOf(button), label); assert.equal(button.props["aria-busy"], busy);
      if (note) assert.equal(one(h.nodes(), n => n.type === "span"
        && n.props.className === "basis-full text-xs text-slate-400").props.children, note);
    } finally { h.dispose(); }
  }
  for (const props of [rowProps({ choice: "invalid" }), rowProps({ choice: "plan - A.1", sectionDisabled: true })]) {
    const h = direct("PickRow", props); try {
      h.render(); assert.equal(one(h.nodes(), n => n.type === "button").props.disabled, true);
      assert.equal(one(h.nodes(), n => n.type === "input").props.disabled, props.sectionDisabled);
    } finally { h.dispose(); }
  }
  for (const json of ["[]", "bad"]) {
    const html = render(actual.PickRow, rowProps({ event: event(1, { candidates_json: json }) }));
    assert.match(html, /No task choices are available for this event/); assert.doesNotMatch(html, /aria-haspopup="dialog"/);
    assert.doesNotMatch(html, />Assign</); assert.match(html, /text-xs italic text-slate-400/);
  }
});
