import { purposeNavigationPreservation } from "./helpers/purposeLedNavigation.mjs";
import { mastheadPreservation } from "./helpers/workspaceCommandMasthead.mjs";
import { deskPreservation } from "./helpers/changesReviewLanes.mjs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { restoreWarningTimestampOrder, ORIGINAL_WARNING_ARROW, WARNING_TIMESTAMP_ARROW,
  WARNING_TIMESTAMP_ARROW_SHA } from "./helpers/warningTimestampOrder.mjs";
import { restoreGitGraphBoundaryCopy, restoreGitGraphOracleAdapters } from "./helpers/gitGraphMergeSeed.mjs";
import { restoreChangesWorkbench, restoreChangesWorkbenchOracleAdapters } from "./helpers/changesWorkbench.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(resolve(root, "Frontend/package.json"));
const ts = require("typescript"), React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const read = name => readFileSync(resolve(root, "Frontend/src", name), "utf8");
const parse = text => ts.createSourceFile("actual.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const source = read("App.tsx"), app = parse(source), ui = parse(read("ui.tsx")), icons = parse(read("icons.tsx"));
const all = node => {
  const found = [node];
  ts.forEachChild(node, child => { found.push(...all(child)); });
  return found;
};
const one = (nodes, predicate, message = "one actual source boundary") => {
  const found = nodes.filter(predicate);
  assert.equal(found.length, 1, message);
  return found[0];
};
const declaration = (ast, name) => one(ast.statements, node =>
  ts.isFunctionDeclaration(node) ? node.name?.text === name : ts.isVariableStatement(node)
    && node.declarationList.declarations.some(item => item.name.getText(ast) === name), name);
const support = [[ui, "cx"], [ui, "CONTROL_TONE"], [ui, "ControlButton"],
  [ui, "getBoundedPageWindow"], [ui, "collectionIdentityKey"], [ui, "useBoundedPage"],
  [ui, "CollectionPager"], [icons, "IconBase"], [icons, "ChevronLeftIcon"], [icons, "ChevronRightIcon"]];
const owner = declaration(app, "WarningsBanner");
const compiled = ts.transpileModule(`export function subject(env) {
  const {React,forwardRef,useState,useRef,useCallback,useEffect,useLayoutEffect,useDisclosureBehavior}=env;
  ${support.map(([ast, name]) => declaration(ast, name).getText(ast).replace(/^export\s+/, "")).join("\n")}
  ${owner.getText(app)}
  return {WarningsBanner,CollectionPager};
}`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
  jsx: ts.JsxEmit.React } }).outputText;
// Compile current complete production source directly. OLD semantic setup never
// invokes the new source inverse or substitutes a copied ordering algorithm.
const { subject } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const elements = tree => Array.isArray(tree) ? tree.flatMap(elements)
  : React.isValidElement(tree) ? [tree, ...elements(tree.props.children)] : [];
const textOf = tree => Array.isArray(tree) ? tree.map(textOf).join("")
  : React.isValidElement(tree) ? textOf(tree.props.children)
    : tree === null || tree === undefined || typeof tree === "boolean" ? "" : String(tree);

function hooks () {
  const cells = [], pending = [];
  let cursor = 0;
  const changed = (before, after) => !before || !after || before.length !== after.length
    || after.some((value, index) => !Object.is(value, before[index]));
  return {
    reset() { cursor = 0; },
    useState(initial) {
      const index = cursor++;
      cells[index] ??= { value: typeof initial === "function" ? initial() : initial };
      return [cells[index].value, update => {
        cells[index].value = typeof update === "function" ? update(cells[index].value) : update;
      }];
    },
    useRef(initial) { const index = cursor++; return cells[index] ??= { current: initial }; },
    useCallback(callback, deps) {
      const index = cursor++;
      if (changed(cells[index]?.deps, deps)) cells[index] = { callback, deps };
      return cells[index].callback;
    },
    useEffect(callback, deps) {
      const index = cursor++;
      if (changed(cells[index]?.deps, deps)) { cells[index] = { deps }; pending.push(callback); }
    },
    useLayoutEffect(callback, deps) { cells[cursor++] = { callback, deps }; },
    flush() { for (const callback of pending.splice(0)) callback(); },
  };
}

