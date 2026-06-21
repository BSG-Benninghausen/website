/* =====================================================================
   playwright.config.mjs – Browser-E2E gegen das echte Backend.
   Seit Phase 3 (docs/backend-repo-separation-plan.md) lebt das Backend in einem
   eigenen Repo (gepinnt in backend-ref.json). Playwright bootet das ausgecheckte
   Backend selbst und liefert die Website same-origin daneben aus (Option A):
   BSG_BACKEND_DIR zeigt auf den Backend-Checkout, BSG_STATIC_DIR auf den
   Frontend-Root. Dev-Modus: devCode + /api/test/reset.

   Lokal: das Backend-Repo als Nachbarverzeichnis (../../../vereins-baukasten-backend)
   klonen ODER BSG_BACKEND_DIR auf einen Checkout setzen. In CI wird es vom e2e-Job
   ausgecheckt und BSG_BACKEND_DIR gesetzt (siehe .github/workflows/ci.yml).
   ===================================================================== */
import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const PORT = process.env.E2E_PORT || "4173";          // eigener Port, kollidiert nicht mit Port 3000 der Contract-Tests
const baseURL = `http://localhost:${PORT}`;

// Backend-Checkout auflösen: explizit via BSG_BACKEND_DIR, sonst Nachbarverzeichnis.
const backendDir = process.env.BSG_BACKEND_DIR
  ? resolve(process.env.BSG_BACKEND_DIR)
  : fileURLToPath(new URL("../../../vereins-baukasten-backend/", import.meta.url));

if (!existsSync(join(backendDir, "index.mjs"))) {
  throw new Error(
    `E2E-Backend nicht gefunden: ${join(backendDir, "index.mjs")}\n` +
    `Setze BSG_BACKEND_DIR auf einen Checkout von crypticalcode/vereins-baukasten-backend ` +
    `(gepinnter ref in backend-ref.json) oder klone es als Nachbarverzeichnis.`
  );
}

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
    command: `node ${JSON.stringify(join(backendDir, "index.mjs"))}`,
    cwd: repoRoot,
    url: baseURL,
    // BSG_STATIC_DIR lässt das Backend die Website (Frontend-Root) same-origin ausliefern.
    env: { PORT: String(PORT), BSG_DEV: "1", BSG_STATIC: "1", BSG_STATIC_DIR: repoRoot },
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
