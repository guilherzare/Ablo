use std::io::{BufRead, Write};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
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
        let binary_path = exe_dir.join(binary_name);
        if !binary_path.exists() {
            let dir_contents = std::fs::read_dir(&exe_dir)
                .map(|entries| {
                    entries
                        .filter_map(|e| e.ok())
                        .map(|e| e.file_name().to_string_lossy().to_string())
                        .collect::<Vec<_>>()
                        .join(", ")
                })
                .unwrap_or_else(|_| "impossible de lire le dossier".to_string());
            return Err(format!(
                "Backend introuvable : {}  |  Fichiers présents dans {} : [{}]",
                binary_path.display(),
                exe_dir.display(),
                dir_contents
            ));
        }
        Ok(Command::new(binary_path))
    }
}

fn spawn_backend() -> Result<std::process::Child, String> {
    let mut cmd = backend_command()?;
    cmd.stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    // Sur Windows : cache la fenêtre de terminal console
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    cmd.spawn()
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
    let stderr = child.stderr.take().ok_or("stderr introuvable")?;

    // Capture stderr dans un thread dédié
    let stderr_buf: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
    let stderr_buf_writer = Arc::clone(&stderr_buf);
    std::thread::spawn(move || {
        let reader = std::io::BufReader::new(stderr);
        for line in reader.lines().flatten() {
            if let Ok(mut buf) = stderr_buf_writer.lock() {
                buf.push(line);
            }
        }
    });

    std::thread::spawn(move || {
        let reader = std::io::BufReader::new(stdout);
        let mut got_output = false;
        for line in reader.lines().flatten() {
            got_output = true;
            if let Ok(event) = serde_json::from_str::<serde_json::Value>(&line) {
                let _ = window.emit(event_name, &event);
            }
        }
        let _ = child.wait();
        // Si aucune ligne reçue, le backend a crashé : émet l'erreur avec le stderr
        if !got_output {
            std::thread::sleep(std::time::Duration::from_millis(300));
            let msg = stderr_buf.lock()
                .map(|buf| {
                    if buf.is_empty() {
                        "Le backend s'est arrêté sans réponse (crash silencieux)".to_string()
                    } else {
                        format!("Crash backend : {}", buf.join(" | "))
                    }
                })
                .unwrap_or_else(|_| "Erreur inconnue".to_string());
            let _ = window.emit(event_name, serde_json::json!({
                "type": "error",
                "message": msg
            }));
        }
    });
    Ok(())
}

// Commande streaming : télécharge les modèles et émet des événements Tauri de progression
#[tauri::command]
fn start_model_download(window: tauri::WebviewWindow) -> Result<(), String> {
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
