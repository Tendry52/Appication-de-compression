/**
 * Codec d'image : DCT par blocs 8×8 + quantification (méthodes de ton cours),
 * puis LZ77 + Huffman sur le résultat.
 *
 */
import { ByteReader, ByteWriter } from "./bytes.js";
import { forwardMatrix, inverseMatrix, transform2d } from "./dct.js";
import { readRuns, writeRuns } from "./coefficients.js";
import { lz77 } from "../algorithms/lz77.js";

const HEADER_SIZE = 13; // largeur(4) hauteur(4) qualité(1) taille du flux(4)

// Matrices de quantification standard (JPEG, annexe K), rangées ligne par ligne
const LUMA = [16,11,10,16,24,40,51,61, 12,12,14,19,26,58,60,55, 14,13,16,24,40,57,69,56, 14,17,22,29,51,87,80,62,
  18,22,37,56,68,109,103,77, 24,35,55,64,81,104,113,92, 49,64,78,87,103,121,120,101, 72,92,95,98,112,100,103,99];
const CHROMA = [17,18,24,47,99,99,99,99, 18,21,26,66,99,99,99,99, 24,26,56,99,99,99,99,99, 47,66,99,99,99,99,99,99,
  ...new Array(32).fill(99)];

/** Ordre de lecture en zigzag : des basses vers les hautes fréquences. */
const ZIGZAG = (() => {
  const order = [];
  for (let s = 0; s < 15; s++) {
    const cells = [];
    for (let row = 0; row < 8; row++) { const col = s - row; if (col >= 0 && col < 8) cells.push(row * 8 + col); }
    order.push(...(s % 2 ? cells : cells.reverse()));
  }
  return order;
})();

/** Matrices adaptées à la qualité (1 = très compressé, 100 = très fidèle), formule IJG. */
function scaledTable(base, quality) {
  const scale = quality < 50 ? 5000 / quality : 200 - 2 * quality;
  return base.map((v) => Math.min(255, Math.max(1, Math.floor((v * scale + 50) / 100))));
}

const FORWARD = forwardMatrix(8);
const INVERSE = inverseMatrix(8);

/** RGBA -> trois plans Y, Cb, Cr (transparence aplatie sur du blanc). */
function toPlanes(rgba, w, h) {
  const Y = new Float32Array(w * h), Cb = new Float32Array(w * h), Cr = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const a = rgba[4 * i + 3] / 255, k = 255 * (1 - a);
    const r = rgba[4 * i] * a + k, g = rgba[4 * i + 1] * a + k, b = rgba[4 * i + 2] * a + k;
    Y[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    Cb[i] = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
    Cr[i] = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  }
  return { Y, Cb, Cr };
}

/** Réduit un plan de moitié en largeur et hauteur (moyenne de 2×2 pixels). */
function halve(plane, w, h) {
  const cw = Math.ceil(w / 2), ch = Math.ceil(h / 2), out = new Float32Array(cw * ch);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const x1 = Math.min(2 * x + 1, w - 1), y1 = Math.min(2 * y + 1, h - 1);
    out[y * cw + x] = (plane[2 * y * w + 2 * x] + plane[2 * y * w + x1] + plane[y1 * w + 2 * x] + plane[y1 * w + x1]) / 4;
  }
  return out;
}

/** DCT + quantification de tous les blocs d'un plan. */
function encodePlane(plane, w, h, Q, out) {
  const block = new Float64Array(64), tmp = new Float64Array(64), coef = new Int32Array(64);
  let previousDc = 0;
  for (let by = 0; by < Math.ceil(h / 8); by++) for (let bx = 0; bx < Math.ceil(w / 8); bx++) {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      // Au bord de l'image, on répète le dernier pixel pour compléter le bloc
      const px = Math.min(bx * 8 + x, w - 1), py = Math.min(by * 8 + y, h - 1);
      block[y * 8 + x] = plane[py * w + px] - 128;
    }
    transform2d(FORWARD, 8, block, tmp);
    for (let k = 0; k < 64; k++) coef[k] = Math.round(block[ZIGZAG[k]] / Q[ZIGZAG[k]]);
    out.svarint(coef[0] - previousDc); // le coefficient DC est codé en différence avec le bloc précédent
    previousDc = coef[0];
    writeRuns(out, coef, 1, 64);
  }
}

