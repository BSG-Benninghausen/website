/* Permission-basierter Nav-Reveal – Negativ-/Sicherheitsfälle.
   (Der Admin-Positivfall ist in auth.spec.mjs abgedeckt.) */
import { test, expect } from "./fixtures.mjs";
import { registerMember, uniqueEmail, hiddenState } from "./helpers.mjs";

const PROTECTED = ["[data-admin-link]", "[data-redaktion-link]", "[data-members-link]"];

test("Frisches Mitglied sieht die geschützten Nav-Links nicht", async ({ page }) => {
  await registerMember(page, { name: "Test Mitglied", email: uniqueEmail("member") });
  await page.goto("/aktuelles.html");
  // Eingeloggt (Konto-Menü da), aber ohne Rechte bleiben die Links verborgen.
  await expect.poll(() => hiddenState(page, "[data-account-menu]")).toBe(false);
  for (const sel of PROTECTED) {
    await expect.poll(() => hiddenState(page, sel)).toBe(true);
  }
});

test("Mitglied ohne Rechte wird von admin.html weggeleitet", async ({ page }) => {
  await registerMember(page, { name: "Test Mitglied", email: uniqueEmail("member") });
  await page.goto("/admin.html");
  await page.waitForURL("**/konto.html");
});
