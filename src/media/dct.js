/**
 * Transformée en cosinus discrète (DCT-II orthonormée), formule de ton cours :
 *   F[k] = α(k) · Σ_n a[n] · cos(π k (2n+1) / 2N),   α(0)=√(1/N), α(k>0)=√(2/N)
 * On précalcule la matrice N×N une fois ; la transformée = produit matrice-vecteur.
 * La transformée inverse utilise la matrice transposée (l'orthonormalité le garantit).
 */

/** Matrice de la DCT directe (ligne k = fréquence k). */
export function forwardMatrix(N) {
  const C = new Float64Array(N * N);
  for (let k = 0; k < N; k++) {
    const alpha = k === 0 ? Math.sqrt(1 / N) : Math.sqrt(2 / N);
    for (let n = 0; n < N; n++) C[k * N + n] = alpha * Math.cos((Math.PI * k * (2 * n + 1)) / (2 * N));
  }
  return C;
}

/** Matrice de la DCT inverse (transposée de la directe). */
export function inverseMatrix(N) {
  const C = forwardMatrix(N);
  const T = new Float64Array(N * N);
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) T[i * N + j] = C[j * N + i];
  return T;
}

/** Transformée 1D : out = M · input (M = forwardMatrix ou inverseMatrix). */
export function transform1d(M, N, input, out) {
  for (let i = 0; i < N; i++) {
    let s = 0;
    for (let j = 0; j < N; j++) s += M[i * N + j] * input[j];
    out[i] = s;
  }
}

/** Transformée 2D d'un bloc N×N, sur place : d'abord les lignes, puis les colonnes. */
export function transform2d(M, N, block, tmp) {
  for (let r = 0; r < N; r++) {
    for (let i = 0; i < N; i++) {
      let s = 0;
      for (let j = 0; j < N; j++) s += M[i * N + j] * block[r * N + j];
      tmp[r * N + i] = s;
    }
  }
  for (let c = 0; c < N; c++) {
    for (let i = 0; i < N; i++) {
      let s = 0;
      for (let j = 0; j < N; j++) s += M[i * N + j] * tmp[j * N + c];
      block[i * N + c] = s;
    }
  }
}
