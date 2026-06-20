/* =====================================================================
   club-config.js – Auflösung des aktiven Referenz-Beispiels (White-Label).
   MUSS synchron im <head> geladen werden: VOR styles.css (für FOUC-freie
   Theme-Injektion) und VOR mock-api.js (das window.BSG_CLUB liest).

   Ein einziges, generisches Frontend bedient mehrere "Referenz-Beispiele"
   (Mandanten). Welches Beispiel aktiv ist, wird hier aufgelöst:
     1. URL-Query   ?club=<id>   (wird in localStorage persistiert)
     2. localStorage bsg_example   (eigener Key – NICHT bsg_club: das ist im
        Mock die Club-Branding-Config KEYS.club und würde sonst kollidieren)
     3. Default (erstes "live" Beispiel)

   Ergebnis:
     window.BSG_CLUB     = { id, name, clubSeed, theme, ns }
       - clubSeed : Seed-Datei für GET /api/club (mock-api -> ensureClub)
       - theme    : austauschbare Theme-CSS (Marken-Schicht)
       - ns       : localStorage-Namespace; jedes Beispiel hat einen eigenen
                    Store. Das Default-Beispiel ("bsg") behält die Legacy-
                    Schlüssel (bsg_*), siehe mock-api.js.
     window.BSG_EXAMPLES = ganze Registry (für das Produkt-Portal index.html)

   Neues Referenz-Beispiel = EIN Eintrag hier + assets/data/club.<id>.json
   + ein Theme — ohne den Rest des Frontends anzufassen ("BSG = Konfiguration").
   ===================================================================== */
(function () {
  "use strict";

  var EXAMPLES = [
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
        "Judo-Verein im Kreis Soest – der erste Referenzkunde, vollständig " +
        "eingerichtet: Training, Termine, Team, Mitgliederbereich, Turnier-" +
        "Anmeldungen und Auszahlungen.",
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
        "Die neutrale White-Label-Vorlage – dasselbe Frontend, nur mit " +
        "generischer Marke und neutralem Theme. Startpunkt für jeden neuen Verein.",
    },
  ];
  var DEFAULT_ID = "bsg";

  function find(id) {
    for (var i = 0; i < EXAMPLES.length; i++) {
      if (EXAMPLES[i].id === id) return EXAMPLES[i];
    }
    return null;
  }

  /* Eigener Persistenz-Key – bewusst NICHT "bsg_club" (das ist im Mock die
     Club-Branding-Config, KEYS.club). */
  var SELECT_KEY = "bsg_example";

  var id = DEFAULT_ID;
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

  var ex = find(id) || find(DEFAULT_ID);

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
