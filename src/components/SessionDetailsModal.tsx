import "./SessionDetailsModal.css";
import { Session } from "./PatientPage";

interface Props {
  session: Session;
  sessionNumber: number;
  summaryPending?: boolean;
  onClose: () => void;
}

const CRITERIA_LABELS = [
  "État initial",
  "Envie de revenir",
  "Bien fait",
  "Beau",
  "Bon moment",
  "État final",
];

const DOT_COLORS = ["#ef4444", "#f97316", "#eab308", "#84cc16", "#22c55e", "#16a34a"];

function formatDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function SessionDetailsModal({ session, sessionNumber, summaryPending, onClose }: Props) {
  const hasAutoeval = !session.is_first_session && session.autoeval && Object.keys(session.autoeval).length > 0;

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
              {CRITERIA_LABELS.map((label) => {
                const value = session.autoeval[label] ?? 0;
                return (
                  <li key={label} className="session-details-score-row">
                    <span className="session-details-score-label">{label}</span>
                    <div className="session-details-score-bar">
                      <div
                        className="session-details-score-fill"
                        style={{ width: `${(value / 5) * 100}%`, background: DOT_COLORS[value] ?? "#e5e7eb" }}
                      />
                    </div>
                    <span className="session-details-score-value">{value}/5</span>
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
