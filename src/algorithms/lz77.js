/**
 * LZ77 + Huffman (principe de DEFLATE).
 */
import { BitReader, BitWriter, bitLength } from "../utils/bits.js";
import { buildLengths, buildTable, decodeSymbol, readLengths, writeLengths } from "../utils/huffman-tables.js";

const WINDOW = 32767;   // distance maximale : 32767 s'écrit sur 15 bits, la limite de la table des distances (16 entrées)
const MIN_MATCH = 3;
const MAX_MATCH = 258;
const MAX_CHAIN = 32;   // nombre de candidats testés par position (vitesse vs taux)


function tokenize(data) {
  const n = data.length;
  const head = new Int32Array(65536).fill(-1); 
  const prev = new Int32Array(n);              
  const tokens = [];
  const hash = (p) => ((data[p] << 8) ^ (data[p + 1] << 4) ^ data[p + 2]) & 65535;
  const insert = (p) => { if (p + 2 < n) { const h = hash(p); prev[p] = head[h]; head[h] = p; } };

  for (let i = 0; i < n; ) {
    let bestLen = 0;
    let bestDist = 0;
    if (i + 2 < n) {
      let cand = head[hash(i)];
      for (let tries = MAX_CHAIN; cand >= 0 && i - cand <= WINDOW && tries > 0; tries--) {
        let len = 0;
        while (len < MAX_MATCH && i + len < n && data[cand + len] === data[i + len]) len++;
        if (len > bestLen) { bestLen = len; bestDist = i - cand; if (len === MAX_MATCH) break; }
        cand = prev[cand];
      }
    }
    if (bestLen >= MIN_MATCH) {
      tokens.push([bestLen, bestDist]);
      for (let k = 0; k < bestLen; k++) insert(i + k);
      i += bestLen;
    } else {
      tokens.push(data[i]);
      insert(i);
      i++;
    }
  }
  return tokens;
}

export const lz77 = {
  id: 4,
  name: "LZ77 + Huffman",

  encode(data) {
    const tokens = tokenize(data);

    // Fréquences des deux alphabets
    const litFreq = new Array(256 + 256).fill(0);
    const distFreq = new Array(16).fill(0);
    for (const t of tokens) {
      if (typeof t === "number") litFreq[t]++;
      else { litFreq[256 + t[0] - MIN_MATCH]++; distFreq[bitLength(t[1])]++; }
    }
    const litLengths = buildLengths(litFreq);
    const distLengths = buildLengths(distFreq);
    const lit = buildTable(litLengths);
    const dist = buildTable(distLengths);

    const writer = new BitWriter();
    writeLengths(writer, litLengths);
    writeLengths(writer, distLengths);
    writer.write(tokens.length, 32);
    for (const t of tokens) {
      if (typeof t === "number") {
        writer.write(lit.code[t], lit.length[t]);
      } else {
        const sym = 256 + t[0] - MIN_MATCH;
        const bits = bitLength(t[1]);
        writer.write(lit.code[sym], lit.length[sym]);
        writer.write(dist.code[bits], dist.length[bits]);
        writer.write(t[1] - (1 << (bits - 1)), bits - 1); // bits de poids faible de la distance
      }
    }
    return writer.finish();
  },

  decode(payload, size) {
    const reader = new BitReader(payload);
    const lit = buildTable(readLengths(reader, 512));
    const dist = buildTable(readLengths(reader, 16));
    const count = reader.read(32);
    const out = new Uint8Array(size);
    let pos = 0;

    for (let i = 0; i < count; i++) {
      const sym = decodeSymbol(reader, lit);
      if (sym < 256) { out[pos++] = sym; continue; }
      const length = sym - 256 + MIN_MATCH;
      const bits = decodeSymbol(reader, dist);
      const distance = (1 << (bits - 1)) + reader.read(bits - 1);
      if (distance > pos) throw new Error("Distance LZ77 invalide");

      for (let k = 0; k < length; k++, pos++) out[pos] = out[pos - distance];
    }
    return out;
  },
};
