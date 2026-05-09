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
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // Charge l'état initial des modèles
    invoke<{ result: Record<string, ModelStatus> }>("call_backend", {
      method: "check_models",
      params: {},
    }).then((res) => setModels(res.result));
  }, []);

  useEffect(() => {
    // Écoute les événements de progression du téléchargement
    const unlisten = listen<{
      type: string;
      model?: string;
      percent?: number;
      status?: string;
      message?: string;
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

      if (data.type === "progress" && data.model) {
        setModels((prev) => ({
          ...prev,
          [data.model!]: {
            ...prev[data.model!],
            percent: data.percent ?? 0,
            status: data.status,
          },
        }));
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

  const totalBytes = Object.values(models).reduce(
    (acc, m) => acc + m.size_bytes,
    0
  );

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
          {Object.entries(models).map(([name, model]) => (
            <div key={name} className="model-item">
              <div className="model-header">
                <span className="model-label">{model.label}</span>
                <span className="model-size">{formatBytes(model.size_bytes)}</span>
              </div>
              {downloading || model.present ? (
                <div className="model-progress">
                  <div
                    className="model-progress-bar"
                    style={{
                      width: `${model.present && !downloading ? 100 : model.percent ?? 0}%`,
                    }}
                  />
                </div>
              ) : null}
              <span className="model-state">
                {model.present
                  ? "✅ Déjà installé"
                  : model.status === "downloading"
                  ? `${model.percent ?? 0}%…`
                  : model.status === "done"
                  ? "✅ Terminé"
                  : "En attente"}
              </span>
            </div>
          ))}
        </div>

        <p className="firstrun-total">
          Volume total : <strong>{formatBytes(totalBytes)}</strong><br />
          Une connexion internet est nécessaire uniquement pour ce téléchargement.
        </p>

        {error && <p className="firstrun-error">❌ {error}</p>}

        {done ? (
          <p className="firstrun-success">
            ✅ Modèles installés. Lancement d'Ablo…
          </p>
        ) : (
          <button
            className="firstrun-btn"
            onClick={startDownload}
            disabled={downloading}
          >
            {downloading
              ? "Téléchargement en cours…"
              : "Télécharger et installer les modèles"}
          </button>
        )}
      </div>
    </div>
  );
}