function harness (initialRepos, scope = '["all"]') {
  const h = hooks(), dismissals = [];
  let repos = initialRepos, dismissed = new Set(), scopeKeyValue = scope, disclosure;
  const views = subject({ React, forwardRef: React.forwardRef, ...h,
    useDisclosureBehavior: value => { disclosure = value; } });
  let tree;
  const world = {
    dismissals,
    render(nextRepos = repos, nextDismissed = dismissed, nextScope = scopeKeyValue) {
      repos = nextRepos; dismissed = nextDismissed; scopeKeyValue = nextScope; h.reset();
      tree = views.WarningsBanner({ repos, dismissed, scopeKeyValue,
        onDismiss: key => { dismissals.push(key); dismissed = new Set(dismissed).add(key); } });
      // Only the actual bounded-page effect runs. Native warning layout and
      // shared disclosure DOM/focus effects are separately covered by old tests.
      h.flush();
      return tree;
    },
    open() { world.render(); elements(tree).find(node => node.type === "button").props.onClick(); world.render(); },
    rows() { return elements(tree).filter(node => Object.hasOwn(node.props, "data-warning-row")); },
    order() { return world.rows().map(row => row.props.children[0].props.children.at(-1)); },
    html() { return renderToStaticMarkup(tree); },
    dismiss(index) { world.rows()[index].props.children[1].props.onClick(); world.render(); },
    pager() { return elements(tree).find(node => node.type === views.CollectionPager); },
    pageControl(direction) {
      const pager = world.pager(); assert.ok(pager, "actual warning pager exists");
      return elements(pager.type.render(pager.props, null)).find(node =>
        node.props["aria-label"] === `Warnings: ${direction} page`);
    },
    changePage(direction) { world.pageControl(direction).props.onClick(); world.render(); },
    close(reason) { disclosure.onClose(reason); world.render(); },
  };
  return world;
}

const instant = suffix => "2026-10-06T12:34:56" + suffix;
const warning = (message, ts) => Object.freeze({ ts, message });
const repo = (id, warnings) => Object.freeze({ id, warnings: Object.freeze(warnings) });
const pair = reverse => [repo("A", (reverse
  ? [warning("fraction", instant(".100000Z")), warning("exact", instant("Z"))]
  : [warning("exact", instant("Z")), warning("fraction", instant(".100000Z"))]))];

for (const reverse of [false, true]) {
  test(`OLD semantic: complete warning details put exact seconds before later fractions (${reverse ? "reversed" : "forward"} input)`, () => {
    const h = harness(pair(reverse)); h.open();
    assert.deepEqual(h.order(), ["exact", "fraction"], "same-second raw precision must not reverse chronological warnings");
    assert.ok(h.html().indexOf("exact") < h.html().indexOf("fraction"));
  });
}

test("actual warning ordering preserves all six fractional digits and second/day/year boundaries", () => {
  const rows = [
    warning("next year", "2027-01-01T00:00:00Z"),
    warning("year end", "2026-12-31T23:59:59.999999Z"),
    warning("next day", "2026-10-07T00:00:00Z"),
    warning("day end", "2026-10-06T23:59:59.999999Z"),
    warning("next second", "2026-10-06T12:34:57Z"),
    warning("last microsecond", instant(".999999Z")),
    warning("four microseconds", instant(".000004Z")),
    warning("one microsecond", instant(".000001Z")),
    warning("exact", instant("Z")),
  ];
  const expected = rows.map(row => row.message).reverse();
  for (const input of [rows, [...rows].reverse()]) {
    const h = harness([repo("A", input)]); h.open(); assert.deepEqual(h.order(), expected);
  }
});

test("equivalent zero and exact fractional ties preserve repository and warning input order", () => {
  const repos = [repo("A", [warning("bare A", instant("Z")), warning("zero A", instant(".000000Z")),
    warning("equal A1", instant(".000001Z")), warning("equal A2", instant(".000001Z"))]),
  repo("B", [warning("bare B", instant("Z")), warning("zero B", instant(".000000Z")),
    warning("equal B", instant(".000001Z"))])];
  const h = harness(repos); h.open();
  assert.deepEqual(h.order(), ["bare A", "zero A", "bare B", "zero B", "equal A1", "equal A2", "equal B"]);
  const reversed = harness([...repos].reverse()); reversed.open();
  assert.deepEqual(reversed.order(), ["bare B", "zero B", "bare A", "zero A", "equal B", "equal A1", "equal A2"]);
});

