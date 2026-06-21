/* =====================================================================
   bump-cachebust.mjs – erhöht das Cache-Busting um 1.

   Komplement zu guard-versions.mjs: jenes PRÜFT nur die Konsistenz
   (alle ?v=N gleich, service-worker.js VERSION passt); dieses Skript
   ERHÖHT N -> N+1 auf allen *.html und in service-worker.js, damit
   Nutzer nach einer JS/CSS-Änderung frischen Code bekommen.

   Der Mergeback-Gate/Proposer ruft dies deterministisch auf, wenn ein
   Produkt-Asset (assets/js/**, assets/css/styles.css) geändert wurde.

   Lauf:  node tools/bump-cachebust.mjs
   ===================================================================== */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const ROOT = new URL("../", import.meta.url);
const htmlFiles = readdirSync(ROOT).filter((f) => f.endsWith(".html")).sort();

let cur = null;
for (const f of htmlFiles) {
  const m = readFileSync(new URL(f, ROOT), "utf8").match(/\?v=(\d+)/);
  if (m) { cur = parseInt(m[1], 10); break; }
}
if (cur == null) { console.error("Keine ?v=N-Marker in *.html gefunden – nichts zu bumpen."); process.exit(1); }

const next = cur + 1;
for (const f of htmlFiles) {
  const u = new URL(f, ROOT);
  writeFileSync(u, readFileSync(u, "utf8").replace(/\?v=\d+/g, `?v=${next}`));
}
const sw = new URL("service-worker.js", ROOT);
writeFileSync(sw, readFileSync(sw, "utf8").replace(/(const\s+VERSION\s*=\s*["'])v\d+(["'])/, `$1v${next}$2`));

console.log(`Cache-Bust v${cur} -> v${next} (über ${htmlFiles.length} HTML-Seiten + service-worker.js).`);
