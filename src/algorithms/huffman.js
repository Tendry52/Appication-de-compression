/**
 * Codage de Huffman sur les octets.
 */
import { BitReader, BitWriter } from "../utils/bits.js";
import { buildLengths, buildTable, decodeSymbol, readLengths, writeLengths } from "../utils/huffman-tables.js";

export const huffman = {
  id: 2,
  name: "Huffman",

  encode(data) {
    // 1. Fréquence de chaque octet
    const freq = new Array(256).fill(0);
    for (const byte of data) freq[byte]++;
    // 2. Codes de Huffman
    const lengths = buildLengths(freq);
    const table = buildTable(lengths);
    // 3. Écriture : table puis données
    const writer = new BitWriter();
    writeLengths(writer, lengths);
    for (const byte of data) writer.write(table.code[byte], table.length[byte]);
    return writer.finish();
  },

  decode(payload, size) {
    const reader = new BitReader(payload);
    const table = buildTable(readLengths(reader, 256));
    const out = new Uint8Array(size);
    for (let i = 0; i < size; i++) out[i] = decodeSymbol(reader, table);
    return out;
  },
};
