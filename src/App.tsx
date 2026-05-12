import { useState, useEffect, useRef } from "react";
const sessionRecordImg = "/session-record.png"; // servi depuis public/
import { invoke } from "@tauri-apps/api/core";
import { FirstRun } from "./components/FirstRun";
import { HomePage, getLabelColor } from "./components/HomePage";
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
  const [lieuRefreshKey, setLieuRefreshKey] = useState(0);
  const [sessionDate, setSessionDate] = useState(() => new Date().toISOString().split("T")[0]);

  // Header patient — menu "..."
  const [menuOpen, setMenuOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState(false);
  const [editName, setEditName] = useState("");
  const [editLabel, setEditLabel] = useState("");
  const [editShowLabelPicker, setEditShowLabelPicker] = useState(false);
  const [editAvailableLabels, setEditAvailableLabels] = useState<string[]>([]);
  const [editSaving, setEditSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [patientSessionCount, setPatientSessionCount] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

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


  function resetTranscription() {
    setTranscription(""); setAnonymizedText(""); setAnonSpans([]); setReportSections([]); setAnonymizeError("");
    setSessionDate(new Date().toISOString().split("T")[0]);
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

  async function startEditPatient() {
    setEditName(currentPatient?.name ?? "");
    setEditLabel(currentPatient?.label ?? "");
    setEditShowLabelPicker(false);
    setMenuOpen(false);
    try {
      const res = await invoke<{ result: string[] }>("call_backend", { method: "list_lieux", params: {} });
      setEditAvailableLabels(res.result);
    } catch {}
    setEditingPatient(true);
  }

  async function saveEditPatient() {
    const name = editName.trim();
    if (!name) return;
    setEditSaving(true);
    try {
      const res = await invoke<{ result: Patient }>("call_backend", {
        method: "update_patient",
        params: { patient_id: currentPatient!.id, name, label: editLabel.trim() },
      });
      setCurrentPatient(res.result);
      setEditingPatient(false);
    } catch {} finally { setEditSaving(false); }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await invoke("call_backend", { method: "delete_patient", params: { patient_id: currentPatient!.id } });
      setCurrentPatient(null);
      setDeleteConfirm(false);
      setAppState("home");
    } catch {} finally { setDeleting(false); }
  }

  function goBackToHome() {
    setCurrentPatient(null); setEditingPatient(false); setMenuOpen(false);
    setPatientSessionCount(0);
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
              <span className="patient-header-name">{currentPatient.name}</span>
              {currentPatient.label && (
                <span
                  className="patient-header-label"
                  style={{ background: getLabelColor(currentPatient.label).bg, color: getLabelColor(currentPatient.label).text }}
                >
                  {currentPatient.label}
                </span>
              )}
            </div>

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
                  <button className="patient-menu-item" onClick={startEditPatient}>Éditer le patient</button>
                  <button className="patient-menu-item danger" onClick={() => { setDeleteConfirm(true); setMenuOpen(false); }}>
                    Supprimer
                  </button>
                </div>
              )}
            </div>
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
                  ← Retour
                </button>
                {steps && isSessionFlow && (
                  <nav className="step-nav step-nav--centered">
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

      {showSettings && <SettingsPanel onClose={() => { setShowSettings(false); setLieuRefreshKey((k) => k + 1); }} />}

      {/* ── Modal édition patient ── */}
      {editingPatient && currentPatient && (
        <div className="edit-patient-backdrop" onClick={() => !editSaving && setEditingPatient(false)}>
          <div className="edit-patient-modal" onClick={(e) => e.stopPropagation()}>
            <p className="edit-patient-modal-title">Éditer le patient</p>

            <div className="edit-patient-field">
              <label className="edit-patient-field-label">Nom du patient</label>
              <input
                className="edit-patient-input"
                type="text"
                placeholder="ex : Lucas M."
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Escape") setEditingPatient(false); }}
                autoFocus
              />
            </div>

            {editAvailableLabels.length === 0 ? (
              !editShowLabelPicker ? (
                <button type="button" className="btn-add-label" onClick={() => setEditShowLabelPicker(true)}>
                  + Ajouter un lieu
                </button>
              ) : (
                <div style={{ display: "flex", gap: "8px", alignItems: "stretch" }}>
                  <input
                    className="edit-patient-input"
                    style={{ flex: 1 }}
                    type="text"
                    placeholder="Ex : Lyon, Cabinet 2…"
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Escape") setEditingPatient(false); }}
                    autoFocus
                  />
                  <button
                    type="button"
                    className="lieu-btn lieu-btn--primary"
                    onClick={() => setEditShowLabelPicker(false)}
                    disabled={!editLabel.trim()}
                  >
                    Ajouter
                  </button>
                </div>
              )
            ) : (
              <div className="lieu-section">
                <div className="lieu-section-row">
                  <span className="lieu-section-label">Lieu :</span>
                  {editAvailableLabels.map((lbl) => {
                    const color = getLabelColor(lbl);
                    const active = editLabel === lbl;
                    return (
                      <button
                        key={lbl}
                        type="button"
                        className={`label-picker-chip${active ? " label-picker-chip--active" : ""}`}
                        style={active ? { background: color.bg, color: color.text, borderColor: color.text } : {}}
                        onClick={() => setEditLabel(active ? "" : lbl)}
                      >
                        {active && <span>✓ </span>}{lbl}
                      </button>
                    );
                  })}
                  {!editShowLabelPicker && (
                    <button type="button" className="btn-add-label" onClick={() => setEditShowLabelPicker(true)}>
                      + Ajouter un lieu
                    </button>
                  )}
                </div>
                {editShowLabelPicker && (
                  <div style={{ display: "flex", gap: "8px", alignItems: "stretch" }}>
                    <input
                      className="edit-patient-input"
                      style={{ flex: 1 }}
                      type="text"
                      placeholder="Créer un nouveau lieu…"
                      value={editAvailableLabels.includes(editLabel) ? "" : editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Escape") setEditingPatient(false); }}
                      autoFocus
                    />
                    <button
                      type="button"
                      className="lieu-btn lieu-btn--primary"
                      onClick={() => setEditShowLabelPicker(false)}
                      disabled={!editLabel.trim() || editAvailableLabels.includes(editLabel)}
                    >
                      Ajouter
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="edit-patient-actions">
              <button className="btn-cancel" onClick={() => setEditingPatient(false)} disabled={editSaving}>
                Annuler
              </button>
              <button className="btn-confirm" onClick={saveEditPatient} disabled={!editName.trim() || editSaving}>
                {editSaving ? "Mise à jour…" : "Mettre à jour"}
              </button>
            </div>
          </div>
        </div>
      )}

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

      <main className={`app-main${appState !== "patient" || patientSessionCount > 0 ? " app-main--top" : ""}`}>

        {appState === "home" && (
          <section className="step-section">
            <HomePage onSelectPatient={(p) => { setCurrentPatient(p); setPatientSessionCount(0); setAppState("patient"); }} lieuRefreshKey={lieuRefreshKey} />
          </section>
        )}

        {appState === "patient" && currentPatient && (
          <section className="step-section">
            <PatientPage
              patient={currentPatient}
              onNewSession={() => { resetTranscription(); setAppState("session-audio"); }}
              onFinalBilan={(sessions) => { setPatientSessions(sessions); resetTranscription(); setAppState("final-audio"); }}
              onSessionsLoaded={setPatientSessionCount}
            />
          </section>
        )}

        {appState === "session-audio" && (
          <section className="step-section">
            <img src={sessionRecordImg} alt="" style={{ width: 160, height: 160, objectFit: "contain", marginBottom: 4, display: "block", margin: "0 auto 4px" }} />
            <h1>Enregistrement de la séance</h1>
            <p className="step-desc">Résumez oralement la séance à voix haute.</p>
            <div className="session-date-row">
              <label className="session-date-label" htmlFor="session-date-input">Date de la séance</label>
              <input
                id="session-date-input"
                className="session-date-input"
                type="date"
                value={sessionDate}
                onChange={(e) => setSessionDate(e.target.value)}
              />
            </div>
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
            <h1>{patientSessionCount === 0 ? "Première séance" : "Autoévaluation"}</h1>
            <p className="step-desc">
              {patientSessionCount === 0
                ? "Ajoutez vos notes personnelles puis enregistrez la séance."
                : "Renseignez les scores du patient pour cette séance, puis enregistrez."}
            </p>
            <SessionAutoEvalView
              patientId={currentPatient.id}
              patientName={currentPatient.name}
              anonymizedText={anonymizedText}
              isFirstSession={patientSessionCount === 0}
              date={sessionDate}
              onSaved={() => { resetTranscription(); setAppState("patient"); }}
              onBack={() => setAppState("session-anonymisation")}
            />
          </section>
        )}

        {appState === "final-audio" && (
          <section className="step-section">
            <p style={{ margin: "0 0 6px", fontSize: "0.8rem", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "center" }}>Optionnel</p>
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
