# Contract-Tests (Mock ⇄ echtes Backend)

Dieselben Tests prüfen die `/api/*`-Schnittstelle wahlweise gegen den **In-Process-Mock**
(`assets/js/mock-api.js`) oder gegen ein **echtes Backend** über HTTP. So bleiben Mock und
zukünftiges Backend vertraglich in Sync – kein Build-Schritt, keine Abhängigkeiten, nur Node.

## Ausführen

```bash
# Mock-Modus (Default) – aus dem Repo-Root:
node packages/api-contract/run.mjs

# Nur bestimmte Suites (Teilstring des Dateinamens):
node packages/api-contract/run.mjs tournaments payouts

# Gegen ein laufendes echtes Backend:
node index.mjs &   # im Backend-Repo (crypticalcode/vereins-baukasten-backend), Port 3000
TEST_BASE=http://localhost:3000 node packages/api-contract/run.mjs
```

Exit-Code `0` = alles grün, sonst `1` (CI-tauglich).

Ein referenz-implementiertes echtes Backend liegt im eigenen Repo
[`crypticalcode/vereins-baukasten-backend`](https://github.com/crypticalcode/vereins-baukasten-backend)
(seit dem Phase-3-Split; im Monorepo gepinnt über `backend-ref.json`) – es erfüllt genau diesen
Vertrag und macht die Suite im `TEST_BASE`-Modus grün.

Dieses Package ist die **Single Source of Truth des Vertrags**: die Suiten **und** die kanonischen
Seed-Daten (`data/`). Mock-Quelle und Seed-Verzeichnis sind per `BSG_MOCK_SRC` / `BSG_DATA_DIR`
überschreibbar (Defaults: das `mock-api.js` des Frontend-Workspaces bzw. das `data/` dieses Packages).
Das Frontend hält unter `assets/data/` eine **vendored Kopie** der Seeds (`tools/vendor-seeds.mjs`).

## Veröffentlichung (GitHub Packages)

Der Vertrag wird als versioniertes Package **`@crypticalcode/api-contract`** nach **GitHub Packages**
publiziert (`https://npm.pkg.github.com`). So können Backend und Frontend ihn nach dem Repo-Split
(Phase 3, s. `docs/backend-repo-separation-plan.md`) **per Version statt per Pfad** beziehen.

**Release-Flow:**
1. `version` in `packages/api-contract/package.json` bumpen — **Semver:** additive Route = `minor`,
   Breaking Change = `major`, reine Fixes = `patch`.
2. Commit, dann Tag **`contract-vX.Y.Z`** setzen (eigener Namespace, kollidiert nicht mit den
   Hetzner-Deploy-Tags `v*.*.*-beta.*`/Release). Der Tag **muss** der `version` entsprechen.
3. Der Workflow `.github/workflows/publish-contract.yml` läuft auf den Tag: Quality-Gate
   (Guard + Vendoring-Check + Contract-Suite Mock & Real) → Tag/Version-Abgleich → `npm publish`.
   `workflow_dispatch` mit `dry_run: true` testet das Publish ohne Registry-Schreibzugriff.

Auto-Bump-PRs in Konsumenten übernimmt Renovate (`renovate.json`; greift praktisch erst nach dem
Repo-Split — im Monorepo trackt der Workspace die Version automatisch).

## Externer Konsum

GitHub Packages verlangt **Auth auch für Reads**. Ein Konsument braucht eine `~/.npmrc` mit:

```
@crypticalcode:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

und ein Token mit `read:packages` (in GitHub Actions reicht `secrets.GITHUB_TOKEN` bei
`permissions: packages: read`). Danach:

```bash
npm i -D @crypticalcode/api-contract
# Suiten gegen das eigene Backend fahren:
TEST_BASE=http://localhost:3000 npx bsg-contract
```

**Innerhalb dieses Monorepos** ist all das **nicht** nötig: der einzige `@crypticalcode`-Name wird
über den npm-Workspace **lokal** aufgelöst (`npm install` verlinkt `packages/api-contract`), nie aus
der Registry geladen — daher bleiben CI und Dev install-frei bzw. token-frei.

## Aufbau

- `harness.mjs` – `createClient({ mode, base })` liefert einen Client mit `get/post/getJ/postJ`
  und vertrags-treuen Helfern (`login`, `register`, `newUser`, `me`, `asAdmin`, `setHousehold`,
  `email`). Im Mock-Modus wird `mock-api.js` in eine **isolierte Sandbox** geladen (eigenes
  `window`/`localStorage`, Seed-JSONs von der Platte); im Real-Modus läuft echtes HTTP **mit
  Cookie-Jar**. Die Tests greifen **nie** direkt auf `localStorage`/interne Stores zu.
- `*.test.mjs` – je Domäne eine Suite (`export const name`, `export default async (api, ck) => …`).
  `export const mockOnly = true` markiert Suites, die nur im Mock-Modus sinnvoll sind
  (z. B. `api-switch`, das den Dispatcher selbst prüft).
- `run.mjs` – findet alle `*.test.mjs`, wählt den Modus aus `TEST_BASE`, isoliert jede Suite in
  einem frischen Client und aggregiert das Ergebnis. **Isolation pro Suite:** im Mock-Modus über
  eine frische Sandbox, im Real-Modus über `api.reset()` (Aufruf von `POST /api/test/reset`, das
  den Backend-Store vor jeder Suite auf den Seed-Zustand zurücksetzt). So bleiben Suites, die
  dieselben E-Mails/Namen wiederverwenden, auch gegen einen geteilten Backend-Prozess isoliert.

## Was ein echtes Backend erfüllen muss (Vertrag)

Damit die Suite im `TEST_BASE`-Modus grün wird, muss das Backend die **gleichen Pfade, Status-Codes
und JSON-Shapes** liefern wie der Mock (siehe `routes` in `assets/js/mock-api.js`). Insbesondere:

- **Auth per Cookie/Session.** `POST /api/auth/request-code` liefert in Test-/Dev-Umgebungen das
  Feld `devCode` zurück (der Client nutzt es für `POST /api/auth/login`). `POST /api/auth/register`
  legt den Benutzer an und meldet ihn an; `GET /api/auth/me` liefert `{ user, permissions, isAdmin }`.
- **Seed-Admin** `admin@example.com` existiert; Seed-Rollen (`vorstand`, `pressewart`,
  `kassenwart`, `trainer`, Board-Rollen) sind **reine Rechte-Rollen**. Die öffentliche
  Team-Anzeige kommt aus **Vereinsämtern** (`positions`, Recht `manage_team`); `GET /api/team`
  rechnet `positions × users`.
- **Seed-Daten** entsprechend `assets/data/*.json` (News/Termine/Trainingszeiten/Site/Club/Sponsoren/Klassen).
- **Sponsoren.** `GET /api/sponsors` antwortet öffentlich `{ ok, items: [{ id, name, logo, url, tier:
  "premium"|"standard", description, order }] }` (sortiert nach `order`, dann Name); `POST /api/sponsors`(`/update`,`/delete`)
  erfordert `manage_sponsors` (401/403; fehlender Name → 422; `logo` nur als gültige Data-URL, sonst `""`;
  `url` ohne Schema → `https://`, fremdes Schema wie `javascript:` → `""`). `GET /api/sponsors-config`
  antwortet öffentlich `{ ok, fields, values: { enabled, displayMode: "cards"|"logos"|"band", tiersEnabled,
  showHome, showPage, showFooter, title, subtitle } }` (Default `enabled:false`, ungültiger `displayMode` → `cards`);
  `POST /api/sponsors-config` `{ values }` ersetzt die Config (`manage_sponsors`).
- **Vereinsdaten/Branding (White-Label).** `GET /api/club` antwortet öffentlich
  `{ ok, fields: [{key,label,type}], values: { <key>: string } }` (Seed aus `assets/data/club.json`);
  `POST /api/club` `{ values: { <key>: string } }` speichert (nur bekannte Keys) und erfordert das
  Recht `manage_club` (ohne Login → 401, ohne Recht → 403). Treibt im Frontend Name, Sport, Adresse,
  Kontakt, Telefon, Vereinsregister/VR-Nummer, Impressum & Logo über `[data-club="key"]`. `GET /api/manifest` liefert das **rohe**
  PWA-Manifest-Objekt (ohne `{ok}`-Wrapper) aus der Club-Config (`name`, `short_name`, `description`,
  `theme_color`, drei Default-Icons) und spiegelt `POST /api/club`-Änderungen. Im echten Backend
  liefert die HTTP-Schicht zusätzlich **`GET /manifest.webmanifest`** (Content-Type
  `application/manifest+json`) über genau diese Route aus — pro Domain. `<title>`/`theme-color`/
  App-Titel setzt `main.js` client-seitig aus `/api/club` (nicht Teil des `/api/*`-Vertrags).
- **Feature-Gating & Beta-Freigabe.** `GET /api/capabilities` antwortet **nutzer-spezifisch**
  `{ ok, features: { <key>: { status: "stable"|"beta", public: boolean } } }` und enthält nur
  Features, die der aktuelle Nutzer sehen darf (Reifegrad aus dem Feature-Katalog × Freigabe-Scope).
  `GET /api/features` (Recht `manage_features`) liefert Katalog + Scope je Feature + Rollen-Auswahl;
  `POST /api/features/release` `{ key, release }` setzt den Scope (`"public"` | `"off"` |
  Rollen-Array `["roleId", …]`). Scope-Regeln: `public` → alle; `{roles}` → Nutzer mit passender
  Rolle *oder* `manage_features` (Vorschau); `off` → nur `manage_features`. Unbekanntes Feature → 404,
  ungültiger `release` → 422.
- **Feature-Buchung / Provisionierung.** Dritte Achse über dem Gating: `GET /api/bookings`
  (Recht `book_features`) liefert `{ ok, items: [{key,label,status,booked}] }`; `POST /api/features/book`
  `{ key, booked: boolean }` bucht/entbucht ein Feature für den Mandanten. **`GET /api/capabilities`
  filtert gebucht × freigegeben:** ein nicht gebuchtes Feature fehlt für **alle** (auch in der
  `manage_features`-Vorschau), unabhängig vom Scope. Default ist **gebucht** (Response-Shape der
  capabilities unverändert). Unbekanntes Feature → 404, `booked` kein Boolean → 422.
- Die Tests verwenden **pro Lauf eindeutige E-Mail-Adressen** (`local.<RUN_ID>@example.com`) und
  zählen relativ, damit sie auch gegen ein persistentes Backend mehrfach laufen können.
- **Test-/Dev-Endpoint `POST /api/test/reset`** (nur Dev-Modus): setzt den Store auf den
  Seed-Zustand zurück. Der Runner nutzt ihn für die Isolation pro Suite (s. o.). In Produktion
  ist er deaktiviert (404) und gehört nicht zum fachlichen Vertrag.

## Browser-E2E (Playwright)

Ergänzend zu den API-Contract-Tests fahren **Browser-End-to-End-Tests** einen echten Browser
gegen das Backend aus dem eigenen Repo (gepinnt über `backend-ref.json`) – Static **und** `/api/*`
über denselben Origin. Sie liegen isoliert in [`tests/e2e/`](../../tests/e2e/) mit **eigener** `package.json`: nur dort
gibt es Dev-Abhängigkeiten (`@playwright/test`), Repo-Root und ausgelieferte Website bleiben
abhängigkeitsfrei.

```bash
cd tests/e2e
npm install                       # einmalig (legt node_modules an, ist .gitignore-t)
npx playwright install chromium   # einmalig (Browser-Binaries)
npx playwright test               # Playwright startet server/ selbst und fährt Chromium
npx playwright test --ui          # interaktiv debuggen
```

Unter **Linux/Ubuntu** ggf. `npx playwright install --with-deps chromium` — das installiert die
benötigten System-Bibliotheken gleich mit (genau so macht es auch die CI).

Wie es funktioniert (`e2e/fixtures.mjs`): vor jedem Seitenskript wird `localStorage.bsg_api_mode =
"real"` gesetzt, sodass die gepatchte `fetch` über alle Navigationen hinweg das echte Backend
anspricht; vor jedem Test setzt `POST /api/test/reset` den Seed-Zustand zurück (Isolation wie bei
der Contract-Suite). Abgedeckt: öffentliche Seiten rendern Seed-Daten (`public.spec.mjs`) und der
volle passwortlose Login inkl. rechtebasierter Navigation (`auth.spec.mjs`).

## CI

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) führt bei jedem PR und bei Pushes auf
`main` zwei Jobs aus: **contract** (Mock- **und** Real-Modus, zero-dep) und **e2e** (Playwright,
Chromium). Der GitHub-Pages-Deploy bleibt davon getrennt (`deploy-pages.yml`).

## Hinweis

Frühere Wegwerf-Harnesses unter `/tmp/test-*.mjs` sind durch diese Suite ersetzt.
