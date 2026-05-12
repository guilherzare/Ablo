import { useState, useEffect } from "react";
import "./AutoEvalEditor.css";

export const AUTEVAL_CRITERIA = [
  "État initial",
  "Envie de revenir",
  "Bien fait",
  "Beau",
  "Bon moment",
  "État final",
];

// null = non évaluée pour ce critère
export type AutoEvalScores = Record<string, number | null>;

/** Couleur interpolée rouge → jaune → vert selon la valeur 0-5. */
export function scoreColor(value: number): string {
  const h = (value / 5) * 120;          // 0° rouge → 120° vert
  const s = 85;
  const l = 52 - (value / 5) * 12;      // 52% à 0 → 40% à 5 (évite le jaune trop pâle)
  return `hsl(${h.toFixed(1)}, ${s}%, ${l.toFixed(0)}%)`;
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

/** Convertit une saisie utilisateur (virgule ou point) en nombre, ou null si vide/invalide. */
function parseInput(raw: string): number | null {
  const normalized = raw.replace(",", ".");
  if (normalized === "" || normalized === ".") return null;
  const n = parseFloat(normalized);
  return isNaN(n) ? null : Math.min(5, Math.max(0, Math.round(n * 10) / 10));
}

interface Props {
  content: string;
  onChange: (content: string) => void;
}

export function AutoEvalEditor({ content, onChange }: Props) {
  const scores = parseAutoEval(content) ?? defaultScores();

  // Valeurs textuelles locales pour saisie libre (effacer, virgule, valeur intermédiaire)
  const [rawValues, setRawValues] = useState<Record<string, string>>(
    () => Object.fromEntries(AUTEVAL_CRITERIA.map((c) => [c, scores[c] !== null ? String(scores[c]) : ""]))
  );

  // Resync si le contenu change de l'extérieur
  useEffect(() => {
    const s = parseAutoEval(content) ?? defaultScores();
    setRawValues(Object.fromEntries(AUTEVAL_CRITERIA.map((c) => [c, s[c] !== null ? String(s[c]) : ""])));
  }, [content]);

  function handleChange(criterion: string, raw: string) {
    const normalized = raw.replace(",", ".");
    setRawValues((prev) => ({ ...prev, [criterion]: normalized }));
  }

  function handleBlur(criterion: string) {
    const parsed = parseInput(rawValues[criterion]);
    const final = parsed ?? 0;
    setRawValues((prev) => ({ ...prev, [criterion]: String(final) }));
    onChange(serializeAutoEval({ ...scores, [criterion]: final }));
  }

  function toggleNA(criterion: string) {
    const isCurrentlyNA = scores[criterion] === null;
    if (isCurrentlyNA) {
      // Réactiver : remet à 0
      setRawValues((prev) => ({ ...prev, [criterion]: "0" }));
      onChange(serializeAutoEval({ ...scores, [criterion]: 0 }));
    } else {
      // Passer en non évalué
      setRawValues((prev) => ({ ...prev, [criterion]: "" }));
      onChange(serializeAutoEval({ ...scores, [criterion]: null }));
    }
  }

  return (
    <div className="auteval">
      {AUTEVAL_CRITERIA.map((criterion) => {
        const isNA = scores[criterion] === null;
        const raw = rawValues[criterion] ?? "0";
        const numVal = parseInput(raw) ?? (typeof scores[criterion] === "number" ? (scores[criterion] as number) : 0);

        return (
          <div key={criterion} className="auteval-row">
            <span className="auteval-label">{criterion}</span>
            <div className="auteval-input-wrap">
              <span
                className="auteval-dot-indicator"
                style={{ background: isNA ? "#d1d5db" : scoreColor(numVal) }}
              />
              {isNA ? (
                <span className="auteval-na-value">—</span>
              ) : (
                <>
                  <input
                    type="text"
                    inputMode="decimal"
                    className="auteval-input"
                    value={raw}
                    onChange={(e) => handleChange(criterion, e.target.value)}
                    onBlur={() => handleBlur(criterion)}
                    placeholder="0"
                  />
                  <span className="auteval-unit">/5</span>
                </>
              )}
            </div>
            <button
              type="button"
              className={`auteval-na-btn${isNA ? " active" : ""}`}
              onClick={() => toggleNA(criterion)}
              title={isNA ? "Réactiver l'évaluation" : "Marquer comme non évaluée"}
            >
              {isNA ? "Évaluer" : "N/A"}
            </button>
          </div>
        );
      })}
    </div>
  );
}
