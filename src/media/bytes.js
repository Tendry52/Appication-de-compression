/** Écriture / lecture d'octets et d'entiers à taille variable (varint). */

export class ByteWriter {
  #a = [];
  byte(b) { this.#a.push(b & 255); }
  /** Entier 32 bits non signé, big-endian. */
  u32(v) { this.byte(v >>> 24); this.byte(v >>> 16); this.byte(v >>> 8); this.byte(v); }
  /** Entier >= 0 sur 1 octet par groupe de 7 bits (petites valeurs = 1 octet). */
  varint(n) {
    while (n >= 128) { this.#a.push((n % 128) | 128); n = Math.floor(n / 128); }
    this.#a.push(n);
  }
  /** Entier signé : 0,-1,1,-2,2… devient 0,1,2,3,4… puis varint. */
  svarint(v) { this.varint(v >= 0 ? v * 2 : -v * 2 - 1); }
  bytes() { return Uint8Array.from(this.#a); }
}

export class ByteReader {
  #b; pos = 0;
  constructor(bytes) { this.#b = bytes; }
  byte() {
    if (this.pos >= this.#b.length) throw new Error("Flux de données corrompu");
    return this.#b[this.pos++];
  }
  u32() { return ((this.byte() << 24) | (this.byte() << 16) | (this.byte() << 8) | this.byte()) >>> 0; }
  varint() {
    let n = 0, scale = 1, b;
    do { b = this.byte(); n += (b & 127) * scale; scale *= 128; } while (b & 128);
    return n;
  }
  svarint() { const z = this.varint(); return z % 2 ? -(z + 1) / 2 : z / 2; }
}
