import { activePlanDocketPreservation } from "./helpers/activePlanDocket.mjs";
import { purposeNavigationPreservation } from "./helpers/purposeLedNavigation.mjs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CITY_BRIEF_SOURCES, CITY_BRIEF_SUITES, cityBriefPreservation,
  restoreCityDistrictBriefSource, restoreCityDistrictBriefSuite } from "./helpers/cityDistrictBrief.mjs";

// Current-source controlled render/SSR, not native layout, focus, keyboard or AT acceptance.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FRONTEND = resolve(ROOT, "Frontend"), require = createRequire(resolve(FRONTEND, "package.json"));
const ts = require("typescript"), postcss = require("postcss"), selectorParser = require("postcss-selector-parser");
const React = require("react"), { renderToStaticMarkup } = require("react-dom/server");
const sha = value => createHash("sha256").update(value).digest("hex");
const read = path => readFileSync(resolve(ROOT, path));
const text = path => read(path).toString("utf8"), lf = value => value.replace(/\r\n/g, "\n");
const physical = (value, eol) => eol === "CRLF" ? value.replace(/\n/g, "\r\n") : value;
const EXPECTED = {
  "sources": [
    {
      "path": "Frontend/src/city.tsx",
      "windows": [
        {
          "name": "CityDistrictBrief import after shared UI",
          "count": 1,
          "before": "import { CollectionPager, ControlButton, SectionHeading, useRememberedBoundedPage } from \"./ui\";\n",
          "after": "import { CollectionPager, ControlButton, SectionHeading, useRememberedBoundedPage } from \"./ui\";\nimport { CityDistrictBrief } from \"./CityDistrictBrief\";\n"
        },
        {
          "name": "Accepted-page brief outside SVG export owner",
          "count": 1,
          "before": "      <div className=\"rounded-panel border border-ui-border bg-ui-surface p-4 sm:p-5\">\n        <div className=\"ui-local-scroller overflow-x-auto\" role=\"region\"\n",
          "after": "      <div className=\"rounded-panel border border-ui-border bg-ui-surface p-4 sm:p-5\">\n        <CityDistrictBrief districts={visibleDistricts} pageRange={pageRange} onGoRepo={onGoRepo} />\n        <div className=\"ui-local-scroller overflow-x-auto\" role=\"region\"\n"
        }
      ],
      "before": {
        "bytes": 47226,
        "RAW": "1bdfcd61ada965c8428f5246d0512c8fc536111b9f4384c9eb3848647615a1a7",
        "LF": "3b49953bad776a93e311fc540f48ebe0989286837f5fca8d596036ca6dcca3f2",
        "LFbytes": 46210,
        "nativeEOL": "CRLF",
        "BOM": false
      },
      "after": {
        "bytes": 47386,
        "RAW": "6109492fdbb377617daac4ac829f4c9be0417b232c6d7253e92298624f224cb7",
        "LF": "e6e12c7f58ce1d2d0e29ed78283ea1985e56cebd7480a1e948695c146b583e0d",
        "LFbytes": 46368,
        "nativeEOL": "CRLF",
        "BOM": false
      }
    }
  ],
  "suites": [
    {
      "path": "Tests/test_achievement_gallery.mjs",
      "before": {
        "bytes": 36466,
        "RAW": "67c15a932a2631200de59ea084f26beeec0b92eddbc9a34487f75b2326c1fbd0",
        "LF": "67c15a932a2631200de59ea084f26beeec0b92eddbc9a34487f75b2326c1fbd0",
        "LFbytes": 36466,
        "nativeEOL": "LF",
        "BOM": false
      },
      "after": {
        "bytes": 36568,
        "RAW": "dbdad3ff989c8760f915e9b357afb56fc73aa598bc4b5c329fdecac2c255157f",
        "LF": "dbdad3ff989c8760f915e9b357afb56fc73aa598bc4b5c329fdecac2c255157f",
        "LFbytes": 36568,
        "nativeEOL": "LF",
        "BOM": false
      },
      "windows": [
        {
          "name": "oneHelperImport",
          "before": "import { mastheadPreservation } from \"./helpers/workspaceCommandMasthead.mjs\";\n",
          "after": "import { cityBriefPreservation } from \"./helpers/cityDistrictBrief.mjs\";\nimport { mastheadPreservation } from \"./helpers/workspaceCommandMasthead.mjs\";\n",
          "count": 1
        },
        {
          "name": "wholePinInput",
          "before": "mastheadPreservation(name, readFileSync(resolve(root, name)))",
          "after": "mastheadPreservation(name, cityBriefPreservation(name, readFileSync(resolve(root, name))))",
          "count": 1
        }
      ]
    },
    {
      "path": "Tests/test_attribution_station.mjs",
      "before": {
        "bytes": 42112,
        "RAW": "0c26835b1a6a6af2fc95e92484021b229bbfb1435beab4d114f0c32d03ab989d",
        "LF": "0c26835b1a6a6af2fc95e92484021b229bbfb1435beab4d114f0c32d03ab989d",
        "LFbytes": 42112,
        "nativeEOL": "LF",
        "BOM": false
      },
      "after": {
        "bytes": 42272,
        "RAW": "219c7834de23f01281eb26dd793fa67d109a28ac88c1fae2ec3076b4aded0558",
        "LF": "219c7834de23f01281eb26dd793fa67d109a28ac88c1fae2ec3076b4aded0558",
        "LFbytes": 42272,
        "nativeEOL": "LF",
        "BOM": false
      },
      "windows": [
        {
          "name": "oneHelperImport",
          "before": "import { mastheadPreservation } from \"./helpers/workspaceCommandMasthead.mjs\";\n",
          "after": "import { cityBriefPreservation } from \"./helpers/cityDistrictBrief.mjs\";\nimport { mastheadPreservation } from \"./helpers/workspaceCommandMasthead.mjs\";\n",
          "count": 1
        },
        {
          "name": "wholePinInput",
          "before": "mastheadPreservation(name, read(name))",
          "after": "mastheadPreservation(name, cityBriefPreservation(name, read(name)))",
          "count": 1
        },
        {
          "name": "historicalSuiteRead.test_workbench_2_0.mjs",
          "before": "  if (name === \"Tests/test_workbench_2_0.mjs\") return studioWorkbench(deskPreservation(name, mastheadPreservation(name, text)));\n",
          "after": "  if (name === \"Tests/test_workbench_2_0.mjs\") return studioWorkbench(deskPreservation(name, mastheadPreservation(name, cityBriefPreservation(name, text))));\n",
          "count": 1
        },
        {
          "name": "historicalSuiteRead.test_changes_review_desk.mjs",
          "before": "  if (name === \"Tests/test_changes_review_desk.mjs\") return studioChanges(deskPreservation(name, mastheadPreservation(name, text)));\n",
          "after": "  if (name === \"Tests/test_changes_review_desk.mjs\") return studioChanges(deskPreservation(name, mastheadPreservation(name, cityBriefPreservation(name, text))));\n",
          "count": 1
        }
      ]
    },
    {
      "path": "Tests/test_changes_review_desk.mjs",
      "before": {
        "bytes": 39170,
        "RAW": "d2a748e5e00b5631a588494f157e2b0669dff9a5adda5ad076499b1f98dbd152",
        "LF": "d2a748e5e00b5631a588494f157e2b0669dff9a5adda5ad076499b1f98dbd152",
        "LFbytes": 39170,
        "nativeEOL": "LF",
        "BOM": false
      },
      "after": {
        "bytes": 39301,
        "RAW": "0f01764047e7016c14a0d9956dcc177b7fd7bbf4fea66eb44b067e893ba0578f",
        "LF": "0f01764047e7016c14a0d9956dcc177b7fd7bbf4fea66eb44b067e893ba0578f",
        "LFbytes": 39301,
        "nativeEOL": "LF",
        "BOM": false
      },
      "windows": [
        {
          "name": "oneHelperImport",
          "before": "import { mastheadPreservation } from \"./helpers/workspaceCommandMasthead.mjs\";\n",
          "after": "import { cityBriefPreservation } from \"./helpers/cityDistrictBrief.mjs\";\nimport { mastheadPreservation } from \"./helpers/workspaceCommandMasthead.mjs\";\n",
          "count": 1
        },
        {
          "name": "wholePinInput",
          "before": "mastheadPreservation(name, read(name))",
          "after": "mastheadPreservation(name, cityBriefPreservation(name, read(name)))",
          "count": 1
        },
        {
          "name": "historicalSuiteRead.test_workbench_2_0.mjs",
          "before": "  if (name === \"Tests/test_workbench_2_0.mjs\") return restoreAttributionWorkbenchSuite(studioWorkbench(deskPreservation(name, mastheadPreservation(name, text))));\n",
          "after": "  if (name === \"Tests/test_workbench_2_0.mjs\") return restoreAttributionWorkbenchSuite(studioWorkbench(deskPreservation(name, mastheadPreservation(name, cityBriefPreservation(name, text)))));\n",
          "count": 1
        }
      ]
    },
    {
      "path": "Tests/test_changes_review_lanes.mjs",
      "before": {
        "bytes": 37992,
        "RAW": "0e20707dadd34b3f5faae559c62b45fc41e909edc620064eeda588286105020b",
        "LF": "0e20707dadd34b3f5faae559c62b45fc41e909edc620064eeda588286105020b",
        "LFbytes": 37992,
        "nativeEOL": "LF",
        "BOM": false
      },
      "after": {
        "bytes": 38101,
        "RAW": "ee071e2af937023c1bd4d6a27c1ccb8224014396647d5d73715c66d35c73b7f1",
        "LF": "ee071e2af937023c1bd4d6a27c1ccb8224014396647d5d73715c66d35c73b7f1",
        "LFbytes": 38101,
        "nativeEOL": "LF",
        "BOM": false
      },
      "windows": [
        {
          "name": "oneHelperImport",
          "before": "import { mastheadPreservation } from \"./helpers/workspaceCommandMasthead.mjs\";\n",
          "after": "import { cityBriefPreservation } from \"./helpers/cityDistrictBrief.mjs\";\nimport { mastheadPreservation } from \"./helpers/workspaceCommandMasthead.mjs\";\n",
          "count": 1
        },
        {
          "name": "wholePinnedInputs",
          "before": "const current = mastheadPreservation(record.path, readFileSync(resolve(ROOT, record.path)));",
          "after": "const current = mastheadPreservation(record.path, cityBriefPreservation(record.path, readFileSync(resolve(ROOT, record.path))));",
          "count": 1
        }
      ]
    },
    {
      "path": "Tests/test_chronicle_reader_canvas.mjs",
      "before": {
        "bytes": 19249,
        "RAW": "d0e01004dbc0d86e89f2893398b10cd869eaa89c0b925e0eaf9875b36b92026c",
        "LF": "d0e01004dbc0d86e89f2893398b10cd869eaa89c0b925e0eaf9875b36b92026c",
        "LFbytes": 19249,
        "nativeEOL": "LF",
        "BOM": false
      },
      "after": {
        "bytes": 19351,
        "RAW": "fe5028216b66ac72b39820659478d23d1586906c09addc92faab62abed9823e5",
        "LF": "fe5028216b66ac72b39820659478d23d1586906c09addc92faab62abed9823e5",
        "LFbytes": 19351,
        "nativeEOL": "LF",
        "BOM": false
      },
      "windows": [
        {
          "name": "oneHelperImport",
          "before": "import { mastheadPreservation } from \"./helpers/workspaceCommandMasthead.mjs\";\n",
          "after": "import { cityBriefPreservation } from \"./helpers/cityDistrictBrief.mjs\";\nimport { mastheadPreservation } from \"./helpers/workspaceCommandMasthead.mjs\";\n",
          "count": 1
        },
        {
          "name": "wholePinInput",
          "before": "mastheadPreservation(path, read(path))",
          "after": "mastheadPreservation(path, cityBriefPreservation(path, read(path)))",
          "count": 1
        }
      ]
    },
    {
      "path": "Tests/test_city_trailing_retirement.mjs",
      "before": {
        "bytes": 26305,
        "RAW": "38f6c106b23c803b4742da4cf31b35e3bef7be279af2069c0a933384eb2dc5e5",
        "LF": "38f6c106b23c803b4742da4cf31b35e3bef7be279af2069c0a933384eb2dc5e5",
        "LFbytes": 26305,
        "nativeEOL": "LF",
        "BOM": false
      },
      "after": {
        "bytes": 26474,
        "RAW": "e36fa19ad94584c0065be10280ee9672c7c0fa0868a1905c5980c6773e0455c5",
        "LF": "e36fa19ad94584c0065be10280ee9672c7c0fa0868a1905c5980c6773e0455c5",
        "LFbytes": 26474,
        "nativeEOL": "LF",
        "BOM": false
      },
      "windows": [
        {
          "name": "oneHelperImport",
          "before": "import assert from \"node:assert/strict\";\n",
          "after": "import { cityBriefPreservation } from \"./helpers/cityDistrictBrief.mjs\";\nimport assert from \"node:assert/strict\";\n",
          "count": 1
        },
        {
          "name": "wholeOriginalPositiveBeforeOldInverse",
          "before": "for (const newline of [\"\\n\", \"\\r\\n\"]) assertOriginal(restore(lf(originalSource).replaceAll(\"\\n\", newline)));",
          "after": "for (const newline of [\"\\n\", \"\\r\\n\"]) assertOriginal(restore(lf(cityBriefPreservation(\"Frontend/src/city.tsx\", originalSource)).replaceAll(\"\\n\", newline)));",
          "count": 1
        },
        {
          "name": "wholeOriginalNegativesBeforeMutation",
          "before": "test(\"immutable original fingerprints detect unrelated owner, helper and presentation changes\", () => {\n  const source = lf(originalSource);",
          "after": "test(\"immutable original fingerprints detect unrelated owner, helper and presentation changes\", () => {\n  const source = lf(cityBriefPreservation(\"Frontend/src/city.tsx\", originalSource));",
          "count": 1
        }
      ]
    },
    {
      "path": "Tests/test_diagnostic_studio.mjs",
      "before": {
        "bytes": 40491,
        "RAW": "0151a157766429e4c59d83e32df1d37f12a3143356762ae2ae825892f2f97c8e",
        "LF": "0151a157766429e4c59d83e32df1d37f12a3143356762ae2ae825892f2f97c8e",
        "LFbytes": 40491,
        "nativeEOL": "LF",
        "BOM": false
      },
      "after": {
        "bytes": 40654,
        "RAW": "a057fb5ec8b21e00a6093cce51eceb945e1765c8f22fbdab6694435e5a16791b",
        "LF": "a057fb5ec8b21e00a6093cce51eceb945e1765c8f22fbdab6694435e5a16791b",
        "LFbytes": 40654,
        "nativeEOL": "LF",
        "BOM": false
      },
      "windows": [
        {
          "name": "oneHelperImport",
          "before": "import { mastheadPreservation } from \"./helpers/workspaceCommandMasthead.mjs\";\n",
          "after": "import { cityBriefPreservation } from \"./helpers/cityDistrictBrief.mjs\";\nimport { mastheadPreservation } from \"./helpers/workspaceCommandMasthead.mjs\";\n",
          "count": 1
        },
        {
          "name": "historicalThreeSuiteInputs",
          "before": "mastheadPreservation(spec[1], read(spec[1]))",
          "after": "mastheadPreservation(spec[1], cityBriefPreservation(spec[1], read(spec[1])))",
          "count": 1
        },
        {
          "name": "wholeRawPinInput",
          "before": "mastheadPreservation(name, readFileSync(resolve(root, name)))",
          "after": "mastheadPreservation(name, cityBriefPreservation(name, readFileSync(resolve(root, name))))",
          "count": 1
        },
        {
          "name": "wholeTextPinInput",
          "before": "mastheadPreservation(name, read(name))",
          "after": "mastheadPreservation(name, cityBriefPreservation(name, read(name)))",
          "count": 1
        }
      ]
    },
    {
      "path": "Tests/test_mission_command_desk.mjs",
      "before": {
        "bytes": 53352,
        "RAW": "e1a07f48051dbbaef61beb6b3ec76f37fdbb7fdb25d7137dec80bd721c76d96a",
        "LF": "e1a07f48051dbbaef61beb6b3ec76f37fdbb7fdb25d7137dec80bd721c76d96a",
        "LFbytes": 53352,
        "nativeEOL": "LF",
        "BOM": false
      },
      "after": {
        "bytes": 53483,
        "RAW": "3c669d49ba4e9b332059cd5d5d17ed32f4153cbcced7a2167f554b3539e79603",
        "LF": "3c669d49ba4e9b332059cd5d5d17ed32f4153cbcced7a2167f554b3539e79603",
        "LFbytes": 53483,
        "nativeEOL": "LF",
        "BOM": false
      },
      "windows": [
        {
          "name": "oneHelperImport",
          "before": "import { mastheadPreservation } from \"./helpers/workspaceCommandMasthead.mjs\";\n",
          "after": "import { cityBriefPreservation } from \"./helpers/cityDistrictBrief.mjs\";\nimport { mastheadPreservation } from \"./helpers/workspaceCommandMasthead.mjs\";\n",
          "count": 1
        },
        {
          "name": "whole25SuiteInputs",
          "before": "for (const [path,originalHash] of ADAPTED_SUITES) {\n    const actual = reviewLanesPreservation(path, mastheadPreservation(path, read(path)));",
          "after": "for (const [path,originalHash] of ADAPTED_SUITES) {\n    const actual = reviewLanesPreservation(path, mastheadPreservation(path, cityBriefPreservation(path, read(path))));",
          "count": 1
        },
        {
          "name": "immutablePinInputs",
          "before": "const value = reviewLanesPreservation(path, mastheadPreservation(path, read(path)));",
          "after": "const value = reviewLanesPreservation(path, mastheadPreservation(path, cityBriefPreservation(path, read(path))));",
          "count": 1
        }
      ]
    },
    {
      "path": "Tests/test_momentum_comparison_deck.mjs",
      "before": {
        "bytes": 29892,
        "RAW": "49684cfe5f4300d3370edcb2ae3308d457f59e80ccb29d3ed7ce358ff842b656",
        "LF": "49684cfe5f4300d3370edcb2ae3308d457f59e80ccb29d3ed7ce358ff842b656",
        "LFbytes": 29892,
        "nativeEOL": "LF",
        "BOM": false
      },
      "after": {
        "bytes": 29994,
        "RAW": "b893d1afc5a91232545ee8f00b09b3a877da552cb886509a6aaeb5a721663173",
        "LF": "b893d1afc5a91232545ee8f00b09b3a877da552cb886509a6aaeb5a721663173",
        "LFbytes": 29994,
        "nativeEOL": "LF",
        "BOM": false
      },
      "windows": [
        {
          "name": "oneHelperImport",
          "before": "import { mastheadPreservation } from \"./helpers/workspaceCommandMasthead.mjs\";\n",
          "after": "import { cityBriefPreservation } from \"./helpers/cityDistrictBrief.mjs\";\nimport { mastheadPreservation } from \"./helpers/workspaceCommandMasthead.mjs\";\n",
          "count": 1
        },
        {
          "name": "wholePinInput",
          "before": "mastheadPreservation(path, readFileSync(resolve(root, path)))",
          "after": "mastheadPreservation(path, cityBriefPreservation(path, readFileSync(resolve(root, path))))",
          "count": 1
        }
      ]
    },
    {
      "path": "Tests/test_personal_records_showcase.mjs",
      "before": {
        "bytes": 32353,
        "RAW": "16051138560daaf5789f854b249b36142be36ab09899adf446ecb2b016d931cb",
        "LF": "16051138560daaf5789f854b249b36142be36ab09899adf446ecb2b016d931cb",
        "LFbytes": 32353,
        "nativeEOL": "LF",
        "BOM": false
      },
      "after": {
        "bytes": 32455,
        "RAW": "73bb7c1452432aea4ad1a4275f6b7bf971e879276cf36afc862522cbda150540",
        "LF": "73bb7c1452432aea4ad1a4275f6b7bf971e879276cf36afc862522cbda150540",
        "LFbytes": 32455,
        "nativeEOL": "LF",
        "BOM": false
      },
      "windows": [
        {
          "name": "oneHelperImport",
          "before": "import { mastheadPreservation } from \"./helpers/workspaceCommandMasthead.mjs\";\n",
          "after": "import { cityBriefPreservation } from \"./helpers/cityDistrictBrief.mjs\";\nimport { mastheadPreservation } from \"./helpers/workspaceCommandMasthead.mjs\";\n",
          "count": 1
        },
        {
          "name": "wholePinInput",
          "before": "mastheadPreservation(path, readFileSync(resolve(root, path)))",
          "after": "mastheadPreservation(path, cityBriefPreservation(path, readFileSync(resolve(root, path))))",
          "count": 1
        }
      ]
    },
    {
      "path": "Tests/test_provenance_evidence_desk.mjs",
      "before": {
        "bytes": 40535,
        "RAW": "2c9de06c35e472b10fbc94bf19ec121299fa194bd786a1e3ff06a428116e2da4",
        "LF": "2c9de06c35e472b10fbc94bf19ec121299fa194bd786a1e3ff06a428116e2da4",
        "LFbytes": 40535,
        "nativeEOL": "LF",
        "BOM": false
      },
      "after": {
        "bytes": 40637,
        "RAW": "12655bfa47241ff0c84c652a5c87f347b27faa5905275462068f91d8f9043f26",
        "LF": "12655bfa47241ff0c84c652a5c87f347b27faa5905275462068f91d8f9043f26",
        "LFbytes": 40637,
        "nativeEOL": "LF",
        "BOM": false
      },
      "windows": [
        {
          "name": "oneHelperImport",
          "before": "import { mastheadPreservation } from \"./helpers/workspaceCommandMasthead.mjs\";\n",
          "after": "import { cityBriefPreservation } from \"./helpers/cityDistrictBrief.mjs\";\nimport { mastheadPreservation } from \"./helpers/workspaceCommandMasthead.mjs\";\n",
          "count": 1
        },
        {
          "name": "wholePinInput",
          "before": "mastheadPreservation(name, read(name))",
          "after": "mastheadPreservation(name, cityBriefPreservation(name, read(name)))",
          "count": 1
        }
      ]
    },
    {
      "path": "Tests/test_repository_profile.mjs",
      "before": {
        "bytes": 25853,
        "RAW": "a6b2cee7706eefb9f20e089beec193420b1853318dc5375106b2a0faa8aac883",
        "LF": "a6b2cee7706eefb9f20e089beec193420b1853318dc5375106b2a0faa8aac883",
        "LFbytes": 25853,
        "nativeEOL": "LF",
        "BOM": false
      },
      "after": {
        "bytes": 25955,
        "RAW": "3070d00ac49a781aa41b975f5ff987dd95271ceb3c5ff31d2faabc20634565ff",
        "LF": "3070d00ac49a781aa41b975f5ff987dd95271ceb3c5ff31d2faabc20634565ff",
        "LFbytes": 25955,
        "nativeEOL": "LF",
        "BOM": false
      },
      "windows": [
        {
          "name": "oneHelperImport",
          "before": "import { mastheadPreservation } from \"./helpers/workspaceCommandMasthead.mjs\";\n",
          "after": "import { cityBriefPreservation } from \"./helpers/cityDistrictBrief.mjs\";\nimport { mastheadPreservation } from \"./helpers/workspaceCommandMasthead.mjs\";\n",
          "count": 1
        },
        {
          "name": "wholePinInput",
          "before": "mastheadPreservation(name, readFileSync(resolve(root, name)))",
          "after": "mastheadPreservation(name, cityBriefPreservation(name, readFileSync(resolve(root, name))))",
          "count": 1
        }
      ]
    },
    {
      "path": "Tests/test_repository_scope_picker.mjs",
      "before": {
        "bytes": 23323,
        "RAW": "78a7989c50ce545d49942d87cd9a7de8efd45a4b4e291ea00e274a21e03169f1",
        "LF": "78a7989c50ce545d49942d87cd9a7de8efd45a4b4e291ea00e274a21e03169f1",
        "LFbytes": 23323,
        "nativeEOL": "LF",
        "BOM": false
      },
      "after": {
        "bytes": 23425,
        "RAW": "32a76dbcd825360fab71cc80de89c49a2dbaac48327adedd2300e5bf4ebf2569",
        "LF": "32a76dbcd825360fab71cc80de89c49a2dbaac48327adedd2300e5bf4ebf2569",
        "LFbytes": 23425,
        "nativeEOL": "LF",
        "BOM": false
      },
      "windows": [
        {
          "name": "oneHelperImport",
          "before": "import { mastheadPreservation } from \"./helpers/workspaceCommandMasthead.mjs\";\n",
          "after": "import { cityBriefPreservation } from \"./helpers/cityDistrictBrief.mjs\";\nimport { mastheadPreservation } from \"./helpers/workspaceCommandMasthead.mjs\";\n",
          "count": 1
        },
        {
          "name": "wholePinInput",
          "before": "mastheadPreservation(path, read(path))",
          "after": "mastheadPreservation(path, cityBriefPreservation(path, read(path)))",
          "count": 1
        }
      ]
    },
    {
      "path": "Tests/test_workbench_2_0.mjs",
      "before": {
        "bytes": 44164,
        "RAW": "371b8ee91881b3ccdbfc555f449819d04cfcbb4810ca9cbbaa6ebcfbcf3d24da",
        "LF": "371b8ee91881b3ccdbfc555f449819d04cfcbb4810ca9cbbaa6ebcfbcf3d24da",
        "LFbytes": 44164,
        "nativeEOL": "LF",
        "BOM": false
      },
      "after": {
        "bytes": 44266,
        "RAW": "1d98188056721b2c7ae0abbbb6495c801667a030ecea8e02d0057f5e4b777ae2",
        "LF": "1d98188056721b2c7ae0abbbb6495c801667a030ecea8e02d0057f5e4b777ae2",
        "LFbytes": 44266,
        "nativeEOL": "LF",
        "BOM": false
      },
      "windows": [
        {
          "name": "oneHelperImport",
          "before": "import { mastheadPreservation } from \"./helpers/workspaceCommandMasthead.mjs\";\n",
          "after": "import { cityBriefPreservation } from \"./helpers/cityDistrictBrief.mjs\";\nimport { mastheadPreservation } from \"./helpers/workspaceCommandMasthead.mjs\";\n",
          "count": 1
        },
        {
          "name": "wholePinInput",
          "before": "mastheadPreservation(name, read(name))",
          "after": "mastheadPreservation(name, cityBriefPreservation(name, read(name)))",
          "count": 1
        }
      ]
    },
    {
      "path": "Tests/test_workspace_command_masthead.mjs",
      "before": {
        "bytes": 60928,
        "RAW": "d3dd7edb8f146f9a51778f8be028f54cfbe9d97b11837f53074caeca1cb5877e",
        "LF": "d3dd7edb8f146f9a51778f8be028f54cfbe9d97b11837f53074caeca1cb5877e",
        "LFbytes": 60928,
        "nativeEOL": "LF",
        "BOM": false
      },
      "after": {
        "bytes": 61034,
        "RAW": "808735fd53e5fa243fe526fbf8f49361a9c33b3eb9b334f51e406bd343739f35",
        "LF": "808735fd53e5fa243fe526fbf8f49361a9c33b3eb9b334f51e406bd343739f35",
        "LFbytes": 61034,
        "nativeEOL": "LF",
        "BOM": false
      },
      "windows": [
        {
          "name": "oneHelperImport",
          "before": "import assert from \"node:assert/strict\";\n",
          "after": "import { cityBriefPreservation } from \"./helpers/cityDistrictBrief.mjs\";\nimport assert from \"node:assert/strict\";\n",
          "count": 1
        },
        {
          "name": "whole26SuiteInputs",
          "before": "const input = read(pin.path); assert.equal(sha(input), pin.after.RAW);",
          "after": "const input = cityBriefPreservation(pin.path, read(pin.path)); assert.equal(sha(input), pin.after.RAW);",
          "count": 1
        }
      ]
    }
  ]
};
const MODULE = "import type { DistrictData } from \"./city\";\nimport { ControlButton } from \"./ui\";\nimport \"./cityDistrictBrief.css\";\n\nexport function CityDistrictBrief ({ districts, pageRange, onGoRepo }: {\n  districts: readonly DistrictData[];\n  pageRange: string;\n  onGoRepo: (repoId: string) => void;\n}) {\n  return (\n    <section className=\"city-district-brief\" aria-labelledby=\"city-district-brief-heading\">\n      <div className=\"city-district-brief-heading\">\n        <h3 id=\"city-district-brief-heading\">Visible districts</h3>\n        <p>Workspace-wide. {pageRange}.</p>\n      </div>\n      {districts.length === 0 ? (\n        <p className=\"city-district-brief-empty\">No districts to show.</p>\n      ) : (\n        <ul className=\"city-district-brief-list\">\n          {districts.map((district, index) => (\n            <li key={JSON.stringify([district.repo.id, index])}>\n              <ControlButton className=\"city-district-identity\"\n                aria-label={`Open ${district.repo.id} in Overview`}\n                onClick={() => onGoRepo(district.repo.id)}>\n                {district.repo.id}\n              </ControlButton>\n              <dl>\n                <div>\n                  <dt>Git status</dt>\n                  <dd>{district.repo.offline ? \"Repository offline\"\n                    : district.repo.status_valid !== true ? \"Git status unavailable\"\n                    : district.repo.clean ? \"Working tree clean\"\n                    : <><span className=\"font-mono tabular-nums\">{district.repo.count.toLocaleString(\"en-US\")}</span> uncommitted</>}</dd>\n                </div>\n                <div>\n                  <dt>Plan tasks</dt>\n                  <dd><span className=\"font-mono tabular-nums\">{district.inProgress.length.toLocaleString(\"en-US\")}</span> task{district.inProgress.length === 1 ? \"\" : \"s\"} marked in progress</dd>\n                </div>\n              </dl>\n            </li>\n          ))}\n        </ul>\n      )}\n    </section>\n  );\n}\n";
const CSS = ".city-district-brief {\n  min-width: 0;\n  margin-bottom: 1.25rem;\n}\n\n.city-district-brief > .city-district-brief-heading {\n  display: flex;\n  min-width: 0;\n  flex-wrap: wrap;\n  align-items: flex-start;\n  gap: 0.5rem 1rem;\n}\n\n.city-district-brief > .city-district-brief-heading > h3 {\n  margin: 0;\n  color: rgb(var(--ui-text));\n  font-size: 1.125rem;\n  font-weight: 600;\n  line-height: 1.5;\n  overflow-wrap: anywhere;\n}\n\n.city-district-brief > .city-district-brief-heading > p,\n.city-district-brief > .city-district-brief-empty {\n  min-width: 0;\n  margin: 0;\n  color: rgb(var(--ui-text-muted));\n  font-size: 0.875rem;\n  line-height: 1.5;\n  overflow-wrap: anywhere;\n}\n\n.city-district-brief > .city-district-brief-empty {\n  margin-top: 1rem;\n}\n\n.city-district-brief > .city-district-brief-list {\n  display: grid;\n  min-width: 0;\n  grid-template-columns: minmax(0, 1fr);\n  gap: 0.75rem;\n  margin: 1rem 0 0;\n  padding: 0;\n  list-style: none;\n}\n\n.city-district-brief > .city-district-brief-list > li {\n  min-width: 0;\n  padding: 1rem;\n  border: 1px solid rgb(var(--ui-border));\n  border-radius: 0.5rem;\n  background: rgb(var(--ui-canvas));\n}\n\n.city-district-brief > .city-district-brief-list > li > .city-district-identity {\n  width: 100%;\n  min-width: 0;\n  min-height: 2.75rem;\n  justify-content: flex-start;\n  padding: 0.5rem 0.75rem;\n  font-size: 1rem;\n  font-weight: 600;\n  line-height: 1.5;\n  text-align: left;\n  white-space: normal;\n  overflow-wrap: anywhere;\n}\n\n.city-district-brief > .city-district-brief-list > li > dl {\n  display: grid;\n  min-width: 0;\n  gap: 0.75rem;\n  margin: 0.75rem 0 0;\n}\n\n.city-district-brief > .city-district-brief-list > li > dl > div {\n  min-width: 0;\n}\n\n.city-district-brief > .city-district-brief-list > li > dl > div > dt {\n  margin: 0;\n  color: rgb(var(--ui-text-muted));\n  font-size: 0.75rem;\n  line-height: 1.5;\n}\n\n.city-district-brief > .city-district-brief-list > li > dl > div > dd {\n  margin: 0.25rem 0 0;\n  color: rgb(var(--ui-text));\n  font-size: 1rem;\n  line-height: 1.5;\n  overflow-wrap: anywhere;\n}\n\n@media (min-width: 768px) {\n  .city-district-brief > .city-district-brief-list {\n    grid-template-columns: repeat(2, minmax(0, 1fr));\n  }\n}\n\n@media (min-width: 1280px) {\n  .city-district-brief > .city-district-brief-list {\n    grid-template-columns: repeat(3, minmax(0, 1fr));\n  }\n}\n";
const CITY_PATH = "Frontend/src/city.tsx", MODULE_PATH = "Frontend/src/CityDistrictBrief.tsx";
const CSS_PATH = "Frontend/src/cityDistrictBrief.css";
const nativeIdentity = (spec, input) => {
  assert.equal(input.length, spec.bytes); assert.equal(sha(input), spec.RAW);
  assert.equal(sha(lf(input.toString("utf8"))), spec.LF);
  assert.equal(input.subarray(0, 3).equals(Buffer.from([239, 187, 191])), false);
};
const astOf = (path, value) => {
  const ast = ts.createSourceFile(path, value, ts.ScriptTarget.Latest, true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.JS);
  assert.equal(ast.parseDiagnostics.length, 0); return ast;
};
const only = (values, label) => { assert.equal(values.length, 1, label); return values[0]; };
const all = (node, predicate) => {
  const values = []; const visit = child => { if (predicate(child)) values.push(child); ts.forEachChild(child, visit); };
  visit(node); return values;
};
const unwrap = node => { while (ts.isParenthesizedExpression(node)) node = node.expression; return node; };
const elements = value => {
  const found = []; const visit = child => {
    if (Array.isArray(child)) { child.forEach(visit); return; }
    if (!React.isValidElement(child)) return;
    found.push(child); visit(child.props.children);
  }; visit(value); return found;
};
const content = value => {
  if (Array.isArray(value)) return value.map(content).join("");
  if (React.isValidElement(value)) return content(value.props.children);
  return value === null || value === undefined || typeof value === "boolean" ? "" : String(value);
};
const district = (id, extra = {}, tasks = 0) => ({
  repo: { id, path: "fixture", offline: false, status_valid: true, clean: true,
    count: 0, last_event_ts: null, ...extra }, churn: [],
  inProgress: Array.from({ length: tasks }, (_, index) => ({ id: index, repo: id, status: "in-progress" })),
});

