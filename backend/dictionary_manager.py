"""
Dictionnaire de corrections de transcription.
Persisté dans ~/.ablo/transcription_dictionary.json.
Format : [{"wrong": "...", "correct": "..."}, ...]
"""
import json
import re
from pathlib import Path

DICT_PATH = Path.home() / ".ablo" / "transcription_dictionary.json"


def get_dictionary() -> list[dict]:
    if not DICT_PATH.exists():
        return []
    try:
        data = json.loads(DICT_PATH.read_text(encoding="utf-8"))
        return [e for e in data if isinstance(e, dict) and "wrong" in e and "correct" in e]
    except (json.JSONDecodeError, OSError):
        return []


def update_dictionary(entries: list[dict]) -> list[dict]:
    cleaned = [
        {"wrong": str(e.get("wrong", "")).strip(), "correct": str(e.get("correct", "")).strip()}
        for e in entries
        if str(e.get("wrong", "")).strip()
    ]
    DICT_PATH.parent.mkdir(parents=True, exist_ok=True)
    DICT_PATH.write_text(json.dumps(cleaned, ensure_ascii=False, indent=2), encoding="utf-8")
    return cleaned


def apply_dictionary(text: str) -> str:
    entries = get_dictionary()
    for entry in entries:
        wrong = entry["wrong"]
        correct = entry["correct"]
        if not wrong:
            continue
        try:
            text = re.sub(re.escape(wrong), correct, text, flags=re.IGNORECASE)
        except re.error:
            text = text.replace(wrong, correct)
    return text
