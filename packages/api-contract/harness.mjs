/* =====================================================================
   harness.mjs – Contract-Test-Harness (Mock ODER echtes Backend)
   ---------------------------------------------------------------------
   Dieselben Tests laufen gegen
     (a) den In-Process-Mock (assets/js/mock-api.js), Default, oder
     (b) ein laufendes echtes Backend (HTTP), wenn TEST_BASE gesetzt ist.

   Die Tests sprechen ausschließlich die öffentliche /api/*-Schnittstelle an
   (kein Zugriff auf localStorage o. Ä.) und sind damit implementierungs-
   unabhängig. So bleibt der Mock-Vertrag und ein echtes Backend in Sync.

   Nutzung (aus dem Repo-Root):
     node packages/api-contract/run.mjs                 # Mock
     TEST_BASE=http://localhost:3000 node packages/api-contract/run.mjs   # echtes Backend
   ===================================================================== */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ADMIN_EMAIL = "admin@example.com";

/* Mock-Quelle und Seed-Verzeichnis sind per Env überschreibbar – dieses Package
   (@crypticalcode/api-contract) ist die Single Source of Truth des Vertrags (Tests + Seeds).
     BSG_MOCK_SRC  – Pfad zu mock-api.js (abs. oder relativ zum CWD).
                     Default: das mock-api.js des Frontend-Workspaces (../../assets/js).
     BSG_DATA_DIR  – Verzeichnis mit den Seed-/Config-JSONs (abs. oder relativ zum CWD).
                     Default: die kanonischen Seeds dieses Packages (./data). */
const MOCK_SRC_URL = process.env.BSG_MOCK_SRC
  ? pathToFileURL(resolve(process.env.BSG_MOCK_SRC))
  : new URL("../../assets/js/mock-api.js", import.meta.url);
const DATA_DIR = process.env.BSG_DATA_DIR
  ? pathToFileURL(resolve(process.env.BSG_DATA_DIR) + "/")
  : new URL("./data/", import.meta.url);
const MOCK_SRC = readFileSync(MOCK_SRC_URL, "utf8");

/* Pro Test-Lauf eindeutige Adressen, damit dieselbe Suite mehrfach gegen ein
   (persistentes) echtes Backend laufen kann, ohne zu kollidieren. */
export const RUN_ID = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

class MockResponse {
  constructor(body, init = {}) { this._b = body; this.status = init.status || 200; this.ok = this.status >= 200 && this.status < 300; }
  async json() { return JSON.parse(this._b); }
  async text() { return this._b; }
}

/* ---------- Mock-Sandbox (isoliert, ohne Node-Globals zu verändern) ---------- */
export function createMockSandbox() {
  const store = {};
  const localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
  const calls = [];
  // Anfangs-fetch = realFetch des Mocks: liefert Seed-JSONs von der Platte und
  // simuliert für (im hybrid/real-Modus) weitergereichte Routen ein Backend.
  const realFetch = async (u, init) => {
    const url = String(u);
    calls.push({ url, init });
    if (url.indexOf("assets/data/") > -1) {
      const file = url.replace(/^.*assets\/data\//, "");
      try { return new MockResponse(readFileSync(new URL(file, DATA_DIR), "utf8"), { status: 200 }); }
      catch (e) { return new MockResponse("{}", { status: 404 }); }
    }
    return new MockResponse(JSON.stringify({ ok: true, backend: true, url, creds: (init && init.credentials) || null }), { status: 200 });
  };
  const win = { location: { origin: "http://localhost" }, fetch: realFetch };
  const factory = new Function("window", "localStorage", "Response", "URL", "setTimeout", "console", MOCK_SRC);
  factory(win, localStorage, MockResponse, URL, (fn) => fn(), { info() {} });
  // win.fetch ist jetzt der Mock-Dispatcher
  return { win, store, calls };
}

function mockTransport() {
  const sb = createMockSandbox();
  return {
    raw(method, path, body) {
      const init = { method };
      if (body !== undefined) init.body = JSON.stringify(body);
      return sb.win.fetch(path, init);
    },
    sandbox: sb,
  };
}

/* ---------- HTTP-Transport gegen echtes Backend (mit Cookie-Jar) ---------- */
function httpTransport(base) {
  const root = base.replace(/\/$/, "");
  const jar = new Map();
  const cookieHeader = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  const absorb = (res) => {
    let cookies = [];
    if (typeof res.headers.getSetCookie === "function") cookies = res.headers.getSetCookie();
    else { const sc = res.headers.get("set-cookie"); if (sc) cookies = [sc]; }
    for (const c of cookies) {
      const pair = c.split(";")[0];
      const i = pair.indexOf("=");
      if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    }
  };
  return {
    async raw(method, path, body) {
      const headers = { "content-type": "application/json" };
      const ck = cookieHeader(); if (ck) headers["cookie"] = ck;
      const init = { method, headers, redirect: "manual" };
      if (body !== undefined) init.body = JSON.stringify(body);
      const res = await globalThis.fetch(root + path, init);
      absorb(res);
      return res;
    },
    sandbox: null,
  };
}

/* ---------- Client + gemeinsame, vertrags-treue Helfer ---------- */
export function createClient(opts = {}) {
  const base = opts.base ?? process.env.TEST_BASE ?? "";
  const mode = opts.mode ?? (base ? "real" : "mock");
  const t = mode === "real" ? httpTransport(base) : mockTransport();

  const api = {
    mode, base, sandbox: t.sandbox,
    raw: (m, p, b) => t.raw(m, p, b),
    get: (p) => t.raw("GET", p),
    post: (p, b) => t.raw("POST", p, b ?? {}),
    async getJ(p) { const r = await t.raw("GET", p); return [r.status, await r.json()]; },
    async postJ(p, b) { const r = await t.raw("POST", p, b ?? {}); return [r.status, await r.json()]; },
    email: (local) => `${local}.${RUN_ID}@example.com`,
  };

  // Pro-Suite-Isolation: im Real-Modus setzt der Runner den Backend-Store vor
  // jeder Suite auf den Seed-Zustand zurück (das Pendant zur frischen Mock-Sandbox).
  // Im Mock-Modus ist jede Suite ohnehin isoliert -> No-op.
  api.reset = () => (mode === "real" ? api.post("/api/test/reset", {}) : Promise.resolve());
  api.logout = () => api.post("/api/auth/logout", {});
  api.register = (name, email) => api.post("/api/auth/register", { name, email, privacy: true });
  api.login = async (email) => {
    const r = await (await api.post("/api/auth/request-code", { email })).json();
    return api.post("/api/auth/login", { email, code: r.devCode });
  };
  api.me = async () => (await api.get("/api/auth/me")).json();
  api.asAdmin = () => api.login(ADMIN_EMAIL);
  // Neuen Benutzer anlegen (loggt als dieser ein) und dessen id über /api/auth/me holen.
  api.newUser = async (name, email) => {
    await api.logout();
    await api.register(name, email);
    const me = await api.me();
    return me.user.id;
  };
  // Bequemer Haushalt: Adresse + IBAN am aktuellen Konto setzen (Voraussetzung für Mitgliedschaften).
  api.setHousehold = async (iban = "DE89 3704 0044 0532 0130 00") => {
    await api.post("/api/account/update", { address: { street: "Weg 3", zip: "59556", city: "Lippstadt" } });
    await api.post("/api/account/update", { iban });
  };
  return api;
}

export const ADMIN = ADMIN_EMAIL;
export const PHOTO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
export const IBAN = "DE89 3704 0044 0532 0130 00";
export const ORG_IBAN = "DE89370400440532013000";
export const YEAR = new Date().getFullYear();
