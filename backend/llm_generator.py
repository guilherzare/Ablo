"""
Génération du bilan via Mistral 7B Q4_K_M (llama.cpp).
Streaming : émet des lignes JSON sur stdout.
"""
import json
import re
from pathlib import Path

try:
    from llama_cpp import Llama
    _LLAMA_AVAILABLE = True
except ImportError:
    _LLAMA_AVAILABLE = False

from model_manager import MODELS_DIR, MODELS
from template_engine import load as load_template, Template

_DEFAULT_TEMPLATE = Path(__file__).parent.parent / "templates" / "bilan_art_therapie.md"
_MODEL_PATH = MODELS_DIR / MODELS["mistral-7b-q4"]["filename"]


def _emit(payload: dict) -> None:
    print(json.dumps(payload, ensure_ascii=False), flush=True)


def _build_prompt(text: str, template: Template) -> str:
    sections_desc = "\n\n".join(
        f"## {s.title}\n"
        f"{'[Obligatoire]' if s.required else '[Optionnel]'}"
        f"{' — ' + s.constraint if s.constraint else ''}"
        for s in template.sections
    )
    return (
        "<s>[INST] Tu es un assistant clinique pour art-thérapeutes. "
        "Rédige un bilan de séance structuré en français, de façon factuelle et professionnelle, "
        "en te basant UNIQUEMENT sur la transcription fournie. "
        "Ne fabrique pas d'informations absentes de la transcription.\n\n"
        "Transcription de la séance (données personnelles remplacées par des marqueurs) :\n"
        "---\n"
        f"{text}\n"
        "---\n\n"
        "Rédige le bilan avec exactement ces sections dans cet ordre. "
        "Utilise ## pour chaque titre de section. Ne rajoute pas de sections supplémentaires.\n\n"
        f"{sections_desc} [/INST]"
    )


def _parse_sections(output: str, template: Template) -> list[dict]:
    """Découpe la sortie LLM par titres ## et mappe sur les sections du template."""
    results: dict[str, str] = {s.title: "" for s in template.sections}

    parts = re.split(r"(?m)^#{1,3}\s+", output)
    for part in parts:
        if not part.strip():
            continue
        lines = part.split("\n", 1)
        title_raw = lines[0].strip().rstrip("*").strip()
        content = lines[1].strip() if len(lines) > 1 else ""
        for section_title in results:
            if (section_title.lower() in title_raw.lower()
                    or title_raw.lower() in section_title.lower()):
                if not results[section_title]:
                    results[section_title] = content
                break

    return [
        {
            "title": s.title,
            "required": s.required,
            "constraint": s.constraint,
            "index": s.index,
            "content": results.get(s.title, ""),
        }
        for s in template.sections
    ]


def generate(text: str, template_path: str | None = None) -> None:
    if not _LLAMA_AVAILABLE:
        _emit({
            "type": "error",
            "message": (
                "llama-cpp-python n'est pas installé. "
                "Installez-le avec : python3 -m pip install llama-cpp-python"
            ),
        })
        return

    if not _MODEL_PATH.exists():
        _emit({
            "type": "error",
            "message": (
                f"Modèle Mistral introuvable. "
                f"Téléchargez-le depuis l'écran d'accueil d'Oralis."
            ),
        })
        return

    tpl_path = template_path or str(_DEFAULT_TEMPLATE)
    try:
        template = load_template(tpl_path)
    except Exception as e:
        _emit({"type": "error", "message": f"Template invalide : {e}"})
        return

    _emit({
        "type": "progress",
        "status": "loading_model",
        "message": "Chargement du modèle (30–60 secondes)…",
    })

    try:
        llm = Llama(
            model_path=str(_MODEL_PATH),
            n_ctx=4096,
            n_threads=4,
            n_gpu_layers=0,
            verbose=False,
        )
    except Exception as e:
        _emit({"type": "error", "message": f"Impossible de charger le modèle : {e}"})
        return

    _emit({
        "type": "progress",
        "status": "generating",
        "message": "Génération en cours (2–10 min selon la machine)…",
    })

    prompt = _build_prompt(text, template)

    try:
        collected: list[str] = []
        for chunk in llm(
            prompt,
            max_tokens=2048,
            temperature=0.1,
            stop=["</s>", "[INST]"],
            stream=True,
            echo=False,
        ):
            token = chunk["choices"][0]["text"]
            collected.append(token)
            _emit({"type": "token", "text": token})

        sections = _parse_sections("".join(collected), template)
        _emit({
            "type": "complete",
            "sections": sections,
            "template_name": template.name,
        })

    except Exception as e:
        _emit({"type": "error", "message": f"Erreur pendant la génération : {e}"})
