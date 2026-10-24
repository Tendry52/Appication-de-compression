/** Interface : lie les boutons de index.html au worker de compression. */
import { detectKind } from "./detect.js";
import { audioToPcm, imageToRgba } from "./media/browser.js";
import { reencodeVideo } from "./media/video.js";

const MAX_SIZE = 100 * 1024 * 1024; // au-delà, le navigateur manque de mémoire

const $ = (id) => document.getElementById(id);

/** 1536 -> "1.5 Ko" */
function formatSize(n) {
  if (n < 1024) return `${n} o`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} Ko`;
  return `${(n / 1048576).toFixed(2)} Mo`;
}

/** Déclenche le téléchargement d'un fichier généré dans le navigateur. */
function download(bytes, filename) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([bytes]));
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

/** Vidéo : ré-encodage en temps réel dans la page (voir media/video.js). */
async function compressVideo(file, level, box) {
  box.textContent = "Garde cet onglet visible : le ré-encodage dure environ aussi longtemps que la vidéo.";
  const start = performance.now();
  const blob = await reencodeVideo(file, level, (value, label) => setProgress("compress", value, label));
  setProgress("compress", 1, "Terminé");
  const minutes = ((performance.now() - start) / 60000).toFixed(1);
  const ratio = (100 * blob.size / file.size).toFixed(1);
  if (blob.size >= file.size) {
    box.innerHTML = `<p>Résultat : ${formatSize(blob.size)}, pas plus petit que l'original (${formatSize(file.size)}). Rien n'a été téléchargé. Essaie le niveau Fort.</p>`;
    return;
  }
  box.innerHTML = `<p>Original : ${formatSize(file.size)} → <b>${formatSize(blob.size)}</b> (${ratio} %) en ${minutes} min. ` +
    `Format WebM : lisible dans les navigateurs et dans VLC.</p>`;
  download(blob, file.name.replace(/\.[^.]*$/, "") + "-reduit.webm");
}

/**
 * Met à jour la barre d'une carte ("compress" ou "decompress").
 * @param {number|null} value  0..1, ou null pour une barre « en cours » sans pourcentage
 */
function setProgress(prefix, value, label = "") {
  const bar = $(`${prefix}-progress`);
  bar.hidden = false;
  if (value === null) bar.removeAttribute("value"); else bar.value = value;
  $(`${prefix}-status`).textContent = value === null ? label : `${Math.round(value * 100)} % — ${label}`;
}

/**
 * Lance le worker, relaie sa progression et renvoie son message final.
 * @param {object} message  message envoyé au worker
 * @param {ArrayBuffer[]} transfers  buffers transférés (pas copiés) au worker
 * @param {(value: number, label: string) => void} onProgress
 */
function runWorker(message, transfers, onProgress) {
  const worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
  return new Promise((resolve, reject) => {
    worker.onmessage = ({ data }) => {
      if (data.type === "progress") return onProgress(data.value, data.label);
      worker.terminate();
      data.type === "error" ? reject(new Error(data.message)) : resolve(data);
    };
    worker.onerror = (e) => { worker.terminate(); reject(new Error(e.message || "erreur du worker")); };
    worker.postMessage(message, transfers);
  });
}

$("compress-btn").onclick = async () => {
  const file = $("compress-input").files[0];
  const box = $("compress-result");
  if (!file) { box.textContent = "Choisis un fichier."; return; }

  $("compress-btn").disabled = true;
  box.textContent = "";
  setProgress("compress", 0, "Lecture du fichier");
  try {
    // Le type se lit sur les premiers octets : une vidéo n'est jamais chargée entièrement en mémoire
    const kind = detectKind(new Uint8Array(await file.slice(0, 64).arrayBuffer()), file.name);
    const level = $("level").value;
    if (kind === "video") {
      if (level === "original") throw new Error("choisis un niveau Léger, Équilibré ou Fort pour réduire une vidéo");
      await compressVideo(file, level, box);
      $("compress-btn").disabled = false;
      return;
    }
    if (file.size > MAX_SIZE) throw new Error("fichier trop volumineux (maximum 100 Mo)");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const size = bytes.length;

    // Images et sons : le navigateur les décode, le worker les réduit
    let media = null;
    const transfers = [];
    if (level !== "original" && (kind === "image" || kind === "audio")) {
      setProgress("compress", 0, kind === "image" ? "Lecture de l'image" : "Lecture du son");
      try {
        media = kind === "image"
          ? { kind, ...(await imageToRgba(bytes)) }
          : { kind, ...(await audioToPcm(bytes)) };
        transfers.push(...(kind === "image" ? [media.rgba.buffer] : media.channels.map((c) => c.buffer)));
      } catch { media = null; } // format que le navigateur ne sait pas lire : compression habituelle
    }
    transfers.push(bytes.buffer);
    const { result } = await runWorker(
      { type: "compress", name: file.name, buffer: bytes.buffer, level, media, store: kind === "compressed" },
      transfers, (value, label) => setProgress("compress", value, label));
    setProgress("compress", 1, "Terminé");

    const rows = result.report.map((r) =>
      `<tr class="${r.id === result.bestId ? "best" : ""}"><td>${r.name}</td>` +
      `<td>${r.error ? "échec (" + r.error + ")" : formatSize(r.size)}</td><td>${r.ms} ms</td></tr>`).join("");
    const ratio = (100 * result.file.length / Math.max(1, size)).toFixed(1);
    box.innerHTML =
      (rows ? `<table><tr><th>Méthode</th><th>Taille</th><th>Temps</th></tr>${rows}</table>` : "") +
      `<p>Original : ${formatSize(size)} → <b>${formatSize(result.file.length)}</b> (${ratio} %) — méthode retenue : <b>${result.methodName}</b></p>` +
      (result.fidelity ? `<p>Fidélité conservée : <b>${result.fidelity.label}</b> (${result.fidelity.db.toFixed(1)} dB)</p>` : "") +
      (result.bestId === 0 ? `<p class="muted">Fichier probablement déjà compressé (MP3, JPEG, MP4, ZIP…) : aucune méthode ne le réduit, il est conservé tel quel.</p>` : "");
    download(result.file, file.name + ".tdr");
  } catch (e) {
    box.textContent = "Erreur : " + e.message;
    $("compress-progress").hidden = true;
  }
  $("compress-btn").disabled = false;
};

$("decompress-btn").onclick = async () => {
  const file = $("decompress-input").files[0];
  const box = $("decompress-result");
  if (!file) { box.textContent = "Choisis un fichier .tdr."; return; }

  $("decompress-btn").disabled = true;
  box.textContent = "";
  setProgress("decompress", null, "Décompression et vérification en cours…"); // durée inconnue : barre animée
  try {
    const buffer = await file.arrayBuffer();
    const { name, data } = await runWorker({ type: "decompress", buffer }, [buffer], () => {});
    setProgress("decompress", 1, "Terminé");
    box.textContent = `OK, CRC32 vérifié : ${name} (${formatSize(data.length)})`;
    download(data, name || "fichier");
  } catch (e) {
    box.textContent = "Erreur : " + e.message;
    $("decompress-progress").hidden = true;
    $("decompress-status").textContent = "";
  }
  $("decompress-btn").disabled = false;
};
