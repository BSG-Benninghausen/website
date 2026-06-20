# Migrations-Plan: Backend in eigenes Repo + Contract-Package

Status: **Vorschlag / Diskussionsgrundlage**. Dieses Dokument beschreibt, *wie* das
heute im Monorepo liegende echte Backend (`server/`) in ein eigenes Repository ausgelagert
werden kann, ohne den Mechanismus zu verlieren, der diese Architektur trägt: **einen
gemeinsamen Vertrag, an dem Mock und echtes Backend mit identischen Tests gemessen werden.**

> **Empfehlung vorab:** Die Trennung erst vollziehen, wenn ein konkreter Treiber existiert
> (echte Persistenz/DB, eigener Deploy-Zyklus, getrennte Zuständigkeiten, zu schwere CI).
> Bis dahin **Phase 0–1** umsetzen (Vertrag sauber kapseln, Grenze über npm-Workspaces
> ziehen) — das bringt 80 % des Nutzens bei ~10 % des Risikos und ist jederzeit reversibel.

---

## 1. Ausgangslage (Ist-Zustand)

Heute ein Monorepo mit drei Bausteinen, die über **drei Kopplungspunkte** verbunden sind:

| Baustein | Ort | Rolle |
|----------|-----|-------|
| Statisches Frontend | Repo-Root `*.html`, `assets/js/*` | UI, spricht nur `/api/*` |
| In-Process-Mock | `assets/js/mock-api.js` | „Backend im Browser", patcht `fetch` |
| Echtes Backend | `server/api.mjs`, `server/index.mjs` | Node, gleiche `/api/*`, zero-dep |

**Kopplungspunkt A — Geteilte Seeds.** Sowohl der Mock (`loadData()` → `fetch('assets/data/…')`)
als auch das Backend (`server/api.mjs:215`, `createApi({ dataDir })`) lesen **dieselben**
`assets/data/*.json` (age-classes, weight-classes, membership-types, news, events, site,
trainingszeiten, demo-data). Identische Seeds = identisches geseedetes Verhalten.

**Kopplungspunkt B — Geteilte Contract-Tests.** `tests/harness.mjs:19` lädt
`assets/js/mock-api.js` per `new Function(...)` in eine isolierte Sandbox; derselbe Runner
(`tests/run.mjs`) testet via `TEST_BASE=…` das echte Backend über HTTP. **Eine Suite, zwei
Implementierungen** — das ist der Sync-Garant. `tests/README.md` ist der Prosa-Vertrag.

**Kopplungspunkt C — Same-Origin-Deploy.** Beta/Prod (Hetzner) laufen als **ein** Node-Prozess,
der statisch **und** `/api/*` ausliefert (`server/index.mjs`, `BSG_STATIC=1`); Caddy terminiert
TLS. Draft (GitHub Pages) liefert nur statisch + Mock. Der API-Default wird beim Deploy
injiziert (`sed -i 's/mode: "mock"/mode: "real"/' assets/js/api-config.js`).

Zusätzlich: **E2E** (`tests/e2e/`, Playwright) bootet `server/` und fährt Chromium gegen das
**integrierte** System (Frontend + Backend, same-origin) — ist also ein echter Integrationstest,
der **beide** Seiten braucht.

---

## 2. Zielbild (Soll-Topologie)

Drei versionierte Einheiten. Der **Vertrag** wird zum eigenständigen, versionierten Artefakt,
von dem beide Implementierungen abhängen:

```
        ┌─────────────────────────┐
        │  @bsg/api-contract       │   ← Single Source of Truth des Vertrags
        │  • contract/*.test.mjs   │      (Suiten, Harness, kanonische Seeds, Prosa)
        │  • harness.mjs (param.)  │
        │  • data/*.json (Seeds)   │
        │  • README.md (Vertrag)   │
        └───────────┬─────────────┘
            depends on │ (devDependency, per Version gepinnt)
        ┌──────────────┴───────────────┐
        ▼                              ▼
┌────────────────────┐       ┌────────────────────┐
│ bsg-website (FE)   │       │ bsg-backend        │
│ • *.html, assets/  │       │ • server/api.mjs   │
│ • mock-api.js      │       │ • server/index.mjs │
│ npm test → mock    │       │ npm test → real    │
└────────────────────┘       └────────────────────┘
```

- **`@bsg/api-contract`** — die Tests **und** die kanonischen Seeds **und** die Prosa-Spezifikation.
  Wird über **GitHub Packages** (oder als git-Dependency per Tag) verteilt und **semver-versioniert**.
