"""
Backend Python d'Oralis — point d'entrée du pont IPC.
Lit des commandes JSON sur stdin, écrit les réponses JSON sur stdout.
"""
import sys
import json

from settings_manager import get_settings, update_settings
from template_engine import load as load_template, validate_file as validate_template
from model_manager import check_models, download_models
from transcription import transcribe


def handle(cmd: dict) -> dict | None:
    """
    Retourne un dict pour les réponses simples.
    Retourne None pour les commandes streaming (download_models) qui écrivent
    directement sur stdout et n'ont pas de réponse unique.
    """
    method = cmd.get("method", "")
    params = cmd.get("params", {})
    req_id = cmd.get("id")

    if method == "ping":
        return {"id": req_id, "result": "pong"}

    # --- Settings ---
    if method == "get_settings":
        return {"id": req_id, "result": get_settings()}

    if method == "update_settings":
        return {"id": req_id, "result": update_settings(params)}

    # --- Template Engine ---
    if method == "load_template":
        path = params.get("path")
        if not path:
            return {"id": req_id, "error": "Paramètre 'path' manquant"}
        try:
            tmpl = load_template(path)
            return {"id": req_id, "result": tmpl.to_dict()}
        except Exception as e:
            return {"id": req_id, "error": str(e)}

    if method == "validate_template":
        path = params.get("path")
        if not path:
            return {"id": req_id, "error": "Paramètre 'path' manquant"}
        return {"id": req_id, "result": validate_template(path)}

    # --- Model Manager ---
    if method == "check_models":
        return {"id": req_id, "result": check_models()}

    if method == "download_models":
        # Streaming : écrit directement sur stdout, pas de réponse unique
        download_models()
        return None

    # --- Transcription ---
    if method == "transcribe":
        audio_path = params.get("audio_path")
        if not audio_path:
            return {"id": req_id, "error": "Paramètre 'audio_path' manquant"}
        # Streaming : transcribe écrit les événements directement sur stdout
        transcribe(audio_path)
        return None

    return {"id": req_id, "error": f"Méthode inconnue : {method}"}


def main() -> None:
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            cmd = json.loads(line)
            response = handle(cmd)
            if response is not None:
                print(json.dumps(response, ensure_ascii=False), flush=True)
        except json.JSONDecodeError as e:
            print(json.dumps({"id": None, "error": f"JSON invalide : {e}"}), flush=True)
        except Exception as e:
            print(json.dumps({"id": None, "error": str(e)}), flush=True)


if __name__ == "__main__":
    main()
