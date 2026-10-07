import { deskPreservation } from "./helpers/missionCommandDesk.mjs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { restoreChangesReviewDeskHtml } from "./helpers/changesReviewDesk.mjs";
import { restoreAttributionStationHtml, restoreAttributionWorkbenchSuite } from "./helpers/attributionStation.mjs";
import { studioHtml, studioWorkbench } from "./helpers/diagnosticStudio.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), ".."), frontend = resolve(root, "Frontend");
const require = createRequire(resolve(frontend, "package.json"));
const ts = require("typescript"), postcss = require("postcss"), React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const read = name => {
  const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(readFileSync(resolve(root, name)));
  if (name === "Frontend/index.html") return restoreAttributionStationHtml(studioHtml(text));
  if (name === "Tests/test_workbench_2_0.mjs") return restoreAttributionWorkbenchSuite(studioWorkbench(deskPreservation(name, text)));
  return text;
};
const sha = value => createHash("sha256").update(value).digest("hex"), lf = value => value.replace(/\r\n/g, "\n");
const OLD_HTML = "f222d0bd4dd81f03905ee4a5288e0afe059e69ccf1de7dffc18bd1052542c2e6";
const NEW_HTML = "f8381b7e989a4cc38987c847182713517de6f524aa49efa5794a34b298b11ad3";
const OLD_SUITE = "704c402ffe107d3cf040bbf4fc18b0e7a7df860856a001690cb0020c91d2df47";
// Independent complete literal, never imported from the adapter, production or a plan.
const CSS = String.raw`/* Changes Review Desk: captured-work hierarchy; existing behavior stays. */
#root #main-content > div > .changes-workbench > .changes-command-deck {
  padding: 1.25rem;
  border: 1px solid rgb(var(--ui-border));
  border-radius: 8px;
  background: rgb(var(--ui-surface));
}
#root #main-content > div > .changes-workbench > .changes-command-deck > .changes-command-metric {
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
}
#root #main-content > div > .changes-workbench[data-has-picks="true"] > .changes-command-deck > .changes-command-metric-action {
  padding-left: 1rem;
  border-left: 3px solid rgb(var(--ui-warning));
}
#root #main-content > div > .changes-workbench > .changes-command-deck > .changes-command-metric > dt {
  font-size: 0.875rem;
  line-height: 1.25rem;
}
#root #main-content > div > .changes-workbench > .changes-command-deck > .changes-command-metric > dd {
  font-size: 2.25rem;
  line-height: 1.25;
}
#root #main-content > div > .changes-workbench > section[aria-label="Grouped uncommitted changes"] > .ui-section-heading {
  margin-bottom: 1.25rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid rgb(var(--ui-border));
}
#root #main-content > div > .changes-workbench > section[aria-label="Grouped uncommitted changes"] .ui-work-list {
  padding: 1.25rem;
  border-radius: 8px;
  background: rgb(var(--ui-surface));
}
#root #main-content > div > .changes-workbench > section[aria-label="Grouped uncommitted changes"] .ui-work-list > div.mt-4 > .ui-work-row {
  padding-left: 0;
  padding-right: 0;
}
#root #main-content > div > .changes-workbench > section[aria-label="Grouped uncommitted changes"] .ui-work-list[data-reveal] > p {
  margin-top: 0.5rem;
  font-size: 0.875rem;
  line-height: 1.5;
}
`;
const WINDOW = '    <style id="katlab-changes-review-desk">\n'
  + CSS.split("\n").slice(0, -1).map(line => "      " + line + "\n").join("") + "    </style>\n";
