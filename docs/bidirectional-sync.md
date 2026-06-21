# Bidirektionaler Sync: Upstream ⇄ Verein-Fork

Dieses Repo (`vereins-baukasten`) ist das **generische Produkt**. Ein Verein betreibt seine Seite als
**Fork** (z. B. `bsg-benninghausen/website`) und stellt seine Marke als **Konfiguration** ein. Ziel:
Bugfixes/Features fließen **in beide Richtungen** (Upstream→Fork *und* Fork→Upstream), ohne dass das
jeweilige Branding überschrieben wird oder Merge-Konflikte erzeugt.

## Leitprinzip

> **Geteilter Code ist in allen Repos byte-identisch. Branding ist ausschließlich Daten in wenigen
> repo-privaten Dateien.** Geteilte Dateien mergen damit trivial in beide Richtungen; die privaten
> Branding-Dateien werden per `.gitattributes merge=ours` vor Cross-Contamination geschützt.

## Die drei Bausteine

1. **`assets/js/deploy-config.js` (repo-privat)** — synchron im `<head>` **vor** `club-config.js`
   geladen (analog `api-config.js` vor `mock-api.js`). Die **einzige** branding-bestimmende Datei.
   Setzt:
   - `window.BSG_CLUB_REGISTRY` — die Beispiel-/Vereins-Registry dieses Repos.
   - `window.BSG_CLUB_DEFAULT` — Default-Verein (`"demo"` upstream, `"<id>"` im Fork).
   - `window.BSG_ROOT_MODE` — `"portal"` (Upstream zeigt Produkt-Portal) oder `"club"`
     (Fork: Wurzel `index.html` leitet auf `home.html?club=<id>`).
   - `window.BSG_ADMIN_EMAIL` — optional, Seed-Admin.

2. **Geteilte, identische Logik** — `club-config.js` liest Registry/Default aus `window.*`
   (Fallback: neutrales `demo`-Beispiel); `index.html` enthält das Portal **plus** den
   `BSG_ROOT_MODE`-Redirect. Beide Dateien sind in Upstream und Fork gleich → mergebar.

3. **Per-Verein-Seeds (additiv, repo-privat)** — `mock-api.js` seedet club-bewusst:
   `ensureNews/ensureSite/ensureEvents/ensureTraining` laden zuerst `<base>.<ns>.json`
   (z. B. `news.bsg.json`) und fallen sonst auf das generische `<base>.json` zurück. Die
   verein-spezifischen Seeds liegen nur im Fork (andere Dateinamen → kein Konflikt) und **nicht**
   in `packages/api-contract/data/` — die **kanonischen Contract-Seeds bleiben generisch** (sonst
   bricht `vendor-seeds --check`).

## Geschützte Dateien (`.gitattributes`, in beiden Repos identisch)

```
assets/js/deploy-config.js              merge=ours
manifest.webmanifest                    merge=ours
assets/img/{favicon,apple-touch-icon,icon-192,icon-512,icon-maskable-512}.png  merge=ours
deploy/**                               merge=ours
.github/workflows/deploy-{beta,prod,pages}.yml  merge=ours
```

`merge=ours` braucht eine **einmalige Treiber-Registrierung pro Klon/CI**:

```sh
sh tools/configure-merge-drivers.sh        # = git config merge.ours.driver true
```

Ohne diesen Schritt greift die Allowlist nicht. Der `true`-Treiber ist ein No-Op, der den Merge mit
Exit 0 abschließt und so die **eigene** (Ziel-Repo-)Version behält.

## Sync-Workflow

**Einmalig pro Klon:** `sh tools/configure-merge-drivers.sh`

**Upstream → Fork** (Features/Fixes ziehen):
```sh
git fetch upstream && git merge upstream/main
# Geteilte Dateien mergen sauber; Branding-Dateien bleiben (merge=ours).
# Einzige reguläre Reibung: ?v=N in *.html (s. u.).
```

**Fork → Upstream** (Verbesserung zurückgeben): als **vereins-neutralen** PR gegen `main` öffnen
(keine club-spezifischen Inhalte). Branding-Dateien des Forks bleiben beim Upstream unverändert
(merge=ours), generische Code-Änderungen werden übernommen.

## Einzige wiederkehrende Reibung: Cache-Busting `?v=N`

Beide Repos zählen `?v=N` unabhängig hoch → bei jedem Cross-Merge kollidiert nur diese Zahl in den
`*.html`. Auflösung nach dem Merge:

```sh
grep -rl 'v=[0-9]\+' *.html | xargs sed -i 's/?v=[0-9]\+/?v=NEU/g'   # service-worker VERSION mit
node tools/guard-versions.mjs
```

## Eine neue Vereins-Marke (Fork) einrichten

1. `assets/js/deploy-config.js`: eigenen Registry-Eintrag, `BSG_CLUB_DEFAULT="<id>"`, `BSG_ROOT_MODE="club"`.
2. `assets/data/club.<id>.json` + `assets/css/theme.<id>.css` (+ `assets/img/<id>-logo.png`).
3. Optional Inhalts-Seeds: `assets/data/{news,site,events,trainingszeiten}.<id>.json`.
4. `manifest.webmanifest` + Branding-Icons ersetzen (stehen auf der merge=ours-Allowlist).
5. `sh tools/configure-merge-drivers.sh` ausführen.
