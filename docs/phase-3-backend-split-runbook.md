# Runbook: Phase 3 (Teil 1) — Backend in `bsg-backend` ausgliedern

Status: **Vorbereitet / ausführbar**. Dieses Runbook beschreibt die **inkrementelle** Git-Trennung aus
`backend-repo-separation-plan.md` §6–§8: `packages/backend` wird in ein eigenes Repo
`crypticalcode/bsg-backend` ausgegliedert. **Vertrag (`packages/api-contract`) und Frontend bleiben
vorerst im Monorepo** (Contract-Split = späteres Phase 3b).

Bis der Monorepo-Cleanup-PR (Schritt C) **gemergt** ist, ist alles **reversibel** (das neue Repo lässt
sich verwerfen, der Cleanup-PR nicht mergen).

## Entscheidungen (fix)

| Thema | Wahl |
|-------|------|
| Umfang | nur Backend zuerst (inkrementell) |
| Deploy-Topologie | **A — Same-Origin**: Backend-Repo besitzt den Hetzner-Deploy und liefert das Frontend-Artefakt neben sich aus (kein CORS, Cookie-Modell unverändert) |
| Historie | `git filter-repo` — volle Historie inkl. Pre-Rename `server/` |
| Seeds im Backend-Repo | **vendored** (Runtime bleibt install-frei); Vertrag nur als devDependency |

---

## 0. Voraussetzungen (Nutzer-Schritte, außerhalb des Monorepos)

1. Leeres Repo `crypticalcode/bsg-backend` anlegen (privat). **Namens-Hinweis:** Das Frontend-/
   Monorepo heißt seit der Umbenennung `vereins-baukasten`; unter diesem Dach passt für das Backend
   evtl. `vereins-baukasten-backend` besser. Dann unten `bsg-backend` durchgängig ersetzen.
2. `git filter-repo` lokal verfügbar machen: `pipx install git-filter-repo` (oder `pip install
   git-filter-repo`). Falls Netzwerk-Policy das blockt → Fallback `git subtree split` (Historie dann
   nur ab dem Phase-1-Rename; ältere Historie bleibt im Monorepo auffindbar).
3. Secrets im neuen Repo: **Hetzner-SSH** (vom Monorepo herüberziehen: `HETZNER_*`, `BETA_*`, `PROD_*`),
   **Registry-Token** mit `read:packages` für die `@crypticalcode/api-contract`-devDependency im CI.

---

## A. Historie extrahieren (volle Historie)

```bash
git clone --no-local https://github.com/crypticalcode/vereins-baukasten bsg-backend
cd bsg-backend
git filter-repo \
  --path server/ --path packages/backend/ --path tests/persistence.mjs \
  --path-rename server/: --path-rename packages/backend/: \
  --path-rename tests/persistence.mjs:persistence.mjs
```

- `--path server/` zieht die **Pre-Rename-Historie** mit (Phase 1 war ein `git mv` server→packages/backend).
- `--path-rename …:` klopft die Dateien auf die **Repo-Wurzel** flach (`api.mjs`, `index.mjs`,
  `store.mjs`, `README.md`, `package.json`, `persistence.mjs`).
- **Verifikation:** `git log --oneline -- api.mjs` zeigt ~8 Commits inkl. `76b4524 Echtes /api/*-Backend …`.

```bash
git remote add origin https://github.com/crypticalcode/bsg-backend
git push -u origin HEAD:main
```

---

## B. Backend-Repo lauffähig machen (Commits im neuen Repo)

### B1 — Seeds vendoren, Runtime install-frei halten
- `@crypticalcode/api-contract` als **devDependency** aufnehmen (nicht Runtime-Dependency).
- `tools/vendor-seeds.mjs` 1:1 aus dem Monorepo übernehmen, Quelle = das **installierte** Package
  (`node_modules/@crypticalcode/api-contract/data/`), Ziel = `./data/`. Einmal ausführen → `data/`
  committen.
- **Seed-Loader anpassen** (von `../api-contract/data/` auf das lokale `data/`):
  - `index.mjs`: `const DATA_DIR = new URL("./data/", import.meta.url);`
  - `persistence.mjs`: `const DATA_DIR = new URL("./data/", import.meta.url);`
- CI-Gate `node tools/vendor-seeds.mjs --check` (vendored == Package) gegen Drift.

> Ergebnis: `node index.mjs` läuft **ohne `node_modules`** (Seeds liegen im Repo) → systemd-Deploy
> bleibt install-frei. Der Vertrag wird nur für Tests/Vendoring installiert.

### B2 — `package.json` (Repo-Wurzel)
```jsonc
{
  "name": "bsg-backend",
  "type": "module",
  "main": "index.mjs",
  "scripts": {
    "start": "node index.mjs",
    "test:persistence": "node persistence.mjs",
    "test:contract": "TEST_BASE=http://localhost:3000 bsg-contract",
    "vendor": "node tools/vendor-seeds.mjs",
    "vendor:check": "node tools/vendor-seeds.mjs --check"
  },
  "devDependencies": { "@crypticalcode/api-contract": "^1.0.0" },
  "engines": { "node": ">=20" }
}
```
- `.npmrc` (`@crypticalcode:registry=https://npm.pkg.github.com`) aus dem Monorepo übernehmen.

