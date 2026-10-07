import { mastheadPreservation } from "./helpers/workspaceCommandMasthead.mjs";
// Current source executes below; published 3.0 references are immutable DATA only.
// Native server serialization is not browser/native UI acceptance.
// Async handlers use a controlled hook/DOM host, not a mounted React root.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { reviewLanesPreservation } from "./helpers/changesReviewLanes.mjs";
import { test } from "node:test";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(resolve(ROOT, "Frontend/package.json"));
const ts = require("typescript"), React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const lf = value => value.replace(/\r\n/g, "\n");
const sha = value => createHash("sha256").update(value).digest("hex");
const appRaw = readFileSync(resolve(ROOT, "Frontend/src/App.tsx"));
const appText = lf(appRaw.toString("utf8"));
const htmlRaw = readFileSync(resolve(ROOT, "Frontend/index.html"));
const fixtureRaw = readFileSync(resolve(ROOT, "Tests/fixtures/changes_review_lanes_v0430.json"));
assert.equal(fixtureRaw.length, 99622, "immutable captured-data length");
assert.equal(sha(fixtureRaw), "38f6646f2e594b7c516af620e532ad5ef918eba9e066e2a0020d8f5e11c834b3");
const BASELINE = JSON.parse(fixtureRaw.toString("utf8"));
assert.equal(BASELINE.schema, 1); assert.equal(BASELINE.version, "0.4.3.0");
assert.equal(BASELINE.reactVersion, React.version);
assert.equal(BASELINE.ssr.length, 72);
const parse = (name, text) => ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const app = parse("App.tsx", appText);
const postcss = require("postcss");
const selectorParser = require("postcss-selector-parser");
const source = name => parse(name, lf(readFileSync(resolve(ROOT, "Frontend/src", name), "utf8")));
const theme = source("theme.ts"), format = source("format.ts"), ui = source("ui.tsx");
const decl = (tree, name) => {
  const found = tree.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === name
    || ts.isVariableStatement(node) && node.declarationList.declarations.some(item => item.name.getText(tree) === name));
  assert.equal(found.length, 1, `exact declaration ${name}`);
  return found[0];
};
const extract = (tree, name) => decl(tree, name).getText(tree).replace(/^export\s+/, "");
const all = (node, predicate) => {
  const result = [];
  const visit = entry => { if (predicate(entry)) result.push(entry); ts.forEachChild(entry, visit); };
  visit(node);
  return result;
};
const print = node => ts.createPrinter({ removeComments: true }).printNode(ts.EmitHint.Unspecified, node, node.getSourceFile());
const compile = text => {
  const result = ts.transpileModule(text, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React,
  }, reportDiagnostics: true });
  assert.equal((result.diagnostics ?? []).filter(item => item.category === ts.DiagnosticCategory.Error).length, 0);
  return result.outputText;
};
const dependencies = [
  [theme, ["MODE_COLOR", "SWEPT_COLOR", "MODE_BADGE", "normalizeEventProvider", "sessionIdentityKey", "eventSessionIdentity", "sessionColor"]],
  [format, ["pad", "fmtTs", "fmtRel"]],
  [app, ["SWEPT_TIP", "swatch", "ModeBadge", "SessionDot"]],
  [ui, ["cx", "getBoundedPageWindow", "collectionIdentityKey", "useBoundedPage", "CollectionPager"]],
  [app, ["DiffView"]],
];
const factory = row => new Function("React", "hooks", "deps", compile(`
  const {useState, useRef, useEffect, useCallback} = hooks;
  const {api, createActionDeadline, isAbortError, document} = deps;
  const {forwardRef} = React;
  // Pager controls/icons are the bounded inert boundary used by test_diff_availability.
  const ControlButton = ({children, ...props}) => React.createElement("button", props, children);
  const ChevronLeftIcon = () => null, ChevronRightIcon = () => null;
  ${dependencies.flatMap(([tree, names]) => names.map(name => extract(tree, name))).join("\n")}
  ${row}
  return {EventRow, ModeBadge, SessionDot, DiffView, MODE_BADGE, MODE_COLOR, SWEPT_COLOR};
`));
const currentFactory = factory(extract(app, "EventRow"));
const noop = () => {};
const inertDeps = { api: {}, document: {}, isAbortError: () => false,
  createActionDeadline: () => { throw new Error("No network during server serialization"); } };
const currentSsr = currentFactory(React, React, inertDeps);
const fixture = { id: 7, repo_id: "Repo A", file: "src/long path/a.ts", commit_hash: "abc123",
  ts: "invalid-fixed-timestamp", mode: "B", swept: 0, task_ref: null,
  provider: null, session_id: null, branch: null, tool: "Edit" };
const repos = [{ id: fixture.repo_id, offline: false, branch: "develop" }];
const offline = [{ ...repos[0], offline: true }];
const render = (subject, props) => renderToStaticMarkup(React.createElement(subject.EventRow, props));
const walk = tree => Array.isArray(tree) ? tree.flatMap(walk)
  : React.isValidElement(tree) ? [tree, ...walk(tree.props.children)] : [];
const text = tree => Array.isArray(tree) ? tree.map(text).join("")
  : React.isValidElement(tree) ? text(tree.props.children)
    : tree === null || tree === undefined || typeof tree === "boolean" ? "" : String(tree);
const action = tree => walk(tree).filter(node => node.type === "button"
  && /^(Show|Retry|Loading|Hide) diff for /.test(node.props["aria-label"] ?? ""));
const cells = tree => walk(tree).filter(node => node.props["data-review-cell"]);
const settle = async () => { for (let index = 0; index < 12; index++) await Promise.resolve(); };

