use std::io::{BufRead, Write};
use std::process::{Command, Stdio};
use tauri::Emitter;

fn backend_command() -> Result<Command, String> {
    if cfg!(debug_assertions) {
        // Mode développement : python3 + script source
        let script = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .expect("Impossible de trouver la racine du projet")
            .join("backend")
            .join("main.py");
        let mut cmd = Command::new("python3");
        cmd.arg(script);
        Ok(cmd)
    } else {
        // Mode production : binaire compilé placé à côté de l'exécutable
        let exe_dir = std::env::current_exe()
            .map_err(|e| e.to_string())?
            .parent()
            .ok_or_else(|| "Impossible de localiser le dossier de l'application".to_string())?
            .to_path_buf();
        let binary_name = if cfg!(target_os = "windows") {
            "ablo-backend.exe"
        } else {
            "ablo-backend"
        };
        Ok(Command::new(exe_dir.join(binary_name)))
    }
}

fn spawn_backend() -> Result<std::process::Child, String> {
    backend_command()?
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Impossible de démarrer le backend : {}", e))
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

// Commande streaming générique : envoie une méthode au backend et émet les lignes de stdout comme événements
fn stream_backend(window: tauri::WebviewWindow, method: &str, params: serde_json::Value, event_name: &'static str) -> Result<(), String> {
    let mut child = spawn_backend()?;
    let request = serde_json::json!({"method": method, "params": params, "id": 1});
    let request_str = serde_json::to_string(&request).unwrap() + "\n";
    {
        let mut stdin = child.stdin.take().ok_or("stdin introuvable")?;
        stdin.write_all(request_str.as_bytes()).map_err(|e| e.to_string())?;
    }
    let stdout = child.stdout.take().ok_or("stdout introuvable")?;
    std::thread::spawn(move || {
        let reader = std::io::BufReader::new(stdout);
        for line in reader.lines() {
            if let Ok(line) = line {
                if let Ok(event) = serde_json::from_str::<serde_json::Value>(&line) {
                    let _ = window.emit(event_name, &event);
                }
            }
        }
        let _ = child.wait();
    });
    Ok(())
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
    stream_backend(window, "download_models", serde_json::json!({}), "model-download-progress")
}

#[tauri::command]
fn start_transcription(window: tauri::WebviewWindow, audio_path: String) -> Result<(), String> {
    stream_backend(window, "transcribe", serde_json::json!({"audio_path": audio_path}), "transcription-progress")
}

#[tauri::command]
fn start_generation(window: tauri::WebviewWindow, text: String) -> Result<(), String> {
    stream_backend(window, "generate", serde_json::json!({"text": text}), "generation-progress")
}

#[tauri::command]
fn start_final_generation(window: tauri::WebviewWindow, sessions: serde_json::Value, final_text: String) -> Result<(), String> {
    stream_backend(window, "generate_final", serde_json::json!({"sessions": sessions, "final_text": final_text}), "generation-progress")
}

#[tauri::command]
fn start_export(window: tauri::WebviewWindow, sections: serde_json::Value, template_name: String, patient_name: String, patient_id: String) -> Result<(), String> {
    stream_backend(window, "export", serde_json::json!({"sections": sections, "template_name": template_name, "patient_name": patient_name, "patient_id": patient_id}), "export-progress")
}

#[tauri::command]
fn open_folder(path: String) -> Result<(), String> {
    let cmd = if cfg!(target_os = "windows") { "explorer" }
              else if cfg!(target_os = "macos") { "open" }
              else { "xdg-open" };
    std::process::Command::new(cmd)
        .arg(&path)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            call_backend,
            start_model_download,
            start_transcription,
            start_generation,
            start_final_generation,
            start_export,
            open_folder,
        ])
        .run(tauri::generate_context!())
        .expect("Erreur au démarrage de Ablo");
}
