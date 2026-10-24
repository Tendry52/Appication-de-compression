/**
 * Tests des codecs image / audio, de la détection de type et du pipeline complet.
 * Ces codecs réduisent les données en perdant un peu de précision : on vérifie donc
 * la FIDÉLITÉ (PSNR / rapport signal-bruit) et la taille, pas l'égalité exacte.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
import { detectKind } from "../src/detect.js";
import { decodeImage, encodeImage, imagePsnr } from "../src/media/image-codec.js";
import { audioSnr, decodeAudio, encodeAudio } from "../src/media/audio-codec.js";
import { encodePng } from "../src/media/png.js";
import { encodeWav } from "../src/media/wav.js";
import { IMAGE_ID, AUDIO_ID, LEVELS, restoreMedia } from "../src/media/index.js";
import { compressWithMedia, storeOnly } from "../src/compressor.js";
import { unpack } from "../src/container.js";

/** Image de test : dégradés + motif, dimensions volontairement non multiples de 8. */
function makeImage(w, h) {
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = 4 * (y * w + x);
    rgba[i] = (x * 255) / w; rgba[i + 1] = (y * 255) / h; rgba[i + 2] = ((x >> 3) + (y >> 3)) % 2 ? 200 : 60; rgba[i + 3] = 255;
  }
  return rgba;
}
/** Son de test : deux sinus + un peu de bruit, en stéréo. */
function makeAudio(seconds, rate) {
  const n = Math.floor(seconds * rate), l = new Float32Array(n), r = new Float32Array(n);
  let seed = 1;
  for (let i = 0; i < n; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const noise = ((seed >>> 16) / 65536 - 0.5) * 0.02;
    l[i] = 0.4 * Math.sin((2 * Math.PI * 440 * i) / rate) + 0.2 * Math.sin((2 * Math.PI * 1500 * i) / rate) + noise;
    r[i] = 0.35 * Math.sin((2 * Math.PI * 440 * i) / rate) + noise;
  }
  return { channels: [l, r], sampleRate: rate };
}