function controlledHooks () {
  const slots = [], effects = [];
  let cursor = 0;
  const changed = (old, next) => !old || !next || old.length !== next.length
    || next.some((value, index) => !Object.is(value, old[index]));
  return {
    reset() { cursor = 0; },
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: typeof initial === "function" ? initial() : initial };
      return [slots[index].value, value => {
        slots[index].value = typeof value === "function" ? value(slots[index].value) : value;
      }];
    },
    useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
    useCallback(callback, dependencies) {
      const index = cursor++;
      if (changed(slots[index]?.dependencies, dependencies)) slots[index] = { callback, dependencies };
      return slots[index].callback;
    },
    useEffect(callback, dependencies) {
      const index = cursor++;
      if (changed(slots[index]?.dependencies, dependencies)) {
        const previous = slots[index];
        slots[index] = { dependencies };
        effects.push(() => { previous?.cleanup?.(); slots[index].cleanup = callback(); });
      }
    },
    flush() { for (const effect of effects.splice(0)) effect(); },
    cleanup() { for (const slot of slots) slot?.cleanup?.(); },
  };
}

function harness (make, ledger = false, event = fixture) {
  const hooks = controlledHooks(), requests = [], statuses = [], focused = [];
  const target = {}, document = { activeElement: null, body: { dataset: {} } };
  const row = { isConnected: true, inert: false, contains: value => value === target,
    closest: selector => { assert.equal(selector, "[inert]"); return row.inert ? row : null; },
    focus: options => { focused.push(options); document.activeElement = row; } };
  const deps = {
    document, isAbortError: error => error?.name === "AbortError",
    createActionDeadline() {
      const controller = new AbortController();
      return { controller, signal: controller.signal, clear: noop, didTimeout: () => false };
    },
    api: { diff(...args) { return new Promise((resolve, reject) => requests.push({ args, resolve, reject })); } },
  };
  const subjects = make(React, hooks, deps);
  let tree;
  return {
    hooks, subjects, requests, statuses, focused, document, row, target,
    render(nextRepos = repos, extra = {}) {
      hooks.reset();
      tree = subjects.EventRow({ event, repos: nextRepos, reviewLedger: ledger,
        onStatus: message => statuses.push(message), ...extra });
      tree.ref.current = row;
      hooks.flush();
      return tree;
    },
    click() {
      const matches = action(tree);
      assert.equal(matches.length, 1, "single actual Diff/Retry/Hide button");
      matches[0].props.onClick({ currentTarget: target });
    },
    async accept(value, index = requests.length - 1) { requests[index].resolve({ diff: value }); await settle(); },
    async reject(value, index = requests.length - 1) { requests[index].reject(value); await settle(); },
    unmount() { hooks.cleanup(); tree.ref.current = null; },
  };
}


