/* CRUD im Redaktions-Hub (News): anlegen → erscheint → löschen → weg. */
import { test, expect } from "./fixtures.mjs";
import { loginViaApi, ADMIN_EMAIL } from "./helpers.mjs";

test("News-Eintrag anlegen und wieder löschen", async ({ page }) => {
  await loginViaApi(page, ADMIN_EMAIL);
  await page.goto("/redaktion.html");

  // News-Bereich ist nach der Rechte-Prüfung sichtbar.
  await expect(page.locator("#news-section")).toBeVisible();

  const title = "E2E-Meldung " + Date.now();

  // Anlegen (Titel ≥3, Datum, Anriss ≥10 Zeichen sind Pflicht).
  await page.fill("#n-title", title);
  await page.fill("#n-date", "2026-07-01");
  await page.fill("#n-excerpt", "Automatischer E2E-Testeintrag zur Prüfung des Redaktions-CRUD.");
  await page.click("#news-form [type=submit]");

  // Erscheint in der Liste.
  const row = page.locator("#news-list .adm-role", { hasText: title });
  await expect(row).toHaveCount(1);

  // Löschen (confirm bestätigen).
  page.on("dialog", (d) => d.accept());
  await row.locator("[data-del]").click();

  // Verschwindet wieder.
  await expect(page.locator("#news-list .adm-role", { hasText: title })).toHaveCount(0);
});
