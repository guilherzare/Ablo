# Ablo

Application desktop pour art-thérapeutes : dictée vocale → transcription → anonymisation → rapport structuré exportable en Word et PDF. **100% offline, local-first.**

---

## Fonctionnement

```
Enregistrement audio
       ↓
Transcription locale (Whisper)
       ↓
Correction & dictionnaire personnel
       ↓
Anonymisation (données patient masquées)
       ↓
Génération du bilan (Mistral 7B, local)
       ↓
Édition manuelle
       ↓
Export Word + PDF
```

Aucune donnée ne quitte l'ordinateur du thérapeute.

---

## Stack

| Couche | Technologie |
|--------|-------------|
| Desktop | [Tauri 2](https://tauri.app) (Rust) |
| UI | React 19 + TypeScript + Vite |
| Backend | Python 3.11 (IPC stdin/stdout JSON) |
| Transcription | [Faster-Whisper](https://github.com/SYSTRAN/faster-whisper) (modèle `small`) |
| LLM | [llama-cpp-python](https://github.com/abetlen/llama-cpp-python) — Mistral 7B Q4_K_M |
| Export | python-docx + reportlab |

---

## Prérequis

- **macOS** Apple Silicon — ou **Windows** x64
- Node.js 20+
- Python 3.11
- Rust (stable)

---

## Lancer en développement

```bash
# 1. Installer les dépendances Node
npm install

# 2. Installer les dépendances Python
pip install faster-whisper llama-cpp-python python-docx reportlab

# 3. Lancer l'app
npm run tauri dev
```

L'app s'ouvre dans une fenêtre native. Au premier lancement, elle télécharge les modèles IA (~2 Go).

---

## Build

### macOS
```bash
npm run tauri build
# → src-tauri/target/release/bundle/dmg/Ablo_x.x.x_aarch64.dmg
```

### Windows (via GitHub Actions)
Le build Windows tourne sur `windows-latest` via GitHub Actions et produit un installeur NSIS.

```bash
gh workflow run build-windows.yml --ref main
```

L'installeur est disponible dans les artefacts de la run.

---

## Structure du projet

```
ablo/
├── backend/              # Backend Python (IPC JSON)
│   ├── main.py           # Point d'entrée, routing des commandes
│   ├── transcription.py  # STT via Faster-Whisper
│   ├── anonymizer.py     # Détection et masquage des données sensibles
│   ├── llm_generator.py  # Génération et résumés via Mistral
│   ├── session_manager.py
│   ├── patient_manager.py
│   └── exporter.py       # Export Word + PDF
├── src/                  # Frontend React/TypeScript
│   ├── App.tsx           # Machine d'état principale
│   └── components/
├── src-tauri/            # Bridge Rust (Tauri)
│   └── src/lib.rs        # Commandes IPC Tauri
├── templates/            # Templates de bilan (.md)
├── docs/
│   ├── adr/              # Architecture Decision Records
│   └── design-system.md  # Tokens et composants UI
└── .github/workflows/
    └── build-windows.yml
```

---

## Données

Les données sont stockées localement dans le dossier configuré par le thérapeute (par défaut `~/Documents/Ablo`) :

```
~/Documents/Ablo/
└── Patients/
    └── <slug>_<id>/
        ├── patient.json
        ├── seance_YYYYMMDD_HHMMSS.json
        └── Bilan/
            ├── bilan_YYYYMMDD_<id>.docx
            └── bilan_YYYYMMDD_<id>.pdf
```

Aucun fichier n'est transmis à l'extérieur.

---

## Modèles IA

| Modèle | Usage | Taille |
|--------|-------|--------|
| `faster-whisper-small` | Transcription audio | ~460 Mo |
| `mistral-7b-instruct-v0.2.Q4_K_M.gguf` | Génération bilan + résumés | ~4,1 Go |

Téléchargés au premier lancement depuis l'écran d'accueil de l'app.

---

## Contexte domaine

Voir [`CONTEXT.md`](./CONTEXT.md) pour le vocabulaire métier, les contraintes structurantes et les décisions d'architecture.
