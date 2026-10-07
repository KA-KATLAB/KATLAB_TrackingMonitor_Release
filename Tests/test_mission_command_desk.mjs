import { purposeNavigationPreservation } from "./helpers/purposeLedNavigation.mjs";
import { cityBriefPreservation } from "./helpers/cityDistrictBrief.mjs";
import { mastheadPreservation } from "./helpers/workspaceCommandMasthead.mjs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  deskPreservation,
  restoreMissionCommandDeskSource,
  restoreMissionCommandDeskSuite,
} from "./helpers/missionCommandDesk.mjs";
import { reviewLanesPreservation } from "./helpers/changesReviewLanes.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const requireFrontend = createRequire(resolve(ROOT, "Frontend/package.json"));
const ts = requireFrontend("typescript");
const postcss = requireFrontend("postcss");
const selectors = requireFrontend("postcss-selector-parser");
const React = requireFrontend("react");
const { renderToStaticMarkup } = requireFrontend("react-dom/server");
const read = (path) => readFileSync(resolve(ROOT, path));
const sha = (value) => createHash("sha256").update(value).digest("hex");
const lf = (value) => value.toString("utf8").replace(/\r\n/g, "\n");
const MODULE = "Frontend/src/missionCommandDesk.tsx";
const CSS = "Frontend/src/missionCommandDesk.css";

