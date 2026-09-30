import assert from "node:assert/strict";
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
    const { DialogStatus, DialogLoadStatus } = await vite.ssrLoadModule(
      "/src/dialogStatus.tsx",
    );
    const render = (label, busy, error = "", count = null, truncated = false) =>
      renderToStaticMarkup(React.createElement(DialogLoadStatus, {
        label, busy, error, count, truncated,
      }));
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
      const truncated = render(label, false, "", 1500, true);
      for (const html of [loading, failed, retryPending, unknown, empty,
        singular, plural, truncated]) assertRegion(html);

      assert.ok(loading.includes(`Loading ${label.toLowerCase()}.`));
      assert.ok(retryPending.includes(`Loading ${label.toLowerCase()}.`));
      assert.doesNotMatch(retryPending, /Earlier failure|loaded:|Retry is available/);
      assert.match(failed, /Network failed Retry is available\./);
      assert.doesNotMatch(failed, /loaded:/);
      assert.match(unknown, />\s*<\/p>$/);
      assert.ok(empty.includes(`${label} loaded: 0 captured events.`));
      assert.ok(singular.includes(`${label} loaded: 1 captured event.`));
      assert.ok(plural.includes(`${label} loaded: 2 captured events.`));
      assert.ok(truncated.includes(
        `${label} loaded: 1500 captured events in the fetched window.`,
      ));
      assert.doesNotMatch(plural, /fetched window/);
    }

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