test("cross-repository ordering and same-message raw dismissal keys remain independent", () => {
  const repos = [repo("A", [warning("same message", instant(".000004Z")), warning("same message", instant("Z"))]),
    repo("B", [warning("same message", instant(".000001Z"))])];
  const h = harness(repos); h.open();
  const expected = [["A", instant("Z"), "same message"], ["B", instant(".000001Z"), "same message"],
    ["A", instant(".000004Z"), "same message"]].map(row => JSON.stringify(row));
  assert.deepEqual(h.rows().map(row => row.key), expected);
  h.dismiss(0); assert.deepEqual(h.dismissals, [expected[0]]);
  assert.deepEqual(h.rows().map(row => row.key), expected.slice(1));
  assert.match(h.html(), /· 2/);
  assert.match(h.rows()[0].props.children[1].props["aria-label"], /1 of 2 from B/);
});

test("empty/collapsed summary counts, explicit open and existing close reasons stay unchanged", () => {
  const empty = harness([]); assert.equal(empty.render(), null);
  const h = harness(pair(false)); h.render();
  assert.deepEqual(h.rows(), []); assert.match(h.html(), /aria-expanded="false"/);
  assert.match(h.html(), /· 2/); assert.equal(h.pager(), undefined);
  for (const reason of ["escape", "outside"]) {
    h.open(); assert.equal(h.rows().length, 2); assert.match(h.html(), /aria-expanded="true"/);
    h.close(reason); assert.deepEqual(h.rows(), []); assert.match(h.html(), /aria-expanded="false"/);
  }
});

test("fifty-row pager uses complete sorted model and actual next/previous callbacks without key normalization", () => {
  const warnings = Array.from({ length: 51 }, (_, index) => warning(`warning ${index}`,
    instant(index === 0 ? "Z" : `.${String(index).padStart(6, "0")}Z`)));
  const h = harness([repo("A", [...warnings].reverse())]); h.open();
  assert.deepEqual(h.order(), warnings.slice(0, 50).map(row => row.message));
  assert.equal(h.pager().props.page.totalItems, 51);
  assert.equal(h.pageControl("previous").props.disabled, true);
  assert.equal(h.pageControl("next").props.disabled, false);
  h.changePage("next"); assert.deepEqual(h.order(), ["warning 50"]);
  assert.match(h.html(), /Page 2 of 2/); assert.match(h.html(), /51–51 of 51/);
  assert.equal(h.pageControl("next").props.disabled, true);
  h.changePage("previous"); assert.equal(h.order()[0], "warning 0");
  h.changePage("next"); h.dismiss(0);
  assert.deepEqual(h.dismissals, [JSON.stringify(["A", warnings[50].ts, warnings[50].message])]);
  assert.equal(h.rows().length, 50); assert.equal(h.pager(), undefined);
});

test("refresh retains a valid explicit page and scope identity resets it using the actual pager hook", () => {
  const warnings = Array.from({ length: 55 }, (_, index) => warning(String(index),
    instant(index === 0 ? "Z" : `.${String(index).padStart(6, "0")}Z`)));
  const repos = [repo("A", warnings)];
  const h = harness(repos); h.open(); h.changePage("next");
  h.render([repo("A", [...warnings].reverse())]);
  assert.deepEqual(h.order(), ["50", "51", "52", "53", "54"]);
  h.render(repos, new Set(), '["repo","A"]');
  assert.equal(h.rows().length, 50); assert.equal(h.order()[0], "0");
  assert.equal(h.pager().props.page.page, 1);
});

test("frozen inputs and raw untrusted warning messages are never changed or injected", () => {
  const message = '</span><script>alert("fixture")</script> & long '.repeat(8);
  const repos = Object.freeze([repo("A", [warning(message, instant("Z")), warning("later", instant(".000001Z"))])]);
  const before = JSON.stringify(repos), h = harness(repos); h.open();
  assert.equal(h.order()[0], message); assert.equal(h.rows()[0].key, JSON.stringify(["A", instant("Z"), message]));
  assert.match(h.html(), /&lt;script&gt;/); assert.doesNotMatch(h.html(), /<script/);
  h.dismiss(0); h.close("outside");
  assert.equal(JSON.stringify(repos), before);
});

