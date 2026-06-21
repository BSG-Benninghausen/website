# Backend-Trennung: eigenes Repo + Contract-Package

Status: **Phase 0–3 umgesetzt** (Vertrag gekapselt, Workspace-Grenze gezogen, Vertrag als Package
veröffentlichbar, **Backend in eigenes Repo ausgegliedert** + Monorepo-Cleanup). Das Backend lebt
jetzt in `crypticalcode/vereins-baukasten-backend`, im Monorepo gepinnt über
[`backend-ref.json`](../backend-ref.json) und erzeugt/aktualisiert via
[`tools/backend-split/`](../tools/backend-split/). Offen: der Vertrags-Split (Phase 3b: Contract als
gepinnte Package-Dependency statt vendored) und die volle CI/CD-Verdrahtung (Phase 4, u. a.
Deploy A/B, Secret `BACKEND_REPO_TOKEN` für die E2E gegen das private Backend-Repo).
Begleitdokument zur Produktvision: [`productization-saas-plan.md`](./productization-saas-plan.md).

Tragendes Prinzip: **ein gemeinsamer Vertrag, an dem Mock und echtes Backend mit identischen Tests
gemessen werden.** Genau dieser Vertrag wird beim Repo-Split zum verteilten, versionierten Artefakt.

---

## 1. Ist-Zustand (Monorepo mit Workspaces)

Heute **ein** Repo mit npm-Workspaces (`"workspaces": ["packages/*"]`), drei Bausteine:

| Baustein | Ort | Rolle |
|----------|-----|-------|
| Statisches Frontend | Repo-Root `*.html`, `assets/js/*` | UI, spricht nur `/api/*`, zero-dep |
| In-Process-Mock | `assets/js/mock-api.js` | „Backend im Browser", patcht `fetch` |
| Echtes Backend | `packages/backend/` (`api.mjs`, `index.mjs`, `store.mjs`, `persistence.mjs`) | Node, gleiche `/api/*` |
| Vertrag | `packages/api-contract/` (Suiten, `harness.mjs`, `run.mjs`, **kanonische Seeds** `data/`, Prosa-`README.md`) | Single Source of Truth |

Die Kopplung läuft über **identische Seeds** und **eine** Contract-Suite, die per `TEST_BASE`
wahlweise Mock oder echtes Backend prüft:

- **Seeds.** Mock (`loadData()` → `fetch('assets/data/…')`) und Backend (`createApi({ dataDir })`)
  lesen dieselben Daten. `assets/data/` ist eine **vendored Kopie** der kanonischen Seeds in
  `packages/api-contract/data/`; `tools/vendor-seeds.mjs` kopiert sie und prüft per `--check` auf
  Drift (CI-Gate). Identische Seeds = identisches geseedetes Verhalten.
- **Contract-Tests.** `packages/api-contract/harness.mjs` lädt `mock-api.js` in eine isolierte
  Sandbox; derselbe Runner (`packages/api-contract/run.mjs`) testet via `TEST_BASE` das echte
  Backend über HTTP. **Eine Suite, zwei Implementierungen** — der Sync-Garant.
- **Same-Origin-Deploy.** Das Backend (`packages/backend/index.mjs`, `BSG_STATIC=1`) kann Static
  **und** `/api/*` aus einem Prozess liefern; GitHub Pages liefert nur Static + Mock.
- **E2E.** `tests/e2e/` (Playwright) bootet `packages/backend/` und fährt Chromium gegen das
  integrierte System (Frontend + Backend, same-origin) — echter Integrationstest, braucht **beide**.

`tools/guard-versions.mjs` (Cache-Busting `?v=N` + Service-Worker-`VERSION`) bleibt reiner
Frontend-Belang, kein Vertrag.

---

## 2. Zielbild nach dem Split (Soll-Topologie)

Drei versionierte Einheiten; der Vertrag wird zum eigenständigen Artefakt, von dem beide
Implementierungen per gepinnter Version abhängen:

```
        @crypticalcode/api-contract   ← Suiten + Harness + kanonische Seeds + Prosa-Vertrag
                 │  (devDependency, per Version gepinnt)
        ┌────────┴────────┐
        ▼                 ▼
  Frontend (FE)      Backend
  *.html, assets/    packages/backend/ → eigenes Repo
  mock-api.js        npm test → real (TEST_BASE)
  npm test → mock
```

**Warum die Seeds in den Vertrag gehören:** Die Contract-Tests prüfen geseedeten Zustand
(`demo-data`, `content`, Altersklassen). Damit dieselbe Suite auf beiden Seiten grün ist, **müssen**
die Seeds bit-identisch sein — genau das macht den „Vertrag" aus.