let vite, Brief, ui, modules;
before(async () => {
  const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
  vite = await createServer({ root: FRONTEND,
    server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom",
    optimizeDeps: { noDiscovery: true, entries: [] } });
  Brief = (await vite.ssrLoadModule("/src/CityDistrictBrief.tsx")).CityDistrictBrief;
  ui = await vite.ssrLoadModule("/src/ui.tsx");
  modules = new Map();
  for (const name of ["api", "calendarHeatmap", "download", "pet", "theme", "accessibleData"]) {
    modules.set("./" + name, await vite.ssrLoadModule("/src/" + name + (["api", "download", "theme"].includes(name) ? ".ts" : ".tsx")));
  }
});
after(async () => { if (vite) await vite.close(); });

test("reviewed City source and fifteen suite inputs preserve every published byte in LF/CRLF String/Buffer", () => {
  assert.deepEqual(CITY_BRIEF_SOURCES, EXPECTED.sources);
  assert.deepEqual(CITY_BRIEF_SUITES, EXPECTED.suites);
  assert.equal(EXPECTED.sources.length, 1); assert.equal(EXPECTED.suites.length, 15);
  assert.equal(EXPECTED.suites.reduce((sum, spec) => sum + spec.windows.length, 0), 37);
  for (const spec of [...EXPECTED.sources, ...EXPECTED.suites]) {
    nativeIdentity(spec.after, purposeNavigationPreservation(spec.path, activePlanDocketPreservation(spec.path, read(spec.path))));
    const current = lf(purposeNavigationPreservation(spec.path, activePlanDocketPreservation(spec.path, text(spec.path))));
    for (const eol of ["LF", "CRLF"]) for (const buffer of [false, true]) {
      const input = physical(current, eol), value = buffer ? Buffer.from(input) : input;
      const output = cityBriefPreservation(spec.path, value);
      assert.equal(Buffer.isBuffer(output), buffer);
      const decoded = Buffer.isBuffer(output) ? output.toString("utf8") : output;
      assert.equal(sha(lf(decoded)), spec.before.LF);
      const native = Buffer.from(physical(lf(decoded), spec.before.nativeEOL));
      nativeIdentity(spec.before, native);
      assert.equal(decoded.includes("\r\n"), eol === "CRLF");
    }
  }
  const nonTarget = Buffer.from("unchanged\n");
  assert.equal(cityBriefPreservation("Hook/provider_adapters.py", nonTarget), nonTarget);
  assert.equal(cityBriefPreservation("Frontend/src/App.tsx", "current raw input"), "current raw input");
});

