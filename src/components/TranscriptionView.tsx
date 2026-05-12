import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./TranscriptionView.css";

interface DictEntry {
  wrong: string;
  correct: string;
}

interface Props {
  text: string;
  onChange: (text: string) => void;
  onContinue: () => void;
  isLoading?: boolean;
  loadingLabel?: string;
}

export function TranscriptionView({ text, onChange, onContinue, isLoading, loadingLabel }: Props) {
  const [dictionary, setDictionary] = useState<DictEntry[]>([]);
  const [newWrong, setNewWrong] = useState("");
  const [newCorrect, setNewCorrect] = useState("");
  const [appliedCount, setAppliedCount] = useState<number | null>(null);
  const [applyError, setApplyError] = useState(false);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    invoke<{ result: DictEntry[] }>("call_backend", { method: "get_dictionary", params: {} })
      .then((res) => setDictionary(res.result ?? []))
      .catch(() => {});
  }, []);

  async function handleApply() {
    try {
      const res = await invoke<{ result: string }>("call_backend", {
        method: "apply_dictionary",
        params: { text },
      });
      const corrected = res.result;
      if (corrected !== text) {
        const count = countDifferences(text, corrected);
        onChange(corrected);
        setAppliedCount(count);
        setTimeout(() => setAppliedCount(null), 3000);
      } else {
        setAppliedCount(0);
        setTimeout(() => setAppliedCount(null), 2000);
      }
    } catch {
      setApplyError(true);
      setTimeout(() => setApplyError(false), 3000);
    }
  }

  async function handleAddEntry() {
    if (!newWrong.trim() || !newCorrect.trim()) return;
    const entry: DictEntry = { wrong: newWrong.trim(), correct: newCorrect.trim() };
    const updated = [...dictionary, entry];
    try {
      await invoke("call_backend", {
        method: "update_dictionary",
        params: { entries: updated },
      });
      setDictionary(updated);
      setNewWrong("");
      setNewCorrect("");
      setShowForm(false);
    } catch {
      // sans Tauri
    }
  }

  async function handleRemoveEntry(index: number) {
    const updated = dictionary.filter((_, i) => i !== index);
    try {
      await invoke("call_backend", {
        method: "update_dictionary",
        params: { entries: updated },
      });
      setDictionary(updated);
    } catch {
      // sans Tauri
    }
  }

  return (
    <div className="transcription-view">
      <div className="transcription-header">
        <h2>Transcription brute</h2>
        <p className="transcription-hint">
          Relisez et corrigez les éventuelles erreurs de reconnaissance avant de continuer.
        </p>
      </div>

      <textarea
        className="transcription-textarea"
        value={text}
        onChange={(e) => onChange(e.target.value)}
        placeholder="La transcription apparaîtra ici…"
        rows={12}
        spellCheck
        lang="fr"
      />

      {/* Panneau corrections */}
      <div className="corrections-panel">
        <div className="corrections-panel-header">
          <span className="corrections-panel-title">
            Corrections automatiques
            {dictionary.length > 0 && (
              <span className="corrections-count">{dictionary.length}</span>
            )}
          </span>
          <div className="corrections-panel-actions">
            {applyError && (
              <span className="corrections-feedback corrections-feedback--error">
                Erreur lors de l'application
              </span>
            )}
            {appliedCount !== null && (
              <span className={`corrections-feedback ${appliedCount === 0 ? "corrections-feedback--none" : ""}`}>
                {appliedCount === 0 ? "Aucune correction à appliquer" : `${appliedCount} correction${appliedCount > 1 ? "s" : ""} appliquée${appliedCount > 1 ? "s" : ""}`}
              </span>
            )}
            {dictionary.length > 0 && (
              <button className="btn-apply-dict" onClick={handleApply} disabled={!text.trim()}>
                Appliquer
              </button>
            )}
            <button className="btn-add-correction" onClick={() => setShowForm((v) => !v)}>
              {showForm ? "Annuler" : "+ Ajouter"}
            </button>
          </div>
        </div>

        {dictionary.length > 0 && (
          <ul className="corrections-list">
            {dictionary.map((entry, i) => (
              <li key={i} className="correction-item">
                <span className="correction-wrong">{entry.wrong}</span>
                <span className="correction-arrow">→</span>
                <span className="correction-correct">{entry.correct}</span>
                <button className="btn-remove-correction" onClick={() => handleRemoveEntry(i)} title="Supprimer">×</button>
              </li>
            ))}
          </ul>
        )}

        {showForm && (
          <div className="correction-add-form">
            <input
              className="correction-input"
              type="text"
              placeholder="Mot incorrect"
              value={newWrong}
              onChange={(e) => setNewWrong(e.target.value)}
              spellCheck={false}
              autoFocus
            />
            <span className="correction-arrow">→</span>
            <input
              className="correction-input"
              type="text"
              placeholder="Correction"
              value={newCorrect}
              onChange={(e) => setNewCorrect(e.target.value)}
              spellCheck={false}
              onKeyDown={(e) => e.key === "Enter" && handleAddEntry()}
            />
            <button
              className="btn-confirm-add"
              onClick={handleAddEntry}
              disabled={!newWrong.trim() || !newCorrect.trim()}
            >
              Ajouter
            </button>
          </div>
        )}
      </div>

      <div className="transcription-footer">
        <span className="word-count">
          {text.trim() ? `${text.trim().split(/\s+/).length} mots` : ""}
        </span>
        <button
          className="btn-continue"
          onClick={onContinue}
          disabled={!text.trim() || isLoading}
        >
          {isLoading ? loadingLabel ?? "Chargement…" : "Continuer → Anonymisation"}
        </button>
      </div>
    </div>
  );
}

function countDifferences(original: string, corrected: string): number {
  const a = original.split(/\s+/);
  const b = corrected.split(/\s+/);
  let count = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) count++;
  }
  count += Math.abs(a.length - b.length);
  return count;
}
