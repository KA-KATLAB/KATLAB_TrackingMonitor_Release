import { deskPreservation } from "./helpers/changesReviewLanes.mjs";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(resolve(root, "Frontend/package.json"));
const postcss = require("postcss"), selectors = require("postcss-selector-parser");
const python = resolve(root, ".venv/Scripts/python.exe");
const read = path => readFileSync(resolve(root, path), "utf8");
const sha = value => createHash("sha256").update(value).digest("hex");
const lf = value => value.replace(/\r\n/g, "\n");
const source = read("Scripts/Chronicle/pages.py");
const ORIGINAL_RAW = "14c8c39e86960111a4ef967f09eceba8ca0b8da549240232a23f909cd69721ed";
const ORIGINAL_LF = "6a30eadfd17d0b5ab963abea8f95fddbb80b4d7f948858d8bdfde0b7fd4c7c11";
const REVIEWED_RAW = "b44afb03c5af17b083e17ad5e0b24b1d827e66f32ead3b47db147685a0da2858";
const REVIEWED_LF = "451b0a4b356e5ce46b4403b396146cd9debce50492b2e6a3de708f619982c06a";
const OLD_CSS = "faf78b74172a30e0ff1bbc2a1671b45b600a7657f19b293abf311f4e34a6670d";
const NEW_CSS = "4772af3c09552170bb55f93fdd4f172f8f7fdcf5a6c007592371c1f8f519260b";
const BLOCK_HASH = "55b47f06289eb916f52680748bc8cc070a2e916213cc4a80bc1bf0b0c9a22c79";
const FOOTER = "\n---\n\n*KATLAB Chronicle*\n";
const MAIN = '[role="main"]';
const PROSE = '[role="main"] > p, [role="main"] > ul, [role="main"] > ol, [role="main"] > blockquote';
const BLOCK = [
  "/* One reader canvas with a bounded direct-prose measure. */",
  MAIN + " {",
  "  padding: 24px;",
  "  border: 1px solid var(--k-border);",
  "  border-radius: 8px;",
  "  background-color: var(--k-panel);",
  "}",
  PROSE + " {",
  "  max-width: 72ch;",
  "}",
  "@media (max-width: 640px) {",
  "  " + MAIN + " { padding: 16px; }",
  "}", "", "",
].join("\n");
const MOTION_END = [
  "@media (prefers-reduced-motion: reduce) {",
  "  html { scroll-behavior: auto; }",
  "  *, *::before, *::after {",
  "    animation-duration: 0.01ms !important; animation-iteration-count: 1 !important;",
  "    transition-duration: 0.01ms !important; scroll-behavior: auto !important;",
  "  }", "}", "", "",
].join("\n");
const PINS = [
  ["Frontend/src/chronicleView.tsx", "3130fff181f79401e7c90d486a48ba7a91a63c9dab80eaff990a587470aa75c5", "0ec47d759e070a566b13f868bcf10775fc89dfe478cda5eddd731d0f1550856b"],
  ["Frontend/src/chronicleProbe.ts", "46251107af8daacc252c0db78df9f5c7212748b13f43e7f22fc98683cfca842a", "278de3c0b6aae473e4ee2bfc4e1853883190f0594af208e584f22b001ce56379"],
  ["Frontend/src/App.tsx", "945c8879e94b5d7a8410d2a143ed2e127e2653dd1a123d2d8b4cd306758a6f3e", "c7c568b346c7ddf00d86b93325b97854e59f3f625f6fd916b056e85ccf069b1a"],
  ["Frontend/src/ui.tsx", "b5650b9e2a3529ff1ca033ed077d7b806f0cc9341c9733b4b3a52c107ab99974", "e1c2ad05398cf771ee17ba576b7feecf03829459379b9e02e35c58aea5004c46"],
  ["Frontend/src/index.css", "9371bc04cba0b62e8a8e5e3b4a9251deea9273be58f4b9735982e0649527ba81", "788436e9def1e7109fe98d4bfa5e0add49a5f0ca301b17416279c03f18ede0f5"],
  ["Frontend/src/main.tsx", "c0b126cdce533a00247006a8efbb72c51b073c638a5764e0cb54d180e5f3f588", "c0b126cdce533a00247006a8efbb72c51b073c638a5764e0cb54d180e5f3f588"],
  ["Tests/test_chronicle_generation.py", "b848a7e2c7ff676a45f8350890b5c0c58268b544af48df6bed037ba8b995d92e", "1f4a755cc0087c5f360409c05b42a0b84e81d1ccc318a3552f667635e07b48d5"],
  ["Tests/test_chronicle_probe.mjs", "9f4e4ecd9e2432f968022d820ec5fe8204eb5fbe549231a34da37df5779bce4f", "fef964c2e396c4e25c8aa4efa1fc630ddb37f9800e440d9291cf8170d5e32de7"],
  ["Tests/test_read_surfaces.mjs", "264aefcfbc7ff84d37c449c6c6817e8c1b86e5aa189d0e87075e897f25fc7cfa", "b270f7191446f0281040d53625e43603c25c566e5b67cc283d78914113d9574c"],
  ["Tests/test_app_version.mjs", "d86fa77843bdf4f552fc7e97bec8f5ecea839f98080451325bef4cd81674d6c3", "c5cc037e582d0ff5066d959b76ccb804e58c452cfcb1f92c23a0fba8786b15f5"],
  ["Tests/test_app_shell.mjs", "cfb3885d0035b91530fc6e397920036b0dc85e7b89876aaeb03029ddb47e40d0", "8d92c9461c4c164313c2f36a27381462a9ec47f907c7c050a2037c09cd388fd6"],
  ["Tests/test_ui_foundations.mjs", "b3a7573802f06102be18bac0472dcfe5794b304aa3f99634d7acf1d6cc6080e6", "37197cef2e020275d25965112e90c030da40500a0451ee67c22bd559876055d6"],
  ["Tests/test_repository_scope_picker.mjs", "e895bdbd48be23b8cd43d4bb2d864b66689a8da45ee3a976c974a11bdd1c8a3d", "e895bdbd48be23b8cd43d4bb2d864b66689a8da45ee3a976c974a11bdd1c8a3d"],
  ["Scripts/Chronicle/generate.py", "84bad82cae964d66a14a874fa79b27b6548a3c19b11f2e730ee444c4f61534e9", "06afd185980b9dcebbd165a7f82a73e19f2271a6728754d0af6ac2bb1ba9879d"],
  ["Scripts/Chronicle/runtime.py", "2e1bd56435c2e52c0681d320a5d8b23405c7575b1d1296748b2af796f9bbbbfd", "78fe39b021cb775a23b96cd3da8ea514f3fd2973052a6f415a8d89f0e5b5e372"],
  ["Scripts/Chronicle/safe_io.py", "d34c8103c65af65c0c611df40f762677684a4a20765b8b75e24fa1a0a6fb6b42", "9ac8271967447a23579741640fe0c7e86d36243547dcddbeb6bca16f8a7c3d17"],
  ["Frontend/package.json", "b131be7e90ba2500b01371e594e10c482b94cf651ab425ddf7efaea76b759b9d", "541a787d69fa512a53de01b53240e2e94ac22f068da882e0c2496f68ee5bf1a1"],
  ["Frontend/package-lock.json", "0c39bf19779991e4565e00845a061fc954afdfe988d9026c6c356957e2b02258", "d5ccfda11d2d07b4a707b18aca87b866a135182a3bd33ce2380c21730809ce75"],
  ["Frontend/tsconfig.json", "97997252d286ecf7a8a4b12a51ac2fdd9199f3b9bf5e14e8d4f7d4e5e60d3f3f", "97997252d286ecf7a8a4b12a51ac2fdd9199f3b9bf5e14e8d4f7d4e5e60d3f3f"],
  ["Frontend/vite.config.ts", "6f25836874cc3ca4c97781dd0140ab1e7fee796b3b0c67a67ffdb8600e67cd6b", "4631f5c7380fa909b5b361bf8eb7fdac29a665144ca260f9ac30be30ce83f107"],
  ["Backend/requirements.txt", "f750d19859ca5621eea836592d2038857f73e8857bcace96752ce6dadf004ea3", "f24979c56dd6d095f18541462485fb62229cfddf0fa8784d7c7dd9fbb535d0b5"],
  ["Scripts/Chronicle/requirements.txt", "9d91436f670aac600f39beb184f7278774dc94e470dfca37f092bb0e3d461722", "562f66ed699de7d73e464c6be1a0938b6b19a8c2f69fe4b955209f0981986a2d"],
];

