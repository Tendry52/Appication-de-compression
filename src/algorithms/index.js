/**
 * Registre des algorithmes. Pour en ajouter un :
 *   1. créer src/algorithms/monalgo.js exportant { id, name, encode(data), decode(payload, size) }
 *   2. choisir un `id` unique (1 octet, > 0) : il est écrit dans les fichiers .tdr
 *   3. l'ajouter à la liste ci-dessous
 */
import { rle } from "./rle.js";
import { huffman } from "./huffman.js";
import { lzw } from "./lzw.js";
import { lz77 } from "./lz77.js";

export const STORED_ID = 0;

export const ALGORITHMS = [rle, huffman, lzw, lz77];

/** @returns l'algorithme correspondant à un identifiant, ou undefined */
export const getAlgorithm = (id) => ALGORITHMS.find((a) => a.id === id);
