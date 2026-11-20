const CACHE_PREFIX = "robotica-sil-pwa-";
const CACHE_NAME = `${CACHE_PREFIX}__PWA_BUILD_ID__`;
const APP_SHELL = [
  "/",
  "/manifest.webmanifest",
  "/icons/sil-school-logo.png",
  "/components/arduino.png",
  "/components/protoboard.png",
  "/components/Led.png",
  "/components/resistencia.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

async function cacheSuccessfulResponse(cache, request, response) {
  if (response.ok && response.type === "basic") {
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request, { cache: "no-cache" });
        return await cacheSuccessfulResponse(cache, "/", response);
      } catch {
        return (await cache.match("/")) || Response.error();
      }
    })());
    return;
  }

  // Only public app resources are cached. Firebase data and authenticated requests
  // use other origins and never enter this cache.
  const isAppResource = url.pathname.startsWith("/assets/")
    || url.pathname.startsWith("/components/")
    || url.pathname.startsWith("/icons/")
    || url.pathname === "/manifest.webmanifest";
  if (!isAppResource) return;

  const cachePromise = caches.open(CACHE_NAME);
  const updatePromise = cachePromise.then((cache) => fetch(request)
    .then((response) => cacheSuccessfulResponse(cache, request, response)));
  event.waitUntil(updatePromise.catch(() => undefined));
  event.respondWith((async () => {
    const cache = await cachePromise;
    const cached = await cache.match(request);
    if (cached) return cached;
    try {
      return await updatePromise;
    } catch {
      return Response.error();
    }
  })());
});
