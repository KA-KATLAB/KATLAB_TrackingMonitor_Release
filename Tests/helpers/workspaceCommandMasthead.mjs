import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";

// Exact preservation inputs only. Production source and runtime readers stay current.
const require = createRequire(new URL("../../Frontend/package.json", import.meta.url));
const ts = require("typescript");
const postcss = require("postcss");
const sha = value => createHash("sha256").update(value).digest("hex");
const frozen = value => {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) frozen(child);
    Object.freeze(value);
  }
  return value;
};
export const MASTHEAD_SOURCES = frozen([
  {
    "path": "Frontend/src/App.tsx",
    "windows": [
      {
        "name": "PickRow.zeroChoiceCaption",
        "count": 1,
        "before": "        /* F49: zero-task guidance instead of an empty dropdown */\n        <span className=\"text-xs italic text-slate-400\">\n          No tasks defined \u2014 author a plan in temp/Plan/ of this repo; the event stays here and\n          becomes pickable once tasks exist.\n        </span>\n",
        "after": "        /* F49: zero-choice guidance without claiming repository tasks are absent. */\n        <span className=\"text-xs italic text-slate-400\">\n          No task choices are available for this event. Check the repository plan tasks\n          and attribution candidates. The event remains unresolved until a choice is available.\n        </span>\n"
      }
    ],
    "before": {
      "bytes": 235691,
      "RAW": "b57f4d189850e36bd90e2abec90afe0faca953070adbde3ff4709fb0669d8046",
      "LF": "ae4ce688943f56856200273bf9b03d1aa0ca329b25695feff2f3692ff19a403a",
      "LFbytes": 230581,
      "nativeEOL": "CRLF",
      "BOM": false
    },
    "after": {
      "bytes": 235751,
      "RAW": "0413abcb61a236e1bd1c724640ac1ef917851089d4f3024a2011e5599f2a383d",
      "LF": "f86e147bebf46c21ab8bf865feff45017edcb09de5119d15d13b5b62620d4867",
      "LFbytes": 230641,
      "nativeEOL": "CRLF",
      "BOM": false
    }
  },
  {
    "path": "Frontend/src/AppShell.tsx",
    "windows": [
      {
        "name": "WorkspaceContext.return",
        "before": "  return (\n    <div className=\"app-workspace-context text-xs text-ui-muted\">\n      <span className=\"min-w-0 break-words [overflow-wrap:anywhere] font-medium text-ui-text\">{scopeLabel(scope)}</span>\n      <span>{summary}</span>\n      {ready && error && <span className=\"text-amber-300\">Refresh failed; showing the last workspace snapshot</span>}\n      {ready && unavailable > 0 && <span className=\"text-amber-300\">{unavailable} unavailable</span>}\n      {ready && unknown > 0 && <span className=\"text-amber-300\">{unknown} Git status unknown</span>}\n      {ready && selected?.branch && <span className=\"min-w-0 break-words [overflow-wrap:anywhere]\">{!selected.offline && selected.status_valid === true ? \"Branch\" : \"Last-known branch\"}: {selected.branch}</span>}\n      {ready && selected && <span>{selected.last_event_ts ? `Last capture ${fmtRel(selected.last_event_ts)}` : \"No captures yet\"}</span>}\n      {ready && violations.length > 0 && <span className=\"text-amber-300\">{violations.length} discipline warning{violations.length === 1 ? \"\" : \"s\"}</span>}\n      <ControlButton onClick={onDetails} className=\"ml-auto text-xs\">Repository status</ControlButton>\n    </div>\n  );\n",
        "after": "  return (\n    <div className=\"app-workspace-context text-xs text-ui-muted\">\n      <div className=\"workspace-command-brief\">\n        <span data-workspace-command-scope className=\"min-w-0 break-words [overflow-wrap:anywhere] font-medium text-ui-text\">{scopeLabel(scope)}</span>\n        <span data-workspace-command-summary>{summary}</span>\n        <div className=\"workspace-command-details\">\n          {ready && error && <span className=\"text-amber-300\">Refresh failed; showing the last workspace snapshot</span>}\n          {ready && unavailable > 0 && <span className=\"text-amber-300\">{unavailable} unavailable</span>}\n          {ready && unknown > 0 && <span className=\"text-amber-300\">{unknown} Git status unknown</span>}\n          {ready && selected?.branch && <span className=\"min-w-0 break-words [overflow-wrap:anywhere]\">{!selected.offline && selected.status_valid === true ? \"Branch\" : \"Last-known branch\"}: {selected.branch}</span>}\n          {ready && selected && <span>{selected.last_event_ts ? `Last capture ${fmtRel(selected.last_event_ts)}` : \"No captures yet\"}</span>}\n          {ready && violations.length > 0 && <span className=\"text-amber-300\">{violations.length} discipline warning{violations.length === 1 ? \"\" : \"s\"}</span>}\n        </div>\n      </div>\n      <ControlButton onClick={onDetails} className=\"ml-auto text-xs\">Repository status</ControlButton>\n    </div>\n  );\n",
        "count": 1
      }
    ],
    "before": {
      "bytes": 4364,
      "RAW": "8d36a4a928da4e6d7774cc112ab3cecfe8b5e654afe05de0480facc40f21eeee",
      "LF": "7a2ee984f185fbcc7ff0e5aa9017b2b1dd8e8e8667068ce2c371a5bf884448a9",
      "LFbytes": 4277,
      "nativeEOL": "CRLF",
      "BOM": false
    },
    "after": {
      "bytes": 4584,
      "RAW": "c9be3c135a7744fc647d4b7f5d98755144413dc62f743d6236e5055b5b4468c7",
      "LF": "cb94119e2390f9120a43ca8d2689a83232cee1349b979ead049792b350e66176",
      "LFbytes": 4493,
      "nativeEOL": "CRLF",
      "BOM": false
    }
  },
  {
    "path": "Frontend/index.html",
    "windows": [
      {
        "name": "head.sixthStyle",
        "before": "  </head>\n",
        "after": "    <style id=\"katlab-workspace-command-masthead\">\n      /* Workspace Command Masthead: exact current snapshot, clear scope and qualifications. */\n      #root header.app-shell-header > .app-header-primary {\n        grid-template-columns: minmax(0, 1fr);\n        align-items: start;\n      }\n      #root header.app-shell-header > .app-header-primary > .app-header-actions {\n        min-width: 0;\n        align-content: start;\n        justify-content: flex-start;\n      }\n      #root header.app-shell-header > .app-workspace-context {\n        display: grid;\n        grid-template-columns: minmax(0, 1fr);\n        align-items: start;\n        gap: 1rem;\n        padding: 1.25rem 0;\n      }\n      #root header.app-shell-header > .app-workspace-context > .workspace-command-brief {\n        display: grid;\n        min-width: 0;\n        gap: 0.5rem;\n      }\n      #root header.app-shell-header > .app-workspace-context > .workspace-command-brief > [data-workspace-command-scope] {\n        color: rgb(var(--ui-text));\n        font-size: 1.25rem;\n        font-weight: 600;\n        line-height: 1.4;\n        overflow-wrap: anywhere;\n      }\n      #root header.app-shell-header > .app-workspace-context > .workspace-command-brief > [data-workspace-command-summary] {\n        min-width: 0;\n        color: rgb(var(--ui-text));\n        font-size: 1rem;\n        line-height: 1.5;\n        overflow-wrap: anywhere;\n      }\n      #root header.app-shell-header > .app-workspace-context > .workspace-command-brief > .workspace-command-details {\n        display: flex;\n        min-width: 0;\n        flex-wrap: wrap;\n        gap: 0.5rem 1rem;\n        font-size: 0.8125rem;\n        line-height: 1.5;\n      }\n      #root header.app-shell-header > .app-workspace-context > .workspace-command-brief > .workspace-command-details:empty {\n        display: none;\n      }\n      #root header.app-shell-header > .app-workspace-context > .workspace-command-brief > .workspace-command-details > span {\n        min-width: 0;\n        overflow-wrap: anywhere;\n      }\n      #root header.app-shell-header > .app-workspace-context > .ui-control {\n        justify-self: start;\n        margin-left: 0;\n        min-height: 2.75rem;\n        padding: 0.5rem 0.75rem;\n        font-size: 0.875rem;\n        line-height: 1.5;\n      }\n      @media (min-width: 768px) {\n        #root header.app-shell-header > .app-workspace-context {\n          grid-template-columns: minmax(0, 1fr) max-content;\n        }\n      }\n      @media (min-width: 1280px) {\n        #root header.app-shell-header > .app-header-primary {\n          grid-template-columns: minmax(0, max-content) minmax(0, 1fr);\n        }\n      }\n    </style>\n  </head>\n",
        "count": 1
      }
    ],
    "before": {
      "bytes": 17392,
      "RAW": "266658d8cb9b3e62fc6eda027ea7bffafdbf38a708f2363d31047fb521376870",
      "LF": "266658d8cb9b3e62fc6eda027ea7bffafdbf38a708f2363d31047fb521376870",
      "LFbytes": 17392,
      "nativeEOL": "LF",
      "BOM": false
    },
    "after": {
      "bytes": 20053,
      "RAW": "990d363cfca31da051a86776750d29daa21f69c5043286801c6a84011353885b",
      "LF": "990d363cfca31da051a86776750d29daa21f69c5043286801c6a84011353885b",
      "LFbytes": 20053,
      "nativeEOL": "LF",
      "BOM": false
    }
  }
]);
export const MASTHEAD_SUITES = frozen([
  {
    "path": "Tests/test_achievement_gallery.mjs",
    "before": {
      "bytes": 36359,
      "RAW": "998839d552c9763a3b1022df7137fa4c121645e289e37cc3aa0a45dda9b1bf5b",
      "LF": "998839d552c9763a3b1022df7137fa4c121645e289e37cc3aa0a45dda9b1bf5b",
      "LFbytes": 36359,
      "nativeEOL": "LF",
      "BOM": false
    },
    "after": {
      "bytes": 36466,
      "RAW": "67c15a932a2631200de59ea084f26beeec0b92eddbc9a34487f75b2326c1fbd0",
      "LF": "67c15a932a2631200de59ea084f26beeec0b92eddbc9a34487f75b2326c1fbd0",
      "LFbytes": 36466,
      "nativeEOL": "LF",
      "BOM": false
    },
    "windows": [
      {
        "name": "oneHelperImport",
        "before": "import { deskPreservation } from \"./helpers/changesReviewLanes.mjs\";\n",
        "after": "import { mastheadPreservation } from \"./helpers/workspaceCommandMasthead.mjs\";\nimport { deskPreservation } from \"./helpers/changesReviewLanes.mjs\";\n",
        "count": 1
      },
      {
        "name": "preservationInput.line255",
        "before": "    const bytes = deskPreservation(name, readFileSync(resolve(root, name))); assert.equal(sha(bytes), raw, name + \" RAW\");\n",
        "after": "    const bytes = deskPreservation(name, mastheadPreservation(name, readFileSync(resolve(root, name)))); assert.equal(sha(bytes), raw, name + \" RAW\");\n",
        "count": 1
      }
    ]
  },
  {
    "path": "Tests/test_active_plan_gallery.mjs",
    "before": {
      "bytes": 31849,
      "RAW": "01b75ba1e91bc1e4f1754bdb9d358b461e12db313fd3d7e8f18aad6ae553172d",
      "LF": "01b75ba1e91bc1e4f1754bdb9d358b461e12db313fd3d7e8f18aad6ae553172d",
      "LFbytes": 31849,
      "nativeEOL": "LF",
      "BOM": false
    },
    "after": {
      "bytes": 31956,
      "RAW": "f9cc7cc465e552eafd761ca34ac424f83f35c7139cbf1b2d592a207f0ebaa492",
      "LF": "f9cc7cc465e552eafd761ca34ac424f83f35c7139cbf1b2d592a207f0ebaa492",
      "LFbytes": 31956,
      "nativeEOL": "LF",
      "BOM": false
    },
    "windows": [
      {
        "name": "oneHelperImport",
        "before": "import { deskPreservation } from \"./helpers/changesReviewLanes.mjs\";\n",
        "after": "import { mastheadPreservation } from \"./helpers/workspaceCommandMasthead.mjs\";\nimport { deskPreservation } from \"./helpers/changesReviewLanes.mjs\";\n",
        "count": 1
      },
      {
        "name": "preservationInput.line225",
        "before": "    const current = deskPreservation(path, read(path)); ending(current); assert.equal(sha(current), rawPin, path); assert.equal(sha(lf(current)), lfPin, path);\n",
        "after": "    const current = deskPreservation(path, mastheadPreservation(path, read(path))); ending(current); assert.equal(sha(current), rawPin, path); assert.equal(sha(lf(current)), lfPin, path);\n",
        "count": 1
      }
    ]
  },
  {
    "path": "Tests/test_attribution_station.mjs",
    "before": {
      "bytes": 41894,
      "RAW": "23d84c9875998e3be3b3396127b9d9811d008531058c932f009db106d7943a94",
      "LF": "23d84c9875998e3be3b3396127b9d9811d008531058c932f009db106d7943a94",
      "LFbytes": 41894,
      "nativeEOL": "LF",
      "BOM": false
    },
    "after": {
      "bytes": 42112,
      "RAW": "0c26835b1a6a6af2fc95e92484021b229bbfb1435beab4d114f0c32d03ab989d",
      "LF": "0c26835b1a6a6af2fc95e92484021b229bbfb1435beab4d114f0c32d03ab989d",
      "LFbytes": 42112,
      "nativeEOL": "LF",
      "BOM": false
    },
    "windows": [
      {
        "name": "oneHelperImport",
        "before": "import { deskPreservation } from \"./helpers/changesReviewLanes.mjs\";\n",
        "after": "import { mastheadPreservation } from \"./helpers/workspaceCommandMasthead.mjs\";\nimport { deskPreservation } from \"./helpers/changesReviewLanes.mjs\";\n",
        "count": 1
      },
      {
        "name": "preservationInput.line18",
        "before": "  if (name === \"Frontend/index.html\") return studioHtml(deskPreservation(name, text));\n",
        "after": "  if (name === \"Frontend/index.html\") return studioHtml(deskPreservation(name, mastheadPreservation(name, text)));\n",
        "count": 1
      },
      {
        "name": "preservationInput.line19",
        "before": "  if (name === \"Tests/test_workbench_2_0.mjs\") return studioWorkbench(deskPreservation(name, text));\n",
        "after": "  if (name === \"Tests/test_workbench_2_0.mjs\") return studioWorkbench(deskPreservation(name, mastheadPreservation(name, text)));\n",
        "count": 1
      },
      {
        "name": "preservationInput.line20",
        "before": "  if (name === \"Tests/test_changes_review_desk.mjs\") return studioChanges(deskPreservation(name, text));\n",
        "after": "  if (name === \"Tests/test_changes_review_desk.mjs\") return studioChanges(deskPreservation(name, mastheadPreservation(name, text)));\n",
        "count": 1
      },
      {
        "name": "preservationInput.line413",
        "before": "    const text = deskPreservation(name, read(name)); assert.equal(sha(text), raw, name + \" RAW\"); assert.equal(sha(lf(text)), normalized, name + \" LF\");\n",
        "after": "    const text = deskPreservation(name, mastheadPreservation(name, read(name))); assert.equal(sha(text), raw, name + \" RAW\"); assert.equal(sha(lf(text)), normalized, name + \" LF\");\n",
        "count": 1
      },
      {
        "name": "intentionalCurrentCopyExpectation",
        "before": "    assert.match(html, /No tasks defined/); assert.doesNotMatch(html, /aria-haspopup=\"dialog\"/);\n",
        "after": "    assert.match(html, /No task choices are available for this event/); assert.doesNotMatch(html, /aria-haspopup=\"dialog\"/);\n",
        "count": 1
      },
      {
        "name": "intentionalCurrentCopyTitle",
        "before": "test(\"candidates, row callbacks, retry/busy states and unchanged zero-choice guidance\", () => {\n",
        "after": "test(\"candidates, row callbacks, retry/busy states and truthful zero-choice guidance\", () => {\n",
        "count": 1
      }
    ]
  },
  {
    "path": "Tests/test_changes_review_desk.mjs",
    "before": {
      "bytes": 39007,
      "RAW": "1dc6435f26e27a75d59dbdaba9c86fb166b3e1a64586adf1ec165ed455115094",
      "LF": "1dc6435f26e27a75d59dbdaba9c86fb166b3e1a64586adf1ec165ed455115094",
      "LFbytes": 39007,
      "nativeEOL": "LF",
      "BOM": false
    },
    "after": {
      "bytes": 39170,
      "RAW": "d2a748e5e00b5631a588494f157e2b0669dff9a5adda5ad076499b1f98dbd152",
      "LF": "d2a748e5e00b5631a588494f157e2b0669dff9a5adda5ad076499b1f98dbd152",
      "LFbytes": 39170,
      "nativeEOL": "LF",
      "BOM": false
    },
    "windows": [
      {
        "name": "oneHelperImport",
        "before": "import { deskPreservation } from \"./helpers/changesReviewLanes.mjs\";\n",
        "after": "import { mastheadPreservation } from \"./helpers/workspaceCommandMasthead.mjs\";\nimport { deskPreservation } from \"./helpers/changesReviewLanes.mjs\";\n",
        "count": 1
      },
      {
        "name": "preservationInput.line19",
        "before": "  if (name === \"Frontend/index.html\") return restoreAttributionStationHtml(studioHtml(deskPreservation(name, text)));\n",
        "after": "  if (name === \"Frontend/index.html\") return restoreAttributionStationHtml(studioHtml(deskPreservation(name, mastheadPreservation(name, text))));\n",
        "count": 1
      },
      {
        "name": "preservationInput.line20",
        "before": "  if (name === \"Tests/test_workbench_2_0.mjs\") return restoreAttributionWorkbenchSuite(studioWorkbench(deskPreservation(name, text)));\n",
        "after": "  if (name === \"Tests/test_workbench_2_0.mjs\") return restoreAttributionWorkbenchSuite(studioWorkbench(deskPreservation(name, mastheadPreservation(name, text))));\n",
        "count": 1
      },
      {
        "name": "preservationInput.line383",
        "before": "    const text = deskPreservation(name, read(name)); assert.equal(sha(text), raw, name + \" RAW\");\n",
        "after": "    const text = deskPreservation(name, mastheadPreservation(name, read(name))); assert.equal(sha(text), raw, name + \" RAW\");\n",
        "count": 1
      }
    ]
  },
  {
    "path": "Tests/test_changes_review_lanes.mjs",
    "before": {
      "bytes": 37833,
      "RAW": "c0ce9e2490c43f35fb34bfe1ebc8518d16b54c99e9d34871ad015dbda936caf9",
      "LF": "c0ce9e2490c43f35fb34bfe1ebc8518d16b54c99e9d34871ad015dbda936caf9",
      "LFbytes": 37833,
      "nativeEOL": "LF",
      "BOM": false
    },
    "after": {
      "bytes": 37992,
      "RAW": "0e20707dadd34b3f5faae559c62b45fc41e909edc620064eeda588286105020b",
      "LF": "0e20707dadd34b3f5faae559c62b45fc41e909edc620064eeda588286105020b",
      "LFbytes": 37992,
      "nativeEOL": "LF",
      "BOM": false
    },
    "windows": [
      {
        "name": "oneHelperImport",
        "before": "// Current source executes below; published 3.0 references are immutable DATA only.\n",
        "after": "import { mastheadPreservation } from \"./helpers/workspaceCommandMasthead.mjs\";\n// Current source executes below; published 3.0 references are immutable DATA only.\n",
        "count": 1
      },
      {
        "name": "wholeOriginalInput",
        "before": "    const current = readFileSync(resolve(ROOT, record.path));\n",
        "after": "    const current = mastheadPreservation(record.path, readFileSync(resolve(ROOT, record.path)));\n",
        "count": 1
      },
      {
        "name": "fifthHistoricalHtmlOnly",
        "before": "  const html=htmlRaw.toString(\"utf8\");\n",
        "after": "  const html=mastheadPreservation(\"Frontend/index.html\", htmlRaw).toString(\"utf8\");\n",
        "count": 1
      }
    ]
  },
  {
    "path": "Tests/test_chronicle_reader_canvas.mjs",
    "before": {
      "bytes": 19142,
      "RAW": "d3e6566cc88e6d897e4231fdddb9494a9a41c162bc6fa27ca976a0040aac489a",
      "LF": "d3e6566cc88e6d897e4231fdddb9494a9a41c162bc6fa27ca976a0040aac489a",
      "LFbytes": 19142,
      "nativeEOL": "LF",
      "BOM": false
    },
    "after": {
      "bytes": 19249,
      "RAW": "d0e01004dbc0d86e89f2893398b10cd869eaa89c0b925e0eaf9875b36b92026c",
      "LF": "d0e01004dbc0d86e89f2893398b10cd869eaa89c0b925e0eaf9875b36b92026c",
      "LFbytes": 19249,
      "nativeEOL": "LF",
      "BOM": false
    },
    "windows": [
      {
        "name": "oneHelperImport",
        "before": "import { deskPreservation } from \"./helpers/changesReviewLanes.mjs\";\n",
        "after": "import { mastheadPreservation } from \"./helpers/workspaceCommandMasthead.mjs\";\nimport { deskPreservation } from \"./helpers/changesReviewLanes.mjs\";\n",
        "count": 1
      },
      {
        "name": "preservationInput.line248",
        "before": "    const value = deskPreservation(path, read(path)); assert.equal(sha(value), raw, path); assert.equal(sha(lf(value)), normalized, path);\n",
        "after": "    const value = deskPreservation(path, mastheadPreservation(path, read(path))); assert.equal(sha(value), raw, path); assert.equal(sha(lf(value)), normalized, path);\n",
        "count": 1
      }
    ]
  },
  {
    "path": "Tests/test_diagnostic_studio.mjs",
    "before": {
      "bytes": 40235,
      "RAW": "b72b2c54b1e32f712f81ac988612d52b7116ba8aa61a591319b0ceda7f928854",
      "LF": "b72b2c54b1e32f712f81ac988612d52b7116ba8aa61a591319b0ceda7f928854",
      "LFbytes": 40235,
      "nativeEOL": "LF",
      "BOM": false
    },
    "after": {
      "bytes": 40491,
      "RAW": "0151a157766429e4c59d83e32df1d37f12a3143356762ae2ae825892f2f97c8e",
      "LF": "0151a157766429e4c59d83e32df1d37f12a3143356762ae2ae825892f2f97c8e",
      "LFbytes": 40491,
      "nativeEOL": "LF",
      "BOM": false
    },
    "windows": [
      {
        "name": "oneHelperImport",
        "before": "import { deskPreservation } from \"./helpers/changesReviewLanes.mjs\";\n",
        "after": "import { mastheadPreservation } from \"./helpers/workspaceCommandMasthead.mjs\";\nimport { deskPreservation } from \"./helpers/changesReviewLanes.mjs\";\n",
        "count": 1
      },
      {
        "name": "preservationInput.line359",
        "before": "  const source = deskPreservation(\"Frontend/index.html\", read(\"Frontend/index.html\")); assert.equal(ending(source), \"\\n\");\n",
        "after": "  const source = deskPreservation(\"Frontend/index.html\", mastheadPreservation(\"Frontend/index.html\", read(\"Frontend/index.html\"))); assert.equal(ending(source), \"\\n\");\n",
        "count": 1
      },
      {
        "name": "preservationInput.line372",
        "before": "  const source = deskPreservation(\"Frontend/index.html\", read(\"Frontend/index.html\")), original = independentHtmlInverse(source);\n",
        "after": "  const source = deskPreservation(\"Frontend/index.html\", mastheadPreservation(\"Frontend/index.html\", read(\"Frontend/index.html\"))), original = independentHtmlInverse(source);\n",
        "count": 1
      },
      {
        "name": "preservationInput.line413",
        "before": "    const source = deskPreservation(spec[1], read(spec[1])), [, , restore, bytes, lines, pin, , imported, current] = spec;\n",
        "after": "    const source = deskPreservation(spec[1], mastheadPreservation(spec[1], read(spec[1]))), [, , restore, bytes, lines, pin, , imported, current] = spec;\n",
        "count": 1
      },
      {
        "name": "preservationInput.line437",
        "before": "    const raw = deskPreservation(name, readFileSync(resolve(root, name))), text = deskPreservation(name, read(name));\n",
        "after": "    const raw = deskPreservation(name, mastheadPreservation(name, readFileSync(resolve(root, name)))), text = deskPreservation(name, mastheadPreservation(name, read(name)));\n",
        "count": 1
      }
    ]
  },
  {
    "path": "Tests/test_diff_availability.mjs",
    "before": {
      "bytes": 31413,
      "RAW": "e400426edb98460a81a2cb53f5e6cc126acfdd8c9680c707621c2e5467b824ba",
      "LF": "e400426edb98460a81a2cb53f5e6cc126acfdd8c9680c707621c2e5467b824ba",
      "LFbytes": 31413,
      "nativeEOL": "LF",
      "BOM": false
    },
    "after": {
      "bytes": 31754,
      "RAW": "50b08909feb559c33a591608f34be259d3e4927629e0be2883db8dc94f802296",
      "LF": "50b08909feb559c33a591608f34be259d3e4927629e0be2883db8dc94f802296",
      "LFbytes": 31754,
      "nativeEOL": "LF",
      "BOM": false
    },
    "windows": [
      {
        "name": "oneHelperImport",
        "before": "import { deskPreservation } from \"./helpers/changesReviewLanes.mjs\";\n",
        "after": "import { mastheadPreservation } from \"./helpers/workspaceCommandMasthead.mjs\";\nimport { deskPreservation } from \"./helpers/changesReviewLanes.mjs\";\n",
        "count": 1
      },
      {
        "name": "preservationInput.line467",
        "before": "  const lf = restoreWarningTimestampOrder(restoreGitGraphBoundaryCopy(restoreChangesWorkbench(deskPreservation(\"Frontend/src/App.tsx\", read(\"App.tsx\"))))).replace(/\\r\\n/g, \"\\n\");\n",
        "after": "  const lf = restoreWarningTimestampOrder(restoreGitGraphBoundaryCopy(restoreChangesWorkbench(deskPreservation(\"Frontend/src/App.tsx\", mastheadPreservation(\"Frontend/src/App.tsx\", read(\"App.tsx\")))))).replace(/\\r\\n/g, \"\\n\");\n",
        "count": 1
      },
      {
        "name": "preservationInput.line494",
        "before": "  const source = deskPreservation(\"Frontend/src/App.tsx\", read(\"App.tsx\")).replace(/\\r\\n/g, \"\\n\");\n",
        "after": "  const source = deskPreservation(\"Frontend/src/App.tsx\", mastheadPreservation(\"Frontend/src/App.tsx\", read(\"App.tsx\"))).replace(/\\r\\n/g, \"\\n\");\n",
        "count": 1
      },
      {
        "name": "preservationInput.line522",
        "before": "  const source = deskPreservation(\"Frontend/src/App.tsx\", read(\"App.tsx\"));\n",
        "after": "  const source = deskPreservation(\"Frontend/src/App.tsx\", mastheadPreservation(\"Frontend/src/App.tsx\", read(\"App.tsx\")));\n",
        "count": 1
      },
      {
        "name": "preservationInput.line531",
        "before": "  const currentLF = deskPreservation(\"Tests/test_diff_availability.mjs\", readFileSync(fileURLToPath(import.meta.url), \"utf8\")).replace(/\\r\\n/g, \"\\n\");\n",
        "after": "  const currentLF = deskPreservation(\"Tests/test_diff_availability.mjs\", mastheadPreservation(\"Tests/test_diff_availability.mjs\", readFileSync(fileURLToPath(import.meta.url), \"utf8\"))).replace(/\\r\\n/g, \"\\n\");\n",
        "count": 1
      },
      {
        "name": "preservationInput.line532",
        "before": "  const historyLF = restoreGitGraphOracleAdapters(\"test_history_graph_read_states.mjs\", restoreChangesWorkbenchOracleAdapters(\"test_history_graph_read_states.mjs\", deskPreservation(\"Tests/test_history_graph_read_states.mjs\", readFileSync(resolve(root, \"Tests/test_history_graph_read_states.mjs\"), \"utf8\")))).replace(/\\r\\n/g, \"\\n\");\n",
        "after": "  const historyLF = restoreGitGraphOracleAdapters(\"test_history_graph_read_states.mjs\", restoreChangesWorkbenchOracleAdapters(\"test_history_graph_read_states.mjs\", deskPreservation(\"Tests/test_history_graph_read_states.mjs\", mastheadPreservation(\"Tests/test_history_graph_read_states.mjs\", readFileSync(resolve(root, \"Tests/test_history_graph_read_states.mjs\"), \"utf8\"))))).replace(/\\r\\n/g, \"\\n\");\n",
        "count": 1
      }
    ]
  },
  {
    "path": "Tests/test_git_graph_merge_seed.mjs",
    "before": {
      "bytes": 23713,
      "RAW": "a58df616a49166e9bc7a4c01f2a736e247c1a6bae6c01a29dc48da50a2555144",
      "LF": "a58df616a49166e9bc7a4c01f2a736e247c1a6bae6c01a29dc48da50a2555144",
      "LFbytes": 23713,
      "nativeEOL": "LF",
      "BOM": false
    },
    "after": {
      "bytes": 23974,
      "RAW": "1d64d2437d8a4752e7b29fe32562a04c08471cb32d0d22a48e644352ca518aae",
      "LF": "1d64d2437d8a4752e7b29fe32562a04c08471cb32d0d22a48e644352ca518aae",
      "LFbytes": 23974,
      "nativeEOL": "LF",
      "BOM": false
    },
    "windows": [
      {
        "name": "oneHelperImport",
        "before": "import { deskPreservation } from \"./helpers/changesReviewLanes.mjs\";\n",
        "after": "import { mastheadPreservation } from \"./helpers/workspaceCommandMasthead.mjs\";\nimport { deskPreservation } from \"./helpers/changesReviewLanes.mjs\";\n",
        "count": 1
      },
      {
        "name": "preservationInput.line276",
        "before": "const appSource = restoreChangesWorkbench(deskPreservation(\"Frontend/src/App.tsx\", read(\"Frontend/src/App.tsx\")));\n",
        "after": "const appSource = restoreChangesWorkbench(deskPreservation(\"Frontend/src/App.tsx\", mastheadPreservation(\"Frontend/src/App.tsx\", read(\"Frontend/src/App.tsx\"))));\n",
        "count": 1
      },
      {
        "name": "preservationInput.line324",
        "before": "    const text = lf(restoreChangesWorkbenchOracleAdapters(name, deskPreservation(`Tests/${name}`, read(`Tests/${name}`)))).replace(/\\n/g, eol);\n",
        "after": "    const text = lf(restoreChangesWorkbenchOracleAdapters(name, deskPreservation(`Tests/${name}`, mastheadPreservation(`Tests/${name}`, read(`Tests/${name}`))))).replace(/\\n/g, eol);\n",
        "count": 1
      },
      {
        "name": "preservationInput.line329",
        "before": "  const prefix = Buffer.from(lf(deskPreservation(\"Tests/test_diff_availability.mjs\", read(\"Tests/test_diff_availability.mjs\")))).subarray(0, 15449);\n",
        "after": "  const prefix = Buffer.from(lf(deskPreservation(\"Tests/test_diff_availability.mjs\", mastheadPreservation(\"Tests/test_diff_availability.mjs\", read(\"Tests/test_diff_availability.mjs\"))))).subarray(0, 15449);\n",
        "count": 1
      },
      {
        "name": "preservationInput.line341",
        "before": "    const source = lf(restoreChangesWorkbenchOracleAdapters(name, deskPreservation(`Tests/${name}`, read(`Tests/${name}`))));\n",
        "after": "    const source = lf(restoreChangesWorkbenchOracleAdapters(name, deskPreservation(`Tests/${name}`, mastheadPreservation(`Tests/${name}`, read(`Tests/${name}`)))));\n",
        "count": 1
      }
    ]
  },
  {
    "path": "Tests/test_history_commit_ledger.mjs",
    "before": {
      "bytes": 27906,
      "RAW": "68e4007f3823ad1b5c581a1680bb805675a2a10c432a1e084ac73b56b6b4c17a",
      "LF": "68e4007f3823ad1b5c581a1680bb805675a2a10c432a1e084ac73b56b6b4c17a",
      "LFbytes": 27906,
      "nativeEOL": "LF",
      "BOM": false
    },
    "after": {
      "bytes": 28064,
      "RAW": "6d7db995d667fc39c8cdb20ad2b8859b59452b489e0b207dc1631d66f80f1db9",
      "LF": "6d7db995d667fc39c8cdb20ad2b8859b59452b489e0b207dc1631d66f80f1db9",
      "LFbytes": 28064,
      "nativeEOL": "LF",
      "BOM": false
    },
    "windows": [
      {
        "name": "oneHelperImport",
        "before": "import { deskPreservation } from \"./helpers/changesReviewLanes.mjs\";\n",
        "after": "import { mastheadPreservation } from \"./helpers/workspaceCommandMasthead.mjs\";\nimport { deskPreservation } from \"./helpers/changesReviewLanes.mjs\";\n",
        "count": 1
      },
      {
        "name": "preservationInput.line237",
        "before": "    const text = deskPreservation(name, read(name)); ending(text); assert.equal(sha(text), rawPin, name); assert.equal(sha(lf(text)), lfPin, name);\n",
        "after": "    const text = deskPreservation(name, mastheadPreservation(name, read(name))); ending(text); assert.equal(sha(text), rawPin, name); assert.equal(sha(lf(text)), lfPin, name);\n",
        "count": 1
      },
      {
        "name": "shellPreservationData",
        "before": "const shellSource = read(\"Frontend/src/AppShell.tsx\"), appSource = read(\"Frontend/src/App.tsx\");\n",
        "after": "const shellSource = mastheadPreservation(\"Frontend/src/AppShell.tsx\", read(\"Frontend/src/AppShell.tsx\")), appSource = read(\"Frontend/src/App.tsx\");\n",
        "count": 1
      }
    ]
  },
  {
    "path": "Tests/test_history_graph_read_states.mjs",
    "before": {
      "bytes": 27328,
      "RAW": "cd32eecf474afcdcb0a1eb94612c7fc4a4261184d55f5f036d5f9160c8418cd5",
      "LF": "cd32eecf474afcdcb0a1eb94612c7fc4a4261184d55f5f036d5f9160c8418cd5",
      "LFbytes": 27328,
      "nativeEOL": "LF",
      "BOM": false
    },
    "after": {
      "bytes": 27637,
      "RAW": "5417c99a9163d84f48ecee631e87eaa105de4b890e2a09cd99d5fa153d9f2df7",
      "LF": "5417c99a9163d84f48ecee631e87eaa105de4b890e2a09cd99d5fa153d9f2df7",
      "LFbytes": 27637,
      "nativeEOL": "LF",
      "BOM": false
    },
    "windows": [
      {
        "name": "oneHelperImport",
        "before": "import { deskPreservation } from \"./helpers/changesReviewLanes.mjs\";\n",
        "after": "import { mastheadPreservation } from \"./helpers/workspaceCommandMasthead.mjs\";\nimport { deskPreservation } from \"./helpers/changesReviewLanes.mjs\";\n",
        "count": 1
      },
      {
        "name": "preservationInput.line426",
        "before": "  const lf = deskPreservation(\"Frontend/src/App.tsx\", source).replace(/\\r\\n/g, \"\\n\");\n",
        "after": "  const lf = deskPreservation(\"Frontend/src/App.tsx\", mastheadPreservation(\"Frontend/src/App.tsx\", source)).replace(/\\r\\n/g, \"\\n\");\n",
        "count": 1
      },
      {
        "name": "preservationInput.line442",
        "before": "    assert.throws(() => checkPreservation(replaceOnce(deskPreservation(\"Frontend/src/App.tsx\", source), gate, modified)), /complete bottom gate/);\n",
        "after": "    assert.throws(() => checkPreservation(replaceOnce(deskPreservation(\"Frontend/src/App.tsx\", mastheadPreservation(\"Frontend/src/App.tsx\", source)), gate, modified)), /complete bottom gate/);\n",
        "count": 1
      },
      {
        "name": "preservationInput.line448",
        "before": "  assert.throws(() => checkPreservation(replaceOnce(deskPreservation(\"Frontend/src/App.tsx\", source), owner,\n",
        "after": "  assert.throws(() => checkPreservation(replaceOnce(deskPreservation(\"Frontend/src/App.tsx\", mastheadPreservation(\"Frontend/src/App.tsx\", source)), owner,\n",
        "count": 1
      },
      {
        "name": "preservationInput.line450",
        "before": "  assert.throws(() => checkPreservation(replaceOnce(deskPreservation(\"Frontend/src/App.tsx\", source),\n",
        "after": "  assert.throws(() => checkPreservation(replaceOnce(deskPreservation(\"Frontend/src/App.tsx\", mastheadPreservation(\"Frontend/src/App.tsx\", source)),\n",
        "count": 1
      },
      {
        "name": "preservationInput.line457",
        "before": "  ]) assert.throws(() => checkPreservation(replaceOnce(deskPreservation(\"Frontend/src/App.tsx\", source), oldGraph,\n",
        "after": "  ]) assert.throws(() => checkPreservation(replaceOnce(deskPreservation(\"Frontend/src/App.tsx\", mastheadPreservation(\"Frontend/src/App.tsx\", source)), oldGraph,\n",
        "count": 1
      }
    ]
  },
  {
    "path": "Tests/test_mission_command_desk.mjs",
    "before": {
      "bytes": 53120,
      "RAW": "2e33740c981045efd9c39fcd57d802d99419029810bc58d70a99a42b0a4f54e4",
      "LF": "2e33740c981045efd9c39fcd57d802d99419029810bc58d70a99a42b0a4f54e4",
      "LFbytes": 53120,
      "nativeEOL": "LF",
      "BOM": false
    },
    "after": {
      "bytes": 53352,
      "RAW": "e1a07f48051dbbaef61beb6b3ec76f37fdbb7fdb25d7137dec80bd721c76d96a",
      "LF": "e1a07f48051dbbaef61beb6b3ec76f37fdbb7fdb25d7137dec80bd721c76d96a",
      "LFbytes": 53352,
      "nativeEOL": "LF",
      "BOM": false
    },
    "windows": [
      {
        "name": "oneHelperImport",
        "before": "import assert from \"node:assert/strict\";\n",
        "after": "import { mastheadPreservation } from \"./helpers/workspaceCommandMasthead.mjs\";\nimport assert from \"node:assert/strict\";\n",
        "count": 1
      },
      {
        "name": "preservationInput.line582",
        "before": "    const actual = reviewLanesPreservation(path, read(path));\n",
        "after": "    const actual = reviewLanesPreservation(path, mastheadPreservation(path, read(path)));\n",
        "count": 1
      },
      {
        "name": "preservationInput.line601",
        "before": "    const actual = reviewLanesPreservation(path, read(path)); strictBytes(actual);\n",
        "after": "    const actual = reviewLanesPreservation(path, mastheadPreservation(path, read(path))); strictBytes(actual);\n",
        "count": 1
      },
      {
        "name": "preservationInput.line615",
        "before": "    const value = reviewLanesPreservation(path, read(path));\n",
        "after": "    const value = reviewLanesPreservation(path, mastheadPreservation(path, read(path)));\n",
        "count": 1
      },
      {
        "name": "preservationInput.line624",
        "before": "  const app = reviewLanesPreservation(SOURCE_PINS[0][0], read(SOURCE_PINS[0][0])).toString(\"utf8\");\n",
        "after": "  const app = reviewLanesPreservation(SOURCE_PINS[0][0], mastheadPreservation(SOURCE_PINS[0][0], read(SOURCE_PINS[0][0]))).toString(\"utf8\");\n",
        "count": 1
      },
      {
        "name": "preservationInput.line640",
        "before": "    const actual = reviewLanesPreservation(path, read(path)).toString(\"utf8\");\n",
        "after": "    const actual = reviewLanesPreservation(path, mastheadPreservation(path, read(path))).toString(\"utf8\");\n",
        "count": 1
      }
    ]
  },
  {
    "path": "Tests/test_mission_control_workbench.mjs",
    "before": {
      "bytes": 33334,
      "RAW": "537e31ffb975da8bd3ae17107cdb1e0fd844baf4b7e13bee828067cc0f06cad1",
      "LF": "537e31ffb975da8bd3ae17107cdb1e0fd844baf4b7e13bee828067cc0f06cad1",
      "LFbytes": 33334,
      "nativeEOL": "LF",
      "BOM": false
    },
    "after": {
      "bytes": 33687,
      "RAW": "bd6f0a02504a007940b5a5b3dd95e0050714af6ffd6148619f4a6e9d92121ab9",
      "LF": "bd6f0a02504a007940b5a5b3dd95e0050714af6ffd6148619f4a6e9d92121ab9",
      "LFbytes": 33687,
      "nativeEOL": "LF",
      "BOM": false
    },
    "windows": [
      {
        "name": "oneHelperImport",
        "before": "import { deskPreservation } from \"./helpers/changesReviewLanes.mjs\";\n",
        "after": "import { mastheadPreservation } from \"./helpers/workspaceCommandMasthead.mjs\";\nimport { deskPreservation } from \"./helpers/changesReviewLanes.mjs\";\n",
        "count": 1
      },
      {
        "name": "preservationInput.line67",
        "before": "    const current = lf(deskPreservation(\"Frontend/src/App.tsx\", appSource)).replace(/\\n/g, eol), restored = restoreChangesWorkbench(current);\n",
        "after": "    const current = lf(deskPreservation(\"Frontend/src/App.tsx\", mastheadPreservation(\"Frontend/src/App.tsx\", appSource))).replace(/\\n/g, eol), restored = restoreChangesWorkbench(current);\n",
        "count": 1
      },
      {
        "name": "preservationInput.line82",
        "before": "  const source = lf(deskPreservation(\"Frontend/src/App.tsx\", appSource)), actualOwner = owner(parse(source), \"ChangesView\");\n",
        "after": "  const source = lf(deskPreservation(\"Frontend/src/App.tsx\", mastheadPreservation(\"Frontend/src/App.tsx\", appSource))), actualOwner = owner(parse(source), \"ChangesView\");\n",
        "count": 1
      },
      {
        "name": "preservationInput.line116",
        "before": "    const source = lf(deskPreservation(\"Frontend/src/App.tsx\", appSource)).replace(/\\n/g, eol), modified = replaceOnce(source, before, after);\n",
        "after": "    const source = lf(deskPreservation(\"Frontend/src/App.tsx\", mastheadPreservation(\"Frontend/src/App.tsx\", appSource))).replace(/\\n/g, eol), modified = replaceOnce(source, before, after);\n",
        "count": 1
      },
      {
        "name": "preservationInput.line127",
        "before": "    const source = lf(deskPreservation(`Tests/${name}`, read(`Tests/${name}`))).replace(/\\n/g, eol);\n",
        "after": "    const source = lf(deskPreservation(`Tests/${name}`, mastheadPreservation(`Tests/${name}`, read(`Tests/${name}`)))).replace(/\\n/g, eol);\n",
        "count": 1
      },
      {
        "name": "preservationInput.line132",
        "before": "  const prefix = Buffer.from(lf(deskPreservation(\"Tests/test_diff_availability.mjs\", read(\"Tests/test_diff_availability.mjs\")))).subarray(0, 15449);\n",
        "after": "  const prefix = Buffer.from(lf(deskPreservation(\"Tests/test_diff_availability.mjs\", mastheadPreservation(\"Tests/test_diff_availability.mjs\", read(\"Tests/test_diff_availability.mjs\"))))).subarray(0, 15449);\n",
        "count": 1
      },
      {
        "name": "preservationInput.line140",
        "before": "    const source = lf(deskPreservation(`Tests/${name}`, read(`Tests/${name}`)));\n",
        "after": "    const source = lf(deskPreservation(`Tests/${name}`, mastheadPreservation(`Tests/${name}`, read(`Tests/${name}`))));\n",
        "count": 1
      }
    ]
  },
  {
    "path": "Tests/test_mission_plan_gallery.mjs",
    "before": {
      "bytes": 18832,
      "RAW": "06fef08b614a6cd801f02c1494d0c35bd3a813e113b6c125613d8c5ff6ee2c43",
      "LF": "06fef08b614a6cd801f02c1494d0c35bd3a813e113b6c125613d8c5ff6ee2c43",
      "LFbytes": 18832,
      "nativeEOL": "LF",
      "BOM": false
    },
    "after": {
      "bytes": 18939,
      "RAW": "186e551a150f9409365a2f31f5177ab62eca0a33d442cf40886894b9a857d320",
      "LF": "186e551a150f9409365a2f31f5177ab62eca0a33d442cf40886894b9a857d320",
      "LFbytes": 18939,
      "nativeEOL": "LF",
      "BOM": false
    },
    "windows": [
      {
        "name": "oneHelperImport",
        "before": "import { deskPreservation } from \"./helpers/changesReviewLanes.mjs\";\n",
        "after": "import { mastheadPreservation } from \"./helpers/workspaceCommandMasthead.mjs\";\nimport { deskPreservation } from \"./helpers/changesReviewLanes.mjs\";\n",
        "count": 1
      },
      {
        "name": "preservationInput.line217",
        "before": "    const raw = deskPreservation(name, read(name)); ending(raw);\n",
        "after": "    const raw = deskPreservation(name, mastheadPreservation(name, read(name))); ending(raw);\n",
        "count": 1
      }
    ]
  },
  {
    "path": "Tests/test_momentum_comparison_deck.mjs",
    "before": {
      "bytes": 29785,
      "RAW": "be2c38105b75d27dcdc9138455762b5d65352482c5a00c427ea0a79316899c3c",
      "LF": "be2c38105b75d27dcdc9138455762b5d65352482c5a00c427ea0a79316899c3c",
      "LFbytes": 29785,
      "nativeEOL": "LF",
      "BOM": false
    },
    "after": {
      "bytes": 29892,
      "RAW": "49684cfe5f4300d3370edcb2ae3308d457f59e80ccb29d3ed7ce358ff842b656",
      "LF": "49684cfe5f4300d3370edcb2ae3308d457f59e80ccb29d3ed7ce358ff842b656",
      "LFbytes": 29892,
      "nativeEOL": "LF",
      "BOM": false
    },
    "windows": [
      {
        "name": "oneHelperImport",
        "before": "import { deskPreservation } from \"./helpers/changesReviewLanes.mjs\";\n",
        "after": "import { mastheadPreservation } from \"./helpers/workspaceCommandMasthead.mjs\";\nimport { deskPreservation } from \"./helpers/changesReviewLanes.mjs\";\n",
        "count": 1
      },
      {
        "name": "preservationInput.line248",
        "before": "    const bytes = deskPreservation(path, readFileSync(resolve(root, path))); assert.equal(sha(bytes), raw, path + \" RAW\");\n",
        "after": "    const bytes = deskPreservation(path, mastheadPreservation(path, readFileSync(resolve(root, path)))); assert.equal(sha(bytes), raw, path + \" RAW\");\n",
        "count": 1
      }
    ]
  },
  {
    "path": "Tests/test_operational_views.mjs",
    "before": {
      "bytes": 38149,
      "RAW": "f0df8c4b7647e5d0c5a1c214b3e55d3baf4e308f7c9c6cd814334de4d17cc920",
      "LF": "c379b7148fc1bd06c9c5c9ccc5573522b09aa8426660c096b74466333958aff8",
      "LFbytes": 37533,
      "nativeEOL": "CRLF",
      "BOM": false
    },
    "after": {
      "bytes": 38275,
      "RAW": "6d0bbe861f7fae63c056dcebcf621908d6d03b1dd61e198645fb68fb0dbbc3dd",
      "LF": "2eec85b92bf134be79e491ce1440df1c6b210a764ea4712911dcfcdf21112110",
      "LFbytes": 37658,
      "nativeEOL": "CRLF",
      "BOM": false
    },
    "windows": [
      {
        "name": "oneHelperImport",
        "before": "import assert from \"node:assert/strict\";\n",
        "after": "import { mastheadPreservation } from \"./helpers/workspaceCommandMasthead.mjs\";\nimport assert from \"node:assert/strict\";\n",
        "count": 1
      },
      {
        "name": "preservationInput.line188",
        "before": "    reviewLanesPreservation(\"Frontend/src/App.tsx\", app.text), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);\n",
        "after": "    reviewLanesPreservation(\"Frontend/src/App.tsx\", mastheadPreservation(\"Frontend/src/App.tsx\", app.text)), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);\n",
        "count": 1
      }
    ]
  },
  {
    "path": "Tests/test_overview_operations_deck.mjs",
    "before": {
      "bytes": 20719,
      "RAW": "9a25059cf6812fd51cf730a70943d56b3c7a2bd4562ea4d592cf21ef83d43d39",
      "LF": "9a25059cf6812fd51cf730a70943d56b3c7a2bd4562ea4d592cf21ef83d43d39",
      "LFbytes": 20719,
      "nativeEOL": "LF",
      "BOM": false
    },
    "after": {
      "bytes": 20837,
      "RAW": "a7977623afb25f1f0e9c67c2ac82abd3c22f7de69d4b5200594ed243851250b3",
      "LF": "a7977623afb25f1f0e9c67c2ac82abd3c22f7de69d4b5200594ed243851250b3",
      "LFbytes": 20837,
      "nativeEOL": "LF",
      "BOM": false
    },
    "windows": [
      {
        "name": "oneHelperImport",
        "before": "import { deskPreservation } from \"./helpers/changesReviewLanes.mjs\";\n",
        "after": "import { mastheadPreservation } from \"./helpers/workspaceCommandMasthead.mjs\";\nimport { deskPreservation } from \"./helpers/changesReviewLanes.mjs\";\n",
        "count": 1
      },
      {
        "name": "preservationInput.line230",
        "before": "    const original = deskPreservation(`Tests/${name}`, read(`Tests/${name}`)); ending(original);\n",
        "after": "    const original = deskPreservation(`Tests/${name}`, mastheadPreservation(`Tests/${name}`, read(`Tests/${name}`))); ending(original);\n",
        "count": 1
      }
    ]
  },
  {
    "path": "Tests/test_personal_records_showcase.mjs",
    "before": {
      "bytes": 32246,
      "RAW": "224f652643b66d016449eb78159b1f7dc815297db7a07526047d8108ee527fd4",
      "LF": "224f652643b66d016449eb78159b1f7dc815297db7a07526047d8108ee527fd4",
      "LFbytes": 32246,
      "nativeEOL": "LF",
      "BOM": false
    },
    "after": {
      "bytes": 32353,
      "RAW": "16051138560daaf5789f854b249b36142be36ab09899adf446ecb2b016d931cb",
      "LF": "16051138560daaf5789f854b249b36142be36ab09899adf446ecb2b016d931cb",
      "LFbytes": 32353,
      "nativeEOL": "LF",
      "BOM": false
    },
    "windows": [
      {
        "name": "oneHelperImport",
        "before": "import { deskPreservation } from \"./helpers/changesReviewLanes.mjs\";\n",
        "after": "import { mastheadPreservation } from \"./helpers/workspaceCommandMasthead.mjs\";\nimport { deskPreservation } from \"./helpers/changesReviewLanes.mjs\";\n",
        "count": 1
      },
      {
        "name": "preservationInput.line259",
        "before": "    const bytes = deskPreservation(path, readFileSync(resolve(root, path))); assert.equal(sha(bytes), raw, path + \" RAW\");\n",
        "after": "    const bytes = deskPreservation(path, mastheadPreservation(path, readFileSync(resolve(root, path)))); assert.equal(sha(bytes), raw, path + \" RAW\");\n",
        "count": 1
      }
    ]
  },
  {
    "path": "Tests/test_provenance_evidence_desk.mjs",
    "before": {
      "bytes": 40428,
      "RAW": "e839aba1876a05a84996579a20875e71174ccd38c994a54a634695291032f6de",
      "LF": "e839aba1876a05a84996579a20875e71174ccd38c994a54a634695291032f6de",
      "LFbytes": 40428,
      "nativeEOL": "LF",
      "BOM": false
    },
    "after": {
      "bytes": 40535,
      "RAW": "2c9de06c35e472b10fbc94bf19ec121299fa194bd786a1e3ff06a428116e2da4",
      "LF": "2c9de06c35e472b10fbc94bf19ec121299fa194bd786a1e3ff06a428116e2da4",
      "LFbytes": 40535,
      "nativeEOL": "LF",
      "BOM": false
    },
    "windows": [
      {
        "name": "oneHelperImport",
        "before": "import { deskPreservation } from \"./helpers/changesReviewLanes.mjs\";\n",
        "after": "import { mastheadPreservation } from \"./helpers/workspaceCommandMasthead.mjs\";\nimport { deskPreservation } from \"./helpers/changesReviewLanes.mjs\";\n",
        "count": 1
      },
      {
        "name": "preservationInput.line269",
        "before": "    const value = deskPreservation(name, read(name)); assert.equal(sha(value), raw, name + \" RAW\"); assert.equal(sha(lf(value)), normalized, name + \" LF\");\n",
        "after": "    const value = deskPreservation(name, mastheadPreservation(name, read(name))); assert.equal(sha(value), raw, name + \" RAW\"); assert.equal(sha(lf(value)), normalized, name + \" LF\");\n",
        "count": 1
      }
    ]
  },
  {
    "path": "Tests/test_release_identity.mjs",
    "before": {
      "bytes": 18489,
      "RAW": "fa9c3243b43841a9d65c28f527a7682c28fb8c897f4079fe8709c7a13b589ba2",
      "LF": "fa9c3243b43841a9d65c28f527a7682c28fb8c897f4079fe8709c7a13b589ba2",
      "LFbytes": 18489,
      "nativeEOL": "LF",
      "BOM": false
    },
    "after": {
      "bytes": 18752,
      "RAW": "8851e25f7e05fa38bc105afebb9722e4aa25b04a6b4e7141726eaf03c9b578fa",
      "LF": "8851e25f7e05fa38bc105afebb9722e4aa25b04a6b4e7141726eaf03c9b578fa",
      "LFbytes": 18752,
      "nativeEOL": "LF",
      "BOM": false
    },
    "windows": [
      {
        "name": "oneHelperImport",
        "before": "import { deskPreservation } from \"./helpers/changesReviewLanes.mjs\";\n",
        "after": "import { mastheadPreservation } from \"./helpers/workspaceCommandMasthead.mjs\";\nimport { deskPreservation } from \"./helpers/changesReviewLanes.mjs\";\n",
        "count": 1
      },
      {
        "name": "preservationInput.line157",
        "before": "    assert.equal(baselineHash(deskPreservation(\"Frontend/src/App.tsx\", text)), \"b8c39e9e4bcf9ce970e4ab56be4b627d776522c580929277eba946368ffbeefb\");\n",
        "after": "    assert.equal(baselineHash(deskPreservation(\"Frontend/src/App.tsx\", mastheadPreservation(\"Frontend/src/App.tsx\", text))), \"b8c39e9e4bcf9ce970e4ab56be4b627d776522c580929277eba946368ffbeefb\");\n",
        "count": 1
      },
      {
        "name": "preservationInput.line162",
        "before": "  const previous = restorePresenceEffects(deskPreservation(\"Frontend/src/App.tsx\", appText));\n",
        "after": "  const previous = restorePresenceEffects(deskPreservation(\"Frontend/src/App.tsx\", mastheadPreservation(\"Frontend/src/App.tsx\", appText)));\n",
        "count": 1
      },
      {
        "name": "preservationInput.line172",
        "before": "    assert.throws(() => baselineHash(deskPreservation(\"Frontend/src/App.tsx\", appText).replace(before, after)), assert.AssertionError);\n",
        "after": "    assert.throws(() => baselineHash(deskPreservation(\"Frontend/src/App.tsx\", mastheadPreservation(\"Frontend/src/App.tsx\", appText)).replace(before, after)), assert.AssertionError);\n",
        "count": 1
      },
      {
        "name": "preservationInput.line179",
        "before": "  assert.notEqual(baselineHash(deskPreservation(\"Frontend/src/App.tsx\", appText).replace(before, \"setWorkspaceReady(false);\")),\n",
        "after": "  assert.notEqual(baselineHash(deskPreservation(\"Frontend/src/App.tsx\", mastheadPreservation(\"Frontend/src/App.tsx\", appText)).replace(before, \"setWorkspaceReady(false);\")),\n",
        "count": 1
      }
    ]
  },
  {
    "path": "Tests/test_repository_profile.mjs",
    "before": {
      "bytes": 25746,
      "RAW": "84aa440bb8d9a3aeb718b45e6b625b58c014c018fe74c27ed897320403d0f105",
      "LF": "84aa440bb8d9a3aeb718b45e6b625b58c014c018fe74c27ed897320403d0f105",
      "LFbytes": 25746,
      "nativeEOL": "LF",
      "BOM": false
    },
    "after": {
      "bytes": 25853,
      "RAW": "a6b2cee7706eefb9f20e089beec193420b1853318dc5375106b2a0faa8aac883",
      "LF": "a6b2cee7706eefb9f20e089beec193420b1853318dc5375106b2a0faa8aac883",
      "LFbytes": 25853,
      "nativeEOL": "LF",
      "BOM": false
    },
    "windows": [
      {
        "name": "oneHelperImport",
        "before": "import { deskPreservation } from \"./helpers/changesReviewLanes.mjs\";\n",
        "after": "import { mastheadPreservation } from \"./helpers/workspaceCommandMasthead.mjs\";\nimport { deskPreservation } from \"./helpers/changesReviewLanes.mjs\";\n",
        "count": 1
      },
      {
        "name": "preservationInput.line212",
        "before": "    const bytes = deskPreservation(name, readFileSync(resolve(root, name)));\n",
        "after": "    const bytes = deskPreservation(name, mastheadPreservation(name, readFileSync(resolve(root, name))));\n",
        "count": 1
      }
    ]
  },
  {
    "path": "Tests/test_repository_scope_picker.mjs",
    "before": {
      "bytes": 23216,
      "RAW": "efa3ebc37005c1b76506392ec524975f2243317197fc3e997962be3f3a5ef71f",
      "LF": "efa3ebc37005c1b76506392ec524975f2243317197fc3e997962be3f3a5ef71f",
      "LFbytes": 23216,
      "nativeEOL": "LF",
      "BOM": false
    },
    "after": {
      "bytes": 23323,
      "RAW": "78a7989c50ce545d49942d87cd9a7de8efd45a4b4e291ea00e274a21e03169f1",
      "LF": "78a7989c50ce545d49942d87cd9a7de8efd45a4b4e291ea00e274a21e03169f1",
      "LFbytes": 23323,
      "nativeEOL": "LF",
      "BOM": false
    },
    "windows": [
      {
        "name": "oneHelperImport",
        "before": "import { deskPreservation } from \"./helpers/changesReviewLanes.mjs\";\n",
        "after": "import { mastheadPreservation } from \"./helpers/workspaceCommandMasthead.mjs\";\nimport { deskPreservation } from \"./helpers/changesReviewLanes.mjs\";\n",
        "count": 1
      },
      {
        "name": "preservationInput.line244",
        "before": "    const current = deskPreservation(path, read(path)); ending(current); assert.equal(sha(current), rawPin, path); assert.equal(sha(lf(current)), lfPin, path);\n",
        "after": "    const current = deskPreservation(path, mastheadPreservation(path, read(path))); ending(current); assert.equal(sha(current), rawPin, path); assert.equal(sha(lf(current)), lfPin, path);\n",
        "count": 1
      }
    ]
  },
  {
    "path": "Tests/test_system_snapshot_panels.mjs",
    "before": {
      "bytes": 47385,
      "RAW": "391528d45529c7f48cc5f978f4a5ec0aa5c3d76b1e0a480ac86b58b37824d0b2",
      "LF": "391528d45529c7f48cc5f978f4a5ec0aa5c3d76b1e0a480ac86b58b37824d0b2",
      "LFbytes": 47385,
      "nativeEOL": "LF",
      "BOM": false
    },
    "after": {
      "bytes": 47492,
      "RAW": "d1749fdcee0e60a84e8760c1a1b9c52069d37396f095ecf285d08198019cba59",
      "LF": "d1749fdcee0e60a84e8760c1a1b9c52069d37396f095ecf285d08198019cba59",
      "LFbytes": 47492,
      "nativeEOL": "LF",
      "BOM": false
    },
    "windows": [
      {
        "name": "oneHelperImport",
        "before": "import { deskPreservation } from \"./helpers/changesReviewLanes.mjs\";\n",
        "after": "import { mastheadPreservation } from \"./helpers/workspaceCommandMasthead.mjs\";\nimport { deskPreservation } from \"./helpers/changesReviewLanes.mjs\";\n",
        "count": 1
      },
      {
        "name": "preservationInput.line409",
        "before": "    const text = deskPreservation(name, read(name)); ending(text);\n",
        "after": "    const text = deskPreservation(name, mastheadPreservation(name, read(name))); ending(text);\n",
        "count": 1
      }
    ]
  },
  {
    "path": "Tests/test_warning_timestamp_order.mjs",
    "before": {
      "bytes": 23832,
      "RAW": "f158bce4600a57589a643840fd0985a7c40af0e787990f3655ade2251d0f9a9d",
      "LF": "f158bce4600a57589a643840fd0985a7c40af0e787990f3655ade2251d0f9a9d",
      "LFbytes": 23832,
      "nativeEOL": "LF",
      "BOM": false
    },
    "after": {
      "bytes": 24127,
      "RAW": "f532ced1a785d5d3c966c164a264fbdcd4e3d664dfbbe650820e94bb31d5a643",
      "LF": "f532ced1a785d5d3c966c164a264fbdcd4e3d664dfbbe650820e94bb31d5a643",
      "LFbytes": 24127,
      "nativeEOL": "LF",
      "BOM": false
    },
    "windows": [
      {
        "name": "oneHelperImport",
        "before": "import { deskPreservation } from \"./helpers/changesReviewLanes.mjs\";\n",
        "after": "import { mastheadPreservation } from \"./helpers/workspaceCommandMasthead.mjs\";\nimport { deskPreservation } from \"./helpers/changesReviewLanes.mjs\";\n",
        "count": 1
      },
      {
        "name": "preservationInput.line241",
        "before": "  const lf = restoreGitGraphBoundaryCopy(restoreChangesWorkbench(deskPreservation(\"Frontend/src/App.tsx\", source))).replace(/\\r\\n/g, \"\\n\");\n",
        "after": "  const lf = restoreGitGraphBoundaryCopy(restoreChangesWorkbench(deskPreservation(\"Frontend/src/App.tsx\", mastheadPreservation(\"Frontend/src/App.tsx\", source)))).replace(/\\r\\n/g, \"\\n\");\n",
        "count": 2
      },
      {
        "name": "preservationInput.line265",
        "before": "  const lf = restoreGitGraphBoundaryCopy(restoreChangesWorkbench(deskPreservation(\"Frontend/src/App.tsx\", source))).replace(/\\r\\n/g, \"\\n\"), ast = parse(lf), warningOwner = declaration(ast, \"WarningsBanner\");\n",
        "after": "  const lf = restoreGitGraphBoundaryCopy(restoreChangesWorkbench(deskPreservation(\"Frontend/src/App.tsx\", mastheadPreservation(\"Frontend/src/App.tsx\", source)))).replace(/\\r\\n/g, \"\\n\"), ast = parse(lf), warningOwner = declaration(ast, \"WarningsBanner\");\n",
        "count": 1
      },
      {
        "name": "preservationInput.line369",
        "before": "    const text = restoreGitGraphOracleAdapters(name, restoreChangesWorkbenchOracleAdapters(name, deskPreservation(`Tests/${name}`, readFileSync(resolve(root, \"Tests\", name), \"utf8\")))).replace(/\\r\\n/g, \"\\n\");\n",
        "after": "    const text = restoreGitGraphOracleAdapters(name, restoreChangesWorkbenchOracleAdapters(name, deskPreservation(`Tests/${name}`, mastheadPreservation(`Tests/${name}`, readFileSync(resolve(root, \"Tests\", name), \"utf8\"))))).replace(/\\r\\n/g, \"\\n\");\n",
        "count": 2
      }
    ]
  },
  {
    "path": "Tests/test_workbench_2_0.mjs",
    "before": {
      "bytes": 44012,
      "RAW": "2fea428635e94bbd06142641236a9072e7891fcee91db0e938fb3c30f6e2c540",
      "LF": "2fea428635e94bbd06142641236a9072e7891fcee91db0e938fb3c30f6e2c540",
      "LFbytes": 44012,
      "nativeEOL": "LF",
      "BOM": false
    },
    "after": {
      "bytes": 44164,
      "RAW": "371b8ee91881b3ccdbfc555f449819d04cfcbb4810ca9cbbaa6ebcfbcf3d24da",
      "LF": "371b8ee91881b3ccdbfc555f449819d04cfcbb4810ca9cbbaa6ebcfbcf3d24da",
      "LFbytes": 44164,
      "nativeEOL": "LF",
      "BOM": false
    },
    "windows": [
      {
        "name": "oneHelperImport",
        "before": "import { deskPreservation } from \"./helpers/changesReviewLanes.mjs\";\n",
        "after": "import { mastheadPreservation } from \"./helpers/workspaceCommandMasthead.mjs\";\nimport { deskPreservation } from \"./helpers/changesReviewLanes.mjs\";\n",
        "count": 1
      },
      {
        "name": "preservationInput.line215",
        "before": "const html = restoreChangesReviewDeskHtml(restoreAttributionStationHtml(studioHtml(deskPreservation(\"Frontend/index.html\", read(\"Frontend/index.html\")))));\n",
        "after": "const html = restoreChangesReviewDeskHtml(restoreAttributionStationHtml(studioHtml(deskPreservation(\"Frontend/index.html\", mastheadPreservation(\"Frontend/index.html\", read(\"Frontend/index.html\"))))));\n",
        "count": 1
      },
      {
        "name": "preservationInput.line269",
        "before": "    const current = deskPreservation(name, read(name)); ending(current); assert.equal(sha(current), rawPin, name); assert.equal(sha(lf(current)), lfPin, name);\n",
        "after": "    const current = deskPreservation(name, mastheadPreservation(name, read(name))); ending(current); assert.equal(sha(current), rawPin, name); assert.equal(sha(lf(current)), lfPin, name);\n",
        "count": 1
      }
    ]
  },
  {
    "path": "Tests/test_workspace_command_frame.mjs",
    "before": {
      "bytes": 24206,
      "RAW": "b8340011a0920aae51579579c185f5bfd3d668b7c2ee20ae94f03849c6619759",
      "LF": "b8340011a0920aae51579579c185f5bfd3d668b7c2ee20ae94f03849c6619759",
      "LFbytes": 24206,
      "nativeEOL": "LF",
      "BOM": false
    },
    "after": {
      "bytes": 24313,
      "RAW": "545b457ee8d5e68eada5ad1515aa364e7eaafc530545ea3f343ef97eae0d9e46",
      "LF": "545b457ee8d5e68eada5ad1515aa364e7eaafc530545ea3f343ef97eae0d9e46",
      "LFbytes": 24313,
      "nativeEOL": "LF",
      "BOM": false
    },
    "windows": [
      {
        "name": "oneHelperImport",
        "before": "import { deskPreservation } from \"./helpers/changesReviewLanes.mjs\";\n",
        "after": "import { mastheadPreservation } from \"./helpers/workspaceCommandMasthead.mjs\";\nimport { deskPreservation } from \"./helpers/changesReviewLanes.mjs\";\n",
        "count": 1
      },
      {
        "name": "preservationInput.line203",
        "before": "    const text = deskPreservation(name, read(name)); ending(text); assert.equal(sha(text), rawPin, name); assert.equal(sha(lf(text)), lfPin, name);\n",
        "after": "    const text = deskPreservation(name, mastheadPreservation(name, read(name))); ending(text); assert.equal(sha(text), rawPin, name); assert.equal(sha(lf(text)), lfPin, name);\n",
        "count": 1
      }
    ]
  }
]);

