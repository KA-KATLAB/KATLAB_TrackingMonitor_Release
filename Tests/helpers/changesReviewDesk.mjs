import assert from "node:assert/strict";
import { createHash } from "node:crypto";

// A preservation-only adapter. Historical HTML is never executed.
const sha = text => createHash("sha256").update(text).digest("hex");
const CURRENT = "f8381b7e989a4cc38987c847182713517de6f524aa49efa5794a34b298b11ad3";
const ORIGINAL = "f222d0bd4dd81f03905ee4a5288e0afe059e69ccf1de7dffc18bd1052542c2e6";
const CSS = String.raw`/* Changes Review Desk: captured-work hierarchy; existing behavior stays. */
#root #main-content > div > .changes-workbench > .changes-command-deck {
  padding: 1.25rem;
  border: 1px solid rgb(var(--ui-border));
  border-radius: 8px;
  background: rgb(var(--ui-surface));
}
#root #main-content > div > .changes-workbench > .changes-command-deck > .changes-command-metric {
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
}
#root #main-content > div > .changes-workbench[data-has-picks="true"] > .changes-command-deck > .changes-command-metric-action {
  padding-left: 1rem;
  border-left: 3px solid rgb(var(--ui-warning));
}
#root #main-content > div > .changes-workbench > .changes-command-deck > .changes-command-metric > dt {
  font-size: 0.875rem;
  line-height: 1.25rem;
}
#root #main-content > div > .changes-workbench > .changes-command-deck > .changes-command-metric > dd {
  font-size: 2.25rem;
  line-height: 1.25;
}
#root #main-content > div > .changes-workbench > section[aria-label="Grouped uncommitted changes"] > .ui-section-heading {
  margin-bottom: 1.25rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid rgb(var(--ui-border));
}
#root #main-content > div > .changes-workbench > section[aria-label="Grouped uncommitted changes"] .ui-work-list {
  padding: 1.25rem;
  border-radius: 8px;
  background: rgb(var(--ui-surface));
}
#root #main-content > div > .changes-workbench > section[aria-label="Grouped uncommitted changes"] .ui-work-list > div.mt-4 > .ui-work-row {
  padding-left: 0;
  padding-right: 0;
}
#root #main-content > div > .changes-workbench > section[aria-label="Grouped uncommitted changes"] .ui-work-list[data-reveal] > p {
  margin-top: 0.5rem;
  font-size: 0.875rem;
  line-height: 1.5;
}
`;
const WINDOW = '    <style id="katlab-changes-review-desk">\n'
  + CSS.split("\n").slice(0, -1).map(line => "      " + line + "\n").join("")
  + "    </style>\n";
const TITLE = "    <title>KATLAB Tracking Monitor</title>\n";

export function restoreChangesReviewDeskHtml (text) {
  assert.equal(typeof text, "string", "UTF8 text required");
  assert.equal(Buffer.from(text, "utf8").toString("utf8"), text, "valid Unicode");
  assert.ok(!text.startsWith("\uFEFF") && !text.includes("\0"), "no BOM or NUL");
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const rest = text.replace(/\r\n/g, "");
  assert.ok(!rest.includes("\r") && (eol === "\n" || !rest.includes("\n")), "uniform LF or CRLF");
  const normalized = text.replace(/\r\n/g, "\n");
  assert.ok(normalized.endsWith("\n") && !normalized.endsWith("\n\n"), "single EOF");
  assert.doesNotMatch(normalized, /[\t ]+$/m, "no trailing whitespace");
  assert.equal(normalized.split(WINDOW).length - 1, 1, "one complete literal window");
  assert.equal(normalized.split(TITLE).length - 1, 1, "one unchanged title owner");
  assert.equal((normalized.match(/<style\b/g) ?? []).length, 2, "only two styles");
  assert.equal((normalized.match(/<\/style>/g) ?? []).length, 2, "two closed styles");
  const start = normalized.indexOf(WINDOW), head = normalized.indexOf("<head>");
  assert.ok(head >= 0 && start > head && start < normalized.indexOf("</head>"), "direct head site");
  assert.ok(normalized.slice(0, start).endsWith("    </style>\n"), "immediately after prior style");
  assert.ok(normalized.slice(start + WINDOW.length).startsWith(TITLE), "immediately before title");
  assert.equal(sha(normalized), CURRENT, "complete current HTML identity");
  const restored = normalized.replace(WINDOW, "");
  assert.equal(sha(restored), ORIGINAL, "complete original HTML identity");
  return eol === "\r\n" ? restored.replace(/\n/g, "\r\n") : restored;
}
