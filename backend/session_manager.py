"""
Gestion des bilans de séance par patient.
Chaque séance = un fichier seance_YYYYMMDD_HHMMSS.json dans le dossier du patient.
"""
import json
import datetime
from pathlib import Path
from patient_manager import patient_dir_for
from llm_generator import summarize_session


def save_session(
    patient_id: str,
    anonymized_text: str,
    autoeval: dict,
    notes: str = "",
) -> dict:
    pdir = patient_dir_for(patient_id)
    if not pdir:
        raise ValueError(f"Patient '{patient_id}' introuvable")

    # Détecte si c'est la première séance du patient (avant d'écrire la nouvelle)
    existing_sessions = list(pdir.glob("seance_*.json"))
    is_first_session = len(existing_sessions) == 0

    # Génère le résumé via Mistral (bloquant ~30-60s)
    summary = summarize_session(anonymized_text, is_first_session=is_first_session)

    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    session = {
        "date": datetime.date.today().isoformat(),
        "anonymized_text": anonymized_text,
        "autoeval": autoeval,
        "notes": notes,
        "summary": summary,
        "is_first_session": is_first_session,
    }
    (pdir / f"seance_{timestamp}.json").write_text(
        json.dumps(session, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return session


def list_sessions(patient_id: str) -> list[dict]:
    pdir = patient_dir_for(patient_id)
    if not pdir:
        return []
    result = []
    for f in sorted(pdir.glob("seance_*.json")):
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            data["filename"] = f.name
            # Compatibilité ascendante : ajoute champs manquants pour anciennes séances
            data.setdefault("summary", "")
            data.setdefault("is_first_session", False)
            result.append(data)
        except Exception:
            pass
    return result
