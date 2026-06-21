/* =====================================================================
   deploy-config.js – repo-private White-Label-/Deploy-Konfiguration.
   MUSS synchron im <head> geladen werden, VOR club-config.js (analog
   api-config.js vor mock-api.js).

   Dies ist die EINZIGE branding-bestimmende Datei und damit der einzige Punkt,
   der zwischen Upstream (generisch) und einem Verein-Fork (Marke) abweicht.
   Sie steht auf der .gitattributes-Allowlist (merge=ours) und wird daher bei
   Merges in BEIDE Richtungen nie überschrieben. Der restliche Frontend-Code
   (club-config.js, *.html, mock-api.js, service-worker.js …) ist in allen Repos
   identisch und mergt damit konfliktfrei. Siehe docs/bidirectional-sync.md.

   Setzt (jeweils nur, falls nicht schon vor diesem Skript gesetzt):
     window.BSG_CLUB_REGISTRY = [ {id,name,sport,locality,status,clubSeed,theme,accent,summary}, … ]
     window.BSG_CLUB_DEFAULT  = "<id>"   – Default-Beispiel (schwächer als ?club= / localStorage)
     window.BSG_ROOT_MODE     = "portal" | "club"  – Verhalten der Wurzel index.html
     window.BSG_ADMIN_EMAIL   = "<mail>" – optional: Seed-Admin (mock-api / Backend-Env)

   --- Diese Datei: UPSTREAM (vereins-baukasten), generisch ---------------------
   ===================================================================== */
(function () {
  "use strict";

  window.BSG_CLUB_REGISTRY = [
    {
      id: "demo",
      name: "Musterverein",
      sport: "Mehrspartenverein",
      locality: "Musterstadt",
      status: "live",
      clubSeed: "club.example.json",
      theme: "assets/css/theme.example.css",
      accent: "#2563eb",
      summary:
        "Die neutrale White-Label-Vorlage – dasselbe Frontend, nur mit " +
        "generischer Marke und neutralem Theme. Startpunkt für jeden neuen Verein.",
    },
  ];

  /* Upstream = generisches Produkt: Default ist das neutrale Beispiel, die
     Wurzel index.html zeigt das Produkt-Portal. Ein Verein-Fork setzt hier
     seine eigene id + "club". */
  if (typeof window.BSG_CLUB_DEFAULT !== "string") window.BSG_CLUB_DEFAULT = "demo";
  if (typeof window.BSG_ROOT_MODE !== "string") window.BSG_ROOT_MODE = "portal";
})();
