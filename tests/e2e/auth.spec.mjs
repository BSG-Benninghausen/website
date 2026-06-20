/* =====================================================================
   auth.spec.mjs – voller Login-Flow im Browser + rechtebasierte Navigation.
   Browser -> /api/auth/request-code (Dev-Backend liefert devCode, auth.js
   trägt ihn ein) -> /api/auth/login (Session-Cookie) -> Redirect konto.html
   -> /api/auth/me -> main.js deckt Admin-/Redaktions-Navigation auf.
   ===================================================================== */
import { test, expect } from "./fixtures.mjs";

const ADMIN_EMAIL = "admin@bsg-benninghausen.de";

test("Login als Seed-Admin: Code-Flow und rechtebasierte Navigation", async ({ page }) => {
  await page.goto("/login.html");

  // Schritt 1: E-Mail eingeben, Code anfordern.
  await page.fill("#req-form [name=email]", ADMIN_EMAIL);
  await page.click("#req-form [type=submit]");

  // Schritt 2 erscheint; auth.js hat den devCode bereits eingetragen.
  await expect(page.locator("#verify-form")).toBeVisible();
  await expect(page.locator("#verify-form [name=code]")).not.toHaveValue("");

  // Einloggen -> Weiterleitung ins Konto.
  await page.click("#verify-form [type=submit]");
  await page.waitForURL("**/konto.html");

  // Eingeloggt: das Konto-Menü erscheint in der Navigation (statt des Login-Links).
  await expect(page.locator("[data-account-menu]")).toBeVisible();

  // Konto-Dropdown öffnen -> main.js hat die geschützten Links anhand der Admin-Rechte aufgedeckt.
  await page.locator(".nav__user-btn").click();
  await expect(page.locator("[data-admin-link]")).toBeVisible();
  await expect(page.locator("[data-redaktion-link]")).toBeVisible();
});
