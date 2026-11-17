/**
 * Minimal offline cache for the static build.
 *
 * PhyloRecViewer describes itself as an offline viewer, but a plain static
 * deploy had no service worker: a refresh while disconnected produced the
 * browser's error page. This worker caches every GET as it is requested
 * (stale-while-revalidate), so the second visit - online or not - is served
 * from Cache Storage. It is deliberately tiny: no build-time manifest, no
 * precache list to keep in sync with hashed asset names.
 */
const CACHE = "rpv-assets-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
