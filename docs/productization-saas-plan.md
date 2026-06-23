# Produktisierung: Open-Source-Frontend + buchbares SaaS-Backend

Status: **Vorschlag / Diskussionsgrundlage.** Begleitdokument zu
[`backend-repo-separation-plan.md`](./backend-repo-separation-plan.md). Während jenes Dokument die
*technische* Trennung von Frontend, Mock und Backend beschreibt, beschreibt dieses die
*Produkt*-Vision: aus dem BSG-spezifischen Vereinsauftritt ein **wiederverwendbares Produkt** machen.

---

## 1. Vision & Zielbild

- **Frontend = Open Source.** Ein generischer Vereins-Webauftritt (HTML/CSS/JS, zero-dep) inklusive
  vollständigem **Mock-Backend** im öffentlichen Repo. Jeder Verein kann ihn klonen, lokal/als
  Static (z. B. GitHub Pages) betreiben und im **Mock-Modus** sofort ausprobieren.
- **Backend = buchbarer SaaS-Dienst.** Das echte Backend (eigenes, privates Repo) wird pro Verein
  als Dienst betrieben und ist **per Domain/IP** erreichbar. Vereine buchen ein Abo und ggf.
  einzelne Features; der Dienst stellt sie für ihre Domain bereit.
- **BSG = Referenzkunde (erster Mandant).** BSG validiert das Produkt end-to-end; die
  BSG-spezifischen Inhalte sind **Konfiguration**, kein Code.

Die tragende Mechanik existiert bereits: Der **Mock⇄Real-Router** (`assets/js/api-config.js`,
`window.BSG_API = { mode, base, live }`) trennt UI von Backend; das Frontend spricht ausschließlich
`/api/*`. Ein Verein zeigt im `real`-Modus mit `base = https://api.<verein>.de` auf seinen Mandanten.

---

## 2. White-Label-Schicht (in dieser Iteration umgesetzt)

Branding ist nicht mehr im Markup hartcodiert, sondern **Laufzeit-Konfiguration**:

- **`GET/POST /api/club`** + Seed `assets/data/club.json` (Schema `CLUB_FIELDS`, gespiegelt in
  `assets/js/mock-api.js` und `packages/backend/api.mjs`). Felder: `brand_name`, `name`, `short_name`, `sport`,
  `brand_sub`, `locality`, `email`, `instagram_url/_handle`, `venue`, `street`, `city`,
  `description`, `logo`. Schreiben erfordert das neue Recht **`manage_club`**.
- **`[data-club="key"]`** im DOM (Anwendung in `main.js`, analog zum bestehenden `[data-site]`):
  Name, Sport, Adresse, Kontakt, Impressum und Logo werden zur Laufzeit gefüllt. Generische
  Platzhalter im HTML dienen als Fallback.
- **Theme-Schicht** `assets/css/theme.css` (Farben/Schrift als CSS-Custom-Properties), vor
  `styles.css` geladen. Ein Verein tauscht **nur diese Datei** (Vorlage: `theme.example.css`);
  `styles.css` enthält nur noch Struktur.
