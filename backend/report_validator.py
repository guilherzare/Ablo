"""
Validation déterministe du bilan généré (sans IA).
"""
from __future__ import annotations
import re
from typing import TypedDict


class ValidationResult(TypedDict):
    valid: bool
    errors: list[str]
    warnings: list[str]


_ANON_MARKER = re.compile(r"\[(?:NOM|EMAIL|TEL|DATE|VILLE)_\d+\]")
_TEMPLATE_PLACEHOLDER = re.compile(r"\{\{[^}]+\}\}")


def validate(sections: list[dict], anonymized_source: str) -> ValidationResult:
    errors: list[str] = []
    warnings: list[str] = []

    for s in sections:
        title = s.get("title", "")
        content = s.get("content", "").strip()
        required = s.get("required", True)

        if required and not content:
            errors.append(f"Section obligatoire vide : « {title} »")
            continue

        if _ANON_MARKER.search(content):
            errors.append(
                f"« {title} » — Un marqueur d'anonymisation encore présent. "
                "Pensez à le remplacer avant d'exporter."
            )

        if _TEMPLATE_PLACEHOLDER.search(content):
            errors.append(f"Placeholder non résolu dans « {title} ».")

    # Avertissement non bloquant : contenu de l'autoévaluation introuvable dans la source
    for s in sections:
        if "autoévaluation" in s.get("title", "").lower() and s.get("content", "").strip():
            sentences = [ln.strip() for ln in s["content"].split("\n") if ln.strip()]
            for sentence in sentences[:3]:
                words = sentence.lower().split()
                if len(words) > 4:
                    key = " ".join(words[1:4])
                    if key not in anonymized_source.lower():
                        warnings.append(
                            "La section « Autoévaluation » contient du contenu "
                            "qui ne semble pas présent dans la transcription source."
                        )
                        break

    return {
        "valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
    }
