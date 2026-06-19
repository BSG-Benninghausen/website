/* =====================================================================
   index.mjs · BSG Benninghausen – HTTP-Schicht des echten Backends
   ---------------------------------------------------------------------
   Dünne Schale um api.mjs:
     • Cookie-Session (bsg_session) ⇄ in-process Token,
     • JSON-Request/Response für /api/*,
     • optionales Ausliefern der statischen Website (Repo-Root),
     • CORS für getrennten Frontend-Origin (credentials-fähig).

   Nur node:-Builtins, keine Abhängigkeiten.

     node server/index.mjs                 # Port 3000, dient /api/* + statisch
     PORT=8080 node server/index.mjs
     BSG_STATIC=0 node server/index.mjs    # nur API, keine statischen Dateien

   Contract-Tests dagegen:
     node server/index.mjs &
     TEST_BASE=http://localhost:3000 node tests/run.mjs
   ===================================================================== */
import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { extname, normalize, join, sep } from "node:path";
import { createApi } from "./api.mjs";

const PORT = Number(process.env.PORT) || 3000;
const SERVE_STATIC = process.env.BSG_STATIC !== "0";
const DEV = process.env.BSG_DEV !== "0";   // devCode + /api/test/reset nur in Dev/Test
// Session-Cookie als Secure markieren (Default: in Produktion an, in Dev aus; per Env steuerbar).
const SECURE_COOKIES = process.env.BSG_SECURE_COOKIES != null ? process.env.BSG_SECURE_COOKIES !== "0" : !DEV;
// CORS nur für explizit erlaubte Origins (Cookie-Auth!). Leer = kein Cross-Origin (same-origin reicht).
const CORS_ORIGINS = (process.env.BSG_CORS_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
const ROOT = fileURLToPath(new URL("../", import.meta.url));           // Repo-Root
const DATA_DIR = new URL("../assets/data/", import.meta.url);
// Repo-interne Verzeichnisse, die nie über das Static-Serving erreichbar sein sollen.
const DENY_STATIC = new Set([".git", ".github", "server", "tests", "node_modules"]);

const api = createApi({ dataDir: DATA_DIR, dev: DEV });

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

/* ----- Cookie-Helfer ----- */
function readCookie(header, name) {
  if (!header) return "";
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return "";
}
const secureFlag = SECURE_COOKIES ? "; Secure" : "";
const sessionSetCookie = (token) => `bsg_session=${token}; Path=/; HttpOnly; SameSite=Lax${secureFlag}`;
const sessionClearCookie = () => `bsg_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureFlag}`;

/* ----- CORS: nur für Origins aus der Allowlist (BSG_CORS_ORIGINS) ----- */
function applyCors(req, headers) {
  const origin = req.headers.origin;
  if (origin && CORS_ORIGINS.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Vary"] = "Origin";
    headers["Access-Control-Allow-Credentials"] = "true";
    headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type";
  }
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => { size += c.length; if (size <= 4_000_000) chunks.push(c); });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", () => resolve(""));
  });
}

async function serveStatic(req, res) {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, "http://x").pathname); }
  catch { res.writeHead(400).end("Bad Request"); return; }
  if (pathname === "/" || pathname.endsWith("/")) pathname += "index.html";

  // Pfad-Traversal verhindern: aufgelöster Pfad muss innerhalb ROOT liegen.
  const rel = normalize(pathname).replace(/^(\.\.[/\\])+/, "").replace(/^[/\\]+/, "");
  const filePath = join(ROOT, rel);
  if (filePath !== ROOT.replace(/[/\\]$/, "") && !filePath.startsWith(ROOT.replace(/[/\\]$/, "") + sep)) {
    res.writeHead(403).end("Forbidden"); return;
  }
  // Repo-interne Pfade & versteckte Dateien (Dotfiles/-Verzeichnisse) nicht ausliefern.
  const segs = rel.split(/[/\\]+/).filter(Boolean);
  if (segs.some((s) => s.startsWith(".")) || (segs[0] && DENY_STATIC.has(segs[0]))) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }); res.end("Not found"); return;
  }
  try {
    const data = await readFile(filePath);
    const type = MIME[extname(filePath).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-cache" });
    res.end(data);
  } catch {
    // SPA-untypisch: 404-Seite des Projekts ausliefern, falls vorhanden.
    try {
      const fallback = await readFile(join(ROOT, "404.html"));
      res.writeHead(404, { "Content-Type": MIME[".html"] });
      res.end(fallback);
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
    }
  }
}

const server = http.createServer(async (req, res) => {
  const method = (req.method || "GET").toUpperCase();
  let path;
  try { path = new URL(req.url, "http://x").pathname; } catch { path = req.url; }

  // CORS-Preflight
  if (method === "OPTIONS") {
    const headers = {};
    applyCors(req, headers);
    res.writeHead(204, headers);
    res.end();
    return;
  }

  if (path.startsWith("/api/")) {
    const raw = (method === "GET" || method === "HEAD") ? "" : await readBody(req);
    let body = {};
    if (raw) { try { body = JSON.parse(raw); } catch { body = {}; } }

    const token = readCookie(req.headers.cookie, "bsg_session");
    const result = await api.handle({ method, path, body }, token);

    const headers = { "Content-Type": "application/json; charset=utf-8" };
    applyCors(req, headers);
    if (result.session && result.session.set) headers["Set-Cookie"] = sessionSetCookie(result.session.set);
    else if (result.session && result.session.clear) headers["Set-Cookie"] = sessionClearCookie();

    res.writeHead(result.status, headers);
    res.end(JSON.stringify(result.body));
    return;
  }

  if (!SERVE_STATIC) {
    res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: false, message: "Nur /api/* aktiviert (BSG_STATIC=0)." }));
    return;
  }
  if (method !== "GET" && method !== "HEAD") {
    res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Method Not Allowed");
    return;
  }
  await serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`BSG-Backend läuft auf http://localhost:${PORT}  (statisch: ${SERVE_STATIC ? "an" : "aus"}, dev: ${DEV ? "an" : "aus"})`);
  console.log(`Contract-Tests:  TEST_BASE=http://localhost:${PORT} node tests/run.mjs`);
});
