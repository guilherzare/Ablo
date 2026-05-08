use std::io::{BufRead, Write};
use std::process::{Command, Stdio};
use tauri::Emitter;

fn backend_path() -> std::path::PathBuf {
    std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("Impossible de trouver la racine du projet")
        .join("backend")
        .join("main.py")
}

fn spawn_backend() -> Result<std::process::Child, String> {
    Command::new("python3")
        .arg(backend_path())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Impossible de démarrer le backend Python : {}", e))
}

// Commande simple : envoie une requête JSON, attend une réponse JSON
#[tauri::command]
fn call_backend(method: String, params: serde_json::Value) -> Result<serde_json::Value, String> {
    let mut child = spawn_backend()?;

    let request = serde_json::json!({"method": method, "params": params, "id": 1});
    let request_str = serde_json::to_string(&request).unwrap() + "\n";

    child
        .stdin
        .as_mut()
        .ok_or("stdin introuvable")?
        .write_all(request_str.as_bytes())
        .map_err(|e| e.to_string())?;

    let output = child.wait_with_output().map_err(|e| e.to_string())?;
    let stdout = String::from_utf8(output.stdout).map_err(|e| e.to_string())?;

    if stdout.trim().is_empty() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(format!("Aucune réponse du backend. Erreur : {}", stderr));
    }

    serde_json::from_str(stdout.trim()).map_err(|e| format!("Réponse invalide : {}", e))
}

// Commande streaming : télécharge les modèles et émet des événements Tauri de progression
#[tauri::command]
fn start_model_download(window: tauri::WebviewWindow) -> Result<(), String> {
    let mut child = spawn_backend()?;

    let request = serde_json::json!({"method": "download_models", "params": {}, "id": 1});
    let request_str = serde_json::to_string(&request).unwrap() + "\n";

    {
        let mut stdin = child.stdin.take().ok_or("stdin introuvable")?;
        stdin
            .write_all(request_str.as_bytes())
            .map_err(|e| e.to_string())?;
        // stdin se ferme ici pour signaler EOF à Python
    }

    // Lit stdout ligne par ligne dans un thread dédié et émet des événements
    let stdout = child.stdout.take().ok_or("stdout introuvable")?;
    std::thread::spawn(move || {
        let reader = std::io::BufReader::new(stdout);
        for line in reader.lines() {
            if let Ok(line) = line {
                if let Ok(event) = serde_json::from_str::<serde_json::Value>(&line) {
                    let _ = window.emit("model-download-progress", &event);
                }
            }
        }
        let _ = child.wait();
    });

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![call_backend, start_model_download])
        .run(tauri::generate_context!())
        .expect("Erreur au démarrage de Oralis");
}
