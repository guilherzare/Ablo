import { useState, useEffect, useRef } from "react";
import sessionRecordImg from "./assets/session-record.png";
import { invoke } from "@tauri-apps/api/core";
import { FirstRun } from "./components/FirstRun";
import { HomePage } from "./components/HomePage";
import { PatientPage, Patient, Session } from "./components/PatientPage";
import { AudioRecorder } from "./components/AudioRecorder";
import { TranscriptionView } from "./components/TranscriptionView";
import { AnonymisationView, MaskSpan } from "./components/AnonymisationView";
import { SessionAutoEvalView } from "./components/SessionAutoEvalView";
import { GenerationView, Section } from "./components/GenerationView";
import { ReportEditor } from "./components/ReportEditor";
import { ExportView } from "./components/ExportView";
import { SettingsPanel } from "./components/SettingsPanel";
import "./App.css";

type AppState =
  | "loading"
  | "first-run"
  | "home"
  | "patient"
  | "session-audio"
  | "session-transcription"
  | "session-anonymisation"
  | "session-autoeval"
  | "final-audio"
  | "final-transcription"
  | "final-anonymisation"
  | "final-generation"
  | "final-editing"
  | "final-export";

const SESSION_STEPS = ["Enregistrement", "Transcription", "Anonymisation", "Autoévaluation"];
const FINAL_STEPS = ["Résumé oral", "Transcription", "Anonymisation", "Génération", "Export"];

const SESSION_STEP_INDEX: Partial<Record<AppState, number>> = {
  "session-audio": 0, "session-transcription": 1, "session-anonymisation": 2, "session-autoeval": 3,
};
const FINAL_STEP_INDEX: Partial<Record<AppState, number>> = {
  "final-audio": 0, "final-transcription": 1, "final-anonymisation": 2,
  "final-generation": 3, "final-editing": 3, "final-export": 4,
};

