/**
 * Mode automatique : essaie chaque algorithme, VÉRIFIE que la décompression
 * redonne exactement l'original (CRC32), et garde le résultat le plus petit.
 * Si aucun algorithme ne réduit la taille, les données sont stockées telles quelles.
 */
import { ALGORITHMS, STORED_ID } from "./algorithms/index.js";
import { crc32 } from "./utils/crc32.js";
import { pack } from "./container.js";
import { LEVELS, encodeMedia } from "./media/index.js";

/**
 * @param {Uint8Array} data  contenu du fichier
 * @param {string} name      nom du fichier (conservé dans le .tdr)
 * @param {(value: number, label: string) => void} [onProgress]
 *        appelé à chaque étape ; `value` va de 0 à 1.
 *        Étapes : (compression + vérification) par algorithme, puis écriture du fichier.
 * @returns {{file: Uint8Array, methodName: string, bestId: number, report: object[]}}
 */
export function compress(data, name, onProgress = () => {}) {
  const totalSteps = ALGORITHMS.length * 2 + 1;
  let step = 0;
  const progress = (label) => onProgress(step / totalSteps, label);

  const crc = crc32(data);
  let best = { algorithmId: STORED_ID, methodName: "Stocké", payload: data };
  const report = [];

  for (const algo of ALGORITHMS) {
    const start = performance.now();
    const row = { name: algo.name, id: algo.id, size: null, error: null, ms: 0 };
    try {
      progress(`${algo.name} : compression`);
      const payload = algo.encode(data);
      step++;
      progress(`${algo.name} : vérification`);
      const back = algo.decode(payload, data.length);
      step++;
      if (back.length !== data.length || crc32(back) !== crc) throw new Error("vérification échouée");
      row.size = payload.length;
      if (payload.length < best.payload.length) {
        best = { algorithmId: algo.id, methodName: algo.name, payload };
      }
    } catch (e) {
      row.error = e.message;
      step = ALGORITHMS.indexOf(algo) * 2 + 2; // on garde la barre cohérente après un échec
    }
    row.ms = Math.round(performance.now() - start);
    report.push(row);
  }

  progress("Écriture du fichier");
  const file = pack({ algorithmId: best.algorithmId, size: data.length, crc, name, payload: best.payload });
  step++;
  progress("Terminé");
  return { file, methodName: best.methodName, bestId: best.algorithmId, report };
}

/**
 * Pour les fichiers déjà compressés (vidéo, archive) : on les stocke directement,
 * sans perdre de temps à essayer des algorithmes qui ne gagneraient rien.
 */
export function storeOnly(data, name) {
  const file = pack({ algorithmId: STORED_ID, size: data.length, crc: crc32(data), name, payload: data });
  return { file, methodName: "Stocké", bestId: STORED_ID, report: [] };
}

/**
 * Compression d'un fichier image ou audio : on essaie les algorithmes habituels ET le codec
 * média (DCT + quantification) au niveau choisi, puis on garde le plus petit.
 *
 * @param {Uint8Array} data  fichier d'origine
 * @param {{kind:"image", rgba, width, height} | {kind:"audio", channels, sampleRate} | null} media
 *        contenu décodé par le navigateur (null si indisponible)
 * @param {string} level  "original" (aucune modification) ou une clé de LEVELS
 * @returns même forme que compress(), plus `fidelity` si le codec média a été retenu
 */
export function compressWithMedia(data, name, media, level, onProgress = () => {}) {
  const generic = compress(data, name, (v, label) => onProgress(v * 0.7, label));
  if (!media || !LEVELS[level]) return generic;

  onProgress(0.7, "Réduction de l'image ou du son");
  const start = performance.now();
  let encoded;
  try {
    encoded = encodeMedia(media, level);
  } catch (e) {
    // Un échec du codec média ne doit pas empêcher la compression habituelle
    generic.report.push({ name: "Image / son", id: -1, size: null, error: e.message, ms: Math.round(performance.now() - start) });
    onProgress(1, "Terminé");
    return generic;
  }
  generic.report.push({ name: encoded.label, id: encoded.id, size: encoded.payload.length, error: null,
    ms: Math.round(performance.now() - start) });

  const file = pack({ algorithmId: encoded.id, size: data.length, crc: crc32(encoded.payload), name, payload: encoded.payload });
  onProgress(1, "Terminé");
  if (file.length >= generic.file.length) return generic; // le codec média n'apporte rien : on garde le résultat habituel
  return { file, methodName: encoded.label, bestId: encoded.id, report: generic.report, fidelity: encoded.fidelity };
}