**Stand Phase 2 (im Monorepo, „lean"):** Package heißt **`@crypticalcode/api-contract`** (Scope =
GitHub-Owner, Pflicht für GitHub Packages), nicht mehr `private`. **Publish-on-Tag:**
`.github/workflows/publish-contract.yml` läuft auf `contract-vX.Y.Z` (Quality-Gate → Tag/Version-
Abgleich → `npm publish` nach GitHub Packages). Das Backend deklariert den Vertrag als
**devDependency** (Workspace-lokal aufgelöst, `bsg-contract`-Bin im `test:contract`-Script);
**Runtime-Seed-Laden bleibt pfadbasiert** → Deploy bleibt install-frei (kein `node_modules`,
systemd startet `node packages/backend/index.mjs`). *Invariante:* `packages/backend/*.mjs`
importiert das Package **nie**. `renovate.json` eingerichtet (wirkt real erst ab Phase 3).

---

## 3. Die Kosten der Trennung: Drei-Schritt pro Vertragsänderung

Heute ein PR; nach dem Split:

1. **Contract:** PR mit neuem/geändertem Test (+ ggf. Seed) → Version bumpen (additiv = `minor`,
   Breaking = `major`) → Release `vX.Y.Z`.
2. **Backend:** Dep auf `vX.Y.Z` heben → Route in `api.mjs` implementieren → `npm test` grün → mergen.
3. **Frontend:** Dep auf `vX.Y.Z` heben → Mock + UI bauen → Seeds neu vendoren → `?v=N` bumpen → mergen.

**Abfederung:** Renovate/Dependabot (automatische Bump-PRs); **Promotion einzeln** bleibt erhalten
(Backend erfüllt eine Route schon, Frontend schaltet sie per `hybrid`-Modus live); Pre-Release-Kanal
(`vX.Y.Z-rc.N`).

> **Reality-Check:** Ist dieser Drei-Schritt für ein Vereins-Projekt mit wenigen Beitragenden zu
> teuer, ist das das stärkste Argument, **Phase 1 (Workspaces im Monorepo) als Endzustand** zu
> wählen — gleiche Kapselung, aber atomare Ein-PR-Änderungen.

---

## 4. Phase 3 — Backend ausgliedern (inkrementell, wenn ein Treiber kommt)

> **Werkzeug:** [`tools/backend-split/extract.sh`](../tools/backend-split/) automatisiert die
> Schritte 1–2 (Inhalt) und ist re-runnbar (zugleich Sync-Mechanismus). Empfohlen ist der
> Snapshot-Modus `--no-history` (braucht kein `git-filter-repo`); das Skript flacht
> `packages/backend/` auf die Wurzel, vendored den Vertrag nach `contract/` und die Seeds nach
> `data/`, schreibt die Seed-/Static-Pfade um und prüft das Ergebnis end-to-end (Contract-Suite im
> Real-Modus). Bis ein Package-Konsum (Phase 3b) greift, wird der Vertrag **vendored** statt als
> devDependency gezogen — so bleibt das Backend-Repo ohne Registry-Token CI-grün.

**Backend zuerst**, Vertrag + Frontend bleiben vorerst im Monorepo (Contract-Split = späteres
Phase 3b). Bis der Monorepo-Cleanup gemergt ist, ist alles reversibel. Ablauf in Kürze:

1. **Historie extrahieren.** Neues (privates) Repo `crypticalcode/bsg-backend` (ggf.
   `vereins-baukasten-backend`). `git filter-repo` über `packages/backend/` (zieht die
   Pre-Rename-Historie von `server/` mit) auf die Repo-Wurzel flachklopfen; pushen.
2. **Lauffähig & install-frei machen.** Vertrag als **devDependency**; `tools/vendor-seeds.mjs`
   übernehmen, Seeds aus dem installierten Package nach lokalem `./data/` vendoren und committen;
   Seed-Loader auf `./data/` zeigen lassen. Eigene `ci.yml` (Syntax, `vendor-seeds --check`,
   `persistence`, Boot + `TEST_BASE=… bsg-contract`). Deploy-Dateien (systemd/Caddy) mitnehmen.
3. **Deploy = Option A (same-origin).** Der Backend-Deploy beschafft das gebaute Frontend-Artefakt
   (`api-config.js` per `sed` auf `mode: "real"`) und legt es same-origin daneben — kein CORS,
   Cookie-Modell unverändert (siehe §6).
4. **Monorepo-Cleanup (eigener PR).** `packages/backend/` entfernen, gepinnten Backend-Ref ablegen,
   `ci.yml`/Playwright das Backend aus dem gepinnten Repo ziehen lassen, Docs aktualisieren.

> **Rollback:** Vor dem Cleanup-Merge das neue Repo verwerfen; danach den Cleanup-PR reverten — das
> Backend lebt in der Monorepo-Historie weiter.

---

## 5. Inhalt des Contract-Packages

```
packages/api-contract/
├── package.json   # name "@crypticalcode/api-contract", bin: { "bsg-contract": "run.mjs" }, zero deps
├── run.mjs        # Runner: TEST_BASE → real, sonst Mock
├── harness.mjs    # createClient({mode,base}) + Helfer (login/newUser/asAdmin/setHousehold/email)
├── *.test.mjs     # Domain-Suiten (1 Datei = 1 Domäne); api-switch.test.mjs ist `mockOnly`
├── data/*.json    # kanonische Seeds (age-/weight-classes, membership-types, news, events, site, …)
└── README.md      # der Backend-Vertrag in Prosa
```

