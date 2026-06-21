/* Persistenz-Integrationstest (standalone, nicht Teil der Client-Suite in run.mjs).
   Prüft den JSON-Snapshot-Roundtrip direkt über createApi + zwei „Neustarts"
   (zwei Instanzen mit demselben dataFile). Exit-Code 0/1 wie guard-versions.mjs.

   Ausführen:  node packages/backend/persistence.mjs
*/
import { mkdtempSync, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApi } from "./api.mjs";
import { loadSnapshot, saveSnapshot } from "./store.mjs";

// Kanonische Seeds aus dem Contract-Package (@crypticalcode/api-contract).
const DATA_DIR = new URL("../api-contract/data/", import.meta.url);
let pass = 0, fail = 0;
const ck = (label, ok) => { console.log(`  ${ok ? "✓" : "✗ FAIL"} ${label}`); ok ? pass++ : fail++; };

// Direkter Aufruf des Dispatchers; gibt {status, body, token(neu)} zurück.
async function call(api, method, path, body, token) {
  const r = await api.handle({ method, path, body: body || {} }, token || "");
  return { status: r.status, body: r.body, token: (r.session && r.session.set) || token || "" };
}
async function login(api, email) {
  const rc = await call(api, "POST", "/api/auth/request-code", { email });
  const lg = await call(api, "POST", "/api/auth/login", { email, code: rc.body.devCode });
  return lg.token;
}

async function main() {
  console.log("=== Persistenz (JSON-Snapshot) ===");

  // --- Reine Helfer: Roundtrip + Atomarität ---
  const dir = mkdtempSync(join(tmpdir(), "bsg-persist-"));
  const helperFile = join(dir, "snap.json");
  saveSnapshot(helperFile, { hello: "welt", n: 42 });
  const back = loadSnapshot(helperFile);
  ck("saveSnapshot/loadSnapshot Roundtrip", back && back.hello === "welt" && back.n === 42);
  ck("kein zurückgebliebenes .tmp", !existsSync(helperFile + ".tmp"));
  ck("fehlende Datei -> null", loadSnapshot(join(dir, "gibtsnicht.json")) === null);

  // --- Roundtrip über das echte Backend: Instanz A schreibt, B liest ---
  const dataFile = join(dir, "state.json");
  const uniq = "persist." + Date.now() + "@example.com";

  const apiA = createApi({ dataDir: DATA_DIR, dev: true, dataFile });
  ck("Snapshot beim Boot angelegt", existsSync(dataFile));

  // Neuen Nutzer registrieren (landet in db.users)
  const reg = await call(apiA, "POST", "/api/auth/register", { name: "Persist Tester", email: uniq, privacy: true });
  ck("Registrierung ok (201)", reg.status === 201);

  // Als Seed-Admin die Club-Config ändern (landet in db.club)
  const adminTok = await login(apiA, "admin@example.com");
  const upd = await call(apiA, "POST", "/api/club", { values: { brand_name: "Persisted FC" } }, adminTok);
  ck("Club-Änderung als Admin ok", upd.status === 200 && upd.body.values.brand_name === "Persisted FC");

  // --- „Neustart": frische Instanz, gleiches dataFile ---
  const apiB = createApi({ dataDir: DATA_DIR, dev: true, dataFile });
  // Der registrierte Nutzer überlebte den Neustart -> Login gelingt (Sessions sind flüchtig).
  const relogin = await login(apiB, uniq);
  const me = await call(apiB, "GET", "/api/auth/me", {}, relogin);
  ck("registrierter Nutzer überlebt Neustart", me.status === 200 && me.body.user && me.body.user.email === uniq);
  // Die Club-Änderung überlebte den Neustart.
  const club = await call(apiB, "GET", "/api/club");
  ck("Club-Änderung überlebt Neustart", club.body.values.brand_name === "Persisted FC");

  // Snapshot ist gültiges JSON und enthält db, aber keine sessions/Tokens.
  const raw = readFileSync(dataFile, "utf8");
  let parsed = null; try { parsed = JSON.parse(raw); } catch (e) {}
  ck("Snapshot ist gültiges JSON mit db-Inhalt", !!parsed && Array.isArray(parsed.users) && parsed.users.length >= 1);
  ck("Snapshot enthält keine sessions", !("sessions" in (parsed || {})) && !/tok-/.test(raw));

  // --- Fail-safe: defekter/semantisch falscher Snapshot -> frischer Seed statt Crash ---
  for (const bad of ["[]", "{}", "42", "\"nope\"", "{ kaputt"]) {
    const bf = join(dir, "bad-" + Buffer.from(bad).toString("hex") + ".json");
    writeFileSync(bf, bad);
    let booted = null;
    try { booted = createApi({ dataDir: DATA_DIR, dev: true, dataFile: bf }); } catch (e) { /* booted bleibt null */ }
    const ping = booted ? await login(booted, "admin@example.com") : "";
    ck(`defekter Snapshot ${JSON.stringify(bad)} -> fail-safe Seed (Admin-Login geht)`, !!ping);
  }

  // --- Default-Verhalten ohne dataFile: nichts wird geschrieben (auch nicht relativ zur CWD) ---
  const dir2 = mkdtempSync(join(tmpdir(), "bsg-nopersist-"));
  const prevCwd = process.cwd();
  process.chdir(dir2);
  try { createApi({ dataDir: DATA_DIR, dev: true }); } finally { process.chdir(prevCwd); }
  ck("ohne dataFile wird nichts geschrieben (auch nicht relativ zur CWD)", readdirSync(dir2).length === 0);

  console.log(`\n==== TOTAL: ${pass} passed, ${fail} failed ====`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
