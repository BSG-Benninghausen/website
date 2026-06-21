/* =====================================================================
   detect-contract-change.mjs – erkennt /api/*-Vertragsänderungen im Diff.

   Eine Änderung berührt den Vertrag, wenn der Diff:
     • die Route-Tabelle in assets/js/mock-api.js oder packages/backend/api.mjs
       ändert (Schlüssel "METHOD /api/..."), ODER
     • den FEATURES-Katalog ändert ({ key, label, status }), ODER
     • packages/api-contract/** berührt (Suite *.test.mjs oder Seed data/*.json).

   Steuert den Backend-Schritt (repository_dispatch) und den Semver-Bump:
     added route  -> minor   |  removed/renamed route -> major  |  seed/behavior -> patch

   Aufruf:
     node tools/detect-contract-change.mjs <diff>               # JSON
     node tools/detect-contract-change.mjs --exit-code <diff>   # Exit 10 wenn geändert
     node tools/detect-contract-change.mjs --bump <diff>        # nur "major|minor|patch|none"

   Zero-dep, importierbar (für die Tests).
   ===================================================================== */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const ROUTE_FILES = ["assets/js/mock-api.js", "packages/backend/api.mjs"];
const ROUTE_RE = /["'](GET|POST|PUT|DELETE|PATCH)\s+(\/api\/[^"']+)["']\s*:/;
const FEATURE_RE = /\{\s*key:\s*["']([\w-]+)["']\s*,\s*label:/;

/* Minimaler Diff-Parser (bewusst eigenständig, damit dieses Tool auch im
   Backend-Repo ohne classify-diff.mjs läuft). */
export function parseDiff(text) {
  const files = [];
  let cur = null;
  for (const line of String(text).split("\n")) {
    const git = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (git) { cur = { path: git[2], added: [], removed: [] }; files.push(cur); continue; }
    if (!cur) continue;
    if (/^(\+\+\+|---|index|new file|deleted file|rename|similarity|old mode|new mode|@@|\\ )/.test(line)) continue;
    if (line.startsWith("+")) cur.added.push(line.slice(1));
    else if (line.startsWith("-")) cur.removed.push(line.slice(1));
  }
  return files;
}

const collect = (lines, re, group) => {
  const out = new Set();
  for (const t of lines) { const m = t.match(re); if (m) out.add(group === 2 ? `${m[1]} ${m[2]}` : m[1]); }
  return out;
};

export function detectContractChange(diffText) {
  const files = parseDiff(diffText);
  const added = new Set(), removed = new Set();
  const featuresAdded = new Set(), featuresRemoved = new Set();
  const changed_seeds = new Set();
  let contractTests = false;

  for (const f of files) {
    if (f.path.startsWith("packages/api-contract/")) {
      if (f.path.endsWith(".test.mjs")) contractTests = true;
      const seed = f.path.match(/packages\/api-contract\/data\/(.+\.json)$/);
      if (seed) changed_seeds.add(seed[1]);
    }
    if (ROUTE_FILES.includes(f.path)) {
      for (const r of collect(f.added, ROUTE_RE, 2)) added.add(r);
      for (const r of collect(f.removed, ROUTE_RE, 2)) removed.add(r);
      for (const k of collect(f.added, FEATURE_RE, 1)) featuresAdded.add(k);
      for (const k of collect(f.removed, FEATURE_RE, 1)) featuresRemoved.add(k);
    }
  }

  // Reine Verschiebung (gleiche Route +/-) ist keine Vertragsänderung.
  const added_routes = [...added].filter((r) => !removed.has(r)).sort();
  const removed_routes = [...removed].filter((r) => !added.has(r)).sort();
  const changed_features = [...new Set([...featuresAdded, ...featuresRemoved].filter(
    (k) => featuresAdded.has(k) !== featuresRemoved.has(k)))].sort();

  const contract_changed =
    added_routes.length > 0 || removed_routes.length > 0 ||
    changed_features.length > 0 || changed_seeds.size > 0 || contractTests;

  let bump = "none";
  if (contract_changed) {
    if (removed_routes.length) bump = "major";
    else if (added_routes.length || changed_features.length) bump = "minor";
    else bump = "patch"; // nur Seeds/Tests/Verhalten
  }

  return {
    contract_changed, bump,
    added_routes, removed_routes,
    changed_features, changed_seeds: [...changed_seeds].sort(),
    contract_tests_changed: contractTests,
  };
}

/* ---------- CLI ---------- */
function readInput(args) {
  const fileArg = args.find((a) => !a.startsWith("--"));
  return fileArg ? readFileSync(fileArg, "utf8") : readFileSync(0, "utf8");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2);
    const r = detectContractChange(readInput(args));
    if (args.includes("--bump")) { console.log(r.bump); }
    else { console.log(JSON.stringify(r, null, 2)); }
    if (args.includes("--exit-code") && r.contract_changed) process.exit(10);
  } catch (e) { console.error("Fehler:", e.message); process.exit(1); }
}
