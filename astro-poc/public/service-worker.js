/* =====================================================================
   service-worker.js – PWA App-Shell-Caching für die Astro-Ausgabe.
   Liegt in astro-poc/public/ -> wird nach dist/ kopiert und unter
   /website/service-worker.js ausgeliefert (Scope /website/). Alle URLs sind
   RELATIV (Astro deployt unter dem Pages-Unterpfad /website/).

   Astro versioniert Assets in diesem PoC (noch) nicht per Hash; die Cache-
   Invalidierung läuft über VERSION (bei jedem Release erhöhen). 🔜 Mit
   Astro-Asset-Hashing entfällt das.
   ===================================================================== */
"use strict";

const VERSION = "astro-v1";
const CACHE = "bsg-astro-" + VERSION;
const RUNTIME = "bsg-astro-runtime-" + VERSION;
const OFFLINE_URL = "offline.html";

const PRECACHE_URLS = [
  ".",
  "index.html", "trainingszeiten.html", "team.html", "aktuelles.html", "kalender.html",
  "anmeldung.html", "kontakt.html", "datenschutz.html", "sponsoren.html",
  "login.html", "registrieren.html", "konto.html", "mitglieder.html", "redaktion.html", "admin.html",
  "404.html", "offline.html",
  "manifest.webmanifest",

  "assets/css/styles.css", "assets/css/theme.bsg.css",

  "assets/js/api-config.js", "assets/js/mock-api.js", "assets/js/main.js", "assets/js/auth.js",
  "assets/js/forms.js", "assets/js/news.js", "assets/js/sponsors.js", "assets/js/trainingszeiten.js",
  "assets/js/team.js", "assets/js/kalender.js", "assets/js/konto.js", "assets/js/mitglieder.js",
  "assets/js/redaktion.js", "assets/js/admin.js",
  "assets/js/features/loader.js", "assets/js/features/beitragsrechner.js",

  "assets/data/age-classes.json", "assets/data/weight-classes.json", "assets/data/events.json",
  "assets/data/membership-types.json", "assets/data/news.json", "assets/data/sponsors.json",
  "assets/data/news.bsg.json", "assets/data/site.json", "assets/data/site.bsg.json",
  "assets/data/club.json", "assets/data/club.bsg.json", "assets/data/trainingszeiten.json",
  "assets/data/trainingszeiten.bsg.json", "assets/data/events.bsg.json",

  "assets/img/bsg-logo.png", "assets/img/drache-light.png", "assets/img/favicon.png",
  "assets/img/apple-touch-icon.png", "assets/img/hero-pattern.svg",
  "assets/img/icon-192.png", "assets/img/icon-512.png", "assets/img/icon-maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.all(PRECACHE_URLS.map((url) =>
        cache.add(new Request(url, { cache: "reload" })).catch(() => {})
      ))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE && k !== RUNTIME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // /api/* nie abfangen (Mock läuft im Page-fetch; real/hybrid muss ans Netz).
  if (url.pathname.includes("/api/")) return;

  const sameOrigin = url.origin === self.location.origin;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            event.waitUntil(caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {}));
          }
          return res;
        })
        .catch(() =>
          caches.match(req, { ignoreSearch: true }).then((cached) => cached || caches.match(OFFLINE_URL))
        )
    );
    return;
  }

  if (sameOrigin) {
    event.respondWith(
      caches.match(req).then((cached) =>
        cached ||
        fetch(req).then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            event.waitUntil(caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {}));
          }
          return res;
        }).catch(() => cached || new Response("", { status: 504, statusText: "Offline" }))
      )
    );
    return;
  }

  event.respondWith(
    caches.open(RUNTIME).then((cache) =>
      cache.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            if (res && (res.ok || res.type === "opaque")) event.waitUntil(cache.put(req, res.clone()));
            return res;
          })
          .catch(() => cached || new Response("", { status: 504, statusText: "Offline" }));
        return cached || network;
      })
    )
  );
});