`api-switch.test.mjs` testet den Mock⇄Real-**Dispatcher** (Frontend-Verhalten, kein Backend-Vertrag)
und bleibt daher `mockOnly` (im Real-Modus übersprungen).

---

## 6. Deployment nach der Trennung

Heute **same-origin** (ein Prozess, kein CORS). Zwei Optionen:

### Option A — Same-Origin beibehalten (empfohlen für den ersten Schritt)
Das Backend-Repo deployt und zieht das gebaute Frontend-Artefakt als Teil seines Deploys (neben
`packages/backend/` als Static-Root). `BSG_STATIC=1` bleibt, **kein CORS**, Cookies wie heute
(`HttpOnly`, `SameSite=Lax`). Nur die Artefakt-Beschaffung wird repo-übergreifend.

### Option B — Cross-Origin (Frontend CDN/Pages, Backend separat)
Die Infrastruktur ist vorbereitet: `api-config.js` `base` = absolute Backend-URL;
`packages/backend/index.mjs` allowlistet den FE-Origin via `BSG_CORS_ORIGINS` (kein `*`); Cookies
brauchen `SameSite=None; Secure` statt `Lax` (**neuer Code**, plus CSRF-Überlegung);
`BSG_SECURE_COOKIES=1`.

> **Empfehlung:** Mit **Option A** starten (Risiko minimal, Auth-Modell stabil). **Option B** nur,
> wenn ein eigener Frontend-CDN/-Deploy ein echter Treiber wird (nicht-triviale Auth-/CSRF-Härtung).

**E2E** bleibt im Frontend-Repo (testet die UI) und bezieht das Backend als gepinntes Artefakt
(Release-Tarball oder Docker-Image); Playwright bootet das gezogene Backend statt eines lokalen.

---

## 7. Phasen-Roadmap (inkrementell, jederzeit anhaltbar)

| Phase | Inhalt | Git-Trennung? | Status |
|-------|--------|---------------|--------|
| **0. Harness entkoppeln** | `BSG_MOCK_SRC`/`BSG_DATA_DIR`-Parametrisierung; `run.mjs` setzt Defaults | nein | ✅ |
| **1. Workspace-Grenze** | npm-Workspaces: `packages/api-contract/` + `packages/backend/`, Root = Frontend; Seeds zentral + vendored. **Empfohlener Halte-/Endpunkt ohne Treiber.** | nein | ✅ |
| **2. Package veröffentlichen** | `@crypticalcode/api-contract` nach GitHub Packages (Publish-on-Tag); Konsum per Name nur Dev/Test; Renovate eingerichtet | nein | ✅ |
| **3. Backend splitten** | Snapshot via `tools/backend-split/extract.sh --no-history` → eigenes Repo; Seeds vendored/install-frei; Deploy Option A; Monorepo-Cleanup (§4): `packages/backend/` entfernt, `backend-ref.json` gepinnt | **ja** | ✅ |
| **4. CI/CD verdrahten** | FE-CI: Mock + Guards; Backend-Repo-CI: Real + Persistenz; E2E im FE-Repo gegen das gepinnte Backend (Secret `BACKEND_REPO_TOKEN`, sonst grün übersprungen). Offen: Deploy A/B, Phase 3b (Contract-Split) | ja | teilweise |

---

## 8. Risiken & offene Entscheidungen

- **Zero-Dep-Prinzip des Frontends:** Vendoring ist ein reiner `cp` + Konsistenz-Check, **kein
  Bundler** — das ausgelieferte Static darf kein Framework-Build werden.
- **Seed-Drift:** CI-Check „vendored == Package" ist Pflicht, sobald Seeds getrennt liegen.
- **Cookie-/CSRF-Modell** bei Cross-Origin (Option B) nicht unterschätzen (`SameSite=None`).
- **Paket-Verteilung:** entschieden → **GitHub Packages** (Scope `@crypticalcode`). Reads brauchen
  ein `read:packages`-Token; im Monorepo irrelevant (Name Workspace-lokal aufgelöst).
- **Deployment-Topologie** (A vs. B) sollte **vor** Phase 3 fallen — sie bestimmt den Auth-Aufwand.

> **Hinweis (P4 Teil 1):** Die optionale JSON-Snapshot-Persistenz (`packages/backend/store.mjs`, Env
> `BSG_DATA_FILE`; siehe [`productization-saas-plan.md`](./productization-saas-plan.md)) gehört zum
> **Backend** und wandert mit `packages/backend/` ins künftige private Repo. Frontend + Mock bleiben
> unberührt (Persistenz ist im Mock ohnehin `localStorage`).

---

## Fazit

Die Architektur ist **bereits logisch getrennt** (eigene `packages/backend/`, eigene `package.json`,
null geteilte Laufzeit-Abhängigkeiten). Der wahre Wert steckt im **gemeinsamen Vertrag**. Empfohlen:
**Phase 0–2 als Endzustand halten**, bis ein echter Treiber Phase 3–4 rechtfertigt — dann mit
Option A (same-origin) als sicherem Default.
