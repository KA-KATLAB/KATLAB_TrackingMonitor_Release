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
import { canonicalPrintedText } from "./helpers/printed_source.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const frontend = resolve(root, "Frontend"), require = createRequire(resolve(frontend, "package.json"));
const ts = require("typescript"), React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const read = name => readFileSync(resolve(root, name), "utf8");
const sha = value => createHash("sha256").update(value).digest("hex");
const lf = value => value.replace(/\r\n/g, "\n");
const source = read("Frontend/src/identityCard.tsx");
const OLD_RAW = "af472f4a36335396a649ac42e387a420b4ce400373b53e64ff8533683ff7b388";
const OLD_LF = "3de068c7842464a678c04c93a91ffd2412da7cbf8a419a15383ce85b4537b767";
const NEW_RAW = "666b10989172870fa2287add2c9497b7aed0275d740a999d05d97491f3d0b663";
const NEW_LF = "0b5b65c35b679ace0e65c57a26f2c79f1e0fd746d3194e3f7e449a16b67b2dba";
const ORIGINAL_AST = "6e4eec54636b17588816c8bf1afff057acee6f66abc648eb8615f0b95d1ffee8";
const CLASSES = [
  "min-w-0 space-y-4",
  "!mb-0",
  "py-6 px-4 rounded-panel border border-ui-border bg-ui-surface text-base text-ui-muted",
  "min-w-0 rounded-panel border border-ui-border bg-ui-surface p-4",
  "mb-3 text-base font-semibold leading-6 text-ui-muted",
  "mt-4 break-words rounded-panel border border-ui-border bg-ui-surface p-4 text-base leading-6 text-ui-muted [overflow-wrap:anywhere]",
];
// Independent approved windows. Restored source is preservation data, never executed.
const WINDOWS = [
  ['  return (\n    <div className="min-w-0">', '  return (\n    <div className="' + CLASSES[0] + '">'],
  ['description={scope ?? "All repos"} />', 'description={scope ?? "All repos"} className="' + CLASSES[1] + '" />'],
  ['className="py-6 text-base text-ui-muted"', 'className="' + CLASSES[2] + '"'],
  ['        <figure>', '        <figure className="' + CLASSES[3] + '">'],
  ['className="mb-3 text-xs text-ui-muted"', 'className="' + CLASSES[4] + '"'],
  ['className="mt-4 break-words text-xs leading-relaxed text-ui-muted"', 'className="' + CLASSES[5] + '"'],
];
const PINS = [
  ["Frontend/src/identityData.ts","cf426cbfe8fd971c66655a9c5eb93df1f4b0ebbaf4dd29958bb6a92842854aff","cf426cbfe8fd971c66655a9c5eb93df1f4b0ebbaf4dd29958bb6a92842854aff"],
  ["Frontend/src/format.ts","4c7f1cb040c38a5ef75787c6f7325db6fc162a6890df0fb693e916aa62d8c87f","4c7f1cb040c38a5ef75787c6f7325db6fc162a6890df0fb693e916aa62d8c87f"],
  ["Frontend/src/OverviewView.tsx","98f77fe8a3f97033f5a2084439f8da6dcb203547d7b1f8409aca11892598d214","9d42a6c52828018f6bb0ab7f3f668e0040e0a190de144517715460f93b84410a"],
  ["Frontend/src/App.tsx","945c8879e94b5d7a8410d2a143ed2e127e2653dd1a123d2d8b4cd306758a6f3e","c7c568b346c7ddf00d86b93325b97854e59f3f625f6fd916b056e85ccf069b1a"],
  ["Frontend/src/ui.tsx","b5650b9e2a3529ff1ca033ed077d7b806f0cc9341c9733b4b3a52c107ab99974","e1c2ad05398cf771ee17ba576b7feecf03829459379b9e02e35c58aea5004c46"],
  ["Frontend/src/index.css","9371bc04cba0b62e8a8e5e3b4a9251deea9273be58f4b9735982e0649527ba81","788436e9def1e7109fe98d4bfa5e0add49a5f0ca301b17416279c03f18ede0f5"],
  ["Frontend/src/theme.ts","7c39c4ea3bf479216edc7776fac113f0d05bfeaba3d411ca8ba1ea1fc2ba6022","03ed88e814b0a12af207f462819731127f2346def58af01259ccc36c0556b286"],
  ["Frontend/src/charts.ts","121d9c4ff6d9a1d6befa7b19d19f2eecb44820f08728e922b9c3a8d630dfca1b","2c9291d1dbe47863d5ecad800ef5427ad855ec257e19b28ebc7220a2dfe29a53"],
  ["Frontend/src/api.ts","b21da4367bb2c9007a62b9ed097fd943286ffb3c863de23ee565acd01b2323a0","2bdccf5c79ccf5a72f9696df00a924ff918a82c6cf8e4f15ba2a69b39e7cd2b8"],
  ["Frontend/tailwind.config.js","cdb058b068e26db24bcce71d68939611bc4ce651d1bfbaa49907dbb8ffa5ed76","cdb058b068e26db24bcce71d68939611bc4ce651d1bfbaa49907dbb8ffa5ed76"],
  ["Frontend/src/reveal.ts","f6e88e85bd5690333845443786f3ee6b7e51eafd2773e510b2296f750ffc65df","f6e88e85bd5690333845443786f3ee6b7e51eafd2773e510b2296f750ffc65df"],
  ["Tests/helpers/printed_source.mjs","8061b014a52af239d9b37345941f68b0b41c1cb7e0b5d402353bf0dcfa84217d","8061b014a52af239d9b37345941f68b0b41c1cb7e0b5d402353bf0dcfa84217d"],
  ["Tests/test_read_surfaces.mjs","264aefcfbc7ff84d37c449c6c6817e8c1b86e5aa189d0e87075e897f25fc7cfa","b270f7191446f0281040d53625e43603c25c566e5b67cc283d78914113d9574c"],
  ["Tests/test_chronicle_reader_canvas.mjs","d3f108fc0358a4de6ba1e51dd34deefebf9fd27a9fa696daf59c91d40b1d040b","d3f108fc0358a4de6ba1e51dd34deefebf9fd27a9fa696daf59c91d40b1d040b"],
  ["Tests/test_momentum_comparison_deck.mjs","e7ea2bc5ced58860057a87c37b62756b4f018dcd4d703d0efaf1ae3c2a5ef5d9","e7ea2bc5ced58860057a87c37b62756b4f018dcd4d703d0efaf1ae3c2a5ef5d9"],
  ["Tests/test_repository_scope_picker.mjs","e895bdbd48be23b8cd43d4bb2d864b66689a8da45ee3a976c974a11bdd1c8a3d","e895bdbd48be23b8cd43d4bb2d864b66689a8da45ee3a976c974a11bdd1c8a3d"],
  ["Tests/test_personal_records_showcase.mjs","7c02d2daffa142b1a38722a18ff6067ac7739af2325237df5eaf28fbe070d537","7c02d2daffa142b1a38722a18ff6067ac7739af2325237df5eaf28fbe070d537"],
  ["Tests/test_achievement_gallery.mjs","566b91ea834d43735f01aab2817f6129c10496d1d2772fcd8151d0652739458c","566b91ea834d43735f01aab2817f6129c10496d1d2772fcd8151d0652739458c"],
  ["Tests/test_provenance_evidence_desk.mjs","67a772a9db45416cdca44e68c66c50c36bb13484566e351e3c56a0325ebe82c2","67a772a9db45416cdca44e68c66c50c36bb13484566e351e3c56a0325ebe82c2"],
  ["Tests/test_operational_views.mjs","1dc324f2fba75698b916ce4f840adf97c3abddf78bf0d6b618b994f3baaef816","0ffce73f13e7731b0ce18bf563a3273facf3aab4bfc027ab921f04cc5736c2b3"],
  ["Tests/test_overview_operations_deck.mjs","4c4b2fb8ed83321a1c696e99b102b3611a5f81902967b070a934cd43126421b9","4c4b2fb8ed83321a1c696e99b102b3611a5f81902967b070a934cd43126421b9"],
  ["Tests/test_nonfinite_duration.mjs","d795d6d33bbd05a17c99e31242663922eec61c3767f2a9506bbcc2ee0eefc611","d795d6d33bbd05a17c99e31242663922eec61c3767f2a9506bbcc2ee0eefc611"],
  ["Backend/app/db.py","283527eb00d24dcac0b1832650499cf189412aeedaf7d868966db7eae2a72989","6bd92fdffef9c01a7bd175ffded05b2e57cfd7824b8f83c1494496331babd033"],
  ["Backend/app/api/routes.py","4dcde41c291adbec3c63a519c09f2c54e2525bc3f81c07d107f8dc8407e097cd","936e31ed1a8bd223c29339e53f5de87b95a5948651e962d19bb9e8833adf62d9"],
  ["Frontend/package.json","b131be7e90ba2500b01371e594e10c482b94cf651ab425ddf7efaea76b759b9d","541a787d69fa512a53de01b53240e2e94ac22f068da882e0c2496f68ee5bf1a1"],
  ["Frontend/package-lock.json","0c39bf19779991e4565e00845a061fc954afdfe988d9026c6c356957e2b02258","d5ccfda11d2d07b4a707b18aca87b866a135182a3bd33ce2380c21730809ce75"],
  ["Frontend/tsconfig.json","97997252d286ecf7a8a4b12a51ac2fdd9199f3b9bf5e14e8d4f7d4e5e60d3f3f","97997252d286ecf7a8a4b12a51ac2fdd9199f3b9bf5e14e8d4f7d4e5e60d3f3f"],
  ["Frontend/vite.config.ts","6f25836874cc3ca4c97781dd0140ab1e7fee796b3b0c67a67ffdb8600e67cd6b","4631f5c7380fa909b5b361bf8eb7fdac29a665144ca260f9ac30be30ce83f107"],
  ["Backend/requirements.txt","f750d19859ca5621eea836592d2038857f73e8857bcace96752ce6dadf004ea3","f24979c56dd6d095f18541462485fb62229cfddf0fa8784d7c7dd9fbb535d0b5"],
  ["Scripts/Chronicle/requirements.txt","9d91436f670aac600f39beb184f7278774dc94e470dfca37f092bb0e3d461722","562f66ed699de7d73e464c6be1a0938b6b19a8c2f69fe4b955209f0981986a2d"],
];