test("strict preservation rejects altered windows, outside edits, invalid encodings and malformed paths", () => {
  for (const spec of [...EXPECTED.sources, ...EXPECTED.suites]) {
    const current = lf(purposeNavigationPreservation(spec.path, activePlanDocketPreservation(spec.path, text(spec.path)))), window = spec.windows[0];
    const adversaries = [current.replace(window.after, window.before),
      current.replace(window.after, window.after + window.after),
      current.replace(window.after, window.after + "/* changed reviewed window */"),
      "/* unrelated owner edit */\n" + current, current + "\n", current.slice(0, -1),
      "\uFEFF" + current, current.replace("\n", "\r"), current.replace("\n", "\r\n"),
      Buffer.concat([Buffer.from(current), Buffer.from([0xff])])];
    for (const bad of adversaries) {
      assert.notDeepEqual(bad, current, "negative fixtures actually differ");
      assert.throws(() => cityBriefPreservation(spec.path, bad));
    }
    for (const window of spec.windows.slice(1)) {
      const bad = current.replace(window.after, window.before);
      assert.notEqual(bad, current); assert.throws(() => cityBriefPreservation(spec.path, bad));
    }
  }
  for (const path of ["", "/Frontend/src/city.tsx", "../city.tsx", "Tests/../x", "Tests//x", "C:/x"]) {
    assert.throws(() => cityBriefPreservation(path, "x\n"));
  }
  assert.throws(() => restoreCityDistrictBriefSource("Tests/test_city_trailing_retirement.mjs", text("Tests/test_city_trailing_retirement.mjs")));
  assert.throws(() => restoreCityDistrictBriefSuite(CITY_PATH, text(CITY_PATH)));
});

