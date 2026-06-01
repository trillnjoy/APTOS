// APTOS Service Worker v1.8
const CACHE_VERSION = "1.8";
const CACHE_NAME    = `aptos-v${CACHE_VERSION}`;

const PRECACHE_URLS = [
  "/APTOS/",
  "/APTOS/index.html",
  "/APTOS/manifest.json",
  "/APTOS/Aptos_192.png",
  "/APTOS/Aptos_512.png",
  "/APTOS/PedsDoseTable.jsx",
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key.startsWith("aptos-") && key !== CACHE_NAME)
            .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);

  // CDN requests go straight to network
  if (!url.origin.includes("trillnjoy.github.io")) return;

  // Data files always fetched fresh
  if (url.pathname.includes('formulary.json')) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response && response.status === 200 && response.type === "basic") {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});

self.addEventListener("message", event => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});