function ending (value) {
  assert.ok(!value.startsWith("\uFEFF") && !value.includes("\0"), "no BOM/NUL");
  assert.ok(!value.replace(/\r\n/g, "").includes("\r"), "no bare CR");
  const eol = value.includes("\r\n") ? "\r\n" : "\n";
  if (eol === "\r\n") assert.ok(!value.replace(/\r\n/g, "").includes("\n"), "uniform CRLF");
  assert.ok(value.endsWith(eol) && !value.endsWith(eol + eol), "single EOF");
  return eol;
}
function parse (text) {
  const file = ts.createSourceFile("identityCard.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  assert.equal(file.parseDiagnostics.length, 0, "valid current TSX");
  return file;
}
const children = node => node.children.filter(child => !ts.isJsxText(child));
function classValue (node, file) {
  const opening = ts.isJsxElement(node) ? node.openingElement : node;
  const attrs = opening.attributes.properties.filter(attr => ts.isJsxAttribute(attr)
    && attr.name.getText(file) === "className");
  assert.equal(attrs.length, 1); assert.ok(ts.isStringLiteral(attrs[0].initializer));
  return attrs[0].initializer.text;
}
function ownedSites (file) {
  const functions = file.statements.filter(ts.isFunctionDeclaration);
  assert.deepEqual(functions.map(fn => fn.name.text), ["IdentityCard"]);
  const fn = functions[0], returned = fn.body.statements.at(-1);
  assert.ok(ts.isReturnStatement(returned) && ts.isParenthesizedExpression(returned.expression));
  const element = returned.expression.expression;
  assert.ok(ts.isJsxElement(element) && element.openingElement.tagName.getText(file) === "div");
  const [heading, conditional, facts] = children(element);
  assert.equal(children(element).length, 3);
  assert.ok(ts.isJsxSelfClosingElement(heading) && heading.tagName.getText(file) === "SectionHeading");
  assert.ok(ts.isJsxExpression(conditional) && ts.isConditionalExpression(conditional.expression));
  assert.ok(ts.isParenthesizedExpression(conditional.expression.whenTrue));
  assert.ok(ts.isParenthesizedExpression(conditional.expression.whenFalse));
  const empty = conditional.expression.whenTrue.expression, figure = conditional.expression.whenFalse.expression;
  assert.ok(ts.isJsxElement(empty) && empty.openingElement.tagName.getText(file) === "p");
  assert.ok(ts.isJsxElement(figure) && figure.openingElement.tagName.getText(file) === "figure");
  const caption = children(figure)[0];
  assert.ok(ts.isJsxElement(caption) && caption.openingElement.tagName.getText(file) === "figcaption");
  assert.ok(ts.isJsxElement(facts) && facts.openingElement.tagName.getText(file) === "p");
  const sites = [element, heading, empty, figure, caption, facts];
  assert.deepEqual(sites.map(node => classValue(node, file)), CLASSES);
  return sites;
}
function inverse (raw) {
  const eol = ending(raw), text = lf(raw), file = parse(text);
  ownedSites(file);
  let restored = text;
  for (const [before, after] of WINDOWS) {
    assert.equal(restored.split(after).length - 1, 1, "one actual owned window: " + after);
    restored = restored.replace(after, before);
  }
  return eol === "\r\n" ? restored.replace(/\n/g, "\r\n") : restored;
}
function approved (raw) {
  const eol = ending(raw);
  assert.equal(sha(raw), eol === "\r\n" ? NEW_RAW : NEW_LF, "complete current bytes");
  assert.equal(sha(lf(raw)), NEW_LF);
  const restored = inverse(raw);
  assert.equal(sha(restored), eol === "\r\n" ? OLD_RAW : OLD_LF, "complete original bytes");
  assert.equal(sha(lf(restored)), OLD_LF);
  return restored;
}
function withoutClasses (raw) {
  const file = parse(raw), printer = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed });
  const transformed = ts.transform(file, [(context) => (entry) => ts.visitNode(entry, function visit(node) {
    if (ts.isJsxAttributes(node)) return ts.factory.updateJsxAttributes(node,
      node.properties.filter(attr => !ts.isJsxAttribute(attr) || attr.name.getText(file) !== "className"));
    return ts.visitEachChild(node, visit, context);
  })]);
  try { return sha(canonicalPrintedText(printer.printFile(transformed.transformed[0]))); }
  finally { transformed.dispose(); }
}
function deepFreeze (value) {
  if (value && typeof value === "object") { Object.values(value).forEach(deepFreeze); Object.freeze(value); }
  return value;
}
const elements = node => Array.isArray(node) ? node.flatMap(elements)
  : React.isValidElement(node) ? [node, ...elements(node.props.children)] : [];