const TITLE = "    <title>KATLAB Tracking Monitor</title>\n";
const MAIN = "#root #main-content > div > .changes-workbench";
const DECK = MAIN + " > .changes-command-deck", METRIC = DECK + " > .changes-command-metric";
const GROUPED = MAIN + ' > section[aria-label="Grouped uncommitted changes"]';
const RULES = [
  [DECK, [["padding", "1.25rem"], ["border", "1px solid rgb(var(--ui-border))"], ["border-radius", "8px"], ["background", "rgb(var(--ui-surface))"]]],
  [METRIC, [["padding", "0"], ["border", "0"], ["border-radius", "0"], ["background", "transparent"]]],
  [MAIN + '[data-has-picks="true"] > .changes-command-deck > .changes-command-metric-action', [["padding-left", "1rem"], ["border-left", "3px solid rgb(var(--ui-warning))"]]],
  [METRIC + " > dt", [["font-size", "0.875rem"], ["line-height", "1.25rem"]]],
  [METRIC + " > dd", [["font-size", "2.25rem"], ["line-height", "1.25"]]],
  [GROUPED + " > .ui-section-heading", [["margin-bottom", "1.25rem"], ["padding-bottom", "0.75rem"], ["border-bottom", "1px solid rgb(var(--ui-border))"]]],
  [GROUPED + " .ui-work-list", [["padding", "1.25rem"], ["border-radius", "8px"], ["background", "rgb(var(--ui-surface))"]]],
  [GROUPED + " .ui-work-list > div.mt-4 > .ui-work-row", [["padding-left", "0"], ["padding-right", "0"]]],
  [GROUPED + " .ui-work-list[data-reveal] > p", [["margin-top", "0.5rem"], ["font-size", "0.875rem"], ["line-height", "1.5"]]],
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

function ending (text) {
  assert.equal(typeof text, "string");
  assert.equal(Buffer.from(text, "utf8").toString("utf8"), text);
  assert.ok(!text.startsWith("\uFEFF") && !text.includes("\0"));
  const rest = text.replace(/\r\n/g, ""), eol = text.includes("\r\n") ? "\r\n" : "\n";
  assert.ok(!rest.includes("\r") && (eol === "\n" || !rest.includes("\n")));
  assert.ok(text.endsWith(eol) && !text.endsWith(eol + eol), "single EOF");
  assert.doesNotMatch(text, /[\t ]+\r?$/m);
  return eol;
}
function parse (text, name = "subject.tsx") {
  const ast = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true,
    name.endsWith(".mjs") ? ts.ScriptKind.JS : ts.ScriptKind.TSX);
  assert.equal(ast.parseDiagnostics.length, 0, "valid complete current source");
  return ast;
}
const all = node => { const nodes = [node]; ts.forEachChild(node, child => { nodes.push(...all(child)); }); return nodes; };
const one = (nodes, predicate, label) => {
  const found = nodes.filter(predicate); assert.equal(found.length, 1, label); return found[0];
};
const owner = (ast, name) => one(ast.statements, node => ts.isFunctionDeclaration(node)
  ? node.name?.text === name : ts.isVariableStatement(node)
    && node.declarationList.declarations.some(item => item.name.getText(ast) === name), name);
const extract = (ast, name) => owner(ast, name).getText(ast).replace(/^export\s+/, "");
const replaceOnce = (text, before, after) => {
  assert.equal(text.split(before).length - 1, 1, "one physical fixture window");
  return text.replace(before, after);
};
function independentHtmlInverse (text) {
  const eol = ending(text), normalized = lf(text);
  assert.equal(sha(normalized), NEW_HTML);
  assert.equal(normalized.split(WINDOW).length - 1, 1);
  const site = normalized.indexOf(WINDOW);
  assert.ok(normalized.slice(0, site).endsWith("    </style>\n"));
  assert.ok(normalized.slice(site + WINDOW.length).startsWith(TITLE));
  const original = normalized.replace(WINDOW, "");
  assert.equal(sha(original), OLD_HTML);
  return eol === "\r\n" ? original.replace(/\n/g, "\r\n") : original;
}
const BUILD_IMPORT = 'import { readBuildVersion } from "../Frontend/buildVersion.mjs";\n';
const ADAPTER_IMPORT = 'import { restoreChangesReviewDeskHtml } from "./helpers/changesReviewDesk.mjs";\n';
const ADAPTER_READ = 'const html = restoreChangesReviewDeskHtml(read("Frontend/index.html"));';
const ORIGINAL_READ = 'const html = read("Frontend/index.html");';
function oldSuiteInverse (text) {
  const eol = ending(text), normalized = lf(text), ast = parse(normalized, "suite.mjs");
  assert.equal(normalized.split(ADAPTER_IMPORT).length - 1, 1);
  assert.equal(normalized.split(ADAPTER_READ).length - 1, 1);
  assert.equal(normalized.split("restoreChangesReviewDeskHtml").length - 1, 2);
  assert.equal(normalized.split(BUILD_IMPORT + ADAPTER_IMPORT).length - 1, 1);
  const imported = one(ast.statements, node => ts.isImportDeclaration(node)
    && node.moduleSpecifier.text === "./helpers/changesReviewDesk.mjs", "one top-level adapter");
  assert.equal(imported.importClause.name, undefined);
  assert.equal(imported.importClause.namedBindings.elements.length, 1);
  assert.equal(imported.importClause.namedBindings.elements[0].getText(ast), "restoreChangesReviewDeskHtml");
  const html = owner(ast, "html").declarationList.declarations[0];
  assert.equal(html.initializer.getText(ast), 'restoreChangesReviewDeskHtml(read("Frontend/index.html"))');
  const original = normalized.replace(ADAPTER_IMPORT, "").replace(ADAPTER_READ, ORIGINAL_READ);
  parse(original, "old-preservation.mjs"); // Parse only. Never execute restored historical JavaScript.
  return eol === "\r\n" ? original.replace(/\n/g, "\r\n") : original;
}
function cssContract (text) {
  assert.equal(ending(text), "\n");
  const ast = postcss.parse(text);
  assert.equal(ast.nodes.length, 10);
  assert.equal(ast.nodes[0].type, "comment");
  assert.equal(ast.nodes[0].text, "Changes Review Desk: captured-work hierarchy; existing behavior stays.");
  const actual = ast.nodes.slice(1).map(rule => {
    assert.equal(rule.type, "rule");
    return [rule.selector, rule.nodes.map(declaration => {
      assert.equal(declaration.type, "decl", "direct declarations only");
      assert.equal(Boolean(declaration.important), false);
      return [declaration.prop, declaration.value];
    })];
  });
  assert.deepEqual(actual, RULES);
  assert.equal(text, CSS);
}
const app = parse(read("Frontend/src/App.tsx")), ui = parse(read("Frontend/src/ui.tsx"));
const elements = tree => Array.isArray(tree) ? tree.flatMap(elements)
  : React.isValidElement(tree) ? [tree, ...elements(tree.props.children)] : [];
