self.addEventListener("install", (event) => {
self.addEventListener("install", (event) => {
  const scope = self.registration.scope;
  const assets = [
    "",
    "manifest.webmanifest",
    "icons/icon-192.png",
    "icons/icon-512.png",
    "templates/pef-template.pdf"
  ].map((path) => new URL(path, scope).toString());

  event.waitUntil(caches.open("pef-static-v1").then((cache) => cache.addAll(assets)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => "focus" in client);
      if (existing) return existing.focus();
      return self.clients.openWindow(self.registration.scope);
    })
  );
});
