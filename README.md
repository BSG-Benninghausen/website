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
| `POST /api/account/update` | Adresse und/oder IBAN ändern (IBAN-Prüfung inkl. Mod-97) |
| `GET /api/memberships` · `POST /api/memberships` | Mitgliedschaften lesen · abschließen |
| `POST /api/memberships/cancel` | Mitgliedschaft kündigen |

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
- **localStorage-Keys:** `bsg_users`, `bsg_memberships`, `bsg_session`, `bsg_login_codes`,
  `bsg_roles`, `bsg_news`, `bsg_events`, `bsg_seed_version`, `bsg_pass_counter`.

### Rollen, Berechtigungen & Admin

- **Rollen & Berechtigungen** (`admin.html`, `assets/js/admin.js`): Benutzer mit der Rolle
  **Administrator** können Rollen anlegen, deren Berechtigungen setzen und Benutzern Rollen
  zuweisen. Berechtigungs-Katalog (`PERMISSIONS` in `assets/js/mock-api.js`):
  `manage_roles`, `manage_users`, `manage_news`, `manage_events`, `manage_memberships`,
  `view_members`, `view_finance`.
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
  analog `…/events`.
- **Mitgliederübersicht** (`mitglieder.html`, `assets/js/mitglieder.js`, Recht `view_members`):
  **lesende** Liste aller Mitglieder. IBAN, Beiträge und Haushalts-Summen nur mit zusätzlichem
  Recht `view_finance` (z. B. *Kassenwart*). Endpunkt: `GET /api/admin/members`.
- Die rechtebasierten Navigationslinks **Mitglieder/Redaktion/Admin** werden nur eingeblendet,
  wenn der angemeldete Benutzer die nötigen Rechte hat (`assets/js/main.js`).

### Auf ein echtes Backend umstellen

Der gesamte Frontend-Code spricht ganz normal per `fetch('/api/...')`. Um später ein
echtes Backend anzubinden, genügt es,

1. die Zeile `<script src="assets/js/mock-api.js" ...>` aus den HTML-Seiten zu entfernen und
2. die `/api/*`-Endpunkte serverseitig bereitzustellen (gleiche Pfade & JSON-Antworten).

Am übrigen Code muss nichts geändert werden.

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
