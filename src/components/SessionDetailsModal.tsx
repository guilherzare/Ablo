import "./SessionDetailsModal.css";
import { Session } from "./PatientPage";
import { scoreColor, AUTEVAL_CRITERIA } from "./AutoEvalEditor";

interface Props {
  session: Session;
  sessionNumber: number;
  summaryPending?: boolean;
  onClose: () => void;
}

function formatDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function SessionDetailsModal({ session, sessionNumber, summaryPending, onClose }: Props) {
  // Affiche la section autoéval seulement si au moins un critère a une vraie valeur
  const hasAutoeval = !session.is_first_session &&
    session.autoeval &&
    Object.values(session.autoeval).some((v) => v !== null && v !== undefined);

  return (
    <div className="session-details-backdrop" onClick={onClose}>
      <div className="session-details-modal" onClick={(e) => e.stopPropagation()}>
        <header className="session-details-header">
          <div>
            <p className="session-details-eyebrow">
              {session.is_first_session ? "Première séance" : `Séance ${sessionNumber}`}
            </p>
            <h2 className="session-details-title">{formatDate(session.date)}</h2>
          </div>
          <button className="session-details-close" onClick={onClose} aria-label="Fermer">✕</button>
        </header>

        <section className="session-details-section">
          <h3 className="session-details-section-title">
            {session.is_first_session ? "Objectifs de la prise en charge" : "Résumé de la séance"}
          </h3>
          {summaryPending ? (
            <p className="session-details-generating">Génération en cours…</p>
          ) : session.summary ? (
            <p className="session-details-summary">{session.summary}</p>
          ) : (
            <p className="session-details-empty">Aucun résumé disponible pour cette séance.</p>
          )}
        </section>

        {session.notes && (
          <section className="session-details-section">
            <h3 className="session-details-section-title">Notes du thérapeute</h3>
            <p className="session-details-notes">{session.notes}</p>
          </section>
        )}

        {hasAutoeval && (
          <section className="session-details-section">
            <h3 className="session-details-section-title">Autoévaluation du patient</h3>
            <ul className="session-details-scores">
              {AUTEVAL_CRITERIA.map((label) => {
                const value = session.autoeval[label] ?? null;
                const isNA = value === null;
                return (
                  <li key={label} className="session-details-score-row">
                    <span className="session-details-score-label">{label}</span>
                    <div className="session-details-score-bar">
                      {!isNA && (
                        <div
                          className="session-details-score-fill"
                          style={{ width: `${(value! / 5) * 100}%`, background: scoreColor(value!) }}
                        />
                      )}
                    </div>
                    <span className="session-details-score-value" style={{ color: isNA ? "#d1d5db" : scoreColor(value!) }}>
                      {isNA ? "—" : `${value}/5`}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
