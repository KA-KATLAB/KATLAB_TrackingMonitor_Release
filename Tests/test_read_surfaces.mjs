import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { canonicalPrintedText } from "./helpers/printed_source.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const frontend = resolve(root, "Frontend");
const require = createRequire(resolve(frontend, "package.json"));
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const read = (file) => readFileSync(resolve(frontend, "src", file), "utf8");
const parse = (file) => ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true,
  file.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
const printer = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed });
const hash = (text) => createHash("sha256").update(canonicalPrintedText(text)).digest("hex");
const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));
const elements = (node) => Array.isArray(node) ? node.flatMap(elements)
  : React.isValidElement(node) ? [node, ...elements(node.props.children)] : [];

// Reverse only the reviewed identity append, never replace the original hash.
function originalDigestFetchCode (ast, fn) {
  const calls = [];
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)
        && node.expression.text === "appendUniqueEvents") calls.push(node);
    ts.forEachChild(node, visit);
  };
  visit(fn);
  assert.equal(calls.length, 1, "one actual Digest identity append");
  const call = calls[0];
  assert.ok(ts.isExpressionStatement(call.parent));
  assert.equal(call.questionDotToken, undefined, "the reviewed append is not optional");
  assert.equal(call.typeArguments, undefined, "the reviewed append has no type arguments");
  assert.equal(call.arguments.length, 2);
  assert.equal(call.arguments[0].getText(ast), "todays");
  assert.equal(call.arguments[1].getText(ast), "fresh");
  const replacement = ts.factory.createExpressionStatement(ts.factory.createCallExpression(
    ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier("todays"), "push"),
    undefined, [ts.factory.createSpreadElement(ts.factory.createIdentifier("fresh"))],
  ));
  const transformed = ts.transform(fn, [(context) => (node) => ts.visitNode(node, function restore(entry) {
    if (entry === call.parent) return replacement;
    return ts.visitEachChild(entry, restore, context);
  })]);
  try { return printer.printNode(ts.EmitHint.Unspecified, transformed.transformed[0], ast); }
  finally { transformed.dispose(); }
}

test("shared reading presentation preserves reviewed non-presentation ownership", () => {
  // Whole modules differ only in JSX classes. These portable hashes retain all
  // lease, focus, cleanup, callback, escaping, disclosure and data algorithms.
  for (const [file, expected] of [
    ["dialog.tsx", "56fe2f21e7c594982f388fb076c760c132d9ab1e9448ff917b9737a7fcb20d4f"],
    ["draftFeedback.tsx", "f444dcf35884b2c26d98dd1ee01da628da96f17ecbd0247347c36914b16c99bd"],
    ["identityCard.tsx", "6e4eec54636b17588816c8bf1afff057acee6f66abc648eb8615f0b95d1ffee8"],
  ]) {
    const ast = parse(file);
    const transformed = ts.transform(ast, [(context) => (source) => ts.visitNode(source, function visit(node) {
      if (ts.isJsxAttributes(node)) return ts.factory.updateJsxAttributes(node,
        node.properties.filter((property) => !ts.isJsxAttribute(property)
          || property.name.getText(ast) !== "className"));
      return ts.visitEachChild(node, visit, context);
    })]);
    try { assert.equal(hash(printer.printFile(transformed.transformed[0])), expected, file); }
    finally { transformed.dispose(); }
  }
  for (const [file, name, expected] of [
    ["reportHtml.ts", "delta", "747aeb9cfe3b60177f84ad24a4217509c8372ee64ccd727c2a8582c6095552c9"],
    ["reportHtml.ts", "spark", "21ab07a06097aff120a04ecd6397899f0678a9ab9d2e21efe503ff1e46858250"],
    ["reportHtml.ts", "exportReport", "c1daec102320552173c96ed630c06b713c43b6ee11d7a8fd4777f4ad0c5a7198"],
    ["digest.ts", "fetchToday", "712f2736f24ae00b8a0de17b8ea8474e1f7029686cd5b63c041dc4548b8c94eb"],
    ["digest.ts", "partitionDigestRows", "11c3a60e5c68dfb513a4aa24120db69a20325cfd67fdf1dd0f7bea4de09f755b"],
    ["digest.ts", "scriptSafeJson", "f20c6c683f8ce50c0522720945c62a1cf4a22b47ce005cfe518f523285eff93e"],
  ]) {
    const ast = parse(file), fn = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
    assert.ok(fn, `${file}:${name}`);
    const code = name === "fetchToday" ? originalDigestFetchCode(ast, fn)
      : printer.printNode(ts.EmitHint.Unspecified, fn, ast);
    assert.equal(hash(code), expected, `${file}:${name}`);
  }
});

