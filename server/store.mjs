/* =====================================================================
   store.mjs · Persistenz für den Backend-Store (zero-dep, node:fs).
   ---------------------------------------------------------------------
   Hält den In-Memory-`db` als JSON-Snapshot auf der Platte (spiegelt das
   localStorage-Modell des Mocks). Opt-in: greift nur, wenn server/index.mjs
   ein `dataFile` (Env BSG_DATA_FILE) durchreicht — ohne das verhält sich das
   Backend exakt wie vorher (rein in-memory).

   Persistiert wird ausschließlich `db` (Inhalte/Stammdaten), NICHT `sessions`
   (Tokens bleiben flüchtig). Schreiben ist **atomar** (tmp + rename) und das
   Laden **fail-safe** (defekter/fehlender Snapshot -> null -> Aufrufer seedet).

   Dies ist zugleich die Naht für spätere Mehrmandantenfähigkeit: ein
   Multi-Tenant-Server hält je Mandant ein eigenes `dataFile`.
   ===================================================================== */
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

/* Snapshot laden. Fehlt die Datei oder ist sie kaputt -> null (kein Crash). */
export function loadSnapshot(file) {
  if (!file || !existsSync(file)) return null;
  try {
    const raw = readFileSync(file, "utf8");
    if (!raw.trim()) return null;
    const data = JSON.parse(raw);
    // Nur ein einfaches Objekt ist ein gültiger Snapshot – Arrays/Primitive verwerfen,
    // damit semantisch falsche, aber syntaktisch gültige Dateien fail-safe auf null fallen.
    return (data && typeof data === "object" && !Array.isArray(data)) ? data : null;
  } catch (e) {
    return null;
  }
}

/* Snapshot atomar schreiben: erst in <file>.tmp, dann umbenennen. Ein Crash
   mitten im Schreiben lässt damit den alten Snapshot intakt. */
export function saveSnapshot(file, db) {
  if (!file) return;
  const dir = dirname(file);
  if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmp = file + ".tmp";
  writeFileSync(tmp, JSON.stringify(db));
  renameSync(tmp, file);
}
