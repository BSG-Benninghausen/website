/* =====================================================================
   MOCK-SERVER  ·  BSG Benninghausen
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
    team: "bsg_team",
    site: "bsg_site",
    payouts: "bsg_payouts",
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
    { key: "manage_team", label: "Team & Vorstand bearbeiten" },
    { key: "manage_site", label: "Startseiten-Texte bearbeiten" },
    { key: "manage_memberships", label: "Mitgliedschaften aller Nutzer verwalten" },
    { key: "view_members", label: "Mitgliederliste einsehen (lesend)" },
    { key: "view_finance", label: "Kontoverbindungen (IBAN) & Beiträge einsehen (lesend)" },
    { key: "manage_payouts", label: "Teilnahmegebühren überweisen (Auszahlungen)" },
  ];
  const ALL_PERMS = PERMISSIONS.map((p) => p.key);
  const ADMIN_EMAIL = "admin@bsg-benninghausen.de";

  const realFetch = window.fetch.bind(window);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const rnd = ([a, b]) => Math.round(a + Math.random() * (b - a));

  function json(body, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  /* ----- generische Storage-Helfer ----- */
  function getStore(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch (e) { return fallback; }
  }
  function setStore(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* ignore */ }
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
  const TEAM_GROUPS = ["vorstand", "trainer"];
  function teamErrors(b) {
    const e = {};
    if (norm(b.name).length < 2) e.name = "Bitte einen Namen angeben.";
    if (!norm(b.role)) e.role = "Bitte eine Funktion/Rolle angeben.";
    if (!TEAM_GROUPS.includes(b.group)) e.group = "Bitte eine gültige Gruppe wählen.";
    return e;
  }
  const teamFields = (b) => ({
    group: TEAM_GROUPS.includes(b.group) ? b.group : "vorstand",
    name: norm(b.name), role: norm(b.role), description: norm(b.description),
  });

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

  /* ----- Judopass-Felder: Foto, Passnummer, Profilfelder ----- */
  const isPhoto = (v) => typeof v === "string" && /^data:image\/(png|jpe?g|webp|gif);base64,/.test(v) && v.length <= 700000;
  function nextPassNumber() {
    const n = (getStore(KEYS.passCounter, 0) || 0) + 1;
    setStore(KEYS.passCounter, n);
    return "BSG-" + String(n).padStart(4, "0");
  }
  const fromList = (list, v) => (list.includes(v) ? v : "");
  // gemeinsame Validierung & Übernahme der editierbaren Profilfelder
  function memberProfile(body, errors) {
    if (norm(body.firstName).length < 2) errors.firstName = "Bitte Vornamen angeben.";
    if (norm(body.lastName).length < 2) errors.lastName = "Bitte Nachnamen angeben.";
    const age = ageFromBirthdate(body.birthdate);
    if (age === null) errors.birthdate = "Bitte gültiges Geburtsdatum angeben.";
    else if (new Date(body.birthdate) > new Date()) errors.birthdate = "Geburtsdatum darf nicht in der Zukunft liegen.";
    if (!isPhoto(body.photo)) errors.photo = "Bitte ein Foto hochladen (Pflicht für den Judopass).";
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
    return { id: u.id, name: u.name, email: u.email, address: u.address || null, iban: u.iban || null, roles: u.roles || ["member"], createdAt: u.createdAt };
  }
  const getSession = () => getStore(KEYS.session, null);
  const setSession = (userId) => setStore(KEYS.session, { token: genId("tok"), userId });
  const clearSession = () => { try { localStorage.removeItem(KEYS.session); } catch (e) {} };
  function currentUser() {
    const s = getSession();
    return s ? getUserById(s.userId) : null;
  }

  /* ----- Rollen & Berechtigungen ----- */
  const getRoles = () => getStore(KEYS.roles, []);
  const setRoles = (r) => setStore(KEYS.roles, r);
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

  /* Seed: Standardrollen + Admin-Konto (idempotent) */
  const EXAMPLE_ROLES = [
    { id: "vorstand", label: "Vorstand", permissions: ["manage_users", "manage_news", "manage_events", "manage_training", "manage_team", "manage_site", "manage_memberships", "view_members", "view_finance", "manage_payouts"], system: false },
    { id: "pressewart", label: "Pressewart", permissions: ["manage_news", "manage_site"], system: false },
    { id: "kassenwart", label: "Kassenwart", permissions: ["view_members", "view_finance", "manage_payouts"], system: false },
    { id: "trainer", label: "Trainer", permissions: ["manage_training", "view_members"], system: false },
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
      grant("vorstand", ["manage_training", "manage_team", "manage_site"]);
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

  /* Dynamischer Content: beim ersten Zugriff aus JSON in den Store übernehmen */
  async function ensureNews() {
    let items = getStore(KEYS.news, null);
    if (!items) { items = await loadData("news.json"); setStore(KEYS.news, items); }
    return items;
  }
  async function ensureEvents() {
    let items = getStore(KEYS.events, null);
    if (!items) { items = await loadData("events.json"); setStore(KEYS.events, items); }
    return items;
  }
  async function ensureTraining() {
    let items = getStore(KEYS.training, null);
    if (!items) { items = await loadData("trainingszeiten.json"); setStore(KEYS.training, items); }
    return items;
  }
  async function ensureTeam() {
    let items = getStore(KEYS.team, null);
    if (!items) { items = await loadData("team.json"); setStore(KEYS.team, items); }
    return items;
  }
  async function ensureSite() {
    let values = getStore(KEYS.site, null);
    if (!values) { values = await loadData("site.json"); setStore(KEYS.site, values); }
    return values;
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

    /* ---------- Team & Vorstand ---------- */
    "GET /api/team": async () => {
      return json({ ok: true, items: await ensureTeam() });
    },
    "POST /api/team": async (body) => {
      const user = currentUser();
      if (!hasPerm(user, "manage_team")) return json({ ok: false, message: "Keine Berechtigung." }, user ? 403 : 401);
      const errors = teamErrors(body);
      if (Object.keys(errors).length) return json({ ok: false, message: "Bitte Eingaben prüfen.", errors }, 422);
      const items = await ensureTeam();
      const item = { id: genId("team"), ...teamFields(body) };
      items.push(item); setStore(KEYS.team, items);
      return json({ ok: true, item, message: "Eintrag angelegt." }, 201);
    },
    "POST /api/team/update": async (body) => {
      const user = currentUser();
      if (!hasPerm(user, "manage_team")) return json({ ok: false, message: "Keine Berechtigung." }, user ? 403 : 401);
      const errors = teamErrors(body);
      if (Object.keys(errors).length) return json({ ok: false, message: "Bitte Eingaben prüfen.", errors }, 422);
      const items = await ensureTeam();
      const idx = items.findIndex((t) => t.id === body.id);
      if (idx === -1) return json({ ok: false, message: "Eintrag nicht gefunden." }, 404);
      items[idx] = { ...items[idx], ...teamFields(body) };
      setStore(KEYS.team, items);
      return json({ ok: true, item: items[idx], message: "Eintrag gespeichert." });
    },
    "POST /api/team/delete": async (body) => {
      const user = currentUser();
      if (!hasPerm(user, "manage_team")) return json({ ok: false, message: "Keine Berechtigung." }, user ? 403 : 401);
      const items = await ensureTeam();
      if (!items.some((t) => t.id === body.id)) return json({ ok: false, message: "Eintrag nicht gefunden." }, 404);
      setStore(KEYS.team, items.filter((t) => t.id !== body.id));
      return json({ ok: true, message: "Eintrag gelöscht." });
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
          ownerName: owner.name || "—", ownerEmail: owner.email || "—", address: owner.address || null,
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
      const items = getUsers().map((u) => ({ id: u.id, name: u.name, email: u.email, roles: u.roles || ["member"] }));
      return json({ ok: true, items });
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

  /* ----- fetch abfangen ----- */
  window.fetch = async function (input, init = {}) {
    const url = typeof input === "string" ? input : input.url;
    const method = (init.method || (typeof input === "object" && input.method) || "GET").toUpperCase();

    let path;
    try { path = new URL(url, window.location.origin).pathname; }
    catch (e) { path = url; }

    if (!path.startsWith("/api/")) return realFetch(input, init);

    const handler = routes[method + " " + path];
    await wait(rnd(LATENCY));
    if (!handler) return json({ ok: false, message: "Endpoint nicht gefunden (Mock)." }, 404);

    let body = {};
    if (init.body) { try { body = JSON.parse(init.body); } catch (e) { body = {}; } }

    try { return await handler(body); }
    catch (err) { return json({ ok: false, message: "Mock-Serverfehler: " + err.message }, 500); }
  };

  console.info(
    "%c BSG Mock-Server aktiv ",
    "background:#e3141b;color:#fff;border-radius:4px;padding:2px 6px",
    "– /api/* Anfragen werden lokal simuliert (kein echtes Backend)."
  );
})();
