import { defineConfig } from "astro/config";

// PoC: gleiche URL-Form wie die bestehende Seite (index.html, kontakt.html),
// damit die vorhandenen Links/JS (mit .html) unverändert funktionieren.
export default defineConfig({
  build: { format: "file" },
});
