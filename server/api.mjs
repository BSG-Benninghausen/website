/* =====================================================================
   api.mjs · BSG Benninghausen – ECHTES Backend (Domänenlogik)
   ---------------------------------------------------------------------
   Implementiert exakt denselben /api/*-Vertrag wie der In-Process-Mock
   (assets/js/mock-api.js). Die Contract-Test-Suite (tests/) validiert
   beide Seiten mit denselben Assertions – darum darf hier nichts an
   Pfaden, Status-Codes oder JSON-Shapes abweichen.

   Bewusst ohne Framework und ohne npm-Abhängigkeiten (nur node:-Builtins),
   passend zur „zero-dep"-Philosophie des Projekts. Die HTTP-/Cookie-/
   Static-Schicht liegt in index.mjs; hier steckt die reine Logik.

   `createApi({ dataDir })` lädt die Seed-/Config-JSONs, seedet Rollen +
   Admin und liefert `handle({ method, path, query, body, token })`.
   Sessions (Token → userId) werden im Prozess gehalten; die HTTP-Schicht
   transportiert das Token als `bsg_session`-Cookie.
   ===================================================================== */
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { loadSnapshot, saveSnapshot } from "./store.mjs";

/* ----- Kataloge & Konstanten (1:1 zum Mock) ----- */
const TOURNAMENT_TYPES = ["Turnier", "Meisterschaft"];
const EVENT_TYPES = ["Training", "Turnier", "Prüfung", "Event", "Meisterschaft"];
const BELTS = ["", "Weißgurt", "Weiß-Gelb", "Gelbgurt", "Gelb-Orange", "Orangegurt", "Orange-Grün", "Grüngurt", "Blaugurt", "Braungurt", "1. Dan (Schwarzgurt)", "2. Dan", "3. Dan", "4. Dan", "5. Dan"];
const GENDERS = ["", "männlich", "weiblich", "divers"];
const WEIGHT_CLASSES = ["", "-60 kg", "-66 kg", "-73 kg", "-81 kg", "-90 kg", "-100 kg", "+100 kg", "-48 kg", "-52 kg", "-57 kg", "-63 kg", "-70 kg", "-78 kg", "+78 kg"];
const NATIONALITIES = ["", "Deutsch", "Österreichisch", "Schweizerisch", "Französisch", "Italienisch", "Spanisch", "Niederländisch", "Polnisch", "Türkisch", "Russisch", "Ukrainisch", "Britisch", "US-amerikanisch", "Brasilianisch", "Japanisch", "Andere"];

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
];
const ALL_PERMS = PERMISSIONS.map((p) => p.key);
/* Seed-Admin-Adresse; per Env ADMIN_EMAIL (Deploy/Fork) überschreibbar.
   Default bleibt BSG, damit bestehende Deployments und Contract-Tests greifen. */
const ADMIN_EMAIL =
  (typeof process !== "undefined" && process.env && process.env.ADMIN_EMAIL) ||
  "admin@bsg-benninghausen.de";

/* Feature-Katalog (Reifegrad) – 1:1 zum Mock. Source of Truth „welche Features
   kennt das Backend". status: "stable" | "beta". Die Freigabe (wer sieht es)
   liegt orthogonal in db.featureFlags und wird per manage_features gesetzt. */
const FEATURES = [
  { key: "payouts", label: "Auszahlungen an Veranstalter", status: "stable" },
  { key: "tournaments", label: "Turnier-Anmeldung", status: "stable" },
  { key: "beitragsrechner", label: "Beitragsrechner", status: "beta" },
];
const FEATURE_KEYS = FEATURES.map((f) => f.key);
const FEATURE_DEFAULT_SCOPE = { payouts: "public", tournaments: "public", beitragsrechner: "off" };
// Default-Buchung (Provisionierung) – 1:1 zum Mock; standardmäßig gebucht.
const FEATURE_DEFAULT_BOOKED = { payouts: true, tournaments: true, beitragsrechner: true };
const normalizeScope = (release, validRoleIds) => {
  if (release === "public" || release === "off") return release;
  const arr = Array.isArray(release) ? release : (release && Array.isArray(release.roles) ? release.roles : null);
  if (arr) { const roles = arr.filter((r) => validRoleIds.includes(r)); return roles.length ? { roles } : "off"; }
  return null;
};

const TEAM_GROUPS = ["vorstand", "trainer"];
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

/* Vereinsdaten / Branding (White-Label-Config) – 1:1 zum Mock. Treibt Name,
   Sport, Adresse, Kontakt, Impressum & Logo (Frontend via [data-club="key"]). */
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

/* App-Manifest (PWA) aus der Club-Config – 1:1 zum Mock. server/index.mjs liefert
   /manifest.webmanifest darüber pro Domain aus. */
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

// Rollen sind reine Rechte-Objekte; die öffentliche Team-Anzeige läuft über Vereinsämter (positions).
const EXAMPLE_ROLES = [
  { id: "vorstand", label: "Vorstand", permissions: ["manage_users", "manage_news", "manage_events", "manage_training", "manage_site", "manage_team", "manage_memberships", "view_members", "view_finance", "manage_payouts"], system: false },
  { id: "pressewart", label: "Pressewart", permissions: ["manage_news", "manage_site"], system: false },
  { id: "kassenwart", label: "Kassenwart", permissions: ["view_members", "view_finance", "manage_payouts"], system: false },
  { id: "trainer", label: "Trainer", permissions: ["manage_training", "view_members"], system: false },
];
const BOARD_ROLES = [
  { id: "vorsitz1", label: "1. Vorsitzender", permissions: ["manage_users", "manage_news", "manage_events", "manage_team", "manage_memberships", "view_members", "view_finance", "manage_payouts"], system: false },
  { id: "vorsitz2", label: "2. Vorsitzender", permissions: ["manage_news", "manage_events", "view_members"], system: false },
];

/* ----- reine Helfer (1:1 zum Mock) ----- */
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || "").trim());
const norm = (v) => String(v || "").trim();
const lc = (v) => norm(v).toLowerCase();
const genId = (p) => p + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const genCode = () => String(Math.floor(100000 + Math.random() * 900000));
const num = (v) => { const n = parseFloat(String(v == null ? "" : v).replace(",", ".")); return isNaN(n) ? 0 : n; };
const fromList = (list, v) => (list.includes(v) ? v : "");
const teamGroupOf = (v) => (TEAM_GROUPS.includes(v) ? v : "");
const overlaps = (a, b) => Array.isArray(a) && Array.isArray(b) && a.some((x) => b.includes(x));

function isIban(v) {
  const s = String(v || "").replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;
  const re = s.slice(4) + s.slice(0, 4);
  const conv = re.replace(/[A-Z]/g, (c) => (c.charCodeAt(0) - 55).toString());
  let rem = 0;
  for (let i = 0; i < conv.length; i++) rem = (rem * 10 + (conv.charCodeAt(i) - 48)) % 97;
  return rem === 1;
}
const fmtIban = (v) => String(v || "").replace(/\s+/g, "").toUpperCase().replace(/(.{4})/g, "$1 ").trim();

