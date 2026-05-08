import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

function App() {
  const [status, setStatus] = useState<string>("En attente…");
  const [loading, setLoading] = useState(false);

  async function testBackend() {
    setLoading(true);
    setStatus("Appel du backend Python…");
    try {
      const response = await invoke<{ result?: string; error?: string }>(
        "call_backend",
        { method: "ping", params: {} }
      );
      if (response.error) {
        setStatus(`❌ Erreur backend : ${response.error}`);
      } else {
        setStatus(`✅ Réponse du backend : ${response.result}`);
      }
    } catch (e) {
      setStatus(`❌ Erreur IPC : ${e}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="container">
      <h1>Oralis</h1>
      <p className="subtitle">Application de bilans pour art-thérapeutes</p>

      <div className="ipc-demo">
        <h2>Pont IPC — test de connexion</h2>
        <p>
          Ce bouton envoie une commande <code>ping</code> au backend Python
          et affiche la réponse. Si tout fonctionne, le message sera{" "}
          <code>pong</code>.
        </p>
        <button onClick={testBackend} disabled={loading}>
          {loading ? "Appel en cours…" : "Tester le backend Python"}
        </button>
        <p className="status">{status}</p>
      </div>
    </main>
  );
}

export default App;
