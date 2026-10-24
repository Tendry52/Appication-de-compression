/**
 * Décodage des images et des sons avec les fonctions du navigateur
 * (JPEG, PNG, MP3, OGG… : écrire ces décodeurs serait un projet à part).
 * Ce fichier tourne sur la page, pas dans le worker (AudioContext n'existe pas dans un worker).
 */

/** @returns {Promise<{rgba: Uint8ClampedArray, width: number, height: number}>} */
export async function imageToRgba(bytes) {
  const bitmap = await createImageBitmap(new Blob([bytes]));
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width; canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0);
  const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  return { rgba: data, width: bitmap.width, height: bitmap.height };
}

/** @returns {Promise<{channels: Float32Array[], sampleRate: number}>} */
export async function audioToPcm(bytes) {
  const context = new AudioContext();
  try {
    const buffer = await context.decodeAudioData(bytes.slice().buffer);
    return {
      channels: Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i).slice()),
      sampleRate: buffer.sampleRate,
    };
  } finally {
    context.close();
  }
}
