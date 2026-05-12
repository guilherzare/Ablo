"""
Backend Python d'Ablo — point d'entrée du pont IPC.
Lit des commandes JSON sur stdin, écrit les réponses JSON sur stdout.
"""
import sys
import os
import json
import pathlib
import datetime

# Log de démarrage — écrit dans ~/.ablo/startup.log pour diagnostic
_LOG_PATH = pathlib.Path.home() / ".ablo" / "startup.log"
_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
_log_file = open(_LOG_PATH, "w", encoding="utf-8", buffering=1)

def _log(msg: str) -> None:
    ts = datetime.datetime.now().strftime("%H:%M:%S.%f")[:-3]
    _log_file.write(f"[{ts}] {msg}\n")
    _log_file.flush()

_log("=== démarrage backend Ablo ===")
_log(f"Python {sys.version}")
_log(f"frozen={getattr(sys, 'frozen', False)}")

# En mode packagé (PyInstaller), ajouter le dossier d'extraction au PATH
# pour que ffmpeg et autres binaires inclus soient trouvables.
if getattr(sys, 'frozen', False):
    _bundle_dir = getattr(sys, '_MEIPASS', os.path.dirname(os.path.abspath(__file__)))
    os.environ['PATH'] = _bundle_dir + os.pathsep + os.environ.get('PATH', '')
    _log(f"_MEIPASS={_bundle_dir}")

# Redirige sys.stdout pendant les imports pour éviter toute sortie parasite
# sur le canal IPC JSON (les imports lourds sont différés à l'appel).
_real_stdout = sys.stdout
sys.stdout = open(os.devnull, 'w')
_log("stdout redirigé vers devnull")

_log("import settings_manager…")
from settings_manager import get_settings, update_settings
_log("import dictionary_manager…")
from dictionary_manager import get_dictionary, update_dictionary, apply_dictionary
_log("import template_engine…")
from template_engine import load as load_template, validate_file as validate_template
_log("import model_manager…")
from model_manager import check_models, download_models, check_large_v3, download_large_v3
_log("import transcription…")
from transcription import transcribe
_log("import anonymizer…")
from anonymizer import anonymize
_log("import llm_generator…")
from llm_generator import generate, generate_final
_log("import report_validator…")
from report_validator import validate
_log("import exporter…")
from exporter import export
_log("import patient_manager…")
from patient_manager import list_patients, create_patient, update_patient, delete_patient, list_bilans
_log("import session_manager…")
from session_manager import save_session, generate_session_summary, update_session, delete_session, list_sessions
_log("import lieu_manager…")
from lieu_manager import list_lieux, create_lieu, rename_lieu, delete_lieu

_log("tous les imports OK")

# Rebind sys.stdin et sys.stdout sur les fd 0/1 avec encodage UTF-8 explicite.
# Sous Windows + PyInstaller, l'encodage par défaut est cp1252 :
# les caractères non-ASCII envoyés par Rust en UTF-8 (ex : é = 0xC3 0xA9)
# étaient décodés en deux caractères cp1252 (Ã + ©).
# io.FileIO(n, closefd=False) crée un accès direct au fd sans le fermer.
import io
sys.stdin = io.TextIOWrapper(
    io.FileIO(0, mode='rb', closefd=False),
    encoding='utf-8',
    errors='replace',
)
sys.stdout = io.TextIOWrapper(
    io.FileIO(1, mode='wb', closefd=False),
    encoding='utf-8',
    line_buffering=True,
    errors='replace',
)

# Signal ready : os.write(1) en priorité (contourne sys.stdout),
# puis fallback sur le nouveau sys.stdout.
try:
    os.write(1, b'{"type":"ready"}\n')
    _log("signal ready envoyé via os.write(1)")
except Exception as _e:
    sys.stdout.write('{"type":"ready"}\n')
    sys.stdout.flush()
    _log(f"signal ready envoyé via sys.stdout (fallback, err={_e})")


def handle(cmd: dict) -> dict | None:
    """
    Retourne un dict pour les réponses simples.
    Retourne None pour les commandes streaming (download_models) qui écrivent
    directement sur stdout et n'ont pas de réponse unique.
    """
    method = cmd.get("method", "")
    params = cmd.get("params", {})
    req_id = cmd.get("id")
    # Log every incoming request (sauf les méthodes trop fréquentes)
    if method not in ("ping",):
        _log(f"→ {method}")

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

    if method == "check_large_v3":
        return {"id": req_id, "result": check_large_v3()}

    if method == "download_large_v3":
        # Streaming : émet la progression sur stdout
        download_large_v3()
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
                date=params.get("date", ""),
            )
            return {"id": req_id, "result": result}
        except ValueError as e:
            return {"id": req_id, "error": str(e)}

    if method == "generate_session_summary":
        _log(f"generate_session_summary reçu patient={params.get('patient_id','')} file={params.get('filename','')}")
        try:
            result = generate_session_summary(
                patient_id=params.get("patient_id", ""),
                filename=params.get("filename", ""),
            )
            _log(f"generate_session_summary OK result_len={len(result) if result else 0}")
            return {"id": req_id, "result": result}
        except Exception as e:
            _log(f"generate_session_summary ERREUR: {e}")
            return {"id": req_id, "error": str(e)}

    if method == "update_session":
        try:
            result = update_session(
                patient_id=params.get("patient_id", ""),
                filename=params.get("filename", ""),
                date=params.get("date", ""),
                notes=params.get("notes", ""),
                summary=params.get("summary", ""),
                autoeval=params.get("autoeval"),
            )
            return {"id": req_id, "result": result}
        except ValueError as e:
            return {"id": req_id, "error": str(e)}

    if method == "delete_session":
        try:
            result = delete_session(
                params.get("patient_id", ""),
                params.get("filename", ""),
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
