import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";

// Historical assertion inputs only. Runtime, effects, scene and current SSR stay raw.
const require = createRequire(new URL("../../Frontend/package.json", import.meta.url));
const ts = require("typescript");
const sha = value => createHash("sha256").update(value).digest("hex");
const frozen = value => {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) frozen(child);
    Object.freeze(value);
  }
  return value;
};
export const CITY_BRIEF_SOURCES = frozen([
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
]);
export const CITY_BRIEF_SUITES = frozen([
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
]);

function pathKey (path) {
  assert.ok(typeof path === "string" && /^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(path), "canonical repository-relative path");
  assert.ok(!path.split("/").some(part => part === "." || part === ".."), "no traversal");
  return path;
}
function decoded (input) {
  assert.ok(typeof input === "string" || Buffer.isBuffer(input), "String or Buffer only");
  const text = typeof input === "string" ? input : new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(input);
  assert.ok(!text.startsWith("\uFEFF") && !text.includes("\0"), "no BOM or NUL");
  assert.equal(Buffer.from(text).toString("utf8"), text, "lossless Unicode scalars");
  const lf = text.replace(/\r\n/g, "\n");
  assert.ok(!lf.includes("\r"), "no bare CR");
  assert.ok(!text.includes("\r\n") || !/(?<!\r)\n/.test(text), "uniform EOL");
  assert.ok(lf.endsWith("\n") && !lf.endsWith("\n\n"), "single final newline");
  return { lf, crlf: text.includes("\r\n"), buffer: Buffer.isBuffer(input) };
}
const physical = (text, eol) => eol === "CRLF" ? text.replace(/\n/g, "\r\n") : text;
function parse (path, text) {
  const ast = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.JS);
  assert.equal(ast.parseDiagnostics.length, 0, "complete actual syntax");
  return ast;
}
function all (node, predicate) {
  const result = [];
  const visit = child => { if (predicate(child)) result.push(child); ts.forEachChild(child, visit); };
  visit(node); return result;
}
function only (nodes, predicate, message) {
  const found = nodes.filter(predicate); assert.equal(found.length, 1, message); return found[0];
}
function unwrapped (node) {
  while (ts.isParenthesizedExpression(node)) node = node.expression;
  return node;
}
function sourceSite (ast) {
  const imported = only(ast.statements, node => ts.isImportDeclaration(node)
    && node.moduleSpecifier.text === "./CityDistrictBrief", "one actual brief import");
  assert.equal(imported.importClause.namedBindings.getText(ast), "{ CityDistrictBrief }");
  const city = only(ast.statements, node => ts.isFunctionDeclaration(node)
    && node.name?.text === "CityView", "one actual CityView");
  const returned = city.body.statements.at(-1);
  assert.ok(ts.isReturnStatement(returned), "unchanged final render boundary");
  const ready = only(all(returned, ts.isConditionalExpression), node => node.condition.getText(ast) === "!cityReady", "same accepted readiness gate");
  const accepted = unwrapped(ready.whenFalse);
  const brief = only(all(accepted, ts.isJsxSelfClosingElement), node => node.tagName.getText(ast) === "CityDistrictBrief", "one brief inside accepted branch");
  assert.equal(all(ready.whenTrue, node => ts.isJsxSelfClosingElement(node)
    && node.tagName.getText(ast) === "CityDistrictBrief").length, 0, "no brief while waiting");
  const attr = name => only([...brief.attributes.properties], node => ts.isJsxAttribute(node)
    && node.name.getText(ast) === name, "one actual " + name);
  assert.equal(brief.attributes.properties.length, 3);
  for (const name of ["districts", "pageRange", "onGoRepo"]) {
    assert.equal(attr(name).initializer.expression.getText(ast), name === "districts" ? "visibleDistricts" : name);
  }
  const exported = only(all(accepted, ts.isJsxElement), node => node.openingElement.attributes.properties.some(value =>
    ts.isJsxAttribute(value) && value.name.getText(ast) === "ref"
    && value.initializer?.expression?.getText(ast) === "containerRef"), "same SVG export owner");
  assert.equal(all(exported, node => node === brief).length, 0, "brief outside SVG/export subtree");
}
function inverse (spec, value) {
  assert.equal(Buffer.byteLength(value.lf), spec.after.LFbytes);
  assert.equal(sha(value.lf), spec.after.LF, "complete reviewed current input");
  assert.equal(sha(physical(value.lf, spec.after.nativeEOL)), spec.after.RAW);
  let restored = value.lf;
  for (const window of [...spec.windows].reverse()) {
    assert.equal(restored.split(window.after).length - 1, window.count, "exact inverse cardinality " + window.name);
    restored = restored.split(window.after).join(window.before);
  }
  assert.equal(Buffer.byteLength(restored), spec.before.LFbytes);
  assert.equal(sha(restored), spec.before.LF, "whole published LF inverse");
  const native = physical(restored, spec.before.nativeEOL);
  assert.equal(Buffer.byteLength(native), spec.before.bytes);
  assert.equal(sha(native), spec.before.RAW, "whole native published inverse");
  const output = physical(restored, value.crlf ? "CRLF" : "LF");
  return value.buffer ? Buffer.from(output) : output;
}
export function restoreCityDistrictBriefSource (path, input) {
  const spec = CITY_BRIEF_SOURCES.find(value => value.path === pathKey(path));
  assert.ok(spec, "only the reviewed City source");
  const value = decoded(input);
  assert.equal(sha(value.lf), spec.after.LF);
  sourceSite(parse(path, value.lf));
  return inverse(spec, value);
}
export function restoreCityDistrictBriefSuite (path, input) {
  const spec = CITY_BRIEF_SUITES.find(value => value.path === pathKey(path));
  assert.ok(spec, "only fifteen reviewed suite inputs");
  const value = decoded(input), ast = parse(path, value.lf);
  const imported = only(ast.statements, node => ts.isImportDeclaration(node)
    && node.moduleSpecifier.text === "./helpers/cityDistrictBrief.mjs", "one new preservation-only import");
  assert.equal(imported.importClause.namedBindings.getText(ast), "{ cityBriefPreservation }");
  return inverse(spec, value);
}
export function cityBriefPreservation (path, input) {
  pathKey(path);
  assert.ok(typeof input === "string" || Buffer.isBuffer(input), "String or Buffer only");
  if (CITY_BRIEF_SOURCES.some(value => value.path === path)) return restoreCityDistrictBriefSource(path, input);
  if (CITY_BRIEF_SUITES.some(value => value.path === path)) return restoreCityDistrictBriefSuite(path, input);
  return input;
}
