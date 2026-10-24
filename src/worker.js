/**
 * Web Worker : exécute la compression / décompression en arrière-plan,
 * pour que la page reste fluide et que la barre de progression s'anime.
 */
import { compressWithMedia, storeOnly } from "./compressor.js";
import { unpack } from "./container.js";
import { restoreMedia } from "./media/index.js";

self.onmessage = async ({ data: msg }) => {
  try {
    const input = new Uint8Array(msg.buffer);
    if (msg.type === "compress") {
      const result = msg.store
        ? storeOnly(input, msg.name)
        : compressWithMedia(input, msg.name, msg.media, msg.level, (value, label) =>
            self.postMessage({ type: "progress", value, label }));
      self.postMessage({ type: "compressed", result }, [result.file.buffer]);
    } else {
      const unpacked = unpack(input);
      const { name, data } = unpacked.media
        ? await restoreMedia(unpacked.media.id, unpacked.media.payload, unpacked.name)
        : unpacked;
      self.postMessage({ type: "decompressed", name, data }, [data.buffer]);
    }
  } catch (e) {
    self.postMessage({ type: "error", message: e.message });
  }
};