### B3 — Deploy mitnehmen
- `deploy/bsg-beta.service`, `deploy/bsg-prod.service`, `deploy/Caddyfile`, `deploy/README.md`
  übernehmen. systemd `ExecStart` auf den **Wurzelpfad** zeigen:
  `ExecStart=/usr/bin/node /var/www/bsg-<stufe>/index.mjs`.

### B4 — Eigene `ci.yml`
Steps: Syntax-Check (`node --check *.mjs tools/*.mjs`) · `npm ci` · `vendor-seeds --check` ·
`node persistence.mjs` · Backend booten + `TEST_BASE=… bsg-contract` (Contract real). Benötigt das
Registry-Token-Secret für die devDependency.

### B5 — `deploy-beta.yml` / `deploy-prod.yml` für **Option A** erweitern
Vor dem rsync das **Frontend-Artefakt** beschaffen und same-origin daneben legen:
```bash
git clone --depth 1 --branch "$FE_TAG" https://github.com/crypticalcode/vereins-baukasten fe
sed -i 's/mode: "mock",/mode: "real",/' fe/assets/js/api-config.js
# Backend + fe/ (ohne packages/, tools/, tests/, docs/) zum Server rsyncen, dann systemctl restart
```
Cookie-/CORS-Modell unverändert (ein Origin, `SameSite=Lax`).

---

## C. Monorepo-Cleanup (eigener PR in `crypticalcode/vereins-baukasten`, nachdem das Backend-Repo steht)

1. `git rm -r packages/backend` (Historie bleibt im Monorepo auffindbar).
2. **`.github/bsg-backend-ref`** anlegen (gepinnter Tag/Commit von `bsg-backend`, z. B. `v1.0.0`).
3. **`ci.yml`** umbauen — Backend für Real-Contract + E2E aus dem gepinnten Repo ziehen statt lokal:
   ```bash
   git clone --depth 1 --branch "$(cat .github/bsg-backend-ref)" \
     https://github.com/crypticalcode/bsg-backend /tmp/be
   node /tmp/be/index.mjs > /tmp/be.log 2>&1 &
   ```
   - Syntax-Check-Schleife: `packages/backend/*.mjs` entfernen.
   - Persistenz-Step entfällt (wandert ins Backend-Repo).
   - Real-Contract: `TEST_BASE=http://localhost:3000 node packages/api-contract/run.mjs` gegen
     `/tmp/be`.
4. **`tests/e2e/playwright.config.mjs`**: `webServer.command`/`cwd` auf das gezogene Backend
   (`node /tmp/be/index.mjs`) zeigen; Frontend-Static weiterhin aus dem Monorepo-Root.
5. **Hetzner-Deploys entfernen:** `deploy-beta.yml`, `deploy-prod.yml`, `deploy/` löschen.
   `deploy-pages.yml` + `publish-contract.yml` bleiben.
6. **Docs:** `CLAUDE.md`, `README.md`, `backend-repo-separation-plan.md` (Status → „Phase 3 Teil 1
   umgesetzt"); Verweise `packages/backend/` → Repo `bsg-backend`.

---

## Verifikation

1. **Historie:** `git log --oneline -- api.mjs` im neuen Repo ≈ 8 Commits inkl. Pre-Rename.
2. **Backend standalone:** `npm ci` → `vendor:check` → `node persistence.mjs` → booten +
   `TEST_BASE=… bsg-contract` grün; **install-frei**: ohne `node_modules` `node index.mjs` →
   `curl /api/age-classes` = 200.
3. **Monorepo nach Cleanup:** `ci.yml` zieht `bsg-backend @ ref`; Mock-Contract + E2E + Real-Contract grün;
   `deploy-pages` unverändert.
4. **Deploy A (Smoke):** Beta-Deploy zieht Frontend-Artefakt, liefert `/` **und** `/api/*` same-origin
   (200); Login-Cookie `SameSite=Lax` funktioniert.

---

## Rollback

- Vor dem Merge von C: Backend-Repo löschen/ignorieren, Cleanup-PR schließen → Monorepo unverändert.
- Nach dem Merge: Cleanup-PR reverten; das Backend lebt in der Monorepo-Historie weiter und kann per
  `git revert` bzw. erneutem `git mv` zurückgeholt werden.

## Folgekosten (bewusst)

- **Drei-Schritt pro Vertragsänderung** (Contract → Backend → Frontend) statt Ein-PR (§5); abgefedert
  durch Renovate + `hybrid`-Promotion.
- Offen: **Phase 3b** (Contract-Split) und **Phase 4** (getrennte CI/CD je Repo, E2E gegen gepinntes
  Backend-Artefakt/Docker-Image).