function cssShape (value) {
  const root = postcss.parse(value); assert.equal(root.nodes.length, 14);
  const result = [];
  const rule = node => {
    assert.equal(node.type, "rule");
    const ast = selectorParser().astSync(node.selector);
    for (const selector of ast.nodes) {
      assert.equal(selector.nodes[0].type, "class"); assert.equal(selector.nodes[0].value, "city-district-brief");
      assert.ok(!selector.nodes.some(token => ["id", "pseudo"].includes(token.type)));
    }
    assert.ok(node.nodes.every(child => child.type === "decl"));
    const declarations = node.nodes.map(child => {
      assert.equal(!!child.important, false); assert.doesNotMatch(child.value, /url\s*\(/i);
      return [child.prop, child.value, !!child.important];
    });
    assert.equal(new Set(declarations.map(([key]) => key)).size, declarations.length);
    return [node.selector, declarations];
  };
  root.nodes.forEach((node, index) => {
    if (index < 12) result.push(["root", rule(node)]);
    else {
      assert.equal(node.type, "atrule"); assert.equal(node.name, "media");
      assert.equal(node.params, index === 12 ? "(min-width: 768px)" : "(min-width: 1280px)");
      assert.equal(node.nodes.length, 1); result.push([node.params, rule(node.nodes[0])]);
    }
  }); return result;
}
test("exact scoped CSS retains twelve roots and two direct media rules without resources or scroll owners", () => {
  const current = text(CSS_PATH); assert.equal(current, CSS);
  assert.equal(Buffer.byteLength(current), 2328);
  assert.equal(sha(current), "81d495fb97b53713910fb62eac972b048de5a6b57189fe32e8de65ae405ff487");
  const expected = cssShape(CSS); assert.deepEqual(cssShape(current), expected);
  for (const bad of [current + "\nbody { color: red; }",
    current.replace("min-width: 0", "min-width: 1px"),
    current.replace("repeat(2, minmax(0, 1fr))", "repeat(3, minmax(0, 1fr))"),
    current.replace("overflow-wrap: anywhere", "overflow: hidden"),
    current.replace("width: 100%", "width: 100% !important"),
    current.replace("@media (min-width: 768px) {", "@media (min-width: 768px) { @font-face {font-family: x;}"),
    current.replace(".city-district-brief {", "body {")]) {
    assert.notEqual(bad, current); assert.throws(() => assert.deepEqual(cssShape(bad), expected));
  }
});

test("new pure brief contains only current data, shared native controls and existing numeric utilities", () => {
  const current = text(MODULE_PATH); assert.equal(current, MODULE);
  assert.equal(Buffer.byteLength(current), 1950); assert.equal(current.split("\n").length - 1, 46);
  assert.equal(sha(current), "dec670f2adabae0db335f79d23e3971c34fef65aa2b9cae591e171880755db9e");
  const ast = astOf(MODULE_PATH, current);
  const imports = ast.statements.filter(ts.isImportDeclaration);
  assert.equal(imports.length, 3);
  assert.deepEqual(imports.map(node => node.moduleSpecifier.text), ["./city", "./ui", "./cityDistrictBrief.css"]);
  assert.equal(imports[0].importClause.isTypeOnly, true);
  const declaration = only(ast.statements.filter(ts.isFunctionDeclaration), "one pure component");
  assert.equal(declaration.name.text, "CityDistrictBrief");
  assert.equal(all(declaration, ts.isCallExpression).filter(node => /use[A-Z]|fetch|api\.|setTimeout|Date\.|Math\.random/.test(node.expression.getText(ast))).length, 0);
  const numeric = all(declaration, ts.isJsxAttribute).filter(node => node.name.getText(ast) === "className"
    && node.initializer && ts.isStringLiteral(node.initializer) && node.initializer.text === "font-mono tabular-nums");
  assert.equal(numeric.length, 2);
  assert.equal(all(declaration, ts.isJsxAttribute).filter(node => node.name.getText(ast) === "dangerouslySetInnerHTML").length, 0);
});

const brief = (districts, pageRange = "1–6 of 6 repositories", onGoRepo = () => {}) =>
  Brief({ districts, pageRange, onGoRepo });
const listItems = tree => elements(tree).filter(node => node.type === "li");
const fields = item => elements(item).filter(node => node.type === "dd").map(node => content(node));
test("zero, one and six districts retain supplied order, full identities, exact range and escaped text", () => {
  for (const size of [0, 1, 6]) {
    const data = Array.from({ length: size }, (_, index) => district("Repo" + index));
    const before = JSON.stringify(data), tree = brief(data, size === 0 ? "0 of 0 repositories" : "1–" + size + " of " + size + " repositories");
    assert.equal(listItems(tree).length, size); assert.equal(JSON.stringify(data), before);
    assert.match(content(tree), /Visible districtsWorkspace-wide\./);
    assert.equal(elements(tree).find(node => node.type === "section").props["aria-labelledby"], "city-district-brief-heading");
    if (size === 0) { assert.match(content(tree), /0 of 0 repositories.*No districts to show\./); }
    else assert.deepEqual(listItems(tree).map(item => content(elements(item).find(node => node.type === ui.ControlButton))), data.map(value => value.repo.id));
  }
  const name = "<script>& long\\path " + "repository".repeat(70), data = [district(name), district(name)];
  const tree = brief(data, "7–8 of 8 repositories"), items = listItems(tree);
  assert.equal(items.length, 2); assert.notEqual(items[0].key, items[1].key);
  const html = renderToStaticMarkup(React.createElement(Brief, { districts: data, pageRange: "7–8 of 8 repositories", onGoRepo() {} }));
  assert.ok(html.includes("&lt;script&gt;&amp; long"));
  assert.ok(!html.includes("<script>")); assert.ok(html.includes("Workspace-wide. 7–8 of 8 repositories."));
});

test("Git qualifiers suppress retained counts and task counts remain literal status labels, not productivity", () => {
  const inputs = [
    district("offline", { offline: true, status_valid: true, clean: true, count: 987 }, 0),
    district("unknown", { status_valid: false, clean: true, count: 987 }, 1),
    district("missing", { status_valid: undefined, clean: false, count: 987 }, 3),
    district("clean", { clean: true, count: 987 }, 0),
    district("dirty-zero", { clean: false, count: 0 }, 1),
    district("dirty-large", { clean: false, count: 1234 }, 1000),
  ];
  const before = JSON.stringify(inputs), actual = listItems(brief(inputs)).map(fields);
  assert.deepEqual(actual, [
    ["Repository offline", "0 tasks marked in progress"],
    ["Git status unavailable", "1 task marked in progress"],
    ["Git status unavailable", "3 tasks marked in progress"],
    ["Working tree clean", "0 tasks marked in progress"],
    ["0 uncommitted", "1 task marked in progress"],
    ["1,234 uncommitted", "1,000 tasks marked in progress"],
  ]);
  assert.equal(JSON.stringify(inputs), before);
  assert.doesNotMatch(content(brief(inputs)), /987|productive|fresh|verified|complete workload/i);
});

test("all repository actions use actual shared ControlButton and exact caller callback once per activation", () => {
  const values = [district("A"), district("A"), district("offline", {offline:true}), district("unknown", {status_valid:false})];
  const calls = [], tree = brief(values, "1–4 of 4 repositories", id => calls.push(id));
  const controls = elements(tree).filter(node => node.type === ui.ControlButton);
  assert.equal(controls.length, values.length);
  controls.forEach((control, index) => {
    assert.equal(control.props["aria-label"], "Open " + values[index].repo.id + " in Overview");
    assert.equal(content(control), values[index].repo.id);
    const native = ui.ControlButton.render(control.props, null);
    assert.equal(native.type, "button"); assert.equal(native.props.type, "button");
    assert.match(native.props.className, /ui-control/);
    control.props.onClick(); assert.equal(calls.length, index + 1);
  });
  assert.deepEqual(calls, ["A", "A", "offline", "unknown"]);
});

function currentCityOwner ({ repos, tasks = [], ready = true, accepted = true, note = "", busy = false, page = 1 }) {
  // Execute the full CURRENT module. Injected imports are actual modules; effects never run or request.
  const source = text(CITY_PATH), ast = astOf(CITY_PATH, source);
  const owner = only(ast.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === "CityView"), "current owner");
  const stateNames = owner.body.statements.filter(ts.isVariableStatement).flatMap(node =>
    [...node.declarationList.declarations].filter(declaration => ts.isArrayBindingPattern(declaration.name)
      && declaration.initializer && ts.isCallExpression(declaration.initializer)
      && declaration.initializer.expression.getText(ast) === "useState")
      .map(declaration => declaration.name.elements[0].getText(ast)));
  const overrides = new Map([["churn", new Map()], ["acceptedKey", accepted ? JSON.stringify(repos.map(repo => repo.id)) : ""],
    ["hydrationNote", note], ["hydrating", busy]]);
  let stateIndex = 0, pagination;
  const hooks = {
    useRef: value => ({current: value}),
    useState: initial => {
      const name = stateNames[stateIndex++]; assert.ok(name, "actual state binding");
      return [overrides.has(name) ? overrides.get(name) : typeof initial === "function" ? initial() : initial, () => {}];
    },
    useCallback: callback => callback, useEffect() {},
  };
  const paging = (_key, options) => {
    assert.equal(_key, "city-districts"); assert.equal(options.pageSize, 6);
    const start = (page - 1) * 6, end = Math.min(start + 6, options.totalItems);
    pagination = {page, start, end, totalItems: options.totalItems, pageSize: 6, setPage() {}};
    return pagination;
  };
  const module = {exports: {}}, imports = new Map(modules);
  imports.set("react", {...React, ...hooks});
  imports.set("./theme", {...modules.get("./theme"), usePrefersReducedMotion: () => true});
  imports.set("./ui", {...ui, useRememberedBoundedPage: paging});
  imports.set("./CityDistrictBrief", {CityDistrictBrief: Brief});
  const localRequire = name => imports.has(name) ? imports.get(name) : name === "react/jsx-runtime" ? require(name)
    : (() => { throw new Error("Unapproved runtime import " + name); })();
  const compiled = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  }});
  assert.equal(compiled.diagnostics?.length ?? 0, 0);
  new Function("require", "exports", "module", compiled.outputText)(localRequire, module.exports, module);
  const tree = module.exports.CityView({ repos, tasks, events: [], workspaceReady: ready,
    mood: "uncertain", wardrobe: {}, refreshIdentity: 0, onOpenFileStory() {}, onGoRepo() {}, onStatus() {} });
  assert.equal(stateIndex, stateNames.length);
  return {tree, CityScene: module.exports.CityScene, pagination};
}
test("current full CityView gates the brief by accepted readiness and shares the exact scene page outside SVG export", () => {
  const repos = Array.from({length: 8}, (_, index) => district("R" + index).repo);
  const tasks = [{repo:"R6",status:"in-progress"},{repo:"R6",status:"done"},{repo:"R0",status:"in-progress"}];
  for (const options of [{ready:false}, {accepted:false}, {accepted:false,busy:true,note:"Retry City data"}]) {
    const fixture = currentCityOwner({repos,tasks,...options});
    assert.equal(elements(fixture.tree).filter(node => node.type === Brief).length, 0);
    assert.equal(elements(fixture.tree).filter(node => node.type === fixture.CityScene).length, 0);
  }
  for (const options of [{page:1}, {page:2}, {page:2,note:"Retained City data; retry available",busy:true}]) {
    const fixture = currentCityOwner({repos,tasks,...options});
    const visible = only(elements(fixture.tree).filter(node => node.type === Brief), "one accepted brief");
    const scene = only(elements(fixture.tree).filter(node => node.type === fixture.CityScene), "one scene");
    assert.equal(visible.props.districts, scene.props.districts, "exact same visible page reference");
    assert.equal(visible.props.pageRange, scene.props.rangeLabel);
    assert.deepEqual(visible.props.districts.map(value => value.repo.id), options.page === 1 ? repos.slice(0,6).map(repo=>repo.id) : ["R6","R7"]);
    if (options.page === 2) assert.equal(visible.props.districts[0].inProgress.length, 1);
    const exported = only(elements(fixture.tree).filter(node => node.type === "div" && node.ref && node.props.className === "relative"), "existing export owner");
    assert.equal(elements(exported).filter(node => node.type === Brief).length, 0);
    assert.equal(elements(exported).filter(node => node.type === fixture.CityScene).length, 1);
    const pager = only(elements(fixture.tree).filter(node => node.type === ui.CollectionPager), "existing pager");
    assert.equal(pager.props.page, fixture.pagination);
    if (options.note) assert.ok(content(fixture.tree).includes(options.note));
  }
  const zero = currentCityOwner({repos:[]});
  assert.equal(only(elements(zero.tree).filter(node => node.type === Brief), "empty accepted brief").props.pageRange, "0 of 0 repositories");
});

