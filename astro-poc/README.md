# Astro-PoC – Evaluierung

Proof-of-Concept: Wie sähe die BSG-Seite mit **Astro** statt 17× kopiertem HTML aus?
Bewusst **getrennt** vom Live-Repo (eigenes Unterprojekt) – die bestehende Seite bleibt unberührt.

## Was der PoC zeigt

- **Eine** Layout-Komponente (`src/layouts/Base.astro`) ersetzt die ~100 Zeilen
  `head` + `nav` + `footer`, die heute in **jeder** der 17 `*.html` dupliziert sind.
  Eine Navi-/Footer-Änderung = **eine** Datei statt `sed` über alle Seiten.
- **Branding zur Build-Zeit** aus `src/data/club.json` (= Kopie von
  `assets/data/club.bsg.json`): Titel, `theme-color`, Markenname, Logo, Adresse,
  Impressum, Instagram. Ersetzt den Regex-Stempel (`prerender-branding.mjs`),
  `club-config.js` **und** das Laufzeit-Branding in `main.js` – FOUC-frei, ohne JS korrekt.
- **Dynamische Inhalte bleiben dynamisch**: dieselben Vanilla-JS-Skripte
  (`mock-api.js`, `main.js`, `news.js`, `sponsors.js`, `forms.js` …) laufen
  unverändert weiter (News, Termine, Sponsoren, Login, Formulare, editierbare `data-site`-Texte).
- **`build: { format: "file" }`** → Ausgabe `index.html`, `kontakt.html` (gleiche URL-Form
  wie heute), damit die `.html`-Links und das JS unverändert passen.

## Ausführen

```bash
cd astro-poc
npm install
npm run dev      # http://localhost:4321  (kopiert vorher ../assets nach public/assets)
# oder:
npm run build && npm run preview
```

`npm run sync-assets` (läuft automatisch vor dev/build) kopiert `../assets` nach
`public/assets/` – die Assets bleiben also Single Source of Truth im Hauptrepo.

## Bewusst (noch) nicht im PoC

- Nur **2 Seiten** (`index`, `kontakt`) – als Vergleich; die restlichen 15 wären
  in einer echten Migration analog dünne `.astro`-Seiten.
- Asset-Hashing/Bundling (Astro kann `?v=N`/`bump-cachebust`/`guard-versions`
  ersetzen) ist hier nicht aktiviert – die Skripte werden 1:1 aus `public/` geladen.
- `main.js` setzt die aktive Navi noch über `*.html`-Pfade; bei echtem Clean-URL-
  Umstieg minimal anzupassen (hier via `format:"file"` umgangen).
- Service Worker / PWA-Manifest sind nicht verdrahtet.

## Fazit-Frage für die Entscheidung

Lohnt der Build/Dependency-Overhead gegen den Wegfall der Duplikation + des
manuellen Cache-Bustings? Für eine wachsende Single-Tenant-Seite: tendenziell ja.
