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

interface Props {
  anonymizedText: string;
  onComplete: (sections: Section[], templateName: string) => void;
  onSkip: () => void;
}

export function GenerationView({ anonymizedText, onComplete, onSkip }: Props) {
  const [status, setStatus] = useState("Démarrage…");
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [phase, setPhase] = useState<"loading" | "error">("loading");
  const previewRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const unlisten = listen<GenerationEvent>("generation-progress", (ev) => {
      const data = ev.payload;
      if (data.type === "progress") {
        setStatus(data.message ?? "En cours…");
      } else if (data.type === "token" && data.text) {
        setPreview((p) => p + data.text);
        if (previewRef.current) {
          previewRef.current.scrollTop = previewRef.current.scrollHeight;
        }
      } else if (data.type === "complete" && data.sections) {
        onComplete(data.sections, data.template_name ?? "Bilan de séance");
      } else if (data.type === "error") {
        setError(data.message ?? "Erreur inconnue");
        setPhase("error");
      }
    });

    invoke("start_generation", { text: anonymizedText }).catch((e) => {
      setError(String(e));
      setPhase("error");
    });

    return () => { unlisten.then((fn) => fn()); };
  }, [anonymizedText, onComplete]);

  if (phase === "error") {
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

  return (
    <div className="gen-view">
      <div className="gen-status">
        <div className="gen-spinner" />
        <p>{status}</p>
        <p className="gen-warning">
          La génération peut prendre 2 à 10 minutes selon la machine.
        </p>
      </div>

      {preview && (
        <pre className="gen-preview" ref={previewRef}>{preview}</pre>
      )}
    </div>
  );
}
