/** A release-identity marker, not a receipt for a successful or complete build. */
export function buildIdentityPlugin(version) {
  if (typeof version !== "string" || !/^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$/.test(version)) {
    throw new Error("UI build identity requires a four-part version");
  }
  return {
    name: "katlab-build-identity",
    apply: "build",
    enforce: "post",
    transformIndexHtml: {
      order: "post",
      handler() {
        return [{
          tag: "meta",
          attrs: { name: "katlab-ui-version", content: version },
          injectTo: "head",
        }];
      },
    },
  };
}
