# Astro-Gerüst (generisch, branding-neutral)

Das geteilte, generische Frontend des Vereins-Baukastens, gebaut mit **Astro** aus **einer**
Layout-Komponente (`src/layouts/Base.astro`) statt aus 17× kopiertem HTML. Eine Navi-/Footer-Änderung
= **eine** Datei. Dieses Gerüst enthält **kein** Club-Branding — es ist Teil des geteilten Produkts und
fließt `fork → main → forks`.

## Wie das Branding reinkommt

- **Aktiver Verein:** `src/active-club.mjs` liest `BSG_CLUB_ID` (GitHub-Repo-Variable; Default
  `musterverein`) und lädt daraus `../assets/data/club.<id>.json` — **Single Source of Truth** (dieselbe
  Datei seedet der Mock über `clubSeed`). Kein zweiter Branding-Ort, kein Regex-Stempel.
- **`Base.astro`** rendert daraus FOUC-frei `window.BSG_CLUB`, Theme-Link, Titel und Marke und ist
  **config-gesteuert** (Navi/Footer/Socials/CTA/Akzent-Balken aus `club.<id>.json`).
- **Inhaltsseiten** binden club-spezifische Blöcke aus der Config (`home`, `represented_by`, …) bzw.
  über editierbare `data-site`-Texte und die unveränderten Vanilla-JS-Skripte.

Vollständige Beschreibung der Grenze: **`docs/layout-branding-separation.md`** (Repo-Root).

## Ausführen

```bash
npm install
npm run dev                     # http://localhost:4321 (kopiert vorher ../assets nach public/assets)
npm run build                   # baut Musterverein nach dist/ (+ PWA via scripts/gen-pwa.mjs)
BSG_CLUB_ID=bsg npm run build   # baut den Verein "bsg"
```

`npm run sync-assets` (prebuild) hält `../assets` als Single Source of Truth; `scripts/gen-pwa.mjs`
erzeugt `manifest.webmanifest` + `service-worker.js` aus der aktiven Club-Config.

## Build-Form

`astro.config.mjs` nutzt `build: { format: "file" }` → Ausgabe `index.html`, `kontakt.html` (gleiche
URL-Form wie zuvor), damit die `.html`-Links und das JS unverändert passen.