// Independent reviewed author goldens, not production-derived or ignored-plan oracles.
const GOLDEN_MODULE = [
  "import type { ReactNode } from \"react\";",
  "import { hasOverlayLease } from \"./dialog\";",
  "import { ControlButton, Surface } from \"./ui\";",
  "import \"./missionCommandDesk.css\";",
  "",
  "const MISSION_SECTIONS = [",
  "  { id: \"mission-now-heading\", label: \"Now\" },",
  "  { id: \"mission-plans-heading\", label: \"Plans\" },",
  "  { id: \"mission-forecast-heading\", label: \"Forecast\" },",
  "  { id: \"mission-verification-heading\", label: \"Verification\" },",
  "  { id: \"mission-evidence-heading\", label: \"Evidence\" },",
  "  { id: \"mission-flight-heading\", label: \"Flight recorder\" },",
  "] as const;",
  "",
  "/** A user-requested jump within the same owned Mission scroller, or no jump. */",
  "export function jumpToMissionSection (",
  "  trigger: HTMLElement,",
  "  id: string,",
  "  onSectionNavigation?: () => void,",
  "): boolean {",
  "  if (!MISSION_SECTIONS.some((section) => section.id === id)) return false;",
  "  if (typeof HTMLElement === \"undefined\" || !(trigger instanceof HTMLElement)) return false;",
  "  const document = trigger.ownerDocument;",
  "  const view = document.defaultView;",
  "  const desk = trigger.closest<HTMLElement>(\"[data-mission-command-desk]\");",
  "  const main = trigger.closest<HTMLElement>(\"main[data-app-scroll]\");",
  "  const matches = document.querySelectorAll<HTMLElement>(`#${id}`);",
  "  if (!view || !(desk instanceof HTMLElement) || !(main instanceof HTMLElement)",
  "      || matches.length !== 1) return false;",
  "  const target = matches[0];",
  "",
  "  const visible = (element: HTMLElement): boolean => {",
  "    if (!element.isConnected || element.ownerDocument !== document",
  "        || element.closest(\"[inert], [hidden], [aria-hidden='true']\")) return false;",
  "    let reachedMain = false;",
  "    for (let ancestor: HTMLElement | null = element; ancestor; ancestor = ancestor.parentElement) {",
  "      if (!ancestor.isConnected || ancestor.ownerDocument !== document",
  "          || ancestor.matches(\"[inert], [hidden], [aria-hidden='true'], :disabled, [aria-disabled='true']\")) return false;",
  "      const style = view.getComputedStyle(ancestor);",
  "      if (style.display === \"none\" || style.visibility === \"hidden\"",
  "          || style.visibility === \"collapse\" || Number(style.opacity) === 0) return false;",
  "      if (ancestor === main) {",
  "        reachedMain = true;",
  "      }",
  "    }",
  "    if (!reachedMain) return false;",
  "    const bounds = element.getBoundingClientRect();",
  "    return element.getClientRects().length > 0 && bounds.width > 0 && bounds.height > 0",
  "      && [bounds.top, bounds.right, bounds.bottom, bounds.left, bounds.width, bounds.height]",
  "        .every(Number.isFinite);",
  "  };",
  "  const owned = (): boolean => {",
  "    if (hasOverlayLease() || !(target instanceof HTMLElement)",
  "        || target.tagName !== \"H3\" || target.getAttribute(\"tabindex\") !== \"-1\"",
  "        || target.tabIndex !== -1 || !desk.isConnected || !main.isConnected",
  "        || desk.ownerDocument !== document || main.ownerDocument !== document",
  "        || trigger.closest(\"[data-mission-command-desk]\") !== desk",
  "        || target.closest(\"[data-mission-command-desk]\") !== desk",
  "        || trigger.closest(\"main[data-app-scroll]\") !== main",
  "        || target.closest(\"main[data-app-scroll]\") !== main",
  "        || desk.closest(\"main[data-app-scroll]\") !== main",
  "        || !desk.contains(trigger) || !desk.contains(target)",
  "        || !main.contains(desk) || !main.contains(trigger) || !main.contains(target)) return false;",
  "    const current = document.querySelectorAll<HTMLElement>(`#${id}`);",
  "    return current.length === 1 && current[0] === target",
  "      && [desk, main, trigger, target].every(visible);",
  "  };",
  "  const destination = (): number | null => {",
  "    if (!owned()) return null;",
  "    const mainBounds = main.getBoundingClientRect();",
  "    const targetBounds = target.getBoundingClientRect();",
  "    const values = [main.scrollTop, main.scrollHeight, main.clientHeight, main.clientTop,",
  "      mainBounds.top, mainBounds.height, targetBounds.top, targetBounds.height];",
  "    if (!values.every(Number.isFinite) || main.clientHeight <= 0",
  "        || main.scrollHeight < 0 || main.clientTop < 0) return null;",
  "    const maximum = Math.max(0, main.scrollHeight - main.clientHeight);",
  "    const position = main.scrollTop + targetBounds.top - mainBounds.top - main.clientTop;",
  "    if (!Number.isFinite(maximum) || !Number.isFinite(position)) return null;",
  "    return Math.max(0, Math.min(maximum, position));",
  "  };",
  "",
  "  try {",
  "    if (destination() === null) return false;",
  "    onSectionNavigation?.();",
  "    // The callback may synchronously flush route state or replace/remove nodes.",
  "    if (destination() === null) return false;",
  "    target.focus({ preventScroll: true });",
  "    // Focus handlers may open an overlay, move focus, or replace the destination.",
  "    if (document.activeElement !== target) return false;",
  "    const position = destination();",
  "    if (position === null || document.activeElement !== target) return false;",
  "    main.scrollTop = position;",
  "    return owned() && document.activeElement === target && Number.isFinite(main.scrollTop);",
  "  } catch {",
  "    return false;",
  "  }",
  "}",
  "",
  "export function MissionCommandDesk ({ children, showPlans, onSectionNavigation }: {",
  "  children: ReactNode;",
  "  showPlans: boolean;",
  "  onSectionNavigation?: () => void;",
  "}): JSX.Element {",
  "  return (",
  "    <div className=\"mission-command-desk\" data-mission-command-desk>",
  "      <Surface tone=\"quiet\" className=\"mission-command-navigation\">",
  "        <nav aria-label=\"Mission sections\">",
  "          <h3 className=\"mission-command-title\">Command desk</h3>",
  "          <p className=\"mission-command-description\">",
  "            Jump within the current Mission.",
  "          </p>",
  "          <div className=\"mission-command-links\">",
  "            {MISSION_SECTIONS.filter((section) => showPlans || section.id !== \"mission-plans-heading\")",
  "              .map((section) => (",
  "                <ControlButton key={section.id} className=\"mission-command-link\"",
  "                  aria-controls={section.id}",
  "                  onClick={(event) => { jumpToMissionSection(event.currentTarget, section.id, onSectionNavigation); }}>",
  "                  {section.label}",
  "                </ControlButton>",
  "              ))}",
  "          </div>",
  "        </nav>",
  "      </Surface>",
  "      <div className=\"mission-command-content min-w-0 space-y-6\">{children}</div>",
  "    </div>",
  "  );",
  "}",
].join("\n") + "\n";
const GOLDEN_CSS = [
  "/* Mission Command Desk: normal-flow wayfinding within the existing main scroller. */",
  ".mission-command-desk {",
  "  display: grid;",
  "  min-width: 0;",
  "  grid-template-columns: minmax(0, 1fr);",
  "  align-items: start;",
  "  gap: 1.5rem;",
  "}",
  ".mission-command-desk > .mission-command-navigation {",
  "  min-width: 0;",
  "  padding: 1rem;",
  "  border: 1px solid rgb(var(--ui-border));",
  "  border-radius: 8px;",
  "  background: rgb(var(--ui-surface));",
  "}",
  ".mission-command-navigation .mission-command-title {",
  "  margin: 0;",
  "  font-size: 1.25rem;",
  "  line-height: 1.4;",
  "  font-weight: 600;",
  "  color: rgb(var(--ui-text));",
  "}",
  ".mission-command-navigation .mission-command-description {",
  "  margin-top: 0.5rem;",
  "  font-size: 0.75rem;",
  "  line-height: 1.5;",
  "  color: rgb(var(--ui-text-muted));",
  "  overflow-wrap: anywhere;",
  "}",
  ".mission-command-navigation .mission-command-links {",
  "  display: flex;",
  "  min-width: 0;",
  "  flex-wrap: wrap;",
  "  align-items: stretch;",
  "  gap: 0.5rem;",
  "  margin-top: 1rem;",
  "}",
  ".mission-command-navigation .mission-command-links > .mission-command-link {",
  "  min-width: 0;",
  "  max-width: 100%;",
  "  min-height: 44px;",
  "  justify-content: flex-start;",
  "  padding: 0.5rem 0.75rem;",
  "  font-size: 0.875rem;",
  "  line-height: 1.5;",
  "  text-align: left;",
  "  white-space: normal;",
  "  overflow-wrap: anywhere;",
  "}",
  ".mission-command-desk > .mission-command-content {",
  "  min-width: 0;",
  "}",
  ".mission-command-content > .ui-surface.border-l-4 {",
  "  padding: 1.25rem;",
  "  background: rgb(var(--ui-surface));",
  "}",
  "@media (min-width: 768px) {",
  "  .mission-command-content > .ui-surface.border-l-4 {",
  "    padding: 1.5rem;",
  "  }",
  "}",
  "@media (min-width: 1536px) {",
  "  .mission-command-desk {",
  "    grid-template-columns: 12rem minmax(0, 1fr);",
  "  }",
  "  .mission-command-navigation .mission-command-links {",
  "    flex-direction: column;",
  "  }",
  "  .mission-command-navigation .mission-command-links > .mission-command-link {",
  "    width: 100%;",
  "  }",
  "}",
].join("\n") + "\n";
const SOURCE_PINS = [
  [
    "Frontend/src/App.tsx",
    "d1a42a0e968e0c7790d4952c2993c37bee19efda2f197c4ab19d81ec5c1a3112",
    "b98cfe4b7322d489149450bee7a07f732ff15e1e534d122caa6af72b52be8684",
    "945c8879e94b5d7a8410d2a143ed2e127e2653dd1a123d2d8b4cd306758a6f3e",
    "c7c568b346c7ddf00d86b93325b97854e59f3f625f6fd916b056e85ccf069b1a",
    234937,
    234754
  ],
  [
    "Frontend/src/MissionView.tsx",
    "ef6c1594c19c7a3c8152e556131d854b708c9890241c8be2ba29afbd8f31eb3d",
    "72646e387b14c714ec2c8a2e2dad2da84385358a8f1e9ac2f7a18bb996bcd57c",
    "aa13ef82e543e58e2762568e0b1d430ef2622c0ab3f95aa5433edb5fb1a7bdab",
    "b2ebe76aa6ab6527dcf21bd90ad67d718f29ff8521a137262cfa4309c17be622",
    66898,
    65426
  ]
];
const ADAPTED_SUITES = [
  ["Tests/test_achievement_gallery.mjs","566b91ea834d43735f01aab2817f6129c10496d1d2772fcd8151d0652739458c"],
  ["Tests/test_active_plan_gallery.mjs","ffd3c9b18d1ad35ba7dd2875af404ab4ac9638e935c1027d9b5bf1f83ccbf260"],
  ["Tests/test_attribution_station.mjs","531efc1d9e3eed8ccff969a5108983257a79233ee4bfaad9f5e9ed040a368cd1"],
  ["Tests/test_changes_review_desk.mjs","69cb772a0f77b46ba6940cc8e662609e7be56905e4758c270f86b09bdbdb12bf"],
  ["Tests/test_chronicle_reader_canvas.mjs","d3f108fc0358a4de6ba1e51dd34deefebf9fd27a9fa696daf59c91d40b1d040b"],
  ["Tests/test_diagnostic_studio.mjs","897dfd9d0506182a0df1cb99cbb249285b295db393538a460dd5d5469fd98944"],
  ["Tests/test_diff_availability.mjs","11dd036c47e308db4211995d7fe6652f173c756c962da568cd57a98f06f555bc"],
  ["Tests/test_git_graph_merge_seed.mjs","b96152392094e68d39e35de42a8e968ba89e42ea7ca6ebf6f91e26d995c21f75"],
  ["Tests/test_history_commit_ledger.mjs","66944cd059bc1714d10aa377a5c372c7f47213a21acd7952ad14e75e476a8e75"],
  ["Tests/test_history_graph_read_states.mjs","07469e5b16d08c074500fa84b4f969d3fa77ac1b47f91c72e87162439021c4bb"],
  ["Tests/test_mission_control_workbench.mjs","d92813b96ba0206202d0b40f77aa7e622be438c8e9a9a68bd26290b2ee0577d3"],
  ["Tests/test_mission_owner_retirement.mjs","9adaf72a29ba6e582d7a0fe0227863e4efbbb38d19ecdf8cc07293881231ca1f"],
  ["Tests/test_mission_plan_gallery.mjs","6092dbb713be9151f8a80a567e09b09732ba96040336634cf659b5be80c94138"],
  ["Tests/test_mission_plan_snapshot.mjs","03c937081caaeb713761b9f643c59a41c8490c26beab26abde3234c69d8137a3"],
  ["Tests/test_momentum_comparison_deck.mjs","e7ea2bc5ced58860057a87c37b62756b4f018dcd4d703d0efaf1ae3c2a5ef5d9"],
  ["Tests/test_overview_operations_deck.mjs","4c4b2fb8ed83321a1c696e99b102b3611a5f81902967b070a934cd43126421b9"],
  ["Tests/test_personal_records_showcase.mjs","7c02d2daffa142b1a38722a18ff6067ac7739af2325237df5eaf28fbe070d537"],
  ["Tests/test_provenance_evidence_desk.mjs","67a772a9db45416cdca44e68c66c50c36bb13484566e351e3c56a0325ebe82c2"],
  ["Tests/test_repository_profile.mjs","4759cac6ca1d8e3a6881cc29bcb4d8a9f6f466704967da51e3eb19bcf32dec3e"],
  ["Tests/test_repository_scope_picker.mjs","e895bdbd48be23b8cd43d4bb2d864b66689a8da45ee3a976c974a11bdd1c8a3d"],
  ["Tests/test_system_snapshot_panels.mjs","2d84f20f7194de62d0656b7220a37c367c37696a33a6a12d673bce0c55c25a65"],
  ["Tests/test_warning_timestamp_order.mjs","5431fea22e69707c5f64323b931311bdf7e38a06d5ea5f7aade014a12a743c5c"],
  ["Tests/test_workbench_2_0.mjs","8dc66c7913ecdfac540696f82c7c8cda115445d4148547c0b2afe356d105b41b"],
  ["Tests/test_workspace_command_frame.mjs","c46140e06176cc3781d8e1acf17c5e9eee11989524e6341a3d15d0f810e7c247"],
  ["Tests/test_release_identity.mjs","60cf57a80045e6c7a77ec9ec9c8c10ce0ffde38d2acb77819f7a626925f8dfa2"],
];
const IMMUTABLE_PINS = [
  ["Tests/helpers/missionOwnerRetirement.mjs","c6d800025d7a927cdb14746a901600bc0a39291ae1e039008a295bd7f69bfc36","c6d800025d7a927cdb14746a901600bc0a39291ae1e039008a295bd7f69bfc36"],
  ["Tests/helpers/warningTimestampOrder.mjs","e7f462d41553c8475f294917d1746c58073294502ad71c3735a09446311a2606","e7f462d41553c8475f294917d1746c58073294502ad71c3735a09446311a2606"],
  ["Tests/helpers/diffDisclosureState.mjs","67846752be408a6cbe78eacda2ef9e09a762e164fb9164353a0b4dbc4c1958c7","67846752be408a6cbe78eacda2ef9e09a762e164fb9164353a0b4dbc4c1958c7"],
  ["Tests/helpers/gitGraphMergeSeed.mjs","bb40508d5978cbc6975d8bf3dfe3da2be346ca62255ed9559629adf3d5f832ad","bb40508d5978cbc6975d8bf3dfe3da2be346ca62255ed9559629adf3d5f832ad"],
  ["Tests/helpers/changesWorkbench.mjs","4991f73e724844f027715018e8d736e7289f51f0a4e0e13b8d9a30bf1d47d395","4991f73e724844f027715018e8d736e7289f51f0a4e0e13b8d9a30bf1d47d395"],
  ["Tests/helpers/changesReviewDesk.mjs","ee93e4f9c31026e24b9c42071ed10cd63b3181d75d5423c5a0a0c60ddc3a98a6","ee93e4f9c31026e24b9c42071ed10cd63b3181d75d5423c5a0a0c60ddc3a98a6"],
  ["Tests/helpers/attributionStation.mjs","67d9956debeb82a67b51aa68c73b6864915ef49e596f0cb1c7c8b0917c72c647","67d9956debeb82a67b51aa68c73b6864915ef49e596f0cb1c7c8b0917c72c647"],
  ["Tests/helpers/diagnosticStudio.mjs","d7a2936fbc51390af5050642c05210fd52d6775a4de0118a6328b0fd154775a8","d7a2936fbc51390af5050642c05210fd52d6775a4de0118a6328b0fd154775a8"],
  ["Tests/helpers/printed_source.mjs","8061b014a52af239d9b37345941f68b0b41c1cb7e0b5d402353bf0dcfa84217d","8061b014a52af239d9b37345941f68b0b41c1cb7e0b5d402353bf0dcfa84217d"],
  ["Frontend/package.json","b131be7e90ba2500b01371e594e10c482b94cf651ab425ddf7efaea76b759b9d","541a787d69fa512a53de01b53240e2e94ac22f068da882e0c2496f68ee5bf1a1"],
  ["Frontend/package-lock.json","0c39bf19779991e4565e00845a061fc954afdfe988d9026c6c356957e2b02258","d5ccfda11d2d07b4a707b18aca87b866a135182a3bd33ce2380c21730809ce75"],
  ["Frontend/tsconfig.json","97997252d286ecf7a8a4b12a51ac2fdd9199f3b9bf5e14e8d4f7d4e5e60d3f3f","97997252d286ecf7a8a4b12a51ac2fdd9199f3b9bf5e14e8d4f7d4e5e60d3f3f"],
  ["Frontend/vite.config.ts","6f25836874cc3ca4c97781dd0140ab1e7fee796b3b0c67a67ffdb8600e67cd6b","4631f5c7380fa909b5b361bf8eb7fdac29a665144ca260f9ac30be30ce83f107"],
  ["Backend/requirements.txt","f750d19859ca5621eea836592d2038857f73e8857bcace96752ce6dadf004ea3","f24979c56dd6d095f18541462485fb62229cfddf0fa8784d7c7dd9fbb535d0b5"],
  ["Scripts/Chronicle/requirements.txt","9d91436f670aac600f39beb184f7278774dc94e470dfca37f092bb0e3d461722","562f66ed699de7d73e464c6be1a0938b6b19a8c2f69fe4b955209f0981986a2d"],
  ["Frontend/src/main.tsx","c0b126cdce533a00247006a8efbb72c51b073c638a5764e0cb54d180e5f3f588","c0b126cdce533a00247006a8efbb72c51b073c638a5764e0cb54d180e5f3f588"],
  ["Frontend/node_modules/react-dom/package.json","d2f29e31bd48b833e48cd7bbf41f192e8ee4ff8da249fdbe10d4ac4114b8b12e","d2f29e31bd48b833e48cd7bbf41f192e8ee4ff8da249fdbe10d4ac4114b8b12e"],
  ["Frontend/src/ui.tsx","b5650b9e2a3529ff1ca033ed077d7b806f0cc9341c9733b4b3a52c107ab99974","e1c2ad05398cf771ee17ba576b7feecf03829459379b9e02e35c58aea5004c46"],
  ["Frontend/src/dialog.tsx","aaeda6eec7080c96b4992d6944444d21ab518ba5987e8a5abd8100423dd136b0","86f96a3c1454baf8337409995abb81f11ad57ce74d8f4288cbe5ac350991715a"],
  ["Frontend/src/missionModel.ts","2f42d0e8740d3e4ff7451771f9521e65f77ac078d25c8dd4b5b4598cee436446","2f42d0e8740d3e4ff7451771f9521e65f77ac078d25c8dd4b5b4598cee436446"],
  ["Frontend/src/navigation.ts","f22476d82cccafa88477d82cad9b831c9457310ccb6a508cb12cd66bcd110ff1","3a43b26da1c951e04049ce0336aeaa71c86ea99a04d4bc4a9b4775ddd4258e11"],
  ["Frontend/index.html","98b8ebb28a50a8575ee5d99347c41cc4334812b2f7cca77f5fd9b77f3212a330","98b8ebb28a50a8575ee5d99347c41cc4334812b2f7cca77f5fd9b77f3212a330"],
  ["Frontend/src/index.css","9371bc04cba0b62e8a8e5e3b4a9251deea9273be58f4b9735982e0649527ba81","788436e9def1e7109fe98d4bfa5e0add49a5f0ca301b17416279c03f18ede0f5"],
];

