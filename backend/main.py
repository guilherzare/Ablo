"""
Backend Python d'Ablo — point d'entrée du pont IPC.
Lit des commandes JSON sur stdin, écrit les réponses JSON sur stdout.
"""
import sys
import os
import json

# En mode packagé (PyInstaller), ajouter le dossier d'extraction au PATH
# pour que ffmpeg et autres binaires inclus soient trouvables.
if getattr(sys, 'frozen', False):
    _bundle_dir = getattr(sys, '_MEIPASS', os.path.dirname(os.path.abspath(__file__)))
    os.environ['PATH'] = _bundle_dir + os.pathsep + os.environ.get('PATH', '')

# Certaines bibliothèques (ctranslate2, llama_cpp) écrivent sur stdout pendant
# leur import, à la fois via Python ET via leur code C natif (fd 1).
# On redirige les deux niveaux pour protéger le canal IPC JSON.
_real_stdout = sys.stdout
_devnull_fd = os.open(os.devnull, os.O_WRONLY)
_saved_fd1 = os.dup(1)
os.dup2(_devnull_fd, 1)
os.close(_devnull_fd)
sys.stdout = open(os.devnull, 'w')

from settings_manager import get_settings, update_settings
from dictionary_manager import get_dictionary, update_dictionary, apply_dictionary
from template_engine import load as load_template, validate_file as validate_template
from model_manager import check_models, download_models
from transcription import transcribe
from anonymizer import anonymize
from llm_generator import generate, generate_final
from report_validator import validate
from exporter import export
from patient_manager import list_patients, create_patient, update_patient, delete_patient, list_bilans
from session_manager import save_session, list_sessions
from lieu_manager import list_lieux, create_lieu, rename_lieu, delete_lieu

# Rétablir fd 1 (niveau OS) et sys.stdout (niveau Python), puis signaler "prêt".
os.dup2(_saved_fd1, 1)
os.close(_saved_fd1)
sys.stdout = _real_stdout
print('{"type":"ready"}', flush=True)


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

    # --- Dictionnaire de corrections ---
    if method == "get_dictionary":
        return {"id": req_id, "result": get_dictionary()}

    if method == "update_dictionary":
        return {"id": req_id, "result": update_dictionary(params.get("entries", []))}

    if method == "apply_dictionary":
        return {"id": req_id, "result": apply_dictionary(params.get("text", ""))}

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

    # --- Anonymisation ---
    if method == "anonymize":
        text = params.get("text", "")
        return {"id": req_id, "result": anonymize(text)}

    # --- Génération LLM (streaming) ---
    if method == "generate":
        generate(
            text=params.get("text", ""),
            template_path=params.get("template_path"),
        )
        return None

    # --- Validation déterministe ---
    if method == "validate_report":
        result = validate(
            sections=params.get("sections", []),
            anonymized_source=params.get("anonymized_source", ""),
        )
        return {"id": req_id, "result": result}

    # --- Export Word + PDF (streaming) ---
    if method == "export":
        export(
            sections=params.get("sections", []),
            template_name=params.get("template_name", "Bilan de séance"),
            patient_name=params.get("patient_name", ""),
            patient_id=params.get("patient_id", ""),
        )
        return None

    # --- Patients ---
    if method == "list_patients":
        return {"id": req_id, "result": list_patients()}

    if method == "create_patient":
        name = params.get("name", "").strip()
        if not name:
            return {"id": req_id, "error": "Nom du patient requis"}
        label = params.get("label", "")
        return {"id": req_id, "result": create_patient(name, label)}

    if method == "update_patient":
        try:
            return {"id": req_id, "result": update_patient(
                params.get("patient_id", ""),
                params.get("name", ""),
                params.get("label"),
            )}
        except ValueError as e:
            return {"id": req_id, "error": str(e)}

    if method == "delete_patient":
        try:
            delete_patient(params.get("patient_id", ""))
            return {"id": req_id, "result": True}
        except ValueError as e:
            return {"id": req_id, "error": str(e)}

    # --- Lieux ---
    if method == "list_lieux":
        return {"id": req_id, "result": list_lieux()}

    if method == "create_lieu":
        try:
            return {"id": req_id, "result": create_lieu(params.get("name", ""))}
        except ValueError as e:
            return {"id": req_id, "error": str(e)}

    if method == "rename_lieu":
        try:
            return {"id": req_id, "result": rename_lieu(params.get("old_name", ""), params.get("new_name", ""))}
        except ValueError as e:
            return {"id": req_id, "error": str(e)}

    if method == "delete_lieu":
        return {"id": req_id, "result": delete_lieu(params.get("name", ""))}

    # --- Séances ---
    if method == "list_sessions":
        return {"id": req_id, "result": list_sessions(params.get("patient_id", ""))}

    if method == "list_bilans":
        return {"id": req_id, "result": list_bilans(params.get("patient_id", ""))}

    if method == "save_session":
        try:
            result = save_session(
                patient_id=params.get("patient_id", ""),
                anonymized_text=params.get("anonymized_text", ""),
                autoeval=params.get("autoeval", {}),
                notes=params.get("notes", ""),
            )
            return {"id": req_id, "result": result}
        except ValueError as e:
            return {"id": req_id, "error": str(e)}

    # --- Génération bilan final (streaming, multi-séances) ---
    if method == "generate_final":
        generate_final(
            sessions=params.get("sessions", []),
            final_text=params.get("final_text", ""),
            template_path=params.get("template_path"),
        )
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
