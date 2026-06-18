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
  };

  /* Berechtigungs-Katalog (vom Admin auf Rollen verteilbar) */
  const PERMISSIONS = [
    { key: "manage_roles", label: "Rollen & Berechtigungen verwalten" },
    { key: "manage_users", label: "Benutzer & Rollenzuweisung verwalten" },
    { key: "manage_news", label: "Newsmeldungen schreiben & bearbeiten" },
    { key: "manage_events", label: "Termine pflegen" },
    { key: "manage_memberships", label: "Mitgliedschaften aller Nutzer verwalten" },
    { key: "view_members", label: "Mitgliederliste einsehen (lesend)" },
    { key: "view_finance", label: "Kontoverbindungen (IBAN) & Beiträge einsehen (lesend)" },
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
  const EVENT_TYPES = ["Training", "Turnier", "Prüfung", "Event"];
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
    { id: "vorstand", label: "Vorstand", permissions: ["manage_users", "manage_news", "manage_events", "manage_memberships", "view_members", "view_finance"], system: false },
    { id: "pressewart", label: "Pressewart", permissions: ["manage_news"], system: false },
    { id: "kassenwart", label: "Kassenwart", permissions: ["view_members", "view_finance"], system: false },
    { id: "trainer", label: "Trainer", permissions: ["view_members"], system: false },
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
      const item = { id: genId("news"), date: norm(body.date), tag: norm(body.tag) || "Verein", title: norm(body.title), excerpt: norm(body.excerpt), body: norm(body.body) };
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
      items[idx] = { ...items[idx], date: norm(body.date), tag: norm(body.tag) || "Verein", title: norm(body.title), excerpt: norm(body.excerpt), body: norm(body.body) };
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

    "GET /api/events": async () => {
      const events = (await ensureEvents()).slice().sort((a, b) => new Date(a.date) - new Date(b.date));
      return json({ ok: true, items: events });
    },
    "POST /api/events": async (body) => {
      const user = currentUser();
      if (!hasPerm(user, "manage_events")) return json({ ok: false, message: "Keine Berechtigung." }, user ? 403 : 401);
      const errors = eventErrors(body);
      if (Object.keys(errors).length) return json({ ok: false, message: "Bitte Eingaben prüfen.", errors }, 422);
      const items = await ensureEvents();
      const item = { id: genId("ev"), date: norm(body.date), time: norm(body.time), type: EVENT_TYPES.includes(body.type) ? body.type : "Event", title: norm(body.title), location: norm(body.location) };
      items.push(item); setStore(KEYS.events, items);
      return json({ ok: true, item, message: "Termin angelegt." }, 201);
    },
    "POST /api/events/update": async (body) => {
      const user = currentUser();
      if (!hasPerm(user, "manage_events")) return json({ ok: false, message: "Keine Berechtigung." }, user ? 403 : 401);
      const errors = eventErrors(body);
      if (Object.keys(errors).length) return json({ ok: false, message: "Bitte Eingaben prüfen.", errors }, 422);
      const items = await ensureEvents();
      const idx = items.findIndex((ev) => ev.id === body.id);
      if (idx === -1) return json({ ok: false, message: "Termin nicht gefunden." }, 404);
      items[idx] = { ...items[idx], date: norm(body.date), time: norm(body.time), type: EVENT_TYPES.includes(body.type) ? body.type : "Event", title: norm(body.title), location: norm(body.location) };
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
      const users = getUsers();
      const byId = {}; users.forEach((u) => { byId[u.id] = u; });
      const memberships = getStore(KEYS.memberships, []);
      const items = memberships.map((m) => {
        const owner = byId[m.userId] || {};
        const row = {
          id: m.id, firstName: m.firstName, lastName: m.lastName,
          categoryLabel: m.categoryLabel || "", individualFee: m.individualFee || 0,
          status: m.status, startedAt: m.startedAt,
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
      const items = getStore(KEYS.memberships, []).filter((m) => m.userId === user.id);
      const cfg = await loadData("membership-types.json");
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
      if (norm(body.firstName).length < 2) errors.firstName = "Bitte Vornamen angeben.";
      if (norm(body.lastName).length < 2) errors.lastName = "Bitte Nachnamen angeben.";
      const age = ageFromBirthdate(body.birthdate);
      if (age === null) errors.birthdate = "Bitte gültiges Geburtsdatum angeben.";
      else if (new Date(body.birthdate) > new Date()) errors.birthdate = "Geburtsdatum darf nicht in der Zukunft liegen.";
      if (Object.keys(errors).length) return json({ ok: false, message: "Bitte Eingaben prüfen.", errors }, 422);

      const all = getStore(KEYS.memberships, []);
      // Beitrag/Klasse automatisch aus dem Alter ableiten
      const band = bandForAge(age, cfg.ageBands) || cfg.ageBands[cfg.ageBands.length - 1];
      const membership = {
        id: genId("mem"), userId: user.id,
        firstName: norm(body.firstName), lastName: norm(body.lastName), birthdate: norm(body.birthdate),
        ageCategory: band.id, categoryLabel: band.label, individualFee: band.feeMonthly,
        status: "aktiv", startedAt: new Date().toISOString(),
      };
      all.push(membership); setStore(KEYS.memberships, all);
      return json({ ok: true, membership, message: "Mitgliedschaft für " + membership.firstName + " wurde angelegt." }, 201);
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
