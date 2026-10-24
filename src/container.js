/**
 * Format de fichier compressé .tdr
 *
 */
import { crc32 } from "./utils/crc32.js";
import { STORED_ID, getAlgorithm } from "./algorithms/index.js";
import { isMediaId } from "./media/index.js";

const HEADER_SIZE = 15;
const SIGNATURE = [0x54, 0x44, 0x52, 1]; // "TDR" + version

/** Assemble un fichier .tdr. */
export function pack({ algorithmId, size, crc, name, payload }) {
  const nameBytes = new TextEncoder().encode(name).slice(0, 200);
  const out = new Uint8Array(HEADER_SIZE + nameBytes.length + payload.length);
  const view = new DataView(out.buffer);
  out.set(SIGNATURE);
  out[4] = algorithmId;
  view.setUint32(5, size);
  view.setUint32(9, crc);
  view.setUint16(13, nameBytes.length);
  out.set(nameBytes, HEADER_SIZE);
  out.set(payload, HEADER_SIZE + nameBytes.length);
  return out;
}

/**
 * Lit un fichier .tdr, décompresse et vérifie le CRC32.
 * @returns {{name: string, data: Uint8Array} | {name: string, media: {id: number, payload: Uint8Array}}}
 *   Pour une image/audio, `media` doit ensuite passer par restoreMedia() (media/index.js).
 * @throws {Error} si le fichier est invalide ou corrompu
 */
export function unpack(bytes) {
  if (bytes.length < HEADER_SIZE || SIGNATURE.some((b, i) => bytes[i] !== b)) {
    throw new Error("Ce n'est pas un fichier .tdr valide");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset);
  const algorithmId = bytes[4];
  const size = view.getUint32(5);
  const crc = view.getUint32(9);
  const nameLength = view.getUint16(13);
  const name = new TextDecoder().decode(bytes.slice(HEADER_SIZE, HEADER_SIZE + nameLength));
  const payload = bytes.slice(HEADER_SIZE + nameLength);

  if (isMediaId(algorithmId)) {
    if (crc32(payload) !== crc) throw new Error("Vérification CRC32 échouée : fichier corrompu");
    return { name, media: { id: algorithmId, payload } };
  }

  let data;
  if (algorithmId === STORED_ID) {
    data = payload;
  } else {
    const algorithm = getAlgorithm(algorithmId);
    if (!algorithm) throw new Error(`Algorithme inconnu (id ${algorithmId})`);
    data = algorithm.decode(payload, size);
  }
  if (data.length !== size || crc32(data) !== crc) {
    throw new Error("Vérification CRC32 échouée : fichier corrompu");
  }
  return { name, data };
}
