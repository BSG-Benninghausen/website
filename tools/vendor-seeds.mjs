/* =====================================================================
   vendor-seeds.mjs – kanonische Seeds ins Frontend „vendoren".
   ---------------------------------------------------------------------
   Single Source of Truth der Seeds ist packages/api-contract/data/ (der
   Vertrag). Das ausgelieferte Static-Frontend braucht dieselben JSONs unter
   assets/data/, weil der Browser sie per fetch lädt – es gibt KEINEN Build-
   Schritt. Dieses Skript kopiert die kanonischen Seeds 1:1 dorthin.

     node tools/vendor-seeds.mjs            # kopieren (assets/data/ aktualisieren)
     node tools/vendor-seeds.mjs --check    # nur prüfen: vendored == kanonisch? (CI)

   Exit-Code != 0, wenn (im --check-Modus) eine Datei fehlt oder abweicht.
   ===================================================================== */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SRC = new URL("../packages/api-contract/data/", import.meta.url);
const DST = new URL("../assets/data/", import.meta.url);
const check = process.argv.includes("--check");

const files = readdirSync(SRC).filter((f) => f.endsWith(".json")).sort();
if (!files.length) { console.error("Keine kanonischen Seeds in packages/api-contract/data/ gefunden."); process.exit(1); }

if (!check && !existsSync(DST)) mkdirSync(DST, { recursive: true });

let drift = 0;
for (const f of files) {
  const want = readFileSync(new URL(f, SRC), "utf8");
  const dstUrl = new URL(f, DST);
  if (check) {
    let have = null;
    try { have = readFileSync(dstUrl, "utf8"); } catch { /* fehlt */ }
    if (have !== want) { console.log(`  ✗ DRIFT ${f}${have === null ? " (fehlt in assets/data/)" : ""}`); drift++; }
    else console.log(`  ✓ ${f}`);
  } else {
    writeFileSync(dstUrl, want);
    console.log(`  → assets/data/${f}`);
  }
}

if (check && drift) {
  console.error(`\n${drift} Seed(s) weichen ab. Führe \`node tools/vendor-seeds.mjs\` aus und committe assets/data/.`);
  process.exit(1);
}
console.log(check ? "\nVendored Seeds stimmen mit dem Contract-Package überein." : `\n${files.length} Seed(s) nach ${fileURLToPath(DST)} vendored.`);
