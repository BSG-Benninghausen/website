/* =====================================================================
   public.spec.mjs – öffentliche Seiten rendern echte Backend-Seed-Daten.
   Beweist im Browser: gepatchte fetch (real-Modus) -> Backend -> Seed-JSON
   wird im DOM dargestellt. Bricht, sobald das Backend nicht liefert.

   Hinweis (Fork): die E2E bootet das GENERISCHE Contract-Backend
   (packages/backend, neutrale Seeds). Daher prüfen die Inhalts-Tests neutrale
   Seed-Inhalte – sie beweisen die Verdrahtung Backend -> DOM. Die BSG-Inhalte
   des Forks liegen im Mock (assets/data/*.bsg.json, club-bewusstes Seeding) und
   werden von den Contract-Tests abgedeckt; ein BSG-Real-Backend ist eine
   Deploy-/Backend-Frage (Club-Awareness, noch offen). Fork-spezifisch ist hier
   nur der Wurzel-Redirect auf die Vereinsseite. Siehe docs/bidirectional-sync.md.
   ===================================================================== */
import { test, expect } from "./fixtures.mjs";

test.describe("Öffentliche Seiten", () => {
  test("Wurzel (/) leitet auf die BSG-Vereinsseite", async ({ page }) => {
    // Dieser Fork IST die BSG-Vereinsseite: "/" leitet direkt auf
    // home.html?club=bsg (statt auf das generische Produkt-Portal des Upstreams).
    await page.goto("/");
    // Club-Pinning per Query muss erhalten bleiben (?club=bsg), nicht nur home.html.
    await expect(page).toHaveURL(/home\.html\?club=bsg/);
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
