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
                f"Téléchargez-le depuis l'écran d'accueil d'Ablo."
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


def _build_summary_prompt(text: str, is_first_session: bool) -> str:
    """Construit le prompt pour générer un résumé court d'une séance unique."""
    if is_first_session:
        focus = (
            "Cette séance est la PREMIÈRE séance du patient. Le thérapeute aborde "
            "généralement la demande initiale, les objectifs de la prise en charge, "
            "le cadre proposé et l'histoire du patient.\n\n"
            "Rédige un résumé concis (3 à 5 phrases) qui met l'accent sur :\n"
            "- La demande initiale du patient et son contexte\n"
            "- Les objectifs identifiés pour la prise en charge\n"
            "- Le cadre / dispositif proposé pour la suite"
        )
    else:
        focus = (
            "Rédige un résumé concis (3 à 5 phrases) de cette séance d'art-thérapie "
            "qui met en évidence :\n"
            "- Les éléments marquants et le ressenti du patient\n"
            "- Les œuvres, médiations ou activités réalisées\n"
            "- L'évolution observée par rapport au cadre thérapeutique"
        )
    return (
        "<s>[INST] Tu es un assistant clinique pour art-thérapeutes. "
        "Tu dois résumer une séance en français, de façon factuelle et professionnelle.\n\n"
        "RÈGLE ABSOLUE : utilise UNIQUEMENT les informations présentes dans la transcription. "
        "Si une information demandée n'est pas mentionnée, ne la mentionne pas. "
        "N'invente rien, n'extrapole pas.\n\n"
        "Transcription (données personnelles remplacées par des marqueurs comme [NOM_1]) :\n"
        "---\n"
        f"{text}\n"
        "---\n\n"
        f"{focus}\n\n"
        "Rends uniquement le résumé en texte continu, sans titre ni puces. [/INST]"
    )


def summarize_session(text: str, is_first_session: bool = False) -> str:
    """Génère un résumé court (3-5 phrases) d'une séance. Bloquant, retourne le texte."""
    import sys

    def log(msg: str) -> None:
        print(f"[summarize_session] {msg}", file=sys.stderr, flush=True)

    if not _LLAMA_AVAILABLE:
        log("ABORT: llama-cpp-python non installé")
        return ""
    if not _MODEL_PATH.exists():
        log(f"ABORT: modèle Mistral introuvable à {_MODEL_PATH}")
        return ""
    if not text.strip():
        log("ABORT: texte vide")
        return ""

    log(f"START first={is_first_session} text_len={len(text)}")

    try:
        llm = Llama(
            model_path=str(_MODEL_PATH),
            n_ctx=2048,
            n_threads=8,
            n_gpu_layers=-1,
            verbose=False,
        )
        log("Modèle chargé")
    except Exception as e:
        log(f"ERREUR chargement modèle : {e}")
        return ""

    prompt = _build_summary_prompt(text, is_first_session)

    try:
        result = llm(
            prompt,
            max_tokens=300,
            temperature=0.0,
            repeat_penalty=1.1,
            stop=["</s>", "[INST]"],
            stream=False,
            echo=False,
        )
        summary = result["choices"][0]["text"].strip()
        log(f"OK summary_len={len(summary)}")
        return summary
    except Exception as e:
        log(f"ERREUR génération : {e}")
        return ""


def _build_final_prompt(sessions: list[dict], final_text: str, template: Template) -> str:
    """Construit le prompt multi-séances pour le bilan final."""
    # Sections que le LLM ne doit pas rédiger (pré-remplies)
    skip_titles = {"autoévaluations du patient"}

    sections_desc = "\n\n".join(
        f"## {s.title}\n"
        f"{'[Obligatoire]' if s.required else '[Optionnel]'}"
        f"{' — ' + s.constraint if s.constraint else ''}"
        for s in template.sections
        if s.title.lower() not in skip_titles
    )

    sessions_block = ""
    for i, s in enumerate(sessions, 1):
        date = s.get("date", f"Séance {i}")
        text = s.get("anonymized_text", "").strip()
        notes = s.get("notes", "").strip()
        sessions_block += f"\n=== SÉANCE {i} — {date} ===\n{text}"
        if notes:
            sessions_block += f"\nNotes du thérapeute : {notes}"
        sessions_block += "\n"

    if final_text.strip():
        sessions_block += f"\n=== RÉSUMÉ FINAL DU THÉRAPEUTE ===\n{final_text.strip()}\n"

    return (
        "<s>[INST] Tu es un assistant clinique pour art-thérapeutes. "
        "Tu dois rédiger un bilan de prise en charge global en français, de façon factuelle et professionnelle.\n\n"
        "RÈGLE ABSOLUE : utilise UNIQUEMENT les informations présentes dans les transcriptions ci-dessous. "
        "Si une information n'est pas mentionnée, écris 'Non mentionné dans les transcriptions'. "
        "Ne complète pas, n'extrapole pas, n'invente jamais.\n\n"
        f"Transcriptions des séances ({len(sessions)} séance(s), "
        "données personnelles remplacées par des marqueurs) :\n"
        "---"
        f"{sessions_block}"
        "---\n\n"
        "Rédige le bilan final avec exactement ces sections dans cet ordre. "
        "Utilise ## pour chaque titre de section. Ne rajoute pas de sections supplémentaires.\n\n"
        f"{sections_desc} [/INST]"
    )


def _inject_autoeval(sections: list[dict], sessions: list[dict]) -> list[dict]:
    """Remplace le contenu de la section autoévaluation par le JSON multi-séances."""
    autoeval_data = {
        "type": "multi_session",
        "sessions": [
            {"date": s.get("date", ""), "scores": s.get("autoeval", {})}
            for s in sessions
        ],
    }
    return [
        {**s, "content": json.dumps(autoeval_data, ensure_ascii=False)}
        if "autoévaluation" in s["title"].lower()
        else s
        for s in sections
    ]


def generate_final(
    sessions: list[dict],
    final_text: str = "",
    template_path: str | None = None,
) -> None:
    if not _LLAMA_AVAILABLE:
        _emit({"type": "error", "message": "llama-cpp-python n'est pas installé."})
        return

    if not _MODEL_PATH.exists():
        _emit({"type": "error", "message": "Modèle Mistral introuvable."})
        return

    if not sessions:
        _emit({"type": "error", "message": "Aucune séance disponible pour générer le bilan."})
        return

    tpl_path = template_path or str(_DEFAULT_TEMPLATE)
    try:
        template = load_template(tpl_path)
    except Exception as e:
        _emit({"type": "error", "message": f"Template invalide : {e}"})
        return

    _emit({"type": "progress", "status": "loading_model", "message": "Chargement du modèle…"})

    try:
        llm = Llama(
            model_path=str(_MODEL_PATH),
            n_ctx=6144,  # contexte pour 5-6 séances (~4000 tokens utilisés)
            n_threads=8,
            n_gpu_layers=-1,
            verbose=False,
        )
    except Exception as e:
        _emit({"type": "error", "message": f"Impossible de charger le modèle : {e}"})
        return

    _emit({"type": "progress", "status": "generating", "message": "Génération du bilan final…"})

    prompt = _build_final_prompt(sessions, final_text, template)

    try:
        collected: list[str] = []
        for chunk in llm(
            prompt,
            max_tokens=1500,
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
        sections = _inject_autoeval(sections, sessions)
        _emit({
            "type": "complete",
            "sections": sections,
            "template_name": template.name,
        })

    except Exception as e:
        _emit({"type": "error", "message": f"Erreur pendant la génération : {e}"})