test("Digest append oracle is portable and rejects broadened identity or owner changes", () => {
  const source = read("digest.ts");
  const code = (text) => {
    const ast = ts.createSourceFile("digest.ts", text, ts.ScriptTarget.Latest, true);
    const fn = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "fetchToday");
    assert.ok(fn);
    return originalDigestFetchCode(ast, fn);
  };
  const expected = "712f2736f24ae00b8a0de17b8ea8474e1f7029686cd5b63c041dc4548b8c94eb";
  for (const variant of [source.replace(/\r\n/g, "\n"), source.replace(/\r?\n/g, "\r\n")]) {
    assert.equal(hash(code(variant)), expected);
  }
  const original = "appendUniqueEvents(todays, fresh);";
  assert.ok(source.includes(original));
  for (const replacement of ["todays.push(...fresh);", "appendUniqueEvents(fresh, todays);",
    "appendUniqueEvents(todays, page);", "appendUniqueEvents?.(todays, fresh);",
    "appendUniqueEvents<TrackedEvent>(todays, fresh);", original + "\n" + original]) {
    assert.throws(() => code(source.replace(original, replacement)));
  }
  assert.notEqual(hash(code(source.replace("p < MAX_PAGES", "p <= MAX_PAGES"))), expected,
    "an unrelated request-bound change still breaks the original whole-function hash");
});

