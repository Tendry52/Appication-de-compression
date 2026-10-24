/** Écriture d'un fichier WAV (PCM 16 bits, voies entrelacées). */

/** @param {Int16Array[]} channels @returns {Uint8Array} */
export function encodeWav(channels, sampleRate) {
  const nch = channels.length, frames = channels[0].length, dataSize = frames * nch * 2;
  const out = new Uint8Array(44 + dataSize), view = new DataView(out.buffer);
  const text = (pos, s) => [...s].forEach((c, i) => (out[pos + i] = c.charCodeAt(0)));
  text(0, "RIFF"); view.setUint32(4, 36 + dataSize, true); text(8, "WAVE");
  text(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); // PCM
  view.setUint16(22, nch, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * nch * 2, true); view.setUint16(32, nch * 2, true); view.setUint16(34, 16, true);
  text(36, "data"); view.setUint32(40, dataSize, true);
  for (let i = 0; i < frames; i++) for (let c = 0; c < nch; c++) view.setInt16(44 + (i * nch + c) * 2, channels[c][i], true);
  return out;
}