test("detectKind reconnaît les types courants", () => {
  const sig = (...b) => Uint8Array.from([...b, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(detectKind(sig(0x89, 0x50, 0x4e, 0x47)), "image");
  assert.equal(detectKind(sig(0xff, 0xd8, 0xff)), "image");
  assert.equal(detectKind(new TextEncoder().encode("RIFF\0\0\0\0WAVEfmt ")), "audio");
  assert.equal(detectKind(new TextEncoder().encode("\0\0\0\x20ftypisom\0\0\0\0")), "video"); // MP4
  assert.equal(detectKind(new TextEncoder().encode("\0\0\0\x20ftypM4A \0\0\0")), "audio");
  assert.equal(detectKind(sig(0x1a, 0x45, 0xdf, 0xa3)), "video"); // MKV
  assert.equal(detectKind(sig(0x50, 0x4b, 0x03, 0x04)), "compressed");
  assert.equal(detectKind(new TextEncoder().encode("bonjour"), "a.txt"), "other");
});

for (const [level, minDb] of [["light", 33], ["balanced", 28], ["strong", 23]]) {
  test(`image : niveau ${level}`, () => {
    const w = 61, h = 45, rgba = makeImage(w, h);
    const payload = encodeImage(rgba, w, h, LEVELS[level].image);
    const out = decodeImage(payload);
    assert.equal(out.width, w); assert.equal(out.height, h);
    const db = imagePsnr(rgba, out.rgba);
    assert.ok(db > minDb, `PSNR ${db.toFixed(1)} dB trop bas`);
    assert.ok(payload.length < rgba.length / 4, "doit être plus petit que l'image brute");
  });
}

test("image : un pixel et transparence", () => {
  const rgba = Uint8ClampedArray.of(10, 200, 30, 0); // totalement transparent -> blanc
  const out = decodeImage(encodeImage(rgba, 1, 1, 90));
  assert.ok(out.rgba[0] > 240 && out.rgba[1] > 240 && out.rgba[2] > 240);
});

for (const [level, minDb] of [["light", 35], ["balanced", 25], ["strong", 15]]) {
  test(`audio stéréo : niveau ${level}`, () => {
    const { channels, sampleRate } = makeAudio(1.3, 22050);
    const payload = encodeAudio(channels, sampleRate, LEVELS[level].audio);
    const out = decodeAudio(payload);
    assert.equal(out.sampleRate, sampleRate);
    assert.equal(out.channels.length, 2);
    assert.equal(out.channels[0].length, channels[0].length);
    const db = audioSnr(channels, out.channels);
    assert.ok(db > minDb, `SNR ${db.toFixed(1)} dB trop bas`);
    assert.ok(payload.length < channels[0].length * 4 / 2, "doit diviser la taille PCM par au moins 2");
  });
}

test("audio mono et très court", () => {
  const out = decodeAudio(encodeAudio([Float32Array.of(0.1, -0.1, 0.2)], 8000, 12));
  assert.equal(out.channels.length, 1); assert.equal(out.channels[0].length, 3);
});

test("PNG : signature valide et pixels exacts", async () => {
  const w = 5, h = 3, rgba = makeImage(w, h), png = await encodePng(rgba, w, h);
  assert.deepEqual([...png.slice(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const idatStart = png.findIndex((_, i) => String.fromCharCode(...png.slice(i, i + 4)) === "IDAT");
  const len = new DataView(png.buffer).getUint32(idatStart - 4);
  const rows = inflateSync(png.slice(idatStart + 4, idatStart + 4 + len));
  assert.equal(rows.length, h * (w * 3 + 1));
  assert.equal(rows[1], rgba[0]); assert.equal(rows[2], rgba[1]);
});

test("WAV : en-tête et taille", () => {
  const wav = encodeWav([Int16Array.of(1, 2, 3), Int16Array.of(4, 5, 6)], 8000);
  assert.equal(String.fromCharCode(...wav.slice(0, 4)), "RIFF");
  assert.equal(wav.length, 44 + 3 * 2 * 2);
});

test("pipeline complet image : compressWithMedia -> .tdr -> restoreMedia", async () => {
  const w = 120, h = 90, rgba = makeImage(w, h);
  const original = new Uint8Array(w * h * 4).map((_, i) => rgba[i]); // faux fichier « brut » assez gros
  const result = compressWithMedia(original, "photo.bmp", { kind: "image", rgba, width: w, height: h }, "balanced");
  assert.equal(result.bestId, IMAGE_ID);
  assert.ok(result.file.length < original.length / 4);
  assert.ok(result.fidelity.db > 30);
  const unpacked = unpack(result.file);
  const restored = await restoreMedia(unpacked.media.id, unpacked.media.payload, unpacked.name);
  assert.equal(restored.name, "photo.png");
  assert.equal(restored.data[1], 0x50);
});

test("pipeline complet audio", async () => {
  const media = { kind: "audio", ...makeAudio(1, 22050) };
  let seed = 7; // faux fichier brut pseudo-aléatoire : les algorithmes habituels n'y gagnent presque rien
  const original = Uint8Array.from({ length: media.channels[0].length * 4 }, () => ((seed = (seed * 1664525 + 1013904223) >>> 0) >>> 16) & 255);
  const result = compressWithMedia(original, "son.wav", media, "balanced");
  assert.equal(result.bestId, AUDIO_ID);
  const unpacked = unpack(result.file);
  const restored = await restoreMedia(unpacked.media.id, unpacked.media.payload, unpacked.name);
  assert.equal(restored.name, "son.wav");
  assert.equal(String.fromCharCode(...restored.data.slice(0, 4)), "RIFF");
});

test("niveau « original » : aucune réduction de qualité", () => {
  const w = 16, h = 16, rgba = makeImage(w, h);
  const result = compressWithMedia(new Uint8Array(rgba), "a.bmp", { kind: "image", rgba, width: w, height: h }, "original");
  assert.notEqual(result.bestId, IMAGE_ID);
});

test("fichier image/audio réduit mais corrompu : détecté", () => {
  const w = 40, h = 40, rgba = makeImage(w, h);
  const result = compressWithMedia(new Uint8Array(rgba), "a.bmp", { kind: "image", rgba, width: w, height: h }, "balanced");
  result.file[result.file.length - 3] ^= 0xff;
  assert.throws(() => unpack(result.file), /corrompu/);
});

test("storeOnly conserve le fichier tel quel", () => {
  const data = Uint8Array.from({ length: 1000 }, (_, i) => i & 255);
  assert.deepEqual(unpack(storeOnly(data, "v.mp4").file).data, data);
});

test("audio long et périodique (régression LZ77 distance maximale)", () => {
  const rate = 44100, n = rate * 20, l = new Float32Array(n), r = new Float32Array(n);
  for (let i = 0; i < n; i++) { // boucle de 32768 échantillons répétée : provoque des répétitions à distance exacte
    const t = i % 32768;
    l[i] = 0.4 * Math.sin(t / 7) + 0.2 * Math.sin(t / 31); r[i] = 0.3 * Math.sin(t / 7);
  }
  const out = decodeAudio(encodeAudio([l, r], rate, LEVELS.balanced.audio));
  assert.equal(out.channels[0].length, n);
  assert.ok(audioSnr([l, r], out.channels) > 25);
});

test("un échec du codec média n'empêche pas la compression habituelle", () => {
  const data = new TextEncoder().encode("bonjour ".repeat(500));
  const result = compressWithMedia(data, "a.bmp", { kind: "audio", channels: [], sampleRate: 8000 }, "balanced"); // média invalide : le codec échoue
  assert.ok(result.file.length < data.length);
  assert.ok(result.report.some((r) => r.error));
});
