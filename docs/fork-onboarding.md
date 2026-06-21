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

## 2. Vereins-Konfiguration anlegen (nur additive, dir gehörende Dateien)

1. **Club-Daten:** `assets/data/club.example.json` → `assets/data/club.<id>.json` kopieren und
   ausfüllen (Name, Sport, Adresse, Kontakt, Instagram, Logo-Pfad, `theme_color`). Schema =
   `CLUB_FIELDS` in `assets/js/mock-api.js`.
2. **Theme:** `assets/css/theme.example.css` → `assets/css/theme.<id>.css` kopieren und Farben/
   Schrift anpassen (nur Design-Tokens; `styles.css` nicht anfassen).
3. **Registry-Eintrag:** in `assets/js/club-config.js` im `EXAMPLES`-Array einen Eintrag ergänzen:
   ```js
   {
     id: "<id>", name: "<Verein> e.V.", sport: "<Sportart>", locality: "<Ort>",
     status: "live", clubSeed: "club.<id>.json", theme: "assets/css/theme.<id>.css",
     accent: "#rrggbb", summary: "…",
   }
   ```
4. **Inhalte (optional):** eigene `news`/`events`/`site`/`trainingszeiten` über die Redaktions-UI
   pflegen oder die Seed-JSONs in `assets/data/` ersetzen.
5. **Branding-Assets:** Logo/Favicon/PWA-Icons in `assets/img/` ersetzen; in `club.<id>.json`
   den `logo`-Pfad setzen.

## 3. Den eigenen Verein als Default einstellen

Drei Wege – je weniger geteilte Zeilen du editierst, desto konfliktfreier bleiben Upstream-Pulls:

- **Empfohlen (konfliktfrei): Deploy-Default-Hook.** `assets/js/club-config.js` liest vor der
  Auflösung `window.BSG_CLUB_DEFAULT` (analog `window.BSG_API` in `api-config.js`). Setze ihn per
  Deploy-Zeit-Patch, z. B. im eigenen Deploy-Workflow (wie heute `api-config.js` gepatcht wird):
  ```bash
  # club-config.js so ausliefern, dass dein Verein der Default ist:
  sed -i 's/var DEFAULT_ID = "demo";/var DEFAULT_ID = "<id>";/' assets/js/club-config.js
  ```
  Reihenfolge der Auflösung: `?club=` → `localStorage bsg_example` → `window.BSG_CLUB_DEFAULT`
  → eingebautes `DEFAULT_ID`.
- **Einfach: eine Zeile committen.** `DEFAULT_ID = "<id>"` direkt setzen (minimaler, seltener
  Konflikt-Abdruck beim Pull, da Upstream diese Zeile selten ändert).

## 4. Optional: Admin-Adresse & Cache-Namespace

- **Seed-Admin-Adresse:** im Mock über `window.BSG_ADMIN_EMAIL`, im echten Backend
  (`packages/backend/`) über die Env-Variable `ADMIN_EMAIL`. Default bleibt sonst der Upstream-Wert.
- **Service-Worker-Cache-Namespace:** `CACHE_NS` in `service-worker.js` (Default `app`) auf einen
  eigenen Prefix setzen, falls mehrere Deployments denselben Origin teilen.

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
