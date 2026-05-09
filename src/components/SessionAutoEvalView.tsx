import { useState } from "react";
import { flushSync } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { AutoEvalEditor, parseAutoEval, serializeAutoEval, AutoEvalScores } from "./AutoEvalEditor";
import "./SessionAutoEvalView.css";

interface Props {
  patientId: string;
  patientName: string;
  anonymizedText: string;
  isFirstSession: boolean;
  onSaved: () => void;
  onBack: () => void;
}

export function SessionAutoEvalView({ patientId, patientName, anonymizedText, isFirstSession, onSaved, onBack }: Props) {
  const [scores, setScores] = useState<AutoEvalScores>({
    "État initial": 0,
    "Envie de revenir": 0,
    "Bien fait": 0,
    "Beau": 0,
    "Bon moment": 0,
    "État final": 0,
  });
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function handleAutoEvalChange(content: string) {
    const parsed = parseAutoEval(content);
    if (parsed) setScores(parsed);
  }

  async function handleSave() {
    flushSync(() => setSaving(true));
    await new Promise((r) => requestAnimationFrame(r));
    setError("");
    try {
      await invoke("call_backend", {
        method: "save_session",
        params: {
          patient_id: patientId,
          anonymized_text: anonymizedText,
          autoeval: scores,
          notes,
        },
      });
      onSaved();
    } catch (e) {
      setError(String(e));
      setSaving(false);
    }
  }

  return (
    <div className="session-auteval-view">
      <p className="session-auteval-patient">
        Séance de <strong>{patientName}</strong>
      </p>

      {isFirstSession ? (
        <section className="session-auteval-block">
          <p className="session-auteval-hint">
            Pas d'autoévaluation pour la première séance — elle est l'occasion d'identifier les objectifs de la prise en charge.
          </p>
        </section>
      ) : (
        <section className="session-auteval-block">
          <h2 className="session-auteval-section-title">Autoévaluation du patient</h2>
          <p className="session-auteval-hint">
            Demandez au patient de noter chaque critère de 0 à 5.
          </p>
          <AutoEvalEditor
            content={serializeAutoEval(scores)}
            onChange={handleAutoEvalChange}
          />
        </section>
      )}

      <section className="session-auteval-block">
        <h2 className="session-auteval-section-title">Notes du thérapeute <span className="optional-badge">optionnel</span></h2>
        <textarea
          className="session-notes-textarea"
          placeholder="Observations personnelles sur la séance, points marquants, éléments à retenir pour la suite…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          lang="fr"
          spellCheck
        />
      </section>

      {error && <p className="session-save-error">❌ {error}</p>}

      {saving && (
        <p className="session-save-hint">
          ⏳ Génération du résumé en cours… Cette opération peut prendre jusqu'à une minute.
        </p>
      )}

      <div className="session-auteval-footer">
        <button className="btn-cancel-session" onClick={onBack} disabled={saving}>
          ← Retour
        </button>
        <button className="btn-save-session" onClick={handleSave} disabled={saving}>
          {saving && <span className="btn-spinner" />}
          {saving ? "Génération du résumé…" : "Enregistrer la séance"}
        </button>
      </div>
    </div>
  );
}
