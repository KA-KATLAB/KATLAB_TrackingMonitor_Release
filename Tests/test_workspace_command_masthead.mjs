import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { MASTHEAD_SOURCES, MASTHEAD_SUITES, mastheadPreservation,
  restoreWorkspaceCommandMastheadSource, restoreWorkspaceCommandMastheadSuite } from "./helpers/workspaceCommandMasthead.mjs";

// Current source/SSR and controlled owner fixtures, not native paint/focus/AT acceptance.
const root = resolve(dirname(fileURLToPath(import.meta.url)), ".."), frontend = resolve(root, "Frontend");
const require = createRequire(resolve(frontend, "package.json"));
const ts = require("typescript"), postcss = require("postcss"), selectorParser = require("postcss-selector-parser");
const React = require("react"), { renderToStaticMarkup } = require("react-dom/server");
const read = path => readFileSync(resolve(root, path));
const sha = text => createHash("sha256").update(text).digest("hex"), lf = text => text.replace(/\r\n/g, "\n");
const text = path => read(path).toString("utf8"), physical = (value, crlf) => crlf ? value.replace(/\n/g, "\r\n") : value;
const count = (value, needle) => value.split(needle).length - 1;
const SOURCE_EXPECTATIONS = [
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
];
const SUITE_EXPECTATIONS = [
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
        "count": 1
      },
      {
        "name": "preservationInput.line255",
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
        "count": 1
      },
      {
        "name": "preservationInput.line225",
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
        "count": 1
      },
      {
        "name": "preservationInput.line18",
        "count": 1
      },
      {
        "name": "preservationInput.line19",
        "count": 1
      },
      {
        "name": "preservationInput.line20",
        "count": 1
      },
      {
        "name": "preservationInput.line413",
        "count": 1
      },
      {
        "name": "intentionalCurrentCopyExpectation",
        "count": 1
      },
      {
        "name": "intentionalCurrentCopyTitle",
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
        "count": 1
      },
      {
        "name": "preservationInput.line19",
        "count": 1
      },
      {
        "name": "preservationInput.line20",
        "count": 1
      },
      {
        "name": "preservationInput.line383",
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
        "count": 1
      },
      {
        "name": "wholeOriginalInput",
        "count": 1
      },
      {
        "name": "fifthHistoricalHtmlOnly",
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
        "count": 1
      },
      {
        "name": "preservationInput.line248",
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
        "count": 1
      },
      {
        "name": "preservationInput.line359",
        "count": 1
      },
      {
        "name": "preservationInput.line372",
        "count": 1
      },
      {
        "name": "preservationInput.line413",
        "count": 1
      },
      {
        "name": "preservationInput.line437",
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
        "count": 1
      },
      {
        "name": "preservationInput.line467",
        "count": 1
      },
      {
        "name": "preservationInput.line494",
        "count": 1
      },
      {
        "name": "preservationInput.line522",
        "count": 1
      },
      {
        "name": "preservationInput.line531",
        "count": 1
      },
      {
        "name": "preservationInput.line532",
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
        "count": 1
      },
      {
        "name": "preservationInput.line276",
        "count": 1
      },
      {
        "name": "preservationInput.line324",
        "count": 1
      },
      {
        "name": "preservationInput.line329",
        "count": 1
      },
      {
        "name": "preservationInput.line341",
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
        "count": 1
      },
      {
        "name": "preservationInput.line237",
        "count": 1
      },
      {
        "name": "shellPreservationData",
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
        "count": 1
      },
      {
        "name": "preservationInput.line426",
        "count": 1
      },
      {
        "name": "preservationInput.line442",
        "count": 1
      },
      {
        "name": "preservationInput.line448",
        "count": 1
      },
      {
        "name": "preservationInput.line450",
        "count": 1
      },
      {
        "name": "preservationInput.line457",
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
        "count": 1
      },
      {
        "name": "preservationInput.line582",
        "count": 1
      },
      {
        "name": "preservationInput.line601",
        "count": 1
      },
      {
        "name": "preservationInput.line615",
        "count": 1
      },
      {
        "name": "preservationInput.line624",
        "count": 1
      },
      {
        "name": "preservationInput.line640",
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
        "count": 1
      },
      {
        "name": "preservationInput.line67",
        "count": 1
      },
      {
        "name": "preservationInput.line82",
        "count": 1
      },
      {
        "name": "preservationInput.line116",
        "count": 1
      },
      {
        "name": "preservationInput.line127",
        "count": 1
      },
      {
        "name": "preservationInput.line132",
        "count": 1
      },
      {
        "name": "preservationInput.line140",
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
        "count": 1
      },
      {
        "name": "preservationInput.line217",
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
        "count": 1
      },
      {
        "name": "preservationInput.line248",
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
        "count": 1
      },
      {
        "name": "preservationInput.line188",
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
        "count": 1
      },
      {
        "name": "preservationInput.line230",
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
        "count": 1
      },
      {
        "name": "preservationInput.line259",
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
        "count": 1
      },
      {
        "name": "preservationInput.line269",
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
        "count": 1
      },
      {
        "name": "preservationInput.line157",
        "count": 1
      },
      {
        "name": "preservationInput.line162",
        "count": 1
      },
      {
        "name": "preservationInput.line172",
        "count": 1
      },
      {
        "name": "preservationInput.line179",
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
        "count": 1
      },
      {
        "name": "preservationInput.line212",
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
        "count": 1
      },
      {
        "name": "preservationInput.line244",
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
        "count": 1
      },
      {
        "name": "preservationInput.line409",
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
        "count": 1
      },
      {
        "name": "preservationInput.line241",
        "count": 2
      },
      {
        "name": "preservationInput.line265",
        "count": 1
      },
      {
        "name": "preservationInput.line369",
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
        "count": 1
      },
      {
        "name": "preservationInput.line215",
        "count": 1
      },
      {
        "name": "preservationInput.line269",
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
        "count": 1
      },
      {
        "name": "preservationInput.line203",
        "count": 1
      }
    ]
  }
];
const STYLE_ID = "katlab-workspace-command-masthead";
const CSS = "/* Workspace Command Masthead: exact current snapshot, clear scope and qualifications. */\n#root header.app-shell-header > .app-header-primary {\n  grid-template-columns: minmax(0, 1fr);\n  align-items: start;\n}\n#root header.app-shell-header > .app-header-primary > .app-header-actions {\n  min-width: 0;\n  align-content: start;\n  justify-content: flex-start;\n}\n#root header.app-shell-header > .app-workspace-context {\n  display: grid;\n  grid-template-columns: minmax(0, 1fr);\n  align-items: start;\n  gap: 1rem;\n  padding: 1.25rem 0;\n}\n#root header.app-shell-header > .app-workspace-context > .workspace-command-brief {\n  display: grid;\n  min-width: 0;\n  gap: 0.5rem;\n}\n#root header.app-shell-header > .app-workspace-context > .workspace-command-brief > [data-workspace-command-scope] {\n  color: rgb(var(--ui-text));\n  font-size: 1.25rem;\n  font-weight: 600;\n  line-height: 1.4;\n  overflow-wrap: anywhere;\n}\n#root header.app-shell-header > .app-workspace-context > .workspace-command-brief > [data-workspace-command-summary] {\n  min-width: 0;\n  color: rgb(var(--ui-text));\n  font-size: 1rem;\n  line-height: 1.5;\n  overflow-wrap: anywhere;\n}\n#root header.app-shell-header > .app-workspace-context > .workspace-command-brief > .workspace-command-details {\n  display: flex;\n  min-width: 0;\n  flex-wrap: wrap;\n  gap: 0.5rem 1rem;\n  font-size: 0.8125rem;\n  line-height: 1.5;\n}\n#root header.app-shell-header > .app-workspace-context > .workspace-command-brief > .workspace-command-details:empty {\n  display: none;\n}\n#root header.app-shell-header > .app-workspace-context > .workspace-command-brief > .workspace-command-details > span {\n  min-width: 0;\n  overflow-wrap: anywhere;\n}\n#root header.app-shell-header > .app-workspace-context > .ui-control {\n  justify-self: start;\n  margin-left: 0;\n  min-height: 2.75rem;\n  padding: 0.5rem 0.75rem;\n  font-size: 0.875rem;\n  line-height: 1.5;\n}\n@media (min-width: 768px) {\n  #root header.app-shell-header > .app-workspace-context {\n    grid-template-columns: minmax(0, 1fr) max-content;\n  }\n}\n@media (min-width: 1280px) {\n  #root header.app-shell-header > .app-header-primary {\n    grid-template-columns: minmax(0, max-content) minmax(0, 1fr);\n  }\n}\n";
const RULES = [
  [
    "#root header.app-shell-header > .app-header-primary",
    [
      [
        "grid-template-columns",
        "minmax(0, 1fr)"
      ],
      [
        "align-items",
        "start"
      ]
    ]
  ],
  [
    "#root header.app-shell-header > .app-header-primary > .app-header-actions",
    [
      [
        "min-width",
        "0"
      ],
      [
        "align-content",
        "start"
      ],
      [
        "justify-content",
        "flex-start"
      ]
    ]
  ],
  [
    "#root header.app-shell-header > .app-workspace-context",
    [
      [
        "display",
        "grid"
      ],
      [
        "grid-template-columns",
        "minmax(0, 1fr)"
      ],
      [
        "align-items",
        "start"
      ],
      [
        "gap",
        "1rem"
      ],
      [
        "padding",
        "1.25rem 0"
      ]
    ]
  ],
  [
    "#root header.app-shell-header > .app-workspace-context > .workspace-command-brief",
    [
      [
        "display",
        "grid"
      ],
      [
        "min-width",
        "0"
      ],
      [
        "gap",
        "0.5rem"
      ]
    ]
  ],
  [
    "#root header.app-shell-header > .app-workspace-context > .workspace-command-brief > [data-workspace-command-scope]",
    [
      [
        "color",
        "rgb(var(--ui-text))"
      ],
      [
        "font-size",
        "1.25rem"
      ],
      [
        "font-weight",
        "600"
      ],
      [
        "line-height",
        "1.4"
      ],
      [
        "overflow-wrap",
        "anywhere"
      ]
    ]
  ],
  [
    "#root header.app-shell-header > .app-workspace-context > .workspace-command-brief > [data-workspace-command-summary]",
    [
      [
        "min-width",
        "0"
      ],
      [
        "color",
        "rgb(var(--ui-text))"
      ],
      [
        "font-size",
        "1rem"
      ],
      [
        "line-height",
        "1.5"
      ],
      [
        "overflow-wrap",
        "anywhere"
      ]
    ]
  ],
  [
    "#root header.app-shell-header > .app-workspace-context > .workspace-command-brief > .workspace-command-details",
    [
      [
        "display",
        "flex"
      ],
      [
        "min-width",
        "0"
      ],
      [
        "flex-wrap",
        "wrap"
      ],
      [
        "gap",
        "0.5rem 1rem"
      ],
      [
        "font-size",
        "0.8125rem"
      ],
      [
        "line-height",
        "1.5"
      ]
    ]
  ],
  [
    "#root header.app-shell-header > .app-workspace-context > .workspace-command-brief > .workspace-command-details:empty",
    [
      [
        "display",
        "none"
      ]
    ]
  ],
  [
    "#root header.app-shell-header > .app-workspace-context > .workspace-command-brief > .workspace-command-details > span",
    [
      [
        "min-width",
        "0"
      ],
      [
        "overflow-wrap",
        "anywhere"
      ]
    ]
  ],
  [
    "#root header.app-shell-header > .app-workspace-context > .ui-control",
    [
      [
        "justify-self",
        "start"
      ],
      [
        "margin-left",
        "0"
      ],
      [
        "min-height",
        "2.75rem"
      ],
      [
        "padding",
        "0.5rem 0.75rem"
      ],
      [
        "font-size",
        "0.875rem"
      ],
      [
        "line-height",
        "1.5"
      ]
    ]
  ]
];
const MEDIAS = [
  ["(min-width: 768px)", [["#root header.app-shell-header > .app-workspace-context", [["grid-template-columns", "minmax(0, 1fr) max-content"]]]]],
  ["(min-width: 1280px)", [["#root header.app-shell-header > .app-header-primary", [["grid-template-columns", "minmax(0, max-content) minmax(0, 1fr)"]]]]],
];
const COPY = "No task choices are available for this event. Check the repository plan tasks and attribution candidates. The event remains unresolved until a choice is available.";
function parse (path, source) {
  const tree = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  assert.equal(tree.parseDiagnostics.length, 0, "complete current syntax"); return tree;
}
function independentInverse (path, input) {
  const record = SOURCE_EXPECTATIONS.find(value => value.path === path);
  assert.ok(record); const current = typeof input === "string" ? input : input.toString("utf8"), value = lf(current);
  assert.equal(sha(value), record.after.LF); let original = value;
  for (const window of [...record.windows].reverse()) {
    assert.equal(count(original, window.after), window.count);
    original = original.split(window.after).join(window.before);
  }
  assert.equal(sha(original), record.before.LF); assert.equal(Buffer.byteLength(original), record.before.LFbytes);
  const native = physical(original, record.before.nativeEOL === "CRLF");
  assert.equal(sha(native), record.before.RAW); assert.equal(Buffer.byteLength(native), record.before.bytes);
  const result = physical(original, current.includes("\r\n"));
  return Buffer.isBuffer(input) ? Buffer.from(result) : result;
}
function cssContract (value) {
  const css = postcss.parse(value), rules = [], media = [], comments = [];
  const rule = node => {
    assert.equal(node.type, "rule"); assert.ok(node.selector.startsWith("#root header.app-shell-header > "));
    selectorParser().astSync(node.selector);
    assert.ok(node.nodes.every(child => child.type === "decl"), "only direct declared properties");
    const declarations = node.nodes.map(child => {
      assert.equal(Boolean(child.important), false); return [child.prop, child.value];
    });
    return [node.selector, declarations];
  };
  for (const node of css.nodes) {
    if (node.type === "comment") comments.push(node.text);
    else if (node.type === "rule") rules.push(rule(node));
    else {
      assert.equal(node.type, "atrule"); assert.equal(node.name, "media");
      assert.ok(node.nodes.every(child => child.type === "rule"), "media cannot hide at-rules/declarations");
      media.push([node.params, node.nodes.map(rule)]);
    }
  }
  assert.deepEqual(comments, ["Workspace Command Masthead: exact current snapshot, clear scope and qualifications."]);
  assert.deepEqual(rules, RULES); assert.deepEqual(media, MEDIAS);
  assert.equal(rules.length, 10); assert.equal(media.length, 2);
}
const elements = tree => Array.isArray(tree) ? tree.flatMap(elements)
  : React.isValidElement(tree) ? [tree, ...elements(tree.props.children)] : [];
