import { defineConfig } from "astro/config";
import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { activeClubId } from "./src/active-club.mjs";

/* build:{format:"file"} -> gleiche URL-Form wie zuvor (index.html, kontakt.html),
   damit die vorhandenen Links/JS (mit .html) unverändert funktionieren.

   Fork-eigene Zusatzseiten (z. B. ein vereinsspezifischer Shop) liegen NICHT im
   geteilten src/pages/ – das bleibt branding-neutral und byte-identisch zwischen
   main und Forks. Stattdessen liegen sie additiv in club-pages/<id>/*.astro
   (fork-eigene Dateien). Diese Integration injiziert sie zur Build-Zeit als Routen
   für den aktiven Verein (BSG_CLUB_ID). Musterverein/main hat keinen solchen
   Ordner -> No-op. So bekommt ein Fork eigene Seiten, ohne geteilten Code zu ändern. */
function clubPages() {
  return {
    name: "club-pages",
    hooks: {
      "astro:config:setup": ({ injectRoute, logger }) => {
        const id = activeClubId();
        const dir = fileURLToPath(new URL(`./club-pages/${id}/`, import.meta.url));
        if (!existsSync(dir)) return;
        for (const file of readdirSync(dir)) {
          if (!file.endsWith(".astro")) continue;
          const name = file.slice(0, -6); // ".astro"
          injectRoute({ pattern: `/${name}`, entrypoint: `./club-pages/${id}/${file}` });
          logger?.info?.(`club-page: /${name} (${id})`);
        }
      },
    },
  };
}

export default defineConfig({
  build: { format: "file" },
  integrations: [clubPages()],
});
