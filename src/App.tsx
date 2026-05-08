import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FirstRun } from "./components/FirstRun";
import "./App.css";

type AppState = "loading" | "first-run" | "ready";

export default function App() {
  const [state, setState] = useState<AppState>("loading");

  useEffect(() => {
    // Vérifie si les modèles sont présents au démarrage
    invoke<{ result: Record<string, { present: boolean }> }>("call_backend", {
      method: "check_models",
      params: {},
    })
      .then((res) => {
        const allPresent = Object.values(res.result).every((m) => m.present);
        setState(allPresent ? "ready" : "first-run");
      })
      .catch(() => setState("first-run"));
  }, []);

  if (state === "loading") {
    return (
      <div className="loading-screen">
        <p>Démarrage d'Oralis…</p>
      </div>
    );
  }

  if (state === "first-run") {
    return <FirstRun onComplete={() => setState("ready")} />;
  }

  return (
    <main className="container">
      <h1>Oralis</h1>
      <p className="subtitle">Application de bilans pour art-thérapeutes</p>
      <div className="ready-card">
        <p>✅ Modèles IA installés et opérationnels.</p>
        <p style={{ color: "#6b7280", fontSize: "0.9rem" }}>
          L'interface principale arrive dans la prochaine itération.
        </p>
      </div>
    </main>
  );
}
