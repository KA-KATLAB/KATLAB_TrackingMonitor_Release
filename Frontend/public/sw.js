// v0.1.12.0 D2 (B.2): the MINIMAL service worker - exists solely to make
// the app installable. Fetch is NETWORK-ONLY passthrough: the tracker is a
// live localhost app and the C6 no-cache index rule must never fight a
// cache (no Cache Storage is ever created; offline mode is deliberately
// out of scope).

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