const PINNED_INPUTS = [
  {
    "path": "Frontend/src/App.tsx",
    "nativeEOL": "CRLF",
    "currentLF": "ae4ce688943f56856200273bf9b03d1aa0ca329b25695feff2f3692ff19a403a",
    "currentRaw": "b57f4d189850e36bd90e2abec90afe0faca953070adbde3ff4709fb0669d8046",
    "currentLFBytes": 230581,
    "oldRaw": "d1a42a0e968e0c7790d4952c2993c37bee19efda2f197c4ab19d81ec5c1a3112",
    "oldLF": "b98cfe4b7322d489149450bee7a07f732ff15e1e534d122caa6af72b52be8684",
    "oldBytes": 234937
  },
  {
    "path": "Frontend/index.html",
    "nativeEOL": "LF",
    "currentLF": "266658d8cb9b3e62fc6eda027ea7bffafdbf38a708f2363d31047fb521376870",
    "currentRaw": "266658d8cb9b3e62fc6eda027ea7bffafdbf38a708f2363d31047fb521376870",
    "currentLFBytes": 17392,
    "oldRaw": "98b8ebb28a50a8575ee5d99347c41cc4334812b2f7cca77f5fd9b77f3212a330",
    "oldLF": "98b8ebb28a50a8575ee5d99347c41cc4334812b2f7cca77f5fd9b77f3212a330",
    "oldBytes": 13548
  },
  {
    "path": "Tests/test_achievement_gallery.mjs",
    "nativeEOL": "LF",
    "currentLF": "998839d552c9763a3b1022df7137fa4c121645e289e37cc3aa0a45dda9b1bf5b",
    "currentRaw": null,
    "currentLFBytes": 36359,
    "oldRaw": "b9cbb50540e92d0a543b6e705cbe04763c2ff6546f96751fa08e3eeda94ed918",
    "oldLF": "b9cbb50540e92d0a543b6e705cbe04763c2ff6546f96751fa08e3eeda94ed918",
    "oldBytes": 36359
  },
  {
    "path": "Tests/test_active_plan_gallery.mjs",
    "nativeEOL": "LF",
    "currentLF": "01b75ba1e91bc1e4f1754bdb9d358b461e12db313fd3d7e8f18aad6ae553172d",
    "currentRaw": null,
    "currentLFBytes": 31849,
    "oldRaw": "c901ff600a8334e3aaf77b76be71fa3c15ce5cea8a56e4a00b5aec6f72902a48",
    "oldLF": "c901ff600a8334e3aaf77b76be71fa3c15ce5cea8a56e4a00b5aec6f72902a48",
    "oldBytes": 31849
  },
  {
    "path": "Tests/test_attribution_station.mjs",
    "nativeEOL": "LF",
    "currentLF": "23d84c9875998e3be3b3396127b9d9811d008531058c932f009db106d7943a94",
    "currentRaw": null,
    "currentLFBytes": 41894,
    "oldRaw": "312a197183752225677c94bac08053027a2d2ba48fa17db1708a4cccb4ad3515",
    "oldLF": "312a197183752225677c94bac08053027a2d2ba48fa17db1708a4cccb4ad3515",
    "oldBytes": 41870
  },
  {
    "path": "Tests/test_changes_review_desk.mjs",
    "nativeEOL": "LF",
    "currentLF": "1dc6435f26e27a75d59dbdaba9c86fb166b3e1a64586adf1ec165ed455115094",
    "currentRaw": null,
    "currentLFBytes": 39007,
    "oldRaw": "d4aea39baed7610bc79a68ac981b2a9942206f6d16a4643758a16f0450db2234",
    "oldLF": "d4aea39baed7610bc79a68ac981b2a9942206f6d16a4643758a16f0450db2234",
    "oldBytes": 38983
  },
  {
    "path": "Tests/test_chronicle_reader_canvas.mjs",
    "nativeEOL": "LF",
    "currentLF": "d3e6566cc88e6d897e4231fdddb9494a9a41c162bc6fa27ca976a0040aac489a",
    "currentRaw": null,
    "currentLFBytes": 19142,
    "oldRaw": "15a4d45716ca5c3b10b0511f476b9a19f93fec804153a99e3e94aec927a1fa66",
    "oldLF": "15a4d45716ca5c3b10b0511f476b9a19f93fec804153a99e3e94aec927a1fa66",
    "oldBytes": 19142
  },
  {
    "path": "Tests/test_diagnostic_studio.mjs",
    "nativeEOL": "LF",
    "currentLF": "b72b2c54b1e32f712f81ac988612d52b7116ba8aa61a591319b0ceda7f928854",
    "currentRaw": null,
    "currentLFBytes": 40235,
    "oldRaw": "73050b4e893d89ad70fe9d0006fad1932f1d6a4d7eea878e61962a8bbeb3a57c",
    "oldLF": "73050b4e893d89ad70fe9d0006fad1932f1d6a4d7eea878e61962a8bbeb3a57c",
    "oldBytes": 40153
  },
  {
    "path": "Tests/test_diff_availability.mjs",
    "nativeEOL": "LF",
    "currentLF": "e400426edb98460a81a2cb53f5e6cc126acfdd8c9680c707621c2e5467b824ba",
    "currentRaw": null,
    "currentLFBytes": 31413,
    "oldRaw": "ba860935acd718723e1fc1e6b1ca6c32ed8d4956f77353bcb63b8229d9a2131c",
    "oldLF": "ba860935acd718723e1fc1e6b1ca6c32ed8d4956f77353bcb63b8229d9a2131c",
    "oldBytes": 31413
  },
  {
    "path": "Tests/test_git_graph_merge_seed.mjs",
    "nativeEOL": "LF",
    "currentLF": "a58df616a49166e9bc7a4c01f2a736e247c1a6bae6c01a29dc48da50a2555144",
    "currentRaw": null,
    "currentLFBytes": 23713,
    "oldRaw": "752d13a0b578dbd81cbce9ff66dd456c50cf3659ffb711223fb72cb7db9e017a",
    "oldLF": "752d13a0b578dbd81cbce9ff66dd456c50cf3659ffb711223fb72cb7db9e017a",
    "oldBytes": 23713
  },
  {
    "path": "Tests/test_history_commit_ledger.mjs",
    "nativeEOL": "LF",
    "currentLF": "68e4007f3823ad1b5c581a1680bb805675a2a10c432a1e084ac73b56b6b4c17a",
    "currentRaw": null,
    "currentLFBytes": 27906,
    "oldRaw": "547dcb5b288da5f58855ae52e947467728d5f1675b172955f51fb05c6a4e6baa",
    "oldLF": "547dcb5b288da5f58855ae52e947467728d5f1675b172955f51fb05c6a4e6baa",
    "oldBytes": 27906
  },
  {
    "path": "Tests/test_history_graph_read_states.mjs",
    "nativeEOL": "LF",
    "currentLF": "cd32eecf474afcdcb0a1eb94612c7fc4a4261184d55f5f036d5f9160c8418cd5",
    "currentRaw": null,
    "currentLFBytes": 27328,
    "oldRaw": "12aabeceb52d59fd77faa3184e9c28593e5518fd9cb328cc06175a6b0b6fa4f6",
    "oldLF": "12aabeceb52d59fd77faa3184e9c28593e5518fd9cb328cc06175a6b0b6fa4f6",
    "oldBytes": 27328
  },
  {
    "path": "Tests/test_mission_command_desk.mjs",
    "nativeEOL": "LF",
    "currentLF": "2e33740c981045efd9c39fcd57d802d99419029810bc58d70a99a42b0a4f54e4",
    "currentRaw": null,
    "currentLFBytes": 53120,
    "oldRaw": "65f716904de5bd8b29a1e731187d53965c3936670bad23e2d98c09fb7b77de10",
    "oldLF": "65f716904de5bd8b29a1e731187d53965c3936670bad23e2d98c09fb7b77de10",
    "oldBytes": 52876
  },
  {
    "path": "Tests/test_mission_control_workbench.mjs",
    "nativeEOL": "LF",
    "currentLF": "537e31ffb975da8bd3ae17107cdb1e0fd844baf4b7e13bee828067cc0f06cad1",
    "currentRaw": null,
    "currentLFBytes": 33334,
    "oldRaw": "75346ce35c8ac9f8e1e7cf496eadd8d8cc95c6f8e660ff38767604d6cf1f0daf",
    "oldLF": "75346ce35c8ac9f8e1e7cf496eadd8d8cc95c6f8e660ff38767604d6cf1f0daf",
    "oldBytes": 33334
  },
  {
    "path": "Tests/test_mission_plan_gallery.mjs",
    "nativeEOL": "LF",
    "currentLF": "06fef08b614a6cd801f02c1494d0c35bd3a813e113b6c125613d8c5ff6ee2c43",
    "currentRaw": null,
    "currentLFBytes": 18832,
    "oldRaw": "6d3b499c67852050b4bfebb02c9619c04ec58aee88fb43ac1d5978825f0c3c2f",
    "oldLF": "6d3b499c67852050b4bfebb02c9619c04ec58aee88fb43ac1d5978825f0c3c2f",
    "oldBytes": 18832
  },
  {
    "path": "Tests/test_momentum_comparison_deck.mjs",
    "nativeEOL": "LF",
    "currentLF": "be2c38105b75d27dcdc9138455762b5d65352482c5a00c427ea0a79316899c3c",
    "currentRaw": null,
    "currentLFBytes": 29785,
    "oldRaw": "fb6f1c41e92ca4e6cc7eaa4039e232045e2d6d97fc4cbb78d4d8e4b47d8c0d4a",
    "oldLF": "fb6f1c41e92ca4e6cc7eaa4039e232045e2d6d97fc4cbb78d4d8e4b47d8c0d4a",
    "oldBytes": 29785
  },
  {
    "path": "Tests/test_overview_operations_deck.mjs",
    "nativeEOL": "LF",
    "currentLF": "9a25059cf6812fd51cf730a70943d56b3c7a2bd4562ea4d592cf21ef83d43d39",
    "currentRaw": null,
    "currentLFBytes": 20719,
    "oldRaw": "b0a6144f83d1de379617915f5ceb2fe21d4ee11942066b1222cc4b6e58ac64ae",
    "oldLF": "b0a6144f83d1de379617915f5ceb2fe21d4ee11942066b1222cc4b6e58ac64ae",
    "oldBytes": 20719
  },
  {
    "path": "Tests/test_personal_records_showcase.mjs",
    "nativeEOL": "LF",
    "currentLF": "224f652643b66d016449eb78159b1f7dc815297db7a07526047d8108ee527fd4",
    "currentRaw": null,
    "currentLFBytes": 32246,
    "oldRaw": "b6f626ef7ad80d42ee9787575368b0eb4c5aec05410532ad03590500533eb121",
    "oldLF": "b6f626ef7ad80d42ee9787575368b0eb4c5aec05410532ad03590500533eb121",
    "oldBytes": 32246
  },
  {
    "path": "Tests/test_provenance_evidence_desk.mjs",
    "nativeEOL": "LF",
    "currentLF": "e839aba1876a05a84996579a20875e71174ccd38c994a54a634695291032f6de",
    "currentRaw": null,
    "currentLFBytes": 40428,
    "oldRaw": "d653a13b86c2575ae981e7d7bde7c28a7f11d13ac96f976d90e5818e8a259e37",
    "oldLF": "d653a13b86c2575ae981e7d7bde7c28a7f11d13ac96f976d90e5818e8a259e37",
    "oldBytes": 40428
  },
  {
    "path": "Tests/test_release_identity.mjs",
    "nativeEOL": "LF",
    "currentLF": "fa9c3243b43841a9d65c28f527a7682c28fb8c897f4079fe8709c7a13b589ba2",
    "currentRaw": null,
    "currentLFBytes": 18489,
    "oldRaw": "56d579105463cab4bc657338866ec62828425ff38e9cc3b20ba26688ab4e07e9",
    "oldLF": "56d579105463cab4bc657338866ec62828425ff38e9cc3b20ba26688ab4e07e9",
    "oldBytes": 18489
  },
  {
    "path": "Tests/test_repository_profile.mjs",
    "nativeEOL": "LF",
    "currentLF": "84aa440bb8d9a3aeb718b45e6b625b58c014c018fe74c27ed897320403d0f105",
    "currentRaw": null,
    "currentLFBytes": 25746,
    "oldRaw": "bc416790a9b3a69101dc0d594e3e857e348264120e7c14f9e25a2b9b5120a277",
    "oldLF": "bc416790a9b3a69101dc0d594e3e857e348264120e7c14f9e25a2b9b5120a277",
    "oldBytes": 25746
  },
  {
    "path": "Tests/test_repository_scope_picker.mjs",
    "nativeEOL": "LF",
    "currentLF": "efa3ebc37005c1b76506392ec524975f2243317197fc3e997962be3f3a5ef71f",
    "currentRaw": null,
    "currentLFBytes": 23216,
    "oldRaw": "ad924f2b7c6827031e7b98fd6392b0a0b175928b80ec844aedae76f45df50cc0",
    "oldLF": "ad924f2b7c6827031e7b98fd6392b0a0b175928b80ec844aedae76f45df50cc0",
    "oldBytes": 23216
  },
  {
    "path": "Tests/test_system_snapshot_panels.mjs",
    "nativeEOL": "LF",
    "currentLF": "391528d45529c7f48cc5f978f4a5ec0aa5c3d76b1e0a480ac86b58b37824d0b2",
    "currentRaw": null,
    "currentLFBytes": 47385,
    "oldRaw": "a264dbc9ac9409b9962d2a112cfefe33fc5f0f1d1b0c521a735a593202ebb05e",
    "oldLF": "a264dbc9ac9409b9962d2a112cfefe33fc5f0f1d1b0c521a735a593202ebb05e",
    "oldBytes": 47385
  },
  {
    "path": "Tests/test_warning_timestamp_order.mjs",
    "nativeEOL": "LF",
    "currentLF": "f158bce4600a57589a643840fd0985a7c40af0e787990f3655ade2251d0f9a9d",
    "currentRaw": null,
    "currentLFBytes": 23832,
    "oldRaw": "4be64ffc7943763b54f809d35bf2fbee4c4de807121bd3ea6dad4123eed7d32f",
    "oldLF": "4be64ffc7943763b54f809d35bf2fbee4c4de807121bd3ea6dad4123eed7d32f",
    "oldBytes": 23832
  },
  {
    "path": "Tests/test_workbench_2_0.mjs",
    "nativeEOL": "LF",
    "currentLF": "2fea428635e94bbd06142641236a9072e7891fcee91db0e938fb3c30f6e2c540",
    "currentRaw": null,
    "currentLFBytes": 44012,
    "oldRaw": "da8d613165f4be42a1be064b4e2cc33a7f448fa00dc9dec4ace7635d1554aa67",
    "oldLF": "da8d613165f4be42a1be064b4e2cc33a7f448fa00dc9dec4ace7635d1554aa67",
    "oldBytes": 43971
  },
  {
    "path": "Tests/test_workspace_command_frame.mjs",
    "nativeEOL": "LF",
    "currentLF": "b8340011a0920aae51579579c185f5bfd3d668b7c2ee20ae94f03849c6619759",
    "currentRaw": null,
    "currentLFBytes": 24206,
    "oldRaw": "ccfcd39450249e995ce1872955cec0ca854d1df7f639621cf1fe3646d55ecae2",
    "oldLF": "ccfcd39450249e995ce1872955cec0ca854d1df7f639621cf1fe3646d55ecae2",
    "oldBytes": 24206
  },
  {
    "path": "Tests/test_operational_views.mjs",
    "nativeEOL": "CRLF",
    "currentLF": "c379b7148fc1bd06c9c5c9ccc5573522b09aa8426660c096b74466333958aff8",
    "currentRaw": null,
    "currentLFBytes": 37533,
    "oldRaw": "1dc324f2fba75698b916ce4f840adf97c3abddf78bf0d6b618b994f3baaef816",
    "oldLF": "0ffce73f13e7731b0ce18bf563a3273facf3aab4bfc027ab921f04cc5736c2b3",
    "oldBytes": 37888
  }
];
const CSS_GOLDEN = "/* Changes Review Lanes: file-first hierarchy in normal grouped rows only. */\n#root #main-content > div > .changes-workbench > section[aria-label=\"Grouped uncommitted changes\"] .ui-work-list[data-reveal] > div.mt-4 > .ui-work-row > [data-review-ledger=\"true\"] {\n  display: grid;\n  min-width: 0;\n  grid-template-columns: minmax(0, 1fr);\n  align-items: start;\n  gap: 0.75rem;\n}\n#root #main-content > div > .changes-workbench > section[aria-label=\"Grouped uncommitted changes\"] .ui-work-list[data-reveal] > div.mt-4 > .ui-work-row > [data-review-ledger=\"true\"] > [data-review-cell] {\n  min-width: 0;\n}\n#root #main-content > div > .changes-workbench > section[aria-label=\"Grouped uncommitted changes\"] .ui-work-list[data-reveal] > div.mt-4 > .ui-work-row > [data-review-ledger=\"true\"] > [data-review-cell=\"signal\"] > span {\n  flex-wrap: wrap;\n  max-width: 100%;\n}\n#root #main-content > div > .changes-workbench > section[aria-label=\"Grouped uncommitted changes\"] .ui-work-list[data-reveal] > div.mt-4 > .ui-work-row > [data-review-ledger=\"true\"] > [data-review-cell=\"body\"] {\n  display: grid;\n  min-width: 0;\n  gap: 0.375rem;\n}\n#root #main-content > div > .changes-workbench > section[aria-label=\"Grouped uncommitted changes\"] .ui-work-list[data-reveal] > div.mt-4 > .ui-work-row > [data-review-ledger=\"true\"] > [data-review-cell=\"body\"] > button:first-child,\n#root #main-content > div > .changes-workbench > section[aria-label=\"Grouped uncommitted changes\"] .ui-work-list[data-reveal] > div.mt-4 > .ui-work-row > [data-review-ledger=\"true\"] > [data-review-cell=\"body\"] > span:first-child {\n  min-width: 0;\n  width: 100%;\n  font-size: 1rem;\n  line-height: 1.5;\n  font-weight: 500;\n}\n#root #main-content > div > .changes-workbench > section[aria-label=\"Grouped uncommitted changes\"] .ui-work-list[data-reveal] > div.mt-4 > .ui-work-row > [data-review-ledger=\"true\"] > [data-review-cell=\"body\"] > [data-review-cell=\"context\"] {\n  display: flex;\n  min-width: 0;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: 0.375rem 0.5rem;\n  overflow-wrap: anywhere;\n}\n#root #main-content > div > .changes-workbench > section[aria-label=\"Grouped uncommitted changes\"] .ui-work-list[data-reveal] > div.mt-4 > .ui-work-row > [data-review-ledger=\"true\"] > [data-review-cell=\"body\"] > [data-review-cell=\"context\"] > * {\n  min-width: 0;\n  max-width: 100%;\n}\n#root #main-content > div > .changes-workbench > section[aria-label=\"Grouped uncommitted changes\"] .ui-work-list[data-reveal] > div.mt-4 > .ui-work-row > [data-review-ledger=\"true\"] > [data-review-cell=\"action\"] {\n  display: flex;\n  min-width: 0;\n  justify-content: flex-start;\n  align-items: center;\n}\n#root #main-content > div > .changes-workbench > section[aria-label=\"Grouped uncommitted changes\"] .ui-work-list[data-reveal] > div.mt-4 > .ui-work-row > [data-review-ledger=\"true\"] > [data-review-cell=\"action\"] > button {\n  margin-left: 0;\n}\n@media (min-width: 1024px) {\n  #root #main-content > div > .changes-workbench > section[aria-label=\"Grouped uncommitted changes\"] .ui-work-list[data-reveal] > div.mt-4 > .ui-work-row > [data-review-ledger=\"true\"] {\n    grid-template-columns: minmax(0, 8rem) minmax(0, 1fr) max-content;\n    gap: 1rem;\n  }\n  #root #main-content > div > .changes-workbench > section[aria-label=\"Grouped uncommitted changes\"] .ui-work-list[data-reveal] > div.mt-4 > .ui-work-row > [data-review-ledger=\"true\"] > [data-review-cell=\"action\"] {\n    justify-content: flex-end;\n  }\n}\n";

