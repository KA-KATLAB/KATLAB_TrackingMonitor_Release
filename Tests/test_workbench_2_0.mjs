import { deskPreservation } from "./helpers/changesReviewLanes.mjs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readBuildVersion } from "../Frontend/buildVersion.mjs";
import { restoreChangesReviewDeskHtml } from "./helpers/changesReviewDesk.mjs";
import { restoreAttributionStationHtml } from "./helpers/attributionStation.mjs";
import { studioHtml } from "./helpers/diagnosticStudio.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), ".."), frontend = resolve(root, "Frontend");
const require = createRequire(resolve(frontend, "package.json"));
const ts = require("typescript"), postcss = require("postcss"), selectors = require("postcss-selector-parser"), React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const read = name => new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(readFileSync(resolve(root, name)));
const sha = value => createHash("sha256").update(value).digest("hex"), lf = text => text.replace(/\r\n/g, "\n");
const STYLE_OPEN = '    <style id="katlab-workbench-v2">', TITLE = "    <title>KATLAB Tracking Monitor</title>";
const ORIGINAL_HTML = "df56a6b6aa9d4a3b5a8c00f22064b87d277b5ed00133c6192a3e44358f94284e";
const REVIEWED_HTML = "f222d0bd4dd81f03905ee4a5288e0afe059e69ccf1de7dffc18bd1052542c2e6";
const WINDOW_HASH = "97603e3e2455317826631ef75198c4aefa12a019c7c43733d26b609f2758876b";
const CSS_HASH = "d6fd4b36df30839ae8ea72ee7ad5e0bd7b570d73bcf45e6229524ef53cd6e112";
// Complete independent reviewed oracle, never read from an ignored plan or built output.
const CSS = String.raw`/* Workbench 2.0: scoped presentation; existing data and interaction owners stay. */
#root header.app-shell-header > .app-header-primary {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 1rem;
}
#root header.app-shell-header > .app-header-primary > .app-header-actions {
  min-width: 0;
  justify-content: flex-start;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
}
#root header.app-shell-header > .app-workspace-context {
  padding: 0.75rem 0;
  border: 0;
  border-top: 1px solid rgb(var(--ui-border));
  border-radius: 0;
  background: transparent;
}
#root .app-shell-navigation {
  padding: 1.25rem 0.75rem;
  background: #0b1220;
}
#root .app-shell-navigation nav[aria-label="Primary views"] > div > button.ui-control[aria-current="page"] {
  background-color: rgb(var(--ui-primary));
}
#root .app-shell-navigation nav[aria-label="Primary views"] > div > button.ui-control[aria-current="page"]:hover:not(:disabled) {
  background-color: rgb(var(--ui-primary-hover));
}
#root #main-content {
  padding: 1rem;
  background: #060b16;
}
#root #main-content .ui-page-heading {
  padding-bottom: 1rem;
  border-bottom: 1px solid rgb(var(--ui-border));
}
#root #main-content > div > .max-w-\[100rem\] {
  padding: 0;
}
#root #main-content section[aria-labelledby="overview-now-heading"] {
  padding: 1rem;
  border-radius: 8px;
  background: rgb(var(--ui-surface));
}
#root #main-content section[aria-labelledby="overview-now-heading"] [role="group"][aria-label="Current operational metrics"] > .ui-metric:not(:first-child) {
  background: rgb(var(--ui-canvas));
}
#root #main-content section[aria-labelledby="overview-now-heading"] [role="group"][aria-label="Captured activity summary"] {
  padding: 1rem 0 0;
  border: 0;
  border-top: 1px solid rgb(var(--ui-border));
  border-radius: 0;
  background: transparent;
}
#root #main-content > div > .max-w-\[100rem\] > .ui-surface.border-l-4 {
  padding: 1.25rem;
  background: rgb(var(--ui-surface));
}
@media (min-width: 768px) {
  #root #main-content { padding: 1.5rem; }
  #root #main-content section[aria-labelledby="overview-now-heading"] { padding: 1.5rem; }
  #root #main-content > div > .max-w-\[100rem\] > .ui-surface.border-l-4 { padding: 1.5rem; }
}
@media (min-width: 1024px) {
  #root header.app-shell-header > .app-header-primary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  #root header.app-shell-header > .app-header-primary > .app-header-actions { justify-content: flex-end; }
}
@media (min-width: 1280px) {
  #root #main-content { padding: 2rem; }
}
`;
const primary = "#root header.app-shell-header > .app-header-primary", actions = primary + " > .app-header-actions";
const main = "#root #main-content", now = main + ' section[aria-labelledby="overview-now-heading"]';
const missionRoot = main + " > div > .max-w-\\[100rem\\]", missionNow = missionRoot + " > .ui-surface.border-l-4";
const nav = '#root .app-shell-navigation nav[aria-label="Primary views"] > div > button.ui-control[aria-current="page"]';
const RULES = [
  [null, primary, [["display", "grid"], ["grid-template-columns", "minmax(0, 1fr)"], ["gap", "1rem"]]],
  [null, actions, [["min-width", "0"], ["justify-content", "flex-start"], ["padding", "0"], ["border", "0"], ["border-radius", "0"], ["background", "transparent"]]],
  [null, '#root header.app-shell-header > .app-workspace-context', [["padding", "0.75rem 0"], ["border", "0"], ["border-top", "1px solid rgb(var(--ui-border))"], ["border-radius", "0"], ["background", "transparent"]]],
  [null, "#root .app-shell-navigation", [["padding", "1.25rem 0.75rem"], ["background", "#0b1220"]]],
  [null, nav, [["background-color", "rgb(var(--ui-primary))"]]],
  [null, nav + ":hover:not(:disabled)", [["background-color", "rgb(var(--ui-primary-hover))"]]],
  [null, main, [["padding", "1rem"], ["background", "#060b16"]]],
  [null, main + " .ui-page-heading", [["padding-bottom", "1rem"], ["border-bottom", "1px solid rgb(var(--ui-border))"]]],
  [null, missionRoot, [["padding", "0"]]],
  [null, now, [["padding", "1rem"], ["border-radius", "8px"], ["background", "rgb(var(--ui-surface))"]]],
  [null, now + ' [role="group"][aria-label="Current operational metrics"] > .ui-metric:not(:first-child)', [["background", "rgb(var(--ui-canvas))"]]],
  [null, now + ' [role="group"][aria-label="Captured activity summary"]', [["padding", "1rem 0 0"], ["border", "0"], ["border-top", "1px solid rgb(var(--ui-border))"], ["border-radius", "0"], ["background", "transparent"]]],
  [null, missionNow, [["padding", "1.25rem"], ["background", "rgb(var(--ui-surface))"]]],
  ["(min-width: 768px)", main, [["padding", "1.5rem"]]],
  ["(min-width: 768px)", now, [["padding", "1.5rem"]]],
  ["(min-width: 768px)", missionNow, [["padding", "1.5rem"]]],
  ["(min-width: 1024px)", primary, [["grid-template-columns", "repeat(2, minmax(0, 1fr))"]]],
  ["(min-width: 1024px)", actions, [["justify-content", "flex-end"]]],
  ["(min-width: 1280px)", main, [["padding", "2rem"]]],
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
  assert.ok(!text.startsWith("\uFEFF") && !text.includes("\0"), "no BOM or NUL");
  const rest = text.replace(/\r\n/g, ""), eol = text.includes("\r\n") ? "\r\n" : "\n";
  assert.ok(!rest.includes("\r"), "no bare CR");
  if (eol === "\r\n") assert.ok(!rest.includes("\n"), "uniform EOL");
  return eol;
}
const windowFor = eol => STYLE_OPEN + eol + CSS.trimEnd().split("\n").map(line => "      " + line).join(eol) + eol + "    </style>" + eol;
function restoreHtml (text) {
  const eol = ending(text), window = windowFor(eol);
  assert.ok(text.endsWith(eol) && !text.endsWith(eol + eol), "single EOF");
  assert.equal(text.split('id="katlab-workbench-v2"').length - 1, 1, "one physical owner");
  assert.equal(text.split(TITLE + eol).length - 1, 1, "one exact unchanged title line");
  assert.equal(text.split(window).length - 1, 1, "complete exact physical insertion");
  const at = text.indexOf(window), titleAt = text.indexOf(TITLE + eol);
  assert.equal(at + window.length, titleAt, "immediately before unchanged title");
  assert.ok(at > text.indexOf("  <head>" + eol) && titleAt < text.indexOf("  </head>" + eol), "direct head site");
  assert.ok(text.replace(/<!--[\s\S]*?-->/g, "").includes(window), "not an HTML comment fixture");
  assert.equal((text.slice(0, at).match(/<style\b/gi) ?? []).length, 0, "not nested inside another style");
  return text.slice(0, at) + text.slice(at + window.length); // Preservation-only, never executed.
}
function checkCss (text) {
  assert.equal(ending(text), "\n"); assert.ok(text.endsWith("\n") && !text.endsWith("\n\n"));
  assert.doesNotMatch(text, /[ \t]+$|@import|url\s*\(|!\s*important/m);
  const ast = postcss.parse(text), rows = [];
  assert.equal(ast.nodes.length, 17, "one comment, thirteen root rules, three media");
  assert.equal(ast.nodes[0].type, "comment");
  assert.equal(ast.nodes[0].text, "Workbench 2.0: scoped presentation; existing data and interaction owners stay.");
  for (const [index, node] of ast.nodes.slice(1).entries()) {
    let media = null, rules = [node];
    if (index >= 13) {
      assert.equal(node.type, "atrule"); assert.equal(node.name, "media");
      assert.equal(node.params, ["(min-width: 768px)", "(min-width: 1024px)", "(min-width: 1280px)"][index - 13]);
      assert.equal(node.nodes.length, [3, 2, 1][index - 13]); media = node.params; rules = node.nodes;
    }
    for (const rule of rules) {
      assert.equal(rule.type, "rule", "only direct rules in their exact root/media context");
      assert.equal(rule.parent, media ? node : ast);
      assert.ok(rule.nodes.every(child => child.type === "decl"), "no nested rule/at-rule/comment escape");
      rows.push([media, rule.selector, rule.nodes.map(decl => {
        assert.equal(!!decl.important, false); return [decl.prop, decl.value];
      })]);
    }
  }
  assert.deepEqual(rows, RULES, "all nineteen complete declaration contexts"); return ast;
}
function checkHtml (text) {
  const original = restoreHtml(text);
  assert.equal(sha(lf(text)), REVIEWED_HTML); assert.equal(sha(lf(original)), ORIGINAL_HTML);
  return original;
}
const html = restoreChangesReviewDeskHtml(restoreAttributionStationHtml(studioHtml(deskPreservation("Frontend/index.html", read("Frontend/index.html")))));
test("independent exact insertion preserves the entire original HTML, Unicode and LF/CRLF inverses", () => {
  assert.equal(Buffer.byteLength(CSS), 2572); assert.equal(CSS.split("\n").length - 1, 73); assert.equal(sha(CSS), CSS_HASH);
  assert.equal(Buffer.byteLength(windowFor("\n")), 3060); assert.equal(sha(windowFor("\n")), WINDOW_HASH); checkCss(CSS);
  assert.equal(ending(html), "\n"); assert.equal(Buffer.byteLength(html), 4242); assert.equal(html.split("\n").length - 1, 101);
  assert.equal(sha(html), REVIEWED_HTML); assert.doesNotMatch(html, /[ \t]+$/m);
  const original = checkHtml(html); assert.equal(Buffer.byteLength(original), 1182); assert.equal(original.split("\n").length - 1, 26);
  assert.equal((original.match(/\u2014/g) ?? []).length, 2, "both original Unicode em dashes preserved");
  for (const eol of ["\n", "\r\n"]) {
    const fixture = lf(html).replace(/\n/g, eol), restored = checkHtml(fixture);
    assert.equal(restored, lf(original).replace(/\n/g, eol)); assert.equal(ending(restored), eol);
  }
});
test("HTML owner rejects missing, duplicate, comment, relocation, partial, nested and structural-byte changes", () => {
  const window = windowFor("\n"), original = restoreHtml(html);
  for (const value of [original, html.replace(window, window + window), html.replace(window, "<!--" + window + "-->\n"),
    html.replace(window, "") .replace("  </head>\n", window + "  </head>\n"),
    html.replace(window, "") .replace("  </body>\n", window + "  </body>\n"),
    html.replace(STYLE_OPEN, STYLE_OPEN + " <!-- Partial -->"), html.replace(STYLE_OPEN, STYLE_OPEN.replace('id="', 'class="')),
    html.replace(window, "    <style>\n" + window + "    </style>\n"), html.replace(window, window + "\n"),
    html.replace(window, window.replace("      #root", "     #root")), html.replace("    </style>", "   </style>"),
    html.replace("display: grid;", "display: flex;"), "\uFEFF" + html, html + "\0", html + "\n",
    html.replace("\n", "\r\n"), html.replace("\n", "\r")]) assert.throws(() => checkHtml(value));
});
test("outside HTML changes survive the strict inverse and fail complete immutable original pins", () => {
  const original = restoreHtml(html);
  for (const [old, next] of [['content="#0f172a"', 'content="#111111"'], ['src="/src/main.tsx"', 'src="/src/other.tsx"'],
    ['    <link rel="manifest"', '    <!-- Outside reviewed window. -->\n    <link rel="manifest"']]) {
    assert.equal(html.split(old).length - 1, 1);
    const changed = html.replace(old, next), restored = restoreHtml(changed);
    assert.equal(restored, original.replace(old, next)); assert.notEqual(sha(lf(restored)), ORIGINAL_HTML);
    assert.throws(() => checkHtml(changed));
  }
});
test("complete CSS AST guard rejects changed, widened, reordered, nested and forbidden contexts", () => {
  for (const value of [CSS + "body { color: red; }\n", CSS + "/* Extra */\n", CSS.slice(0, -3),
    CSS.replace("  display: grid;", "  display: grid;\n  .nested { color: red; }"),
    CSS.replace("  display: grid;", "  display: grid;\n  @supports (display: grid) { color: red; }"),
    CSS.replace("  display: grid;", "  display: grid;\n  /* Nested */"),
    CSS.replace("  display: grid;", "  display: grid; display: grid;"), CSS.replace("display: grid;", "display: grid !important;"),
    ...["overflow: hidden;", "position: fixed;", "order: 1;", "animation: none;", "height: 100vh;", "background: url(x);"]
      .map(decl => CSS.replace("display: grid;", decl)),
    CSS.replace(primary, "header.app-shell-header > .app-header-primary"),
    CSS.replace(":hover:not(:disabled)", ":hover"), CSS.replace("0.75rem 0", "0.5rem 0"),
    CSS.replace("(min-width: 768px)", "(min-width: 767px)"),
    CSS.replace("  #root #main-content { padding: 1.5rem; }", "  @font-face { font-family: Forbidden; }"),
    CSS.replace("  #root #main-content { padding: 2rem; }", "  @supports (display: grid) { #root #main-content { padding: 2rem; } }"),
    CSS.replace("  #root #main-content { padding: 2rem; }", "  color: red;"),
    CSS.replace("  #root #main-content { padding: 2rem; }", "  /* Nested */ #root #main-content { padding: 2rem; }"),
    CSS.replace("  #root #main-content { padding: 2rem; }", "  #root #main-content { padding: 2rem; } #root #main-content { padding: 2rem; }"),
    "\uFEFF" + CSS, CSS + "\0", CSS + "\n", CSS.replace("\n", "\r\n"), CSS.replace("\n", "\r")]) assert.throws(() => checkCss(value));
});
test("all actual source, old oracle and dependency RAW/LF pins remain immutable", () => {
  for (const [name, rawPin, lfPin] of PINS) {
    const current = deskPreservation(name, read(name)); ending(current); assert.equal(sha(current), rawPin, name); assert.equal(sha(lf(current)), lfPin, name);
    for (const eol of ["\n", "\r\n"]) assert.equal(sha(lf(lf(current).replace(/\n/g, eol))), lfPin, name);
  }
});

function parse (name) {
  const ast = ts.createSourceFile(name, read("Frontend/src/" + name), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  assert.equal(ast.parseDiagnostics.length, 0, "actual source parses: " + name); return ast;
}
function all (node) { const items = [node]; ts.forEachChild(node, child => { items.push(...all(child)); }); return items; }
function one (items, predicate, label) { const matches = items.filter(predicate); assert.equal(matches.length, 1, label); return matches[0]; }
function owner (ast, name) {
  return one(ast.statements, node => (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && node.name?.text === name
    || ts.isVariableStatement(node) && node.declarationList.declarations.some(item => item.name.getText(ast) === name), name);
}
const declaration = (ast, name) => owner(ast, name).getText(ast).replace(/^export\s+/, "");
function compileFactory (text, bindings) {
  const code = ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX }, reportDiagnostics: true });
  assert.equal(code.diagnostics?.length ?? 0, 0);
  return new Function("require", "exports", code.outputText + "\nreturn makeSubjects;")(require, {})(...bindings);
}
const app = parse("App.tsx"), overview = parse("OverviewView.tsx"), mission = parse("MissionView.tsx");
const labels = one(all(app), n => ts.isVariableDeclaration(n) && n.name.getText(app) === "VIEW_LABELS", "actual view labels");
const navigation = compileFactory(`function makeSubjects () {
  ${labels.parent.parent.getText(app)}
  ${declaration(app, "ViewNavigation")}
  return { VIEW_LABELS, ViewNavigation };
}`, []);
const KEYS = ["changes", "mission", "overview", "history", "city", "chronicle"], LABELS = ["Changes", "Mission", "Overview", "History", "City", "Chronicle"];
const elements = node => Array.isArray(node) ? node.flatMap(elements)
  : React.isValidElement(node) ? [node, ...elements(node.props.children)] : [];
