import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FirstRun } from "./components/FirstRun";
import { AudioRecorder } from "./components/AudioRecorder";
import { TranscriptionView } from "./components/TranscriptionView";
import { AnonymisationView, MaskSpan } from "./components/AnonymisationView";
import "./App.css";

type AppState =
  | "loading"
  | "first-run"
  | "step-audio"
  | "step-transcription"
  | "step-anonymisation";

const STEPS = ["Audio", "Transcription", "Anonymisation", "Génération", "Export"];

interface AnonymisationData {
  spans: MaskSpan[];
}

export default function App() {
  const [appState, setAppState] = useState<AppState>("loading");
  const [transcription, setTranscription] = useState("");
  const [anonymisationData, setAnonymisationData] = useState<AnonymisationData | null>(null);
  const [isAnonymizing, setIsAnonymizing] = useState(false);
  const [anonymizeError, setAnonymizeError] = useState("");

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

  async function handleAnonymise() {
    setIsAnonymizing(true);
    setAnonymizeError("");
    try {
      const res = await invoke<{
        result: { anonymized_text: string; spans: MaskSpan[]; substitution_map: Record<string, string> };
      }>("call_backend", {
        method: "anonymize",
        params: { text: transcription },
      });
      setAnonymisationData({ spans: res.result.spans });
      setAppState("step-anonymisation");
    } catch (e) {
      setAnonymizeError(String(e));
    } finally {
      setIsAnonymizing(false);
    }
  }

  if (appState === "loading") {
    return <div className="loading-screen"><p>Démarrage d'Oralis…</p></div>;
  }

  if (appState === "first-run") {
    return <FirstRun onComplete={() => setAppState("step-audio")} />;
  }

  const stepIndex = { "step-audio": 0, "step-transcription": 1, "step-anonymisation": 2 }[appState] ?? 0;

  return (
    <div className="app-layout">
      <header className="app-header">
        <span className="app-logo">Oralis</span>
        <nav className="step-nav">
          {STEPS.map((label, i) => (
            <span
              key={label}
              className={`step-pill ${i === stepIndex ? "active" : ""} ${i < stepIndex ? "done" : ""}`}
            >
              {i < stepIndex ? "✓ " : ""}{label}
            </span>
          ))}
        </nav>
      </header>

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
              onContinue={handleAnonymise}
              isLoading={isAnonymizing}
              loadingLabel="Analyse en cours…"
            />
            {anonymizeError && (
              <p style={{ color: "#dc2626", marginTop: 8, fontSize: "0.875rem" }}>
                ❌ {anonymizeError}
              </p>
            )}
          </section>
        )}

        {appState === "step-anonymisation" && anonymisationData && (
          <section className="step-section">
            <h1>Étape 3 — Anonymisation</h1>
            <p className="step-desc">
              Les informations personnelles détectées sont masquées. Vérifiez, corrigez si besoin, puis confirmez.
            </p>
            <AnonymisationView
              originalText={transcription}
              initialSpans={anonymisationData.spans}
              onConfirm={(_anonymizedText, _subMap) => {
                // TODO : issue #9 — génération LLM
                alert("Génération du bilan — à venir dans l'issue #9");
              }}
            />
          </section>
        )}
      </main>
    </div>
  );
}
