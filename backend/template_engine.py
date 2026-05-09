"""
TemplateEngine : charge, parse et valide les templates de bilans.

Format attendu (Markdown + frontmatter YAML) :
---
name: "Bilan de prise en charge"
version: 1
---

## Titre de la section

[required: true]
[constraint: "Description de la contrainte"]
"""
import re
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Optional

try:
    import yaml
    _YAML_AVAILABLE = True
except ImportError:
    _YAML_AVAILABLE = False


@dataclass
class Section:
    title: str
    required: bool
    constraint: Optional[str]
    description: Optional[str]
    index: int

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class Template:
    name: str
    version: int
    sections: list[Section]

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "version": self.version,
            "sections": [s.to_dict() for s in self.sections],
        }


_FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL)
_SECTION_RE = re.compile(r"^#{1,3}\s+(.+)$", re.MULTILINE)
_REQUIRED_RE = re.compile(r"\[required:\s*(true|false)\]", re.IGNORECASE)
_CONSTRAINT_RE = re.compile(r'\[constraint:\s*"([^"]+)"\]')
_DESCRIPTION_RE = re.compile(r'\[description:\s*"([^"]+)"\]')


def _parse_frontmatter(text: str) -> tuple[dict, str]:
    m = _FRONTMATTER_RE.match(text)
    if not m:
        return {}, text
    body = text[m.end():]
    raw = m.group(1)
    if _YAML_AVAILABLE:
        meta = yaml.safe_load(raw) or {}
    else:
        # Minimal fallback : parse key: value lignes
        meta = {}
        for line in raw.splitlines():
            if ":" in line:
                k, _, v = line.partition(":")
                meta[k.strip()] = v.strip().strip('"')
    return meta, body


def load(path: str) -> Template:
    """Charge et parse un fichier template. Lève ValueError si invalide."""
    content = Path(path).read_text(encoding="utf-8")
    meta, body = _parse_frontmatter(content)

    name = meta.get("name")
    version = meta.get("version", 1)

    if not name:
        raise ValueError("Le template doit avoir un champ 'name' dans le frontmatter.")

    # Découpe le body en blocs de sections
    section_matches = list(_SECTION_RE.finditer(body))
    if not section_matches:
        raise ValueError("Le template ne contient aucune section (## Titre).")

    sections: list[Section] = []
    for i, match in enumerate(section_matches):
        title = match.group(1).strip()
        # Texte du bloc : jusqu'au prochain titre ou fin
        start = match.end()
        end = section_matches[i + 1].start() if i + 1 < len(section_matches) else len(body)
        block = body[start:end]

        req_match = _REQUIRED_RE.search(block)
        required = (req_match.group(1).lower() == "true") if req_match else True

        con_match = _CONSTRAINT_RE.search(block)
        constraint = con_match.group(1) if con_match else None

        desc_match = _DESCRIPTION_RE.search(block)
        description = desc_match.group(1) if desc_match else None

        sections.append(Section(title=title, required=required, constraint=constraint, description=description, index=i))

    return Template(name=str(name), version=int(version), sections=sections)


def validate_file(path: str) -> dict:
    """Valide un fichier template. Retourne {"ok": True} ou {"ok": False, "error": str}."""
    try:
        load(path)
        return {"ok": True}
    except (ValueError, FileNotFoundError, OSError) as e:
        return {"ok": False, "error": str(e)}
