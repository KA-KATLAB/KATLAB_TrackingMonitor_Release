import { deskPreservation } from "./helpers/changesReviewLanes.mjs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const frontend = resolve(root, "Frontend"), require = createRequire(resolve(frontend, "package.json"));
const ts = require("typescript"), postcss = require("postcss"), selectors = require("postcss-selector-parser");
const React = require("react"), { renderToStaticMarkup } = require("react-dom/server");
const read = name => readFileSync(resolve(root, name), "utf8");
const sha = value => createHash("sha256").update(value).digest("hex");
const lf = value => value.replace(/\r\n/g, "\n");
const source = read("Frontend/src/provenance.tsx");
const OLD_RAW = "ef39bd70c1501a5817689386199716b6019d532aa90b651c7ef94fd4c5ea41bc";
const OLD_LF = "a27faf5c88435eebe9830c93144c4685c4a50d2509bb48d112c02194e28722c0";
const NEW_RAW = "08b93a80b47deb4095c0b16e000b3c07ea6639ad448e8d0691ed5cbbad88d1fd";
const NEW_LF = "11a995770fd994720b02c22f761b8e3edf1ffb8cca33eeedf9a4c63cbe241f79";
const RETURN_SHA = "1d7dd4c96da57d9debdac5f3a1b574d752bf7d627ede680b63fa102ce217c4b6";
const CSS_SHA = "e9d61fb914e2813b4a20bcb37cd7b1d8604e2607c8cc46f475d4f7d041d6ef51";
const ANCHOR = 'import { SectionHeading, Surface } from "./ui";';
const IMPORT = 'import "./provenanceEvidenceDesk.css";';
const HEADER = "// Linked capture evidence over observed committed file changes, never authorship\n// or lines of code. Pure presentation; stats are already server-scoped.\n\n";
const COMMENT = "// Keep 0/100 for exact captured-slot cases; intermediate ratios round within 1..99.\n";
const OLD_HEADER = "// v0.2.11.0 D6 (A.3): the provenance ledger \u2014 what share of committed\n// file changes carries captured Claude events. The industry estimates this\n// number from commit metadata; the tracker COMPOSES it from ground truth,\n// so the card's job is to stay honest about what it is measuring: file\n// changes per commit, never lines of code (D7).\n// PURE presentational \u2014 no state, no timers, derives at render. The\n// percentage rule lives in the exported pctOf so it stays testable without\n// a DOM, and because 100/0 must be reserved for the exact cases (D6b).\n\n";
const OLD_COMMENT = '// NEVER A FALSE ABSOLUTE: 396/397 must not print "100%" while a\n// human-touched file exists, and 1/400 must not print "0%" while Claude\n// did touch something \u2014 the shipped flowState "never 0m" shape.\n';
// The old return is preservation data only. It is never transpiled or executed.
const OLD_RETURN = Buffer.from("ICByZXR1cm4gKAogICAgPFN1cmZhY2UgZGF0YS1yZXZlYWwgdG9uZT0icXVpZXQiPgogICAgICA8U2VjdGlvbkhlYWRpbmcgbGV2ZWw9ezR9IHRpdGxlPSJQcm92ZW5hbmNlIgogICAgICAgIGRlc2NyaXB0aW9uPXtzY29wZSA/PyAiQWxsIHJlcG9zIn0gLz4KICAgICAgPGRpdiBjbGFzc05hbWU9ImZsZXggbWluLXctMCBmbGV4LXdyYXAgaXRlbXMtYmFzZWxpbmUgZ2FwLTIiCiAgICAgICAgdGl0bGU9InNoYXJlIG9mIGNvbW1pdHRlZCBmaWxlIGNoYW5nZXMgKHBlciBjb21taXQsIHBlciBmaWxlKSB0aGF0IGNhcnJ5IGNhcHR1cmVkIENsYXVkZSBldmVudHMg4oCUIHNpbmNlIHRyYWNraW5nIGJlZ2FuOyBub3QgYSBsaW5lcy1vZi1jb2RlIG1lYXN1cmUiPgogICAgICAgIDxzcGFuIGNsYXNzTmFtZT0idWktbWV0cmljLXZhbHVlIj4KICAgICAgICAgIHtwY3RPZihzbG90c19haSwgc2xvdHNfdG90YWwpfSUKICAgICAgICA8L3NwYW4+CiAgICAgICAgPHNwYW4gY2xhc3NOYW1lPSJ0ZXh0LXhzIGZvbnQtc2VtaWJvbGQgdGV4dC11aS1tdXRlZCI+CiAgICAgICAgICBBSS10b3VjaGVkIGZpbGUgY2hhbmdlcwogICAgICAgIDwvc3Bhbj4KICAgICAgPC9kaXY+CiAgICAgIHsvKiB0aGUgYmFyIGtlZXBzIHRoZSBVTkNMQU1QRUQgcmF0aW8g4oCUIGdlb21ldHJ5IGlzIG5vdCBhIGNsYWltIOKAlAogICAgICAgICAgYnV0IHJvdW5kZWQgdG8gb25lIGRlY2ltYWwgc28gdGhlIERPTSBuZXZlciBjYXJyaWVzIGZsb2F0IG5vaXNlICovfQogICAgICA8ZGl2IGNsYXNzTmFtZT0ibXQtMS41IGgtMSByb3VuZGVkIGJnLXNsYXRlLTcwMCIgYXJpYS1oaWRkZW49InRydWUiPgogICAgICAgIDxkaXYgY2xhc3NOYW1lPSJoLTEgcm91bmRlZCIKICAgICAgICAgIHN0eWxlPXt7IHdpZHRoOiBgJHsoKHNsb3RzX2FpIC8gc2xvdHNfdG90YWwpICogMTAwKS50b0ZpeGVkKDEpfSVgLAogICAgICAgICAgICBiYWNrZ3JvdW5kQ29sb3I6IFRFQUwgfX0gLz4KICAgICAgPC9kaXY+CiAgICAgIDxwIGNsYXNzTmFtZT0ibXQtMiB0ZXh0LXhzIHRleHQtdWktbXV0ZWQiPgogICAgICAgIHtgJHtmbXQoc2xvdHNfYWkpfS8ke2ZtdChzbG90c190b3RhbCl9IGZpbGUgY2hhbmdlc2AgKwogICAgICAgICBgIMK3ICR7Zm10KGNvbW1pdHNfb2JzZXJ2ZWQpfSBjb21taXRgICsKICAgICAgICAgYCR7Y29tbWl0c19vYnNlcnZlZCA9PT0gMSA/ICIiIDogInMifSBzaW5jZSB0cmFja2luZyBiZWdhbmAgKwogICAgICAgICAoY29tbWl0c19wcmUgPiAwID8gYCDCtyAke2ZtdChjb21taXRzX3ByZSl9IGVhcmxpZXIgZXhjbHVkZWRgIDogIiIpfQogICAgICA8L3A+CiAgICAgIDxkaXYgY2xhc3NOYW1lPSJtdC0yIHNwYWNlLXktMSB0ZXh0LXhzIj4KICAgICAgICB7dG9wX2ZpbGVzLm1hcCgocm93KSA9PiAoCiAgICAgICAgICA8ZGl2IGtleT17SlNPTi5zdHJpbmdpZnkoW3Jvdy5yZXBvLCByb3cuZmlsZV0pfSBjbGFzc05hbWU9ImZsZXggbWluLXctMCBmbGV4LXdyYXAgaXRlbXMtY2VudGVyIGdhcC0yIHB5LTEiPgogICAgICAgICAgICB7LyogQUxMIHNjb3BlIHNob3dzIHRoZSByZXBvOiBib3RoIG1vbml0b3JlZCByZXBvcyBob2xkIGZpbGVzCiAgICAgICAgICAgICAgICB3aXRoIGlkZW50aWNhbCBiYXNlbmFtZXMgKFZlcnNpb25fTm90ZXMubWQpICovfQogICAgICAgICAgICB7c2NvcGUgPT09IHVuZGVmaW5lZCAmJiAoCiAgICAgICAgICAgICAgPHNwYW4gY2xhc3NOYW1lPSJtaW4tdy0wIGJyZWFrLWFsbCB0ZXh0LXhzIHRleHQtdWktbXV0ZWQiPntyb3cucmVwb308L3NwYW4+CiAgICAgICAgICAgICl9CiAgICAgICAgICAgIDxidXR0b24gdHlwZT0iYnV0dG9uIiBvbkNsaWNrPXsoKSA9PiBvbk9wZW5GaWxlU3Rvcnk/Lihyb3cucmVwbywgcm93LmZpbGUpfQogICAgICAgICAgICAgIGFyaWEtbGFiZWw9e2Ake3Jvdy5maWxlfSDigJQgb3BlbiBmaWxlIHN0b3J5YH0KICAgICAgICAgICAgICB0aXRsZT17YCR7cm93LmZpbGV9IOKAlCBvcGVuIGZpbGUgc3RvcnlgfQogICAgICAgICAgICAgIGNsYXNzTmFtZT0ibWluLXctMCBicmVhay1hbGwgZm9udC1tb25vIHRleHQtbGVmdCBob3Zlcjp0ZXh0LXNreS0zMDAgaG92ZXI6dW5kZXJsaW5lIGZvY3VzLXZpc2libGU6b3V0bGluZS1ub25lIGZvY3VzLXZpc2libGU6cmluZy0yIGZvY3VzLXZpc2libGU6cmluZy1za3ktNTAwIj4KICAgICAgICAgICAgICB7cm93LmZpbGUuc3BsaXQoIi8iKS5wb3AoKX0KICAgICAgICAgICAgPC9idXR0b24+CiAgICAgICAgICAgIDxzcGFuIGNsYXNzTmFtZT0ibWwtYXV0byBoLTEgdy0xNiBzaHJpbmstMCByb3VuZGVkIGJnLXNsYXRlLTcwMCIgYXJpYS1oaWRkZW49InRydWUiPgogICAgICAgICAgICAgIDxzcGFuIGNsYXNzTmFtZT0iYmxvY2sgaC0xIHJvdW5kZWQiCiAgICAgICAgICAgICAgICBzdHlsZT17eyB3aWR0aDogYCR7KChyb3cuYWlfY29tbWl0cyAvIHJvdy5jb21taXRzKSAqIDEwMCkudG9GaXhlZCgxKX0lYCwKICAgICAgICAgICAgICAgICAgYmFja2dyb3VuZENvbG9yOiBURUFMIH19IC8+CiAgICAgICAgICAgIDwvc3Bhbj4KICAgICAgICAgICAgPHNwYW4gY2xhc3NOYW1lPSJzaHJpbmstMCB0ZXh0LXhzIHRleHQtdWktbXV0ZWQiPgogICAgICAgICAgICAgIHtyb3cuYWlfY29tbWl0c30ve3Jvdy5jb21taXRzfQogICAgICAgICAgICA8L3NwYW4+CiAgICAgICAgICA8L2Rpdj4KICAgICAgICApKX0KICAgICAgPC9kaXY+CiAgICA8L1N1cmZhY2U+CiAgKTsKfQo=", "base64").toString("utf8");
const BASE = '.ui-surface[data-provenance-evidence="true"]';
const LAYOUT = BASE + " > .provenance-evidence-layout";
const MONO = '"Azeret Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
// Complete independent reviewed literal, not an ignored-plan or mutable-source oracle.
const CSS = [
  "/* Captured evidence presentation; attribution, scope and file-story owners stay. */",
  LAYOUT + " {", "  display: grid;", "  grid-template-columns: minmax(0, 1fr);", "  gap: 16px;", "}",
  LAYOUT + " > div {", "  min-width: 0;", "  padding: 16px;", "  border: 1px solid rgb(var(--ui-border));", "  border-radius: 8px;", "  background-color: rgb(var(--ui-surface));", "}",
  BASE + " .provenance-evidence-label {", "  margin: 0 0 8px;", "  font-size: 16px;", "  line-height: 24px;", "  font-weight: 600;", "  overflow-wrap: anywhere;", "}",
  BASE + " .provenance-evidence-value {", "  min-width: 0;", "  font-family: " + MONO + ";", "  font-size: 32px;", "  line-height: 40px;", "  font-variant-numeric: tabular-nums;", "  overflow-wrap: anywhere;", "}",
  BASE + " .provenance-evidence-copy {", "  margin: 12px 0 0;", "  font-size: 14px;", "  line-height: 21px;", "  color: rgb(var(--ui-text-muted));", "  overflow-wrap: anywhere;", "}",
  BASE + " .provenance-evidence-files {", "  margin: 12px 0 0;", "  padding: 0;", "  list-style: none;", "}",
  BASE + " .provenance-evidence-files > li {", "  min-width: 0;", "  padding: 12px 0;", "  border-top: 1px solid rgb(var(--ui-border));", "}",
  BASE + " .provenance-evidence-file {", "  display: flex;", "  width: 100%;", "  min-width: 0;", "  min-height: 44px;", "  justify-content: flex-start;", "  padding: 8px 12px;", "  font-family: " + MONO + ";", "  font-size: 16px;", "  line-height: 24px;", "  text-align: left;", "  overflow-wrap: anywhere;", "  word-break: normal;", "}",
  BASE + " .provenance-evidence-row-meta {", "  display: flex;", "  min-width: 0;", "  flex-wrap: wrap;", "  align-items: center;", "  gap: 8px;", "  margin: 8px 0 0;", "  font-size: 12px;", "  line-height: 18px;", "  color: rgb(var(--ui-text-muted));", "  font-variant-numeric: tabular-nums;", "  overflow-wrap: anywhere;", "}",
  BASE + " .provenance-evidence-row-meta > span:last-child {", "  margin-left: auto;", "}",
  "@media (min-width: 1024px) {", "  " + LAYOUT + " {", "    grid-template-columns: minmax(0, 0.7fr) minmax(0, 1.3fr);", "    align-items: start;", "  }", "}", "",
].join("\n");
const RULES = [
  [LAYOUT, [["display", "grid"], ["grid-template-columns", "minmax(0, 1fr)"], ["gap", "16px"]]],
  [LAYOUT + " > div", [["min-width", "0"], ["padding", "16px"], ["border", "1px solid rgb(var(--ui-border))"], ["border-radius", "8px"], ["background-color", "rgb(var(--ui-surface))"]]],
  [BASE + " .provenance-evidence-label", [["margin", "0 0 8px"], ["font-size", "16px"], ["line-height", "24px"], ["font-weight", "600"], ["overflow-wrap", "anywhere"]]],
  [BASE + " .provenance-evidence-value", [["min-width", "0"], ["font-family", MONO], ["font-size", "32px"], ["line-height", "40px"], ["font-variant-numeric", "tabular-nums"], ["overflow-wrap", "anywhere"]]],
  [BASE + " .provenance-evidence-copy", [["margin", "12px 0 0"], ["font-size", "14px"], ["line-height", "21px"], ["color", "rgb(var(--ui-text-muted))"], ["overflow-wrap", "anywhere"]]],
  [BASE + " .provenance-evidence-files", [["margin", "12px 0 0"], ["padding", "0"], ["list-style", "none"]]],
  [BASE + " .provenance-evidence-files > li", [["min-width", "0"], ["padding", "12px 0"], ["border-top", "1px solid rgb(var(--ui-border))"]]],
  [BASE + " .provenance-evidence-file", [["display", "flex"], ["width", "100%"], ["min-width", "0"], ["min-height", "44px"], ["justify-content", "flex-start"], ["padding", "8px 12px"], ["font-family", MONO], ["font-size", "16px"], ["line-height", "24px"], ["text-align", "left"], ["overflow-wrap", "anywhere"], ["word-break", "normal"]]],
  [BASE + " .provenance-evidence-row-meta", [["display", "flex"], ["min-width", "0"], ["flex-wrap", "wrap"], ["align-items", "center"], ["gap", "8px"], ["margin", "8px 0 0"], ["font-size", "12px"], ["line-height", "18px"], ["color", "rgb(var(--ui-text-muted))"], ["font-variant-numeric", "tabular-nums"], ["overflow-wrap", "anywhere"]]],
  [BASE + " .provenance-evidence-row-meta > span:last-child", [["margin-left", "auto"]]],
  [LAYOUT, [["grid-template-columns", "minmax(0, 0.7fr) minmax(0, 1.3fr)"], ["align-items", "start"]]],
];
const PINS = [
  ["Frontend/src/App.tsx","945c8879e94b5d7a8410d2a143ed2e127e2653dd1a123d2d8b4cd306758a6f3e","c7c568b346c7ddf00d86b93325b97854e59f3f625f6fd916b056e85ccf069b1a"],
  ["Frontend/src/OverviewView.tsx","98f77fe8a3f97033f5a2084439f8da6dcb203547d7b1f8409aca11892598d214","9d42a6c52828018f6bb0ab7f3f668e0040e0a190de144517715460f93b84410a"],
  ["Frontend/src/ui.tsx","b5650b9e2a3529ff1ca033ed077d7b806f0cc9341c9733b4b3a52c107ab99974","e1c2ad05398cf771ee17ba576b7feecf03829459379b9e02e35c58aea5004c46"],
  ["Frontend/src/calendarDay.ts","033b0720f32521d8fd2549923955867523749f28532505e43b53f2177f45dd7e","401d957f4312819b1beeb3ff0e9e5810dc18cdf38f6a0799013d63be3e7511bb"],
  ["Frontend/src/charts.ts","121d9c4ff6d9a1d6befa7b19d19f2eecb44820f08728e922b9c3a8d630dfca1b","2c9291d1dbe47863d5ecad800ef5427ad855ec257e19b28ebc7220a2dfe29a53"],
  ["Frontend/src/format.ts","4c7f1cb040c38a5ef75787c6f7325db6fc162a6890df0fb693e916aa62d8c87f","4c7f1cb040c38a5ef75787c6f7325db6fc162a6890df0fb693e916aa62d8c87f"],
  ["Frontend/src/index.css","9371bc04cba0b62e8a8e5e3b4a9251deea9273be58f4b9735982e0649527ba81","788436e9def1e7109fe98d4bfa5e0add49a5f0ca301b17416279c03f18ede0f5"],
  ["Frontend/tailwind.config.js","cdb058b068e26db24bcce71d68939611bc4ce651d1bfbaa49907dbb8ffa5ed76","cdb058b068e26db24bcce71d68939611bc4ce651d1bfbaa49907dbb8ffa5ed76"],
  ["Frontend/src/theme.ts","7c39c4ea3bf479216edc7776fac113f0d05bfeaba3d411ca8ba1ea1fc2ba6022","03ed88e814b0a12af207f462819731127f2346def58af01259ccc36c0556b286"],
  ["Frontend/src/reveal.ts","f6e88e85bd5690333845443786f3ee6b7e51eafd2773e510b2296f750ffc65df","f6e88e85bd5690333845443786f3ee6b7e51eafd2773e510b2296f750ffc65df"],
  ["Frontend/src/planBoard.tsx","1e3a6a74fc5c6ef038fde019e98afd2b5951cd0a75830d86e98acac52dfa0170","ab494423ca66233ed6848392976b05a5d52ecb3797722477da921e133a651288"],
  ["Frontend/src/activePlanGallery.css","12a7163ac9b28d2a251f9011889287f70b72f7aa1bc78624f587f24692100242","12a7163ac9b28d2a251f9011889287f70b72f7aa1bc78624f587f24692100242"],
  ["Frontend/src/chronicleView.tsx","3130fff181f79401e7c90d486a48ba7a91a63c9dab80eaff990a587470aa75c5","0ec47d759e070a566b13f868bcf10775fc89dfe478cda5eddd731d0f1550856b"],
  ["Frontend/src/chronicleProbe.ts","46251107af8daacc252c0db78df9f5c7212748b13f43e7f22fc98683cfca842a","278de3c0b6aae473e4ee2bfc4e1853883190f0594af208e584f22b001ce56379"],
  ["Scripts/Chronicle/pages.py","b44afb03c5af17b083e17ad5e0b24b1d827e66f32ead3b47db147685a0da2858","451b0a4b356e5ce46b4403b396146cd9debce50492b2e6a3de708f619982c06a"],
  ["Scripts/Chronicle/generate.py","84bad82cae964d66a14a874fa79b27b6548a3c19b11f2e730ee444c4f61534e9","06afd185980b9dcebbd165a7f82a73e19f2271a6728754d0af6ac2bb1ba9879d"],
  ["Scripts/Chronicle/runtime.py","2e1bd56435c2e52c0681d320a5d8b23405c7575b1d1296748b2af796f9bbbbfd","78fe39b021cb775a23b96cd3da8ea514f3fd2973052a6f415a8d89f0e5b5e372"],
  ["Scripts/Chronicle/safe_io.py","d34c8103c65af65c0c611df40f762677684a4a20765b8b75e24fa1a0a6fb6b42","9ac8271967447a23579741640fe0c7e86d36243547dcddbeb6bca16f8a7c3d17"],
  ["Scripts/lifecycle_process.py","7a7f41651599b273e2dbc7f8015dd1725beac08fa7a8e68a5b48e7a9a28e196e","308127c79d45d301e1139afc9564dba77e2b02e4f447f3e9e6c1106c54d247f9"],
  ["Scripts/start_tracking_monitor.bat","d88189b035a848b983e1854f19ad7ed89dfb6ae45d6cd1a1af37fb93c4dbfac5","358bf7feb9190463d4058740b7fd129918167b7d6440496362fb1d613fc211fa"],
  ["Scripts/stop_tracking_monitor.bat","eca8ee2f14de0c1c2b8a982bd96ecedf562926a3cb19e0d5207f83f7de0f5855","774c0eff439ff5d2a148b2db615a29707f6630a2e850e7ec0ae7dab0199d58fc"],
  ["Scripts/restart_tracking_monitor.bat","78e6a37f5bda6cb32da031556e6ae3d378fda2af6aa066b893dbc93ff0072c7b","97c199fb4eb68fbde1367d417e5bc4e9dd70ee4e6e2839e848a0898837e85ecc"],
  ["Scripts/frontend_build.py","34dbacbec4b5a72507754c165af7e7edf12a067dbfe1dde9f7d3578f3172c8a9","a45da02e604be582eb03429d94b33825d19190db52070e9138bff33458b07437"],
  ["Tests/test_weekly_snapshot.mjs","f478220eb7aaaabd68ede3dd97ad171a18221baaa1c38c8258a292110d2eeac3","4e665761fd114cd3d59717217558b850aaede8772e59ec6c0fbe3c8604b61b57"],
  ["Tests/test_mode_badge.mjs","2f05975fa87ad3aa862190e4b76a6e2d00c07f4e5d55493ec22eee58cf8fd135","085d216299ec4be30d5ae9fc9ad972984318a5aa155fbf2452864665ea9fa3ec"],
  ["Tests/test_read_surfaces.mjs","264aefcfbc7ff84d37c449c6c6817e8c1b86e5aa189d0e87075e897f25fc7cfa","b270f7191446f0281040d53625e43603c25c566e5b67cc283d78914113d9574c"],
  ["Tests/test_overview_hierarchy.mjs","faf3b593f97021df8509f896c28adcecfb15e5438221bb9f87f6a0cdd95bc238","d1adb0cb04dec60045173f4c47334b00b71519018bd4bee835125f5fcf1c9840"],
  ["Tests/test_overview_operations_deck.mjs","4c4b2fb8ed83321a1c696e99b102b3611a5f81902967b070a934cd43126421b9","4c4b2fb8ed83321a1c696e99b102b3611a5f81902967b070a934cd43126421b9"],
  ["Tests/test_active_plan_gallery.mjs","ffd3c9b18d1ad35ba7dd2875af404ab4ac9638e935c1027d9b5bf1f83ccbf260","ffd3c9b18d1ad35ba7dd2875af404ab4ac9638e935c1027d9b5bf1f83ccbf260"],
  ["Tests/test_chronicle_reader_canvas.mjs","d3f108fc0358a4de6ba1e51dd34deefebf9fd27a9fa696daf59c91d40b1d040b","d3f108fc0358a4de6ba1e51dd34deefebf9fd27a9fa696daf59c91d40b1d040b"],
  ["Tests/test_app_version.mjs","d86fa77843bdf4f552fc7e97bec8f5ecea839f98080451325bef4cd81674d6c3","c5cc037e582d0ff5066d959b76ccb804e58c452cfcb1f92c23a0fba8786b15f5"],
  ["Tests/test_repository_scope_picker.mjs","e895bdbd48be23b8cd43d4bb2d864b66689a8da45ee3a976c974a11bdd1c8a3d","e895bdbd48be23b8cd43d4bb2d864b66689a8da45ee3a976c974a11bdd1c8a3d"],
  ["Tests/test_workspace_command_frame.mjs","c46140e06176cc3781d8e1acf17c5e9eee11989524e6341a3d15d0f810e7c247","c46140e06176cc3781d8e1acf17c5e9eee11989524e6341a3d15d0f810e7c247"],
  ["Tests/test_history_commit_ledger.mjs","66944cd059bc1714d10aa377a5c372c7f47213a21acd7952ad14e75e476a8e75","66944cd059bc1714d10aa377a5c372c7f47213a21acd7952ad14e75e476a8e75"],
  ["Tests/test_system_snapshot_panels.mjs","2d84f20f7194de62d0656b7220a37c367c37696a33a6a12d673bce0c55c25a65","2d84f20f7194de62d0656b7220a37c367c37696a33a6a12d673bce0c55c25a65"],
  ["Frontend/package.json","b131be7e90ba2500b01371e594e10c482b94cf651ab425ddf7efaea76b759b9d","541a787d69fa512a53de01b53240e2e94ac22f068da882e0c2496f68ee5bf1a1"],
  ["Frontend/package-lock.json","0c39bf19779991e4565e00845a061fc954afdfe988d9026c6c356957e2b02258","d5ccfda11d2d07b4a707b18aca87b866a135182a3bd33ce2380c21730809ce75"],
  ["Frontend/tsconfig.json","97997252d286ecf7a8a4b12a51ac2fdd9199f3b9bf5e14e8d4f7d4e5e60d3f3f","97997252d286ecf7a8a4b12a51ac2fdd9199f3b9bf5e14e8d4f7d4e5e60d3f3f"],
  ["Frontend/vite.config.ts","6f25836874cc3ca4c97781dd0140ab1e7fee796b3b0c67a67ffdb8600e67cd6b","4631f5c7380fa909b5b361bf8eb7fdac29a665144ca260f9ac30be30ce83f107"],
  ["Backend/requirements.txt","f750d19859ca5621eea836592d2038857f73e8857bcace96752ce6dadf004ea3","f24979c56dd6d095f18541462485fb62229cfddf0fa8784d7c7dd9fbb535d0b5"],
  ["Scripts/Chronicle/requirements.txt","9d91436f670aac600f39beb184f7278774dc94e470dfca37f092bb0e3d461722","562f66ed699de7d73e464c6be1a0938b6b19a8c2f69fe4b955209f0981986a2d"],
  ["Frontend/src/pet.tsx","cdf154c1c90b210af04e9fa8ab35678477d4f699b700f0958402041ebf2cdf3a","ea035d48a1ab80921d9921d0914be887d2c629ece925c0363f8205445b487236"],
  ["Frontend/src/momentum.tsx","030a2eb4148a1be39c57254dbe112d0f9571514fd6ac45f41adf4db372d2b0a3","a38e9ca14e0061b29c0a4f8238c550a18a8b9dd94d0b98650d8b86bd625c7c29"],
  ["Frontend/src/momentumComparison.css","19905b16379674a292331f43dbdc280573c7270c90453409b1a53655aebc8941","19905b16379674a292331f43dbdc280573c7270c90453409b1a53655aebc8941"],
  ["Tests/test_year_snapshot.mjs","89c3369c6ffebde5d574671a8cf630b5d916f9ba6462d0262280ca4037936777","bbd59afcf70e5cebcd546282b512f649028fdb0ce3ef665429f23fb23c7ade97"],
  ["Tests/test_momentum_comparison_deck.mjs","e7ea2bc5ced58860057a87c37b62756b4f018dcd4d703d0efaf1ae3c2a5ef5d9","e7ea2bc5ced58860057a87c37b62756b4f018dcd4d703d0efaf1ae3c2a5ef5d9"],
  ["Frontend/src/records.tsx","d9c3244f4d6ec9344bee7c7d6b39b3993cb19bef800c9d2440e8fda0e7f70793","b84ed071b07eef185bccedd51f8a0132b36d5f15a6309405fc181d04db55ed5f"],
  ["Frontend/src/personalRecordsDeck.css","15fc5cced9dda9e1c491dd9df02574d61a7ea2650a80bb05817a8d554eb3b8fd","15fc5cced9dda9e1c491dd9df02574d61a7ea2650a80bb05817a8d554eb3b8fd"],
  ["Tests/test_personal_records_showcase.mjs","7c02d2daffa142b1a38722a18ff6067ac7739af2325237df5eaf28fbe070d537","7c02d2daffa142b1a38722a18ff6067ac7739af2325237df5eaf28fbe070d537"],
  ["Frontend/src/trophies.tsx","6d41ba0d47831baa86d77c48fa4d24f463e4caf2ba5607c539f9f418614b0f5f","45e9f9014eba7ace3a08dafb4cf89456bef3d39c1f83dcc2cf1bff4df92edd59"],
  ["Frontend/src/achievementGallery.css","82abe46e5b2576a2d2846ae8601d28a892f545421d114b4b5ac38129bd9d3245","82abe46e5b2576a2d2846ae8601d28a892f545421d114b4b5ac38129bd9d3245"],
  ["Tests/test_achievement_gallery.mjs","566b91ea834d43735f01aab2817f6129c10496d1d2772fcd8151d0652739458c","566b91ea834d43735f01aab2817f6129c10496d1d2772fcd8151d0652739458c"],
  ["Tests/test_operational_views.mjs","1dc324f2fba75698b916ce4f840adf97c3abddf78bf0d6b618b994f3baaef816","0ffce73f13e7731b0ce18bf563a3273facf3aab4bfc027ab921f04cc5736c2b3"],
  ["Backend/app/db.py","283527eb00d24dcac0b1832650499cf189412aeedaf7d868966db7eae2a72989","6bd92fdffef9c01a7bd175ffded05b2e57cfd7824b8f83c1494496331babd033"],
  ["Backend/app/api/routes.py","4dcde41c291adbec3c63a519c09f2c54e2525bc3f81c07d107f8dc8407e097cd","936e31ed1a8bd223c29339e53f5de87b95a5948651e962d19bb9e8833adf62d9"],
  ["Backend/app/watcher.py","559b1a090cf5a4c0861692aa42666328bac88945723edda15d64aabd93c4f84c","14e03e8862571dc8fea25a9da1ffbf0148f79e4c7fb390aee0881f3232633a85"],
  ["Hook/provider_adapters.py","070eda4bacefad648495089f46ba934aeee93da8c8c51e7027c643d01e5edbef","070eda4bacefad648495089f46ba934aeee93da8c8c51e7027c643d01e5edbef"],
];

