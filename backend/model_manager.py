"""
ModelManager : détection, téléchargement et vérification des modèles IA locaux.
Émet des lignes JSON sur stdout pour le streaming de progression.
"""
import json
import sys
import ssl
import urllib.request
from pathlib import Path

try:
    import certifi
    _SSL_CTX = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    _SSL_CTX = ssl.create_default_context()

MODELS_DIR = Path.home() / ".ablo" / "models"

# URLs et métadonnées des modèles requis
MODELS: dict = {
    "whisper-small": {
        "filename": "ggml-small.bin",
        "url": "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin",
        "size_bytes": 244_000_000,
        "label": "Transcription vocale (Whisper Small)",
    },
    "mistral-7b-q4": {
        "filename": "mistral-7b-instruct-v0.2.Q4_K_M.gguf",
        "url": "https://huggingface.co/TheBloke/Mistral-7B-Instruct-v0.2-GGUF/resolve/main/mistral-7b-instruct-v0.2.Q4_K_M.gguf",
        "size_bytes": 4_368_491_520,
        "label": "Génération de bilans (Mistral 7B)",
    },
}


def _emit(payload: dict) -> None:
    print(json.dumps(payload, ensure_ascii=False), flush=True)


def check_models() -> dict:
    """Retourne l'état de présence de chaque modèle."""
    status = {}
    for name, model in MODELS.items():
        path = MODELS_DIR / model["filename"]
        status[name] = {
            "present": path.exists(),
            "label": model["label"],
            "size_bytes": model["size_bytes"],
            "path": str(path) if path.exists() else None,
        }
    return status


def download_models() -> None:
    """Télécharge les modèles manquants avec progression sur stdout."""
    MODELS_DIR.mkdir(parents=True, exist_ok=True)

    for name, model in MODELS.items():
        path = MODELS_DIR / model["filename"]

        if path.exists():
            _emit({"type": "progress", "model": name, "status": "already_present", "percent": 100})
            continue

        _emit({"type": "progress", "model": name, "status": "starting", "percent": 0,
               "label": model["label"], "size_bytes": model["size_bytes"]})
        try:
            _download(name, model, path)
        except Exception as e:
            # Nettoyer le fichier partiel
            if path.exists():
                path.unlink()
            _emit({"type": "error", "model": name, "message": str(e)})
            return

    _emit({"type": "complete"})


def _download(name: str, model: dict, dest: Path) -> None:
    url = model["url"]
    expected = model["size_bytes"]
    tmp = dest.with_suffix(".tmp")

    req = urllib.request.Request(url, headers={"User-Agent": "Ablo/0.1"})
    with urllib.request.urlopen(req, timeout=60, context=_SSL_CTX) as resp:
        total = int(resp.headers.get("Content-Length", expected))
        downloaded = 0
        chunk_size = 512 * 1024  # 512 Ko

        with open(tmp, "wb") as f:
            while True:
                chunk = resp.read(chunk_size)
                if not chunk:
                    break
                f.write(chunk)
                downloaded += len(chunk)
                pct = min(int(downloaded * 100 / total), 99) if total else 0
                _emit({
                    "type": "progress",
                    "model": name,
                    "status": "downloading",
                    "downloaded_bytes": downloaded,
                    "total_bytes": total,
                    "percent": pct,
                })

    tmp.rename(dest)
    _emit({"type": "progress", "model": name, "status": "done", "percent": 100})
