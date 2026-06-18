/* =====================================================================
   mitglieder.js – interne Mitgliederübersicht (nur lesend)
   Zugriff: view_members. IBAN/Beiträge nur bei view_finance.
   ===================================================================== */
(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const esc = (v) => BSG.escape(v == null ? "" : v);

  async function init() {
    let me;
    try { const r = await fetch("/api/auth/me"); me = await r.json(); if (!r.ok || !me.ok) { location.href = "login.html"; return; } }
    catch (e) { location.href = "login.html"; return; }
    if (!(me.isAdmin || me.permissions.includes("view_members"))) { location.href = "konto.html"; return; }

    let data;
    try { data = await (await fetch("/api/admin/members")).json(); }
    catch (e) { $("#members-loading").textContent = "Mitglieder konnten nicht geladen werden."; return; }

    const fin = data.canViewFinance;
    const items = data.items || [];

    // Meta
    const active = items.filter((m) => m.status === "aktiv").length;
    $("#members-meta").innerHTML =
      '<div class="billing-summary__total"><span class="muted-note">Mitglieder gesamt · ' + active + " aktiv</span>" +
      "<strong>" + items.length + "</strong></div>";

    // Tabelle
    const cols = ["Name", "Klasse", "Status", "Haushalt", "Anschrift"];
    if (fin) { cols.splice(2, 0, "Beitrag"); cols.push("IBAN"); }
    $("#members-table").querySelector("thead").innerHTML = "<tr>" + cols.map((c) => "<th>" + c + "</th>").join("") + "</tr>";

    $("#members-table").querySelector("tbody").innerHTML = items.map((m) => {
      const addr = m.address ? (m.address.street + ", " + m.address.zip + " " + m.address.city) : "—";
      const statusBadge = '<span class="badge badge--' + (m.status === "aktiv" ? "aktiv" : "gekuendigt") + '">' + esc(m.status) + "</span>";
      let row = "<td><b>" + esc(m.firstName) + " " + esc(m.lastName) + "</b></td>" +
        "<td>" + esc(m.categoryLabel) + "</td>";
      if (fin) row += "<td>" + esc(m.individualFee) + " €</td>";
      row += "<td>" + statusBadge + "</td>" +
        "<td>" + esc(m.ownerName) + "<br><span class='muted-note'>" + esc(m.ownerEmail) + "</span></td>" +
        "<td>" + esc(addr) + "</td>";
      if (fin) row += "<td>" + esc(m.iban || "—") + "</td>";
      return "<tr>" + row + "</tr>";
    }).join("") || '<tr><td colspan="' + cols.length + '" class="muted-note">Noch keine Mitglieder angemeldet.</td></tr>';

    // Haushalts-Beiträge (nur Finanz)
    if (fin && data.households) {
      $("#households").hidden = false;
      $("#households-table").querySelector("tbody").innerHTML = data.households.map((h) =>
        "<tr><td><b>" + esc(h.ownerName) + "</b></td><td>" + esc(h.ownerEmail) + "</td><td>" + esc(h.iban || "—") + "</td>" +
        "<td>" + h.activeCount + "</td><td><b>" + h.effectiveTotal + " €</b>" + (h.familyApplied ? ' <span class="badge badge--aktiv">Familie</span>' : "") + "</td></tr>"
      ).join("");
    }

    $("#members-loading").hidden = true;
    $("#members").hidden = false;
  }

  init();
})();