test("whole App/HTML/25 suite data inverses preserve full originals and reject all outside drift", () => {
  for (const record of PINNED_INPUTS) {
    const current = mastheadPreservation(record.path, readFileSync(resolve(ROOT, record.path)));
    assert.equal(sha(lf(current.toString("utf8"))), record.currentLF, record.path);
    assert.equal(Buffer.byteLength(lf(current.toString("utf8"))), record.currentLFBytes);
    if(record.currentRaw) assert.equal(sha(current),record.currentRaw);
    const restored = reviewLanesPreservation(record.path,current);
    assert.ok(Buffer.isBuffer(restored));
    assert.equal(restored.length,record.oldBytes);
    assert.equal(sha(restored),record.oldRaw);
    assert.equal(sha(lf(restored.toString("utf8"))),record.oldLF);
    for(const eol of ["\n","\r\n"]) {
      const input=lf(current.toString("utf8")).replace(/\n/g,eol);
      const projected=reviewLanesPreservation(record.path,input);
      assert.equal(typeof projected,"string");
      assert.equal(sha(lf(projected)),record.oldLF);
      assert.equal(sha(reviewLanesPreservation(record.path,Buffer.from(input))),sha(Buffer.from(projected)));
    }
    assert.throws(()=>reviewLanesPreservation(record.path,current.toString("utf8")+"// unrelated drift\n"));
    assert.throws(()=>reviewLanesPreservation(record.path,restored));
    assert.throws(()=>reviewLanesPreservation(record.path,"\uFEFF"+current.toString("utf8")));
  }
  assert.equal(PINNED_INPUTS.length,27);
  const untouched=Buffer.from("unchanged safe data\n");
  assert.equal(reviewLanesPreservation("Frontend/src/theme.ts",untouched),untouched);
  for(const path of ["../App.tsx","/Frontend/App.tsx","Frontend//App.tsx"]) {
    assert.throws(()=>reviewLanesPreservation(path,untouched));
  }
  const calls=all(app,node=>ts.isJsxSelfClosingElement(node)&&node.tagName.getText(app)==="EventRow");
  assert.equal(calls.length,3);
  const marked=calls.filter(node=>node.attributes.properties.some(prop=>prop.name?.getText(app)==="reviewLedger"));
  assert.equal(marked.length,1);
  assert.equal(marked[0].attributes.properties.find(prop=>prop.name?.getText(app)==="reviewLedger").initializer,undefined);
  assert.match(marked[0].parent.parent.parent.getText(app), /normal\.slice\(eventPager\.start, eventPager\.end\)/);
});

