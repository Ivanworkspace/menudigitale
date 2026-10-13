/* MenuSaaS service worker: static asset cache + offline page.
 * HTML pages are never cached (they may contain private data): when the
 * network is down, navigations fall back to /offline. */
const CACHE = "menusaas-v2";
const PRECACHE = ["/offline", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== "menusaas-meta").map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => caches.match("/offline")));
    return;
  }
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});

// --- Push notifications (owner app) -----------------------------------------
// The panel URL (which contains the venue's secret link) is kept only on the
// device: the page stores it here, the server never sends it.
const META = "menusaas-meta";

self.addEventListener("message", (e) => {
  if (e.data?.type === "set-home" && typeof e.data.url === "string" && e.data.url.startsWith("/g/")) {
    e.waitUntil(caches.open(META).then((c) => c.put("/__home", new Response(e.data.url))));
  }
});

self.addEventListener("push", (e) => {
  let data = {};
  try {
    data = e.data ? e.data.json() : {};
  } catch {
    data = { title: e.data ? e.data.text() : "" };
  }
  e.waitUntil(
    self.registration.showNotification(data.title || "Nuova notifica", {
      body: data.body || "",
      tag: data.tag || undefined,
      renotify: !!data.tag,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
    }),
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const panel = wins.find((w) => new URL(w.url).pathname.startsWith("/g/"));
      if (panel) return panel.focus();
      const res = await caches.open(META).then((c) => c.match("/__home"));
      const url = res ? await res.text() : "/";
      return self.clients.openWindow(url);
    })(),
  );
});
