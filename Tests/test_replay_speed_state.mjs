import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(resolve(root, "Frontend/package.json"));
const ts = require("typescript"), React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const source = readFileSync(resolve(root, "Frontend/src/dayLanes.tsx"), "utf8");
const canonical = value => value.replace(/\r\n/g, "\n");
const sha = value => createHash("sha256").update(value).digest("hex");
function parsed (text) {
  const ast = ts.createSourceFile("dayLanes.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  assert.equal(ast.parseDiagnostics.length, 0, "valid actual DayLanes syntax");
  const owners = ast.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === "DayLanes");
  assert.equal(owners.length, 1, "one complete DayLanes owner");
  return { ast, owner: owners[0] };
}
const descendants = node => {
  const result = [node];
  ts.forEachChild(node, child => { result.push(...descendants(child)); });
  return result;
};
function speedMap (owner, ast) {
  const maps = descendants(owner).filter(node => ts.isCallExpression(node)
    && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "map"
    && ts.isArrayLiteralExpression(node.expression.expression)
    && node.expression.expression.elements.map(item => item.getText(ast)).join(",") === "1,2,4");
  assert.equal(maps.length, 1, "one actual complete 1/2/4 speed map");
  return maps[0];
}
function compileExpression (node, ast, names) {
  const code = ts.transpileModule(`return (${node.getText(ast)});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText;
  return new Function("React", ...names, code);
}
const { ast, owner } = parsed(source);
const map = speedMap(owner, ast);
// Evaluate only the shipped mapped expression, not React hooks or replay effects.
const renderSpeeds = compileExpression(map, ast, ["speed", "onSpeedChange"]);

test("current speed 2 exposes its selected button as pressed", () => {
  const buttons = renderSpeeds(React, 2, () => {});
  assert.equal(buttons.length, 3);
  assert.equal(buttons[1].props["aria-pressed"], true,
    "the actual current 2x speed must expose pressed=true");
});

test("all three current speeds preserve labels, classes and all nine numeric actions", () => {
  for (const current of [1, 2, 4]) {
    const calls = [], buttons = renderSpeeds(React, current, value => calls.push(value));
    assert.deepEqual(calls, [], "rendering does not change speed");
    assert.equal(buttons.filter(button => button.props["aria-pressed"]).length, 1);
    for (const [index, value] of [1, 2, 4].entries()) {
      const button = buttons[index], active = current === value;
      assert.equal(button.type, "button");
      assert.equal(button.key, String(value));
      assert.equal(button.props.children.join(""), `${value}x`);
      assert.equal(button.props["aria-pressed"], active);
      assert.equal(button.props.className,
        `rounded px-1.5 py-0.5 text-xs ${active
          ? "bg-teal-700 font-bold text-white" : "text-slate-300 hover:bg-slate-700"}`);
      assert.deepEqual(Object.keys(button.props).sort(), ["aria-pressed", "children", "className", "onClick"],
        "no added keyboard, role, type, disabled, focus or grouping owner");
      button.props.onClick();
      assert.equal(calls[index], value);
      assert.equal(typeof calls[index], "number");
      const html = renderToStaticMarkup(button);
      assert.match(html, new RegExp(`aria-pressed="${active}"`));
      assert.match(html, new RegExp(`>${value}x</button>$`));
      assert.ok(html.includes(`class="${button.props.className}"`));
    }
    assert.deepEqual(calls, [1, 2, 4]);
  }
});

test("new prop snapshots and repeated selected activation retain the controlled selection", () => {
  const calls = [];
  for (const current of [1, 4, 2, 2]) {
    const buttons = renderSpeeds(React, current, value => calls.push(value));
    const selected = buttons.find(button => button.props["aria-pressed"] === true);
    assert.equal(selected.key, String(current));
    selected.props.onClick();
    selected.props.onClick();
    assert.equal(selected.props["aria-pressed"], true);
    assert.equal(buttons.filter(button => button.props["aria-pressed"] === true).length, 1);
  }
  assert.deepEqual(calls, [1, 1, 4, 4, 2, 2, 2, 2]);
});

test("actual neighboring day-view buttons retain their own selection and replay restriction", () => {
  const neighbors = descendants(owner).filter(node => ts.isCallExpression(node)
    && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "map"
    && node.expression.expression.getText(ast) === '(["lanes", "clock"] as const)');
  assert.equal(neighbors.length, 1);
  const renderViews = compileExpression(neighbors[0], ast, ["laneView", "pickLaneView", "replay"]);
  for (const laneView of ["lanes", "clock"]) for (const replay of [false, true]) {
    const calls = [], buttons = renderViews(React, laneView, value => calls.push(value), replay);
    assert.deepEqual(calls, []);
    assert.equal(buttons.length, 2);
    for (const [index, value] of ["lanes", "clock"].entries()) {
      const button = buttons[index];
      assert.equal(button.key, value);
      assert.equal(button.props.children, value);
      assert.equal(button.props["aria-pressed"], laneView === value);
      assert.equal(button.props.disabled, value === "clock" && replay);
      assert.equal(button.props.title, value === "clock" && replay ? "exit replay first" : undefined);
      assert.match(renderToStaticMarkup(button), new RegExp(`aria-pressed="${laneView === value}"`));
      // Direct handler evidence only: do not simulate native disabled-button behavior.
      if (!button.props.disabled) button.props.onClick();
    }
    assert.deepEqual(calls, replay ? ["lanes"] : ["lanes", "clock"]);
  }
});

test("actual replay and arm gates remain unchanged without executing replay effects", () => {
  const gates = descendants(owner).filter(node => ts.isBinaryExpression(node)
    && node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken);
  const controls = gates.filter(node => node.left.getText(ast) === "replay && timeWindow && rows"
    && node.pos <= map.pos && node.end >= map.end);
  assert.equal(controls.length, 1);
  const visible = compileExpression(controls[0].left, ast, ["replay", "timeWindow", "rows"]);
  for (const replay of [false, true]) for (const timeWindow of [null, { start: 1 }]) {
    for (const rows of [null, [], [{ id: 1 }]]) {
      assert.equal(Boolean(visible(React, replay, timeWindow, rows)), replay && timeWindow !== null && rows !== null);
    }
  }
  const arm = gates.filter(node => node.left.getText(ast)
    === '!replay && timeWindow && laneView === "lanes" && rows && rows.length > 0');
  assert.equal(arm.length, 1);
  const canArm = compileExpression(arm[0].left, ast, ["replay", "timeWindow", "laneView", "rows"]);
  assert.equal(Boolean(canArm(React, false, {}, "lanes", [{ id: 1 }])), true);
  for (const args of [[true, {}, "lanes", [{}]], [false, null, "lanes", [{}]],
    [false, {}, "clock", [{}]], [false, {}, "lanes", null], [false, {}, "lanes", []]]) {
    assert.equal(Boolean(canArm(React, ...args)), false);
  }
});

const PRESSED_LINE = "                aria-pressed={speed === s}\n";
const REVIEWED_WINDOW = "              <button key={s} onClick={() => onSpeedChange(s as 1 | 2 | 4)}\n"
  + PRESSED_LINE;
const ORIGINAL = {
  raw: "389d54bdfbce5febc90bf047606f5e844c5fe5e3284cfd069af4ea8a8fdce581",
  module: "a2505976acdaaa3b88d864a09690d2ce52e28f87a47d198ade773562cce0928c",
  owner: "e18011e31f2c193f528c3b02615bcabab5a677bebe0c775af3f7392f5c886284",
  outside: "d4606eeb8f0c9cbf9736871edf3e56c6fea5b0646ddb89916930712fafe2a4b9",
  preReturn: "d405e794967a0670030631b7591040cc0d580007e25b56bb22c8469924b7e402",
};
function restoreOriginal (text) {
  assert.equal(sha(REVIEWED_WINDOW), "605902c5985bbeb02f5f5ef722ea24dea49b55aa6217c67a4d7e6dffb9666f0a");
  const normalized = canonical(text), { ast: tree, owner: fn } = parsed(normalized);
  const actualMap = speedMap(fn, tree);
  const buttons = descendants(actualMap).filter(node => ts.isJsxOpeningElement(node)
    && node.tagName.getText(tree) === "button");
  assert.equal(buttons.length, 1, "one speed-map button");
  const attributes = buttons[0].attributes.properties.filter(node => ts.isJsxAttribute(node)
    && node.name.getText(tree) === "aria-pressed");
  assert.equal(attributes.length, 1, "one speed-button pressed attribute, independent of neighbor state");
  assert.equal(attributes[0].getText(tree), "aria-pressed={speed === s}");
  assert.equal(normalized.split(REVIEWED_WINDOW).length - 1, 1, "one exact anchored reviewed window");
  assert.equal(fn.getText(tree).split(REVIEWED_WINDOW).length - 1, 1, "window belongs to DayLanes");
  assert.equal(normalized.split(PRESSED_LINE).length - 1, 1, "one new line in the module");
  const restored = normalized.replace(REVIEWED_WINDOW, REVIEWED_WINDOW.replace(PRESSED_LINE, ""));
  const original = parsed(restored), originalFn = original.owner;
  const finalReturn = originalFn.body.statements.at(-1);
  assert.ok(ts.isReturnStatement(finalReturn), "actual final render return");
  assert.equal(sha(originalFn.getText(original.ast)), ORIGINAL.owner, "complete original DayLanes");
  assert.equal(sha(restored.slice(originalFn.getStart(original.ast), finalReturn.getStart(original.ast))),
    ORIGINAL.preReturn, "raw pre-return including signature and comments, not printed statements");
  assert.equal(sha(restored.slice(0, originalFn.getStart(original.ast)) + restored.slice(originalFn.end)),
    ORIGINAL.outside, "all source outside the owner");
  assert.equal(sha(restored), ORIGINAL.module, "complete original LF module");
  return text.includes("\r\n") ? restored.replace(/\n/g, "\r\n") : restored;
}

test("only the reviewed attribute restores every original source oracle in LF and CRLF", () => {
  const lf = canonical(source), restored = restoreOriginal(lf);
  assert.equal(sha(restored), ORIGINAL.module);
  assert.equal(sha(restoreOriginal(lf.replace(/\n/g, "\r\n"))), ORIGINAL.raw);
  assert.equal(sha(restoreOriginal(source)), source.includes("\r\n") ? ORIGINAL.raw : ORIGINAL.module);
});

test("strict preservation rejects missing, relocated, partial and unrelated changes", () => {
  const lf = canonical(source);
  function replaceOnce (text, from, to) {
    assert.equal(text.split(from).length - 1, 1, `unique mutation anchor: ${from}`);
    return text.replace(from, to);
  }
  const changed = (from, to) => replaceOnce(lf, from, to);
  const negatives = [
    ["missing", changed(PRESSED_LINE, "")],
    ["duplicate", changed(PRESSED_LINE, PRESSED_LINE + PRESSED_LINE)],
    ["wrong expression", changed(PRESSED_LINE, PRESSED_LINE.replace("===", "!=="))],
    ["truthy constant", changed(PRESSED_LINE, PRESSED_LINE.replace("speed === s", "true"))],
    ["partial attribute", changed(PRESSED_LINE, PRESSED_LINE.replace("aria-pressed", "aria-press"))],
    ["moved within button", changed(REVIEWED_WINDOW,
      '              <button aria-pressed={speed === s} key={s} onClick={() => onSpeedChange(s as 1 | 2 | 4)}\n')],
    ["wrong button", replaceOnce(changed(PRESSED_LINE, ""),
      '<button key={v} aria-pressed={laneView === v}', '<button key={v} aria-pressed={speed === s}')],
    ["wrong owner", changed("export function DayLanes (", "export function OtherDayLanes (")],
    ["callback", changed("onSpeedChange(s as 1 | 2 | 4)", "onSpeedChange(1)")],
    ["class", changed('"bg-teal-700 font-bold text-white"', '"bg-teal-800 font-bold text-white"')],
    ["pre-return", changed("[replay, playing, speed, daySeconds]", "[replay, playing, daySeconds]")],
    ["outside owner", lf + "\nconst unreviewed = 1;\n"],
    ["duplicate owner", lf + "\n" + owner.getText(ast)],
    ["malformed syntax", lf + "\nconst broken = ;\n"],
  ];
  for (const [label, altered] of negatives) {
    assert.throws(() => restoreOriginal(altered), { name: "AssertionError" }, label);
    assert.throws(() => restoreOriginal(canonical(altered).replace(/\n/g, "\r\n")),
      { name: "AssertionError" }, `${label} CRLF`);
  }
});
