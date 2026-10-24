/**
 * Tests : pour chaque algorithme et chaque type de données,
 * decode(encode(x)) doit redonner exactement x.
 * Lancer avec :  npm test   (Node 18+)
 */
import test from "node:test";
import assert from "node:assert/strict";
import { ALGORITHMS } from "../src/algorithms/index.js";
import { compress } from "../src/compressor.js";
import { unpack } from "../src/container.js";

/** Générateur pseudo-aléatoire reproductible (les tests donnent toujours le même résultat). */
function prng(seed) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) >>> 16) & 255;
}
const random = (n, seed = 1) => { const r = prng(seed); return Uint8Array.from({ length: n }, r); };
const text = (s) => new TextEncoder().encode(s);

const samples = {
  "vide": new Uint8Array(0),
  "1 octet": Uint8Array.of(42),
  "octets identiques": new Uint8Array(100000).fill(7),
  "256 valeurs distinctes": Uint8Array.from({ length: 256 }, (_, i) => i),
  "texte répété": text("ABRACADABRA ".repeat(5000)),
  "texte français": text("Compression de données : réduire la taille sans perdre d'information. ".repeat(300)),
  "aléatoire 200 Ko (incompressible)": random(200000),
  "binaire structuré": Uint8Array.from({ length: 150000 }, (_, i) => (i * i) & 255),
  "gros semi-aléatoire (> 65000 codes LZW)": Uint8Array.from({ length: 400000 }, (_, i) => ((i * 31) ^ (i >> 5) ^ (i % 97)) & 255),
};

// Régression : une répétition exactement à la distance maximale de la fenêtre LZ77 corrompait les données
samples["répétition à 32768 octets"] = (() => {
  const block = random(32768, 5), data = new Uint8Array(65536);
  data.set(block); data.set(block, 32768);
  return data;
})();
samples["motif périodique long"] = Uint8Array.from({ length: 300000 }, (_, i) => (i % 32768) & 255 ^ (i % 32768 >> 8));

for (const algo of ALGORITHMS) {
  for (const [label, data] of Object.entries(samples)) {
    test(`${algo.name} — ${label}`, () => {
      const decoded = algo.decode(algo.encode(data), data.length);
      assert.deepEqual(decoded, data);
    });
  }
}

for (const [label, data] of Object.entries(samples)) {
  test(`mode auto + conteneur .tdr — ${label}`, async () => {
    const { file } = await compress(data, "fichier é.bin");
    const { name, data: restored } = unpack(file);
    assert.equal(name, "fichier é.bin");
    assert.deepEqual(restored, data);
  });
}

test("un fichier .tdr corrompu est détecté", async () => {
  const { file } = await compress(text("bonjour ".repeat(1000)), "a.txt");
  file[file.length - 1] ^= 0xff;
  assert.throws(() => unpack(file));
});

test("un fichier non .tdr est rejeté", () => {
  assert.throws(() => unpack(text("ceci n'est pas un .tdr")), /valide/);
});
