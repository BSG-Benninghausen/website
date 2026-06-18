/* =====================================================================
   api-config.js – Schalter zwischen Mock und echtem Backend.
   MUSS vor mock-api.js geladen werden. Setzt window.BSG_API:
     { mode: "mock" | "real" | "hybrid", base: "<Backend-URL>", live: [Muster] }

   Auflösungsreihenfolge (stark → schwach):
     1. URL-Query   ?api=mock|real|hybrid   (+ optional ?apibase=…)
     2. localStorage bsg_api_mode / bsg_api_base / bsg_api_live
     3. Deploy-Default (window.BSG_API vor diesem Skript gesetzt)
     4. Fallback "mock"

   Im "hybrid"-Modus werden nur die in `live` aufgeführten Routen ans echte
   Backend geleitet (Feature-Reife), der Rest bleibt Mock. Muster:
     "GET /api/news"  (Methode+Pfad, exakt oder Präfix) oder
     "/api/team"      (Pfad-Präfix für alle Methoden).
   ===================================================================== */
(function () {
  "use strict";
  var MODES = ["mock", "real", "hybrid"];
  // 3. Deploy-Default (kann pro Umgebung vor diesem Skript gesetzt werden) + Fallback
  var cfg = {
    mode: "mock",
    base: "",     // "" = same-origin /api ; sonst absolute Backend-URL
    live: [],
  };
  if (window.BSG_API && typeof window.BSG_API === "object") {
    if (window.BSG_API.mode) cfg.mode = window.BSG_API.mode;
    if (typeof window.BSG_API.base === "string") cfg.base = window.BSG_API.base;
    if (Array.isArray(window.BSG_API.live)) cfg.live = window.BSG_API.live;
  }
  // 2. localStorage
  try {
    var lsMode = localStorage.getItem("bsg_api_mode");
    if (lsMode) cfg.mode = lsMode;
    var lsBase = localStorage.getItem("bsg_api_base");
    if (lsBase !== null) cfg.base = lsBase;
    var lsLive = localStorage.getItem("bsg_api_live");
    if (lsLive) { try { cfg.live = JSON.parse(lsLive); } catch (e) {} }
  } catch (e) {}
  // 1. URL-Query (am stärksten, teilbar)
  try {
    var q = new URLSearchParams(location.search);
    if (q.get("api")) cfg.mode = q.get("api");
    if (q.get("apibase") !== null) cfg.base = q.get("apibase");
  } catch (e) {}

  if (MODES.indexOf(cfg.mode) === -1) cfg.mode = "mock";
  if (!Array.isArray(cfg.live)) cfg.live = [];
  window.BSG_API = cfg;
})();
