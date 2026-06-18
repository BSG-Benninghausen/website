# BSG Benninghausen e.V. – Vereinswebsite

Neue, moderne und **rein statische** Website für den Judo-Verein **BSG Benninghausen e.V.**
Kein Build-Schritt, keine Abhängigkeiten – nur HTML, CSS und etwas JavaScript. Läuft auf
jedem Webspace, GitHub Pages, Netlify o. Ä.

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
assets/
├── css/styles.css      Design-System & Styles (CSS Custom Properties)
├── js/
│   ├── mock-api.js     "Server": fängt /api/*-Anfragen ab (siehe unten)
│   ├── main.js         Navigation, Reveal-Animationen, Helfer (BSG.*)
│   ├── news.js         lädt & rendert News
│   ├── kalender.js     lädt & rendert Termine
│   └── forms.js        Anmelde- & Kontaktformular
├── data/
│   ├── news.json       Inhalte für "Aktuelles"
│   └── events.json     Inhalte für "Termine"
└── img/                Logo, Favicon, Hintergrundmuster (SVG)
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
| `GET /api/membership-types` | Beitragstypen aus `assets/data/membership-types.json` |
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
| `GET /api/team` | Team & Vorstand – **automatisch aus den Rollen** erzeugt (öffentlich) |
| `GET /api/site` · `POST /api/site` | Startseiten-Texte lesen (öffentlich) · speichern (`manage_site`) |
| `GET /api/tournaments` | Kommende Turniere/Meisterschaften inkl. passender eigener Mitglieder |
| `POST /api/tournaments/register` · `/unregister` | Mitglied zu einem Turnier an-/abmelden |
| `GET /api/admin/registrations` | Anmeldungen je Turnier inkl. Gebührensummen & Veranstalter (Recht `manage_events` **oder** `manage_payouts`) |
| `GET /api/payouts` · `POST /api/payouts` · `POST /api/payouts/cancel` | Überweisungen der Teilnahmegebühren an den Veranstalter (Recht `manage_payouts`) |

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
  `bsg_site`, `bsg_payouts`, `bsg_seed_version`, `bsg_pass_counter`.

### Rollen, Berechtigungen & Admin

- **Rollen & Berechtigungen** (`admin.html`, `assets/js/admin.js`): Benutzer mit der Rolle
  **Administrator** können Rollen anlegen, deren Berechtigungen setzen und Benutzern Rollen
  zuweisen. Berechtigungs-Katalog (`PERMISSIONS` in `assets/js/mock-api.js`):
  `manage_roles`, `manage_users`, `manage_news`, `manage_events`, `manage_training`,
  `manage_site`, `manage_memberships`, `view_members`, `view_finance`, `manage_payouts`.
  Die Rechte sind **fein getrennt** – jeder Inhaltsbereich (News, Termine, Trainingszeiten,
  Startseiten-Texte) ist einzeln zuweisbar.
- **Team/Vorstand aus Rollen:** Rollen tragen optionale Felder `teamGroup`
  (`vorstand`/`trainer`), `teamLabel` (Anzeige-Override, sonst Rollenname) und `teamOrder`.
  Wer eine so markierte Rolle hat, erscheint automatisch auf `team.html` – der Vorstand
  granular über eigene Funktionsrollen (z. B. *1. Vorsitzender*, *Kassenwart*). Konfiguriert
  wird das im **Admin-Rolleneditor** (`manage_roles`); Name & Foto stammen aus dem Benutzerkonto.
- **Profilfoto:** Benutzer laden ihr Foto optional selbst unter „Mein Konto" hoch
  (`POST /api/account/update` Feld `photo`); es erscheint auf der Team-Karte (sonst Initialen).
- **Seed-Admin & Beispiel-Rollen:** Beim ersten Laden legt der Mock die System-Rollen
  *Administrator*/*Mitglied*, ein Admin-Konto **`admin@bsg-benninghausen.de`** sowie
  bearbeitbare Beispiel-Rollen **Vorstand, Pressewart, Kassenwart, Trainer** an. Anmeldung
  passwordlos per Code (im Demo angezeigt). Neue Konten erhalten die Rolle *Mitglied*.
- **Rollen-Endpunkte:** `GET /api/permissions`, `GET/POST /api/roles`, `POST /api/roles/update`,
  `POST /api/roles/delete`, `GET /api/users`, `POST /api/users/roles`. Schutz: System-Rollen
  sind nicht löschbar, die Admin-Rolle behält immer alle Rechte, mindestens ein Administrator
  bleibt erhalten.

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
  **Team & Vorstand** wird nicht manuell gepflegt, sondern automatisch aus den Rollen erzeugt
  (siehe oben).
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

## Inhalte pflegen

- **News:** `assets/data/news.json` bearbeiten (neueste werden automatisch zuerst angezeigt).
- **Termine:** `assets/data/events.json` bearbeiten (nur Termine ab heute werden gezeigt).
- **Texte/Trainingszeiten/Team:** direkt im jeweiligen HTML.

## Noch zu ergänzen (vor dem Live-Gang)

- **Impressum** (`kontakt.html`) und **Datenschutz** (`datenschutz.html`): die mit
  `[BITTE ERGÄNZEN]` markierten Felder mit den offiziellen Vereinsdaten füllen.
- **Echte Fotos** statt der Platzhalter (Hero, „Über uns", Trainingsort) einsetzen.
- Optional: Google Fonts lokal einbinden (Datenschutz).

## Design

- Farbschema in Anlehnung an Judo-Gürtel & Tatami (Indigo, Rot/Orange, Gold, Mattengrün),
  definiert als CSS-Variablen in `:root` (`assets/css/styles.css`).
- Schriften: *Inter* (Text) & *Sora* (Überschriften) via Google Fonts, mit System-Fallback.
- Voll responsiv, mobile-first, mit Fokus auf Barrierefreiheit (semantisches HTML, ARIA,
  Tastaturbedienung, `prefers-reduced-motion`).
