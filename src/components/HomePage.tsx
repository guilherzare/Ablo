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

const PAGE_SIZE = 10;

export function HomePage({ onSelectPatient }: Props) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(true);
  const [createError, setCreateError] = useState("");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "bilan">("all");
  const [page, setPage] = useState(0);

  useEffect(() => {
    invoke<{ result: Patient[] }>("call_backend", { method: "list_patients", params: {} })
      .then((res) => setPatients(res.result))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setPage(0);
  }, [search, filter]);

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

  const filtered = patients
    .filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
    .filter((p) => {
      if (filter === "bilan") return p.bilan_count > 0;
return true;
    })
    .sort(() => 0);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const showPagination = filtered.length > PAGE_SIZE;

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

      <div className="home-search-row">
        <div className="home-search-wrap">
          <svg className="home-search-icon" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="9" cy="9" r="5.5" stroke="#9ca3af" strokeWidth="1.5"/>
            <path d="M13.5 13.5L17 17" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <input
            className="home-search"
            type="text"
            placeholder="Rechercher un patient…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="home-filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value as "all" | "bilan")}
        >
          <option value="all">Tous</option>
          <option value="bilan">Bilan réalisé</option>
        </select>
      </div>

      {loading ? (
        <p className="home-empty">Chargement…</p>
      ) : filtered.length === 0 ? (
        <p className="home-empty">Aucun patient trouvé pour « {search} ».</p>
      ) : (
        <>
          <ul className="patient-list">
            {paginated.map((p) => (
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
                    <span className="patient-bilan-badge">✓ Bilan réalisé</span>
                  )}
                  <span className="patient-chevron">›</span>
                </div>
              </li>
            ))}
          </ul>

          {showPagination && (
            <div className="home-pagination">
              <button
                className="pagination-btn"
                onClick={() => setPage((p) => p - 1)}
                disabled={page === 0}
              >
                ←
              </button>
              <span className="pagination-info">{page + 1} / {totalPages}</span>
              <button
                className="pagination-btn"
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= totalPages - 1}
              >
                →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