function cssRecordTree (css) {
  const parseRule = node => {
    assert.equal(node.type,"rule");
    assert.ok(node.nodes.every(child=>child.type==="decl"),"only direct declarations");
    const selectors=selectorParser().astSync(node.selector).nodes.map(selector=>selector.toString().trim());
    assert.ok(selectors.length===1||selectors.length===2);
    return {type:"rule",selectors,decl:node.nodes.map(child=>[child.prop,child.value,!!child.important])};
  };
  return postcss.parse(css).nodes.map(node=>{
    if(node.type==="comment") return {type:"comment",text:node.text};
    if(node.type==="rule") return parseRule(node);
    assert.equal(node.type,"atrule");
    assert.equal(node.name,"media");
    assert.equal(node.params,"(min-width: 1024px)");
    assert.equal(node.nodes.length,2);
    assert.ok(node.nodes.every(child=>child.type==="rule"));
    return {type:"media",params:node.params,rules:node.nodes.map(parseRule)};
  });
}

test("fifth inline source CSS is exact scoped normal-row oracle with no widened rule or priority", () => {
  const html=mastheadPreservation("Frontend/index.html", htmlRaw).toString("utf8");
  const styles=[...html.matchAll(/<style id="([^"]+)">([\s\S]*?)<\/style>/g)];
  assert.deepEqual(styles.map(match=>match[1]),[
    "katlab-workbench-v2","katlab-changes-review-desk","katlab-attribution-station",
    "katlab-diagnostic-studio","katlab-changes-review-lanes"]);
  const fifth=styles[4];
  assert.ok(html.indexOf("</head>")>fifth.index+fifth[0].length);
  assert.equal(html.slice(fifth.index+fifth[0].length,html.indexOf("</head>")).trim(),"<title>KATLAB Tracking Monitor</title>");
  const body=fifth[2];
  assert.ok(body.startsWith("\n")&&body.endsWith("\n    "));
  const lines=body.slice(1,-5).split("\n");
  assert.ok(lines.every(line=>line.startsWith("      ")));
  const css=lines.map(line=>line.slice(6)).join("\n")+"\n";
  assert.equal(css,CSS_GOLDEN);
  const expected=cssRecordTree(CSS_GOLDEN),actual=cssRecordTree(css);
  assert.deepEqual(actual,expected);
  assert.equal(actual.length,11);
  assert.equal(actual.filter(node=>node.type==="comment").length,1);
  assert.equal(actual.filter(node=>node.type==="rule").length,9);
  const media=actual.filter(node=>node.type==="media");
  assert.equal(media.length,1);assert.equal(media[0].rules.length,2);
  const owner='#root #main-content > div > .changes-workbench > section[aria-label="Grouped uncommitted changes"] .ui-work-list[data-reveal] > div.mt-4 > .ui-work-row > [data-review-ledger="true"]';
  const rules=actual.flatMap(node=>node.type==="rule"?[node]:node.type==="media"?node.rules:[]);
  assert.equal(rules.length,11);
  for(const rule of rules) {
    assert.ok(rule.selectors.every(selector=>selector.startsWith(owner)),"normal Changes owner AND actual EventRow marker");
    assert.ok(rule.decl.every(([, , important])=>important===false));
    assert.ok(rule.decl.every(([property])=>!["order","overflow","overflow-x","overflow-y","height","max-height","position","display-contents"].includes(property)));
  }
  assert.deepEqual(actual[1].decl.find(([property])=>property==="grid-template-columns"),["grid-template-columns","minmax(0, 1fr)",false]);
  assert.deepEqual(media[0].rules[0].decl.find(([property])=>property==="grid-template-columns"),["grid-template-columns","minmax(0, 8rem) minmax(0, 1fr) max-content",false]);
  for(const negative of [
    css+"\n.ui-work-row { color: red; }\n",
    css.replace('(min-width: 1024px)','(min-width: 1025px)'),
    css.replace('> [data-review-ledger="true"]','> div'),
    css.replace('gap: 0.75rem;','gap: 0.75rem !important;'),
    css + '\n@media (min-width: 1024px) { @font-face { font-family: escape; } }\n',
  ]) assert.throws(()=>assert.deepEqual(cssRecordTree(negative),expected));
});