// Parse fixtures as data only. Restored or adversarial modules never execute.
const INSPECT = String.raw`
import ast, json, sys
text = json.load(sys.stdin)
tree = ast.parse(text)
owners = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'build_extra_css']
assert len(owners) == 1
owner = owners[0]
assert not owner.decorator_list and len(owner.body) == 2
assert isinstance(owner.body[0], ast.Expr) and isinstance(owner.body[0].value, ast.Constant)
returned = owner.body[1]
assert isinstance(returned, ast.Return) and isinstance(returned.value, ast.Constant)
assert isinstance(returned.value.value, str)
footer = [n for n in tree.body if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'FOOTER' for t in n.targets)]
assert len(footer) == 1 and isinstance(footer[0].value, ast.Constant)
print(json.dumps({'css': returned.value.value, 'segment': ast.get_source_segment(text, returned.value), 'footer': footer[0].value.value}))
`;
const EXECUTE_CURRENT = String.raw`
import ast, hashlib, json, pathlib, sys
path = pathlib.Path(sys.argv[1])
data = path.read_bytes()
assert hashlib.sha256(data).hexdigest() == sys.argv[2]
text = data.decode('utf-8')
tree = ast.parse(text)
owners = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'build_extra_css']
assert len(owners) == 1 and isinstance(owners[0].body[-1], ast.Return)
assert isinstance(owners[0].body[-1].value, ast.Constant)
imports = [n for n in tree.body if isinstance(n, (ast.Import, ast.ImportFrom))]
assert len(imports) == 1 and isinstance(imports[0], ast.Import)
assert [(n.name, n.asname) for n in imports[0].names] == [('re', None)]
namespace = {'__name__': 'katlab_current_pages', '__file__': str(path)}
# Compile the actual bytes just validated, not a reread or copied function.
exec(compile(data, str(path), 'exec'), namespace)
css = namespace['build_extra_css']()
assert isinstance(css, str) and css == owners[0].body[-1].value.value
print(json.dumps({'css': css, 'footer': namespace['FOOTER']}))
`;
function runPython (script, input, args = []) {
  const result = spawnSync(python, ["-I", "-B", "-c", script, ...args], {
    cwd: root, input, encoding: "utf8", timeout: 10_000, maxBuffer: 256 * 1024,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr.slice(0, 1200));
  return JSON.parse(result.stdout);
}
function ending (text) {
  assert.ok(!text.startsWith("\uFEFF") && !text.includes("\0"), "no BOM/NUL");
  const rest = text.replace(/\r\n/g, ""), eol = text.includes("\r\n") ? "\r\n" : "\n";
  assert.ok(!rest.includes("\r"), "no bare CR");
  if (eol === "\r\n") assert.ok(!rest.includes("\n"), "uniform EOL");
  assert.ok(text.endsWith(eol) && !text.endsWith(eol + eol), "single module EOF");
  assert.doesNotMatch(text, /[ \t]+\r?$/m); return eol;
}
function checkBlock (text) {
  assert.ok(!text.includes("\r") && !text.includes("\0") && !text.startsWith("\uFEFF"));
  assert.ok(text.endsWith("\n\n") && !text.endsWith("\n\n\n"), "exact internal block separator");
  assert.doesNotMatch(text, /[ \t]+$/m);
  const ast = postcss.parse(text); assert.deepEqual(ast.nodes.map(n => n.type), ["comment", "rule", "rule", "atrule"]);
  assert.equal(ast.nodes[0].text, "One reader canvas with a bounded direct-prose measure.");
  const rule = (node, selector, declarations) => {
    assert.equal(node.type, "rule");
    assert.equal(selectors().astSync(node.selector).toString(), selectors().astSync(selector).toString());
    assert.ok(node.nodes.every(n => n.type === "decl"), "direct declarations only");
    assert.deepEqual(node.nodes.map(n => [n.prop, n.value, Boolean(n.important)]), declarations.map(([p, v]) => [p, v, false]));
  };
  rule(ast.nodes[1], MAIN, [["padding", "24px"], ["border", "1px solid var(--k-border)"], ["border-radius", "8px"], ["background-color", "var(--k-panel)"]]);
  rule(ast.nodes[2], PROSE, [["max-width", "72ch"]]);
  const media = ast.nodes[3]; assert.equal(media.name, "media"); assert.equal(media.params, "(max-width: 640px)");
  assert.equal(media.nodes.length, 1); assert.ok(media.nodes.every(n => n.type === "rule"));
  rule(media.nodes[0], MAIN, [["padding", "16px"]]);
}
function restoreSource (text) {
  const eol = ending(text), window = BLOCK.replace(/\n/g, eol), normalized = lf(text);
  assert.equal(text.split(window).length - 1, 1, "one complete physical insertion");
  assert.equal(normalized.split("/* footer */").length - 1, 1, "unique footer anchor");
  const offset = text.indexOf(window), data = runPython(INSPECT, JSON.stringify(text));
  assert.ok(lf(data.segment).includes(BLOCK + "/* footer */"), "actual returned constant owns window immediately before footer");
  assert.ok(lf(text.slice(0, offset)).endsWith(MOTION_END), "immediately after retained reduced-motion block");
  assert.equal(data.css.split(BLOCK).length - 1, 1); assert.equal(data.footer, FOOTER);
  const original = text.slice(0, offset) + text.slice(offset + window.length);
  assert.equal(ending(original), eol); runPython(INSPECT, JSON.stringify(original));
  return { original, originalCss: data.css.replace(BLOCK, ""), currentCss: data.css };
}
function replaceOnce (text, old, next) {
  assert.equal(text.split(old).length - 1, 1); return text.replace(old, next);
}

test("independent 366-byte literal freezes four root nodes, one direct media rule and every declaration", () => {
  assert.equal(Buffer.byteLength(BLOCK), 366); assert.equal(BLOCK.split("\n").length - 1, 14);
  assert.equal(sha(BLOCK), BLOCK_HASH); checkBlock(BLOCK);
  const data = runPython(INSPECT, JSON.stringify(source));
  assert.equal(data.css.split(BLOCK).length - 1, 1); assert.ok(data.segment.includes(BLOCK.replace(/\n/g, "\r\n")));
});
test("CSS rejects global, nested, selector, priority, media and physical-byte escape fixtures", () => {
  const variants = [BLOCK + "body { color: red; }\n", BLOCK + "/* Extra */\n", BLOCK + "@font-face { font-family: x; }\n",
    BLOCK.replace("  padding: 24px;", "  padding: 24px;\n  .escape { color: red; }"),
    BLOCK.replace("  padding: 24px;", "  @supports (display: grid) { color: red; }"),
    BLOCK.replace("  padding: 24px;", "  @font-face { font-family: x; }"),
    BLOCK.replace("  padding: 24px;", "  /* Nested */\n  padding: 24px;"),
    BLOCK.replace("padding: 16px;", "padding: 16px; @font-face { font-family: x; }"),
    BLOCK.replace("padding: 16px;", "padding: 16px; @supports (display: grid) { color: red; }"),
    BLOCK.replace("padding: 16px;", "padding: 16px; color: red;"),
    ...["@font-face { font-family: x; }", "@supports (display: grid) { color: red; }", "padding: 2px;"].map(v =>
      BLOCK.replace("  " + MAIN + " { padding: 16px; }", "  " + MAIN + " { padding: 16px; }\n  " + v)),
    ...["padding: 24px !important;", "padding: 24px; padding: 24px;", "width: 20px;", "overflow: hidden;", "order: 1;", "animation: pulse 1s;", "background: url(https://invalid.example/x);", "padding: 20px;"].map(v => BLOCK.replace("padding: 24px;", v)),
    BLOCK.replace(MAIN, "body"), BLOCK.replace(MAIN, MAIN + ", body"), BLOCK.replace(PROSE, PROSE + ", pre"),
    BLOCK.replace("72ch", "80ch"), BLOCK.replace("640px", "641px"), BLOCK.replace("@media", "@supports"),
    BLOCK.replace("}", ""), BLOCK.replace("\n", "\r"), BLOCK.replace("\n", "\r\n"), BLOCK.replace(/\n/g, "\r\n"),
    "\uFEFF" + BLOCK, BLOCK + "\0", BLOCK + "\n", BLOCK.slice(0, -1)];
  variants.forEach(value => assert.throws(() => checkBlock(value)));
});
test("actual AST-owned one-window inverse preserves original and reviewed RAW/LF and emitted CSS pins", () => {
  assert.equal(ending(source), "\r\n"); assert.equal(sha(source), REVIEWED_RAW); assert.equal(sha(lf(source)), REVIEWED_LF);
  const current = restoreSource(source); assert.equal(sha(current.original), ORIGINAL_RAW);
  assert.equal(sha(current.originalCss), OLD_CSS); assert.equal(sha(current.currentCss), NEW_CSS);
  for (const eol of ["\n", "\r\n"]) {
    const input = lf(source).replace(/\n/g, eol), restored = restoreSource(input);
    assert.equal(sha(lf(restored.original)), ORIGINAL_LF);
    assert.equal(restored.original, input.replace(BLOCK.replace(/\n/g, eol), ""));
    assert.equal(sha(restored.originalCss), OLD_CSS);
  }
});
test("source inverse rejects missing, duplicate, moved, commented, wrong-owner and structural-byte fixtures", () => {
  const current = lf(source), removed = current.replace(BLOCK, "");
  const variants = [removed, current.replace(BLOCK, BLOCK + BLOCK), current.replace(BLOCK, "/* " + BLOCK + " */\n"),
    removed.replace("/* main column */", BLOCK + "/* main column */"), removed + '_other = """\n' + BLOCK + '"""\n',
    current.replace("def build_extra_css ()", "def different_owner ()"),
    current + '\ndef build_extra_css ():\n    return "wrong"\n',
    current.replace(BLOCK, BLOCK.replace("bounded direct-prose", "altered")),
    current.replace("/* footer */", "/* not footer */"), current.replace("/* footer */", "/* footer */\n/* footer */"),
    current.replace(MOTION_END, MOTION_END + "\n"), current.replace(BLOCK, "# " + BLOCK),
    current.replace('return """/* KATLAB Chronicle', 'return f"""/* KATLAB Chronicle'),
    current.replace('return """/* KATLAB Chronicle', 'return ("""/* KATLAB Chronicle'),
    current.slice(0, -6), current + "\n", current.slice(0, -1), "\uFEFF" + current, current + "\0",
    current.replace("\n", "\r\n"), current.replace("\n", "\r")];
  variants.forEach(value => assert.throws(() => restoreSource(value)));
});
test("valid outside-window source and CSS edits survive inverse and fail original whole pins", () => {
  const current = lf(source), baseline = restoreSource(current);
  for (const [old, next] of [["Pure functions - no I/O, no clock", "Unrelated module documentation changed"], ["--k-bg: #020617;", "--k-bg: #010101;"]]) {
    const changed = replaceOnce(current, old, next), restored = restoreSource(changed);
    assert.equal(restored.original, replaceOnce(baseline.original, old, next));
    assert.notEqual(sha(lf(restored.original)), ORIGINAL_LF);
    if (old.startsWith("--k-bg")) assert.notEqual(sha(restored.originalCss), OLD_CSS);
  }
});
test("execute only the validated actual current pure module and compare its complete CSS and static footer", () => {
  const restored = restoreSource(source); assert.equal(sha(source), REVIEWED_RAW);
  assert.equal(sha(lf(restored.original)), ORIGINAL_LF); assert.equal(sha(restored.originalCss), OLD_CSS);
  const result = runPython(EXECUTE_CURRENT, undefined, [resolve(root, "Scripts/Chronicle/pages.py"), REVIEWED_RAW]);
  assert.equal(result.css, restored.currentCss); assert.equal(result.footer, FOOTER); assert.equal(sha(result.css), NEW_CSS);
  ending(result.css); checkBlock(result.css.slice(result.css.indexOf(BLOCK), result.css.indexOf(BLOCK) + BLOCK.length));
  assert.equal(sha(result.css.replace(BLOCK, "")), OLD_CSS);
  const main = postcss.parse(result.css).nodes.filter(n => n.type === "rule" && n.selector === MAIN);
  assert.equal(main.length, 2); assert.ok(main[0].nodes.some(n => n.prop === "min-width" && n.value === "0"));
  assert.ok(main[0].nodes.some(n => n.prop === "overflow-wrap" && n.value === "anywhere"));
});
test("unchanged real writer, CSS link, host states and named generated-output guards remain the acceptance boundary", () => {
  const generator = read("Scripts/Chronicle/generate.py"), suite = read("Tests/test_chronicle_generation.py");
  assert.ok(generator.includes('"docs/assets/extra.css", pages.build_extra_css().encode("utf-8")'));
  assert.ok(source.includes("f\"  - {yq('assets/extra.css')}\""));
  for (const name of ["test_generated_css_uses_only_the_frozen_local_font_stacks", "test_generated_reader_css_has_readable_tokens_and_focus", "test_generated_reader_css_bounds_content_and_reduces_motion_without_nav_reflow", "test_actual_bounded_document_universe_strict_builds_without_network"]) assert.ok(suite.includes("def " + name + " ("));
  const host = read("Frontend/src/chronicleView.tsx"), probeTests = read("Tests/test_chronicle_probe.mjs");
  assert.ok(host.includes('src="/chronicle/" title="KATLAB Chronicle"'));
  assert.ok(host.includes('state === "ready"')); assert.ok(probeTests.includes('"checking", "missing", "unavailable", "ready"'));
  // Actual offline generated HTML/CSS and live output are inspected separately.
  // No mocked markup, source match or pure function certifies native geometry.
});
test("all twenty-two relevant real owners, original suites and six dependencies retain distinct RAW/LF pins", () => {
  assert.equal(PINS.length, 22);
  for (const [path, raw, normalized] of PINS) {
    const value = deskPreservation(path, read(path)); assert.equal(sha(value), raw, path); assert.equal(sha(lf(value)), normalized, path);
    for (const eol of ["\n", "\r\n"]) assert.equal(sha(lf(lf(value).replace(/\n/g, eol))), normalized, path);
  }
  assert.equal(ending(read("Tests/test_chronicle_reader_canvas.mjs")), "\n");
});
