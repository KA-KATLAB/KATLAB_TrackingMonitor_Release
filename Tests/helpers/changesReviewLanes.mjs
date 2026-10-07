import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { deskPreservation as previousDeskPreservation } from "./missionCommandDesk.mjs";

const requireFrontend = createRequire(new URL("../../Frontend/package.json", import.meta.url));
const ts = requireFrontend("typescript");
const sha = (value) => createHash("sha256").update(value).digest("hex");

// Complete independently frozen 3.1 proposals and published 3.0 native originals.
// Projections are preservation data only. Current behavioral readers stay raw.
const SPECS = {
  "Frontend/src/App.tsx": {
    "kind": "TSX",
    "nativeEOL": "CRLF",
    "originalBytes": 234937,
    "originalRAW_SHA256": "d1a42a0e968e0c7790d4952c2993c37bee19efda2f197c4ab19d81ec5c1a3112",
    "originalLF_SHA256": "b98cfe4b7322d489149450bee7a07f732ff15e1e534d122caa6af72b52be8684",
    "proposedLFBytes": 230581,
    "proposedLF_SHA256": "ae4ce688943f56856200273bf9b03d1aa0ca329b25695feff2f3692ff19a403a",
    "proposedRAWBytes": 235691,
    "proposedRAW_SHA256": "b57f4d189850e36bd90e2abec90afe0faca953070adbde3ff4709fb0669d8046",
    "windows": [
      {
        "name": "normal TaskGroup caller only",
        "before": "{normal.slice(eventPager.start, eventPager.end).map((e) => (\n          <EventRow key={e.id} event={e} repos={repos} onSessionClick={onSessionClick}\n            onOpenFileStory={onOpenFileStory} onStatus={onStatus} />\n        ))}",
        "after": "{normal.slice(eventPager.start, eventPager.end).map((e) => (\n          <EventRow key={e.id} event={e} repos={repos} onSessionClick={onSessionClick}\n            onOpenFileStory={onOpenFileStory} onStatus={onStatus} reviewLedger />\n        ))}",
        "count": 1
      },
      {
        "name": "optional presentation prop",
        "before": "function EventRow ({ event, repos, showRef, onSessionClick, onOpenFileStory, onStatus }:\n  { event: TrackedEvent; repos: Repo[]; showRef?: boolean;",
        "after": "function EventRow ({ event, repos, showRef, onSessionClick, onOpenFileStory, onStatus,\n  reviewLedger = false }:\n  { event: TrackedEvent; repos: Repo[]; showRef?: boolean; reviewLedger?: boolean;",
        "count": 1
      },
      {
        "name": "pure local native-cell presentation helper",
        "before": "    setDiffBusy(false);\n  };\n  return (\n    <div ref={diffRowRef}",
        "after": "    setDiffBusy(false);\n  };\n  const reviewCell = (\n    name: \"signal\" | \"body\" | \"context\" | \"action\",\n    children: ReactNode,\n  ): ReactNode => {\n    if (!reviewLedger || children === false || children === null || children === undefined) {\n      return children;\n    }\n    return <div data-review-cell={name}>{children}</div>;\n  };\n  return (\n    <div ref={diffRowRef}",
        "count": 1
      },
      {
        "name": "normal-only header lanes preserving all original handlers once",
        "before": "      <div className=\"flex min-w-0 basis-full flex-wrap items-center gap-2 text-sm\">\n        <ModeBadge mode={event.mode} swept={event.swept === 1} />\n        {onOpenFileStory ? (\n          <button onClick={() => onOpenFileStory(event.repo_id, event.file)}\n            title={`${event.file} — open file story`}\n            className=\"min-w-0 flex-1 break-all font-mono text-base text-left hover:text-sky-300 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500\">\n            {event.file}\n          </button>\n        ) : (\n          <span className=\"min-w-0 flex-1 break-all font-mono text-base\">{event.file}</span>\n        )}\n        {showRef && event.task_ref && (\n          <span className=\"min-w-0 basis-full break-words text-xs text-sky-300\">\n            {event.task_ref}\n          </span>\n        )}\n        <SessionDot identity={sessionIdentity}\n          onClick={onSessionClick && sessionIdentity\n            ? () => onSessionClick(sessionIdentity) : undefined} />\n        {event.branch && repoBranch && event.branch !== repoBranch && (\n          <span className=\"text-xs text-amber-300/80\"\n            title=\"captured on a different branch than the repo is on now\">\n            &#x2387; {event.branch}\n          </span>\n        )}\n        <span className=\"text-xs text-slate-400\" title={event.ts}>\n          {event.tool} · {fmtRel(event.ts)}\n        </span>\n        {(online || diff !== null) && (\n          <button className=\"ml-auto min-h-[24px] text-xs text-sky-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:opacity-40\"\n            disabled={diffBusy} aria-busy={diffBusy}\n            aria-expanded={diff !== null}\n            aria-label={diffBusy\n              ? `Loading diff for ${event.file}`\n              : diff === null\n                ? diffError ? `Retry diff for ${event.file}` : `Show diff for ${event.file}`\n                : `Hide diff for ${event.file}`}\n            onClick={(clickEvent) => {\n              if (diff !== null) {\n                const row = diffRowRef.current;\n                if (!online && document.activeElement === clickEvent.currentTarget\n                    && row?.isConnected && row.contains(clickEvent.currentTarget)\n                    && !row.closest(\"[inert]\") && !document.body.dataset.overlayOpen) {\n                  row.focus({ preventScroll: true });\n                }\n                hideDiff();\n              } else {\n                loadDiff();\n              }\n            }}>\n            {diffBusy ? \"loading…\" : diff === null ? diffError ? \"retry diff\" : \"diff\" : \"hide\"}\n          </button>\n        )}\n      </div>",
        "after": "      <div className=\"flex min-w-0 basis-full flex-wrap items-center gap-2 text-sm\"\n        data-review-ledger={reviewLedger ? \"true\" : undefined}>\n        {reviewCell(\"signal\",\n          <ModeBadge mode={event.mode} swept={event.swept === 1} />\n        )}\n        {reviewCell(\"body\", <>\n          {onOpenFileStory ? (\n            <button onClick={() => onOpenFileStory(event.repo_id, event.file)}\n              title={`${event.file} — open file story`}\n              className=\"min-w-0 flex-1 break-all font-mono text-base text-left hover:text-sky-300 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500\">\n              {event.file}\n            </button>\n          ) : (\n            <span className=\"min-w-0 flex-1 break-all font-mono text-base\">{event.file}</span>\n          )}\n          {showRef && event.task_ref && (\n            <span className=\"min-w-0 basis-full break-words text-xs text-sky-300\">\n              {event.task_ref}\n            </span>\n          )}\n          {reviewCell(\"context\", <>\n            <SessionDot identity={sessionIdentity}\n              onClick={onSessionClick && sessionIdentity\n                ? () => onSessionClick(sessionIdentity) : undefined} />\n            {event.branch && repoBranch && event.branch !== repoBranch && (\n              <span className=\"text-xs text-amber-300/80\"\n                title=\"captured on a different branch than the repo is on now\">\n                &#x2387; {event.branch}\n              </span>\n            )}\n            <span className=\"text-xs text-slate-400\" title={event.ts}>\n              {event.tool} · {fmtRel(event.ts)}\n            </span>\n          </>)}\n        </>)}\n        {reviewCell(\"action\",\n          (online || diff !== null) && (\n            <button className=\"ml-auto min-h-[24px] text-xs text-sky-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:opacity-40\"\n              disabled={diffBusy} aria-busy={diffBusy}\n              aria-expanded={diff !== null}\n              aria-label={diffBusy\n                ? `Loading diff for ${event.file}`\n                : diff === null\n                  ? diffError ? `Retry diff for ${event.file}` : `Show diff for ${event.file}`\n                  : `Hide diff for ${event.file}`}\n              onClick={(clickEvent) => {\n                if (diff !== null) {\n                  const row = diffRowRef.current;\n                  if (!online && document.activeElement === clickEvent.currentTarget\n                      && row?.isConnected && row.contains(clickEvent.currentTarget)\n                      && !row.closest(\"[inert]\") && !document.body.dataset.overlayOpen) {\n                    row.focus({ preventScroll: true });\n                  }\n                  hideDiff();\n                } else {\n                  loadDiff();\n                }\n              }}>\n              {diffBusy ? \"loading…\" : diff === null ? diffError ? \"retry diff\" : \"diff\" : \"hide\"}\n            </button>\n          )\n        )}\n      </div>",
        "count": 1
      }
    ]
  },
  "Frontend/index.html": {
    "kind": "HTML",
    "nativeEOL": "LF",
    "originalBytes": 13548,
    "originalRAW_SHA256": "98b8ebb28a50a8575ee5d99347c41cc4334812b2f7cca77f5fd9b77f3212a330",
    "originalLF_SHA256": "98b8ebb28a50a8575ee5d99347c41cc4334812b2f7cca77f5fd9b77f3212a330",
    "proposedLFBytes": 17392,
    "proposedLF_SHA256": "266658d8cb9b3e62fc6eda027ea7bffafdbf38a708f2363d31047fb521376870",
    "proposedRAWBytes": 17392,
    "proposedRAW_SHA256": "266658d8cb9b3e62fc6eda027ea7bffafdbf38a708f2363d31047fb521376870",
    "windows": [
      {
        "name": "fifth direct head style",
        "before": "    <title>KATLAB Tracking Monitor</title>\n",
        "after": "    <style id=\"katlab-changes-review-lanes\">\n      /* Changes Review Lanes: file-first hierarchy in normal grouped rows only. */\n      #root #main-content > div > .changes-workbench > section[aria-label=\"Grouped uncommitted changes\"] .ui-work-list[data-reveal] > div.mt-4 > .ui-work-row > [data-review-ledger=\"true\"] {\n        display: grid;\n        min-width: 0;\n        grid-template-columns: minmax(0, 1fr);\n        align-items: start;\n        gap: 0.75rem;\n      }\n      #root #main-content > div > .changes-workbench > section[aria-label=\"Grouped uncommitted changes\"] .ui-work-list[data-reveal] > div.mt-4 > .ui-work-row > [data-review-ledger=\"true\"] > [data-review-cell] {\n        min-width: 0;\n      }\n      #root #main-content > div > .changes-workbench > section[aria-label=\"Grouped uncommitted changes\"] .ui-work-list[data-reveal] > div.mt-4 > .ui-work-row > [data-review-ledger=\"true\"] > [data-review-cell=\"signal\"] > span {\n        flex-wrap: wrap;\n        max-width: 100%;\n      }\n      #root #main-content > div > .changes-workbench > section[aria-label=\"Grouped uncommitted changes\"] .ui-work-list[data-reveal] > div.mt-4 > .ui-work-row > [data-review-ledger=\"true\"] > [data-review-cell=\"body\"] {\n        display: grid;\n        min-width: 0;\n        gap: 0.375rem;\n      }\n      #root #main-content > div > .changes-workbench > section[aria-label=\"Grouped uncommitted changes\"] .ui-work-list[data-reveal] > div.mt-4 > .ui-work-row > [data-review-ledger=\"true\"] > [data-review-cell=\"body\"] > button:first-child,\n      #root #main-content > div > .changes-workbench > section[aria-label=\"Grouped uncommitted changes\"] .ui-work-list[data-reveal] > div.mt-4 > .ui-work-row > [data-review-ledger=\"true\"] > [data-review-cell=\"body\"] > span:first-child {\n        min-width: 0;\n        width: 100%;\n        font-size: 1rem;\n        line-height: 1.5;\n        font-weight: 500;\n      }\n      #root #main-content > div > .changes-workbench > section[aria-label=\"Grouped uncommitted changes\"] .ui-work-list[data-reveal] > div.mt-4 > .ui-work-row > [data-review-ledger=\"true\"] > [data-review-cell=\"body\"] > [data-review-cell=\"context\"] {\n        display: flex;\n        min-width: 0;\n        flex-wrap: wrap;\n        align-items: center;\n        gap: 0.375rem 0.5rem;\n        overflow-wrap: anywhere;\n      }\n      #root #main-content > div > .changes-workbench > section[aria-label=\"Grouped uncommitted changes\"] .ui-work-list[data-reveal] > div.mt-4 > .ui-work-row > [data-review-ledger=\"true\"] > [data-review-cell=\"body\"] > [data-review-cell=\"context\"] > * {\n        min-width: 0;\n        max-width: 100%;\n      }\n      #root #main-content > div > .changes-workbench > section[aria-label=\"Grouped uncommitted changes\"] .ui-work-list[data-reveal] > div.mt-4 > .ui-work-row > [data-review-ledger=\"true\"] > [data-review-cell=\"action\"] {\n        display: flex;\n        min-width: 0;\n        justify-content: flex-start;\n        align-items: center;\n      }\n      #root #main-content > div > .changes-workbench > section[aria-label=\"Grouped uncommitted changes\"] .ui-work-list[data-reveal] > div.mt-4 > .ui-work-row > [data-review-ledger=\"true\"] > [data-review-cell=\"action\"] > button {\n        margin-left: 0;\n      }\n      @media (min-width: 1024px) {\n        #root #main-content > div > .changes-workbench > section[aria-label=\"Grouped uncommitted changes\"] .ui-work-list[data-reveal] > div.mt-4 > .ui-work-row > [data-review-ledger=\"true\"] {\n          grid-template-columns: minmax(0, 8rem) minmax(0, 1fr) max-content;\n          gap: 1rem;\n        }\n        #root #main-content > div > .changes-workbench > section[aria-label=\"Grouped uncommitted changes\"] .ui-work-list[data-reveal] > div.mt-4 > .ui-work-row > [data-review-ledger=\"true\"] > [data-review-cell=\"action\"] {\n          justify-content: flex-end;\n        }\n      }\n    </style>\n    <title>KATLAB Tracking Monitor</title>\n",
        "count": 1
      }
    ]
  },
  "Tests/test_achievement_gallery.mjs": {
    "kind": "JS",
    "nativeEOL": "LF",
    "originalBytes": 36359,
    "originalRAW_SHA256": "b9cbb50540e92d0a543b6e705cbe04763c2ff6546f96751fa08e3eeda94ed918",
    "originalLF_SHA256": "b9cbb50540e92d0a543b6e705cbe04763c2ff6546f96751fa08e3eeda94ed918",
    "proposedLFBytes": 36359,
    "proposedLF_SHA256": "998839d552c9763a3b1022df7137fa4c121645e289e37cc3aa0a45dda9b1bf5b",
    "windows": [
      {
        "name": "preservation-only proxy; all runtime readers and old assertions unchanged",
        "before": "import { deskPreservation } from \"./helpers/missionCommandDesk.mjs\";\n",
        "after": "import { deskPreservation } from \"./helpers/changesReviewLanes.mjs\";\n",
        "count": 1
      }
    ]
  },
  "Tests/test_active_plan_gallery.mjs": {
    "kind": "JS",
    "nativeEOL": "LF",
    "originalBytes": 31849,
    "originalRAW_SHA256": "c901ff600a8334e3aaf77b76be71fa3c15ce5cea8a56e4a00b5aec6f72902a48",
    "originalLF_SHA256": "c901ff600a8334e3aaf77b76be71fa3c15ce5cea8a56e4a00b5aec6f72902a48",
    "proposedLFBytes": 31849,
    "proposedLF_SHA256": "01b75ba1e91bc1e4f1754bdb9d358b461e12db313fd3d7e8f18aad6ae553172d",
    "windows": [
      {
        "name": "preservation-only proxy; all runtime readers and old assertions unchanged",
        "before": "import { deskPreservation } from \"./helpers/missionCommandDesk.mjs\";\n",
        "after": "import { deskPreservation } from \"./helpers/changesReviewLanes.mjs\";\n",
        "count": 1
      }
    ]
  },
  "Tests/test_attribution_station.mjs": {
    "kind": "JS",
    "nativeEOL": "LF",
    "originalBytes": 41870,
    "originalRAW_SHA256": "312a197183752225677c94bac08053027a2d2ba48fa17db1708a4cccb4ad3515",
    "originalLF_SHA256": "312a197183752225677c94bac08053027a2d2ba48fa17db1708a4cccb4ad3515",
    "proposedLFBytes": 41894,
    "proposedLF_SHA256": "23d84c9875998e3be3b3396127b9d9811d008531058c932f009db106d7943a94",
    "windows": [
      {
        "name": "preservation-only proxy; all runtime readers and old assertions unchanged",
        "before": "import { deskPreservation } from \"./helpers/missionCommandDesk.mjs\";\n",
        "after": "import { deskPreservation } from \"./helpers/changesReviewLanes.mjs\";\n",
        "count": 1
      },
      {
        "name": "preservation-only HTML branch before existing Studio inverse",
        "count": 1,
        "before": "  if (name === \"Frontend/index.html\") return studioHtml(text);\n",
        "after": "  if (name === \"Frontend/index.html\") return studioHtml(deskPreservation(name, text));\n"
      }
    ]
  },
  "Tests/test_changes_review_desk.mjs": {
    "kind": "JS",
    "nativeEOL": "LF",
    "originalBytes": 38983,
    "originalRAW_SHA256": "d4aea39baed7610bc79a68ac981b2a9942206f6d16a4643758a16f0450db2234",
    "originalLF_SHA256": "d4aea39baed7610bc79a68ac981b2a9942206f6d16a4643758a16f0450db2234",
    "proposedLFBytes": 39007,
    "proposedLF_SHA256": "1dc6435f26e27a75d59dbdaba9c86fb166b3e1a64586adf1ec165ed455115094",
    "windows": [
      {
        "name": "preservation-only proxy; all runtime readers and old assertions unchanged",
        "before": "import { deskPreservation } from \"./helpers/missionCommandDesk.mjs\";\n",
        "after": "import { deskPreservation } from \"./helpers/changesReviewLanes.mjs\";\n",
        "count": 1
      },
      {
        "name": "preservation-only HTML branch before existing Studio inverse",
        "count": 1,
        "before": "  if (name === \"Frontend/index.html\") return restoreAttributionStationHtml(studioHtml(text));\n",
        "after": "  if (name === \"Frontend/index.html\") return restoreAttributionStationHtml(studioHtml(deskPreservation(name, text)));\n"
      }
    ]
  },
  "Tests/test_chronicle_reader_canvas.mjs": {
    "kind": "JS",
    "nativeEOL": "LF",
    "originalBytes": 19142,
    "originalRAW_SHA256": "15a4d45716ca5c3b10b0511f476b9a19f93fec804153a99e3e94aec927a1fa66",
    "originalLF_SHA256": "15a4d45716ca5c3b10b0511f476b9a19f93fec804153a99e3e94aec927a1fa66",
    "proposedLFBytes": 19142,
    "proposedLF_SHA256": "d3e6566cc88e6d897e4231fdddb9494a9a41c162bc6fa27ca976a0040aac489a",
    "windows": [
      {
        "name": "preservation-only proxy; all runtime readers and old assertions unchanged",
        "before": "import { deskPreservation } from \"./helpers/missionCommandDesk.mjs\";\n",
        "after": "import { deskPreservation } from \"./helpers/changesReviewLanes.mjs\";\n",
        "count": 1
      }
    ]
  },
  "Tests/test_diagnostic_studio.mjs": {
    "kind": "JS",
    "nativeEOL": "LF",
    "originalBytes": 40153,
    "originalRAW_SHA256": "73050b4e893d89ad70fe9d0006fad1932f1d6a4d7eea878e61962a8bbeb3a57c",
    "originalLF_SHA256": "73050b4e893d89ad70fe9d0006fad1932f1d6a4d7eea878e61962a8bbeb3a57c",
    "proposedLFBytes": 40235,
    "proposedLF_SHA256": "b72b2c54b1e32f712f81ac988612d52b7116ba8aa61a591319b0ceda7f928854",
    "windows": [
      {
        "name": "preservation-only proxy; all runtime readers and old assertions unchanged",
        "before": "import { deskPreservation } from \"./helpers/missionCommandDesk.mjs\";\n",
        "after": "import { deskPreservation } from \"./helpers/changesReviewLanes.mjs\";\n",
        "count": 1
      },
      {
        "name": "positive historical HTML input before current fixture conversion",
        "count": 1,
        "before": "  const source = read(\"Frontend/index.html\"); assert.equal(ending(source), \"\\n\");\n",
        "after": "  const source = deskPreservation(\"Frontend/index.html\", read(\"Frontend/index.html\")); assert.equal(ending(source), \"\\n\");\n"
      },
      {
        "name": "historical HTML input before negative fixture mutation",
        "count": 1,
        "before": "  const source = read(\"Frontend/index.html\"), original = independentHtmlInverse(source);\n",
        "after": "  const source = deskPreservation(\"Frontend/index.html\", read(\"Frontend/index.html\")), original = independentHtmlInverse(source);\n"
      }
    ]
  },
  "Tests/test_diff_availability.mjs": {
    "kind": "JS",
    "nativeEOL": "LF",
    "originalBytes": 31413,
    "originalRAW_SHA256": "ba860935acd718723e1fc1e6b1ca6c32ed8d4956f77353bcb63b8229d9a2131c",
    "originalLF_SHA256": "ba860935acd718723e1fc1e6b1ca6c32ed8d4956f77353bcb63b8229d9a2131c",
    "proposedLFBytes": 31413,
    "proposedLF_SHA256": "e400426edb98460a81a2cb53f5e6cc126acfdd8c9680c707621c2e5467b824ba",
    "windows": [
      {
        "name": "preservation-only proxy; all runtime readers and old assertions unchanged",
        "before": "import { deskPreservation } from \"./helpers/missionCommandDesk.mjs\";\n",
        "after": "import { deskPreservation } from \"./helpers/changesReviewLanes.mjs\";\n",
        "count": 1
      }
    ]
  },
  "Tests/test_git_graph_merge_seed.mjs": {
    "kind": "JS",
    "nativeEOL": "LF",
    "originalBytes": 23713,
    "originalRAW_SHA256": "752d13a0b578dbd81cbce9ff66dd456c50cf3659ffb711223fb72cb7db9e017a",
    "originalLF_SHA256": "752d13a0b578dbd81cbce9ff66dd456c50cf3659ffb711223fb72cb7db9e017a",
    "proposedLFBytes": 23713,
    "proposedLF_SHA256": "a58df616a49166e9bc7a4c01f2a736e247c1a6bae6c01a29dc48da50a2555144",
    "windows": [
      {
        "name": "preservation-only proxy; all runtime readers and old assertions unchanged",
        "before": "import { deskPreservation } from \"./helpers/missionCommandDesk.mjs\";\n",
        "after": "import { deskPreservation } from \"./helpers/changesReviewLanes.mjs\";\n",
        "count": 1
      }
    ]
  },
  "Tests/test_history_commit_ledger.mjs": {
    "kind": "JS",
    "nativeEOL": "LF",
    "originalBytes": 27906,
    "originalRAW_SHA256": "547dcb5b288da5f58855ae52e947467728d5f1675b172955f51fb05c6a4e6baa",
    "originalLF_SHA256": "547dcb5b288da5f58855ae52e947467728d5f1675b172955f51fb05c6a4e6baa",
    "proposedLFBytes": 27906,
    "proposedLF_SHA256": "68e4007f3823ad1b5c581a1680bb805675a2a10c432a1e084ac73b56b6b4c17a",
    "windows": [
      {
        "name": "preservation-only proxy; all runtime readers and old assertions unchanged",
        "before": "import { deskPreservation } from \"./helpers/missionCommandDesk.mjs\";\n",
        "after": "import { deskPreservation } from \"./helpers/changesReviewLanes.mjs\";\n",
        "count": 1
      }
    ]
  },
  "Tests/test_history_graph_read_states.mjs": {
    "kind": "JS",
    "nativeEOL": "LF",
    "originalBytes": 27328,
    "originalRAW_SHA256": "12aabeceb52d59fd77faa3184e9c28593e5518fd9cb328cc06175a6b0b6fa4f6",
    "originalLF_SHA256": "12aabeceb52d59fd77faa3184e9c28593e5518fd9cb328cc06175a6b0b6fa4f6",
    "proposedLFBytes": 27328,
    "proposedLF_SHA256": "cd32eecf474afcdcb0a1eb94612c7fc4a4261184d55f5f036d5f9160c8418cd5",
    "windows": [
      {
        "name": "preservation-only proxy; all runtime readers and old assertions unchanged",
        "before": "import { deskPreservation } from \"./helpers/missionCommandDesk.mjs\";\n",
        "after": "import { deskPreservation } from \"./helpers/changesReviewLanes.mjs\";\n",
        "count": 1
      }
    ]
  },
  "Tests/test_mission_command_desk.mjs": {
    "kind": "JS",
    "nativeEOL": "LF",
    "originalBytes": 52876,
    "originalRAW_SHA256": "65f716904de5bd8b29a1e731187d53965c3936670bad23e2d98c09fb7b77de10",
    "originalLF_SHA256": "65f716904de5bd8b29a1e731187d53965c3936670bad23e2d98c09fb7b77de10",
    "proposedLFBytes": 53120,
    "proposedLF_SHA256": "2e33740c981045efd9c39fcd57d802d99419029810bc58d70a99a42b0a4f54e4",
    "windows": [
      {
        "name": "new preservation-only import after unchanged original restorers",
        "before": "} from \"./helpers/missionCommandDesk.mjs\";\n",
        "after": "} from \"./helpers/missionCommandDesk.mjs\";\nimport { reviewLanesPreservation } from \"./helpers/changesReviewLanes.mjs\";\n",
        "count": 1
      },
      {
        "name": "source and suite positive inputs before original restorers and negative mutations",
        "before": "    const actual = read(path);",
        "after": "    const actual = reviewLanesPreservation(path, read(path));",
        "count": 2
      },
      {
        "name": "immutable inputs including fifth-style HTML",
        "before": "    const value = read(path);",
        "after": "    const value = reviewLanesPreservation(path, read(path));",
        "count": 1
      },
      {
        "name": "original App negative fixtures projected before mutation",
        "before": "  const app = read(SOURCE_PINS[0][0]).toString(\"utf8\");",
        "after": "  const app = reviewLanesPreservation(SOURCE_PINS[0][0], read(SOURCE_PINS[0][0])).toString(\"utf8\");",
        "count": 1
      },
      {
        "name": "original source byte negatives projected before mutation",
        "before": "    const actual = read(path).toString(\"utf8\");",
        "after": "    const actual = reviewLanesPreservation(path, read(path)).toString(\"utf8\");",
        "count": 1
      }
    ]
  },
  "Tests/test_mission_control_workbench.mjs": {
    "kind": "JS",
    "nativeEOL": "LF",
    "originalBytes": 33334,
    "originalRAW_SHA256": "75346ce35c8ac9f8e1e7cf496eadd8d8cc95c6f8e660ff38767604d6cf1f0daf",
    "originalLF_SHA256": "75346ce35c8ac9f8e1e7cf496eadd8d8cc95c6f8e660ff38767604d6cf1f0daf",
    "proposedLFBytes": 33334,
    "proposedLF_SHA256": "537e31ffb975da8bd3ae17107cdb1e0fd844baf4b7e13bee828067cc0f06cad1",
    "windows": [
      {
        "name": "preservation-only proxy; all runtime readers and old assertions unchanged",
        "before": "import { deskPreservation } from \"./helpers/missionCommandDesk.mjs\";\n",
        "after": "import { deskPreservation } from \"./helpers/changesReviewLanes.mjs\";\n",
        "count": 1
      }
    ]
  },
  "Tests/test_mission_plan_gallery.mjs": {
    "kind": "JS",
    "nativeEOL": "LF",
    "originalBytes": 18832,
    "originalRAW_SHA256": "6d3b499c67852050b4bfebb02c9619c04ec58aee88fb43ac1d5978825f0c3c2f",
    "originalLF_SHA256": "6d3b499c67852050b4bfebb02c9619c04ec58aee88fb43ac1d5978825f0c3c2f",
    "proposedLFBytes": 18832,
    "proposedLF_SHA256": "06fef08b614a6cd801f02c1494d0c35bd3a813e113b6c125613d8c5ff6ee2c43",
    "windows": [
      {
        "name": "preservation-only proxy; all runtime readers and old assertions unchanged",
        "before": "import { deskPreservation } from \"./helpers/missionCommandDesk.mjs\";\n",
        "after": "import { deskPreservation } from \"./helpers/changesReviewLanes.mjs\";\n",
        "count": 1
      }
    ]
  },
  "Tests/test_momentum_comparison_deck.mjs": {
    "kind": "JS",
    "nativeEOL": "LF",
    "originalBytes": 29785,
    "originalRAW_SHA256": "fb6f1c41e92ca4e6cc7eaa4039e232045e2d6d97fc4cbb78d4d8e4b47d8c0d4a",
    "originalLF_SHA256": "fb6f1c41e92ca4e6cc7eaa4039e232045e2d6d97fc4cbb78d4d8e4b47d8c0d4a",
    "proposedLFBytes": 29785,
    "proposedLF_SHA256": "be2c38105b75d27dcdc9138455762b5d65352482c5a00c427ea0a79316899c3c",
    "windows": [
      {
        "name": "preservation-only proxy; all runtime readers and old assertions unchanged",
        "before": "import { deskPreservation } from \"./helpers/missionCommandDesk.mjs\";\n",
        "after": "import { deskPreservation } from \"./helpers/changesReviewLanes.mjs\";\n",
        "count": 1
      }
    ]
  },
  "Tests/test_overview_operations_deck.mjs": {
    "kind": "JS",
    "nativeEOL": "LF",
    "originalBytes": 20719,
    "originalRAW_SHA256": "b0a6144f83d1de379617915f5ceb2fe21d4ee11942066b1222cc4b6e58ac64ae",
    "originalLF_SHA256": "b0a6144f83d1de379617915f5ceb2fe21d4ee11942066b1222cc4b6e58ac64ae",
    "proposedLFBytes": 20719,
    "proposedLF_SHA256": "9a25059cf6812fd51cf730a70943d56b3c7a2bd4562ea4d592cf21ef83d43d39",
    "windows": [
      {
        "name": "preservation-only proxy; all runtime readers and old assertions unchanged",
        "before": "import { deskPreservation } from \"./helpers/missionCommandDesk.mjs\";\n",
        "after": "import { deskPreservation } from \"./helpers/changesReviewLanes.mjs\";\n",
        "count": 1
      }
    ]
  },
  "Tests/test_personal_records_showcase.mjs": {
    "kind": "JS",
    "nativeEOL": "LF",
    "originalBytes": 32246,
    "originalRAW_SHA256": "b6f626ef7ad80d42ee9787575368b0eb4c5aec05410532ad03590500533eb121",
    "originalLF_SHA256": "b6f626ef7ad80d42ee9787575368b0eb4c5aec05410532ad03590500533eb121",
    "proposedLFBytes": 32246,
    "proposedLF_SHA256": "224f652643b66d016449eb78159b1f7dc815297db7a07526047d8108ee527fd4",
    "windows": [
      {
        "name": "preservation-only proxy; all runtime readers and old assertions unchanged",
        "before": "import { deskPreservation } from \"./helpers/missionCommandDesk.mjs\";\n",
        "after": "import { deskPreservation } from \"./helpers/changesReviewLanes.mjs\";\n",
        "count": 1
      }
    ]
  },
  "Tests/test_provenance_evidence_desk.mjs": {
    "kind": "JS",
    "nativeEOL": "LF",
    "originalBytes": 40428,
    "originalRAW_SHA256": "d653a13b86c2575ae981e7d7bde7c28a7f11d13ac96f976d90e5818e8a259e37",
    "originalLF_SHA256": "d653a13b86c2575ae981e7d7bde7c28a7f11d13ac96f976d90e5818e8a259e37",
    "proposedLFBytes": 40428,
    "proposedLF_SHA256": "e839aba1876a05a84996579a20875e71174ccd38c994a54a634695291032f6de",
    "windows": [
      {
        "name": "preservation-only proxy; all runtime readers and old assertions unchanged",
        "before": "import { deskPreservation } from \"./helpers/missionCommandDesk.mjs\";\n",
        "after": "import { deskPreservation } from \"./helpers/changesReviewLanes.mjs\";\n",
        "count": 1
      }
    ]
  },
  "Tests/test_release_identity.mjs": {
    "kind": "JS",
    "nativeEOL": "LF",
    "originalBytes": 18489,
    "originalRAW_SHA256": "56d579105463cab4bc657338866ec62828425ff38e9cc3b20ba26688ab4e07e9",
    "originalLF_SHA256": "56d579105463cab4bc657338866ec62828425ff38e9cc3b20ba26688ab4e07e9",
    "proposedLFBytes": 18489,
    "proposedLF_SHA256": "fa9c3243b43841a9d65c28f527a7682c28fb8c897f4079fe8709c7a13b589ba2",
    "windows": [
      {
        "name": "preservation-only proxy; all runtime readers and old assertions unchanged",
        "before": "import { deskPreservation } from \"./helpers/missionCommandDesk.mjs\";\n",
        "after": "import { deskPreservation } from \"./helpers/changesReviewLanes.mjs\";\n",
        "count": 1
      }
    ]
  },
  "Tests/test_repository_profile.mjs": {
    "kind": "JS",
    "nativeEOL": "LF",
    "originalBytes": 25746,
    "originalRAW_SHA256": "bc416790a9b3a69101dc0d594e3e857e348264120e7c14f9e25a2b9b5120a277",
    "originalLF_SHA256": "bc416790a9b3a69101dc0d594e3e857e348264120e7c14f9e25a2b9b5120a277",
    "proposedLFBytes": 25746,
    "proposedLF_SHA256": "84aa440bb8d9a3aeb718b45e6b625b58c014c018fe74c27ed897320403d0f105",
    "windows": [
      {
        "name": "preservation-only proxy; all runtime readers and old assertions unchanged",
        "before": "import { deskPreservation } from \"./helpers/missionCommandDesk.mjs\";\n",
        "after": "import { deskPreservation } from \"./helpers/changesReviewLanes.mjs\";\n",
        "count": 1
      }
    ]
  },
  "Tests/test_repository_scope_picker.mjs": {
    "kind": "JS",
    "nativeEOL": "LF",
    "originalBytes": 23216,
    "originalRAW_SHA256": "ad924f2b7c6827031e7b98fd6392b0a0b175928b80ec844aedae76f45df50cc0",
    "originalLF_SHA256": "ad924f2b7c6827031e7b98fd6392b0a0b175928b80ec844aedae76f45df50cc0",
    "proposedLFBytes": 23216,
    "proposedLF_SHA256": "efa3ebc37005c1b76506392ec524975f2243317197fc3e997962be3f3a5ef71f",
    "windows": [
      {
        "name": "preservation-only proxy; all runtime readers and old assertions unchanged",
        "before": "import { deskPreservation } from \"./helpers/missionCommandDesk.mjs\";\n",
        "after": "import { deskPreservation } from \"./helpers/changesReviewLanes.mjs\";\n",
        "count": 1
      }
    ]
  },
  "Tests/test_system_snapshot_panels.mjs": {
    "kind": "JS",
    "nativeEOL": "LF",
    "originalBytes": 47385,
    "originalRAW_SHA256": "a264dbc9ac9409b9962d2a112cfefe33fc5f0f1d1b0c521a735a593202ebb05e",
    "originalLF_SHA256": "a264dbc9ac9409b9962d2a112cfefe33fc5f0f1d1b0c521a735a593202ebb05e",
    "proposedLFBytes": 47385,
    "proposedLF_SHA256": "391528d45529c7f48cc5f978f4a5ec0aa5c3d76b1e0a480ac86b58b37824d0b2",
    "windows": [
      {
        "name": "preservation-only proxy; all runtime readers and old assertions unchanged",
        "before": "import { deskPreservation } from \"./helpers/missionCommandDesk.mjs\";\n",
        "after": "import { deskPreservation } from \"./helpers/changesReviewLanes.mjs\";\n",
        "count": 1
      }
    ]
  },
  "Tests/test_warning_timestamp_order.mjs": {
    "kind": "JS",
    "nativeEOL": "LF",
    "originalBytes": 23832,
    "originalRAW_SHA256": "4be64ffc7943763b54f809d35bf2fbee4c4de807121bd3ea6dad4123eed7d32f",
    "originalLF_SHA256": "4be64ffc7943763b54f809d35bf2fbee4c4de807121bd3ea6dad4123eed7d32f",
    "proposedLFBytes": 23832,
    "proposedLF_SHA256": "f158bce4600a57589a643840fd0985a7c40af0e787990f3655ade2251d0f9a9d",
    "windows": [
      {
        "name": "preservation-only proxy; all runtime readers and old assertions unchanged",
        "before": "import { deskPreservation } from \"./helpers/missionCommandDesk.mjs\";\n",
        "after": "import { deskPreservation } from \"./helpers/changesReviewLanes.mjs\";\n",
        "count": 1
      }
    ]
  },
  "Tests/test_workbench_2_0.mjs": {
    "kind": "JS",
    "nativeEOL": "LF",
    "originalBytes": 43971,
    "originalRAW_SHA256": "da8d613165f4be42a1be064b4e2cc33a7f448fa00dc9dec4ace7635d1554aa67",
    "originalLF_SHA256": "da8d613165f4be42a1be064b4e2cc33a7f448fa00dc9dec4ace7635d1554aa67",
    "proposedLFBytes": 44012,
    "proposedLF_SHA256": "2fea428635e94bbd06142641236a9072e7891fcee91db0e938fb3c30f6e2c540",
    "windows": [
      {
        "name": "preservation-only proxy; all runtime readers and old assertions unchanged",
        "before": "import { deskPreservation } from \"./helpers/missionCommandDesk.mjs\";\n",
        "after": "import { deskPreservation } from \"./helpers/changesReviewLanes.mjs\";\n",
        "count": 1
      },
      {
        "name": "preservation-only HTML before existing Studio and older inverses",
        "count": 1,
        "before": "const html = restoreChangesReviewDeskHtml(restoreAttributionStationHtml(studioHtml(read(\"Frontend/index.html\"))));\n",
        "after": "const html = restoreChangesReviewDeskHtml(restoreAttributionStationHtml(studioHtml(deskPreservation(\"Frontend/index.html\", read(\"Frontend/index.html\")))));\n"
      }
    ]
  },
  "Tests/test_workspace_command_frame.mjs": {
    "kind": "JS",
    "nativeEOL": "LF",
    "originalBytes": 24206,
    "originalRAW_SHA256": "ccfcd39450249e995ce1872955cec0ca854d1df7f639621cf1fe3646d55ecae2",
    "originalLF_SHA256": "ccfcd39450249e995ce1872955cec0ca854d1df7f639621cf1fe3646d55ecae2",
    "proposedLFBytes": 24206,
    "proposedLF_SHA256": "b8340011a0920aae51579579c185f5bfd3d668b7c2ee20ae94f03849c6619759",
    "windows": [
      {
        "name": "preservation-only proxy; all runtime readers and old assertions unchanged",
        "before": "import { deskPreservation } from \"./helpers/missionCommandDesk.mjs\";\n",
        "after": "import { deskPreservation } from \"./helpers/changesReviewLanes.mjs\";\n",
        "count": 1
      }
    ]
  },
  "Tests/test_operational_views.mjs": {
    "kind": "JS",
    "nativeEOL": "CRLF",
    "originalBytes": 37888,
    "originalRAW_SHA256": "1dc324f2fba75698b916ce4f840adf97c3abddf78bf0d6b618b994f3baaef816",
    "originalLF_SHA256": "0ffce73f13e7731b0ce18bf563a3273facf3aab4bfc027ab921f04cc5736c2b3",
    "proposedLFBytes": 37533,
    "proposedLF_SHA256": "c379b7148fc1bd06c9c5c9ccc5573522b09aa8426660c096b74466333958aff8",
    "windows": [
      {
        "name": "preservation-only import; actual runtime remains on global current AST",
        "before": "import { canonicalPrintedText } from \"./helpers/printed_source.mjs\";\n",
        "after": "import { canonicalPrintedText } from \"./helpers/printed_source.mjs\";\nimport { reviewLanesPreservation } from \"./helpers/changesReviewLanes.mjs\";\n",
        "count": 1
      },
      {
        "name": "complete original digest inputs only, all hashes unchanged",
        "before": "  for (const [name, hash] of Object.entries(expected)) {\n    const code = preRenderCode(app, name);",
        "after": "  const preservationApp = ts.createSourceFile(\"App.tsx\",\n    reviewLanesPreservation(\"Frontend/src/App.tsx\", app.text), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);\n  for (const [name, hash] of Object.entries(expected)) {\n    const code = preRenderCode(preservationApp, name);",
        "count": 1
      }
    ]
  }
};
const positiveCache = new Map();