- **Generischer Default:** `club.example.json` + `theme.example.css` („Musterverein"). Der
  ausgelieferte Seed `club.json` trägt die BSG-Werte (BSG = erster Kunde), sodass die bestehende
  GitHub-Pages-Seite optisch unverändert bleibt.

**`<head>` & PWA (P2, umgesetzt):** `<title>`, `theme-color` und der App-Titel werden von `main.js`
zur Laufzeit aus `/api/club` gesetzt (client-seitig, wirkt in Static **und** Real; pro Seite über
`data-page-title`). Das **`manifest.webmanifest`** rendert das echte Backend pro Domain
(`packages/backend/index.mjs` → `GET /api/manifest` aus der Club-Config); im Static-Deploy bleibt die
committete Default-Datei. (Offen: crawler-korrekte `<title>`/Description ohne JS + per-Verein-Icon-/
Favicon-Dateien — siehe Roadmap im Hauptrepo.)

---

## 3. Zwei-Schichten-Feature-Modell (Kern der „Feature-Buchung")

Heute steuert ein Feature **eine** Achse (Freigabe-Scope). Für SaaS braucht es **zwei** klar
getrennte Schichten:

| Schicht | Ebene | Wer entscheidet | „Frage" | Speicher (heute/künftig) |
|---|---|---|---|---|
| **Provisioniert / gebucht** | Mandant (Domain) | SaaS-Anbieter / Abo-Tarif | *Existiert* das Feature für diesen Verein überhaupt? | künftig: Provisioning-Store pro Mandant |
| **Freigegeben** | Verein (intern) | Vereins-Admin (`manage_features`) | *Wer im Verein* sieht es? (`public`/`off`/`{roles}`) | **vorhanden:** `bsg_feature_flags` |

Die **Freigabe-Schicht existiert bereits** vollständig (`GET /api/capabilities`,
`POST /api/features/release`, Scope `public | off | {roles}`, Recht `manage_features`,
Loader `assets/js/features/loader.js`). Damit erfüllt der heutige Stand bereits den Wunsch
„gemocktes Feature nur dem Vorstand zum Testen zeigen, nicht den Mitgliedern" — exakt
`release: { roles: ["vorstand"] }`.

**Was die Buchungs-Schicht ergänzt (P3, umgesetzt):**

1. **Provisioning-Store** pro Mandant (`bsg_feature_bookings` / `db.featureBookings`): Buchung je
   Feature-Key. Default **gebucht** (`FEATURE_DEFAULT_BOOKED`), daher für BSG unverändert; im realen
   Backend künftig aus Abo/Billing abgeleitet.
2. **`GET /api/capabilities` filtert gebucht × freigegeben:** ein nicht gebuchtes Feature ist für
   **alle** unsichtbar (auch für `manage_features`-Vorschau), unabhängig vom Freigabe-Scope —
   der Buchungs-Gate greift **vor** `canSeeFeature`.
3. **Recht `book_features`** + `GET /api/bookings` + `POST /api/features/book` `{ key, booked }`:
   Verwaltung über Admin → „Funktionen buchen". Im Mock self-service; im realen SaaS später durch
   Abo-Grenzen/Billing gegated (Upgrade nötig, P4).

So bleibt die Trennung sauber: **Anbieter** bestimmt *Verfügbarkeit* (Buchung), **Vereins-Admin**
bestimmt *Sichtbarkeit* (Freigabe an `public`/Rollen).

---

## 4. Mehrmandantenfähigkeit (Backend)

**Persistenz (P4 Teil 1, umgesetzt):** Das `packages/backend/` hält den `db` jetzt optional als JSON-Snapshot
durabel (`BSG_DATA_FILE` → `packages/backend/store.mjs`, atomares Write-through in `handle()`, fail-safe Boot,
`sessions` flüchtig). Ohne die Env-Var bleibt alles in-memory wie zuvor → Tests/CI/E2E unverändert.
Die `db`/`dataFile`-Kapselung ist die **Naht** für echte Mandantenfähigkeit (ein `dataFile` je Mandant).

Das `packages/backend/` ist weiterhin **single-tenant** (ein Store, ein Seed-Admin). Was für volle
SaaS-Mandantenfähigkeit noch fehlt (Host-basierte Mandanten-Auflösung, mandanten-getrennter Store,
Branding-Assets je Mandant, Onboarding-Flow), wird in der Roadmap des Hauptrepos geführt.

Der Same-Origin-Vorteil (kein CORS, `SameSite=Lax`-Cookies) bleibt erhalten, wenn pro Verein ein
eigener Origin bedient wird — andernfalls greift die Cross-Origin-Härtung aus
`backend-repo-separation-plan.md` §6 (Option B).

---

## 5. Bezug zum Repo-Split

- Das **generische Frontend + Mock** gehören ins öffentliche Repo; die **White-Label-Config**
  (`club`, `theme`) lebt dort.
- **Provisioning/Billing/Mehrmandanten-Persistenz** gehören ins **private Backend-Repo**.
- Der **gemeinsame Vertrag** (Contract-Package aus dem Trennungsplan) deckt auch `/api/club` und —
  künftig — `/api/features/book` ab, sodass Mock und Backend testgetrieben in Sync bleiben.

---

## 5a. Produkt-Portal & Referenz-Beispiele (umgesetzt)

Die GitHub-Pages-Startseite ist nicht mehr der BSG-Auftritt, sondern ein **generisches
Produkt-Portal** (`index.html`): es erklärt das Produkt und listet mehrere **Referenz-Beispiele**.
BSG ist das erste; die bisherige Vereins-Startseite liegt jetzt unter **`home.html`**.

Die Beispiele laufen **config-getrieben auf demselben Frontend** („BSG = Konfiguration, kein Code"):

- **`assets/js/club-config.js`** (synchron im `<head>`, vor `styles.css`/`mock-api.js`) ist Registry
  **und** Resolver. Das aktive Beispiel kommt aus `?club=<id>` → `localStorage bsg_example` → Default
  (eigener Key, **nicht** `bsg_club` – das ist die Club-Branding-Config `KEYS.club`).
  Ergebnis: `window.BSG_CLUB = { id, name, clubSeed, theme, ns }` und `window.BSG_EXAMPLES`
  (für die Portal-Karten). Es injiziert auf Vereinsseiten (`<html data-club-site>`) FOUC-frei das
  passende Theme.
- **Pro Beispiel ein eigener Store-Namespace**: `mock-api.js` präfixt alle `localStorage`-Schlüssel
  mit `BSG_CLUB.ns`; das Default-Beispiel `bsg` behält die Legacy-Schlüssel (`bsg_*`) — bestehende
  Deployments und die Contract-Tests bleiben unberührt. So haben BSG- und Musterverein-Demo
  getrennte Daten/Seeds.
- **Pro Beispiel ein eigener Club-Seed**: `ensureClub()` lädt `window.BSG_CLUB.clubSeed`
  (`club.json` für BSG, `club.example.json` für „Musterverein") statt fest `club.json`.

**Neues Beispiel = ein Eintrag in `club-config.js` + `assets/data/club.<id>.json` + ein Theme** —
ohne den Rest des Frontends anzufassen. Das ist die Pages-/Mock-Vorstufe der späteren
host-basierten Mehrmandanten-Auflösung (§4): dort liefert ein Backend pro Domain die Config,
hier wählt der Besucher das Beispiel per Query.

---

## 6. Phasen-Roadmap

Phasen **P1–P3b** sind umgesetzt (oben in §1–§5a beschrieben), **P5 (Repo-Split)** ebenfalls (Backend
in eigenem Repo + Contract-Package). Der **offene** Rest wird zentral in der Roadmap des Hauptrepos
geführt, nicht mehr als Status-Tabelle hier — Index: [`ROADMAP.md`](../ROADMAP.md).