function pathKey (path) {
  assert.ok(typeof path === "string" && /^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(path),
    "canonical repository-relative path");
  assert.ok(!path.split("/").some(part => part === "." || part === ".."), "no traversal");
  return path;
}
function decoded (input) {
  assert.ok(typeof input === "string" || Buffer.isBuffer(input), "text or Buffer input");
  const text = typeof input === "string" ? input
    : new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(input);
  assert.ok(!text.startsWith("\uFEFF") && !text.includes("\0"), "no BOM or NUL");
  assert.equal(Buffer.from(text).toString("utf8"), text, "lossless Unicode scalars");
  const lf = text.replace(/\r\n/g, "\n");
  assert.ok(!lf.includes("\r"), "no bare CR");
  assert.ok(!text.includes("\r\n") || !/(?<!\r)\n/.test(text), "uniform LF or CRLF");
  assert.ok(lf.endsWith("\n") && !lf.endsWith("\n\n"), "single final newline");
  return { lf, crlf: text.includes("\r\n"), buffer: Buffer.isBuffer(input) };
}
function physical (lf, eol) { return eol === "CRLF" ? lf.replace(/\n/g, "\r\n") : lf; }
function encoded (value, lf) {
  const text = physical(lf, value.crlf ? "CRLF" : "LF");
  return value.buffer ? Buffer.from(text, "utf8") : text;
}
function occurrences (text, window) { return text.split(window).length - 1; }
function parse (path, text) {
  const tree = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.JS);
  assert.equal(tree.parseDiagnostics.length, 0, "complete source syntax");
  return tree;
}
function all (node, predicate) {
  const found = [];
  const visit = value => { if (predicate(value)) found.push(value); ts.forEachChild(value, visit); };
  visit(node); return found;
}
function owner (tree, name) {
  const found = tree.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.equal(found.length, 1, "one actual " + name + " owner");
  return found[0];
}
function jsxChildren (node) {
  return node.children.filter(child => !ts.isJsxText(child) || child.text.trim());
}
function attribute (node, name, tree) {
  const opening = ts.isJsxElement(node) ? node.openingElement : node;
  return opening.attributes.properties.find(value => ts.isJsxAttribute(value)
    && value.name.getText(tree) === name);
}
function cssShape (text) {
  const root = postcss.parse(text);
  const visit = node => {
    if (node.type === "comment") return ["comment", node.text];
    if (node.type === "decl") return ["decl", node.prop, node.value, Boolean(node.important)];
    assert.ok(node.type === "root" || node.type === "rule" || node.type === "atrule", "only CSS owners");
    if (node.type === "rule") assert.ok(node.nodes.every(child => child.type === "decl"), "only declarations");
    if (node.type === "atrule") {
      assert.equal(node.name, "media", "only approved media");
      assert.ok(node.nodes.every(child => child.type === "rule"), "media direct rules only");
    }
    return [node.type, node.selector ?? node.name ?? "", node.params ?? "",
      (node.nodes ?? []).map(visit)];
  };
  return visit(root);
}
function htmlSites (text, spec) {
  assert.equal(occurrences(text, "<head>"), 1, "one actual head");
  assert.equal(occurrences(text, "</head>"), 1, "one head closure");
  const matches = [...text.matchAll(/<style\b([^>]*)>([\s\S]*?)<\/style>/g)];
  assert.equal(matches.length, 6, "six current inline style owners");
  const added = matches[5];
  assert.equal(added[1], ' id="katlab-workspace-command-masthead"', "sixth exact style ID");
  assert.ok(added.index > text.indexOf("<head>") && added.index < text.indexOf("</head>"), "actual head owner");
  assert.ok(text.slice(added.index + added[0].length).startsWith("\n  </head>"), "final head child");
  const expected = spec.windows[0].after.match(/<style[^>]*>([\s\S]*?)<\/style>/)[1];
  assert.deepEqual(cssShape(added[2]), cssShape(expected), "entire approved CSS AST");
  const css = postcss.parse(added[2]);
  assert.equal(css.nodes.filter(node => node.type === "comment").length, 1, "one exact comment");
  assert.equal(css.nodes.filter(node => node.type === "rule").length, 10, "ten direct rules");
  assert.equal(css.nodes.filter(node => node.type === "atrule").length, 2, "two media owners");
  assert.equal(occurrences(text, spec.windows[0].after), 1, "one complete exact insertion");
}
function sourceSites (text, spec) {
  if (spec.path === "Frontend/index.html") { htmlSites(text, spec); return; }
  const tree = parse(spec.path, text);
  if (spec.path === "Frontend/src/App.tsx") {
    const row = owner(tree, "PickRow");
    const conditions = all(row, node => ts.isConditionalExpression(node)
      && node.condition.getText(tree) === "candidates.length === 0");
    assert.equal(conditions.length, 1, "one current empty-choice conditional");
    let span = conditions[0].whenTrue;
    while (ts.isParenthesizedExpression(span)) span = span.expression;
    assert.ok(ts.isJsxElement(span) && span.openingElement.tagName.getText(tree) === "span",
      "same native zero-choice span");
    assert.equal(attribute(span, "className", tree)?.initializer?.text, "text-xs italic text-slate-400",
      "same zero-choice classes");
    const copy = span.children.map(child => ts.isJsxText(child) ? child.text : "").join(" ").replace(/\s+/g, " ").trim();
    assert.equal(copy, "No task choices are available for this event. Check the repository plan tasks and attribution candidates. The event remains unresolved until a choice is available.",
      "truthful current zero-choice copy");
    assert.ok(text.slice(row.getStart(tree), row.end).includes(spec.windows[0].after), "PickRow exact owned window");
  } else {
    assert.equal(spec.path, "Frontend/src/AppShell.tsx", "reviewed source owner");
    const context = owner(tree, "WorkspaceContext");
    const returns = all(context, node => ts.isReturnStatement(node));
    assert.equal(returns.length, 1, "one unchanged context return owner");
    let root = returns[0].expression;
    while (ts.isParenthesizedExpression(root)) root = root.expression;
    assert.ok(ts.isJsxElement(root) && root.openingElement.tagName.getText(tree) === "div", "same native root");
    assert.equal(attribute(root, "className", tree)?.initializer?.text, "app-workspace-context text-xs text-ui-muted");
    const children = jsxChildren(root);
    assert.equal(children.length, 2, "brief then unchanged status control");
    const brief = children[0], control = children[1];
    assert.equal(attribute(brief, "className", tree)?.initializer?.text, "workspace-command-brief");
    const facts = jsxChildren(brief);
    assert.equal(facts.length, 3, "scope then summary then qualified details");
    assert.ok(attribute(facts[0], "data-workspace-command-scope", tree));
    assert.ok(attribute(facts[1], "data-workspace-command-summary", tree));
    assert.equal(attribute(facts[2], "className", tree)?.initializer?.text, "workspace-command-details");
    assert.equal(all(facts[2], node => ts.isJsxExpression(node) && node.expression
      && node.expression.getText(tree).startsWith("ready &&")).length, 6, "six original conditional details");
    assert.equal(control.openingElement.tagName.getText(tree), "ControlButton");
    assert.equal(attribute(control, "onClick", tree)?.initializer?.expression?.getText(tree), "onDetails");
    assert.equal(attribute(control, "className", tree)?.initializer?.text, "ml-auto text-xs");
    assert.equal(control.children.map(value => value.getText(tree)).join("").trim(), "Repository status");
    assert.ok(text.slice(context.getStart(tree), context.end).includes(spec.windows[0].after.trimEnd()),
      "whole return literal remains in actual context");
  }
}
function inverse (spec, value) {
  assert.equal(Buffer.byteLength(value.lf), spec.after.LFbytes, "whole current LF length");
  assert.equal(sha(value.lf), spec.after.LF, "whole reviewed current LF input");
  assert.equal(sha(physical(value.lf, spec.after.nativeEOL)), spec.after.RAW, "current native encoding identity");
  let restored = value.lf;
  for (const window of [...spec.windows].reverse()) {
    assert.equal(occurrences(restored, window.after), window.count, "exact inverse cardinality " + window.name);
    restored = restored.split(window.after).join(window.before);
  }
  assert.equal(Buffer.byteLength(restored), spec.before.LFbytes, "whole published LF length");
  assert.equal(sha(restored), spec.before.LF, "complete published LF inverse");
  const native = physical(restored, spec.before.nativeEOL);
  assert.equal(Buffer.byteLength(native), spec.before.bytes, "published native length");
  assert.equal(sha(native), spec.before.RAW, "complete native published inverse");
  return encoded(value, restored);
}
export function restoreWorkspaceCommandMastheadSource (path, input) {
  const spec = MASTHEAD_SOURCES.find(value => value.path === pathKey(path));
  assert.ok(spec, "only the three reviewed source owners");
  const value = decoded(input);
  assert.equal(sha(value.lf), spec.after.LF, "whole reviewed source input before AST inspection");
  sourceSites(value.lf, spec);
  return inverse(spec, value);
}
export function restoreWorkspaceCommandMastheadSuite (path, input) {
  const spec = MASTHEAD_SUITES.find(value => value.path === pathKey(path));
  assert.ok(spec, "only the 26 reviewed old-suite owners");
  const value = decoded(input), tree = parse(path, value.lf);
  const imports = tree.statements.filter(node => ts.isImportDeclaration(node)
    && node.moduleSpecifier.text === "./helpers/workspaceCommandMasthead.mjs");
  assert.equal(imports.length, 1, "one preservation-only helper import");
  assert.equal(imports[0].importClause?.namedBindings?.getText(tree), "{ mastheadPreservation }", "one named helper");
  return inverse(spec, value);
}
export function mastheadPreservation (path, input) {
  pathKey(path);
  assert.ok(typeof input === "string" || Buffer.isBuffer(input), "text or Buffer input");
  if (MASTHEAD_SOURCES.some(value => value.path === path)) return restoreWorkspaceCommandMastheadSource(path, input);
  if (MASTHEAD_SUITES.some(value => value.path === path)) return restoreWorkspaceCommandMastheadSuite(path, input);
  return input;
}