function pathKey (path) {
  assert.equal(typeof path, "string", "relative preservation path");
  assert.ok(/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(path), "safe relative path");
  assert.ok(path.split("/").every((part) => part !== "." && part !== ".."), "no traversal");
  return path;
}

function inputText (value) {
  assert.ok(typeof value === "string" || Buffer.isBuffer(value), "string or Buffer input");
  if (Buffer.isBuffer(value)) {
    assert.ok(!(value[0] === 0xef && value[1] === 0xbb && value[2] === 0xbf), "no UTF8 BOM");
  }
  const text = typeof value === "string" ? value
    : new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(value);
  assert.ok(!text.startsWith("\uFEFF") && !text.includes("\0"), "no BOM or NUL");
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lf = text.replace(/\r\n/g, "\n");
  assert.ok(!lf.includes("\r"), "no bare CR");
  assert.equal(text, eol === "\r\n" ? lf.replace(/\n/g, "\r\n") : lf, "uniform EOL");
  assert.ok(lf.endsWith("\n") && !lf.endsWith("\n\n"), "single final newline");
  assert.ok(lf.split("\n").every((line) => !/[ \t]+$/.test(line)), "no trailing whitespace");
  return { text, lf, eol };
}

function syntax (path, text, kind) {
  const ast = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true,
    kind === "TSX" ? ts.ScriptKind.TSX : ts.ScriptKind.JS);
  assert.equal(ast.parseDiagnostics.length, 0, "valid preservation syntax " + path);
  return ast;
}