const isPhoto = (v) => typeof v === "string" && /^data:image\/(png|jpe?g|webp|gif);base64,/.test(v) && v.length <= 700000;

function ageFromBirthdate(iso) {
  const b = new Date(iso);
  if (isNaN(b.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
}
function ageInYear(birthdate) {
  const y = new Date(birthdate).getFullYear();
  if (isNaN(y)) return null;
  return new Date().getFullYear() - y;
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
function weightClassesFor(j, gender, cfg) {
  if (j == null || !cfg) return [];
  const cat = (cfg.categories || []).find((c) => j >= c.minAge && j <= c.maxAge);
  if (!cat) return [];
  const male = cat.male || [], female = cat.female || [];
  if (gender === "männlich") return male.slice();
  if (gender === "weiblich") return female.slice();
  const out = male.slice();
  female.forEach((w) => { if (!out.includes(w)) out.push(w); });
  return out;
}

/* ----- Validierung Content ----- */
function eventMoney(body, errors) {
  const fee = Math.max(0, num(body.fee));
  const ownShare = Math.max(0, num(body.ownShare));
  if (ownShare > fee) errors.ownShare = "Eigenanteil darf die Gebühr nicht übersteigen.";
  return { fee, ownShare };
}
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

/* ===================================================================== */
export function createApi({ dataDir, dev = true, dataFile = "" }) {
  const loadJSON = (file) => JSON.parse(readFileSync(new URL(file, dataDir), "utf8"));
  // Persistenz ist opt-in: nur mit dataFile (Env BSG_DATA_FILE) wird `db` durabel.
  const persist = () => { if (dataFile) saveSnapshot(dataFile, db); };

  /* statische Config (anpassbare Vorlagen) */
  const ageCfg = loadJSON("age-classes.json");
  const weightCfg = loadJSON("weight-classes.json");
  const memTypes = loadJSON("membership-types.json");

  /* In-Memory-Store (ersetzt localStorage des Mocks); init() befüllt/leert ihn. */
  const db = {};
  const sessions = new Map(); // token -> userId

  /* ----- Benutzer / Rollen / Berechtigungen ----- */
  const findUserByEmail = (email) => db.users.find((u) => u.email === lc(email));
  const getUserById = (id) => db.users.find((u) => u.id === id);
  function publicUser(u) {
    if (!u) return null;
    return { id: u.id, name: u.name, email: u.email, address: u.address || null, iban: u.iban || null, photo: u.photo || "", roles: u.roles || ["member"], createdAt: u.createdAt };
  }
  function userPermissions(user) {
    if (!user) return [];
    const roleIds = user.roles || ["member"];
    if (roleIds.includes("admin")) return ALL_PERMS.slice();
    const set = new Set();
    roleIds.forEach((rid) => {
      const r = db.roles.find((x) => x.id === rid);
      if (r) (r.permissions || []).forEach((p) => set.add(p));
    });
    return [...set];
  }
  const isAdmin = (user) => !!user && (user.roles || []).includes("admin");
  const hasPerm = (user, perm) => isAdmin(user) || userPermissions(user).includes(perm);

  /* ----- Feature-Freigabe (Beta-Steuerung pro Gruppe), 1:1 zum Mock ----- */
  const scopeFor = (key) => (key in db.featureFlags ? db.featureFlags[key] : (FEATURE_DEFAULT_SCOPE[key] || "off"));
  const isBooked = (key) => (key in db.featureBookings ? !!db.featureBookings[key] : (FEATURE_DEFAULT_BOOKED[key] ?? true));
  function canSeeFeature(user, scope) {
    if (scope === "public") return true;
    if (hasPerm(user, "manage_features")) return true;
    if (scope === "off" || !scope) return false;
    if (scope.roles) return !!user && (user.roles || []).some((r) => scope.roles.includes(r));
    return false;
  }

  function nextPassNumber() {
    db.passCounter = (db.passCounter || 0) + 1;
    return "BSG-" + String(db.passCounter).padStart(4, "0");
  }

  /* ----- Seed: Rollen + Admin (idempotent, versioniert wie im Mock) ----- */
  function seed() {
    const roles = db.roles;
    if (!roles.some((r) => r.id === "admin")) roles.push({ id: "admin", label: "Administrator", permissions: ALL_PERMS.slice(), system: true });
    if (!roles.some((r) => r.id === "member")) roles.push({ id: "member", label: "Mitglied", permissions: [], system: true });

    const grant = (id, perms) => {
      const r = roles.find((x) => x.id === id);
      if (r) perms.forEach((p) => { if (!(r.permissions || (r.permissions = [])).includes(p)) r.permissions.push(p); });
    };
    if (db.seedVersion < 2) {
      EXAMPLE_ROLES.forEach((ex) => { if (!roles.some((r) => r.id === ex.id)) roles.push({ ...ex, permissions: ex.permissions.slice() }); });
      db.seedVersion = 2;
    }
    if (db.seedVersion < 3) {
      grant("vorstand", ["manage_training", "manage_site"]);
      grant("pressewart", ["manage_site"]);
      grant("trainer", ["manage_training"]);
      db.seedVersion = 3;
    }
    if (db.seedVersion < 4) {
      grant("vorstand", ["manage_payouts"]);
      grant("kassenwart", ["manage_payouts"]);
      db.seedVersion = 4;
    }
    if (db.seedVersion < 5) {
      const setTeam = (id, group, order) => { const r = roles.find((x) => x.id === id); if (r) { r.teamGroup = group; r.teamOrder = order; } };
      setTeam("trainer", "trainer", 0);
      setTeam("kassenwart", "vorstand", 30);
      BOARD_ROLES.forEach((ex) => { if (!roles.some((r) => r.id === ex.id)) roles.push({ ...ex, permissions: ex.permissions.slice() }); });
      roles.forEach((r) => { if (r.permissions) r.permissions = r.permissions.filter((p) => p !== "manage_team"); });
      db.seedVersion = 5;
    }
    // Migration v6: Berechtigungs-Rollen von der öffentlichen Team-Anzeige trennen (siehe Mock).
    // Team-markierte Rollen -> Vereinsämter (positions); Team-Felder von allen Rollen entfernen;
    // rein anzeigende Rollen ohne Rechte entfernen; manage_team vergeben.
    if (db.seedVersion < 6) {
      const positions = db.positions;
      const has = (uid, g, l, o) => positions.some((x) => x.userId === uid && x.group === g && x.label === l && Number(x.order) === Number(o));
      db.roles.forEach((r) => {
        if (!TEAM_GROUPS.includes(r.teamGroup)) return;
        const g = r.teamGroup, l = norm(r.teamLabel) || r.label, o = Number(r.teamOrder) || 0;
        db.users.forEach((u) => {
          if ((u.roles || []).includes(r.id) && !has(u.id, g, l, o)) positions.push({ id: genId("pos"), userId: u.id, group: g, label: l, order: o });
        });
      });
      db.roles.forEach((r) => { delete r.teamGroup; delete r.teamLabel; delete r.teamOrder; });
      const empty = db.roles.filter((r) => !r.system && (!r.permissions || r.permissions.length === 0)).map((r) => r.id);
      if (empty.length) {
        db.roles = db.roles.filter((r) => !empty.includes(r.id));
        db.users.forEach((u) => { if (u.roles) u.roles = u.roles.filter((id) => !empty.includes(id)); });
      }
      grant("vorstand", ["manage_team"]);
      grant("vorsitz1", ["manage_team"]);
      db.seedVersion = 6;
    }
    // Migration v7: Feature-/Beta-Freigabe-Recht an Vorstand & 1. Vorsitzenden.
    if (db.seedVersion < 7) {
      grant("vorstand", ["manage_features"]);
      grant("vorsitz1", ["manage_features"]);
      db.seedVersion = 7;
    }
    // Migration v8: Vereinsdaten-/Branding-Recht (White-Label) an Vorstand & 1. Vorsitzenden.
    if (db.seedVersion < 8) {
      grant("vorstand", ["manage_club"]);
      grant("vorsitz1", ["manage_club"]);
      db.seedVersion = 8;
    }
    // Migration v9: Provisionierungs-Recht (Funktionen buchen) an Vorstand & 1. Vorsitzenden.
    if (db.seedVersion < 9) {
      grant("vorstand", ["book_features"]);
      grant("vorsitz1", ["book_features"]);
      db.seedVersion = 9;
    }

    if (!db.users.some((u) => u.email === ADMIN_EMAIL)) {
      db.users.push({ id: "usr-admin", name: "Administrator", email: ADMIN_EMAIL, address: null, iban: null, roles: ["admin"], createdAt: new Date().toISOString() });
    }
  }

  /* Frischer Ausgangszustand: leerer Store + Seed + Inhalte aus den JSON-Dateien.
     Das ist im Real-Modus das Pendant zur frischen Mock-Sandbox je Test-Suite. */
  function init() {
    db.users = []; db.memberships = []; db.roles = [];
    db.news = loadJSON("news.json");
    db.events = loadJSON("events.json");
    db.training = loadJSON("trainingszeiten.json");
    db.site = loadJSON("site.json");
    db.club = loadJSON("club.json");
    db.registrations = []; db.payouts = []; db.codes = {}; db.passCounter = 0; db.seedVersion = 0;
    db.positions = [];
    db.featureFlags = {};
    db.featureBookings = {};
    sessions.clear();
    seed();
    seedDemo();
  }
  /* Beispiel-Stammdaten aus demo-data.json (gleiche Quelle wie der Mock). init()
     leert ohnehin, daher kein Idempotenz-Check nötig. Fehlt die Datei, wird übersprungen. */
  function seedDemo() {
    let demo;
    try { demo = loadJSON("demo-data.json"); } catch (e) { return; }
    (demo.users || []).forEach((u) => db.users.push(u));
    (demo.positions || []).forEach((p) => db.positions.push(p));
    (demo.memberships || []).forEach((m) => db.memberships.push(m));
    db.passCounter = Math.max(db.passCounter, demo.passCounter || 0);
  }
  /* Hochfahren: persistierten Snapshot laden (falls vorhanden) und idempotente
     Migrationen via seed() nachziehen; sonst frisch seeden. Danach einmalig
     persistieren, damit auch ein frisch geseedeter Mandant eine Datei bekommt. */
  function boot() {
    const snap = dataFile ? loadSnapshot(dataFile) : null;
    init(); // immer zuerst: garantiert die erwartete db-Struktur + Defaults
    if (snap) {
      // Persistierte Werte kontrolliert übernehmen: nur bereits bekannte db-Keys
      // (kein __proto__/constructor -> keine Prototype-Pollution). Fehlt ein Key im
      // Snapshot, behält er seinen init()-Default (Forward-Compat bei neuen Feldern).
      Object.keys(db).forEach((k) => { if (Object.prototype.hasOwnProperty.call(snap, k)) db[k] = snap[k]; });
      sessions.clear();
      seed(); // idempotente Migrationen (v2…v9) auf die übernommenen Daten nachziehen
    }
    persist();
  }
  boot();

  /* ----- Antwort-Helfer ----- */
  const J = (body, status = 200) => ({ status, body });
  const deny = (user) => J({ ok: false, message: "Keine Berechtigung." }, user ? 403 : 401);

  /* ===================================================================
     Route-Handler – Signatur (body, ctx). ctx: { currentUser, setSession,
     clearSession }. Pfade/Status/Shapes exakt wie der Mock.
     =================================================================== */
  const routes = {
    /* ---------- News ---------- */
    "GET /api/news": async () => {
      const news = db.news.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
      return J({ ok: true, items: news });
    },
    "POST /api/news": async (body, ctx) => {
      const user = ctx.currentUser();
      if (!hasPerm(user, "manage_news")) return deny(user);
      const errors = newsErrors(body);
      if (Object.keys(errors).length) return J({ ok: false, message: "Bitte Eingaben prüfen.", errors }, 422);
      const item = { id: genId("news"), date: norm(body.date), tag: norm(body.tag) || "Verein", title: norm(body.title), excerpt: norm(body.excerpt), body: norm(body.body), image: isPhoto(body.image) ? body.image : "" };
      db.news.push(item);
      return J({ ok: true, item, message: "Newsmeldung veröffentlicht." }, 201);
    },
    "POST /api/news/update": async (body, ctx) => {
      const user = ctx.currentUser();
      if (!hasPerm(user, "manage_news")) return deny(user);
      const errors = newsErrors(body);
      if (Object.keys(errors).length) return J({ ok: false, message: "Bitte Eingaben prüfen.", errors }, 422);
      const idx = db.news.findIndex((n) => n.id === body.id);
      if (idx === -1) return J({ ok: false, message: "Newsmeldung nicht gefunden." }, 404);
      const image = body.image === "" ? "" : (isPhoto(body.image) ? body.image : (db.news[idx].image || ""));
      db.news[idx] = { ...db.news[idx], date: norm(body.date), tag: norm(body.tag) || "Verein", title: norm(body.title), excerpt: norm(body.excerpt), body: norm(body.body), image };
      return J({ ok: true, item: db.news[idx], message: "Newsmeldung gespeichert." });
    },
    "POST /api/news/delete": async (body, ctx) => {
      const user = ctx.currentUser();
      if (!hasPerm(user, "manage_news")) return deny(user);
      if (!db.news.some((n) => n.id === body.id)) return J({ ok: false, message: "Newsmeldung nicht gefunden." }, 404);
      db.news = db.news.filter((n) => n.id !== body.id);
      return J({ ok: true, message: "Newsmeldung gelöscht." });
    },

    "GET /api/age-classes": async () => J({ ok: true, items: allAgeClassLabels(ageCfg) }),
    "GET /api/weight-classes": async () => J({ ok: true, categories: weightCfg.categories || [] }),

    /* ---------- Trainingszeiten ---------- */
    "GET /api/training": async () => J({ ok: true, items: db.training }),
    "POST /api/training": async (body, ctx) => {
      const user = ctx.currentUser();
      if (!hasPerm(user, "manage_training")) return deny(user);
      const errors = trainingErrors(body);
      if (Object.keys(errors).length) return J({ ok: false, message: "Bitte Eingaben prüfen.", errors }, 422);
      const item = { id: genId("ts"), ...trainingFields(body) };
      db.training.push(item);
      return J({ ok: true, item, message: "Trainingszeit angelegt." }, 201);
    },
    "POST /api/training/update": async (body, ctx) => {
      const user = ctx.currentUser();
      if (!hasPerm(user, "manage_training")) return deny(user);
      const errors = trainingErrors(body);
      if (Object.keys(errors).length) return J({ ok: false, message: "Bitte Eingaben prüfen.", errors }, 422);
      const idx = db.training.findIndex((t) => t.id === body.id);
      if (idx === -1) return J({ ok: false, message: "Trainingszeit nicht gefunden." }, 404);
      db.training[idx] = { ...db.training[idx], ...trainingFields(body) };
      return J({ ok: true, item: db.training[idx], message: "Trainingszeit gespeichert." });
    },
    "POST /api/training/delete": async (body, ctx) => {
      const user = ctx.currentUser();
      if (!hasPerm(user, "manage_training")) return deny(user);
      if (!db.training.some((t) => t.id === body.id)) return J({ ok: false, message: "Trainingszeit nicht gefunden." }, 404);
      db.training = db.training.filter((t) => t.id !== body.id);
      return J({ ok: true, message: "Trainingszeit gelöscht." });
    },

    /* ---------- Team & Vorstand (öffentlich, aus Vereinsämtern × Nutzern) ---------- */
    "GET /api/team": async () => {
      const byId = {}; db.users.forEach((u) => { byId[u.id] = u; });
      const items = [];
      db.positions.forEach((p) => {
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
      return J({ ok: true, items });
    },

    /* ---------- Vereinsämter (Team-Seite verwalten, gated: manage_team) ---------- */
    "GET /api/positions": async (_body, ctx) => {
      const user = ctx.currentUser();
      if (!hasPerm(user, "manage_team")) return deny(user);
      const byId = {}; db.users.forEach((u) => { byId[u.id] = u; });
      const items = db.positions.map((p) => {
        const u = byId[p.userId] || {};
        return { id: p.id, userId: p.userId, group: p.group, label: p.label, order: p.order, name: u.name || "—", email: u.email || "—" };
      });
      return J({ ok: true, items, users: db.users.map((u) => ({ id: u.id, name: u.name })) });
    },

    "POST /api/positions": async (body, ctx) => {
      const user = ctx.currentUser();
      if (!hasPerm(user, "manage_team")) return deny(user);
      if (!getUserById(body.userId)) return J({ ok: false, message: "Bitte Eingaben prüfen.", errors: { userId: "Bitte ein Mitglied wählen." } }, 422);
      const label = norm(body.label);
      if (label.length < 1) return J({ ok: false, message: "Bitte Eingaben prüfen.", errors: { label: "Bitte einen Funktionsnamen angeben." } }, 422);
      const pos = { id: genId("pos"), userId: body.userId, group: teamGroupOf(body.group), label, order: num(body.order) };
      db.positions.push(pos);
      return J({ ok: true, position: pos, message: "Amt angelegt." }, 201);
    },

    "POST /api/positions/update": async (body, ctx) => {
      const user = ctx.currentUser();
      if (!hasPerm(user, "manage_team")) return deny(user);
      const idx = db.positions.findIndex((p) => p.id === body.id);
      if (idx === -1) return J({ ok: false, message: "Amt nicht gefunden." }, 404);
      if (body.userId !== undefined) { if (!getUserById(body.userId)) return J({ ok: false, message: "Bitte Eingaben prüfen.", errors: { userId: "Bitte ein Mitglied wählen." } }, 422); db.positions[idx].userId = body.userId; }
      if (body.group !== undefined) db.positions[idx].group = teamGroupOf(body.group);
      if (body.label !== undefined && norm(body.label).length >= 1) db.positions[idx].label = norm(body.label);
      if (body.order !== undefined) db.positions[idx].order = num(body.order);
      return J({ ok: true, position: db.positions[idx], message: "Amt gespeichert." });
    },

    "POST /api/positions/delete": async (body, ctx) => {
      const user = ctx.currentUser();
      if (!hasPerm(user, "manage_team")) return deny(user);
      if (!db.positions.some((p) => p.id === body.id)) return J({ ok: false, message: "Amt nicht gefunden." }, 404);
      db.positions = db.positions.filter((p) => p.id !== body.id);
      return J({ ok: true, message: "Amt gelöscht." });
    },

    /* ---------- Startseiten-Texte ---------- */
    "GET /api/site": async () => {
      const values = {};
      SITE_FIELDS.forEach((f) => { values[f.key] = norm(db.site[f.key]); });
      return J({ ok: true, fields: SITE_FIELDS, values });
    },
    "POST /api/site": async (body, ctx) => {
      const user = ctx.currentUser();
      if (!hasPerm(user, "manage_site")) return deny(user);
      const values = body.values && typeof body.values === "object" ? body.values : body;
      SITE_KEYS.forEach((k) => { if (k in values) db.site[k] = norm(values[k]); });
      const out = {};
      SITE_FIELDS.forEach((f) => { out[f.key] = norm(db.site[f.key]); });
      return J({ ok: true, values: out, message: "Startseiten-Texte gespeichert." });
    },

    /* ---------- Vereinsdaten / Branding (White-Label-Config) ---------- */
    "GET /api/club": async () => {
      const values = {};
      CLUB_FIELDS.forEach((f) => { values[f.key] = norm(db.club[f.key]); });
      return J({ ok: true, fields: CLUB_FIELDS, values });
    },
    "POST /api/club": async (body, ctx) => {
      const user = ctx.currentUser();
      if (!hasPerm(user, "manage_club")) return deny(user);
      const values = body.values && typeof body.values === "object" ? body.values : body;
      CLUB_KEYS.forEach((k) => { if (k in values) db.club[k] = norm(values[k]); });
      const out = {};
      CLUB_FIELDS.forEach((f) => { out[f.key] = norm(db.club[f.key]); });
      return J({ ok: true, values: out, message: "Vereinsdaten gespeichert." });
    },
    // Rohes PWA-Manifest aus der Club-Config (kein {ok:…}-Wrapper). index.mjs
    // liefert /manifest.webmanifest darüber pro Domain aus.
    "GET /api/manifest": async () => J(buildManifest(db.club)),

    /* ---------- Termine ---------- */
    "GET /api/events": async () => {
      const events = db.events.slice().sort((a, b) => new Date(a.date) - new Date(b.date));
      return J({ ok: true, items: events });
    },
    "POST /api/events": async (body, ctx) => {
      const user = ctx.currentUser();
      if (!hasPerm(user, "manage_events")) return deny(user);
      const errors = eventErrors(body);
      const money = eventMoney(body, errors);
      const org = eventOrganizer(body, errors);
      if (Object.keys(errors).length) return J({ ok: false, message: "Bitte Eingaben prüfen.", errors }, 422);
      const valid = allAgeClassLabels(ageCfg);
      const item = {
        id: genId("ev"), date: norm(body.date), time: norm(body.time),
        type: EVENT_TYPES.includes(body.type) ? body.type : "Event", title: norm(body.title), location: norm(body.location),
        ageClasses: Array.isArray(body.ageClasses) ? body.ageClasses.filter((c) => valid.includes(c)) : [],
        fee: money.fee, ownShare: money.ownShare,
        organizerName: org.organizerName, organizerIban: org.organizerIban,
      };
      db.events.push(item);
      return J({ ok: true, item, message: "Termin angelegt." }, 201);
    },
    "POST /api/events/update": async (body, ctx) => {
      const user = ctx.currentUser();
      if (!hasPerm(user, "manage_events")) return deny(user);
      const errors = eventErrors(body);
      const money = eventMoney(body, errors);
      const org = eventOrganizer(body, errors);
      if (Object.keys(errors).length) return J({ ok: false, message: "Bitte Eingaben prüfen.", errors }, 422);
      const idx = db.events.findIndex((ev) => ev.id === body.id);
      if (idx === -1) return J({ ok: false, message: "Termin nicht gefunden." }, 404);
      const valid = allAgeClassLabels(ageCfg);
      db.events[idx] = {
        ...db.events[idx], date: norm(body.date), time: norm(body.time),
        type: EVENT_TYPES.includes(body.type) ? body.type : "Event", title: norm(body.title), location: norm(body.location),
        ageClasses: Array.isArray(body.ageClasses) ? body.ageClasses.filter((c) => valid.includes(c)) : [],
        fee: money.fee, ownShare: money.ownShare,
        organizerName: org.organizerName, organizerIban: org.organizerIban,
      };
      return J({ ok: true, item: db.events[idx], message: "Termin gespeichert." });
    },
    "POST /api/events/delete": async (body, ctx) => {
      const user = ctx.currentUser();
      if (!hasPerm(user, "manage_events")) return deny(user);
      if (!db.events.some((ev) => ev.id === body.id)) return J({ ok: false, message: "Termin nicht gefunden." }, 404);
      db.events = db.events.filter((ev) => ev.id !== body.id);
      return J({ ok: true, message: "Termin gelöscht." });
    },

    /* ---------- Mitglieder-Lesezugriff (Redaktion/Kasse) ---------- */
    "GET /api/admin/members": async (_body, ctx) => {
      const user = ctx.currentUser();
      if (!hasPerm(user, "view_members")) return deny(user);
      const fin = hasPerm(user, "view_finance");
      const byId = {}; db.users.forEach((u) => { byId[u.id] = u; });
      const items = db.memberships.map((m) => {
        const owner = byId[m.userId] || {};
        const row = {
          id: m.id, firstName: m.firstName, lastName: m.lastName,
          categoryLabel: m.categoryLabel || "", individualFee: m.individualFee || 0,
          status: m.status, startedAt: m.startedAt,
          photo: m.photo || null, passNumber: m.passNumber || "", belt: m.belt || "", weightClass: m.weightClass || "",
          competitionClasses: classesForAge(ageInYear(m.birthdate), m.gender, ageCfg),
          ownerName: owner.name || "—", ownerEmail: owner.email || "—", address: owner.address || null,
        };
        if (fin) row.iban = owner.iban || null;
        return row;
      });
      let households = null;
      if (fin) {
        households = db.users.map((u) => {
          const active = db.memberships.filter((m) => m.userId === u.id && m.status === "aktiv");
          if (!active.length) return null;
          const s = billingSummary(active, memTypes.familyFlatMonthly);
          return { ownerName: u.name, ownerEmail: u.email, iban: u.iban || null, activeCount: s.activeCount, effectiveTotal: s.effectiveTotal, familyApplied: s.familyApplied };
        }).filter(Boolean);
      }
      return J({ ok: true, items, canViewFinance: fin, households });
    },

    "GET /api/membership-types": async () => J({ ok: true, ageBands: memTypes.ageBands, familyFlatMonthly: memTypes.familyFlatMonthly }),

    /* ---------- Probetraining & Kontakt ---------- */
    "POST /api/anmeldung": async (body) => {
      const errors = {};
      if (norm(body.name).length < 2) errors.name = "Bitte Namen angeben.";
      if (!isEmail(body.email)) errors.email = "Bitte gültige E-Mail-Adresse angeben.";
      if (!body.group) errors.group = "Bitte eine Trainingsgruppe wählen.";
      if (!body.privacy) errors.privacy = "Bitte der Datenverarbeitung zustimmen.";
      if (Object.keys(errors).length) return J({ ok: false, message: "Bitte Eingaben prüfen.", errors }, 422);
      const id = "ANM-" + Date.now();
      return J({
        ok: true, id,
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
      if (Object.keys(errors).length) return J({ ok: false, message: "Bitte Eingaben prüfen.", errors }, 422);
      const id = "MSG-" + Date.now();
      return J({ ok: true, id, message: "Danke für deine Nachricht! Wir haben sie erhalten und melden uns so schnell wie möglich." });
    },

    /* ---------- Auth (passwordless) ---------- */
    "POST /api/auth/register": async (body, ctx) => {
      const errors = {};
      if (norm(body.name).length < 2) errors.name = "Bitte Namen angeben.";
      if (!isEmail(body.email)) errors.email = "Bitte gültige E-Mail-Adresse angeben.";
      if (!body.privacy) errors.privacy = "Bitte der Datenverarbeitung zustimmen.";
      if (Object.keys(errors).length) return J({ ok: false, message: "Bitte Eingaben prüfen.", errors }, 422);
      if (findUserByEmail(body.email)) {
        return J({ ok: false, message: "Für diese E-Mail existiert bereits ein Konto. Bitte einloggen.", errors: { email: "E-Mail bereits registriert." } }, 409);
      }
      const user = { id: genId("usr"), name: norm(body.name), email: lc(body.email), address: null, iban: null, roles: ["member"], createdAt: new Date().toISOString() };
      db.users.push(user);
      ctx.setSession(user.id);
      return J({ ok: true, user: publicUser(user), message: "Willkommen, " + user.name.split(" ")[0] + "! Dein Konto wurde erstellt." }, 201);
    },
    "POST /api/auth/request-code": async (body) => {
      if (!isEmail(body.email)) return J({ ok: false, message: "Bitte gültige E-Mail-Adresse angeben.", errors: { email: "Ungültige E-Mail." } }, 422);
      const user = findUserByEmail(body.email);
      if (!user) return J({ ok: false, message: "Kein Konto mit dieser E-Mail gefunden. Bitte zuerst registrieren.", errors: { email: "Unbekannte E-Mail." } }, 404);
      const code = genCode();
      db.codes[user.email] = code;
      // devCode wird nur in Test-/Dev-Umgebungen mitgeliefert (kein echter E-Mail-Versand):
      const out = { ok: true, message: "Wir haben dir einen Anmeldecode geschickt." };
      if (dev) out.devCode = code;
      return J(out);
    },
    "POST /api/auth/login": async (body, ctx) => {
      const user = findUserByEmail(body.email);
      if (!user || !db.codes[user.email] || norm(body.code) !== db.codes[user.email]) {
        return J({ ok: false, message: "Code ungültig oder abgelaufen. Bitte erneut anfordern.", errors: { code: "Falscher Code." } }, 401);
      }
      delete db.codes[user.email];
      ctx.setSession(user.id);
      return J({ ok: true, user: publicUser(user), message: "Willkommen zurück, " + user.name.split(" ")[0] + "!" });
    },
    "POST /api/auth/logout": async (_body, ctx) => {
      ctx.clearSession();
      return J({ ok: true });
    },
    "GET /api/auth/me": async (_body, ctx) => {
      const me = ctx.currentUser();
      if (!me) return J({ ok: false, message: "Nicht angemeldet." }, 401);
      return J({ ok: true, user: publicUser(me), permissions: userPermissions(me), isAdmin: isAdmin(me) });
    },

    /* ---------- Rollen & Berechtigungen ---------- */
    "GET /api/permissions": async (_body, ctx) => {
      const user = ctx.currentUser();
      if (!hasPerm(user, "manage_roles")) return deny(user);
      return J({ ok: true, items: PERMISSIONS });
    },

    /* ---------- Feature-Gating & Beta-Freigabe (nutzer-spezifisch) ---------- */
    "GET /api/capabilities": async (_body, ctx) => {
      const user = ctx.currentUser();
      const features = {};
      FEATURES.forEach((f) => {
        if (!isBooked(f.key)) return; // nicht gebucht -> für den Mandanten nicht existent
        const scope = scopeFor(f.key);
        if (canSeeFeature(user, scope)) features[f.key] = { status: f.status, public: scope === "public" };
      });
      return J({ ok: true, features });
    },
    "GET /api/features": async (_body, ctx) => {
      const user = ctx.currentUser();
      if (!hasPerm(user, "manage_features")) return deny(user);
      const items = FEATURES.map((f) => ({ key: f.key, label: f.label, status: f.status, scope: scopeFor(f.key) }));
      const roles = db.roles.map((r) => ({ id: r.id, label: r.label }));
      return J({ ok: true, items, roles });
    },
    "POST /api/features/release": async (body, ctx) => {
      const user = ctx.currentUser();
      if (!hasPerm(user, "manage_features")) return deny(user);
      if (!FEATURE_KEYS.includes(body.key)) return J({ ok: false, message: "Unbekanntes Feature." }, 404);
      const scope = normalizeScope(body.release, db.roles.map((r) => r.id));
      if (scope === null) return J({ ok: false, message: "Bitte Eingaben prüfen.", errors: { release: "Ungültige Freigabe." } }, 422);
      db.featureFlags[body.key] = scope;
      return J({ ok: true, key: body.key, scope, message: "Freigabe gespeichert." });
    },
    "GET /api/bookings": async (_body, ctx) => {
      const user = ctx.currentUser();
      if (!hasPerm(user, "book_features")) return deny(user);
      const items = FEATURES.map((f) => ({ key: f.key, label: f.label, status: f.status, booked: isBooked(f.key) }));
      return J({ ok: true, items });
    },
    "POST /api/features/book": async (body, ctx) => {
      const user = ctx.currentUser();
      if (!hasPerm(user, "book_features")) return deny(user);
      if (!FEATURE_KEYS.includes(body.key)) return J({ ok: false, message: "Unbekanntes Feature." }, 404);
      if (typeof body.booked !== "boolean") return J({ ok: false, message: "Bitte Eingaben prüfen.", errors: { booked: "Buchung muss true/false sein." } }, 422);
      db.featureBookings[body.key] = body.booked;
      return J({ ok: true, key: body.key, booked: body.booked, message: "Buchung gespeichert." });
    },
    "GET /api/roles": async (_body, ctx) => {
      const user = ctx.currentUser();
      if (!hasPerm(user, "manage_roles") && !hasPerm(user, "manage_users")) return deny(user);
      return J({ ok: true, items: db.roles });
    },
    "POST /api/roles": async (body, ctx) => {
      const user = ctx.currentUser();
      if (!hasPerm(user, "manage_roles")) return deny(user);
      const label = norm(body.label);
      if (label.length < 2) return J({ ok: false, message: "Bitte Eingaben prüfen.", errors: { label: "Bitte Rollennamen angeben." } }, 422);
      const perms = (body.permissions || []).filter((p) => ALL_PERMS.includes(p));
      const id = "role-" + label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + Math.random().toString(36).slice(2, 5);
      const role = { id, label, permissions: perms, system: false };
      db.roles.push(role);
      return J({ ok: true, role, message: "Rolle „" + label + "“ angelegt." }, 201);
    },
    "POST /api/roles/update": async (body, ctx) => {
      const user = ctx.currentUser();
      if (!hasPerm(user, "manage_roles")) return deny(user);
      const idx = db.roles.findIndex((r) => r.id === body.id);
      if (idx === -1) return J({ ok: false, message: "Rolle nicht gefunden." }, 404);
      if (db.roles[idx].id === "admin") return J({ ok: false, message: "Die Administrator-Rolle besitzt immer alle Berechtigungen und kann nicht eingeschränkt werden." }, 409);
      if (body.label !== undefined && norm(body.label).length >= 2) db.roles[idx].label = norm(body.label);
      if (Array.isArray(body.permissions)) db.roles[idx].permissions = body.permissions.filter((p) => ALL_PERMS.includes(p));
      return J({ ok: true, role: db.roles[idx], message: "Rolle gespeichert." });
    },
    "POST /api/roles/delete": async (body, ctx) => {
      const user = ctx.currentUser();
      if (!hasPerm(user, "manage_roles")) return deny(user);
      const role = db.roles.find((r) => r.id === body.id);
      if (!role) return J({ ok: false, message: "Rolle nicht gefunden." }, 404);
      if (role.system) return J({ ok: false, message: "System-Rollen können nicht gelöscht werden." }, 409);
      db.roles = db.roles.filter((r) => r.id !== body.id);
      db.users.forEach((u) => { if (u.roles) u.roles = u.roles.filter((rid) => rid !== body.id); });
      return J({ ok: true, message: "Rolle gelöscht." });
    },

    "GET /api/users": async (_body, ctx) => {
      const user = ctx.currentUser();
      if (!hasPerm(user, "manage_users")) return deny(user);
      const items = db.users.map((u) => ({ id: u.id, name: u.name, email: u.email, roles: u.roles || ["member"] }));
      return J({ ok: true, items });
    },
    "POST /api/users/roles": async (body, ctx) => {
      const user = ctx.currentUser();
      if (!hasPerm(user, "manage_users")) return deny(user);
      const idx = db.users.findIndex((u) => u.id === body.userId);
      if (idx === -1) return J({ ok: false, message: "Benutzer nicht gefunden." }, 404);
      const validIds = db.roles.map((r) => r.id);
      const newRoles = (body.roles || []).filter((r) => validIds.includes(r));
      const removingAdmin = (db.users[idx].roles || []).includes("admin") && !newRoles.includes("admin");
      if (removingAdmin) {
        const otherAdmins = db.users.filter((u, i) => i !== idx && (u.roles || []).includes("admin")).length;
        if (otherAdmins === 0) return J({ ok: false, message: "Es muss mindestens ein Administrator bestehen bleiben." }, 409);
      }
      db.users[idx].roles = newRoles.length ? newRoles : ["member"];
      return J({ ok: true, user: { id: db.users[idx].id, name: db.users[idx].name, email: db.users[idx].email, roles: db.users[idx].roles }, message: "Rollen aktualisiert." });
    },

    /* ---------- Konto: Adresse, IBAN, Foto ---------- */
    "POST /api/account/update": async (body, ctx) => {
      const user = ctx.currentUser();
      if (!user) return J({ ok: false, message: "Nicht angemeldet." }, 401);
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
      if (Object.keys(errors).length) return J({ ok: false, message: "Bitte Eingaben prüfen.", errors }, 422);
      Object.assign(user, patch);
      return J({ ok: true, user: publicUser(user), message: "Daten gespeichert." });
    },

    /* ---------- Mitgliedschaften ---------- */
    "GET /api/memberships": async (_body, ctx) => {
      const user = ctx.currentUser();
      if (!user) return J({ ok: false, message: "Nicht angemeldet." }, 401);
      const stored = db.memberships.filter((m) => m.userId === user.id);
      const items = stored.map((m) => ({ ...m, competitionClasses: classesForAge(ageInYear(m.birthdate), m.gender, ageCfg) }));
      const active = items.filter((m) => m.status === "aktiv");
      return J({ ok: true, items, summary: billingSummary(active, memTypes.familyFlatMonthly) });
    },
    "POST /api/memberships": async (body, ctx) => {
      const user = ctx.currentUser();
      if (!user) return J({ ok: false, message: "Nicht angemeldet." }, 401);
      if (!user.address || !user.iban) {
        return J({ ok: false, code: "ACCOUNT_INCOMPLETE", message: "Bitte zuerst Anschrift und Kontoverbindung im Konto hinterlegen – darunter werden alle Mitglieder deines Haushalts angemeldet." }, 409);
      }
      const errors = {};
      const { age } = memberProfile(body, errors);
      if (Object.keys(errors).length) return J({ ok: false, message: "Bitte Eingaben prüfen.", errors }, 422);
      const band = bandForAge(age, memTypes.ageBands) || memTypes.ageBands[memTypes.ageBands.length - 1];
      const allowedWeights = weightClassesFor(ageInYear(body.birthdate), fromList(GENDERS, body.gender), weightCfg);
      const membership = {
        id: genId("mem"), userId: user.id,
        ...memberFields(body, allowedWeights),
        ageCategory: band.id, categoryLabel: band.label, individualFee: band.feeMonthly,
        passNumber: nextPassNumber(),
        status: "aktiv", startedAt: new Date().toISOString(),
      };
      db.memberships.push(membership);
      return J({ ok: true, membership, message: "Mitgliedschaft für " + membership.firstName + " wurde angelegt." }, 201);
    },
    "POST /api/memberships/update": async (body, ctx) => {
      const user = ctx.currentUser();
      if (!user) return J({ ok: false, message: "Nicht angemeldet." }, 401);
      const idx = db.memberships.findIndex((m) => m.id === body.id && m.userId === user.id);
      if (idx === -1) return J({ ok: false, message: "Mitgliedschaft nicht gefunden." }, 404);
      const errors = {};
      const { age } = memberProfile(body, errors);
      if (Object.keys(errors).length) return J({ ok: false, message: "Bitte Eingaben prüfen.", errors }, 422);
      const band = bandForAge(age, memTypes.ageBands) || memTypes.ageBands[memTypes.ageBands.length - 1];
      const allowedWeights = weightClassesFor(ageInYear(body.birthdate), fromList(GENDERS, body.gender), weightCfg);
      db.memberships[idx] = {
        ...db.memberships[idx],
        ...memberFields(body, allowedWeights),
        ageCategory: band.id, categoryLabel: band.label, individualFee: band.feeMonthly,
      };
      return J({ ok: true, membership: db.memberships[idx], message: "Mitglied gespeichert." });
    },
    "POST /api/memberships/cancel": async (body, ctx) => {
      const user = ctx.currentUser();
      if (!user) return J({ ok: false, message: "Nicht angemeldet." }, 401);
      const idx = db.memberships.findIndex((m) => m.id === body.id && m.userId === user.id);
      if (idx === -1) return J({ ok: false, message: "Mitgliedschaft nicht gefunden." }, 404);
      db.memberships[idx].status = "gekündigt";
      db.memberships[idx].cancelledAt = new Date().toISOString();
      return J({ ok: true, membership: db.memberships[idx], message: "Mitgliedschaft gekündigt." });
    },

    /* ---------- Turniere & Meisterschaften: Anmeldung ---------- */
    "GET /api/tournaments": async (_body, ctx) => {
      const user = ctx.currentUser();
      if (!user) return J({ ok: false, message: "Nicht angemeldet." }, 401);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const events = db.events
        .filter((e) => TOURNAMENT_TYPES.includes(e.type) && new Date(e.date) >= today)
        .sort((a, b) => new Date(a.date) - new Date(b.date));
      const myMembers = db.memberships.filter((m) => m.userId === user.id && m.status === "aktiv");
      const items = events.map((e) => {
        const open = !e.ageClasses || e.ageClasses.length === 0;
        const eligibleMembers = myMembers
          .map((m) => ({ m, classes: classesForAge(ageInYear(m.birthdate), m.gender, ageCfg) }))
          .filter((x) => open || overlaps(x.classes, e.ageClasses))
          .map((x) => ({
            membershipId: x.m.id, name: x.m.firstName + " " + x.m.lastName, competitionClasses: x.classes,
            registered: db.registrations.some((r) => r.eventId === e.id && r.membershipId === x.m.id),
          }));
        return { ...e, eligibleMembers };
      });
      return J({ ok: true, items });
    },
    "POST /api/tournaments/register": async (body, ctx) => {
      const user = ctx.currentUser();
      if (!user) return J({ ok: false, message: "Nicht angemeldet." }, 401);
      const ev = db.events.find((e) => e.id === body.eventId && TOURNAMENT_TYPES.includes(e.type));
      if (!ev) return J({ ok: false, message: "Turnier nicht gefunden." }, 404);
      const m = db.memberships.find((x) => x.id === body.membershipId && x.userId === user.id);
      if (!m) return J({ ok: false, message: "Mitglied nicht gefunden." }, 404);
      const classes = classesForAge(ageInYear(m.birthdate), m.gender, ageCfg);
      const open = !ev.ageClasses || ev.ageClasses.length === 0;
      if (!open && !overlaps(classes, ev.ageClasses)) return J({ ok: false, message: "Dieses Mitglied passt nicht in die Altersklassen dieses Turniers." }, 422);
      if (db.registrations.some((r) => r.eventId === ev.id && r.membershipId === m.id)) return J({ ok: false, message: "Bereits angemeldet." }, 409);
      const reg = { id: genId("reg"), eventId: ev.id, membershipId: m.id, userId: user.id, registeredAt: new Date().toISOString() };
      db.registrations.push(reg);
      return J({ ok: true, registration: reg, message: m.firstName + " wurde angemeldet." }, 201);
    },
    "POST /api/tournaments/unregister": async (body, ctx) => {
      const user = ctx.currentUser();
      if (!user) return J({ ok: false, message: "Nicht angemeldet." }, 401);
      const exists = db.registrations.some((r) => r.eventId === body.eventId && r.membershipId === body.membershipId && r.userId === user.id);
      if (!exists) return J({ ok: false, message: "Anmeldung nicht gefunden." }, 404);
      db.registrations = db.registrations.filter((r) => !(r.eventId === body.eventId && r.membershipId === body.membershipId && r.userId === user.id));
      return J({ ok: true, message: "Abgemeldet." });
    },
    "GET /api/admin/registrations": async (_body, ctx) => {
      const user = ctx.currentUser();
      const canView = hasPerm(user, "manage_events") || hasPerm(user, "manage_payouts");
      if (!canView) return deny(user);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const events = db.events
        .filter((e) => TOURNAMENT_TYPES.includes(e.type) && new Date(e.date) >= today)
        .sort((a, b) => new Date(a.date) - new Date(b.date));
      const usersById = {}; db.users.forEach((u) => { usersById[u.id] = u; });
      const items = events.map((e) => {
        const registrations = db.registrations.filter((r) => r.eventId === e.id).map((r) => {
          const m = db.memberships.find((x) => x.id === r.membershipId) || {};
          const owner = usersById[r.userId] || {};
          return {
            membershipId: r.membershipId, firstName: m.firstName || "—", lastName: m.lastName || "",
            competitionClasses: classesForAge(ageInYear(m.birthdate), m.gender, ageCfg),
            ownerName: owner.name || "—", ownerEmail: owner.email || "—", registeredAt: r.registeredAt,
          };
        });
        const fee = e.fee || 0, ownShare = Math.min(fee, e.ownShare || 0), count = registrations.length;
        return {
          id: e.id, title: e.title, date: e.date, type: e.type, ageClasses: e.ageClasses || [],
          fee, ownShare, count,
          payTotal: fee * count, ownTotal: ownShare * count, clubTotal: (fee - ownShare) * count,
          organizerName: e.organizerName || "", organizerIban: e.organizerIban || "",
          payout: db.payouts.find((p) => p.eventId === e.id) || null,
          registrations,
        };
      });
      return J({ ok: true, items });
    },

    /* ---------- Auszahlungen (Teilnahmegebühren an Veranstalter) ---------- */
    "GET /api/payouts": async (_body, ctx) => {
      const user = ctx.currentUser();
      if (!hasPerm(user, "manage_payouts")) return deny(user);
      const byId = {}; db.events.forEach((e) => { byId[e.id] = e; });
      const items = db.payouts
        .map((p) => ({ ...p, eventTitle: (byId[p.eventId] || {}).title || "—", eventDate: (byId[p.eventId] || {}).date || "" }))
        .sort((a, b) => new Date(b.initiatedAt) - new Date(a.initiatedAt));
      return J({ ok: true, items });
    },
    "POST /api/payouts": async (body, ctx) => {
      const user = ctx.currentUser();
      if (!hasPerm(user, "manage_payouts")) return deny(user);
      const ev = db.events.find((e) => e.id === body.eventId && TOURNAMENT_TYPES.includes(e.type));
      if (!ev) return J({ ok: false, message: "Turnier nicht gefunden." }, 404);
      if (!ev.organizerIban || !isIban(ev.organizerIban)) return J({ ok: false, message: "Keine gültige Veranstalter-IBAN am Termin hinterlegt." }, 422);
      const count = db.registrations.filter((r) => r.eventId === ev.id).length;
      if (count < 1) return J({ ok: false, message: "Keine Anmeldungen vorhanden." }, 422);
      if (db.payouts.some((p) => p.eventId === ev.id)) return J({ ok: false, message: "Für dieses Turnier wurde bereits eine Überweisung veranlasst." }, 409);
      const fee = ev.fee || 0;
      const payout = {
        id: genId("pay"), eventId: ev.id, organizerName: ev.organizerName || "", organizerIban: ev.organizerIban,
        feePerHead: fee, count, amount: fee * count, reference: norm(body.reference),
        initiatedByUserId: user.id, initiatedByName: user.name, initiatedAt: new Date().toISOString(),
        status: "veranlasst",
      };
      db.payouts.push(payout);
      return J({ ok: true, payout, message: "Überweisung über " + (fee * count) + " € an " + (ev.organizerName || "den Veranstalter") + " veranlasst." }, 201);
    },
    "POST /api/payouts/cancel": async (body, ctx) => {
      const user = ctx.currentUser();
      if (!hasPerm(user, "manage_payouts")) return deny(user);
      if (!db.payouts.some((p) => p.id === body.id)) return J({ ok: false, message: "Auszahlung nicht gefunden." }, 404);
      db.payouts = db.payouts.filter((p) => p.id !== body.id);
      return J({ ok: true, message: "Überweisung storniert." });
    },

    /* ---------- Test/Dev: Store auf Seed-Zustand zurücksetzen ----------
       Nur in Dev-/Test-Umgebungen (dev=true). Liefert die Contract-Test-Suite
       pro Suite einen frischen Backend-Zustand – das Real-Modus-Pendant zur
       frischen Mock-Sandbox, ohne die fachlichen Routen zu berühren. */
    "POST /api/test/reset": async () => {
      if (!dev) return J({ ok: false, message: "Endpoint nicht gefunden." }, 404);
      init();
      persist();
      return J({ ok: true, message: "Backend auf Seed-Zustand zurückgesetzt." });
    },
  };

  /* ----- Dispatcher: Token → Session, Handler ausführen ----- */
  async function handle({ method, path, body }, token) {
    const handler = routes[method + " " + path];
    if (!handler) return { status: 404, body: { ok: false, message: "Endpoint nicht gefunden." }, session: null };
    const ctx = {
      _session: null,
      currentUser() { const uid = token ? sessions.get(token) : null; return uid ? getUserById(uid) : null; },
      // kryptografisch sicheres Session-Token (nicht aus Date.now()/Math.random()).
      setSession(userId) { const t = "tok-" + randomUUID(); sessions.set(t, userId); this._session = { set: t }; },
      clearSession() { if (token) sessions.delete(token); this._session = { clear: true }; },
    };
    try {
      const res = await handler(body || {}, ctx);
      // Write-through: nach jeder zustandsändernden (Nicht-GET-)Anfrage persistieren
      // (eine Stelle statt vieler Mutationsorte; No-op ohne dataFile).
      if (method !== "GET" && method !== "HEAD") persist();
      return { status: res.status, body: res.body, session: ctx._session };
    } catch (err) {
      // Details (inkl. evtl. internals) nur im Dev-Modus an den Client geben.
      const detail = (err && err.message) ? err.message : String(err);
      return { status: 500, body: { ok: false, message: dev ? "Serverfehler: " + detail : "Interner Serverfehler." }, session: null };
    }
  }

  return { handle };
}