- **`bsg-website`** — Frontend + Mock. `npm test` lädt das Contract-Package und führt die Suiten im
  Mock-Modus gegen das *lokale* `mock-api.js`. Seeds werden aus dem Package nach `assets/data/`
  **vendored** (Browser müssen sie ausliefern können).
- **`bsg-backend`** — `server/`. `npm test` bootet `server/index.mjs` und lässt das Contract-Package
  im Real-Modus (`TEST_BASE`) laufen. Liest Seeds aus dem Package.

**Warum die Seeds in den Vertrag gehören:** Die Contract-Tests prüfen geseedeten Zustand
(z. B. `demo-data.test.mjs`, `content.test.mjs`, Altersklassen). Damit dieselbe Suite auf beiden
Seiten grün ist, **müssen** die Seeds bit-identisch sein → genau das macht „Vertrag" aus.

---

## 3. Die zentrale Refaktorierung: Harness entkoppeln

Heute ist der Mock-Pfad im Harness **hartcodiert** (`tests/harness.mjs:19`). Damit das
Package sowohl das Frontend-Mock (per Pfad-Injektion) als auch ein Backend (per HTTP) testen
kann, muss die Quelle des Mocks ein **Parameter** werden — die HTTP-Seite ist bereits sauber
über `TEST_BASE` parametrisiert.

```js
// vorher (gekoppelt an die Repo-Struktur):
const MOCK_SRC = readFileSync(new URL("../assets/js/mock-api.js", import.meta.url), "utf8");

// nachher (vom Konsumenten injiziert):
//   BSG_MOCK_SRC=/abs/pfad/zu/mock-api.js   node node_modules/@bsg/api-contract/run.mjs
//   BSG_DATA_DIR=/abs/pfad/zu/data          (Default: das data/ des Packages)
const MOCK_SRC_PATH = process.env.BSG_MOCK_SRC;                 // Frontend setzt das
const DATA_DIR = new URL(process.env.BSG_DATA_DIR ?? "./data/", import.meta.url);
const MOCK_SRC = MOCK_SRC_PATH ? readFileSync(MOCK_SRC_PATH, "utf8") : null;
// run.mjs: wenn TEST_BASE → real; sonst wenn BSG_MOCK_SRC → mock; sonst Fehler mit Hinweis.
```

Konsequenzen:
- **Frontend** ruft `BSG_MOCK_SRC=assets/js/mock-api.js npx bsg-contract` auf → Mock-Modus.
- **Backend** bootet Server und ruft `TEST_BASE=http://localhost:3000 npx bsg-contract` → Real-Modus.
- `RUN_ID`, Cookie-Jar, `createClient`-Helfer (`login/newUser/asAdmin/setHousehold/email`) bleiben
  unverändert im Package — sie sind schon implementierungsunabhängig.
- `guard-versions.mjs` bleibt **im Frontend** (prüft `?v=N`-Cache-Busting der HTML + Service-Worker —
  rein Frontend-Belang, kein Vertrag).

Diese Änderung ist **rückwärtskompatibel** und kann **sofort im Monorepo** passieren (Phase 0):
`run.mjs` setzt für den heutigen Aufruf `BSG_MOCK_SRC` selbst als Default.

---

## 4. Inhalt des Contract-Packages

```
bsg-api-contract/
├── package.json            # name "@bsg/api-contract", bin: { "bsg-contract": "run.mjs" }, zero deps
├── run.mjs                 # ← aus tests/run.mjs
├── harness.mjs             # ← aus tests/harness.mjs (mit §3-Parametrisierung)
├── contract/
│   ├── ageclass.test.mjs   # ← tests/*.test.mjs (1:1)
│   ├── content.test.mjs
│   ├── demo-data.test.mjs
│   ├── judopass.test.mjs
│   ├── payouts.test.mjs
│   ├── redaktion.test.mjs
│   ├── team-roles.test.mjs
│   ├── tournaments.test.mjs
│   ├── weightclass.test.mjs
│   └── api-switch.test.mjs # bleibt `mockOnly` (Dispatcher-only) → im Real-Modus übersprungen
├── data/                   # ← assets/data/*.json (kanonisch!)
│   ├── age-classes.json  weight-classes.json  membership-types.json
│   ├── news.json  events.json  site.json  trainingszeiten.json  demo-data.json
└── README.md               # ← tests/README.md (der Backend-Vertrag in Prosa)
```