test("all City request, retry, retirement, snapshot and App workspace caller code remain exact outside two markup windows", () => {
  const original = restoreCityDistrictBriefSource(CITY_PATH, text(CITY_PATH));
  assert.equal(sha(Buffer.from(original)), EXPECTED.sources[0].before.RAW);
  const ast = astOf(CITY_PATH, text(CITY_PATH));
  const owner = only(ast.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === "CityView"), "one CityView");
  const originalAst = astOf(CITY_PATH, original), oldOwner = only(originalAst.statements.filter(node => ts.isFunctionDeclaration(node)
    && node.name?.text === "CityView"), "one published CityView");
  assert.equal(owner.body.statements.slice(0,-1).map(node=>node.getText(ast)).join("\n"),
    oldOwner.body.statements.slice(0,-1).map(node=>node.getText(originalAst)).join("\n"));
  const app = text("Frontend/src/App.tsx"), appAst = astOf("App.tsx", app);
  const caller = only(all(appAst, ts.isJsxSelfClosingElement).filter(node => node.tagName.getText(appAst) === "LazyCityView"), "one actual City caller");
  const expression = name => only([...caller.attributes.properties].filter(node => ts.isJsxAttribute(node)
    && node.name.getText(appAst) === name), name).initializer.expression.getText(appAst);
  assert.equal(expression("repos"), "repos"); assert.equal(expression("tasks"), "tasks");
  assert.equal(expression("events"), "events"); assert.equal(expression("workspaceReady"), "workspaceReady");
});
