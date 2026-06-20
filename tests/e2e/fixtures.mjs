/* =====================================================================
   fixtures.mjs – gemeinsame Test-Basis für die E2E-Suiten.
     • zwingt das Frontend in den "real"-Modus (gepatchte fetch -> echtes
       Backend), indem vor jedem Seitenskript localStorage gesetzt wird.
       api-config.js liest bsg_api_mode aus localStorage (siehe dort), das
       gilt damit über Navigationen hinweg – auch nach dem Redirect auf
       konto.html.
     • setzt das Backend vor jedem Test via POST /api/test/reset auf den
       Seed-Zustand zurück (Isolation, analog zur Contract-Suite).
   ===================================================================== */
import { test as base, expect } from "@playwright/test";

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem("bsg_api_mode", "real");
        localStorage.setItem("bsg_api_base", "");   // same-origin /api
      } catch (e) {}
    });
    await use(page);
  },
});

test.beforeEach(async ({ request }) => {
  const res = await request.post("/api/test/reset");
  expect(res.ok(), "POST /api/test/reset muss im Dev-Modus erreichbar sein").toBeTruthy();
});

export { expect };
