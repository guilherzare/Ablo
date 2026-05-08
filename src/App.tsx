import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FirstRun } from "./components/FirstRun";
import { AudioRecorder } from "./components/AudioRecorder";
import { TranscriptionView } from "./components/TranscriptionView";
import { AnonymisationView, MaskSpan } from "./components/AnonymisationView";
import { GenerationView, Section } from "./components/GenerationView";
import { ReportEditor } from "./components/ReportEditor";
import { ExportView } from "./components/ExportView";
import { SettingsPanel } from "./components/SettingsPanel";
import "./App.css";

type AppState =
  | "loading"
  | "first-run"
  | "step-audio"
  | "step-transcription"
  | "step-anonymisation"
  | "step-generation"
  | "step-editing"
  | "step-export";

const STEPS = ["Audio", "Transcription", "Anonymisation", "Génération", "Export"];

const STEP_INDEX: Record<AppState, number> = {
  loading: 0,
  "first-run": 0,
  "step-audio": 0,
  "step-transcription": 1,
  "step-anonymisation": 2,
  "step-generation": 3,
  "step-editing": 3,
  "step-export": 4,
};

export default function App() {
  const [appState, setAppState] = useState<AppState>("loading");

  // Données inter-étapes
  const [transcription, setTranscription] = useState("");
  const [anonymizedText, setAnonymizedText] = useState("");
  const [_substitutionMap, setSubstitutionMap] = useState<Record<string, string>>({});
  const [anonSpans, setAnonSpans] = useState<MaskSpan[]>([]);
  const [reportSections, setReportSections] = useState<Section[]>([]);
  const [templateName, setTemplateName] = useState("Bilan de séance - Art-thérapie");

  // États temporaires
  const [isAnonymizing, setIsAnonymizing] = useState(false);
  const [anonymizeError, setAnonymizeError] = useState("");
  const [showSettings, setShowSettings] = useState(false);

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
      setAnonSpans(res.result.spans);
      setAppState("step-anonymisation");
    } catch (e) {
      setAnonymizeError(String(e));
    } finally {
      setIsAnonymizing(false);
    }
  }

  function handleAnonConfirm(anonText: string, subMap: Record<string, string>) {
    setAnonymizedText(anonText);
    setSubstitutionMap(subMap);
    setAppState("step-generation");
  }

  function handleGenerationComplete(sections: Section[], tplName: string) {
    setReportSections(sections);
    setTemplateName(tplName);
    setAppState("step-editing");
  }

  function handleGenerationSkip() {
    // Sections vides pour remplissage manuel
    setAppState("step-editing");
  }

  function handleExport(sections: Section[]) {
    setReportSections(sections);
    setAppState("step-export");
  }

  function handleRestart() {
    setTranscription("");
    setAnonymizedText("");
    setSubstitutionMap({});
    setAnonSpans([]);
    setReportSections([]);
    setAppState("step-audio");
  }

  if (appState === "loading") {
    return <div className="loading-screen"><p>Démarrage d'Oralis…</p></div>;
  }

  if (appState === "first-run") {
    return <FirstRun onComplete={() => setAppState("step-audio")} />;
  }

  const stepIndex = STEP_INDEX[appState];

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
        <button className="btn-settings" onClick={() => setShowSettings(true)} title="Réglages">⚙</button>
      </header>

      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}

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

        {appState === "step-anonymisation" && (
          <section className="step-section">
            <h1>Étape 3 — Anonymisation</h1>
            <p className="step-desc">
              Les informations personnelles détectées sont masquées. Vérifiez, corrigez si besoin, puis confirmez.
            </p>
            <AnonymisationView
              originalText={transcription}
              initialSpans={anonSpans}
              onConfirm={handleAnonConfirm}
            />
          </section>
        )}

        {appState === "step-generation" && (
          <section className="step-section">
            <h1>Étape 4 — Génération du bilan</h1>
            <p className="step-desc">
              Oralis génère le bilan structuré à partir de la transcription anonymisée.
            </p>
            <GenerationView
              anonymizedText={anonymizedText}
              onComplete={handleGenerationComplete}
              onSkip={handleGenerationSkip}
            />
          </section>
        )}

        {appState === "step-editing" && (
          <section className="step-section">
            <h1>Étape 4 — Édition du bilan</h1>
            <p className="step-desc">
              Relisez et corrigez chaque section avant d'exporter le bilan final.
            </p>
            <ReportEditor
              sections={reportSections}
              templateName={templateName}
              anonymizedText={anonymizedText}
              onExport={handleExport}
            />
          </section>
        )}

        {appState === "step-export" && (
          <section className="step-section">
            <h1>Étape 5 — Export</h1>
            <p className="step-desc">
              Génération des fichiers Word et PDF…
            </p>
            <ExportView
              sections={reportSections}
              templateName={templateName}
              onRestart={handleRestart}
            />
          </section>
        )}
      </main>
    </div>
  );
}
