// Offline support for the installed Fuel Log app. The build replaces
// __VERSION__ with a content hash so each release gets a fresh cache.
const CACHE = "fuel-log-__VERSION__";
const SHELL = ["./", "nutrition.js", "commonfoods.js", "manifest.webmanifest", "icons/icon-192.png", "icons/apple-touch-icon.png",
  "https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.hostname.endsWith("openfoodfacts.org")) return; // always live; the app handles failures
  // App shell and fonts: answer from cache at once, refresh it in the background.
  e.respondWith(caches.open(CACHE).then(async (cache) => {
    const key = req.mode === "navigate" ? "./" : req;
    const hit = await cache.match(key);
    const fresh = fetch(req).then((res) => {
      if (res.ok || res.type === "opaque") cache.put(key, res.clone());
      return res;
    }).catch(() => hit);
    return hit || fresh;
  }));
});