**Achtung `api-switch.test.mjs`:** testet den Mock⇄Real-**Dispatcher** in `api-config.js`/`mock-api.js`
— das ist Frontend-Verhalten, kein Backend-Vertrag. Zwei Optionen: (a) als `mockOnly` im Package
lassen (läuft nur im FE-Lauf), oder (b) ins Frontend-Repo zurückziehen. **Empfehlung: (a)** — ein
Test weniger zu pflegen, und er gehört thematisch zum „selben Vertrag, zwei Seiten"-Versprechen.

---

## 5. Versionierung & Cross-Repo-Workflow (die eigentlichen Kosten)

Der Preis der Trennung ist der **Drei-Schritt pro Vertragsänderung**. Heute ein PR, danach:

1. **Contract-Repo:** PR mit neuem/geändertem Test (+ ggf. Seed) → Version bumpen
   (additive Route = `minor`, Breaking = `major`) → Release `vX.Y.Z`.
2. **Backend-Repo:** Dep auf `vX.Y.Z` heben → Route implementieren → `npm test` grün → mergen.
3. **Frontend-Repo:** Dep auf `vX.Y.Z` heben → Mock in `mock-api.js` + UI bauen → Seeds neu
   vendoren → `npm test` grün → `?v=N` bumpen → mergen.

**Abfederung:**
- **Renovate/Dependabot** auf das Contract-Package in beiden Repos → automatische Bump-PRs.
- **„Promotion einzeln" bleibt erhalten:** Backend kann eine Route schon erfüllen, während das
  Frontend sie per `hybrid`-Modus (`BSG_API.live = ["GET /api/news"]`) live schaltet — exakt das
  heutige Reifegrad-Modell, jetzt repo-übergreifend.
- **Pre-Release-Kanal:** Contract als `vX.Y.Z-rc.N` veröffentlichen, damit Backend/Frontend gegen
  einen noch nicht finalen Vertrag entwickeln können, bevor er „eingefroren" wird.

> **Reality-Check:** Ist dieser Drei-Schritt für ein Vereins-Projekt mit einer Handvoll
> Beitragender zu teuer, dann ist das das stärkste Argument, **Phase 1 (Workspaces im Monorepo)
> als Endzustand** zu wählen — gleiche Kapselung, aber atomare Ein-PR-Änderungen.

---

## 6. Deployment nach der Trennung

Heute **same-origin** (ein Prozess, kein CORS nötig). Zwei Optionen:

### Option A — Same-Origin beibehalten (empfohlen für den ersten Schritt)
Das Backend-Repo deployt **und** zieht das gebaute Frontend-Artefakt als Teil seines Deploys
(z. B. Frontend-Repo veröffentlicht ein `dist`-Tarball/Release; Backend-Deploy lädt es und legt es
neben `server/` als Static-Root). `BSG_STATIC=1` bleibt, **kein CORS**, Cookies wie heute
(`HttpOnly`, `SameSite=Lax`). Vorteil: Sicherheits- und Cookie-Modell unverändert; nur die
Artefakt-Beschaffung wird repo-übergreifend.

### Option B — Cross-Origin (Frontend CDN/Pages, Backend Hetzner)
Frontend auf GitHub Pages/CDN, Backend separat. Die Infrastruktur ist **darauf bereits vorbereitet**:
- `api-config.js`: `base` = absolute Backend-URL statt `""`.
- `server/index.mjs`: `BSG_CORS_ORIGINS` muss den FE-Origin allowlisten (Cookie-Auth braucht
  exakte Origin-Liste, kein `*`).
- Cookies brauchen `SameSite=None; Secure` (Cross-Site!) statt `Lax` — **neuer Code in `index.mjs`**,
  plus CSRF-Überlegung, da `SameSite=None` den Lax-Schutz aufgibt.
- `BSG_SECURE_COOKIES=1` ohnehin (HTTPS).

> **Empfehlung:** Mit **Option A** starten (Risiko minimal, Auth-Modell stabil). **Option B** nur,
> wenn ein eigener Frontend-CDN/-Deploy ein echter Treiber wird — sie zieht eine nicht-triviale
> Auth-/CSRF-Härtung nach sich.

### E2E (Integrationstests)
`tests/e2e/` braucht **beide** Seiten gleichzeitig. Empfehlung: E2E **im Frontend-Repo** belassen
(es testet die UI), das Backend als **gepinntes Artefakt** beziehen (Release-Tarball oder
veröffentlichtes Docker-Image `bsg-backend:vX`). Playwright bootet dann das gezogene Backend statt
des lokalen `server/`. Alternative: ein dünnes `bsg-integration`-Repo, das beide pinnt — nur wenn
die E2E-Suite stark wächst.

---

## 7. Phasen-Roadmap (inkrementell, jederzeit anhaltbar)

