# Mitwirken (Contributing)

Dieses Repo ist ein **generisches, white-label-fähiges Vereins-Website-Produkt** (rein statisch:
HTML/CSS/JS, zero-dep) mit vollständigem **Mock-Backend** im Browser. Vereine betreiben es als
**Fork** mit ihrer eigenen Konfiguration (siehe [`docs/fork-onboarding.md`](docs/fork-onboarding.md));
Verbesserungen fließen als Issues/PRs hierher zurück.

## Entwicklung

Kein Build, keine Abhängigkeiten.

```bash
# Lokale Vorschau (über HTTP, nicht file://)
python3 -m http.server 8000        # http://localhost:8000

# Geänderte JS syntaktisch prüfen
node --check assets/js/<datei>.js

# Contract-Tests (Mock + echtes Backend) – aus dem Repo-Root
node packages/api-contract/run.mjs                                   # Mock
TEST_BASE=http://localhost:3000 node packages/api-contract/run.mjs   # gegen ein echtes Backend (vereins-baukasten-backend)

# Cache-Busting-Konsistenz prüfen
node tools/guard-versions.mjs

# Browser-E2E (isolierte devDeps unter tests/e2e/) – Backend-Repo auschecken, BSG_BACKEND_DIR setzen
cd tests/e2e && npm install && BSG_BACKEND_DIR=../../../vereins-baukasten-backend npx playwright test
```

## Konventionen

- **Nicht auf `main` pushen.** Feature-Branch ab `origin/main`, (Draft-)PR öffnen, dann
  **Squash-Merge** nach `main`. GitHub Pages deployt automatisch von `main`.
- **Cache-Busting ist Pflicht.** Jede lokale CSS/JS-Einbindung trägt `?v=N`. Wenn du JS/CSS
  änderst, erhöhe `N` auf **allen** `*.html` gemeinsam und passe `VERSION` in `service-worker.js`
  an (`node tools/guard-versions.mjs` prüft das). Beispiel:
  `grep -rl "v=N" *.html | xargs sed -i 's/?v=N/?v=N+1/g'`.
- **CI grün halten.** `ci.yml` läuft die Contract-Tests (Mock) + Guards und die E2E gegen das
  gepinnte Backend (`backend-ref.json`, Secret `BACKEND_REPO_TOKEN`; ohne Token wird E2E grün
  übersprungen). Real-Modus/Persistenz laufen in der CI des Backend-Repos. Wenn du eine Route
  änderst, ergänze/aktualisiere eine Suite in `packages/api-contract/`.
- **Branding ist Konfiguration, kein Code.** Neue Vereins-/Marken-Inhalte gehören in
  `assets/data/club.<id>.json` + `assets/css/theme.<id>.css` + einen Registry-Eintrag in
  `assets/js/club-config.js` – nicht hartcodiert ins Markup.

## Bugs & Feature-Requests

- **Issues** hier im Haupt-Repo eröffnen (dafür ist kein Fork nötig).
- **Fixes/Features** als **Pull Request aus deinem Fork** gegen `main` einreichen. Halte den PR
  klein und vereins-neutral (keine club-spezifischen Inhalte im Upstream-PR).
- **Automatischer Mergeback (optional):** Ist im Fork `MERGEBACK_ENABLED=true` gesetzt, **baust du
  den Upstream-PR nicht selbst** – öffne einfach einen PR in deinem Fork. Ein Bot extrahiert den
  generischen Anteil, neutralisiert ihn und öffnet/aktualisiert den vereins-neutralen PR gegen
  `main`. Halte generische Änderungen und Branding in **getrennten** Hunks (sonst meldet der Bot
  `needs-human`). Details: [`docs/mergeback-pipeline.md`](docs/mergeback-pipeline.md).

Mehr zur Architektur: [`CLAUDE.md`](CLAUDE.md), [`README.md`](README.md),
[`docs/productization-saas-plan.md`](docs/productization-saas-plan.md).
