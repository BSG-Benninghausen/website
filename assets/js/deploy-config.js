/* =====================================================================
   deploy-config.js – repo-private White-Label-/Deploy-Konfiguration.
   MUSS synchron im <head> geladen werden, VOR club-config.js (analog
   api-config.js vor mock-api.js).

   Dies ist die EINZIGE branding-bestimmende Datei und damit der einzige Punkt,
   der zwischen Upstream (generisch) und diesem Verein-Fork (Marke) abweicht.
   Sie steht auf der .gitattributes-Allowlist (merge=ours) und wird daher bei
   Merges in BEIDE Richtungen nie überschrieben. Der restliche Frontend-Code
   (club-config.js, *.html, mock-api.js, service-worker.js …) ist mit dem
   Upstream identisch und mergt damit konfliktfrei. Siehe docs/bidirectional-sync.md.

   --- Diese Datei: FORK BSG Benninghausen e.V. ---------------------------------
   ===================================================================== */
(function () {
  "use strict";

  window.BSG_CLUB_REGISTRY = [
    {
      id: "bsg",
      name: "BSG Benninghausen e.V.",
      sport: "Judo",
      locality: "Benninghausen",
      status: "live",
      clubSeed: "club.bsg.json",
      theme: "assets/css/theme.bsg.css",
      accent: "#e3141b",
      summary:
        "Judo-Verein im Kreis Soest – vollständig eingerichtet: Training, " +
        "Termine, Team, Mitgliederbereich, Turnier-Anmeldungen und Auszahlungen.",
    },
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
        "Die neutrale White-Label-Vorlage – zum Vergleich/Preview über ?club=demo.",
    },
  ];

  /* Fork = die BSG-Vereinsseite: BSG ist Default, und die Wurzel index.html
     leitet auf die Vereins-Startseite (statt aufs generische Produkt-Portal). */
  if (typeof window.BSG_CLUB_DEFAULT !== "string") window.BSG_CLUB_DEFAULT = "bsg";
  if (typeof window.BSG_ROOT_MODE !== "string") window.BSG_ROOT_MODE = "club";
  if (typeof window.BSG_ADMIN_EMAIL !== "string") window.BSG_ADMIN_EMAIL = "admin@bsg-benninghausen.de";
})();
