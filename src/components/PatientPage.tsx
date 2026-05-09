import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./PatientPage.css";
import vocalRecord from "../assets/vocal-record.png";

export interface Patient {
  id: string;
  name: string;
  session_count: number;
  last_session_date: string;
  bilan_count: number;
  last_bilan_date: string;
  created_at: string;
}

export interface Session {
  date: string;
  anonymized_text: string;
  autoeval: Record<string, number>;
  notes: string;
  filename: string;
}

interface Bilan {
  date: string;
  docx_path: string;
  pdf_path: string;
}

interface Props {
  patient: Patient;
  onNewSession: () => void;
  onFinalBilan: (sessions: Session[]) => void;
}

const CRITERIA_SHORT: Record<string, string> = {
  "État initial": "Init.",
  "Envie de revenir": "Envie",
  "Bien fait": "Fait",
  "Beau": "Beau",
  "Bon moment": "Mom.",
  "État final": "Final",
};

const DOT_COLORS = ["#ef4444", "#f97316", "#eab308", "#84cc16", "#22c55e", "#16a34a"];

function formatDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function ScorePill({ value }: { value: number }) {
  return (
    <span className="score-pill" style={{ background: DOT_COLORS[value] ?? "#e5e7eb" }}>
      {value}
    </span>
  );
}

export function PatientPage({ patient, onNewSession, onFinalBilan }: Props) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [bilans, setBilans] = useState<Bilan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      invoke<{ result: Session[] }>("call_backend", {
        method: "list_sessions",
        params: { patient_id: patient.id },
      }),
      invoke<{ result: Bilan[] }>("call_backend", {
        method: "list_bilans",
        params: { patient_id: patient.id },
      }),
    ])
      .then(([sessRes, bilanRes]) => {
        setSessions(sessRes.result);
        setBilans(bilanRes.result);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [patient.id]);

  return (
    <div className="patient-view">
      <div className="patient-actions">
        <button className="btn-new-session" onClick={onNewSession}>
          + Nouvelle séance
        </button>
        <button
          className="btn-final-bilan"
          onClick={() => onFinalBilan(sessions)}
          disabled={sessions.length === 0}
          title={sessions.length === 0 ? "Enregistrez au moins une séance d'abord" : undefined}
        >
          {bilans.length > 0 ? "Regénérer le bilan final" : "Générer le bilan final →"}
        </button>
      </div>

      {/* Bilans générés */}
      {bilans.length > 0 && (
        <div className="sessions-section">
          <h2 className="sessions-title">
            Bilan des séances
            <span className="sessions-count">{bilans.length}</span>
          </h2>
          <ul className="session-list">
            {bilans.map((b, i) => (
              <li key={b.date + i} className="bilan-card">
                <div className="bilan-card-left">
                  <span className="bilan-icon">📋</span>
                  <div className="bilan-card-info">
                    <span className="bilan-label">Bilan des séances</span>
                    <span className="bilan-date">Généré le {formatDate(b.date)}</span>
                  </div>
                </div>
                <div className="bilan-card-actions">
                  {b.docx_path && (
                    <button
                      className="btn-open-bilan"
                      onClick={() => invoke("open_folder", { path: b.docx_path.split("/").slice(0, -1).join("/") })}
                      title="Ouvrir le dossier"
                    >
                      Ouvrir ↗
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Séances enregistrées */}
      <div className="sessions-section">
        <h2 className="sessions-title">
          Séances enregistrées
          <span className="sessions-count">{sessions.length}</span>
        </h2>

        {loading ? (
          <p className="sessions-empty">Chargement…</p>
        ) : sessions.length === 0 ? (
          <div className="sessions-empty-state">
            <img src={vocalRecord} alt="" className="sessions-empty-illustration" />
            <p className="sessions-empty">Aucune séance enregistrée.</p>
            <p className="sessions-empty-hint">Cliquez sur « + Nouvelle séance » pour commencer.</p>
          </div>
        ) : (
          <ul className="session-list">
            {sessions.map((s, i) => (
              <li key={s.filename} className="session-card">
                <div className="session-card-left">
                  <div className="session-card-top">
                    <span className="session-num">Séance {i + 1}</span>
                    <span className="session-date">{formatDate(s.date)}</span>
                  </div>
                  {s.notes && (
                    <p className="session-notes">
                      {s.notes.length > 120 ? s.notes.slice(0, 120) + "…" : s.notes}
                    </p>
                  )}
                </div>
                <div className="session-scores">
                  {Object.entries(CRITERIA_SHORT).map(([full, short]) => (
                    <div key={full} className="session-score-item">
                      <span className="session-score-label">{short}</span>
                      <ScorePill value={s.autoeval[full] ?? 0} />
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
