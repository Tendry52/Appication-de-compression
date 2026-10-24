# Compresseur de fichiers

Application web de compression pour tous les types de fichiers. 

- **Texte, code, exécutables, données** : RLE, Huffman, LZW, LZ77 + Huffman, résultat identique à l'original.
- **Images et sons** : DCT + quantification au niveau choisi, avec indicateur de fidélité.
- **Vidéos** (MP4, MKV, WebM, AVI, MOV) : ré-encodées par le navigateur avec un débit plus faible, en temps réel, sortie `.webm`.
- **Archives déjà compressées** (ZIP, 7z, RAR…) : conservées telles quelles, sans calcul inutile.

## Lancer dans VS Code

Lancer avec live server




