/* =====================================================================
   helpers.mjs – Login-/Registrier-Helfer für die E2E-Suiten.
   Ergänzt fixtures.mjs (real-Modus + /api/test/reset). Anmeldungen laufen
   über page.request – die Session-Cookie landet im gemeinsamen Kontext,
   sodass anschließende Navigationen eingeloggt rendern.
   ===================================================================== */

export const ADMIN_EMAIL = "admin@bsg-benninghausen.de";

/* Bestehenden Nutzer per API einloggen (devCode nur in BSG_DEV=1). */
export async function loginViaApi(page, email) {
  const rc = await page.request.post("/api/auth/request-code", { data: { email } });
  const body = await rc.json();
  if (!body.devCode) throw new Error("kein devCode – läuft das Backend mit BSG_DEV=1?");
  const res = await page.request.post("/api/auth/login", { data: { email, code: body.devCode } });
  if (!res.ok()) throw new Error("login fehlgeschlagen: " + res.status());
}

/* Neues Mitglied per API anlegen (erstellt + meldet an). */
export async function registerMember(page, { name, email }) {
  const res = await page.request.post("/api/auth/register", { data: { name, email, privacy: true } });
  if (!res.ok()) throw new Error("register fehlgeschlagen: " + res.status());
}

/* Pro Lauf eindeutige E-Mail. */
export function uniqueEmail(prefix = "e2e") {
  return `${prefix}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@example.com`;
}

/* Liest die .hidden-Property eines Elements (Nav-Reveal togglet diese). */
export function hiddenState(page, selector) {
  return page.locator(selector).evaluate((el) => el.hidden);
}
