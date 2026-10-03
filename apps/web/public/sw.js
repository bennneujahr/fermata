/* Fermata Service Worker (PLAN 5.2).
 * - Offline-Seite: /offline wird beim Installieren mit ihren Stilen vorgehalten.
 * - Statische Dateien (/_next/static, /brand) aus dem Cache, sonst nur Netz.
 * - Persönliche Seiten werden NICHT gespeichert (Datensparsamkeit).
 * - Web-Push: Empfang und Klick (Versand baut M5). Nachrichten kurz und ohne Namen. */
const VERSION = "fermata-v1";
const STATIC = `${VERSION}-static`;
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC);
      const res = await fetch(OFFLINE_URL, { cache: "no-store", credentials: "omit" });
      if (res.ok) {
        const html = await res.clone().text();
        await cache.put(OFFLINE_URL, res);
        const assets = [...html.matchAll(/(?:href|src)="(\/_next\/static\/[^"]+\.(?:css|woff2))"/g)].map((m) => m[1]);
        await Promise.all(["/brand/icon-192.png", "/brand/favicon.svg", ...assets].map((u) => cache.add(u).catch(() => undefined)));
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(async () => (await caches.match(OFFLINE_URL)) ?? new Response("Offline", { status: 503 })),
    );
    return;
  }
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/brand/")) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        const res = await fetch(req);
        if (res.ok) (await caches.open(STATIC)).put(req, res.clone());
        return res;
      })(),
    );
  }
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = typeof data.title === "string" && data.title ? data.title : "Fermata";
  const options = {
    body: typeof data.body === "string" ? data.body : "",
    icon: "/brand/icon-192.png",
    badge: "/brand/badge-96.png",
    tag: typeof data.tag === "string" ? data.tag : undefined,
    lang: "de",
    data: { url: typeof data.url === "string" ? data.url : "/start" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const raw = (event.notification.data && event.notification.data.url) || "/start";
  const target = new URL(raw, self.location.origin);
  // Nur eigene Seiten öffnen.
  const url = target.origin === self.location.origin ? target.href : new URL("/start", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of all) {
        if (new URL(c.url).origin === self.location.origin && "focus" in c) {
          await c.navigate(url).catch(() => undefined);
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    })(),
  );
});
