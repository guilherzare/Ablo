import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FirstRun } from "./components/FirstRun";
import { AudioRecorder } from "./components/AudioRecorder";
import { TranscriptionView } from "./components/TranscriptionView";
import "./App.css";

type AppState = "loading" | "first-run" | "step-audio" | "step-transcription";

const STEPS = ["Audio", "Transcription", "Anonymisation", "Génération", "Export"];

export default function App() {
  const [appState, setAppState] = useState<AppState>("loading");
  const [transcription, setTranscription] = useState("");

  useEffect(() => {
    invoke<{ result: Record<string, { present: boolean }> }>("call_backend", {
      method: "check_models",
      params: {},
    })
      .then((res) => {
        const allPresent = Object.values(res.result).every((m) => m.present);
        setAppState(allPresent ? "step-audio" : "first-run");
      })
      .catch(() => setAppState("first-run"));
  }, []);

  if (appState === "loading") {
    return <div className="loading-screen"><p>Démarrage d'Oralis…</p></div>;
  }

  if (appState === "first-run") {
    return <FirstRun onComplete={() => setAppState("step-audio")} />;
  }

  const currentStep = appState === "step-audio" ? 0 : 1;

  return (
    <div className="app-layout">
      {/* En-tête */}
      <header className="app-header">
        <span className="app-logo">Oralis</span>
        <nav className="step-nav">
          {STEPS.map((label, i) => (
            <span
              key={label}
              className={`step-pill ${i === currentStep ? "active" : ""} ${i < currentStep ? "done" : ""}`}
            >
              {i < currentStep ? "✓ " : ""}{label}
            </span>
          ))}
        </nav>
      </header>

      {/* Contenu principal */}
      <main className="app-main">
        {appState === "step-audio" && (
          <section className="step-section">
            <h1>Étape 1 — Enregistrement</h1>
            <p className="step-desc">
              Enregistrez vos notes de séance à voix haute, puis laissez Oralis les transcrire automatiquement.
            </p>
            <AudioRecorder
              onTranscriptionComplete={(text) => {
                setTranscription(text);
                setAppState("step-transcription");
              }}
            />
          </section>
        )}

        {appState === "step-transcription" && (
          <section className="step-section">
            <h1>Étape 2 — Transcription</h1>
            <TranscriptionView
              text={transcription}
              onChange={setTranscription}
              onContinue={() => {
                // TODO: étape anonymisation (#8)
                alert("Anonymisation — à venir dans l'issue #8");
              }}
            />
          </section>
        )}
      </main>
    </div>
  );
}
