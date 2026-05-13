import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import confetti from "canvas-confetti";
import { Section } from "./GenerationView";
import "./ExportView.css";

interface ExportEvent {
  type: "progress" | "complete" | "error" | "warning";
  message?: string;
  docx_path?: string;
  pdf_path?: string;
  folder_path?: string;
  filename?: string;
}

interface Props {
  sections: Section[];
  templateName: string;
  patientId?: string;
  patientName?: string;
  photoData?: string[]; // base64 data URLs des photos de productions
  onRestart: () => void;
}

export function ExportView({ sections, templateName, patientId, patientName: initialPatientName, photoData = [], onRestart }: Props) {
  const [patientName, setPatientName] = useState(initialPatientName ?? "");
  const [started, setStarted] = useState(false);
  const [status, setStatus] = useState("Préparation de l'export…");
  const [result, setResult] = useState<{ docxPath: string; pdfPath: string; folderPath: string; filename: string } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!result) return;
    confetti({ particleCount: 120, spread: 80, origin: { y: 0.5 }, colors: ["#4f46e5", "#a5b4fc", "#818cf8", "#c4b5fd", "#ffffff"] });
  }, [result]);

  useEffect(() => {
    if (!started) return;

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

    invoke("start_export", { sections, templateName, patientName, patientId: patientId ?? "", photoData })
      .catch((e) => setError(String(e)));

    return () => { unlisten.then((fn) => fn()); };
  }, [started]);

  // Étape 1 : saisie du nom du patient
  if (!started) {
    return (
      <div className="export-form">
        <p className="export-form-hint">
          Le nom du patient apparaîtra dans le titre du document. Saisissez prénom et nom (ou initiales).
        </p>
        <label className="export-label">
          Nom du patient
          <input
            className="export-input"
            type="text"
            placeholder="ex : Lucas M."
            value={patientName}
            onChange={(e) => setPatientName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && patientName.trim() && setStarted(true)}
            autoFocus
          />
        </label>
        <button
          className="btn-export-start"
          disabled={!patientName.trim()}
          onClick={() => setStarted(true)}
        >
          Générer les fichiers →
        </button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="export-error">
        <p>❌ {error}</p>
        <button className="btn-restart" onClick={onRestart}>↩ Recommencer depuis le début</button>
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
      <div className="success-check">✓</div>
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
        <button className="btn-open-folder" onClick={() => invoke("open_folder", { path: result.folderPath })}>
          Ouvrir le dossier
        </button>
        <button className="btn-restart" onClick={onRestart}>← Retour aux patients</button>
      </div>
    </div>
  );
}
