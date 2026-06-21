# Fork-Onboarding: eigenen Verein aufsetzen

Dieses Repo ist das **generische Produkt**. Ein Verein betreibt seine eigene Website als **Fork**
und stellt darin seine Marke als **Konfiguration** ein – ohne den geteilten Code zu verändern.
So bleibt `git pull upstream main` (Bugfixes/Features aus dem Haupt-Repo) konfliktfrei, und
Verbesserungen lassen sich als PR zurückgeben.

> **Hinweis:** GitHub erlaubt **keinen Fork ins selbe Konto**, das das Repo besitzt. Ein echter
> Fork (mit Upstream-Beziehung für Issues/PRs) braucht ein **anderes Konto/eine andere Org**.

## 1. Forken

1. Repo unter **anderem Konto/Org** forken (`Fork`-Button).
2. Lokal klonen, Upstream-Remote setzen:
   ```bash
   git remote add upstream https://github.com/crypticalcode/vereins-baukasten.git
   git fetch upstream
   ```

## 2. Vereins-Konfiguration anlegen (eine Datei + Theme + Seeds)

Das Astro-Layout (`astro-poc/src/layouts/Base.astro`) liest die **gesamte Marke zur Build-Zeit aus
einer Datei**: `astro-poc/src/data/club.json`. Daraus werden `manifest.webmanifest` und
`service-worker.js` erzeugt (`npm run gen-pwa`) und das Theme verlinkt. Ein anderer Verein tauscht
also nur **club.json (+ Theme + Seeds + Bilder)** – geteilter Code bleibt unangetastet.

1. **Club-Daten:** `astro-poc/src/data/club.example.json` → `astro-poc/src/data/club.json` kopieren
   und ausfüllen. Felder:
   - **Technik/Verdrahtung:** `id`, `ns` (localStorage-/Seed-Namespace + SW-Cache-Name),
     `clubSeed` (Club-Seed-Datei in `assets/data/`), `admin_email` (Seed-Admin),
     `theme_css` (Pfad zum Theme).
   - **Marke/Text:** `brand_name`, `name`, `short_name`, `sport`, `brand_sub`, `tagline`,
     `locality`, `email`, `instagram_url`/`instagram_handle`, `venue`, `street`, `city`,
     `description`, `logo`, `theme_color`, `background_color`, `passPrefix`.
2. **Theme:** `assets/css/theme.musterverein.css` → `assets/css/theme.<id>.css` kopieren und
   Farben/Schrift anpassen (nur Design-Tokens; `styles.css` nicht anfassen). In `club.json`
   `"theme_css": "assets/css/theme.<id>.css"` setzen.
3. **Inhalte:** Seeds in `assets/data/` als `*.<ns>.json` ablegen (`club.<ns>.json`,
   `news.<ns>.json`, `site.<ns>.json`, `trainingszeiten.<ns>.json`, `events.<ns>.json`) – oder über
   die Redaktions-UI pflegen. Fehlt ein Namespace-Seed, greift der generische Default (`*.json`).
4. **Branding-Assets:** Logo/Favicon/PWA-Icons in `assets/img/` ersetzen (Dateinamen beibehalten:
   `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `favicon.png`, `apple-touch-icon.png`)
   und den `logo`-Pfad in `club.json` setzen.

## 3. PWA & „Default" — entfällt

Single-Tenant: **`club.json` IST die Seite.** Es gibt keinen `?club=`-Resolver und keine
`club-config.js`-Registry mehr – die zu setzende Marke ist einfach der Inhalt von `club.json`.
`manifest.webmanifest` und `service-worker.js` werden beim Build aus `club.json` generiert
(`astro-poc/scripts/gen-pwa.mjs`, läuft als `prebuild`) und sind deshalb **nicht eingecheckt**.
Cache-Bust: `VERSION` in `gen-pwa.mjs` bei jedem Release erhöhen.

## 4. Admin-Adresse & Cache-Namespace

- **Seed-Admin-Adresse:** `admin_email` in `club.json` (der Mock liest `window.BSG_ADMIN_EMAIL`,
  das `Base.astro` daraus setzt); im echten Backend (`packages/backend/`) über die Env-Variable
  `ADMIN_EMAIL`.
- **Cache-/Storage-Namespace:** `ns` in `club.json` steuert den localStorage-Namespace und die
  Service-Worker-Cache-Namen (`<ns>-astro-…`) – falls mehrere Deployments denselben Origin teilen.

## 5. Deployen

- **GitHub Pages:** `deploy-pages.yml` läuft im Fork automatisch beim Push auf `main` → eigene
  Pages-Seite (Mock-Modus, ohne echtes Backend). Pages im Fork-Repo aktivieren.
- **Eigenes Backend (optional):** `packages/backend/` ist das generische Real-Backend (Start &
  Env-Variablen: `packages/backend/README.md`). Für einen echten Mandanten den Deploy (z. B.
  Reverse-Proxy + systemd) im Fork halten und `api-config.js` per Deploy-Patch auf `mode: "real"`
  stellen. Hintergrund zur Backend-/Deploy-Trennung: `docs/backend-repo-separation-plan.md`.

## 6. Aktuell bleiben & beitragen

- **Updates ziehen:** `git fetch upstream && git merge upstream/main` (oder Rebase). Weil deine
  Vereins-Dateien Upstream **nicht** gehören, bleiben Pulls konfliktfrei; nur deine wenigen
  Default-/Theme-Anpassungen können selten kollidieren.
- **Beitragen:** Bugs/Wünsche als **Issue** im Haupt-Repo; Fixes/Features als **PR aus dem Fork**
  gegen `main` (vereins-neutral, ohne deine club-spezifischen Inhalte). Siehe
  [`CONTRIBUTING.md`](../CONTRIBUTING.md).
- **Automatischer Mergeback (optional):** Setze die Repo-Variable `MERGEBACK_ENABLED=true` und die
  Secrets `ANTHROPIC_API_KEY` + die GitHub-App-Credentials, dann übernimmt ein Bot den Upstream-PR
  für dich: er extrahiert aus deinen Fork-PRs den generischen, vereins-neutralen Anteil und schlägt
  ihn automatisch im Haupt-Repo vor. Setup & Details:
  [`docs/mergeback-pipeline.md`](mergeback-pipeline.md).
