# Vereins-Baukasten – Backend (`/api/*`)

Eigenständige, **abhängigkeitsfreie** Node-Implementierung der `/api/*`-Schnittstelle des
[Vereins-Baukastens](https://github.com/crypticalcode/vereins-baukasten). Sie erfüllt **denselben
Vertrag** wie der In-Process-Mock (`assets/js/mock-api.js`) im Frontend-Repo – dieselben Pfade,
Status-Codes und JSON-Shapes. Kein Build-Schritt, keine npm-Pakete – nur `node:`-Builtins.

> **Herkunft.** Dieses Repo wird aus dem Monorepo
> `crypticalcode/vereins-baukasten` **generiert** (`tools/backend-split/extract.sh`).
> Erzeugt aus `@SOURCE_COMMIT@` am `@GENERATED_AT@`. Siehe Abschnitt
> [„Regenerieren & Sync"](#regenerieren--sync). Hintergrund:
> `docs/backend-repo-separation-plan.md` (Phase 3) im Monorepo.

## Starten

```bash
node index.mjs                 # Port 3000, liefert /api/* (+ statisch aus ./public, falls vorhanden)
PORT=8080 node index.mjs       # anderer Port
BSG_STATIC=0 node index.mjs    # nur API, keine statischen Dateien
BSG_DEV=0 node index.mjs       # Produktionsmodus (devCode aus, /api/test/reset -> 404)
```

### Env-Variablen

| Variable             | Default              | Wirkung                                                                       |
|----------------------|----------------------|-------------------------------------------------------------------------------|
| `PORT`               | `3000`               | HTTP-Port.                                                                    |
| `BSG_DEV`            | an (`!= "0"`)        | Dev-/Test-Modus: `devCode` im Login-Flow + `POST /api/test/reset`.            |
| `BSG_STATIC`         | an (`!= "0"`)        | Statische Dateien ausliefern (Static-Root, s. `BSG_STATIC_DIR`).             |
| `BSG_STATIC_DIR`     | `./public`           | Verzeichnis der statischen Website (Option A: Frontend-Artefakt daneben).    |
| `BSG_SECURE_COOKIES` | an, wenn nicht Dev   | Session-Cookie mit `Secure` markieren (für HTTPS-Betrieb).                    |
| `BSG_CORS_ORIGINS`   | leer                 | Komma-Liste erlaubter Cross-Origin-Origins (Cookie-Auth → Allowlist nötig).  |
| `BSG_DATA_FILE`      | leer                 | Pfad zur JSON-Snapshot-Datei → **Persistenz**. Leer = rein in-memory.        |
| `BSG_CLUB_NS`        | leer                 | Club-Namespace (White-Label): lädt `data/<base>.<ns>.json`, falls vorhanden.  |

Sicherheits-Defaults: Session-Cookie ist `HttpOnly` + `SameSite=Lax` (in Produktion zusätzlich
`Secure`). CORS ist standardmäßig **aus** – same-origin (Static am selben Origin) braucht keins;
Cross-Origin-Frontends müssen ihren Origin via `BSG_CORS_ORIGINS` erlauben.

## Aufbau

| Pfad                       | Inhalt                                                                          |
|----------------------------|---------------------------------------------------------------------------------|
| `api.mjs`                  | Reine Domänenlogik: Store, Seed/Migrationen, alle Route-Handler. `createApi()`. |
| `index.mjs`                | HTTP-Schale: Cookie-Session, JSON-I/O für `/api/*`, statisches Ausliefern, CORS. |
| `store.mjs`                | Opt-in JSON-Snapshot-Persistenz (atomar, fail-safe).                            |
| `persistence.mjs`          | Standalone-Persistenztest (`node persistence.mjs`).                             |
| `data/*.json`              | **Laufzeit-Seeds** (pfadbasiert, install-frei) – vendored aus `contract/data/`. |
| `contract/`                | Vendored Vertrag: Suiten, `harness.mjs`, `run.mjs`, kanonische `data/`, README. |
| `tools/vendor-seeds.mjs`   | Hält `data/` == `contract/data/` (`--check` = CI-Gate).                          |

`createApi({ dataDir })` lädt die Seeds aus `./data/` (kanonisch identisch zur vendored Kopie im
Frontend unter `assets/data/`), seedet System-/Beispiel-Rollen als **reine Rechte-Rollen** und
garantiert den Seed-Admin `admin@example.com`. Persistenz, Sessions und Dev-Modus sind im Detail in
[`contract/README.md`](./contract/README.md) (dem Prosa-Vertrag) sowie in `store.mjs` dokumentiert.

## Tests

```bash
node tools/vendor-seeds.mjs --check    # Seeds-Drift (data/ == contract/data/)
node persistence.mjs                   # JSON-Snapshot-Roundtrip
# Contract-Suite im Real-Modus (Backend muss laufen):
node index.mjs &                       # Backend auf :3000 (Dev-Modus)
npm run test:contract                  # == BSG_MOCK_SRC=contract/mock-src.stub.js TEST_BASE=… node contract/run.mjs
```

Die Suite läuft hier **nur im Real-Modus** (HTTP gegen das laufende Backend); die `mockOnly`-Suiten
(`api-switch`, `club-namespace`) prüfen Frontend-/Mock-Verhalten und werden übersprungen. `BSG_MOCK_SRC`
zeigt auf `contract/mock-src.stub.js`, weil `harness.mjs` beim Laden eine Mock-Quelle einliest (deren
Inhalt im Real-Modus nie ausgeführt wird) und dieses Repo kein `mock-api.js` enthält.

## Deployment (Option A – same-origin, empfohlen)

Backend und Frontend laufen am selben Origin (kein CORS, Cookie-Modell unverändert): den
Deploy-Schritt das gebaute Frontend-Artefakt nach `./public/` (bzw. `BSG_STATIC_DIR`) legen lassen
(mit `api-config.js` auf `mode: "real"`), dann `node index.mjs` starten. Für Cross-Origin (Option B)
`BSG_CORS_ORIGINS` + `BSG_SECURE_COOKIES=1` setzen. Details: `docs/backend-repo-separation-plan.md` §6
im Monorepo.

## Regenerieren & Sync

Dieses Repo ist **generiert** – Vertragsänderungen passieren im Monorepo
(`crypticalcode/vereins-baukasten`). Zum Aktualisieren dort:

```bash
tools/backend-split/extract.sh --no-history --out <ziel>
```

und das Ergebnis in dieses Repo übernehmen. `extract.sh` flacht `packages/backend/` auf die
Repo-Wurzel, vendored die kanonischen Seeds nach `data/` + `contract/data/` und verdrahtet die
install-freie Pfad-Auflösung. Die Domänenlogik (`api.mjs`, `store.mjs`) wird **unverändert**
übernommen; nur die Seed-/Static-Pfade in `index.mjs`/`persistence.mjs` werden umgeschrieben.