const sha = value => createHash("sha256").update(value).digest("hex");
const replaceOnce = (text, before, after) => {
  assert.equal(text.split(before).length, 2, "one exact reviewed source window");
  return text.replace(before, after);
};
const ORIGINAL_APP_RAW = "cb7236cf324746a2538d13ee165e01d0f37734929782dd793731e392aac434f5";
const ORIGINAL_APP_LF = "39eae6ad724da0dd82bec58663dc8fab67e7819300fa7e89f52b1007fd9c4571";
const originalPins = {
  rawOwner: "8041a098388b6940808d79c168b37dbbc26eab1747a9755cc1d1aa0c04ffeccd",
  lfOwner: "841c7ed9030c140347bf0d30f4d90ef21a1b5aa54ecbabb62ef3d95ce15ea00a",
  printedOwner: "ccef3dc20787898caa8c06c182cc58e4dc8083b5ff637c8fdff89f1dcc942e07",
  preRender: "ae759b7905f504be0ea9f0ba69d57601531ab394f02d7a010cd9337ac26f47f6",
  outsideLF: "38ceeaac6b5499ec368965ed41b9e3035d65d52bc670b89d07128999d661befe",
};

test("strict one-arrow inverse preserves complete original App/owner/pre-render/outside in LF and CRLF", () => {
  assert.equal(sha(WARNING_TIMESTAMP_ARROW), WARNING_TIMESTAMP_ARROW_SHA);
  const lf = restoreGitGraphBoundaryCopy(restoreChangesWorkbench(deskPreservation("Frontend/src/App.tsx", mastheadPreservation("Frontend/src/App.tsx", purposeNavigationPreservation("Frontend/src/App.tsx", source))))).replace(/\r\n/g, "\n");
  const printer = ts.createPrinter({ removeComments: true });
  for (const newline of ["\n", "\r\n"]) {
    const current = lf.replace(/\n/g, newline), restored = restoreWarningTimestampOrder(current);
    assert.equal(sha(restored.replace(/\r\n/g, "\n")), ORIGINAL_APP_LF);
    if (newline === "\r\n") assert.equal(sha(restored), ORIGINAL_APP_RAW);
    const ast = parse(restored), previous = declaration(ast, "WarningsBanner"), currentAst = parse(current);
    const currentOwner = declaration(currentAst, "WarningsBanner");
    const raw = restored.slice(previous.getStart(ast), previous.end);
    assert.equal(sha(raw.replace(/\r\n/g, "\n")), originalPins.lfOwner);
    if (newline === "\r\n") assert.equal(sha(raw), originalPins.rawOwner);
    const printed = node => printer.printNode(ts.EmitHint.Unspecified, node, ast).replace(/\r\n/g, "\n");
    assert.equal(sha(printed(previous)), originalPins.printedOwner);
    const statements = [...previous.body.statements];
    assert.ok(ts.isReturnStatement(statements.pop()));
    assert.equal(sha(statements.map(printed).join("\n")), originalPins.preRender);
    assert.equal(sha((restored.slice(0, previous.getStart(ast)) + restored.slice(previous.end))
      .replace(/\r\n/g, "\n")), originalPins.outsideLF);
    assert.equal(restored.slice(0, previous.getStart(ast)), current.slice(0, currentOwner.getStart(currentAst)));
    assert.equal(restored.slice(previous.end), current.slice(currentOwner.end), "all outside-owner bytes pass through unchanged");
  }
});