| Phase | Inhalt | Git-Trennung? | Risiko | Reversibel |
|-------|--------|---------------|--------|------------|
| **0. Harness entkoppeln** | `BSG_MOCK_SRC`/`BSG_DATA_DIR`-Parametrisierung (§3); `run.mjs` setzt Defaults. CI unverändert grün. | nein | sehr gering | trivial |
| **1. Workspace-Grenze** | npm-Workspaces: `packages/api-contract/` (Tests+Seeds+Prosa), `packages/backend/`, Root=Frontend. Seeds zentral, FE+Backend referenzieren sie. **Empfohlener Halte-/Endpunkt ohne echten Treiber.** | nein | gering | leicht |
| **2. Package veröffentlichen** | `@bsg/api-contract` nach GitHub Packages; beide Workspaces konsumieren per Version statt per Pfad. Renovate einrichten. | nein | mittel | mittel |
| **3. Repos splitten** | `git subtree split --prefix=packages/backend` → `bsg-backend` (Historie erhalten!); dito Contract. Frontend bleibt im Ursprungs-Repo. | **ja** | mittel–hoch | aufwändig |
| **4. CI/CD verdrahten** | Pro Repo eigene `ci.yml` (jeweils Contract-Suite gegen die eigene Seite); Deploy nach Option A/B; E2E im FE-Repo gegen gepinntes Backend. | ja | hoch | aufwändig |

**Konkrete Schritte Phase 0 (sofort umsetzbar, im aktuellen Branch):**
1. `harness.mjs`: `MOCK_SRC`/`DATA_DIR` aus Env (`BSG_MOCK_SRC`, `BSG_DATA_DIR`) mit heutigen Defaults.
2. `run.mjs`: Default `BSG_MOCK_SRC=assets/js/mock-api.js` setzen, wenn kein `TEST_BASE`.
3. `node tests/run.mjs` und `TEST_BASE=… node tests/run.mjs` müssen unverändert grün sein.
4. CI bleibt unangetastet (Smoke: beide Läufe grün).

**Schritte Phase 1 (npm-Workspaces, immer noch Monorepo):**
1. Root-`package.json` mit `"workspaces": ["packages/*"]` (Frontend bleibt zero-dep für den Browser —
   Workspaces betreffen nur Tooling, nicht das ausgelieferte Static).
2. `tests/` → `packages/api-contract/` (Tests, Harness, `run.mjs`), `assets/data/` → dort `data/`.
3. Frontend **vendored** `data/` nach `assets/data/` (kleines `cp`-Script + CI-Check
   „vendored == kanonisch"; **kein** echter Build-Schritt fürs Static).
4. `server/` → `packages/backend/`, liest Seeds aus `@bsg/api-contract/data`.
5. CI-Jobs auf Workspace-Skripte umstellen, beide Contract-Läufe + E2E grün halten.

---

## 8. Risiken & offene Entscheidungen

- **Zero-Dep-Prinzip des Frontends:** Workspaces/Vendoring dürfen das ausgelieferte Static **nicht**
  zu einem Framework-Build machen. Lösung: Vendoring ist ein reiner `cp` + Konsistenz-Check, kein Bundler.
- **Seed-Drift:** Sobald Seeds nicht mehr im selben Verzeichnis liegen, braucht es den CI-Check
  „vendored == Package" — sonst läuft FE-Mock gegen andere Daten als die Tests annehmen.
- **Cookie-/CSRF-Modell** bei Cross-Origin (Option B) — nicht unterschätzen (`SameSite=None`).
- **Verteilung des Packages:** GitHub Packages braucht Auth-Token in CI beider Repos; git-Dependency
  per Tag ist simpler, aber ohne Semver-Range-Komfort.
- **Entscheidung Deployment-Topologie** (A vs. B) bestimmt den Auth-Aufwand und sollte **vor** Phase 3
  fallen.

---

## 9. Fazit

Die Architektur ist **bereits logisch getrennt** (eigenes `server/`, eigene `package.json`, null
geteilte Laufzeit-Abhängigkeiten). Der wahre Wert steckt im **gemeinsamen Vertrag** — und genau der
wird beim Repo-Split zum verteilten Artefakt mit Versionskosten.

**Empfohlener Pfad:** Phase 0 + 1 jetzt (Vertrag kapseln, Workspace-Grenze ziehen) und **dort halten**,
bis ein echter Treiber auftaucht (DB-Persistenz, eigener Deploy-Zyklus, getrennte Teams). Erst dann
Phase 2–4 — mit Option A (same-origin) als sicherem Default fürs Deployment.