const plain = node => Array.isArray(node) ? node.map(plain).join("")
  : React.isValidElement(node) ? plain(node.props.children)
    : node === null || node === undefined || typeof node === "boolean" ? "" : String(node);
const escape = value => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
const baseIdentity = { extensions: [], ext_total: 0, sessions: 0, first_event_ts: null, commits: 0 };

test("six exact class owners preserve full original RAW/LF and unchanged class-stripped AST", () => {
  assert.equal(Buffer.byteLength(source), 4674); assert.equal(ending(source), "\r\n");
  assert.equal(source.split("\r\n").length - 1, 94);
  for (const variant of [lf(source), lf(source).replace(/\n/g, "\r\n")]) {
    approved(variant); assert.equal(withoutClasses(variant), ORIGINAL_AST);
  }
  const utilities = [...new Set(CLASSES.flatMap(value => value.split(" ")))];
  assert.equal(utilities.length, 18); assert.ok(utilities.includes("!mb-0"));
  assert.ok(utilities.includes("[overflow-wrap:anywhere]"));
  assert.ok(!utilities.some(value => /^(?:sm:|md:|lg:|xl:|h-|overflow-[xy]-)/.test(value)));
});

test("inverse rejects malformed, duplicated, moved, commented and partial owners", () => {
  const text = lf(source);
  for (const [before, after] of WINDOWS) {
    assert.throws(() => inverse(text.replace(after, before)), "missing actual AST/window site");
    assert.throws(() => inverse(text + "// " + after + "\n"), "comment cannot duplicate an actual window");
    assert.throws(() => approved(text.replace(after, before)), "missing window");
    assert.throws(() => approved(text + "// " + after + "\n"), "duplicate/comment window");
    assert.throws(() => approved(text.replace(after, after.replace("className", "classNames"))), "altered attribute");
  }
  for (const variant of ["\uFEFF" + text, text + "\0", text.trimEnd(), text + "\n",
    text.replace("\n", "\r"), source.replace("\r\n", "\n"), text.replace("\n", "\r\n"),
    text.replace("    <div className=", "    <section className="),
    text.replace('<figure className="' + CLASSES[3] + '">', '<aside className="' + CLASSES[3] + '">'),
    text.replace("description={scope", "description={/* owner */scope"),
    text.replace("  return (\n", "  return (\n    <div>\n"),
    text.replace('className="' + CLASSES[4] + '"', 'className={"' + CLASSES[4] + '"}'),
    text.replace("export function IdentityCard", "export function OtherCard"),
    text.replace("  return (\n", "  return /* moved */ (\n"),
    text.replace("<figcaption", "<figcaption data-extra=\"true\""),
    text.replace('from "./identityData"', 'from "./differentData"')]) {
    assert.throws(() => approved(variant));
  }
});

