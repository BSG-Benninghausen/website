/* =====================================================================
   gen-placeholder-icons.mjs – erzeugt vereinsneutrale Platzhalter-Grafiken
   (Logo, Favicon, PWA-Icons) ohne externe Abhängigkeiten (nur node:zlib).

   Schreibt RGBA-PNGs nach assets/img/. Ein Fork ersetzt diese Dateien
   einfach durch sein eigenes Logo/Icons (gleiche Dateinamen).

   Aufruf:  node tools/gen-placeholder-icons.mjs
   ===================================================================== */
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const ACCENT = [37, 99, 235]; // #2563eb (neutrales Blau, vgl. theme.example.css)
const WHITE = [255, 255, 255];

/* ---- CRC32 (für PNG-Chunks) ---- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}
function encodePNG(size, rgbaAt) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0; // Filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = rgbaAt(x, y, size);
      raw[p++] = r; raw[p++] = g; raw[p++] = b; raw[p++] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

/* Gerundetes Quadrat (Marke) auf transparentem Grund + heller Punkt in der Mitte. */
function markPixel(x, y, size, { bleed = false } = {}) {
  const m = bleed ? 0 : size * 0.10;          // Rand (maskable: randlos)
  const r = bleed ? 0 : size * 0.20;          // Eckradius
  const inRounded = (px, py) => {
    if (px < m || py < m || px > size - m || py > size - m) return false;
    const dx = Math.min(px - (m + r), (size - m - r) - px, 0);
    const dy = Math.min(py - (m + r), (size - m - r) - py, 0);
    return dx * dx + dy * dy <= r * r;
  };
  const cx = size / 2, cy = size / 2;
  const dot = (x - cx) ** 2 + (y - cy) ** 2 <= (size * 0.17) ** 2;
  if (dot) return [...WHITE, 255];
  if (inRounded(x + 0.5, y + 0.5)) return [...ACCENT, 255];
  return bleed ? [...ACCENT, 255] : [0, 0, 0, 0];
}

const OUT = new URL("../assets/img/", import.meta.url);
const write = (name, size, opts) =>
  writeFileSync(new URL(name, OUT), encodePNG(size, (x, y, s) => markPixel(x, y, s, opts)));

write("drache.png", 256, {});               // Logo (data-club-logo Fallback)
write("favicon.png", 64, {});
write("apple-touch-icon.png", 180, {});
write("icon-192.png", 192, {});
write("icon-512.png", 512, {});
write("icon-maskable-512.png", 512, { bleed: true });
// dezente Hero-Deko: gleiche Marke, von styles.css ohnehin halbtransparent platziert
write("drache-light.png", 256, {});

console.log("Platzhalter-Grafiken geschrieben nach assets/img/");
