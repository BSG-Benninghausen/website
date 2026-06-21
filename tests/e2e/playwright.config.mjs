/* =====================================================================
   playwright.config.mjs – Browser-E2E gegen das echte Backend (packages/backend).
   Playwright startet packages/backend/index.mjs selbst (Static + /api/* same-origin,
   Dev-Modus: devCode + /api/test/reset) und fährt Chromium dagegen.
   ===================================================================== */
import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const PORT = process.env.E2E_PORT || "4173";          // eigener Port, kollidiert nicht mit Port 3000 der Contract-Tests
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.mjs",
  // Backend ist ein einzelner In-Process-Store; Tests laufen seriell und isolieren sich
  // über POST /api/test/reset (siehe fixtures.mjs).
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "node packages/backend/index.mjs",
    cwd: repoRoot,
    url: baseURL,
    // BSG_CLUB_NS=bsg: das Backend seedet die club-spezifischen Inhalte (*.bsg.json),
    // damit die öffentlichen E2E-Asserts (BSG-Hero/News) gegen den echten Fork-Stand laufen.
    env: { PORT: String(PORT), BSG_DEV: "1", BSG_STATIC: "1", BSG_CLUB_NS: "bsg" },
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