function nodes (root, predicate) {
  const found = [];
  const visit = (node) => {
    if (predicate(node)) found.push(node);
    ts.forEachChild(node, visit);
  };
  visit(root);
  return found;
}

function sourceSites (path, input, spec) {
  if (spec.kind === "HTML") {
    const window = spec.windows[0], at = input.indexOf(window.after);
    assert.ok(input.indexOf("<head>") < at && at < input.indexOf("</head>"), "direct head owner");
    assert.equal(input.split('<style id="katlab-changes-review-lanes">').length - 1, 1, "one fifth style");
    assert.equal(input.split(window.before).length - 1, 1, "unchanged title anchor");
    assert.ok(input.slice(0, at).includes('<style id="katlab-diagnostic-studio">'), "after fourth style");
    return;
  }
  const ast = syntax(path, input, "TSX");
  const owner = (name) => {
    const found = ast.statements.filter((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
    assert.equal(found.length, 1, "one source owner " + name);
    return found[0];
  };
  const row = owner("EventRow"), group = owner("TaskGroup");
  const helpers = row.body.statements.filter((node) => ts.isVariableStatement(node)
    && node.declarationList.declarations.some((decl) => decl.name.getText(ast) === "reviewCell"));
  assert.equal(helpers.length, 1, "one local pure helper before EventRow return");
  const calls = nodes(row, (node) => ts.isCallExpression(node) && node.expression.getText(ast) === "reviewCell");
  assert.deepEqual(calls.map((node) => node.arguments[0].text).sort(), ["action", "body", "context", "signal"]);
  const flags = nodes(ast, (node) => ts.isJsxAttribute(node) && node.name.getText(ast) === "reviewLedger");
  assert.equal(flags.length, 1, "normal-only presentation caller");
  assert.equal(flags[0].initializer, undefined, "literal true normal caller");
  assert.ok(flags[0].getStart(ast) > group.getStart(ast) && flags[0].end < group.end, "TaskGroup owns caller");
  assert.ok(group.getText(ast).includes(spec.windows[0].after), "exact normal slice owner");
  assert.equal(nodes(row, (node) => ts.isJsxAttribute(node)
    && node.name.getText(ast) === "data-review-ledger").length, 1, "one header marker");
  assert.equal(nodes(row, (node) => ts.isJsxAttribute(node)
    && node.name.getText(ast) === "data-review-cell").length, 1, "one pure wrapper expression");
}

function suiteSites (path, ast) {
  const imports = ast.statements.filter(ts.isImportDeclaration)
    .filter((node) => node.moduleSpecifier.text === "./helpers/changesReviewLanes.mjs");
  assert.equal(imports.length, 1, "one bounded new preservation import");
  const names = imports[0].importClause?.namedBindings?.elements;
  assert.ok(names && names.length === 1 && names[0].propertyName === undefined, "one unaliased export");
  const special = path === "Tests/test_mission_command_desk.mjs"
    || path === "Tests/test_operational_views.mjs";
  assert.equal(names[0].name.text, special ? "reviewLanesPreservation" : "deskPreservation");
}

function reverse (path, value, spec) {
  const input = inputText(value);
  assert.equal(sha(input.lf), spec.proposedLF_SHA256, "complete approved current input " + path);
  assert.equal(Buffer.byteLength(input.lf), spec.proposedLFBytes, "complete current LF length");
  const key = path + ":" + sha(input.lf);
  let restored = positiveCache.get(key);
  if (restored === undefined) {
    if (spec.kind === "JS") suiteSites(path, syntax(path, input.lf, "JS"));
    else sourceSites(path, input.lf, spec);
    restored = input.lf;
    for (const window of [...spec.windows].reverse()) {
      assert.equal(restored.split(window.after).length - 1, window.count,
        "exact inverse cardinality " + window.name + " in " + path);
      restored = restored.split(window.after).join(window.before);
    }
    if (spec.kind !== "HTML") syntax(path, restored, spec.kind);
    assert.equal(sha(restored), spec.originalLF_SHA256, "complete original LF after all inverses " + path);
    const native = spec.nativeEOL === "CRLF" ? restored.replace(/\n/g, "\r\n") : restored;
    assert.equal(Buffer.byteLength(native), spec.originalBytes, "complete original native length");
    assert.equal(sha(native), spec.originalRAW_SHA256, "complete original native RAW " + path);
    let replay = restored;
    for (const window of spec.windows) {
      assert.equal(replay.split(window.before).length - 1, window.count,
        "exact forward cardinality " + window.name + " in " + path);
      replay = replay.split(window.before).join(window.after);
    }
    assert.equal(replay, input.lf, "full approved forward replay");
    positiveCache.set(key, restored);
  }
  const text = input.eol === "\r\n" ? restored.replace(/\n/g, "\r\n") : restored;
  return typeof value === "string" ? text : Buffer.from(text, "utf8");
}

/** Strict current 3.1 -> published 3.0 data projection; never historical execution. */
export function reviewLanesPreservation (path, value) {
  const name = pathKey(path);
  return Object.hasOwn(SPECS, name) ? reverse(name, value, SPECS[name]) : value;
}

/** Existing preservation-only entrypoint; old assertions/helpers remain unchanged. */
export function deskPreservation (path, value) {
  return previousDeskPreservation(path, reviewLanesPreservation(path, value));
}