const textOf = tree => Array.isArray(tree) ? tree.map(textOf).join("")
  : React.isValidElement(tree) ? textOf(tree.props.children)
    : tree === null || tree === undefined || typeof tree === "boolean" ? "" : String(tree);
const normalized = tree => textOf(tree).replace(/\s+/g, " ").trim();
const one = (nodes, predicate) => {
  const found = nodes.filter(predicate); assert.equal(found.length, 1); return found[0];
};
const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));
const repo = (id, extra = {}) => ({ id, offline: false, status_valid: true, clean: false,
  count: 3, branch: "develop", last_event_ts: null, ...extra });
const contextProps = (repos, extra = {}) => ({ scope: { kind: "all" }, repos, ready: true,
  error: "", violationOf: () => null, onDetails() {}, ...extra });
const appText = text("Frontend/src/App.tsx"), appTree = parse("App.tsx", appText);
function extracted (name) {
  const matches = appTree.statements.filter(node =>
    ts.isFunctionDeclaration(node) && node.name?.text === name
    || ts.isVariableStatement(node) && node.declarationList.declarations.some(value => value.name.getText(appTree) === name));
  assert.equal(matches.length, 1, "one current App owner " + name); return matches[0].getText(appTree);
}
let vite, shell, deps, actual;
before(async () => {
  const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
  vite = await createServer({ root: frontend, server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom", optimizeDeps: { noDiscovery: true, entries: [] } });
  shell = await vite.ssrLoadModule("/src/AppShell.tsx");
  deps = Object.assign({}, ...await Promise.all(["ui.tsx", "dialog.tsx", "theme.ts", "format.ts"]
    .map(name => vite.ssrLoadModule("/src/" + name))));
  const source = [
    "export function createSubjects(React,deps,hooks=React){",
    "const {useState,useRef,useMemo,useCallback,useEffect}=hooks;",
    "const {BoundedChoiceDialog,MODE_BADGE,MODE_COLOR,SWEPT_COLOR,eventSessionIdentity,sessionColor,fmtRel}=deps;",
    'const api={pickTask(){throw new Error("Fixture forbids PATCH");}},createActionDeadline=()=>{throw new Error("Fixture forbids mutation");};',
    "const isAbortError=()=>false;",
    ...["assignmentCandidates", "swatch", "SWEPT_TIP", "SessionDot", "ModeBadge", "PickRow"].map(extracted),
    "return {PickRow,assignmentCandidates};}",
  ].join("\n");
  const result = ts.transpileModule(source, { reportDiagnostics: true, compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React,
  } });
  assert.equal(result.diagnostics.filter(value => value.category === ts.DiagnosticCategory.Error).length, 0);
  const module = await import("data:text/javascript;base64," + Buffer.from(result.outputText).toString("base64"));
  actual = module.createSubjects(React, deps);
  actual.direct = (props, seeds = [false, ""]) => {
    let stateIndex = 0; const cleanups = [];
    const hooks = {
      useState(initial) { const value = stateIndex < seeds.length ? seeds[stateIndex] : initial; stateIndex++; return [value, () => {}]; },
      useRef(initial) { return { current: initial }; }, useMemo(fn) { return fn(); }, useCallback(fn) { return fn; },
      useEffect(fn) { cleanups.push(fn()); },
    };
    const tree = module.createSubjects(React, deps, hooks).PickRow(props);
    return { tree, dispose() { cleanups.forEach(fn => fn?.()); } };
  };
}, { timeout: 30_000 });
after(async () => { await vite?.close(); });
const tasks = Object.freeze([{ repo: "EA", task_ref: "plan - A.1", title: "Existing actual task" },
  { repo: "Other", task_ref: "other - B.1", title: "Other task" }]);
const event = extra => ({ id: 7, repo_id: "EA", task_ref: null, file: "src/file.ts",
  mode: "UNKNOWN", provider: "codex", session_id: "current-session", ts: "2026-10-08T08:00:00Z",
  tool: "Edit", branch: "develop", commit_hash: null, swept: 0, candidates_json: null, ...extra });
const rowProps = extra => ({ event: event({}), tasks, choice: "", checked: false, sectionDisabled: false,
  onPicked() {}, onStatus() {}, onChoiceChange() {}, onAssigned() {}, onToggle() {},
  acquireMutation: () => false, releaseMutation() {}, ...extra });

test("three independent whole native/LF source inverses retain every unrelated byte", () => {
  assert.deepEqual(MASTHEAD_SOURCES, SOURCE_EXPECTATIONS);
  for (const record of SOURCE_EXPECTATIONS) {
    const current = read(record.path); assert.equal(sha(current), record.after.RAW);
    assert.equal(current.length, record.after.bytes);
    for (const crlf of [false, true]) for (const buffer of [false, true]) {
      const value = physical(lf(current.toString("utf8")), crlf), input = buffer ? Buffer.from(value) : value;
      const restored = independentInverse(record.path, input);
      assert.deepEqual(restoreWorkspaceCommandMastheadSource(record.path, input), restored);
      assert.deepEqual(mastheadPreservation(record.path, input), restored);
      if (record.path.endsWith(".tsx")) parse(record.path, Buffer.isBuffer(restored) ? restored.toString("utf8") : restored);
    }
  }
});
test("strict source owner/copy/style/outside bytes and encoding adversaries cannot be erased", () => {
  for (const record of SOURCE_EXPECTATIONS) {
    const value = lf(text(record.path)), old = independentInverse(record.path, value), window = record.windows[0];
    const bad = [old, value.replace(window.after, ""), value.replace(window.after, window.after + window.after),
      value.replace(window.after, window.after.replace(record.path.endsWith(".html") ? "<style" : "className=",
        record.path.endsWith(".html") ? "<script" : "data-wrong=")),
      value.replace("\n", "\n/* outside approved window */\n"), "\uFEFF" + value, value + "\n",
      value.slice(0, -1), value.replace("\n", "\r"), value.replace("\n", "\r\n"), value + "\0"];
    if (record.path.endsWith(".html")) bad.push(value.replace(STYLE_ID, "wrong-style"),
      value.replace("min-height: 2.75rem", "min-height: 9rem"), value.replace("</head>", "</head><head>"));
    else if (record.path.endsWith("App.tsx")) bad.push(value.replace("No task choices", "No tasks"),
      value.replace("candidates.length === 0", "candidates.length > 0"));
    else bad.push(value.replace("onClick={onDetails}", "onClick={() => {}}"),
      value.replace("data-workspace-command-summary", "data-hidden-summary"));
    for (const input of bad) {
      assert.notEqual(input, value, "every adversary is a real mutation");
      assert.throws(() => restoreWorkspaceCommandMastheadSource(record.path, input));
    }
    assert.throws(() => restoreWorkspaceCommandMastheadSource(record.path, Buffer.from([0xff, 0xfe])));
  }
  for (const path of ["", "../App.tsx", "/Frontend/App.tsx", "Frontend//App.tsx", "C:/App.tsx", "Frontend/./App.tsx"]) {
    assert.throws(() => mastheadPreservation(path, "x\n"));
  }
  const unchanged = Buffer.from("unchanged owner\n"); assert.equal(mastheadPreservation("Hook/provider_adapters.py", unchanged), unchanged);
});
test("26 old suites preserve complete original RAW/LF oracles and negative inputs, without restoring current runtime", () => {
  assert.equal(SUITE_EXPECTATIONS.length, 26);
  assert.deepEqual(MASTHEAD_SUITES.map(record => ({ path: record.path, before: record.before, after: record.after,
    windows: record.windows.map(window => ({ name: window.name, count: window.count })) })), SUITE_EXPECTATIONS);
  for (const pin of SUITE_EXPECTATIONS) {
    const input = read(pin.path); assert.equal(sha(input), pin.after.RAW);
    for (const crlf of [false, true]) for (const buffer of [false, true]) {
      const value = physical(lf(input.toString("utf8")), crlf), current = buffer ? Buffer.from(value) : value;
      const original = restoreWorkspaceCommandMastheadSuite(pin.path, current);
      const bytes = Buffer.isBuffer(original) ? original : Buffer.from(original);
      assert.equal(sha(lf(bytes.toString("utf8"))), pin.before.LF);
      assert.equal(sha(physical(lf(bytes.toString("utf8")), pin.before.nativeEOL === "CRLF")), pin.before.RAW);
      assert.deepEqual(mastheadPreservation(pin.path, current), original);
    }
    const spec = MASTHEAD_SUITES.find(record => record.path === pin.path);
    for (const window of spec.windows) {
      assert.throws(() => restoreWorkspaceCommandMastheadSuite(pin.path,
        input.toString("utf8").replace(physical(window.after, pin.after.nativeEOL === "CRLF"), "")));
    }
    assert.throws(() => restoreWorkspaceCommandMastheadSuite(pin.path, input.toString("utf8") + "\n"));
  }
  const station = text("Tests/test_attribution_station.mjs");
  assert.match(station, /truthful zero-choice guidance/); assert.doesNotMatch(station, /assert\.match\(html, \/No tasks defined\//);
  const rawReaders = text("Tests/test_changes_review_lanes.mjs");
  assert.match(rawReaders, /const appRaw = readFileSync/); assert.match(rawReaders, /const appText = lf\(appRaw\.toString\("utf8"\)\)/);
});
test("sixth inline CSS has independent twelve-context scoped reflow and rejects hidden or hostile rules", () => {
  assert.equal(Buffer.byteLength(CSS), 2183); assert.equal(CSS.split("\n").length - 1, 69);
  assert.equal(sha(CSS), "ef191a32d0af4b299a7770f918863a7d69dbcbab33087251793debfed89fdd30");
  cssContract(CSS);
  const html = text("Frontend/index.html"), styles = [...html.matchAll(/<style\b([^>]*)>([\s\S]*?)<\/style>/g)];
  assert.equal(styles.length, 6); assert.equal(styles[5][1], ' id="' + STYLE_ID + '"');
  cssContract(styles[5][2]); assert.ok(html.slice(styles[5].index + styles[5][0].length).startsWith("\n  </head>"));
  const original = independentInverse("Frontend/index.html", html);
  assert.equal((original.match(/<style\b/g) ?? []).length, 5); assert.ok(original.includes('id="katlab-changes-review-lanes"'));
  const bad = [CSS + "body { display:none; }", CSS.replace("2.75rem", "1rem"),
    CSS.replace("overflow-wrap: anywhere", "overflow: hidden"), CSS.replace("align-items: start", "align-items: start !important"),
    CSS.replace("#root header.app-shell-header", "body"), CSS + '@import url("https://example.invalid/x.css");',
    CSS.replace("@media (min-width: 768px) {", "@media (min-width: 768px) { @font-face {font-family:wrong;}"),
    CSS.replace("@media (min-width: 1280px) {", "@media (min-width: 1280px) { width:1px;"),
    CSS.replace("/* Workspace", "/* Wrong Workspace")];
  for (const value of bad) assert.throws(() => cssContract(value));
  const global = text("Frontend/src/index.css");
  assert.match(global, /@media[^{}]*pointer:\s*coarse[\s\S]*?44px\s*!important/);
});
test("actual workspace context states keep scope first, honest summary second and optional details below", () => {
  for (const [props, expected, absent] of [
    [contextProps([], { ready: false }), "Waiting for workspace snapshot", /No repositories configured|known statuses clean/],
    [contextProps([], { ready: false, error: "Failed" }), "Workspace snapshot unavailable", /known statuses clean/],
    [contextProps([]), "No repositories configured", /known statuses clean/],
    [contextProps([], { scope: { kind: "repo", id: "removed" } }), "Selected repository unavailable", /known statuses clean/],
    [contextProps([repo("Unknown", { status_valid: false, clean: true, count: 987 })]), "Git status unavailable", /987|known uncommitted/],
    [contextProps([repo("Offline", { offline: true, clean: true, count: 999 })]), "No online repositories", /999|known statuses clean/],
    [contextProps([repo("Offline", { offline: true })], { scope: { kind: "repo", id: "Offline" } }), "Repository unavailable", /known statuses clean/],
  ]) {
    const tree = shell.WorkspaceContext(props), nodes = elements(tree), children = React.Children.toArray(tree.props.children);
    assert.equal(children.length, 2); assert.equal(children[0].props.className, "workspace-command-brief");
    const scope = one(nodes, node => "data-workspace-command-scope" in node.props);
    const summary = one(nodes, node => "data-workspace-command-summary" in node.props);
    assert.equal(normalized(scope), props.scope.kind === "all" ? "All repos" : props.scope.id);
    assert.equal(normalized(summary), expected);
    const html = render(shell.WorkspaceContext, props); assert.ok(html.includes(expected)); assert.doesNotMatch(html, absent);
    assert.ok(one(nodes, node => node.props.className === "workspace-command-details"));
    assert.equal(nodes.filter(node => node.type === deps.ControlButton).length, 1);
  }
  const html = render(shell.WorkspaceContext, contextProps([repo("Clean", { clean: true, count: 0 }), repo("Dirty"),
    repo("Unknown", { status_valid: false, count: 987 }), repo("Offline", { offline: true, count: 999 })]));
  for (const expected of ["1/2 known statuses clean", "3 known uncommitted changes", "1 Git status unknown", "1 unavailable"]) assert.ok(html.includes(expected));
  assert.doesNotMatch(html, /987|999/);
});
test("retained snapshot details preserve source order, full escaped identities and the same native status action", () => {
  const id = '<repo>&"long"'.repeat(30), branch = '<branch>&"scope"'.repeat(30);
  let calls = 0; const onDetails = () => calls++, input = contextProps(Object.freeze([Object.freeze(repo(id, {
    status_valid: false, branch,
  }))]), { scope: Object.freeze({ kind: "repo", id }), error: "Refresh failure", violationOf: () => 2, onDetails });
  const before = JSON.stringify(input), tree = shell.WorkspaceContext(input), nodes = elements(tree);
  const details = one(nodes, node => node.props.className === "workspace-command-details");
  const ordered = React.Children.toArray(details.props.children).map(normalized);
  assert.deepEqual(ordered, ["Refresh failed; showing the last workspace snapshot", "1 Git status unknown",
    "Last-known branch: " + branch, "No captures yet", "1 discipline warning"]);
  const control = one(nodes, node => node.type === deps.ControlButton);
  assert.equal(control.props.onClick, onDetails); assert.equal(control.props.className, "ml-auto text-xs");
  const native = deps.ControlButton.render(control.props, null);
  assert.equal(native.type, "button"); assert.equal(native.props.type, "button"); assert.equal(native.props.onClick, onDetails);
  native.props.onClick(); assert.equal(calls, 1);
  const html = render(shell.WorkspaceContext, input);
  assert.ok(html.includes("&lt;repo&gt;&amp;&quot;long&quot;")); assert.ok(html.includes("&lt;branch&gt;&amp;&quot;scope&quot;"));
  assert.doesNotMatch(html, /<repo>|<branch>|known uncommitted changes/); assert.equal(JSON.stringify(input), before);
  const ready = render(shell.WorkspaceContext, contextProps([repo("EA", { branch: "main", last_event_ts: "2026-10-08T08:00:00Z" })],
    { scope: { kind: "repo", id: "EA" }, violationOf: () => null }));
  assert.match(ready, />Branch: main</); assert.match(ready, /Last capture/); assert.doesNotMatch(ready, /discipline warning/);
});
test("all six views retain the same current global header, actions, version identity and status semantics", () => {
  const html = render(shell.AppShell, { onSystem() {}, actions: React.createElement("button", null, "Commands"),
    context: React.createElement(shell.WorkspaceContext, contextProps([])), children: React.createElement("p", null, "Feedback") });
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
  for (const expected of ["KATLAB Tracking Monitor", "Commands", "No repositories configured", "Feedback"]) assert.ok(html.includes(expected));
  const labelOwner = appText.slice(appText.indexOf("const VIEW_LABELS:"), appText.indexOf("function ViewNavigation"));
  assert.deepEqual([...labelOwner.matchAll(/\b(changes|mission|overview|history|city|chronicle):/g)].map(value => value[1]),
    ["changes", "mission", "overview", "history", "city", "chronicle"]);
  assert.equal((appText.match(/<AppShell\b/g) ?? []).length, 1);
  for (const state of ["connecting", "connected", "reconnecting"]) {
    const rendered = render(shell.ConnectionStatus, { state });
    assert.ok(rendered.includes(state[0].toUpperCase() + state.slice(1)));
    assert.ok(rendered.includes("not proof of fresh data or verification readiness"));
  }
});
test("current zero-choice copy is truthful for malformed or empty candidates even with repository tasks", () => {
  assert.equal(tasks.filter(task => task.repo === "EA").length, 1);
  for (const candidates_json of ["[]", "{}", "bad", "null"]) {
    const captured = Object.freeze(event({ candidates_json }));
    assert.deepEqual(actual.assignmentCandidates(captured, tasks), []);
    const html = render(actual.PickRow, rowProps({ event: captured }));
    assert.ok(html.replace(/\s+/g, " ").includes(COPY));
    assert.doesNotMatch(html, /No tasks defined|author a plan|becomes pickable once tasks exist|aria-haspopup="dialog"|>Assign</);
    assert.match(html, /text-xs italic text-slate-400/); assert.match(html, /src\/file\.ts/);
  }
});
test("actual nonempty/fallback choices, session labels, busy/retry and callbacks remain unchanged", () => {
  assert.deepEqual(actual.assignmentCandidates(event({ candidates_json: null }), tasks), ["plan - A.1"]);
  assert.deepEqual(actual.assignmentCandidates(event({ candidates_json: '["plan - A.1",7,"missing"]' }), tasks), ["plan - A.1", "missing"]);
  const calls = [], captured = event({ candidates_json: '["plan - A.1"]', file: '<file>&"long"'.repeat(30) });
  for (const [busy, note, label] of [[false, "", "Assign"], [false, "Assignment failed: fixture. Retry.", "Retry"], [true, "", "Assigning\u2026"]]) {
    const fixture = actual.direct(rowProps({ event: captured, choice: "plan - A.1", checked: true,
      onToggle: () => calls.push("toggle"), onChoiceChange: value => calls.push(value) }), [busy, note]);
    try {
      const nodes = elements(fixture.tree), checkbox = one(nodes, node => node.type === "input");
      assert.equal(checkbox.props.checked, true); checkbox.props.onChange(); assert.equal(calls.at(-1), "toggle");
      const chooser = one(nodes, node => node.type === deps.BoundedChoiceDialog);
      assert.equal(chooser.props.contextKey, JSON.stringify(["event-task", "EA", 7]));
      chooser.props.onChange(JSON.stringify(["task-ref", "EA", "plan - A.1"])); assert.equal(calls.at(-1), "plan - A.1");
      const assign = one(nodes, node => node.type === "button");
      assert.equal(normalized(assign), label); assert.equal(assign.props["aria-busy"], busy);
      assign.props.onClick(); // Current acquisition guard false, so no real PATCH/deadline.
    } finally { fixture.dispose(); }
  }
  for (const props of [rowProps({ choice: "invalid" }), rowProps({ choice: "plan - A.1", sectionDisabled: true })]) {
    const fixture = actual.direct(props); try {
      assert.equal(one(elements(fixture.tree), node => node.type === "button").props.disabled, true);
    } finally { fixture.dispose(); }
  }
  const html = render(actual.PickRow, rowProps({ event: captured }));
  assert.ok(html.includes("&lt;file&gt;&amp;&quot;long&quot;")); assert.match(html, /codex session current-/);
  assert.doesNotMatch(render(actual.PickRow, rowProps({ event: event({ session_id: null }) })), /session current-/);
});
