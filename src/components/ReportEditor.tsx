import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Section } from "./GenerationView";
import "./ReportEditor.css";

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

interface Props {
  sections: Section[];
  templateName: string;
  anonymizedText: string;
  onExport: (sections: Section[]) => void;
}

export function ReportEditor({ sections: initialSections, anonymizedText, onExport }: Props) {
  const [sections, setSections] = useState<Section[]>(initialSections);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [isValidating, setIsValidating] = useState(false);

  const updateContent = useCallback((index: number, content: string) => {
    setSections((prev) =>
      prev.map((s) => (s.index === index ? { ...s, content } : s))
    );
    setValidation(null);
    setConfirmed(false);
  }, []);

  async function handleValidate() {
    setIsValidating(true);
    try {
      const res = await invoke<{ result: ValidationResult }>("call_backend", {
        method: "validate_report",
        params: { sections, anonymized_source: anonymizedText },
      });
      setValidation(res.result);
    } catch (e) {
      setValidation({ valid: false, errors: [String(e)], warnings: [] });
    } finally {
      setIsValidating(false);
    }
  }

  const sectionErrors = (s: Section): string[] => {
    if (!validation) return [];
    return validation.errors.filter((e) => e.includes(`« ${s.title} »`));
  };

  const hasBlockingErrors = validation
    ? validation.errors.length > 0
    : false;

  return (
    <div className="editor-view">
      <p className="editor-hint">
        Relisez et corrigez chaque section. Les sections marquées <span className="required-badge">*</span> sont obligatoires.
      </p>

      {validation && (
        <div className={`validation-banner ${validation.valid ? "valid" : "invalid"}`}>
          {validation.valid ? (
            <p>✓ Bilan valide — prêt pour l'export.</p>
          ) : (
            <>
              {validation.errors.map((e, i) => <p key={i}>❌ {e}</p>)}
            </>
          )}
          {validation.warnings.map((w, i) => (
            <p key={`w${i}`} className="banner-warning">⚠ {w}</p>
          ))}
        </div>
      )}

      <div className="sections-list">
        {sections.map((s) => {
          const errs = sectionErrors(s);
          return (
            <div key={s.index} className={`section-block ${errs.length > 0 ? "section-error" : ""}`}>
              <div className="section-header">
                <span className="section-title">
                  {s.title}
                  {s.required && <span className="required-badge">*</span>}
                </span>
                {s.constraint && (
                  <span className="section-constraint">{s.constraint}</span>
                )}
              </div>
              {errs.map((e, i) => (
                <p key={i} className="section-error-msg">❌ {e}</p>
              ))}
              <textarea
                className="section-textarea"
                value={s.content}
                onChange={(e) => updateContent(s.index, e.target.value)}
                placeholder={s.constraint ?? "Rédigez cette section…"}
                rows={5}
                lang="fr"
                spellCheck
              />
            </div>
          );
        })}
      </div>

      <div className="editor-footer">
        <button
          className="btn-validate"
          onClick={handleValidate}
          disabled={isValidating}
        >
          {isValidating ? "Validation…" : "Vérifier le bilan"}
        </button>

        <label className="confirm-check">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          Bilan vérifié et validé
        </label>

        <button
          className="btn-export"
          disabled={!confirmed || (hasBlockingErrors && !confirmed)}
          onClick={() => onExport(sections)}
        >
          Exporter →
        </button>
      </div>
    </div>
  );
}
