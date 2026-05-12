import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AutoEvalEditor, parseAutoEval, serializeAutoEval, AutoEvalScores } from "./AutoEvalEditor";
import { Session } from "./PatientPage";
import "./SessionEditModal.css";

interface Props {
  session: Session;
  sessionNumber: number;
  patientId: string;
  onSaved: (updated: Session) => void;
  onClose: () => void;
}

export function SessionEditModal({ session, sessionNumber, patientId, onSaved, onClose }: Props) {
  const [date, setDate] = useState(session.date);
  const [notes, setNotes] = useState(session.notes ?? "");
  const [summary, setSummary] = useState(session.summary ?? "");
  const [scores, setScores] = useState<AutoEvalScores>(
    (session.autoeval as AutoEvalScores) ?? {}
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  const hasAutoeval = !session.is_first_session;

  const isDirty =
    date !== session.date ||
    notes !== (session.notes ?? "") ||
    summary !== (session.summary ?? "") ||
    JSON.stringify(scores) !== JSON.stringify((session.autoeval as AutoEvalScores) ?? {});

  function requestClose() {
    if (isDirty) setShowCloseConfirm(true);
    else onClose();
  }

  function handleAutoEvalChange(content: string) {
    const parsed = parseAutoEval(content);
    if (parsed) setScores(parsed);
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const res = await invoke<{ result: Session }>("call_backend", {
        method: "update_session",
        params: {
          patient_id: patientId,
          filename: session.filename,
          date,
          notes,
          summary,
          autoeval: hasAutoeval ? scores : session.autoeval,
        },
      });
      onSaved(res.result);
    } catch (e) {
      setError(String(e));
      setSaving(false);
    }
  }

  return (
    <>
    <div className="session-edit-backdrop" onClick={saving ? undefined : requestClose}>
      <div className="session-edit-modal" onClick={(e) => e.stopPropagation()}>

        <header className="session-edit-header">
          <div>
            <p className="session-edit-eyebrow">
              {session.is_first_session ? "Première séance" : `Séance ${sessionNumber}`}
            </p>
            <h2 className="session-edit-title">Modifier la séance</h2>
          </div>
          <button className="session-edit-close" onClick={requestClose} disabled={saving} aria-label="Fermer">✕</button>
        </header>

        <section className="session-edit-section">
          <label className="session-edit-label" htmlFor="edit-date">Date de la séance</label>
          <input
            id="edit-date"
            className="session-edit-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            disabled={saving}
          />
        </section>

        <section className="session-edit-section">
          <label className="session-edit-label" htmlFor="edit-summary">
            {session.is_first_session ? "Objectifs de la prise en charge" : "Résumé de la séance"}
          </label>
          <textarea
            id="edit-summary"
            className="session-edit-textarea session-edit-textarea--large"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={6}
            disabled={saving}
            spellCheck
            lang="fr"
          />
        </section>

        <section className="session-edit-section">
          <label className="session-edit-label" htmlFor="edit-notes">
            Notes du thérapeute <span className="optional-badge">optionnel</span>
          </label>
          <textarea
            id="edit-notes"
            className="session-edit-textarea"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            disabled={saving}
            spellCheck
            lang="fr"
          />
        </section>

        {hasAutoeval && (
          <section className="session-edit-section">
            <p className="session-edit-label">Autoévaluation du patient</p>
            <AutoEvalEditor
              content={serializeAutoEval(scores)}
              onChange={handleAutoEvalChange}
            />
          </section>
        )}

        {error && <p className="session-edit-error">❌ {error}</p>}

        <footer className="session-edit-footer">
          <button className="btn-edit-cancel" onClick={requestClose} disabled={saving}>
            Annuler
          </button>
          <button className="btn-edit-save" onClick={handleSave} disabled={saving}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </footer>
      </div>
    </div>
    {showCloseConfirm && (
      <div className="delete-session-backdrop" onClick={() => setShowCloseConfirm(false)}>
        <div className="delete-session-modal" onClick={(e) => e.stopPropagation()}>
          <p className="delete-session-title">Modifications non enregistrées</p>
          <p className="delete-session-msg">Vos modifications seront perdues si vous quittez sans enregistrer.</p>
          <div className="delete-session-actions">
            <button className="btn-modal-cancel" onClick={() => setShowCloseConfirm(false)}>
              Annuler
            </button>
            <button className="btn-modal-delete" onClick={onClose}>
              Quitter sans enregistrer
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
