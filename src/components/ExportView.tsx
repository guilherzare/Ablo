import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Section } from "./GenerationView";
import "./ExportView.css";

interface ExportEvent {
  type: "progress" | "complete" | "error" | "warning";
  status?: string;
  message?: string;
  docx_path?: string;
  pdf_path?: string;
  folder_path?: string;
  filename?: string;
}

interface Props {
  sections: Section[];
  templateName: string;
  onRestart: () => void;
}

export function ExportView({ sections, templateName, onRestart }: Props) {
  const [status, setStatus] = useState("Préparation de l'export…");
  const [result, setResult] = useState<{ docxPath: string; pdfPath: string; folderPath: string; filename: string } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const unlisten = listen<ExportEvent>("export-progress", (ev) => {
      const data = ev.payload;
      if (data.type === "progress") {
        setStatus(data.message ?? "Export en cours…");
      } else if (data.type === "complete") {
        setResult({
          docxPath: data.docx_path ?? "",
          pdfPath: data.pdf_path ?? "",
          folderPath: data.folder_path ?? "",
          filename: data.filename ?? "",
        });
      } else if (data.type === "error") {
        setError(data.message ?? "Erreur inconnue");
      }
    });

    invoke("start_export", {
      sections,
      templateName,
    }).catch((e) => setError(String(e)));

    return () => { unlisten.then((fn) => fn()); };
  }, [sections, templateName]);

  if (error) {
    return (
      <div className="export-error">
        <p>❌ {error}</p>
        <button className="btn-restart" onClick={onRestart}>
          ↩ Recommencer depuis le début
        </button>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="export-loading">
        <div className="export-spinner" />
        <p>{status}</p>
      </div>
    );
  }

  return (
    <div className="export-success">
      <div className="success-icon">✓</div>
      <h2>Export réussi !</h2>
      <p className="success-filename">{result.filename}</p>

      <div className="export-files">
        {result.docxPath && (
          <div className="export-file">
            <span className="file-icon">📄</span>
            <span className="file-label">Word (.docx)</span>
            <span className="file-path">{result.docxPath.split("/").pop()}</span>
          </div>
        )}
        {result.pdfPath && (
          <div className="export-file">
            <span className="file-icon">📋</span>
            <span className="file-label">PDF</span>
            <span className="file-path">{result.pdfPath.split("/").pop()}</span>
          </div>
        )}
      </div>

      <div className="export-actions">
        <button
          className="btn-open-folder"
          onClick={() => invoke("open_folder", { path: result.folderPath })}
        >
          Ouvrir le dossier
        </button>
        <button className="btn-restart" onClick={onRestart}>
          ↩ Nouvelle séance
        </button>
      </div>
    </div>
  );
}
