# Echtes Backend (`/api/*`)

Eine eigenständige, **abhängigkeitsfreie** Node-Implementierung der `/api/*`-Schnittstelle.
Sie erfüllt **denselben Vertrag** wie der In-Process-Mock (`assets/js/mock-api.js`) – dieselben
Pfade, Status-Codes und JSON-Shapes. Die Contract-Test-Suite (`tests/`) validiert beide Seiten
mit identischen Assertions, damit Mock und echtes Backend in Sync bleiben.

Kein Build-Schritt, keine npm-Pakete – nur `node:`-Builtins (`http`, `fs`, `path`, `url`).

## Starten

```bash
node packages/backend/index.mjs                 # Port 3000, liefert /api/* + statische Website
PORT=8080 node packages/backend/index.mjs       # anderer Port
BSG_STATIC=0 node packages/backend/index.mjs    # nur API, keine statischen Dateien
BSG_DEV=0 node packages/backend/index.mjs       # Produktionsmodus (s. u.)
```

### Env-Variablen

| Variable             | Default            | Wirkung                                                                       |
|----------------------|--------------------|-------------------------------------------------------------------------------|
| `PORT`               | `3000`             | HTTP-Port.                                                                    |
| `BSG_DEV`            | an (`!= "0"`)      | Dev-/Test-Modus: `devCode` + `/api/test/reset` (s. u.).                       |
| `BSG_STATIC`         | an (`!= "0"`)      | Statische Website aus dem Repo-Root ausliefern.                               |
| `BSG_SECURE_COOKIES` | an, wenn nicht Dev | Session-Cookie mit `Secure` markieren (für HTTPS-Betrieb).                    |
| `BSG_CORS_ORIGINS`   | leer               | Komma-Liste erlaubter Cross-Origin-Origins (Cookie-Auth → Allowlist nötig).   |
| `BSG_DATA_FILE`      | leer               | Pfad zur JSON-Snapshot-Datei → **Persistenz** (s. u.). Leer = rein in-memory.  |

Sicherheits-Defaults: Das Session-Cookie ist `HttpOnly` + `SameSite=Lax` (in Produktion zusätzlich
`Secure`). CORS ist standardmäßig **aus** – same-origin (Static-Serving am selben Origin) braucht
kein CORS; Cross-Origin-Frontends müssen ihren Origin explizit über `BSG_CORS_ORIGINS` erlauben.
Das Static-Serving blockt Repo-interne Pfade (`.git`, `.github`, `server`, `tests`, `node_modules`)
und versteckte Dateien.

Im Standardfall liefert der Server zusätzlich die statische Website aus dem Repo-Root aus.
Damit funktioniert das Frontend gegen das echte Backend end-to-end: gleicher Origin → die in
`mock-api.js` gepatchte `fetch` reicht `/api/*` an dasselbe Backend weiter, sobald der Modus auf
`real` steht (`?api=real`, `BSGApi.setMode('real')` oder `api-config.js`-Default).

## Aufbau

| Datei         | Inhalt                                                                              |
|---------------|-------------------------------------------------------------------------------------|
| `api.mjs`     | Reine Domänenlogik: Store, Seed/Migrationen, alle Route-Handler. `createApi()`.     |
| `index.mjs`   | HTTP-Schale: Cookie-Session, JSON-I/O für `/api/*`, statisches Ausliefern, CORS.    |

`createApi({ dataDir, dev })` lädt die Seed-/Config-JSONs aus den **kanonischen Seeds** des
Contract-Packages (`../api-contract/data/`; identisch zur vendored Kopie in `assets/data/`), seedet System-Rollen
(`admin`, `member`), Beispiel-Rollen (`vorstand`, `pressewart`, `kassenwart`, `trainer`) und die
Board-Rollen (`vorsitz1`, …) als **reine Rechte-Rollen** – identisch zum Mock. Die öffentliche
Team-Anzeige läuft über die **Vereinsämter** (`db.positions`, `GET /api/positions` unter
`manage_team`); `GET /api/team` rechnet `positions × users`. Der Seed-Admin
`admin@bsg-benninghausen.de` existiert immer.

### Sessions

Passwordless wie der Mock: `POST /api/auth/request-code` erzeugt einen Code; `POST /api/auth/login`
tauscht ihn gegen eine Session. Die Session wird serverseitig (Token → userId) gehalten und als
`bsg_session`-Cookie (`HttpOnly`, `SameSite=Lax`) transportiert. `register` legt an und meldet an.

### Datenhaltung & Persistenz

Standardmäßig **in-memory** (Prozess-Lebensdauer) – das genügt für die Contract-Tests und einen
Demo-/Dev-Betrieb. Für **Durability** setzt man `BSG_DATA_FILE` auf einen Dateipfad: dann hält
`packages/backend/store.mjs` den `db` als **JSON-Snapshot** auf der Platte (spiegelt das localStorage-Modell
des Mocks).

- **Boot:** existiert die Snapshot-Datei, wird sie geladen und `seed()` zieht idempotente
  Migrationen nach (Forward-Compat); sonst wird frisch geseedet. Danach einmal geschrieben.
- **Write-through:** nach jeder zustandsändernden (Nicht-GET-)Anfrage wird im Dispatcher `handle()`
  **atomar** geschrieben (`<file>.tmp` → `rename`). Ein defekter/fehlender Snapshot fällt fail-safe
  auf den Seed-Zustand zurück (kein Crash).
- Persistiert wird **nur `db`** (Inhalte/Stammdaten), **nicht `sessions`** – Tokens bleiben flüchtig,
  nach Neustart meldet man sich neu an. Statische Config-Templates (`age-classes.json` etc.) werden
  weiterhin bei jedem Start frisch geladen.
- Ohne `BSG_DATA_FILE` ändert sich **nichts** gegenüber früher (Contract-Tests/E2E unverändert).
  Test: `node packages/backend/persistence.mjs`.

**Ausblick Mehrmandantenfähigkeit:** `store.mjs` + die `db`/`dataFile`-Kapselung in `createApi` sind
die Naht dafür. Ein Multi-Tenant-Server hält eine `Map<tenantId, createApi({dataFile: …})>`, löst den
Mandanten in `index.mjs` aus `req.headers.host` auf und ruft dasselbe `handle(...)`. Host-Auflösung,
Onboarding und Billing sind ein späterer Schritt (siehe `docs/productization-saas-plan.md`).

## Dev-/Test-Modus (`BSG_DEV`, Default an)

- `POST /api/auth/request-code` liefert das Feld **`devCode`** mit (kein echter E-Mail-Versand) –
  vom Test-Harness für den Login genutzt.
- `POST /api/test/reset` setzt den Store auf den Seed-Zustand zurück.

In **Produktion** (`BSG_DEV=0`) ist `devCode` deaktiviert und `/api/test/reset` antwortet mit 404.

## Contract-Tests dagegen laufen lassen

```bash
node packages/backend/index.mjs &                                   # Backend starten
TEST_BASE=http://localhost:3000 node packages/api-contract/run.mjs  # Suite im Real-Modus
```

**Isolation pro Suite.** Im Mock-Modus bekommt jede Suite eine frische Sandbox. Das Real-Modus-
Pendant ist `/api/test/reset`: Der Runner (`packages/api-contract/run.mjs`) ruft vor jeder Suite `api.reset()` auf,
sodass jede Suite auf einem frisch geseedeten Backend startet. Ohne diese Isolation würden Suites,
die dieselben E-Mails/Namen wiederverwenden (`carla`, `kasse`, `Tina Trainer`, …), über den
gemeinsamen Backend-Prozess hinweg kollidieren.
