/* =====================================================================
   active-club.mjs – Build-Zeit-Resolver für den aktiven Verein (White-Label).

   Das generische Astro-Gerüst ist branding-neutral. WELCHER Verein gebaut wird,
   entscheidet ALLEIN diese Datei – analog zu assets/js/club-config.js zur
   Laufzeit, aber hier zur BUILD-Zeit:

     1. Umgebungsvariable BSG_CLUB_ID  (im Deploy via GitHub-Repo-Variable
        `vars.BSG_CLUB_ID` gesetzt – KEIN committetes Shared-File, reist also
        in keine Merge-Richtung mit).
     2. Eingebauter Default DEFAULT_ID = "musterverein" (neutrale Vorlage).

   Single Source of Truth: gelesen wird `assets/data/club.<id>.json` – exakt die
   Datei, aus der auch der Mock seeded (clubSeed). Fällt sie weg, greift der
   generische `club.json`. Identitäts-/PWA-Felder werden – wenn nicht gesetzt –
   konventionell aus der id abgeleitet (ns=id, theme.<id>.css, club.<id>.json).

   So liefert ein Fork NUR `assets/data/club.<id>.json` (+ Theme + Seeds + Bilder)
   und setzt `vars.BSG_CLUB_ID` – ohne eine einzige geteilte .astro/.js zu ändern.
   ===================================================================== */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
/* Die Vereins-/Seed-Daten liegen im Hauptrepo unter assets/ (eine Ebene über
   dem Astro-Gerüst) – Single Source of Truth, wird per sync-assets kopiert. */
const DATA_DIR = resolve(__dirname, "../../assets/data");

export const DEFAULT_ID = "musterverein";

export function activeClubId() {
  const raw = process.env.BSG_CLUB_ID || process.env.PUBLIC_BSG_CLUB_ID || "";
  // Seed-/Theme-Dateien sind klein geschrieben (club.bsg.json) -> id normalisieren,
  // damit BSG_CLUB_ID=BSG nicht auf kaputte Pfade (club.BSG.json) führt.
  const id = raw.trim().toLowerCase();
  return /^[a-z0-9_-]+$/.test(id) ? id : DEFAULT_ID;
}

function readJson(file) {
  return JSON.parse(readFileSync(resolve(DATA_DIR, file), "utf8"));
}

/* Lädt die Club-Config für die aktive (oder explizit übergebene) id, mit
   generischem Fallback und konventionellen Defaults für die Build-/PWA-Felder.
   base wird ZUERST gespreizt, danach gewinnen die abgeleiteten Felder – so bleibt
   der Resolver die Quelle der Wahrheit für id/ns/clubSeed/theme_css, auch wenn die
   JSON diese Felder leer lässt oder weglässt. */
export function loadClub(id = activeClubId()) {
  let base;
  try {
    base = readJson(`club.${id}.json`);
  } catch (e) {
    base = readJson("club.json"); // generischer Fallback
  }
  return {
    ...base,
    id,
    ns: base.ns || id,
    clubSeed: base.clubSeed || `club.${id}.json`,
    theme_css: base.theme_css || `assets/css/theme.${id}.css`,
    admin_email: base.admin_email || `admin@${id}.example`,
    short_name: base.short_name || base.brand_name || base.name,
    background_color: base.background_color || base.theme_color || "#0d0d12",
  };
}
