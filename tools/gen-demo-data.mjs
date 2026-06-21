/* =====================================================================
   gen-demo-data.mjs – Generator für assets/data/demo-data.json
   ---------------------------------------------------------------------
   Einmaliger, abhängigkeitsfreier Generator (nur node:-Builtins). Erzeugt
   die Beispiel-Stammdaten (Nutzer, Vereinsämter, Mitgliedschaften) samt
   kleiner Platzhalter-Avatare (gültige PNG-Data-URLs) und schreibt sie nach
   assets/data/demo-data.json. Mock (ensureDemo) und echtes Backend (init)
   seeden aus dieser Datei – gleiche Quelle, volle Parität.

   Neu erzeugen:  node tools/gen-demo-data.mjs
   ===================================================================== */
import zlib from "node:zlib";
import { writeFileSync } from "node:fs";

/* ---------- Minimaler PNG-Encoder (Truecolor RGB, ohne Deps) ---------- */
const crcTable = (() => {
  const t = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const t = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
};
function makePNG(w, h, pixel) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  let p = 0;
  for (let y = 0; y < h; y++) {
    raw[p++] = 0; // Filter: None
    for (let x = 0; x < w; x++) { const [r, g, b] = pixel(x, y); raw[p++] = r; raw[p++] = g; raw[p++] = b; }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // 8-bit, color type 2 (RGB)
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

/* ---------- Platzhalter-Avatar: Silhouette auf farbigem Grund ---------- */
const LIGHT = [238, 240, 245];
const PALETTE = [
  [37, 99, 235],   // Blau
  [220, 38, 38],   // Rot
  [22, 163, 74],   // Grün
  [202, 138, 4],   // Bernstein
  [124, 58, 237],  // Violett
  [13, 148, 136],  // Petrol
];
function avatarDataUrl(bg) {
  const W = 128, H = 128;
  const png = makePNG(W, H, (x, y) => {
    const dxh = x - 64, dyh = y - 48; if (dxh * dxh + dyh * dyh <= 26 * 26) return LIGHT;      // Kopf
    const dxs = (x - 64) / 48, dys = (y - 122) / 42; if (dxs * dxs + dys * dys <= 1) return LIGHT; // Schultern
    return bg;
  });
  return "data:image/png;base64," + png.toString("base64");
}
const AV = PALETTE.map(avatarDataUrl);

/* ---------- Stammdaten ---------- */
const ADDR1 = { street: "Musterstraße 12", zip: "12345", city: "Musterstadt" };
const ADDR2 = { street: "Beispielweg 7", zip: "12345", city: "Musterstadt" };
const ADDR3 = { street: "Am Sportplatz 3", zip: "12345", city: "Musterstadt" };
const IBAN = "DE89 3704 0044 0532 0130 00"; // gültige Demo-IBAN (Mod-97)
const TS = (d) => d + "T08:00:00.000Z";

const users = [
  // Vorstand (Rollen geben Rechte)
  { id: "usr-demo-vorsitz1", name: "Markus Muster", email: "markus.muster@example.com", address: ADDR1, iban: IBAN, photo: AV[0], roles: ["vorsitz1"], createdAt: TS("2023-01-15") },
  { id: "usr-demo-vorsitz2", name: "Sabine Muster", email: "sabine.muster@example.com", address: null, iban: null, photo: AV[1], roles: ["vorsitz2"], createdAt: TS("2023-01-15") },
  { id: "usr-demo-kasse", name: "Thomas Muster", email: "thomas.muster@example.com", address: ADDR2, iban: IBAN, photo: AV[2], roles: ["kassenwart"], createdAt: TS("2023-01-15") },
  // Schriftführerin: öffentliches Amt OHNE Rechte (Rolle "member")
  { id: "usr-demo-schrift", name: "Petra Muster", email: "petra.muster@example.com", address: null, iban: null, photo: AV[3], roles: ["member"], createdAt: TS("2023-02-01") },

  // Trainerteam
  { id: "usr-demo-trainer1", name: "Jens Muster", email: "jens.muster@example.com", address: null, iban: null, photo: AV[4], roles: ["trainer"], createdAt: TS("2023-03-10") },
  { id: "usr-demo-trainer2", name: "Lena Muster", email: "lena.muster@example.com", address: null, iban: null, photo: AV[5], roles: ["trainer"], createdAt: TS("2023-03-10") },
  // Co-Trainer: öffentliches Amt OHNE Rechte (Rolle "member")
  { id: "usr-demo-cotrainer", name: "Mike Muster", email: "mike.muster@example.com", address: null, iban: null, photo: AV[0], roles: ["member"], createdAt: TS("2023-09-01") },

  // Pressewartin: Rechte OHNE öffentliches Amt (keine Position)
  { id: "usr-demo-presse", name: "Carla Muster", email: "carla.muster@example.com", address: null, iban: null, photo: AV[1], roles: ["pressewart"], createdAt: TS("2023-05-20") },

  // Mitglieds-Haushalte
  { id: "usr-demo-haus1", name: "Anja Muster", email: "anja.muster@example.com", address: ADDR1, iban: IBAN, photo: AV[2], roles: ["member"], createdAt: TS("2024-08-01") },
  { id: "usr-demo-haus2", name: "Bernd Beispiel", email: "bernd.beispiel@example.com", address: ADDR3, iban: IBAN, photo: AV[3], roles: ["member"], createdAt: TS("2024-08-15") },
];

const positions = [
  // Vorstand
  { id: "pos-demo-1", userId: "usr-demo-vorsitz1", group: "vorstand", label: "1. Vorsitzender", order: 10 },
  { id: "pos-demo-2", userId: "usr-demo-vorsitz2", group: "vorstand", label: "2. Vorsitzende", order: 20 },
  { id: "pos-demo-3", userId: "usr-demo-kasse", group: "vorstand", label: "Kassenwart", order: 30 },
  { id: "pos-demo-4", userId: "usr-demo-schrift", group: "vorstand", label: "Schriftführerin", order: 40 },
  // Trainerteam
  { id: "pos-demo-5", userId: "usr-demo-trainer1", group: "trainer", label: "Cheftrainer", order: 10 },
  { id: "pos-demo-6", userId: "usr-demo-trainer2", group: "trainer", label: "Trainerin Kindergruppe", order: 20 },
  { id: "pos-demo-7", userId: "usr-demo-cotrainer", group: "trainer", label: "Co-Trainer", order: 30 },
  // Carla Feder bewusst ohne Position (Rechte ohne öffentliche Anzeige)
];

/* Mitgliedschaften – Folgefelder vorberechnet (Jahrgangsprinzip, Stand 2026).
   ageCategory/fee aus membership-types.json; weightClass gültig laut weight-classes.json. */
const memberships = [
  { id: "mem-demo-1", userId: "usr-demo-haus1", firstName: "Anja", lastName: "Muster", birthdate: "1986-03-14", photo: AV[3], weightClass: "-63 kg", belt: "Braungurt", gender: "weiblich", nationality: "Deutsch", ageCategory: "erwachsene", categoryLabel: "Erwachsene", individualFee: 12, passNumber: "MV-0001", status: "aktiv", startedAt: TS("2024-08-01") },
  { id: "mem-demo-2", userId: "usr-demo-haus1", firstName: "Leon", lastName: "Muster", birthdate: "2016-07-02", photo: AV[4], weightClass: "-34 kg", belt: "Gelbgurt", gender: "männlich", nationality: "Deutsch", ageCategory: "kind", categoryLabel: "Kind", individualFee: 7, passNumber: "MV-0002", status: "aktiv", startedAt: TS("2024-08-01") },
  { id: "mem-demo-3", userId: "usr-demo-haus2", firstName: "Bernd", lastName: "Beispiel", birthdate: "1979-11-23", photo: AV[5], weightClass: "-81 kg", belt: "1. Dan (Schwarzgurt)", gender: "männlich", nationality: "Deutsch", ageCategory: "erwachsene", categoryLabel: "Erwachsene", individualFee: 12, passNumber: "MV-0003", status: "aktiv", startedAt: TS("2024-08-15") },
  { id: "mem-demo-4", userId: "usr-demo-haus2", firstName: "Mia", lastName: "Beispiel", birthdate: "2012-05-09", photo: AV[0], weightClass: "-48 kg", belt: "Orangegurt", gender: "weiblich", nationality: "Deutsch", ageCategory: "jugend", categoryLabel: "Jugend", individualFee: 9, passNumber: "MV-0004", status: "aktiv", startedAt: TS("2024-08-15") },
  { id: "mem-demo-5", userId: "usr-demo-haus2", firstName: "Noah", lastName: "Beispiel", birthdate: "2018-09-30", photo: AV[1], weightClass: "-27 kg", belt: "Weiß-Gelb", gender: "männlich", nationality: "Deutsch", ageCategory: "kind", categoryLabel: "Kind", individualFee: 7, passNumber: "MV-0005", status: "aktiv", startedAt: TS("2025-01-10") },
];

const out = {
  _generatedBy: "tools/gen-demo-data.mjs",
  _hinweis: "Beispiel-Stammdaten (Demo-Seed). Wird von mock-api.js (ensureDemo) und packages/backend/api.mjs (init) eingespielt. Nicht von Hand editieren – über den Generator neu erzeugen, danach `node tools/vendor-seeds.mjs` ausführen.",
  passCounter: memberships.length,
  users,
  positions,
  memberships,
};

// Kanonische Seed-Quelle = data/ des Contract-Packages. Danach nach assets/data/ vendoren.
const target = new URL("../packages/api-contract/data/demo-data.json", import.meta.url);
writeFileSync(target, JSON.stringify(out, null, 2) + "\n");
console.log("demo-data.json geschrieben:", users.length, "Nutzer,", positions.length, "Ämter,", memberships.length, "Mitgliedschaften.");
console.log("Hinweis: `node tools/vendor-seeds.mjs` ausführen, um assets/data/ zu aktualisieren.");
