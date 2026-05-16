"""
TranscriptionModule : transcription audio locale via faster-whisper (CPU).
Émet des lignes JSON de progression sur stdout.
"""
from __future__ import annotations
import json
import sys
import os
from pathlib import Path

# Cache du modèle Whisper — chargé une seule fois pour toute la session.
# Évite de recharger 462 Mo depuis le disque à chaque transcription.
_whisper_model = None
_whisper_model_path: str | None = None


def _emit(payload: dict) -> None:
    print(json.dumps(payload, ensure_ascii=False), flush=True)


def _get_model():
    """Retourne le modèle Whisper, en le chargeant depuis le disque si nécessaire.
    Essaie large-v3 en priorité, repli sur small si absent."""
    global _whisper_model, _whisper_model_path

    # Déterminer le chemin du meilleur modèle disponible
    models_dir = Path.home() / ".ablo" / "models"
    large_path = models_dir / "faster-whisper-large-v3"
    small_path = models_dir / "faster-whisper-small"
    model_path = str(large_path) if large_path.exists() else str(small_path)

    # Si le modèle est déjà en mémoire ET c'est le même chemin, le réutiliser
    if _whisper_model is not None and _whisper_model_path == model_path:
        return _whisper_model

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        raise RuntimeError("faster-whisper non installé. Exécutez : pip3 install faster-whisper")

    _whisper_model = WhisperModel(
        model_path,
        device="cpu",
        compute_type="int8",
    )
    _whisper_model_path = model_path
    return _whisper_model


def transcribe(audio_path: str) -> None:
    """
    Transcrit le fichier audio et émet les événements de progression sur stdout.
    Émet {"type": "progress", "status": "loading"} puis des segments au fur et à mesure,
    puis {"type": "complete", "text": "..."} à la fin.
    """
    if not Path(audio_path).exists():
        _emit({"type": "error", "message": f"Fichier audio introuvable : {audio_path}"})
        return

    # N'affiche le message de chargement que si le modèle n'est pas encore en mémoire
    if _whisper_model is None:
        _emit({"type": "progress", "status": "loading",
               "message": "Chargement du modèle de transcription…"})

    try:
        model = _get_model()
    except Exception as e:
        _emit({"type": "error", "message": f"Impossible de charger le modèle Whisper : {e}"})
        return

    _emit({"type": "progress", "status": "transcribing",
           "message": "Transcription en cours…"})

    # Prompt de domaine : aide Whisper à reconnaître le vocabulaire art-thérapie
    INITIAL_PROMPT = (
        "Séance d'art-thérapie. Bilan de prise en charge thérapeutique. "
        "Médiation artistique, argile, peinture, aquarelle, collage, dessin, sculpture. "
        "Transfert, contre-transfert, alliance thérapeutique, cadre thérapeutique. "
        "Expression créatrice, processus de création, œuvre plastique. "
        "Anamnèse, symptômes, trouble anxieux, dépression, trauma."
    )

    try:
        segments, info = model.transcribe(
            audio_path,
            language="fr",
            beam_size=5,
            initial_prompt=INITIAL_PROMPT,
            vad_filter=True,          # filtre les silences
            vad_parameters={"min_silence_duration_ms": 500},
        )

        full_text_parts: list[str] = []
        for segment in segments:
            text = segment.text.strip()
            if text:
                full_text_parts.append(text)
                _emit({
                    "type": "segment",
                    "text": text,
                    "start": round(segment.start, 2),
                    "end": round(segment.end, 2),
                })

        full_text = " ".join(full_text_parts)
        _emit({"type": "complete", "text": full_text})

    except Exception as e:
        _emit({"type": "error", "message": f"Erreur de transcription : {e}"})
