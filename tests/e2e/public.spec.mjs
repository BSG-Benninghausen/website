/* =====================================================================
   public.spec.mjs – öffentliche Seiten rendern echte Backend-Seed-Daten.
   Beweist im Browser: gepatchte fetch (real-Modus) -> server/ -> Seed-JSON
   wird im DOM dargestellt. Bricht, sobald das Backend nicht liefert.
   ===================================================================== */
import { test, expect } from "./fixtures.mjs";

test.describe("Öffentliche Seiten", () => {
  test("Produkt-Portal rendert das Musterverein-Referenz-Beispiel", async ({ page }) => {
    // Startseite ("/") ist das generische Produkt-Portal; der Default-Verein
    // (Musterverein) ist eines von mehreren Referenz-Beispielen, erreichbar über home.html.
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Musterverein" }).first()).toBeVisible();
  });

  test("Vereins-Startseite (home.html) zeigt den Hero-Text", async ({ page }) => {
    await page.goto("/home.html");
    await expect(page.locator('[data-site="hero_title"]')).toHaveText("Stark im Team.");
  });

  test("Aktuelles rendert Seed-News aus dem Backend", async ({ page }) => {
    await page.goto("/aktuelles.html");
    // Eindeutiger Seed-News-Titel (assets/data/news.json) – erscheint nur, wenn /api/news geladen wurde.
    await expect(
      page.getByText("Starker Auftritt beim Vereinsturnier").first()
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
