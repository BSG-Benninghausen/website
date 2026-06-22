# Vereins-Baukasten – generische Vereinswebsite

Moderne, white-label-fähige Vereinswebsite – HTML, CSS und etwas JavaScript mit vollständigem
**Mock-Backend** im Browser, deploybar auf GitHub Pages o. Ä. Dieser Fork ist eine
**Single-Tenant-Seite** für **BSG Benninghausen** (<https://bsg-benninghausen.github.io/website/>):
Das Marken-/Layout-Branding ist **Konfiguration** (`assets/data/club.bsg.json` + Theme), kein
hartcodierter Code; schnell ändernde Inhalte (Texte, News, Termine) bleiben dynamisch über `/api/*`.

## Single-Tenant-Fork

Die GitHub-Pages-**Startseite** (`index.html`) ist direkt die Vereins-Startseite – kein
Produkt-Portal und kein `?club=`-Resolver mehr. `assets/js/club-config.js` hält die
Minimalkonfig **eines** Vereins (Namespace, Theme, Seed `club.bsg.json`). Das frühere
White-Label-Portal mit mehreren Referenz-Beispielen lebt im Upstream
(`crypticalcode/vereins-baukasten`); zum Produktmodell siehe
[`docs/productization-saas-plan.md`](docs/productization-saas-plan.md).

## Inhalt & Seiten

| Seite | Datei | Inhalt |
| --- | --- | --- |
| Start | `index.html` | Hero, Über uns, Angebot, Trainings-Teaser, News-Teaser, CTA |
| Trainingszeiten | `trainingszeiten.html` | Trainingsgruppen, Zeiten, Ort |
| Team | `team.html` | Vorstand & Trainerteam |
| Aktuelles | `aktuelles.html` | News-Liste (aus Mock-API) |
| Termine | `kalender.html` | Kommende Termine (aus Mock-API) |
| Probetraining | `anmeldung.html` | Anmeldeformular (→ Mock-API) |
| Kontakt & Impressum | `kontakt.html` | Kontaktformular (→ Mock-API) + Impressum |
| Datenschutz | `datenschutz.html` | Datenschutzerklärung (Vorlage) |
| 404 | `404.html` | Fehlerseite |

## Projektstruktur

```
*.html                       Alle Seiten (index.html = Start), zero-dep zur Laufzeit
service-worker.js            PWA: Offline-Cache (VERSION mit ?v=N synchron halten)
assets/
├── css/                     Design-System, Styles, Beispiel-Themes (theme.<id>.css)
├── js/                      mock-api.js ("Server"), main.js (BSG.*), api-config.js,
│                            club-config.js (Single-Tenant-Config), Seitenskripte, features/
├── data/                    Seed-JSONs (news, events, club, site, membership-types, …)
└── img/                     Logo, Favicon, Muster (SVG)
packages/
├── api-contract/            Contract-Tests, Harness, Seeds + Backend-Vertrag (README.md)
└── backend/                 Echtes Node-Backend (api.mjs, index.mjs, store.mjs, README.md)
tests/e2e/                   Playwright-Suite (isolierte devDeps)
tools/                       Wartungs-Skripte (guard-versions, vendor-seeds, mergeback-Tools)
docs/                        Architektur-/Onboarding-/Roadmap-Dokumente
```

## Lokale Vorschau

Weil die Seite per `fetch()` JSON lädt, muss sie über **HTTP** (nicht per Doppelklick
als `file://`) geöffnet werden. Einfachster Weg:

```bash
# im Projektordner
python3 -m http.server 8000
# dann im Browser öffnen:
# http://localhost:8000
```

Alternativ z. B. `npx serve` oder die „Live Server"-Erweiterung in VS Code.

## Der gemockte „Server"

Die Seite ist statisch, einige Funktionen brauchen aber normalerweise ein Backend
(Formulare absenden, News/Termine laden). Diese werden von **`assets/js/mock-api.js`**
simuliert: Das Skript überschreibt `window.fetch` und beantwortet alle Anfragen unter
`/api/...` lokal im Browser – mit realistischer Verzögerung.

Bereitgestellte Endpunkte:

| Methode & Pfad | Funktion |
| --- | --- |
| `GET /api/news` | News aus `assets/data/news.json` |
| `GET /api/events` | Termine aus `assets/data/events.json` |
| `POST /api/anmeldung` | Probetraining-Anmeldung (Validierung, Speicherung in `localStorage`) |
| `POST /api/kontakt` | Kontaktnachricht (Validierung, Speicherung in `localStorage`) |
| `GET /api/membership-types` · `POST /api/membership-types` | Beitragstypen lesen (öffentlich, Seed `assets/data/membership-types.json`) · Mitgliedsbeiträge bearbeiten (Recht `manage_fees`) |
| `POST /api/auth/register` | Konto anlegen (Name + E-Mail), setzt Session |
| `POST /api/auth/request-code` | Anmeldecode anfordern (Mock liefert `devCode` zurück) |
| `POST /api/auth/login` | Login mit E-Mail + Code |
| `POST /api/auth/logout` · `GET /api/auth/me` | Abmelden · aktuelles Konto |
| `POST /api/account/update` | Adresse, IBAN und/oder **Profilfoto** ändern (IBAN-Prüfung inkl. Mod-97) |
| `GET /api/memberships` · `POST /api/memberships` | Mitgliedschaften lesen · abschließen |
| `POST /api/memberships/cancel` | Mitgliedschaft kündigen |
| `GET /api/age-classes` | Auswählbare Wettkampf-Altersklassen (für den Termin-Editor) |
| `GET /api/weight-classes` | Gewichtsklassen je Altersklasse & Geschlecht (für gefilterte Auswahl) |
| `GET /api/training` · `POST /api/training`(`/update`,`/delete`) | Trainingszeiten lesen (öffentlich) · pflegen (`manage_training`) |
| `GET /api/team` | Team & Vorstand – **aus den Vereinsämtern × Nutzern** berechnet (öffentlich) |
| `GET /api/positions` · `POST /api/positions`(`/update`,`/delete`) | Vereinsämter (Team-Seite) lesen & pflegen (`manage_team`) |
| `GET /api/site` · `POST /api/site` | Startseiten-Texte lesen (öffentlich) · speichern (`manage_site`) |
| `GET /api/sponsors` · `POST /api/sponsors`(`/update`,`/delete`) | Sponsoren lesen (öffentlich) · pflegen (`manage_sponsors`) |
| `GET /api/sponsors-config` · `POST /api/sponsors-config` | Sponsoren-Anzeige (an/aus, Stil, Premium-Stufen, Platzierungen) lesen (öffentlich) · speichern (`manage_sponsors`) |
| `GET /api/shop-config` · `POST /api/shop-config` | Webshop-/Betreiber-Config lesen (öffentlich) · speichern (`manage_shop`) – Betreiber (Privatperson, **nicht der Verein**): Name, Anschrift, IBAN/Gläubiger-ID, Impressum/AGB/Widerruf |
| `GET /api/shop/products` · `POST /api/shop/products`(`/update`,`/delete`) | Produkte lesen (öffentlich, Preis je Stufe für den Aufrufer aufgelöst) · pflegen (`manage_shop`) |
| `POST /api/shop/sponsored` | Konto als „gesponsert" markieren (per `userId` **oder** `email`) → Förderpreis (`manage_shop`) |
| `GET /api/shop/mandate` · `POST /api/shop/mandate` | SEPA-Lastschriftmandat des eigenen Kontos lesen/erteilen (nur aktive Mitglieder) |
| `GET /api/shop/orders` · `POST /api/shop/orders` | Eigene Bestellungen lesen · bestellen (nur aktive Mitglieder, SEPA-Lastschrift) |
| `GET /api/shop/admin/orders` · `POST /api/shop/orders/status` | Alle Bestellungen + Status pflegen (`manage_shop`) |
| `GET /api/club` · `POST /api/club` | Vereinsdaten/Branding lesen (öffentlich) · speichern (`manage_club`) – White-Label-Config (Name, Sport, Adresse, Kontakt, Telefon, Vereinsregister/VR-Nummer, Logo, Tagline, Markenfarbe) |
| `GET /api/manifest` | PWA-Manifest aus der Club-Config (rohes Objekt, öffentlich). Das echte Backend liefert `/manifest.webmanifest` pro Domain darüber aus; `<title>`/`theme-color`/App-Titel setzt `main.js` client-seitig aus `/api/club` |
| `GET /api/tournaments` | Kommende Turniere/Meisterschaften inkl. passender eigener Mitglieder |
| `POST /api/tournaments/register` · `/unregister` | Mitglied zu einem Turnier an-/abmelden |
| `GET /api/admin/registrations` | Anmeldungen je Turnier inkl. Gebührensummen & Veranstalter (Recht `manage_events` **oder** `manage_payouts`) |
| `GET /api/payouts` · `POST /api/payouts` · `POST /api/payouts/cancel` | Überweisungen der Teilnahmegebühren an den Veranstalter (Recht `manage_payouts`) |
| `GET /api/capabilities` | **Nutzer-spezifisch:** welche Features darf dieser Nutzer sehen (`{ <key>: { status, public } }`) – steuert Gating & Beta-Badges im Frontend |
| `GET /api/features` · `POST /api/features/release` | Feature-Katalog + Beta-Freigabe lesen · Scope setzen (`public`/`off`/Rollen) (Recht `manage_features`) |
| `GET /api/bookings` · `POST /api/features/book` | Buchung/Provisionierung lesen · Feature für den Verein buchen/entbuchen (`{key,booked}`, Recht `book_features`). Nicht gebuchte Features fehlen für alle in `/api/capabilities` (gebucht × freigegeben) |

> Es findet **kein echter Datenversand** statt. Formulareingaben werden nur lokal im
> Browser gespeichert (Demo-Zweck).

### Benutzerkonten, Login & Dashboard

- **Registrierung** (`registrieren.html`): nur Name + E-Mail.
- **Login** (`login.html`): passwordlos – E-Mail eingeben, Anmeldecode wird (mangels echtem
  E-Mail-Versand) im Mock direkt angezeigt und automatisch eingetragen, dann einloggen.
- **Dashboard** (`konto.html`, login-geschützt): Mitglieder (sich selbst + Familienmitglieder
  desselben Haushalts) anmelden/kündigen. **Anschrift und IBAN gehören zum Konto/Haushalt**
  (genau eine Bankverbindung) und müssen vor der ersten Anmeldung hinterlegt sein.
- **Beitrag automatisch:** Der Mitgliedschaftstyp ergibt sich aus dem **Alter** (Altersbänder
  in `assets/data/membership-types.json`). Ist der **Familien-Pauschalbeitrag günstiger** als
  die Summe der Einzelbeiträge, wird er automatisch angesetzt (Beitragsübersicht im Dashboard).
  Die **Monatsbeiträge** (je Altersband + Familien-Pauschale) sind über die Redaktion editierbar
  (Recht `manage_fees`, `POST /api/membership-types`); die Bandstruktur (Label/Altersbereich)
  bleibt dabei stabil. Änderungen gelten für **neu berechnete** Beiträge.
- **Mitglieder bearbeiten & Judopass:** Jedes Mitglied lässt sich bearbeiten
  (`POST /api/memberships/update`, nur Eigentümer) und wird als kleiner **Judopass** angezeigt.
  Pflicht-**Foto** (clientseitig verkleinert, als Data-URL gespeichert) plus optional Gewichtsklasse,
  Gürtel/Graduierung, Geschlecht, Nationalität; automatische **Passnummer** (`bsg_pass_counter`).
  Die **Gewichtsklassen** werden passend zu **Geburtsjahr und Geschlecht vorgefiltert** – es
  erscheinen nur die für die jeweilige Alters-/Geschlechtsklasse gültigen Klassen (Kinder, U15,
  U18, Senioren … getrennt nach m/w; bei „divers"/keiner Angabe zusammengeführt). Die Zuordnung
  ist als anpassbare Vorlage in **`assets/data/weight-classes.json`** hinterlegt; die serverseitige
  Validierung verwirft eine nicht passende Klasse.
- **Wettkampf-Altersklassen** (U9…U21/Senioren, Veteranen M1…/F1…) werden je Mitglied aus dem
  Geburtsjahrgang berechnet und als Badges angezeigt – inkl. Übergangsjahrgängen (mehrere Klassen).
  Die Zuordnung ist als anpassbare Vorlage in **`assets/data/age-classes.json`** hinterlegt
  (bitte an die gültigen Verbandsregeln angleichen).
- **localStorage-Keys:** `bsg_users`, `bsg_memberships`, `bsg_session`, `bsg_login_codes`,
  `bsg_roles`, `bsg_news`, `bsg_events`, `bsg_registrations`, `bsg_training`,
  `bsg_site`, `bsg_club`, `bsg_membership_types`, `bsg_payouts`, `bsg_positions`, `bsg_feature_flags`,
  `bsg_feature_bookings`, `bsg_seed_version`, `bsg_pass_counter`,
  `bsg_sponsors`, `bsg_sponsors_config`, `bsg_shop_products`, `bsg_shop_orders`,
  `bsg_shop_mandates`, `bsg_shop_config`.

### Rollen, Berechtigungen & Admin

- **Rollen & Berechtigungen** (`admin.html`, `assets/js/admin.js`): Benutzer mit der Rolle
  **Administrator** können Rollen anlegen, deren Berechtigungen setzen und Benutzern Rollen
  zuweisen. Berechtigungs-Katalog (`PERMISSIONS` in `assets/js/mock-api.js`):
  `manage_roles`, `manage_users`, `manage_news`, `manage_events`, `manage_training`,
  `manage_site`, `manage_club`, `manage_team`, `manage_memberships`, `manage_fees`, `view_members`, `view_finance`,
  `manage_payouts`, `manage_features`, `book_features`, `manage_sponsors`, `manage_shop`.
  Die Rechte sind **fein getrennt** – jeder Inhaltsbereich (News, Termine, Trainingszeiten,
  Startseiten-Texte, Vereinsdaten/Branding, Vereinsämter) ist einzeln zuweisbar.
  `manage_shop` ist bewusst **nicht** an den Vorstand vergeben, sondern an die eigene Rolle
  **Shop-Betreiber** (`shop`) – der Webshop wird von einer Privatperson betrieben, getrennt vom Verein.
- **Vereinsämter ≠ Rollen:** Rollen geben **ausschließlich Rechte**; die öffentliche
  Team-Anzeige läuft über einen getrennten **Vereinsämter-Store** (`bsg_positions`,
  Datensatz `{ userId, group, label, order }`, `group` ∈ `vorstand`/`trainer`). Ämter geben
  keine Rechte. `GET /api/team` berechnet die Team-Seite aus **Ämtern × Nutzern**; gepflegt
  werden sie im **Admin → Vereinsämter** (`manage_team`). So kann z. B. eine Vertretung die
  Rechte eines Pressewarts erhalten, ohne öffentlich gelistet zu sein, und ein Web-Admin
  taucht nicht zwangsläufig mit Foto im Vorstand auf. Name & Foto stammen aus dem Benutzerkonto.
- **Profilfoto:** Benutzer laden ihr Foto optional selbst unter „Mein Konto" hoch
  (`POST /api/account/update` Feld `photo`); es erscheint auf der Team-Karte (sonst Initialen).
- **Seed-Admin & Beispiel-Rollen:** Beim ersten Laden legt der Mock die System-Rollen
  *Administrator*/*Mitglied*, ein Admin-Konto **`admin@example.com`** sowie
  bearbeitbare Beispiel-Rollen **Vorstand, Pressewart, Kassenwart, Trainer** an. Anmeldung
  passwordlos per Code (im Demo angezeigt). Neue Konten erhalten die Rolle *Mitglied*.
- **Rollen-Endpunkte:** `GET /api/permissions`, `GET/POST /api/roles`, `POST /api/roles/update`,
  `POST /api/roles/delete`, `GET /api/users`, `POST /api/users/roles`. Schutz: System-Rollen
  sind nicht löschbar, die Admin-Rolle behält immer alle Rechte, mindestens ein Administrator
  bleibt erhalten.
- **Vereinsämter-Endpunkte:** `GET /api/positions` (liefert auch einen Mitglieder-Picker),
  `POST /api/positions`(`/update`,`/delete`) – alle unter `manage_team`.

### Dynamischer Content & interne Bereiche

- **Redaktion** (`redaktion.html`, `assets/js/redaktion.js`, Recht `manage_news`/`manage_events`):
  Newsmeldungen und Termine **anlegen/bearbeiten/löschen**. Inhalte erscheinen sofort auf
  `aktuelles.html`, der Startseite und `kalender.html`. Beim ersten Zugriff werden News/Termine
  aus `assets/data/news.json` bzw. `events.json` in den Store übernommen (Seed-on-read) und
  sind danach editierbar. Endpunkte: `GET /api/news`, `POST /api/news`(`/update`,`/delete`),
  analog `…/events`. Newsmeldungen können ein **optionales Bild** tragen (clientseitig
  verkleinert, als Data-URL gespeichert; ohne Bild erscheint ein Platzhalter-Muster).
  Weitere editierbare Bereiche mit jeweils **eigenem Recht**:
  **Trainingszeiten** (`manage_training`, `assets/data/trainingszeiten.json` → `trainingszeiten.html`,
  Startseiten-Teaser, Hero-Mini) und **Startseiten-Texte** (`manage_site`, `assets/data/site.json` →
  per `[data-site="key"]` auf der Startseite; Felder-Schema `SITE_FIELDS` in `mock-api.js`).
  **Mitgliedsbeiträge** (`manage_fees`, Seed `assets/data/membership-types.json`): die Monats-
  beiträge je Altersband und die Familien-Pauschale; die Bandstruktur (Label/Altersbereich)
  bleibt erhalten. Der Beitrag eines Mitglieds wird beim Anlegen/Bearbeiten aus dem Alter neu
  berechnet (`GET/POST /api/membership-types`).
  **Team & Vorstand** wird über die **Vereinsämter** (`manage_team`, Admin → Vereinsämter)
  gepflegt und von `GET /api/team` aus Ämtern × Nutzern berechnet (siehe oben).
  Termine können den Typ **Turnier** oder **Meisterschaft** haben, dazu
  **Wettkampf-Altersklassen** (leer = offen für alle) sowie **Gebühr** und **Eigenanteil**;
  die Differenz (`Gebühr − Eigenanteil`) trägt der Verein. Bei Turnieren/Meisterschaften lassen
  sich **Veranstalter** und **Veranstalter-IBAN** hinterlegen. Organisatoren sehen unter
  „Turnier-Anmeldungen" je Turnier alle angemeldeten Mitglieder.
- **Teilnahmegebühren überweisen** (Recht `manage_payouts`, z. B. *Kassenwart*): In der
  Redaktion zeigt „Turnier-Anmeldungen" je Turnier die **Gesamtsumme der Teilnahmegebühren**
  (`Gebühr × Anzahl Anmeldungen`, plus informativ Eigenanteile/Vereinsanteil) und das
  Überweisungsziel (Veranstalter-IBAN). Per Klick wird die **Überweisung veranlasst** – im
  Mock wird sie lokal erfasst (Betrag, IBAN, Datum, Auslöser, optional Verwendungszweck) und
  als „überwiesen" markiert; ein **Storno** ist möglich. Eine kleine Historie listet alle
  veranlassten Überweisungen. **Es findet keine echte Zahlung statt.**
- **Turniere & Meisterschaften im Dashboard** (`konto.html`): Kontoinhaber sehen je kommendem
  Turnier nur die **passenden eigenen Mitglieder** (Altersklasse schneidet sich mit der des
  Turniers) und melden sie an/ab. Gebühr/Eigenanteil werden ausgewiesen. Im **Kalender**
  erscheinen die Altersklassen als Badges samt Eigenanteil-Hinweis.
- **Mitgliederübersicht** (`mitglieder.html`, `assets/js/mitglieder.js`, Recht `view_members`):
  **lesende** Liste aller Mitglieder. IBAN, Beiträge und Haushalts-Summen nur mit zusätzlichem
  Recht `view_finance` (z. B. *Kassenwart*). Endpunkt: `GET /api/admin/members`.
- Die rechtebasierten Navigationslinks **Mitglieder/Redaktion/Admin** werden nur eingeblendet,
  wenn der angemeldete Benutzer die nötigen Rechte hat (`assets/js/main.js`).

### Mock ⇄ echtes Backend umschalten

Der gesamte Frontend-Code spricht ganz normal per `fetch('/api/...')`. Der Dispatcher in
`assets/js/mock-api.js` entscheidet **pro Anfrage**, ob sie lokal (Mock) beantwortet oder an ein
echtes Backend weitergereicht wird. Gesteuert wird das über `assets/js/api-config.js` (vor
`mock-api.js` eingebunden), das `window.BSG_API` setzt:

- **`mode`**: `"mock"` (Default, alles lokal) · `"real"` (alle `/api/*` ans Backend) ·
  `"hybrid"` (nur die in `live` gelisteten Routen ans Backend, Rest Mock – für **Feature-Reife**).
- **`base`**: Backend-URL (`""` = same-origin `/api`, sonst absolute URL inkl. CORS).
- **`live`**: Muster wie `"GET /api/news"` (Methode+Pfad) oder `"/api/team"` (Pfad-Präfix).

Auflösung (stark → schwach): URL-Query `?api=real|mock|hybrid` (+ `?apibase=…`) → localStorage
(`bsg_api_mode`/`bsg_api_base`/`bsg_api_live`) → Deploy-Default in `api-config.js` → Fallback `mock`.
Zur Laufzeit: `BSGApi.setMode('real'|'hybrid'|'mock')`, `BSGApi.setLive([...])`. So entwickelt die UI
weiter gegen den Mock, während reife Endpunkte einzeln „scharf geschaltet" werden. Am übrigen
Frontend-Code ändert sich nichts; der `mock-api.js`-Tag bleibt (er ist Mock **und** Router).

### Contract-Tests

Im Ordner `packages/api-contract/` liegt eine abhängigkeitsfreie **Contract-Test-Suite**, die dieselben
Prüfungen wahlweise gegen den Mock oder ein echtes Backend laufen lässt:

```bash
node packages/api-contract/run.mjs                                   # Mock (Default)
TEST_BASE=http://localhost:3000 node packages/api-contract/run.mjs   # echtes Backend
```

So bleiben Mock und Backend vertraglich in Sync. Details und die Backend-Anforderungen stehen
in `packages/api-contract/README.md`.

### UI-/E2E-Tests (Playwright)

Die Contract-Tests decken nur `/api/*` ab. Die UI-/DOM-/PWA-Schicht (Login-Flow,
Permission-Nav-Reveal, CRUD-Editoren, Service-Worker/Offline) prüft eine **Playwright-Suite**
unter `tests/e2e/` gegen das echte Backend. Seit dem Phase-3-Split lebt das Backend in einem
eigenen Repo (gepinnt in [`backend-ref.json`](backend-ref.json)): Playwright checkt es aus, bootet es
selbst und liefert die Website same-origin daneben aus (`BSG_BACKEND_DIR` zeigt aufs Backend,
`BSG_STATIC_DIR` auf den Frontend-Root; `BSG_DEV=1`, `real`-Modus). Die Dev-Abhängigkeit ist
**bewusst nach `tests/e2e/` isoliert** – Repo-Root und ausgelieferte Website bleiben zero-dep.

```bash
cd tests/e2e
npm ci                                   # Playwright installieren (nur hier)
npx playwright install --with-deps chromium
# Backend-Repo (vereins-baukasten-backend) auschecken und BSG_BACKEND_DIR daraufsetzen:
BSG_BACKEND_DIR=../../../vereins-baukasten-backend npm test
```

### CI/CD

`ci.yml` (`Tests`) läuft auf jedem PR und auf `main` mit zwei Jobs: **`contract`** (Syntax-Check,
Versions-Guard `tools/guard-versions.mjs`, Contract-Tests gegen **Mock und echtes Backend**) und
**`e2e`** (Playwright-Browser-Tests). Die Real-Tests sind das Promotion-Gate: ein Feature ohne
Backend fällt durch. `deploy-pages.yml` deployt bei Push auf `main` automatisch nach **GitHub
Pages** (`mock`-Modus). Weitere Workflows: `publish-contract.yml` (Contract-Package), sowie die
Mergeback-Automation `mergeback-propose.yml`/`mergeback-gate.yml`/`contract-notify.yml`
(siehe [`docs/mergeback-pipeline.md`](docs/mergeback-pipeline.md)).

> Das produktive **Real-Backend-Deployment** (eigener Node-Server, `real`-Modus same-origin) gehört
> laut Roadmap ins künftige Backend-Repo und ist in diesem Frontend-Repo nicht enthalten – siehe
> [`docs/backend-repo-separation-plan.md`](docs/backend-repo-separation-plan.md).

## Inhalte pflegen

- **News:** `assets/data/news.json` bearbeiten (neueste werden automatisch zuerst angezeigt).
- **Termine:** `assets/data/events.json` bearbeiten (nur Termine ab heute werden gezeigt).
- **Texte/Trainingszeiten:** über die Redaktion bzw. die jeweiligen Seed-JSONs.
- **Team:** über **Admin → Vereinsämter** (`manage_team`).
- **Impressum & Datenschutz – Vorstand/Verantwortliche:** werden **automatisch** aus den
  Vereinsämtern abgeleitet (`GET /api/team`, dieselbe Quelle wie die Team-Seite). Bei einem
  Vorstandswechsel genügt die Pflege in **Admin → Vereinsämter** – „Vertreten durch den
  Vorstand" (nur Vorsitzende), die/der inhaltlich Verantwortliche (§ 18 MStV) und der/die
  Vertreter/in im Datenschutz aktualisieren sich mit (`assets/js/impressum.js`; statischer
  Fallback bleibt ohne JS/API gültig).
- **Vereinsdaten (Impressum-Pflichtfelder):** Anschrift, Telefon, Vereinsregister & VR-Nummer
  über **Admin → Vereinsdaten** (`manage_club`, `/api/club`) → erscheinen via `[data-club]`.

## Noch zu ergänzen (vor dem Live-Gang)

- **Impressum** (`kontakt.html`) und **Datenschutz** (`datenschutz.html`): die verbleibenden
  `[BITTE ERGÄNZEN]`-Felder über **Admin → Vereinsdaten** mit den offiziellen Vereinsdaten füllen
  (Telefon, Amtsgericht, VR-Nummer); Vorstand/Verantwortliche kommen aus den Vereinsämtern.
- **Echte Fotos** statt der Platzhalter (Hero, „Über uns", Trainingsort) einsetzen.
- Optional: Google Fonts lokal einbinden (Datenschutz).

## Design

- Farbschema in Anlehnung an Judo-Gürtel & Tatami (Indigo, Rot/Orange, Gold, Mattengrün),
  definiert als CSS-Variablen in `:root` (`assets/css/styles.css`).
- Schriften: *Inter* (Text) & *Sora* (Überschriften) via Google Fonts, mit System-Fallback.
- Voll responsiv, mobile-first, mit Fokus auf Barrierefreiheit (semantisches HTML, ARIA,
  Tastaturbedienung, `prefers-reduced-motion`).