test("strict comparator inverse rejects missing, duplicate, wrong-site and partial structural/physical changes", () => {
  const lf = restoreGitGraphBoundaryCopy(restoreChangesWorkbench(deskPreservation("Frontend/src/App.tsx", mastheadPreservation("Frontend/src/App.tsx", purposeNavigationPreservation("Frontend/src/App.tsx", source))))).replace(/\r\n/g, "\n"), ast = parse(lf), warningOwner = declaration(ast, "WarningsBanner");
  const items = warningOwner.body.statements[14].getText(ast);
  const changes = [
    [WARNING_TIMESTAMP_ARROW, ORIGINAL_WARNING_ARROW],
    ["function WarningsBanner (", "function WrongWarningsBanner ("],
    ["const items = repos.flatMap", "let items = repos.flatMap"],
    ["const items = repos.flatMap", "const itemsOther = repos.flatMap"],
    [").sort((left, right) => {", ").sort<any>((left, right) => {"],
    [").sort((left, right) => {", ")?.sort((left, right) => {"],
    ["(left, right) => {", "(left: unknown, right) => {"],
    ["(left, right) => {", "(left, right = null) => {"],
    ["const leftTs = left.ts.replace", "let leftTs = left.ts.replace"],
    ["left.ts.replace", "right.ts.replace"],
    ['"$1.000000Z"', '"$1.000Z"'],
    ["T\\d{2}:\\d{2}:\\d{2}", "T\\d{2}:\\d{2}:\\d{1}"],
    ["leftTs < rightTs", "leftTs > rightTs"],
    ["leftTs > rightTs ? 1 : 0", "leftTs > rightTs ? 1 : -1"],
    ["    const leftTs", "   const leftTs"],
    ["    const leftTs", "    /* hidden change */ const leftTs"],
    ["    return leftTs", "    const extra = 0;\n    return leftTs"],
    ["  });\n  const disclosureOpen", "  }).slice(0);\n  const disclosureOpen"],
  ];
  const changed = changes.map(([before, after]) => {
    // The two replacement strings deliberately occur once per comparator side;
    // mutate only the complete left-side arrow when testing those properties.
    if (before === '"$1.000000Z"' || before === "T\\d{2}:\\d{2}:\\d{2}") {
      return replaceOnce(lf, WARNING_TIMESTAMP_ARROW, WARNING_TIMESTAMP_ARROW.replace(before, after));
    }
    if (before === "(left, right) => {") return replaceOnce(lf, WARNING_TIMESTAMP_ARROW,
      replaceOnce(WARNING_TIMESTAMP_ARROW, before, after));
    return replaceOnce(lf, before, after);
  });
  changed.push(lf + "\n" + warningOwner.getText(ast) + "\n");
  changed.push(replaceOnce(lf, items, items + "\n  " + items));
  const rawOwner = warningOwner.getText(ast);
  const withoutItems = replaceOnce(rawOwner, "  " + items + "\n", "");
  const relocated = replaceOnce(withoutItems, "  const [expanded, setExpanded] = useState(false);", "  " + items
    + "\n  const [expanded, setExpanded] = useState(false);");
  changed.push(replaceOnce(lf, rawOwner, relocated));
  for (const value of changed) {
    assert.equal(parse(value).parseDiagnostics.length, 0, "negative is valid TSX, not a parser failure");
    for (const newline of ["\n", "\r\n"]) assert.throws(() => restoreWarningTimestampOrder(value.replace(/\n/g, newline)),
      assert.AssertionError, "every structural or physical mutation violates the owned comparator contract");
  }
});

test("comparator inverse leaves unrelated valid owner and outside mutations visible to original hashes", () => {
  const lf = restoreGitGraphBoundaryCopy(restoreChangesWorkbench(deskPreservation("Frontend/src/App.tsx", mastheadPreservation("Frontend/src/App.tsx", purposeNavigationPreservation("Frontend/src/App.tsx", source))))).replace(/\r\n/g, "\n");
  const changes = [
    ["Warning details", "Changed warning heading"],
    ['pendingEscapeFocusRef.current = reason === "escape";', 'pendingEscapeFocusRef.current = reason !== "escape";'],
    ["pageSize: 50,\n  });\n  useLayoutEffect", "pageSize: 49,\n  });\n  useLayoutEffect"],
    ["Explore commit history and its linked captured events.", "Independent History sentinel."],
  ];
  for (const [before, after] of changes) for (const newline of ["\n", "\r\n"]) {
    const modified = replaceOnce(lf, before, after).replace(/\n/g, newline);
    assert.equal(parse(modified).parseDiagnostics.length, 0);
    const restored = restoreWarningTimestampOrder(modified).replace(/\r\n/g, "\n");
    assert.notEqual(sha(restored), ORIGINAL_APP_LF);
    assert.ok(restored.includes(after), "unrelated modification survives the inverse");
  }
});

