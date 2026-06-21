#!/usr/bin/env node
/* =====================================================================
   run.mjs – führt alle *.test.mjs aus (Mock oder echtes Backend).
     node packages/api-contract/run.mjs                 # Mock-Modus (Default)
     node packages/api-contract/run.mjs tournaments     # nur Suites mit "tournaments" im Namen
     TEST_BASE=http://localhost:3000 node packages/api-contract/run.mjs   # echtes Backend
   Exit-Code != 0, wenn mindestens eine Prüfung fehlschlägt.

   Mock-Quelle und Seed-Verzeichnis sind per Env überschreibbar (s. harness.mjs):
     BSG_MOCK_SRC=/pfad/zu/mock-api.js  BSG_DATA_DIR=/pfad/zu/data  node packages/api-contract/run.mjs
   ===================================================================== */
import { readdirSync } from "node:fs";
import { createClient } from "./harness.mjs";

const base = process.env.TEST_BASE || "";
const mode = base ? "real" : "mock";
const filters = process.argv.slice(2);

const dir = new URL("./", import.meta.url);
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".test.mjs"))
  .filter((f) => !filters.length || filters.some((q) => f.includes(q)))
  .sort();

console.log(`\nContract-Tests · Modus: ${mode}${base ? " (" + base + ")" : ""} · ${files.length} Suite(s)`);

let totalPass = 0, totalFail = 0;
const failedSuites = [];

for (const f of files) {
  const mod = await import(new URL(f, dir));
  const title = mod.name || f;
  if (mode === "real" && mod.mockOnly) { console.log(`\n— ${title}: übersprungen (nur Mock) —`); continue; }

  const api = createClient({ mode, base });   // frischer Client je Suite (Isolation)
  const resetRes = await api.reset();          // Real-Modus: Backend pro Suite frisch seeden (Mock: No-op)
  if (mode === "real" && (!resetRes || !resetRes.ok)) {
    console.error(`\nAbbruch: POST /api/test/reset fehlgeschlagen (Status: ${resetRes ? resetRes.status : "keine Antwort"}).`);
    console.error(`Läuft unter ${base} ein Backend im Dev-Modus (BSG_DEV != 0)? Ohne Reset ist die Suite-Isolation nicht gewährleistet.`);
    process.exit(1);
  }
  let pass = 0, fail = 0;
  const ck = (n, c) => {
    if (c) { pass++; console.log("  ✓", n); }
    else { fail++; console.log("  ✗ FAIL", n); }
    return c;
  };

  console.log(`\n=== ${title} ===`);
  try { await mod.default(api, ck); }
  catch (e) { fail++; console.log("  ✗ EXCEPTION:", e && e.message ? e.message : e); }

  totalPass += pass; totalFail += fail;
  if (fail) failedSuites.push(title);
}

console.log(`\n==== TOTAL: ${totalPass} passed, ${totalFail} failed ====`);
if (totalFail) { console.log("Fehlgeschlagen:", failedSuites.join(", ")); process.exit(1); }
