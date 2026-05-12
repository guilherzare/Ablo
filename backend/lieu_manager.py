"""
Gestion des lieux (cabinets, villes…) disponibles pour étiqueter les patients.
Stockage : <export_folder>/lieux.json
"""
from __future__ import annotations
import json
from pathlib import Path
from settings_manager import get_settings


def _lieux_path() -> Path:
    settings = get_settings()
    base = Path(settings.get("export_folder", "~/Documents/Ablo")).expanduser()
    base.mkdir(parents=True, exist_ok=True)
    return base / "lieux.json"


def _load() -> list[str]:
    p = _lieux_path()
    if not p.exists():
        return []
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return []


def _save(lieux: list[str]) -> None:
    _lieux_path().write_text(
        json.dumps(sorted(lieux), ensure_ascii=False, indent=2), encoding="utf-8"
    )


def list_lieux() -> list[str]:
    stored = set(_load())
    from patient_manager import _patients_dir
    for d in _patients_dir().iterdir():
        pf = d / "patient.json"
        if not pf.exists():
            continue
        try:
            label = json.loads(pf.read_text(encoding="utf-8")).get("label", "").strip()
            if label:
                stored.add(label)
        except Exception:
            pass
    return sorted(stored)


def create_lieu(name: str) -> list[str]:
    name = name.strip()
    if not name:
        raise ValueError("Nom du lieu requis")
    lieux = _load()
    if name not in lieux:
        lieux.append(name)
        _save(lieux)
    return list_lieux()


def rename_lieu(old_name: str, new_name: str) -> list[str]:
    new_name = new_name.strip()
    if not new_name:
        raise ValueError("Nom du lieu requis")
    lieux = _load()
    lieux = [new_name if l == old_name else l for l in lieux]
    _save(lieux)
    _update_patients_label(old_name, new_name)
    return list_lieux()


def delete_lieu(name: str) -> list[str]:
    lieux = [l for l in _load() if l != name]
    _save(lieux)
    _update_patients_label(name, "")
    return list_lieux()


def _update_patients_label(old_label: str, new_label: str) -> None:
    from patient_manager import _patients_dir
    for d in _patients_dir().iterdir():
        pf = d / "patient.json"
        if not pf.exists():
            continue
        try:
            data = json.loads(pf.read_text(encoding="utf-8"))
            if data.get("label") == old_label:
                data["label"] = new_label
                pf.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        except Exception:
            pass