export default function App() {
  const [appState, setAppState] = useState<AppState>("loading");
  const [currentPatient, setCurrentPatient] = useState<Patient | null>(null);
  const [patientSessions, setPatientSessions] = useState<Session[]>([]);
  const [transcription, setTranscription] = useState("");
  const [anonymizedText, setAnonymizedText] = useState("");
  const [anonSpans, setAnonSpans] = useState<MaskSpan[]>([]);
  const [reportSections, setReportSections] = useState<Section[]>([]);
  const [templateName, setTemplateName] = useState("Bilan de prise en charge en Art-thérapie");
  const [isAnonymizing, setIsAnonymizing] = useState(false);
  const [anonymizeError, setAnonymizeError] = useState("");
  const [showSettings, setShowSettings] = useState(false);

  // Header patient — menu "..."
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [editName, setEditName] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    invoke<{ result: Record<string, { present: boolean }> }>("call_backend", {
      method: "check_models", params: {},
    })
      .then((res) => {
        const allPresent = Object.values(res.result).every((m) => m.present);
        setAppState(allPresent ? "home" : "first-run");
      })
      .catch(() => setAppState("first-run"));
  }, []);

  // Ferme le menu si clic en dehors
  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  useEffect(() => {
    if (renaming) renameInputRef.current?.focus();
  }, [renaming]);

  function resetTranscription() {
    setTranscription(""); setAnonymizedText(""); setAnonSpans([]); setReportSections([]); setAnonymizeError("");
  }

  async function handleAnonymise(nextState: AppState) {
    setIsAnonymizing(true); setAnonymizeError("");
    try {
      const res = await invoke<{
        result: { anonymized_text: string; spans: MaskSpan[]; substitution_map: Record<string, string> };
      }>("call_backend", { method: "anonymize", params: { text: transcription } });
      setAnonSpans(res.result.spans);
      setAppState(nextState);
    } catch (e) {
      setAnonymizeError(String(e));
    } finally {
      setIsAnonymizing(false);
    }
  }

  function handleAnonConfirm(anonText: string, _subMap: Record<string, string>) {
    setAnonymizedText(anonText);
    setAppState(appState === "session-anonymisation" ? "session-autoeval" : "final-generation");
  }

  // ── Actions header patient ──────────────────────────────────────────────────

  function startRename() {
    setEditName(currentPatient?.name ?? "");
    setRenaming(true);
    setMenuOpen(false);
  }

  async function saveRename() {
    const name = editName.trim();
    if (!name || name === currentPatient?.name) { setRenaming(false); return; }
    setRenameSaving(true);
    try {
      const res = await invoke<{ result: Patient }>("call_backend", {
        method: "update_patient", params: { patient_id: currentPatient!.id, name },
      });
      setCurrentPatient(res.result);
      setRenaming(false);
    } catch {} finally { setRenameSaving(false); }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await invoke("call_backend", { method: "delete_patient", params: { patient_id: currentPatient!.id } });
      setCurrentPatient(null);
      setDeleteConfirm(false);
      setAppState("home");
    } catch { setDeleting(false); }
  }

  function goBackToHome() {
    setCurrentPatient(null); setRenaming(false); setMenuOpen(false);
    setAppState("home");
  }

  // ── Dérivés ─────────────────────────────────────────────────────────────────

  const isSessionFlow = appState.startsWith("session-");
  const isFinalFlow = appState.startsWith("final-");
  const isPatientView = appState === "patient";
  const steps = isSessionFlow ? SESSION_STEPS : isFinalFlow ? FINAL_STEPS : null;
  const stepIndex = isSessionFlow
    ? (SESSION_STEP_INDEX[appState] ?? 0)
    : isFinalFlow ? (FINAL_STEP_INDEX[appState] ?? 0) : -1;

  if (appState === "loading") return <div className="loading-screen"><p>Démarrage d'Ablo…</p></div>;
  if (appState === "first-run") return <FirstRun onComplete={() => setAppState("home")} />;

  return (
    <div className="app-layout">

      {/* ── Header ── */}
      <header className="app-header">
        {isPatientView && currentPatient ? (
          // Header fiche patient
          <>
            <div className="patient-header-left">
              <button className="btn-back-header" onClick={goBackToHome}>←</button>

              {renaming ? (
                <>
                  <input
                    ref={renameInputRef}
                    className="patient-header-input"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveRename();
                      if (e.key === "Escape") setRenaming(false);
                    }}
                    disabled={renameSaving}
                  />
                  <div className="patient-header-rename-actions">
                    <button className="btn-rename-save" onClick={saveRename} disabled={renameSaving || !editName.trim()}>✓</button>
                    <button className="btn-rename-cancel" onClick={() => setRenaming(false)}>✕</button>
                  </div>
                </>
              ) : (
                <span className="patient-header-name">{currentPatient.name}</span>
              )}
            </div>

            {!renaming && (
              <div className="patient-menu-wrap" ref={menuRef}>
                <button
                  className={`btn-patient-menu ${menuOpen ? "open" : ""}`}
                  onClick={() => setMenuOpen((o) => !o)}
                  title="Options"
                >
                  •••
                </button>
                {menuOpen && (
                  <div className="patient-menu-dropdown">
                    <button className="patient-menu-item" onClick={startRename}>Renommer</button>
                    <button className="patient-menu-item danger" onClick={() => { setDeleteConfirm(true); setMenuOpen(false); }}>
                      Supprimer
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          // Header standard
          <>
            {(isSessionFlow || isFinalFlow) ? (
              <>
                <button
                  className="btn-back-header"
                  onClick={() => { resetTranscription(); setAppState(currentPatient ? "patient" : "home"); }}
                  title="Annuler et revenir"
                >
                  ←
                </button>
                {steps && isSessionFlow && (
                  <nav className="step-nav">
                    {steps.map((label, i) => (
                      <span key={label} className={`step-pill ${i === stepIndex ? "active" : ""} ${i < stepIndex ? "done" : ""}`}>
                        {i < stepIndex ? "✓ " : ""}{label}
                      </span>
                    ))}
                  </nav>
                )}
              </>
            ) : (
              <>
                <span className="app-logo">Ablo</span>
                <button className="btn-settings" onClick={() => setShowSettings(true)} title="Réglages">⚙</button>
              </>
            )}
          </>
        )}
      </header>

      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}

      {/* ── Modal suppression ── */}
      {deleteConfirm && currentPatient && (
        <div className="delete-modal-backdrop" onClick={() => !deleting && setDeleteConfirm(false)}>
          <div className="delete-modal" onClick={(e) => e.stopPropagation()}>
            <p className="delete-modal-title">Supprimer le dossier patient ?</p>
            <p className="delete-modal-msg">
              Le dossier de <strong>{currentPatient.name}</strong> et toutes ses séances ({currentPatient.session_count} séance{currentPatient.session_count !== 1 ? "s" : ""}) seront définitivement supprimés. Cette action est irréversible.
            </p>
            <div className="delete-modal-actions">
              <button className="btn-modal-cancel" onClick={() => setDeleteConfirm(false)} disabled={deleting}>Annuler</button>
              <button className="btn-modal-delete" onClick={handleDelete} disabled={deleting}>
                {deleting ? "Suppression…" : "Supprimer définitivement"}
              </button>
            </div>
          </div>
        </div>
      )}

      <main className={`app-main${appState === "home" || appState === "patient" ? " app-main--top" : ""}`}>

        {appState === "home" && (
          <section className="step-section">
            <HomePage onSelectPatient={(p) => { setCurrentPatient(p); setAppState("patient"); }} />
          </section>
        )}

        {appState === "patient" && currentPatient && (
          <section className="step-section">
            <PatientPage
              patient={currentPatient}
              onNewSession={() => { resetTranscription(); setAppState("session-audio"); }}
              onFinalBilan={(sessions) => { setPatientSessions(sessions); resetTranscription(); setAppState("final-audio"); }}
            />
          </section>
        )}

        {appState === "session-audio" && (
          <section className="step-section">
            <img src={sessionRecordImg} alt="" style={{ width: 160, height: 160, objectFit: "contain", marginBottom: 4, display: "block", margin: "0 auto 4px" }} />
            <h1>Enregistrement de la séance</h1>
            <p className="step-desc">Résumez oralement la séance à voix haute.</p>
            <AudioRecorder onTranscriptionComplete={(text) => { setTranscription(text); setAppState("session-transcription"); }} />
          </section>
        )}

        {appState === "session-transcription" && (
          <section className="step-section">
            <h1>Transcription</h1>
            <TranscriptionView
              text={transcription} onChange={setTranscription}
              onContinue={() => handleAnonymise("session-anonymisation")}
              isLoading={isAnonymizing} loadingLabel="Anonymisation en cours…"
            />
            {anonymizeError && <p style={{ color: "#dc2626", marginTop: 8, fontSize: "0.875rem" }}>❌ {anonymizeError}</p>}
          </section>
        )}

        {appState === "session-anonymisation" && (
          <section className="step-section">
            <h1>Anonymisation</h1>
            <p className="step-desc">Vérifiez que toutes les informations personnelles sont bien masquées.</p>
            <AnonymisationView originalText={transcription} initialSpans={anonSpans} onConfirm={handleAnonConfirm} />
          </section>
        )}

        {appState === "session-autoeval" && currentPatient && (
          <section className="step-section">
            <h1>Autoévaluation</h1>
            <p className="step-desc">Renseignez les scores du patient pour cette séance, puis enregistrez.</p>
            <SessionAutoEvalView
              patientId={currentPatient.id}
              patientName={currentPatient.name}
              anonymizedText={anonymizedText}
              onSaved={() => { resetTranscription(); setAppState("patient"); }}
              onBack={() => setAppState("session-anonymisation")}
            />
          </section>
        )}

        {appState === "final-audio" && (
          <section className="step-section">
            <p style={{ margin: "0 0 6px", fontSize: "0.8rem", color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "center" }}>Optionnel</p>
            <h1>Résumé oral final</h1>
            <p className="step-desc">Dictez un résumé global de la prise en charge pour enrichir le bilan.</p>
            <AudioRecorder onTranscriptionComplete={(text) => { setTranscription(text); setAppState("final-transcription"); }} />
            <button className="btn-skip-audio" onClick={() => { resetTranscription(); setAppState("final-generation"); }}>
              Passer cette étape → Générer le bilan
            </button>
          </section>
        )}

        {appState === "final-transcription" && (
          <section className="step-section">
            <h1>Transcription du résumé</h1>
            <TranscriptionView
              text={transcription} onChange={setTranscription}
              onContinue={() => handleAnonymise("final-anonymisation")}
              isLoading={isAnonymizing} loadingLabel="Anonymisation en cours…"
            />
            {anonymizeError && <p style={{ color: "#dc2626", marginTop: 8, fontSize: "0.875rem" }}>❌ {anonymizeError}</p>}
          </section>
        )}

        {appState === "final-anonymisation" && (
          <section className="step-section">
            <h1>Anonymisation</h1>
            <p className="step-desc">Vérifiez les masques avant de générer le bilan.</p>
            <AnonymisationView originalText={transcription} initialSpans={anonSpans} onConfirm={handleAnonConfirm} />
          </section>
        )}

        {appState === "final-generation" && (
          <section className="step-section">
            <h1>Génération du bilan final</h1>
            <p className="step-desc">
              Ablo synthétise {patientSessions.length} séance{patientSessions.length > 1 ? "s" : ""} pour générer le bilan.
            </p>
            <GenerationView
              anonymizedText={anonymizedText}
              sessions={patientSessions}
              onComplete={(sections, tplName) => { setReportSections(sections); setTemplateName(tplName); setAppState("final-editing"); }}
              onSkip={() => setAppState("final-editing")}
            />
          </section>
        )}

        {appState === "final-editing" && (
          <section className="step-section">
            <h1>Édition du bilan</h1>
            <p className="step-desc">Relisez et corrigez chaque section avant d'exporter.</p>
            <ReportEditor
              sections={reportSections} templateName={templateName} anonymizedText={anonymizedText}
              onExport={(sections) => { setReportSections(sections); setAppState("final-export"); }}
            />
          </section>
        )}

        {appState === "final-export" && (
          <section className="step-section">
            <h1>Export</h1>
            <p className="step-desc">Génération des fichiers Word et PDF…</p>
            <ExportView
              sections={reportSections} templateName={templateName}
              patientId={currentPatient?.id}
              patientName={currentPatient?.name}
              onRestart={() => { resetTranscription(); setAppState("home"); }}
            />
          </section>
        )}

      </main>

      {(appState === "home" || appState === "patient") && (
        <footer className="app-footer">
          <p className="app-version">Ablo v0.1.0 · 2026</p>
        </footer>
      )}
    </div>
  );
}