const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));
function frozen (value) { if (value && typeof value === "object") { Object.values(value).forEach(frozen); Object.freeze(value); } return value; }
function attr (node, name) { return node.attributes.properties.find(item => ts.isJsxAttribute(item) && item.name.getText() === name); }
const literalAttr = (node, name) => attr(node, name)?.initializer?.text;
const openings = ast => all(ast).filter(n => ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n));
test("actual AST owners prove exact direct Mission targeting, Overview regions and unchanged main/lazy ownership", () => {
  const mainOwner = one(openings(app), node => node.tagName.getText(app) === "main" && literalAttr(node, "id") === "main-content", "main owner");
  assert.ok(attr(mainOwner, "data-app-scroll")); assert.equal(attr(mainOwner, "onScroll").initializer.expression.getText(app), "scheduleCurrentEntrySave");
  assert.match(literalAttr(mainOwner, "className"), /min-h-0 min-w-0 flex-1 overflow-y-auto/);
  const wrapper = one(mainOwner.parent.children, n => ts.isJsxElement(n) && n.openingElement.tagName.getText(app) === "div", "one direct main wrapper");
  assert.equal(attr(wrapper.openingElement, "className").initializer.expression.getText(app), 'view === "chronicle" ? "flex h-full min-h-0 flex-col" : "min-h-full"');
  const boundary = owner(app, "LazyViewBoundary"), renderMethod = one(boundary.members,
    n => ts.isMethodDeclaration(n) && n.name.getText(app) === "render", "actual lazy render method");
  const success = renderMethod.body.statements[0]; assert.ok(ts.isIfStatement(success));
  assert.equal(success.expression.getText(app), "!this.state.failed");
  assert.equal(success.thenStatement.getText(app), "return this.props.children;", "success adds no DOM wrapper");
  const missionDiv = one(openings(mission), n => literalAttr(n, "className")?.includes("max-w-[100rem]"), "one real Mission root");
  assert.equal(missionDiv.tagName.getText(mission), "div");
  assert.equal(literalAttr(missionDiv, "className"), "mx-auto min-w-0 max-w-[100rem] space-y-6 p-4 sm:p-6 lg:p-8");
  const selected = one(openings(mission), n => literalAttr(n, "className") === "border-l-4 border-l-sky-400", "one selected Now Surface");
  assert.equal(selected.tagName.getText(mission), "Surface"); assert.equal(literalAttr(selected, "tone"), "raised");
  assert.ok(all(owner(mission, "NowPanel")).includes(selected), "real selected owner, not another Surface");
  const nowOwner = one(openings(overview), n => literalAttr(n, "aria-labelledby") === "overview-now-heading", "one Overview Now region");
  assert.equal(nowOwner.tagName.getText(overview), "section");
  assert.equal(literalAttr(nowOwner, "className"), "min-w-0 space-y-6");
  for (const label of ["Current operational metrics", "Captured activity summary"]) {
    assert.equal(one(openings(overview), n => literalAttr(n, "aria-label") === label, label).tagName.getText(overview), "div");
  }
});
test("actual six-view navigation preserves source sequence, labels, current/disabled state and callbacks", () => {
  assert.deepEqual(Object.keys(navigation.VIEW_LABELS), KEYS); assert.deepEqual(Object.values(navigation.VIEW_LABELS), LABELS);
  for (const view of KEYS) for (const ready of [false, true]) {
    const calls = [], props = { view, membershipReady: ready, onSelect: value => calls.push(value) };
    const tree = navigation.ViewNavigation(props), buttons = elements(tree).filter(n => n.type === "button");
    assert.equal(tree.type, "nav"); assert.equal(tree.props["aria-label"], "Primary views"); assert.equal(buttons.length, 6);
    buttons.forEach((node, index) => {
      assert.equal(node.key, KEYS[index]); assert.equal(node.props.type, "button"); assert.equal(node.props.children, LABELS[index]);
      assert.equal(node.props["aria-current"], view === KEYS[index] ? "page" : undefined);
      assert.equal(node.props.disabled, !ready && ["mission", "overview", "history"].includes(KEYS[index])); node.props.onClick();
    });
    assert.deepEqual(calls, KEYS); // Handler contract only, not native disabled-button activation.
    const markup = render(navigation.ViewNavigation, props);
    assert.equal((markup.match(/aria-current="page"/g) ?? []).length, 1);
    assert.equal((markup.match(/ disabled=""/g) ?? []).length, ready ? 0 : 3);
  }
});

