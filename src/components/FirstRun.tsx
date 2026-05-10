import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "./FirstRun.css";
import abloIcon from "../assets/ablo-icon.png";

interface ModelStatus {
  present: boolean;
  label: string;
  size_bytes: number;
  percent?: number;
  status?: string;
}

interface Props {
  onComplete: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} Go`;
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(0)} Mo`;
  return `${bytes} o`;
}

export function FirstRun({ onComplete }: Props) {
  const [models, setModels] = useState<Record<string, ModelStatus>>({});
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // Charge l'état initial des modèles
    invoke<{ result: Record<string, ModelStatus> }>("call_backend", {
      method: "check_models",
      params: {},
    })
      .then((res) => setModels(res.result))
      .catch((e) => setError(`Erreur au démarrage du backend : ${e}`))
      .finally(() => setModelsLoaded(true));
  }, []);

  useEffect(() => {
    // Écoute les événements de progression du téléchargement
    const unlisten = listen<{
      type: string;
      model?: string;
      percent?: number;
      status?: string;
      message?: string;
      label?: string;
      size_bytes?: number;
    }>("model-download-progress", (event) => {
      const data = event.payload;

      if (data.type === "complete") {
        setDone(true);
        setDownloading(false);
        setTimeout(onComplete, 1200);
        return;
      }

      if (data.type === "error") {
        setError(data.message ?? "Erreur inconnue");
        setDownloading(false);
        return;
      }

      // Format d'exception Python renvoyé par main() : {"id": null, "error": "..."}
      if (!data.type && (data as any).error) {
        setError(String((data as any).error));
        setDownloading(false);
        return;
      }

      if (data.type === "progress" && data.model) {
        setModels((prev) => {
          const existing = prev[data.model!] ?? {
            present: false,
            label: data.label ?? data.model!,
            size_bytes: data.size_bytes ?? 0,
          };
          return {
            ...prev,
            [data.model!]: {
              ...existing,
              percent: data.percent ?? 0,
              status: data.status,
            },
          };
        });
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [onComplete]);

  async function startDownload() {
    setError(null);
    setDownloading(true);
    try {
      await invoke("start_model_download");
    } catch (e) {
      setError(String(e));
      setDownloading(false);
    }
  }

  const modelList = Object.values(models);
  const totalBytes = modelList.reduce((acc, m) => acc + m.size_bytes, 0);

  const pending = modelList.filter((m) => !m.present);
  const overallPercent = downloading && pending.length > 0
    ? pending.reduce((acc, m) => acc + (m.status === "done" ? 100 : m.percent ?? 0), 0) / pending.length
    : 0;

  const activeModel = modelList.find((m) => m.status === "downloading");

  return (
    <div className="firstrun">
      <div className="firstrun-card">
        <img src={abloIcon} alt="Ablo" className="firstrun-logo" />
        <h1>Bienvenue dans Ablo</h1>
        <p className="firstrun-intro">
          Pour fonctionner <strong>100% hors-ligne</strong>, Ablo a besoin de
          réaliser deux téléchargements sur votre ordinateur.
        </p>

        <div className="models-list">
          {Object.entries(models).map(([name, model]) => {
            const pct = model.present && !downloading ? 100 : model.percent ?? 0;
            const indeterminate = downloading && !model.present && model.status === "downloading" && pct === 0;
            return (
              <div key={name} className="model-item">
                <div className="model-header">
                  <span className="model-label">{model.label}</span>
                  <span className="model-size">{formatBytes(model.size_bytes)}</span>
                </div>
                {downloading || model.present ? (
                  <div className="model-progress">
                    <div
                      className={`model-progress-bar${indeterminate ? " model-progress-bar--indeterminate" : ""}`}
                      style={{ width: indeterminate ? "100%" : `${pct}%` }}
                    />
                  </div>
                ) : null}
                <span className="model-state">
                  {model.present
                    ? "✅ Déjà installé"
                    : model.status === "downloading"
                    ? `${pct}%`
                    : model.status === "done"
                    ? "✅ Terminé"
                    : downloading ? "En attente…" : ""}
                </span>
              </div>
            );
          })}
        </div>

        {downloading && (
          <div className="firstrun-overall">
            <div className="firstrun-overall-bar">
              <div
                className={`firstrun-overall-fill${overallPercent === 0 ? " model-progress-bar--indeterminate" : ""}`}
                style={{ width: overallPercent === 0 ? "100%" : `${overallPercent}%` }}
              />
            </div>
            <p className="firstrun-overall-label">
              {activeModel
                ? `Téléchargement de ${activeModel.label}… ${activeModel.percent ?? 0}%`
                : overallPercent > 0
                ? `${Math.round(overallPercent)}% terminé`
                : "Initialisation…"}
            </p>
          </div>
        )}

        <p className="firstrun-total">
          Volume total : <strong>{formatBytes(totalBytes)}</strong><br />
          Une connexion internet est nécessaire uniquement pour ce téléchargement.
        </p>

        {error && <p className="firstrun-error">❌ {error}</p>}

        {done ? (
          <p className="firstrun-success">✅ Modèles installés. Lancement d'Ablo…</p>
        ) : (
          <button
            className="firstrun-btn"
            onClick={startDownload}
            disabled={!modelsLoaded || downloading}
          >
            {!modelsLoaded
              ? "Démarrage du backend…"
              : downloading
              ? "Téléchargement en cours…"
              : "Télécharger et installer les modèles"}
          </button>
        )}
      </div>
    </div>
  );
}
