/* =====================================================================
   classify-diff.mjs – Mergeback-Klassifizierer (Fork -> Upstream).

   Liest einen Unified-Diff (Datei-Arg oder stdin) und entscheidet anhand
   von upstream-manifest.json, welcher Anteil einer Fork-Änderung ins
   generische Hauptrepo gehört. Die EINZIGE Quelle der Wahrheit für die
   Grenze generisch<->config ist upstream-manifest.json.

   Modi:
     node tools/classify-diff.mjs <diff>              # Verdict-JSON ausgeben
     node tools/classify-diff.mjs --neutralize <diff> # Include-Liste + Ersetzungen
     node tools/classify-diff.mjs --verify <diff>     # Gate: 100% generisch & identitätsfrei?
       (--verify: Exit 0 wenn sauber, Exit 2 wenn config/entangled/Identität enthalten)

   Verdict (default):
     { generic_files, config_files, entangled, forbidden_hits,
       verdict: "propose" | "nothing" | "needs_human" }
       - "nothing"     : nach Klassifizierung bleibt kein generischer Anteil.
       - "needs_human" : generisch und config in einem Hunk verschränkt (ENTANGLED).
       - "propose"     : es gibt einen sauberen generischen Anteil zum Vorschlagen.

   Zero-dep, importierbar (exportiert die Kernfunktionen für die Tests).
   ===================================================================== */
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

/* ---------- Manifest laden ---------- */
export function loadManifest(url = new URL("../upstream-manifest.json", import.meta.url)) {
  return JSON.parse(readFileSync(url, "utf8"));
}

/* ---------- Glob -> RegExp ---------- */
// ** = beliebige Zeichen inkl. "/"; * = innerhalb eines Pfadsegments.
export function globToRegExp(glob) {
  let re = "^";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") { re += ".*"; i++; }
    else if (c === "*") re += "[^/]*";
    else if (/[.+?^${}()|[\]\\]/.test(c)) re += "\\" + c;
    else re += c;
  }
  return new RegExp(re + "$");
}
const matchesAny = (path, globs) => globs.some((g) => globToRegExp(g).test(path));

/* ---------- Unified-Diff parsen ---------- */
// -> [{ path, added: [{n, text}], removed: [text] }]  (n = Zeilennr. neue Seite)
export function parseDiff(text) {
  const files = [];
  let cur = null, newLine = 0;
  for (const line of String(text).split("\n")) {
    const git = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (git) { cur = { path: git[2], added: [], removed: [] }; files.push(cur); newLine = 0; continue; }
    if (!cur) continue;
    if (line.startsWith("+++ ") || line.startsWith("--- ") || line.startsWith("index ") ||
        line.startsWith("new file") || line.startsWith("deleted file") ||
        line.startsWith("rename ") || line.startsWith("similarity ") ||
        line.startsWith("old mode") || line.startsWith("new mode") || line.startsWith("\\ ")) continue;
    const hh = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hh) { newLine = parseInt(hh[1], 10); continue; }
    if (line.startsWith("+")) { cur.added.push({ n: newLine, text: line.slice(1) }); newLine++; }
    else if (line.startsWith("-")) { cur.removed.push(line.slice(1)); }
    else { newLine++; } // Kontextzeile
  }
  return files;
}

/* ---------- Forbidden-Identity-Treffer ---------- */
function forbiddenRegexes(manifest) {
  return manifest.forbidden_patterns.map((p) => new RegExp(p, "i"));
}
function scanForbidden(file, lines, regexes, patterns) {
  const hits = [];
  for (const { n, text } of lines) {
    for (let i = 0; i < regexes.length; i++) {
      if (regexes[i].test(text)) hits.push({ file, line: n, pattern: patterns[i], text: text.trim() });
    }
  }
  return hits;
}

/* ---------- Sonderfall club-config.js (gemischte Datei) ----------
   Heuristik auf Zeileninhalt: Zeilen, die einen EXAMPLES-Eintrags-Key
   einleiten oder reine Array-/Objekt-Interpunktion sind, gelten als CONFIG;
   echte Logikzeilen als GENERIC. Beides in den Änderungen -> ENTANGLED. */
