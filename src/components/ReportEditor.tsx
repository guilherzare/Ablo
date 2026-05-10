import { useState, useCallback, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Section } from "./GenerationView";
import { AutoEvalEditor, AUTEVAL_CRITERIA } from "./AutoEvalEditor";
import "./ReportEditor.css";

// ── Tableau récapitulatif multi-séances ──────────────────────────────────────

interface MultiSessionAutoeval {
  type: "multi_session";
  sessions: { date: string; scores: Record<string, number> }[];
}

const DOT_COLORS = ["#ef4444", "#f97316", "#eab308", "#84cc16", "#22c55e", "#16a34a"];

function parseMultiSession(content: string): MultiSessionAutoeval | null {
  try {
    const parsed = JSON.parse(content);
    if (parsed?.type === "multi_session" && Array.isArray(parsed.sessions)) {
      return parsed as MultiSessionAutoeval;
    }
  } catch {}
  return null;
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function AutoEvalSummary({ data }: { data: MultiSessionAutoeval }) {
  const { sessions } = data;
  return (
    <div className="auteval-summary">
      <table className="auteval-table">
        <thead>
          <tr>
            <th className="auteval-th auteval-th-criteria">Critère</th>
            {sessions.map((s, i) => (
              <th key={i} className="auteval-th">
                S{i + 1}
                <span className="auteval-th-date">{formatDate(s.date)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {AUTEVAL_CRITERIA.map((criterion) => (
            <tr key={criterion}>
              <td className="auteval-td auteval-td-label">{criterion}</td>
              {sessions.map((s, i) => {
                const isEmpty = Object.keys(s.scores).length === 0;
                const val = isEmpty ? null : (s.scores[criterion] ?? 0);
                return (
                  <td key={i} className="auteval-td auteval-td-score">
                    {val === null ? (
                      <span className="auteval-score-empty">—</span>
                    ) : (
                      <span
                        className="auteval-score-chip"
                        style={{ background: DOT_COLORS[val] }}
                      >
                        {val}
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="auteval-summary-hint">
        Ce tableau est en lecture seule — il récapitule les scores saisis à chaque séance.
      </p>
    </div>
  );
}

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

const ANON_MARKER_RE = /(\[[A-Z_]+_\d+\])/g;

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildHighlightHtml(text: string): string {
  return text.split(ANON_MARKER_RE)
    .map((p, i) =>
      i % 2 === 0
        ? escapeHtml(p)
        : `<mark class="anon-marker">${escapeHtml(p)}</mark>`
    )
    .join("");
}

function SectionTextarea({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isTypingRef = useRef(false);

  ANON_MARKER_RE.lastIndex = 0;
  const hasMarkers = ANON_MARKER_RE.test(value);

  // Initialisation + mise à jour externe uniquement
  useEffect(() => {
    if (!ref.current || !hasMarkers) return;
    if (!isTypingRef.current) {
      ref.current.innerHTML = buildHighlightHtml(value);
    }
  }, [value, hasMarkers]);

  if (!hasMarkers) {
    return (
      <textarea
        className="section-textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "Rédigez cette section…"}
        rows={5}
        lang="fr"
        spellCheck
      />
    );
  }

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      className="section-textarea section-contenteditable"
      onInput={() => {
        isTypingRef.current = true;
        onChange(ref.current?.innerText ?? "");
      }}
      onBlur={() => { isTypingRef.current = false; }}
      lang="fr"
      spellCheck
    />
  );
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

  // Extrait les erreurs propres à une section et retire le préfixe "« titre » — "
  const sectionErrors = (s: Section): string[] => {
    if (!validation) return [];
    return validation.errors
      .filter((e) => e.includes(`« ${s.title} »`))
      .map((e) => e.replace(/^.*?—\s*/, ""));
  };

  return (
    <div className="editor-view">
      <p className="editor-hint">
        Relisez et corrigez chaque section. Les sections marquées <span className="required-badge">*</span> sont obligatoires.
      </p>


      <div className="sections-list">
        {sections.map((s) => {
          const errs = sectionErrors(s);
          const isAutoEval = s.title.toLowerCase().includes("autoévaluation");

          return (
            <div key={s.index} className={`section-block ${errs.length > 0 ? "section-error" : ""}`}>
              <div className="section-header">
                <span className="section-title">
                  {s.title}
                  {s.required && <span className="required-badge">*</span>}
                </span>
                {s.description && (
                  <span className="section-constraint">{s.description}</span>
                )}
              </div>

              {errs.map((e, i) => (
                <p key={i} className="section-error-msg">❌ {e}</p>
              ))}

              {isAutoEval && (
                <p className="section-autoeval-hint">
                  Évaluations réalisées par le patient à la fin de chaque séance, de 0 à 5, sur différents critères (état, bien-être, envie de revenir…).
                </p>
              )}

              {isAutoEval && parseMultiSession(s.content) ? (
                <AutoEvalSummary data={parseMultiSession(s.content)!} />
              ) : isAutoEval ? (
                <AutoEvalEditor
                  content={s.content}
                  onChange={(content) => updateContent(s.index, content)}
                />
              ) : (
                <SectionTextarea
                  value={s.content}
                  onChange={(content) => updateContent(s.index, content)}
                  placeholder={s.constraint ?? undefined}
                />
              )}
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
          Bilan vérifié et validé par le thérapeute
        </label>

        <button
          className="btn-export"
          disabled={!confirmed}
          onClick={() => onExport(sections)}
        >
          Exporter →
        </button>
      </div>
    </div>
  );
}
