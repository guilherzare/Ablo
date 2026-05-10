import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { getLabelColor } from "./HomePage";
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
  const [lieux, setLieux] = useState<string[]>([]);
  const [newLieu, setNewLieu] = useState("");
  const [editingLieu, setEditingLieu] = useState<{ name: string; value: string } | null>(null);
  const [confirmDeleteLieu, setConfirmDeleteLieu] = useState<string | null>(null);

  useEffect(() => {
    invoke<{ result: Settings }>("call_backend", { method: "get_settings", params: {} })
      .then((res) => setSettings(res.result as Settings))
      .catch(() => {});
    invoke<{ result: string[] }>("call_backend", { method: "list_lieux", params: {} })
      .then((res) => setLieux(res.result))
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

  async function handleCreateLieu() {
    const name = newLieu.trim();
    if (!name) return;
    const res = await invoke<{ result: string[] }>("call_backend", { method: "create_lieu", params: { name } });
    setLieux(res.result);
    setNewLieu("");
  }

  async function handleRenameLieu() {
    if (!editingLieu || !editingLieu.value.trim()) return;
    const res = await invoke<{ result: string[] }>("call_backend", {
      method: "rename_lieu",
      params: { old_name: editingLieu.name, new_name: editingLieu.value.trim() },
    });
    setLieux(res.result);
    setEditingLieu(null);
  }

  async function handleDeleteLieu(name: string) {
    const res = await invoke<{ result: string[] }>("call_backend", { method: "delete_lieu", params: { name } });
    setLieux(res.result);
    setConfirmDeleteLieu(null);
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
          <h3>Lieux</h3>
          <p className="settings-hint">Cabinets, villes ou tout autre étiquette pour organiser vos patients.</p>

          <div className="lieux-list">
            {lieux.length === 0 && (
              <p className="lieux-empty">Aucun lieu créé.</p>
            )}
            {lieux.map((lieu) => {
              const color = getLabelColor(lieu);
              if (confirmDeleteLieu === lieu) {
                return (
                  <div key={lieu} className="lieu-row lieu-row--confirm">
                    <span className="lieu-confirm-msg">Supprimer «&nbsp;{lieu}&nbsp;» ?</span>
                    <button className="lieu-btn lieu-btn--danger" onClick={() => handleDeleteLieu(lieu)}>Supprimer</button>
                    <button className="lieu-btn" onClick={() => setConfirmDeleteLieu(null)}>Annuler</button>
                  </div>
                );
              }
              if (editingLieu?.name === lieu) {
                return (
                  <div key={lieu} className="lieu-row">
                    <input
                      className="lieu-input"
                      value={editingLieu.value}
                      onChange={(e) => setEditingLieu({ name: lieu, value: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRenameLieu();
                        if (e.key === "Escape") setEditingLieu(null);
                      }}
                      autoFocus
                    />
                    <button className="lieu-btn lieu-btn--primary" onClick={handleRenameLieu} disabled={!editingLieu.value.trim()}>✓</button>
                    <button className="lieu-btn" onClick={() => setEditingLieu(null)}>✕</button>
                  </div>
                );
              }
              return (
                <div key={lieu} className="lieu-row">
                  <span className="lieu-badge" style={{ background: color.bg, color: color.text }}>{lieu}</span>
                  <div className="lieu-actions">
                    <button className="lieu-btn" onClick={() => setEditingLieu({ name: lieu, value: lieu })}>Éditer</button>
                    <button className="lieu-btn lieu-btn--danger" onClick={() => setConfirmDeleteLieu(lieu)}>Supprimer</button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="lieu-create-row">
            <input
              className="settings-input"
              type="text"
              placeholder="Nouveau lieu…"
              value={newLieu}
              onChange={(e) => setNewLieu(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleCreateLieu(); }}
            />
            <button className="lieu-btn lieu-btn--primary" onClick={handleCreateLieu} disabled={!newLieu.trim()}>
              Ajouter
            </button>
          </div>
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
