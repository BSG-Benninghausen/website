/* PWA: Service-Worker-Registrierung, Manifest und Offline-Navigation –
   nur im echten Browser verifizierbar. */
import { test, expect } from "./fixtures.mjs";

test("Service Worker registriert und aktiviert sich", async ({ page }) => {
  await page.goto("/");
  const active = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return !!(reg && reg.active);
  });
  expect(active).toBe(true);
});

test("Manifest ist verlinkt und ladbar (mit Icons)", async ({ page }) => {
  await page.goto("/");
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(href).toBe("manifest.webmanifest");

  const res = await page.request.get("/" + href);
  expect(res.ok()).toBe(true);
  const manifest = await res.json();
  expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
  expect(manifest.display).toBe("standalone");
});

test("Offline: bekannte Seite kommt aus dem Cache, unbekannte → offline.html", async ({ page, context }) => {
  // Erst online laden, damit der SW aktiv ist und die App-Shell precacht.
  await page.goto("/team.html");
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });

  await context.setOffline(true);

  // Bekannte, precachte Seite lädt weiterhin (aus dem Cache).
  await page.goto("/team.html");
  await expect(page.locator("h1")).toContainText("Team");

  // Unbekannte Route fällt auf offline.html zurück.
  await page.goto("/diese-seite-gibt-es-nicht.html");
  await expect(page.locator("body")).toContainText("Keine Verbindung");

  await context.setOffline(false);
});