const textOf = tree => Array.isArray(tree) ? tree.map(textOf).join("")
  : React.isValidElement(tree) ? textOf(tree.props.children)
    : tree === null || tree === undefined || typeof tree === "boolean" ? "" : String(tree);
const compile = async text => {
  const result = ts.transpileModule(text, { reportDiagnostics: true, compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React,
  } });
  assert.equal(result.diagnostics.filter(item => item.category === ts.DiagnosticCategory.Error).length, 0);
  return import("data:text/javascript;base64," + Buffer.from(result.outputText).toString("base64"));
};
// Finite current hook cells. No native effects, portal, mutation or paint certification.
function hooks (stateSeeds = []) {
  const cells = [], effects = []; let cursor = 0, stateCursor = 0;
  const changed = (before, after) => !before || !after || before.length !== after.length
    || after.some((value, i) => !Object.is(value, before[i]));
  const h = {
    reset() { cursor = 0; stateCursor = 0; },
    useState(initial) {
      const index = cursor++, seed = stateCursor++;
      cells[index] ??= { value: seed < stateSeeds.length ? stateSeeds[seed] : typeof initial === "function" ? initial() : initial };
      return [cells[index].value, value => { cells[index].value = typeof value === "function" ? value(cells[index].value) : value; }];
    },
    useRef(initial) { const index = cursor++; return cells[index] ??= { current: initial }; },
    useMemo(callback, deps) {
      const index = cursor++; if (changed(cells[index]?.deps, deps)) cells[index] = { deps, value: callback() };
      return cells[index].value;
    },
    useCallback(callback, deps) { return h.useMemo(() => callback, deps); },
    useEffect(callback, deps) {
      const index = cursor++; if (changed(cells[index]?.deps, deps)) { cells[index] = { deps }; effects.push(callback); }
    },
    flush() { for (const callback of effects.splice(0)) callback(); },
  };
  return h;
}
const noop = () => {};
const event = (id, extra = {}) => ({ id, repo_id: "EA", task_ref: "plan - A.1", file: "src/file_" + id + ".ts",
  mode: "B", provider: "codex", session_id: "session-one", ts: "2026-10-01T08:00:00Z", tool: "Edit",
  branch: "develop", commit_hash: null, swept: 0, candidates_json: null, ...extra });
const base = () => ({ events: [], tasks: [], repos: [], effortByTask: new Map(), taskFilter: null,
  sessionFilter: null, groupMode: "task", scopeKeyValue: '["all"]',
  assignmentState: { selectedIds: [], bulkChoice: "", choices: {} }, onClearFilter: noop, onClearSessionFilter: noop,
  onPicked: noop, onSessionClick: noop, onOpenTimeline: noop, onOpenFileStory: noop,
  onGroupModeChange: noop, onAssignmentStateChange: noop, onStatus: noop });
