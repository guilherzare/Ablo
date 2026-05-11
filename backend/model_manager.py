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

# faster_whisper attend le format CTranslate2 dans un dossier dédié
WHISPER_DIR = MODELS_DIR / "faster-whisper-small"
WHISPER_BASE_URL = "https://huggingface.co/Systran/faster-whisper-small/resolve/main"
# (filename, taille approx en octets)
WHISPER_FILES = [
    ("model.bin",              462_390_000),   # fichier principal (~462 Mo)
    ("config.json",                    600),
    ("tokenizer.json",           2_402_000),
    ("vocabulary.txt",             809_000),
    ("preprocessor_config.json",       200),
]
WHISPER_TOTAL_BYTES = sum(s for _, s in WHISPER_FILES)

# Modèle Mistral : fichier GGUF unique
MISTRAL_FILENAME = "mistral-7b-instruct-v0.2.Q4_K_M.gguf"
MISTRAL_URL = "https://huggingface.co/TheBloke/Mistral-7B-Instruct-v0.2-GGUF/resolve/main/mistral-7b-instruct-v0.2.Q4_K_M.gguf"
MISTRAL_SIZE = 4_368_491_520

MODELS: dict = {
    "whisper-small": {
        "label": "Transcription vocale (Whisper Small)",
        "size_bytes": WHISPER_TOTAL_BYTES,
    },
    "mistral-7b-q4": {
        "label": "Génération de bilans (Mistral 7B)",
        "size_bytes": MISTRAL_SIZE,
    },
}


def _emit(payload: dict) -> None:
    print(json.dumps(payload, ensure_ascii=False), flush=True)


def _whisper_present() -> bool:
    return (WHISPER_DIR / "model.bin").exists()


def _mistral_present() -> bool:
    return (MODELS_DIR / MISTRAL_FILENAME).exists()


def check_models() -> dict:
    """Retourne l'état de présence de chaque modèle."""
    return {
        "whisper-small": {
            "present": _whisper_present(),
            "label": MODELS["whisper-small"]["label"],
            "size_bytes": MODELS["whisper-small"]["size_bytes"],
        },
        "mistral-7b-q4": {
            "present": _mistral_present(),
            "label": MODELS["mistral-7b-q4"]["label"],
            "size_bytes": MODELS["mistral-7b-q4"]["size_bytes"],
        },
    }


def download_models() -> None:
    """Télécharge les modèles manquants avec progression sur stdout."""
    MODELS_DIR.mkdir(parents=True, exist_ok=True)

    # --- Whisper (multi-fichiers CTranslate2) ---
    if _whisper_present():
        _emit({"type": "progress", "model": "whisper-small",
               "status": "already_present", "percent": 100})
    else:
        WHISPER_DIR.mkdir(parents=True, exist_ok=True)
        _emit({"type": "progress", "model": "whisper-small", "status": "starting",
               "percent": 0, "label": MODELS["whisper-small"]["label"],
               "size_bytes": WHISPER_TOTAL_BYTES})
        try:
            _download_whisper()
        except Exception as e:
            _emit({"type": "error", "model": "whisper-small", "message": str(e)})
            return

    # --- Mistral (fichier GGUF unique) ---
    mistral_path = MODELS_DIR / MISTRAL_FILENAME
    if _mistral_present():
        _emit({"type": "progress", "model": "mistral-7b-q4",
               "status": "already_present", "percent": 100})
    else:
        _emit({"type": "progress", "model": "mistral-7b-q4", "status": "starting",
               "percent": 0, "label": MODELS["mistral-7b-q4"]["label"],
               "size_bytes": MISTRAL_SIZE})
        try:
            _download_single("mistral-7b-q4", MISTRAL_URL, MISTRAL_SIZE, mistral_path)
        except Exception as e:
            if mistral_path.exists():
                mistral_path.unlink()
            _emit({"type": "error", "model": "mistral-7b-q4", "message": str(e)})
            return

    _emit({"type": "complete"})


def _download_whisper() -> None:
    """Télécharge tous les fichiers CTranslate2 de Whisper Small."""
    for filename, approx_size in WHISPER_FILES:
        dest = WHISPER_DIR / filename
        if dest.exists():
            continue
        url = f"{WHISPER_BASE_URL}/{filename}"
        tmp = dest.with_suffix(".tmp")
        req = urllib.request.Request(url, headers={"User-Agent": "Ablo/0.1"})
        try:
            with urllib.request.urlopen(req, timeout=60, context=_SSL_CTX) as resp:
                total = int(resp.headers.get("Content-Length", approx_size))
                downloaded = 0
                with open(tmp, "wb") as f:
                    while True:
                        chunk = resp.read(512 * 1024)
                        if not chunk:
                            break
                        f.write(chunk)
                        downloaded += len(chunk)
                        if filename == "model.bin":
                            pct = min(int(downloaded * 100 / total), 99) if total else 0
                            _emit({
                                "type": "progress",
                                "model": "whisper-small",
                                "status": "downloading",
                                "downloaded_bytes": downloaded,
                                "total_bytes": total,
                                "percent": pct,
                            })
            tmp.rename(dest)
        except Exception as e:
            if tmp.exists():
                tmp.unlink()
            raise RuntimeError(f"Erreur téléchargement {filename} : {e}")

    _emit({"type": "progress", "model": "whisper-small", "status": "done", "percent": 100})


def _download_single(name: str, url: str, expected_size: int, dest: Path) -> None:
    """Télécharge un fichier unique avec progression."""
    tmp = dest.with_suffix(".tmp")
    req = urllib.request.Request(url, headers={"User-Agent": "Ablo/0.1"})
    with urllib.request.urlopen(req, timeout=60, context=_SSL_CTX) as resp:
        total = int(resp.headers.get("Content-Length", expected_size))
        downloaded = 0
        with open(tmp, "wb") as f:
            while True:
                chunk = resp.read(512 * 1024)
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
