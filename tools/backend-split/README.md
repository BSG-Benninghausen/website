# `tools/backend-split/` — Backend ins eigene Repo extrahieren

Werkzeug für **Phase 3** von [`docs/backend-repo-separation-plan.md`](../../docs/backend-repo-separation-plan.md):
erzeugt aus dem Monorepo den vollständigen, **install-freien** Inhalt des eigenständigen Repos
[`crypticalcode/vereins-baukasten-backend`](https://github.com/crypticalcode/vereins-baukasten-backend).

```bash
tools/backend-split/extract.sh --no-history --out <ziel> [--force] [--no-verify]
```

## Was es tut

`extract.sh` legt einen vollständigen Standalone-Tree an (`materialize`):

| Quelle (Monorepo)                              | Ziel (Backend-Repo)            | Transformation |
|------------------------------------------------|--------------------------------|----------------|
| `packages/backend/{api,index,store,persistence}.mjs` | Repo-Wurzel (flach)      | `api.mjs`/`store.mjs` **unverändert**; in `index.mjs`/`persistence.mjs` werden nur die Pfade umgeschrieben |
| `packages/api-contract/{run,harness,*.test}.mjs`, `README.md`, `data/` | `contract/` | 1:1 vendored (Vertrag) |
| `packages/api-contract/data/*.json`            | `data/*.json`                  | Laufzeit-Seeds, vendored via `tools/vendor-seeds.mjs` |
| `templates/*`                                  | `package.json`, `.gitignore`, `tools/vendor-seeds.mjs`, `contract/mock-src.stub.js`, `.github/workflows/ci.yml`, `README.md` | Scaffolding (README mit Herkunfts-Stempel) |

Die Pfad-Umschreibung (`rewrite-paths.mjs`) ist **assertiv**: jede Ersetzung muss exakt greifen,
sonst bricht das Skript ab (kein still-falscher Output, wenn sich Upstream ändert):

- `index.mjs` / `persistence.mjs`: Seed-Dir `../api-contract/data/` → `./data/`
- `index.mjs`: Static-Root `../../` (Frontend-Workspace) → `BSG_STATIC_DIR` bzw. `./public`
- `index.mjs`: `DENY_STATIC` auf die Verzeichnisse des Backend-Repos angepasst

## Modi

- **`--no-history` (empfohlen, Snapshot).** Sauberer Inhalt ohne Git-Historie. Braucht **kein**
  `git-filter-repo`. Das ist der dokumentierte erste Schritt; das Skript ist re-runnbar und dient so
  zugleich als **Sync-Mechanismus** (erneut ausführen → Vertrag/Seeds neu vendoren).
- **(default) Historie.** Nimmt die Historie via `git filter-repo` mit (flacht `packages/backend/`
  inkl. der Pre-Rename-`server/`-Historie auf die Wurzel) und legt das Standalone-Layout darüber.
  Erfordert ein installiertes `git-filter-repo`; sonst klare Fehlermeldung mit Hinweis auf `--no-history`.

## Selbsttest

Ohne `--no-verify` prüft das Skript den erzeugten Tree end-to-end: `node --check` aller `.mjs`,
Seeds-Drift (`data/ == contract/data/`), Persistenz-Roundtrip und die **Contract-Suite im Real-Modus**
gegen das frisch gebootete Backend (Port `BSG_EXTRACT_PORT`, Default `3997`). Das ist dasselbe
Real-Mode-Gate wie die Monorepo-CI — nur gegen das extrahierte Backend.

## Zero-Dependency / install-frei

Das erzeugte Repo hat **keine** Laufzeit- und Dev-Abhängigkeiten: der Vertrag (Suiten + Seeds) ist
nach `contract/` vendored, die Laufzeit-Seeds nach `data/`. `npm ci` ist in der CI nicht nötig.
`contract/harness.mjs` liest beim Laden eine Mock-Quelle ein (auch im Real-Modus, wo ihr Inhalt
ungenutzt bleibt); dafür zeigt `BSG_MOCK_SRC` auf `contract/mock-src.stub.js`.

> **Phase 3b (später).** Sobald `@crypticalcode/api-contract` als Package konsumiert wird, ersetzt die
> devDependency das vendored `contract/`-Verzeichnis und `tools/vendor-seeds.mjs` zieht die Seeds aus
> `node_modules/@crypticalcode/api-contract/data/`. Das Laufzeit-Seed-Laden bleibt pfadbasiert (`./data/`).
