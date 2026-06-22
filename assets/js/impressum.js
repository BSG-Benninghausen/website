/* =====================================================================
   impressum.js – füllt rechtliche Angaben (Impressum/Datenschutz) mit den
   aktuellen Amtsinhabern aus den Vereinsämtern (GET /api/team, öffentlich).

   So aktualisieren sich Vorstand und Verantwortliche automatisch, sobald in
   Admin → Vereinsämter ein neuer Vorstand hinterlegt wird – ohne Code-Änderung.
   Dieselbe Quelle wie die Team-Seite (Ämter × Nutzer), kein eigener Endpoint.

   Container (alle optional; ohne JS/API bleibt der statische HTML-Fallback
   stehen, sodass die Seite rechtlich gültig bleibt):
   - [data-impressum-vorstand]    Impressum: „Vertreten durch den Vorstand"
                                  (nur Vorsitzende, § 26 BGB)
   - [data-impressum-responsible] Impressum: inhaltlich Verantwortliche/r
                                  (§ 18 Abs. 2 MStV)
   - [data-impressum-rep]         Datenschutz: Vertreter/in des Verantwortlichen
   ===================================================================== */
(function () {
  "use strict";

  const elVorstand = document.querySelector("[data-impressum-vorstand]");
  const elResponsible = document.querySelector("[data-impressum-responsible]");
  const elRep = document.querySelector("[data-impressum-rep]");
  if (!elVorstand && !elResponsible && !elRep) return;

  const esc = (v) => BSG.escape(v == null ? "" : v);
  const isChair = (m) => /vorsitz/i.test(m.label);
  const isPress = (m) => /presse/i.test(m.label);
  const line = (m) => esc(m.name) + " (" + esc(m.label) + ")";

  async function load() {
    let board;
    try {
      const data = await (await fetch("/api/team")).json();
      if (!data.ok) throw new Error();
      // /api/team liefert Ämter × Nutzer bereits nach order sortiert.
      board = (data.items || []).filter((m) => m.group === "vorstand");
    } catch (e) {
      return; // statischer Fallback im HTML bleibt unverändert
    }
    if (!board.length) return;

    // „Vertreten durch den Vorstand": nur Vorsitzende (z. B. 1./2. Vorsitzende/r).
    if (elVorstand) {
      const chairs = board.filter(isChair);
      if (chairs.length) {
        elVorstand.innerHTML =
          "<b>Vertreten durch den Vorstand:</b><br>" +
          chairs.map(line).join("<br>");
      }
    }

    // Inhaltlich Verantwortliche/r (§ 18 Abs. 2 MStV): Presse → Vorsitz → erstes Amt.
    if (elResponsible) {
      const person = board.find(isPress) || board.find(isChair) || board[0];
      elResponsible.innerHTML =
        "<b>Verantwortlich für den Inhalt (§ 18 Abs. 2 MStV):</b><br>" +
        line(person) + ", Anschrift wie oben.";
    }

    // Datenschutz: Vertreter/in des Verantwortlichen (1. Vorsitzende/r).
    if (elRep) {
      const person = board.find(isChair) || board[0];
      elRep.textContent = person.name;
    }
  }

  load();
})();
