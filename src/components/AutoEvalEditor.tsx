import "./AutoEvalEditor.css";

export const AUTEVAL_CRITERIA = [
  "État initial",
  "Envie de revenir",
  "Bien fait",
  "Beau",
  "Bon moment",
  "État final",
];

export type AutoEvalScores = Record<string, number>;

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
  return Object.fromEntries(AUTEVAL_CRITERIA.map((c) => [c, 0]));
}

interface Props {
  content: string;
  onChange: (content: string) => void;
}

// Rouge → orange → jaune-vert → vert
const DOT_COLORS = ["#ef4444", "#f97316", "#eab308", "#84cc16", "#22c55e", "#16a34a"];

export function AutoEvalEditor({ content, onChange }: Props) {
  const scores = parseAutoEval(content) ?? defaultScores();

  function update(criterion: string, value: number) {
    const next = { ...scores, [criterion]: value };
    onChange(serializeAutoEval(next));
  }

  return (
    <div className="auteval">
      {AUTEVAL_CRITERIA.map((criterion) => {
        const val = scores[criterion] ?? 0;
        const pct = (val / 5) * 100;
        const trackGradient = `linear-gradient(to right, ${DOT_COLORS[val]} ${pct}%, #e5e7eb ${pct}%)`;

        return (
          <div key={criterion} className="auteval-row">
            <span className="auteval-label">{criterion}</span>

            <div className="auteval-slider-wrap">
              <input
                type="range"
                min={0}
                max={5}
                step={1}
                value={val}
                onChange={(e) => update(criterion, Number(e.target.value))}
                className="auteval-slider"
                style={{
                  "--thumb-color": DOT_COLORS[val],
                  "--track-bg": trackGradient,
                } as React.CSSProperties}
              />
              <div className="auteval-dots">
                {[0, 1, 2, 3, 4, 5].map((n) => (
                  <div key={n} className="auteval-dot-wrap">
                    <span
                      className={`auteval-dot ${n === val ? "active" : ""}`}
                      style={{ background: DOT_COLORS[n], opacity: n <= val ? 1 : 0.25 }}
                    />
                    <span className="auteval-dot-num" style={{ color: n === val ? DOT_COLORS[n] : undefined }}>
                      {n}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <span className="auteval-score" style={{ color: DOT_COLORS[val] }}>
              {val}<span className="auteval-max">/5</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
