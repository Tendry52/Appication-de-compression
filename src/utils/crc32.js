/**
 * CRC32 (polynôme IEEE 802.3), utilisé pour vérifier qu'un fichier
 * décompressé est strictement identique à l'original.
 */

/** Table de 256 valeurs précalculées. */
const TABLE = new Uint32Array(256).map((_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});

/**
 * @param {Uint8Array} data
 * @returns {number} somme de contrôle sur 32 bits (non signée)
 */
export function crc32(data) {
  let crc = -1;
  for (let i = 0; i < data.length; i++) crc = TABLE[(crc ^ data[i]) & 255] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}
