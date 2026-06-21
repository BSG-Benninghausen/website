/* =====================================================================
   prerender-branding.mjs – Marken-/Layout-Branding beim Deploy ins HTML
   stempeln (Precompile-Schritt, läuft in .github/workflows/deploy-pages.yml).
   ---------------------------------------------------------------------
   Single-Tenant-Fork: die Marken-Werte stehen in assets/data/club.bsg.json
   (Single Source of Truth). Dieses Skript stempelt die *strukturellen*
   Branding-Bits, die sonst erst main.js nach dem /api/club-Fetch setzt
   (Titel, theme-color, App-Titel, Markenname/-Untertitel, Logo) – damit das
   erste Paint stimmt, die Seite ohne JS korrekt aussieht und SEO/Title passen.

   Schnell ändernde *Inhalte* (Hero-/Seitentexte via data-site, editierbare
   Vereinsdaten) bleiben bewusst dynamisch über /api/* und werden NICHT
   gestempelt; main.js hydriert die gestempelten Defaults bei Live-Edits.

     node tools/prerender-branding.mjs           # stempeln (HTML aktualisieren)
     node tools/prerender-branding.mjs --check    # nur prüfen: HTML == club.bsg.json? (CI)

   Exit-Code != 0, wenn (im --check-Modus) eine Seite nicht aktuell gestempelt ist.
   ===================================================================== */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = new URL("../", import.meta.url);

const escHtml = (s) =>
  String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s) => escHtml(s).replace(/"/g, "&quot;");
// HTML-Entities im (bereits kodierten) Attributwert dekodieren, damit wir
// gleich wieder einheitlich escapen statt doppelt (&amp; -> &amp;amp;).
const decode = (s) =>
  String(s).replace(/&(amp|lt|gt|quot|#0*39|#x0*27);/gi, (_, e) => {
    e = e.toLowerCase();
    return e === "amp" ? "&" : e === "lt" ? "<" : e === "gt" ? ">" : e === "quot" ? '"' : "'";
  });

/** Branding aus `club` in `html` stempeln. Reine Funktion (idempotent). */
export function applyBranding(html, club) {
  const name = (club.name || club.brand_name || "").trim();
  const tagline = (club.tagline || "").trim();
  const m = html.match(/data-page-title="([^"]*)"/);
  const pageTitle = m ? decode(m[1].trim()) : "";
  // Gleiche Logik wie main.js: <Seitentitel> – <Verein>, sonst <Verein> – <Tagline>.
  const title = pageTitle ? `${pageTitle} – ${name}` : name + (tagline ? ` – ${tagline}` : "");

  let out = html;
  if (name) out = out.replace(/<title>[\s\S]*?<\/title>/, `<title>${escHtml(title)}</title>`);
  if (/^#[0-9a-fA-F]{3,8}$/.test((club.theme_color || "").trim()))
    out = out.replace(/(<meta name="theme-color" content=")[^"]*(">)/, `$1${club.theme_color.trim()}$2`);
  if (club.short_name)
    out = out.replace(/(<meta name="apple-mobile-web-app-title" content=")[^"]*(">)/, `$1${escAttr(club.short_name)}$2`);
  if (club.brand_name)
    out = out.replace(/(data-club="brand_name"[^>]*>)[^<]*/g, `$1${escHtml(club.brand_name)}`);
  if (club.brand_sub)
    out = out.replace(/(data-club="brand_sub"[^>]*>)[^<]*/g, `$1${escHtml(club.brand_sub)}`);
  if (club.logo)
    out = out.replace(/(<img class="brand__logo" src=")[^"]*(")/g, `$1${escAttr(club.logo)}$2`);
  return out;
}

/* ---------- CLI ---------- */
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const check = process.argv.includes("--check");
  const club = JSON.parse(readFileSync(new URL("assets/data/club.bsg.json", ROOT), "utf8"));
  const pages = readdirSync(ROOT).filter((f) => f.endsWith(".html")).sort();

  let drift = 0;
  for (const f of pages) {
    const url = new URL(f, ROOT);
    const src = readFileSync(url, "utf8");
    if (!src.includes("data-club-site")) continue; // nur Vereinsseiten
    const out = applyBranding(src, club);
    if (out === src) { if (!check) console.log(`  = ${f}`); continue; }
    drift++;
    if (check) console.log(`  ✗ ${f} (Branding nicht aktuell gestempelt)`);
    else { writeFileSync(url, out); console.log(`  → ${f}`); }
  }

  if (check && drift) {
    console.error(`\n${drift} Seite(n) sind nicht aktuell gebrandet. Führe \`node tools/prerender-branding.mjs\` aus und committe.`);
    process.exit(1);
  }
  console.log(check
    ? "\nBranding stimmt mit assets/data/club.bsg.json überein."
    : `\nBranding gestempelt – ${drift} Seite(n) aktualisiert (${fileURLToPath(ROOT)}).`);
}