const SECTIONS = [
  ["mission-now-heading", "Now"], ["mission-plans-heading", "Plans"],
  ["mission-forecast-heading", "Forecast"], ["mission-verification-heading", "Verification"],
  ["mission-evidence-heading", "Evidence"], ["mission-flight-heading", "Flight recorder"],
];
const RULES = [
  [null, ".mission-command-desk", [["display","grid"],["min-width","0"],["grid-template-columns","minmax(0, 1fr)"],["align-items","start"],["gap","1.5rem"]]],
  [null, ".mission-command-desk > .mission-command-navigation", [["min-width","0"],["padding","1rem"],["border","1px solid rgb(var(--ui-border))"],["border-radius","8px"],["background","rgb(var(--ui-surface))"]]],
  [null, ".mission-command-navigation .mission-command-title", [["margin","0"],["font-size","1.25rem"],["line-height","1.4"],["font-weight","600"],["color","rgb(var(--ui-text))"]]],
  [null, ".mission-command-navigation .mission-command-description", [["margin-top","0.5rem"],["font-size","0.75rem"],["line-height","1.5"],["color","rgb(var(--ui-text-muted))"],["overflow-wrap","anywhere"]]],
  [null, ".mission-command-navigation .mission-command-links", [["display","flex"],["min-width","0"],["flex-wrap","wrap"],["align-items","stretch"],["gap","0.5rem"],["margin-top","1rem"]]],
  [null, ".mission-command-navigation .mission-command-links > .mission-command-link", [["min-width","0"],["max-width","100%"],["min-height","44px"],["justify-content","flex-start"],["padding","0.5rem 0.75rem"],["font-size","0.875rem"],["line-height","1.5"],["text-align","left"],["white-space","normal"],["overflow-wrap","anywhere"]]],
  [null, ".mission-command-desk > .mission-command-content", [["min-width","0"]]],
  [null, ".mission-command-content > .ui-surface.border-l-4", [["padding","1.25rem"],["background","rgb(var(--ui-surface))"]]],
  ["(min-width: 768px)", ".mission-command-content > .ui-surface.border-l-4", [["padding","1.5rem"]]],
  ["(min-width: 1536px)", ".mission-command-desk", [["grid-template-columns","12rem minmax(0, 1fr)"]]],
  ["(min-width: 1536px)", ".mission-command-navigation .mission-command-links", [["flex-direction","column"]]],
  ["(min-width: 1536px)", ".mission-command-navigation .mission-command-links > .mission-command-link", [["width","100%"]]],
];

