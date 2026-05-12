import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { getLabelColor } from "./HomePage";
import "./SettingsPanel.css";

interface Settings {
  therapist_name: string;
  therapist_email: string;
  therapist_phone: string;
  export_folder: string;
}

interface Props {
  onClose: () => void;
}

export function SettingsPanel({ onClose }: Props) {
  const [settings, setSettings] = useState<Settings>({
    therapist_name: "",
    therapist_email: "",
    therapist_phone: "",
    export_folder: "",
  });
  const [saved, setSaved] = useState(false);
  const [lieux, setLieux] = useState<string[]>([]);
  const [newLieu, setNewLieu] = useState("");
  const [showCreateLieu, setShowCreateLieu] = useState(false);
  const [editingLieu, setEditingLieu] = useState<{ name: string; value: string } | null>(null);
  const [confirmDeleteLieu, setConfirmDeleteLieu] = useState<string | null>(null);

  // --- Large V3 ---
  const [largeV3Present, setLargeV3Present] = useState<boolean | null>(null);
  const [largeV3Downloading, setLargeV3Downloading] = useState(false);
  const [largeV3Percent, setLargeV3Percent] = useState(0);
  const [largeV3Error, setLargeV3Error] = useState<string | null>(null);

  const newLieuRef = useRef<HTMLInputElement>(null);
  const editLieuRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    invoke<{ result: Settings }>("call_backend", { method: "get_settings", params: {} })
      .then((res) => setSettings(res.result as Settings))
      .catch(() => {});
    invoke<{ result: string[] }>("call_backend", { method: "list_lieux", params: {} })
      .then((res) => setLieux(res.result))
      .catch(() => {});
    invoke<{ result: { present: boolean } }>("call_backend", { method: "check_large_v3", params: {} })
      .then((res) => setLargeV3Present(res.result.present))
      .catch(() => setLargeV3Present(false));
  }, []);

  // Focus manuel avec délai pour contourner le bug WebView2 (autoFocus perd le 1er caractère)
  useEffect(() => {
    if (!showCreateLieu) return;
    const t = setTimeout(() => newLieuRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [showCreateLieu]);

  useEffect(() => {
    if (!editingLieu) return;
    const t = setTimeout(() => editLieuRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [editingLieu]);

  async function persistSettings() {
    await invoke("call_backend", {
      method: "update_settings",
      params: settings,
    }).catch(() => {});
  }

  async function handleSave() {
    await persistSettings();
    setSaved(true);
    setTimeout(() => { setSaved(false); onClose(); }, 800);
  }

  function handleClose() {
    persistSettings();
    onClose();
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
    if (res.result) setLieux(res.result);
    setNewLieu("");
    setShowCreateLieu(false);
  }

  async function handleRenameLieu() {
    if (!editingLieu || !editingLieu.value.trim()) return;
    const res = await invoke<{ result: string[] }>("call_backend", {
      method: "rename_lieu",
      params: { old_name: editingLieu.name, new_name: editingLieu.value.trim() },
    });
    if (res.result) setLieux(res.result);
    setEditingLieu(null);
  }

  async function handleDeleteLieu(name: string) {
    try {
      const res = await invoke<{ result: string[] }>("call_backend", { method: "delete_lieu", params: { name } });
      if (res.result) setLieux(res.result);
    } catch {
      // silencieux — la liste sera rafraîchie à la prochaine ouverture
    } finally {
      setConfirmDeleteLieu(null);
    }
  }

  async function handleDownloadLargeV3() {
    setLargeV3Downloading(true);
    setLargeV3Percent(0);
    setLargeV3Error(null);

    const unlisten = await listen<{ type: string; percent?: number; message?: string }>(
      "large-v3-download-progress",
      (event) => {
        const data = event.payload;
        if (data.type === "progress" && data.percent !== undefined) {
          setLargeV3Percent(data.percent);
        } else if (data.type === "complete") {
          setLargeV3Percent(100);
          setLargeV3Present(true);   // card disparaît
          setLargeV3Downloading(false);
          unlisten();
        } else if (data.type === "error") {
          setLargeV3Error(data.message ?? "Erreur inconnue");
          setLargeV3Downloading(false);
          unlisten();
        }
      }
    );

    try {
      await invoke("start_large_v3_download");
    } catch (e) {
      setLargeV3Error("Impossible de lancer le téléchargement");
      setLargeV3Downloading(false);
      unlisten();
    }
  }

  const folderName = settings.export_folder
    ? settings.export_folder.split(/[\\/]/).filter(Boolean).pop() ?? settings.export_folder
    : null;

  return (
    <div className="settings-overlay" onClick={handleClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Réglages</h2>
          <button className="settings-close" onClick={handleClose}>×</button>
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
            Téléphone
            <input
              className="settings-input"
              type="tel"
              placeholder="ex : 06 12 34 56 78"
              value={settings.therapist_phone}
              onChange={(e) => update("therapist_phone", e.target.value)}
            />
          </label>

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
                    <button className="lieu-btn lieu-btn--danger" onClick={(e) => { e.stopPropagation(); handleDeleteLieu(lieu); }}>Supprimer</button>
                    <button className="lieu-btn" onClick={(e) => { e.stopPropagation(); setConfirmDeleteLieu(null); }}>Annuler</button>
                  </div>
                );
              }
              if (editingLieu?.name === lieu) {
                return (
                  <div key={lieu} className="lieu-row">
                    <input
                      ref={editLieuRef}
                      className="lieu-input"
                      value={editingLieu.value}
                      onChange={(e) => setEditingLieu({ name: lieu, value: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRenameLieu();
                        if (e.key === "Escape") setEditingLieu(null);
                      }}
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

          {!showCreateLieu ? (
            <button type="button" className="btn-add-label" onClick={() => setShowCreateLieu(true)}>
              + Nouveau lieu
            </button>
          ) : (
            <div className="lieu-create-row">
              <input
                ref={newLieuRef}
                className="settings-input"
                type="text"
                placeholder="Nouveau lieu…"
                value={newLieu}
                onChange={(e) => setNewLieu(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateLieu();
                  if (e.key === "Escape") { setShowCreateLieu(false); setNewLieu(""); }
                }}
              />
              <button className="lieu-btn lieu-btn--primary" onClick={handleCreateLieu} disabled={!newLieu.trim()}>
                Ajouter
              </button>
            </div>
          )}
        </div>

        <div className="settings-section">
          <h3>Dossier d'export</h3>
          <p className="settings-hint">Dossier où seront enregistrés les exports Word et PDF.</p>
          <div className="folder-picker">
            <div className={folderName ? "folder-name" : "folder-name folder-placeholder"}>
              {folderName ?? "Aucun dossier sélectionné"}
            </div>
            <button className="btn-pick-folder" onClick={pickFolder}>
              Choisir un dossier…
            </button>
          </div>
        </div>

        {/* Section amélioration transcription — masquée si large-v3 déjà installé */}
        {largeV3Present === false && (
          <div className="settings-section">
            <h3>Améliorer la transcription</h3>
            <p className="settings-hint">
              Le modèle haute qualité reconnaît mieux le vocabulaire clinique et réduit les erreurs de transcription.
              Téléchargement unique de 3,1&nbsp;Go — connexion internet requise.
            </p>
            {!largeV3Downloading && !largeV3Error && (
              <button className="btn-download-large" onClick={handleDownloadLargeV3}>
                Télécharger le modèle haute qualité
              </button>
            )}
            {largeV3Downloading && (
              <div className="large-v3-progress-wrap">
                <div className="large-v3-progress-bar-track">
                  <div className="large-v3-progress-bar-fill" style={{ width: `${largeV3Percent}%` }} />
                </div>
                <span className="large-v3-progress-label">{largeV3Percent}%</span>
                <p className="large-v3-progress-hint">
                  Ne fermez pas l'application pendant le téléchargement.
                </p>
              </div>
            )}
            {largeV3Error && (
              <div className="large-v3-error">
                <span>{largeV3Error}</span>
                <button className="btn-download-large" onClick={handleDownloadLargeV3}>
                  Réessayer
                </button>
              </div>
            )}
          </div>
        )}

        <div className="settings-footer">
          <button className="btn-save" onClick={handleSave}>
            {saved ? "✓ Enregistré" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}
