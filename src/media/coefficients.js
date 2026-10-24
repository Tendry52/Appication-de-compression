/**
 * Codage des coefficients quantifiés d'un bloc : la plupart valent 0.
 * On écrit des paires (nombre de zéros avant, valeur non nulle) puis un marqueur
 * de fin de bloc (EOB) = un « nombre de zéros » égal à la taille de la plage.
 */

/** Écrit coefs[from..to[ . */
export function writeRuns(writer, coefs, from, to) {
  let run = 0;
  for (let i = from; i < to; i++) {
    if (coefs[i] === 0) { run++; continue; }
    writer.varint(run);
    writer.svarint(coefs[i]);
    run = 0;
  }
  writer.varint(to - from); // EOB
}

/** Lit dans out[from..to[ (qui doit être initialisé à 0). */
export function readRuns(reader, out, from, to) {
  const n = to - from;
  let pos = from;
  for (;;) {
    const run = reader.varint();
    if (run === n) return;
    pos += run;
    if (run > n || pos >= to) throw new Error("Bloc corrompu");
    out[pos++] = reader.svarint();
  }
}
