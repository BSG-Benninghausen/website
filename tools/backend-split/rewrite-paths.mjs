/* =====================================================================
   rewrite-paths.mjs – Pfad-Auflösung des extrahierten Backends umschreiben.
   ---------------------------------------------------------------------
   Aufruf:  node rewrite-paths.mjs <out-dir>

   Im Monorepo lädt das Backend Seeds aus ../api-contract/data/ und liefert
   statisch aus ../../ (Repo-Root). Im eigenständigen Repo liegen die Dateien
   flach an der Wurzel; daher:
     • index.mjs / persistence.mjs:  ../api-contract/data/  ->  ./data/
     • index.mjs ROOT (Static):      ../../ (Frontend-Root) ->  BSG_STATIC_DIR | ./public

   Reine Domänenlogik (api.mjs, store.mjs) bleibt UNVERÄNDERT. Jede Ersetzung
   ist assertiv (muss exakt einmal greifen) -> bricht laut ab, falls Upstream
   sich ändert, statt still falschen Code zu erzeugen.
   ===================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const out = process.argv[2];
if (!out) { console.error("Usage: node rewrite-paths.mjs <out-dir>"); process.exit(2); }

function edit(file, replacements) {
  const path = join(out, file);
  let src = readFileSync(path, "utf8");
  for (const { from, to, optional } of replacements) {
    const count = src.split(from).length - 1;
    if (count === 0) {
      if (optional) { console.log(`  · ${file}: (optional) nicht gefunden, übersprungen`); continue; }
      console.error(`\n✗ ${file}: Muster nicht gefunden:\n    ${from}\n  Upstream geändert? rewrite-paths.mjs anpassen.`);
      process.exit(1);
    }
    if (!optional && count !== 1) {
      console.error(`\n✗ ${file}: Muster ${count}× gefunden (erwartet: 1):\n    ${from}`);
      process.exit(1);
    }
    src = src.split(from).join(to);
    console.log(`  ✓ ${file}: ${from.slice(0, 56)}${from.length > 56 ? "…" : ""}`);
  }
  writeFileSync(path, src);
}

const DATA_FROM = 'new URL("../api-contract/data/", import.meta.url)';
const DATA_TO = 'new URL("./data/", import.meta.url)';

edit("index.mjs", [
  // node:path um resolve() erweitern (für BSG_STATIC_DIR).
  { from: "{ extname, normalize, join, sep }", to: "{ extname, normalize, join, sep, resolve }" },
  // Static-Root: Frontend-Artefakt liegt daneben (Option A), per Env überschreibbar.
  {
    from: 'fileURLToPath(new URL("../../", import.meta.url))',
    to: '(process.env.BSG_STATIC_DIR ? resolve(process.env.BSG_STATIC_DIR) : fileURLToPath(new URL("./public", import.meta.url)))',
  },
  { from: DATA_FROM, to: DATA_TO },
  // Static-Deny-Liste auf die Verzeichnisse dieses Repos anpassen (greift nur,
  // falls BSG_STATIC_DIR auf die Repo-Wurzel statt ./public zeigt).
  {
    from: 'new Set([".git", ".github", "packages", "tests", "tools", "deploy", "docs", "node_modules"])',
    to: 'new Set([".git", ".github", "node_modules", "contract", "data", "tools"])',
  },
  // Kommentare bestmöglich angleichen (nicht erzwungen).
  { from: "// Repo-Root (Frontend-Workspace)", to: "// Static-Root (Option A: Frontend-Artefakt daneben)", optional: true },
  { from: "Kanonische Seeds: das data/ des Contract-Packages (@crypticalcode/api-contract) – dieselbe Quelle,", to: "Laufzeit-Seeds: ./data/ (pfadbasiert, install-frei) – vendored aus contract/data/, dieselbe Quelle,", optional: true },
  { from: "gegen die die Contract-Tests prüfen. Das Frontend vendored eine Kopie nach assets/data/.", to: "gegen die die Contract-Tests prüfen. tools/vendor-seeds.mjs hält data/ == contract/data/.", optional: true },
]);

edit("persistence.mjs", [
  { from: DATA_FROM, to: DATA_TO },
  { from: "// Kanonische Seeds aus dem Contract-Package (@crypticalcode/api-contract).", to: "// Laufzeit-Seeds aus ./data/ (vendored aus contract/data/).", optional: true },
]);

console.log("\nPfade umgeschrieben.");