function classifyMixed(file, parsed, manifest, regexes, patterns) {
  const keyRe = new RegExp("^\\s*(" + manifest.club_config_entry_keys.join("|") + ")\\s*:", "i");
  const punctRe = /^\s*[{}\[\],]*\s*,?\s*$/;
  const declRe = /\bEXAMPLES\s*=/;
  const lines = parsed.added.concat(parsed.removed.map((t) => ({ n: 0, text: t })));
  let configLines = 0, genericLines = 0;
  for (const { text } of lines) {
    if (text.trim() === "") continue;
    if (declRe.test(text)) { configLines++; continue; }          // EXAMPLES-Deklaration selbst
    if (keyRe.test(text) || punctRe.test(text)) configLines++;
    else genericLines++;
  }
  const forbidden = scanForbidden(file, parsed.added, regexes, patterns);
  if (genericLines > 0 && configLines > 0) return { class: "entangled", forbidden };
  if (genericLines > 0) return { class: "generic", forbidden };
  return { class: "config", forbidden: [] }; // reine EXAMPLES-Änderung
}

/* ---------- Hauptklassifizierung ---------- */
export function classifyDiff(diffText, manifest = loadManifest()) {
  const regexes = forbiddenRegexes(manifest);
  const patterns = manifest.forbidden_patterns;
  const mixed = manifest.mixed_files || {};
  const files = parseDiff(diffText);

  const generic_files = [], config_files = [], entangled = [], unknown_files = [];
  let forbidden_hits = [];

  for (const f of files) {
    if (mixed[f.path]) {
      const r = classifyMixed(f.path, f, manifest, regexes, patterns);
      if (r.class === "entangled") { entangled.push(f.path); forbidden_hits.push(...r.forbidden); }
      else if (r.class === "generic") {
        if (r.forbidden.length) { entangled.push(f.path); forbidden_hits.push(...r.forbidden); }
        else generic_files.push(f.path);
      } else config_files.push(f.path);
      continue;
    }
    // config gewinnt bei Mehrdeutigkeit (fail-safe: nichts leaken)
    if (matchesAny(f.path, manifest.config_globs)) { config_files.push(f.path); continue; }
    if (matchesAny(f.path, manifest.generic_globs)) {
      const hits = scanForbidden(f.path, f.added, regexes, patterns);
      if (hits.length) { entangled.push(f.path); forbidden_hits.push(...hits); }
      else generic_files.push(f.path);
      continue;
    }
    // weder generic noch config -> unbekannt -> fail-safe als config behandeln (nicht vorschlagen)
    unknown_files.push(f.path); config_files.push(f.path);
  }

  let verdict;
  if (entangled.length) verdict = "needs_human";
  else if (generic_files.length === 0) verdict = "nothing";
  else verdict = "propose";

  return { generic_files, config_files, unknown_files, entangled, forbidden_hits, verdict };
}

/* ---------- --verify (Gate, Defense-in-Depth) ----------
   Ein vorgeschlagener Patch ist nur OK, wenn ALLE geänderten Dateien
   generisch sind UND keine verbotene Identität enthalten. */
export function verifyPatch(diffText, manifest = loadManifest()) {
  const r = classifyDiff(diffText, manifest);
  const problems = [];
  if (r.config_files.length) problems.push(`config/branding-Dateien im Patch: ${r.config_files.join(", ")}`);
  if (r.entangled.length) problems.push(`verschränkte (entangled) Dateien: ${r.entangled.join(", ")}`);
  if (r.forbidden_hits.length) problems.push(`Identitäts-Treffer: ${r.forbidden_hits.map((h) => `${h.file}:${h.line} /${h.pattern}/`).join("; ")}`);
  return { clean: problems.length === 0, problems, detail: r };
}

/* ---------- CLI ---------- */
function readInput(args) {
  const fileArg = args.find((a) => !a.startsWith("--"));
  if (fileArg) return readFileSync(fileArg, "utf8");
  return readFileSync(0, "utf8"); // stdin
}

function main(argv) {
  const args = argv.slice(2);
  const manifest = loadManifest();
  const diff = readInput(args);

  if (args.includes("--verify")) {
    const { clean, problems } = verifyPatch(diff, manifest);
    if (clean) { console.log("OK: Patch ist 100% generisch und identitätsfrei."); process.exit(0); }
    console.error("VERIFY FEHLGESCHLAGEN:");
    for (const p of problems) console.error("  ✗ " + p);
    process.exit(2);
  }

  if (args.includes("--neutralize")) {
    const r = classifyDiff(diff, manifest);
    console.log(JSON.stringify({
      verdict: r.verdict,
      include_files: r.generic_files,
      replacements: manifest.neutral_replacements,
      neutral_baseline: manifest.neutral_baseline,
    }, null, 2));
    return;
  }

  console.log(JSON.stringify(classifyDiff(diff, manifest), null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(process.argv); }
  catch (e) { console.error("Fehler:", e.message); process.exit(1); }
}
