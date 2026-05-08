import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./SettingsPanel.css";

interface Settings {
  therapist_name: string;
  therapist_email: string;
  therapist_city: string;
  export_folder: string;
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
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    invoke<{ result: Settings }>("call_backend", { method: "get_settings", params: {} })
      .then((res) => setSettings(res.result as Settings))
      .catch(() => {});
  }, []);

  async function handleSave() {
    await invoke("call_backend", {
      method: "update_settings",
      params: settings,
    });
    setSaved(true);
    setTimeout(() => { setSaved(false); onClose(); }, 800);
  }

  function update(key: keyof Settings, value: string) {
    setSettings((s) => ({ ...s, [key]: value }));
    setSaved(false);
  }

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
          <label className="settings-label">
            Dossier de destination
            <input
              className="settings-input"
              type="text"
              placeholder="~/Documents/Oralis"
              value={settings.export_folder}
              onChange={(e) => update("export_folder", e.target.value)}
            />
          </label>
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
