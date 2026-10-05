import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseBuildVersion, readBuildVersion } from "../Frontend/buildVersion.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const frontendRoot = resolve(root, "Frontend");
const require = createRequire(resolve(frontendRoot, "package.json"));

test("build version is read as one validated Python declaration, never as executable code", () => {
  assert.equal(parseBuildVersion('__version__ = "0.4.0.0"\n'), "0.4.0.0");
  assert.equal(parseBuildVersion("\uFEFF# Header\r\n__version__ = '12.34.56.789' # comment\r\n"), "12.34.56.789");
  for (const source of [
    "", '# __version__ = "0.4.0.0"', '__version__ = "0.4.0"',
    '__version__ = "v0.4.0.0"', '__version__ = "0.4.0.0 "',
    '__version__ = "0.4.0.0"\n__version__ = "0.4.0.1"',
    '__version__ = "0.4.0.0"\n__version__: str = "0.4.0.1"',
    '__version__ = compute_version()', '__version__ = "0.4.0.0"; do_work()',
    '__version__ = "0.4.0.0"\nif True: __version__ = "0.4.0.1"',
    'import example\n__version__ = "0.4.0.0"',
    '__version__ = "0.4.0.0"\nexec("anything")',
    '"""unclosed\n__version__ = "0.4.0.0"',
    '__version__ = "0.4.0.0"\n"""trailing docstring"""',
    '# invalid null\0\n__version__ = "0.4.0.0"',
    '  __version__ = "0.4.0.0"', '__version__: str = "0.4.0.0"',
    '__version__ = "0.4.0.0\'',
  ]) assert.throws(() => parseBuildVersion(source), /__version__|four-part/);
  assert.throws(() => readBuildVersion(resolve(root, "temp", "absent-version-fixture.py")),
    error => /canonical KATLAB UI build version/.test(error.message) && error.cause?.code === "ENOENT");
  const actual = readFileSync(resolve(root, "Backend/app/version.py"), "utf8");
  assert.equal(readBuildVersion(), parseBuildVersion(actual));
  assert.equal(parseBuildVersion('"""Plain\nmodule documentation."""\n# Comment\n__version__ = "0.4.0.0"'), "0.4.0.0");
});

test("actual brand and System rendering distinguish UI build, known server version and unavailable version", {
  timeout: 30_000,
}, async (t) => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
  const vite = await createServer({ root: frontendRoot,
    server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom",
    optimizeDeps: { noDiscovery: true, entries: [] } });
  try {
    const { UI_BUILD_VERSION, decodeAppVersion } = await vite.ssrLoadModule("/src/appVersion.ts");
    const { ApplicationBrand } = await vite.ssrLoadModule("/src/ApplicationBrand.tsx");
    const { HealthSnapshotContent, HealthButton } = await vite.ssrLoadModule("/src/healthPanel.tsx");
    const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));
    const version = readBuildVersion();
    assert.equal(UI_BUILD_VERSION, version);

    await t.test("header version has an explicit shared System action without network work", () => {
      let opens = 0;
      const onSystem = () => opens++;
      const element = ApplicationBrand({ onSystem });
      const badge = element.props.children[1];
      assert.equal(badge.props.onClick, onSystem);
      badge.props.onClick();
      assert.equal(opens, 1);
      const html = render(ApplicationBrand, { onSystem });
      assert.ok(html.includes("KATLAB Tracking Monitor"));
      assert.ok(html.includes(`UI build v${version}. Open System health`));
      assert.ok(html.includes(`v${version}</button>`));
      assert.ok(render(HealthButton, { onClick: onSystem }).includes(">System</button>"));
      const brandSource = readFileSync(resolve(frontendRoot, "src/ApplicationBrand.tsx"), "utf8");
      assert.doesNotMatch(brandSource, /fetch\(|api\.|useEffect|setInterval|setTimeout/);
    });

    await t.test("invalid server values are Unknown in both System render paths", () => {
      const invalid = [undefined, null, 123, {}, [], ["0.4.0.0"], "0.4.0", "v0.4.0.0",
        "0.4.0.0\n", " 0.4.0.0", "<script>"];
      for (const value of invalid) assert.equal(decodeAppVersion(value), null);
      assert.equal(decodeAppVersion("0.4.0.0"), "0.4.0.0");
      for (const serverVersion of invalid) {
        for (const extensions of [false, true]) {
          const data = {
            server: { version: serverVersion, started_ts: "2026-10-01T00:00:00Z",
              db_bytes: 0, watchers_alive: 1, watchers_total: 1, hook_registered: false,
              hook_settings_path: "" }, repos: [],
            ...(extensions ? { activity: { pending: 0, rejected: 0, ignored_unscoped: 0,
              registry_revision_mismatch: 0 }, providers: [], chronicle: { state: "running" } } : {}),
          };
          const html = render(HealthSnapshotContent, { snapshot: {
            data, receivedAt: "2026-10-01T00:05:00Z" }, error: "", busy: false, onRefresh() {} });
          assert.ok(html.includes("Unknown"));
          assert.ok(html.includes(version));
          assert.doesNotMatch(html, /UI build and server versions differ|<script>/);
          if (!extensions) assert.ok(html.includes("Server version Unknown did not provide"));
        }
      }
    });

    await t.test("build is visible without health and mismatch is based only on accepted snapshots", () => {
      const base = { server: { version, started_ts: "2026-10-01T00:00:00Z", db_bytes: 0,
        watchers_alive: 1, watchers_total: 1, hook_registered: false, hook_settings_path: "" },
        repos: [], activity: { pending: 0, rejected: 0, ignored_unscoped: 0,
          registry_revision_mismatch: 0 }, providers: [], chronicle: { state: "running" } };
      const accepted = { data: base, receivedAt: "2026-10-01T00:05:00Z" };
      const different = { ...accepted, data: { ...base, server: { ...base.server, version: "99.98.97.96" } } };
      for (const props of [
        { snapshot: null, busy: true, error: "" },
        { snapshot: null, busy: false, error: "System unavailable" },
        { snapshot: accepted, busy: false, error: "" },
        { snapshot: accepted, busy: true, error: "" },
        { snapshot: accepted, busy: false, error: "Refresh failed" },
      ]) {
        const html = render(HealthSnapshotContent, { ...props, onRefresh() {} });
        assert.ok(html.includes("UI build"));
        assert.ok(html.includes(version));
        assert.doesNotMatch(html, /UI build and server versions differ/);
      }
      const html = render(HealthSnapshotContent, { snapshot: different, busy: false, error: "", onRefresh() {} });
      assert.ok(html.includes("UI build and server versions differ"));
      assert.ok(html.includes("99.98.97.96"));
      assert.ok(html.includes("Received locally:"));
    });
  } finally { await vite.close(); }
});
