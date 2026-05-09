import { useEffect, useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "./GenerationView.css";

export interface Section {
  title: string;
  required: boolean;
  constraint: string | null;
  index: number;
  content: string;
}

interface GenerationEvent {
  type: "progress" | "token" | "complete" | "error";
  status?: string;
  message?: string;
  text?: string;
  sections?: Section[];
  template_name?: string;
}

export interface SessionForGeneration {
  date: string;
  anonymized_text: string;
  autoeval: Record<string, number>;
  notes: string;
}

const PHASE_MESSAGES = [
  "Analyse des séances…",
  "Extraction des informations clés…",
  "Identification des objectifs thérapeutiques…",
  "Structuration du bilan par sections…",
  "Rédaction des observations cliniques…",
  "Formulation des recommandations…",
  "Finalisation du bilan…",
];

const EXPECTED_TOKENS = 900;

interface Props {
  anonymizedText: string;
  sessions?: SessionForGeneration[];
  onComplete: (sections: Section[], templateName: string) => void;
  onSkip: () => void;
}

export function GenerationView({ anonymizedText, sessions, onComplete, onSkip }: Props) {
  const [tokenCount, setTokenCount] = useState(0);
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [modelLoading, setModelLoading] = useState(true);
  const [error, setError] = useState("");
  const tokenRef = useRef(0);
  const phaseTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    phaseTimerRef.current = setInterval(() => {
      setPhaseIndex((i) => Math.min(i + 1, PHASE_MESSAGES.length - 1));
    }, 8000);
    return () => { if (phaseTimerRef.current) clearInterval(phaseTimerRef.current); };
  }, []);

  useEffect(() => {
    const unlisten = listen<GenerationEvent>("generation-progress", (ev) => {
      const data = ev.payload;
      if (data.type === "progress" && data.status === "generating") {
        setModelLoading(false);
      } else if (data.type === "token" && data.text) {
        tokenRef.current += 1;
        setTokenCount(tokenRef.current);
      } else if (data.type === "complete" && data.sections) {
        if (phaseTimerRef.current) clearInterval(phaseTimerRef.current);
        onComplete(data.sections, data.template_name ?? "Bilan de prise en charge en Art-thérapie");
      } else if (data.type === "error") {
        if (phaseTimerRef.current) clearInterval(phaseTimerRef.current);
        setError(data.message ?? "Erreur inconnue");
      }
    });

    if (sessions && sessions.length > 0) {
      invoke("start_final_generation", {
        sessions,
        finalText: anonymizedText,
      }).catch((e) => setError(String(e)));
    } else {
      invoke("start_generation", { text: anonymizedText }).catch((e) => setError(String(e)));
    }

    return () => { unlisten.then((fn) => fn()); };
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return (
      <div className="gen-error">
        <p className="gen-error-icon">⚠️</p>
        <p className="gen-error-msg">{error}</p>
        <p className="gen-error-hint">
          Vous pouvez rédiger le bilan manuellement — toutes les sections sont éditables.
        </p>
        <button className="btn-skip" onClick={onSkip}>
          Remplir manuellement →
        </button>
      </div>
    );
  }

  const rawProgress = modelLoading
    ? 5
    : 10 + Math.min((tokenCount / EXPECTED_TOKENS) * 85, 85);
  const progress = Math.round(rawProgress);
  const currentMessage = modelLoading ? "Chargement du modèle…" : PHASE_MESSAGES[phaseIndex];

  return (
    <div className="gen-view">
      <div className="gen-card">
        <p className="gen-phase">{currentMessage}</p>
        <div className="gen-bar-track">
          <div className="gen-bar-fill" style={{ width: `${progress}%` }} />
        </div>
        <p className="gen-percent">{progress} %</p>
        <p className="gen-hint">
          La génération prend 2 à 10 minutes selon la puissance de la machine.
        </p>
      </div>
    </div>
  );
}
