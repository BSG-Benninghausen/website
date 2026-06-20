/* =====================================================================
   features/beitragsrechner.js – Beispiel für ein isoliertes Feature-Modul.
   ---------------------------------------------------------------------
   Wird vom Loader NUR geladen, wenn die Capability „beitragsrechner" für den
   aktuellen Nutzer freigegeben ist. Der Code ist gekapselt: er importiert keine
   geteilten Helfer destruktiv, nutzt nur die öffentliche /api/membership-types
   und den globalen BSG.escape (lesend). So kann ein deaktiviertes/Beta-Feature
   stabile Features nicht zur Laufzeit beeinflussen.
   ===================================================================== */
export default function init(root) {
  const mount = root.querySelector("[data-calc-mount]") || root;
  if (mount.dataset.featureMounted) return; // idempotent (Loader kann mehrfach laufen)
  mount.dataset.featureMounted = "1";
  const esc = (window.BSG && BSG.escape) ? BSG.escape : (s) => String(s == null ? "" : s);

  const box = document.createElement("div");
  box.className = "calc-box";
  box.innerHTML =
    '<div class="field"><label for="calc-age">Alter</label>' +
    '<input id="calc-age" type="number" min="0" max="120" step="1" placeholder="z. B. 12"></div>' +
    '<p class="calc-result muted-note" data-calc-result>Lade Beitragstabelle …</p>';
  mount.appendChild(box);

  const input = box.querySelector("#calc-age");
  const out = box.querySelector("[data-calc-result]");
  let bands = null;

  function compute() {
    if (!bands) { out.textContent = "Lade Beitragstabelle …"; return; }
    const age = parseInt(input.value, 10);
    if (isNaN(age)) { out.textContent = "Bitte ein Alter eingeben."; return; }
    const band = bands.find((b) => age >= b.minAge && age <= b.maxAge) || bands[bands.length - 1];
    out.textContent = band ? (esc(band.label) + ": " + band.feeMonthly + " € / Monat") : "Keine passende Beitragsklasse.";
  }

  input.addEventListener("input", compute);
  fetch("/api/membership-types")
    .then((r) => r.json())
    .then((d) => { if (d && d.ok) bands = d.ageBands || []; compute(); })
    .catch(() => { out.textContent = "Beitragstabelle konnte nicht geladen werden."; });
}
