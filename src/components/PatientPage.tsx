import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./PatientPage.css";
import vocalRecord from "../assets/vocal-record.png";
import { SessionDetailsModal } from "./SessionDetailsModal";
import { SessionEditModal } from "./SessionEditModal";

export interface Patient {
  id: string;
  name: string;
  label?: string;
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
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null);
  const [editingSession, setEditingSession] = useState<{ session: Session; number: number } | null>(null);
  const [deleteConfirmFor, setDeleteConfirmFor] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const menuRefs = useRef<Record<string, HTMLDivElement | null>>({});

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
        setSessions(sessRes.result ?? []);
        setBilans(bilanRes.result ?? []);
        onSessionsLoaded?.((sessRes.result ?? []).length);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [patient.id]);

  useEffect(() => {
    if (!menuOpenFor) return;
    function handleClick(e: MouseEvent) {
      const ref = menuRefs.current[menuOpenFor!];
      if (ref && !ref.contains(e.target as Node)) setMenuOpenFor(null);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpenFor]);

  async function handleDeleteSession(filename: string) {
    setDeleting(true);
    try {
      await invoke("call_backend", {
        method: "delete_session",
        params: { patient_id: patient.id, filename },
      });
      setSessions((prev) => prev.filter((s) => s.filename !== filename));
    } catch {}
    setDeleting(false);
    setDeleteConfirmFor(null);
  }

  function handleSessionSaved(updated: Session) {
    setSessions((prev) => prev.map((s) => s.filename === updated.filename ? updated : s));
    setEditingSession(null);
  }

  return (
    <div className="patient-view">

      {openedSession && (
        <SessionDetailsModal
          session={openedSession.session}
          sessionNumber={openedSession.number}
          onClose={() => setOpenedSession(null)}
        />
      )}

      {editingSession && (
        <SessionEditModal
          session={editingSession.session}
          sessionNumber={editingSession.number}
          patientId={patient.id}
          onSaved={handleSessionSaved}
          onClose={() => setEditingSession(null)}
        />
      )}

      {deleteConfirmFor && (
        <div className="delete-session-backdrop" onClick={() => !deleting && setDeleteConfirmFor(null)}>
          <div className="delete-session-modal" onClick={(e) => e.stopPropagation()}>
            <p className="delete-session-title">Supprimer cette séance ?</p>
            <p className="delete-session-msg">
              Cette action est irréversible. Le contenu de la séance sera définitivement supprimé.
            </p>
            <div className="delete-session-actions">
              <button className="btn-modal-cancel" onClick={() => setDeleteConfirmFor(null)} disabled={deleting}>
                Annuler
              </button>
              <button className="btn-modal-delete" onClick={() => handleDeleteSession(deleteConfirmFor)} disabled={deleting}>
                {deleting ? "Suppression…" : "Supprimer"}
              </button>
            </div>
          </div>
        </div>
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
                  <div className="session-card-actions">
                    <button
                      className="btn-view-summary"
                      onClick={() => setOpenedSession({ session: s, number })}
                    >
                      Voir le résumé
                    </button>
                    <div
                      className="session-menu-wrap"
                      ref={(el) => { menuRefs.current[s.filename] = el; }}
                    >
                      <button
                        className={`btn-session-menu${menuOpenFor === s.filename ? " active" : ""}`}
                        onClick={() => setMenuOpenFor(menuOpenFor === s.filename ? null : s.filename)}
                        title="Options"
                      >
                        ···
                      </button>
                      {menuOpenFor === s.filename && (
                        <div className="session-menu-dropdown">
                          <button
                            className="session-menu-item"
                            onClick={() => { setEditingSession({ session: s, number }); setMenuOpenFor(null); }}
                          >
                            Éditer la séance
                          </button>
                          <button
                            className="session-menu-item session-menu-item--danger"
                            onClick={() => { setDeleteConfirmFor(s.filename); setMenuOpenFor(null); }}
                          >
                            Supprimer
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