test("current pre-render async owners and every original callback match immutable AST data", () => {
  const current=decl(app,"EventRow");
  assert.equal(current.body.statements.length,BASELINE.preReturnStatements.length+2);
  assert.deepEqual(current.body.statements.slice(0,-2).map(print),BASELINE.preReturnStatements);
  const helper=current.body.statements[current.body.statements.length-2];
  assert.ok(ts.isVariableStatement(helper));
  assert.equal(helper.declarationList.declarations[0].name.getText(app),"reviewCell");
  const callbacks=all(current,node=>ts.isJsxAttribute(node)&&node.name.getText(app)==="onClick")
    .map(node=>print(node.initializer.expression));
  assert.deepEqual(callbacks,BASELINE.onClickCallbacks);
  assert.equal(callbacks.length,3);
  for(const name of ["loadDiff","hideDiff"]){
    const found=all(current,node=>ts.isVariableDeclaration(node)&&node.name.getText(app)===name);
    assert.equal(found.length,1);
    assert.equal(print(found[0]),BASELINE[name]);
  }
});

test("native current React SSR default false matches all 72 immutable captured byte sequences", () => {
  let totalDecoded=0;
  const identities=new Set();
  for(const entry of BASELINE.ssr){
    const identity=JSON.stringify([entry.mode,entry.swept,entry.variant]);
    assert.ok(!identities.has(identity));identities.add(identity);
    assert.match(entry.htmlGzipBase64,/^[A-Za-z0-9+/]+={0,2}$/);
    const compressed=Buffer.from(entry.htmlGzipBase64,"base64");
    assert.equal(compressed.toString("base64"),entry.htmlGzipBase64);
    const decoded=gunzipSync(compressed,{maxOutputLength:16384});
    assert.equal(decoded.length,entry.htmlBytes);
    assert.equal(sha(decoded),entry.htmlSha256);
    totalDecoded+=decoded.length;
    const expected=new TextDecoder("utf-8",{fatal:true}).decode(decoded);
    const props={event:{...BASELINE.inputEvent,mode:entry.mode,swept:entry.swept},
      repos:entry.offline?BASELINE.offlineRepos:BASELINE.onlineRepos,showRef:entry.showRef,
      onOpenFileStory:entry.fileStory?noop:undefined,onSessionClick:entry.session?noop:undefined};
    assert.equal(render(currentSsr,props),expected,identity);
    assert.equal(render(currentSsr,{...props,reviewLedger:false}),expected,identity);
    assert.doesNotMatch(expected,/data-review-(?:cell|ledger)/);
  }
  assert.equal(identities.size,72);
  assert.ok(totalDecoded<=512*1024);
});

