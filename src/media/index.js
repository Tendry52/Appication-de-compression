/**
 * Point d'entrée des codecs image/audio : niveaux, encodage, restauration.
 * Identifiants écrits dans les fichiers .tdr : 10 = image, 11 = audio.
 */
import { decodeImage, encodeImage, imagePsnr } from "./image-codec.js";
import { audioSnr, decodeAudio, encodeAudio } from "./audio-codec.js";
import { encodePng } from "./png.js";
import { encodeWav } from "./wav.js";

export const IMAGE_ID = 10;
export const AUDIO_ID = 11;
export const isMediaId = (id) => id === IMAGE_ID || id === AUDIO_ID;

/** Niveaux proposés : qualité d'image (1-100) et pas de quantification audio. */
export const LEVELS = {
  light: { image: 90, audio: 12 },
  balanced: { image: 75, audio: 40 },
  strong: { image: 50, audio: 120 },
};

const fidelityLabel = (db, thresholds, words) => words[thresholds.findIndex((t) => db >= t)] ?? words.at(-1);

/**
 * Réduit une image ou un son.
 * @param {{kind:"image", rgba, width, height} | {kind:"audio", channels, sampleRate}} media
 * @param {string} level  clé de LEVELS
 * @returns {{id:number, label:string, payload:Uint8Array, fidelity:{db:number, label:string}}}
 */
export function encodeMedia(media, level) {
  if (media.kind === "image") {
    const payload = encodeImage(media.rgba, media.width, media.height, LEVELS[level].image);
    const db = imagePsnr(media.rgba, decodeImage(payload).rgba); // on décode aussitôt pour mesurer le résultat
    return { id: IMAGE_ID, label: "Image (DCT 8×8 + quantification)", payload,
      fidelity: { db, label: fidelityLabel(db, [38, 32, 27], ["excellente", "bonne", "correcte", "visible"]) } };
  }
  const payload = encodeAudio(media.channels, media.sampleRate, LEVELS[level].audio);
  const db = audioSnr(media.channels, decodeAudio(payload).channels);
  return { id: AUDIO_ID, label: "Audio (DCT + quantification)", payload,
    fidelity: { db, label: fidelityLabel(db, [40, 30, 22], ["excellente", "bonne", "correcte", "audible"]) } };
}

/**
 * Reconstruit un fichier standard à partir d'une charge utile image/audio.
 * @returns {Promise<{name:string, data:Uint8Array}>}  .png pour une image, .wav pour un son
 */
export async function restoreMedia(id, payload, name) {
  const base = name.replace(/\.[^.]*$/, "") || "fichier";
  if (id === IMAGE_ID) {
    const { rgba, width, height } = decodeImage(payload);
    return { name: base + ".png", data: await encodePng(rgba, width, height) };
  }
  const { channels, sampleRate } = decodeAudio(payload);
  return { name: base + ".wav", data: encodeWav(channels, sampleRate) };
}
