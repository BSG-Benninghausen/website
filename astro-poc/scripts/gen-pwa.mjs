/* =====================================================================
   gen-pwa.mjs – erzeugt manifest.webmanifest + service-worker.js aus
   club.json. Läuft als prebuild-Schritt (nach sync-assets) und schreibt
   beide Dateien nach public/. Dadurch ist die PWA-Schicht NICHT mehr fest
   auf einen Verein verdrahtet: ein anderer Verein tauscht nur club.json
   (+ theme.<id>.css + Seeds), Manifest und Service-Worker fallen generisch
   richtig heraus.

   Aufruf (Defaults in Klammern):
     node scripts/gen-pwa.mjs [clubJson=src/data/club.json] [outDir=public]
   ===================================================================== */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const clubPath = resolve(root, process.argv[2] || "src/data/club.json");
const outDir = resolve(root, process.argv[3] || "public");

const club = JSON.parse(readFileSync(clubPath, "utf8"));

// Cache-Bust der App-Shell: bei jedem Release erhöhen (Astro hasht im PoC noch
// nicht). 🔜 Mit Asset-Hashing entfällt das.
const VERSION = "astro-v5";

const ns = club.ns || club.id || "app";
const themeCss = club.theme_css || "assets/css/theme.css";
const clubSeed = club.clubSeed || "club.json";

/* ---- manifest.webmanifest --------------------------------------------- */
const manifest = {
  name: club.name,
  short_name: club.short_name || club.brand_name || club.name,
  description: club.description,
  lang: "de",
  dir: "ltr",
  start_url: ".",
  scope: "./",
  display: "standalone",
  orientation: "portrait-primary",
  background_color: club.background_color || club.theme_color || "#0d0d12",
  theme_color: club.theme_color || "#0d0d12",
  icons: [
    { src: "assets/img/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "assets/img/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "assets/img/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
};

/* ---- service-worker.js: Precache-Liste -------------------------------- */
// Club-spezifische Seeds aus dem Namespace ableiten (graceful: fehlende
// Einträge werden beim install per .catch() ignoriert).
const nsSeeds = ["news", "site", "events", "trainingszeiten"].map((n) => `assets/data/${n}.${ns}.json`);

const PRECACHE_URLS = [
  ".",
  "index.html", "trainingszeiten.html", "team.html", "aktuelles.html", "kalender.html",
  "anmeldung.html", "kontakt.html", "datenschutz.html", "sponsoren.html",
  "login.html", "registrieren.html", "konto.html", "mitglieder.html", "redaktion.html", "admin.html",
  "404.html", "offline.html",
  "manifest.webmanifest",

  "assets/css/styles.css", themeCss,

  "assets/js/api-config.js", "assets/js/mock-api.js", "assets/js/main.js", "assets/js/auth.js",
  "assets/js/forms.js", "assets/js/news.js", "assets/js/sponsors.js", "assets/js/trainingszeiten.js",
  "assets/js/team.js", "assets/js/kalender.js", "assets/js/konto.js", "assets/js/mitglieder.js",
  "assets/js/redaktion.js", "assets/js/admin.js",

  "assets/data/age-classes.json", "assets/data/weight-classes.json", "assets/data/events.json",
  "assets/data/membership-types.json", "assets/data/news.json", "assets/data/sponsors.json",
  "assets/data/site.json", "assets/data/club.json", "assets/data/trainingszeiten.json",
  `assets/data/${clubSeed}`, ...nsSeeds,

  club.logo,
  "assets/img/drache-light.png", "assets/img/favicon.png",
  "assets/img/apple-touch-icon.png", "assets/img/hero-pattern.svg",
  "assets/img/icon-192.png", "assets/img/icon-512.png", "assets/img/icon-maskable-512.png",
];
// Duplikate entfernen (z. B. wenn clubSeed == club.<ns>.json).
const precache = [...new Set(PRECACHE_URLS.filter(Boolean))];

const swHead = `/* AUTO-GENERIERT aus club.json via scripts/gen-pwa.mjs – nicht editieren.
   PWA App-Shell-Caching für die Astro-Ausgabe. Liegt nach Build unter
   /service-worker.js (Scope-relativ; Astro deployt unter dem Pages-Unterpfad).
   Alle URLs sind RELATIV. Cache-Invalidierung über VERSION. */
"use strict";

const VERSION = ${JSON.stringify(VERSION)};
const CACHE = ${JSON.stringify(ns + "-astro-")} + VERSION;
const RUNTIME = ${JSON.stringify(ns + "-astro-runtime-")} + VERSION;
const OFFLINE_URL = "offline.html";

const PRECACHE_URLS = ${JSON.stringify(precache, null, 2)};
`;

const swBody = `
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

  // /api/* nie abfangen (Mock laeuft im Page-fetch; real/hybrid muss ans Netz).
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
`;

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "manifest.webmanifest"), JSON.stringify(manifest, null, 2) + "\n");
writeFileSync(join(outDir, "service-worker.js"), swHead + swBody);

console.log(`[gen-pwa] ${club.id} → manifest.webmanifest + service-worker.js (${precache.length} precache URLs, VERSION ${VERSION})`);
