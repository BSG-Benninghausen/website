/* =====================================================================
   run.mjs – führt alle *.test.mjs aus (Mock oder echtes Backend).
     node tests/run.mjs                 # Mock-Modus (Default)
     node tests/run.mjs tournaments     # nur Suites mit "tournaments" im Dateinamen
     TEST_BASE=http://localhost:3000 node tests/run.mjs   # echtes Backend
   Exit-Code != 0, wenn mindestens eine Prüfung fehlschlägt.
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
