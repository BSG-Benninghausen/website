# Den Webshop ins Upstream-Produkt bringen

> Status: **Anleitung / To-do.** Der Webshop läuft auf diesem Fork (`bsg-benninghausen/website`),
> ist aber **noch nicht** im generischen Upstream-Produkt (`crypticalcode/vereins-baukasten`).
> Dieses Dokument erklärt **warum** und gibt das **Rezept**, um die generische Shop-Engine (plus eine
> neutrale Beispiel-Seite) einmalig sauber upstream zu landen. Danach fließen Shop-Änderungen wieder
> automatisch über den Mergeback (siehe [`mergeback-pipeline.md`](mergeback-pipeline.md)).

## Warum ist der Shop nicht upstream?

1. **Eingeführt in der statischen `*.html`-Ära (Fork-PR #34).** Der Mergeback-`propose`-Job
   klassifizierte den Diff. Die statischen Shop-Seiten (`shop.html`, `shop-verwaltung.html`,
   `shop-recht.html`) hatten **generische Struktur und Vereins-Branding im selben Hunk** → Verdikt
   `needs_human` (entangled) → nur ein **Advisory-Kommentar**, **kein** Upstream-PR. Die manuelle
   Auftrennung/Contribution wurde nie nachgeholt.

2. **Der Mergeback seedet keine bestehenden Features.** `propose` wendet den **PR-Diff (Hunks)** per
   `git apply --3way … /tmp/fork.diff` auf `upstream/main` an. *Neu-Datei*-Hunks funktionieren, aber
   *Modify*-Hunks gegen eine Datei, die es upstream nicht gibt, scheitern hart
   (`error: assets/js/shop.js: does not exist in index`). Es gibt **keinen Re-Seed-Pfad** für ein
   bereits gemergtes Feature.

3. **Die Astro-Migration (#40/#41)** verschob die Shop-Seiten nach `astro-poc/club-pages/bsg/` (config,
   per-Club) und retirte die statischen Seiten. Die Entanglement-Ursache von #34 ist damit weg – aber
   die generische **Engine ist weiterhin nicht upstream**. Folge: jeder Shop-berührende Fork-PR lässt
   den `propose`-Job scheitern (zuletzt Fork-PR #44: `shop.js`/`shop.test.mjs` existieren upstream
   nicht, `mock-api.js`-Hunks konfligieren).

> **Hinweis:** `propose` ist **advisory** (nur Kommentar, kein Required-Check) – er blockiert den
> Merge eines Fork-PRs in den Fork-`main` **nicht**. Das eigentliche Problem ist die fehlende
> Upstream-Engine.

## Der Fix in einem Satz

Die **generische Shop-Engine + eine neutrale Beispiel-Seite** einmalig **direkt per PR** ins
Upstream-Repo bringen (der Mergeback kann ein bestehendes Feature nicht nachträglich seeden). Danach
greifen Fork-Shop-PRs wieder sauber über den Mergeback.

## Was genau upstream landen muss

### A) Generische Engine (neue Dateien upstream)
- `assets/js/shop.js` — öffentliche Shop-Logik (Katalog, Warenkorb, Login-Gate, Checkout, SEPA, „per
  Anfrage"-Fallback).
- `assets/js/shop-admin.js` — Betreiber-Admin (Produkte/Bestellungen/Förder-Status/Config).
- `packages/api-contract/shop.test.mjs` — Contract-Suite (Tier-Preise, Login-Gate, Mandat inkl.
  Bankdaten-Zustimmung).
- `packages/api-contract/data/shop.json` und `packages/api-contract/data/shop-products.json` —
  kanonische **neutrale** Seeds (bereits identitätsfrei).

### B) Generische Engine (additiv in vorhandene Upstream-Dateien einfügen)
- `assets/js/mock-api.js` — die Shop-Regionen in derselben Reihenfolge wie im Fork:
  - `manage_shop` im `PERMISSIONS`-Katalog · finde mit `grep -n 'manage_shop' assets/js/mock-api.js`
  - Rolle `shop` + Migration `v11` im `seed()` · `grep -n 'id: "shop"' assets/js/mock-api.js`
  - Shop-Schema/Helfer (`SHOP_CATEGORIES`, `SHOP_CONFIG_FIELDS`, `normShopConfig`, `shopConfigPublic`,
    `productErrors`/`productFields`, `shopTierFor`/`shopPriceFor`/`shopCanCheckout`) ·
    `grep -n 'SHOP_CONFIG_FIELDS\|shopConfigPublic\|shopTierFor' assets/js/mock-api.js`
  - `ensureShopProducts` / `ensureShopConfig` · `grep -n 'ensureShop' assets/js/mock-api.js`
  - alle `"… /api/shop…"`-Routen (Config, Products-CRUD, sponsored, mandate, orders, admin/orders,
    status) · `grep -n '/api/shop' assets/js/mock-api.js`
- `assets/css/styles.css` — Shop-Komponenten · `grep -n '\.shop-\|\.cart-\|\.tier-badge\|\.order-' assets/css/styles.css`
- `astro-poc/src/layouts/Base.astro` — die globale Zeile `<script is:inline src="assets/js/shop.js">`
  (lädt `shop.js` site-weit, wie `sponsors.js`). *(Hinweis: die globale `shop.js`-Zeile kommt aus
  Fork-PR #44; ohne sie erscheint der „Shop"-Menülink nur auf Shop-Seiten.)*
- `README.md` — die Shop-Zeilen (Endpoint-Tabelle, `manage_shop`, localStorage-Keys `bsg_shop_*`).

### C) Neutrale Beispiel-Seite (gewählter Umfang „Engine + Beispiel-Seite")
Es gibt **keine** neutrale Shop-Seiten-Vorlage – Shop-Seiten existieren nur unter `club-pages/bsg/`.
Für ein vollständig nachnutzbares Upstream-Feature eine **neutrale** Vorlage beilegen, gespiegelt von
den BSG-Seiten, aber **ohne Identität** (Betreiber kommt zur Laufzeit aus `/api/shop-config` über
`data-shop-operator`; statische Fallback-Texte neutral):
- `astro-poc/club-pages/<musterverein-id>/shop.astro` (+ `shop-verwaltung.astro`, `shop-recht.astro`),
  passend zur Upstream-Club-Konvention. In `shop.astro` den hartkodierten Fallback-Namen durch
  neutralen Text ersetzen; Crumbs/Texte neutral halten.

### Bleibt im Fork (config, **niemals** upstream)
`assets/data/shop.bsg.json`, `assets/data/shop-products.bsg.json`,
`astro-poc/club-pages/bsg/shop*.astro` — enthalten BSG-Identität (Betreibername, IBAN, Gläubiger-ID,
„BSG Benninghausen").

## Neutralisierungen (3 Stellen in generischen Dateien)

Der Betreibername ist **nicht** in `upstream-manifest.json#forbidden_patterns` und blockiert daher
nicht automatisch – ist aber geleakte Identität in „generischen" Dateien und sollte vor der
Upstream-Contribution raus (der Upstream-`gate`-Review prüft Identität/Konventionen):

1. `assets/js/shop-admin.js` (Kopf-Kommentar): den Beispiel-Betreibernamen entfernen/generalisieren.
2. `assets/js/mock-api.js` (Kommentar an der `shop`-Rollen-Migration): Namen entfernen – das Prinzip
   „eigene Rolle, **nicht** an den Vorstand" bleibt.
3. `packages/api-contract/shop.test.mjs` (Test-User): neutralen Namen verwenden (z. B. „Muster
   Betreiber"), z. B. `grep -n 'newUser("' packages/api-contract/shop.test.mjs`.

Verifizieren: `grep -rIE 'Benninghausen|Julian Becker' assets/js packages tests astro-poc/src` → leer.

## Wie upstream landen (Schritt für Schritt)

Direkter PR gegen `crypticalcode/vereins-baukasten:main` (der Mergeback kann es nicht auto-seeden):

1. Engine-Dateien aus **A)** anlegen, Regionen aus **B)** additiv in die vorhandenen Upstream-Dateien
   einfügen (gleiche Reihenfolge wie im Fork), Beispiel-Seite(n) aus **C)** hinzufügen.
2. Die 3 Neutralisierungen anwenden.
3. Upstream verifizieren:
   - `node packages/api-contract/run.mjs` → die Shop-Suite ist grün (Tier-Preise, Login-Gate 401,
     Mandat inkl. Bankdaten-Zustimmung).
   - Astro-Build grün (Default-Club + ggf. `BSG_CLUB_ID=<musterverein>`), `node --check` der neuen JS.
   - `grep -rIE 'Benninghausen|Julian Becker' …` → leer.
4. Upstream-PR mergen.
5. **Danach** den blockierten Fork-PR erneut anstoßen (re-sync / leerer Commit): `git apply` der
   Shop-Hunks greift jetzt → der Mergeback öffnet den Upstream-Vorschlag sauber. (Oder den Fork-PR
   einfach mergen – `propose` ist advisory.)

## Folgehygiene (eigener Fork-PR, nach dem Upstream-Merge)

Damit künftige Mergebacks sauber bleiben, sollten die **generischen** Shop-Dateien auf dem Fork
**identisch** zu upstream sein. Insbesondere die 3 Neutralisierungen auch auf dem Fork anwenden
(Fork == Upstream).

## Zugriffs-Hinweis

Der Upstream-PR muss im Repo `crypticalcode/vereins-baukasten` erstellt werden. Eine Agent-Session,
die nur Zugriff auf `bsg-benninghausen/website` hat (und ohne `add_repo`-Tool), kann das **nicht**
selbst tun – der PR ist von einer Person mit Upstream-Zugriff bzw. in einer Session mit beiden Repos
zu erstellen.
