import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./HomePage.css";
import folderEmpty from "../assets/folder-empty.png";

interface Patient {
  id: string;
  name: string;
  label?: string;
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

export const LABEL_COLORS = [
  { bg: "#dcfce7", text: "#15803d" },
  { bg: "#dbeafe", text: "#1d4ed8" },
  { bg: "#ffedd5", text: "#c2410c" },
  { bg: "#f3e8ff", text: "#7e22ce" },
  { bg: "#fce7f3", text: "#be185d" },
  { bg: "#fef9c3", text: "#a16207" },
  { bg: "#cffafe", text: "#0e7490" },
  { bg: "#fee2e2", text: "#b91c1c" },
];

export function getLabelColor(label: string) {
  const hash = label.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return LABEL_COLORS[hash % LABEL_COLORS.length];
}

export function HomePage({ onSelectPatient }: Props) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [showLabelPicker, setShowLabelPicker] = useState(false);
  const [loading, setLoading] = useState(true);
  const [createError, setCreateError] = useState("");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "bilan">("all");
  const [labelFilter, setLabelFilter] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  useEffect(() => {
    invoke<{ result: Patient[] }>("call_backend", { method: "list_patients", params: {} })
      .then((res) => setPatients(res.result))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setPage(0);
  }, [search, filter, labelFilter]);

  function closeModal() {
    setCreating(false);
    setNewName("");
    setNewLabel("");
    setShowLabelPicker(false);
    setCreateError("");
  }

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    setSaving(true);
    setCreateError("");
    try {
      const res = await invoke<{ result: Patient }>("call_backend", {
        method: "create_patient",
        params: { name, label: newLabel.trim() },
      });
      setPatients((prev) => [{ ...res.result, session_count: 0, last_session_date: "" }, ...prev]);
      setNewName("");
      setNewLabel("");
      setCreating(false);
      onSelectPatient(res.result);
    } catch (e) {
      setCreateError(String(e));
    } finally {
      setSaving(false);
    }
  }

  const availableLabels = Array.from(
    new Set(patients.map((p) => p.label).filter((l): l is string => !!l))
  ).sort();

  const filtered = patients
    .filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
    .filter((p) => {
      if (filter === "bilan") return p.bilan_count > 0;
      return true;
    })
    .filter((p) => {
      if (labelFilter) return p.label === labelFilter;
      return true;
    })
    .sort(() => 0);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const showPagination = filtered.length > PAGE_SIZE;

  const isEmpty = !loading && patients.length === 0;

  return (
    <>
      {/* Modale création patient */}
      {creating && (
        <div className="new-patient-backdrop" onClick={() => !saving && closeModal()}>
          <div className="new-patient-modal" onClick={(e) => e.stopPropagation()}>
            <p className="new-patient-modal-title">Nouveau patient</p>

            <div className="new-patient-field">
              <label className="new-patient-field-label">Prénom NOM du patient</label>
              <input
                className="new-patient-input"
                type="text"
                placeholder="ex : Lucas M."
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                  if (e.key === "Escape") closeModal();
                }}
                autoFocus
              />
            </div>

            {!showLabelPicker ? (
              <button type="button" className="btn-add-label" onClick={() => setShowLabelPicker(true)}>
                + Ajouter un lieu
              </button>
            ) : (
              <div className="label-picker">
                {availableLabels.length > 0 && (
                  <div className="label-picker-existing">
                    {availableLabels.map((lbl) => {
                      const color = getLabelColor(lbl);
                      const active = newLabel === lbl;
                      return (
                        <button
                          key={lbl}
                          type="button"
                          className={`label-picker-chip${active ? " label-picker-chip--active" : ""}`}
                          style={active ? { background: color.bg, color: color.text, borderColor: color.text } : {}}
                          onClick={() => setNewLabel(active ? "" : lbl)}
                        >
                          {lbl}
                        </button>
                      );
                    })}
                  </div>
                )}
                <input
                  className="new-patient-input"
                  type="text"
                  placeholder={availableLabels.length > 0 ? "Créer un nouveau lieu…" : "Ex : Lyon, Cabinet 2…"}
                  value={availableLabels.includes(newLabel) ? "" : newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreate();
                    if (e.key === "Escape") closeModal();
                  }}
                  autoFocus
                />
              </div>
            )}

            {createError && <p className="create-error">❌ {createError}</p>}
            <div className="new-patient-actions">
              <button className="btn-cancel" onClick={closeModal} disabled={saving}>
                Annuler
              </button>
              <button className="btn-confirm" onClick={handleCreate} disabled={!newName.trim() || saving}>
                {saving ? "Création…" : "Créer le dossier"}
              </button>
            </div>
          </div>
        </div>
      )}

      {isEmpty ? (
        <div className="home-view home-view--empty">
          <img src={folderEmpty} alt="" className="home-empty-illustration" />
          <h1 className="home-title">Patients</h1>
          <p className="home-empty-hint">Créez un dossier patient pour commencer.</p>
          <button className="btn-new-patient" onClick={() => setCreating(true)}>
            + Nouveau patient
          </button>
        </div>
      ) : (
        <div className="home-view">
          <div className="home-header">
            <h1 className="home-title">Patients</h1>
            <button className="btn-new-patient" onClick={() => setCreating(true)}>
              + Nouveau patient
            </button>
          </div>

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

          {availableLabels.length > 0 && (
            <div className="label-chips">
              <button
                className={`label-chip${labelFilter === null ? " label-chip--active" : ""}`}
                onClick={() => setLabelFilter(null)}
              >
                Tous
              </button>
              {availableLabels.map((lbl) => {
                const color = getLabelColor(lbl);
                const active = labelFilter === lbl;
                return (
                  <button
                    key={lbl}
                    className={`label-chip${active ? " label-chip--active" : ""}`}
                    style={active ? { background: color.bg, color: color.text, borderColor: color.text } : {}}
                    onClick={() => setLabelFilter(active ? null : lbl)}
                  >
                    {lbl}
                  </button>
                );
              })}
            </div>
          )}

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
                      <div className="patient-name-row">
                        <span className="patient-name">{p.name}</span>
                        {p.label && (
                          <span
                            className="patient-label-badge"
                            style={{ background: getLabelColor(p.label).bg, color: getLabelColor(p.label).text }}
                          >
                            {p.label}
                          </span>
                        )}
                      </div>
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
      )}
    </>
  );
}