const freeze = value => {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
let vite, actual, direct, deps;
before(async () => {
  const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
  vite = await createServer({ root: frontend, server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom", optimizeDeps: { noDiscovery: true, entries: [] } });
  deps = Object.assign({}, ...await Promise.all(["ui.tsx", "theme.ts", "format.ts", "fileTree.ts",
    "mermaidGraph.ts", "dialog.tsx", "accessibleData.tsx", "dialogStatus.tsx", "icons.tsx"]
    .map(name => vite.ssrLoadModule("/src/" + name))));
  const names = ["PAGE", "tupleKey", "taskIdentity", "taskIdentityParts", "assignmentCandidates", "SWEPT_TIP",
    "swatch", "SessionDot", "ModeBadge", "EffortLine", "FilterChip", "ChangesView", "SectionNav", "FolderView",
    "FolderRepoCard", "TaskGroup", "PickSection", "PickRow", "EventRow", "DiffView"];
  const { createSubjects } = await compile([
    "export function createSubjects(React,deps,hooks=React) {",
    "const {useState,useRef,useMemo,useCallback,useEffect}=hooks;",
    "const {SectionHeading,ControlButton,CollectionPager,useBoundedPage,useRememberedBoundedPage,BoundedChoiceDialog,",
    "DisclosureTable,buildFileTree,MODE_BADGE,MODE_COLOR,SWEPT_COLOR,eventSessionIdentity,sameSessionIdentity,",
    "sessionIdentityKey,sessionColor,fmtMinutes,fmtTs,fmtRel,fmtAge,EFFORT_GAP_MAX_MIN,UNCOMMITTED_AGE_H}=deps;",
    'const useReveal=()=>{},api={},createActionDeadline=()=>{throw new Error("Fixture forbids network/mutation");};',
    "const document={activeElement:null}; // Controlled inactive focus guard, never a native document.",
    "const isAbortError=()=>false,flushSync=callback=>callback();",
    ...names.map(name => extract(app, name)),
    "return {ChangesView,TaskGroup,FolderView,FolderRepoCard,EventRow,DiffView,FilterChip,SectionNav,taskIdentity};}",
  ].join("\n"));
  const { pagerSubject } = await compile([
    "export function pagerSubject(hooks,memory) {const {useState,useRef,useCallback,useEffect}=hooks;",
    "const BoundedPageMemoryContext={},useContext=context=>{",
    'if(context!==BoundedPageMemoryContext)throw new Error("Unsupported pager context");return memory;};',
    ...["getBoundedPageWindow", "collectionIdentityKey", "useBoundedPage", "useRememberedBoundedPage"].map(name => extract(ui, name)),
    "return {useBoundedPage,useRememberedBoundedPage};}",
  ].join("\n"));
  actual = createSubjects(React, deps);
  direct = (name, props, seeds = [], suppliedMemory) => {
    const h = hooks(seeds), memory = suppliedMemory ?? { pages: {}, setPage(key, page) { memory.pages[key] = page; } };
    const subjects = createSubjects(React, { ...deps, ...pagerSubject(h, memory) }, h);
    let tree, current = props;
    return { subjects, memory, render(next = current) { current = next; h.reset(); tree = subjects[name](current); h.flush(); return tree; },
      nodes() { return elements(tree); } };
  };
}, { timeout: 30_000 });
after(async () => { await vite?.close(); });
const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));
const summary = tree => {
  const dl = one(elements(tree), node => node.type === "dl" && node.props["aria-label"] === "Captured work summary", "real dl");
  const metrics = React.Children.toArray(dl.props.children);
  assert.equal(metrics.length, 3);
  assert.deepEqual(metrics.map(node => textOf(node.props.children[0])), ["Needs attribution", "Captured edits", "Task groups"]);
  return metrics.map(node => textOf(node.props.children[1].props.children[0]));
};


test("independent complete CSS and HTML identity, strict LF/CRLF preservation", () => {
  assert.equal(Buffer.byteLength(CSS), 1760); assert.equal(CSS.split("\n").length - 1, 44);
  assert.equal(sha(CSS), "79163e0361d3c2ca6a5c5d4b2c342366a1a6790404008a0d29a7c83dd44f9b13");
  assert.equal(Buffer.byteLength(WINDOW), 2081);
  assert.equal(sha(WINDOW), "1af7ac727d3fb92677ae0e5d95f167f7975be931a16a2684f2e1bd4460c20850");
  cssContract(CSS);
  const html = read("Frontend/index.html");
  assert.equal(ending(html), "\n"); assert.equal(Buffer.byteLength(html), 6323);
  assert.equal(html.split("\n").length - 1, 147); assert.equal(sha(html), NEW_HTML);
  for (const fixture of [html, html.replace(/\n/g, "\r\n")]) {
    assert.equal(restoreChangesReviewDeskHtml(fixture), independentHtmlInverse(fixture));
    assert.equal(sha(lf(restoreChangesReviewDeskHtml(fixture))), OLD_HTML);
    assert.equal(ending(restoreChangesReviewDeskHtml(fixture)), ending(fixture));
  }
  const site = html.indexOf(WINDOW);
  assert.match(html.slice(0, site), /<style id="katlab-workbench-v2">/);
  assert.ok(site > html.indexOf("<head>") && site < html.indexOf("</head>"));
});

test("HTML rejects malformed/moved/duplicated/commented/nested and outside bytes", () => {
  const html = read("Frontend/index.html"), original = independentHtmlInverse(html);
  const bad = [original, html.replace(WINDOW, WINDOW + WINDOW), html.replace(WINDOW, "<!--\n" + WINDOW + "-->\n"),
    original.replace("</body>", WINDOW + "</body>"), html.replace(WINDOW, WINDOW.replace("<style ", "<style><style ")),
    original.replace('    <style id="katlab-workbench-v2">', WINDOW + '    <style id="katlab-workbench-v2">'),
    html.replace('id="katlab-changes-review-desk"', 'id="other"'), html.replace(TITLE, TITLE + TITLE),
    html.replace(WINDOW, WINDOW.slice(0, -1)), html.replace("KATLAB Tracking Monitor</title>", "Changed</title>"),
    "\uFEFF" + html, html + "\n", html.slice(0, -1), html.replace("\n", "\r"),
    html.replace("\n", "\r\n"), html.replace("<head>", "<head>\0"), html.replace("</head>", " \n</head>")];
  for (const fixture of bad) {
    assert.throws(() => restoreChangesReviewDeskHtml(fixture), assert.AssertionError);
    assert.throws(() => independentHtmlInverse(fixture), assert.AssertionError);
  }
  const outside = replaceOnce(html, '<body class="bg-slate-950 text-slate-100">', '<body class="bg-slate-950 text-slate-100" data-unrelated="preserved">');
  assert.ok(outside.replace(WINDOW, "").includes('data-unrelated="preserved"'));
  assert.notEqual(sha(outside.replace(WINDOW, "")), OLD_HTML);
});

test("nine ordered root CSS contracts reject widening, nesting and priority/resource escapes", () => {
  const bad = [CSS + "@media (min-width: 1px) { body { color: red; } }\n", CSS + "body { color: red; }\n",
    CSS.replace("  padding: 1.25rem;", "  @media (min-width: 1px) { padding: 1.25rem; }"),
    CSS.replace("  padding: 1.25rem;", "  color: red; padding: 1.25rem;"),
    CSS.replace("  padding: 1.25rem;", "  /* hidden */ padding: 1.25rem;"),
    CSS.replace("padding: 1.25rem", "padding: 1.25rem !important"),
    CSS.replace("background: transparent", "background: url(example.png)"),
    CSS.replace(METRIC + " > dd", "body dd"), CSS.replace('data-has-picks="true"', 'data-has-picks="false"'),
    CSS.replace(" > div.mt-4 > .ui-work-row", " .ui-work-row"),
    CSS.replace("line-height: 1.5", "overflow: hidden"), CSS.replace("border-radius: 8px", "animation: spin 1s"),
    CSS.replace("  border: 0;\n", ""), CSS.replace("#root #main-content", "#main-content"),
    CSS.replace("  padding: 1.25rem;", "  padding: 1.25rem; padding: 1.25rem;"),
    "\uFEFF" + CSS, CSS.replace("\n", "\r\n"), CSS.replace("\n", "\r"), CSS + "\n", CSS.replace("stays.", "stays.\0")];
  for (const fixture of bad) assert.throws(() => cssContract(fixture));
  const ast = postcss.parse(CSS), moved = ast.nodes[1].clone();
  ast.nodes[1].remove(); ast.append(moved);
  assert.throws(() => cssContract(ast.toString()));
});

test("exact two old-suite adapters preserve all original assertions and 37 current pins", () => {
  const suite = read("Tests/test_workbench_2_0.mjs");
  for (const text of [suite, suite.replace(/\n/g, "\r\n")]) {
    const original = oldSuiteInverse(text);
    assert.equal(sha(lf(original)), OLD_SUITE);
    assert.equal(Buffer.byteLength(lf(original)), 43582);
    assert.equal(lf(original).split("\n").length - 1, 511);
  }
  const structural = [suite.replace(ADAPTER_IMPORT, ""), suite.replace(ADAPTER_READ, ORIGINAL_READ),
    suite.replace(ADAPTER_IMPORT, ADAPTER_IMPORT + ADAPTER_IMPORT),
    suite.replace(BUILD_IMPORT + ADAPTER_IMPORT, ADAPTER_IMPORT + BUILD_IMPORT),
    suite.replace(ADAPTER_IMPORT, "// " + ADAPTER_IMPORT), suite.replace(ADAPTER_READ, "// " + ADAPTER_READ),
    suite.replace(ADAPTER_READ, ADAPTER_READ.replace("read(", "other(")), "\uFEFF" + suite,
    suite.replace("\n", "\r\n"), suite.replace("\n", "\r"), suite + "\n", suite.replace(ADAPTER_READ, ADAPTER_READ + "\0")];
  for (const value of structural) assert.throws(() => oldSuiteInverse(value));
  const outside = suite.replace('"d6fd4b36', '"changed-d6fd4b36');
  assert.notEqual(sha(lf(oldSuiteInverse(outside))), OLD_SUITE, "unrelated assertion stays visible");
  assert.equal(PINS.length, 37);
  for (const [name, raw, normalized] of PINS) {
    const text = deskPreservation(name, read(name)); assert.equal(sha(text), raw, name + " RAW");
    assert.equal(sha(lf(text)), normalized, name + " LF");
  }
});

test("actual source binds grouped/normal/plan/queue owners and retains mount/layout gates", async () => {
  const changes = all(owner(app, "ChangesView"));
  const section = one(changes, node => ts.isJsxOpeningElement(node) && node.tagName.getText(app) === "section"
    && node.attributes.getText(app).includes('aria-label="Grouped uncommitted changes"'), "unique named section");
  assert.ok(section.parent.children.some(node => ts.isJsxSelfClosingElement(node)
    && node.tagName.getText(app) === "SectionHeading"));
  const rows = all(owner(app, "TaskGroup")).filter(node => ts.isJsxSelfClosingElement(node)
    && node.tagName.getText(app) === "EventRow");
  assert.equal(rows.length, 2);
  const ancestry = node => {
    const result = []; for (let n = node.parent; n; n = n.parent) {
      if (ts.isJsxElement(n)) result.push(n.openingElement.attributes.getText(app));
    } return result;
  };
  assert.ok(ancestry(rows[0])[0].includes('className="mt-4"'), "direct normal body");
  assert.ok(ancestry(rows[1])[0].includes('className="mt-1 space-y-1"'), "deeper plan body");
  assert.ok(ancestry(rows[1])[1].includes("px-2 py-1"), "plan gutters retained");
  const call = one(all(app), node => ts.isJsxSelfClosingElement(node)
    && node.tagName.getText(app) === "ChangesView", "actual mount");
  let expression = call.parent;
  while (expression && !ts.isJsxExpression(expression)) expression = expression.parent;
  const { canMount } = await compile("export const canMount=(membershipReady,workspaceReady,view)=>("
    + expression.expression.left.getText(app) + ");");
  for (const member of [false, true]) for (const loaded of [false, true]) {
    assert.equal(canMount(member, loaded, "changes"), member && loaded);
    assert.equal(canMount(member, loaded, "overview"), false);
  }
  const css = lf(read("Frontend/src/index.css"));
  assert.match(css, /@media \(min-width: 768px\)[\s\S]*changes-command-deck/);
  assert.match(css, /@media \(min-width: 1440px\)[\s\S]*data-has-picks="true"/);
  assert.match(css, /min-height: 44px !important/);
  assert.match(css, /\.ui-work-row[\s\S]*px-4 py-4/);
});

test("current Changes SSR retains zero/positive summary and unfiltered queue under saved filters", () => {
  for (const mode of ["task", "folder"]) {
    const props = freeze({ ...base(), groupMode: mode });
    const tree = direct("ChangesView", props).render();
    assert.deepEqual(summary(tree), ["0", "0", "0"]);
    assert.equal(tree.props["data-has-picks"], false);
    const html = render(actual.ChangesView, props);
    assert.match(html, /data-has-picks="false"/); assert.doesNotMatch(html, /id="sec-pick"/);
    assert.match(html, /No uncommitted tracked changes/);
  }
  const calls = [], hostile = '<long & "hostile">';
  const props = { ...base(), events: freeze([event(1, { mode: "UNKNOWN", file: hostile }), event(2),
    event(3, { repo_id: "Other" }), event(4, { session_id: "different" })]),
    sessionFilter: { provider: "codex", sessionId: "session-one" },
    taskFilter: actual.taskIdentity("EA", "plan - A.1"),
    onClearFilter: () => calls.push("task"), onClearSessionFilter: () => calls.push("session"),
    onGroupModeChange: mode => calls.push(mode) };
  const h = direct("ChangesView", props), tree = h.render();
  assert.deepEqual(summary(tree), ["1", "4", "1"]);
  const queue = one(h.nodes(), node => node.type.name === "PickSection", "unfiltered queue");
  assert.equal(queue.props.events[0], props.events[0]);
  const grouped = one(h.nodes(), node => node.type === "section"
    && node.props["aria-label"] === "Grouped uncommitted changes", "grouped owner");
  assert.ok(!elements(grouped).includes(queue));
  const filters = one(h.nodes(), node => node.type === "section"
    && node.props["aria-label"] === "Active change filters", "saved filters excluded");
  assert.ok(!elements(grouped).includes(filters));
  const clears = h.nodes().filter(node => node.type === deps.ControlButton && /^Clear (task|session) filter$/.test(textOf(node)));
  assert.equal(clears.length, 2); clears.forEach(node => node.props.onClick());
  const html = render(actual.ChangesView, props);
  assert.match(html, /&lt;long &amp; &quot;hostile&quot;&gt;/);
  assert.match(html, /data-has-picks="true"/);
  assert.deepEqual(calls, ["task", "session"]);
  const folder = { ...props, groupMode: "folder" }, folderTree = direct("ChangesView", folder).render();
  assert.deepEqual(summary(folderTree), ["1", "4", "1"]);
  const body = one(elements(folderTree), node => node.type.name === "FolderView", "current folder");
  assert.equal(body.props.events, props.events, "all captures despite saved filters");
  const folderCards = elements(direct("FolderView", body.props).render()).filter(node => node.type.name === "FolderRepoCard");
  assert.deepEqual(folderCards.map(node => [node.props.repoId, node.props.events.length]), [["EA", 3], ["Other", 1]]);
  const folderHtml = render(actual.ChangesView, folder);
  assert.match(folderHtml, /3 edits/); assert.match(folderHtml, /1 edits/);
  assert.equal(props.events.length, 4);
});

test("real controlled group/plan/tree paging retains order, collapse and composite identities", () => {
  const rows = Array.from({ length: 51 }, (_, i) => event(i + 1, { task_ref: "task-" + i }));
  const props = { ...base(), events: freeze(rows) }, h = direct("ChangesView", props);
  h.render(); assert.equal(h.nodes().filter(node => node.type.name === "TaskGroup").length, 50);
  one(h.nodes(), node => node.type === deps.CollectionPager, "group pager").props.onPageChange(2); h.render();
  assert.equal(h.nodes().filter(node => node.type.name === "TaskGroup").length, 1);
  assert.ok(h.nodes().some(node => node.props.id === "sec-g50"));
  h.render({ ...props, scopeKeyValue: '["EA"]' });
  assert.equal(h.nodes().filter(node => node.type.name === "TaskGroup").length, 50);
  const group = freeze([...Array.from({ length: 51 }, (_, i) => event(i + 1)),
    ...Array.from({ length: 51 }, (_, i) => event(100 + i, { file: "temp/Plan/PLAN_A.txt" }))]);
  const taskProps = { refLabel: '<task & "long">', repoId: "EA", group, why: '<why & "next">',
    repos: [], planFileSet: new Set(["temp/Plan/PLAN_A.txt"]), scopeKeyValue: '["EA"]',
    groupIdentity: actual.taskIdentity("EA", "task"), effort: { minutes: 15, sessions: 2 }, onStatus: noop };
  const task = direct("TaskGroup", taskProps);
  task.render(); assert.equal(task.nodes().filter(node => node.type.name === "EventRow").length, 50);
  const why = one(task.nodes(), node => node.type === "p" && textOf(node).startsWith("Why:"), "direct Why");
  assert.equal(why.props.className, "mt-1 text-xs text-slate-400");
  const toggle = one(task.nodes(), node => node.type === "button" && "aria-expanded" in node.props, "plan disclosure");
  assert.equal(toggle.props["aria-expanded"], false); toggle.props.onClick(); task.render();
  assert.equal(task.nodes().filter(node => node.type.name === "EventRow").length, 100);
  assert.equal(one(task.nodes(), node => node.type === "button" && "aria-expanded" in node.props).props["aria-expanded"], true);
  const planPager = one(task.nodes(), node => node.type === deps.CollectionPager
    && node.props.collectionLabel.endsWith("plan-file edits"), "plan pager");
  planPager.props.onPageChange(2); task.render();
  assert.equal(task.nodes().filter(node => node.type.name === "EventRow").length, 51);
  assert.equal(task.nodes().filter(node => node.type.name === "EventRow").at(-1).props.event.id, 150);
  const html = render(actual.TaskGroup, taskProps);
  assert.match(html, /&lt;task &amp; &quot;long&quot;&gt;/); assert.match(html, /Why: &lt;why &amp; &quot;next&quot;&gt;/);
  assert.match(html, /15m/); assert.match(html, /2 sessions/);
  const fileEvents = freeze(Array.from({ length: 60 }, (_, i) => event(i, { file: "src/leaf_" + i + ".ts" })));
  const card = direct("FolderRepoCard", { repoId: '<EA & "scope">', events: fileEvents, scopeKeyValue: '["EA"]' });
  card.render();
  const scroller = one(card.nodes(), node => node.type === "pre", "named scroller");
  assert.equal(scroller.props.role, "region"); assert.equal(scroller.props.tabIndex, 0);
  assert.equal(scroller.props["aria-label"], '<EA & "scope"> file tree');
  assert.equal(React.Children.toArray(scroller.props.children).length, 50);
  one(card.nodes(), node => node.type === deps.CollectionPager, "tree pager").props.onPageChange(2);
  card.render();
  assert.ok(React.Children.toArray(one(card.nodes(), node => node.type === "pre").props.children).length > 0);
  assert.equal(fileEvents.length, 60);
});

test("current event callbacks and controlled retained/offline/error/busy diff states remain recoverable", () => {
  const calls = [], captured = freeze(event(9, { file: '<src & "full">', branch: "captured" }));
  const props = { event: captured, repos: [{ id: "EA", offline: false, branch: "current" }],
    onOpenFileStory: (...args) => calls.push(args), onSessionClick: identity => calls.push(identity), onStatus: noop };
  const h = direct("EventRow", props);
  h.render();
  one(h.nodes(), node => node.type === "button" && node.props.title?.includes("open file story")).props.onClick();
  one(h.nodes(), node => node.type.name === "SessionDot").props.onClick();
  assert.deepEqual(calls, [["EA", captured.file], { provider: "codex", sessionId: "session-one" }]);
  assert.match(render(actual.EventRow, props), /&lt;src &amp; &quot;full&quot;&gt;/);
  const offline = { ...props, repos: [{ id: "EA", offline: true, branch: "current" }] };
  assert.doesNotMatch(render(actual.EventRow, offline), /Show diff/);
  const retained = direct("EventRow", offline, ["", "", false]);
  retained.render();
  const hide = one(retained.nodes(), node => node.type === "button" && node.props["aria-label"]?.startsWith("Hide diff"));
  assert.equal(hide.props["aria-expanded"], true);
  assert.ok(retained.nodes().some(node => node.type.name === "DiffView" && node.props.text === ""));
  // Native focus is not exercised: actual Hide runs with no attached DOM reference.
  hide.props.onClick({ currentTarget: {} }); retained.render();
  assert.ok(!retained.nodes().some(node => node.type.name === "DiffView"));
  for (const [busy, error, name] of [[true, "", "Loading diff"], [false, "Diff failed: fixture", "Retry diff"]]) {
    const state = direct("EventRow", props, [null, error, busy]); state.render();
    const control = one(state.nodes(), node => node.type === "button" && node.props["aria-label"]?.startsWith(name));
    assert.equal(control.props.disabled, busy); assert.equal(control.props["aria-busy"], busy);
    if (error) assert.match(textOf(state.nodes().find(node => node.type === "p")), /retry diff/);
  }
  assert.equal(captured.file, '<src & "full">');
});
