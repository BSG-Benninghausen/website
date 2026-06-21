/* =====================================================================
   vendor-seeds.mjs – kanonische Seeds in den Laufzeit-Pfad „vendoren".
   ---------------------------------------------------------------------
   In diesem eigenständigen Backend-Repo ist die Single Source of Truth der
   Seeds der vendored Vertrag unter contract/data/ (im Monorepo:
   packages/api-contract/data/). Das Backend lädt die Seeds zur Laufzeit
   aber PFADBASIERT und INSTALL-FREI aus ./data/ (kein node_modules, kein
   Contract-Import). Dieses Skript hält ./data/ == contract/data/.

     node tools/vendor-seeds.mjs            # kopieren (data/ aktualisieren)
     node tools/vendor-seeds.mjs --check    # nur prüfen: data/ == contract/data/? (CI)

   Exit-Code != 0, wenn (im --check-Modus) eine Datei fehlt oder abweicht.

   Hinweis (Phase 3b): Wird der Vertrag als Package @crypticalcode/api-contract
   konsumiert, zeigt SRC stattdessen auf node_modules/@crypticalcode/api-contract/data/.
   ===================================================================== */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SRC = new URL("../contract/data/", import.meta.url);
const DST = new URL("../data/", import.meta.url);
const check = process.argv.includes("--check");

const files = readdirSync(SRC).filter((f) => f.endsWith(".json")).sort();
if (!files.length) { console.error("Keine kanonischen Seeds in contract/data/ gefunden."); process.exit(1); }

if (!check && !existsSync(DST)) mkdirSync(DST, { recursive: true });

let drift = 0;
for (const f of files) {
  const want = readFileSync(new URL(f, SRC), "utf8");
  const dstUrl = new URL(f, DST);
  if (check) {
    let have = null;
    try { have = readFileSync(dstUrl, "utf8"); } catch { /* fehlt */ }
    if (have !== want) { console.log(`  ✗ DRIFT ${f}${have === null ? " (fehlt in data/)" : ""}`); drift++; }
    else console.log(`  ✓ ${f}`);
  } else {
    writeFileSync(dstUrl, want);
    console.log(`  → data/${f}`);
  }
}

if (check && drift) {
  console.error(`\n${drift} Seed(s) weichen ab. Führe \`node tools/vendor-seeds.mjs\` aus und committe data/.`);
  process.exit(1);
}
console.log(check ? "\nVendored Seeds (data/) stimmen mit contract/data/ überein." : `\n${files.length} Seed(s) nach ${fileURLToPath(DST)} vendored.`);
