# Contract-Tests (Mock ⇄ echtes Backend)

Dieselben Tests prüfen die `/api/*`-Schnittstelle wahlweise gegen den **In-Process-Mock**
(`assets/js/mock-api.js`) oder gegen ein **echtes Backend** über HTTP. So bleiben Mock und
zukünftiges Backend vertraglich in Sync – kein Build-Schritt, keine Abhängigkeiten, nur Node.

## Ausführen

```bash
# Mock-Modus (Default) – aus dem Repo-Root:
node tests/run.mjs

# Nur bestimmte Suites (Teilstring des Dateinamens):
node tests/run.mjs tournaments payouts

# Gegen ein laufendes echtes Backend:
node server/index.mjs &                                # siehe server/README.md
TEST_BASE=http://localhost:3000 node tests/run.mjs
```

Exit-Code `0` = alles grün, sonst `1` (CI-tauglich).

Ein referenz-implementiertes echtes Backend liegt unter [`server/`](../server/README.md) – es
erfüllt genau diesen Vertrag und macht die Suite im `TEST_BASE`-Modus grün.

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
- **Seed-Admin** `admin@bsg-benninghausen.de` existiert; Seed-Rollen (`vorstand`, `pressewart`,
  `kassenwart`, `trainer`, Board-Rollen) sind **reine Rechte-Rollen**. Die öffentliche
  Team-Anzeige kommt aus **Vereinsämtern** (`positions`, Recht `manage_team`); `GET /api/team`
  rechnet `positions × users`.
- **Seed-Daten** entsprechend `assets/data/*.json` (News/Termine/Trainingszeiten/Site/Klassen).
- Die Tests verwenden **pro Lauf eindeutige E-Mail-Adressen** (`local.<RUN_ID>@example.com`) und
  zählen relativ, damit sie auch gegen ein persistentes Backend mehrfach laufen können.
- **Test-/Dev-Endpoint `POST /api/test/reset`** (nur Dev-Modus): setzt den Store auf den
  Seed-Zustand zurück. Der Runner nutzt ihn für die Isolation pro Suite (s. o.). In Produktion
  ist er deaktiviert (404) und gehört nicht zum fachlichen Vertrag.

## Hinweis

Frühere Wegwerf-Harnesses unter `/tmp/test-*.mjs` sind durch diese Suite ersetzt.
