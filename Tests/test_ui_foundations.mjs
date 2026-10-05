import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const frontendRoot = resolve(root, "Frontend");
const frontendRequire = createRequire(resolve(frontendRoot, "package.json"));
const css = readFileSync(resolve(frontendRoot, "src/index.css"), "utf8");
const uiSource = readFileSync(resolve(frontendRoot, "src/ui.tsx"), "utf8");
const attribute = (html, name) => html.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] ?? null;

test("workbench primitives preserve semantics, forwarding and explicit visual roles", { timeout: 30_000 }, async (t) => {
  const React = frontendRequire("react");
  const { renderToStaticMarkup } = frontendRequire("react-dom/server");
  const { createServer } = await import(pathToFileURL(frontendRequire.resolve("vite")).href);
  const vite = await createServer({ root: frontendRoot,
    server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom",
    optimizeDeps: { noDiscovery: true, entries: [] } });
  try {
    const { Surface, SectionHeading, ControlButton } = await vite.ssrLoadModule("/src/ui.tsx");
    const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));
    await t.test("surface tones retain ref, native attributes and children without leaking tone", () => {
      const ref = React.createRef(), onClick = () => {}, child = React.createElement("span", null, "Content");
      for (const tone of [undefined, "default", "quiet", "raised"]) {
        const props = { tone, className: "local-layout", "aria-label": "Evidence", onClick, children: child };
        const element = Surface.render(props, ref);
        assert.equal(element.ref, ref); assert.equal(element.props.onClick, onClick);
        assert.equal(element.props.children, child);
        const html = render(Surface, props);
        assert.equal(attribute(html, "tone"), null);
        assert.equal(attribute(html, "aria-label"), "Evidence");
        assert.match(attribute(html, "class"), /ui-surface\b.*local-layout/);
        if (tone === "quiet" || tone === "raised") assert.ok(html.includes(`ui-surface-${tone}`));
      }
    });
    await t.test("heading size does not alter hierarchy, focus target or accessible identity", () => {
      for (const level of [2, 3, 4]) {
        for (const kind of [undefined, "page", "section", "panel"]) {
          const html = render(SectionHeading, { title: "Work & evidence", description: "Supporting facts",
            level, kind, headingId: "work-heading", headingProps: { tabIndex: -1, "data-view-heading": true },
            actions: React.createElement("button", { type: "button" }, "Refresh") });
          const heading = html.match(new RegExp(`<h${level}[^>]*>`))?.[0];
          assert.ok(heading); assert.equal(attribute(heading, "id"), "work-heading");
          assert.equal(attribute(heading, "tabindex"), "-1");
          assert.equal(attribute(heading, "data-view-heading"), "true");
          assert.match(heading, new RegExp(`ui-${kind ?? "page"}-title`));
          assert.equal(attribute(html, "kind"), null); assert.equal(attribute(html, "level"), null);
          assert.ok(html.includes("Work &amp; evidence")); assert.ok(html.includes("ui-toolbar"));
          assert.ok(html.includes("Supporting facts"));
        }
      }
      assert.ok(render(SectionHeading, { title: "Section" }).includes("ui-section-title"));
      assert.ok(render(SectionHeading, { title: "Panel", level: 4 }).includes("ui-panel-title"));
      assert.ok(render(SectionHeading, { title: "Page", kind: "page", description: "Primary copy" })
        .includes("ui-heading-description text-base"));
    });
    await t.test("quiet controls retain native disabled and busy behavior", () => {
      const html = render(ControlButton, { tone: "quiet", busy: true, children: "Commands" });
      assert.equal(attribute(html, "aria-busy"), "true"); assert.equal(attribute(html, "disabled"), "");
      assert.equal(attribute(html, "tone"), null); assert.equal(attribute(html, "busy"), null);
      assert.ok(html.includes("border-transparent")); assert.ok(html.includes("Commands"));
    });
  } finally { await vite.close(); }
});

function token (name) {
  const match = css.match(new RegExp(`--ui-${name}:\\s*(\\d+) (\\d+) (\\d+);`));
  assert.ok(match, `actual CSS token exists: ${name}`);
  return match.slice(1).map(Number);
}
function luminance (rgb) {
  return rgb.map((v) => v / 255).map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
    .reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i], 0);
}
function contrast (a, b) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test("actual foundation palette pairs meet their numerical contrast thresholds", () => {
  const colors = frontendRequire("tailwindcss/colors");
  const hex = (value) => {
    const digits = value.slice(1);
    const expanded = digits.length === 3 ? [...digits].map((digit) => digit + digit).join("") : digits;
    return expanded.match(/../g).map((part) => Number.parseInt(part, 16));
  };
  const pairs = [
    [token("text"), token("canvas"), 4.5], [token("text"), token("surface"), 4.5],
    [token("text-muted"), token("surface"), 4.5], [token("text-muted"), token("surface-raised"), 4.5],
    [hex(colors.white), token("primary"), 4.5], [hex(colors.white), token("primary-hover"), 4.5],
    [hex(colors.white), token("danger"), 4.5], [hex(colors.white), hex(colors.rose[700]), 4.5],
    [hex(colors.slate[950]), token("warning"), 4.5], [hex(colors.slate[950]), hex(colors.amber[400]), 4.5],
    [token("control-border"), token("surface"), 3], [token("control-border"), token("surface-raised"), 3],
    [token("focus"), token("canvas"), 3], [token("focus"), token("surface"), 3],
  ];
  for (const [foreground, background, minimum] of pairs) {
    assert.ok(contrast(foreground, background) >= minimum, `${foreground}/${background} >= ${minimum}`);
  }
  assert.match(uiSource, /danger:\s*"bg-ui-danger text-white hover:bg-rose-700"/);
  assert.match(uiSource, /primary:\s*"bg-ui-primary text-white hover:bg-ui-primary-hover"/);
});

test("foundation CSS keeps a quiet canvas, readable roles and existing accessibility guards", () => {
  assert.match(css, /--ui-font-body:\s*1rem;/);
  assert.match(css, /--ui-font-metadata:\s*0\.75rem;/);
  for (const role of ["page-title", "section-title", "panel-title", "metadata", "toolbar",
    "work-row", "work-list", "metric", "metric-value", "status-label", "empty-state"]) {
    assert.ok(css.includes(`.ui-${role} {`), `role ${role} exists`);
  }
  const bodyRules = [...css.matchAll(/(?:^|\n)body\s*\{([^}]*)\}/g)].map((match) => match[1]);
  assert.equal(bodyRules.length, 1); assert.doesNotMatch(bodyRules[0], /background-image|overflow:\s*hidden/);
  assert.ok(css.includes(".ui-control:where(:hover:not(:disabled):not([aria-disabled=\"true\"]))"));
  assert.match(css, /@media \(pointer: coarse\)[\s\S]*min-width: 44px !important;[\s\S]*min-height: 44px !important;/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /\.ui-control:focus-visible,[\s\S]*ring-ui-focus/);
});
