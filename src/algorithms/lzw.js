/**
 * LZW (Lempel-Ziv-Welch).

 */
import { BitReader, BitWriter, bitLength } from "../utils/bits.js";

const RESET_EVERY = 65000;

export const lzw = {
  id: 3,
  name: "LZW",

  encode(data) {
    const writer = new BitWriter();
    const dict = new Map(); // clé = (code du préfixe)*256 + octet suivant
    let nextCode = 256;
    let emitted = 0;
    let current = data[0]; // plus long motif connu en cours de lecture

    for (let i = 1; i < data.length; i++) {
      const key = current * 256 + data[i];
      const known = dict.get(key);
      if (known !== undefined) { current = known; continue; }

      writer.write(current, bitLength(256 + emitted)); // on émet le motif connu
      dict.set(key, nextCode++);                       // et on mémorise motif + octet
      emitted++;
      current = data[i];
      if (emitted === RESET_EVERY) { dict.clear(); nextCode = 256; emitted = 0; }
    }
    if (data.length > 0) writer.write(current, bitLength(256 + emitted));
    return writer.finish();
  },

  decode(payload, size) {
    const reader = new BitReader(payload);
    const out = new Uint8Array(size);
    // Entrée du dictionnaire n >= 256 = (entrée prefix[n]) suivie de l'octet suffix[n]
    const prefix = new Int32Array(65600);
    const suffix = new Uint8Array(65600);
    const buffer = new Uint8Array(65600);
    const firstByte = (code) => { while (code >= 256) code = prefix[code]; return code; };

    let nextCode = 256;
    let read = 0;
    let previous = -1;
    let pos = 0;

    while (pos < size) {
      const code = reader.read(bitLength(256 + read));
      if (previous >= 0) {
        // Cas particulier : code == nextCode (motif de type KwKwK), pas encore dans le dictionnaire
        if (code > nextCode) throw new Error("Données LZW corrompues");
        prefix[nextCode] = previous;
        suffix[nextCode] = firstByte(code < nextCode ? code : previous);
        nextCode++;
      }
      // Reconstruction du motif en remontant la chaîne (il sort à l'envers)
      let len = 0;
      let c = code;
      while (c >= 256) { buffer[len++] = suffix[c]; c = prefix[c]; }
      buffer[len++] = c;
      for (let i = len - 1; i >= 0; i--) out[pos++] = buffer[i];

      previous = code;
      read++;
      if (read === RESET_EVERY) { nextCode = 256; read = 0; previous = -1; }
    }
    return out;
  },
};
