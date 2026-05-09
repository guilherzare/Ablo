import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./HomePage.css";
import folderEmpty from "../assets/folder-empty.png";

interface Patient {
  id: string;
  name: string;
  session_count: number;
  last_session_date: string;
  bilan_count: number;
  last_bilan_date: string;
  created_at: string;
}

interface Props {
  onSelectPatient: (patient: Patient) => void;
}

function formatDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function HomePage({ onSelectPatient }: Props) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(true);
  const [createError, setCreateError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    invoke<{ result: Patient[] }>("call_backend", { method: "list_patients", params: {} })
      .then((res) => setPatients(res.result))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    setSaving(true);
    setCreateError("");
    try {
      const res = await invoke<{ result: Patient }>("call_backend", {
        method: "create_patient",
        params: { name },
      });
      setPatients((prev) => [{ ...res.result, session_count: 0, last_session_date: "" }, ...prev]);
      setNewName("");
      setCreating(false);
      onSelectPatient(res.result);
    } catch (e) {
      setCreateError(String(e));
    } finally {
      setSaving(false);
    }
  }

  const isEmpty = !loading && patients.length === 0 && !creating;

  if (isEmpty) {
    return (
      <div className="home-view home-view--empty">
        <img src={folderEmpty} alt="" className="home-empty-illustration" />
        <h1 className="home-title">Patients</h1>
        <p className="home-empty-hint">Créez un dossier patient pour commencer.</p>
        <button className="btn-new-patient" onClick={() => setCreating(true)}>
          + Nouveau patient
        </button>
        {creating && (
          <div className="new-patient-form" style={{ width: "100%", maxWidth: 420 }}>
            <input
              className="new-patient-input"
              type="text"
              placeholder="Prénom NOM (ex : Lucas M.)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") { setCreating(false); setNewName(""); } }}
              autoFocus
            />
            <div className="new-patient-actions">
              <button className="btn-cancel" onClick={() => { setCreating(false); setNewName(""); setCreateError(""); }}>
                Annuler
              </button>
              <button className="btn-confirm" onClick={handleCreate} disabled={!newName.trim() || saving}>
                {saving ? "Création…" : "Créer le dossier"}
              </button>
            </div>
            {createError && <p className="create-error">❌ {createError}</p>}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="home-view">
      <div className="home-header">
        <h1 className="home-title">Patients</h1>
        <button className="btn-new-patient" onClick={() => setCreating(true)}>
          + Nouveau patient
        </button>
      </div>

      {creating && (
        <div className="new-patient-form">
          <input
            className="new-patient-input"
            type="text"
            placeholder="Prénom NOM (ex : Lucas M.)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setCreating(false); }}
            autoFocus
          />
          <div className="new-patient-actions">
            <button className="btn-cancel" onClick={() => { setCreating(false); setNewName(""); setCreateError(""); }}>
              Annuler
            </button>
            <button className="btn-confirm" onClick={handleCreate} disabled={!newName.trim() || saving}>
              {saving ? "Création…" : "Créer le dossier"}
            </button>
          </div>
          {createError && <p className="create-error">❌ {createError}</p>}
        </div>
      )}

      {loading ? (
        <p className="home-empty">Chargement…</p>
      ) : (
        <ul className="patient-list">
          {patients.map((p) => (
            <li key={p.id} className="patient-card" onClick={() => onSelectPatient(p)}>
              <div className="patient-card-main">
                <span className="patient-name">{p.name}</span>
                <span className="patient-meta">
                  {p.session_count} séance{p.session_count !== 1 ? "s" : ""}
                  {p.last_session_date ? ` · Dernière : ${formatDate(p.last_session_date)}` : ""}
                </span>
              </div>
              <div className="patient-card-right">
                {p.bilan_count > 0 && (
                  <span className="patient-bilan-badge">✓ Bilan séances effectué</span>
                )}
                <span className="patient-chevron">›</span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="home-version">Ablo v0.1.0 · 2026</p>
    </div>
  );
}
