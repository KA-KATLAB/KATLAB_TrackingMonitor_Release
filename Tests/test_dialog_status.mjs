import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const frontendRequire = createRequire(resolve(root, "Frontend/package.json"));

test("dialog load status is local, polite, atomic, stable, and honest", {
  timeout: 30_000,
}, async () => {
  const React = frontendRequire("react");
  const { renderToStaticMarkup } = frontendRequire("react-dom/server");
  const { createServer } = await import(pathToFileURL(frontendRequire.resolve("vite")).href);
  const vite = await createServer({
    root: resolve(root, "Frontend"),
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
    optimizeDeps: { noDiscovery: true, entries: [] },
  });
  try {
    const { DialogStatus, DialogLoadStatus, EventWindowNotice } = await vite.ssrLoadModule(
      "/src/dialogStatus.tsx",
    );
    const render = (label, busy, error = "", count = null, limitReached = false) =>
      renderToStaticMarkup(React.createElement(DialogLoadStatus, {
        label, busy, error, count, limitReached,
      }));
    const renderNotice = (limitReached, count) => renderToStaticMarkup(
      React.createElement(EventWindowNotice, { limitReached, count }),
    );
    const assertRegion = (html) => {
      assert.equal((html.match(/role="status"/g) ?? []).length, 1);
      assert.match(html, /^<p role="status" aria-live="polite" aria-atomic="true" class="sr-only">/);
      assert.doesNotMatch(html, /aria-busy/);
    };

    for (const label of ["File story", "Session timeline"]) {
      const loading = render(label, true);
      const failed = render(label, false, "Network failed", 2);
      const retryPending = render(label, true, "Earlier failure", 2);
      const unknown = render(label, false);
      const empty = render(label, false, "", 0);
      const singular = render(label, false, "", 1);
      const plural = render(label, false, "", 2);
      const belowCap = render(label, false, "", 1499, false);
      // Exactly 1500 and 1501 server rows expose the same accepted window.
      const exactCap = render(label, false, "", 1500, true);
      const beyondCap = render(label, false, "", 1500, true);
      for (const html of [loading, failed, retryPending, unknown, empty,
        singular, plural, belowCap, exactCap, beyondCap]) assertRegion(html);

      assert.ok(loading.includes(`Loading ${label.toLowerCase()}.`));
      assert.ok(retryPending.includes(`Loading ${label.toLowerCase()}.`));
      assert.doesNotMatch(retryPending, /Earlier failure|loaded:|Retry is available/);
      assert.match(failed, /Network failed Retry is available\./);
      assert.doesNotMatch(failed, /loaded:/);
      assert.match(unknown, />\s*<\/p>$/);
      assert.ok(empty.includes(`${label} loaded: 0 captured events.`));
      assert.ok(singular.includes(`${label} loaded: 1 captured event.`));
      assert.ok(plural.includes(`${label} loaded: 2 captured events.`));
      assert.ok(belowCap.includes(`${label} loaded: 1499 captured events.`));
      assert.ok(exactCap.includes(
        `${label} loaded: 1500 captured events in the fetched window. More may exist.`,
      ));
      assert.equal(exactCap, beyondCap);
      assert.doesNotMatch(belowCap, /More may exist|fetched window/);
      assert.doesNotMatch(plural, /fetched window/);
      assert.doesNotMatch(exactCap, /had more|Truncated|newest/i);

      const busyAtCap = render(label, true, "", 1500, true);
      const errorAtCap = render(label, false, "Network failed", 1500, true);
      assertRegion(busyAtCap);
      assertRegion(errorAtCap);
      assert.doesNotMatch(busyAtCap, /loaded:|More may exist/);
      assert.doesNotMatch(errorAtCap, /loaded:|More may exist/);
    }

    assert.equal(renderNotice(false, 1499), "");
    const capNote = renderNotice(true, 1500);
    assert.match(capNote, /^<p class="[^"]*break-words[^"]*">/);
    assert.match(capNote, /Fetched-window limit reached: showing 1,500 captured events\. More may exist\./);
    assert.doesNotMatch(capNote, /role="status"|aria-live|sr-only|had more|Truncated/i);
    assert.equal(capNote, renderNotice(true, 1500));
    const combined = render("File story", false, "", 1500, true) + capNote;
    assert.equal((combined.match(/role="status"/g) ?? []).length, 1);

    const unsafe = render("File story", false, "<img src=x onerror=alert(1)>");
    assertRegion(unsafe);
    assert.match(unsafe, /&lt;img src=x onerror=alert\(1\)&gt;/);
    assert.doesNotMatch(unsafe, /<img/);
    const shared = renderToStaticMarkup(React.createElement(DialogStatus, null, "Ready"));
    assertRegion(shared);
    assert.match(shared, />Ready<\/p>$/);
  } finally {
    await vite.close();
  }
});

test("dialog consumers statically retain the three-page cap and shared notice wiring", () => {
  // Source wiring only: this does not exercise browser requests or dialog effects.
  for (const name of ["FileStory", "SessionTimeline"]) {
    const source = readFileSync(resolve(root, `Frontend/src/${name}.tsx`), "utf8");
    assert.match(source, /import \{ DialogLoadStatus, EventWindowNotice \} from "\.\/dialogStatus";/);
    assert.match(source, /const API_PAGE = 500;/);
    assert.match(source, /const MAX_PAGES = 3;/);
    assert.match(source, /for \(let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex\+\+\)/);
    assert.match(source, /if \(pageIndex === MAX_PAGES - 1 && alive\) setLimitReached\(true\);/);
    assert.match(source, /count=\{rows\?\.length \?\? null\} limitReached=\{limitReached\}/);
    assert.match(source, /\{rows && <EventWindowNotice limitReached=\{limitReached\} count=\{rows\.length\} \/>\}/);
    assert.doesNotMatch(source, /\btruncated\b/);
  }
});
