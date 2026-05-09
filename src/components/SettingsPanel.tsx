import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import "./SettingsPanel.css";

interface Settings {
  therapist_name: string;
  therapist_email: string;
  therapist_city: string;
  export_folder: string;
}

interface DictEntry {
  wrong: string;
  correct: string;
}

interface Props {
  onClose: () => void;
}

export function SettingsPanel({ onClose }: Props) {
  const [settings, setSettings] = useState<Settings>({
    therapist_name: "",
    therapist_email: "",
    therapist_city: "",
    export_folder: "",
  });
  const [dictionary, setDictionary] = useState<DictEntry[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    invoke<{ result: Settings }>("call_backend", { method: "get_settings", params: {} })
      .then((res) => setSettings(res.result as Settings))
      .catch(() => {});
    invoke<{ result: DictEntry[] }>("call_backend", { method: "get_dictionary", params: {} })
      .then((res) => setDictionary(res.result ?? []))
      .catch(() => {});
  }, []);

  async function handleSave() {
    await invoke("call_backend", {
      method: "update_settings",
      params: settings,
    });
    await invoke("call_backend", {
      method: "update_dictionary",
      params: { entries: dictionary },
    });
    setSaved(true);
    setTimeout(() => { setSaved(false); onClose(); }, 800);
  }

  async function pickFolder() {
    const selected = await open({ directory: true, multiple: false });
    if (selected && typeof selected === "string") {
      setSettings((s) => ({ ...s, export_folder: selected }));
      setSaved(false);
    }
  }

  function update(key: keyof Settings, value: string) {
    setSettings((s) => ({ ...s, [key]: value }));
    setSaved(false);
  }

  function addEntry() {
    setDictionary((d) => [...d, { wrong: "", correct: "" }]);
    setSaved(false);
  }

  function updateEntry(index: number, field: keyof DictEntry, value: string) {
    setDictionary((d) => d.map((e, i) => i === index ? { ...e, [field]: value } : e));
    setSaved(false);
  }

  function removeEntry(index: number) {
    setDictionary((d) => d.filter((_, i) => i !== index));
    setSaved(false);
  }

  const folderName = settings.export_folder
    ? settings.export_folder.split(/[\\/]/).filter(Boolean).pop() ?? settings.export_folder
    : null;

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Réglages</h2>
          <button className="settings-close" onClick={onClose}>×</button>
        </div>

        <div className="settings-section">
          <h3>Informations du thérapeute</h3>
          <p className="settings-hint">Apparaissent dans l'en-tête et le pied de page des exports.</p>

          <label className="settings-label">
            Nom complet
            <input
              className="settings-input"
              type="text"
              placeholder="ex : Claire Fontaine"
              value={settings.therapist_name}
              onChange={(e) => update("therapist_name", e.target.value)}
            />
          </label>

          <label className="settings-label">
            Email professionnel
            <input
              className="settings-input"
              type="email"
              placeholder="ex : claire.fontaine@cabinet-art.fr"
              value={settings.therapist_email}
              onChange={(e) => update("therapist_email", e.target.value)}
            />
          </label>

          <label className="settings-label">
            Ville (pour le pied de page)
            <input
              className="settings-input"
              type="text"
              placeholder="ex : Grenoble"
              value={settings.therapist_city}
              onChange={(e) => update("therapist_city", e.target.value)}
            />
          </label>
        </div>

        <div className="settings-section">
          <h3>Export</h3>
          <div className="settings-label">
            Dossier de destination
            <div className="folder-picker">
              <span className="folder-name">
                {folderName ?? <span className="folder-placeholder">Aucun dossier sélectionné</span>}
              </span>
              <button className="btn-pick-folder" onClick={pickFolder}>
                {settings.export_folder ? "Changer de dossier" : "Choisir un dossier"}
              </button>
            </div>
          </div>
        </div>

        <div className="settings-section">
          <h3>Corrections de transcription</h3>
          <p className="settings-hint">
            Corrigez les mots que Whisper transcrit mal. Chaque correction sera appliquée automatiquement après la transcription.
          </p>

          {dictionary.length > 0 && (
            <div className="dict-header-row">
              <span className="dict-col-label">Mot incorrect</span>
              <span className="dict-col-label">Correction</span>
            </div>
          )}

          <div className="dict-list">
            {dictionary.map((entry, i) => (
              <div key={i} className="dict-row">
                <input
                  className="settings-input dict-input"
                  type="text"
                  placeholder="ex : argotérapie"
                  value={entry.wrong}
                  onChange={(e) => updateEntry(i, "wrong", e.target.value)}
                  lang="fr"
                  spellCheck={false}
                />
                <span className="dict-arrow">→</span>
                <input
                  className="settings-input dict-input"
                  type="text"
                  placeholder="ex : art-thérapie"
                  value={entry.correct}
                  onChange={(e) => updateEntry(i, "correct", e.target.value)}
                  lang="fr"
                  spellCheck={false}
                />
                <button className="btn-dict-remove" onClick={() => removeEntry(i)} title="Supprimer">×</button>
              </div>
            ))}
          </div>

          <button className="btn-add-entry" onClick={addEntry}>
            + Ajouter une correction
          </button>
        </div>

        <div className="settings-footer">
          <button className="btn-save" onClick={handleSave}>
            {saved ? "✓ Enregistré" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}