/** Opération inverse : renvoie un plan w×h. */
function decodePlane(reader, w, h, Q) {
  const plane = new Float32Array(w * h), block = new Float64Array(64), tmp = new Float64Array(64), coef = new Int32Array(64);
  let dc = 0;
  for (let by = 0; by < Math.ceil(h / 8); by++) for (let bx = 0; bx < Math.ceil(w / 8); bx++) {
    coef.fill(0);
    dc += reader.svarint();
    coef[0] = dc;
    readRuns(reader, coef, 1, 64);
    for (let k = 0; k < 64; k++) block[ZIGZAG[k]] = coef[k] * Q[ZIGZAG[k]];
    transform2d(INVERSE, 8, block, tmp);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const px = bx * 8 + x, py = by * 8 + y;
      if (px < w && py < h) plane[py * w + px] = block[y * 8 + x] + 128;
    }
  }
  return plane;
}

/**
 * @param {Uint8ClampedArray|Uint8Array} rgba  pixels RGBA, ligne par ligne
 * @param {number} quality  1..100
 * @returns {Uint8Array}
 */
export function encodeImage(rgba, width, height, quality) {
  const { Y, Cb, Cr } = toPlanes(rgba, width, height);
  const cw = Math.ceil(width / 2), ch = Math.ceil(height / 2);
  const stream = new ByteWriter();
  encodePlane(Y, width, height, scaledTable(LUMA, quality), stream);
  const chroma = scaledTable(CHROMA, quality);
  encodePlane(halve(Cb, width, height), cw, ch, chroma, stream);
  encodePlane(halve(Cr, width, height), cw, ch, chroma, stream);

  const raw = stream.bytes();
  const packed = lz77.encode(raw);
  const header = new ByteWriter();
  header.u32(width); header.u32(height); header.byte(quality); header.u32(raw.length);
  const hb = header.bytes(), out = new Uint8Array(hb.length + packed.length);
  out.set(hb); out.set(packed, hb.length);
  return out;
}

/** @returns {{rgba: Uint8ClampedArray, width: number, height: number}} */
export function decodeImage(payload) {
  const head = new ByteReader(payload);
  const width = head.u32(), height = head.u32(), quality = head.byte(), rawLength = head.u32();
  if (!width || !height || width * height > 2 ** 28 || quality < 1 || quality > 100) throw new Error("Image corrompue");
  const reader = new ByteReader(lz77.decode(payload.subarray(HEADER_SIZE), rawLength));
  const cw = Math.ceil(width / 2), ch = Math.ceil(height / 2);
  const Y = decodePlane(reader, width, height, scaledTable(LUMA, quality));
  const chroma = scaledTable(CHROMA, quality);
  const Cb = decodePlane(reader, cw, ch, chroma), Cr = decodePlane(reader, cw, ch, chroma);

  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x, c = (y >> 1) * cw + (x >> 1);
    const cb = Cb[c] - 128, cr = Cr[c] - 128;
    rgba[4 * i] = Y[i] + 1.402 * cr;
    rgba[4 * i + 1] = Y[i] - 0.344136 * cb - 0.714136 * cr;
    rgba[4 * i + 2] = Y[i] + 1.772 * cb;
    rgba[4 * i + 3] = 255;
  }
  return { rgba, width, height };
}

/** PSNR en dB entre l'original (aplati sur blanc) et l'image décodée. Plus c'est haut, mieux c'est. */
export function imagePsnr(original, decoded) {
  let squares = 0, count = 0;
  for (let i = 0; i < original.length / 4; i++) {
    const a = original[4 * i + 3] / 255;
    for (let c = 0; c < 3; c++) {
      const e = Math.round(original[4 * i + c] * a + 255 * (1 - a)) - decoded[4 * i + c];
      squares += e * e; count++;
    }
  }
  const mse = squares / count;
  return mse === 0 ? 99 : 10 * Math.log10((255 * 255) / mse);
}
