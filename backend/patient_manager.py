"""
Gestion des dossiers patients.
Stockage : <export_folder>/Patients/<slug>_<id8>/patient.json
"""
import json
import re
import uuid
import datetime
from pathlib import Path
from settings_manager import get_settings


def _patients_dir() -> Path:
    settings = get_settings()
    base = Path(settings.get("export_folder", "~/Documents/Ablo")).expanduser()
    p = base / "Patients"
    p.mkdir(parents=True, exist_ok=True)
    return p


def _slug(name: str) -> str:
    s = name.lower().strip()
    for src, dst in [("àâä", "a"), ("éèêë", "e"), ("îï", "i"), ("ôö", "o"), ("ùûü", "u"), ("ç", "c")]:
        for c in src:
            s = s.replace(c, dst)
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")[:20]


def create_patient(name: str) -> dict:
    pid = uuid.uuid4().hex[:8]
    folder_name = f"{_slug(name)}_{pid}"
    patient_dir = _patients_dir() / folder_name
    patient_dir.mkdir(parents=True, exist_ok=True)
    data = {
        "id": pid,
        "name": name,
        "folder": folder_name,
        "created_at": datetime.date.today().isoformat(),
    }
    (patient_dir / "patient.json").write_text(
        json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return data


def list_patients() -> list[dict]:
    patients_dir = _patients_dir()
    result = []
    for d in patients_dir.iterdir():
        if not d.is_dir():
            continue
        pf = d / "patient.json"
        if not pf.exists():
            continue
        try:
            data = json.loads(pf.read_text(encoding="utf-8"))
            sessions = sorted(d.glob("seance_*.json"))
            data["session_count"] = len(sessions)
            if sessions:
                latest = json.loads(sessions[-1].read_text(encoding="utf-8"))
                data["last_session_date"] = latest.get("date", "")
            else:
                data["last_session_date"] = ""
            bilans = data.get("bilans", [])
            data["bilan_count"] = len(bilans)
            data["last_bilan_date"] = bilans[-1]["date"] if bilans else ""
            result.append(data)
        except Exception:
            pass
    result.sort(
        key=lambda p: p.get("last_session_date") or p.get("created_at", ""),
        reverse=True,
    )
    return result


def update_patient(patient_id: str, name: str) -> dict:
    pdir = patient_dir_for(patient_id)
    if not pdir:
        raise ValueError(f"Patient '{patient_id}' introuvable")
    pf = pdir / "patient.json"
    data = json.loads(pf.read_text(encoding="utf-8"))
    data["name"] = name.strip()
    pf.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return data


def delete_patient(patient_id: str) -> None:
    import shutil
    pdir = patient_dir_for(patient_id)
    if not pdir:
        raise ValueError(f"Patient '{patient_id}' introuvable")
    shutil.rmtree(pdir)


def record_bilan(patient_id: str, docx_path: str, pdf_path: str) -> dict:
    pdir = patient_dir_for(patient_id)
    if not pdir:
        raise ValueError(f"Patient '{patient_id}' introuvable")
    pf = pdir / "patient.json"
    data = json.loads(pf.read_text(encoding="utf-8"))
    bilan = {
        "date": datetime.date.today().isoformat(),
        "docx_path": docx_path,
        "pdf_path": pdf_path,
    }
    data.setdefault("bilans", []).append(bilan)
    pf.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return bilan


def list_bilans(patient_id: str) -> list[dict]:
    pdir = patient_dir_for(patient_id)
    if not pdir:
        return []
    try:
        data = json.loads((pdir / "patient.json").read_text(encoding="utf-8"))
        return list(reversed(data.get("bilans", [])))
    except Exception:
        return []


def patient_dir_for(patient_id: str) -> Path | None:
    for d in _patients_dir().iterdir():
        pf = d / "patient.json"
        if not pf.exists():
            continue
        try:
            data = json.loads(pf.read_text(encoding="utf-8"))
            if data.get("id") == patient_id:
                return d
        except Exception:
            pass
    return None