test("inverse retains unrelated valid changes instead of swallowing them", () => {
  for (const [before, after] of [["const R = 42", "const R = 43"],
    ["let acc = 0", "let acc = 1"], ["identity.sessions === 1", "identity.sessions === 2"],
    ["No captures classified yet.", "No captures yet."],
    ["// plan edit).", "// changed outside owned windows."],
    ["import type { StatsData }", "// Outside ownership\nimport type { StatsData }"]]) {
    assert.ok(lf(source).includes(before), "real outside-window mutation site");
    const changed = lf(source).replace(before, after), restored = inverse(changed);
    assert.ok(restored.includes(after)); assert.notEqual(sha(restored), OLD_LF);
    assert.throws(() => approved(changed));
  }
});

test("all thirty coupled source, old-suite and dependency RAW/LF pins remain exact", () => {
  assert.equal(PINS.length, 30);
  for (const [name, raw, normalized] of PINS) {
    const bytes = deskPreservation(name, mastheadPreservation(name, cityBriefPreservation(name, purposeNavigationPreservation(name, readFileSync(resolve(root, name))))));
    assert.equal(sha(bytes), raw, name + " RAW");
    assert.equal(sha(lf(bytes.toString("utf8"))), normalized, name + " LF");
  }
});

test("actual current IdentityCard SSR retains data semantics and its real heading", { timeout: 30_000 }, async (t) => {
  approved(source);
  const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
  const vite = await createServer({ root: frontend, server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom", optimizeDeps: { noDiscovery: true, entries: [] } });
  try {
    const { IdentityCard } = await vite.ssrLoadModule("/src/identityCard.tsx");
    const { buildIdentityData, IDENTITY_PALETTE, IDENTITY_OTHER_COLOR } = await vite.ssrLoadModule("/src/identityData.ts");
    const { SectionHeading } = await vite.ssrLoadModule("/src/ui.tsx");
    const { fmtMinutes } = await vite.ssrLoadModule("/src/format.ts");
    function actual (identity, calendar = [], scope) {
      const props = deepFreeze({ identity, calendar, scope }), before = structuredClone(props);
      const tree = IdentityCard(props), html = renderToStaticMarkup(tree), all = elements(tree);
      assert.deepEqual(props, before, "all input values preserved including nonfinite numbers");
      assert.equal(tree.type, "div"); assert.equal(tree.props.className, CLASSES[0]);
      const heading = all.filter(node => node.type === SectionHeading);
      assert.equal(heading.length, 1); assert.equal(heading[0].props.level, 4);
      assert.equal(heading[0].props.title, "Repo identity"); assert.equal(heading[0].props.description, scope ?? "All repos");
      assert.equal(heading[0].props.className, CLASSES[1]);
      assert.match(html, /<h4[^>]*>Repo identity<\/h4>/);
      const facts = all.filter(node => node.type === "p" && node.props.className === CLASSES[5]);
      assert.equal(facts.length, 1); assert.equal(tree.props.children.at(-1), facts[0]);
      assert.doesNotMatch(html, /<button|<a\b|aria-live|role="status"/);
      return { tree, html, all, facts: plain(facts[0]) };
    }

    await t.test("zero distribution preserves facts for plan-only activity and all scope variants", () => {
      for (const scope of [undefined, "", "EA_Dev", '<repo & "quoted">'.repeat(20)]) {
        const identity = { ...baseIdentity, sessions: 2, commits: 3, first_event_ts: "2026-10-01T12:00:00Z" };
        const { html, all, facts } = actual(identity, [], scope);
        assert.match(html, /No captures classified yet\./); assert.doesNotMatch(html, /<figure|<svg|<circle/);
        assert.ok(all.some(node => node.type === "p" && node.props.className === CLASSES[2]));
        assert.ok(facts.startsWith("2 sessions")); assert.ok(facts.includes("3 commits (all-time)"));
        if (scope !== undefined && scope !== "") assert.ok(html.includes(escape(scope)));
        if (scope === "") assert.doesNotMatch(html, /All repos/);
      }
      assert.equal(actual({ ...baseIdentity }).facts, "0 sessions \u00b7 0 commits (all-time)");
      assert.equal(actual({ ...baseIdentity, sessions: 1, commits: 1 }).facts, "1 session \u00b7 1 commit (all-time)");
    });

    await t.test("five versus six resulting slices, remainder, labels, colors and geometry remain real", () => {
      const fixtures = [
        { extensions: [{ ext: "", count: 2 }], ext_total: 2 },
        { extensions: [{ ext: "other", count: 3 }, { ext: "other", count: 2 }], ext_total: 6 },
        { extensions: Array.from({ length: 4 }, (_, i) => ({ ext: "x" + i, count: i + 1 })), ext_total: 11 },
        { extensions: Array.from({ length: 5 }, (_, i) => ({ ext: "x" + i, count: i + 1 })), ext_total: 16 },
        { extensions: Array.from({ length: 8 }, (_, i) => ({ ext: "x" + i, count: i + 1 })), ext_total: 37 },
        { extensions: [{ ext: "zero", count: 0 }, { ext: "negative", count: -1 }, { ext: "real", count: 4 }], ext_total: 4 },
        { extensions: Array.from({ length: 6 }, (_, i) => ({ ext: "rare" + i, count: 1 })), ext_total: 1000 },
      ];
      for (const fixture of fixtures) {
        const identity = { ...baseIdentity, ...fixture }, expected = buildIdentityData(deepFreeze(identity));
        const { all, html } = actual(identity), labels = all.filter(node => node.type === "span" && node.props.className === "break-all font-mono");
        assert.deepEqual(labels.map(plain), expected.slices.map(row => row.label));
        const rows = all.filter(node => node.type === "div" && node.props.className === "flex min-w-0 flex-wrap items-center gap-1.5");
        assert.deepEqual(rows.map(node => node.key), expected.slices.map(row => row.key));
        const counts = all.filter(node => node.type === "span" && node.props.className === "text-xs tabular-nums text-ui-muted");
        assert.deepEqual(counts.map(node => plain(node).trim()), expected.slices.map(row =>
          "\u00b7 " + row.count.toLocaleString("en-US") + " (" + Math.round(row.count / expected.total * 100) + "%)"));
        const dots = all.filter(node => node.type === "span" && node.props.className === "inline-block h-2 w-2 shrink-0 rounded-sm");
        assert.deepEqual(dots.map(node => node.props.style.backgroundColor), expected.slices.map(row => row.color));
        expected.slices.forEach(row => assert.equal(row.color, row.key.includes('"remainder"')
          ? IDENTITY_OTHER_COLOR : IDENTITY_PALETTE[row.sourceOrdinal % IDENTITY_PALETTE.length]));
        const figure = all.find(node => node.type === "figure"), caption = all.find(node => node.type === "figcaption");
        assert.equal(figure.props.className, CLASSES[3]); assert.equal(caption.props.className, CLASSES[4]);
        assert.ok(plain(caption).includes(expected.presentation === "bar" ? "horizontal bars" : "donut"));
        assert.equal(expected.presentation, expected.slices.length > 5 ? "bar" : "donut");
        if (expected.presentation === "donut") {
          const svg = all.find(node => node.type === "svg"), circles = all.filter(node => node.type === "circle");
          assert.equal(svg.props.width, 110); assert.equal(svg.props.height, 110); assert.equal(svg.props.viewBox, "0 0 110 110");
          assert.equal(svg.props["aria-hidden"], "true"); assert.equal(svg.props.focusable, "false");
          assert.equal(circles.length, expected.slices.length); let offset = 0;
          circles.forEach((circle, i) => {
            const row = expected.slices[i], length = row.count / expected.total * (2 * Math.PI * 42);
            assert.equal(circle.key, row.key); assert.equal(circle.props.cx, 55); assert.equal(circle.props.cy, 55);
            assert.equal(circle.props.r, 42); assert.equal(circle.props.strokeWidth, 16); assert.equal(circle.props.fill, "none");
            assert.equal(circle.props.stroke, row.color); assert.equal(circle.props.transform, "rotate(-90 55 55)");
            assert.equal(circle.props.strokeDasharray, String(length) + " " + String(2 * Math.PI * 42 - length));
            assert.equal(circle.props.strokeDashoffset, -offset); offset += length;
          });
        } else {
          assert.doesNotMatch(html, /<svg/);
          const bars = all.filter(node => node.type === "div" && node.props.className === "h-full rounded");
          assert.equal(bars.length, expected.slices.length);
          bars.forEach((bar, i) => assert.deepEqual(bar.props.style, {
            width: String(Math.max(1, expected.slices[i].count / expected.total * 100)) + "%", backgroundColor: expected.slices[i].color,
          }));
        }
      }
    });

    await t.test("effort is the supplied UTC-calendar sum with retained zero/nonfinite policy", () => {
      for (const minutes of [0, -1, 5, 60, 65, NaN, Infinity, -Infinity]) {
        const calendar = [{ day: "2020-01-01", events: 1, commits: 0, minutes }];
        const { facts } = actual({ ...baseIdentity, sessions: 1, commits: 2 }, calendar, "retained");
        assert.equal(facts.includes(" effort (365d, UTC)"), minutes > 0);
        if (minutes > 0) assert.ok(facts.endsWith(fmtMinutes(minutes) + " effort (365d, UTC)"));
      }
      const calendar = [{ day: "2020-01-01", events: 0, commits: 0, minutes: 20 },
        { day: "2020-01-02", events: 0, commits: 0, minutes: 45 }];
      assert.ok(actual({ ...baseIdentity }, calendar).facts.endsWith("\u2248 1h 5m effort (365d, UTC)"));
    });

    await t.test("first capture remains local-day formatting independent of UTC effort", () => {
      const previous = process.env.TZ;
      try {
        for (const [zone, day] of [["UTC", "2026-10-01"], ["Asia/Tokyo", "2026-10-02"]]) {
          process.env.TZ = zone;
          const identity = { ...baseIdentity, first_event_ts: "2026-10-01T23:30:00Z" };
          const { facts } = actual(identity, [{ day: "2026-10-01", events: 1, commits: 0, minutes: 5 }]);
          assert.ok(facts.includes("first capture " + day)); assert.ok(facts.endsWith("\u2248 5m effort (365d, UTC)"));
        }
        assert.ok(actual({ ...baseIdentity, first_event_ts: "invalid-timestamp" }).facts.includes("first capture invalid-ti"));
      } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
    });

    await t.test("long escaped scope/extensions retain complete text, count and ordered input", () => {
      const label = '<unsafe & "extension">' + "long".repeat(80), scope = '<scope & "name">'.repeat(40);
      const identity = { ...baseIdentity, extensions: [{ ext: label, count: 1234567 }], ext_total: 1234567,
        sessions: 1234567, commits: 7654321 };
      const { html, facts } = actual(identity, [], scope);
      assert.ok(html.includes(escape(label))); assert.ok(html.includes(escape(scope)));
      assert.doesNotMatch(html, /<unsafe|<scope/); assert.ok(facts.includes("1,234,567 sessions"));
      assert.ok(facts.includes("7,654,321 commits (all-time)"));
      assert.match(html, /1,234,567 \(100%\)/); assert.ok(html.includes("overflow-wrap:anywhere"));
    });
  } finally { await vite.close(); }
});
