import "./AutoEvalEditor.css";

export const AUTEVAL_CRITERIA = [
  "État initial",
  "Envie de revenir",
  "Bien fait",
  "Beau",
  "Bon moment",
  "État final",
];

// null = autoévaluation non réalisée (stocké globalement)
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

export function defaultScores(): AutoEvalScores {
  return Object.fromEntries(AUTEVAL_CRITERIA.map((c) => [c, 0]));
}

interface Props {
  content: string;
  onChange: (content: string) => void;
}

export function AutoEvalEditor({ content, onChange }: Props) {
  const scores = parseAutoEval(content) ?? defaultScores();

  function update(criterion: string, value: number) {
    onChange(serializeAutoEval({ ...scores, [criterion]: value }));
  }

  return (
    <div className="auteval">
      {AUTEVAL_CRITERIA.map((criterion) => {
        const val = typeof scores[criterion] === "number" ? (scores[criterion] as number) : 0;

        return (
          <div key={criterion} className="auteval-row">
            <span className="auteval-label">{criterion}</span>
            <div className="auteval-input-wrap">
              <span
                className="auteval-dot-indicator"
                style={{ background: scoreColor(val) }}
              />
              <input
                type="number"
                className="auteval-input"
                min={0}
                max={5}
                step={0.1}
                value={val}
                onChange={(e) => {
                  const n = parseFloat(e.target.value);
                  if (!isNaN(n)) {
                    update(criterion, Math.min(5, Math.max(0, Math.round(n * 10) / 10)));
                  }
                }}
              />
              <span className="auteval-unit">/5</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
