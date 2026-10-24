

import { ByteReader, ByteWriter } from "./bytes.js";
import { forwardMatrix, inverseMatrix, transform1d } from "./dct.js";
import { readRuns, writeRuns } from "./coefficients.js";
import { lz77 } from "../algorithms/lz77.js";

const N = 256;                 // taille d'une fenêtre
const HEADER_SIZE = 18;        // fréquence(4) voies(1) échantillons(4) pas(4) taille du flux(4) + 1 réservé
const FORWARD = forwardMatrix(N);
const INVERSE = inverseMatrix(N);
const stepFor = (base, k) => base * (1 + (3 * k) / N);

/**
 * @param {Float32Array[]} channels  échantillons entre -1 et 1, une table par voie
 * @param {number} baseStep  pas de quantification de base (plus grand = plus compressé)
 */
export function encodeAudio(channels, sampleRate, baseStep) {
  const frames = channels[0].length, nch = channels.length;
  let work = channels.map((c) => Float64Array.from(c, (v) => v * 32767));
  if (nch === 2) { // mid/side
    const [l, r] = work;
    work = [l.map((v, i) => (v + r[i]) / 2), l.map((v, i) => (v - r[i]) / 2)];
  }
  const stream = new ByteWriter();
  const input = new Float64Array(N), coef = new Float64Array(N), q = new Int32Array(N);
  for (const samples of work) {
    for (let start = 0; start < frames; start += N) {
      for (let i = 0; i < N; i++) input[i] = start + i < frames ? samples[start + i] : 0;
      transform1d(FORWARD, N, input, coef);
      for (let k = 0; k < N; k++) q[k] = Math.round(coef[k] / stepFor(baseStep, k));
      writeRuns(stream, q, 0, N);
    }
  }
  const raw = stream.bytes(), packed = lz77.encode(raw);
  const header = new ByteWriter();
  header.u32(sampleRate); header.byte(nch); header.u32(frames); header.u32(baseStep); header.u32(raw.length); header.byte(0);
  const hb = header.bytes(), out = new Uint8Array(hb.length + packed.length);
  out.set(hb); out.set(packed, hb.length);
  return out;
}

/** @returns {{channels: Int16Array[], sampleRate: number}} */
export function decodeAudio(payload) {
  const head = new ByteReader(payload);
  const sampleRate = head.u32(), nch = head.byte(), frames = head.u32(), baseStep = head.u32(), rawLength = head.u32();
  if (nch < 1 || nch > 8 || baseStep < 1) throw new Error("Audio corrompu");
  const reader = new ByteReader(lz77.decode(payload.subarray(HEADER_SIZE), rawLength));
  const q = new Int32Array(N), coef = new Float64Array(N), block = new Float64Array(N);
  let work = [];
  for (let c = 0; c < nch; c++) {
    const samples = new Float64Array(frames);
    for (let start = 0; start < frames; start += N) {
      q.fill(0);
      readRuns(reader, q, 0, N);
      for (let k = 0; k < N; k++) coef[k] = q[k] * stepFor(baseStep, k);
      transform1d(INVERSE, N, coef, block);
      for (let i = 0; i < N && start + i < frames; i++) samples[start + i] = block[i];
    }
    work.push(samples);
  }
  if (nch === 2) { const [m, s] = work; work = [m.map((v, i) => v + s[i]), m.map((v, i) => v - s[i])]; }
  const channels = work.map((w) => Int16Array.from(w, (v) => Math.max(-32768, Math.min(32767, Math.round(v)))));
  return { channels, sampleRate };
}

/** Rapport signal/bruit en dB entre l'original (Float32 -1..1) et le décodé (Int16). */
export function audioSnr(original, decoded) {
  let signal = 0, noise = 0;
  original.forEach((ch, c) => ch.forEach((v, i) => {
    const o = v * 32767, e = o - decoded[c][i];
    signal += o * o; noise += e * e;
  }));
  return noise === 0 ? 99 : 10 * Math.log10(Math.max(signal, 1e-9) / noise);
}