const HISTORY_IMPORT = 'import { restoreWarningTimestampOrder } from "./helpers/warningTimestampOrder.mjs";\n';
const HISTORY_NEW_CALL = "const ast = parse(restoreDiffDisclosureState(restoreWarningTimestampOrder(text)));";
const HISTORY_OLD_CALL = "const ast = parse(restoreDiffDisclosureState(text));";
const DIFF_IMPORT = '  const { restoreWarningTimestampOrder } = await import("./helpers/warningTimestampOrder.mjs");\n';
const DIFF_LF_NEW = '  const lf = restoreWarningTimestampOrder(read("App.tsx")).replace(/\\r\\n/g, "\\n");';
const DIFF_LF_OLD = '  const lf = read("App.tsx").replace(/\\r\\n/g, "\\n");';
const DIFF_HISTORY_UNDO = [
  "    history = disclosureReplaceOnce(history,",
  "      'import { restoreWarningTimestampOrder } from \"./helpers/warningTimestampOrder.mjs\";\\n', \"\");",
  "    history = disclosureReplaceOnce(history,",
  '      "const ast = parse(restoreDiffDisclosureState(restoreWarningTimestampOrder(text)));",',
  '      "const ast = parse(restoreDiffDisclosureState(text));");',
  "",
].join("\n");
const oldTests = [
  ["test_history_graph_read_states.mjs", "59155516a54b38b3fbf5b99d1dbe24f6d8ee16c0686f4b6ae3a53fba8753fc50"],
  ["test_diff_availability.mjs", "eecdfb8a919e98b21cd91c8b1f81b9fde89165811ca1caf0ff12ddae9e1aa103"],
];
function undoOracleAdapters (name, text) {
  text = text.replace(/\r\n/g, "\n");
  if (name === oldTests[0][0]) {
    for (const window of [HISTORY_IMPORT, HISTORY_NEW_CALL]) assert.equal(text.split(window).length - 1, 1, "one History adapter");
    text = replaceOnce(text,
      'import { restoreDiffDisclosureState } from "./helpers/diffDisclosureState.mjs";\n' + HISTORY_IMPORT,
      'import { restoreDiffDisclosureState } from "./helpers/diffDisclosureState.mjs";\n');
    return replaceOnce(text, "function checkPreservation (text) {\n  " + HISTORY_NEW_CALL,
      "function checkPreservation (text) {\n  " + HISTORY_OLD_CALL);
  }
  assert.equal(name, oldTests[1][0]);
  for (const window of [DIFF_IMPORT, DIFF_LF_NEW, DIFF_HISTORY_UNDO]) assert.equal(text.split(window).length - 1, 1, "one Diff adapter");
  text = replaceOnce(text, '    await import("./helpers/diffDisclosureState.mjs");\n' + DIFF_IMPORT,
    '    await import("./helpers/diffDisclosureState.mjs");\n');
  text = replaceOnce(text, "  assert.equal(sha(DIFF_DISCLOSURE_WINDOW), DIFF_DISCLOSURE_WINDOW_SHA);\n" + DIFF_LF_NEW,
    "  assert.equal(sha(DIFF_DISCLOSURE_WINDOW), DIFF_DISCLOSURE_WINDOW_SHA);\n" + DIFF_LF_OLD);
  return replaceOnce(text,
    '    let history = historyLF.replace(/\\n/g, newline).replace(/\\r\\n/g, "\\n");\n' + DIFF_HISTORY_UNDO,
    '    let history = historyLF.replace(/\\n/g, newline).replace(/\\r\\n/g, "\\n");\n');
}

test("only exact oracle adapters invert to both complete HEAD34 suites without rebasing any old assertion", () => {
  for (const [name, expected] of oldTests) {
    const text = restoreGitGraphOracleAdapters(name, restoreChangesWorkbenchOracleAdapters(name, deskPreservation(`Tests/${name}`, mastheadPreservation(`Tests/${name}`, purposeNavigationPreservation(`Tests/${name}`, readFileSync(resolve(root, "Tests", name), "utf8")))))).replace(/\r\n/g, "\n");
    for (const newline of ["\n", "\r\n"]) assert.equal(sha(undoOracleAdapters(name, text.replace(/\n/g, newline))), expected);
  }
});

test("test adapter inverse rejects malformed windows and retains unrelated old-test changes", () => {
  for (const [name, expected] of oldTests) {
    const text = restoreGitGraphOracleAdapters(name, restoreChangesWorkbenchOracleAdapters(name, deskPreservation(`Tests/${name}`, mastheadPreservation(`Tests/${name}`, purposeNavigationPreservation(`Tests/${name}`, readFileSync(resolve(root, "Tests", name), "utf8")))))).replace(/\r\n/g, "\n");
    const windows = name === oldTests[0][0] ? [HISTORY_IMPORT, HISTORY_NEW_CALL] : [DIFF_IMPORT, DIFF_LF_NEW, DIFF_HISTORY_UNDO];
    for (const window of windows) for (const replacement of ["", window + window, window.replace("restoreWarningTimestampOrder", "wrongRestore")]) {
      assert.throws(() => undoOracleAdapters(name, replaceOnce(text, window, replacement)), assert.AssertionError);
    }
    const modified = replaceOnce(text, name === oldTests[0][0]
      ? 'assert.equal(timers.size, 0); noEmpty(h.html());' : 'assert.equal(h.requests.length, 1, "offline Hide is local");',
    name === oldTests[0][0] ? 'assert.equal(timers.size, 1); noEmpty(h.html());'
      : 'assert.equal(h.requests.length, 2, "offline Hide is local");');
    assert.notEqual(sha(undoOracleAdapters(name, modified)), expected, "unrelated test edit is not hidden by adapter reversal");
  }
});
