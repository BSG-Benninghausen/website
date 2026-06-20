/* =====================================================================
   guard-versions.mjs – Konsistenz-Wächter für das Cache-Busting.

   Prüft zwei Invarianten, die sonst leicht auseinanderlaufen:
     1. Alle lokalen `?v=N` in den `*.html` tragen DIESELBE Nummer.
     2. Diese Nummer stimmt mit `VERSION = "vN"` in `service-worker.js`
        überein (der Service-Worker baut seine Precache-URLs daraus).

   Hintergrund: Beim Ändern von JS/CSS muss `?v=N` auf allen Seiten UND
   die SW-VERSION mitwandern – sonst bekommen Nutzer veralteten Code bzw.
   der Service-Worker cached die falschen URLs. Dieser Wächter macht ein
   Vergessen im CI sichtbar (Exit-Code != 0).

   Lauf:  node tools/guard-versions.mjs
   ===================================================================== */
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const fail = (msg) => { console.error("  ✗ " + msg); process.exitCode = 1; };
const ok = (msg) => console.log("  ✓ " + msg);

console.log("\nVersions-Guard (Cache-Busting)\n");

// --- 1. Alle ?v=N aus den HTML-Seiten einsammeln ---------------------
const htmlFiles = readdirSync(ROOT).filter((f) => f.endsWith(".html")).sort();
const seen = new Map();            // version -> [files]
for (const f of htmlFiles) {
  const text = readFileSync(new URL(f, new URL("../", import.meta.url)), "utf8");
  for (const m of text.matchAll(/\?v=(\d+)/g)) {
    const v = m[1];
    if (!seen.has(v)) seen.set(v, new Set());
    seen.get(v).add(f);
  }
}

if (seen.size === 0) {
  fail("Keine ?v=N-Marker in *.html gefunden – Cache-Busting fehlt?");
} else if (seen.size > 1) {
  fail("Uneinheitliche ?v=N-Versionen in *.html:");
  for (const [v, files] of seen) console.error(`      v=${v}: ${[...files].join(", ")}`);
} else {
  const [v] = [...seen.keys()];
  ok(`Einheitliche HTML-Version v=${v} über ${htmlFiles.length} Seite(n).`);
}

// --- 2. Mit service-worker.js abgleichen -----------------------------
const htmlVersion = seen.size === 1 ? [...seen.keys()][0] : null;
const swText = readFileSync(new URL("service-worker.js", new URL("../", import.meta.url)), "utf8");
const swMatch = swText.match(/const\s+VERSION\s*=\s*["']v(\d+)["']/);

if (!swMatch) {
  fail('service-worker.js: konnte VERSION ("vN") nicht finden.');
} else if (htmlVersion && swMatch[1] !== htmlVersion) {
  fail(`SW-VERSION (v${swMatch[1]}) != HTML-Version (v${htmlVersion}).`);
} else if (htmlVersion) {
  ok(`service-worker.js VERSION=v${swMatch[1]} stimmt mit HTML überein.`);
}

if (process.exitCode) {
  console.error("\nVersions-Guard fehlgeschlagen.\n");
} else {
  console.log("\nVersions-Guard ok.\n");
}
