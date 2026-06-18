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

> Es findet **kein echter Datenversand** statt. Formulareingaben werden nur lokal im
> Browser gespeichert (Demo-Zweck).

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