test("native React SSR true preserves mode/swept/full path/session/context and exact ordered lanes", () => {
  for (const mode of Object.keys(currentSsr.MODE_BADGE)) for (const swept of [0, 1]) {
    const event = { ...fixture, mode, swept, file: 'src/a<&>".ts', session_id: "session-12345678",
      provider: "codex", branch: "other", task_ref: "plan A" };
    const html = render(currentSsr, { event, repos, reviewLedger: true, showRef: true,
      onOpenFileStory: noop, onSessionClick: noop });
    assert.equal((html.match(/data-review-ledger="true"/g) ?? []).length, 1);
    assert.deepEqual([...html.matchAll(/data-review-cell="(\w+)"/g)].map(match => match[1]), ["signal", "body", "context", "action"]);
    assert.ok(html.includes(currentSsr.MODE_BADGE[mode].label));
    assert.ok(html.includes(currentSsr.MODE_COLOR[mode]));
    assert.equal(html.includes("auto-linked"), swept === 1);
    assert.match(html, /src\/a&lt;&amp;&gt;&quot;\.ts/);
    assert.match(html, /Filter by codex session session-/);
    assert.match(html, /different branch/);
    assert.match(html, /Edit · invalid-fixed-timestamp/);
    assert.equal((html.match(/aria-label="Show diff for/g) ?? []).length, 1);
  }
  const empty = render(currentSsr, { event: fixture, repos: offline, reviewLedger: true });
  assert.doesNotMatch(empty, /data-review-cell="action"/);
  assert.deepEqual([...empty.matchAll(/data-review-cell="(\w+)"/g)].map(match => match[1]), ["signal", "body", "context"]);
});

test("true layout keeps actual file/session callback payloads and path before context before action", () => {
  const event = { ...fixture, session_id: "same-id", provider: "codex", branch: "other" };
  const files = [], sessions = [];
  const h = harness(currentFactory, true, event);
  const tree = h.render(repos, { onOpenFileStory: (...args) => files.push(args), onSessionClick: identity => sessions.push(identity) });
  const outer = React.Children.toArray(tree.props.children)[0];
  assert.deepEqual(React.Children.toArray(outer.props.children).map(node => node.props["data-review-cell"]), ["signal", "body", "action"]);
  const file = walk(tree).find(node => node.type === "button" && node.props.title?.endsWith("open file story"));
  file.props.onClick();
  assert.deepEqual(files, [[fixture.repo_id, fixture.file]]);
  const session = walk(tree).find(node => node.type === h.subjects.SessionDot);
  session.props.onClick();
  assert.deepEqual(sessions, [{ provider: "codex", sessionId: "same-id" }]);
  const nativeSession = h.subjects.SessionDot(session.props);
  assert.equal(nativeSession.type, "button");
  assert.equal(nativeSession.props.onClick, session.props.onClick);
  h.unmount();
});

test("controlled actual async host preserves single-flight/loading/retained empty/Hide offline behavior", async () => {
  for (const ledger of [false, true]) for (const accepted of ["@@ -1 +1 @@\n-old\n+new", ""]) {
    const h = harness(currentFactory, ledger);
    h.render(); h.click(); h.click();
    assert.equal(h.requests.length, 1);
    assert.deepEqual(h.requests[0].args.slice(0, 3), [fixture.repo_id, fixture.file, fixture.commit_hash]);
    assert.ok(h.requests[0].args[3] instanceof AbortSignal);
    let tree = h.render();
    assert.equal(action(tree)[0].props.disabled, true);
    assert.equal(action(tree)[0].props["aria-busy"], true);
    assert.match(action(tree)[0].props["aria-label"], /^Loading diff/);
    await h.accept(accepted);
    tree = h.render(offline);
    assert.match(action(tree)[0].props["aria-label"], /^Hide diff/);
    assert.equal(action(tree)[0].props["aria-expanded"], true);
    assert.equal(walk(tree).find(node => node.type === h.subjects.DiffView).props.text, accepted);
    assert.match(text(tree), /Repository offline.*previously loaded diff/);
    if (ledger) assert.equal(cells(tree).filter(node => node.props["data-review-cell"] === "action").length, 1);
    h.document.activeElement = h.target;
    h.click();
    assert.deepEqual(h.focused, [{ preventScroll: true }]);
    tree = h.render(offline);
    assert.equal(action(tree).length, 0);
    assert.equal(cells(tree).filter(node => node.props["data-review-cell"] === "action").length, 0);
    assert.equal(walk(tree).filter(node => node.type === h.subjects.DiffView).length, 0);
    tree = h.render();
    assert.match(action(tree)[0].props["aria-label"], /^Show diff/);
    h.unmount();
  }
});

test("controlled actual errors/retry and stale resolution retain unchanged owner guards", async () => {
  for (const ledger of [false, true]) {
    const h = harness(currentFactory, ledger);
    h.render(); h.click(); await h.reject(new Error("fixture failure"));
    let tree = h.render();
    assert.match(action(tree)[0].props["aria-label"], /^Retry diff/);
    assert.match(text(tree), /Diff failed: Error: fixture failure/);
    assert.equal(h.statuses.length, 1);
    h.click(); assert.equal(h.requests.length, 2);
    tree = h.render(offline);
    assert.equal(action(tree).length, 0, "pending offline action absent, not empty lane");
    assert.match(text(tree), /pending diff load may fail/);
    h.unmount();
    assert.equal(h.requests[1].args[3].aborted, true);
    await h.accept("stale result", 1);
    tree = h.render();
    assert.equal(walk(tree).filter(node => node.type === h.subjects.DiffView).length, 0);
  }
});

test("controlled offline Hide keeps inert/overlay safeguards and single existing action", async () => {
  for (const blocked of ["inert", "overlay"]) {
    const h = harness(currentFactory, true);
    h.render(); h.click(); await h.accept(""); h.render(offline);
    h.document.activeElement = h.target;
    if (blocked === "inert") h.row.inert = true;
    else h.document.body.dataset.overlayOpen = "1";
    h.click();
    assert.equal(h.focused.length, 0);
    assert.equal(action(h.render(offline)).length, 0);
    h.unmount();
  }
});
