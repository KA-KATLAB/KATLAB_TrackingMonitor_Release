import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildIdentityPlugin } from "../Frontend/buildIdentity.mjs";
import { readBuildVersion } from "../Frontend/buildVersion.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const frontendRoot = join(root, "Frontend");
const require = createRequire(join(frontendRoot, "package.json"));
const { build, createServer, resolveConfig } = await import(pathToFileURL(require.resolve("vite")).href);

test("identity plugin rejects non-canonical or injected version values", () => {
  for (const version of [null, 1, {}, "", "v1.2.3.4", "1.2.3", "1.2.3.4\n", "１.2.3.4", '<img src=x>']) {
    assert.throws(() => buildIdentityPlugin(version), /four-part/);
  }
  assert.equal(buildIdentityPlugin("12.34.56.789").apply, "build");
});

test("actual repository config uses the same canonical value for UI code and HTML", async () => {
  const config = await resolveConfig({ root: frontendRoot, logLevel: "silent" }, "build", "production");
  const version = readBuildVersion();
  assert.equal(config.define.__KATLAB_UI_VERSION__, JSON.stringify(version));
  const plugins = config.plugins.filter(plugin => plugin.name === "katlab-build-identity");
  assert.equal(plugins.length, 1);
  const [tag] = plugins[0].transformIndexHtml.handler();
  assert.deepEqual(tag, { tag: "meta", attrs: { name: "katlab-ui-version", content: version }, injectTo: "head" });
  const source = readFileSync(join(frontendRoot, "vite.config.ts"), "utf8");
  assert.equal(source.match(/readBuildVersion\(\)/g)?.length, 1);
});

test("actual Vite build stamps only isolated output and preserves CSS, Fonts and root", { timeout: 30_000 }, async () => {
  const scratch = mkdtempSync(join(tmpdir(), "katlab-ui-identity-"));
  const fixture = join(scratch, "source");
  const output = join(scratch, "output");
  const version = readBuildVersion();
  mkdirSync(fixture);
  const html = '<!doctype html><html><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Example">' +
    '</head><body><div id="root"></div><script type="module" src="/main.js"></script></body></html>';
  writeFileSync(join(fixture, "index.html"), html);
  writeFileSync(join(fixture, "main.js"), 'import "./main.css"; globalThis.katlabIdentity = __KATLAB_UI_VERSION__;');
  writeFileSync(join(fixture, "main.css"), 'body { color: #123456; }');
  try {
    await build({ root: fixture, configFile: false, envFile: false, logLevel: "silent",
      plugins: [buildIdentityPlugin(version)], define: { __KATLAB_UI_VERSION__: JSON.stringify(version) },
      build: { outDir: output, emptyOutDir: true } });
    const built = readFileSync(join(output, "index.html"), "utf8");
    assert.equal(built.match(/name="katlab-ui-version"/g)?.length, 1);
    assert.match(built, new RegExp(`<head>[\\s\\S]*<meta name="katlab-ui-version" content="${version.replaceAll(".", "\\.")}">[\\s\\S]*</head>`));
    assert.ok(built.includes('id="root"'));
    assert.ok(built.includes("https://fonts.googleapis.com/css2?family=Example"));
    assert.match(built, /<script type="module"[^>]*src="\/assets\/[^"/]+\.js"/);
    assert.match(built, /<link rel="stylesheet"[^>]*href="\/assets\/[^"/]+\.css"/);
    const scripts = readdirSync(join(output, "assets")).filter(name => name.endsWith(".js"));
    assert.equal(scripts.length, 1);
    assert.ok(readFileSync(join(output, "assets", scripts[0]), "utf8").includes(version));
    assert.equal(readFileSync(join(fixture, "index.html"), "utf8"), html);
    assert.ok(!readdirSync(fixture).includes("dist"));

    const server = await createServer({ root: fixture, configFile: false, envFile: false, logLevel: "silent",
      plugins: [buildIdentityPlugin(version)], server: { middlewareMode: true, hmr: false, ws: false },
      appType: "custom", optimizeDeps: { noDiscovery: true, entries: [] } });
    try {
      assert.ok(!server.config.plugins.some(plugin => plugin.name === "katlab-build-identity"));
      assert.doesNotMatch(await server.transformIndexHtml("/", html), /katlab-ui-version/);
    } finally { await server.close(); }
  } finally { rmSync(scratch, { recursive: true, force: true }); }
});
