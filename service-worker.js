/* =====================================================================
   service-worker.js – PWA App-Shell-Caching (voll offline-fähig)

   Strategie:
   - install : App-Shell vorab cachen (alle Seiten, CSS, JS, Seeds, Bilder)
   - activate: alte Caches aufräumen
   - fetch   : /api/* IMMER durchlassen (Mock läuft im Page-fetch, real/hybrid
               geht ans Netz); Navigationen network-first -> Cache -> offline.html;
               Same-Origin-Assets cache-first; Cross-Origin (Fonts) stale-while-revalidate.

   Die ?v=NN-Versionen MÜSSEN zu den in den *.html eingebundenen passen.
   Bei jedem Versions-Bump in den HTML-Dateien hier ebenfalls anpassen –
   das ändert die SW-Bytes, der Browser installiert neu und räumt alte Caches.
   ===================================================================== */
"use strict";

const VERSION = "v38";
/* Cache-Namespace: der Fork behält den BSG-Prefix, damit Caches getrennter
   Deployments nicht kollidieren. */
const CACHE_NS = "bsg";
const CACHE = CACHE_NS + "-cache-" + VERSION;
const RUNTIME = CACHE_NS + "-runtime-" + VERSION;
const OFFLINE_URL = "offline.html";

/* Relative URLs (basis-pfad-agnostisch: werden relativ zur SW-URL aufgelöst). */
const PRECACHE_URLS = [
  ".",
  "index.html",
  "home.html",
  "trainingszeiten.html",
  "team.html",
  "aktuelles.html",
  "kalender.html",
  "anmeldung.html",
  "kontakt.html",
  "datenschutz.html",
  "login.html",
  "konto.html",
  "mitglieder.html",
  "redaktion.html",
  "admin.html",
  "registrieren.html",
  "sponsoren.html",
  "404.html",
  "offline.html",
  "manifest.webmanifest",

  "assets/css/theme.bsg.css?v=" + VERSION.slice(1),
  "assets/css/theme.example.css?v=" + VERSION.slice(1),
  "assets/css/styles.css?v=" + VERSION.slice(1),

  "assets/js/club-config.js?v=" + VERSION.slice(1),
  "assets/js/portal.js?v=" + VERSION.slice(1),
  "assets/js/api-config.js?v=" + VERSION.slice(1),
  "assets/js/mock-api.js?v=" + VERSION.slice(1),
  "assets/js/main.js?v=" + VERSION.slice(1),
  "assets/js/auth.js?v=" + VERSION.slice(1),
  "assets/js/forms.js?v=" + VERSION.slice(1),
  "assets/js/news.js?v=" + VERSION.slice(1),
  "assets/js/sponsors.js?v=" + VERSION.slice(1),
  "assets/js/trainingszeiten.js?v=" + VERSION.slice(1),
  "assets/js/team.js?v=" + VERSION.slice(1),
  "assets/js/kalender.js?v=" + VERSION.slice(1),
  "assets/js/konto.js?v=" + VERSION.slice(1),
  "assets/js/mitglieder.js?v=" + VERSION.slice(1),
  "assets/js/redaktion.js?v=" + VERSION.slice(1),
  "assets/js/admin.js?v=" + VERSION.slice(1),
  "assets/js/features/loader.js?v=" + VERSION.slice(1),
  "assets/js/features/beitragsrechner.js?v=" + VERSION.slice(1),

  "assets/data/age-classes.json",
  "assets/data/weight-classes.json",
  "assets/data/events.json",
  "assets/data/membership-types.json",
  "assets/data/news.json",
  "assets/data/sponsors.json",
  "assets/data/news.bsg.json",
  "assets/data/site.json",
  "assets/data/site.bsg.json",
  "assets/data/club.json",
  "assets/data/club.bsg.json",
  "assets/data/club.example.json",
  "assets/data/trainingszeiten.json",
  "assets/data/trainingszeiten.bsg.json",
  "assets/data/events.bsg.json",

  "assets/img/drache.png",
  "assets/img/drache-light.png",
  "assets/img/bsg-logo.png",
  "assets/img/favicon.png",
  "assets/img/apple-touch-icon.png",
  "assets/img/hero-pattern.svg",
  "assets/img/icon-192.png",
  "assets/img/icon-512.png",
  "assets/img/icon-maskable-512.png",
];

/* ---------- install: App-Shell vorab cachen ---------- */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // einzeln hinzufügen, damit ein einzelner Fehler nicht alles abbricht
      Promise.all(
        PRECACHE_URLS.map((url) =>
          cache.add(new Request(url, { cache: "reload" })).catch(() => {})
        )
      )
    ).then(() => self.skipWaiting())
  );
});

/* ---------- activate: alte Caches entfernen ---------- */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE && k !== RUNTIME).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

/* ---------- fetch ---------- */
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // /api/* niemals abfangen/cachen (Mock erreicht den SW ohnehin nicht;
  // real/hybrid muss frisch ans Netz).
  if (url.pathname.includes("/api/")) return;

  const sameOrigin = url.origin === self.location.origin;

  // Navigationen: network-first -> Cache -> offline.html
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // nur erfolgreiche Antworten cachen (keine 404/500-Seiten)
          if (res && res.ok) {
            const copy = res.clone();
            event.waitUntil(caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {}));
          }
          return res;
        })
        .catch(() =>
          // ignoreSearch: Navigationen mit Query (z. B. "/" -> home.html?club=bsg)
          // sollen den precachten Seiten-Eintrag (ohne Query) treffen, statt auf
          // offline.html zu fallen.
          caches.match(req, { ignoreSearch: true }).then((cached) => cached || caches.match(OFFLINE_URL))
        )
    );
    return;
  }

  // Same-Origin-Assets: cache-first -> Netz (und ablegen)
  if (sameOrigin) {
    event.respondWith(
      caches.match(req).then(
        (cached) =>
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

  // Cross-Origin (z. B. Google Fonts): stale-while-revalidate
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
