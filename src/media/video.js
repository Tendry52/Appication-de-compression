/**
 * Réduction d'une vidéo : le navigateur lit la vidéo et la ré-encode avec un débit plus faible
 * (MediaRecorder, sortie WebM). Son codec applique lui-même DCT + quantification + prédiction
 * entre images : on règle seulement à quel point.
 *
 * Contraintes à connaître :
 *   - le ré-encodage se fait EN TEMPS RÉEL : une vidéo de 24 minutes prend environ 24 minutes ;
 *   - l'onglet doit rester visible (le navigateur ralentit les onglets en arrière-plan) ;
 *   - le résultat est un .webm lisible par les navigateurs et VLC (pas un .mp4).
 * Tourne sur la page (pas dans un worker). Le fichier n'est jamais chargé en mémoire : il est lu en flux.
 */

/** Part du débit d'origine conservée selon le niveau choisi. */
const BITRATE_FACTOR = { light: 0.8, balanced: 0.6, strong: 0.4 };
const MIME_TYPES = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
const AUDIO_BITRATE = 96000;

const formatTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/**
 * @param {File} file
 * @param {string} level  "light" | "balanced" | "strong"
 * @param {(value: number, label: string) => void} onProgress  value de 0 à 1
 * @returns {Promise<Blob>} vidéo WebM réduite
 */
export function reencodeVideo(file, level, onProgress) {
  return new Promise((resolve, reject) => {
    if (typeof MediaRecorder === "undefined") return reject(new Error("ré-encodage non disponible dans ce navigateur"));

    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "auto";
    video.playsInline = true;
    video.src = url;

    let audioContext = null;
    const chunks = [];
    const cleanup = () => { URL.revokeObjectURL(url); audioContext?.close(); video.removeAttribute("src"); };
    const fail = (message) => { cleanup(); reject(new Error(message)); };

    video.onerror = () => fail("le navigateur ne sait pas lire cette vidéo");
    video.onloadedmetadata = async () => {
      const duration = video.duration;
      if (!Number.isFinite(duration) || duration <= 0) return fail("durée de la vidéo inconnue");
      try {
        // Image : flux de la vidéo en lecture. Son : passé par WebAudio pour être capturé sans sortir sur les haut-parleurs.
        const capture = video.captureStream?.() ?? video.mozCaptureStream?.();
        if (!capture) return fail("capture de la vidéo non disponible dans ce navigateur");
        audioContext = new AudioContext();
        const sound = audioContext.createMediaStreamDestination();
        audioContext.createMediaElementSource(video).connect(sound);
        const stream = new MediaStream([...capture.getVideoTracks(), ...sound.stream.getAudioTracks()]);

        const mimeType = MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
        if (!mimeType) return fail("aucun format de sortie disponible");
        const originalBitrate = (file.size * 8) / duration;
        const recorder = new MediaRecorder(stream, {
          mimeType,
          videoBitsPerSecond: Math.max(150000, Math.round(originalBitrate * BITRATE_FACTOR[level] * 0.9)),
          audioBitsPerSecond: AUDIO_BITRATE,
        });
        recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
        recorder.onstop = () => { cleanup(); resolve(new Blob(chunks, { type: "video/webm" })); };

        video.ontimeupdate = () => onProgress(video.currentTime / duration,
          `Ré-encodage en temps réel : ${formatTime(video.currentTime)} / ${formatTime(duration)}`);
        video.onended = () => recorder.stop();
        recorder.start(1000);
        await audioContext.resume();
        await video.play();
      } catch (e) {
        fail(e.message);
      }
    };
  });
}
