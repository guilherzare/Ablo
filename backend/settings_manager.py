"""
Gestion des réglages utilisateur : template, dossier export, microphone.
Persistés dans ~/.ablo/settings.json
"""
import json
from pathlib import Path
from typing import Optional

SETTINGS_PATH = Path.home() / ".ablo" / "settings.json"

DEFAULTS: dict = {
    "template_path": None,
    "export_folder": str(Path.home() / "Documents" / "Ablo"),
    "microphone_id": None,
    "therapist_name": "",
    "therapist_email": "",
}


def _load_raw() -> dict:
    if not SETTINGS_PATH.exists():
        return {}
    try:
        return json.loads(SETTINGS_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def get_settings() -> dict:
    raw = _load_raw()
    return {**DEFAULTS, **raw}


def update_settings(patch: dict) -> dict:
    current = get_settings()
    updated = {**current, **patch}
    SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
    SETTINGS_PATH.write_text(
        json.dumps(updated, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return updated
