/* =====================================================================
   public.spec.mjs – öffentliche Seiten rendern echte Backend-Seed-Daten.
   Beweist im Browser: gepatchte fetch (real-Modus) -> server/ -> Seed-JSON
   wird im DOM dargestellt. Bricht, sobald das Backend nicht liefert.
   ===================================================================== */
import { test, expect } from "./fixtures.mjs";

test.describe("Öffentliche Seiten", () => {
  test("Startseite zeigt den Hero-Text", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('[data-site="hero_title"]')).toHaveText("Stark auf der Matte.");
  });

  test("Aktuelles rendert Seed-News aus dem Backend", async ({ page }) => {
    await page.goto("/aktuelles.html");
    // Eindeutiger Seed-News-Titel (assets/data/news.json) – erscheint nur, wenn /api/news geladen wurde.
    await expect(
      page.getByText("BSG-Judoka feiern internationalen Erfolg").first()
    ).toBeVisible();
  });

  test("Trainingszeiten rendert Seed-Einträge aus dem Backend", async ({ page }) => {
    await page.goto("/trainingszeiten.html");
    // Eindeutiger Seed-Beschreibungstext (assets/data/trainingszeiten.json).
    await expect(
      page.getByText("Spielerischer Einstieg", { exact: false }).first()
    ).toBeVisible();
  });
});
