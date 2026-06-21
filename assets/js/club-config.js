/* =====================================================================
   club-config.js – Auflösung des aktiven Referenz-Beispiels (White-Label).
   MUSS synchron im <head> geladen werden: VOR styles.css (für FOUC-freie
   Theme-Injektion) und VOR mock-api.js (das window.BSG_CLUB liest).

   GETEILTE LOGIK (in Upstream und allen Forks byte-identisch). Die einzigen
   branding-bestimmenden Stellgrößen — die Beispiel-Registry und der
   Default-Verein — kommen aus der repo-privaten assets/js/deploy-config.js
   (synchron im <head> VOR dieser Datei geladen, analog api-config.js vor
   mock-api.js). So bleibt diese Datei zwischen den Repos mergebar, während das
   Branding ausschließlich in deploy-config.js (+ club.<id>.json / theme.<id>.css)
   lebt. Siehe docs/bidirectional-sync.md.

   Aktives Beispiel wird aufgelöst (stark → schwach):
     1. URL-Query   ?club=<id>   (wird in localStorage persistiert)
     2. localStorage bsg_example   (eigener Key – NICHT bsg_club: das ist im
        Mock die Club-Branding-Config KEYS.club und würde sonst kollidieren)
     3. Deploy-Default  window.BSG_CLUB_DEFAULT = "<id>"  (aus deploy-config.js)
     4. Eingebauter Fallback BUILTIN[0] (neutrales Demo-Beispiel)

   Ergebnis:
     window.BSG_CLUB     = { id, name, clubSeed, theme, ns }
       - clubSeed : Seed-Datei für GET /api/club (mock-api -> ensureClub)
       - theme    : austauschbare Theme-CSS (Marken-Schicht)
       - ns       : localStorage-Namespace; jedes Beispiel hat einen eigenen
                    Store. Das Default-Beispiel ("bsg") behält die Legacy-
                    Schlüssel (bsg_*), siehe mock-api.js.
     window.BSG_EXAMPLES = ganze Registry (für das Produkt-Portal index.html)

   Neues Referenz-Beispiel = EIN Eintrag in deploy-config.js + club.<id>.json
   + ein Theme — ohne den Rest des Frontends anzufassen ("Branding = Konfiguration").
   ===================================================================== */
(function () {
  "use strict";

  /* Letzter Rückfall, falls deploy-config.js fehlt: das neutrale Beispiel.
     Identisch in allen Repos – echtes Branding steht in deploy-config.js. */
  var BUILTIN = [
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

  var EXAMPLES =
    (Array.isArray(window.BSG_CLUB_REGISTRY) && window.BSG_CLUB_REGISTRY.length)
      ? window.BSG_CLUB_REGISTRY
      : BUILTIN;

  function find(id) {
    for (var i = 0; i < EXAMPLES.length; i++) {
      if (EXAMPLES[i].id === id) return EXAMPLES[i];
    }
    return null;
  }

  /* Eigener Persistenz-Key – bewusst NICHT "bsg_club" (das ist im Mock die
     Club-Branding-Config, KEYS.club). */
  var SELECT_KEY = "bsg_example";

  /* Deploy-Default (aus deploy-config.js) – schwächer als localStorage und ?club=,
     stärker als der eingebaute Fallback BUILTIN[0]. */
  var deployDefault =
    (typeof window.BSG_CLUB_DEFAULT === "string" && window.BSG_CLUB_DEFAULT) || "";

  var id = deployDefault || EXAMPLES[0].id;
  try {
    var ls = localStorage.getItem(SELECT_KEY);
    if (ls) id = ls;
  } catch (e) {}
  try {
    var p = new URLSearchParams(location.search).get("club");
    if (p) {
      id = p;
      try { localStorage.setItem(SELECT_KEY, p); } catch (e2) {}
    }
  } catch (e3) {}

  var ex = find(id) || find(deployDefault) || EXAMPLES[0];

  window.BSG_EXAMPLES = EXAMPLES;
  window.BSG_CLUB = {
    id: ex.id,
    name: ex.name,
    clubSeed: ex.clubSeed,
    theme: ex.theme,
    ns: ex.id,
  };

  /* Theme nur auf den eigentlichen Vereinsseiten injizieren (<html data-club-site>).
     Das Produkt-Portal bindet seine neutrale Theme-CSS selbst statisch ein.
     FOUC-frei: dieses Skript läuft synchron im <head> vor styles.css. */
  if (document.documentElement.hasAttribute("data-club-site")) {
    var ver = "";
    try {
      var src = document.currentScript && document.currentScript.src;
      var m = src && src.match(/[?&]v=([0-9A-Za-z._-]+)/);
      if (m) ver = "?v=" + m[1];
    } catch (e4) {}
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = ex.theme + ver;
    document.head.appendChild(link);
  }
})();
