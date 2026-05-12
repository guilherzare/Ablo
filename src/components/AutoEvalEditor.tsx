import "./AutoEvalEditor.css";

export const AUTEVAL_CRITERIA = [
  "État initial",
  "Envie de revenir",
  "Bien fait",
  "Beau",
  "Bon moment",
  "État final",
];

// null = critère non évalué par le patient
export type AutoEvalScores = Record<string, number | null>;

/** Couleur interpolée rouge → orange → jaune → vert selon la valeur 0-5. */
export function scoreColor(value: number): string {
  const h = 4 + (value / 5) * 138; // 4° (rouge) → 142° (vert)
  const l = value >= 4 ? 42 : 50;
  return `hsl(${h.toFixed(1)}, 82%, ${l}%)`;
}

export function parseAutoEval(content: string): AutoEvalScores | null {
  try {
    const parsed = JSON.parse(content);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as AutoEvalScores;
    }
  } catch {}
  return null;
}

export function serializeAutoEval(scores: AutoEvalScores): string {
  return JSON.stringify(scores);
}

function defaultScores(): AutoEvalScores {
  // Tous les critères démarrent à "Non évalué" — la thérapeute remplit ce qui s'applique
  return Object.fromEntries(AUTEVAL_CRITERIA.map((c) => [c, null]));
}

interface Props {
  content: string;
  onChange: (content: string) => void;
}

export function AutoEvalEditor({ content, onChange }: Props) {
  const scores = parseAutoEval(content) ?? defaultScores();

  function update(criterion: string, value: number | null) {
    onChange(serializeAutoEval({ ...scores, [criterion]: value }));
  }

  return (
    <div className="auteval">
      {AUTEVAL_CRITERIA.map((criterion) => {
        const val = scores[criterion] !== undefined ? scores[criterion] : null;
        const isNA = val === null;

        return (
          <div key={criterion} className="auteval-row">
            <span className="auteval-label">{criterion}</span>

            <div className="auteval-input-wrap">
              {isNA ? (
                <span className="auteval-na-dash">—</span>
              ) : (
                <>
                  <span
                    className="auteval-dot-indicator"
                    style={{ background: scoreColor(val!) }}
                  />
                  <input
                    type="number"
                    className="auteval-input"
                    min={0}
                    max={5}
                    step={0.1}
                    value={val!}
                    onChange={(e) => {
                      const n = parseFloat(e.target.value);
                      if (!isNaN(n)) {
                        update(criterion, Math.min(5, Math.max(0, Math.round(n * 10) / 10)));
                      }
                    }}
                  />
                  <span className="auteval-unit">/5</span>
                </>
              )}
            </div>

            <button
              type="button"
              className={`auteval-na-btn${isNA ? " active" : ""}`}
              onClick={() => update(criterion, isNA ? 0 : null)}
            >
              Non évalué
            </button>
          </div>
        );
      })}
    </div>
  );
}