function strictBytes(value, eol = "LF") {
  if (Buffer.isBuffer(value)) assert.ok(!value.subarray(0,3).equals(Buffer.from([0xef,0xbb,0xbf])));
  const text = Buffer.isBuffer(value) ? new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(value) : value;
  assert.equal(typeof text, "string");
  assert.ok(!text.startsWith("\uFEFF") && !text.includes("\0"));
  assert.ok(text.endsWith(eol === "LF" ? "\n" : "\r\n"));
  const normalized = text.replace(/\r\n/g, "\n");
  assert.ok(!normalized.includes("\r") && !normalized.endsWith("\n\n"));
  if (eol === "LF") assert.ok(!text.includes("\r"));
  else assert.equal(text, normalized.replace(/\n/g, "\r\n"));
  assert.ok(normalized.split("\n").every((line) => !/[ \t]+$/.test(line)));
  return normalized;
}
function validateModule(value) {
  const text = strictBytes(value);
  const tree = parse(text, MODULE);
  const imports = tree.statements.filter(ts.isImportDeclaration);
  assert.deepEqual(imports.map((node) => [node.moduleSpecifier.text, Boolean(node.importClause)]),
    [["react",true],["./dialog",true],["./ui",true],["./missionCommandDesk.css",false]]);
  assert.equal(text, GOLDEN_MODULE);
  assert.equal(Buffer.byteLength(text), 6159);
  assert.equal(sha(text), "b881147e105de46833e94a01dc43e57d053ec80fa5b841b3edaa8626167f658d");
  assert.equal(text.split("\n").length - 1, 127);
  return tree;
}
function validateCss(value) {
  const text = strictBytes(value);
  const root = postcss.parse(text);
  assert.equal(root.nodes.length, 11);
  assert.equal(root.nodes[0].type, "comment");
  assert.equal(root.nodes[0].text, "Mission Command Desk: normal-flow wayfinding within the existing main scroller.");
  const contexts = [];
  for (const node of root.nodes.slice(1)) {
    if (node.type === "rule") contexts.push([null, node]);
    else {
      assert.equal(node.type, "atrule"); assert.equal(node.name, "media");
      assert.ok(["(min-width: 768px)", "(min-width: 1536px)"].includes(node.params));
      assert.equal(node.nodes.length, node.params.includes("768") ? 1 : 3);
      for (const child of node.nodes) {
        assert.equal(child.type, "rule"); contexts.push([node.params, child]);
      }
    }
  }
  assert.equal(contexts.length, RULES.length);
  contexts.forEach(([media, node], i) => {
    const [expectedMedia, selector, declarations] = RULES[i];
    assert.equal(media, expectedMedia); assert.equal(node.selector, selector);
    const selectorTree = selectors().astSync(node.selector);
    assert.equal(selectorTree.nodes.length, 1);
    assert.ok(!/[#*:]/.test(node.selector));
    assert.ok(node.nodes.every((child) => child.type === "decl"));
    assert.deepEqual(node.nodes.map((d) => [d.prop,d.value]), declarations);
    assert.ok(node.nodes.every((d) => !d.important));
  });
  assert.equal(text, GOLDEN_CSS);
  assert.equal(Buffer.byteLength(text), 1821);
  assert.equal(sha(text), "d703e24f5b2a8e1f489583914fad8ee64f5f17a33e37bc4b1cba0c2974959c50");
  assert.equal(text.split("\n").length - 1, 72);
}
function parse(text, path) {
  const tree = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  assert.equal(tree.parseDiagnostics.length, 0, path);
  return tree;
}
function nodes(tree, predicate) {
  const found = [];
  const visit = (node) => { if (predicate(node)) found.push(node); ts.forEachChild(node, visit); };
  visit(tree); return found;
}
const opening = (node) => ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node);
const named = (node, name) => opening(node) && node.tagName.getText() === name;
function attribute(node, name) {
  return node.attributes.properties.find((p) => ts.isJsxAttribute(p) && p.name.getText() === name);
}
function attributeValue(node, name) {
  const attr = attribute(node, name); assert.ok(attr, name);
  return attr.initializer && ts.isStringLiteral(attr.initializer)
    ? attr.initializer.text : attr.initializer?.expression?.getText();
}
function declaration(tree, name) {
  const found = tree.statements.filter((node) =>
    (ts.isFunctionDeclaration(node) && node.name?.text === name)
    || (ts.isVariableStatement(node) && node.declarationList.declarations.some((d) => d.name.getText() === name)));
  assert.equal(found.length, 1, name);
  return found[0].getText(tree).replace(/^export\s+/, "");
}
let currentFactory;
function instantiate(environment) {
  if (!currentFactory) {
    // Compile CURRENT declarations only. Historical projections are preservation data.
    const ui = parse(lf(read("Frontend/src/ui.tsx")), "ui.tsx");
    const desk = validateModule(read(MODULE));
    const current = [
      "function instantiate(React, environment) {",
      "const { forwardRef } = React;",
      "const { HTMLElement, hasOverlayLease } = environment;",
      ...["cx","Surface","CONTROL_TONE","ControlButton"].map((name) => declaration(ui, name)),
      ...["MISSION_SECTIONS","jumpToMissionSection","MissionCommandDesk"].map((name) => declaration(desk, name)),
      "return { Surface, ControlButton, MISSION_SECTIONS, jumpToMissionSection, MissionCommandDesk };",
      "}", "module.exports = instantiate;",
    ].join("\n");
    const javascript = ts.transpileModule(current, { compilerOptions: {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    }}).outputText;
    const module = { exports: {} };
    new Function("require", "module", "exports", javascript)(requireFrontend, module, module.exports);
    currentFactory = module.exports;
  }
  return currentFactory(React, environment);
}
function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value); Object.values(value).forEach(deepFreeze);
  }
  return value;
}

