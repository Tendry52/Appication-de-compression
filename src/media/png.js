/** Écriture d'un PNG (RGB 8 bits) sans bibliothèque. Utilise CompressionStream (zlib) du navigateur / de Node. */
import { crc32 } from "../utils/crc32.js";

async function zlib(bytes) {
  const stream = new CompressionStream("deflate");
  const writer = stream.writable.getWriter();
  writer.write(bytes); writer.close();
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}

/** Un bloc PNG : longueur, type, données, CRC32(type + données). */
function chunk(type, data) {
  const out = new Uint8Array(12 + data.length), view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** @param {Uint8ClampedArray} rgba @returns {Promise<Uint8Array>} fichier .png */
export async function encodePng(rgba, width, height) {
  const rows = new Uint8Array(height * (width * 3 + 1)); // chaque ligne commence par l'octet de filtre 0
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const s = 4 * (y * width + x), d = y * (width * 3 + 1) + 1 + 3 * x;
    rows[d] = rgba[s]; rows[d + 1] = rgba[s + 1]; rows[d + 2] = rgba[s + 2];
  }
  const ihdr = new Uint8Array(13), view = new DataView(ihdr.buffer);
  view.setUint32(0, width); view.setUint32(4, height);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8 bits, couleur RVB, pas d'entrelacement
  const parts = [Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), chunk("IHDR", ihdr),
    chunk("IDAT", await zlib(rows)), chunk("IEND", new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let pos = 0;
  for (const p of parts) { out.set(p, pos); pos += p.length; }
  return out;
}
