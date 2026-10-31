/* Public web app configuration only. Never put administrative credentials here. */
const configText = new URL(self.location.href).searchParams.get("config");
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(
      self.location.origin +
        "/?" +
        new URLSearchParams({
          section:
            event.notification.data?.section === "reminders"
              ? "reminders"
              : "alerts",
          water: event.notification.data?.pondId || "POND_01",
        }),
    ),
  );
});
if (configText) {
  try {
    importScripts(
      "https://www.gstatic.com/firebasejs/12.19.0/firebase-app-compat.js",
    );
    importScripts(
      "https://www.gstatic.com/firebasejs/12.19.0/firebase-messaging-compat.js",
    );
    firebase.initializeApp(JSON.parse(configText));
    firebase.messaging().onBackgroundMessage((payload) =>
      self.registration.showNotification(payload.data?.title || "Pond alert", {
        body: payload.data?.body || "A pond reading needs attention.",
        icon: "/pond-icon.svg",
        data: { section: payload.data?.section, pondId: payload.data?.pondId },
      }),
    );
  } catch {
    /* Offline shell remains available if messaging scripts cannot load. */
  }
}
// Cache only the public app shell. Sensor history is stored by the UI with its
// original timestamps; Firebase responses, owner records and credentials never enter this cache.
const SHELL_CACHE = "roboforge-public-shell-v1";
async function cachePublicShell() {
  const response = await fetch("/offline-manifest.json", { cache: "no-store" });
  if (!response.ok) return false;
  const { files } = await response.json();
  if (!Array.isArray(files)) return false;
  const allowed = files.filter(
    (path) =>
      typeof path === "string" &&
      (/^\/assets\/[^?]+\.(js|css)$/.test(path) ||
        [
          "/index.html",
          "/pond-config.json",
          "/pond-icon.svg",
          "/manifest.webmanifest",
        ].includes(path)),
  );
  const cache = await caches.open(SHELL_CACHE);
  await cache.addAll(allowed);
  const keep = new Set(allowed);
  for (const request of await cache.keys())
    if (!keep.has(new URL(request.url).pathname)) await cache.delete(request);
  return true;
}
self.addEventListener("install", (event) => {
  event.waitUntil(
    cachePublicShell()
      .catch(() => {})
      .then(() => self.skipWaiting()),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
self.addEventListener("message", (event) => {
  if (event.data?.type === "CACHE_PUBLIC_SHELL")
    event.waitUntil(
      cachePublicShell()
        .then((ready) =>
          event.source?.postMessage({ type: "PUBLIC_SHELL_CACHED", ready }),
        )
        .catch(() =>
          event.source?.postMessage({
            type: "PUBLIC_SHELL_CACHED",
            ready: false,
          }),
        ),
    );
});
self.addEventListener("fetch", (event) => {
  const request = event.request,
    url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          if (response.ok) {
            const cache = await caches.open(SHELL_CACHE);
            await cache.put("/index.html", response.clone());
          }
          return response;
        })
        .catch(
          async () =>
            (await caches.match("/index.html")) ||
            new Response(
              "Connect once while online to save RoboForge for offline viewing.",
              { status: 503, headers: { "Content-Type": "text/plain" } },
            ),
        ),
    );
    return;
  }
  if (/^\/assets\/[^?]+\.(js|css)$/.test(url.pathname))
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then(async (response) => {
            if (response.ok) {
              const cache = await caches.open(SHELL_CACHE);
              await cache.put(request, response.clone());
            }
            return response;
          }),
      ),
    );
  else if (
    ["/pond-config.json", "/pond-icon.svg", "/manifest.webmanifest"].includes(
      url.pathname,
    )
  )
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          if (response.ok) {
            const cache = await caches.open(SHELL_CACHE);
            await cache.put(request, response.clone());
          }
          return response;
        })
        .catch(
          async () =>
            (await caches.match(request)) ||
            new Response("Unavailable offline", { status: 503 }),
        ),
    );
});
