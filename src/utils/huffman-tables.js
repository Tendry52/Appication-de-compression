/**
 * Outils Huffman partagés par `huffman.js` et `lz77.js`.
 *
 * On utilise un Huffman CANONIQUE : seules les longueurs de codes sont
 * stockées dans le fichier, les codes sont reconstruits identiquement
 * à la compression et à la décompression.
 */

/** Longueur maximale d'un code (sécurité pour la lecture bit à bit). */
const MAX_CODE_LENGTH = 24;

/**
 * Calcule la longueur du code de chaque symbole (algorithme de Huffman :
 * on fusionne répétitivement les deux nœuds de plus faible fréquence).
 * Si un code dépasse MAX_CODE_LENGTH, on aplatit les fréquences et on recommence.
 *
 * @param {number[]} freq  fréquence de chaque symbole
 * @returns {Uint8Array}   longueur de code par symbole (0 = symbole absent)
 */
export function buildLengths(freq) {
  let f = freq.slice();
  for (;;) {
    const lengths = new Uint8Array(f.length);
    // Chaque nœud garde la liste des symboles (feuilles) qu'il contient
    const nodes = [];
    f.forEach((weight, symbol) => weight > 0 && nodes.push({ weight, symbols: [symbol] }));

    if (nodes.length === 0) return lengths;
    if (nodes.length === 1) { lengths[nodes[0].symbols[0]] = 1; return lengths; }

    while (nodes.length > 1) {
      nodes.sort((a, b) => a.weight - b.weight);
      const a = nodes.shift();
      const b = nodes.shift();
      // Fusionner = descendre d'un niveau : les codes de tous leurs symboles s'allongent de 1 bit
      for (const s of a.symbols) lengths[s]++;
      for (const s of b.symbols) lengths[s]++;
      nodes.push({ weight: a.weight + b.weight, symbols: a.symbols.concat(b.symbols) });
    }
    if (Math.max(...lengths) <= MAX_CODE_LENGTH) return lengths;
    f = f.map((w) => (w ? (w + 1) >> 1 : 0));
  }
}

/**
 * Construit les codes canoniques à partir des longueurs.
 * @param {Uint8Array} lengths
 * @returns {{length: Uint8Array, code: Uint32Array, decode: Map<number, number>}}
 *   `length`/`code` servent à encoder, `decode` (clé = longueur*2^25 + code) à décoder.
 */
export function buildTable(lengths) {
  const symbols = [...lengths.keys()]
    .filter((s) => lengths[s] > 0)
    .sort((a, b) => lengths[a] - lengths[b] || a - b);

  const length = new Uint8Array(lengths.length);
  const code = new Uint32Array(lengths.length);
  const decode = new Map();
  let current = 0;
  let previousLength = lengths[symbols[0]] || 0;

  for (const s of symbols) {
    current <<= lengths[s] - previousLength; // on passe à des codes plus longs
    previousLength = lengths[s];
    length[s] = lengths[s];
    code[s] = current;
    decode.set(lengths[s] * 2 ** 25 + current, s);
    current++;
  }
  return { length, code, decode };
}

/** Écrit les longueurs de codes dans le flux (1 octet par symbole). */
export function writeLengths(writer, lengths) {
  for (const l of lengths) writer.write(l, 8);
}

/** Relit `count` longueurs de codes. */
export function readLengths(reader, count) {
  const lengths = new Uint8Array(count);
  for (let i = 0; i < count; i++) lengths[i] = reader.read(8);
  return lengths;
}

/**
 * Lit bit par bit jusqu'à reconnaître un code, et renvoie son symbole.
 * @param {import("./bits.js").BitReader} reader
 * @param {{decode: Map<number, number>}} table
 */
export function decodeSymbol(reader, table) {
  let code = 0;
  for (let length = 1; length <= MAX_CODE_LENGTH; length++) {
    code = (code << 1) | reader.read(1);
    const symbol = table.decode.get(length * 2 ** 25 + code);
    if (symbol !== undefined) return symbol;
  }
  throw new Error("Code Huffman invalide");
}
