/* =====================================================================
   club-config.js – Single-Tenant-Konfiguration (BSG Benninghausen).
   MUSS synchron im <head> geladen werden: VOR styles.css (für die
   FOUC-freie Theme-Injektion) und VOR mock-api.js (das window.BSG_CLUB liest).

   Dieser Fork ist eine Single-Tenant-Seite (genau ein Verein). Das frühere
   White-Label-Portal mit mehreren Beispielen + ?club=-Resolver ist entfallen;
   das Layout-/Marken-Branding wird beim Deploy per
   tools/prerender-branding.mjs aus assets/data/club.bsg.json ins HTML
   gestempelt. Hier bleibt nur die Laufzeit-Minimalkonfig:
     - window.BSG_CLUB : { id, name, clubSeed, theme, ns } – mock-api liest das
       (clubSeed -> ensureClub; ns -> localStorage-Namespace).
     - window.BSG_ADMIN_EMAIL : Seed-Admin (mock-api liest es beim Laden).
     - Theme-CSS FOUC-frei injizieren (auf <html data-club-site>).
   ===================================================================== */
(function () {
  "use strict";

  window.BSG_CLUB = {
    id: "bsg",
    name: "BSG Benninghausen e.V.",
    clubSeed: "club.bsg.json",
    theme: "assets/css/theme.bsg.css",
    ns: "bsg",
  };

  /* Seed-Admin-Adresse für den Fork (mock-api.js liest window.BSG_ADMIN_EMAIL
     beim Laden; dieses Skript läuft davor). */
  window.BSG_ADMIN_EMAIL = "admin@bsg-benninghausen.de";

  /* Mock⇄Real-Deploy-Default (api-config.js liest window.BSG_API; dieses Skript läuft
     synchron im <head> VOR dem defer-geladenen api-config.js, greift also als Default).
     Route-für-Route-Promotion zum echten Backend; erster Schritt: die ganze /api/auth-
     Gruppe. Lokale Entwicklung (localhost/127.0.0.1/file:) bleibt Mock, damit man nicht
     versehentlich Produktion trifft – per ?api=…/?apibase=… jederzeit übersteuerbar. */
  (function () {
    var h = (location.hostname || "").toLowerCase();
    var isLocalDev = location.protocol === "file:" || h === "localhost" || h === "127.0.0.1" || h === "";
    window.BSG_API = isLocalDev
      ? { mode: "mock", base: "", live: [] }
      : { mode: "hybrid", base: "https://api.orgbase.de", live: ["/api/auth"] };
  })();

  /* Theme nur auf den eigentlichen Vereinsseiten injizieren (<html data-club-site>).
     FOUC-frei: dieses Skript läuft synchron im <head> vor styles.css. Die
     Cache-Bust-Version wird aus dem eigenen <script>-Tag gelesen, damit der
     Standard-HTML-Bump sie automatisch mitzieht. */
  if (document.documentElement.hasAttribute("data-club-site")) {
    var ver = "";
    try {
      var src = document.currentScript && document.currentScript.src;
      var m = src && src.match(/[?&]v=([0-9A-Za-z._-]+)/);
      if (m) ver = "?v=" + m[1];
    } catch (e) {}
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = window.BSG_CLUB.theme + ver;
    document.head.appendChild(link);
  }
})();
