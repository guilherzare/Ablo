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
        "Tu dois rédiger un bilan de prise en charge en français, de façon factuelle et professionnelle.\n\n"
        "RÈGLE ABSOLUE : utilise UNIQUEMENT les informations présentes dans la transcription ci-dessous. "
        "Si une information n'est pas mentionnée, écris exactement 'Non mentionné dans la transcription' "
        "pour cette partie. Ne complète pas, n'extrapole pas, n'invente jamais.\n\n"
        "Transcription (données personnelles remplacées par des marqueurs comme [NOM_1]) :\n"
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

    # n_gpu_layers=-1 = décharge toutes les couches sur le GPU (Metal sur macOS, CUDA sur Windows)
    # Gain typique : 3-5x par rapport au CPU seul
    try:
        llm = Llama(
            model_path=str(_MODEL_PATH),
            n_ctx=2048,
            n_threads=8,
            n_gpu_layers=-1,
            verbose=False,
        )
    except Exception as e:
        _emit({"type": "error", "message": f"Impossible de charger le modèle : {e}"})
        return

    _emit({
        "type": "progress",
        "status": "generating",
        "message": "Génération en cours…",
    })

    prompt = _build_prompt(text, template)

    try:
        collected: list[str] = []
        for chunk in llm(
            prompt,
            max_tokens=1200,
            temperature=0.0,
            repeat_penalty=1.1,
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