let vite, shell, brand, ui, kpis, missionSubjects, model, OverviewView, version;
before(async () => {
  const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
  vite = await createServer({ root: frontend, server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom", optimizeDeps: { noDiscovery: true, entries: [] } });
  const [s, b, u, m, icons, format, days, view, build] = await Promise.all([
    "/src/AppShell.tsx", "/src/ApplicationBrand.tsx", "/src/ui.tsx", "/src/missionModel.ts", "/src/icons.tsx",
    "/src/format.ts", "/src/calendarDay.ts", "/src/OverviewView.tsx", "/src/appVersion.ts",
  ].map(name => vite.ssrLoadModule(name)));
  shell = s; brand = b; ui = u; model = m; OverviewView = view.OverviewView; version = build.UI_BUILD_VERSION;
  kpis = compileFactory(`function makeSubjects (React, format, days) {
    const { useState, useRef, useEffect } = React, { fmtMinutes } = format, { calendarDayLabel } = days;
    // Explicit reduced-motion final-state fixture; count-up source remains actual and whole-pinned.
    const prefersReducedMotion = () => true, usePrefersReducedMotion = () => true;
    ${["KpiRow", "Kpi", "useCountUp"].map(name => declaration(overview, name)).join("\n")}
    return { KpiRow, Kpi };
  }`, [React, format, days]);
  missionSubjects = compileFactory(`function makeSubjects (ui, model, icons) {
    const { Surface, SectionHeading, CollectionPager, useBoundedPage, cx } = ui;
    const { missionPresentation } = model, { AlertIcon, MissionIcon } = icons;
    ${["TONE_CLASS", "StateBadge", "MissionReasonList", "missionPlanPrompt", "NowPanel"].map(name => declaration(mission, name)).join("\n")}
    return { NowPanel };
  }`, [ui, model, icons]);
});
after(async () => { await vite?.close(); });
const repo = (id = "Repo", extra = {}) => ({ id, offline: false, status_valid: true, clean: false, count: 3, branch: "main", last_event_ts: null, ...extra });
const context = (repos = [], extra = {}) => ({ scope: { kind: "all" }, repos, ready: true, error: "", violationOf: () => null, onDetails() {}, ...extra });
test("current shell/brand SSR retains visible canonical build, System action, source order and wrapping slots", () => {
  assert.equal(version, readBuildVersion()); let calls = 0; const onSystem = () => calls++;
  const action = React.createElement("button", null, "Actions <safe>&"), ctx = React.createElement(shell.WorkspaceContext, context()),
    feedback = React.createElement("p", null, "Feedback <safe>&");
  const tree = shell.AppShell({ actions: action, context: ctx, children: feedback, onSystem });
  assert.equal(tree.type, "header"); const primaryNode = tree.props.children[0];
  assert.equal(primaryNode.props.className, "app-header-primary"); assert.equal(primaryNode.props.children[1].props.className, "app-header-actions");
  assert.equal(primaryNode.props.children[1].props.children, action); assert.equal(tree.props.children[1], ctx); assert.equal(tree.props.children[2], feedback);
  const brandNode = primaryNode.props.children[0]; assert.equal(brandNode.type, brand.ApplicationBrand); assert.equal(brandNode.props.onSystem, onSystem);
  const badge = one(elements(brand.ApplicationBrand(brandNode.props)), n => n.type === "button", "actual version button");
  assert.equal(badge.props.type, "button"); assert.equal(badge.props["aria-label"], `UI build v${version}. Open System health`);
  badge.props.onClick(); assert.equal(calls, 1);
  const markup = render(shell.AppShell, { actions: action, context: ctx, children: feedback, onSystem });
  assert.ok(markup.includes(`v${version}</button>`)); assert.match(markup, /KATLAB Tracking Monitor/);
  assert.ok(markup.indexOf("Actions") < markup.indexOf("No repositories") && markup.indexOf("No repositories") < markup.indexOf("Feedback"));
  assert.match(markup, /Actions &lt;safe&gt;&amp;/); assert.match(markup, /Feedback &lt;safe&gt;&amp;/); assert.doesNotMatch(markup, /<safe>/);
  const rail = render(shell.AppShellNavigation, { children: React.createElement(navigation.ViewNavigation, { view: "mission", membershipReady: true, onSelect() {} }) });
  assert.match(rail, /class="app-shell-navigation" aria-label="Workspace navigation"/); assert.match(rail, /aria-label="Primary views"/);
});
test("current workspace context preserves pending, failed, empty, unknown/offline and retained long identities", () => {
  for (const [props, expected] of [[context([], { ready: false }), "Waiting for workspace snapshot"],
    [context([], { ready: false, error: "Controlled failure" }), "Workspace snapshot unavailable"],
    [context(), "No repositories configured"], [context([], { scope: { kind: "repo", id: "Missing" } }), "Selected repository unavailable"],
    [context([repo("Unknown", { status_valid: false, count: 987 })]), "Git status unavailable"],
    [context([repo("Offline", { offline: true, count: 999 })]), "No online repositories"]]) {
    const markup = render(shell.WorkspaceContext, props); assert.ok(markup.includes(expected)); assert.doesNotMatch(markup, /987|999/);
  }
  const id = '<repo>&"long"'.repeat(30), props = frozen(context([repo(id, { status_valid: false, branch: '<branch>&"long"'.repeat(30) })],
    { scope: { kind: "repo", id }, error: "Controlled refresh failure", violationOf: () => 1 }));
  const saved = JSON.stringify(props), markup = render(shell.WorkspaceContext, props);
  for (const text of ["Refresh failed; showing the last workspace snapshot", "Last-known branch", "Git status unavailable",
    "&lt;repo&gt;&amp;&quot;long&quot;", "&lt;branch&gt;&amp;&quot;long&quot;", "1 discipline warning"]) assert.ok(markup.includes(text), text);
  assert.doesNotMatch(markup, /<repo>|<branch>|known uncommitted changes/); assert.equal(JSON.stringify(props), saved);
  let calls = 0; const onDetails = () => calls++, tree = shell.WorkspaceContext(context([], { onDetails }));
  const control = one(elements(tree), n => n.type === ui.ControlButton, "real repository status action");
  assert.equal(control.props.onClick, onDetails); ui.ControlButton.render(control.props, null).props.onClick(); assert.equal(calls, 1);
});
const stats = (extra = {}) => ({ mode_counts: { B: 4, A_SCOPED: 2, A_GLOBAL: 1, AMBIGUOUS: 1, UNKNOWN: 1, MANUAL: 1 },
  events_per_task: [{ repo: "Repo", task_ref: "Plan - E.1", count: 8 }], activity_calendar: [{ day: "1980-01-01", minutes: 120, events: 6, commits: 1 }],
  activity_daily: [], effort_per_task: [], punch_card: Array.from({ length: 7 }, () => Array(24).fill(0)), file_coupling: [], file_churn: [],
  wrapped: { days: [], top_task: null, busiest_hour: null, files_touched: 0, commits: 0, top_pair: null },
  identity: { extensions: [], ext_total: 0, sessions: 0, first_event_ts: null, commits: 0 },
  provenance: { commits_observed: 0, commits_pre: 0, slots_total: 0, slots_ai: 0, top_files: [] }, ...extra });
test("actual current KPI declarations retain four primary metrics, capture order, coverage and unavailable states", () => {
  const props = frozen({ stats: stats(), repos: [repo("Clean", { clean: true, count: 0 }), repo(), repo("Offline", { offline: true, count: 999 })],
    uncommitted: [{ mode: "UNKNOWN" }, { mode: "AMBIGUOUS" }, { mode: "B" }], workspaceReady: true, workspaceError: "" });
  const saved = JSON.stringify(props), groups = elements(kpis.KpiRow(props)).filter(n => n.props.role === "group");
  assert.deepEqual(groups.map(n => n.props["aria-label"]), ["Current operational metrics", "Captured activity summary"]);
  const rows = groups.map(group => React.Children.toArray(group.props.children));
  assert.deepEqual(rows.map(row => row.length), [4, 3]); assert.ok(rows.flat().every(n => n.type === kpis.Kpi));
  assert.deepEqual(rows[0].slice(0, 3).map(n => n.props.label), ["need a pick", "uncommitted changes", "repos clean"]);
  assert.deepEqual(rows[1].map(n => n.props.label), ["captured events", "auto-attributed", "busiest task"]);
  const markup = render(kpis.KpiRow, props);
  for (const text of [">2</dd>", ">3</dd>", ">1/2</dd>", "≈ 2h 0m", ">10</dd>", ">70%</dd>", "time 1980-01-01 (UTC)", "2/3 repositories with current Git status"]) assert.ok(markup.includes(text), text);
  assert.doesNotMatch(markup, />999</); assert.equal(JSON.stringify(props), saved);
  for (const workspaceError of ["", "Controlled failure"]) {
    const waiting = render(kpis.KpiRow, { ...props, workspaceReady: false, workspaceError });
    for (const name of ["need a pick", "uncommitted changes", "repos clean"]) {
      assert.match(waiting, new RegExp(`>${name}</dt><dd[^>]*>${workspaceError ? "Unavailable" : "Waiting"}</dd>`));
    }
    assert.match(waiting, /≈ 2h 0m/); assert.match(waiting, />10<\/dd>/);
  }
  assert.match(render(kpis.KpiRow, { ...props, workspaceError: "Controlled refresh failure" }), /last accepted workspace snapshot/);
  const zero = render(kpis.KpiRow, { ...props, stats: stats({ mode_counts: {}, events_per_task: [] }), repos: [], uncommitted: [] });
  assert.match(zero, />No repos<\/dd>/); assert.equal((zero.match(/class="ui-metric"/g) ?? []).length, 6);
});
test("actual whole Overview SSR preserves the Now section and independent waiting/error/zero/retained gates", () => {
  const props = { scope: undefined, tasks: [], uncommitted: [], repos: [], stats: null, statsError: "", onStatus() {}, onRefreshStats() {},
    entryState: { relationship: null, day: "1980-01-01", speed: 1 }, onEntryStateChange() {} };
  const missing = render(OverviewView, props); assert.match(missing, /aria-labelledby="overview-now-heading"/); assert.match(missing, /Loading overview data/);
  assert.doesNotMatch(missing, /Current operational metrics/);
  const empty = frozen(stats({ mode_counts: {}, events_per_task: [] }));
  const zero = render(OverviewView, { ...props, stats: empty }); assert.match(zero, /Current operational metrics|Captured activity summary/);
  assert.match(zero, /No events captured yet/); assert.doesNotMatch(zero, /overview-trends-heading|overview-explore-heading/);
  for (const workspaceError of ["", "Controlled workspace failure"]) {
    const waiting = render(OverviewView, { ...props, stats: empty, workspaceReady: false, workspaceError });
    assert.match(waiting, workspaceError ? /Workspace snapshot unavailable/ : /Waiting for workspace snapshot/);
  }
  const retained = render(OverviewView, { ...props, stats: empty, workspaceError: "Controlled workspace failure", statsError: "Controlled stats failure" });
  assert.match(retained, /last accepted workspace snapshot/); assert.match(retained, /Showing the last successful stats response/);
});
test("actual current Mission selection and Now SSR preserve ambiguity, selected mark and backend evidence semantics", () => {
  const plan = frozen({ repo: '<repo>&"long"'.repeat(12), plan_file: 'temp/Plan/<file>&"long".txt', label: '<plan>&"long"'.repeat(20),
    state: "blocked", task_counts: { total: 8, done: 5, pending: 2, in_progress: 1 }, current_task: { id: "E.1", title: "Inspect evidence" },
    blockers: [], warnings: [], repo_status: { status_valid: true, clean: false, count: 3, branch: "main" } });
  assert.equal(model.spotlightPlan([plan]), plan); assert.equal(model.spotlightPlan([plan, { ...plan, plan_file: "other.txt" }]), null);
  const ambiguous = render(missionSubjects.NowPanel, { plan: null, scope: undefined, summary: { total: 2 }, busy: false });
  assert.match(ambiguous, /does not prove one unique active plan/); assert.doesNotMatch(ambiguous, /border-l-4|Selected plan/);
  const empty = render(missionSubjects.NowPanel, { plan: null, scope: "Empty", summary: { total: 0 }, busy: false }); assert.match(empty, /No tracked plans in Empty/);
  const pending = render(missionSubjects.NowPanel, { plan: null, scope: undefined, summary: null, busy: true }); assert.match(pending, /Loading Mission snapshot/);
  const failed = render(missionSubjects.NowPanel, { plan: null, scope: undefined, summary: null, busy: false }); assert.match(failed, /Refresh Mission to retry/);
  const saved = JSON.stringify(plan), tree = missionSubjects.NowPanel({ plan, scope: plan.repo, summary: { total: 1 }, busy: false });
  assert.equal(tree.type, ui.Surface); assert.equal(tree.props.className, "border-l-4 border-l-sky-400");
  const markup = render(missionSubjects.NowPanel, { plan, scope: plan.repo, summary: { total: 1 }, busy: false });
  for (const text of ["ui-surface", "border-l-4 border-l-sky-400", "Selected plan", "Blocked", "63% of tasks complete", "No blocker reported",
    "not universal correctness", "&lt;plan&gt;&amp;&quot;long&quot;", "&lt;repo&gt;&amp;&quot;long&quot;"]) assert.ok(markup.includes(text), text);
  assert.doesNotMatch(markup, /<plan>|<repo>|<file>/); assert.equal(JSON.stringify(plan), saved);
});

function specificity (selector) {
  const ast = selectors().astSync(selector);
  function nodes (list) {
    const sum = [0, 0, 0];
    for (const node of list) {
      const value = node.type === "id" ? [1, 0, 0] : ["class", "attribute"].includes(node.type) ? [0, 1, 0]
        : node.type === "tag" ? [0, 0, 1] : node.type === "pseudo" && node.value.startsWith("::") ? [0, 0, 1]
        : node.type === "pseudo" && node.value === ":where" ? [0, 0, 0]
        : node.type === "pseudo" && [":not", ":is", ":has"].includes(node.value)
          ? node.nodes.map(branch => nodes(branch.nodes)).sort((a, b) => b[0] - a[0] || b[1] - a[1] || b[2] - a[2])[0]
          : node.type === "pseudo" ? [0, 1, 0] : [0, 0, 0];
      value.forEach((v, i) => { sum[i] += v; });
    }
    return sum;
  }
  assert.equal(ast.nodes.length, 1); return nodes(ast.nodes[0].nodes);
}
const greater = (a, b) => a[0] > b[0] || a[0] === b[0] && (a[1] > b[1] || a[1] === b[1] && a[2] > b[2]);
test("explicit scopes outrank only named presentation companions and retain important/global owners", () => {
  assert.deepEqual(specificity(main), [2, 0, 0]); assert.deepEqual(specificity(primary), [1, 2, 1]);
  const frame = postcss.parse(read("Frontend/src/workspaceCommandFrame.css")), base = postcss.parse(read("Frontend/src/index.css"));
  const oldSelectors = [primary.replace("#root ", ""), actions.replace("#root ", ""),
    nav.replace("#root .app-shell-navigation ", ""), (nav + ":hover:not(:disabled)").replace("#root .app-shell-navigation ", "")];
  for (const [index, old] of oldSelectors.entries()) {
    const rule = one(frame.nodes, n => n.type === "rule" && n.selector === old, "actual preserved frame selector");
    assert.ok(greater(specificity([primary, actions, nav, nav + ":hover:not(:disabled)"][index]), specificity(rule.selector)));
  }
  const first = now.replace(main + " ", "") + ' [role="group"][aria-label="Current operational metrics"] > .ui-metric:first-child';
  const firstRule = one(base.nodes, n => n.type === "rule" && n.selector === first, "first metric emphasis companion");
  assert.ok(firstRule.nodes.some(n => n.prop === "background" && n.value === "rgb(var(--ui-primary) / 0.12)"));
  assert.ok(firstRule.nodes.some(n => n.prop === "border-color" && n.value === "rgb(var(--ui-focus))"));
  assert.ok(RULES.every(([, , declarations]) => declarations.every(([name]) => !["order", "position", "overflow", "height", "width", "color", "font-family", "opacity", "box-shadow", "min-height"].includes(name))));
  const coarse = one(base.nodes, n => n.type === "atrule" && n.params === "(pointer: coarse)", "actual coarse owner");
  const control = coarse.nodes.find(n => n.type === "rule" && n.selector.includes(".ui-control"));
  for (const name of ["min-width", "min-height"]) {
    const declaration = one(control.nodes, n => n.type === "decl" && n.prop === name, name); assert.equal(declaration.value, "44px"); assert.equal(declaration.important, true);
  }
  const header = one(base.nodes, n => n.type === "rule" && n.selector === ".app-shell-header", "safe header owner");
  for (const prop of ["padding-right", "padding-left"]) assert.ok(header.nodes.some(n => n.prop === prop && n.value.includes("var(--ui-safe-")));
  assert.ok(RULES.every(([, selector]) => !selector.includes(":focus") && !selector.includes(":active") && !selector.includes(".ui-safe-header")));
  // AST/source/SSR and cascade arithmetic are not native geometry, keyboard, AT or aesthetic acceptance.
});
