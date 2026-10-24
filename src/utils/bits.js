/**
 * Lecture / écriture de bits, nécessaire pour Huffman et LZW
 * (les codes n'ont pas une taille multiple de 8 bits).
 * Les bits sont écrits du poids fort vers le poids faible.
 */

export class BitWriter {
  #bytes = [];
  #current = 0; // octet en cours de remplissage
  #count = 0;   // nombre de bits déjà placés dans #current

  /**
   * Écrit les `n` bits de poids faible de `value`.
   * @param {number} value
   * @param {number} n  entre 0 et 32
   */
  write(value, n) {
    for (let i = n - 1; i >= 0; i--) {
      this.#current = (this.#current << 1) | ((value >>> i) & 1);
      if (++this.#count === 8) {
        this.#bytes.push(this.#current);
        this.#current = 0;
        this.#count = 0;
      }
    }
  }

  /** Termine l'écriture (complète le dernier octet avec des 0) et renvoie les octets. */
  finish() {
    if (this.#count > 0) {
      this.#bytes.push(this.#current << (8 - this.#count));
      this.#current = 0;
      this.#count = 0;
    }
    return Uint8Array.from(this.#bytes);
  }
}

export class BitReader {
  #bytes;
  #pos = 0; // position en bits

  /** @param {Uint8Array} bytes */
  constructor(bytes) {
    this.#bytes = bytes;
  }

  /**
   * Lit `n` bits (0 à 32) et les renvoie comme entier non signé.
   * @throws {Error} si on dépasse la fin des données
   */
  read(n) {
    let value = 0;
    for (let i = 0; i < n; i++) {
      const byte = this.#bytes[this.#pos >> 3];
      if (byte === undefined) throw new Error("Fin de données inattendue");
      value = (value << 1) | ((byte >> (7 - (this.#pos & 7))) & 1);
      this.#pos++;
    }
    return value >>> 0;
  }
}

/** Nombre de bits nécessaires pour écrire `x` (ex. 5 -> 3, 256 -> 9). */
export const bitLength = (x) => 32 - Math.clz32(x);
