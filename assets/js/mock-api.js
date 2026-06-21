/* =====================================================================
   MOCK-SERVER  ·  Vereins-Baukasten (generisches White-Label-Frontend)
   ---------------------------------------------------------------------
   Diese Website ist rein statisch. Wo normalerweise ein Server nötig wäre
   (Formulare, News & Termine, Benutzerkonten, Mitgliedschaften), simuliert
   dieses Modul ein Backend, indem es `window.fetch` für Routen unter
   `/api/...` abfängt.

   So bleibt der restliche Frontend-Code "echt": er ruft ganz normal
   `fetch('/api/...')` auf. Möchte der Verein später ein richtiges Backend
   anbinden, genügt es, dieses Script zu entfernen und die /api-Endpunkte
   serverseitig bereitzustellen – am Frontend ändert sich nichts.

   KEIN echtes Backend, kein echter E-Mail-Versand, keine Zahlungsabwicklung.
   Alle Daten (Konten, Mitgliedschaften, Sessions) liegen ausschließlich
   lokal im Browser (localStorage). Der Login-Code wird zu Demozwecken in
   der Antwort mitgeliefert, weil keine echten E-Mails verschickt werden.
   ===================================================================== */
(function () {
  "use strict";

  const LATENCY = [280, 620];           // simulierte Antwortzeit (ms)
  const KEYS = {
    anmeldung: "bsg_mock_anmeldungen",
    kontakt: "bsg_mock_kontakte",
    users: "bsg_users",
    memberships: "bsg_memberships",
    session: "bsg_session",
    codes: "bsg_login_codes",
    roles: "bsg_roles",
    news: "bsg_news",
    events: "bsg_events",
    seedVersion: "bsg_seed_version",
    passCounter: "bsg_pass_counter",
    registrations: "bsg_registrations",
    training: "bsg_training",
    site: "bsg_site",
    club: "bsg_club",
    payouts: "bsg_payouts",
    positions: "bsg_positions",
    demoVersion: "bsg_demo_version",
    featureFlags: "bsg_feature_flags",
    featureBookings: "bsg_feature_bookings",
    sponsors: "bsg_sponsors",
    sponsorsConfig: "bsg_sponsors_config",
    shopProducts: "bsg_shop_products",
    shopOrders: "bsg_shop_orders",
    shopMandates: "bsg_shop_mandates",
    shopConfig: "bsg_shop_config",
  };
  const TOURNAMENT_TYPES = ["Turnier", "Meisterschaft"];

  const BELTS = ["", "Weißgurt", "Weiß-Gelb", "Gelbgurt", "Gelb-Orange", "Orangegurt", "Orange-Grün", "Grüngurt", "Blaugurt", "Braungurt", "1. Dan (Schwarzgurt)", "2. Dan", "3. Dan", "4. Dan", "5. Dan"];
  const GENDERS = ["", "männlich", "weiblich", "divers"];
  const WEIGHT_CLASSES = ["", "-60 kg", "-66 kg", "-73 kg", "-81 kg", "-90 kg", "-100 kg", "+100 kg", "-48 kg", "-52 kg", "-57 kg", "-63 kg", "-70 kg", "-78 kg", "+78 kg"];
  const NATIONALITIES = ["", "Deutsch", "Österreichisch", "Schweizerisch", "Französisch", "Italienisch", "Spanisch", "Niederländisch", "Polnisch", "Türkisch", "Russisch", "Ukrainisch", "Britisch", "US-amerikanisch", "Brasilianisch", "Japanisch", "Andere"];

  /* Berechtigungs-Katalog (vom Admin auf Rollen verteilbar) */
  const PERMISSIONS = [
    { key: "manage_roles", label: "Rollen & Berechtigungen verwalten" },
    { key: "manage_users", label: "Benutzer & Rollenzuweisung verwalten" },
    { key: "manage_news", label: "Newsmeldungen schreiben & bearbeiten" },
    { key: "manage_events", label: "Termine pflegen" },
    { key: "manage_training", label: "Trainingszeiten bearbeiten" },
    { key: "manage_site", label: "Startseiten-Texte bearbeiten" },
    { key: "manage_club", label: "Vereinsdaten & Branding bearbeiten (Name, Kontakt, Impressum)" },
    { key: "manage_team", label: "Team-Seite / Vereinsämter verwalten" },
    { key: "manage_memberships", label: "Mitgliedschaften aller Nutzer verwalten" },
    { key: "view_members", label: "Mitgliederliste einsehen (lesend)" },
    { key: "view_finance", label: "Kontoverbindungen (IBAN) & Beiträge einsehen (lesend)" },
    { key: "manage_payouts", label: "Teilnahmegebühren überweisen (Auszahlungen)" },
    { key: "manage_features", label: "Features & Beta-Freigabe verwalten" },
    { key: "book_features", label: "Funktionen buchen/freischalten (Provisionierung)" },
    { key: "manage_sponsors", label: "Sponsoren verwalten" },
    { key: "manage_shop", label: "Webshop verwalten (Produkte, Bestellungen, Förder-Status)" },
  ];
  const ALL_PERMS = PERMISSIONS.map((p) => p.key);
  /* Seed-Admin-Adresse; per window.BSG_ADMIN_EMAIL (Deploy/Fork) überschreibbar.
     Neutraler Default; ein Fork (z. B. BSG) setzt seine eigene Adresse. */
  const ADMIN_EMAIL =
    (typeof window !== "undefined" && window.BSG_ADMIN_EMAIL) || "admin@example.com";

  /* Feature-Katalog (Reifegrad). Quelle der Wahrheit für „welche Features kennt
     das Backend" – im Mock sind alle implementiert. Im echten (privaten) Backend
     fehlen noch-nicht-nachgezogene Keys, wodurch sie in Produktion unsichtbar bleiben.
     status: "stable" | "beta". Die Freigabe (wer sieht es) liegt orthogonal in
     bsg_feature_flags und wird vom Superadmin (manage_features) gesetzt. */
  const FEATURES = [
    { key: "payouts", label: "Auszahlungen an Veranstalter", status: "stable" },
    { key: "tournaments", label: "Turnier-Anmeldung", status: "stable" },
    { key: "demofeature", label: "Beispiel-Funktion (Beta)", status: "beta" },
  ];
  const FEATURE_KEYS = FEATURES.map((f) => f.key);
  // Default-Freigabe je Feature (greift, solange der Superadmin nichts gesetzt hat).
  const FEATURE_DEFAULT_SCOPE = { payouts: "public", tournaments: "public", demofeature: "off" };
  // Default-Buchung (Provisionierung) je Feature: standardmäßig gebucht -> für BSG unverändert.
  // Der echte SaaS-Betrieb leitet dies aus dem gebuchten Tarif ab (später, P4).
  const FEATURE_DEFAULT_BOOKED = { payouts: true, tournaments: true, demofeature: true };

  const realFetch = window.fetch.bind(window);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const rnd = ([a, b]) => Math.round(a + Math.random() * (b - a));

  function json(body, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  /* ----- generische Storage-Helfer -----
     Multi-Mandant/Referenz-Beispiel: jedes Beispiel (window.BSG_CLUB.ns, gesetzt
     von club-config.js) bekommt einen eigenen localStorage-Namespace, damit
     z. B. BSG- und Musterverein-Demo getrennte Stores/Seeds haben. Das
     Default-Beispiel ("bsg") behält die Legacy-Schlüssel (bsg_*) unverändert –
     so bleiben bestehende Deployments und die Contract-Tests unberührt. */
  const STORE_NS =
    (typeof window !== "undefined" && window.BSG_CLUB && window.BSG_CLUB.ns) || "bsg";
  const STORE_PREFIX = STORE_NS === "bsg" ? "" : STORE_NS + ":";
  const nsKey = (key) => STORE_PREFIX + key;
  function getStore(key, fallback) {
    try { return JSON.parse(localStorage.getItem(nsKey(key))) ?? fallback; }
    catch (e) { return fallback; }
  }
  function setStore(key, val) {
    try { localStorage.setItem(nsKey(key), JSON.stringify(val)); } catch (e) { /* ignore */ }
  }
  function delStore(key) {
    try { localStorage.removeItem(nsKey(key)); } catch (e) { /* ignore */ }
  }
  function saveLocal(key, entry) {
    const list = getStore(key, []);
    list.push(entry);
    setStore(key, list);
  }

  const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || "").trim());
  const norm = (v) => String(v || "").trim();
  const lc = (v) => norm(v).toLowerCase();
  const genId = (p) => p + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const genCode = () => String(Math.floor(100000 + Math.random() * 900000));

  /* ----- Content-Validierung (News & Termine) ----- */
  const EVENT_TYPES = ["Training", "Turnier", "Prüfung", "Event", "Meisterschaft"];
  const num = (v) => { const n = parseFloat(String(v == null ? "" : v).replace(",", ".")); return isNaN(n) ? 0 : n; };
  function eventMoney(body, errors) {
    const fee = Math.max(0, num(body.fee));
    const ownShare = Math.max(0, num(body.ownShare));
    if (ownShare > fee) errors.ownShare = "Eigenanteil darf die Gebühr nicht übersteigen.";
    return { fee, ownShare };
  }
  // Veranstalter-Daten (für Turnier/Meisterschaft): Name + IBAN; IBAN nur prüfen, wenn angegeben
  function eventOrganizer(body, errors) {
    const organizerName = norm(body.organizerName);
    const rawIban = norm(body.organizerIban);
    let organizerIban = "";
    if (rawIban) {
      if (!isIban(rawIban)) errors.organizerIban = "Bitte gültige IBAN des Veranstalters angeben.";
      else organizerIban = fmtIban(rawIban);
    }
    return { organizerName, organizerIban };
  }
  function newsErrors(b) {
    const e = {};
    if (norm(b.title).length < 3) e.title = "Bitte einen Titel angeben.";
    if (!norm(b.date)) e.date = "Bitte ein Datum angeben.";
    if (norm(b.excerpt).length < 10) e.excerpt = "Bitte einen kurzen Anrisstext (min. 10 Zeichen).";
    return e;
  }
  // URL normalisieren: leer bleibt leer; nur http/https zulassen; fehlendes Schema ->
  // https:// voranstellen; jedes andere Schema (javascript:/data:/…) verwerfen (XSS-Schutz).
  const normUrl = (v) => {
    const s = norm(v);
    if (!s) return "";
    if (/^https?:\/\//i.test(s)) return s;
    if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return "";
    return "https://" + s;
  };
  function sponsorErrors(b) {
    const e = {};
    if (norm(b.name).length < 2) e.name = "Bitte einen Sponsor-Namen angeben.";
    return e;
  }
  const sponsorFields = (b) => ({ name: norm(b.name), url: normUrl(b.url), tier: sponsorTier(b.tier), description: norm(b.description), order: num(b.order) });
  function eventErrors(b) {
    const e = {};
    if (norm(b.title).length < 3) e.title = "Bitte einen Titel angeben.";
    if (!norm(b.date)) e.date = "Bitte ein Datum angeben.";
    return e;
  }
  function trainingErrors(b) {
    const e = {};
    if (norm(b.title).length < 2) e.title = "Bitte einen Titel angeben.";
    if (!norm(b.start)) e.start = "Bitte eine Startzeit angeben.";
    return e;
  }
  const trainingFields = (b) => ({
    title: norm(b.title), start: norm(b.start), end: norm(b.end),
    ageGroup: norm(b.ageGroup), description: norm(b.description),
  });
  // Bereiche der öffentlichen Team-Seite (Vereinsämter, siehe GET /api/team & /api/positions).
  const TEAM_GROUPS = ["vorstand", "trainer"];
  const teamGroupOf = (v) => (TEAM_GROUPS.includes(v) ? v : "");

  /* ----- Startseiten-Texte: Schema (editierbare Felder) ----- */
  const SITE_FIELDS = [
    { key: "hero_eyebrow", label: "Hero · Eyebrow (kleine Überschrift)", type: "text" },
    { key: "hero_title", label: "Hero · Titel (erster Teil)", type: "text" },
    { key: "hero_title_hl", label: "Hero · Titel (hervorgehobener Teil)", type: "text" },
    { key: "hero_subtitle", label: "Hero · Untertitel/Text", type: "textarea" },
    { key: "hero_card_title", label: "Hero-Karte · Überschrift", type: "text" },
    { key: "hero_card_note", label: "Hero-Karte · Hinweis", type: "text" },
    { key: "about_eyebrow", label: "Über uns · Eyebrow", type: "text" },
    { key: "about_title", label: "Über uns · Überschrift", type: "text" },
    { key: "about_text", label: "Über uns · Text", type: "textarea" },
    { key: "cta_title", label: "Call-to-Action · Überschrift", type: "text" },
    { key: "cta_text", label: "Call-to-Action · Text", type: "textarea" },
  ];
  const SITE_KEYS = SITE_FIELDS.map((f) => f.key);

  /* ----- Sponsoren: Anzeige-Konfiguration (Schema) -----
     Steuert, OB Sponsoren überhaupt erscheinen (enabled), in welchem Stil
     (displayMode), ob Premium-Stufen genutzt werden (tiersEnabled) und an welchen
     Stellen (showHome/showPage/showFooter). Der Verein entscheidet selbst – Default
     enabled:false (Funktion aus). Ist sie an, sind Startseite + Footer-Logo-Leiste
     sichtbar; die eigene Sponsoren-Seite ist per Default aus (Admin kann sie zuschalten).
     Frontend liest dies über sponsors.js. */
  const SPONSORS_MODES = ["cards", "logos", "band"];
  const SPONSORS_CONFIG_FIELDS = [
    { key: "enabled", label: "Sponsoren anzeigen", type: "checkbox" },
    { key: "displayMode", label: "Darstellung", type: "select", options: SPONSORS_MODES },
    { key: "tiersEnabled", label: "Premium-Stufen verwenden (sonst alle gleich)", type: "checkbox" },
    { key: "showHome", label: "Auf der Startseite zeigen", type: "checkbox" },
    { key: "showPage", label: "Eigene Sponsoren-Seite verlinken", type: "checkbox" },
    { key: "showFooter", label: "Logo-Leiste im Footer zeigen", type: "checkbox" },
    { key: "title", label: "Überschrift", type: "text" },
    { key: "subtitle", label: "Untertitel", type: "textarea" },
  ];
  const SPONSORS_CONFIG_DEFAULTS = { enabled: false, displayMode: "cards", tiersEnabled: false, showHome: true, showPage: false, showFooter: true, title: "Unsere Sponsoren", subtitle: "" };
  const sponsorTier = (v) => (v === "premium" ? "premium" : "standard");
  const asBool = (v) => v === true || v === "true" || v === "on" || v === 1 || v === "1";
  function normSponsorsConfig(raw) {
    const r = raw && typeof raw === "object" ? raw : {};
    const mode = SPONSORS_MODES.includes(r.displayMode) ? r.displayMode : SPONSORS_CONFIG_DEFAULTS.displayMode;
    return {
      enabled: asBool(r.enabled),
      displayMode: mode,
      tiersEnabled: asBool(r.tiersEnabled),
      showHome: "showHome" in r ? asBool(r.showHome) : true,
      showPage: "showPage" in r ? asBool(r.showPage) : false,
      showFooter: "showFooter" in r ? asBool(r.showFooter) : true,
      title: norm(r.title) || SPONSORS_CONFIG_DEFAULTS.title,
      subtitle: norm(r.subtitle),
    };
  }

  /* ----- Webshop -----
     Eigenständiger Shop (Betreiber = Privatperson, z. B. Julian Becker – NICHT der
     Verein). Produkte tragen je Stufe eigene Preise: extern / mitglied / gesponsert
     (gesponsert optional, fällt sonst auf mitglied zurück). Online-Checkout (SEPA-
     Lastschrift) nur für eingeloggte, aktive Mitglieder. Betreiber-/Rechtsdaten
     liegen in der Shop-Config (shop.json / shop.<ns>.json), getrennt von /api/club. */
  const SHOP_CATEGORIES = ["gi", "guertel", "merch"];
  const shopCategory = (v) => (SHOP_CATEGORIES.includes(v) ? v : "merch");
  const SHOP_ORDER_STATUSES = ["offen", "mandat_erteilt", "bezahlt", "versendet", "storniert"];
  const SHOP_CONFIG_FIELDS = [
    { key: "enabled", label: "Shop aktivieren", type: "checkbox" },
    { key: "showPage", label: "Shop-Seite im Menü verlinken", type: "checkbox" },
    { key: "title", label: "Überschrift", type: "text" },
    { key: "subtitle", label: "Untertitel", type: "textarea" },
    { key: "operatorName", label: "Betreiber (Name)", type: "text" },
    { key: "operatorAddress", label: "Betreiber – Anschrift", type: "textarea" },
    { key: "operatorEmail", label: "Betreiber – E-Mail (für Anfragen)", type: "text" },
    { key: "operatorIban", label: "Betreiber – IBAN (SEPA-Gläubiger)", type: "text" },
    { key: "creditorId", label: "Gläubiger-Identifikationsnummer", type: "text" },
    { key: "legalImpressum", label: "Impressum (Shop-Betreiber)", type: "textarea" },
    { key: "legalAgb", label: "AGB", type: "textarea" },
    { key: "legalWiderruf", label: "Widerrufsbelehrung", type: "textarea" },
  ];
  const SHOP_CONFIG_DEFAULTS = { enabled: false, showPage: false, title: "Vereinsshop", subtitle: "" };
  function normShopConfig(raw) {
    const r = raw && typeof raw === "object" ? raw : {};
    const ibanRaw = norm(r.operatorIban);
    return {
      enabled: asBool(r.enabled),
      showPage: "showPage" in r ? asBool(r.showPage) : false,
      title: norm(r.title) || SHOP_CONFIG_DEFAULTS.title,
      subtitle: norm(r.subtitle),
      operatorName: norm(r.operatorName),
      operatorAddress: norm(r.operatorAddress),
      operatorEmail: norm(r.operatorEmail),
      operatorIban: ibanRaw && isIban(ibanRaw) ? fmtIban(ibanRaw) : "",
      creditorId: norm(r.creditorId),
      legalImpressum: norm(r.legalImpressum),
      legalAgb: norm(r.legalAgb),
      legalWiderruf: norm(r.legalWiderruf),
    };
  }
  function productErrors(b) {
    const e = {};
    if (norm(b.name).length < 2) e.name = "Bitte einen Produktnamen angeben.";
    const src = b.prices && typeof b.prices === "object" ? b.prices : b;
    if (!(num(src.extern) > 0)) e.extern = "Bitte einen Externen-Preis (> 0) angeben.";
    if (!(num(src.mitglied) > 0)) e.mitglied = "Bitte einen Mitglieder-Preis (> 0) angeben.";
    return e;
  }
  function productFields(b) {
    const src = b.prices && typeof b.prices === "object" ? b.prices : b;
    const prices = { extern: num(src.extern), mitglied: num(src.mitglied) };
    const g = num(src.gesponsert);
    if (g > 0) prices.gesponsert = g;
    return {
      name: norm(b.name),
      category: shopCategory(b.category),
      description: norm(b.description),
      prices,
      active: "active" in b ? asBool(b.active) : true,
      order: num(b.order),
    };
  }
  /* Preis-Stufe des aktuellen Nutzers: gesponsert > aktives Mitglied > extern. */
  function shopTierFor(user) {
    if (!user) return "extern";
    if (user.shopSponsored) return "gesponsert";
    const active = getStore(KEYS.memberships, []).some((m) => m.userId === user.id && m.status === "aktiv");
    return active ? "mitglied" : "extern";
  }
  function shopPriceFor(product, tier) {
    const pr = (product && product.prices) || {};
    if (tier === "gesponsert") return pr.gesponsert != null ? pr.gesponsert : (pr.mitglied != null ? pr.mitglied : pr.extern);
    if (tier === "mitglied") return pr.mitglied != null ? pr.mitglied : pr.extern;
    return pr.extern;
  }
  // Online-Checkout (SEPA-Lastschrift) nur für eingeloggte, aktive Mitglieder.
  const shopCanCheckout = (user) => !!user && getStore(KEYS.memberships, []).some((m) => m.userId === user.id && m.status === "aktiv");
  const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

  /* ----- Vereinsdaten / Branding: Schema (White-Label-Config) -----
     Treibt Name, Sport, Adresse, Kontakt, Impressum & Logo der gesamten Site
     (Anwendung im Frontend über [data-club="key"], siehe main.js). Wird vom
     SaaS-Backend pro Domain ausgeliefert; im Mock aus assets/data/club.json. */
  const CLUB_FIELDS = [
    { key: "brand_name", label: "Logo-Text (Kurzname im Header/Footer)", type: "text" },
    { key: "name", label: "Vollständiger Vereinsname (rechtlich, Impressum)", type: "text" },
    { key: "short_name", label: "Kurzname (App/PWA)", type: "text" },
    { key: "sport", label: "Sportart", type: "text" },
    { key: "brand_sub", label: "Logo-Unterzeile", type: "text" },
    { key: "tagline", label: "Tagline (Titel-Zusatz Startseite)", type: "text" },
    { key: "locality", label: "Ort", type: "text" },
    { key: "email", label: "Kontakt-E-Mail", type: "text" },
    { key: "instagram_url", label: "Instagram · URL", type: "text" },
    { key: "instagram_handle", label: "Instagram · Handle", type: "text" },
    { key: "venue", label: "Trainingsstätte", type: "text" },
    { key: "street", label: "Straße & Hausnummer", type: "text" },
    { key: "city", label: "PLZ & Ort", type: "text" },
    { key: "description", label: "Kurzbeschreibung (Meta/SEO)", type: "textarea" },
    { key: "logo", label: "Logo-Pfad/URL", type: "text" },
    { key: "theme_color", label: "Markenfarbe (Hex, Browser/PWA)", type: "text" },
  ];
  const CLUB_KEYS = CLUB_FIELDS.map((f) => f.key);

  /* App-Manifest (PWA) aus der Club-Config bauen – im echten Backend pro Domain
     (server/index.mjs liefert /manifest.webmanifest darüber aus). Icons bleiben
     vorerst Default-Dateien; per-Verein-Icons sind ein späterer Schritt. */
  function buildManifest(club) {
    const c = club || {};
    const tc = /^#[0-9a-fA-F]{3,8}$/.test(String(c.theme_color || "").trim()) ? c.theme_color.trim() : "#0d0d12";
    const name = norm(c.name) + (norm(c.sport) ? " – " + norm(c.sport) : "");
    return {
      name: name || "Verein",
      short_name: norm(c.short_name) || "Verein",
      description: norm(c.description),
      lang: "de", dir: "ltr", start_url: ".", scope: "./",
      display: "standalone", orientation: "portrait-primary",
      background_color: tc, theme_color: tc,
      icons: [
        { src: "assets/img/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "assets/img/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "assets/img/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    };
  }

  /* ----- IBAN-Prüfung inkl. Mod-97 ----- */
  function isIban(v) {
    const s = String(v || "").replace(/\s+/g, "").toUpperCase();
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;
    const re = s.slice(4) + s.slice(0, 4);
    const num = re.replace(/[A-Z]/g, (c) => (c.charCodeAt(0) - 55).toString());
    let rem = 0;
    for (let i = 0; i < num.length; i++) rem = (rem * 10 + (num.charCodeAt(i) - 48)) % 97;
    return rem === 1;
  }
  const fmtIban = (v) => String(v || "").replace(/\s+/g, "").toUpperCase().replace(/(.{4})/g, "$1 ").trim();

  /* ----- Alter & Beitrag ----- */
  function ageFromBirthdate(iso) {
    const b = new Date(iso);
    if (isNaN(b.getTime())) return null;
    const now = new Date();
    let age = now.getFullYear() - b.getFullYear();
    const m = now.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
    return age;
  }
  const bandForAge = (age, bands) => bands.find((b) => age >= b.minAge && age <= b.maxAge) || null;
  function billingSummary(active, familyFlat) {
    const sumIndividual = active.reduce((s, m) => s + (m.individualFee || 0), 0);
    return {
      activeCount: active.length,
      sumIndividual,
      familyFlat,
      effectiveTotal: Math.min(sumIndividual, familyFlat),
      familyApplied: familyFlat < sumIndividual,
    };
  }

  /* ----- Wettkampf-Altersklassen (Jahrgangsprinzip) ----- */
  function ageInYear(birthdate) {
    const y = new Date(birthdate).getFullYear();
    if (isNaN(y)) return null;
    return new Date().getFullYear() - y;
  }
  function classesForAge(j, gender, cfg) {
    if (j == null || !cfg) return [];
    const out = [];
    (cfg.classes || []).forEach((c) => { if (j >= c.minAge && j <= c.maxAge) out.push(c.label); });
    (cfg.veterans || []).forEach((v) => {
      if (j >= v.minAge && j <= v.maxAge) {
        const code = gender === "männlich" ? v.male : gender === "weiblich" ? v.female : (v.male + "/" + v.female);
        if (code) out.push(code);
      }
    });
    return out;
  }
  function allAgeClassLabels(cfg) {
    if (!cfg) return [];
    const out = (cfg.classes || []).map((c) => c.label);
    (cfg.veterans || []).forEach((v) => { if (v.male) out.push(v.male); if (v.female) out.push(v.female); });
    return out;
  }
  const overlaps = (a, b) => Array.isArray(a) && Array.isArray(b) && a.some((x) => b.includes(x));

  /* ----- Gewichtsklassen je Altersklasse & Geschlecht (Jahrgangsprinzip) ----- */
  function weightClassesFor(j, gender, cfg) {
    if (j == null || !cfg) return [];
    const cat = (cfg.categories || []).find((c) => j >= c.minAge && j <= c.maxAge);
    if (!cat) return [];
    const male = cat.male || [], female = cat.female || [];
    if (gender === "männlich") return male.slice();
    if (gender === "weiblich") return female.slice();
    // divers / keine Angabe: beide Listen zusammenführen (ohne Duplikate)
    const out = male.slice();
    female.forEach((w) => { if (!out.includes(w)) out.push(w); });
    return out;
  }

  /* ----- Mitgliedsausweis-Felder: Foto, Passnummer, Profilfelder ----- */
  const isPhoto = (v) => typeof v === "string" && /^data:image\/(png|jpe?g|webp|gif);base64,/.test(v) && v.length <= 700000;
  function nextPassNumber() {
    const n = (getStore(KEYS.passCounter, 0) || 0) + 1;
    setStore(KEYS.passCounter, n);
    /* Prefix ist club-konfigurierbar (club-Seed: "passPrefix"); Default neutral. */
    const club = getStore(KEYS.club, null);
    const prefix = (club && club.passPrefix) || "MV-";
    return prefix + String(n).padStart(4, "0");
  }
  const fromList = (list, v) => (list.includes(v) ? v : "");
  // gemeinsame Validierung & Übernahme der editierbaren Profilfelder
  function memberProfile(body, errors) {
    if (norm(body.firstName).length < 2) errors.firstName = "Bitte Vornamen angeben.";
    if (norm(body.lastName).length < 2) errors.lastName = "Bitte Nachnamen angeben.";
    const age = ageFromBirthdate(body.birthdate);
    if (age === null) errors.birthdate = "Bitte gültiges Geburtsdatum angeben.";
    else if (new Date(body.birthdate) > new Date()) errors.birthdate = "Geburtsdatum darf nicht in der Zukunft liegen.";
    if (!isPhoto(body.photo)) errors.photo = "Bitte ein Foto hochladen (Pflicht für den Mitgliedsausweis).";
    return { age };
  }
  function memberFields(body, allowedWeights) {
    return {
      firstName: norm(body.firstName), lastName: norm(body.lastName), birthdate: norm(body.birthdate),
      photo: body.photo,
      weightClass: (allowedWeights || WEIGHT_CLASSES).includes(body.weightClass) ? body.weightClass : "",
      belt: fromList(BELTS, body.belt),
      gender: fromList(GENDERS, body.gender),
      nationality: fromList(NATIONALITIES, body.nationality),
    };
  }

  /* ----- Benutzer / Session ----- */
  const getUsers = () => getStore(KEYS.users, []);
  const setUsers = (u) => setStore(KEYS.users, u);
  const findUserByEmail = (email) => getUsers().find((u) => u.email === lc(email));
  const getUserById = (id) => getUsers().find((u) => u.id === id);
  function publicUser(u) {
    if (!u) return null;
    return { id: u.id, name: u.name, email: u.email, address: u.address || null, iban: u.iban || null, photo: u.photo || "", roles: u.roles || ["member"], active: u.active !== false, createdAt: u.createdAt };
  }
  const getSession = () => getStore(KEYS.session, null);
  const setSession = (userId) => setStore(KEYS.session, { token: genId("tok"), userId });
  const clearSession = () => delStore(KEYS.session);
  function currentUser() {
    const s = getSession();
    return s ? getUserById(s.userId) : null;
  }

  /* ----- Rollen & Berechtigungen ----- */
  const getRoles = () => getStore(KEYS.roles, []);
  const setRoles = (r) => setStore(KEYS.roles, r);
  // Vereinsämter (öffentliche Team-Anzeige) – getrennt von den Berechtigungs-Rollen
  const getPositions = () => getStore(KEYS.positions, []);
  const setPositions = (p) => setStore(KEYS.positions, p);
  function userPermissions(user) {
    if (!user) return [];
    const roleIds = user.roles || ["member"];
    if (roleIds.includes("admin")) return ALL_PERMS.slice();
    const roles = getRoles();
    const set = new Set();
    roleIds.forEach((rid) => {
      const r = roles.find((x) => x.id === rid);
      if (r) (r.permissions || []).forEach((p) => set.add(p));
    });
    return [...set];
  }
  const isAdmin = (user) => !!user && (user.roles || []).includes("admin");
  const hasPerm = (user, perm) => isAdmin(user) || userPermissions(user).includes(perm);

  /* ----- Feature-Freigabe (Beta-Steuerung pro Gruppe) -----
     Scope je Feature: "public" (alle) | "off" (niemand) | { roles:[...] } (diese Rollen).
     canSeeFeature: public immer; manage_features sieht alles (Vorschau/Verwaltung);
     {roles} nur, wenn der Nutzer eine der Rollen hält. */
  const getFeatureFlags = () => getStore(KEYS.featureFlags, null) || {};
  const setFeatureFlags = (f) => setStore(KEYS.featureFlags, f);
  const getFeatureBookings = () => getStore(KEYS.featureBookings, null) || {};
  const setFeatureBookings = (b) => setStore(KEYS.featureBookings, b);
  function isBooked(key, bookings) {
    const b = bookings || getFeatureBookings();
    return (key in b) ? !!b[key] : (FEATURE_DEFAULT_BOOKED[key] ?? true);
  }
  function scopeFor(key, flags) {
    const f = flags || getFeatureFlags();
    return (key in f) ? f[key] : (FEATURE_DEFAULT_SCOPE[key] || "off");
  }
  function normalizeScope(release, validRoleIds) {
    if (release === "public" || release === "off") return release;
    const arr = Array.isArray(release) ? release : (release && Array.isArray(release.roles) ? release.roles : null);
    if (arr) { const roles = arr.filter((r) => validRoleIds.includes(r)); return roles.length ? { roles } : "off"; }
    return null;
  }
  function canSeeFeature(user, scope) {
    if (scope === "public") return true;
    if (hasPerm(user, "manage_features")) return true;
    if (scope === "off" || !scope) return false;
    if (scope.roles) return !!user && (user.roles || []).some((r) => scope.roles.includes(r));
    return false;
  }

  /* Seed: Standardrollen + Admin-Konto (idempotent). Rollen sind reine Rechte-Objekte;
     die öffentliche Team-Anzeige läuft über Vereinsämter (positions), siehe GET /api/team. */
  const EXAMPLE_ROLES = [
    { id: "vorstand", label: "Vorstand", permissions: ["manage_users", "manage_news", "manage_events", "manage_training", "manage_site", "manage_team", "manage_memberships", "view_members", "view_finance", "manage_payouts", "manage_sponsors"], system: false },
    { id: "pressewart", label: "Pressewart", permissions: ["manage_news", "manage_site", "manage_sponsors"], system: false },
    { id: "kassenwart", label: "Kassenwart", permissions: ["view_members", "view_finance", "manage_payouts"], system: false },
    { id: "trainer", label: "Trainer", permissions: ["manage_training", "view_members"], system: false },
  ];
  // Beispiel-Funktionsrollen für den Vorstand (reine Rechte; Anzeige über Vereinsämter)
  const BOARD_ROLES = [
    { id: "vorsitz1", label: "1. Vorsitzender", permissions: ["manage_users", "manage_news", "manage_events", "manage_team", "manage_memberships", "view_members", "view_finance", "manage_payouts"], system: false },
    { id: "vorsitz2", label: "2. Vorsitzender", permissions: ["manage_news", "manage_events", "view_members"], system: false },
  ];

  function seed() {
    let roles = getStore(KEYS.roles, null) || [];
    // System-Rollen sicherstellen
    if (!roles.some((r) => r.id === "admin")) roles.push({ id: "admin", label: "Administrator", permissions: ALL_PERMS.slice(), system: true });
    if (!roles.some((r) => r.id === "member")) roles.push({ id: "member", label: "Mitglied", permissions: [], system: true });

    // Einmalige Migration: Beispiel-Rollen ergänzen (nicht wieder auferstehen lassen)
    const seedVersion = getStore(KEYS.seedVersion, 0);
    if (seedVersion < 2) {
      EXAMPLE_ROLES.forEach((ex) => { if (!roles.some((r) => r.id === ex.id)) roles.push({ ...ex, permissions: ex.permissions.slice() }); });
      setStore(KEYS.seedVersion, 2);
    }
    // Migration v3: neue Content-Rechte additiv an bestehende Beispiel-Rollen vergeben
    if (seedVersion < 3) {
      const grant = (id, perms) => {
        const r = roles.find((x) => x.id === id);
        if (r) perms.forEach((p) => { if (!(r.permissions || (r.permissions = [])).includes(p)) r.permissions.push(p); });
      };
      grant("vorstand", ["manage_training", "manage_site"]);
      grant("pressewart", ["manage_site"]);
      grant("trainer", ["manage_training"]);
      setStore(KEYS.seedVersion, 3);
    }
    // Migration v4: Auszahlungs-Recht an Vorstand & Kassenwart
    if (seedVersion < 4) {
      const grant = (id, perms) => {
        const r = roles.find((x) => x.id === id);
        if (r) perms.forEach((p) => { if (!(r.permissions || (r.permissions = [])).includes(p)) r.permissions.push(p); });
      };
      grant("vorstand", ["manage_payouts"]);
      grant("kassenwart", ["manage_payouts"]);
      setStore(KEYS.seedVersion, 4);
    }
    // Migration v5: Team-Anzeige über Rollen; manage_team entfällt
    if (seedVersion < 5) {
      const setTeam = (id, group, order) => { const r = roles.find((x) => x.id === id); if (r) { r.teamGroup = group; r.teamOrder = order; } };
      setTeam("trainer", "trainer", 0);
      setTeam("kassenwart", "vorstand", 30);
      BOARD_ROLES.forEach((ex) => { if (!roles.some((r) => r.id === ex.id)) roles.push({ ...ex, permissions: ex.permissions.slice() }); });
      roles.forEach((r) => { if (r.permissions) r.permissions = r.permissions.filter((p) => p !== "manage_team"); });
      setStore(KEYS.seedVersion, 5);
    }
    // Migration v6: Berechtigungs-Rollen von der öffentlichen Team-Anzeige trennen.
    // - Pro team-markierter Rolle für jeden Inhaber ein Vereinsamt (positions) anlegen.
    // - teamGroup/teamLabel/teamOrder von ALLEN Rollen entfernen (reine Rechte-Rollen).
    // - Rein anzeigende Rollen ohne Rechte (z. B. Schriftführer) entfernen.
    // - manage_team an Vorstand/1. Vorsitzenden vergeben.
    if (seedVersion < 6) {
      const users = getUsers();
      const positions = getPositions();
      const has = (uid, g, l, o) => positions.some((x) => x.userId === uid && x.group === g && x.label === l && Number(x.order) === Number(o));
      roles.forEach((r) => {
        if (!TEAM_GROUPS.includes(r.teamGroup)) return;
        const g = r.teamGroup, l = norm(r.teamLabel) || r.label, o = Number(r.teamOrder) || 0;
        users.forEach((u) => {
          if ((u.roles || []).includes(r.id) && !has(u.id, g, l, o)) positions.push({ id: genId("pos"), userId: u.id, group: g, label: l, order: o });
        });
      });
      setPositions(positions);
      roles.forEach((r) => { delete r.teamGroup; delete r.teamLabel; delete r.teamOrder; });
      // Rein anzeigende Rollen ohne Rechte entfernen (sie gewährten nichts)
      const empty = roles.filter((r) => !r.system && (!r.permissions || r.permissions.length === 0)).map((r) => r.id);
      if (empty.length) {
        roles = roles.filter((r) => !empty.includes(r.id));
        users.forEach((u) => { if (u.roles) u.roles = u.roles.filter((id) => !empty.includes(id)); });
        setUsers(users);
      }
      // manage_team an passende Rollen vergeben
      const grantT = (id) => { const r = roles.find((x) => x.id === id); if (r && r.permissions && !r.permissions.includes("manage_team")) r.permissions.push("manage_team"); };
      grantT("vorstand"); grantT("vorsitz1");
      setStore(KEYS.seedVersion, 6);
    }
    // Migration v7: Feature-/Beta-Freigabe-Recht an Vorstand & 1. Vorsitzenden.
    if (seedVersion < 7) {
      const grantF = (id) => { const r = roles.find((x) => x.id === id); if (r && r.permissions && !r.permissions.includes("manage_features")) r.permissions.push("manage_features"); };
      grantF("vorstand"); grantF("vorsitz1");
      setStore(KEYS.seedVersion, 7);
    }
    // Migration v8: Vereinsdaten-/Branding-Recht (White-Label) an Vorstand & 1. Vorsitzenden.
    if (seedVersion < 8) {
      const grantC = (id) => { const r = roles.find((x) => x.id === id); if (r && r.permissions && !r.permissions.includes("manage_club")) r.permissions.push("manage_club"); };
      grantC("vorstand"); grantC("vorsitz1");
      setStore(KEYS.seedVersion, 8);
    }
    // Migration v9: Provisionierungs-Recht (Funktionen buchen) an Vorstand & 1. Vorsitzenden.
    if (seedVersion < 9) {
      const grantB = (id) => { const r = roles.find((x) => x.id === id); if (r && r.permissions && !r.permissions.includes("book_features")) r.permissions.push("book_features"); };
      grantB("vorstand"); grantB("vorsitz1");
      setStore(KEYS.seedVersion, 9);
    }
    // Migration v10: Sponsoren-Recht an Vorstand, Pressewart & 1. Vorsitzenden.
    if (seedVersion < 10) {
      const grantS = (id) => { const r = roles.find((x) => x.id === id); if (r && r.permissions && !r.permissions.includes("manage_sponsors")) r.permissions.push("manage_sponsors"); };
      grantS("vorstand"); grantS("pressewart"); grantS("vorsitz1");
      setStore(KEYS.seedVersion, 10);
    }
    // Migration v11: Webshop-Recht. Eigene Rolle „Shop-Betreiber" (Julian Becker, privat).
    // BEWUSST NICHT an den Vorstand vergeben – der Shop ist rechtlich vom Verein getrennt.
    if (seedVersion < 11) {
      if (!roles.some((r) => r.id === "shop")) roles.push({ id: "shop", label: "Shop-Betreiber", permissions: ["manage_shop"], system: false });
      setStore(KEYS.seedVersion, 11);
    }
    setRoles(roles);

    const users = getUsers();
    if (!users.some((u) => u.email === ADMIN_EMAIL)) {
      users.push({ id: "usr-admin", name: "Administrator", email: ADMIN_EMAIL, address: null, iban: null, roles: ["admin"], createdAt: new Date().toISOString() });
      setUsers(users);
    }
  }
  seed();

  /* ----- Datenquellen laden (statische JSON-Dateien) ----- */
  async function loadData(file) {
    const res = await realFetch("assets/data/" + file, { cache: "no-cache" });
    if (!res.ok) throw new Error("Konnte " + file + " nicht laden");
    return res.json();
  }

  /* Club-Namespace für Content-Seeds (White-Label, additiv): ein Beispiel/Fork
     kann Inhalte über "<base>.<ns>.json" überschreiben (z. B. news.bsg.json),
     ohne die generische "<base>.json" zu divergieren. ns stammt aus club-config
     (window.BSG_CLUB.ns) – ohne Config (z. B. in Contract-Tests) gilt generisch. */
  const CLUB_NS =
    (typeof window !== "undefined" && window.BSG_CLUB && window.BSG_CLUB.ns) || "";
  async function loadClubData(base) {
    if (CLUB_NS) {
      try { return await loadData(base.replace(/\.json$/, "." + CLUB_NS + ".json")); }
      catch (e) { /* keine club-spezifische Datei -> generischer Fallback */ }
    }
    return loadData(base);
  }

  /* Dynamischer Content: beim ersten Zugriff aus JSON in den Store übernehmen */
  async function ensureNews() {
    let items = getStore(KEYS.news, null);
    if (!items) { items = await loadClubData("news.json"); setStore(KEYS.news, items); }
    return items;
  }
  async function ensureEvents() {
    let items = getStore(KEYS.events, null);
    if (!items) { items = await loadClubData("events.json"); setStore(KEYS.events, items); }
    return items;
  }
  async function ensureTraining() {
    let items = getStore(KEYS.training, null);
    if (!items) { items = await loadClubData("trainingszeiten.json"); setStore(KEYS.training, items); }
    return items;
  }
  async function ensureSite() {
    let values = getStore(KEYS.site, null);
    if (!values) { values = await loadClubData("site.json"); setStore(KEYS.site, values); }
    return values;
  }
  async function ensureSponsors() {
    let items = getStore(KEYS.sponsors, null);
    if (!items) { items = await loadData("sponsors.json"); setStore(KEYS.sponsors, items); }
    return items;
  }
  async function ensureSponsorsConfig() {
    let cfg = getStore(KEYS.sponsorsConfig, null);
    if (!cfg) { cfg = normSponsorsConfig({}); setStore(KEYS.sponsorsConfig, cfg); }
    return cfg;
  }
  async function ensureShopProducts() {
    let items = getStore(KEYS.shopProducts, null);
    if (!items) {
      try { items = await loadClubData("shop-products.json"); } catch (e) { items = []; }
      setStore(KEYS.shopProducts, items);
    }
    return items;
  }
  async function ensureShopConfig() {
    let cfg = getStore(KEYS.shopConfig, null);
    if (!cfg) {
      let raw = {};
      try { raw = await loadClubData("shop.json"); } catch (e) { raw = {}; }
      cfg = normShopConfig(raw);
      setStore(KEYS.shopConfig, cfg);
    }
    return cfg;
  }
  async function ensureClub() {
    let values = getStore(KEYS.club, null);
    if (!values) {
      /* Pro Referenz-Beispiel eine eigene Seed-Datei (White-Label): das aktive
         Beispiel bestimmt club-config.js -> window.BSG_CLUB.clubSeed. */
      const seedFile =
        (typeof window !== "undefined" && window.BSG_CLUB && window.BSG_CLUB.clubSeed) ||
        "club.json";
      values = await loadData(seedFile);
      setStore(KEYS.club, values);
    }
    return values;
  }
  /* Beispiel-Stammdaten (Nutzer/Vereinsämter/Mitgliedschaften) einmalig einspielen.
     Synchroner seed() kann kein JSON laden -> hier async beim ersten API-Zugriff.
     Idempotent über feste IDs/E-Mail; gegated über bsg_demo_version. */
  async function ensureDemo() {
    if (getStore(KEYS.demoVersion, 0) >= 1) return;
    let demo;
    try { demo = await loadClubData("demo-data.json"); }
    catch (e) { setStore(KEYS.demoVersion, 1); return; } // ohne Datei still überspringen
    const users = getUsers();
    (demo.users || []).forEach((u) => { if (!users.some((x) => x.id === u.id || x.email === u.email)) users.push(u); });
    setUsers(users);
    const positions = getPositions();
    (demo.positions || []).forEach((p) => { if (!positions.some((x) => x.id === p.id)) positions.push(p); });
    setPositions(positions);
    const mem = getStore(KEYS.memberships, []);
    (demo.memberships || []).forEach((m) => { if (!mem.some((x) => x.id === m.id)) mem.push(m); });
    setStore(KEYS.memberships, mem);
    const pc = getStore(KEYS.passCounter, 0) || 0;
    if (pc < (demo.passCounter || 0)) setStore(KEYS.passCounter, demo.passCounter);
    setStore(KEYS.demoVersion, 1);
  }

  /* ----- Route-Handler ----- */
  const routes = {
    /* ---------- News & Termine ---------- */
    "GET /api/news": async () => {
      const news = (await ensureNews()).slice().sort((a, b) => new Date(b.date) - new Date(a.date));
      return json({ ok: true, items: news });
    },
    "POST /api/news": async (body) => {
      const user = currentUser();
      if (!hasPerm(user, "manage_news")) return json({ ok: false, message: "Keine Berechtigung." }, user ? 403 : 401);
      const errors = newsErrors(body);
      if (Object.keys(errors).length) return json({ ok: false, message: "Bitte Eingaben prüfen.", errors }, 422);
      const items = await ensureNews();
      const item = { id: genId("news"), date: norm(body.date), tag: norm(body.tag) || "Verein", title: norm(body.title), excerpt: norm(body.excerpt), body: norm(body.body), image: isPhoto(body.image) ? body.image : "" };
      items.push(item); setStore(KEYS.news, items);
      return json({ ok: true, item, message: "Newsmeldung veröffentlicht." }, 201);
    },
    "POST /api/news/update": async (body) => {
      const user = currentUser();
      if (!hasPerm(user, "manage_news")) return json({ ok: false, message: "Keine Berechtigung." }, user ? 403 : 401);
      const errors = newsErrors(body);
      if (Object.keys(errors).length) return json({ ok: false, message: "Bitte Eingaben prüfen.", errors }, 422);
      const items = await ensureNews();
      const idx = items.findIndex((n) => n.id === body.id);
      if (idx === -1) return json({ ok: false, message: "Newsmeldung nicht gefunden." }, 404);
      const image = body.image === "" ? "" : (isPhoto(body.image) ? body.image : (items[idx].image || ""));
      items[idx] = { ...items[idx], date: norm(body.date), tag: norm(body.tag) || "Verein", title: norm(body.title), excerpt: norm(body.excerpt), body: norm(body.body), image };
      setStore(KEYS.news, items);
      return json({ ok: true, item: items[idx], message: "Newsmeldung gespeichert." });
    },
    "POST /api/news/delete": async (body) => {
      const user = currentUser();
      if (!hasPerm(user, "manage_news")) return json({ ok: false, message: "Keine Berechtigung." }, user ? 403 : 401);
      const items = await ensureNews();
      if (!items.some((n) => n.id === body.id)) return json({ ok: false, message: "Newsmeldung nicht gefunden." }, 404);
      setStore(KEYS.news, items.filter((n) => n.id !== body.id));
      return json({ ok: true, message: "Newsmeldung gelöscht." });
    },

    /* ---------- Sponsoren ---------- */
    "GET /api/sponsors": async () => {
      const items = (await ensureSponsors()).slice().sort((a, b) => (a.order - b.order) || a.name.localeCompare(b.name, "de"));
      return json({ ok: true, items });
    },
    "POST /api/sponsors": async (body) => {
      const user = currentUser();
      if (!hasPerm(user, "manage_sponsors")) return json({ ok: false, message: "Keine Berechtigung." }, user ? 403 : 401);
      const errors = sponsorErrors(body);
      if (Object.keys(errors).length) return json({ ok: false, message: "Bitte Eingaben prüfen.", errors }, 422);
      const items = await ensureSponsors();
      const item = { id: genId("spo"), ...sponsorFields(body), logo: isPhoto(body.logo) ? body.logo : "" };
      items.push(item); setStore(KEYS.sponsors, items);
      return json({ ok: true, item, message: "Sponsor angelegt." }, 201);
    },
    "POST /api/sponsors/update": async (body) => {
      const user = currentUser();
      if (!hasPerm(user, "manage_sponsors")) return json({ ok: false, message: "Keine Berechtigung." }, user ? 403 : 401);
      const errors = sponsorErrors(body);
      if (Object.keys(errors).length) return json({ ok: false, message: "Bitte Eingaben prüfen.", errors }, 422);
      const items = await ensureSponsors();
      const idx = items.findIndex((s) => s.id === body.id);
      if (idx === -1) return json({ ok: false, message: "Sponsor nicht gefunden." }, 404);
      const logo = body.logo === "" ? "" : (isPhoto(body.logo) ? body.logo : (items[idx].logo || ""));
      items[idx] = { ...items[idx], ...sponsorFields(body), logo };
      setStore(KEYS.sponsors, items);
      return json({ ok: true, item: items[idx], message: "Sponsor gespeichert." });
    },
    "POST /api/sponsors/delete": async (body) => {
      const user = currentUser();
      if (!hasPerm(user, "manage_sponsors")) return json({ ok: false, message: "Keine Berechtigung." }, user ? 403 : 401);
      const items = await ensureSponsors();
      if (!items.some((s) => s.id === body.id)) return json({ ok: false, message: "Sponsor nicht gefunden." }, 404);
      setStore(KEYS.sponsors, items.filter((s) => s.id !== body.id));
      return json({ ok: true, message: "Sponsor gelöscht." });
    },
    "GET /api/sponsors-config": async () => {
      const cfg = await ensureSponsorsConfig();
      return json({ ok: true, fields: SPONSORS_CONFIG_FIELDS, values: normSponsorsConfig(cfg) });
    },
    "POST /api/sponsors-config": async (body) => {
      const user = currentUser();
      if (!hasPerm(user, "manage_sponsors")) return json({ ok: false, message: "Keine Berechtigung." }, user ? 403 : 401);
      const values = body.values && typeof body.values === "object" ? body.values : body;
      const cfg = normSponsorsConfig(values);
      setStore(KEYS.sponsorsConfig, cfg);
      return json({ ok: true, values: cfg, message: "Sponsoren-Einstellungen gespeichert." });
    },

    /* ---------- Webshop: Konfiguration (Betreiber & Recht) ---------- */
    "GET /api/shop-config": async () => {
      const cfg = await ensureShopConfig();
      return json({ ok: true, fields: SHOP_CONFIG_FIELDS, values: normShopConfig(cfg) });
    },
    "POST /api/shop-config": async (body) => {
      const user = currentUser();
      if (!hasPerm(user, "manage_shop")) return json({ ok: false, message: "Keine Berechtigung." }, user ? 403 : 401);
      const values = body.values && typeof body.values === "object" ? body.values : body;
      const cfg = normShopConfig(values);
      setStore(KEYS.shopConfig, cfg);
      return json({ ok: true, values: cfg, message: "Shop-Einstellungen gespeichert." });
    },

    /* ---------- Webshop: Produkte ---------- */
    "GET /api/shop/products": async () => {
      const user = currentUser();
      const manage = hasPerm(user, "manage_shop");
      const tier = shopTierFor(user);
      const items = (await ensureShopProducts()).slice()
        .filter((p) => manage || p.active !== false)
        .sort((a, b) => (num(a.order) - num(b.order)) || a.name.localeCompare(b.name, "de"))
        .map((p) => {
          const out = {
            id: p.id, name: p.name, category: p.category, description: p.description || "",
            image: p.image || "", active: p.active !== false, order: num(p.order),
            prices: { extern: p.prices.extern, mitglied: p.prices.mitglied },
            yourTier: tier, yourPrice: shopPriceFor(p, tier),
          };
          // Förderpreis nur Verwaltung offenlegen (interne Sonderkondition).
          if (manage && p.prices.gesponsert != null) out.prices.gesponsert = p.prices.gesponsert;
          return out;
        });
      return json({ ok: true, items, tier });
    },
    "POST /api/shop/products": async (body) => {
      const user = currentUser();
      if (!hasPerm(user, "manage_shop")) return json({ ok: false, message: "Keine Berechtigung." }, user ? 403 : 401);
      const errors = productErrors(body);
      if (Object.keys(errors).length) return json({ ok: false, message: "Bitte Eingaben prüfen.", errors }, 422);
      const items = await ensureShopProducts();
      const item = { id: genId("prod"), ...productFields(body), image: isPhoto(body.image) ? body.image : "" };
      items.push(item); setStore(KEYS.shopProducts, items);
      return json({ ok: true, item, message: "Produkt angelegt." }, 201);
    },
    "POST /api/shop/products/update": async (body) => {
      const user = currentUser();
      if (!hasPerm(user, "manage_shop")) return json({ ok: false, message: "Keine Berechtigung." }, user ? 403 : 401);
      const errors = productErrors(body);
      if (Object.keys(errors).length) return json({ ok: false, message: "Bitte Eingaben prüfen.", errors }, 422);
      const items = await ensureShopProducts();
      const idx = items.findIndex((p) => p.id === body.id);
      if (idx === -1) return json({ ok: false, message: "Produkt nicht gefunden." }, 404);
      const image = body.image === "" ? "" : (isPhoto(body.image) ? body.image : (items[idx].image || ""));
      items[idx] = { ...items[idx], ...productFields(body), image };
      setStore(KEYS.shopProducts, items);
      return json({ ok: true, item: items[idx], message: "Produkt gespeichert." });
    },
    "POST /api/shop/products/delete": async (body) => {
      const user = currentUser();
      if (!hasPerm(user, "manage_shop")) return json({ ok: false, message: "Keine Berechtigung." }, user ? 403 : 401);
      const items = await ensureShopProducts();
      if (!items.some((p) => p.id === body.id)) return json({ ok: false, message: "Produkt nicht gefunden." }, 404);
      setStore(KEYS.shopProducts, items.filter((p) => p.id !== body.id));
      return json({ ok: true, message: "Produkt gelöscht." });
    },

    /* ---------- Webshop: Förder-Status (gesponserte Einzelperson) ---------- */
    "POST /api/shop/sponsored": async (body) => {
      const user = currentUser();
      if (!hasPerm(user, "manage_shop")) return json({ ok: false, message: "Keine Berechtigung." }, user ? 403 : 401);
      if (typeof body.sponsored !== "boolean") return json({ ok: false, message: "Bitte Eingaben prüfen.", errors: { sponsored: "Boolean erwartet." } }, 422);
      const users = getUsers();
      // Betreiber hat keinen Mitglieder-Listenzugriff: Auswahl per userId ODER E-Mail.
      const idx = body.userId
        ? users.findIndex((u) => u.id === body.userId)
        : (body.email ? users.findIndex((u) => u.email === lc(body.email)) : -1);
      if (idx === -1) return json({ ok: false, message: "Benutzer nicht gefunden.", errors: { email: "Kein Konto mit dieser E-Mail." } }, 404);
      users[idx].shopSponsored = body.sponsored;
      setUsers(users);
      return json({ ok: true, user: { id: users[idx].id, name: users[idx].name, email: users[idx].email, shopSponsored: !!users[idx].shopSponsored }, message: body.sponsored ? "Förder-Status gesetzt." : "Förder-Status entfernt." });
    },

    /* ---------- Webshop: SEPA-Lastschriftmandat ---------- */
    "GET /api/shop/mandate": async () => {
      const user = currentUser();
      if (!user) return json({ ok: false, message: "Nicht angemeldet." }, 401);
      const mandate = getStore(KEYS.shopMandates, []).filter((m) => m.userId === user.id && m.status === "aktiv").slice(-1)[0] || null;
      return json({ ok: true, mandate });
    },
    "POST /api/shop/mandate": async (body) => {
      const user = currentUser();
      if (!user) return json({ ok: false, message: "Nicht angemeldet." }, 401);
      if (!shopCanCheckout(user)) return json({ ok: false, message: "Nur aktive Vereinsmitglieder können ein SEPA-Mandat erteilen." }, 403);
      if (!asBool(body.consent)) return json({ ok: false, message: "Bitte das SEPA-Lastschriftmandat bestätigen.", errors: { consent: "Bitte bestätigen." } }, 422);
      const iban = norm(body.iban) ? body.iban : user.iban;
      if (!iban || !isIban(iban)) return json({ ok: false, code: "ACCOUNT_INCOMPLETE", message: "Bitte zuerst eine gültige IBAN im Konto hinterlegen." }, 409);
      const cfg = await ensureShopConfig();
      const mandates = getStore(KEYS.shopMandates, []);
      mandates.forEach((m) => { if (m.userId === user.id && m.status === "aktiv") m.status = "widerrufen"; });
      const mandate = {
        id: genId("man"), userId: user.id,
        mandateRef: "SHOP-" + user.id.replace(/^usr-/, "").toUpperCase().slice(0, 8) + "-" + Date.now().toString(36).toUpperCase(),
        iban: fmtIban(iban), accountHolder: norm(body.accountHolder) || user.name,
        creditorId: cfg.creditorId || "", creditorName: cfg.operatorName || "",
        consentAt: new Date().toISOString(), status: "aktiv", createdAt: new Date().toISOString(),
      };
      mandates.push(mandate); setStore(KEYS.shopMandates, mandates);
      return json({ ok: true, mandate, message: "SEPA-Lastschriftmandat gespeichert." }, 201);
    },

    /* ---------- Webshop: Bestellungen ---------- */
    "GET /api/shop/orders": async () => {
      const user = currentUser();
      if (!user) return json({ ok: false, message: "Nicht angemeldet." }, 401);
      const items = getStore(KEYS.shopOrders, []).filter((o) => o.userId === user.id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return json({ ok: true, items });
    },
    "POST /api/shop/orders": async (body) => {
      const user = currentUser();
      if (!user) return json({ ok: false, message: "Nicht angemeldet." }, 401);
      if (!shopCanCheckout(user)) return json({ ok: false, message: "Nur aktive Vereinsmitglieder können bestellen. Externe Interessenten bestellen bitte per Anfrage." }, 403);
      const cart = Array.isArray(body.items) ? body.items : [];
      const errors = {};
      if (!cart.length) errors.items = "Bitte mindestens ein Produkt wählen.";
      if (!asBool(body.consent)) errors.consent = "Bitte die SEPA-Lastschrift bestätigen.";
      if (Object.keys(errors).length) return json({ ok: false, message: "Bitte Eingaben prüfen.", errors }, 422);
      const mandate = getStore(KEYS.shopMandates, []).filter((m) => m.userId === user.id && m.status === "aktiv").slice(-1)[0];
      if (!mandate) return json({ ok: false, code: "NO_MANDATE", message: "Bitte zuerst ein SEPA-Lastschriftmandat erteilen." }, 409);
      const products = await ensureShopProducts();
      const tier = shopTierFor(user);
      const lines = [];
      for (const it of cart) {
        const p = products.find((x) => x.id === it.productId && x.active !== false);
        const qty = Math.floor(num(it.qty));
        if (!p) { errors.items = "Produkt nicht gefunden."; break; }
        if (!(qty >= 1)) { errors.items = "Ungültige Menge."; break; }
        const unitPrice = shopPriceFor(p, tier);
        lines.push({ productId: p.id, name: p.name, qty, tier, unitPrice, lineTotal: round2(unitPrice * qty) });
      }
      if (errors.items) return json({ ok: false, message: "Bitte Eingaben prüfen.", errors }, 422);
      const total = round2(lines.reduce((s, l) => s + l.lineTotal, 0));
      const now = new Date().toISOString();
      const order = { id: genId("ord"), userId: user.id, items: lines, total, tier, mandateId: mandate.id, status: "mandat_erteilt", note: norm(body.note), createdAt: now, updatedAt: now };
      const orders = getStore(KEYS.shopOrders, []); orders.push(order); setStore(KEYS.shopOrders, orders);
      return json({ ok: true, order, message: "Bestellung aufgegeben. Der Betrag wird per SEPA-Lastschrift eingezogen." }, 201);
    },
    "GET /api/shop/admin/orders": async () => {
      const user = currentUser();
      if (!hasPerm(user, "manage_shop")) return json({ ok: false, message: "Keine Berechtigung." }, user ? 403 : 401);
      const usersById = {}; getUsers().forEach((u) => { usersById[u.id] = u; });
      const items = getStore(KEYS.shopOrders, []).map((o) => {
        const ow = usersById[o.userId] || {};
        return { ...o, ownerName: ow.name || "—", ownerEmail: ow.email || "—" };
      }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return json({ ok: true, items });
    },
    "POST /api/shop/orders/status": async (body) => {
      const user = currentUser();
      if (!hasPerm(user, "manage_shop")) return json({ ok: false, message: "Keine Berechtigung." }, user ? 403 : 401);
      if (!SHOP_ORDER_STATUSES.includes(body.status)) return json({ ok: false, message: "Bitte Eingaben prüfen.", errors: { status: "Ungültiger Status." } }, 422);
      const orders = getStore(KEYS.shopOrders, []);
      const idx = orders.findIndex((o) => o.id === body.id);
      if (idx === -1) return json({ ok: false, message: "Bestellung nicht gefunden." }, 404);
      orders[idx].status = body.status; orders[idx].updatedAt = new Date().toISOString();
      setStore(KEYS.shopOrders, orders);
      return json({ ok: true, order: orders[idx], message: "Bestellstatus aktualisiert." });
    },

    "GET /api/age-classes": async () => {
      const cfg = await loadData("age-classes.json");
      return json({ ok: true, items: allAgeClassLabels(cfg) });
    },

    "GET /api/weight-classes": async () => {
      const cfg = await loadData("weight-classes.json");
      return json({ ok: true, categories: cfg.categories || [] });
    },

    /* ---------- Trainingszeiten ---------- */
    "GET /api/training": async () => {
      return json({ ok: true, items: await ensureTraining() });
    },
    "POST /api/training": async (body) => {
      const user = currentUser();
      if (!hasPerm(user, "manage_training")) return json({ ok: false, message: "Keine Berechtigung." }, user ? 403 : 401);
      const errors = trainingErrors(body);
      if (Object.keys(errors).length) return json({ ok: false, message: "Bitte Eingaben prüfen.", errors }, 422);
      const items = await ensureTraining();
      const item = { id: genId("ts"), ...trainingFields(body) };
      items.push(item); setStore(KEYS.training, items);
      return json({ ok: true, item, message: "Trainingszeit angelegt." }, 201);
    },
    "POST /api/training/update": async (body) => {
      const user = currentUser();
      if (!hasPerm(user, "manage_training")) return json({ ok: false, message: "Keine Berechtigung." }, user ? 403 : 401);
      const errors = trainingErrors(body);
      if (Object.keys(errors).length) return json({ ok: false, message: "Bitte Eingaben prüfen.", errors }, 422);
      const items = await ensureTraining();
      const idx = items.findIndex((t) => t.id === body.id);
      if (idx === -1) return json({ ok: false, message: "Trainingszeit nicht gefunden." }, 404);
      items[idx] = { ...items[idx], ...trainingFields(body) };
      setStore(KEYS.training, items);
      return json({ ok: true, item: items[idx], message: "Trainingszeit gespeichert." });
    },
    "POST /api/training/delete": async (body) => {
      const user = currentUser();
      if (!hasPerm(user, "manage_training")) return json({ ok: false, message: "Keine Berechtigung." }, user ? 403 : 401);
      const items = await ensureTraining();
      if (!items.some((t) => t.id === body.id)) return json({ ok: false, message: "Trainingszeit nicht gefunden." }, 404);
      setStore(KEYS.training, items.filter((t) => t.id !== body.id));
      return json({ ok: true, message: "Trainingszeit gelöscht." });
    },

    /* ---------- Team & Vorstand (öffentlich, aus Vereinsämtern × Nutzern) ---------- */
    "GET /api/team": async () => {
      const users = getUsers();
      const byId = {}; users.forEach((u) => { byId[u.id] = u; });
      const items = [];
      getPositions().forEach((p) => {
        const u = byId[p.userId];
        if (!u) return; // Nutzer gelöscht -> Amt überspringen
        if (!TEAM_GROUPS.includes(p.group)) return; // ungültige/leere Gruppe nicht veröffentlichen (Contract: vorstand|trainer)
        items.push({
          group: p.group,
          label: norm(p.label),
          order: Number(p.order) || 0,
          name: u.name,
          photo: u.photo || "",
        });
      });
      items.sort((a, b) => (a.order - b.order) || a.label.localeCompare(b.label, "de") || a.name.localeCompare(b.name, "de"));
      return json({ ok: true, items });
    },

    /* ---------- Vereinsämter (Team-Seite verwalten, gated: manage_team) ---------- */
    "GET /api/positions": async () => {
      const user = currentUser();
      if (!hasPerm(user, "manage_team")) return json({ ok: false, message: "Keine Berechtigung." }, user ? 403 : 401);
      const users = getUsers();
      const byId = {}; users.forEach((u) => { byId[u.id] = u; });
      const items = getPositions().map((p) => {
        const u = byId[p.userId] || {};
        return { id: p.id, userId: p.userId, group: p.group, label: p.label, order: p.order, name: u.name || "—", email: u.email || "—" };
      });
      return json({ ok: true, items, users: users.map((u) => ({ id: u.id, name: u.name })) });
    },

    "POST /api/positions": async (body) => {
      const user = currentUser();
      if (!hasPerm(user, "manage_team")) return json({ ok: false, message: "Keine Berechtigung." }, user ? 403 : 401);
      if (!getUserById(body.userId)) return json({ ok: false, message: "Bitte Eingaben prüfen.", errors: { userId: "Bitte ein Mitglied wählen." } }, 422);
      const label = norm(body.label);
      if (label.length < 1) return json({ ok: false, message: "Bitte Eingaben prüfen.", errors: { label: "Bitte einen Funktionsnamen angeben." } }, 422);
      const group = teamGroupOf(body.group);
      // Vorstandsposten sind exklusiv: pro Amt (Label) nur eine Person.
      if (group === "vorstand" && getPositions().some((p) => p.group === "vorstand" && norm(p.label) === label)) {
        return json({ ok: false, message: "Dieses Vorstandsamt ist bereits vergeben.", errors: { label: "Vorstandsamt bereits vergeben." } }, 409);
      }
      const pos = { id: genId("pos"), userId: body.userId, group, label, order: num(body.order) };
      const list = getPositions(); list.push(pos); setPositions(list);
      return json({ ok: true, position: pos, message: "Amt angelegt." }, 201);
    },

    "POST /api/positions/update": async (body) => {
      const user = currentUser();
      if (!hasPerm(user, "manage_team")) return json({ ok: false, message: "Keine Berechtigung." }, user ? 403 : 401);
      const list = getPositions();
      const idx = list.findIndex((p) => p.id === body.id);
      if (idx === -1) return json({ ok: false, message: "Amt nicht gefunden." }, 404);
      if (body.userId !== undefined && !getUserById(body.userId)) return json({ ok: false, message: "Bitte Eingaben prüfen.", errors: { userId: "Bitte ein Mitglied wählen." } }, 422);
      const nextGroup = body.group !== undefined ? teamGroupOf(body.group) : list[idx].group;
      const nextLabel = (body.label !== undefined && norm(body.label).length >= 1) ? norm(body.label) : list[idx].label;
      if (nextGroup === "vorstand" && list.some((p, i) => i !== idx && p.group === "vorstand" && norm(p.label) === nextLabel)) {
        return json({ ok: false, message: "Dieses Vorstandsamt ist bereits vergeben.", errors: { label: "Vorstandsamt bereits vergeben." } }, 409);
      }
      if (body.userId !== undefined) list[idx].userId = body.userId;
      list[idx].group = nextGroup;
      list[idx].label = nextLabel;
      if (body.order !== undefined) list[idx].order = num(body.order);
      setPositions(list);
      return json({ ok: true, position: list[idx], message: "Amt gespeichert." });
    },

    "POST /api/positions/delete": async (body) => {
      const user = currentUser();
      if (!hasPerm(user, "manage_team")) return json({ ok: false, message: "Keine Berechtigung." }, user ? 403 : 401);
      const list = getPositions();
      if (!list.some((p) => p.id === body.id)) return json({ ok: false, message: "Amt nicht gefunden." }, 404);
      setPositions(list.filter((p) => p.id !== body.id));
      return json({ ok: true, message: "Amt gelöscht." });
    },

    /* ---------- Startseiten-Texte ---------- */
    "GET /api/site": async () => {
      const stored = await ensureSite();
      const values = {};
      SITE_FIELDS.forEach((f) => { values[f.key] = norm(stored[f.key]); });
      return json({ ok: true, fields: SITE_FIELDS, values });
    },
    "POST /api/site": async (body) => {
      const user = currentUser();
      if (!hasPerm(user, "manage_site")) return json({ ok: false, message: "Keine Berechtigung." }, user ? 403 : 401);
      const stored = await ensureSite();
      const values = body.values && typeof body.values === "object" ? body.values : body;
      SITE_KEYS.forEach((k) => { if (k in values) stored[k] = norm(values[k]); });
      setStore(KEYS.site, stored);
      const out = {};
      SITE_FIELDS.forEach((f) => { out[f.key] = norm(stored[f.key]); });
      return json({ ok: true, values: out, message: "Startseiten-Texte gespeichert." });
    },

    /* ---------- Vereinsdaten / Branding (White-Label-Config) ---------- */
    "GET /api/club": async () => {
      const stored = await ensureClub();
      const values = {};
      CLUB_FIELDS.forEach((f) => { values[f.key] = norm(stored[f.key]); });
      return json({ ok: true, fields: CLUB_FIELDS, values });
    },
    "POST /api/club": async (body) => {
      const user = currentUser();
      if (!hasPerm(user, "manage_club")) return json({ ok: false, message: "Keine Berechtigung." }, user ? 403 : 401);
      const stored = await ensureClub();
      const values = body.values && typeof body.values === "object" ? body.values : body;
      CLUB_KEYS.forEach((k) => { if (k in values) stored[k] = norm(values[k]); });
      setStore(KEYS.club, stored);
      const out = {};
      CLUB_FIELDS.forEach((f) => { out[f.key] = norm(stored[f.key]); });
      return json({ ok: true, values: out, message: "Vereinsdaten gespeichert." });
    },
    // Rohes PWA-Manifest aus der Club-Config (kein {ok:…}-Wrapper – ein Manifest
    // darf das Feld nicht tragen). Im echten Backend liefert server/index.mjs
    // /manifest.webmanifest darüber pro Domain aus.
    "GET /api/manifest": async () => json(buildManifest(await ensureClub())),

    "GET /api/events": async () => {
      const events = (await ensureEvents()).slice().sort((a, b) => new Date(a.date) - new Date(b.date));
      return json({ ok: true, items: events });
    },
    "POST /api/events": async (body) => {
      const user = currentUser();
      if (!hasPerm(user, "manage_events")) return json({ ok: false, message: "Keine Berechtigung." }, user ? 403 : 401);
      const errors = eventErrors(body);
      const money = eventMoney(body, errors);
      const org = eventOrganizer(body, errors);
      if (Object.keys(errors).length) return json({ ok: false, message: "Bitte Eingaben prüfen.", errors }, 422);
      const cfg = await loadData("age-classes.json");
      const valid = allAgeClassLabels(cfg);
      const item = {
        id: genId("ev"), date: norm(body.date), time: norm(body.time),
        type: EVENT_TYPES.includes(body.type) ? body.type : "Event", title: norm(body.title), location: norm(body.location),
        ageClasses: Array.isArray(body.ageClasses) ? body.ageClasses.filter((c) => valid.includes(c)) : [],
        fee: money.fee, ownShare: money.ownShare,
        organizerName: org.organizerName, organizerIban: org.organizerIban,
      };
      const items = await ensureEvents();
      items.push(item); setStore(KEYS.events, items);
      return json({ ok: true, item, message: "Termin angelegt." }, 201);
    },
    "POST /api/events/update": async (body) => {
      const user = currentUser();
      if (!hasPerm(user, "manage_events")) return json({ ok: false, message: "Keine Berechtigung." }, user ? 403 : 401);
      const errors = eventErrors(body);
      const money = eventMoney(body, errors);
      const org = eventOrganizer(body, errors);
      if (Object.keys(errors).length) return json({ ok: false, message: "Bitte Eingaben prüfen.", errors }, 422);
      const items = await ensureEvents();
      const idx = items.findIndex((ev) => ev.id === body.id);
      if (idx === -1) return json({ ok: false, message: "Termin nicht gefunden." }, 404);
      const cfg = await loadData("age-classes.json");
      const valid = allAgeClassLabels(cfg);
      items[idx] = {
        ...items[idx], date: norm(body.date), time: norm(body.time),
        type: EVENT_TYPES.includes(body.type) ? body.type : "Event", title: norm(body.title), location: norm(body.location),
        ageClasses: Array.isArray(body.ageClasses) ? body.ageClasses.filter((c) => valid.includes(c)) : [],
        fee: money.fee, ownShare: money.ownShare,
        organizerName: org.organizerName, organizerIban: org.organizerIban,
      };
      setStore(KEYS.events, items);
      return json({ ok: true, item: items[idx], message: "Termin gespeichert." });
    },
    "POST /api/events/delete": async (body) => {
      const user = currentUser();
      if (!hasPerm(user, "manage_events")) return json({ ok: false, message: "Keine Berechtigung." }, user ? 403 : 401);
      const items = await ensureEvents();
      if (!items.some((ev) => ev.id === body.id)) return json({ ok: false, message: "Termin nicht gefunden." }, 404);
      setStore(KEYS.events, items.filter((ev) => ev.id !== body.id));
      return json({ ok: true, message: "Termin gelöscht." });
    },

    "GET /api/admin/members": async () => {
      const user = currentUser();
      if (!hasPerm(user, "view_members")) return json({ ok: false, message: "Keine Berechtigung." }, user ? 403 : 401);
      const fin = hasPerm(user, "view_finance");
      const cfg = await loadData("membership-types.json");
      const acfg = await loadData("age-classes.json");
      const users = getUsers();
      const byId = {}; users.forEach((u) => { byId[u.id] = u; });
      const memberships = getStore(KEYS.memberships, []);
      const items = memberships.map((m) => {
        const owner = byId[m.userId] || {};
        const row = {
          id: m.id, firstName: m.firstName, lastName: m.lastName,
          categoryLabel: m.categoryLabel || "", individualFee: m.individualFee || 0,
          status: m.status, startedAt: m.startedAt,
          photo: m.photo || null, passNumber: m.passNumber || "", belt: m.belt || "", weightClass: m.weightClass || "",
          competitionClasses: classesForAge(ageInYear(m.birthdate), m.gender, acfg),
          ownerId: m.userId, ownerName: owner.name || "—", ownerEmail: owner.email || "—", address: owner.address || null,
        };
        if (fin) row.iban = owner.iban || null;
        return row;
      });
      let households = null;
      if (fin) {
        households = users.map((u) => {
          const active = memberships.filter((m) => m.userId === u.id && m.status === "aktiv");
          if (!active.length) return null;
          const s = billingSummary(active, cfg.familyFlatMonthly);
          return { ownerName: u.name, ownerEmail: u.email, iban: u.iban || null, activeCount: s.activeCount, effectiveTotal: s.effectiveTotal, familyApplied: s.familyApplied };
        }).filter(Boolean);
      }
      return json({ ok: true, items, canViewFinance: fin, households });
    },

    "GET /api/membership-types": async () => {
      const cfg = await loadData("membership-types.json");
      return json({ ok: true, ageBands: cfg.ageBands, familyFlatMonthly: cfg.familyFlatMonthly });
    },

    /* ---------- Probetraining & Kontakt ---------- */
    "POST /api/anmeldung": async (body) => {
      const errors = {};
      if (norm(body.name).length < 2) errors.name = "Bitte Namen angeben.";
      if (!isEmail(body.email)) errors.email = "Bitte gültige E-Mail-Adresse angeben.";
      if (!body.group) errors.group = "Bitte eine Trainingsgruppe wählen.";
      if (!body.privacy) errors.privacy = "Bitte der Datenverarbeitung zustimmen.";
      if (Object.keys(errors).length) return json({ ok: false, message: "Bitte Eingaben prüfen.", errors }, 422);
      const entry = { ...body, id: "ANM-" + Date.now(), receivedAt: new Date().toISOString() };
      saveLocal(KEYS.anmeldung, entry);
      return json({
        ok: true, id: entry.id,
        message: "Vielen Dank, " + norm(body.name).split(" ")[0] +
          "! Deine Anmeldung zum Probetraining ist eingegangen. Wir melden uns in Kürze. " +
          "Du kannst auch einfach spontan zum nächsten Training vorbeikommen.",
      }, 201);
    },

    "POST /api/kontakt": async (body) => {
      const errors = {};
      if (norm(body.name).length < 2) errors.name = "Bitte Namen angeben.";
      if (!isEmail(body.email)) errors.email = "Bitte gültige E-Mail-Adresse angeben.";
      if (norm(body.message).length < 10) errors.message = "Bitte eine etwas ausführlichere Nachricht (min. 10 Zeichen).";
      if (!body.privacy) errors.privacy = "Bitte der Datenverarbeitung zustimmen.";
      if (Object.keys(errors).length) return json({ ok: false, message: "Bitte Eingaben prüfen.", errors }, 422);
      const entry = { ...body, id: "MSG-" + Date.now(), receivedAt: new Date().toISOString() };
      saveLocal(KEYS.kontakt, entry);
      return json({ ok: true, id: entry.id, message: "Danke für deine Nachricht! Wir haben sie erhalten und melden uns so schnell wie möglich." });
    },

    /* ---------- Auth (passwordless) ---------- */
    "POST /api/auth/register": async (body) => {
      const errors = {};
      if (norm(body.name).length < 2) errors.name = "Bitte Namen angeben.";
      if (!isEmail(body.email)) errors.email = "Bitte gültige E-Mail-Adresse angeben.";
      if (!body.privacy) errors.privacy = "Bitte der Datenverarbeitung zustimmen.";
      if (Object.keys(errors).length) return json({ ok: false, message: "Bitte Eingaben prüfen.", errors }, 422);
      if (findUserByEmail(body.email)) {
        return json({ ok: false, message: "Für diese E-Mail existiert bereits ein Konto. Bitte einloggen.", errors: { email: "E-Mail bereits registriert." } }, 409);
      }
      const user = { id: genId("usr"), name: norm(body.name), email: lc(body.email), address: null, iban: null, roles: ["member"], createdAt: new Date().toISOString() };
      const users = getUsers(); users.push(user); setUsers(users);
      setSession(user.id);
      return json({ ok: true, user: publicUser(user), message: "Willkommen, " + user.name.split(" ")[0] + "! Dein Konto wurde erstellt." }, 201);
    },

    "POST /api/auth/request-code": async (body) => {
      if (!isEmail(body.email)) return json({ ok: false, message: "Bitte gültige E-Mail-Adresse angeben.", errors: { email: "Ungültige E-Mail." } }, 422);
      const user = findUserByEmail(body.email);
      if (!user) return json({ ok: false, message: "Kein Konto mit dieser E-Mail gefunden. Bitte zuerst registrieren.", errors: { email: "Unbekannte E-Mail." } }, 404);
      if (user.active === false) return json({ ok: false, message: "Dieses Konto ist deaktiviert. Bitte wende dich an den Vorstand." }, 403);
      const codes = getStore(KEYS.codes, {});
      const code = genCode();
      codes[user.email] = code;
      setStore(KEYS.codes, codes);
      // devCode wird nur mitgeliefert, weil im Mock keine echte E-Mail verschickt wird:
      return json({ ok: true, message: "Wir haben dir einen Anmeldecode geschickt.", devCode: code });
    },

    "POST /api/auth/login": async (body) => {
      const user = findUserByEmail(body.email);
      const codes = getStore(KEYS.codes, {});
      if (!user || !codes[user.email] || norm(body.code) !== codes[user.email]) {
        return json({ ok: false, message: "Code ungültig oder abgelaufen. Bitte erneut anfordern.", errors: { code: "Falscher Code." } }, 401);
      }
      delete codes[user.email]; setStore(KEYS.codes, codes);
      if (user.active === false) return json({ ok: false, message: "Dieses Konto ist deaktiviert. Bitte wende dich an den Vorstand." }, 403);
      setSession(user.id);
      return json({ ok: true, user: publicUser(user), message: "Willkommen zurück, " + user.name.split(" ")[0] + "!" });
    },

    "POST /api/auth/logout": async () => {
      clearSession();
      return json({ ok: true });
    },

    "GET /api/auth/me": async () => {
      const me = currentUser();
      if (!me) return json({ ok: false, message: "Nicht angemeldet." }, 401);
      return json({ ok: true, user: publicUser(me), permissions: userPermissions(me), isAdmin: isAdmin(me) });
    },

    "GET /api/permissions": async () => {
      const user = currentUser();
      if (!hasPerm(user, "manage_roles")) return json({ ok: false, message: "Keine Berechtigung." }, user ? 403 : 401);
      return json({ ok: true, items: PERMISSIONS });
    },

    /* ---------- Feature-Gating & Beta-Freigabe ---------- */
    // Nutzer-spezifisch & öffentlich erreichbar: welche Features darf DIESER Nutzer sehen?
    "GET /api/capabilities": async () => {
      const user = currentUser();
      const flags = getFeatureFlags();
      const bookings = getFeatureBookings();
      const features = {};
      FEATURES.forEach((f) => {
        if (!isBooked(f.key, bookings)) return; // nicht gebucht -> für den Mandanten nicht existent
        const scope = scopeFor(f.key, flags);
        if (canSeeFeature(user, scope)) features[f.key] = { status: f.status, public: scope === "public" };
      });
      return json({ ok: true, features });
    },
    // Verwaltung (Superadmin): Katalog + aktuelle Freigabe je Feature + Rollen-Auswahl.
    "GET /api/features": async () => {
      const user = currentUser();
      if (!hasPerm(user, "manage_features")) return json({ ok: false, message: "Keine Berechtigung." }, user ? 403 : 401);
      const flags = getFeatureFlags();
      const items = FEATURES.map((f) => ({ key: f.key, label: f.label, status: f.status, scope: scopeFor(f.key, flags) }));
      const roles = getRoles().map((r) => ({ id: r.id, label: r.label }));
      return json({ ok: true, items, roles });
    },
    "POST /api/features/release": async (body) => {
      const user = currentUser();
      if (!hasPerm(user, "manage_features")) return json({ ok: false, message: "Keine Berechtigung." }, user ? 403 : 401);
      if (!FEATURE_KEYS.includes(body.key)) return json({ ok: false, message: "Unbekanntes Feature." }, 404);
      const scope = normalizeScope(body.release, getRoles().map((r) => r.id));
      if (scope === null) return json({ ok: false, message: "Bitte Eingaben prüfen.", errors: { release: "Ungültige Freigabe." } }, 422);
      const flags = getFeatureFlags();
      flags[body.key] = scope;
      setFeatureFlags(flags);
      return json({ ok: true, key: body.key, scope, message: "Freigabe gespeichert." });
    },
    // Provisionierung (Buchung): welche Features sind für diesen Mandanten gebucht?
    "GET /api/bookings": async () => {
      const user = currentUser();
      if (!hasPerm(user, "book_features")) return json({ ok: false, message: "Keine Berechtigung." }, user ? 403 : 401);
      const bookings = getFeatureBookings();
      const items = FEATURES.map((f) => ({ key: f.key, label: f.label, status: f.status, booked: isBooked(f.key, bookings) }));
      return json({ ok: true, items });
    },
    "POST /api/features/book": async (body) => {
      const user = currentUser();
      if (!hasPerm(user, "book_features")) return json({ ok: false, message: "Keine Berechtigung." }, user ? 403 : 401);
      if (!FEATURE_KEYS.includes(body.key)) return json({ ok: false, message: "Unbekanntes Feature." }, 404);
      if (typeof body.booked !== "boolean") return json({ ok: false, message: "Bitte Eingaben prüfen.", errors: { booked: "Buchung muss true/false sein." } }, 422);
      const bookings = getFeatureBookings();
      bookings[body.key] = body.booked;
      setFeatureBookings(bookings);
      return json({ ok: true, key: body.key, booked: body.booked, message: "Buchung gespeichert." });
    },

    "GET /api/roles": async () => {
      const user = currentUser();
      if (!hasPerm(user, "manage_roles") && !hasPerm(user, "manage_users")) return json({ ok: false, message: "Keine Berechtigung." }, user ? 403 : 401);
      return json({ ok: true, items: getRoles() });
    },

    "POST /api/roles": async (body) => {
      const user = currentUser();
      if (!hasPerm(user, "manage_roles")) return json({ ok: false, message: "Keine Berechtigung." }, user ? 403 : 401);
      const label = norm(body.label);
      if (label.length < 2) return json({ ok: false, message: "Bitte Eingaben prüfen.", errors: { label: "Bitte Rollennamen angeben." } }, 422);
      const perms = (body.permissions || []).filter((p) => ALL_PERMS.includes(p));
      const roles = getRoles();
      const id = "role-" + label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + Math.random().toString(36).slice(2, 5);
      const role = { id, label, permissions: perms, system: false };
      roles.push(role); setRoles(roles);
      return json({ ok: true, role, message: "Rolle „" + label + "“ angelegt." }, 201);
    },

    "POST /api/roles/update": async (body) => {
      const user = currentUser();
      if (!hasPerm(user, "manage_roles")) return json({ ok: false, message: "Keine Berechtigung." }, user ? 403 : 401);
      const roles = getRoles();
      const idx = roles.findIndex((r) => r.id === body.id);
      if (idx === -1) return json({ ok: false, message: "Rolle nicht gefunden." }, 404);
      if (roles[idx].id === "admin") return json({ ok: false, message: "Die Administrator-Rolle besitzt immer alle Berechtigungen und kann nicht eingeschränkt werden." }, 409);
      if (body.label !== undefined && norm(body.label).length >= 2) roles[idx].label = norm(body.label);
      if (Array.isArray(body.permissions)) roles[idx].permissions = body.permissions.filter((p) => ALL_PERMS.includes(p));
      setRoles(roles);
      return json({ ok: true, role: roles[idx], message: "Rolle gespeichert." });
    },

    "POST /api/roles/delete": async (body) => {
      const user = currentUser();
      if (!hasPerm(user, "manage_roles")) return json({ ok: false, message: "Keine Berechtigung." }, user ? 403 : 401);
      const roles = getRoles();
      const role = roles.find((r) => r.id === body.id);
      if (!role) return json({ ok: false, message: "Rolle nicht gefunden." }, 404);
      if (role.system) return json({ ok: false, message: "System-Rollen können nicht gelöscht werden." }, 409);
      setRoles(roles.filter((r) => r.id !== body.id));
      // Rolle von allen Nutzern entfernen
      const users = getUsers();
      users.forEach((u) => { if (u.roles) u.roles = u.roles.filter((rid) => rid !== body.id); });
      setUsers(users);
      return json({ ok: true, message: "Rolle gelöscht." });
    },

    "GET /api/users": async () => {
      const user = currentUser();
      if (!hasPerm(user, "manage_users")) return json({ ok: false, message: "Keine Berechtigung." }, user ? 403 : 401);
      const memberships = getStore(KEYS.memberships, []);
      const items = getUsers().map((u) => ({
        id: u.id, name: u.name, email: u.email, roles: u.roles || ["member"],
        active: u.active !== false, createdAt: u.createdAt || null,
        membershipCount: memberships.filter((m) => m.userId === u.id).length,
        activeMembershipCount: memberships.filter((m) => m.userId === u.id && m.status === "aktiv").length,
        isSelf: u.id === user.id,
      }));
      return json({ ok: true, items });
    },

    /* Konto sperren/entsperren (Login-Zugriff). Recht manage_users.
       Schutz: nicht das eigene Konto, nicht den letzten aktiven Administrator. */
    "POST /api/users/status": async (body) => {
      const user = currentUser();
      if (!hasPerm(user, "manage_users")) return json({ ok: false, message: "Keine Berechtigung." }, user ? 403 : 401);
      if (typeof body.active !== "boolean") return json({ ok: false, message: "Bitte Status angeben.", errors: { active: "Boolescher Wert erwartet." } }, 422);
      const users = getUsers();
      const idx = users.findIndex((u) => u.id === body.userId);
      if (idx === -1) return json({ ok: false, message: "Benutzer nicht gefunden." }, 404);
      if (body.active === false) {
        if (users[idx].id === user.id) return json({ ok: false, message: "Du kannst dein eigenes Konto nicht deaktivieren." }, 409);
        if ((users[idx].roles || []).includes("admin")) {
          const otherActiveAdmins = users.filter((u, i) => i !== idx && (u.roles || []).includes("admin") && u.active !== false).length;
          if (otherActiveAdmins === 0) return json({ ok: false, message: "Es muss mindestens ein aktiver Administrator bestehen bleiben." }, 409);
        }
      }
      users[idx].active = body.active;
      setUsers(users);
      return json({ ok: true, user: { id: users[idx].id, name: users[idx].name, email: users[idx].email, active: users[idx].active }, message: body.active ? "Konto aktiviert." : "Konto deaktiviert." });
    },

    /* Benutzer (Login-Konto) löschen. Recht manage_users. Schutz: nicht das
       eigene Konto, nicht den letzten Administrator, nicht bei offenen
       Mitgliedschaften (diese zuerst entfernen). Vereinsämter werden mitgelöscht. */
    "POST /api/users/delete": async (body) => {
      const user = currentUser();
      if (!hasPerm(user, "manage_users")) return json({ ok: false, message: "Keine Berechtigung." }, user ? 403 : 401);
      const users = getUsers();
      const idx = users.findIndex((u) => u.id === body.userId);
      if (idx === -1) return json({ ok: false, message: "Benutzer nicht gefunden." }, 404);
      if (users[idx].id === user.id) return json({ ok: false, message: "Du kannst dein eigenes Konto nicht löschen." }, 409);
      if ((users[idx].roles || []).includes("admin")) {
        const otherAdmins = users.filter((u, i) => i !== idx && (u.roles || []).includes("admin")).length;
        if (otherAdmins === 0) return json({ ok: false, message: "Es muss mindestens ein Administrator bestehen bleiben." }, 409);
      }
      const memberships = getStore(KEYS.memberships, []);
      const owned = memberships.filter((m) => m.userId === users[idx].id).length;
      if (owned > 0) return json({ ok: false, message: "Dieser Benutzer hat noch " + owned + " Mitgliedschaft(en). Bitte diese zuerst entfernen." }, 409);
      const removed = users.splice(idx, 1)[0];
      setUsers(users);
      setPositions(getPositions().filter((p) => p.userId !== removed.id));
      return json({ ok: true, message: "Benutzer gelöscht." });
    },

    "POST /api/users/roles": async (body) => {
      const user = currentUser();
      if (!hasPerm(user, "manage_users")) return json({ ok: false, message: "Keine Berechtigung." }, user ? 403 : 401);
      const users = getUsers();
      const idx = users.findIndex((u) => u.id === body.userId);
      if (idx === -1) return json({ ok: false, message: "Benutzer nicht gefunden." }, 404);
      const validIds = getRoles().map((r) => r.id);
      const newRoles = (body.roles || []).filter((r) => validIds.includes(r));
      // Schutz: mindestens ein Administrator muss bestehen bleiben
      const removingAdmin = (users[idx].roles || []).includes("admin") && !newRoles.includes("admin");
      if (removingAdmin) {
        const otherAdmins = users.filter((u, i) => i !== idx && (u.roles || []).includes("admin")).length;
        if (otherAdmins === 0) return json({ ok: false, message: "Es muss mindestens ein Administrator bestehen bleiben." }, 409);
      }
      users[idx].roles = newRoles.length ? newRoles : ["member"];
      setUsers(users);
      return json({ ok: true, user: { id: users[idx].id, name: users[idx].name, email: users[idx].email, roles: users[idx].roles }, message: "Rollen aktualisiert." });
    },

    /* ---------- Konto: Adresse & IBAN ---------- */
    "POST /api/account/update": async (body) => {
      const user = currentUser();
      if (!user) return json({ ok: false, message: "Nicht angemeldet." }, 401);
      const errors = {};
      const patch = {};
      if (body.address) {
        const a = body.address;
        if (norm(a.street).length < 3) errors.street = "Bitte Straße & Hausnummer angeben.";
        if (!/^\d{4,5}$/.test(norm(a.zip))) errors.zip = "Bitte gültige PLZ angeben.";
        if (norm(a.city).length < 2) errors.city = "Bitte Ort angeben.";
        if (!errors.street && !errors.zip && !errors.city) {
          patch.address = { street: norm(a.street), zip: norm(a.zip), city: norm(a.city) };
        }
      }
      if (body.iban !== undefined) {
        if (!isIban(body.iban)) errors.iban = "Bitte gültige IBAN angeben.";
        else patch.iban = fmtIban(body.iban);
      }
      if (body.photo !== undefined) {
        if (body.photo === "") patch.photo = "";
        else if (isPhoto(body.photo)) patch.photo = body.photo;
        else errors.photo = "Bitte ein gültiges Bild hochladen.";
      }
      if (Object.keys(errors).length) return json({ ok: false, message: "Bitte Eingaben prüfen.", errors }, 422);
      const users = getUsers();
      const idx = users.findIndex((u) => u.id === user.id);
      users[idx] = { ...users[idx], ...patch };
      setUsers(users);
      return json({ ok: true, user: publicUser(users[idx]), message: "Daten gespeichert." });
    },

    /* ---------- Mitgliedschaften ---------- */
    "GET /api/memberships": async () => {
      const user = currentUser();
      if (!user) return json({ ok: false, message: "Nicht angemeldet." }, 401);
      const stored = getStore(KEYS.memberships, []).filter((m) => m.userId === user.id);
      const cfg = await loadData("membership-types.json");
      const acfg = await loadData("age-classes.json");
      const items = stored.map((m) => ({ ...m, competitionClasses: classesForAge(ageInYear(m.birthdate), m.gender, acfg) }));
      const active = items.filter((m) => m.status === "aktiv");
      return json({ ok: true, items, summary: billingSummary(active, cfg.familyFlatMonthly) });
    },

    "POST /api/memberships": async (body) => {
      const user = currentUser();
      if (!user) return json({ ok: false, message: "Nicht angemeldet." }, 401);

      // Voraussetzung Haushalt: eine Anschrift + eine Bankverbindung am Konto
      if (!user.address || !user.iban) {
        return json({ ok: false, code: "ACCOUNT_INCOMPLETE", message: "Bitte zuerst Anschrift und Kontoverbindung im Konto hinterlegen – darunter werden alle Mitglieder deines Haushalts angemeldet." }, 409);
      }

      const cfg = await loadData("membership-types.json");
      const errors = {};
      const { age } = memberProfile(body, errors);
      if (Object.keys(errors).length) return json({ ok: false, message: "Bitte Eingaben prüfen.", errors }, 422);

      const all = getStore(KEYS.memberships, []);
      // Beitrag/Klasse automatisch aus dem Alter ableiten
      const band = bandForAge(age, cfg.ageBands) || cfg.ageBands[cfg.ageBands.length - 1];
      const wcfg = await loadData("weight-classes.json");
      const allowedWeights = weightClassesFor(ageInYear(body.birthdate), fromList(GENDERS, body.gender), wcfg);
      const membership = {
        id: genId("mem"), userId: user.id,
        ...memberFields(body, allowedWeights),
        ageCategory: band.id, categoryLabel: band.label, individualFee: band.feeMonthly,
        passNumber: nextPassNumber(),
        status: "aktiv", startedAt: new Date().toISOString(),
      };
      all.push(membership); setStore(KEYS.memberships, all);
      return json({ ok: true, membership, message: "Mitgliedschaft für " + membership.firstName + " wurde angelegt." }, 201);
    },

    "POST /api/memberships/update": async (body) => {
      const user = currentUser();
      if (!user) return json({ ok: false, message: "Nicht angemeldet." }, 401);
      const all = getStore(KEYS.memberships, []);
      const idx = all.findIndex((m) => m.id === body.id && m.userId === user.id);
      if (idx === -1) return json({ ok: false, message: "Mitgliedschaft nicht gefunden." }, 404);

      const cfg = await loadData("membership-types.json");
      const errors = {};
      const { age } = memberProfile(body, errors);
      if (Object.keys(errors).length) return json({ ok: false, message: "Bitte Eingaben prüfen.", errors }, 422);

      const band = bandForAge(age, cfg.ageBands) || cfg.ageBands[cfg.ageBands.length - 1];
      const wcfg = await loadData("weight-classes.json");
      const allowedWeights = weightClassesFor(ageInYear(body.birthdate), fromList(GENDERS, body.gender), wcfg);
      all[idx] = {
        ...all[idx],
        ...memberFields(body, allowedWeights),
        ageCategory: band.id, categoryLabel: band.label, individualFee: band.feeMonthly,
      };
      setStore(KEYS.memberships, all);
      return json({ ok: true, membership: all[idx], message: "Mitglied gespeichert." });
    },

    "POST /api/memberships/cancel": async (body) => {
      const user = currentUser();
      if (!user) return json({ ok: false, message: "Nicht angemeldet." }, 401);
      const list = getStore(KEYS.memberships, []);
      const idx = list.findIndex((m) => m.id === body.id && m.userId === user.id);
      if (idx === -1) return json({ ok: false, message: "Mitgliedschaft nicht gefunden." }, 404);
      list[idx].status = "gekündigt";
      list[idx].cancelledAt = new Date().toISOString();
      setStore(KEYS.memberships, list);
      return json({ ok: true, membership: list[idx], message: "Mitgliedschaft gekündigt." });
    },

    /* ---------- Turniere & Meisterschaften: Anmeldung ---------- */
    "GET /api/tournaments": async () => {
      const user = currentUser();
      if (!user) return json({ ok: false, message: "Nicht angemeldet." }, 401);
      const acfg = await loadData("age-classes.json");
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const events = (await ensureEvents())
        .filter((e) => TOURNAMENT_TYPES.includes(e.type) && new Date(e.date) >= today)
        .sort((a, b) => new Date(a.date) - new Date(b.date));
      const myMembers = getStore(KEYS.memberships, []).filter((m) => m.userId === user.id && m.status === "aktiv");
      const regs = getStore(KEYS.registrations, []);
      const items = events.map((e) => {
        const open = !e.ageClasses || e.ageClasses.length === 0;
        const eligibleMembers = myMembers
          .map((m) => ({ m, classes: classesForAge(ageInYear(m.birthdate), m.gender, acfg) }))
          .filter((x) => open || overlaps(x.classes, e.ageClasses))
          .map((x) => ({
            membershipId: x.m.id, name: x.m.firstName + " " + x.m.lastName, competitionClasses: x.classes,
            registered: regs.some((r) => r.eventId === e.id && r.membershipId === x.m.id),
          }));
        return { ...e, eligibleMembers };
      });
      return json({ ok: true, items });
    },

    "POST /api/tournaments/register": async (body) => {
      const user = currentUser();
      if (!user) return json({ ok: false, message: "Nicht angemeldet." }, 401);
      const events = await ensureEvents();
      const ev = events.find((e) => e.id === body.eventId && TOURNAMENT_TYPES.includes(e.type));
      if (!ev) return json({ ok: false, message: "Turnier nicht gefunden." }, 404);
      const m = getStore(KEYS.memberships, []).find((x) => x.id === body.membershipId && x.userId === user.id);
      if (!m) return json({ ok: false, message: "Mitglied nicht gefunden." }, 404);
      const acfg = await loadData("age-classes.json");
      const classes = classesForAge(ageInYear(m.birthdate), m.gender, acfg);
      const open = !ev.ageClasses || ev.ageClasses.length === 0;
      if (!open && !overlaps(classes, ev.ageClasses)) return json({ ok: false, message: "Dieses Mitglied passt nicht in die Altersklassen dieses Turniers." }, 422);
      const regs = getStore(KEYS.registrations, []);
      if (regs.some((r) => r.eventId === ev.id && r.membershipId === m.id)) return json({ ok: false, message: "Bereits angemeldet." }, 409);
      const reg = { id: genId("reg"), eventId: ev.id, membershipId: m.id, userId: user.id, registeredAt: new Date().toISOString() };
      regs.push(reg); setStore(KEYS.registrations, regs);
      return json({ ok: true, registration: reg, message: m.firstName + " wurde angemeldet." }, 201);
    },

    "POST /api/tournaments/unregister": async (body) => {
      const user = currentUser();
      if (!user) return json({ ok: false, message: "Nicht angemeldet." }, 401);
      const regs = getStore(KEYS.registrations, []);
      const exists = regs.some((r) => r.eventId === body.eventId && r.membershipId === body.membershipId && r.userId === user.id);
      if (!exists) return json({ ok: false, message: "Anmeldung nicht gefunden." }, 404);
      setStore(KEYS.registrations, regs.filter((r) => !(r.eventId === body.eventId && r.membershipId === body.membershipId && r.userId === user.id)));
      return json({ ok: true, message: "Abgemeldet." });
    },

    "GET /api/admin/registrations": async () => {
      const user = currentUser();
      const canView = hasPerm(user, "manage_events") || hasPerm(user, "manage_payouts");
      if (!canView) return json({ ok: false, message: "Keine Berechtigung." }, user ? 403 : 401);
      const acfg = await loadData("age-classes.json");
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const events = (await ensureEvents())
        .filter((e) => TOURNAMENT_TYPES.includes(e.type) && new Date(e.date) >= today)
        .sort((a, b) => new Date(a.date) - new Date(b.date));
      const members = getStore(KEYS.memberships, []);
      const usersById = {}; getUsers().forEach((u) => { usersById[u.id] = u; });
      const regs = getStore(KEYS.registrations, []);
      const payouts = getStore(KEYS.payouts, []);
      const items = events.map((e) => {
        const registrations = regs.filter((r) => r.eventId === e.id).map((r) => {
          const m = members.find((x) => x.id === r.membershipId) || {};
          const owner = usersById[r.userId] || {};
          return {
            membershipId: r.membershipId, firstName: m.firstName || "—", lastName: m.lastName || "",
            competitionClasses: classesForAge(ageInYear(m.birthdate), m.gender, acfg),
            ownerName: owner.name || "—", ownerEmail: owner.email || "—", registeredAt: r.registeredAt,
          };
        });
        const fee = e.fee || 0, ownShare = Math.min(fee, e.ownShare || 0), count = registrations.length;
        return {
          id: e.id, title: e.title, date: e.date, type: e.type, ageClasses: e.ageClasses || [],
          fee, ownShare, count,
          payTotal: fee * count, ownTotal: ownShare * count, clubTotal: (fee - ownShare) * count,
          organizerName: e.organizerName || "", organizerIban: e.organizerIban || "",
          payout: payouts.find((p) => p.eventId === e.id) || null,
          registrations,
        };
      });
      return json({ ok: true, items });
    },

    /* ---------- Auszahlungen (Teilnahmegebühren an Veranstalter) ---------- */
    "GET /api/payouts": async () => {
      const user = currentUser();
      if (!hasPerm(user, "manage_payouts")) return json({ ok: false, message: "Keine Berechtigung." }, user ? 403 : 401);
      const events = await ensureEvents();
      const byId = {}; events.forEach((e) => { byId[e.id] = e; });
      const items = getStore(KEYS.payouts, [])
        .map((p) => ({ ...p, eventTitle: (byId[p.eventId] || {}).title || "—", eventDate: (byId[p.eventId] || {}).date || "" }))
        .sort((a, b) => new Date(b.initiatedAt) - new Date(a.initiatedAt));
      return json({ ok: true, items });
    },
    "POST /api/payouts": async (body) => {
      const user = currentUser();
      if (!hasPerm(user, "manage_payouts")) return json({ ok: false, message: "Keine Berechtigung." }, user ? 403 : 401);
      const events = await ensureEvents();
      const ev = events.find((e) => e.id === body.eventId && TOURNAMENT_TYPES.includes(e.type));
      if (!ev) return json({ ok: false, message: "Turnier nicht gefunden." }, 404);
      if (!ev.organizerIban || !isIban(ev.organizerIban)) return json({ ok: false, message: "Keine gültige Veranstalter-IBAN am Termin hinterlegt." }, 422);
      const count = getStore(KEYS.registrations, []).filter((r) => r.eventId === ev.id).length;
      if (count < 1) return json({ ok: false, message: "Keine Anmeldungen vorhanden." }, 422);
      const payouts = getStore(KEYS.payouts, []);
      if (payouts.some((p) => p.eventId === ev.id)) return json({ ok: false, message: "Für dieses Turnier wurde bereits eine Überweisung veranlasst." }, 409);
      const fee = ev.fee || 0;
      const payout = {
        id: genId("pay"), eventId: ev.id, organizerName: ev.organizerName || "", organizerIban: ev.organizerIban,
        feePerHead: fee, count, amount: fee * count, reference: norm(body.reference),
        initiatedByUserId: user.id, initiatedByName: user.name, initiatedAt: new Date().toISOString(),
        status: "veranlasst",
      };
      payouts.push(payout); setStore(KEYS.payouts, payouts);
      return json({ ok: true, payout, message: "Überweisung über " + (fee * count) + " € an " + (ev.organizerName || "den Veranstalter") + " veranlasst." }, 201);
    },
    "POST /api/payouts/cancel": async (body) => {
      const user = currentUser();
      if (!hasPerm(user, "manage_payouts")) return json({ ok: false, message: "Keine Berechtigung." }, user ? 403 : 401);
      const payouts = getStore(KEYS.payouts, []);
      if (!payouts.some((p) => p.id === body.id)) return json({ ok: false, message: "Auszahlung nicht gefunden." }, 404);
      setStore(KEYS.payouts, payouts.filter((p) => p.id !== body.id));
      return json({ ok: true, message: "Überweisung storniert." });
    },
  };

  /* ----- Modus-Auflösung (Mock vs. echtes Backend) ----- */
  function apiCfg() {
    const c = (window.BSG_API && typeof window.BSG_API === "object") ? window.BSG_API : null;
    return { mode: (c && c.mode) || "mock", base: (c && c.base) || "", live: (c && Array.isArray(c.live)) ? c.live : [] };
  }
  function routeIsLive(cfg, key, path) {
    if (cfg.mode === "real") return true;
    if (cfg.mode !== "hybrid") return false;
    return (cfg.live || []).some((p) => {
      if (typeof p !== "string" || !p) return false;
      if (p.indexOf(" ") > -1) return key === p || key.indexOf(p) === 0;   // "GET /api/news" (exakt/Präfix)
      const pre = p.replace(/\*$/, "");
      return path === pre || path.indexOf(pre) === 0;                       // "/api/team" (Pfad-Präfix)
    });
  }

  /* ----- fetch abfangen: je Route Mock ODER echtes Backend ----- */
  window.fetch = async function (input, init = {}) {
    const url = typeof input === "string" ? input : input.url;
    const method = (init.method || (typeof input === "object" && input.method) || "GET").toUpperCase();

    let path, search = "";
    try { const u = new URL(url, window.location.origin); path = u.pathname; search = u.search; }
    catch (e) { path = url; }

    if (!path.startsWith("/api/")) return realFetch(input, init);

    const cfg = apiCfg();
    // Echtes Backend (real / passende hybrid-Route): unverändert weiterreichen.
    if (routeIsLive(cfg, method + " " + path, path)) {
      const target = (cfg.base || "") + path + search;
      const fwd = Object.assign({}, init, { credentials: init.credentials || "include" });
      return realFetch(target, fwd);
    }

    // Mock-Pfad (Default): lokale Route-Handler mit simulierter Latenz.
    await ensureDemo();
    const handler = routes[method + " " + path];
    await wait(rnd(LATENCY));
    if (!handler) return json({ ok: false, message: "Endpoint nicht gefunden (Mock)." }, 404);

    let body = {};
    if (init.body) { try { body = JSON.parse(init.body); } catch (e) { body = {}; } }

    try { return await handler(body); }
    catch (err) { return json({ ok: false, message: "Mock-Serverfehler: " + err.message }, 500); }
  };

  /* ----- Laufzeit-Schalter (Konsole/Dev): BSGApi.setMode('real'|'hybrid'|'mock') ----- */
  window.BSGApi = {
    getMode: () => apiCfg().mode,
    getConfig: () => apiCfg(),
    setMode(m) {
      if (["mock", "real", "hybrid"].indexOf(m) === -1) return apiCfg().mode;
      try { localStorage.setItem("bsg_api_mode", m); } catch (e) {}
      window.BSG_API = Object.assign(apiCfg(), { mode: m });
      return m;
    },
    setBase(b) { try { localStorage.setItem("bsg_api_base", String(b)); } catch (e) {} window.BSG_API = Object.assign(apiCfg(), { base: String(b) }); },
    setLive(arr) {
      const v = Array.isArray(arr) ? arr : [];
      try { localStorage.setItem("bsg_api_live", JSON.stringify(v)); } catch (e) {}
      window.BSG_API = Object.assign(apiCfg(), { live: v });
    },
    isLive: (methodPath) => routeIsLive(apiCfg(), methodPath, methodPath.split(" ").pop() || methodPath),
  };

  const _mode = apiCfg().mode;
  console.info(
    "%c BSG API: " + _mode + " ",
    "background:" + (_mode === "real" ? "#1f7a5a" : _mode === "hybrid" ? "#b8860b" : "#e3141b") + ";color:#fff;border-radius:4px;padding:2px 6px",
    _mode === "mock"
      ? "– /api/* wird lokal simuliert (kein echtes Backend)."
      : _mode === "real"
        ? "– /api/* geht an das echte Backend (" + (apiCfg().base || "same-origin") + ")."
        : "– hybrid: ausgewählte Routen ans Backend, Rest Mock. BSGApi.setMode('mock') zum Zurückschalten."
  );
})();
