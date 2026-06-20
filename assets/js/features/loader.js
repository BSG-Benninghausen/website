/* =====================================================================
   features/loader.js – capability-gesteuertes Feature-Gating (ES-Modul)
   ---------------------------------------------------------------------
   Holt /api/capabilities (nutzer-spezifisch) und steuert je [data-feature]:
     • nicht freigegeben -> Element wird ausgeblendet (und ein etwaiges Modul
       NIE importiert -> deaktivierter Feature-Code läuft nicht);
     • freigegeben -> Element sichtbar, optional Badge (Beta/intern), und – falls
       data-feature-module gesetzt – das isolierte Modul dynamisch nachgeladen.
   Kern-Seiten ohne [data-feature] bleiben immer sichtbar. Fail-closed: ohne
   gültige Antwort (und ohne Cache) bleiben annotierte Features verborgen.
   ===================================================================== */
const CACHE_KEY = "bsg_caps";
const V = new URL(import.meta.url).search; // ?v=NN -> an dynamische Importe weiterreichen

const read = () => { try { return JSON.parse(sessionStorage.getItem(CACHE_KEY) || "null"); } catch (e) { return null; } };
const write = (c) => { try { c ? sessionStorage.setItem(CACHE_KEY, JSON.stringify(c)) : sessionStorage.removeItem(CACHE_KEY); } catch (e) {} };

const loadedModules = new Set();

function badgeFor(info) {
  if (!info.public) return { cls: "badge--intern", text: info.status === "beta" ? "Beta · intern" : "Intern" };
  if (info.status === "beta") return { cls: "badge--beta", text: "Beta" };
  return null; // öffentlich + stable -> kein Badge
}
function applyBadge(el, info) {
  const slot = el.querySelector("[data-feature-badge]");
  const b = badgeFor(info);
  if (!b) { if (slot) slot.replaceChildren(); return; }
  const span = document.createElement("span");
  span.className = "badge " + b.cls + " feature-badge";
  span.textContent = b.text;
  if (slot) slot.replaceChildren(span);
  else if (!el.querySelector(":scope > .feature-badge")) el.appendChild(span);
}
async function mountModule(el, key, info) {
  const mod = el.getAttribute("data-feature-module");
  if (!mod || loadedModules.has(key)) return;
  loadedModules.add(key);
  try {
    const m = await import("./" + mod + ".js" + V);
    if (m && typeof m.default === "function") m.default(el, info);
  } catch (err) { console.warn("[features] Modul nicht geladen:", key, err); }
}
function apply(caps) {
  const feats = (caps && caps.features) || {};
  document.querySelectorAll("[data-feature]").forEach((el) => {
    const key = el.getAttribute("data-feature");
    const info = feats[key];
    if (!info) { el.hidden = true; return; }
    el.hidden = false;
    applyBadge(el, info);
    mountModule(el, key, info);
  });
}
function hideAll() {
  document.querySelectorAll("[data-feature]").forEach((el) => { el.hidden = true; });
}
async function refresh(failClosed) {
  // Bei Auth-Wechsel fail-closed: alten Cache verwerfen und sofort ausblenden,
  // bis frische, nutzer-spezifische Capabilities erfolgreich geladen sind.
  // Beim Erstaufruf optimistisch aus dem Cache rendern (flackerfrei).
  const cached = failClosed ? null : read();
  if (failClosed) { write(null); hideAll(); }
  else if (cached) apply(cached);
  try {
    const r = await fetch("/api/capabilities");
    const d = await r.json();
    if (d && d.ok) { write(d); apply(d); }
    else if (!cached) hideAll();
  } catch (e) { if (!cached) hideAll(); }
}

if (document.querySelector("[data-feature]")) {
  refresh();
  // Auth-Wechsel (Login/Logout) -> fail-closed neu holen (main.js feuert das Event).
  window.addEventListener("bsg:auth-change", () => refresh(true));
}
