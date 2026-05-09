import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./PatientPage.css";
import vocalRecord from "../assets/vocal-record.png";
import { SessionDetailsModal } from "./SessionDetailsModal";

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
  summary?: string;
  is_first_session?: boolean;
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
  onSessionsLoaded?: (count: number) => void;
}

function formatDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function PatientPage({ patient, onNewSession, onFinalBilan, onSessionsLoaded }: Props) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [bilans, setBilans] = useState<Bilan[]>([]);
  const [loading, setLoading] = useState(true);
  const [openedSession, setOpenedSession] = useState<{ session: Session; number: number } | null>(null);

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
        onSessionsLoaded?.(sessRes.result.length);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [patient.id]);

  return (
    <div className="patient-view">

      {openedSession && (
        <SessionDetailsModal
          session={openedSession.session}
          sessionNumber={openedSession.number}
          onClose={() => setOpenedSession(null)}
        />
      )}


      {/* Boutons d'action — uniquement si des séances existent */}
      {!loading && sessions.length > 0 && (
        <div className="patient-actions">
          <button className="btn-new-session" onClick={onNewSession}>
            + Nouvelle séance
          </button>
          <button
            className="btn-final-bilan"
            onClick={() => onFinalBilan(sessions)}
          >
            {bilans.length > 0 ? "Regénérer le bilan final" : "Générer le bilan final →"}
          </button>
        </div>
      )}

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
            <p className="sessions-empty-hint">Enregistrez la première séance de ce patient.</p>
            <button className="btn-new-session btn-new-session--empty" onClick={onNewSession}>
              + Nouvelle séance
            </button>
          </div>
        ) : (
          <ul className="session-list">
            {sessions.map((s, i) => {
              const number = i + 1;
              return (
                <li key={s.filename} className="session-card">
                  <div className="session-card-left">
                    <div className="session-card-top">
                      <span className="session-num">
                        {s.is_first_session ? "Première séance" : `Séance ${number}`}
                      </span>
                      <span className="session-date">{formatDate(s.date)}</span>
                    </div>
                  </div>
                  <button
                    className="btn-view-summary"
                    onClick={() => setOpenedSession({ session: s, number })}
                  >
                    Voir le résumé
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
