/* =====================================================================
   portal.js – Produkt-Portal (Startseite index.html).
   Rendert die "live" Referenz-Beispiele aus window.BSG_EXAMPLES (Registry aus
   club-config.js) in das [data-examples]-Grid. Rein statisch – kein /api/*,
   kein Mock-Backend; jede Karte verlinkt auf home.html?club=<id>.
   ===================================================================== */
(function () {
  "use strict";

  var y = document.querySelector("[data-year]");
  if (y) y.textContent = String(new Date().getFullYear());

  var grid = document.querySelector("[data-examples]");
  var tpl = grid && grid.querySelector("[data-example-template]");
  var examples = window.BSG_EXAMPLES || [];
  if (!grid || !tpl) return;

  examples.forEach(function (ex) {
    if (ex.status !== "live") return;
    var card = tpl.cloneNode(true);
    card.hidden = false;
    card.removeAttribute("aria-hidden");
    card.removeAttribute("data-example-template");

    var mark = card.querySelector("[data-ex-mark]");
    if (mark) {
      mark.style.background = ex.accent || "var(--accent)";
      mark.style.color = "#fff";
      mark.textContent = (ex.name || "?").trim().charAt(0).toUpperCase();
    }
    var name = card.querySelector("[data-ex-name]");
    if (name) name.textContent = ex.name || ex.id;
    var meta = card.querySelector("[data-ex-meta]");
    if (meta) {
      meta.textContent = [ex.sport, ex.locality].filter(Boolean).join(" · ");
    }
    var summary = card.querySelector("[data-ex-summary]");
    if (summary) summary.textContent = ex.summary || "";
    var status = card.querySelector("[data-ex-status]");
    if (status) status.textContent = ex.id === "demo" ? "Vorlage" : "Live";
    var link = card.querySelector("[data-ex-link]");
    if (link) link.setAttribute("href", "home.html?club=" + encodeURIComponent(ex.id));

    grid.insertBefore(card, tpl); // vor das Template (und damit vor die "Geplant"-Karten)
  });
})();
