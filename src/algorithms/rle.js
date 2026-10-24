/**
 * RLE
 */
export const rle = {
  id: 1,
  name: "RLE",

  /** @param {Uint8Array} data @returns {Uint8Array} */
  encode(data) {
    const out = [];
    for (let i = 0; i < data.length; ) {
      let j = i;
      while (j < data.length && data[j] === data[i] && j - i < 255) j++;
      out.push(data[i], j - i);
      i = j;
    }
    return Uint8Array.from(out);
  },

  /** @param {Uint8Array} payload @param {number} size taille d'origine */
  decode(payload, size) {
    const out = new Uint8Array(size);
    let pos = 0;
    for (let i = 0; i + 1 < payload.length; i += 2) {
      for (let r = 0; r < payload[i + 1]; r++) out[pos++] = payload[i];
    }
    return out;
  },
};