function ending (value) {
  assert.ok(!value.startsWith("\uFEFF") && !value.includes("\0"), "no BOM/NUL");
  assert.ok(!value.replace(/\r\n/g, "").includes("\r"), "no bare CR");
  const eol = value.includes("\r\n") ? "\r\n" : "\n";
  if (eol === "\r\n") assert.ok(!value.replace(/\r\n/g, "").includes("\n"), "uniform CRLF");
  assert.ok(value.endsWith(eol) && !value.endsWith(eol + eol), "single final newline");
  return eol;
}
function unique (value, literal) {
  assert.equal(value.split(literal).length - 1, 1, literal);
}
function descendants (node, predicate) {
  const found = [];
  const visit = item => { if (predicate(item)) found.push(item); ts.forEachChild(item, visit); };
  visit(node);
  return found;
}
function inverse (raw) {
  const eol = ending(raw), text = lf(raw);
  const file = ts.createSourceFile("provenance.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  assert.equal(file.parseDiagnostics.length, 0, "current module parses");
  assert.ok(text.startsWith(HEADER)); unique(text, HEADER); unique(text, COMMENT); unique(text, IMPORT);
  const imports = file.statements.filter(ts.isImportDeclaration);
  assert.equal(imports.length, 3);
  assert.equal(imports[1].getText(file), ANCHOR);
  assert.equal(imports[2].getText(file), IMPORT);
  assert.equal(imports[2].importClause, undefined);
  assert.ok(text.includes(ANCHOR + "\n" + IMPORT + "\n"));
  const functions = file.statements.filter(ts.isFunctionDeclaration);
  assert.deepEqual(functions.map(node => node.name.text), ["pctOf", "ProvenanceCard"]);
  assert.ok(text.includes(COMMENT + "export function pctOf"));
  const card = functions[1], returned = card.body.statements.at(-1);
  assert.ok(ts.isReturnStatement(returned) && ts.isParenthesizedExpression(returned.expression));
  const element = returned.expression.expression;
  assert.ok(ts.isJsxElement(element)); assert.equal(element.openingElement.tagName.getText(file), "Surface");
  assert.equal(element.openingElement.getText(file), '<Surface data-reveal tone="quiet" data-provenance-evidence="true">');
  const markers = descendants(file, node => ts.isJsxAttribute(node) && node.name.getText(file) === "data-provenance-evidence");
  assert.equal(markers.length, 1); assert.equal(markers[0].parent.parent, element.openingElement);
  const start = text.lastIndexOf("\n", returned.getStart(file)) + 1;
  assert.equal(sha(text.slice(start)), RETURN_SHA, "complete owned return window");
  assert.equal(card.end, text.length - 1, "final current function owns return to EOF");
  let restored = text.slice(0, start) + OLD_RETURN;
  restored = restored.replace(COMMENT, OLD_COMMENT).replace(IMPORT + "\n", "");
  restored = OLD_HEADER + restored.slice(HEADER.length);
  return eol === "\r\n" ? restored.replace(/\n/g, "\r\n") : restored;
}
function approved (raw) {
  const eol = ending(raw);
  assert.equal(sha(lf(raw)), NEW_LF);
  assert.equal(sha(raw), eol === "\r\n" ? NEW_RAW : NEW_LF);
  const original = inverse(raw);
  assert.equal(sha(lf(original)), OLD_LF);
  assert.equal(sha(original), eol === "\r\n" ? OLD_RAW : OLD_LF);
}
function validateCss (text) {
  assert.equal(ending(text), "\n", "CSS is LF");
  const ast = postcss.parse(text);
  assert.equal(ast.nodes.length, 12);
  assert.equal(ast.nodes[0].type, "comment");
  assert.equal(ast.nodes[0].text, "Captured evidence presentation; attribution, scope and file-story owners stay.");
  const media = ast.nodes[11];
  assert.equal(media.type, "atrule"); assert.equal(media.name, "media"); assert.equal(media.params, "(min-width: 1024px)");
  assert.equal(media.nodes.length, 1); assert.equal(media.nodes[0].type, "rule");
  const nodes = [...ast.nodes.slice(1, 11), media.nodes[0]];
  for (const [index, rule] of nodes.entries()) {
    assert.equal(rule.type, "rule"); assert.equal(rule.selector, RULES[index][0]);
    const selector = selectors().astSync(rule.selector);
    assert.equal(selector.nodes.length, 1); assert.ok(rule.selector.startsWith(BASE));
    assert.ok(rule.nodes.every(node => node.type === "decl"));
    assert.deepEqual(rule.nodes.map(node => [node.prop, node.value, Boolean(node.important)]), RULES[index][1].map(([key, value]) => [key, value, false]));
  }
  assert.equal(text, CSS); assert.equal(sha(text), CSS_SHA);
}
const children = node => React.Children.toArray(node?.props?.children).filter(React.isValidElement);
const walk = node => React.isValidElement(node) ? [node, ...children(node).flatMap(walk)] : [];
const named = (tree, className) => walk(tree).filter(node => node.props.className === className);
const freeze = value => { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const escape = text => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
const snapshot = overrides => freeze({ commits_observed: 1, commits_pre: 0, slots_total: 1, slots_ai: 1, top_files: [], ...overrides });

test("complete scoped CSS has exact bytes, selectors, contexts, declarations and mono", () => {
  assert.equal(Buffer.byteLength(CSS), 2540); assert.equal(CSS.split("\n").length - 1, 81);
  validateCss(read("Frontend/src/provenanceEvidenceDesk.css"));
  assert.equal(require("tailwindcss/defaultTheme").fontFamily.mono.join(", "), MONO.slice('"Azeret Mono", '.length));
});
test("CSS oracle rejects structural, global, value, priority and physical mutations", () => {
  const bad = [CSS + "body { color: red; }\n", CSS.replace("  gap: 16px;", ""), CSS.replace("  gap: 16px;", "  gap: 16px;\n  gap: 16px;"),
    CSS.replace(LAYOUT + " {", LAYOUT + ", body {"), CSS.replace(BASE, "body"), CSS.replace("  gap: 16px;", "  gap: 16px !important;"),
    CSS.replace("  display: grid;", "  display: flex;"), CSS.replace("  min-height: 44px;", "  height: 44px;"), CSS.replace("  gap: 16px;", "  animation: escape 1s;"),
    CSS.replace("  display: grid;", '  background: url("https://example.invalid/a");'), CSS.replace("  gap: 16px;", "  @supports (display: grid) { body { color: red; } }"),
    CSS.replace("  gap: 16px;", "  /* hidden child */"), CSS.replace("@media (min-width: 1024px)", "@media (min-width: 640px)"),
    CSS.replace("@media (min-width: 1024px) {", "@media (min-width: 1024px) {\n  @font-face { font-family: escape; }"),
    CSS.replace("@media (min-width: 1024px) {", "@media (min-width: 1024px) {\n  color: red;"),
    CSS.replace("@media (min-width: 1024px) {", "@media (min-width: 1024px) {\n  @supports (display: grid) { body { color: red; } }"),
    "@import './else.css';\n" + CSS, CSS.replace("  padding: 16px;", "  padding: 16px"), "\uFEFF" + CSS, CSS + "\0", CSS.slice(0, -1), CSS + "\n", CSS.replace(/\n/g, "\r\n"), CSS.replace("\n", "\r"), CSS.replace("\n", "\r\n")];
  for (const [index, value] of bad.entries()) assert.throws(() => validateCss(value), "CSS fixture " + index);
});
test("four owned windows restore complete original RAW/LF bytes without execution", () => {
  assert.equal(sha(OLD_RETURN), "b17f3622b2130179de2d7bbff78a20f4b17afdad2390d61ea6d1594a1eaffa80");
  assert.equal(Buffer.byteLength(source), 4830); approved(source); approved(lf(source)); approved(lf(source).replace(/\n/g, "\r\n"));
});
test("actual TS AST owns ordered list, pair key, callback branch and full path", () => {
  approved(source);
  const file = ts.createSourceFile("provenance.tsx", lf(source), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const card = file.statements.find(node => ts.isFunctionDeclaration(node) && node.name.text === "ProvenanceCard");
  const elements = descendants(card, ts.isJsxElement);
  const ol = elements.filter(node => node.openingElement.tagName.getText(file) === "ol"); assert.equal(ol.length, 1);
  assert.equal(ol[0].openingElement.getText(file), '<ol className="provenance-evidence-files"\n              aria-label="Most frequently committed files since tracking began">');
  const li = elements.filter(node => node.openingElement.tagName.getText(file) === "li"); assert.equal(li.length, 1);
  assert.equal(li[0].openingElement.getText(file), '<li key={JSON.stringify([row.repo, row.file])}>');
  const branches = descendants(card, ts.isConditionalExpression).filter(node => node.condition.getText(file) === "onOpenFileStory"); assert.equal(branches.length, 2);
  const branch = branches.find(node => ts.isParenthesizedExpression(node.whenTrue)); assert.ok(branch);
  const button = branch.whenTrue.expression, path = branch.whenFalse.expression;
  assert.equal(button.openingElement.tagName.getText(file), "button"); assert.equal(path.openingElement.tagName.getText(file), "span");
  assert.ok(button.openingElement.getText(file).includes('onClick={() => onOpenFileStory(row.repo, row.file)}'));
  assert.equal(button.children.find(ts.isJsxExpression).expression.getText(file), "row.file");
  assert.equal(path.children.find(ts.isJsxExpression).expression.getText(file), "row.file");
  assert.equal(descendants(card, node => ts.isCallExpression(node) && node.expression.getText(file) === "top_files.map").length, 1);
  assert.equal(descendants(card, node => ts.isCallExpression(node) && /top_files\.(sort|slice|filter)/.test(node.expression.getText(file))).length, 0);
});
test("source inverse rejects incomplete, nested, moved, duplicated and physical mutations", () => {
  const text = lf(source), tag = '<Surface data-reveal tone="quiet" data-provenance-evidence="true">';
  const bad = [text.replace(IMPORT + "\n", ""), text.replace(IMPORT, IMPORT + "\n" + IMPORT), text.replace(IMPORT + "\n", "") + IMPORT + "\n",
    text.replace(IMPORT, "// " + IMPORT), text.replace(IMPORT, 'import desk from "./provenanceEvidenceDesk.css";'), text.replace(IMPORT, "function nested () { " + IMPORT + " }"),
    text.replace(HEADER, HEADER.trimEnd() + "\n"), text.replace(COMMENT, "// wrong percentage explanation\n"), text.replace(COMMENT, COMMENT + COMMENT),
    text.replace(tag, '<Surface data-reveal tone="quiet">'), text.replace(tag, tag + tag), text.replace(tag, "<div>" + tag).replace("    </Surface>", "    </Surface></div>"),
    text.replace("export function ProvenanceCard", "export function OtherOwner"), text.replace("Most frequently committed files since tracking began", "Wrong list name"),
    text.replace("      <div className=\"provenance-evidence-layout\">", "      {/* " + tag + " */}<div className=\"provenance-evidence-layout\">"),
    text.replace("  return (\n", "  if (slots_ai > 0) { return (\n").replace("  );\n}", "  ); }\n}"), text.slice(0, -4), "\uFEFF" + text, text + "\0", text.slice(0, -1), text + "\n", text.replace("\n", "\r"), text.replace("\n", "\r\n")];
  for (const [index, value] of bad.entries()) assert.throws(() => inverse(value), "source fixture " + index);
});
test("valid outside-window edits survive inverse and fail complete original/result pins", () => {
  for (const mutation of [text => text.replace('const TEAL = "#14b8a6";', 'const TEAL = "#112233";'), text => text.replace("if (slots_total === 0)", "if (slots_total === 1)"), text => text.replace("Math.min(99,", "Math.min(98,")]) {
    for (const eol of ["\n", "\r\n"]) {
      const changed = mutation(lf(source)).replace(/\n/g, eol), restored = inverse(changed);
      assert.notEqual(sha(lf(restored)), OLD_LF); assert.ok(restored.includes(eol));
      assert.throws(() => approved(changed));
      assert.equal(restored.includes("#112233"), changed.includes("#112233"));
      assert.equal(restored.includes("slots_total === 1"), changed.includes("slots_total === 1"));
      assert.equal(restored.includes("Math.min(98,"), changed.includes("Math.min(98,"));
    }
  }
});
test("coupled current owners, old suites and six dependencies preserve whole RAW/LF", () => {
  assert.equal(PINS.length, 57); assert.equal(new Set(PINS.map(([name]) => name)).size, PINS.length);
  for (const [name, raw, normalized] of PINS) {
    const value = deskPreservation(name, read(name)); assert.equal(sha(value), raw, name + " RAW"); assert.equal(sha(lf(value)), normalized, name + " LF");
    assert.equal(sha(lf(value).replace(/\n/g, "\r\n").replace(/\r\n/g, "\n")), normalized, name + " CRLF round trip");
  }
});
test("current-module SSR, real shared owners, ratios, scopes, paths and callbacks", async () => {
  approved(source); validateCss(read("Frontend/src/provenanceEvidenceDesk.css"));
  const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
  const server = await createServer({ root: frontend, server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom", optimizeDeps: { noDiscovery: true, entries: [] } });
  try {
    const { ProvenanceCard, pctOf } = await server.ssrLoadModule("/src/provenance.tsx");
    const { Surface, SectionHeading } = await server.ssrLoadModule("/src/ui.tsx");
    for (const [ai, total, expected] of [[396,397,99],[1,400,1],[0,12,0],[12,12,100],[13,12,100],[-1,12,0],[4,0,0],[4,-1,0],[1,2,50],[1,200,1],[199,200,99],[1,3,33],[2,3,67]]) assert.equal(pctOf(ai, total), expected);
    for (let total = 1; total <= 401; total++) for (let ai = 0; ai <= total; ai++) {
      const expected = ai === 0 ? 0 : ai === total ? 100 : Math.max(1, Math.min(99, Math.round((ai / total) * 100)));
      assert.equal(pctOf(ai, total), expected); if (ai > 0 && ai < total) assert.ok(pctOf(ai, total) > 0 && pctOf(ai, total) < 100);
    }
    const zero = snapshot({ slots_total: 0, slots_ai: 0 });
    for (const scope of [undefined, "EA_Dev", ""]) assert.equal(ProvenanceCard({ provenance: zero, scope }), null);
    const retained = snapshot({ slots_total: 397, slots_ai: 396, commits_observed: 1234, commits_pre: 5 });
    const before = JSON.stringify(retained), emptyTree = ProvenanceCard({ provenance: retained, scope: undefined });
    assert.equal(emptyTree.type, Surface); assert.equal(emptyTree.props["data-provenance-evidence"], "true"); assert.equal(emptyTree.props["data-reveal"], true); assert.equal(emptyTree.props.tone, "quiet");
    const heading = children(emptyTree)[0]; assert.equal(heading.type, SectionHeading); assert.equal(heading.props.level, 4); assert.equal(heading.props.title, "Provenance"); assert.equal(heading.props.description, "All repos");
    const emptyHtml = renderToStaticMarkup(emptyTree);
    assert.match(emptyHtml, /<h4[^>]*>Provenance<\/h4>/); assert.match(emptyHtml, /ui-surface ui-surface-quiet/); assert.match(emptyHtml, /99%/);
    assert.match(emptyHtml, /396\/397 file changes \u00b7 1,234 commits since tracking began \u00b7 5 earlier excluded/);
    assert.ok(emptyHtml.includes("No ranked file rows in this snapshot.")); assert.ok(!emptyHtml.includes("<ol") && !emptyHtml.includes("<button"));
    assert.ok(emptyHtml.includes("Linked captured edit evidence, not AI authorship or lines of code.")); assert.ok(emptyHtml.includes("Unlinked changes do not prove human-only work."));
    assert.equal(JSON.stringify(retained), before); assert.equal(renderToStaticMarkup(ProvenanceCard({ provenance: retained, scope: undefined })), emptyHtml, "retained presentation is deterministic");
    for (const [ai, total, displayed, width] of [[0,1,"0%","0.0%"],[1,1,"100%","100.0%"],[1,400,"1%","0.3%"],[396,397,"99%","99.7%"],[1250,2500,"50%","50.0%"]]) {
      const data = snapshot({ slots_ai: ai, slots_total: total }); const tree = ProvenanceCard({ provenance: data, scope: "EA_Dev" });
      assert.ok(renderToStaticMarkup(tree).includes(displayed)); const bars = walk(tree).filter(node => node.props.style?.width);
      assert.deepEqual(bars.map(node => node.props.style), [{ width, backgroundColor: "#14b8a6" }]);
      assert.ok(renderToStaticMarkup(tree).includes("1 commit since tracking began")); assert.ok(!renderToStaticMarkup(tree).includes("earlier excluded"));
    }
    const longRepo = '<repo>"&' + "r".repeat(260), longPath = 'nested/<folder>/file"&.ts' + "x".repeat(260);
    const rows = freeze([
      { repo: "UM_Dev", file: "z/shared.ts", commits: 17, ai_commits: 3 },
      { repo: "EA_Dev", file: "a/shared.ts", commits: 17, ai_commits: 17 },
      { repo: "UM_Dev", file: "a/shared.ts", commits: 15, ai_commits: 0 },
      { repo: longRepo, file: longPath, commits: 13, ai_commits: 1 },
      { repo: "EA_Dev", file: "4.ts", commits: 10, ai_commits: 5 },
      { repo: "EA_Dev", file: "5.ts", commits: 9, ai_commits: 9 },
      { repo: "UM_Dev", file: "6.ts", commits: 7, ai_commits: 2 },
      { repo: "EA_Dev", file: "7.ts", commits: 1, ai_commits: 1 },
    ]);
    const data = snapshot({ top_files: rows, slots_total: 400, slots_ai: 1 }), original = JSON.stringify(data);
    for (const scope of [undefined, "EA_Dev", ""]) for (const actionable of [false, true]) {
      const calls = [], onOpenFileStory = actionable ? (...args) => calls.push(args) : undefined;
      const tree = ProvenanceCard({ provenance: data, scope, onOpenFileStory }), all = walk(tree), list = all.find(node => node.type === "ol"), renderedRows = children(list);
      assert.equal(list.props["aria-label"], "Most frequently committed files since tracking began"); assert.equal(renderedRows.length, 8);
      // Raw child keys are inspected before React.Children.toArray prefixes them.
      assert.deepEqual(list.props.children.map(node => node.key), rows.map(row => JSON.stringify([row.repo, row.file])));
      assert.equal(new Set(list.props.children.map(node => node.key)).size, 8);
      assert.equal(children(tree)[0].props.description, scope ?? "All repos");
      assert.equal(named(tree, "provenance-evidence-layout").length, 1); assert.equal(children(named(tree, "provenance-evidence-layout")[0]).length, 2);
      const paths = named(tree, actionable ? "ui-control provenance-evidence-file" : "provenance-evidence-file");
      assert.deepEqual(paths.map(node => node.props.children), rows.map(row => row.file));
      for (const [index, rowTree] of renderedRows.entries()) {
        const row = rows[index], path = paths[index], meta = named(rowTree, "provenance-evidence-row-meta")[0], metaNodes = children(meta);
        assert.equal(metaNodes.length, scope === undefined ? 3 : 2);
        if (scope === undefined) assert.equal(metaNodes[0].props.children, row.repo);
        const meter = metaNodes.at(-2); assert.equal(meter.props["aria-hidden"], "true");
        assert.deepEqual(children(meter)[0].props.style, { width: ((row.ai_commits / row.commits) * 100).toFixed(1) + "%", backgroundColor: "#14b8a6" });
        assert.deepEqual(metaNodes.at(-1).props.children, [row.ai_commits, "/", row.commits, " linked commits"]);
        assert.equal(path.type, actionable ? "button" : "span");
        if (actionable) {
          assert.equal(path.props.type, "button"); assert.equal(path.props["aria-label"], row.repo + ": " + row.file + " \u2014 open file story"); assert.equal(path.props.title, path.props["aria-label"]);
          assert.equal(children(path).length, 0, "no nested interactive element"); path.props.onClick();
        } else assert.ok(!("onClick" in path.props) && !("aria-label" in path.props) && !("tabIndex" in path.props));
      }
      assert.deepEqual(calls, actionable ? rows.map(row => [row.repo, row.file]) : []);
      const html = renderToStaticMarkup(tree); assert.ok(html.includes(escape(longPath))); assert.ok(!html.includes(longPath));
      assert.equal(html.includes("Open a path to inspect its File Story."), actionable); assert.equal((html.match(/<button/g) ?? []).length, actionable ? 8 : 0);
      if (scope === undefined || actionable) assert.ok(html.includes(escape(longRepo)));
      assert.equal(JSON.stringify(data), original); assert.equal(renderToStaticMarkup(ProvenanceCard({ provenance: data, scope, onOpenFileStory })), html);
    }
  } finally { await server.close(); }
});
