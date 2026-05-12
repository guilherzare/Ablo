"""
TranscriptionModule : transcription audio locale via faster-whisper (CPU).
Émet des lignes JSON de progression sur stdout.
"""
import json
import sys
import os
from pathlib import Path


def _emit(payload: dict) -> None:
    print(json.dumps(payload, ensure_ascii=False), flush=True)


def transcribe(audio_path: str) -> None:
    """
    Transcrit le fichier audio et émet les événements de progression sur stdout.
    Émet {"type": "progress", "status": "loading"} puis des segments au fur et à mesure,
    puis {"type": "complete", "text": "..."} à la fin.
    """
    if not Path(audio_path).exists():
        _emit({"type": "error", "message": f"Fichier audio introuvable : {audio_path}"})
        return

    _emit({"type": "progress", "status": "loading",
           "message": "Chargement du modèle de transcription…"})

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        _emit({"type": "error",
               "message": "faster-whisper non installé. Exécutez : pip3 install faster-whisper"})
        return

    # Essaie large-v3 en priorité, repli sur small si absent
    models_dir = Path.home() / ".ablo" / "models"
    large_path = models_dir / "faster-whisper-large-v3"
    small_path = models_dir / "faster-whisper-small"
    model_path = str(large_path) if large_path.exists() else str(small_path)

    try:
        model = WhisperModel(
            model_path,
            device="cpu",
            compute_type="int8",
        )
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