test("actual reading components preserve visible states and semantics", { timeout: 30_000 }, async (t) => {
  const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
  const vite = await createServer({ root: frontend,
    server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom",
    optimizeDeps: { noDiscovery: true, entries: [] } });
  try {
    const { DraftFeedback } = await vite.ssrLoadModule("/src/draftFeedback.tsx");
    const { IdentityCard } = await vite.ssrLoadModule("/src/identityCard.tsx");
    const { buildIdentityData } = await vite.ssrLoadModule("/src/identityData.ts");
    const { buildReportHtml } = await vite.ssrLoadModule("/src/reportHtml.ts");
    const ui = await vite.ssrLoadModule("/src/ui.tsx");
    const icons = await vite.ssrLoadModule("/src/icons.tsx");

    await t.test("draft outcomes remain readable, bounded, escaped and single-announcer", () => {
      let dismissals = 0;
      for (const result of ["copied", "empty", "unavailable", "failed", "timed-out"]) {
        const props = { repo: "<repo>&", result, onDismiss: () => dismissals++ };
        const html = render(DraftFeedback, props);
        assert.match(html, /gap-3 text-sm/);
        assert.match(html, /&lt;repo&gt;&amp;/);
        assert.doesNotMatch(html, /role="status"|aria-live|<repo>/);
        if (result === "copied") {
          assert.match(html, /line-clamp-2/);
          assert.doesNotMatch(html, /Dismiss commit draft feedback/);
        } else {
          assert.match(html, /role="region" aria-label="Commit draft result details" tabindex="0"/);
          assert.match(html, /max-h-\[min\(8rem,25dvh\)\] overflow-y-auto/);
          const button = elements(DraftFeedback(props)).find((node) => node.type === "button");
          assert.equal(button.props.onClick, props.onDismiss);
          button.props.onClick();
        }
      }
      assert.equal(dismissals, 4);
    });

    await t.test("identity keeps zero-data facts, shared slices and long escaped extension labels", () => {
      const identity = { extensions: [], ext_total: 0, sessions: 2,
        first_event_ts: null, commits: 3 };
      const empty = render(IdentityCard, { identity, calendar: [], scope: undefined });
      assert.match(empty, /No captures classified yet/);
      assert.match(empty, /2 sessions/); assert.match(empty, /3 commits/);
      assert.doesNotMatch(empty, /<svg/);
      for (const count of [1, 6]) {
        const data = { ...identity, extensions: Array.from({ length: count }, (_, index) => ({
          ext: index === 0 ? '<unsafe>&".extension"' : `.${index}`, count: 2,
        })), ext_total: count * 2 + 1 };
        const expected = buildIdentityData(data);
        const html = render(IdentityCard, { identity: data,
          calendar: [{ day: "2026-10-01", events: 1, commits: 1, minutes: 5 }], scope: "<repo>&" });
        assert.ok(html.includes(expected.presentation === "bar" ? "horizontal bars" : "donut"));
        assert.match(html, /&lt;unsafe&gt;&amp;&quot;\.extension&quot;/);
        assert.match(html, />other<\/span>/);
        assert.match(html, /≈ 5m effort \(365d, UTC\)/);
        assert.doesNotMatch(html, /text-\[1[01]px\]|<unsafe>/);
      }
    });

    await t.test("actual dialog structure retains callbacks and names with readable wrapping", async () => {
      // Execute the full real function with its portal/effect boundaries captured.
      // This is not native focus, inert, scrolling or trap verification.
      const ast = parse("dialog.tsx"), fn = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "DialogShell");
      const code = ts.transpileModule(fn.getText(ast), { compilerOptions: {
        target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
      } }).outputText;
      const effects = [], target = {}, exports = {};
      let id = 0, closed = 0;
      new Function("exports", "require", "useId", "useRef", "useLayoutEffect", "restoreEpoch",
        "createPortal", "document", "cx", "IconButton", "CloseIcon", code)(exports, require,
        () => `dialog-${++id}`, (value) => ({ current: value }), (effect) => effects.push(effect), 0,
        (tree, host) => { assert.equal(host, target); return tree; }, { body: target },
        ui.cx, ui.IconButton, icons.CloseIcon);
      const props = { title: '<Long & "title">', description: "D".repeat(150), backdropClose: true,
        headerActions: React.createElement("button", null, "Secondary action"),
        onClose: () => closed++, children: React.createElement("p", null, "Dialog body") };
      const tree = exports.DialogShell(props), html = renderToStaticMarkup(tree);
      assert.equal(effects.length, 2);
      assert.match(html, /role="dialog" aria-modal="true" aria-labelledby="dialog-1" aria-describedby="dialog-2"/);
      assert.match(html, /class="ui-panel-title break-words text-ui-text"/);
      assert.match(html, /&lt;Long &amp; &quot;title&quot;&gt;/);
      assert.match(html, /overflow-wrap:anywhere/);
      assert.match(html, /min-h-0 overflow-y-auto p-4/);
      const close = elements(tree).find((node) => node.type === ui.IconButton);
      assert.equal(close.props.onClick, props.onClose);
      close.props.onClick();
      tree.props.onMouseDown({ target, currentTarget: {} });
      assert.equal(closed, 1);
      tree.props.onMouseDown({ target, currentTarget: target });
      assert.equal(closed, 2);
    });

    await t.test("standalone report keeps exact accessible data and twelve-pixel metadata floor", () => {
      const stats = { activity_calendar: [], punch_card: Array.from({ length: 7 }, () => Array(24).fill(0)),
        identity: { extensions: [], ext_total: 0, sessions: 0, commits: 0 },
        effort_per_task: [], file_churn: [], wrapped: { days: [], commits: 0,
          files_touched: 0, top_task: null, top_pair: null, busiest_hour: null } };
      const html = buildReportHtml(stats, "<scope>&", 7, new Date("2026-10-01T12:00:00Z"));
      assert.equal((html.match(/class="report-metric"/g) ?? []).length, 4);
      assert.doesNotMatch(html, /font-size:\s*(?:8|10|11)px|font-size="(?:8|10|11)"/);
      assert.match(html, /&lt;scope&gt;&amp;/);
      assert.match(html, /Daily activity exact values" tabindex="0"/);
      assert.match(html, /\.table-scroll\{max-width:100%;overflow:auto/);
      assert.match(html, /\.table-scroll:focus-visible\{outline:2px solid/);
      assert.match(html, /Comparison unavailable: incomplete selected or preceding window/);
      assert.match(html, /<caption>Captured events by server-local weekday and hour<\/caption>/);
    });
  } finally { await vite.close(); }
});