// Deliberately CONTROLLED synchronous DOM host. This does not certify native
// focus, layout, browser/AT, effect timing, scroll events, or asynchronous updates.
class ControlledElement {
  constructor(document, tag, parent = null, attributes = {}) {
    this.ownerDocument = document; this.tagName = tag.toUpperCase();
    this.parentElement = parent; this.attributes = new Map(Object.entries(attributes));
    this.attached = true; this.rects = true; this.style = {};
    this.bounds = { top: 20, right: 900, bottom: 420, left: 0, width: 900, height: 400 };
    this.scrollHeight = 1500; this.clientHeight = 400; this.clientTop = 2;
    this._scrollTop = 17; this.scrollWrites = []; this.focusCalls = [];
    document.elements.push(this);
  }
  get isConnected() { return this.attached && (this === this.ownerDocument.documentElement || Boolean(this.parentElement?.isConnected)); }
  get tabIndex() { return Number(this.getAttribute("tabindex") ?? -1); }
  get scrollTop() { return this._scrollTop; }
  set scrollTop(value) { this.scrollWrites.push(value); this._scrollTop = value; }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  setAttribute(name, value = "") { this.attributes.set(name, String(value)); }
  removeAttribute(name) { this.attributes.delete(name); }
  contains(other) { for (let p = other; p; p = p.parentElement) if (p === this) return true; return false; }
  matches(selector) {
    return selector.split(",").some((part) => {
      const s = part.trim();
      if (s === ":disabled") return ["BUTTON","INPUT","SELECT","TEXTAREA","FIELDSET","OPTION","OPTGROUP"].includes(this.tagName) && this.attributes.has("disabled");
      if (s === "main[data-app-scroll]") return this.tagName === "MAIN" && this.attributes.has("data-app-scroll");
      const match = s.match(/^\[([a-z-]+)(?:='([^']*)')?\]$/);
      assert.ok(match, "Controlled selector is explicitly supported: " + s);
      return this.attributes.has(match[1]) && (match[2] === undefined || this.getAttribute(match[1]) === match[2]);
    });
  }
  closest(selector) { for (let p = this; p; p = p.parentElement) if (p.matches(selector)) return p; return null; }
  getBoundingClientRect() { return this.bounds; }
  getClientRects() { return this.rects ? [this.bounds] : []; }
  focus(options) { this.focusCalls.push(options); this.ownerDocument.activeElement = this; this.onFocus?.(); }
}
function host(id = SECTIONS[0][0]) {
  const document = { elements: [], activeElement: null, documentElement: null,
    defaultView: { getComputedStyle: (node) => ({ display:"block", visibility:"visible", opacity:"1", ...node.style }) },
    querySelectorAll(selector) {
      assert.ok(/^#[a-z-]+$/.test(selector));
      return this.elements.filter((node) => node.isConnected && node.getAttribute("id") === selector.slice(1));
    },
  };
  const html = new ControlledElement(document, "html"); document.documentElement = html;
  const body = new ControlledElement(document, "body", html);
  const root = new ControlledElement(document, "div", body, { id:"root" });
  const main = new ControlledElement(document, "main", root, { "data-app-scroll":"" });
  const desk = new ControlledElement(document, "div", main, { "data-mission-command-desk":"" });
  const nav = new ControlledElement(document, "nav", desk);
  const trigger = new ControlledElement(document, "button", nav);
  const content = new ControlledElement(document, "div", desk);
  const section = new ControlledElement(document, "section", content);
  const target = new ControlledElement(document, "h3", section, { id, tabindex:"-1" });
  target.bounds = { top:240, right:700, bottom:264, left:0, width:700, height:24 };
  document.activeElement = trigger;
  const environment = { HTMLElement:ControlledElement, leased:false,
    hasOverlayLease() { return environment.leased; } };
  const runtime = instantiate(environment);
  const sentinels = deepFreeze({ history:["a","b"], entryState:{ planKey:"repo|plan", cursor:2 },
    pager:{ plan:2, evidence:3, sessions:4 }, api:{ get:0, post:0, patch:0 } });
  return { document, html, body, root, main, desk, nav, trigger, content, section, target,
    environment, runtime, sentinels, before:JSON.stringify(sentinels) };
}
function checkUnchanged(h) {
  assert.equal(JSON.stringify(h.sentinels), h.before);
  assert.equal(h.root.scrollWrites.length + h.body.scrollWrites.length + h.html.scrollWrites.length, 0);
}
function reject(mutate, phase = "before", id = SECTIONS[0][0]) {
  const h = host(id); let calls = 0;
  if (phase === "before") mutate(h);
  if (phase === "focus") h.target.onFocus = () => mutate(h);
  const result = h.runtime.jumpToMissionSection(h.trigger, id, () => {
    calls += 1; if (phase === "callback") mutate(h);
  });
  assert.equal(result, false);
  assert.equal(calls, phase === "before" ? 0 : 1);
  assert.equal(h.main.scrollWrites.length, 0);
  assert.equal(h.target.focusCalls.length, phase === "focus" ? 1 : 0);
  checkUnchanged(h); return h;
}
function renderElements(element, found = []) {
  if (!React.isValidElement(element)) return found;
  let current = element;
  if (typeof current.type === "function") current = current.type(current.props);
  else if (typeof current.type === "object" && current.type?.render) current = current.type.render(current.props, null);
  if (current !== element) return renderElements(current, found);
  found.push(element);
  React.Children.forEach(element.props.children, (child) => renderElements(child, found));
  return found;
}

test("independent whole Desk module and strict native CSS contexts remain exact", () => {
  validateModule(read(MODULE)); validateCss(read(CSS));
  const tree = validateModule(read(MODULE));
  assert.equal(nodes(tree, ts.isCallExpression).filter((n) => n.expression.getText() === "useEffect").length, 0);
  assert.ok(!/\b(?:history|location|fetch|requestAnimationFrame|setTimeout|scrollIntoView|scrollTo|scrollBy)\b/.test(GOLDEN_MODULE));
  assert.equal((GOLDEN_MODULE.match(/scrollTop\s*=/g) ?? []).length, 1);
  assert.ok(!/\b(?:sticky|fixed|animation|transition|overflow-y|overflow-x|font-family|z-index|order)\s*:/.test(GOLDEN_CSS));
});

test("CSS adversaries reject every structural, owner, value, priority and byte escape", () => {
  const negatives = [
    "\uFEFF"+GOLDEN_CSS, GOLDEN_CSS+"\n", GOLDEN_CSS.replace("\n", "\r\n"),
    GOLDEN_CSS.replace("display: grid;", "display: grid;\0"), GOLDEN_CSS.slice(0,-2),
    GOLDEN_CSS+"@import 'outside.css';\n", GOLDEN_CSS+"body { color: red; }\n",
    GOLDEN_CSS.replace("display: grid;", "display: grid; display: grid;"),
    GOLDEN_CSS.replace("display: grid;", "display: grid !important;"),
    GOLDEN_CSS.replace("min-height: 44px;", "min-height: 32px;"),
    GOLDEN_CSS.replace("background: rgb(var(--ui-surface));", "background: url('/private');"),
    GOLDEN_CSS.replace(".mission-command-desk {", ".mission-command-desk, body {"),
    GOLDEN_CSS.replace("(min-width: 1536px)", "(min-width: 1024px)"),
    GOLDEN_CSS.replace("display: grid;", "@supports (display:grid) { body {display:grid;} }"),
    GOLDEN_CSS.replace("display: grid;", "& button {color:red;}"),
    GOLDEN_CSS.replace("display: grid;", "/* extra */ display: grid;"),
    GOLDEN_CSS.replace("  .mission-command-desk {\n", "  @font-face {font-family: extra;}\n  .mission-command-desk {\n"),
    GOLDEN_CSS.replace("  .mission-command-desk {\n", "  @supports (display:grid) {}\n  .mission-command-desk {\n"),
    GOLDEN_CSS.replace("  .mission-command-desk {\n", "  color: red;\n  .mission-command-desk {\n"),
  ];
  for (const value of negatives) assert.throws(() => validateCss(value));
});

test("new module malformed, duplicated, relocated, partial and outside edits are rejected", () => {
  const importLine = 'import "./missionCommandDesk.css";\n';
  const negatives = [
    "\uFEFF"+GOLDEN_MODULE, GOLDEN_MODULE+"\n", GOLDEN_MODULE.replace("\n","\r\n"),
    GOLDEN_MODULE.replace("const MISSION_SECTIONS", "const\0 MISSION_SECTIONS"),
    GOLDEN_MODULE.replace(importLine, ""), GOLDEN_MODULE.replace(importLine, importLine+importLine),
    GOLDEN_MODULE.replace(importLine, "// "+importLine), GOLDEN_MODULE.replace(importLine, 'import sheet from "./missionCommandDesk.css";\n'),
    GOLDEN_MODULE.replace(importLine, "")+importLine,
    GOLDEN_MODULE.replace("export function jumpToMissionSection", "export function ("),
    GOLDEN_MODULE.replace('label: "Now"', 'label: "Changed"'),
    GOLDEN_MODULE.replace("min-w-0 space-y-6", "min-w-0 space-y-4"),
    GOLDEN_MODULE.replace("function jumpToMissionSection", "function nestedJump"),
  ];
  for (const value of negatives) assert.throws(() => validateModule(value));
});

test("current App/Mission whole bytes invert to independent original RAW/LF without old execution", () => {
  for (const [path,currentRaw,currentLF,originalRaw,originalLF,currentBytes,originalBytes] of SOURCE_PINS) {
    const actual = reviewLanesPreservation(path, mastheadPreservation(path, purposeNavigationPreservation(path, read(path))));
    assert.equal(actual.length,currentBytes); strictBytes(actual,"CRLF");
    assert.equal(sha(actual),currentRaw); assert.equal(sha(lf(actual)),currentLF);
    const restored = restoreMissionCommandDeskSource(path,actual);
    assert.ok(Buffer.isBuffer(restored)); assert.equal(restored.length,originalBytes);
    assert.equal(sha(restored),originalRaw); assert.equal(sha(lf(restored)),originalLF);
    const textRestored = restoreMissionCommandDeskSource(path,actual.toString("utf8"));
    assert.equal(typeof textRestored,"string"); assert.equal(textRestored,restored.toString("utf8"));
    const restoredLF = restoreMissionCommandDeskSource(path,lf(actual));
    strictBytes(restoredLF); assert.equal(sha(restoredLF),originalLF);
    assert.equal(restoreMissionCommandDeskSource(path,Buffer.from(lf(actual))).toString("utf8"),restoredLF);
    assert.deepEqual(deskPreservation(path,actual),restored);
    // Preservation values remain DATA: never compile/evaluate the restored owners.
  }
});

test("all 25 adapted suites retain complete published2.3 identities and unrelated pin inputs stay raw", () => {
  assert.equal(ADAPTED_SUITES.length,25);
  for (const [path,originalHash] of ADAPTED_SUITES) {
    const actual = reviewLanesPreservation(path, mastheadPreservation(path, cityBriefPreservation(path, purposeNavigationPreservation(path, read(path))))); strictBytes(actual);
    const restored = restoreMissionCommandDeskSuite(path,actual);
    assert.ok(Buffer.isBuffer(restored)); assert.equal(sha(restored),originalHash);
    assert.equal(sha(lf(restored)),originalHash);
    assert.equal(restoreMissionCommandDeskSuite(path,actual.toString("utf8")),restored.toString("utf8"));
    const crlf = restoreMissionCommandDeskSuite(path,lf(actual).replace(/\n/g,"\r\n"));
    strictBytes(crlf,"CRLF"); assert.equal(sha(lf(crlf)),originalHash);
    assert.equal(crlf,restored.toString("utf8").replace(/\n/g,"\r\n"));
    assert.deepEqual(deskPreservation(path,actual),restored);
    assert.throws(() => restoreMissionCommandDeskSuite(path,Buffer.concat([actual,Buffer.from("// outside\n")])));
    assert.throws(() => restoreMissionCommandDeskSuite(path,Buffer.concat([Buffer.from("\uFEFF"),actual])));
    assert.throws(() => restoreMissionCommandDeskSuite(path,actual.toString("utf8").replace("\n","\r\n")));
  }
  for (const [path,rawHash,lfHash] of IMMUTABLE_PINS) {
    const value = reviewLanesPreservation(path, mastheadPreservation(path, cityBriefPreservation(path, purposeNavigationPreservation(path, read(path)))));
    assert.equal(sha(value),rawHash,path); assert.equal(sha(lf(value)),lfHash,path+" LF");
    assert.deepEqual(deskPreservation(path,value),value);
  }
  assert.throws(() => restoreMissionCommandDeskSource("Frontend/src/ui.tsx",read("Frontend/src/ui.tsx")));
  assert.throws(() => restoreMissionCommandDeskSuite("Tests/helpers/missionOwnerRetirement.mjs",read("Tests/helpers/missionOwnerRetirement.mjs")));
});

test("strict source inverse rejects partial, malformed, moved owners, outside edits and byte ambiguity", () => {
  const app = reviewLanesPreservation(SOURCE_PINS[0][0], mastheadPreservation(SOURCE_PINS[0][0], purposeNavigationPreservation(SOURCE_PINS[0][0], read(SOURCE_PINS[0][0])))).toString("utf8");
  const mission = read(SOURCE_PINS[1][0]).toString("utf8");
  const callback = "  const cancelMissionRouteFocus = useCallback(() => {\r\n    flushSync(() => setRouteFocusRequest(null));\r\n  }, []);\r\n\r\n";
  const negatives = [
    [SOURCE_PINS[0][0],app.replace(callback,"")],
    [SOURCE_PINS[0][0],app.replace(callback,callback+callback)],
    [SOURCE_PINS[0][0],app.replace(callback,"")+callback],
    [SOURCE_PINS[0][0],app.replace("onSectionNavigation={cancelMissionRouteFocus}","onSectionNavigation={announceStatus}")],
    [SOURCE_PINS[0][0],app.replace("  const consumeInitialDayScopeAction", "  const alteredInitialDayScopeAction")],
    [SOURCE_PINS[1][0],mission.replace('import { MissionCommandDesk } from "./missionCommandDesk";\r\n',"")],
    [SOURCE_PINS[1][0],mission.replace('headingId="mission-now-heading"','headingId="wrong-heading"')],
    [SOURCE_PINS[1][0],mission.replace("<MissionCommandDesk showPlans", "<OtherDesk showPlans")],
    [SOURCE_PINS[1][0],mission.replace("scope: string | undefined;", "scope: string;")],
  ];
  for (const [path,value] of negatives) assert.throws(() => restoreMissionCommandDeskSource(path,value));
  for (const [path] of SOURCE_PINS) {
    const actual = reviewLanesPreservation(path, mastheadPreservation(path, purposeNavigationPreservation(path, read(path)))).toString("utf8");
    for (const changed of ["\uFEFF"+actual, actual+"\r\n", actual.replace("\r\n","\n"),
      actual.replace("\r\n","\r"), actual.replace("import","im\0port"), actual+"// outside\r\n"])
      assert.throws(() => restoreMissionCommandDeskSource(path,changed));
  }
});

test("actual current JSX owns seven focusable headings, one wrapper, original child order and App callback wire", () => {
  const mission = parse(lf(read(SOURCE_PINS[1][0])),"MissionView.tsx");
  const headings = nodes(mission,(n) => named(n,"SectionHeading") && Boolean(attribute(n,"headingId")));
  assert.equal(headings.length,7);
  assert.deepEqual(headings.map((n) => attributeValue(n,"headingId")).sort(),
    [SECTIONS[0][0],...SECTIONS.map(([id]) => id)].sort());
  for (const heading of headings) {
    assert.equal(attributeValue(heading,"headingProps"),"{ tabIndex: -1 }");
    if (attribute(heading,"level")) assert.equal(attributeValue(heading,"level"),"3");
  }
  const wrappers = nodes(mission,(n) => ts.isJsxElement(n) && n.openingElement.tagName.getText() === "MissionCommandDesk");
  assert.equal(wrappers.length,1);
  const wrapper = wrappers[0];
  assert.equal(attributeValue(wrapper.openingElement,"showPlans"),"Boolean(mission && mission.plans.length > 0)");
  assert.equal(attributeValue(wrapper.openingElement,"onSectionNavigation"),"onSectionNavigation");
  const children = wrapper.children.filter((n) => !ts.isJsxText(n));
  assert.equal(children.length,6);
  assert.equal(children[0].tagName.getText(),"NowPanel");
  assert.match(children[1].expression.getText(),/^mission && mission\.plans\.length > 0 &&/);
  assert.equal(children[2].tagName.getText(),"ForecastPanel");
  for (let i=3;i<6;i++) assert.equal(children[i].openingElement.tagName.getText(),"Surface");
  const missionText = lf(read(SOURCE_PINS[1][0]));
  assert.ok(missionText.indexOf("Loading Mission") < wrapper.pos);
  assert.ok(missionText.indexOf("<AssignmentDialog",wrapper.end) > wrapper.end);
  assert.ok(missionText.includes('className="mx-auto min-w-0 max-w-[100rem] space-y-6 p-4 sm:p-6 lg:p-8"'));
  const app = parse(lf(read(SOURCE_PINS[0][0])),"App.tsx");
  const callback = nodes(app,(n) => ts.isVariableDeclaration(n) && n.name.getText() === "cancelMissionRouteFocus");
  assert.equal(callback.length,1);
  assert.equal(callback[0].initializer.getText(),"useCallback(() => {\n    flushSync(() => setRouteFocusRequest(null));\n  }, [])");
  const caller = nodes(app,(n) => named(n,"LazyMissionView"));
  assert.equal(caller.length,1);
  assert.equal(attributeValue(caller[0],"onSectionNavigation"),"cancelMissionRouteFocus");
  assert.equal(attributeValue(caller[0],"onStatus"),"announceStatus");
  const consume = nodes(app,(n) => ts.isVariableDeclaration(n) && n.name.getText() === "consumeInitialDayScopeAction");
  assert.ok(callback[0].pos < consume[0].pos);
});

test("current real Surface/ControlButton SSR keeps conditional 5/6 controls, child identity/order and safe text", () => {
  const runtime = instantiate({ HTMLElement:undefined, hasOverlayLease:() => false });
  assert.deepEqual(runtime.MISSION_SECTIONS.map((s) => [s.id,s.label]),SECTIONS);
  for (const showPlans of [false,true]) {
    const children = ["Now","Plans","Forecast","Verification","Evidence","Flight"].map((name,i) =>
      React.createElement("section",{key:name,"data-preserved-child":i},name+" <long> & \"scope\""));
    const tree = runtime.MissionCommandDesk({showPlans,children,onSectionNavigation:() => assert.fail("SSR must not navigate")});
    assert.equal(tree.props.children[1].props.children,children);
    const html = renderToStaticMarkup(tree);
    const rendered = renderElements(tree);
    const buttons = rendered.filter((n) => n.type === "button");
    const visible = SECTIONS.filter(([id]) => showPlans || id !== SECTIONS[1][0]);
    assert.equal(buttons.length,showPlans?6:5);
    assert.deepEqual(buttons.map((n) => [n.props["aria-controls"],n.props.children]),visible);
    for (const button of buttons) {
      assert.equal(button.props.type,"button"); assert.equal(typeof button.props.onClick,"function");
      assert.ok(button.props.className.includes("ui-control"));
      assert.ok(button.props.className.includes("mission-command-link"));
      assert.equal(button.props["aria-current"],undefined);
      assert.equal(button.props.role,undefined); assert.equal(button.props["aria-selected"],undefined);
    }
    assert.match(html,/aria-label="Mission sections"/);
    assert.match(html,/>Command desk<\/h3>/);
    assert.match(html,/Jump within the current Mission\./);
    assert.ok(!/<a\b|role="tab|hidden=|aria-hidden=|aria-current=/.test(html));
    assert.equal((html.match(/data-preserved-child=/g) ?? []).length,6);
    assert.ok(html.includes("Now &lt;long&gt; &amp; &quot;scope&quot;"));
    let last = -1;
    for (let i=0;i<6;i++) { const at=html.indexOf('data-preserved-child="'+i+'"'); assert.ok(at>last); last=at; }
  }
});

test("current selected-Now surface remains the direct owned marker with matching original 20/24px padding", () => {
  const runtime = instantiate({ HTMLElement:undefined, hasOverlayLease:() => false });
  const selected = React.createElement(runtime.Surface,{tone:"raised",className:"border-l-4 border-l-sky-400"},"Selected");
  const empty = React.createElement(runtime.Surface,{tone:"raised"},"No unique plan");
  for (const child of [selected,empty]) {
    const tree = runtime.MissionCommandDesk({showPlans:false,children:child});
    const html = renderToStaticMarkup(tree);
    assert.equal(tree.props.children[1].props.children,child);
    assert.equal((html.match(/border-l-4/g) ?? []).length,child===selected?1:0);
  }
  const html = read("Frontend/index.html").toString("utf8");
  const bodies = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
  const oldRules = [];
  for (const body of bodies) postcss.parse(body).walkRules((rule) => {
    if (rule.selector === "#root #main-content > div > .max-w-\\[100rem\\] > .ui-surface.border-l-4")
      oldRules.push([rule.parent.type==="atrule"?rule.parent.params:null,rule.nodes.filter((n) => n.type==="decl").map((d) => [d.prop,d.value])]);
  });
  assert.deepEqual(oldRules,[[null,[["padding","1.25rem"],["background","rgb(var(--ui-surface))"]]],
    ["(min-width: 768px)",[["padding","1.5rem"]]]]);
  assert.deepEqual(RULES[7][2],oldRules[0][1]);
  assert.deepEqual(RULES[8][2],oldRules[1][1]);
});

test("controlled current button handler passes exact heading/trigger and cancels once without history/API/state changes", () => {
  for (const [id] of SECTIONS) {
    const h=host(id); let calls=0;
    const tree=h.runtime.MissionCommandDesk({showPlans:true,children:[],onSectionNavigation:() => {calls+=1;}});
    const button=renderElements(tree).find((n) => n.type==="button" && n.props["aria-controls"]===id);
    button.props.onClick({currentTarget:h.trigger});
    assert.equal(calls,1); assert.deepEqual(h.target.focusCalls,[{preventScroll:true}]);
    assert.deepEqual(h.main.scrollWrites,[235]); assert.equal(h.document.activeElement,h.target);
    checkUnchanged(h);
  }
  const h=host();
  assert.equal(h.runtime.jumpToMissionSection(h.trigger,SECTIONS[0][0]),true);
  assert.deepEqual(h.main.scrollWrites,[235]); checkUnchanged(h);
});

test("controlled unknown/absent/duplicate/malformed headings and missing runtime ownership fail before cancellation", () => {
  const h=host(); let calls=0;
  assert.equal(h.runtime.jumpToMissionSection(h.trigger,"unknown",() => {calls+=1;}),false);
  assert.equal(h.runtime.jumpToMissionSection(h.trigger,SECTIONS[1][0],() => {calls+=1;}),false);
  assert.equal(calls,0); assert.equal(h.main.scrollWrites.length,0);
  const mutations=[
    (x) => { x.target.attached=false; },
    (x) => { new ControlledElement(x.document,"h3",x.body,{id:SECTIONS[0][0],tabindex:"-1"}); },
    (x) => { x.target.tagName="DIV"; }, (x) => { x.target.tagName="SVG"; },
    (x) => { x.target.removeAttribute("tabindex"); }, (x) => { x.target.setAttribute("tabindex","0"); },
    (x) => { x.document.defaultView=null; }, (x) => { x.desk.removeAttribute("data-mission-command-desk"); },
    (x) => { x.main.removeAttribute("data-app-scroll"); },
    (x) => { x.target.parentElement=new ControlledElement(x.document,"section",x.body); },
    (x) => { x.trigger.parentElement=new ControlledElement(x.document,"nav",x.body); },
    (x) => { x.target.ownerDocument={}; },
    (x) => { const other=new ControlledElement(x.document,"div",x.main,{"data-mission-command-desk":""}); x.target.parentElement=other; },
    (x) => { const other=new ControlledElement(x.document,"main",x.root,{"data-app-scroll":""}); x.target.parentElement=other; },
  ];
  for (const mutate of mutations) reject(mutate);
  const noHtml=instantiate({HTMLElement:undefined,hasOverlayLease:() => false});
  assert.equal(noHtml.jumpToMissionSection(h.trigger,SECTIONS[0][0]),false);
  assert.equal(h.runtime.jumpToMissionSection({},SECTIONS[0][0]),false);
});

test("controlled visibility, disabled ancestors, overlay lease and zero-lease inert gap reject every phase", () => {
  const mutations=[];
  for (const name of ["trigger","target","desk","main","root","body","html"]) {
    for (const attribute of ["inert","hidden"])
      mutations.push((h) => h[name].setAttribute(attribute));
    for (const attribute of ["aria-hidden","aria-disabled"])
      mutations.push((h) => h[name].setAttribute(attribute,"true"));
    for (const [property,value] of [["display","none"],["visibility","hidden"],["visibility","collapse"],["opacity","0"]])
      mutations.push((h) => {h[name].style[property]=value;});
  }
  mutations.push((h) => {h.environment.leased=true;});
  mutations.push((h) => {h.trigger.setAttribute("disabled");});
  mutations.push((h) => {h.section.tagName="FIELDSET"; h.section.setAttribute("disabled");});
  mutations.push((h) => {h.environment.leased=false; h.root.setAttribute("inert");});
  mutations.push((h) => {h.trigger.rects=false;},(h) => {h.target.rects=false;});
  for (const mutate of mutations) reject(mutate);
  for (const mutate of [(h) => {h.environment.leased=true;},(h) => {h.root.setAttribute("inert");},
    (h) => {h.root.style.opacity="0";},(h) => {h.trigger.setAttribute("disabled");}]) {
    reject(mutate,"callback"); reject(mutate,"focus");
  }
});

test("controlled all finite geometry, clamp extremes and nonfinite preconditions protect only the owned scroller", () => {
  for (const [top,expected] of [[-100,0],[240,235],[5000,1100]]) {
    const h=host(); h.target.bounds.top=top;
    assert.equal(h.runtime.jumpToMissionSection(h.trigger,SECTIONS[0][0]),true);
    assert.deepEqual(h.main.scrollWrites,[expected]); checkUnchanged(h);
  }
  const short=host(); short.main.scrollHeight=100;
  assert.equal(short.runtime.jumpToMissionSection(short.trigger,SECTIONS[0][0]),true);
  assert.deepEqual(short.main.scrollWrites,[0]);
  for (const key of ["top","right","bottom","left","width","height"])
    for (const owner of ["target","main"])
      for (const invalid of [NaN,Infinity,-Infinity]) reject((h) => {h[owner].bounds[key]=invalid;});
  for (const key of ["scrollHeight","clientHeight","clientTop"])
    for (const invalid of [NaN,Infinity,-Infinity]) reject((h) => {h.main[key]=invalid;});
  for (const invalid of [NaN,Infinity,-Infinity]) reject((h) => {h.main._scrollTop=invalid;});
  for (const [key,invalid] of [["clientHeight",0],["clientHeight",-1],["scrollHeight",-1],["clientTop",-1]])
    reject((h) => {h.main[key]=invalid;});
  for (const owner of ["trigger","target","desk","main"])
    for (const key of ["width","height"]) reject((h) => {h[owner].bounds[key]=0;});
});

test("controlled synchronous cancellation recomputes Back scaffold and focus-handler geometry, never stale geometry", () => {
  const h=host(); let calls=0;
  const result=h.runtime.jumpToMissionSection(h.trigger,SECTIONS[0][0],() => {
    calls+=1; h.main._scrollTop=70; h.main.bounds.top=30; h.main.clientTop=3;
    h.main.scrollHeight=700; h.target.bounds.top=180;
  });
  assert.equal(result,true); assert.equal(calls,1);
  assert.deepEqual(h.main.scrollWrites,[217]); checkUnchanged(h);
  const afterFocus=host();
  afterFocus.target.onFocus=() => {afterFocus.target.bounds.top=100; afterFocus.main._scrollTop=40;};
  assert.equal(afterFocus.runtime.jumpToMissionSection(afterFocus.trigger,SECTIONS[0][0]),true);
  assert.deepEqual(afterFocus.main.scrollWrites,[118]); checkUnchanged(afterFocus);
});

test("controlled callback and focus DOM replacement/steal/overlay/nonfinite failures never apply a stale scroll", () => {
  const mutations=[
    (h) => {h.target.attached=false;}, (h) => {h.trigger.attached=false;},
    (h) => {h.desk.attached=false;}, (h) => {h.main.attached=false;},
    (h) => {h.target.attached=false; new ControlledElement(h.document,"h3",h.section,{id:SECTIONS[0][0],tabindex:"-1"});},
    (h) => {const replacement=new ControlledElement(h.document,"div",h.main,{"data-mission-command-desk":""}); h.target.parentElement=replacement;},
    (h) => {const replacement=new ControlledElement(h.document,"main",h.root,{"data-app-scroll":""}); h.desk.parentElement=replacement;},
    (h) => {h.environment.leased=true;}, (h) => {h.root.setAttribute("inert");},
    (h) => {h.target.bounds.top=NaN;}, (h) => {h.main.scrollHeight=Infinity;},
    (h) => {h.target.setAttribute("tabindex","0");},
    (h) => {new ControlledElement(h.document,"h3",h.body,{id:SECTIONS[0][0],tabindex:"-1"});},
  ];
  for (const mutate of mutations) {reject(mutate,"callback"); reject(mutate,"focus");}
  reject((h) => {h.document.activeElement=h.trigger;},"focus");
  reject((h) => {h.document.activeElement=h.body;},"focus");
  const throwing=host();
  assert.equal(throwing.runtime.jumpToMissionSection(throwing.trigger,SECTIONS[0][0],() => {throw Error("controlled cancellation");}),false);
  assert.equal(throwing.main.scrollWrites.length,0); assert.equal(throwing.target.focusCalls.length,0);
  checkUnchanged(throwing);
});
