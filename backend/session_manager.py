"""
Gestion des bilans de séance par patient.
Chaque séance = un fichier seance_YYYYMMDD_HHMMSS.json dans le dossier du patient.
"""
from __future__ import annotations
import json
import datetime
from pathlib import Path
from patient_manager import patient_dir_for
from llm_generator import summarize_session

# Log partagé avec main.py pour diagnostics
_LOG_PATH = Path.home() / ".ablo" / "startup.log"

def _log(msg: str) -> None:
    import time
    ts = time.strftime("%H:%M:%S")
    try:
        with open(_LOG_PATH, "a", encoding="utf-8") as f:
            f.write(f"[{ts}] [session_manager] {msg}\n")
    except Exception:
        pass


def save_session(
    patient_id: str,
    anonymized_text: str,
    autoeval: dict,
    notes: str = "",
    date: str = "",
) -> dict:
    pdir = patient_dir_for(patient_id)
    if not pdir:
        raise ValueError(f"Patient '{patient_id}' introuvable")

    # Détecte si c'est la première séance du patient (avant d'écrire la nouvelle)
    existing_sessions = list(pdir.glob("seance_*.json"))
    is_first_session = len(existing_sessions) == 0

    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    session = {
        "date": date or datetime.date.today().isoformat(),
        "anonymized_text": anonymized_text,
        "autoeval": autoeval,
        "notes": notes,
        "summary": "",
        "is_first_session": is_first_session,
    }
    (pdir / f"seance_{timestamp}.json").write_text(
        json.dumps(session, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return session


def generate_session_summary(patient_id: str, filename: str) -> str:
    _log(f"generate_session_summary START patient={patient_id} file={filename}")
    pdir = patient_dir_for(patient_id)
    if not pdir:
        _log(f"ERROR: patient '{patient_id}' introuvable")
        raise ValueError(f"Patient '{patient_id}' introuvable")
    path = pdir / filename
    if not path.exists():
        _log(f"ERROR: fichier '{filename}' introuvable dans {pdir}")
        raise ValueError(f"Séance '{filename}' introuvable")
    data = json.loads(path.read_text(encoding="utf-8"))
    text = data.get("anonymized_text", "")
    is_first = data.get("is_first_session", False)
    _log(f"texte len={len(text)} is_first={is_first}")
    summary = summarize_session(text, is_first_session=is_first)
    _log(f"summary len={len(summary)} summary_preview={summary[:80] if summary else 'EMPTY'}")
    # N'écrit dans le fichier que si le résumé est non vide (permet de réessayer en cas d'échec)
    if summary:
        data["summary"] = summary
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    _log("generate_session_summary END")
    return summary


def update_session(
    patient_id: str,
    filename: str,
    date: str = "",
    notes: str = "",
    summary: str = "",
    autoeval: dict = None,
) -> dict:
    pdir = patient_dir_for(patient_id)
    if not pdir:
        raise ValueError(f"Patient '{patient_id}' introuvable")
    path = pdir / filename
    if not path.exists():
        raise ValueError(f"Séance '{filename}' introuvable")
    data = json.loads(path.read_text(encoding="utf-8"))
    if date:
        data["date"] = date
    data["notes"] = notes
    data["summary"] = summary
    if autoeval is not None:
        data["autoeval"] = autoeval
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    data["filename"] = filename
    return data


def delete_session(patient_id: str, filename: str) -> bool:
    pdir = patient_dir_for(patient_id)
    if not pdir:
        raise ValueError(f"Patient '{patient_id}' introuvable")
    path = pdir / filename
    if not path.exists():
        raise ValueError(f"Séance '{filename}' introuvable")
    path.unlink()
    return True


def list_sessions(patient_id: str) -> list[dict]:
    pdir = patient_dir_for(patient_id)
    if not pdir:
        return []
    result = []
    for f in pdir.glob("seance_*.json"):
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            data["filename"] = f.name
            data.setdefault("summary", "")
            data.setdefault("date", "")
            result.append(data)
        except Exception:
            pass
    result.sort(key=lambda s: (s["date"], s.get("filename", "")))
    for i, s in enumerate(result):
        s["is_first_session"] = (i == 0)
    return result
