// APTOS Service Worker
// Bump CACHE_VERSION to match APP_VERSION in index.html on every deploy
const CACHE_VERSION = "0.6";
const CACHE_NAME    = `aptos-v${CACHE_VERSION}`;

const PRECACHE_URLS = [
  "/APTOS/",
  "/APTOS/index.html",
  "/APTOS/manifest.json",
  "/APTOS/Aptos_192.png",
  "/APTOS/Aptos_512.png",
];

// Install: precache all static assets
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())   // activate immediately if no clients claim
  );
});

// Activate: delete stale caches
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key.startsWith("aptos-") && key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch: cache-first for same-origin; network-only for CDN scripts
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);

  // Let CDN requests (Babel, React) go straight to network
  if (!url.origin.includes("trillnjoy.github.io")) {
    return;
  }

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

// Message: support SKIP_WAITING from update prompt in index.html
self.addEventListener("message", event => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});
