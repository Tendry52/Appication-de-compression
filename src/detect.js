/**
 * Détection du type d'un fichier d'après ses premiers octets (signature),
 * avec l'extension du nom en secours.
 *
 * @returns {"image"|"audio"|"video"|"compressed"|"other"}
 *   - image / audio : l'appli sait les décoder et les réduire
 *   - video         : MP4, MKV, WebM, AVI, MOV : ré-encodage avec un débit plus faible (media/video.js)
 *   - compressed    : archive déjà compressée (ZIP, 7z, RAR, gzip…) : inutile d'insister
 *   - other         : texte, code, exécutable, etc.
 */
const startsWith = (b, sig, offset = 0) => sig.every((v, i) => b[offset + i] === v);
const ascii = (s) => [...s].map((c) => c.charCodeAt(0));

export function detectKind(b, name = "") {
  const ext = name.toLowerCase().split(".").pop();
  // Images
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47])) return "image";               // PNG
  if (startsWith(b, [0xff, 0xd8, 0xff])) return "image";                       // JPEG
  if (startsWith(b, ascii("GIF8"))) return "image";                            // GIF
  if (startsWith(b, ascii("BM")) && ext === "bmp") return "image";             // BMP
  if (startsWith(b, ascii("RIFF")) && startsWith(b, ascii("WEBP"), 8)) return "image";
  // Audio
  if (startsWith(b, ascii("RIFF")) && startsWith(b, ascii("WAVE"), 8)) return "audio";
  if (startsWith(b, ascii("ID3")) || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0 && ext === "mp3")) return "audio";
  if (startsWith(b, ascii("OggS")) || startsWith(b, ascii("fLaC"))) return "audio";
  if (startsWith(b, ascii("ftyp"), 4)) return startsWith(b, ascii("M4A "), 8) ? "audio" : "video"; // m4a / mp4 / mov
  // Vidéos
  if (startsWith(b, [0x1a, 0x45, 0xdf, 0xa3])) return "video";                 // MKV / WebM
  if (startsWith(b, ascii("RIFF")) && startsWith(b, ascii("AVI "), 8)) return "video";
  // Archives déjà compressées
  if (startsWith(b, [0x50, 0x4b, 0x03, 0x04])) return "compressed";            // ZIP, DOCX, XLSX, APK…
  if (startsWith(b, [0x37, 0x7a, 0xbc, 0xaf])) return "compressed";            // 7z
  if (startsWith(b, ascii("Rar!"))) return "compressed";
  if (startsWith(b, [0x1f, 0x8b]) || startsWith(b, ascii("BZh")) || startsWith(b, [0xfd, 0x37, 0x7a, 0x58, 0x5a])) return "compressed";
  return "other";
}
